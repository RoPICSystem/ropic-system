-- Create wearehosue_inventory table
CREATE TABLE IF NOT EXISTS public.warehouse_inventory (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  admin_uuid UUID NOT NULL REFERENCES public.profiles(uuid) ON DELETE SET NULL,
  warehouse_uuid UUID not null REFERENCES public.warehouses (uuid) on DELETE CASCADE,
  inventory_uuid UUID not null REFERENCES public.inventory (uuid) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  measurement_unit TEXT NOT NULL,
  standard_unit TEXT NOT NULL,
  unit_values JSONB DEFAULT '{"available": 0, "used": 0, "transferred": 0, "total": 0}'::jsonb, -- Aggregated unit values
  count JSONB DEFAULT '{"available": 0, "used": 0, "transferred": 0, "total": 0}'::jsonb, -- Aggregated counts
  properties JSONB DEFAULT '{}'::jsonb,
  
  status TEXT DEFAULT 'AVAILABLE' check (
    status in ('AVAILABLE', 'WARNING', 'CRITICAL', 'USED')
  ),
  status_history JSONB DEFAULT (jsonb_build_object(to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'AVAILABLE')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

ALTER TABLE public.warehouse_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_inventory REPLICA IDENTITY FULL;

CREATE or REPLACE TRIGGER trg_update_status_history_warehouse_inventory
BEFORE UPDATE ON public.warehouse_inventory
FOR EACH ROW
EXECUTE FUNCTION update_status_history();

-- Function to update warehouse inventory aggregations
CREATE OR REPLACE FUNCTION update_warehouse_inventory_aggregations(p_warehouse_inventory_uuid uuid)
RETURNS VOID AS $$
DECLARE
  wh_inv_record RECORD;
  total_unit_values RECORD;
  total_counts RECORD;
BEGIN
  -- Skip if warehouse inventory UUID is null
  IF p_warehouse_inventory_uuid IS NULL THEN
    RETURN;
  END IF;

  -- Get warehouse inventory record to access standard_unit
  SELECT standard_unit INTO wh_inv_record FROM warehouse_inventory WHERE uuid = p_warehouse_inventory_uuid;
  
  IF wh_inv_record IS NULL THEN
    RETURN;
  END IF;

  -- Calculate aggregated unit values (converted to standard unit)
  SELECT 
    COALESCE(SUM(CASE 
      WHEN wii.status = 'AVAILABLE' 
      THEN public.convert_unit(wii.unit_value::numeric, wii.unit, wh_inv_record.standard_unit) 
      ELSE 0 
    END), 0) as available,
    COALESCE(SUM(CASE 
      WHEN wii.status = 'USED' 
      THEN public.convert_unit(wii.unit_value::numeric, wii.unit, wh_inv_record.standard_unit) 
      ELSE 0 
    END), 0) as used,
    COALESCE(SUM(CASE 
      WHEN wii.status = 'TRANSFERRED' 
      THEN public.convert_unit(wii.unit_value::numeric, wii.unit, wh_inv_record.standard_unit) 
      ELSE 0 
    END), 0) as transferred,
    COALESCE(SUM(public.convert_unit(wii.unit_value::numeric, wii.unit, wh_inv_record.standard_unit)), 0) as total
  INTO total_unit_values
  FROM warehouse_inventory_items wii
  WHERE wii.warehouse_uuid = (SELECT warehouse_uuid FROM warehouse_inventory WHERE uuid = p_warehouse_inventory_uuid)
    AND wii.inventory_uuid = (SELECT inventory_uuid FROM warehouse_inventory WHERE uuid = p_warehouse_inventory_uuid);

  -- Calculate aggregated counts
  SELECT 
    COALESCE(COUNT(CASE WHEN wii.status = 'AVAILABLE' THEN 1 END), 0) as available,
    COALESCE(COUNT(CASE WHEN wii.status = 'USED' THEN 1 END), 0) as used,
    COALESCE(COUNT(CASE WHEN wii.status = 'TRANSFERRED' THEN 1 END), 0) as transferred,
    COALESCE(COUNT(*), 0) as total
  INTO total_counts
  FROM warehouse_inventory_items wii
  WHERE wii.warehouse_uuid = (SELECT warehouse_uuid FROM warehouse_inventory WHERE uuid = p_warehouse_inventory_uuid)
    AND wii.inventory_uuid = (SELECT inventory_uuid FROM warehouse_inventory WHERE uuid = p_warehouse_inventory_uuid);

  -- Update the warehouse inventory table with aggregated values
  UPDATE warehouse_inventory 
  SET 
    unit_values = jsonb_build_object(
      'available', total_unit_values.available,
      'used', total_unit_values.used,
      'transferred', total_unit_values.transferred,
      'total', total_unit_values.total
    ),
    count = jsonb_build_object(
      'available', total_counts.available,
      'used', total_counts.used,
      'transferred', total_counts.transferred,
      'total', total_counts.total
    ),
    updated_at = NOW()
  WHERE uuid = p_warehouse_inventory_uuid;
END;
$$ LANGUAGE plpgsql;


-- Add trigger function for warehouse inventory items
CREATE OR REPLACE FUNCTION update_warehouse_inventory_aggregations_trigger()
RETURNS TRIGGER AS $$
DECLARE
    target_warehouse_inventory_uuid UUID;
BEGIN
    -- Find the warehouse inventory UUID for this warehouse and inventory combination
    IF TG_OP = 'DELETE' THEN
        SELECT uuid INTO target_warehouse_inventory_uuid
        FROM warehouse_inventory
        WHERE warehouse_uuid = OLD.warehouse_uuid AND inventory_uuid = OLD.inventory_uuid;
    ELSE
        SELECT uuid INTO target_warehouse_inventory_uuid
        FROM warehouse_inventory
        WHERE warehouse_uuid = NEW.warehouse_uuid AND inventory_uuid = NEW.inventory_uuid;
    END IF;

    -- Update aggregations if warehouse inventory exists
    IF target_warehouse_inventory_uuid IS NOT NULL THEN
        PERFORM update_warehouse_inventory_aggregations(target_warehouse_inventory_uuid);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for warehouse inventory items aggregation
DROP TRIGGER IF EXISTS trg_warehouse_inventory_items_aggregation ON warehouse_inventory_items;
CREATE TRIGGER trg_warehouse_inventory_items_aggregation
    AFTER INSERT OR UPDATE OR DELETE ON warehouse_inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION update_warehouse_inventory_aggregations_trigger();

-- Add policies for warehouse inventory
CREATE POLICY "warehouse_inventory_select_policy" ON public.warehouse_inventory
FOR SELECT TO authenticated
USING (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "warehouse_inventory_insert_policy" ON public.warehouse_inventory
FOR INSERT TO authenticated
WITH CHECK (
  public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
);

CREATE POLICY "warehouse_inventory_update_policy" ON public.warehouse_inventory
FOR UPDATE TO authenticated
USING (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "warehouse_inventory_delete_policy" ON public.warehouse_inventory
FOR DELETE TO authenticated
USING (
  public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
);


-- Function to get filtered warehouse inventory
CREATE OR REPLACE FUNCTION public.get_warehouse_inventory_filtered(
  p_company_uuid uuid DEFAULT NULL,
  p_search text DEFAULT '',
  p_warehouse_uuid uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_year integer DEFAULT NULL,
  p_month integer DEFAULT NULL,
  p_week integer DEFAULT NULL,
  p_day integer DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  uuid uuid,
  company_uuid uuid,
  admin_uuid uuid,
  warehouse_uuid uuid,
  inventory_uuid uuid,
  name text,
  description text,
  measurement_unit text,
  standard_unit text,
  unit_values jsonb,
  count jsonb,
  status text,
  warehouse_name text,
  inventory_name text,
  items_count integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  total_count bigint
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
  FROM warehouse_inventory wi
  LEFT JOIN warehouses w ON wi.warehouse_uuid = w.uuid
  LEFT JOIN inventory inv ON wi.inventory_uuid = inv.uuid
  WHERE 
    (p_company_uuid IS NULL OR wi.company_uuid = p_company_uuid)
    AND (p_warehouse_uuid IS NULL OR wi.warehouse_uuid = p_warehouse_uuid)
    AND (p_status IS NULL OR wi.status = p_status)
    AND (p_year IS NULL OR EXTRACT(YEAR FROM wi.created_at) = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM wi.created_at) = p_month)
    AND (p_week IS NULL OR EXTRACT(WEEK FROM wi.created_at) = p_week)
    AND (p_day IS NULL OR EXTRACT(DAY FROM wi.created_at) = p_day)
    AND (
      p_search = '' OR p_search IS NULL
      OR wi.uuid::TEXT ILIKE v_search_pattern
      OR wi.name ILIKE v_search_pattern
      OR COALESCE(wi.description, '') ILIKE v_search_pattern
      OR w.name ILIKE v_search_pattern
      OR inv.name ILIKE v_search_pattern
    );

  RETURN QUERY
  SELECT 
    wi.uuid,
    wi.company_uuid,
    wi.admin_uuid,
    wi.warehouse_uuid,
    wi.inventory_uuid,
    wi.name,
    wi.description,
    wi.measurement_unit,
    wi.standard_unit,
    wi.unit_values,
    wi.count,
    wi.status,
    w.name as warehouse_name,
    inv.name as inventory_name,
    (wi.count->>'total')::INT AS items_count,
    wi.created_at,
    wi.updated_at,
    total_rows
  FROM warehouse_inventory wi
  LEFT JOIN warehouses w ON wi.warehouse_uuid = w.uuid
  LEFT JOIN inventory inv ON wi.inventory_uuid = inv.uuid
  WHERE 
    (p_company_uuid IS NULL OR wi.company_uuid = p_company_uuid)
    AND (p_warehouse_uuid IS NULL OR wi.warehouse_uuid = p_warehouse_uuid)
    AND (p_status IS NULL OR wi.status = p_status)
    AND (p_year IS NULL OR EXTRACT(YEAR FROM wi.created_at) = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM wi.created_at) = p_month)
    AND (p_week IS NULL OR EXTRACT(WEEK FROM wi.created_at) = p_week)
    AND (p_day IS NULL OR EXTRACT(DAY FROM wi.created_at) = p_day)
    AND (
      p_search = '' OR p_search IS NULL
      OR wi.uuid::TEXT ILIKE v_search_pattern
      OR wi.name ILIKE v_search_pattern
      OR COALESCE(wi.description, '') ILIKE v_search_pattern
      OR w.name ILIKE v_search_pattern
      OR inv.name ILIKE v_search_pattern
    )
  ORDER BY wi.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;


-- Function to get warehouse inventory details with items and delivery information
CREATE OR REPLACE FUNCTION public.get_warehouse_inventory_details(
  p_warehouse_inventory_uuid uuid
)
RETURNS TABLE(
  uuid uuid,
  company_uuid uuid,
  admin_uuid uuid,
  warehouse_uuid uuid,
  inventory_uuid uuid,
  name text,
  description text,
  measurement_unit text,
  standard_unit text,
  unit_values jsonb,
  count jsonb,
  properties jsonb,
  status text,
  warehouse_info jsonb,
  inventory_info jsonb,
  delivery_info jsonb,
  items jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    wi.uuid,
    wi.company_uuid,
    wi.admin_uuid,
    wi.warehouse_uuid,
    wi.inventory_uuid,
    wi.name,
    wi.description,
    wi.measurement_unit,
    wi.standard_unit,
    wi.unit_values,
    wi.count,
    wi.properties,
    wi.status,
    jsonb_build_object(
      'uuid', w.uuid,
      'name', w.name,
      'address', w.address
    ) as warehouse_info,
    jsonb_build_object(
      'uuid', inv.uuid,
      'name', inv.name,
      'description', inv.description
    ) as inventory_info,
    COALESCE(
      jsonb_agg(
        DISTINCT jsonb_build_object(
          'uuid', di.uuid,
          'name', di.name,
          'delivery_address', di.delivery_address,
          'delivery_date', di.delivery_date,
          'status', di.status,
          'created_at', di.created_at
        )
      ) FILTER (WHERE di.uuid IS NOT NULL),
      '[]'::jsonb
    ) as delivery_info,
    COALESCE(
      jsonb_agg(
        CASE 
          WHEN wii.uuid IS NOT NULL THEN
            jsonb_build_object(
              'uuid', wii.uuid,
              'company_uuid', wii.company_uuid,
              'warehouse_uuid', wii.warehouse_uuid,
              'inventory_uuid', wii.inventory_uuid,
              'delivery_uuid', wii.delivery_uuid,
              'group_id', wii.group_id,
              'item_code', wii.item_code,
              'unit', wii.unit,
              'unit_value', wii.unit_value,
              'packaging_unit', wii.packaging_unit,
              'cost', wii.cost,
              'properties', wii.properties,
              'location', wii.location,
              'status', wii.status,
              'status_history', wii.status_history,
              'delivery_item', CASE 
                WHEN wii.delivery_uuid IS NOT NULL THEN
                  jsonb_build_object(
                    'uuid', di_item.uuid,
                    'name', di_item.name,
                    'delivery_address', di_item.delivery_address,
                    'delivery_date', di_item.delivery_date,
                    'status', di_item.status
                  )
                ELSE NULL
              END,
              'created_at', wii.created_at,
              'updated_at', wii.updated_at
            )
          ELSE NULL
        END
      ) FILTER (WHERE wii.uuid IS NOT NULL),
      '[]'::jsonb
    ) AS items,
    wi.created_at,
    wi.updated_at
  FROM warehouse_inventory wi
  LEFT JOIN warehouses w ON wi.warehouse_uuid = w.uuid
  LEFT JOIN inventory inv ON wi.inventory_uuid = inv.uuid
  LEFT JOIN warehouse_inventory_items wii ON wi.warehouse_uuid = wii.warehouse_uuid 
    AND wi.inventory_uuid = wii.inventory_uuid
  LEFT JOIN delivery_items di ON wii.delivery_uuid = di.uuid
  LEFT JOIN delivery_items di_item ON wii.delivery_uuid = di_item.uuid
  WHERE wi.uuid = p_warehouse_inventory_uuid
  GROUP BY 
    wi.uuid, wi.company_uuid, wi.admin_uuid, wi.warehouse_uuid, wi.inventory_uuid,
    wi.name, wi.description, wi.measurement_unit, wi.standard_unit,
    wi.unit_values, wi.count, wi.properties, wi.status, wi.created_at, wi.updated_at,
    w.uuid, w.name, w.address, inv.uuid, inv.name, inv.description;
END;
$function$;

-- Function to mark warehouse item as used
CREATE OR REPLACE FUNCTION public.mark_warehouse_item_as_used(
  p_item_uuid uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_timestamp text;
  v_warehouse_inventory_uuid uuid;
BEGIN
  v_timestamp := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  
  -- Update the warehouse inventory item status
  UPDATE warehouse_inventory_items 
  SET 
    status = 'USED',
    status_history = COALESCE(status_history, '{}'::jsonb) || jsonb_build_object(v_timestamp, 'USED'),
    updated_at = now()
  WHERE uuid = p_item_uuid;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Warehouse inventory item not found'
    );
  END IF;

  -- Get the warehouse inventory UUID to update aggregations
  SELECT wi.uuid INTO v_warehouse_inventory_uuid
  FROM warehouse_inventory wi
  JOIN warehouse_inventory_items wii ON wi.warehouse_uuid = wii.warehouse_uuid 
    AND wi.inventory_uuid = wii.inventory_uuid
  WHERE wii.uuid = p_item_uuid;

  -- Update warehouse inventory aggregations
  IF v_warehouse_inventory_uuid IS NOT NULL THEN
    PERFORM update_warehouse_inventory_aggregations(v_warehouse_inventory_uuid);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Warehouse inventory item marked as used successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;

-- Function to mark warehouse group as used
CREATE OR REPLACE FUNCTION public.mark_warehouse_group_as_used(
  p_group_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_timestamp text;
  v_warehouse_inventory_uuids uuid[];
  v_warehouse_inventory_uuid uuid;
BEGIN
  v_timestamp := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  
  -- Update all warehouse inventory items in the group
  UPDATE warehouse_inventory_items 
  SET 
    status = 'USED',
    status_history = COALESCE(status_history, '{}'::jsonb) || jsonb_build_object(v_timestamp, 'USED'),
    updated_at = now()
  WHERE group_id = p_group_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Warehouse inventory group not found'
    );
  END IF;

  -- Get affected warehouse inventory UUIDs to update aggregations
  SELECT array_agg(DISTINCT wi.uuid) INTO v_warehouse_inventory_uuids
  FROM warehouse_inventory wi
  JOIN warehouse_inventory_items wii ON wi.warehouse_uuid = wii.warehouse_uuid 
    AND wi.inventory_uuid = wii.inventory_uuid
  WHERE wii.group_id = p_group_id;

  -- Update warehouse inventory aggregations for all affected warehouse inventories
  IF v_warehouse_inventory_uuids IS NOT NULL THEN
    FOREACH v_warehouse_inventory_uuid IN ARRAY v_warehouse_inventory_uuids
    LOOP
      PERFORM update_warehouse_inventory_aggregations(v_warehouse_inventory_uuid);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Warehouse inventory group marked as used successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;



-- Function to get delivery history for warehouse inventory
CREATE OR REPLACE FUNCTION public.get_warehouse_inventory_delivery_history(
  p_warehouse_inventory_uuid uuid
)
RETURNS TABLE(
  delivery_uuid uuid,
  delivery_name text,
  delivery_address text,
  delivery_date date,
  delivery_status text,
  items_count bigint,
  total_cost numeric,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    di.uuid as delivery_uuid,
    di.name as delivery_name,
    di.delivery_address,
    di.delivery_date,
    di.status as delivery_status,
    COUNT(wii.uuid) as items_count,
    SUM(wii.cost) as total_cost,
    di.created_at
  FROM warehouse_inventory wi
  JOIN warehouse_inventory_items wii ON wi.warehouse_uuid = wii.warehouse_uuid 
    AND wi.inventory_uuid = wii.inventory_uuid
  JOIN delivery_items di ON wii.delivery_uuid = di.uuid
  WHERE wi.uuid = p_warehouse_inventory_uuid
    AND wii.delivery_uuid IS NOT NULL
  GROUP BY 
    di.uuid, di.name, di.delivery_address, di.delivery_date, 
    di.status, di.created_at
  ORDER BY di.created_at DESC;
END;
$function$;

-- Function to get warehouse inventory items by delivery
CREATE OR REPLACE FUNCTION public.get_warehouse_items_by_delivery(
  p_delivery_uuid uuid,
  p_company_uuid uuid DEFAULT NULL
)
RETURNS TABLE(
  uuid uuid,
  warehouse_uuid uuid,
  inventory_uuid uuid,
  group_id text,
  item_code text,
  unit text,
  unit_value text,
  packaging_unit text,
  cost numeric,
  location jsonb,
  status text,
  warehouse_name text,
  inventory_name text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    wii.uuid,
    wii.warehouse_uuid,
    wii.inventory_uuid,
    wii.group_id,
    wii.item_code,
    wii.unit,
    wii.unit_value,
    wii.packaging_unit,
    wii.cost,
    wii.location,
    wii.status,
    w.name as warehouse_name,
    inv.name as inventory_name,
    wii.created_at,
    wii.updated_at
  FROM warehouse_inventory_items wii
  LEFT JOIN warehouses w ON wii.warehouse_uuid = w.uuid
  LEFT JOIN inventory inv ON wii.inventory_uuid = inv.uuid
  WHERE wii.delivery_uuid = p_delivery_uuid
    AND (p_company_uuid IS NULL OR wii.company_uuid = p_company_uuid)
  ORDER BY wii.created_at DESC;
END;
$function$;

-- Fix the warehouse inventory creation function to work with individual item UUIDs
CREATE OR REPLACE FUNCTION public.create_warehouse_inventory_from_delivery(
  p_warehouse_uuid uuid,
  p_delivery_uuid uuid,
  p_item_uuids uuid[],
  p_inventory_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inventory_item RECORD;
  v_location jsonb;
  v_timestamp text;
  v_item_record jsonb;
  v_item_key text;
  v_inventory_uuid uuid;
  v_warehouse_inventory_uuid uuid;
  v_company_uuid uuid;
BEGIN
  -- Generate timestamp
  v_timestamp := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  
  -- Get company UUID from the first inventory item
  SELECT company_uuid INTO v_company_uuid
  FROM inventory_items 
  WHERE uuid = ANY(p_item_uuids)
  LIMIT 1;
  
  IF v_company_uuid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Could not determine company UUID from inventory items'
    );
  END IF;
  
  -- Create warehouse inventory items for each delivered item
  FOR v_inventory_item IN 
    SELECT * FROM inventory_items 
    WHERE uuid = ANY(p_item_uuids)
  LOOP
    -- Find the location for this specific item from inventory_items structure
    FOR v_item_key IN SELECT jsonb_object_keys(p_inventory_items)
    LOOP
      -- Check if this record matches our item UUID
      IF v_item_key = v_inventory_item.uuid::text THEN
        v_item_record := p_inventory_items->v_item_key;
        v_location := v_item_record->'location';
        v_inventory_uuid := (v_item_record->>'inventory_uuid')::uuid;
        EXIT; -- Found the matching record
      END IF;
    END LOOP;
    
    -- Check if warehouse_inventory exists for this warehouse + inventory combination
    SELECT uuid INTO v_warehouse_inventory_uuid
    FROM warehouse_inventory
    WHERE warehouse_uuid = p_warehouse_uuid
      AND inventory_uuid = v_inventory_uuid;
    
    -- If warehouse_inventory doesn't exist, create it
    IF v_warehouse_inventory_uuid IS NULL THEN
      -- Get inventory details to create warehouse_inventory
      INSERT INTO warehouse_inventory (
        company_uuid,
        admin_uuid,
        warehouse_uuid,
        inventory_uuid,
        name,
        description,
        measurement_unit,
        standard_unit,
        status
      )
      SELECT 
        v_company_uuid,
        inv.admin_uuid,
        p_warehouse_uuid,
        inv.uuid,
        inv.name,
        inv.description,
        inv.measurement_unit,
        inv.standard_unit,
        'AVAILABLE'
      FROM inventory inv
      WHERE inv.uuid = v_inventory_uuid
      RETURNING uuid INTO v_warehouse_inventory_uuid;
    END IF;
    
    -- Create warehouse inventory item with the found location
    INSERT INTO warehouse_inventory_items (
      company_uuid,
      warehouse_uuid,
      inventory_uuid,
      inventory_item_uuid,
      delivery_uuid,
      item_code,
      unit,
      unit_value,
      packaging_unit,
      cost,
      properties,
      location,
      group_id,
      status,
      status_history
    ) VALUES (
      v_company_uuid,
      p_warehouse_uuid,
      v_inventory_uuid,
      v_inventory_item.uuid,
      p_delivery_uuid,
      v_inventory_item.item_code,
      v_inventory_item.unit,
      v_inventory_item.unit_value,
      v_inventory_item.packaging_unit,
      v_inventory_item.cost,
      v_inventory_item.properties,
      COALESCE(v_location, '{}'::jsonb),
      v_inventory_item.group_id,
      'AVAILABLE',
      jsonb_build_object(v_timestamp, 'Created from delivery ' || p_delivery_uuid::text)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Warehouse inventory items created successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;



-- Function to mark specific number of warehouse items as used
CREATE OR REPLACE FUNCTION public.mark_warehouse_items_bulk_used(
  p_warehouse_inventory_uuid uuid,
  p_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_timestamp text;
  v_affected_count integer;
  v_warehouse_inventory_uuid uuid;
BEGIN
  v_timestamp := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  
  -- Update the specified number of available warehouse inventory items
  WITH items_to_update AS (
    SELECT wii.uuid
    FROM warehouse_inventory_items wii
    JOIN warehouse_inventory wi ON wi.warehouse_uuid = wii.warehouse_uuid 
      AND wi.inventory_uuid = wii.inventory_uuid
    WHERE wi.uuid = p_warehouse_inventory_uuid
      AND wii.status = 'AVAILABLE'
    ORDER BY wii.created_at ASC
    LIMIT p_count
  )
  UPDATE warehouse_inventory_items 
  SET 
    status = 'USED',
    status_history = COALESCE(status_history, '{}'::jsonb) || jsonb_build_object(v_timestamp, 'USED'),
    updated_at = now()
  WHERE uuid IN (SELECT uuid FROM items_to_update);
  
  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  
  IF v_affected_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No available warehouse inventory items found'
    );
  END IF;

  -- Update warehouse inventory aggregations
  PERFORM update_warehouse_inventory_aggregations(p_warehouse_inventory_uuid);

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Successfully marked %s item(s) as used', v_affected_count),
    'affected_count', v_affected_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;

-- Function to mark specific number of warehouse group items as used
CREATE OR REPLACE FUNCTION public.mark_warehouse_group_bulk_used(
  p_group_id text,
  p_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_timestamp text;
  v_affected_count integer;
  v_warehouse_inventory_uuids uuid[];
  v_warehouse_inventory_uuid uuid;
BEGIN
  v_timestamp := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  
  -- Update the specified number of available warehouse inventory items in the group
  WITH items_to_update AS (
    SELECT uuid
    FROM warehouse_inventory_items
    WHERE group_id = p_group_id
      AND status = 'AVAILABLE'
    ORDER BY created_at ASC
    LIMIT p_count
  )
  UPDATE warehouse_inventory_items 
  SET 
    status = 'USED',
    status_history = COALESCE(status_history, '{}'::jsonb) || jsonb_build_object(v_timestamp, 'USED'),
    updated_at = now()
  WHERE uuid IN (SELECT uuid FROM items_to_update);
  
  GET DIAGNOSTICS v_affected_count = ROW_COUNT;
  
  IF v_affected_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No available warehouse inventory items found in group'
    );
  END IF;

  -- Get affected warehouse inventory UUIDs to update aggregations
  SELECT array_agg(DISTINCT wi.uuid) INTO v_warehouse_inventory_uuids
  FROM warehouse_inventory wi
  JOIN warehouse_inventory_items wii ON wi.warehouse_uuid = wii.warehouse_uuid 
    AND wi.inventory_uuid = wii.inventory_uuid
  WHERE wii.group_id = p_group_id;

  -- Update warehouse inventory aggregations for all affected warehouse inventories
  IF v_warehouse_inventory_uuids IS NOT NULL THEN
    FOREACH v_warehouse_inventory_uuid IN ARRAY v_warehouse_inventory_uuids
    LOOP
      PERFORM update_warehouse_inventory_aggregations(v_warehouse_inventory_uuid);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Successfully marked %s item(s) in group as used', v_affected_count),
    'affected_count', v_affected_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;
