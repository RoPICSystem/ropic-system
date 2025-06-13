-- Create delivery_items table
CREATE TABLE IF NOT EXISTS public.delivery_items (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  admin_uuid UUID NOT NULL REFERENCES public.profiles(uuid) ON DELETE SET NULL,
  warehouse_uuid UUID NOT NULL REFERENCES public.warehouses(uuid) ON DELETE SET NULL,
  inventory_uuid UUID NOT NULL REFERENCES public.inventory(uuid) ON DELETE CASCADE,
  inventory_locations JSONB DEFAULT '{}'::jsonb, -- Key as inventory_item_uuid, value as ShelfLocation
  name TEXT,
  delivery_address TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  operator_uuids uuid[],
  notes TEXT,
  
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'IN_TRANSIT', 'DELIVERED', 'CONFIRMED', 'CANCELLED')),
  status_history JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items REPLICA IDENTITY FULL;

CREATE or REPLACE TRIGGER trg_update_status_history_delivery_items
BEFORE UPDATE ON public.delivery_items
FOR EACH ROW
EXECUTE FUNCTION update_status_history();

CREATE OR REPLACE FUNCTION public.create_delivery_with_items(
  p_admin_uuid uuid,
  p_company_uuid uuid,
  p_inventory_uuid uuid,
  p_warehouse_uuid uuid,
  p_inventory_locations jsonb, -- Key as inventory_item_uuid, value as ShelfLocation
  p_delivery_address text,
  p_delivery_date date,
  p_operator_uuids uuid[] DEFAULT '{}',
  p_notes text DEFAULT '',
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery_uuid uuid;
  v_timestamp text;
  v_inventory_item_uuid uuid;
  v_result jsonb;
  v_inventory_item_uuids uuid[];
BEGIN
  -- Generate timestamp for status history
  v_timestamp := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  
  -- Extract inventory item UUIDs from the locations object keys
  SELECT array_agg(key::uuid) INTO v_inventory_item_uuids
  FROM jsonb_object_keys(p_inventory_locations) AS key
  WHERE key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  
  -- Validate that all inventory item UUIDs exist and belong to the specified inventory
  IF v_inventory_item_uuids IS NOT NULL AND array_length(v_inventory_item_uuids, 1) > 0 THEN
    PERFORM 1 FROM inventory_items 
    WHERE uuid = ANY(v_inventory_item_uuids) 
      AND inventory_uuid = p_inventory_uuid
      AND company_uuid = p_company_uuid;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'One or more inventory items not found or do not belong to the specified inventory'
      );
    END IF;
  END IF;
  
  -- Create the delivery item
  INSERT INTO delivery_items (
    admin_uuid,
    company_uuid,
    inventory_uuid,
    warehouse_uuid,
    inventory_locations,
    delivery_address,
    delivery_date,
    operator_uuids,
    notes,
    name,
    status,
    status_history
  ) VALUES (
    p_admin_uuid,
    p_company_uuid,
    p_inventory_uuid,
    p_warehouse_uuid,
    p_inventory_locations,
    p_delivery_address,
    p_delivery_date,
    p_operator_uuids,
    p_notes,
    p_name,
    'PENDING',
    jsonb_build_object(v_timestamp, 'PENDING')
  )
  RETURNING uuid INTO v_delivery_uuid;

  -- Update inventory item status to 'ON_DELIVERY' for each selected item
  IF v_inventory_item_uuids IS NOT NULL AND array_length(v_inventory_item_uuids, 1) > 0 THEN
    UPDATE inventory_items 
    SET 
      status = 'ON_DELIVERY',
      status_history = COALESCE(status_history, '{}'::jsonb) || jsonb_build_object(v_timestamp, 'ON_DELIVERY'),
      updated_at = now()
    WHERE uuid = ANY(v_inventory_item_uuids)
      AND company_uuid = p_company_uuid;
  END IF;

  -- Return the created delivery with success status
  SELECT row_to_json(di.*) INTO v_result
  FROM delivery_items di
  WHERE di.uuid = v_delivery_uuid;

  RETURN jsonb_build_object(
    'success', true,
    'data', v_result,
    'delivery_uuid', v_delivery_uuid
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_detail', SQLSTATE
    );
END;
$function$;

