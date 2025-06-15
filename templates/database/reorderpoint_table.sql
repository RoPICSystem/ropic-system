-- Create reorder_point_logs table to store calculation results
CREATE TABLE IF NOT EXISTS public.reorder_point_logs (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  warehouse_uuid UUID NOT NULL REFERENCES public.warehouses(uuid) ON DELETE CASCADE,
  inventory_uuid UUID NOT NULL REFERENCES public.inventory(uuid) ON DELETE CASCADE,
  warehouse_inventory_uuid UUID NOT NULL REFERENCES public.warehouse_inventory(uuid) ON DELETE CASCADE,
  
  -- Current stock levels
  current_stock NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  
  -- Calculated metrics
  average_daily_unit_sales NUMERIC NOT NULL DEFAULT 0,
  lead_time_days NUMERIC NOT NULL DEFAULT 0,
  safety_stock NUMERIC NOT NULL DEFAULT 0,
  reorder_point NUMERIC NOT NULL DEFAULT 0,
  
  -- Status based on current stock vs reorder point
  status TEXT NOT NULL DEFAULT 'IN_STOCK' CHECK (
    status IN ('IN_STOCK', 'WARNING', 'CRITICAL', 'OUT_OF_STOCK')
  ),
  
  -- Optional custom overrides
  custom_safety_stock NUMERIC NULL,
  notes TEXT NULL,
  
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.reorder_point_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reorder_point_logs REPLICA IDENTITY FULL;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_reorder_point_logs_company ON public.reorder_point_logs(company_uuid);
CREATE INDEX IF NOT EXISTS idx_reorder_point_logs_warehouse ON public.reorder_point_logs(warehouse_uuid);
CREATE INDEX IF NOT EXISTS idx_reorder_point_logs_inventory ON public.reorder_point_logs(inventory_uuid);
CREATE INDEX IF NOT EXISTS idx_reorder_point_logs_status ON public.reorder_point_logs(status);
CREATE INDEX IF NOT EXISTS idx_reorder_point_logs_updated_at ON public.reorder_point_logs(updated_at);


-- RLS policies for reorder_point_logs
CREATE POLICY "reorder_point_logs_select_policy" ON public.reorder_point_logs
FOR SELECT TO authenticated
USING (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "reorder_point_logs_insert_policy" ON public.reorder_point_logs
FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_admin((select auth.uid())) = true
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
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
  public.is_user_admin((select auth.uid())) = true
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
);

-- Function to calculate average daily usage based on 'USED' status changes
CREATE OR REPLACE FUNCTION public.calculate_average_daily_usage(
  p_warehouse_uuid UUID,
  p_inventory_uuid UUID,
  p_days_lookback INTEGER DEFAULT 30
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_used NUMERIC := 0;
  v_total_days NUMERIC;
  v_start_date DATE;
  v_end_date DATE;
  v_item_record RECORD;
  v_status_date DATE;
  v_unit_value NUMERIC;
  v_standard_unit TEXT;
BEGIN
  -- Get the standard unit for this inventory
  SELECT standard_unit INTO v_standard_unit
  FROM warehouse_inventory
  WHERE warehouse_uuid = p_warehouse_uuid AND inventory_uuid = p_inventory_uuid
  LIMIT 1;
  
  IF v_standard_unit IS NULL THEN
    SELECT measurement_unit INTO v_standard_unit
    FROM inventory
    WHERE uuid = p_inventory_uuid;
  END IF;
  
  -- Set date range
  v_end_date := CURRENT_DATE;
  v_start_date := v_end_date - INTERVAL '1 day' * p_days_lookback;
  v_total_days := p_days_lookback;
  
  -- Calculate total units used by examining status history
  FOR v_item_record IN
    SELECT wii.unit, wii.unit_value, wii.status_history
    FROM warehouse_inventory_items wii
    WHERE wii.warehouse_uuid = p_warehouse_uuid 
      AND wii.inventory_uuid = p_inventory_uuid
      AND wii.status = 'USED'
  LOOP
    -- Extract the date when item was marked as USED
    SELECT (jsonb_each_text(v_item_record.status_history)).key::timestamp::date INTO v_status_date
    FROM jsonb_each_text(v_item_record.status_history)
    WHERE (jsonb_each_text(v_item_record.status_history)).value = 'USED'
    ORDER BY (jsonb_each_text(v_item_record.status_history)).key::timestamp DESC
    LIMIT 1;
    
    -- Only count items used within our lookback period
    IF v_status_date >= v_start_date AND v_status_date <= v_end_date THEN
      -- Convert unit value to standard unit
      v_unit_value := public.convert_unit(
        v_item_record.unit_value::numeric, 
        v_item_record.unit, 
        v_standard_unit
      );
      v_total_used := v_total_used + v_unit_value;
    END IF;
  END LOOP;
  
  -- Avoid division by zero
  IF v_total_days <= 0 THEN
    RETURN 0;
  END IF;
  
  -- Return average daily usage
  RETURN v_total_used / v_total_days;
END;
$function$;

-- Function to calculate average lead time based on delivery history
CREATE OR REPLACE FUNCTION public.calculate_average_lead_time(
  p_warehouse_uuid UUID,
  p_inventory_uuid UUID,
  p_days_lookback INTEGER DEFAULT 90
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_lead_time NUMERIC := 0;
  v_delivery_count INTEGER := 0;
  v_delivery_record RECORD;
  v_processing_date TIMESTAMP;
  v_delivered_date TIMESTAMP;
  v_lead_time_days NUMERIC;
  v_cutoff_date DATE;
BEGIN
  -- Set cutoff date for lookback
  v_cutoff_date := CURRENT_DATE - INTERVAL '1 day' * p_days_lookback;
  
  -- Look at deliveries that contained this inventory to the warehouse
  FOR v_delivery_record IN
    SELECT di.status_history, di.delivery_date, di.created_at
    FROM delivery_items di
    WHERE di.warehouse_uuid = p_warehouse_uuid
      AND di.status = 'DELIVERED'
      AND di.delivery_date >= v_cutoff_date
      AND EXISTS (
        SELECT 1 
        FROM jsonb_object_keys(di.inventory_items) k
        WHERE (di.inventory_items->k->>'inventory_uuid')::uuid = p_inventory_uuid
      )
  LOOP
    -- Extract PROCESSING and DELIVERED timestamps from status history
    v_processing_date := NULL;
    v_delivered_date := NULL;
    
    -- Find when delivery was set to PROCESSING
    SELECT (jsonb_each_text(v_delivery_record.status_history)).key::timestamp INTO v_processing_date
    FROM jsonb_each_text(v_delivery_record.status_history)
    WHERE (jsonb_each_text(v_delivery_record.status_history)).value = 'PROCESSING'
    ORDER BY (jsonb_each_text(v_delivery_record.status_history)).key::timestamp ASC
    LIMIT 1;
    
    -- Find when delivery was marked as DELIVERED
    SELECT (jsonb_each_text(v_delivery_record.status_history)).key::timestamp INTO v_delivered_date
    FROM jsonb_each_text(v_delivery_record.status_history)
    WHERE (jsonb_each_text(v_delivery_record.status_history)).value = 'DELIVERED'
    ORDER BY (jsonb_each_text(v_delivery_record.status_history)).key::timestamp DESC
    LIMIT 1;
    
    -- Calculate lead time if we have both dates
    IF v_processing_date IS NOT NULL AND v_delivered_date IS NOT NULL THEN
      v_lead_time_days := EXTRACT(EPOCH FROM (v_delivered_date - v_processing_date)) / 86400.0;
      IF v_lead_time_days > 0 AND v_lead_time_days <= 365 THEN -- Sanity check
        v_total_lead_time := v_total_lead_time + v_lead_time_days;
        v_delivery_count := v_delivery_count + 1;
      END IF;
    ELSIF v_delivered_date IS NOT NULL THEN
      -- Fallback: use delivery_date to delivered timestamp
      v_lead_time_days := EXTRACT(EPOCH FROM (v_delivered_date - v_delivery_record.delivery_date::timestamp)) / 86400.0;
      IF v_lead_time_days >= 0 AND v_lead_time_days <= 365 THEN -- Sanity check
        v_total_lead_time := v_total_lead_time + ABS(v_lead_time_days);
        v_delivery_count := v_delivery_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Return average or default to 7 days if no data
  IF v_delivery_count > 0 THEN
    RETURN v_total_lead_time / v_delivery_count;
  ELSE
    RETURN 7.0; -- Default 7 days lead time
  END IF;
END;
$function$;

-- Function to calculate safety stock
CREATE OR REPLACE FUNCTION public.calculate_safety_stock(
  p_average_daily_usage NUMERIC,
  p_lead_time_days NUMERIC,
  p_service_level_factor NUMERIC DEFAULT 1.65 -- 95% service level
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_demand_variability NUMERIC := 0.2; -- 20% coefficient of variation
  v_lead_time_variability NUMERIC := 0.15; -- 15% coefficient of variation
  v_safety_stock NUMERIC;
BEGIN
  -- Wilson formula for safety stock calculation
  -- Safety Stock = Z × √((σD²×LT) + (D²×σLT²))
  -- Where:
  -- Z = service level factor (1.65 for 95% service level)
  -- σD = demand standard deviation = average × variability coefficient
  -- D = average daily demand
  -- LT = lead time
  -- σLT = lead time standard deviation = lead time × variability coefficient
  
  v_safety_stock := p_service_level_factor * SQRT(
    (POWER(p_average_daily_usage * v_demand_variability, 2) * p_lead_time_days) +
    (POWER(p_average_daily_usage, 2) * POWER(p_lead_time_days * v_lead_time_variability, 2))
  );
  
  -- Minimum safety stock should be at least 1 day of average usage
  v_safety_stock := GREATEST(v_safety_stock, p_average_daily_usage);
  
  RETURN ROUND(v_safety_stock, 2);
END;
$function$;

-- Function to determine stock status
CREATE OR REPLACE FUNCTION public.determine_stock_status(
  p_current_stock NUMERIC,
  p_reorder_point NUMERIC,
  p_safety_stock NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_current_stock <= 0 THEN
    RETURN 'OUT_OF_STOCK';
  ELSIF p_current_stock <= p_safety_stock THEN
    RETURN 'CRITICAL';
  ELSIF p_current_stock <= p_reorder_point THEN
    RETURN 'WARNING';
  ELSE
    RETURN 'IN_STOCK';
  END IF;
END;
$function$;

-- Main function to calculate reorder points for all warehouse inventories
CREATE OR REPLACE FUNCTION public.calculate_reorder_points()
RETURNS TABLE(
  uuid UUID,
  company_uuid UUID,
  warehouse_uuid UUID,
  inventory_uuid UUID,
  warehouse_inventory_uuid UUID,
  current_stock NUMERIC,
  unit TEXT,
  average_daily_unit_sales NUMERIC,
  lead_time_days NUMERIC,
  safety_stock NUMERIC,
  reorder_point NUMERIC,
  status TEXT,
  custom_safety_stock NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_warehouse_inventory RECORD;
  v_current_stock NUMERIC;
  v_average_daily_usage NUMERIC;
  v_lead_time_days NUMERIC;
  v_safety_stock NUMERIC;
  v_reorder_point NUMERIC;
  v_status TEXT;
  v_existing_log RECORD;
  v_final_safety_stock NUMERIC;
BEGIN
  -- Process each warehouse inventory
  FOR v_warehouse_inventory IN
    SELECT wi.uuid, wi.company_uuid, wi.warehouse_uuid, wi.inventory_uuid, 
           wi.standard_unit, wi.unit_values
    FROM warehouse_inventory wi
    WHERE wi.status = 'AVAILABLE'
  LOOP
    -- Get current available stock (converted to standard unit)
    v_current_stock := COALESCE((v_warehouse_inventory.unit_values->>'available')::numeric, 0);
    
    -- Skip if no stock data
    IF v_current_stock IS NULL THEN
      CONTINUE;
    END IF;
    
    -- Calculate average daily usage
    v_average_daily_usage := public.calculate_average_daily_usage(
      v_warehouse_inventory.warehouse_uuid,
      v_warehouse_inventory.inventory_uuid,
      30 -- 30 days lookback
    );
    
    -- Calculate average lead time
    v_lead_time_days := public.calculate_average_lead_time(
      v_warehouse_inventory.warehouse_uuid,
      v_warehouse_inventory.inventory_uuid,
      90 -- 90 days lookback
    );
    
    -- Calculate safety stock
    v_safety_stock := public.calculate_safety_stock(
      v_average_daily_usage,
      v_lead_time_days
    );
    
    -- Check for existing custom safety stock
    SELECT custom_safety_stock, notes INTO v_existing_log
    FROM reorder_point_logs
    WHERE warehouse_inventory_uuid = v_warehouse_inventory.uuid
    ORDER BY updated_at DESC
    LIMIT 1;
    
    -- Use custom safety stock if available
    v_final_safety_stock := COALESCE(v_existing_log.custom_safety_stock, v_safety_stock);
    
    -- Calculate reorder point: (Average Daily Usage × Lead Time) + Safety Stock
    v_reorder_point := (v_average_daily_usage * v_lead_time_days) + v_final_safety_stock;
    
    -- Determine status
    v_status := public.determine_stock_status(v_current_stock, v_reorder_point, v_final_safety_stock);
    
    -- Insert or update reorder point log
    INSERT INTO reorder_point_logs (
      company_uuid,
      warehouse_uuid,
      inventory_uuid,
      warehouse_inventory_uuid,
      current_stock,
      unit,
      average_daily_unit_sales,
      lead_time_days,
      safety_stock,
      reorder_point,
      status,
      custom_safety_stock,
      notes
    ) VALUES (
      v_warehouse_inventory.company_uuid,
      v_warehouse_inventory.warehouse_uuid,
      v_warehouse_inventory.inventory_uuid,
      v_warehouse_inventory.uuid,
      v_current_stock,
      v_warehouse_inventory.standard_unit,
      v_average_daily_usage,
      v_lead_time_days,
      v_final_safety_stock, -- Store the final safety stock used
      v_reorder_point,
      v_status,
      v_existing_log.custom_safety_stock,
      v_existing_log.notes
    )
    ON CONFLICT (warehouse_inventory_uuid) 
    DO UPDATE SET
      current_stock = EXCLUDED.current_stock,
      unit = EXCLUDED.unit,
      average_daily_unit_sales = EXCLUDED.average_daily_unit_sales,
      lead_time_days = EXCLUDED.lead_time_days,
      safety_stock = EXCLUDED.safety_stock,
      reorder_point = EXCLUDED.reorder_point,
      status = EXCLUDED.status,
      updated_at = now()
    WHERE reorder_point_logs.warehouse_inventory_uuid = EXCLUDED.warehouse_inventory_uuid;
  END LOOP;
  
  -- Return all current reorder point logs
  RETURN QUERY
  SELECT rpl.uuid, rpl.company_uuid, rpl.warehouse_uuid, rpl.inventory_uuid,
         rpl.warehouse_inventory_uuid, rpl.current_stock, rpl.unit,
         rpl.average_daily_unit_sales, rpl.lead_time_days, rpl.safety_stock,
         rpl.reorder_point, rpl.status, rpl.custom_safety_stock, rpl.notes,
         rpl.created_at, rpl.updated_at
  FROM reorder_point_logs rpl
  ORDER BY rpl.updated_at DESC;
END;
$function$;

-- Function to calculate reorder point for a specific inventory item
CREATE OR REPLACE FUNCTION public.calculate_specific_reorder_point(
  p_inventory_uuid UUID,
  p_warehouse_uuid UUID,
  p_company_uuid UUID
)
RETURNS TABLE(
  uuid UUID,
  company_uuid UUID,
  warehouse_uuid UUID,
  inventory_uuid UUID,
  warehouse_inventory_uuid UUID,
  current_stock NUMERIC,
  unit TEXT,
  average_daily_unit_sales NUMERIC,
  lead_time_days NUMERIC,
  safety_stock NUMERIC,
  reorder_point NUMERIC,
  status TEXT,
  custom_safety_stock NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_warehouse_inventory RECORD;
  v_current_stock NUMERIC;
  v_average_daily_usage NUMERIC;
  v_lead_time_days NUMERIC;
  v_safety_stock NUMERIC;
  v_reorder_point NUMERIC;
  v_status TEXT;
  v_existing_log RECORD;
  v_final_safety_stock NUMERIC;
BEGIN
  -- Get the specific warehouse inventory
  SELECT wi.uuid, wi.company_uuid, wi.warehouse_uuid, wi.inventory_uuid, 
         wi.standard_unit, wi.unit_values
  INTO v_warehouse_inventory
  FROM warehouse_inventory wi
  WHERE wi.warehouse_uuid = p_warehouse_uuid
    AND wi.inventory_uuid = p_inventory_uuid
    AND wi.company_uuid = p_company_uuid
    AND wi.status = 'AVAILABLE';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Warehouse inventory not found for the specified parameters';
  END IF;
  
  -- Get current available stock
  v_current_stock := COALESCE((v_warehouse_inventory.unit_values->>'available')::numeric, 0);
  
  -- Calculate average daily usage
  v_average_daily_usage := public.calculate_average_daily_usage(
    v_warehouse_inventory.warehouse_uuid,
    v_warehouse_inventory.inventory_uuid,
    30 -- 30 days lookback
  );
  
  -- Calculate average lead time
  v_lead_time_days := public.calculate_average_lead_time(
    v_warehouse_inventory.warehouse_uuid,
    v_warehouse_inventory.inventory_uuid,
    90 -- 90 days lookback
  );
  
  -- Calculate safety stock
  v_safety_stock := public.calculate_safety_stock(
    v_average_daily_usage,
    v_lead_time_days
  );
  
  -- Check for existing custom safety stock
  SELECT custom_safety_stock, notes INTO v_existing_log
  FROM reorder_point_logs
  WHERE warehouse_inventory_uuid = v_warehouse_inventory.uuid
  ORDER BY updated_at DESC
  LIMIT 1;
  
  -- Use custom safety stock if available
  v_final_safety_stock := COALESCE(v_existing_log.custom_safety_stock, v_safety_stock);
  
  -- Calculate reorder point
  v_reorder_point := (v_average_daily_usage * v_lead_time_days) + v_final_safety_stock;
  
  -- Determine status
  v_status := public.determine_stock_status(v_current_stock, v_reorder_point, v_final_safety_stock);
  
  -- Insert or update reorder point log
  INSERT INTO reorder_point_logs (
    company_uuid,
    warehouse_uuid,
    inventory_uuid,
    warehouse_inventory_uuid,
    current_stock,
    unit,
    average_daily_unit_sales,
    lead_time_days,
    safety_stock,
    reorder_point,
    status,
    custom_safety_stock,
    notes
  ) VALUES (
    v_warehouse_inventory.company_uuid,
    v_warehouse_inventory.warehouse_uuid,
    v_warehouse_inventory.inventory_uuid,
    v_warehouse_inventory.uuid,
    v_current_stock,
    v_warehouse_inventory.standard_unit,
    v_average_daily_usage,
    v_lead_time_days,
    v_final_safety_stock,
    v_reorder_point,
    v_status,
    v_existing_log.custom_safety_stock,
    v_existing_log.notes
  )
  ON CONFLICT (warehouse_inventory_uuid) 
  DO UPDATE SET
    current_stock = EXCLUDED.current_stock,
    unit = EXCLUDED.unit,
    average_daily_unit_sales = EXCLUDED.average_daily_unit_sales,
    lead_time_days = EXCLUDED.lead_time_days,
    safety_stock = EXCLUDED.safety_stock,
    reorder_point = EXCLUDED.reorder_point,
    status = EXCLUDED.status,
    updated_at = now()
  WHERE reorder_point_logs.warehouse_inventory_uuid = EXCLUDED.warehouse_inventory_uuid;
  
  -- Return the calculated reorder point log
  RETURN QUERY
  SELECT rpl.uuid, rpl.company_uuid, rpl.warehouse_uuid, rpl.inventory_uuid,
         rpl.warehouse_inventory_uuid, rpl.current_stock, rpl.unit,
         rpl.average_daily_unit_sales, rpl.lead_time_days, rpl.safety_stock,
         rpl.reorder_point, rpl.status, rpl.custom_safety_stock, rpl.notes,
         rpl.created_at, rpl.updated_at
  FROM reorder_point_logs rpl
  WHERE rpl.warehouse_inventory_uuid = v_warehouse_inventory.uuid;
END;
$function$;

-- Function to update custom safety stock
CREATE OR REPLACE FUNCTION public.update_custom_safety_stock(
  p_inventory_uuid UUID,
  p_warehouse_uuid UUID,
  p_custom_safety_stock NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(
  uuid UUID,
  company_uuid UUID,
  warehouse_uuid UUID,
  inventory_uuid UUID,
  warehouse_inventory_uuid UUID,
  current_stock NUMERIC,
  unit TEXT,
  average_daily_unit_sales NUMERIC,
  lead_time_days NUMERIC,
  safety_stock NUMERIC,
  reorder_point NUMERIC,
  status TEXT,
  custom_safety_stock NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_warehouse_inventory_uuid UUID;
  v_existing_log RECORD;
  v_reorder_point NUMERIC;
  v_status TEXT;
BEGIN
  -- Get warehouse inventory UUID
  SELECT wi.uuid INTO v_warehouse_inventory_uuid
  FROM warehouse_inventory wi
  WHERE wi.warehouse_uuid = p_warehouse_uuid
    AND wi.inventory_uuid = p_inventory_uuid;
  
  IF v_warehouse_inventory_uuid IS NULL THEN
    RAISE EXCEPTION 'Warehouse inventory not found';
  END IF;
  
  -- Get existing log data
  SELECT * INTO v_existing_log
  FROM reorder_point_logs
  WHERE warehouse_inventory_uuid = v_warehouse_inventory_uuid
  ORDER BY updated_at DESC
  LIMIT 1;
  
  IF v_existing_log IS NULL THEN
    RAISE EXCEPTION 'No existing reorder point calculation found. Please calculate reorder points first.';
  END IF;
  
  -- Recalculate reorder point with custom safety stock
  v_reorder_point := (v_existing_log.average_daily_unit_sales * v_existing_log.lead_time_days) + p_custom_safety_stock;
  
  -- Determine new status
  v_status := public.determine_stock_status(v_existing_log.current_stock, v_reorder_point, p_custom_safety_stock);
  
  -- Update the log with custom safety stock
  UPDATE reorder_point_logs
  SET
    custom_safety_stock = p_custom_safety_stock,
    safety_stock = p_custom_safety_stock,
    reorder_point = v_reorder_point,
    status = v_status,
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE warehouse_inventory_uuid = v_warehouse_inventory_uuid;
  
  -- Return updated log
  RETURN QUERY
  SELECT rpl.uuid, rpl.company_uuid, rpl.warehouse_uuid, rpl.inventory_uuid,
         rpl.warehouse_inventory_uuid, rpl.current_stock, rpl.unit,
         rpl.average_daily_unit_sales, rpl.lead_time_days, rpl.safety_stock,
         rpl.reorder_point, rpl.status, rpl.custom_safety_stock, rpl.notes,
         rpl.created_at, rpl.updated_at
  FROM reorder_point_logs rpl
  WHERE rpl.warehouse_inventory_uuid = v_warehouse_inventory_uuid;
END;
$function$;

-- Function to get paginated reorder point logs with filtering
CREATE OR REPLACE FUNCTION public.get_reorder_point_logs_filtered(
  p_company_uuid UUID DEFAULT NULL,
  p_warehouse_uuid UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT '',
  p_date_from TEXT DEFAULT NULL,
  p_date_to TEXT DEFAULT NULL,
  p_year INTEGER DEFAULT NULL,
  p_month INTEGER DEFAULT NULL,
  p_week INTEGER DEFAULT NULL,
  p_day INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  uuid UUID,
  company_uuid UUID,
  warehouse_uuid UUID,
  inventory_uuid UUID,
  warehouse_inventory_uuid UUID,
  current_stock NUMERIC,
  unit TEXT,
  average_daily_unit_sales NUMERIC,
  lead_time_days NUMERIC,
  safety_stock NUMERIC,
  reorder_point NUMERIC,
  status TEXT,
  custom_safety_stock NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_search_pattern TEXT;
  v_total_count BIGINT;
  v_date_from_parsed DATE;
  v_date_to_parsed DATE;
BEGIN
  v_search_pattern := '%' || COALESCE(p_search, '') || '%';
  
  -- Parse date strings if provided
  IF p_date_from IS NOT NULL AND p_date_from != '' THEN
    v_date_from_parsed := p_date_from::DATE;
  END IF;
  
  IF p_date_to IS NOT NULL AND p_date_to != '' THEN
    v_date_to_parsed := p_date_to::DATE;
  END IF;
  
  -- Get total count for pagination
  SELECT COUNT(*) INTO v_total_count
  FROM reorder_point_logs rpl
  LEFT JOIN warehouses w ON rpl.warehouse_uuid = w.uuid
  LEFT JOIN inventory inv ON rpl.inventory_uuid = inv.uuid
  WHERE
    (p_company_uuid IS NULL OR rpl.company_uuid = p_company_uuid)
    AND (p_warehouse_uuid IS NULL OR rpl.warehouse_uuid = p_warehouse_uuid)
    AND (p_status IS NULL OR rpl.status = p_status)
    AND (v_date_from_parsed IS NULL OR rpl.updated_at::DATE >= v_date_from_parsed)
    AND (v_date_to_parsed IS NULL OR rpl.updated_at::DATE <= v_date_to_parsed)
    AND (p_year IS NULL OR EXTRACT(YEAR FROM rpl.updated_at) = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM rpl.updated_at) = p_month)
    AND (p_week IS NULL OR EXTRACT(WEEK FROM rpl.updated_at) = p_week)
    AND (p_day IS NULL OR EXTRACT(DAY FROM rpl.updated_at) = p_day)
    AND (
      p_search = '' OR p_search IS NULL
      OR rpl.uuid::TEXT ILIKE v_search_pattern
      OR COALESCE(rpl.notes, '') ILIKE v_search_pattern
      OR w.name ILIKE v_search_pattern
      OR inv.name ILIKE v_search_pattern
    );
  
  -- Return paginated results with total count
  RETURN QUERY
  SELECT 
    rpl.uuid,
    rpl.company_uuid,
    rpl.warehouse_uuid,
    rpl.inventory_uuid,
    rpl.warehouse_inventory_uuid,
    rpl.current_stock,
    rpl.unit,
    rpl.average_daily_unit_sales,
    rpl.lead_time_days,
    rpl.safety_stock,
    rpl.reorder_point,
    rpl.status,
    rpl.custom_safety_stock,
    rpl.notes,
    rpl.created_at,
    rpl.updated_at,
    v_total_count
  FROM reorder_point_logs rpl
  LEFT JOIN warehouses w ON rpl.warehouse_uuid = w.uuid
  LEFT JOIN inventory inv ON rpl.inventory_uuid = inv.uuid
  WHERE
    (p_company_uuid IS NULL OR rpl.company_uuid = p_company_uuid)
    AND (p_warehouse_uuid IS NULL OR rpl.warehouse_uuid = p_warehouse_uuid)
    AND (p_status IS NULL OR rpl.status = p_status)
    AND (v_date_from_parsed IS NULL OR rpl.updated_at::DATE >= v_date_from_parsed)
    AND (v_date_to_parsed IS NULL OR rpl.updated_at::DATE <= v_date_to_parsed)
    AND (p_year IS NULL OR EXTRACT(YEAR FROM rpl.updated_at) = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM rpl.updated_at) = p_month)
    AND (p_week IS NULL OR EXTRACT(WEEK FROM rpl.updated_at) = p_week)
    AND (p_day IS NULL OR EXTRACT(DAY FROM rpl.updated_at) = p_day)
    AND (
      p_search = '' OR p_search IS NULL
      OR rpl.uuid::TEXT ILIKE v_search_pattern
      OR COALESCE(rpl.notes, '') ILIKE v_search_pattern
      OR w.name ILIKE v_search_pattern
      OR inv.name ILIKE v_search_pattern
    )
  ORDER BY rpl.updated_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- Add unique constraint to prevent duplicate logs for same warehouse inventory
ALTER TABLE public.reorder_point_logs 
ADD CONSTRAINT unique_warehouse_inventory_reorder_log 
UNIQUE (warehouse_inventory_uuid);

-- Grant execute permissions on all functions
GRANT EXECUTE ON FUNCTION public.calculate_average_daily_usage TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_average_lead_time TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_safety_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.determine_stock_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_reorder_points TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_specific_reorder_point TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_custom_safety_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reorder_point_logs_filtered TO authenticated;

-- Create trigger to automatically update reorder points when warehouse inventory changes
CREATE OR REPLACE FUNCTION public.trigger_reorder_point_recalculation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only recalculate if unit_values changed (stock levels changed)
  IF TG_OP = 'UPDATE' AND OLD.unit_values IS DISTINCT FROM NEW.unit_values THEN
    -- Perform calculation in background (you might want to use a job queue for this)
    PERFORM public.calculate_specific_reorder_point(
      NEW.inventory_uuid,
      NEW.warehouse_uuid,
      NEW.company_uuid
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to warehouse_inventory table
DROP TRIGGER IF EXISTS trg_reorder_point_recalculation ON warehouse_inventory;
CREATE TRIGGER trg_reorder_point_recalculation
  AFTER UPDATE ON warehouse_inventory
  FOR EACH ROW
  EXECUTE FUNCTION trigger_reorder_point_recalculation();