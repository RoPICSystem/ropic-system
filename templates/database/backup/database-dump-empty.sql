

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."reorder_point_logs" (
    "uuid" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "warehouse_uuid" "uuid" NOT NULL,
    "inventory_uuid" "uuid",
    "warehouse_inventory_uuid" "uuid",
    "current_stock" numeric(10,2) DEFAULT 0 NOT NULL,
    "average_daily_unit_sales" numeric(10,2) DEFAULT 0 NOT NULL,
    "lead_time_days" numeric(10,2) DEFAULT 5 NOT NULL,
    "safety_stock" numeric(10,2) DEFAULT 0 NOT NULL,
    "reorder_point" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'IN_STOCK'::"text" NOT NULL,
    "unit" "text" DEFAULT 'units'::"text" NOT NULL,
    "custom_safety_stock" numeric(10,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "reorder_point_logs_status_check" CHECK (("status" = ANY (ARRAY['IN_STOCK'::"text", 'WARNING'::"text", 'CRITICAL'::"text", 'OUT_OF_STOCK'::"text"])))
);


ALTER TABLE "public"."reorder_point_logs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_reorder_points"() RETURNS SETOF "public"."reorder_point_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."calculate_reorder_points"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_specific_reorder_point"("p_warehouse_inventory_uuid" "uuid") RETURNS SETOF "public"."reorder_point_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."calculate_specific_reorder_point"("p_warehouse_inventory_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_unit"("value" numeric, "from_unit" "text", "to_unit" "text") RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    conversion_factor NUMERIC;
BEGIN
    -- Return original value if units are the same
    IF from_unit = to_unit THEN
        RETURN value;
    END IF;
    
    -- Get conversion factor
    SELECT public.get_unit_conversion_factor(from_unit, to_unit) INTO conversion_factor;
    
    -- Return converted value
    RETURN value * conversion_factor;
END;
$$;


ALTER FUNCTION "public"."convert_unit"("value" numeric, "from_unit" "text", "to_unit" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_delivery_with_items"("p_admin_uuid" "uuid", "p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_inventory_items" "jsonb", "p_delivery_address" "text", "p_delivery_date" "date", "p_operator_uuids" "uuid"[] DEFAULT '{}'::"uuid"[], "p_notes" "text" DEFAULT ''::"text", "p_name" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."create_delivery_with_items"("p_admin_uuid" "uuid", "p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_inventory_items" "jsonb", "p_delivery_address" "text", "p_delivery_date" "date", "p_operator_uuids" "uuid"[], "p_notes" "text", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_warehouse_inventory_from_delivery"("p_warehouse_uuid" "uuid", "p_delivery_uuid" "uuid", "p_group_ids" "text"[], "p_inventory_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inventory_item RECORD;
  v_location jsonb;
  v_timestamp text;
  v_item_record jsonb;
  v_item_key text;
  v_inventory_uuid uuid;
BEGIN
  -- Generate timestamp
  v_timestamp := to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  
  -- Create warehouse inventory items for each delivered group
  FOR v_inventory_item IN 
    SELECT * FROM inventory_items 
    WHERE group_id = ANY(p_group_ids)
  LOOP
    -- Find the location for this group from inventory_items structure
    FOR v_item_key IN SELECT jsonb_object_keys(p_inventory_items)
    LOOP
      v_item_record := p_inventory_items->v_item_key;
      
      -- Check if this record matches our group
      IF v_item_record->>'group_id' = v_inventory_item.group_id THEN
        v_location := v_item_record->'location';
        v_inventory_uuid := (v_item_record->>'inventory_uuid')::uuid;
        EXIT; -- Found the matching record
      END IF;
    END LOOP;
    
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
      v_inventory_item.company_uuid,
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
$$;


ALTER FUNCTION "public"."create_warehouse_inventory_from_delivery"("p_warehouse_uuid" "uuid", "p_delivery_uuid" "uuid", "p_group_ids" "text"[], "p_inventory_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_warehouse_inventory_from_delivery"("p_warehouse_uuid" "uuid", "p_delivery_uuid" "uuid", "p_item_uuids" "uuid"[], "p_inventory_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."create_warehouse_inventory_from_delivery"("p_warehouse_uuid" "uuid", "p_delivery_uuid" "uuid", "p_item_uuids" "uuid"[], "p_inventory_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."general_search"("p_search_query" "text" DEFAULT ''::"text", "p_entity_type" "text" DEFAULT NULL::"text", "p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("entity_type" "text", "entity_uuid" "uuid", "entity_name" "text", "entity_description" "text", "entity_status" "text", "matched_property" "text", "matched_value" "text", "entity_data" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."general_search"("p_search_query" "text", "p_entity_type" "text", "p_company_uuid" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_address_dropdown_data"("target_reg_code" "text" DEFAULT NULL::"text", "target_prov_code" "text" DEFAULT NULL::"text", "target_citymun_code" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'regions', (
      SELECT json_agg(
        json_build_object(
          'reg_code', "reg_code"::text,
          'reg_desc', "reg_desc"
        ) ORDER BY "reg_desc"
      )
      FROM address_region
    ),
    'provinces', (
      CASE 
        WHEN target_reg_code IS NOT NULL THEN (
          SELECT json_agg(
            json_build_object(
              'reg_code', "reg_code"::text,
              'prov_code', "prov_code"::text, 
              'prov_desc', "prov_desc"
            ) ORDER BY "prov_desc"
          )
          FROM address_province
          WHERE "reg_code"::text = target_reg_code
        )
        ELSE '[]'::json
      END
    ),
    'cities', (
      CASE 
        WHEN target_prov_code IS NOT NULL THEN (
          SELECT json_agg(
            json_build_object(
              'reg_code', "reg_code"::text,
              'prov_code', "prov_code"::text,
              'citymun_code', "citymun_code"::text,
              'citymun_desc', "citymun_desc"
            ) ORDER BY "citymun_desc"
          )
          FROM address_citymun
          WHERE "prov_code"::text = target_prov_code
        )
        ELSE '[]'::json
      END
    ),
    'barangays', (
      CASE 
        WHEN target_citymun_code IS NOT NULL THEN (
          SELECT json_agg(
            json_build_object(
              'reg_code', "reg_code"::text,
              'prov_code', "prov_code"::text,
              'citymun_code', "citymun_code"::text,
              'brgy_code', "brgy_code"::text,
              'brgy_desc', UPPER("brgy_desc")
            ) ORDER BY "brgy_desc"
          )
          FROM address_brgy
          WHERE "citymun_code"::text = target_citymun_code
        )
        ELSE '[]'::json
      END
    )
  ) INTO result;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_address_dropdown_data"("target_reg_code" "text", "target_prov_code" "text", "target_citymun_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_complete_address_data"("citymun_code" "text") RETURNS json
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'region', json_build_object('reg_code', r."reg_code", 'reg_desc', r."reg_desc"),
    'province', json_build_object('prov_code', p."prov_code", 'prov_desc', p."prov_desc"),
    'cityMunicipality', json_build_object('citymun_code', c."citymun_code", 'citymun_desc', c."citymun_desc"),
    'barangays', (
      SELECT json_agg(json_build_object('brgy_code', b."brgy_code", 'brgy_desc', UPPER(b."brgy_desc")))
      FROM address_brgy b
      WHERE b."citymun_code" = c."citymun_code"
      ORDER BY b."brgy_desc"
    )
  ) INTO result
  FROM address_citymun c
  JOIN address_province p ON c."prov_code" = p."prov_code"
  JOIN address_region r ON p."reg_code" = r."reg_code"
  WHERE c."citymun_code" = citymun_code;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_complete_address_data"("citymun_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_delivery_details"("p_delivery_uuid" "uuid", "p_company_uuid" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_delivery_details"("p_delivery_uuid" "uuid", "p_company_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_delivery_filtered"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT ''::"text", "p_status" "text" DEFAULT NULL::"text", "p_warehouse_uuid" "uuid" DEFAULT NULL::"uuid", "p_operator_uuids" "uuid"[] DEFAULT NULL::"uuid"[], "p_inventory_uuid" "uuid" DEFAULT NULL::"uuid", "p_date_from" "date" DEFAULT NULL::"date", "p_date_to" "date" DEFAULT NULL::"date", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("uuid" "uuid", "admin_uuid" "uuid", "company_uuid" "uuid", "warehouse_uuid" "uuid", "name" "text", "delivery_address" "text", "delivery_date" "date", "status" "text", "operator_uuids" "uuid"[], "inventory_items" "jsonb", "warehouse_name" "text", "inventory_names" "text", "inventory_items_count" integer, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  total_rows BIGINT;
BEGIN
  -- First get the total count
  SELECT COUNT(*) INTO total_rows
  FROM delivery_items di
  LEFT JOIN warehouses w ON di.warehouse_uuid = w.uuid
  WHERE 
    (p_company_uuid IS NULL OR di.company_uuid = p_company_uuid)
    AND (p_status IS NULL OR di.status = p_status)
    AND (p_warehouse_uuid IS NULL OR di.warehouse_uuid = p_warehouse_uuid)
    
    -- Operators filter (check if any of the provided operator UUIDs exist in the array)
    AND (p_operator_uuids IS NULL OR di.operator_uuids && p_operator_uuids)
    
    -- Inventory UUID filter (check if any inventory item matches)
    AND (p_inventory_uuid IS NULL OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(di.inventory_items) k
      WHERE (di.inventory_items->k->>'inventory_uuid')::uuid = p_inventory_uuid
    ))
    
    -- Date filter
    AND (p_date_from IS NULL OR di.delivery_date >= p_date_from)
    AND (p_date_to IS NULL OR di.delivery_date <= p_date_to)
    AND (p_year IS NULL OR EXTRACT(YEAR FROM di.delivery_date) = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM di.delivery_date) = p_month)
    AND (p_week IS NULL OR EXTRACT(WEEK FROM di.delivery_date) = p_week)
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
      
      -- Array fields
      OR array_to_string(di.operator_uuids::text[], ',') ILIKE '%' || p_search || '%'
      
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
    di.warehouse_uuid,
    di.name,
    di.delivery_address,
    di.delivery_date,
    di.status,
    di.operator_uuids,
    di.inventory_items,
    w.name as warehouse_name,
    (
      SELECT string_agg(DISTINCT inv.name, ', ')
      FROM jsonb_object_keys(di.inventory_items) k
      JOIN inventory inv ON inv.uuid = (di.inventory_items->k->>'inventory_uuid')::uuid
    ) as inventory_names,
    (SELECT COUNT(*) FROM jsonb_object_keys(di.inventory_items))::integer as inventory_items_count,
    di.created_at,
    di.updated_at,
    total_rows as total_count
  FROM delivery_items di
  LEFT JOIN warehouses w ON di.warehouse_uuid = w.uuid
  WHERE 
    (p_company_uuid IS NULL OR di.company_uuid = p_company_uuid)
    AND (p_status IS NULL OR di.status = p_status)
    AND (p_warehouse_uuid IS NULL OR di.warehouse_uuid = p_warehouse_uuid)
    AND (p_operator_uuids IS NULL OR di.operator_uuids && p_operator_uuids)
    AND (p_inventory_uuid IS NULL OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(di.inventory_items) k
      WHERE (di.inventory_items->k->>'inventory_uuid')::uuid = p_inventory_uuid
    ))
    AND (p_date_from IS NULL OR di.delivery_date >= p_date_from)
    AND (p_date_to IS NULL OR di.delivery_date <= p_date_to)
    AND (p_year IS NULL OR EXTRACT(YEAR FROM di.delivery_date) = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM di.delivery_date) = p_month)
    AND (p_week IS NULL OR EXTRACT(WEEK FROM di.delivery_date) = p_week)
    AND (p_day IS NULL OR EXTRACT(DAY FROM di.delivery_date) = p_day)
    AND (
      p_search = '' 
      OR di.name ILIKE '%' || p_search || '%'
      OR di.status ILIKE '%' || p_search || '%'
      OR di.delivery_address ILIKE '%' || p_search || '%'
      OR di.uuid::text ILIKE '%' || p_search || '%'
      OR di.company_uuid::text ILIKE '%' || p_search || '%'
      OR di.admin_uuid::text ILIKE '%' || p_search || '%'
      OR di.warehouse_uuid::text ILIKE '%' || p_search || '%'
      OR array_to_string(di.operator_uuids::text[], ',') ILIKE '%' || p_search || '%'
      OR w.name ILIKE '%' || p_search || '%'
      OR w.address->>'fullAddress' ILIKE '%' || p_search || '%'
    )
  ORDER BY di.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_delivery_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_warehouse_uuid" "uuid", "p_operator_uuids" "uuid"[], "p_inventory_uuid" "uuid", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inventory_details"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean DEFAULT false) RETURNS TABLE("uuid" "uuid", "company_uuid" "uuid", "admin_uuid" "uuid", "name" "text", "description" "text", "measurement_unit" "text", "standard_unit" "text", "unit_values" "jsonb", "count" "jsonb", "status" "text", "properties" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "inventory_items" "jsonb")
    LANGUAGE "plpgsql"
    AS $$
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
    ) AS inventory
  FROM inventory i
  LEFT JOIN inventory_items ii ON i.uuid = ii.inventory_uuid
    AND (p_include_warehouse_items OR ii.status != 'IN_WAREHOUSE' OR ii.status != 'USED' OR ii.status IS NULL)
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
$$;


ALTER FUNCTION "public"."get_inventory_details"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inventory_details_for_delivery"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean DEFAULT false, "p_delivery_uuid" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("uuid" "uuid", "company_uuid" "uuid", "admin_uuid" "uuid", "name" "text", "description" "text", "measurement_unit" "text", "standard_unit" "text", "unit_values" "jsonb", "count" "jsonb", "status" "text", "properties" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "inventory_items" "jsonb")
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."get_inventory_details_for_delivery"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean, "p_delivery_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inventory_filtered"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT ''::"text", "p_status" "text" DEFAULT NULL::"text", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 100, "p_offset" integer DEFAULT 0) RETURNS TABLE("uuid" "uuid", "company_uuid" "uuid", "admin_uuid" "uuid", "name" "text", "description" "text", "measurement_unit" "text", "standard_unit" "text", "unit_values" "jsonb", "count" "jsonb", "inventory_items_length" integer, "status" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_search_pattern TEXT;
BEGIN
  -- Prepare search pattern once for better performance
  v_search_pattern := '%' || COALESCE(p_search, '') || '%';
  
  RETURN QUERY
  WITH filtered_inventory AS (
    SELECT i.*
    FROM inventory i
    WHERE 
      -- Company filter
      (p_company_uuid IS NULL OR i.company_uuid = p_company_uuid)
      
      -- Status filter
      AND (p_status IS NULL OR i.status = p_status)

      -- Date filters for created_at (timestamp type)
      AND (p_year IS NULL OR EXTRACT(YEAR FROM i.created_at) = p_year)
      AND (p_month IS NULL OR EXTRACT(MONTH FROM i.created_at) = p_month)
      AND (p_week IS NULL OR EXTRACT(WEEK FROM i.created_at) = p_week)
      AND (p_day IS NULL OR EXTRACT(DAY FROM i.created_at) = p_day)
      
      -- Text search across multiple columns
      AND (
        p_search = '' 
        OR p_search IS NULL
        OR i.uuid::TEXT ILIKE v_search_pattern
        OR i.company_uuid::TEXT ILIKE v_search_pattern
        OR i.admin_uuid::TEXT ILIKE v_search_pattern
        OR COALESCE(i.status, '') ILIKE v_search_pattern
        OR i.name ILIKE v_search_pattern
        OR COALESCE(i.description, '') ILIKE v_search_pattern
        OR EXISTS (
          SELECT 1 
          FROM inventory_items b 
          WHERE b.inventory_uuid = i.uuid 
          AND b.uuid::TEXT ILIKE v_search_pattern
        )
      )
  )
  SELECT 
    fi.uuid,
    fi.company_uuid,
    fi.admin_uuid,
    fi.name,
    fi.description,
    fi.measurement_unit,
    fi.standard_unit,
    fi.unit_values,
    fi.count,
    (fi.count->>'total')::INT AS inventory_items_length,
    fi.status,
    fi.created_at,
    fi.updated_at,
    (SELECT COUNT(*) FROM filtered_inventory)::BIGINT
  FROM 
    filtered_inventory fi
  ORDER BY fi.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_inventory_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reorder_point_logs_filtered"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_warehouse_uuid" "uuid" DEFAULT NULL::"uuid", "p_status" "text" DEFAULT NULL::"text", "p_search" "text" DEFAULT ''::"text", "p_date_from" "date" DEFAULT NULL::"date", "p_date_to" "date" DEFAULT NULL::"date", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 100, "p_offset" integer DEFAULT 0) RETURNS TABLE("uuid" "uuid", "company_uuid" "uuid", "warehouse_uuid" "uuid", "inventory_uuid" "uuid", "warehouse_inventory_uuid" "uuid", "current_stock" numeric, "average_daily_unit_sales" numeric, "lead_time_days" numeric, "safety_stock" numeric, "reorder_point" numeric, "status" "text", "unit" "text", "custom_safety_stock" numeric, "notes" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "warehouse_name" "text", "inventory_name" "text", "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_reorder_point_logs_filtered"("p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_status" "text", "p_search" "text", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unit_conversion_factor"("from_unit" "text", "to_unit" "text") RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Mass conversions (to kg as base)
    CASE 
        WHEN from_unit = 'kg' AND to_unit = 'g' THEN RETURN 1000;
        WHEN from_unit = 'g' AND to_unit = 'kg' THEN RETURN 0.001;
        WHEN from_unit = 'mg' AND to_unit = 'kg' THEN RETURN 0.000001;
        WHEN from_unit = 'kg' AND to_unit = 'mg' THEN RETURN 1000000;
        WHEN from_unit = 'g' AND to_unit = 'mg' THEN RETURN 1000;
        WHEN from_unit = 'mg' AND to_unit = 'g' THEN RETURN 0.001;
        WHEN from_unit = 'tonne' AND to_unit = 'kg' THEN RETURN 1000;
        WHEN from_unit = 'kg' AND to_unit = 'tonne' THEN RETURN 0.001;
        WHEN from_unit = 'lb' AND to_unit = 'kg' THEN RETURN 0.453592;
        WHEN from_unit = 'kg' AND to_unit = 'lb' THEN RETURN 2.20462;
        WHEN from_unit = 'oz' AND to_unit = 'kg' THEN RETURN 0.0283495;
        WHEN from_unit = 'kg' AND to_unit = 'oz' THEN RETURN 35.274;
        
        -- Length conversions (to m as base)
        WHEN from_unit = 'm' AND to_unit = 'cm' THEN RETURN 100;
        WHEN from_unit = 'cm' AND to_unit = 'm' THEN RETURN 0.01;
        WHEN from_unit = 'mm' AND to_unit = 'm' THEN RETURN 0.001;
        WHEN from_unit = 'm' AND to_unit = 'mm' THEN RETURN 1000;
        WHEN from_unit = 'km' AND to_unit = 'm' THEN RETURN 1000;
        WHEN from_unit = 'm' AND to_unit = 'km' THEN RETURN 0.001;
        WHEN from_unit = 'ft' AND to_unit = 'm' THEN RETURN 0.3048;
        WHEN from_unit = 'm' AND to_unit = 'ft' THEN RETURN 3.28084;
        WHEN from_unit = 'in' AND to_unit = 'm' THEN RETURN 0.0254;
        WHEN from_unit = 'm' AND to_unit = 'in' THEN RETURN 39.3701;
        WHEN from_unit = 'yd' AND to_unit = 'm' THEN RETURN 0.9144;
        WHEN from_unit = 'm' AND to_unit = 'yd' THEN RETURN 1.09361;
        WHEN from_unit = 'mi' AND to_unit = 'm' THEN RETURN 1609.34;
        WHEN from_unit = 'm' AND to_unit = 'mi' THEN RETURN 0.000621371;
        
        -- Volume conversions (to l as base)
        WHEN from_unit = 'l' AND to_unit = 'ml' THEN RETURN 1000;
        WHEN from_unit = 'ml' AND to_unit = 'l' THEN RETURN 0.001;
        WHEN from_unit = 'm3' AND to_unit = 'l' THEN RETURN 1000;
        WHEN from_unit = 'l' AND to_unit = 'm3' THEN RETURN 0.001;
        WHEN from_unit = 'cm3' AND to_unit = 'l' THEN RETURN 0.001;
        WHEN from_unit = 'l' AND to_unit = 'cm3' THEN RETURN 1000;
        WHEN from_unit = 'ft3' AND to_unit = 'l' THEN RETURN 28.3168;
        WHEN from_unit = 'l' AND to_unit = 'ft3' THEN RETURN 0.0353147;
        WHEN from_unit = 'in3' AND to_unit = 'l' THEN RETURN 0.0163871;
        WHEN from_unit = 'l' AND to_unit = 'in3' THEN RETURN 61.0237;
        
        -- Area conversions (to m2 as base)
        WHEN from_unit = 'm2' AND to_unit = 'cm2' THEN RETURN 10000;
        WHEN from_unit = 'cm2' AND to_unit = 'm2' THEN RETURN 0.0001;
        WHEN from_unit = 'mm2' AND to_unit = 'm2' THEN RETURN 0.000001;
        WHEN from_unit = 'm2' AND to_unit = 'mm2' THEN RETURN 1000000;
        WHEN from_unit = 'km2' AND to_unit = 'm2' THEN RETURN 1000000;
        WHEN from_unit = 'm2' AND to_unit = 'km2' THEN RETURN 0.000001;
        WHEN from_unit = 'ft2' AND to_unit = 'm2' THEN RETURN 0.092903;
        WHEN from_unit = 'm2' AND to_unit = 'ft2' THEN RETURN 10.7639;
        WHEN from_unit = 'in2' AND to_unit = 'm2' THEN RETURN 0.00064516;
        WHEN from_unit = 'm2' AND to_unit = 'in2' THEN RETURN 1550;
        
        -- Count conversions (to pcs as base)
        WHEN from_unit = 'pcs' AND to_unit = 'items' THEN RETURN 1;
        WHEN from_unit = 'items' AND to_unit = 'pcs' THEN RETURN 1;
        WHEN from_unit = 'units' AND to_unit = 'pcs' THEN RETURN 1;
        WHEN from_unit = 'pcs' AND to_unit = 'units' THEN RETURN 1;
        WHEN from_unit = 'dozen' AND to_unit = 'pcs' THEN RETURN 12;
        WHEN from_unit = 'pcs' AND to_unit = 'dozen' THEN RETURN 0.0833333;
        WHEN from_unit = 'gross' AND to_unit = 'pcs' THEN RETURN 144;
        WHEN from_unit = 'pcs' AND to_unit = 'gross' THEN RETURN 0.00694444;
        
        ELSE RETURN 1; -- Default case, no conversion
    END CASE;
END;
$$;


ALTER FUNCTION "public"."get_unit_conversion_factor"("from_unit" "text", "to_unit" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "logo_image" "text",
    "address" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "company_layout" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_company"("user_id" "uuid") RETURNS SETOF "public"."companies"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
 SELECT c.*
  FROM companies c
  JOIN profiles p ON p.company_uuid = c.uuid
  WHERE p.uuid = user_id
  OR EXISTS (
    SELECT 1
    FROM profiles admin_profile
    WHERE admin_profile.uuid = user_id
    AND admin_profile.company_uuid = c.uuid
    AND admin_profile.is_admin = true
  )
  ORDER BY c.name;
$$;


ALTER FUNCTION "public"."get_user_company"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_company_uuid"("user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  company_id uuid;
begin
  select company_uuid into company_id 
  from profiles 
  where uuid = user_id;
  return company_id;
end;
$$;


ALTER FUNCTION "public"."get_user_company_uuid"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_warehouse_inventory_delivery_history"("p_warehouse_inventory_uuid" "uuid") RETURNS TABLE("delivery_uuid" "uuid", "delivery_name" "text", "delivery_address" "text", "delivery_date" "date", "delivery_status" "text", "items_count" bigint, "total_cost" numeric, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_warehouse_inventory_delivery_history"("p_warehouse_inventory_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_warehouse_inventory_details"("p_warehouse_inventory_uuid" "uuid") RETURNS TABLE("uuid" "uuid", "company_uuid" "uuid", "admin_uuid" "uuid", "warehouse_uuid" "uuid", "inventory_uuid" "uuid", "name" "text", "description" "text", "measurement_unit" "text", "standard_unit" "text", "unit_values" "jsonb", "count" "jsonb", "properties" "jsonb", "status" "text", "warehouse_info" "jsonb", "inventory_info" "jsonb", "delivery_info" "jsonb", "items" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
          'delivery_date', di.delivery_date,
          'status', di.status,
          'delivery_address', di.delivery_address
        )
      ) FILTER (WHERE di.uuid IS NOT NULL),
      '[]'::jsonb
    ) as delivery_info,
    COALESCE(
      jsonb_agg(
        DISTINCT jsonb_build_object(
          'uuid', wii.uuid,
          'item_code', wii.item_code,
          'unit', wii.unit,
          'unit_value', wii.unit_value,
          'packaging_unit', wii.packaging_unit,
          'cost', wii.cost,
          'location', wii.location,
          'group_id', wii.group_id,
          'status', wii.status,
          'created_at', wii.created_at
        )
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
  WHERE wi.uuid = p_warehouse_inventory_uuid
  GROUP BY 
    wi.uuid, wi.company_uuid, wi.admin_uuid, wi.warehouse_uuid, wi.inventory_uuid,
    wi.name, wi.description, wi.measurement_unit, wi.standard_unit,
    wi.unit_values, wi.count, wi.properties, wi.status, wi.created_at, wi.updated_at,
    w.uuid, w.name, w.address, inv.uuid, inv.name, inv.description;
END;
$$;


ALTER FUNCTION "public"."get_warehouse_inventory_details"("p_warehouse_inventory_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_warehouse_inventory_filtered"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT ''::"text", "p_warehouse_uuid" "uuid" DEFAULT NULL::"uuid", "p_status" "text" DEFAULT NULL::"text", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 100, "p_offset" integer DEFAULT 0) RETURNS TABLE("uuid" "uuid", "company_uuid" "uuid", "admin_uuid" "uuid", "warehouse_uuid" "uuid", "inventory_uuid" "uuid", "name" "text", "description" "text", "measurement_unit" "text", "standard_unit" "text", "unit_values" "jsonb", "count" "jsonb", "status" "text", "warehouse_name" "text", "inventory_name" "text", "items_count" integer, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_warehouse_inventory_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_warehouse_uuid" "uuid", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_warehouse_items_by_delivery"("p_delivery_uuid" "uuid", "p_company_uuid" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("uuid" "uuid", "warehouse_uuid" "uuid", "inventory_uuid" "uuid", "group_id" "text", "item_code" "text", "unit" "text", "unit_value" "text", "packaging_unit" "text", "cost" numeric, "location" "jsonb", "status" "text", "warehouse_name" "text", "inventory_name" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_warehouse_items_by_delivery"("p_delivery_uuid" "uuid", "p_company_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_warehouse_items_by_reorder_point_logs"("p_reorder_point_log_uuids" "uuid"[] DEFAULT NULL::"uuid"[], "p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 100, "p_offset" integer DEFAULT 0) RETURNS TABLE("reorder_point_log_uuid" "uuid", "warehouse_uuid" "uuid", "warehouse_name" "text", "inventory_uuid" "uuid", "inventory_name" "text", "warehouse_inventory_uuid" "uuid", "deliveries" "jsonb", "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_warehouse_items_by_reorder_point_logs"("p_reorder_point_log_uuids" "uuid"[], "p_company_uuid" "uuid", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_warehouses_filtered"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT ''::"text", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 100, "p_offset" integer DEFAULT 0) RETURNS TABLE("uuid" "uuid", "company_uuid" "uuid", "name" "text", "address" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "floors_count" integer, "rows_count" integer, "columns_count" integer, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$DECLARE
v_search_pattern TEXT;
BEGIN
v_search_pattern := '%' || COALESCE(p_search, '') || '%';
  RETURN QUERY
  WITH filtered_warehouses AS (
    SELECT w.*
    FROM warehouses w
    WHERE
      -- Company filter if provided
      (p_company_uuid IS NULL OR w.company_uuid = p_company_uuid)
      
      -- Date filters for created_at (timestamp type)
      AND (p_year IS NULL OR EXTRACT(YEAR FROM w.created_at) = p_year)
      AND (p_month IS NULL OR EXTRACT(MONTH FROM w.created_at) = p_month)
      AND (p_week IS NULL OR EXTRACT(WEEK FROM w.created_at) = p_week)
      AND (p_day IS NULL OR EXTRACT(DAY FROM w.created_at) = p_day)
      
      -- Search across all specified columns
      AND (
        p_search = '' 
        OR p_search IS NULL
        OR w.uuid::TEXT ILIKE v_search_pattern
        OR w.company_uuid::TEXT ILIKE v_search_pattern
        OR w.name ILIKE v_search_pattern
        OR w.address->>'fullAddress' ILIKE v_search_pattern
      )
  )
  SELECT 
    fw.uuid, 
    fw.company_uuid, 
    fw.name, 
    fw.address, 
    fw.created_at, 
    fw.updated_at,
    -- Calculate floors count
    COALESCE(array_length(fw.layout, 1), 0)::INTEGER as floors_count,
    -- Calculate rows count from first floor's matrix
    CASE 
      WHEN fw.layout IS NOT NULL AND array_length(fw.layout, 1) > 0 
        AND fw.layout[1] ? 'matrix' 
        AND jsonb_typeof(fw.layout[1]->'matrix') = 'array'
      THEN jsonb_array_length(fw.layout[1]->'matrix')
      ELSE 0
    END::INTEGER as rows_count,
    -- Calculate columns count from first floor's matrix first row
    CASE 
      WHEN fw.layout IS NOT NULL AND array_length(fw.layout, 1) > 0 
        AND fw.layout[1] ? 'matrix' 
        AND jsonb_typeof(fw.layout[1]->'matrix') = 'array'
        AND jsonb_array_length(fw.layout[1]->'matrix') > 0
        AND jsonb_typeof(fw.layout[1]->'matrix'->0) = 'array'
      THEN jsonb_array_length(fw.layout[1]->'matrix'->0)
      ELSE 0
    END::INTEGER as columns_count,
    (SELECT COUNT(*) FROM filtered_warehouses)::BIGINT
  FROM 
    filtered_warehouses fw
  ORDER BY fw.name
  LIMIT p_limit
  OFFSET p_offset;
END;$$;


ALTER FUNCTION "public"."get_warehouses_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_admin"("user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  admin_status boolean;
begin
  select is_admin into admin_status 
  from profiles 
  where uuid = user_id;
  return coalesce(admin_status, false);
end;
$$;


ALTER FUNCTION "public"."is_user_admin"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_warehouse_group_as_used"("p_group_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."mark_warehouse_group_as_used"("p_group_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_warehouse_group_bulk_used"("p_group_id" "text", "p_count" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."mark_warehouse_group_bulk_used"("p_group_id" "text", "p_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_warehouse_item_as_used"("p_item_uuid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."mark_warehouse_item_as_used"("p_item_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_warehouse_items_bulk_used"("p_warehouse_inventory_uuid" "uuid", "p_count" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."mark_warehouse_items_bulk_used"("p_warehouse_inventory_uuid" "uuid", "p_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_all_inventory_aggregations"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    inventory_record RECORD;
    updated_count INTEGER := 0;
BEGIN
    -- Loop through all inventories and recalculate their aggregations
    FOR inventory_record IN 
        SELECT uuid FROM inventory 
    LOOP
        PERFORM update_single_inventory_aggregation(inventory_record.uuid);
        updated_count := updated_count + 1;
    END LOOP;
    
    RETURN updated_count;
END;
$$;


ALTER FUNCTION "public"."recalculate_all_inventory_aggregations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_all_warehouse_inventory_aggregations"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    warehouse_inventory_record RECORD;
    updated_count INTEGER := 0;
BEGIN
    -- Loop through all warehouse inventories and recalculate their aggregations
    FOR warehouse_inventory_record IN 
        SELECT uuid FROM warehouse_inventory 
    LOOP
        PERFORM update_warehouse_inventory_aggregations(warehouse_inventory_record.uuid);
        updated_count := updated_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Recalculated aggregations for % warehouse inventories', updated_count;
    RETURN updated_count;
END;
$$;


ALTER FUNCTION "public"."recalculate_all_warehouse_inventory_aggregations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_example_usage"() RETURNS TABLE("search_type" "text", "example_query" "text", "description" "text")
    LANGUAGE "sql"
    AS $$
SELECT * FROM (VALUES
  ('General Search', 'SELECT * FROM general_search(''laptop'');', 'Search for "laptop" across all entities'),
  ('Entity Specific', 'SELECT * FROM general_search(''AVAILABLE'', ''inventory'');', 'Search for "AVAILABLE" status only in inventory'),
  ('UUID Search', 'SELECT * FROM general_search(''550e8400'');', 'Search by UUID (partial match)'),
  ('Warehouse Search', 'SELECT * FROM general_search(''Main'', ''warehouse'');', 'Search warehouses containing "Main"'),
  ('Delivery Search', 'SELECT * FROM general_search(''PENDING'', ''delivery'');', 'Search deliveries with PENDING status'),
  ('Company Specific', 'SELECT * FROM general_search(''item'', NULL, ''company-uuid-here'');', 'Search within specific company'),
  ('Paginated', 'SELECT * FROM general_search(''test'', NULL, NULL, 10, 20);', 'Get 10 results starting from offset 20')
) AS examples(search_type, example_query, description);
$$;


ALTER FUNCTION "public"."search_example_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_reorder_point_recalculation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  target_warehouse_inventory_uuid UUID;
BEGIN
  -- Determine which warehouse inventory to update based on the operation
  IF TG_OP = 'DELETE' THEN
    -- For DELETE, use OLD values
    SELECT uuid INTO target_warehouse_inventory_uuid
    FROM warehouse_inventory
    WHERE warehouse_uuid = OLD.warehouse_uuid 
      AND inventory_uuid = OLD.inventory_uuid
    LIMIT 1;
  ELSE
    -- For INSERT/UPDATE, use NEW values
    SELECT uuid INTO target_warehouse_inventory_uuid
    FROM warehouse_inventory
    WHERE warehouse_uuid = NEW.warehouse_uuid 
      AND inventory_uuid = NEW.inventory_uuid
    LIMIT 1;
  END IF;
  
  -- Recalculate for the affected warehouse inventory if found
  IF target_warehouse_inventory_uuid IS NOT NULL THEN
    BEGIN
      PERFORM public.calculate_specific_reorder_point(target_warehouse_inventory_uuid);
    EXCEPTION WHEN OTHERS THEN
      -- Log the error but don't fail the main operation
      RAISE WARNING 'Failed to recalculate reorder point for warehouse inventory %: %', target_warehouse_inventory_uuid, SQLERRM;
    END;
  END IF;
  
  -- Return appropriate record based on operation
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


ALTER FUNCTION "public"."trigger_reorder_point_recalculation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_custom_safety_stock"("p_warehouse_inventory_uuid" "uuid", "p_custom_safety_stock" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."reorder_point_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."update_custom_safety_stock"("p_warehouse_inventory_uuid" "uuid", "p_custom_safety_stock" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_delivery_status_with_items"("p_delivery_uuid" "uuid", "p_status" "text", "p_company_uuid" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_delivery_record RECORD;
  v_timestamp text;
  v_inventory_status text;
  v_result jsonb;
  v_inventory_item_uuids uuid[];
  v_warehouse_result jsonb;
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
$$;


ALTER FUNCTION "public"."update_delivery_status_with_items"("p_delivery_uuid" "uuid", "p_status" "text", "p_company_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_delivery_with_items"("p_delivery_uuid" "uuid", "p_inventory_items" "jsonb", "p_delivery_address" "text" DEFAULT NULL::"text", "p_delivery_date" "date" DEFAULT NULL::"date", "p_operator_uuids" "uuid"[] DEFAULT NULL::"uuid"[], "p_notes" "text" DEFAULT NULL::"text", "p_name" "text" DEFAULT NULL::"text", "p_company_uuid" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."update_delivery_with_items"("p_delivery_uuid" "uuid", "p_inventory_items" "jsonb", "p_delivery_address" "text", "p_delivery_date" "date", "p_operator_uuids" "uuid"[], "p_notes" "text", "p_name" "text", "p_company_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_inventory_aggregations"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    target_inventory_uuid UUID;
    inv_record RECORD;
    total_unit_values RECORD;
    total_counts RECORD;
    old_inventory_uuid UUID;
    should_update_old BOOLEAN := FALSE;
    should_update_new BOOLEAN := FALSE;
BEGIN
    -- Determine which inventory UUIDs need updating based on operation type
    IF TG_OP = 'DELETE' THEN
        target_inventory_uuid := OLD.inventory_uuid;
        should_update_old := TRUE;
    ELSIF TG_OP = 'INSERT' THEN
        target_inventory_uuid := NEW.inventory_uuid;
        should_update_new := TRUE;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Check if any of the tracked fields changed
        IF (OLD.status IS DISTINCT FROM NEW.status) OR
           (OLD.unit_value IS DISTINCT FROM NEW.unit_value) OR
           (OLD.unit IS DISTINCT FROM NEW.unit) OR
           (OLD.cost IS DISTINCT FROM NEW.cost) OR
           (OLD.inventory_uuid IS DISTINCT FROM NEW.inventory_uuid) THEN
            
            -- If inventory_uuid changed, update both old and new inventories
            IF OLD.inventory_uuid IS DISTINCT FROM NEW.inventory_uuid THEN
                old_inventory_uuid := OLD.inventory_uuid;
                target_inventory_uuid := NEW.inventory_uuid;
                should_update_old := TRUE;
                should_update_new := TRUE;
            ELSE
                -- Same inventory, just update the current one
                target_inventory_uuid := NEW.inventory_uuid;
                should_update_new := TRUE;
            END IF;
        ELSE
            -- No relevant changes, skip aggregation update
            RETURN NEW;
        END IF;
    END IF;

    -- Function to update aggregations for a specific inventory
    PERFORM update_single_inventory_aggregation(target_inventory_uuid) WHERE should_update_new;
    PERFORM update_single_inventory_aggregation(old_inventory_uuid) WHERE should_update_old AND old_inventory_uuid IS NOT NULL;

    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_inventory_aggregations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_inventory_details"("p_inventory_uuid" "uuid", "p_inventory_updates" "jsonb" DEFAULT '{}'::"jsonb", "p_inventory_item_updates" "jsonb" DEFAULT '[]'::"jsonb", "p_new_inventory_item" "jsonb" DEFAULT '[]'::"jsonb", "p_deleted_inventory_item" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_inventory_item_record RECORD;
  v_new_item_record RECORD;
BEGIN
  -- Update inventory if updates provided
  IF jsonb_typeof(p_inventory_updates) = 'object' AND p_inventory_updates != '{}' THEN
    UPDATE inventory 
    SET 
      name = COALESCE((p_inventory_updates->>'name')::TEXT, name),
      description = COALESCE((p_inventory_updates->>'description')::TEXT, description),
      measurement_unit = COALESCE((p_inventory_updates->>'measurement_unit')::TEXT, measurement_unit),
      standard_unit = COALESCE((p_inventory_updates->>'standard_unit')::TEXT, standard_unit),
      properties = COALESCE((p_inventory_updates->'properties')::JSONB, properties),
      updated_at = NOW()
    WHERE uuid = p_inventory_uuid;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Inventory not found'
      );
    END IF;
  END IF;

  -- Delete inventory items
  IF array_length(p_deleted_inventory_item, 1) > 0 THEN
    DELETE FROM inventory_items 
    WHERE uuid = ANY(p_deleted_inventory_item);
  END IF;

  -- Update existing inventory items using bulk operations
  IF jsonb_typeof(p_inventory_item_updates) = 'array' AND jsonb_array_length(p_inventory_item_updates) > 0 THEN
    FOR v_inventory_item_record IN 
      SELECT 
        (elem->>'uuid')::UUID as uuid,
        (elem->>'item_code')::TEXT as item_code,
        (elem->>'unit')::TEXT as unit,
        (elem->>'unit_value')::NUMERIC as unit_value,
        (elem->>'packaging_unit')::TEXT as packaging_unit,
        (elem->>'cost')::NUMERIC as cost,
        (elem->>'group_id')::TEXT as group_id,
        (elem->'properties')::JSONB as properties
      FROM jsonb_array_elements(p_inventory_item_updates) as elem
    LOOP
      UPDATE inventory_items
      SET 
        item_code = COALESCE(v_inventory_item_record.item_code, item_code),
        unit = COALESCE(v_inventory_item_record.unit, unit),
        unit_value = COALESCE(v_inventory_item_record.unit_value, unit_value),
        packaging_unit = COALESCE(v_inventory_item_record.packaging_unit, packaging_unit),
        cost = COALESCE(v_inventory_item_record.cost, cost),
        group_id = COALESCE(v_inventory_item_record.group_id, group_id),
        properties = COALESCE(v_inventory_item_record.properties, properties),
        updated_at = NOW()
      WHERE uuid = v_inventory_item_record.uuid;
    END LOOP;
  END IF;

  -- Create new inventory items using bulk insert
  IF jsonb_typeof(p_new_inventory_item) = 'array' AND jsonb_array_length(p_new_inventory_item) > 0 THEN
    INSERT INTO inventory_items (
      company_uuid,
      inventory_uuid,
      item_code,
      unit,
      unit_value,
      packaging_unit,
      cost,
      group_id,
      properties
    )
    SELECT 
      (elem->>'company_uuid')::UUID,
      p_inventory_uuid,
      (elem->>'item_code')::TEXT,
      (elem->>'unit')::TEXT,
      (elem->>'unit_value')::NUMERIC,
      (elem->>'packaging_unit')::TEXT,
      (elem->>'cost')::NUMERIC,
      (elem->>'group_id')::TEXT,
      (elem->'properties')::JSONB
    FROM jsonb_array_elements(p_new_inventory_item) as elem;
  END IF;

  RETURN jsonb_build_object(
    'success', true
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."update_inventory_details"("p_inventory_uuid" "uuid", "p_inventory_updates" "jsonb", "p_inventory_item_updates" "jsonb", "p_new_inventory_item" "jsonb", "p_deleted_inventory_item" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_reorder_point_logs_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_reorder_point_logs_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_single_inventory_aggregation"("p_inventory_uuid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    inv_record RECORD;
    total_unit_values RECORD;
    total_counts RECORD;
BEGIN
    -- Skip if inventory UUID is null
    IF p_inventory_uuid IS NULL THEN
        RETURN;
    END IF;

    -- Get inventory record to access standard_unit
    SELECT standard_unit INTO inv_record FROM inventory WHERE uuid = p_inventory_uuid;
    
    IF inv_record IS NULL THEN
        RETURN;
    END IF;

    -- Calculate aggregated unit values (converted to standard unit)
    SELECT 
        COALESCE(SUM(CASE 
            WHEN ii.status NOT IN ('IN_WAREHOUSE', 'USED') OR ii.status IS NULL 
            THEN public.convert_unit(ii.unit_value, ii.unit, inv_record.standard_unit) 
            ELSE 0 
        END), 0) as inventory,
        COALESCE(SUM(CASE 
            WHEN ii.status = 'IN_WAREHOUSE' 
            THEN public.convert_unit(ii.unit_value, ii.unit, inv_record.standard_unit) 
            ELSE 0 
        END), 0) as warehouse,
        COALESCE(SUM(CASE 
            WHEN ii.status = 'AVAILABLE' OR ii.status IS NULL 
            THEN public.convert_unit(ii.unit_value, ii.unit, inv_record.standard_unit) 
            ELSE 0 
        END), 0) as available,
        COALESCE(SUM(public.convert_unit(ii.unit_value, ii.unit, inv_record.standard_unit)), 0) as total
    INTO total_unit_values
    FROM inventory_items ii
    WHERE ii.inventory_uuid = p_inventory_uuid;

    -- Calculate aggregated counts
    SELECT 
        COALESCE(COUNT(CASE 
            WHEN ii.status NOT IN ('IN_WAREHOUSE', 'USED') OR ii.status IS NULL 
            THEN 1 
        END), 0) as inventory,
        COALESCE(COUNT(CASE 
            WHEN ii.status = 'IN_WAREHOUSE' 
            THEN 1 
        END), 0) as warehouse,
        COALESCE(COUNT(CASE 
            WHEN ii.status = 'AVAILABLE' OR ii.status IS NULL 
            THEN 1 
        END), 0) as available,
        COALESCE(COUNT(*), 0) as total
    INTO total_counts
    FROM inventory_items ii
    WHERE ii.inventory_uuid = p_inventory_uuid;

    -- Update the inventory table with aggregated values (without total_cost in properties)
    UPDATE inventory 
    SET 
        unit_values = jsonb_build_object(
            'inventory', total_unit_values.inventory,
            'warehouse', total_unit_values.warehouse,
            'available', total_unit_values.available,
            'total', total_unit_values.total
        ),
        count = jsonb_build_object(
            'inventory', total_counts.inventory,
            'warehouse', total_counts.warehouse,
            'available', total_counts.available,
            'total', total_counts.total
        ),
        updated_at = NOW()
    WHERE uuid = p_inventory_uuid;
END;
$$;


ALTER FUNCTION "public"."update_single_inventory_aggregation"("p_inventory_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_status_history"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_history := COALESCE(OLD.status_history, '{}'::jsonb) || jsonb_build_object(
      to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      NEW.status
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_status_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_warehouse_inventory_aggregations"("p_warehouse_inventory_uuid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
  SELECT standard_unit, warehouse_uuid, inventory_uuid 
  INTO wh_inv_record 
  FROM warehouse_inventory 
  WHERE uuid = p_warehouse_inventory_uuid;
  
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
  WHERE wii.warehouse_uuid = wh_inv_record.warehouse_uuid
    AND wii.inventory_uuid = wh_inv_record.inventory_uuid;

  -- Calculate aggregated counts
  SELECT 
    COALESCE(COUNT(CASE WHEN wii.status = 'AVAILABLE' THEN 1 END), 0) as available,
    COALESCE(COUNT(CASE WHEN wii.status = 'USED' THEN 1 END), 0) as used,
    COALESCE(COUNT(CASE WHEN wii.status = 'TRANSFERRED' THEN 1 END), 0) as transferred,
    COALESCE(COUNT(*), 0) as total
  INTO total_counts
  FROM warehouse_inventory_items wii
  WHERE wii.warehouse_uuid = wh_inv_record.warehouse_uuid
    AND wii.inventory_uuid = wh_inv_record.inventory_uuid;

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

  -- Log the update for debugging
  RAISE NOTICE 'Updated warehouse_inventory UUID: %, Available: %, Used: %, Total: %', 
    p_warehouse_inventory_uuid, total_unit_values.available, total_unit_values.used, total_unit_values.total;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Error updating warehouse inventory aggregations for UUID %: %', p_warehouse_inventory_uuid, SQLERRM;
END;
$$;


ALTER FUNCTION "public"."update_warehouse_inventory_aggregations"("p_warehouse_inventory_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_warehouse_inventory_aggregations_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    target_warehouse_inventory_uuid UUID;
    old_warehouse_inventory_uuid UUID;
    should_update_old BOOLEAN := FALSE;
    should_update_new BOOLEAN := FALSE;
BEGIN
    -- Determine which warehouse inventory UUIDs need updating based on operation type
    IF TG_OP = 'DELETE' THEN
        -- Find the warehouse inventory UUID for the deleted item
        SELECT uuid INTO target_warehouse_inventory_uuid
        FROM warehouse_inventory
        WHERE warehouse_uuid = OLD.warehouse_uuid AND inventory_uuid = OLD.inventory_uuid;
        
        should_update_old := TRUE;
        
    ELSIF TG_OP = 'INSERT' THEN
        -- Find the warehouse inventory UUID for the new item
        SELECT uuid INTO target_warehouse_inventory_uuid
        FROM warehouse_inventory
        WHERE warehouse_uuid = NEW.warehouse_uuid AND inventory_uuid = NEW.inventory_uuid;
        
        should_update_new := TRUE;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- Check if any of the tracked fields changed
        IF (OLD.status IS DISTINCT FROM NEW.status) OR
           (OLD.unit_value IS DISTINCT FROM NEW.unit_value) OR
           (OLD.unit IS DISTINCT FROM NEW.unit) OR
           (OLD.warehouse_uuid IS DISTINCT FROM NEW.warehouse_uuid) OR
           (OLD.inventory_uuid IS DISTINCT FROM NEW.inventory_uuid) THEN
            
            -- If warehouse or inventory changed, update both old and new warehouse inventories
            IF (OLD.warehouse_uuid IS DISTINCT FROM NEW.warehouse_uuid) OR 
               (OLD.inventory_uuid IS DISTINCT FROM NEW.inventory_uuid) THEN
                
                -- Get old warehouse inventory UUID
                SELECT uuid INTO old_warehouse_inventory_uuid
                FROM warehouse_inventory
                WHERE warehouse_uuid = OLD.warehouse_uuid AND inventory_uuid = OLD.inventory_uuid;
                
                -- Get new warehouse inventory UUID
                SELECT uuid INTO target_warehouse_inventory_uuid
                FROM warehouse_inventory
                WHERE warehouse_uuid = NEW.warehouse_uuid AND inventory_uuid = NEW.inventory_uuid;
                
                should_update_old := TRUE;
                should_update_new := TRUE;
            ELSE
                -- Same warehouse and inventory, just update the current one
                SELECT uuid INTO target_warehouse_inventory_uuid
                FROM warehouse_inventory
                WHERE warehouse_uuid = NEW.warehouse_uuid AND inventory_uuid = NEW.inventory_uuid;
                
                should_update_new := TRUE;
            END IF;
        ELSE
            -- No relevant changes, skip aggregation update
            RETURN NEW;
        END IF;
    END IF;

    -- Update aggregations for the target warehouse inventory
    IF should_update_new AND target_warehouse_inventory_uuid IS NOT NULL THEN
        PERFORM update_warehouse_inventory_aggregations(target_warehouse_inventory_uuid);
    END IF;
    
    -- Update aggregations for the old warehouse inventory (if different)
    IF should_update_old AND old_warehouse_inventory_uuid IS NOT NULL AND 
       old_warehouse_inventory_uuid IS DISTINCT FROM target_warehouse_inventory_uuid THEN
        PERFORM update_warehouse_inventory_aggregations(old_warehouse_inventory_uuid);
    END IF;

    RETURN COALESCE(NEW, OLD);
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the transaction
        RAISE WARNING 'Error in warehouse inventory aggregation trigger: %', SQLERRM;
        RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_warehouse_inventory_aggregations_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_warehouse_inventory_items_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Update status_history with timestamp and new status
  NEW.status_history = COALESCE(OLD.status_history, '{}'::jsonb) || 
    jsonb_build_object(to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), NEW.status);
  
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_warehouse_inventory_items_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_warehouse_inventory_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Update status_history with timestamp and new status
  NEW.status_history = COALESCE(OLD.status_history, '{}'::jsonb) || 
    jsonb_build_object(to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), NEW.status);
  
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_warehouse_inventory_status"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."address_brgy" (
    "id" bigint NOT NULL,
    "brgy_code" bigint NOT NULL,
    "brgy_desc" character varying(255) NOT NULL,
    "reg_code" integer NOT NULL,
    "prov_code" integer NOT NULL,
    "citymun_code" integer NOT NULL
);


ALTER TABLE "public"."address_brgy" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."address_brgy_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."address_brgy_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."address_brgy_id_seq" OWNED BY "public"."address_brgy"."id";



CREATE TABLE IF NOT EXISTS "public"."address_citymun" (
    "id" bigint NOT NULL,
    "psgc_code" bigint NOT NULL,
    "citymun_desc" character varying(255) NOT NULL,
    "reg_code" integer NOT NULL,
    "prov_code" integer NOT NULL,
    "citymun_code" integer NOT NULL
);


ALTER TABLE "public"."address_citymun" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."address_citymun_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."address_citymun_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."address_citymun_id_seq" OWNED BY "public"."address_citymun"."id";



CREATE TABLE IF NOT EXISTS "public"."address_province" (
    "id" bigint NOT NULL,
    "psgc_code" bigint NOT NULL,
    "prov_desc" character varying(255) NOT NULL,
    "reg_code" integer NOT NULL,
    "prov_code" integer NOT NULL
);


ALTER TABLE "public"."address_province" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."address_province_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."address_province_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."address_province_id_seq" OWNED BY "public"."address_province"."id";



CREATE TABLE IF NOT EXISTS "public"."address_region" (
    "id" bigint NOT NULL,
    "psgc_code" bigint NOT NULL,
    "reg_desc" character varying(255) NOT NULL,
    "reg_code" integer NOT NULL
);


ALTER TABLE "public"."address_region" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."address_region_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."address_region_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."address_region_id_seq" OWNED BY "public"."address_region"."id";



CREATE TABLE IF NOT EXISTS "public"."delivery_items" (
    "uuid" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "admin_uuid" "uuid" NOT NULL,
    "warehouse_uuid" "uuid" NOT NULL,
    "inventory_items" "jsonb" DEFAULT '{}'::"jsonb",
    "name" "text",
    "delivery_address" "text" NOT NULL,
    "delivery_date" "date" NOT NULL,
    "operator_uuids" "uuid"[],
    "notes" "text",
    "status" "text" DEFAULT 'PENDING'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status_history" "jsonb" DEFAULT "jsonb_build_object"("to_char"("now"(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'::"text"), 'PENDING'),
    CONSTRAINT "delivery_items_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'PROCESSING'::"text", 'IN_TRANSIT'::"text", 'DELIVERED'::"text", 'CONFIRMED'::"text", 'CANCELLED'::"text"])))
);

ALTER TABLE ONLY "public"."delivery_items" REPLICA IDENTITY FULL;


ALTER TABLE "public"."delivery_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "uuid" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "admin_uuid" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "measurement_unit" "text" NOT NULL,
    "standard_unit" "text" NOT NULL,
    "unit_values" "jsonb" DEFAULT '{"total": 0, "available": 0, "inventory": 0, "warehouse": 0}'::"jsonb",
    "count" "jsonb" DEFAULT '{"total": 0, "available": 0, "inventory": 0, "warehouse": 0}'::"jsonb",
    "properties" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'AVAILABLE'::"text",
    "status_history" "jsonb" DEFAULT "jsonb_build_object"("to_char"("now"(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'::"text"), 'AVAILABLE'),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inventory_status_check" CHECK (("status" = ANY (ARRAY['AVAILABLE'::"text", 'WARNING'::"text", 'CRITICAL'::"text", 'OUT_OF_STOCK'::"text"])))
);

ALTER TABLE ONLY "public"."inventory" REPLICA IDENTITY FULL;


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "uuid" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "inventory_uuid" "uuid" NOT NULL,
    "item_code" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "unit_value" numeric NOT NULL,
    "packaging_unit" "text" NOT NULL,
    "cost" numeric DEFAULT 0,
    "properties" "jsonb" DEFAULT '{}'::"jsonb",
    "group_id" "text",
    "status" "text" DEFAULT 'AVAILABLE'::"text",
    "status_history" "jsonb" DEFAULT "jsonb_build_object"("to_char"("now"(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'::"text"), 'AVAILABLE'),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inventory_items_status_check" CHECK (("status" = ANY (ARRAY['AVAILABLE'::"text", 'ON_DELIVERY'::"text", 'IN_WAREHOUSE'::"text", 'USED'::"text"])))
);

ALTER TABLE ONLY "public"."inventory_items" REPLICA IDENTITY FULL;


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "uuid" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "is_admin" boolean DEFAULT false NOT NULL,
    "name" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "profile_image" "text",
    "gender" "text",
    "birthday" timestamp with time zone,
    "phone_number" "text",
    "address" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "company_uuid" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "settings" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouse_inventory" (
    "uuid" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "admin_uuid" "uuid" NOT NULL,
    "warehouse_uuid" "uuid" NOT NULL,
    "inventory_uuid" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "measurement_unit" "text" NOT NULL,
    "standard_unit" "text" NOT NULL,
    "unit_values" "jsonb" DEFAULT '{"used": 0, "total": 0, "available": 0, "transferred": 0}'::"jsonb",
    "count" "jsonb" DEFAULT '{"used": 0, "total": 0, "available": 0, "transferred": 0}'::"jsonb",
    "properties" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'AVAILABLE'::"text",
    "status_history" "jsonb" DEFAULT "jsonb_build_object"("to_char"("now"(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'::"text"), 'AVAILABLE'),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "warehouse_inventory_status_check" CHECK (("status" = ANY (ARRAY['AVAILABLE'::"text", 'WARNING'::"text", 'CRITICAL'::"text", 'USED'::"text"])))
);


ALTER TABLE "public"."warehouse_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouse_inventory_items" (
    "uuid" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "warehouse_uuid" "uuid" NOT NULL,
    "inventory_uuid" "uuid",
    "inventory_item_uuid" "uuid",
    "delivery_uuid" "uuid" NOT NULL,
    "group_id" "text",
    "item_code" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "unit_value" "text" NOT NULL,
    "packaging_unit" "text" NOT NULL,
    "cost" numeric DEFAULT 0,
    "properties" "jsonb" DEFAULT '{}'::"jsonb",
    "location" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'AVAILABLE'::"text",
    "status_history" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "warehouse_inventory_items_status_check" CHECK (("status" = ANY (ARRAY['AVAILABLE'::"text", 'USED'::"text", 'TRANSFERRED'::"text"])))
);

ALTER TABLE ONLY "public"."warehouse_inventory_items" REPLICA IDENTITY FULL;


ALTER TABLE "public"."warehouse_inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouses" (
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "layout" "jsonb"[] DEFAULT '{}'::"jsonb"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."warehouses" REPLICA IDENTITY FULL;


ALTER TABLE "public"."warehouses" OWNER TO "postgres";


ALTER TABLE ONLY "public"."address_brgy" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."address_brgy_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."address_citymun" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."address_citymun_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."address_province" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."address_province_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."address_region" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."address_region_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."address_brgy"
    ADD CONSTRAINT "address_brgy_brgy_code_key" UNIQUE ("brgy_code");



ALTER TABLE ONLY "public"."address_brgy"
    ADD CONSTRAINT "address_brgy_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."address_citymun"
    ADD CONSTRAINT "address_citymun_citymun_code_key" UNIQUE ("citymun_code");



ALTER TABLE ONLY "public"."address_citymun"
    ADD CONSTRAINT "address_citymun_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."address_citymun"
    ADD CONSTRAINT "address_citymun_psgc_code_key" UNIQUE ("psgc_code");



ALTER TABLE ONLY "public"."address_province"
    ADD CONSTRAINT "address_province_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."address_province"
    ADD CONSTRAINT "address_province_prov_code_key" UNIQUE ("prov_code");



ALTER TABLE ONLY "public"."address_province"
    ADD CONSTRAINT "address_province_psgc_code_key" UNIQUE ("psgc_code");



ALTER TABLE ONLY "public"."address_region"
    ADD CONSTRAINT "address_region_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."address_region"
    ADD CONSTRAINT "address_region_psgc_code_key" UNIQUE ("psgc_code");



ALTER TABLE ONLY "public"."address_region"
    ADD CONSTRAINT "address_region_reg_code_key" UNIQUE ("reg_code");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."reorder_point_logs"
    ADD CONSTRAINT "reorder_point_logs_company_uuid_warehouse_uuid_inventory_uu_key" UNIQUE ("company_uuid", "warehouse_uuid", "inventory_uuid");



ALTER TABLE ONLY "public"."reorder_point_logs"
    ADD CONSTRAINT "reorder_point_logs_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."warehouse_inventory_items"
    ADD CONSTRAINT "warehouse_inventory_items_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."warehouse_inventory"
    ADD CONSTRAINT "warehouse_inventory_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_pkey" PRIMARY KEY ("uuid");



CREATE INDEX "idx_address_brgy_brgy_code" ON "public"."address_brgy" USING "btree" ("brgy_code");



CREATE INDEX "idx_address_brgy_citymun_code" ON "public"."address_brgy" USING "btree" ("citymun_code");



CREATE INDEX "idx_address_brgy_desc_gin" ON "public"."address_brgy" USING "gin" ("to_tsvector"('"english"'::"regconfig", ("brgy_desc")::"text"));



CREATE INDEX "idx_address_brgy_prov_code" ON "public"."address_brgy" USING "btree" ("prov_code");



CREATE INDEX "idx_address_brgy_reg_code" ON "public"."address_brgy" USING "btree" ("reg_code");



CREATE INDEX "idx_address_citymun_citymun_code" ON "public"."address_citymun" USING "btree" ("citymun_code");



CREATE INDEX "idx_address_citymun_desc_gin" ON "public"."address_citymun" USING "gin" ("to_tsvector"('"english"'::"regconfig", ("citymun_desc")::"text"));



CREATE INDEX "idx_address_citymun_prov_code" ON "public"."address_citymun" USING "btree" ("prov_code");



CREATE INDEX "idx_address_citymun_reg_code" ON "public"."address_citymun" USING "btree" ("reg_code");



CREATE INDEX "idx_address_province_desc_gin" ON "public"."address_province" USING "gin" ("to_tsvector"('"english"'::"regconfig", ("prov_desc")::"text"));



CREATE INDEX "idx_address_province_prov_code" ON "public"."address_province" USING "btree" ("prov_code");



CREATE INDEX "idx_address_province_reg_code" ON "public"."address_province" USING "btree" ("reg_code");



CREATE INDEX "idx_address_region_desc_gin" ON "public"."address_region" USING "gin" ("to_tsvector"('"english"'::"regconfig", ("reg_desc")::"text"));



CREATE INDEX "idx_address_region_reg_code" ON "public"."address_region" USING "btree" ("reg_code");



CREATE INDEX "idx_companies_created_at" ON "public"."companies" USING "btree" ("created_at");



CREATE INDEX "idx_companies_name" ON "public"."companies" USING "btree" ("name");



CREATE INDEX "idx_companies_updated_at" ON "public"."companies" USING "btree" ("updated_at");



CREATE INDEX "idx_delivery_items_search" ON "public"."delivery_items" USING "btree" ("uuid", "name", "delivery_address", "status", "notes");



CREATE INDEX "idx_inventory_items_cost" ON "public"."inventory_items" USING "btree" ("cost");



CREATE INDEX "idx_inventory_items_inventory_uuid_status" ON "public"."inventory_items" USING "btree" ("inventory_uuid", "status");



CREATE INDEX "idx_inventory_items_search" ON "public"."inventory_items" USING "btree" ("uuid", "item_code", "status", "unit", "group_id");



CREATE INDEX "idx_inventory_items_status" ON "public"."inventory_items" USING "btree" ("status");



CREATE INDEX "idx_inventory_items_unit" ON "public"."inventory_items" USING "btree" ("unit");



CREATE INDEX "idx_inventory_items_unit_value" ON "public"."inventory_items" USING "btree" ("unit_value");



CREATE INDEX "idx_inventory_items_updated_at" ON "public"."inventory_items" USING "btree" ("updated_at");



CREATE INDEX "idx_inventory_search" ON "public"."inventory" USING "btree" ("uuid", "name", "description", "status", "measurement_unit", "standard_unit");



CREATE INDEX "idx_profiles_company_uuid" ON "public"."profiles" USING "btree" ("company_uuid");



CREATE INDEX "idx_reorder_point_logs_company_warehouse" ON "public"."reorder_point_logs" USING "btree" ("company_uuid", "warehouse_uuid");



CREATE INDEX "idx_reorder_point_logs_status" ON "public"."reorder_point_logs" USING "btree" ("status");



CREATE INDEX "idx_reorder_point_logs_updated_at" ON "public"."reorder_point_logs" USING "btree" ("updated_at");



CREATE INDEX "idx_reorder_point_logs_warehouse_inventory" ON "public"."reorder_point_logs" USING "btree" ("warehouse_inventory_uuid");



CREATE INDEX "idx_warehouse_inventory_count" ON "public"."warehouse_inventory" USING "gin" ("count");



CREATE INDEX "idx_warehouse_inventory_items_search" ON "public"."warehouse_inventory_items" USING "btree" ("uuid", "item_code", "status", "unit", "group_id");



CREATE INDEX "idx_warehouse_inventory_items_status" ON "public"."warehouse_inventory_items" USING "btree" ("status");



CREATE INDEX "idx_warehouse_inventory_items_unit" ON "public"."warehouse_inventory_items" USING "btree" ("unit");



CREATE INDEX "idx_warehouse_inventory_items_unit_value" ON "public"."warehouse_inventory_items" USING "btree" ("unit_value");



CREATE INDEX "idx_warehouse_inventory_items_updated_at" ON "public"."warehouse_inventory_items" USING "btree" ("updated_at");



CREATE INDEX "idx_warehouse_inventory_items_usage" ON "public"."warehouse_inventory_items" USING "btree" ("warehouse_uuid", "inventory_uuid", "status", "updated_at");



CREATE INDEX "idx_warehouse_inventory_items_warehouse_inventory" ON "public"."warehouse_inventory_items" USING "btree" ("warehouse_uuid", "inventory_uuid");



CREATE INDEX "idx_warehouse_inventory_search" ON "public"."warehouse_inventory" USING "btree" ("uuid", "name", "description", "status", "standard_unit");



CREATE INDEX "idx_warehouse_inventory_status" ON "public"."warehouse_inventory" USING "btree" ("status");



CREATE INDEX "idx_warehouse_inventory_unit_values" ON "public"."warehouse_inventory" USING "gin" ("unit_values");



CREATE INDEX "idx_warehouses_address_fulladdress" ON "public"."warehouses" USING "btree" ((("address" ->> 'fullAddress'::"text")));



CREATE INDEX "idx_warehouses_company_uuid" ON "public"."warehouses" USING "btree" ("company_uuid");



CREATE INDEX "idx_warehouses_created_at" ON "public"."warehouses" USING "btree" ("created_at");



CREATE INDEX "idx_warehouses_name" ON "public"."warehouses" USING "btree" ("name");



CREATE INDEX "idx_warehouses_search" ON "public"."warehouses" USING "btree" ("uuid", "name");



CREATE OR REPLACE TRIGGER "trg_inventory_items_aggregation" AFTER INSERT OR DELETE OR UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_inventory_aggregations"();



CREATE OR REPLACE TRIGGER "trg_reorder_point_recalc" AFTER INSERT OR DELETE OR UPDATE ON "public"."warehouse_inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_reorder_point_recalculation"();



CREATE OR REPLACE TRIGGER "trg_update_reorder_point_logs" BEFORE UPDATE ON "public"."reorder_point_logs" FOR EACH ROW EXECUTE FUNCTION "public"."update_reorder_point_logs_timestamp"();



CREATE OR REPLACE TRIGGER "trg_update_status_history_delivery_items" BEFORE UPDATE ON "public"."delivery_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_status_history"();



CREATE OR REPLACE TRIGGER "trg_update_status_history_inventory" BEFORE UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_status_history"();



CREATE OR REPLACE TRIGGER "trg_update_status_history_inventory_items" BEFORE UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_status_history"();



CREATE OR REPLACE TRIGGER "trg_update_status_history_warehouse_inventory" BEFORE UPDATE ON "public"."warehouse_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_status_history"();



CREATE OR REPLACE TRIGGER "trg_update_status_history_warehouse_inventory_items" BEFORE UPDATE ON "public"."warehouse_inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_status_history"();



CREATE OR REPLACE TRIGGER "trg_update_updated_at_companies" BEFORE UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_updated_at_delivery_items" BEFORE UPDATE ON "public"."delivery_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_updated_at_inventory" BEFORE UPDATE ON "public"."inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_updated_at_inventory_items" BEFORE UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_updated_at_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_updated_at_warehouse_inventory" BEFORE UPDATE ON "public"."warehouse_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_updated_at_warehouse_inventory_items" BEFORE UPDATE ON "public"."warehouse_inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_update_updated_at_warehouses" BEFORE UPDATE ON "public"."warehouses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_warehouse_inventory_items" AFTER INSERT OR DELETE OR UPDATE ON "public"."warehouse_inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_warehouse_inventory_aggregations_trigger"();



CREATE OR REPLACE TRIGGER "trg_warehouse_inventory_items_status" BEFORE UPDATE ON "public"."warehouse_inventory_items" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."update_warehouse_inventory_items_status"();



CREATE OR REPLACE TRIGGER "trg_warehouse_inventory_status" BEFORE UPDATE ON "public"."warehouse_inventory" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."update_warehouse_inventory_status"();



CREATE OR REPLACE TRIGGER "trg_warehouse_inventory_status_update" BEFORE UPDATE ON "public"."warehouse_inventory" FOR EACH ROW WHEN (("old"."count" IS DISTINCT FROM "new"."count")) EXECUTE FUNCTION "public"."update_warehouse_inventory_status"();



ALTER TABLE ONLY "public"."address_brgy"
    ADD CONSTRAINT "address_brgy_citymun_code_fkey" FOREIGN KEY ("citymun_code") REFERENCES "public"."address_citymun"("citymun_code");



ALTER TABLE ONLY "public"."address_brgy"
    ADD CONSTRAINT "address_brgy_prov_code_fkey" FOREIGN KEY ("prov_code") REFERENCES "public"."address_province"("prov_code");



ALTER TABLE ONLY "public"."address_brgy"
    ADD CONSTRAINT "address_brgy_reg_code_fkey" FOREIGN KEY ("reg_code") REFERENCES "public"."address_region"("reg_code");



ALTER TABLE ONLY "public"."address_citymun"
    ADD CONSTRAINT "address_citymun_prov_code_fkey" FOREIGN KEY ("prov_code") REFERENCES "public"."address_province"("prov_code");



ALTER TABLE ONLY "public"."address_citymun"
    ADD CONSTRAINT "address_citymun_reg_code_fkey" FOREIGN KEY ("reg_code") REFERENCES "public"."address_region"("reg_code");



ALTER TABLE ONLY "public"."address_province"
    ADD CONSTRAINT "address_province_reg_code_fkey" FOREIGN KEY ("reg_code") REFERENCES "public"."address_region"("reg_code");



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_admin_uuid_fkey" FOREIGN KEY ("admin_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_warehouse_uuid_fkey" FOREIGN KEY ("warehouse_uuid") REFERENCES "public"."warehouses"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_admin_uuid_fkey" FOREIGN KEY ("admin_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_inventory_uuid_fkey" FOREIGN KEY ("inventory_uuid") REFERENCES "public"."inventory"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_uuid_fkey" FOREIGN KEY ("uuid") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reorder_point_logs"
    ADD CONSTRAINT "reorder_point_logs_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reorder_point_logs"
    ADD CONSTRAINT "reorder_point_logs_inventory_uuid_fkey" FOREIGN KEY ("inventory_uuid") REFERENCES "public"."inventory"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reorder_point_logs"
    ADD CONSTRAINT "reorder_point_logs_warehouse_inventory_uuid_fkey" FOREIGN KEY ("warehouse_inventory_uuid") REFERENCES "public"."warehouse_inventory"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reorder_point_logs"
    ADD CONSTRAINT "reorder_point_logs_warehouse_uuid_fkey" FOREIGN KEY ("warehouse_uuid") REFERENCES "public"."warehouses"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory"
    ADD CONSTRAINT "warehouse_inventory_admin_uuid_fkey" FOREIGN KEY ("admin_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warehouse_inventory"
    ADD CONSTRAINT "warehouse_inventory_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory"
    ADD CONSTRAINT "warehouse_inventory_inventory_uuid_fkey" FOREIGN KEY ("inventory_uuid") REFERENCES "public"."inventory"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warehouse_inventory_items"
    ADD CONSTRAINT "warehouse_inventory_items_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_items"
    ADD CONSTRAINT "warehouse_inventory_items_delivery_uuid_fkey" FOREIGN KEY ("delivery_uuid") REFERENCES "public"."delivery_items"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_items"
    ADD CONSTRAINT "warehouse_inventory_items_inventory_item_uuid_fkey" FOREIGN KEY ("inventory_item_uuid") REFERENCES "public"."inventory_items"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warehouse_inventory_items"
    ADD CONSTRAINT "warehouse_inventory_items_inventory_uuid_fkey" FOREIGN KEY ("inventory_uuid") REFERENCES "public"."inventory"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warehouse_inventory_items"
    ADD CONSTRAINT "warehouse_inventory_items_warehouse_uuid_fkey" FOREIGN KEY ("warehouse_uuid") REFERENCES "public"."warehouses"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory"
    ADD CONSTRAINT "warehouse_inventory_warehouse_uuid_fkey" FOREIGN KEY ("warehouse_uuid") REFERENCES "public"."warehouses"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



CREATE POLICY "Allow read for all users" ON "public"."address_brgy" FOR SELECT USING (true);



CREATE POLICY "Allow read for all users" ON "public"."address_citymun" FOR SELECT USING (true);



CREATE POLICY "Allow read for all users" ON "public"."address_province" FOR SELECT USING (true);



CREATE POLICY "Allow read for all users" ON "public"."address_region" FOR SELECT USING (true);



CREATE POLICY "Only admins can create warehouses" ON "public"."warehouses" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."uuid" = "auth"."uid"()) AND ("profiles"."is_admin" = true) AND ("profiles"."company_uuid" = "warehouses"."company_uuid")))));



CREATE POLICY "Only admins can delete warehouses" ON "public"."warehouses" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."uuid" = "auth"."uid"()) AND ("profiles"."is_admin" = true) AND ("profiles"."company_uuid" = "warehouses"."company_uuid")))));



CREATE POLICY "Only admins can update warehouses" ON "public"."warehouses" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."uuid" = "auth"."uid"()) AND ("profiles"."is_admin" = true) AND ("profiles"."company_uuid" = "warehouses"."company_uuid")))));



CREATE POLICY "Users can view warehouses belonging to their company" ON "public"."warehouses" FOR SELECT USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



ALTER TABLE "public"."address_brgy" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."address_citymun" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."address_province" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."address_region" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companies_delete_policy" ON "public"."companies" FOR DELETE TO "authenticated" USING ((("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) AND ("uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



CREATE POLICY "companies_insert_policy" ON "public"."companies" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "companies_select_policy" ON "public"."companies" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "companies_update_policy" ON "public"."companies" FOR UPDATE TO "authenticated" USING ((("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) AND ("uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



ALTER TABLE "public"."delivery_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_items_delete_policy" ON "public"."delivery_items" FOR DELETE TO "authenticated" USING ((("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "delivery_items_insert_policy" ON "public"."delivery_items" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "delivery_items_select_policy" ON "public"."delivery_items" FOR SELECT TO "authenticated" USING ((("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



CREATE POLICY "delivery_items_update_policy" ON "public"."delivery_items" FOR UPDATE TO "authenticated" USING ((("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL) AND (("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) OR (("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = false) AND ("operator_uuids" @> ARRAY["auth"."uid"()]) AND ("status" = 'IN_TRANSIT'::"text"))))) WITH CHECK ((("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL) AND (("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) OR (("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = false) AND ("operator_uuids" @> ARRAY["auth"."uid"()]) AND ("status" = ANY (ARRAY['DELIVERED'::"text", 'IN_TRANSIT'::"text"]))))));



ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_delete_policy" ON "public"."inventory" FOR DELETE TO "authenticated" USING ((("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



CREATE POLICY "inventory_insert_policy" ON "public"."inventory" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_items_delete_policy" ON "public"."inventory_items" FOR DELETE TO "authenticated" USING ((("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



CREATE POLICY "inventory_items_insert_policy" ON "public"."inventory_items" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



CREATE POLICY "inventory_items_select_policy" ON "public"."inventory_items" FOR SELECT TO "authenticated" USING ((("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



CREATE POLICY "inventory_items_update_policy" ON "public"."inventory_items" FOR UPDATE TO "authenticated" USING ((("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



CREATE POLICY "inventory_select_policy" ON "public"."inventory" FOR SELECT TO "authenticated" USING ((("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



CREATE POLICY "inventory_update_policy" ON "public"."inventory" FOR UPDATE TO "authenticated" USING ((("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete_policy" ON "public"."profiles" FOR DELETE TO "authenticated" USING ((("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) AND ("company_uuid" IS NOT NULL) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND (( SELECT "auth"."uid"() AS "uid") <> "uuid")));



CREATE POLICY "profiles_insert_policy" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("uuid" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "profiles_select_policy" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("uuid" = ( SELECT "auth"."uid"() AS "uid")) OR (("company_uuid" IS NOT NULL) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "profiles_update_policy" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("uuid" = ( SELECT "auth"."uid"() AS "uid")) OR (("public"."is_user_admin"(( SELECT "auth"."uid"() AS "uid")) = true) AND ("company_uuid" IS NOT NULL) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."reorder_point_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reorder_point_logs_delete_policy" ON "public"."reorder_point_logs" FOR DELETE TO "authenticated" USING ((("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "reorder_point_logs_insert_policy" ON "public"."reorder_point_logs" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "reorder_point_logs_select_policy" ON "public"."reorder_point_logs" FOR SELECT TO "authenticated" USING ((("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



CREATE POLICY "reorder_point_logs_update_policy" ON "public"."reorder_point_logs" FOR UPDATE TO "authenticated" USING ((("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



ALTER TABLE "public"."warehouse_inventory" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warehouse_inventory_delete_policy" ON "public"."warehouse_inventory" FOR DELETE TO "authenticated" USING ((("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "warehouse_inventory_insert_policy" ON "public"."warehouse_inventory" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."warehouse_inventory_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warehouse_inventory_items_delete_policy" ON "public"."warehouse_inventory_items" FOR DELETE TO "authenticated" USING ((("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "warehouse_inventory_items_insert_policy" ON "public"."warehouse_inventory_items" FOR INSERT TO "authenticated" WITH CHECK ((("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL) AND ("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "warehouse_inventory_items_select_policy" ON "public"."warehouse_inventory_items" FOR SELECT TO "authenticated" USING ((("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



CREATE POLICY "warehouse_inventory_items_update_policy" ON "public"."warehouse_inventory_items" FOR UPDATE TO "authenticated" USING ((("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



CREATE POLICY "warehouse_inventory_select_policy" ON "public"."warehouse_inventory" FOR SELECT TO "authenticated" USING ((("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



CREATE POLICY "warehouse_inventory_update_policy" ON "public"."warehouse_inventory" FOR UPDATE TO "authenticated" USING ((("company_uuid" = "public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid"))) AND ("public"."get_user_company_uuid"(( SELECT "auth"."uid"() AS "uid")) IS NOT NULL)));



ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."delivery_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."inventory";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."inventory_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."warehouse_inventory";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."warehouse_inventory_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."warehouses";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON TABLE "public"."reorder_point_logs" TO "anon";
GRANT ALL ON TABLE "public"."reorder_point_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."reorder_point_logs" TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_reorder_points"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_reorder_points"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_reorder_points"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_specific_reorder_point"("p_warehouse_inventory_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_specific_reorder_point"("p_warehouse_inventory_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_specific_reorder_point"("p_warehouse_inventory_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_unit"("value" numeric, "from_unit" "text", "to_unit" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."convert_unit"("value" numeric, "from_unit" "text", "to_unit" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_unit"("value" numeric, "from_unit" "text", "to_unit" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_delivery_with_items"("p_admin_uuid" "uuid", "p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_inventory_items" "jsonb", "p_delivery_address" "text", "p_delivery_date" "date", "p_operator_uuids" "uuid"[], "p_notes" "text", "p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_delivery_with_items"("p_admin_uuid" "uuid", "p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_inventory_items" "jsonb", "p_delivery_address" "text", "p_delivery_date" "date", "p_operator_uuids" "uuid"[], "p_notes" "text", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_delivery_with_items"("p_admin_uuid" "uuid", "p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_inventory_items" "jsonb", "p_delivery_address" "text", "p_delivery_date" "date", "p_operator_uuids" "uuid"[], "p_notes" "text", "p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_warehouse_inventory_from_delivery"("p_warehouse_uuid" "uuid", "p_delivery_uuid" "uuid", "p_group_ids" "text"[], "p_inventory_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_warehouse_inventory_from_delivery"("p_warehouse_uuid" "uuid", "p_delivery_uuid" "uuid", "p_group_ids" "text"[], "p_inventory_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_warehouse_inventory_from_delivery"("p_warehouse_uuid" "uuid", "p_delivery_uuid" "uuid", "p_group_ids" "text"[], "p_inventory_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_warehouse_inventory_from_delivery"("p_warehouse_uuid" "uuid", "p_delivery_uuid" "uuid", "p_item_uuids" "uuid"[], "p_inventory_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_warehouse_inventory_from_delivery"("p_warehouse_uuid" "uuid", "p_delivery_uuid" "uuid", "p_item_uuids" "uuid"[], "p_inventory_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_warehouse_inventory_from_delivery"("p_warehouse_uuid" "uuid", "p_delivery_uuid" "uuid", "p_item_uuids" "uuid"[], "p_inventory_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."general_search"("p_search_query" "text", "p_entity_type" "text", "p_company_uuid" "uuid", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."general_search"("p_search_query" "text", "p_entity_type" "text", "p_company_uuid" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."general_search"("p_search_query" "text", "p_entity_type" "text", "p_company_uuid" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_address_dropdown_data"("target_reg_code" "text", "target_prov_code" "text", "target_citymun_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_address_dropdown_data"("target_reg_code" "text", "target_prov_code" "text", "target_citymun_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_address_dropdown_data"("target_reg_code" "text", "target_prov_code" "text", "target_citymun_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_complete_address_data"("citymun_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_complete_address_data"("citymun_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_complete_address_data"("citymun_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_delivery_details"("p_delivery_uuid" "uuid", "p_company_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_delivery_details"("p_delivery_uuid" "uuid", "p_company_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_delivery_details"("p_delivery_uuid" "uuid", "p_company_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_delivery_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_warehouse_uuid" "uuid", "p_operator_uuids" "uuid"[], "p_inventory_uuid" "uuid", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_delivery_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_warehouse_uuid" "uuid", "p_operator_uuids" "uuid"[], "p_inventory_uuid" "uuid", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_delivery_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_warehouse_uuid" "uuid", "p_operator_uuids" "uuid"[], "p_inventory_uuid" "uuid", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_details"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_details"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_details"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_details_for_delivery"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean, "p_delivery_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_details_for_delivery"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean, "p_delivery_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_details_for_delivery"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean, "p_delivery_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_reorder_point_logs_filtered"("p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_status" "text", "p_search" "text", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_reorder_point_logs_filtered"("p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_status" "text", "p_search" "text", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reorder_point_logs_filtered"("p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_status" "text", "p_search" "text", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_unit_conversion_factor"("from_unit" "text", "to_unit" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_unit_conversion_factor"("from_unit" "text", "to_unit" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_unit_conversion_factor"("from_unit" "text", "to_unit" "text") TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_company"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_company"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_company"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_company_uuid"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_company_uuid"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_company_uuid"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_delivery_history"("p_warehouse_inventory_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_delivery_history"("p_warehouse_inventory_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_delivery_history"("p_warehouse_inventory_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_details"("p_warehouse_inventory_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_details"("p_warehouse_inventory_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_details"("p_warehouse_inventory_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_warehouse_uuid" "uuid", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_warehouse_uuid" "uuid", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_warehouse_uuid" "uuid", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_warehouse_items_by_delivery"("p_delivery_uuid" "uuid", "p_company_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_warehouse_items_by_delivery"("p_delivery_uuid" "uuid", "p_company_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_warehouse_items_by_delivery"("p_delivery_uuid" "uuid", "p_company_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_warehouse_items_by_reorder_point_logs"("p_reorder_point_log_uuids" "uuid"[], "p_company_uuid" "uuid", "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_warehouse_items_by_reorder_point_logs"("p_reorder_point_log_uuids" "uuid"[], "p_company_uuid" "uuid", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_warehouse_items_by_reorder_point_logs"("p_reorder_point_log_uuids" "uuid"[], "p_company_uuid" "uuid", "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_warehouses_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_warehouses_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_warehouses_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_admin"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_admin"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_admin"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_warehouse_group_as_used"("p_group_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_warehouse_group_as_used"("p_group_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_warehouse_group_as_used"("p_group_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_warehouse_group_bulk_used"("p_group_id" "text", "p_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_warehouse_group_bulk_used"("p_group_id" "text", "p_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_warehouse_group_bulk_used"("p_group_id" "text", "p_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_warehouse_item_as_used"("p_item_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_warehouse_item_as_used"("p_item_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_warehouse_item_as_used"("p_item_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_warehouse_items_bulk_used"("p_warehouse_inventory_uuid" "uuid", "p_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."mark_warehouse_items_bulk_used"("p_warehouse_inventory_uuid" "uuid", "p_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_warehouse_items_bulk_used"("p_warehouse_inventory_uuid" "uuid", "p_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_all_inventory_aggregations"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_all_inventory_aggregations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_all_inventory_aggregations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_all_warehouse_inventory_aggregations"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_all_warehouse_inventory_aggregations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_all_warehouse_inventory_aggregations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_example_usage"() TO "anon";
GRANT ALL ON FUNCTION "public"."search_example_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_example_usage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_reorder_point_recalculation"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_reorder_point_recalculation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_reorder_point_recalculation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_custom_safety_stock"("p_warehouse_inventory_uuid" "uuid", "p_custom_safety_stock" numeric, "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_custom_safety_stock"("p_warehouse_inventory_uuid" "uuid", "p_custom_safety_stock" numeric, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_custom_safety_stock"("p_warehouse_inventory_uuid" "uuid", "p_custom_safety_stock" numeric, "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_delivery_status_with_items"("p_delivery_uuid" "uuid", "p_status" "text", "p_company_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_delivery_status_with_items"("p_delivery_uuid" "uuid", "p_status" "text", "p_company_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_delivery_status_with_items"("p_delivery_uuid" "uuid", "p_status" "text", "p_company_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_delivery_with_items"("p_delivery_uuid" "uuid", "p_inventory_items" "jsonb", "p_delivery_address" "text", "p_delivery_date" "date", "p_operator_uuids" "uuid"[], "p_notes" "text", "p_name" "text", "p_company_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_delivery_with_items"("p_delivery_uuid" "uuid", "p_inventory_items" "jsonb", "p_delivery_address" "text", "p_delivery_date" "date", "p_operator_uuids" "uuid"[], "p_notes" "text", "p_name" "text", "p_company_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_delivery_with_items"("p_delivery_uuid" "uuid", "p_inventory_items" "jsonb", "p_delivery_address" "text", "p_delivery_date" "date", "p_operator_uuids" "uuid"[], "p_notes" "text", "p_name" "text", "p_company_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_inventory_aggregations"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_inventory_aggregations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_inventory_aggregations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_inventory_details"("p_inventory_uuid" "uuid", "p_inventory_updates" "jsonb", "p_inventory_item_updates" "jsonb", "p_new_inventory_item" "jsonb", "p_deleted_inventory_item" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."update_inventory_details"("p_inventory_uuid" "uuid", "p_inventory_updates" "jsonb", "p_inventory_item_updates" "jsonb", "p_new_inventory_item" "jsonb", "p_deleted_inventory_item" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_inventory_details"("p_inventory_uuid" "uuid", "p_inventory_updates" "jsonb", "p_inventory_item_updates" "jsonb", "p_new_inventory_item" "jsonb", "p_deleted_inventory_item" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_reorder_point_logs_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_reorder_point_logs_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_reorder_point_logs_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_single_inventory_aggregation"("p_inventory_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_single_inventory_aggregation"("p_inventory_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_single_inventory_aggregation"("p_inventory_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_status_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_status_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_status_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_warehouse_inventory_aggregations"("p_warehouse_inventory_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_warehouse_inventory_aggregations"("p_warehouse_inventory_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_warehouse_inventory_aggregations"("p_warehouse_inventory_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_warehouse_inventory_aggregations_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_warehouse_inventory_aggregations_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_warehouse_inventory_aggregations_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_warehouse_inventory_items_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_warehouse_inventory_items_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_warehouse_inventory_items_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_warehouse_inventory_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_warehouse_inventory_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_warehouse_inventory_status"() TO "service_role";


















GRANT ALL ON TABLE "public"."address_brgy" TO "anon";
GRANT ALL ON TABLE "public"."address_brgy" TO "authenticated";
GRANT ALL ON TABLE "public"."address_brgy" TO "service_role";



GRANT ALL ON SEQUENCE "public"."address_brgy_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."address_brgy_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."address_brgy_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."address_citymun" TO "anon";
GRANT ALL ON TABLE "public"."address_citymun" TO "authenticated";
GRANT ALL ON TABLE "public"."address_citymun" TO "service_role";



GRANT ALL ON SEQUENCE "public"."address_citymun_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."address_citymun_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."address_citymun_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."address_province" TO "anon";
GRANT ALL ON TABLE "public"."address_province" TO "authenticated";
GRANT ALL ON TABLE "public"."address_province" TO "service_role";



GRANT ALL ON SEQUENCE "public"."address_province_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."address_province_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."address_province_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."address_region" TO "anon";
GRANT ALL ON TABLE "public"."address_region" TO "authenticated";
GRANT ALL ON TABLE "public"."address_region" TO "service_role";



GRANT ALL ON SEQUENCE "public"."address_region_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."address_region_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."address_region_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_items" TO "anon";
GRANT ALL ON TABLE "public"."delivery_items" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."warehouse_inventory" TO "anon";
GRANT ALL ON TABLE "public"."warehouse_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouse_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."warehouse_inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."warehouse_inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouse_inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."warehouses" TO "anon";
GRANT ALL ON TABLE "public"."warehouses" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouses" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























RESET ALL;