-- Update the existing update_delivery_with_items function to handle IN_TRANSIT status
CREATE OR REPLACE FUNCTION public.update_delivery_with_items(
  p_delivery_uuid uuid,
  p_inventory_locations jsonb,
  p_delivery_address text DEFAULT NULL,
  p_delivery_date date DEFAULT NULL,
  p_operator_uuids uuid[] DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_company_uuid uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery_record RECORD;
  v_timestamp text;
  v_result jsonb;
  v_new_inventory_item_uuids uuid[];
  v_old_inventory_item_uuids uuid[];
  v_items_to_add uuid[];
  v_items_to_remove uuid[];
BEGIN
  -- Generate timestamp for status history
  v_timestamp := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  
  -- Get the delivery record
  SELECT * INTO v_delivery_record
  FROM delivery_items
  WHERE uuid = p_delivery_uuid
    AND (p_company_uuid IS NULL OR company_uuid = p_company_uuid);
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Delivery not found'
    );
  END IF;

  -- Allow updates for PENDING, PROCESSING, and IN_TRANSIT status
  IF v_delivery_record.status NOT IN ('PENDING', 'PROCESSING', 'IN_TRANSIT') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot modify delivery items when status is ' || v_delivery_record.status
    );
  END IF;

  -- For IN_TRANSIT status, only allow inventory_locations updates
  IF v_delivery_record.status = 'IN_TRANSIT' THEN
    -- Only update inventory_locations and updated_at
    UPDATE delivery_items 
    SET 
      inventory_locations = p_inventory_locations,
      updated_at = now()
    WHERE uuid = p_delivery_uuid;

    -- Return the updated delivery without changing inventory item statuses
    SELECT row_to_json(di.*) INTO v_result
    FROM delivery_items di
    WHERE di.uuid = p_delivery_uuid;

    RETURN jsonb_build_object(
      'success', true,
      'data', v_result
    );
  END IF;

  -- Extract new inventory item UUIDs from the locations object keys
  SELECT array_agg(key::uuid) INTO v_new_inventory_item_uuids
  FROM jsonb_object_keys(p_inventory_locations) AS key
  WHERE key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  
  -- Extract old inventory item UUIDs from existing locations
  SELECT array_agg(key::uuid) INTO v_old_inventory_item_uuids
  FROM jsonb_object_keys(v_delivery_record.inventory_locations) AS key
  WHERE key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  -- Handle null arrays
  v_new_inventory_item_uuids := COALESCE(v_new_inventory_item_uuids, ARRAY[]::uuid[]);
  v_old_inventory_item_uuids := COALESCE(v_old_inventory_item_uuids, ARRAY[]::uuid[]);

  -- Find items to add (in new but not in old)
  SELECT array_agg(uuid_val) INTO v_items_to_add
  FROM unnest(v_new_inventory_item_uuids) AS uuid_val
  WHERE uuid_val != ALL(v_old_inventory_item_uuids);

  -- Find items to remove (in old but not in new)
  SELECT array_agg(uuid_val) INTO v_items_to_remove
  FROM unnest(v_old_inventory_item_uuids) AS uuid_val
  WHERE uuid_val != ALL(v_new_inventory_item_uuids);

  -- Handle null arrays
  v_items_to_add := COALESCE(v_items_to_add, ARRAY[]::uuid[]);
  v_items_to_remove := COALESCE(v_items_to_remove, ARRAY[]::uuid[]);

  -- Validate that all new inventory item UUIDs exist and belong to the specified inventory
  IF array_length(v_new_inventory_item_uuids, 1) > 0 THEN
    PERFORM 1 FROM inventory_items 
    WHERE uuid = ANY(v_new_inventory_item_uuids) 
      AND inventory_uuid = v_delivery_record.inventory_uuid
      AND company_uuid = v_delivery_record.company_uuid;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'One or more inventory items not found or do not belong to the specified inventory'
      );
    END IF;
  END IF;

  -- Update delivery record (for non-IN_TRANSIT status)
  UPDATE delivery_items 
  SET 
    inventory_locations = p_inventory_locations,
    delivery_address = COALESCE(p_delivery_address, delivery_address),
    delivery_date = COALESCE(p_delivery_date, delivery_date),
    operator_uuids = COALESCE(p_operator_uuids, operator_uuids),
    notes = COALESCE(p_notes, notes),
    name = COALESCE(p_name, name),
    updated_at = now()
  WHERE uuid = p_delivery_uuid;

  -- Add new items: set status to 'ON_DELIVERY'
  IF array_length(v_items_to_add, 1) > 0 THEN
    UPDATE inventory_items 
    SET 
      status = 'ON_DELIVERY',
      status_history = COALESCE(status_history, '{}'::jsonb) || jsonb_build_object(v_timestamp, 'ON_DELIVERY'),
      updated_at = now()
    WHERE uuid = ANY(v_items_to_add)
      AND company_uuid = v_delivery_record.company_uuid;
  END IF;

  -- Remove items: revert status to 'AVAILABLE' (only if they were ON_DELIVERY)
  IF array_length(v_items_to_remove, 1) > 0 THEN
    UPDATE inventory_items 
    SET 
      status = 'AVAILABLE',
      status_history = COALESCE(status_history, '{}'::jsonb) || jsonb_build_object(v_timestamp, 'AVAILABLE'),
      updated_at = now()
    WHERE uuid = ANY(v_items_to_remove)
      AND company_uuid = v_delivery_record.company_uuid
      AND status = 'ON_DELIVERY'; -- Only revert if currently on delivery
  END IF;

  -- Return the updated delivery
  SELECT row_to_json(di.*) INTO v_result
  FROM delivery_items di
  WHERE di.uuid = p_delivery_uuid;

  RETURN jsonb_build_object(
    'success', true,
    'data', v_result
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_detail', SQLSTATE
    );
