-- Create reorder_point_logs table for Supabase
CREATE TABLE IF NOT EXISTS public.reorder_point_logs (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  warehouse_uuid UUID NOT NULL REFERENCES public.warehouses(uuid) ON DELETE CASCADE,
  inventory_uuid UUID REFERENCES public.inventory(uuid) ON DELETE SET NULL,
  warehouse_inventory_uuid UUID REFERENCES public.warehouse_inventory(uuid) ON DELETE CASCADE,
  
  current_stock NUMERIC(10, 2) NOT NULL DEFAULT 0,
  average_daily_unit_sales NUMERIC(10, 2) NOT NULL DEFAULT 0,
  lead_time_days NUMERIC(10, 2) NOT NULL DEFAULT 5,
  safety_stock NUMERIC(10, 2) NOT NULL DEFAULT 0,
  reorder_point NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'IN_STOCK' CHECK (status IN ('IN_STOCK', 'WARNING', 'CRITICAL', 'OUT_OF_STOCK')),
  unit TEXT NOT NULL DEFAULT 'units',
  
  custom_safety_stock NUMERIC(10, 2),
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(company_uuid, warehouse_uuid, inventory_uuid)
);

-- Enable RLS
ALTER TABLE public.reorder_point_logs ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "reorder_point_logs_select_policy" ON public.reorder_point_logs
FOR SELECT TO authenticated
USING (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "reorder_point_logs_insert_policy" ON public.reorder_point_logs
FOR INSERT TO authenticated
WITH CHECK (
  public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
);

CREATE POLICY "reorder_point_logs_update_policy" ON public.reorder_point_logs
FOR UPDATE TO authenticated
USING (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "reorder_point_logs_delete_policy" ON public.reorder_point_logs
FOR DELETE TO authenticated
USING (
  public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
);

-- Add trigger for updated_at timestamp
CREATE TRIGGER trg_update_reorder_point_logs
BEFORE UPDATE ON public.reorder_point_logs
FOR EACH ROW
EXECUTE FUNCTION update_status_history();

-- Main function to calculate reorder points using warehouse inventory data
CREATE OR REPLACE FUNCTION public.calculate_reorder_points()
RETURNS SETOF public.reorder_point_logs AS $$
DECLARE
  warehouse_inv_record RECORD;
  avg_daily_sales NUMERIC(10, 2);
  lead_time NUMERIC(10, 2);
  safety_stock NUMERIC(10, 2);
  reorder_point NUMERIC(10, 2);
  current_stock NUMERIC(10, 2);
  max_daily_sales NUMERIC(10, 2);
  stock_status TEXT;
  custom_safety NUMERIC(10, 2);
  item_unit TEXT;
  log_record public.reorder_point_logs%ROWTYPE;
BEGIN
  -- Loop through all warehouse inventories
  FOR warehouse_inv_record IN
    SELECT 
      wi.uuid as warehouse_inventory_uuid,
      wi.company_uuid,
      wi.warehouse_uuid,
      wi.inventory_uuid,
      wi.standard_unit,
      wi.unit_values,
      wi.count,
      COALESCE(inv.name, wi.name) as inventory_name
    FROM 
      warehouse_inventory wi
    LEFT JOIN inventory inv ON wi.inventory_uuid = inv.uuid
    WHERE wi.inventory_uuid IS NOT NULL
  LOOP
    item_unit := COALESCE(warehouse_inv_record.standard_unit, 'units');
    
    -- Get current available stock from warehouse inventory
    current_stock := COALESCE((warehouse_inv_record.unit_values->>'available')::NUMERIC, 0);
    
    -- Calculate average daily sales based on status_history transitions to 'USED'
    -- This extracts timestamps from status_history when items were marked as 'USED'
    WITH usage_events AS (
      SELECT 
        wii.uuid,
        wii.unit_value,
        wii.unit,
        -- Extract timestamp when status changed to 'USED'
        (status_history_entry.key)::timestamp as used_timestamp,
        status_history_entry.value as status_value
      FROM warehouse_inventory_items wii,
      LATERAL jsonb_each_text(wii.status_history) AS status_history_entry
      WHERE wii.warehouse_uuid = warehouse_inv_record.warehouse_uuid
        AND wii.inventory_uuid = warehouse_inv_record.inventory_uuid
        AND status_history_entry.value = 'USED'
        AND (status_history_entry.key)::timestamp >= NOW() - INTERVAL '90 days'
    ),
    daily_usage AS (
      SELECT 
        DATE_TRUNC('day', used_timestamp) as usage_date,
        SUM(public.convert_unit(unit_value::numeric, unit, warehouse_inv_record.standard_unit)) as daily_total
      FROM usage_events
      GROUP BY DATE_TRUNC('day', used_timestamp)
    )
    SELECT 
      COALESCE(AVG(daily_total), 0)
    INTO avg_daily_sales
    FROM daily_usage
    WHERE usage_date >= NOW() - INTERVAL '90 days';
    
    -- Get maximum daily sales for safety stock calculation using status_history
    WITH usage_events AS (
      SELECT 
        wii.uuid,
        wii.unit_value,
        wii.unit,
        (status_history_entry.key)::timestamp as used_timestamp,
        status_history_entry.value as status_value
      FROM warehouse_inventory_items wii,
      LATERAL jsonb_each_text(wii.status_history) AS status_history_entry
      WHERE wii.warehouse_uuid = warehouse_inv_record.warehouse_uuid
        AND wii.inventory_uuid = warehouse_inv_record.inventory_uuid
        AND status_history_entry.value = 'USED'
        AND (status_history_entry.key)::timestamp >= NOW() - INTERVAL '90 days'
    ),
    daily_usage AS (
      SELECT 
        DATE_TRUNC('day', used_timestamp) as usage_date,
        SUM(public.convert_unit(unit_value::numeric, unit, warehouse_inv_record.standard_unit)) as daily_total
      FROM usage_events
      GROUP BY DATE_TRUNC('day', used_timestamp)
    )
    SELECT 
      COALESCE(MAX(daily_total), 0)
    INTO max_daily_sales
    FROM daily_usage;
    
    -- Calculate average lead time from delivery history
    -- This looks at the time between delivery creation and when items were added to warehouse
    WITH delivery_lead_times AS (
      SELECT 
        EXTRACT(EPOCH FROM (wii.created_at - di.created_at)) / 86400 as lead_days
      FROM warehouse_inventory_items wii
      LEFT JOIN delivery_items di ON wii.delivery_uuid = di.uuid
      WHERE wii.warehouse_uuid = warehouse_inv_record.warehouse_uuid
        AND wii.inventory_uuid = warehouse_inv_record.inventory_uuid
        AND di.created_at IS NOT NULL
        AND wii.created_at >= NOW() - INTERVAL '90 days'
        AND EXTRACT(EPOCH FROM (wii.created_at - di.created_at)) > 0
    )
    SELECT 
      COALESCE(AVG(lead_days), 5) -- Default to 5 days if no data
    INTO lead_time
    FROM delivery_lead_times;
    
    -- Check if a custom safety stock exists
    SELECT 
      custom_safety_stock
    INTO 
      custom_safety
    FROM 
      public.reorder_point_logs
    WHERE 
      warehouse_inventory_uuid = warehouse_inv_record.warehouse_inventory_uuid
      AND company_uuid = warehouse_inv_record.company_uuid
    ORDER BY 
      updated_at DESC
    LIMIT 1;
    
    -- Calculate safety stock (either use custom or calculate)
    IF custom_safety IS NOT NULL THEN
      safety_stock := custom_safety;
    ELSE
      safety_stock := (max_daily_sales - avg_daily_sales) * SQRT(lead_time);
      IF safety_stock < 0 THEN
        safety_stock := avg_daily_sales * 0.1; -- Minimum 10% of daily sales
      END IF;
    END IF;
    
    -- Calculate reorder point
    reorder_point := (avg_daily_sales * lead_time) + safety_stock;
    
    -- Determine status
    IF current_stock <= 0 THEN
      stock_status := 'OUT_OF_STOCK';
    ELSIF current_stock <= safety_stock THEN
      stock_status := 'CRITICAL';
    ELSIF current_stock <= reorder_point THEN
      stock_status := 'WARNING';
    ELSE
      stock_status := 'IN_STOCK';
    END IF;
    
    -- Insert or update the reorder_point_logs
    INSERT INTO public.reorder_point_logs (
      company_uuid,
      warehouse_uuid,
      inventory_uuid,
      warehouse_inventory_uuid,
      current_stock,
      average_daily_unit_sales,
      lead_time_days,
      safety_stock,
      reorder_point,
      status,
      unit,
      custom_safety_stock
    ) VALUES (
      warehouse_inv_record.company_uuid,
      warehouse_inv_record.warehouse_uuid,
      warehouse_inv_record.inventory_uuid,
      warehouse_inv_record.warehouse_inventory_uuid,
      current_stock,
      avg_daily_sales,
      lead_time,
      safety_stock,
      reorder_point,
      stock_status,
      item_unit,
      custom_safety
    )
    ON CONFLICT (company_uuid, warehouse_uuid, inventory_uuid)
    DO UPDATE SET
      current_stock = EXCLUDED.current_stock,
      average_daily_unit_sales = EXCLUDED.average_daily_unit_sales,
      lead_time_days = EXCLUDED.lead_time_days,
      safety_stock = EXCLUDED.safety_stock,
      reorder_point = EXCLUDED.reorder_point,
      status = EXCLUDED.status,
      unit = EXCLUDED.unit,
      warehouse_inventory_uuid = EXCLUDED.warehouse_inventory_uuid,
      updated_at = NOW()
    RETURNING * INTO log_record;
    
    RETURN NEXT log_record;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate reorder point for a specific warehouse inventory
CREATE OR REPLACE FUNCTION public.calculate_specific_reorder_point(
  p_warehouse_inventory_uuid UUID
)
RETURNS SETOF public.reorder_point_logs AS $$
DECLARE
  warehouse_inv_record RECORD;
  avg_daily_sales NUMERIC(10, 2);
  lead_time NUMERIC(10, 2);
  safety_stock NUMERIC(10, 2);
  reorder_point NUMERIC(10, 2);
  current_stock NUMERIC(10, 2);
  max_daily_sales NUMERIC(10, 2);
  stock_status TEXT;
  custom_safety NUMERIC(10, 2);
  item_unit TEXT;
  log_record public.reorder_point_logs%ROWTYPE;
BEGIN
  -- Get the specific warehouse inventory record
  SELECT 
    wi.uuid as warehouse_inventory_uuid,
    wi.company_uuid,
    wi.warehouse_uuid,
    wi.inventory_uuid,
    wi.standard_unit,
    wi.unit_values,
    wi.count,
    COALESCE(inv.name, wi.name) as inventory_name
  INTO 
    warehouse_inv_record
  FROM 
    warehouse_inventory wi
  LEFT JOIN inventory inv ON wi.inventory_uuid = inv.uuid
  WHERE wi.uuid = p_warehouse_inventory_uuid;
  
  IF warehouse_inv_record IS NULL THEN
    RAISE EXCEPTION 'Warehouse inventory record not found for UUID: %', p_warehouse_inventory_uuid;
  END IF;

  item_unit := COALESCE(warehouse_inv_record.standard_unit, 'units');
  
  -- Get current available stock from warehouse inventory
  current_stock := COALESCE((warehouse_inv_record.unit_values->>'available')::NUMERIC, 0);
  
  -- Calculate average daily sales based on status_history transitions to 'USED'
  WITH usage_events AS (
    SELECT 
      wii.uuid,
      wii.unit_value,
      wii.unit,
      (status_history_entry.key)::timestamp as used_timestamp,
      status_history_entry.value as status_value
    FROM warehouse_inventory_items wii,
    LATERAL jsonb_each_text(wii.status_history) AS status_history_entry
    WHERE wii.warehouse_uuid = warehouse_inv_record.warehouse_uuid
      AND wii.inventory_uuid = warehouse_inv_record.inventory_uuid
      AND status_history_entry.value = 'USED'
      AND (status_history_entry.key)::timestamp >= NOW() - INTERVAL '90 days'
  ),
  daily_usage AS (
    SELECT 
      DATE_TRUNC('day', used_timestamp) as usage_date,
      SUM(public.convert_unit(unit_value::numeric, unit, warehouse_inv_record.standard_unit)) as daily_total
    FROM usage_events
    GROUP BY DATE_TRUNC('day', used_timestamp)
  )
  SELECT 
    COALESCE(AVG(daily_total), 0)
  INTO avg_daily_sales
  FROM daily_usage;
  
  -- Get maximum daily sales for safety stock calculation using status_history
  WITH usage_events AS (
    SELECT 
      wii.uuid,
      wii.unit_value,
      wii.unit,
      (status_history_entry.key)::timestamp as used_timestamp,
      status_history_entry.value as status_value
    FROM warehouse_inventory_items wii,
    LATERAL jsonb_each_text(wii.status_history) AS status_history_entry
    WHERE wii.warehouse_uuid = warehouse_inv_record.warehouse_uuid
      AND wii.inventory_uuid = warehouse_inv_record.inventory_uuid
      AND status_history_entry.value = 'USED'
      AND (status_history_entry.key)::timestamp >= NOW() - INTERVAL '90 days'
  ),
  daily_usage AS (
    SELECT 
      DATE_TRUNC('day', used_timestamp) as usage_date,
      SUM(public.convert_unit(unit_value::numeric, unit, warehouse_inv_record.standard_unit)) as daily_total
    FROM usage_events
    GROUP BY DATE_TRUNC('day', used_timestamp)
  )
  SELECT 
    COALESCE(MAX(daily_total), 0)
  INTO max_daily_sales
  FROM daily_usage;
  
  -- Calculate average lead time from delivery history
  WITH delivery_lead_times AS (
    SELECT 
      EXTRACT(EPOCH FROM (wii.created_at - di.created_at)) / 86400 as lead_days
    FROM warehouse_inventory_items wii
    LEFT JOIN delivery_items di ON wii.delivery_uuid = di.uuid
    WHERE wii.warehouse_uuid = warehouse_inv_record.warehouse_uuid
      AND wii.inventory_uuid = warehouse_inv_record.inventory_uuid
      AND di.created_at IS NOT NULL
      AND wii.created_at >= NOW() - INTERVAL '90 days'
      AND EXTRACT(EPOCH FROM (wii.created_at - di.created_at)) > 0
  )
  SELECT 
    COALESCE(AVG(lead_days), 5)
  INTO lead_time
  FROM delivery_lead_times;
  
  -- Check if a custom safety stock exists
  SELECT 
    custom_safety_stock
  INTO 
    custom_safety
  FROM 
    public.reorder_point_logs
  WHERE 
    warehouse_inventory_uuid = warehouse_inv_record.warehouse_inventory_uuid
    AND company_uuid = warehouse_inv_record.company_uuid
  ORDER BY 
    updated_at DESC
  LIMIT 1;
  
  -- Calculate safety stock
  IF custom_safety IS NOT NULL THEN
    safety_stock := custom_safety;
  ELSE
    safety_stock := (max_daily_sales - avg_daily_sales) * SQRT(lead_time);
    IF safety_stock < 0 THEN
      safety_stock := avg_daily_sales * 0.1;
    END IF;
  END IF;
  
  -- Calculate reorder point
  reorder_point := (avg_daily_sales * lead_time) + safety_stock;
  
  -- Determine status
  IF current_stock <= 0 THEN
    stock_status := 'OUT_OF_STOCK';
  ELSIF current_stock <= safety_stock THEN
    stock_status := 'CRITICAL';
  ELSIF current_stock <= reorder_point THEN
    stock_status := 'WARNING';
  ELSE
    stock_status := 'IN_STOCK';
  END IF;
  
  -- Insert or update the reorder_point_logs
  INSERT INTO public.reorder_point_logs (
    company_uuid,
    warehouse_uuid,
    inventory_uuid,
    warehouse_inventory_uuid,
    current_stock,
    average_daily_unit_sales,
    lead_time_days,
    safety_stock,
    reorder_point,
    status,
    unit,
    custom_safety_stock
  ) VALUES (
    warehouse_inv_record.company_uuid,
    warehouse_inv_record.warehouse_uuid,
    warehouse_inv_record.inventory_uuid,
    warehouse_inv_record.warehouse_inventory_uuid,
    current_stock,
    avg_daily_sales,
    lead_time,
    safety_stock,
    reorder_point,
    stock_status,
    item_unit,
    custom_safety
  )
  ON CONFLICT (company_uuid, warehouse_uuid, inventory_uuid)
  DO UPDATE SET
    current_stock = EXCLUDED.current_stock,
    average_daily_unit_sales = EXCLUDED.average_daily_unit_sales,
    lead_time_days = EXCLUDED.lead_time_days,
    safety_stock = EXCLUDED.safety_stock,
    reorder_point = EXCLUDED.reorder_point,
    status = EXCLUDED.status,
    unit = EXCLUDED.unit,
    warehouse_inventory_uuid = EXCLUDED.warehouse_inventory_uuid,
    updated_at = NOW()
  RETURNING * INTO log_record;
  
  RETURN NEXT log_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update custom safety stock
CREATE OR REPLACE FUNCTION public.update_custom_safety_stock(
  p_warehouse_inventory_uuid UUID,
  p_custom_safety_stock NUMERIC(10, 2),
  p_notes TEXT DEFAULT NULL
) RETURNS SETOF public.reorder_point_logs AS $$
DECLARE
  result public.reorder_point_logs%ROWTYPE;
  warehouse_inv_record RECORD;
BEGIN
  -- Get warehouse inventory details
  SELECT 
    wi.company_uuid,
    wi.warehouse_uuid,
    wi.inventory_uuid
  INTO 
    warehouse_inv_record
  FROM 
    warehouse_inventory wi
  WHERE 
    wi.uuid = p_warehouse_inventory_uuid;
  
  IF warehouse_inv_record IS NULL THEN
    RAISE EXCEPTION 'Warehouse inventory record not found for UUID: %', p_warehouse_inventory_uuid;
  END IF;
  
  -- Update the custom safety stock
  UPDATE public.reorder_point_logs
  SET 
    custom_safety_stock = p_custom_safety_stock,
    safety_stock = p_custom_safety_stock,
    notes = COALESCE(p_notes, notes),
    updated_at = NOW()
  WHERE 
    warehouse_inventory_uuid = p_warehouse_inventory_uuid
    AND company_uuid = warehouse_inv_record.company_uuid
  RETURNING * INTO result;
  
  -- If no record exists yet, create one by running calculate_specific_reorder_point first
  IF result IS NULL THEN
    PERFORM public.calculate_specific_reorder_point(p_warehouse_inventory_uuid);
    
    UPDATE public.reorder_point_logs
    SET 
      custom_safety_stock = p_custom_safety_stock,
      safety_stock = p_custom_safety_stock,
      notes = COALESCE(p_notes, notes),
      updated_at = NOW()
    WHERE 
      warehouse_inventory_uuid = p_warehouse_inventory_uuid
      AND company_uuid = warehouse_inv_record.company_uuid
    RETURNING * INTO result;
  END IF;
  
  -- Recalculate reorder point with new safety stock
  UPDATE public.reorder_point_logs
  SET 
    reorder_point = (average_daily_unit_sales * lead_time_days) + safety_stock,
    status = CASE 
      WHEN current_stock <= 0 THEN 'OUT_OF_STOCK'
      WHEN current_stock <= safety_stock THEN 'CRITICAL'
      WHEN current_stock <= ((average_daily_unit_sales * lead_time_days) + safety_stock) THEN 'WARNING'
      ELSE 'IN_STOCK'
    END,
    updated_at = NOW()
  WHERE 
    warehouse_inventory_uuid = p_warehouse_inventory_uuid
    AND company_uuid = warehouse_inv_record.company_uuid
  RETURNING * INTO result;
  
  RETURN NEXT result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get filtered reorder point logs
CREATE OR REPLACE FUNCTION public.get_reorder_point_logs_filtered(
  p_company_uuid UUID DEFAULT NULL,
  p_warehouse_uuid UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT '',
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_year INTEGER DEFAULT NULL,
  p_month INTEGER DEFAULT NULL,
  p_week INTEGER DEFAULT NULL,
  p_day INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  uuid UUID,
  company_uuid UUID,
  warehouse_uuid UUID,
  inventory_uuid UUID,
  warehouse_inventory_uuid UUID,
  current_stock NUMERIC(10, 2),
  average_daily_unit_sales NUMERIC(10, 2),
  lead_time_days NUMERIC(10, 2),
  safety_stock NUMERIC(10, 2),
  reorder_point NUMERIC(10, 2),
  status TEXT,
  unit TEXT,
  custom_safety_stock NUMERIC(10, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  warehouse_name TEXT,
  inventory_name TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_search_pattern TEXT;
  total_rows BIGINT;
BEGIN
  v_search_pattern := '%' || COALESCE(p_search, '') || '%';
  
  -- Get total count
  SELECT COUNT(*) INTO total_rows
  FROM reorder_point_logs rpl
  LEFT JOIN warehouses w ON rpl.warehouse_uuid = w.uuid
  LEFT JOIN inventory inv ON rpl.inventory_uuid = inv.uuid
  LEFT JOIN warehouse_inventory wi ON rpl.warehouse_inventory_uuid = wi.uuid
  WHERE 
    (p_company_uuid IS NULL OR rpl.company_uuid = p_company_uuid)
    AND (p_warehouse_uuid IS NULL OR rpl.warehouse_uuid = p_warehouse_uuid)
    AND (p_status IS NULL OR rpl.status = p_status)
    AND (p_date_from IS NULL OR DATE(rpl.updated_at) >= p_date_from)
    AND (p_date_to IS NULL OR DATE(rpl.updated_at) <= p_date_to)
    AND (p_year IS NULL OR EXTRACT(YEAR FROM rpl.updated_at) = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM rpl.updated_at) = p_month)
    AND (p_week IS NULL OR EXTRACT(WEEK FROM rpl.updated_at) = p_week)
    AND (p_day IS NULL OR EXTRACT(DAY FROM rpl.updated_at) = p_day)
    AND (
      p_search = '' OR p_search IS NULL
      OR rpl.uuid::TEXT ILIKE v_search_pattern
      OR COALESCE(inv.name, wi.name, '') ILIKE v_search_pattern
      OR w.name ILIKE v_search_pattern
      OR rpl.status ILIKE v_search_pattern
      OR rpl.notes ILIKE v_search_pattern
    );

  RETURN QUERY
  SELECT 
    rpl.uuid,
    rpl.company_uuid,
    rpl.warehouse_uuid,
    rpl.inventory_uuid,
    rpl.warehouse_inventory_uuid,
    rpl.current_stock,
    rpl.average_daily_unit_sales,
    rpl.lead_time_days,
    rpl.safety_stock,
    rpl.reorder_point,
    rpl.status,
    rpl.unit,
    rpl.custom_safety_stock,
    rpl.notes,
    rpl.created_at,
    rpl.updated_at,
    w.name as warehouse_name,
    COALESCE(inv.name, wi.name) as inventory_name,
    total_rows
  FROM reorder_point_logs rpl
  LEFT JOIN warehouses w ON rpl.warehouse_uuid = w.uuid
  LEFT JOIN inventory inv ON rpl.inventory_uuid = inv.uuid
  LEFT JOIN warehouse_inventory wi ON rpl.warehouse_inventory_uuid = wi.uuid
  WHERE 
    (p_company_uuid IS NULL OR rpl.company_uuid = p_company_uuid)
    AND (p_warehouse_uuid IS NULL OR rpl.warehouse_uuid = p_warehouse_uuid)
    AND (p_status IS NULL OR rpl.status = p_status)
    AND (p_date_from IS NULL OR DATE(rpl.updated_at) >= p_date_from)
    AND (p_date_to IS NULL OR DATE(rpl.updated_at) <= p_date_to)
    AND (p_year IS NULL OR EXTRACT(YEAR FROM rpl.updated_at) = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM rpl.updated_at) = p_month)
    AND (p_week IS NULL OR EXTRACT(WEEK FROM rpl.updated_at) = p_week)
    AND (p_day IS NULL OR EXTRACT(DAY FROM rpl.updated_at) = p_day)
    AND (
      p_search = '' OR p_search IS NULL
      OR rpl.uuid::TEXT ILIKE v_search_pattern
      OR COALESCE(inv.name, wi.name, '') ILIKE v_search_pattern
      OR w.name ILIKE v_search_pattern
      OR rpl.status ILIKE v_search_pattern
      OR rpl.notes ILIKE v_search_pattern
    )
  ORDER BY
    CASE 
      WHEN rpl.status = 'OUT_OF_STOCK' THEN 1
      WHEN rpl.status = 'CRITICAL' THEN 2
      WHEN rpl.status = 'WARNING' THEN 3
      WHEN rpl.status = 'IN_STOCK' THEN 4
      ELSE 5
    END,
    rpl.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- Create triggers to automatically recalculate when warehouse inventory changes
CREATE OR REPLACE FUNCTION public.trigger_reorder_point_recalculation()
RETURNS TRIGGER AS $$
DECLARE
  target_warehouse_inventory_uuid UUID;
BEGIN
  -- Get the warehouse_inventory_uuid from the warehouse_inventory table
  IF TG_OP = 'DELETE' THEN
    SELECT uuid INTO target_warehouse_inventory_uuid
    FROM warehouse_inventory
    WHERE warehouse_uuid = OLD.warehouse_uuid 
      AND inventory_uuid = OLD.inventory_uuid
    LIMIT 1;
  ELSE
    SELECT uuid INTO target_warehouse_inventory_uuid
    FROM warehouse_inventory
    WHERE warehouse_uuid = NEW.warehouse_uuid 
      AND inventory_uuid = NEW.inventory_uuid
    LIMIT 1;
  END IF;
  
  -- Recalculate for the affected warehouse inventory if found
  IF target_warehouse_inventory_uuid IS NOT NULL THEN
    PERFORM public.calculate_specific_reorder_point(target_warehouse_inventory_uuid);
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on warehouse_inventory_items to auto-recalculate
DROP TRIGGER IF EXISTS trg_reorder_point_recalc ON warehouse_inventory_items;
CREATE TRIGGER trg_reorder_point_recalc
  AFTER INSERT OR UPDATE OR DELETE ON warehouse_inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_reorder_point_recalculation();

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_reorder_points TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_specific_reorder_point TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_custom_safety_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reorder_point_logs_filtered TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_reorder_point_recalculation TO authenticated;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_reorder_point_logs_company_warehouse ON reorder_point_logs(company_uuid, warehouse_uuid);
CREATE INDEX IF NOT EXISTS idx_reorder_point_logs_status ON reorder_point_logs(status);
CREATE INDEX IF NOT EXISTS idx_reorder_point_logs_updated_at ON reorder_point_logs(updated_at);
CREATE INDEX IF NOT EXISTS idx_reorder_point_logs_warehouse_inventory ON reorder_point_logs(warehouse_inventory_uuid);



-- Function to get warehouse inventory items grouped by deliveries and warehouse inventory based on reorder point logs
CREATE OR REPLACE FUNCTION public.get_warehouse_items_by_reorder_point_logs(
  p_reorder_point_log_uuids UUID[] DEFAULT NULL,
  p_company_uuid UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  reorder_point_log_uuid UUID,
  warehouse_uuid UUID,
  warehouse_name TEXT,
  inventory_uuid UUID,
  inventory_name TEXT,
  warehouse_inventory_uuid UUID,
  deliveries JSONB,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  total_rows BIGINT;
BEGIN
  -- Get total count
  SELECT COUNT(DISTINCT rpl.uuid) INTO total_rows
  FROM reorder_point_logs rpl
  WHERE 
    (p_company_uuid IS NULL OR rpl.company_uuid = p_company_uuid)
    AND (
      p_reorder_point_log_uuids IS NULL 
      OR array_length(p_reorder_point_log_uuids, 1) = 0
      OR rpl.uuid = ANY(p_reorder_point_log_uuids)
    );

  RETURN QUERY
  WITH reorder_logs AS (
    SELECT 
      rpl.uuid as reorder_point_log_uuid,
      rpl.warehouse_uuid,
      rpl.inventory_uuid,
      rpl.warehouse_inventory_uuid,
      rpl.company_uuid,
      w.name as warehouse_name,
      COALESCE(inv.name, wi.name) as inventory_name
    FROM reorder_point_logs rpl
    LEFT JOIN warehouses w ON rpl.warehouse_uuid = w.uuid
    LEFT JOIN inventory inv ON rpl.inventory_uuid = inv.uuid
    LEFT JOIN warehouse_inventory wi ON rpl.warehouse_inventory_uuid = wi.uuid
    WHERE 
      (p_company_uuid IS NULL OR rpl.company_uuid = p_company_uuid)
      AND (
        p_reorder_point_log_uuids IS NULL 
        OR array_length(p_reorder_point_log_uuids, 1) = 0
        OR rpl.uuid = ANY(p_reorder_point_log_uuids)
      )
  ),
  delivery_groups AS (
    SELECT 
      rl.reorder_point_log_uuid,
      rl.warehouse_uuid,
      rl.warehouse_name,
      rl.inventory_uuid,
      rl.inventory_name,
      rl.warehouse_inventory_uuid,
      di.uuid as delivery_uuid,
      di.name as delivery_name,
      di.delivery_address,
      di.delivery_date,
      di.status as delivery_status,
      di.created_at as delivery_created_at,
      -- Aggregate warehouse inventory items for this delivery
      jsonb_agg(
        jsonb_build_object(
          'uuid', wii.uuid,
          'item_code', wii.item_code,
          'unit', wii.unit,
          'unit_value', wii.unit_value,
          'packaging_unit', wii.packaging_unit,
          'cost', wii.cost,
          'location', wii.location,
          'group_id', wii.group_id,
          'status', wii.status,
          'created_at', wii.created_at,
          'updated_at', wii.updated_at
        ) ORDER BY wii.created_at DESC
      ) as warehouse_items
    FROM reorder_logs rl
    LEFT JOIN warehouse_inventory_items wii ON (
      rl.warehouse_uuid = wii.warehouse_uuid 
      AND rl.inventory_uuid = wii.inventory_uuid
    )
    LEFT JOIN delivery_items di ON wii.delivery_uuid = di.uuid
    WHERE wii.uuid IS NOT NULL
    GROUP BY 
      rl.reorder_point_log_uuid, rl.warehouse_uuid, rl.warehouse_name,
      rl.inventory_uuid, rl.inventory_name, rl.warehouse_inventory_uuid,
      di.uuid, di.name, di.delivery_address, di.delivery_date, 
      di.status, di.created_at
  )
  SELECT 
    dg.reorder_point_log_uuid,
    dg.warehouse_uuid,
    dg.warehouse_name,
    dg.inventory_uuid,
    dg.inventory_name,
    dg.warehouse_inventory_uuid,
    -- Group deliveries with their warehouse items
    jsonb_agg(
      jsonb_build_object(
        'delivery_uuid', dg.delivery_uuid,
        'delivery_name', dg.delivery_name,
        'delivery_address', dg.delivery_address,
        'delivery_date', dg.delivery_date,
        'delivery_status', dg.delivery_status,
        'delivery_created_at', dg.delivery_created_at,
        'warehouse_items', dg.warehouse_items
      ) ORDER BY dg.delivery_created_at DESC
    ) as deliveries,
    total_rows
  FROM delivery_groups dg
  GROUP BY 
    dg.reorder_point_log_uuid, dg.warehouse_uuid, dg.warehouse_name,
    dg.inventory_uuid, dg.inventory_name, dg.warehouse_inventory_uuid, total_rows
  ORDER BY dg.reorder_point_log_uuid
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_warehouse_items_by_reorder_point_logs TO authenticated;