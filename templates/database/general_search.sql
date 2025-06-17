-- General search function to search across all major entities
CREATE OR REPLACE FUNCTION public.general_search(
  p_search_query TEXT DEFAULT '',
  p_entity_type TEXT DEFAULT NULL, -- 'inventory', 'warehouse', 'delivery', 'reorder_point', 'warehouse_inventory', 'inventory_item', 'warehouse_inventory_item'
  p_company_uuid UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  entity_type TEXT,
  entity_uuid UUID,
  entity_name TEXT,
  entity_description TEXT,
  entity_status TEXT,
  matched_property TEXT,
  matched_value TEXT,
  entity_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_search_pattern TEXT;
  v_total_count BIGINT := 0;
  v_temp_count BIGINT;
BEGIN
  -- Prepare search pattern
  v_search_pattern := '%' || COALESCE(p_search_query, '') || '%';
  
  -- If search query is empty or null, return empty result
  IF p_search_query IS NULL OR trim(p_search_query) = '' THEN
    RETURN;
  END IF;

  -- Create temporary table to store all results
  CREATE TEMP TABLE temp_search_results (
    entity_type TEXT,
    entity_uuid UUID,
    entity_name TEXT,
    entity_description TEXT,
    entity_status TEXT,
    matched_property TEXT,
    matched_value TEXT,
    entity_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
  );

  -- Search in INVENTORY table
  IF p_entity_type IS NULL OR p_entity_type = 'inventory' THEN
    INSERT INTO temp_search_results
    SELECT 
      'inventory' as entity_type,
      i.uuid,
      i.name,
      i.description,
      i.status,
      CASE 
        WHEN i.uuid::TEXT ILIKE v_search_pattern THEN 'uuid'
        WHEN i.name ILIKE v_search_pattern THEN 'name'
        WHEN COALESCE(i.description, '') ILIKE v_search_pattern THEN 'description'
        WHEN i.status ILIKE v_search_pattern THEN 'status'
        WHEN i.measurement_unit ILIKE v_search_pattern THEN 'measurement_unit'
        WHEN i.standard_unit ILIKE v_search_pattern THEN 'standard_unit'
        ELSE 'unknown'
      END as matched_property,
      CASE 
        WHEN i.uuid::TEXT ILIKE v_search_pattern THEN i.uuid::TEXT
        WHEN i.name ILIKE v_search_pattern THEN i.name
        WHEN COALESCE(i.description, '') ILIKE v_search_pattern THEN i.description
        WHEN i.status ILIKE v_search_pattern THEN i.status
        WHEN i.measurement_unit ILIKE v_search_pattern THEN i.measurement_unit
        WHEN i.standard_unit ILIKE v_search_pattern THEN i.standard_unit
        ELSE ''
      END as matched_value,
      jsonb_build_object(
        'uuid', i.uuid,
        'company_uuid', i.company_uuid,
        'admin_uuid', i.admin_uuid,
        'name', i.name,
        'description', i.description,
        'measurement_unit', i.measurement_unit,
        'standard_unit', i.standard_unit,
        'unit_values', i.unit_values,
        'count', i.count,
        'status', i.status
      ) as entity_data,
      i.created_at,
      i.updated_at
    FROM inventory i
    WHERE (p_company_uuid IS NULL OR i.company_uuid = p_company_uuid)
      AND (
        i.uuid::TEXT ILIKE v_search_pattern
        OR i.name ILIKE v_search_pattern
        OR COALESCE(i.description, '') ILIKE v_search_pattern
        OR i.status ILIKE v_search_pattern
        OR i.measurement_unit ILIKE v_search_pattern
        OR i.standard_unit ILIKE v_search_pattern
      );
  END IF;

  -- Search in WAREHOUSES table
  IF p_entity_type IS NULL OR p_entity_type = 'warehouse' THEN
    INSERT INTO temp_search_results
    SELECT 
      'warehouse' as entity_type,
      w.uuid,
      w.name,
      NULL as entity_description,
      NULL as entity_status,
      CASE 
        WHEN w.uuid::TEXT ILIKE v_search_pattern THEN 'uuid'
        WHEN w.name ILIKE v_search_pattern THEN 'name'
        WHEN w.address->>'fullAddress' ILIKE v_search_pattern THEN 'address'
        ELSE 'unknown'
      END as matched_property,
      CASE 
        WHEN w.uuid::TEXT ILIKE v_search_pattern THEN w.uuid::TEXT
        WHEN w.name ILIKE v_search_pattern THEN w.name
        WHEN w.address->>'fullAddress' ILIKE v_search_pattern THEN w.address->>'fullAddress'
        ELSE ''
      END as matched_value,
      jsonb_build_object(
        'uuid', w.uuid,
        'company_uuid', w.company_uuid,
        'name', w.name,
        'address', w.address,
        'layout', w.layout
      ) as entity_data,
      w.created_at,
      w.updated_at
    FROM warehouses w
    WHERE (p_company_uuid IS NULL OR w.company_uuid = p_company_uuid)
      AND (
        w.uuid::TEXT ILIKE v_search_pattern
        OR w.name ILIKE v_search_pattern
        OR w.address->>'fullAddress' ILIKE v_search_pattern
      );
  END IF;

  -- Search in DELIVERY_ITEMS table
  IF p_entity_type IS NULL OR p_entity_type = 'delivery' THEN
    INSERT INTO temp_search_results
    SELECT 
      'delivery' as entity_type,
      di.uuid,
      COALESCE(di.name, 'Delivery to ' || di.delivery_address),
      di.notes,
      di.status,
      CASE 
        WHEN di.uuid::TEXT ILIKE v_search_pattern THEN 'uuid'
        WHEN COALESCE(di.name, '') ILIKE v_search_pattern THEN 'name'
        WHEN di.delivery_address ILIKE v_search_pattern THEN 'delivery_address'
        WHEN di.status ILIKE v_search_pattern THEN 'status'
        WHEN COALESCE(di.notes, '') ILIKE v_search_pattern THEN 'notes'
        ELSE 'unknown'
      END as matched_property,
      CASE 
        WHEN di.uuid::TEXT ILIKE v_search_pattern THEN di.uuid::TEXT
        WHEN COALESCE(di.name, '') ILIKE v_search_pattern THEN di.name
        WHEN di.delivery_address ILIKE v_search_pattern THEN di.delivery_address
        WHEN di.status ILIKE v_search_pattern THEN di.status
        WHEN COALESCE(di.notes, '') ILIKE v_search_pattern THEN di.notes
        ELSE ''
      END as matched_value,
      jsonb_build_object(
        'uuid', di.uuid,
        'company_uuid', di.company_uuid,
        'warehouse_uuid', di.warehouse_uuid,
        'name', di.name,
        'delivery_address', di.delivery_address,
        'delivery_date', di.delivery_date,
        'status', di.status,
        'notes', di.notes
      ) as entity_data,
      di.created_at,
      di.updated_at
    FROM delivery_items di
    WHERE (p_company_uuid IS NULL OR di.company_uuid = p_company_uuid)
      AND (
        di.uuid::TEXT ILIKE v_search_pattern
        OR COALESCE(di.name, '') ILIKE v_search_pattern
        OR di.delivery_address ILIKE v_search_pattern
        OR di.status ILIKE v_search_pattern
        OR COALESCE(di.notes, '') ILIKE v_search_pattern
      );
  END IF;

  -- Search in REORDER_POINT_LOGS table
  IF p_entity_type IS NULL OR p_entity_type = 'reorder_point' THEN
    INSERT INTO temp_search_results
    SELECT 
      'reorder_point' as entity_type,
      rpl.uuid,
      COALESCE(inv.name, wi.name, 'Reorder Point'),
      rpl.notes,
      rpl.status,
      CASE 
        WHEN rpl.uuid::TEXT ILIKE v_search_pattern THEN 'uuid'
        WHEN rpl.status ILIKE v_search_pattern THEN 'status'
        WHEN COALESCE(rpl.notes, '') ILIKE v_search_pattern THEN 'notes'
        WHEN COALESCE(inv.name, wi.name, '') ILIKE v_search_pattern THEN 'inventory_name'
        WHEN w.name ILIKE v_search_pattern THEN 'warehouse_name'
        ELSE 'unknown'
      END as matched_property,
      CASE 
        WHEN rpl.uuid::TEXT ILIKE v_search_pattern THEN rpl.uuid::TEXT
        WHEN rpl.status ILIKE v_search_pattern THEN rpl.status
        WHEN COALESCE(rpl.notes, '') ILIKE v_search_pattern THEN rpl.notes
        WHEN COALESCE(inv.name, wi.name, '') ILIKE v_search_pattern THEN COALESCE(inv.name, wi.name)
        WHEN w.name ILIKE v_search_pattern THEN w.name
        ELSE ''
      END as matched_value,
      jsonb_build_object(
        'uuid', rpl.uuid,
        'company_uuid', rpl.company_uuid,
        'warehouse_uuid', rpl.warehouse_uuid,
        'inventory_uuid', rpl.inventory_uuid,
        'current_stock', rpl.current_stock,
        'reorder_point', rpl.reorder_point,
        'safety_stock', rpl.safety_stock,
        'status', rpl.status,
        'warehouse_name', w.name,
        'inventory_name', COALESCE(inv.name, wi.name)
      ) as entity_data,
      rpl.created_at,
      rpl.updated_at
    FROM reorder_point_logs rpl
    LEFT JOIN warehouses w ON rpl.warehouse_uuid = w.uuid
    LEFT JOIN inventory inv ON rpl.inventory_uuid = inv.uuid
    LEFT JOIN warehouse_inventory wi ON rpl.warehouse_inventory_uuid = wi.uuid
    WHERE (p_company_uuid IS NULL OR rpl.company_uuid = p_company_uuid)
      AND (
        rpl.uuid::TEXT ILIKE v_search_pattern
        OR rpl.status ILIKE v_search_pattern
        OR COALESCE(rpl.notes, '') ILIKE v_search_pattern
        OR COALESCE(inv.name, wi.name, '') ILIKE v_search_pattern
        OR w.name ILIKE v_search_pattern
      );
  END IF;

  -- Search in WAREHOUSE_INVENTORY table
  IF p_entity_type IS NULL OR p_entity_type = 'warehouse_inventory' THEN
    INSERT INTO temp_search_results
    SELECT 
      'warehouse_inventory' as entity_type,
      wi.uuid,
      wi.name,
      wi.description,
      wi.status,
      CASE 
        WHEN wi.uuid::TEXT ILIKE v_search_pattern THEN 'uuid'
        WHEN wi.name ILIKE v_search_pattern THEN 'name'
        WHEN COALESCE(wi.description, '') ILIKE v_search_pattern THEN 'description'
        WHEN wi.status ILIKE v_search_pattern THEN 'status'
        WHEN wi.standard_unit ILIKE v_search_pattern THEN 'standard_unit'
        WHEN w.name ILIKE v_search_pattern THEN 'warehouse_name'
        ELSE 'unknown'
      END as matched_property,
      CASE 
        WHEN wi.uuid::TEXT ILIKE v_search_pattern THEN wi.uuid::TEXT
        WHEN wi.name ILIKE v_search_pattern THEN wi.name
        WHEN COALESCE(wi.description, '') ILIKE v_search_pattern THEN wi.description
        WHEN wi.status ILIKE v_search_pattern THEN wi.status
        WHEN wi.standard_unit ILIKE v_search_pattern THEN wi.standard_unit
        WHEN w.name ILIKE v_search_pattern THEN w.name
        ELSE ''
      END as matched_value,
      jsonb_build_object(
        'uuid', wi.uuid,
        'company_uuid', wi.company_uuid,
        'warehouse_uuid', wi.warehouse_uuid,
        'inventory_uuid', wi.inventory_uuid,
        'name', wi.name,
        'description', wi.description,
        'standard_unit', wi.standard_unit,
        'unit_values', wi.unit_values,
        'count', wi.count,
        'status', wi.status,
        'warehouse_name', w.name
      ) as entity_data,
      wi.created_at,
      wi.updated_at
    FROM warehouse_inventory wi
    LEFT JOIN warehouses w ON wi.warehouse_uuid = w.uuid
    WHERE (p_company_uuid IS NULL OR wi.company_uuid = p_company_uuid)
      AND (
        wi.uuid::TEXT ILIKE v_search_pattern
        OR wi.name ILIKE v_search_pattern
        OR COALESCE(wi.description, '') ILIKE v_search_pattern
        OR wi.status ILIKE v_search_pattern
        OR wi.standard_unit ILIKE v_search_pattern
        OR w.name ILIKE v_search_pattern
      );
  END IF;

  -- Search in INVENTORY_ITEMS table
  IF p_entity_type IS NULL OR p_entity_type = 'inventory_item' THEN
    INSERT INTO temp_search_results
    SELECT 
      'inventory_item' as entity_type,
      ii.uuid,
      COALESCE(ii.item_code, 'Item'),
      NULL as entity_description,
      ii.status,
      CASE 
        WHEN ii.uuid::TEXT ILIKE v_search_pattern THEN 'uuid'
        WHEN COALESCE(ii.item_code, '') ILIKE v_search_pattern THEN 'item_code'
        WHEN ii.status ILIKE v_search_pattern THEN 'status'
        WHEN ii.unit ILIKE v_search_pattern THEN 'unit'
        WHEN COALESCE(ii.group_id, '') ILIKE v_search_pattern THEN 'group_id'
        WHEN inv.name ILIKE v_search_pattern THEN 'inventory_name'
        ELSE 'unknown'
      END as matched_property,
      CASE 
        WHEN ii.uuid::TEXT ILIKE v_search_pattern THEN ii.uuid::TEXT
        WHEN COALESCE(ii.item_code, '') ILIKE v_search_pattern THEN ii.item_code
        WHEN ii.status ILIKE v_search_pattern THEN ii.status
        WHEN ii.unit ILIKE v_search_pattern THEN ii.unit
        WHEN COALESCE(ii.group_id, '') ILIKE v_search_pattern THEN ii.group_id
        WHEN inv.name ILIKE v_search_pattern THEN inv.name
        ELSE ''
      END as matched_value,
      jsonb_build_object(
        'uuid', ii.uuid,
        'company_uuid', ii.company_uuid,
        'inventory_uuid', ii.inventory_uuid,
        'item_code', ii.item_code,
        'unit', ii.unit,
        'unit_value', ii.unit_value,
        'cost', ii.cost,
        'status', ii.status,
        'group_id', ii.group_id,
        'inventory_name', inv.name
      ) as entity_data,
      ii.created_at,
      ii.updated_at
    FROM inventory_items ii
    LEFT JOIN inventory inv ON ii.inventory_uuid = inv.uuid
    WHERE (p_company_uuid IS NULL OR ii.company_uuid = p_company_uuid)
      AND (
        ii.uuid::TEXT ILIKE v_search_pattern
        OR COALESCE(ii.item_code, '') ILIKE v_search_pattern
        OR ii.status ILIKE v_search_pattern
        OR ii.unit ILIKE v_search_pattern
        OR COALESCE(ii.group_id, '') ILIKE v_search_pattern
        OR inv.name ILIKE v_search_pattern
      );
  END IF;

  -- Search in WAREHOUSE_INVENTORY_ITEMS table
  IF p_entity_type IS NULL OR p_entity_type = 'warehouse_inventory_item' THEN
    INSERT INTO temp_search_results
    SELECT 
      'warehouse_inventory_item' as entity_type,
      wii.uuid,
      COALESCE(wii.item_code, 'Warehouse Item'),
      NULL as entity_description,
      wii.status,
      CASE 
        WHEN wii.uuid::TEXT ILIKE v_search_pattern THEN 'uuid'
        WHEN COALESCE(wii.item_code, '') ILIKE v_search_pattern THEN 'item_code'
        WHEN wii.status ILIKE v_search_pattern THEN 'status'
        WHEN wii.unit ILIKE v_search_pattern THEN 'unit'
        WHEN COALESCE(wii.group_id, '') ILIKE v_search_pattern THEN 'group_id'
        WHEN w.name ILIKE v_search_pattern THEN 'warehouse_name'
        WHEN inv.name ILIKE v_search_pattern THEN 'inventory_name'
        ELSE 'unknown'
      END as matched_property,
      CASE 
        WHEN wii.uuid::TEXT ILIKE v_search_pattern THEN wii.uuid::TEXT
        WHEN COALESCE(wii.item_code, '') ILIKE v_search_pattern THEN wii.item_code
        WHEN wii.status ILIKE v_search_pattern THEN wii.status
        WHEN wii.unit ILIKE v_search_pattern THEN wii.unit
        WHEN COALESCE(wii.group_id, '') ILIKE v_search_pattern THEN wii.group_id
        WHEN w.name ILIKE v_search_pattern THEN w.name
        WHEN inv.name ILIKE v_search_pattern THEN inv.name
        ELSE ''
      END as matched_value,
      jsonb_build_object(
        'uuid', wii.uuid,
        'company_uuid', wii.company_uuid,
        'warehouse_uuid', wii.warehouse_uuid,
        'inventory_uuid', wii.inventory_uuid,
        'item_code', wii.item_code,
        'unit', wii.unit,
        'unit_value', wii.unit_value,
        'cost', wii.cost,
        'status', wii.status,
        'group_id', wii.group_id,
        'location', wii.location,
        'warehouse_name', w.name,
        'inventory_name', inv.name
      ) as entity_data,
      wii.created_at,
      wii.updated_at
    FROM warehouse_inventory_items wii
    LEFT JOIN warehouses w ON wii.warehouse_uuid = w.uuid
    LEFT JOIN inventory inv ON wii.inventory_uuid = inv.uuid
    WHERE (p_company_uuid IS NULL OR wii.company_uuid = p_company_uuid)
      AND (
        wii.uuid::TEXT ILIKE v_search_pattern
        OR COALESCE(wii.item_code, '') ILIKE v_search_pattern
        OR wii.status ILIKE v_search_pattern
        OR wii.unit ILIKE v_search_pattern
        OR COALESCE(wii.group_id, '') ILIKE v_search_pattern
        OR w.name ILIKE v_search_pattern
        OR inv.name ILIKE v_search_pattern
      );
  END IF;

  -- Get total count
  SELECT COUNT(*) INTO v_total_count FROM temp_search_results;

  -- Return paginated results
  RETURN QUERY
  SELECT 
    tsr.entity_type,
    tsr.entity_uuid,
    tsr.entity_name,
    tsr.entity_description,
    tsr.entity_status,
    tsr.matched_property,
    tsr.matched_value,
    tsr.entity_data,
    tsr.created_at,
    tsr.updated_at,
    v_total_count
  FROM temp_search_results tsr
  ORDER BY 
    -- Prioritize exact matches in name/title fields
    CASE 
      WHEN tsr.matched_property IN ('name', 'item_code') AND LOWER(tsr.matched_value) = LOWER(p_search_query) THEN 1
      WHEN tsr.matched_property = 'uuid' THEN 2
      WHEN tsr.matched_property IN ('name', 'item_code') THEN 3
      WHEN tsr.matched_property = 'status' THEN 4
      ELSE 5
    END,
    tsr.entity_type,
    tsr.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;

  -- Clean up temp table
  DROP TABLE temp_search_results;

EXCEPTION
  WHEN OTHERS THEN
    -- Clean up temp table in case of error
    DROP TABLE IF EXISTS temp_search_results;
    RAISE;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.general_search TO authenticated;

-- Create indexes to improve search performance
CREATE INDEX IF NOT EXISTS idx_inventory_search ON inventory(uuid, name, description, status, measurement_unit, standard_unit);
CREATE INDEX IF NOT EXISTS idx_warehouses_search ON warehouses(uuid, name);
CREATE INDEX IF NOT EXISTS idx_delivery_items_search ON delivery_items(uuid, name, delivery_address, status, notes);
CREATE INDEX IF NOT EXISTS idx_inventory_items_search ON inventory_items(uuid, item_code, status, unit, group_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_search ON warehouse_inventory(uuid, name, description, status, standard_unit);
CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_items_search ON warehouse_inventory_items(uuid, item_code, status, unit, group_id);

-- Example usage function to demonstrate search capabilities
CREATE OR REPLACE FUNCTION public.search_example_usage()
RETURNS TABLE(
  search_type TEXT,
  example_query TEXT,
  description TEXT
)
LANGUAGE sql
AS $function$
SELECT * FROM (VALUES
  ('General Search', 'SELECT * FROM general_search(''laptop'');', 'Search for "laptop" across all entities'),
  ('Entity Specific', 'SELECT * FROM general_search(''AVAILABLE'', ''inventory'');', 'Search for "AVAILABLE" status only in inventory'),
  ('UUID Search', 'SELECT * FROM general_search(''550e8400'');', 'Search by UUID (partial match)'),
  ('Warehouse Search', 'SELECT * FROM general_search(''Main'', ''warehouse'');', 'Search warehouses containing "Main"'),
  ('Delivery Search', 'SELECT * FROM general_search(''PENDING'', ''delivery'');', 'Search deliveries with PENDING status'),
  ('Company Specific', 'SELECT * FROM general_search(''item'', NULL, ''company-uuid-here'');', 'Search within specific company'),
  ('Paginated', 'SELECT * FROM general_search(''test'', NULL, NULL, 10, 20);', 'Get 10 results starting from offset 20')
) AS examples(search_type, example_query, description);
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.search_example_usage TO authenticated;