END;
$function$;


-- Updated function to handle warehouse inventory creation when delivery is marked as DELIVERED
CREATE OR REPLACE FUNCTION public.update_delivery_status_with_items(
  p_delivery_uuid uuid,
  p_status text,
  p_company_uuid uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery_record RECORD;
  v_timestamp text;
  v_inventory_status text;
  v_result jsonb;
  v_inventory_item_uuids uuid[];
  v_warehouse_result jsonb;
BEGIN
  -- Generate timestamp for status history
  v_timestamp := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  
  -- Get the delivery record
  SELECT * INTO v_delivery_record
  FROM delivery_items
  WHERE uuid = p_delivery_uuid
    AND (p_company_uuid IS NULL OR company_uuid = p_company_uuid);
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Delivery not found'
    );
  END IF;

  -- Extract inventory item UUIDs from the locations object keys
  SELECT array_agg(key::uuid) INTO v_inventory_item_uuids
  FROM jsonb_object_keys(v_delivery_record.inventory_locations) AS key
  WHERE key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  -- Determine inventory item status based on delivery status
  CASE p_status
    WHEN 'PENDING' THEN v_inventory_status := 'ON_DELIVERY';
    WHEN 'PROCESSING' THEN v_inventory_status := 'ON_DELIVERY';
    WHEN 'IN_TRANSIT' THEN v_inventory_status := 'ON_DELIVERY';
    WHEN 'DELIVERED' THEN v_inventory_status := 'IN_WAREHOUSE';
    WHEN 'CANCELLED' THEN v_inventory_status := 'AVAILABLE';
    ELSE v_inventory_status := 'ON_DELIVERY';
  END CASE;

  -- Update delivery status and status history
  UPDATE delivery_items 
  SET 
    status = p_status,
    status_history = COALESCE(status_history, '{}'::jsonb) || jsonb_build_object(v_timestamp, p_status),
    updated_at = now()
  WHERE uuid = p_delivery_uuid;

  -- Update inventory item status for each item in the delivery
  IF v_inventory_item_uuids IS NOT NULL AND array_length(v_inventory_item_uuids, 1) > 0 THEN
    UPDATE inventory_items 
    SET 
      status = v_inventory_status,
      status_history = COALESCE(status_history, '{}'::jsonb) || jsonb_build_object(v_timestamp, v_inventory_status),
      updated_at = now()
    WHERE uuid = ANY(v_inventory_item_uuids)
      AND company_uuid = v_delivery_record.company_uuid;
  END IF;

  -- If status is DELIVERED, create warehouse inventory items
  IF p_status = 'DELIVERED' THEN
    SELECT public.create_warehouse_inventory_from_delivery(
      v_delivery_record.inventory_uuid,
      v_delivery_record.warehouse_uuid,
      p_delivery_uuid,
      v_inventory_item_uuids,
      v_delivery_record.inventory_locations
    ) INTO v_warehouse_result;
    
    IF NOT (v_warehouse_result->>'success')::boolean THEN
      -- Rollback the delivery status change if warehouse creation fails
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Failed to create warehouse inventory: ' || (v_warehouse_result->>'error')
      );
    END IF;
  END IF;

  -- Return the updated delivery
  SELECT row_to_json(di.*) INTO v_result
  FROM delivery_items di
  WHERE di.uuid = p_delivery_uuid;

  RETURN jsonb_build_object(
    'success', true,
    'data', v_result
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_detail', SQLSTATE
    );
