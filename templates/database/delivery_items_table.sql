-- Create delivery_items table
CREATE TABLE IF NOT EXISTS public.delivery_items (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  admin_uuid UUID NOT NULL REFERENCES public.profiles(uuid) ON DELETE SET NULL,
  warehouse_uuid UUID NOT NULL REFERENCES public.warehouses(uuid) ON DELETE SET NULL,
  inventory_items JSONB DEFAULT '{}'::jsonb, -- Key as UUID, value as {inventory_uuid, group_id, location}
  name TEXT,
  delivery_address TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  operator_uuids uuid[],
  notes TEXT,
  
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'IN_TRANSIT', 'DELIVERED', 'CONFIRMED', 'CANCELLED')),
  status_history JSONB DEFAULT (jsonb_build_object(to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'PENDING')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items REPLICA IDENTITY FULL;

CREATE or REPLACE TRIGGER trg_update_status_history_delivery_items
BEFORE UPDATE ON public.delivery_items
FOR EACH ROW
EXECUTE FUNCTION update_status_history();


-- Updated function to create delivery with group_id structure (handles items without groups)
CREATE OR REPLACE FUNCTION public.create_delivery_with_items(
  p_admin_uuid uuid,
  p_company_uuid uuid,
  p_warehouse_uuid uuid,
  p_inventory_items jsonb, -- Key as UUID, value as {inventory_uuid, group_id, location}
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
  v_item_record jsonb;
  v_result jsonb;
  v_group_ids text[];
  v_inventory_item_uuids uuid[];
  v_item_key text;
BEGIN
  -- Generate timestamp for status history
  v_timestamp := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  
  -- Extract and validate inventory items from the object
  FOR v_item_key IN SELECT jsonb_object_keys(p_inventory_items)
  LOOP
    v_item_record := p_inventory_items->v_item_key;
    
    -- Validate that required fields exist
    IF NOT (v_item_record ? 'inventory_uuid') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid inventory item structure. Missing inventory_uuid'
      );
    END IF;
    
    -- Collect inventory item UUIDs and group IDs (if they exist)
    v_inventory_item_uuids := array_append(v_inventory_item_uuids, v_item_key::uuid);
    
    IF v_item_record ? 'group_id' AND v_item_record->>'group_id' IS NOT NULL AND v_item_record->>'group_id' != '' THEN
      v_group_ids := array_append(v_group_ids, v_item_record->>'group_id');
    END IF;
  END LOOP;
  
  -- Validate that all inventory item UUIDs exist
  IF v_inventory_item_uuids IS NOT NULL AND array_length(v_inventory_item_uuids, 1) > 0 THEN
    PERFORM 1 FROM inventory_items 
    WHERE uuid = ANY(v_inventory_item_uuids)
      AND company_uuid = p_company_uuid;
    
    -- Check if all items exist
    IF (SELECT COUNT(*) FROM inventory_items WHERE uuid = ANY(v_inventory_item_uuids) AND company_uuid = p_company_uuid) 
       != array_length(v_inventory_item_uuids, 1) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'One or more inventory items not found'
      );
    END IF;
  END IF;
  
  -- Create the delivery item
  INSERT INTO delivery_items (
    admin_uuid,
    company_uuid,
    warehouse_uuid,
    inventory_items,
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
    p_warehouse_uuid,
    p_inventory_items,
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
      status = 'ON_DELIVERY'
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

-- Update the update_delivery_with_items function to handle items without groups
CREATE OR REPLACE FUNCTION public.update_delivery_with_items(
  p_delivery_uuid uuid,
  p_inventory_items jsonb,
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
  v_item_record jsonb;
  v_item_key text;
BEGIN
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

  -- For IN_TRANSIT status, only allow inventory_items updates
  IF v_delivery_record.status = 'IN_TRANSIT' THEN
    -- Only update inventory_items and updated_at
    UPDATE delivery_items 
    SET 
      inventory_items = p_inventory_items,
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

  -- Extract new inventory item UUIDs from the new structure
  FOR v_item_key IN SELECT jsonb_object_keys(p_inventory_items)
  LOOP
    v_new_inventory_item_uuids := array_append(v_new_inventory_item_uuids, v_item_key::uuid);
  END LOOP;
  
  -- Extract old inventory item UUIDs from existing structure
  FOR v_item_key IN SELECT jsonb_object_keys(v_delivery_record.inventory_items)
  LOOP
    v_old_inventory_item_uuids := array_append(v_old_inventory_item_uuids, v_item_key::uuid);
  END LOOP;

  -- Handle null arrays
  v_new_inventory_item_uuids := COALESCE(v_new_inventory_item_uuids, ARRAY[]::uuid[]);
  v_old_inventory_item_uuids := COALESCE(v_old_inventory_item_uuids, ARRAY[]::uuid[]);

  -- Find items to add (in new but not in old)
  SELECT array_agg(item_uuid) INTO v_items_to_add
  FROM unnest(v_new_inventory_item_uuids) AS item_uuid
  WHERE item_uuid != ALL(v_old_inventory_item_uuids);

  -- Find items to remove (in old but not in new)
  SELECT array_agg(item_uuid) INTO v_items_to_remove
  FROM unnest(v_old_inventory_item_uuids) AS item_uuid
  WHERE item_uuid != ALL(v_new_inventory_item_uuids);

  -- Handle null arrays
  v_items_to_add := COALESCE(v_items_to_add, ARRAY[]::uuid[]);
  v_items_to_remove := COALESCE(v_items_to_remove, ARRAY[]::uuid[]);

  -- Validate that all new inventory items exist
  IF array_length(v_new_inventory_item_uuids, 1) > 0 THEN
    PERFORM 1 FROM inventory_items 
    WHERE uuid = ANY(v_new_inventory_item_uuids)
      AND company_uuid = v_delivery_record.company_uuid;
    
    -- Check if all items exist
    IF (SELECT COUNT(*) FROM inventory_items WHERE uuid = ANY(v_new_inventory_item_uuids) AND company_uuid = v_delivery_record.company_uuid) 
       != array_length(v_new_inventory_item_uuids, 1) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'One or more inventory items not found'
      );
    END IF;
  END IF;

  -- Update delivery record (for non-IN_TRANSIT status)
  UPDATE delivery_items 
  SET 
    inventory_items = p_inventory_items,
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
      status = 'ON_DELIVERY'
    WHERE uuid = ANY(v_items_to_add)
      AND company_uuid = v_delivery_record.company_uuid;
  END IF;

  -- Remove items: revert status to 'AVAILABLE' (only if they were ON_DELIVERY)
  IF array_length(v_items_to_remove, 1) > 0 THEN
    UPDATE inventory_items 
    SET 
      status = 'AVAILABLE'
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

-- Update the status function to work with inventory item UUIDs
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
  v_item_key text;
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

  -- Extract inventory item UUIDs from the structure
  FOR v_item_key IN SELECT jsonb_object_keys(v_delivery_record.inventory_items)
  LOOP
    v_inventory_item_uuids := array_append(v_inventory_item_uuids, v_item_key::uuid);
  END LOOP;

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
    status = p_status
  WHERE uuid = p_delivery_uuid;

  -- Update inventory item status for each item in the delivery
  IF v_inventory_item_uuids IS NOT NULL AND array_length(v_inventory_item_uuids, 1) > 0 THEN
    UPDATE inventory_items 
    SET 
      status = v_inventory_status
    WHERE uuid = ANY(v_inventory_item_uuids)
      AND company_uuid = v_delivery_record.company_uuid;
  END IF;

  -- If status is DELIVERED, create warehouse inventory items
  IF p_status = 'DELIVERED' THEN
    SELECT public.create_warehouse_inventory_from_delivery(
      v_delivery_record.warehouse_uuid,
      p_delivery_uuid,
      v_inventory_item_uuids,
      v_delivery_record.inventory_items
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
    SELECT ii.* FROM inventory_items ii
    WHERE ii.uuid = ANY(p_item_uuids)
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
      status
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
      'AVAILABLE'
    );
    
    -- Update warehouse inventory aggregations after each item is added
    IF v_warehouse_inventory_uuid IS NOT NULL THEN
      PERFORM update_warehouse_inventory_aggregations(v_warehouse_inventory_uuid);
    END IF;
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


-- Update get_delivery_details to work with inventory item UUIDs
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
  v_item_key text;
BEGIN
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

  -- Extract inventory item UUIDs from the structure
  FOR v_item_key IN SELECT jsonb_object_keys(v_delivery_record.inventory_items)
  LOOP
    v_inventory_item_uuids := array_append(v_inventory_item_uuids, v_item_key::uuid);
  END LOOP;

  -- Get inventory items details if they exist
  IF v_inventory_item_uuids IS NOT NULL AND array_length(v_inventory_item_uuids, 1) > 0 THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'uuid', ii.uuid,
        'inventory_uuid', ii.inventory_uuid,
        'item_code', ii.item_code,
        'unit', ii.unit,
        'unit_value', ii.unit_value,
        'packaging_unit', ii.packaging_unit,
        'cost', ii.cost,
        'status', ii.status,
        'properties', ii.properties,
        'group_id', ii.group_id,
        'location', (
          SELECT v_delivery_record.inventory_items->ii.uuid::text->'location'
        )
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
    'warehouse_uuid', v_delivery_record.warehouse_uuid,
    'inventory_items', v_delivery_record.inventory_items,
    'name', v_delivery_record.name,
    'delivery_address', v_delivery_record.delivery_address,
    'delivery_date', v_delivery_record.delivery_date,
    'operator_uuids', v_delivery_record.operator_uuids,
    'notes', v_delivery_record.notes,
    'status', v_delivery_record.status,
    'status_history', v_delivery_record.status_history,
    'created_at', v_delivery_record.created_at,
    'updated_at', v_delivery_record.updated_at,
    'inventory_items_details', v_inventory_items,
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


-- Update the inventory filtering function for delivery context
CREATE OR REPLACE FUNCTION public.get_inventory_details_for_delivery(
  p_inventory_uuid uuid, 
  p_include_warehouse_items boolean DEFAULT false,
  p_delivery_uuid uuid DEFAULT NULL
)
 RETURNS TABLE(
  uuid uuid, 
  company_uuid uuid, 
  admin_uuid uuid, 
  name text, 
  description text, 
  measurement_unit text,
  standard_unit text,
  unit_values jsonb,
  count jsonb,
  status text, 
  properties jsonb, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone, 
  inventory_items jsonb)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    i.uuid,
    i.company_uuid,
    i.admin_uuid,  
    i.name,
    i.description,
    i.measurement_unit,
    i.standard_unit,
    i.unit_values,
    i.count,
    i.status,
    i.properties,
    i.created_at,
    i.updated_at,
    COALESCE(
      jsonb_agg(
        CASE 
          WHEN ii.uuid IS NOT NULL THEN
            jsonb_build_object(
              'uuid', ii.uuid,
              'company_uuid', ii.company_uuid,
              'inventory_uuid', ii.inventory_uuid,
              'item_code', ii.item_code,
              'unit', ii.unit,
              'unit_value', ii.unit_value,
              'packaging_unit', ii.packaging_unit,
              'cost', ii.cost,
              'properties', ii.properties,
              'group_id', ii.group_id,
              'status', ii.status,
              'status_history', ii.status_history,
              'created_at', ii.created_at,
              'updated_at', ii.updated_at
            )
          ELSE NULL
        END
      ) FILTER (WHERE ii.uuid IS NOT NULL), 
      '[]'::jsonb
    ) AS inventory_items
  FROM inventory i
  LEFT JOIN inventory_items ii ON i.uuid = ii.inventory_uuid
    AND (
      -- Always include if it's for warehouse viewing
      p_include_warehouse_items OR
      -- For delivery context, filter based on status and delivery assignment
      (
        p_delivery_uuid IS NULL OR
        (
          -- Include AVAILABLE items (can be selected)
          ii.status = 'AVAILABLE' OR
          ii.status IS NULL OR
          -- Include items that are already assigned to this specific delivery by checking inventory_items keys
          EXISTS (
            SELECT 1 FROM delivery_items di 
            WHERE di.uuid = p_delivery_uuid 
            AND di.inventory_items ? ii.uuid::text
          )
        )
      )
    )
    -- Exclude IN_WAREHOUSE and USED items from delivery selection (unless viewing warehouse)
    AND (
      p_include_warehouse_items OR 
      (ii.status != 'IN_WAREHOUSE' AND ii.status != 'USED')
    )
    -- Exclude items that are ON_DELIVERY for other deliveries
    AND (
      p_delivery_uuid IS NULL OR
      ii.status != 'ON_DELIVERY' OR
      EXISTS (
        SELECT 1 FROM delivery_items di 
        WHERE di.uuid = p_delivery_uuid 
        AND di.inventory_items ? ii.uuid::text
      )
    )
  WHERE i.uuid = p_inventory_uuid
  GROUP BY 
    i.uuid,
    i.company_uuid,
    i.admin_uuid,
    i.name,
    i.description,
    i.measurement_unit,
    i.standard_unit,
    i.unit_values,
    i.count,
    i.status,
    i.properties,
    i.created_at,
    i.updated_at;
END;
$function$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_inventory_details_for_delivery TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_delivery_with_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_with_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_delivery_status_with_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_details TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_filtered TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_warehouse_inventory_from_delivery TO authenticated;