END;
$function$;

-- Updated function to create warehouse inventory from delivery with delivery tracking
CREATE OR REPLACE FUNCTION public.create_warehouse_inventory_from_delivery(
  p_inventory_uuid uuid,
  p_warehouse_uuid uuid,
  p_delivery_uuid uuid,
  p_inventory_item_uuids uuid[],
  p_inventory_locations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inventory_record RECORD;
  v_warehouse_inventory_uuid uuid;
  v_inventory_item RECORD;
  v_location jsonb;
  v_timestamp text;
BEGIN
  -- Generate timestamp
  v_timestamp := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  
  -- Get inventory details
  SELECT * INTO v_inventory_record
  FROM inventory
  WHERE uuid = p_inventory_uuid;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Inventory not found'
    );
  END IF;

  -- Check if warehouse inventory already exists for this inventory
  SELECT uuid INTO v_warehouse_inventory_uuid
  FROM warehouse_inventory
  WHERE warehouse_uuid = p_warehouse_uuid 
    AND inventory_uuid = p_inventory_uuid;

  -- Create warehouse inventory if it doesn't exist
  IF v_warehouse_inventory_uuid IS NULL THEN
    INSERT INTO warehouse_inventory (
      company_uuid,
      admin_uuid,
      warehouse_uuid,
      inventory_uuid,
      name,
      description,
      measurement_unit,
      standard_unit,
      status,
      status_history
    ) VALUES (
      v_inventory_record.company_uuid,
      v_inventory_record.admin_uuid,
      p_warehouse_uuid,
      p_inventory_uuid,
      v_inventory_record.name,
      v_inventory_record.description,
      v_inventory_record.measurement_unit,
      v_inventory_record.standard_unit,
      'AVAILABLE',
      jsonb_build_object(v_timestamp, 'Created from delivery')
    )
    RETURNING uuid INTO v_warehouse_inventory_uuid;
  END IF;

  -- Create warehouse inventory items for each delivered item
  FOR v_inventory_item IN 
    SELECT * FROM inventory_items 
    WHERE uuid = ANY(p_inventory_item_uuids)
  LOOP
    -- Get the location for this item from inventory_locations
    v_location := p_inventory_locations->v_inventory_item.uuid::text;
    
    INSERT INTO warehouse_inventory_items (
      company_uuid,
      admin_uuid,
      warehouse_uuid,
      inventory_uuid,
      delivery_uuid,
      group_id,
      item_code,
      unit,
      unit_value,
      packaging_unit,
      cost,
      properties,
      location,
      status,
      status_history
    ) VALUES (
      v_inventory_item.company_uuid,
      v_inventory_record.admin_uuid,
      p_warehouse_uuid,
      p_inventory_uuid,
      p_delivery_uuid,
      v_inventory_item.group_id,
      v_inventory_item.item_code,
      v_inventory_item.unit,
      v_inventory_item.unit_value::text,
      v_inventory_item.packaging_unit,
      v_inventory_item.cost,
      v_inventory_item.properties,
      COALESCE(v_location, '{}'::jsonb),
      'AVAILABLE',
      jsonb_build_object(v_timestamp, 'Created from delivery ' || p_delivery_uuid::text)
    );
  END LOOP;

  -- Update warehouse inventory aggregations
  PERFORM update_warehouse_inventory_aggregations(v_warehouse_inventory_uuid);

  RETURN jsonb_build_object(
    'success', true,
    'warehouse_inventory_uuid', v_warehouse_inventory_uuid
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;

-- RPC function to get delivery details with related information
CREATE OR REPLACE FUNCTION public.get_delivery_details(
  p_delivery_uuid uuid,
  p_company_uuid uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery_record RECORD;
  v_inventory_items jsonb;
  v_warehouse_info jsonb;
  v_operator_info jsonb;
  v_result jsonb;
  v_inventory_item_uuids uuid[];
BEGIN
  -- Get the delivery record with related inventory name
  SELECT 
    di.*,
    inv.name as inventory_name,
    inv.description as inventory_description,
    inv.measurement_unit,
    inv.standard_unit
  INTO v_delivery_record
  FROM delivery_items di
  LEFT JOIN inventory inv ON di.inventory_uuid = inv.uuid
  WHERE di.uuid = p_delivery_uuid
    AND (p_company_uuid IS NULL OR di.company_uuid = p_company_uuid);
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Delivery not found'
    );
  END IF;

  -- Extract inventory item UUIDs from the locations object keys
  SELECT array_agg(key::uuid) INTO v_inventory_item_uuids
  FROM jsonb_object_keys(v_delivery_record.inventory_locations) AS key
  WHERE key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  -- Get inventory items details if they exist
  IF v_inventory_item_uuids IS NOT NULL AND array_length(v_inventory_item_uuids, 1) > 0 THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'uuid', ii.uuid,
        'item_code', ii.item_code,
        'unit', ii.unit,
        'unit_value', ii.unit_value,
        'packaging_unit', ii.packaging_unit,
        'cost', ii.cost,
        'status', ii.status,
        'properties', ii.properties,
        'group_id', ii.group_id,
        'location', v_delivery_record.inventory_locations->ii.uuid::text
      )
    ) INTO v_inventory_items
    FROM inventory_items ii
    WHERE ii.uuid = ANY(v_inventory_item_uuids);
  ELSE
    v_inventory_items := '[]'::jsonb;
  END IF;

  -- Get warehouse information
  SELECT jsonb_build_object(
    'uuid', w.uuid,
    'name', w.name,
    'address', w.address,
    'layout', w.layout
  ) INTO v_warehouse_info
  FROM warehouses w
  WHERE w.uuid = v_delivery_record.warehouse_uuid;

  -- Get operator information if they exist
  IF v_delivery_record.operator_uuids IS NOT NULL AND array_length(v_delivery_record.operator_uuids, 1) > 0 THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'uuid', p.uuid,
        'full_name', p.full_name,
        'email', p.email,
        'name', p.name
      )
    ) INTO v_operator_info
    FROM profiles p
    WHERE p.uuid = ANY(v_delivery_record.operator_uuids);
  ELSE
    v_operator_info := '[]'::jsonb;
  END IF;

  -- Build the complete result
  v_result := jsonb_build_object(
    'uuid', v_delivery_record.uuid,
    'admin_uuid', v_delivery_record.admin_uuid,
    'company_uuid', v_delivery_record.company_uuid,
    'inventory_uuid', v_delivery_record.inventory_uuid,
    'warehouse_uuid', v_delivery_record.warehouse_uuid,
    'inventory_locations', v_delivery_record.inventory_locations,
    'name', v_delivery_record.name,
    'delivery_address', v_delivery_record.delivery_address,
    'delivery_date', v_delivery_record.delivery_date,
    'operator_uuids', v_delivery_record.operator_uuids,
    'notes', v_delivery_record.notes,
    'status', v_delivery_record.status,
    'status_history', v_delivery_record.status_history,
    'created_at', v_delivery_record.created_at,
    'updated_at', v_delivery_record.updated_at,
    'inventory_name', v_delivery_record.inventory_name,
    'inventory_description', v_delivery_record.inventory_description,
    'measurement_unit', v_delivery_record.measurement_unit,
    'standard_unit', v_delivery_record.standard_unit,
    'inventory_items', v_inventory_items,
    'warehouse_info', v_warehouse_info,
    'operator_info', v_operator_info
  );

  RETURN jsonb_build_object(
    'success', true,
    'data', v_result
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_detail', SQLSTATE
    );
END;
$function$;

-- Update the existing filtered function to work with new structure
CREATE OR REPLACE FUNCTION public.get_delivery_filtered(
  p_company_uuid uuid DEFAULT NULL::uuid, 
  p_search text DEFAULT ''::text, 
  p_status text DEFAULT NULL::text, 
  p_warehouse_uuid uuid DEFAULT NULL::uuid, 
  p_operator_uuids uuid[] DEFAULT NULL::uuid[], 
  p_inventory_uuid uuid DEFAULT NULL::uuid, 
  p_date_from date DEFAULT NULL::date, 
  p_date_to date DEFAULT NULL::date, 
  p_year integer DEFAULT NULL::integer, 
  p_month integer DEFAULT NULL::integer, 
  p_week integer DEFAULT NULL::integer, 
  p_day integer DEFAULT NULL::integer, 
  p_limit integer DEFAULT 10, 
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  uuid uuid, 
  admin_uuid uuid, 
  company_uuid uuid, 
  inventory_uuid uuid, 
  warehouse_uuid uuid, 
  name text, 
  delivery_address text, 
  delivery_date date, 
  status text, 
  operator_uuids uuid[], 
  inventory_locations jsonb,
  warehouse_name text,
  inventory_name text,
  inventory_items_count integer,
  created_at timestamp with time zone, 
  updated_at timestamp with time zone, 
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  total_rows BIGINT;
BEGIN
  -- First get the total count
  SELECT COUNT(*) INTO total_rows
  FROM delivery_items di
  LEFT JOIN inventory inv ON di.inventory_uuid = inv.uuid
  LEFT JOIN warehouses w ON di.warehouse_uuid = w.uuid
  WHERE 
    -- Company filter
    (p_company_uuid IS NULL OR di.company_uuid = p_company_uuid)
    
    -- Status filter
    AND (p_status IS NULL OR di.status = p_status)
    
    -- Warehouse filter
    AND (p_warehouse_uuid IS NULL OR di.warehouse_uuid = p_warehouse_uuid)
    
    -- Operators filter (check if any of the provided operator UUIDs exist in the array)
    AND (p_operator_uuids IS NULL OR di.operator_uuids && p_operator_uuids)
    
    -- Inventory UUID filter
    AND (p_inventory_uuid IS NULL OR di.inventory_uuid = p_inventory_uuid)
    
    -- Date range filter
    AND (p_date_from IS NULL OR di.delivery_date >= p_date_from)
    AND (p_date_to IS NULL OR di.delivery_date <= p_date_to)
    
    -- Year filter
    AND (p_year IS NULL OR EXTRACT(YEAR FROM di.delivery_date) = p_year)
    
    -- Month filter
    AND (p_month IS NULL OR EXTRACT(MONTH FROM di.delivery_date) = p_month)
    
    -- Week filter
    AND (p_week IS NULL OR EXTRACT(WEEK FROM di.delivery_date) = p_week)
    
    -- Day filter
    AND (p_day IS NULL OR EXTRACT(DAY FROM di.delivery_date) = p_day)
    
    -- Comprehensive search across all requested columns
    AND (
      p_search = '' 
      -- Text fields
      OR di.name ILIKE '%' || p_search || '%'
      OR di.status ILIKE '%' || p_search || '%'
      OR di.delivery_address ILIKE '%' || p_search || '%'
      
      -- UUID fields (converted to text)
      OR di.uuid::text ILIKE '%' || p_search || '%'
      OR di.company_uuid::text ILIKE '%' || p_search || '%'
      OR di.admin_uuid::text ILIKE '%' || p_search || '%'
      OR di.warehouse_uuid::text ILIKE '%' || p_search || '%'
      OR di.inventory_uuid::text ILIKE '%' || p_search || '%'
      
      -- Array fields
      OR array_to_string(di.operator_uuids::text[], ',') ILIKE '%' || p_search || '%'
      
      -- Inventory fields
      OR inv.name ILIKE '%' || p_search || '%'
      OR inv.description ILIKE '%' || p_search || '%'
      OR COALESCE(inv.measurement_unit, '') ILIKE '%' || p_search || '%'
      
      -- Warehouse fields
      OR w.name ILIKE '%' || p_search || '%'
      OR w.address->>'fullAddress' ILIKE '%' || p_search || '%'
    );

  -- Return the paginated results with total count
  RETURN QUERY
  SELECT 
    di.uuid,
    di.admin_uuid,
    di.company_uuid,
    di.inventory_uuid,
    di.warehouse_uuid,
    di.name,
    di.delivery_address,
    di.delivery_date,
    di.status,
    di.operator_uuids,
    di.inventory_locations,
    w.name as warehouse_name,
    inv.name as inventory_name,
    (SELECT COUNT(*) FROM jsonb_object_keys(di.inventory_locations))::integer as inventory_items_count,
    di.created_at,
    di.updated_at,
    total_rows as total_count
  FROM delivery_items di
  LEFT JOIN inventory inv ON di.inventory_uuid = inv.uuid
  LEFT JOIN warehouses w ON di.warehouse_uuid = w.uuid
  WHERE 
    -- Company filter
    (p_company_uuid IS NULL OR di.company_uuid = p_company_uuid)
    
    -- Status filter
    AND (p_status IS NULL OR di.status = p_status)
    
    -- Warehouse filter
    AND (p_warehouse_uuid IS NULL OR di.warehouse_uuid = p_warehouse_uuid)
    
    -- Operators filter (check if any of the provided operator UUIDs exist in the array)
    AND (p_operator_uuids IS NULL OR di.operator_uuids && p_operator_uuids)
    
    -- Inventory UUID filter
    AND (p_inventory_uuid IS NULL OR di.inventory_uuid = p_inventory_uuid)
    
    -- Date range filter
    AND (p_date_from IS NULL OR di.delivery_date >= p_date_from)
    AND (p_date_to IS NULL OR di.delivery_date <= p_date_to)
    
    -- Year filter
    AND (p_year IS NULL OR EXTRACT(YEAR FROM di.delivery_date) = p_year)
    
    -- Month filter
    AND (p_month IS NULL OR EXTRACT(MONTH FROM di.delivery_date) = p_month)
    
    -- Week filter
    AND (p_week IS NULL OR EXTRACT(WEEK FROM di.delivery_date) = p_week)
    
    -- Day filter
    AND (p_day IS NULL OR EXTRACT(DAY FROM di.delivery_date) = p_day)
    
    -- Comprehensive search across all requested columns
    AND (
      p_search = '' 
      -- Text fields
      OR di.name ILIKE '%' || p_search || '%'
      OR di.status ILIKE '%' || p_search || '%'
      OR di.delivery_address ILIKE '%' || p_search || '%'
      
      -- UUID fields (converted to text)
      OR di.uuid::text ILIKE '%' || p_search || '%'
      OR di.company_uuid::text ILIKE '%' || p_search || '%'
      OR di.admin_uuid::text ILIKE '%' || p_search || '%'
      OR di.warehouse_uuid::text ILIKE '%' || p_search || '%'
      OR di.inventory_uuid::text ILIKE '%' || p_search || '%'
      
      -- Array fields
      OR array_to_string(di.operator_uuids::text[], ',') ILIKE '%' || p_search || '%'
      
      -- Inventory fields
      OR inv.name ILIKE '%' || p_search || '%'
      OR inv.description ILIKE '%' || p_search || '%'
      OR COALESCE(inv.measurement_unit, '') ILIKE '%' || p_search || '%'
      
      -- Warehouse fields
      OR w.name ILIKE '%' || p_search || '%'
      OR w.address->>'fullAddress' ILIKE '%' || p_search || '%'
    )
  ORDER BY di.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- Create policies for the delivery_items table
CREATE POLICY "delivery_items_select_policy" ON public.delivery_items
FOR SELECT TO authenticated
USING (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "delivery_items_insert_policy" ON public.delivery_items
FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_admin((select auth.uid())) = true
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
);

CREATE POLICY "delivery_items_update_policy" ON public.delivery_items
FOR UPDATE TO authenticated
USING (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND (
    -- Admins can update all delivery items in their company
    public.is_user_admin((select auth.uid())) = true
    OR 
    -- Operators can only update deliveries assigned to them and only change status to DELIVERED
    (
      public.is_user_admin((select auth.uid())) = false
      AND operator_uuids @> ARRAY[auth.uid()]::uuid[]
      AND status = 'IN_TRANSIT'
    )
  )
)
WITH CHECK (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND (
    -- Admins can make any updates
    public.is_user_admin((select auth.uid())) = true
    OR
    -- Operators can only change status to DELIVERED when assigned to the delivery
    (
      public.is_user_admin((select auth.uid())) = false
      AND operator_uuids @> ARRAY[auth.uid()]::uuid[]
      AND status IN ('DELIVERED', 'IN_TRANSIT')
    )
  )
);

CREATE POLICY "delivery_items_delete_policy" ON public.delivery_items
FOR DELETE TO authenticated
USING (
  public.is_user_admin((select auth.uid())) = true
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
);

-- Grant execute permissions to authenticated users for RPC functions
GRANT EXECUTE ON FUNCTION public.create_delivery_with_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_status_with_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_details TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_filtered TO authenticated;