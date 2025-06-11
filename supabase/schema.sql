

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."calculate_inventory_variance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.netsuite IS NOT NULL AND NEW.ending_inventory IS NOT NULL THEN
    NEW.variance = NEW.ending_inventory - NEW.netsuite;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_inventory_variance"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."reorder_point_logs" (
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "warehouse_uuid" "uuid" NOT NULL,
    "inventory_uuid" "uuid" NOT NULL,
    "warehouse_inventory_uuid" "uuid",
    "current_stock" numeric NOT NULL,
    "average_daily_unit_sales" numeric(10,2) NOT NULL,
    "lead_time_days" numeric(10,2) NOT NULL,
    "safety_stock" numeric(10,2) NOT NULL,
    "reorder_point" numeric(10,2) NOT NULL,
    "status" character varying(20) NOT NULL,
    "custom_safety_stock" numeric(10,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "unit" character varying(20),
    CONSTRAINT "reorder_point_logs_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['IN_STOCK'::character varying, 'WARNING'::character varying, 'CRITICAL'::character varying, 'OUT_OF_STOCK'::character varying])::"text"[])))
);


ALTER TABLE "public"."reorder_point_logs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_reorder_points"() RETURNS SETOF "public"."reorder_point_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  inventory_item RECORD;
  avg_daily_sales DECIMAL(10, 2);
  lead_time DECIMAL(10, 2);
  safety_stock DECIMAL(10, 2);
  reorder_point DECIMAL(10, 2);
  current_stock DECIMAL(10, 2);
  max_daily_sales DECIMAL(10, 2);
  stock_status VARCHAR(20);
  custom_safety DECIMAL(10, 2);
  item_unit VARCHAR(20);
  log_record "reorder_point_logs"%ROWTYPE;
BEGIN
  -- Loop through all inventory items in warehouses
  FOR inventory_item IN
    SELECT 
      wi.uuid as warehouse_inventory_uuid,
      wi.company_uuid,
      wi.warehouse_uuid,
      wi.inventory_uuid,
      i.unit -- Get the unit from inventory_items table
    FROM 
      warehouse_inventory_items wi
    LEFT JOIN
      inventory_items i ON wi.inventory_uuid = i.uuid
    GROUP BY 
      wi.uuid, wi.company_uuid, wi.warehouse_uuid, wi.inventory_uuid, i.unit
  LOOP
    item_unit := COALESCE(inventory_item.unit, 'units');
    
    -- Calculate current stock considering only individual units that are available
    SELECT 
      COALESCE(SUM(wiu.unit_value), 0)
    INTO 
      current_stock
    FROM 
      warehouse_inventory_item_unit wiu
    WHERE 
      wiu.warehouse_inventory_uuid = inventory_item.warehouse_inventory_uuid
      AND wiu.status = 'AVAILABLE';
    
    -- Get average daily sales (from delivery_items) - WAREHOUSE SPECIFIC
    SELECT 
      COALESCE(SUM(dib.unit_value), 0) / GREATEST(DATE_PART('day', NOW() - MIN(di.created_at)), 1)
    INTO 
      avg_daily_sales
    FROM 
      delivery_items di
    JOIN
      warehouse_inventory_item_bulk dib ON di.uuid = dib.delivery_uuid
    WHERE 
      di.inventory_uuid = inventory_item.inventory_uuid
      AND di.company_uuid = inventory_item.company_uuid
      AND di.warehouse_uuid = inventory_item.warehouse_uuid -- Filter by warehouse
      AND di.status = 'DELIVERED'
      AND di.created_at >= NOW() - INTERVAL '90 days';
    
    -- Get maximum daily sales - WAREHOUSE SPECIFIC
    SELECT 
      COALESCE(MAX(daily_total), 0)
    INTO 
      max_daily_sales
    FROM (
      SELECT 
        DATE_TRUNC('day', di.created_at) as sale_date,
        SUM(dib.unit_value) as daily_total
      FROM 
        delivery_items di
      JOIN
        warehouse_inventory_item_bulk dib ON di.uuid = dib.delivery_uuid
      WHERE 
        di.inventory_uuid = inventory_item.inventory_uuid
        AND di.company_uuid = inventory_item.company_uuid
        AND di.warehouse_uuid = inventory_item.warehouse_uuid -- Filter by warehouse
        AND di.status = 'DELIVERED'
        AND di.created_at >= NOW() - INTERVAL '90 days'
      GROUP BY 
        DATE_TRUNC('day', di.created_at)
    ) daily_sales;
    
    -- Get average lead time (time between order creation and delivery) - WAREHOUSE SPECIFIC
    SELECT 
      COALESCE(AVG(
        EXTRACT(EPOCH FROM (
          -- Find the timestamp when status changed to DELIVERED
          (SELECT MIN(k::TIMESTAMP) 
           FROM jsonb_object_keys(status_history) k 
           WHERE status_history->k = '"DELIVERED"')
          - created_at
        )) / 86400  -- Convert seconds to days
      ), 5) -- Default to 5 days if no data
    INTO 
      lead_time
    FROM 
      delivery_items
    WHERE 
      inventory_uuid = inventory_item.inventory_uuid
      AND company_uuid = inventory_item.company_uuid
      AND warehouse_uuid = inventory_item.warehouse_uuid -- Filter by warehouse
      AND status = 'DELIVERED'
      AND created_at >= NOW() - INTERVAL '90 days';
    
    -- Check if a custom safety stock exists
    SELECT 
      custom_safety_stock
    INTO 
      custom_safety
    FROM 
      "reorder_point_logs"
    WHERE 
      inventory_uuid = inventory_item.inventory_uuid
      AND company_uuid = inventory_item.company_uuid
      AND warehouse_uuid = inventory_item.warehouse_uuid
    ORDER BY 
      updated_at DESC
    LIMIT 1;
    
    -- Calculate safety stock (either use custom or calculate)
    IF custom_safety IS NOT NULL THEN
      safety_stock := custom_safety;
    ELSE
      safety_stock := (max_daily_sales - avg_daily_sales) * lead_time;
      IF safety_stock < 0 THEN
        safety_stock := 0;
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
    INSERT INTO "reorder_point_logs" (
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
      custom_safety_stock,
      unit
    ) VALUES (
      inventory_item.company_uuid,
      inventory_item.warehouse_uuid,
      inventory_item.inventory_uuid,
      inventory_item.warehouse_inventory_uuid,
      current_stock,
      avg_daily_sales,
      lead_time,
      safety_stock,
      reorder_point,
      stock_status,
      custom_safety,
      item_unit
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
      updated_at = NOW()
    RETURNING * INTO log_record;
    
    RETURN NEXT log_record;
  END LOOP;
  
  RETURN;
END;
$$;


ALTER FUNCTION "public"."calculate_reorder_points"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_specific_reorder_point"("p_inventory_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_company_uuid" "uuid") RETURNS "public"."reorder_point_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  inventory_item RECORD;
  avg_daily_sales DECIMAL(10, 2);
  lead_time DECIMAL(10, 2);
  safety_stock DECIMAL(10, 2);
  reorder_point DECIMAL(10, 2);
  current_stock DECIMAL(10, 2);
  max_daily_sales DECIMAL(10, 2);
  stock_status VARCHAR(20);
  custom_safety DECIMAL(10, 2);
  item_unit VARCHAR(20);
  log_record "reorder_point_logs"%ROWTYPE;
BEGIN
  -- Get the specific inventory item data
  SELECT 
    wi.uuid as warehouse_inventory_uuid,
    wi.company_uuid,
    wi.warehouse_uuid,
    wi.inventory_uuid,
    i.unit -- Get the unit from inventory_items table
  INTO 
    inventory_item
  FROM 
    warehouse_inventory_items wi
  LEFT JOIN
    inventory_items i ON wi.inventory_uuid = i.uuid
  WHERE
    wi.inventory_uuid = p_inventory_uuid
    AND wi.warehouse_uuid = p_warehouse_uuid
    AND wi.company_uuid = p_company_uuid
  LIMIT 1;
  
  -- If no inventory item found, return null
  IF inventory_item IS NULL THEN
    RETURN NULL;
  END IF;
  
  item_unit := COALESCE(inventory_item.unit, 'units');
  
  -- Calculate current stock considering only individual units that are available
  SELECT 
    COALESCE(SUM(wiu.unit_value), 0)
  INTO 
    current_stock
  FROM 
    warehouse_inventory_item_unit wiu
  WHERE 
    wiu.warehouse_inventory_uuid = inventory_item.warehouse_inventory_uuid
    AND wiu.status = 'AVAILABLE';
  
  -- Get average daily sales (from delivery_items) - WAREHOUSE SPECIFIC
  SELECT 
    COALESCE(SUM(dib.unit_value), 0) / GREATEST(DATE_PART('day', NOW() - MIN(di.created_at)), 1)
  INTO 
    avg_daily_sales
  FROM 
    delivery_items di
  JOIN
    warehouse_inventory_item_bulk dib ON di.uuid = dib.delivery_uuid
  WHERE 
    di.inventory_uuid = inventory_item.inventory_uuid
    AND di.company_uuid = inventory_item.company_uuid
    AND di.warehouse_uuid = inventory_item.warehouse_uuid
    AND di.status = 'DELIVERED'
    AND di.created_at >= NOW() - INTERVAL '90 days';
  
  -- Get maximum daily sales - WAREHOUSE SPECIFIC
  SELECT 
    COALESCE(MAX(daily_total), 0)
  INTO 
    max_daily_sales
  FROM (
    SELECT 
      DATE_TRUNC('day', di.created_at) as sale_date,
      SUM(dib.unit_value) as daily_total
    FROM 
      delivery_items di
    JOIN
      warehouse_inventory_item_bulk dib ON di.uuid = dib.delivery_uuid
    WHERE 
      di.inventory_uuid = inventory_item.inventory_uuid
      AND di.company_uuid = inventory_item.company_uuid
      AND di.warehouse_uuid = inventory_item.warehouse_uuid
      AND di.status = 'DELIVERED'
      AND di.created_at >= NOW() - INTERVAL '90 days'
    GROUP BY 
      DATE_TRUNC('day', di.created_at)
  ) daily_sales;
  
  -- Get average lead time (time between order creation and delivery) - WAREHOUSE SPECIFIC
  SELECT 
    COALESCE(AVG(
      EXTRACT(EPOCH FROM (
        -- Find the timestamp when status changed to DELIVERED
        (SELECT MIN(k::TIMESTAMP) 
         FROM jsonb_object_keys(status_history) k 
         WHERE status_history->k = '"DELIVERED"')
        - created_at
      )) / 86400  -- Convert seconds to days
    ), 5) -- Default to 5 days if no data
  INTO 
    lead_time
  FROM 
    delivery_items
  WHERE 
    inventory_uuid = inventory_item.inventory_uuid
    AND company_uuid = inventory_item.company_uuid
    AND warehouse_uuid = inventory_item.warehouse_uuid
    AND status = 'DELIVERED'
    AND created_at >= NOW() - INTERVAL '90 days';
  
  -- Check if a custom safety stock exists
  SELECT 
    custom_safety_stock
  INTO 
    custom_safety
  FROM 
    "reorder_point_logs"
  WHERE 
    inventory_uuid = inventory_item.inventory_uuid
    AND company_uuid = inventory_item.company_uuid
    AND warehouse_uuid = inventory_item.warehouse_uuid
  ORDER BY 
    updated_at DESC
  LIMIT 1;
  
  -- Calculate safety stock (either use custom or calculate)
  IF custom_safety IS NOT NULL THEN
    safety_stock := custom_safety;
  ELSE
    safety_stock := (max_daily_sales - avg_daily_sales) * lead_time;
    IF safety_stock < 0 THEN
      safety_stock := 0;
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
  INSERT INTO "reorder_point_logs" (
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
    custom_safety_stock,
    unit
  ) VALUES (
    inventory_item.company_uuid,
    inventory_item.warehouse_uuid,
    inventory_item.inventory_uuid,
    inventory_item.warehouse_inventory_uuid,
    current_stock,
    avg_daily_sales,
    lead_time,
    safety_stock,
    reorder_point,
    stock_status,
    custom_safety,
    item_unit
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
    updated_at = NOW()
  RETURNING * INTO log_record;
  
  RETURN log_record;
END;
$$;


ALTER FUNCTION "public"."calculate_specific_reorder_point"("p_inventory_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_company_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_delete_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
  user_info RECORD;
  entity_name TEXT;
  details_json JSONB;
  notification_type TEXT;
  company_id UUID;
  is_admin_only BOOLEAN;
  username TEXT;
BEGIN
  -- Default admin_only to false
  is_admin_only := false;

  -- Get current user information from auth.uid()
  SELECT uuid, full_name, email INTO user_info FROM public.profiles 
  WHERE uuid = auth.uid();

  -- Set a default username if full_name is NULL (for registration flow)
  IF user_info.full_name IS NULL THEN
    -- Use email if available, otherwise 'New User'
    username := COALESCE(user_info.email, 'New User');
  ELSE
    username := user_info.full_name;
  END IF;

  -- Set notification type based on the table
  CASE TG_TABLE_NAME
    WHEN 'inventory_items' THEN 
      notification_type := 'inventory';
      entity_name := OLD.name;
      company_id := OLD.company_uuid;
      details_json := jsonb_build_object(
        -- 'item_code', OLD.item_code
      );
    WHEN 'warehouses' THEN 
      notification_type := 'warehouse';
      entity_name := OLD.name;
      company_id := OLD.company_uuid;
      details_json := '{}'::jsonb;
    WHEN 'profiles' THEN 
      notification_type := 'profile';
      entity_name := OLD.full_name;
      company_id := OLD.company_uuid;
      details_json := '{}'::jsonb;
      -- User deletion should be admin-only notification
      is_admin_only := true;
    WHEN 'companies' THEN 
      notification_type := 'company';
      entity_name := OLD.name;
      company_id := OLD.uuid;
      details_json := '{}'::jsonb;
      -- Company notifications are always admin-only
      is_admin_only := true;
    WHEN 'delivery_items' THEN 
      notification_type := 'delivery';
      
      -- For delivery items, try to get inventory name if possible
      SELECT name INTO entity_name FROM public.inventory_items 
      WHERE uuid = OLD.inventory_uuid;
      
      IF entity_name IS NULL THEN
        entity_name := 'Delivery Item';
      END IF;
      
      company_id := OLD.company_uuid;
      details_json := jsonb_build_object(
        'status', 'DELETED'
      );
    ELSE
      entity_name := 'Unknown';
      company_id := NULL;
      details_json := '{}'::jsonb;
  END CASE;

  -- Insert a notification record for deletion
  INSERT INTO public.notifications (
    type, action, entity_id, entity_name, details, 
    company_uuid, user_uuid, user_name, is_admin_only
  ) VALUES (
    notification_type, 'delete', OLD.uuid, entity_name, details_json,
    company_id, user_info.uuid, username, is_admin_only
  );
  
  RETURN OLD;
END;$$;


ALTER FUNCTION "public"."create_delete_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
  user_info RECORD;
  entity_name TEXT;
  details_json JSONB;
  notification_type TEXT;
  company_id UUID;
  is_admin_only BOOLEAN;
  username TEXT;
BEGIN
  -- Get current user information from auth.uid()
  SELECT uuid, full_name, email INTO user_info FROM public.profiles 
  WHERE uuid = auth.uid();
  
  -- Default admin_only to false
  is_admin_only := false;

  -- Set a default username if full_name is NULL (for registration flow)
  IF user_info.full_name IS NULL THEN
    -- Use email if available, otherwise 'New User'
    username := COALESCE(user_info.email, 'New User');
  ELSE
    username := user_info.full_name;
  END IF;

  -- Set notification type and admin_only flag based on the table and action
  CASE TG_TABLE_NAME
    WHEN 'inventory_items' THEN 
      notification_type := 'inventory';
      entity_name := NEW.name;
      company_id := NEW.company_uuid;
      details_json := jsonb_build_object(
        -- 'item_code', NEW.item_code,
        -- 'bulk_quantity', NEW.bulk_quantity,
        -- 'quantity', NEW.quantity,
        -- 'bulk_unit', NEW.bulk_unit,
        -- 'unit', NEW.unit
      );
      
      -- Make variance notifications admin-only
      IF TG_OP = 'UPDATE' AND (OLD.variance <> NEW.variance OR (OLD.variance IS NULL AND NEW.variance IS NOT NULL)) THEN
        is_admin_only := true;
      END IF;
      
    WHEN 'warehouses' THEN 
      notification_type := 'warehouse';
      entity_name := NEW.name;
      company_id := NEW.company_uuid;
      details_json := jsonb_build_object(
        'address', NEW.address
      );
    WHEN 'profiles' THEN 
      notification_type := 'profile';
      entity_name := NEW.full_name;
      company_id := NEW.company_uuid;
      details_json := jsonb_build_object(
        'email', NEW.email,
        'is_admin', NEW.is_admin
      );
      
      -- Admin status changes should be admin-only
      IF TG_OP = 'UPDATE' AND OLD.is_admin <> NEW.is_admin THEN
        is_admin_only := true;
      END IF;
      
    WHEN 'companies' THEN 
      notification_type := 'company';
      entity_name := NEW.name;
      company_id := NEW.uuid;
      details_json := jsonb_build_object(
        'address', NEW.address
      );
      -- Company notifications are always admin-only
      is_admin_only := true;
      
    WHEN 'delivery_items' THEN 
      notification_type := 'delivery';
      
      -- For delivery items, we need to get the inventory item name
      SELECT name INTO entity_name FROM public.inventory_items 
      WHERE uuid = NEW.inventory_uuid;
      
      company_id := NEW.company_uuid;
      details_json := jsonb_build_object(
        'recipient_name', NEW.recipient_name,
        'status', NEW.status,
        'delivery_date', NEW.delivery_date
      );
    ELSE
      entity_name := 'Unknown';
      company_id := NULL;
      details_json := '{}'::jsonb;
  END CASE;

  -- Determine the action type
  IF TG_OP = 'INSERT' THEN
    -- Insert a notification record
    INSERT INTO public.notifications (
      type, action, entity_id, entity_name, details, 
      company_uuid, user_uuid, user_name, is_admin_only
    ) VALUES (
      notification_type, 'create', NEW.uuid, entity_name, details_json,
      company_id, user_info.uuid, username, is_admin_only
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Insert a notification record
    INSERT INTO public.notifications (
      type, action, entity_id, entity_name, details, 
      company_uuid, user_uuid, user_name, is_admin_only
    ) VALUES (
      notification_type, 'update', NEW.uuid, entity_name, details_json,
      company_id, user_info.uuid, username, is_admin_only
    );
  END IF;
  
  RETURN NEW;
END;$$;


ALTER FUNCTION "public"."create_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_account"("user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_email TEXT;
  company_id UUID;
BEGIN
  -- Get user email and company UUID
  SELECT email, (company->>'uuid')::UUID INTO user_email, company_id
  FROM public.profiles
  WHERE uuid = user_id;
  
  -- Delete profile images
  PERFORM storage.delete_path('profile-images', 'profiles/' || user_email);
  
  -- Delete user profile (will cascade to auth.users due to FK constraint)
  DELETE FROM auth.users WHERE id = user_id;
END;
$$;


ALTER FUNCTION "public"."delete_user_account"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_location_code"("location" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  floor_num TEXT;
  column_letter TEXT;
  row_num TEXT;
  depth_num TEXT;
  group_num TEXT;
  column_num INT;
BEGIN
  IF location IS NULL OR location::text = '{}'::text THEN
    RETURN NULL;
  END IF;
  
  floor_num = LPAD(COALESCE(location->>'floor', '0'), 2, '0');
  column_num = COALESCE((location->>'column')::int, 0);
  column_letter = CHR(65 + FLOOR(column_num / 26)) || CHR(65 + (column_num % 26));
  row_num = LPAD(COALESCE(location->>'row', '0'), 2, '0');
  depth_num = LPAD(COALESCE(location->>'depth', '0'), 2, '0');
  group_num = LPAD(COALESCE(location->>'group', '0'), 2, '0');
  
  RETURN CONCAT('F', floor_num, column_letter, row_num, 'D', depth_num, 'C', group_num);
END;
$$;


ALTER FUNCTION "public"."generate_location_code"("location" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "logo_image" "text",
    "description" "text"
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


COMMENT ON TABLE "public"."companies" IS 'Stores company information for users';



CREATE OR REPLACE FUNCTION "public"."get_accessible_companies"("user_id" "uuid") RETURNS SETOF "public"."companies"
    LANGUAGE "sql" STABLE SECURITY DEFINER
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


ALTER FUNCTION "public"."get_accessible_companies"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_address_dropdown_data"("target_reg_code" "text" DEFAULT NULL::"text", "target_prov_code" "text" DEFAULT NULL::"text", "target_citymun_code" "text" DEFAULT NULL::"text") RETURNS "json"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'regions', (
      SELECT json_agg(
        json_build_object(
          'regCode', "regCode"::text,
          'regDesc', "regDesc"
        ) ORDER BY "regDesc"
      )
      FROM address_region
    ),
    'provinces', (
      CASE 
        WHEN target_reg_code IS NOT NULL THEN (
          SELECT json_agg(
            json_build_object(
              'regCode', "regCode"::text,
              'provCode', "provCode"::text, 
              'provDesc', "provDesc"
            ) ORDER BY "provDesc"
          )
          FROM address_province
          WHERE "regCode"::text = target_reg_code
        )
        ELSE '[]'::json
      END
    ),
    'cities', (
      CASE 
        WHEN target_prov_code IS NOT NULL THEN (
          SELECT json_agg(
            json_build_object(
              'regCode', "regCode"::text,
              'provCode', "provCode"::text,
              'citymunCode', "citymunCode"::text,
              'citymunDesc', "citymunDesc"
            ) ORDER BY "citymunDesc"
          )
          FROM address_citymun
          WHERE "provCode"::text = target_prov_code
        )
        ELSE '[]'::json
      END
    ),
    'barangays', (
      CASE 
        WHEN target_citymun_code IS NOT NULL THEN (
          SELECT json_agg(
            json_build_object(
              'regCode', "regCode"::text,
              'provCode', "provCode"::text,
              'citymunCode', "citymunCode"::text,
              'brgyCode', "brgyCode"::text,
              'brgyDesc', UPPER("brgyDesc")
            ) ORDER BY "brgyDesc"
          )
          FROM address_brgy
          WHERE "citymunCode"::text = target_citymun_code
        )
        ELSE '[]'::json
      END
    )
  ) INTO result;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_address_dropdown_data"("target_reg_code" "text", "target_prov_code" "text", "target_citymun_code" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_item_bulk" (
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "inventory_uuid" "uuid" NOT NULL,
    "unit" "text" NOT NULL,
    "unit_value" numeric NOT NULL,
    "bulk_unit" "text" NOT NULL,
    "cost" numeric DEFAULT 0 NOT NULL,
    "is_single_item" boolean DEFAULT false NOT NULL,
    "properties" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'AVAILABLE'::"text",
    "description" "text",
    CONSTRAINT "inventory_item_bulk_unit_value_check" CHECK (("unit_value" > (0)::numeric))
);


ALTER TABLE "public"."inventory_item_bulk" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_inventory_bulks"("inventory_id" "uuid") RETURNS SETOF "public"."inventory_item_bulk"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM inventory_item_bulk
  WHERE inventory_uuid = inventory_id
  AND (status IS NULL OR status != 'IN_WAREHOUSE');
END;
$$;


ALTER FUNCTION "public"."get_available_inventory_bulks"("inventory_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_companies_for_registration"() RETURNS TABLE("uuid" "uuid", "name" "text", "address" "jsonb")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT uuid, name, address FROM companies;
$$;


ALTER FUNCTION "public"."get_companies_for_registration"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_complete_address_data"("citymun_code" "text") RETURNS "json"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'region', json_build_object('regCode', r."regCode", 'regDesc', r."regDesc"),
    'province', json_build_object('provCode', p."provCode", 'provDesc', p."provDesc"),
    'cityMunicipality', json_build_object('citymunCode', c."citymunCode", 'citymunDesc', c."citymunDesc"),
    'barangays', (
      SELECT json_agg(json_build_object('brgyCode', b."brgyCode", 'brgyDesc', UPPER(b."brgyDesc")))
      FROM address_brgy b
      WHERE b."citymunCode" = c."citymunCode"
      ORDER BY b."brgyDesc"
    )
  ) INTO result
  FROM address_citymun c
  JOIN address_province p ON c."provCode" = p."provCode"
  JOIN address_region r ON p."regCode" = r."regCode"
  WHERE c."citymunCode" = citymun_code;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_complete_address_data"("citymun_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_delivery_counts"("company_id" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
BEGIN
  WITH status_counts AS (
    SELECT
      status,
      COUNT(*) as count
    FROM
      delivery_items
    WHERE
      company_uuid = company_id
    GROUP BY
      status
  )
  SELECT json_build_object(
    'PENDING', COALESCE((SELECT count FROM status_counts WHERE status = 'PENDING'), 0),
    'PROCESSING', COALESCE((SELECT count FROM status_counts WHERE status = 'PROCESSING'), 0),
    'IN_TRANSIT', COALESCE((SELECT count FROM status_counts WHERE status = 'IN_TRANSIT'), 0),
    'DELIVERED', COALESCE((SELECT count FROM status_counts WHERE status = 'DELIVERED'), 0),
    'CONFIRMED', COALESCE((SELECT count FROM status_counts WHERE status = 'CONFIRMED'), 0),
    'CANCELLED', COALESCE((SELECT count FROM status_counts WHERE status = 'CANCELLED'), 0),
    'total', (SELECT COUNT(*) FROM delivery_items WHERE company_uuid = company_id)
  ) INTO result;
    
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_delivery_counts"("company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_delivery_performance"("company_id" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
  daily_completed INT;
  daily_total INT;
  weekly_completed INT;
  weekly_total INT;
  monthly_completed INT;
  monthly_total INT;
BEGIN
  -- Daily delivery performance
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'CONFIRMED')),
    COUNT(*)
  INTO 
    daily_completed, daily_total
  FROM 
    delivery_items
  WHERE 
    company_uuid = company_id AND
    delivery_date = CURRENT_DATE;
  
  -- Weekly delivery performance
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'CONFIRMED')),
    COUNT(*)
  INTO 
    weekly_completed, weekly_total
  FROM 
    delivery_items
  WHERE 
    company_uuid = company_id AND
    delivery_date BETWEEN 
      DATE_TRUNC('week', CURRENT_DATE)::DATE AND
      (DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '6 days')::DATE;
      
  -- Monthly delivery performance
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('DELIVERED', 'CONFIRMED')),
    COUNT(*)
  INTO 
    monthly_completed, monthly_total
  FROM 
    delivery_items
  WHERE 
    company_uuid = company_id AND
    delivery_date BETWEEN 
      DATE_TRUNC('month', CURRENT_DATE)::DATE AND
      (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
  
  SELECT json_build_object(
    'daily', CASE WHEN daily_total = 0 THEN 0 ELSE ROUND((daily_completed::NUMERIC / daily_total) * 100, 1) END,
    'weekly', CASE WHEN weekly_total = 0 THEN 0 ELSE ROUND((weekly_completed::NUMERIC / weekly_total) * 100, 1) END,
    'monthly', CASE WHEN monthly_total = 0 THEN 0 ELSE ROUND((monthly_completed::NUMERIC / monthly_total) * 100, 1) END,
    'daily_completed', daily_completed,
    'daily_total', daily_total,
    'weekly_completed', weekly_completed,
    'weekly_total', weekly_total,
    'monthly_completed', monthly_completed,
    'monthly_total', monthly_total
  ) INTO result;
    
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_delivery_performance"("company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_inventory_stats"("company_id" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
  -- Inventory counts
  total_count INT;
  available_unit INT;
  available_bulk INT;
  in_warehouse_unit INT;
  in_warehouse_bulk INT;
  total_units INT;
  total_bulks INT;
  active_units INT;
  active_bulks INT;
  -- Warehouse counts
  warehouse_items_count INT;
  warehouse_bulks_count INT;
  warehouse_units_count INT;
  -- JSON results
  top_items_json JSON;
  top_warehouse_items_json JSON;
BEGIN
  -- Get total inventory items count
  SELECT COUNT(*) INTO total_count
  FROM inventory_items
  WHERE company_uuid = company_id;
  
  -- Get total bulks count (all bulks)
  SELECT COUNT(*) INTO total_bulks
  FROM inventory_item_bulk
  WHERE company_uuid = company_id;
  
  -- Get active bulks count (excluding IN_WAREHOUSE)
  SELECT COUNT(*) INTO active_bulks
  FROM inventory_item_bulk
  WHERE company_uuid = company_id
    AND (status IS NULL OR status != 'IN_WAREHOUSE');
  
  -- Get total units count (all units)
  SELECT COUNT(*) INTO total_units
  FROM inventory_item_unit
  WHERE company_uuid = company_id;
  
  -- Get active units count (excluding IN_WAREHOUSE)
  SELECT COUNT(*) INTO active_units
  FROM inventory_item_unit
  WHERE company_uuid = company_id
    AND (status IS NULL OR status != 'IN_WAREHOUSE');
  
  -- Get available units count
  SELECT COUNT(*) INTO available_unit
  FROM inventory_item_unit
  WHERE company_uuid = company_id
    AND status = 'AVAILABLE';

  -- Get available bulks count
  SELECT COUNT(*) INTO available_bulk
  FROM inventory_item_bulk
  WHERE company_uuid = company_id
    AND status = 'AVAILABLE';
    
  -- Get units in warehouse count
  SELECT COUNT(*) INTO in_warehouse_unit
  FROM inventory_item_unit
  WHERE company_uuid = company_id
    AND status = 'IN_WAREHOUSE';

  -- Get bulks in warehouse count
  SELECT COUNT(*) INTO in_warehouse_bulk
  FROM inventory_item_bulk
  WHERE company_uuid = company_id
    AND status = 'IN_WAREHOUSE';
    
  -- Get warehouse inventory counts
  SELECT COUNT(*) INTO warehouse_items_count
  FROM warehouse_inventory_items
  WHERE company_uuid = company_id;
  
  SELECT COUNT(*) INTO warehouse_bulks_count
  FROM warehouse_inventory_item_bulk
  WHERE company_uuid = company_id;
  
  SELECT COUNT(*) INTO warehouse_units_count
  FROM warehouse_inventory_item_unit
  WHERE company_uuid = company_id;
  
  -- Get top 5 inventory items with enhanced information
  -- Using separate CTEs for better accuracy when counting
  WITH bulk_stats AS (
    -- First get stats from bulks excluding IN_WAREHOUSE
    SELECT 
      b.inventory_uuid,
      COUNT(b.uuid) FILTER (WHERE b.status IS NULL OR b.status != 'IN_WAREHOUSE') as bulk_count,
      COALESCE(SUM(b.unit_value) FILTER (WHERE b.status IS NULL OR b.status != 'IN_WAREHOUSE'), 0) as total_bulk_value,
      STRING_AGG(DISTINCT b.status, ', ') FILTER (WHERE b.status IS NOT NULL) as bulk_statuses
    FROM 
      inventory_item_bulk b
    WHERE 
      b.company_uuid = company_id
    GROUP BY 
      b.inventory_uuid
  ),
  unit_stats AS (
    -- Then get stats from units excluding IN_WAREHOUSE
    SELECT 
      u.inventory_uuid,
      COUNT(u.uuid) FILTER (WHERE u.status IS NULL OR u.status != 'IN_WAREHOUSE') as units_count
    FROM 
      inventory_item_unit u
    WHERE 
      u.company_uuid = company_id
    GROUP BY 
      u.inventory_uuid
  ),
  item_stats AS (
    -- Finally join with inventory items
    SELECT 
      i.uuid,
      i.name,
      i.unit, -- Removed explicit cast to fix type issue
      COALESCE(b.bulk_count, 0) as bulk_count,
      COALESCE(b.total_bulk_value, 0) as total_bulk_value,
      COALESCE(u.units_count, 0) as units_count,
      COALESCE(b.bulk_statuses, '') as bulk_statuses
    FROM 
      inventory_items i
      LEFT JOIN bulk_stats b ON i.uuid = b.inventory_uuid
      LEFT JOIN unit_stats u ON i.uuid = u.inventory_uuid
    WHERE 
      i.company_uuid = company_id
  ),
  top_items AS (
    SELECT 
      uuid,
      name,
      unit,
      bulk_count,
      total_bulk_value,
      units_count,
      bulk_statuses
    FROM 
      item_stats
    WHERE units_count > 0
    ORDER BY 
      units_count DESC
    LIMIT 5
  )
  SELECT json_agg(
    json_build_object(
      'uuid', uuid,
      'name', name,
      'unit', unit,
      'bulk_count', bulk_count,
      'total_bulk_value', total_bulk_value,
      'units_count', units_count,
      'bulk_statuses', bulk_statuses
    )
  ) INTO top_items_json
  FROM top_items;
  
  -- Get top 5 warehouse inventory items
  WITH warehouse_bulk_stats AS (
    SELECT 
      wb.warehouse_inventory_uuid,
      COUNT(wb.uuid) as bulk_count,
      COALESCE(SUM(wb.unit_value), 0) as total_bulk_value,
      STRING_AGG(DISTINCT wb.status, ', ') FILTER (WHERE wb.status IS NOT NULL) as bulk_statuses
    FROM 
      warehouse_inventory_item_bulk wb
    WHERE 
      wb.company_uuid = company_id
    GROUP BY 
      wb.warehouse_inventory_uuid
  ),
  warehouse_unit_stats AS (
    SELECT 
      wu.warehouse_inventory_uuid,
      COUNT(wu.uuid) as units_count
    FROM 
      warehouse_inventory_item_unit wu
    WHERE 
      wu.company_uuid = company_id
    GROUP BY 
      wu.warehouse_inventory_uuid
  ),
  warehouse_item_stats AS (
    SELECT 
      wi.uuid,
      wi.name,
      wi.unit,
      wi.warehouse_uuid,
      (SELECT name FROM warehouses w WHERE w.uuid = wi.warehouse_uuid) as warehouse_name,
      COALESCE(wb.bulk_count, 0) as bulk_count,
      COALESCE(wb.total_bulk_value, 0) as total_bulk_value,
      COALESCE(wu.units_count, 0) as units_count,
      COALESCE(wb.bulk_statuses, '') as bulk_statuses
    FROM 
      warehouse_inventory_items wi
      LEFT JOIN warehouse_bulk_stats wb ON wi.uuid = wb.warehouse_inventory_uuid
      LEFT JOIN warehouse_unit_stats wu ON wi.uuid = wu.warehouse_inventory_uuid
    WHERE 
      wi.company_uuid = company_id
  ),
  top_warehouse_items AS (
    SELECT 
      uuid,
      name,
      unit,
      warehouse_uuid,
      warehouse_name,
      bulk_count,
      total_bulk_value,
      units_count,
      bulk_statuses
    FROM 
      warehouse_item_stats
    ORDER BY 
      units_count DESC
    LIMIT 5
  )
  SELECT json_agg(
    json_build_object(
      'uuid', uuid,
      'name', name,
      'unit', unit,
      'warehouse_uuid', warehouse_uuid,
      'warehouse_name', warehouse_name,
      'bulk_count', bulk_count,
      'total_bulk_value', total_bulk_value,
      'units_count', units_count,
      'bulk_statuses', bulk_statuses
    )
  ) INTO top_warehouse_items_json
  FROM top_warehouse_items;
  
  -- Build final result
  SELECT json_build_object(
    -- Inventory stats
    'total_items', total_count,
    'total_units', total_units,
    'total_bulks', total_bulks,
    'active_units', active_units,
    'active_bulks', active_bulks,
    'available_units', available_unit,
    'available_bulks', available_bulk,
    'reserved_units', (active_units - available_unit),
    'reserved_bulks', (active_bulks - available_bulk),
    'in_warehouse_units', in_warehouse_unit,
    'in_warehouse_bulks', in_warehouse_bulk,
    'top_items', COALESCE(top_items_json, '[]'::json),
    
    -- Warehouse stats
    'warehouse_items_count', warehouse_items_count,
    'warehouse_bulks_count', warehouse_bulks_count,
    'warehouse_units_count', warehouse_units_count,
    'top_warehouse_items', COALESCE(top_warehouse_items_json, '[]'::json)
  ) INTO result;
    
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_inventory_stats"("company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_monthly_revenue"("company_id" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
  current_month_revenue NUMERIC;
  previous_month_revenue NUMERIC;
  percent_change NUMERIC;
BEGIN
  -- Calculate current month revenue from delivered items
  SELECT 
    COALESCE(SUM(i.ending_inventory), 0) INTO current_month_revenue
  FROM 
    delivery_items d
    JOIN inventory_items i ON d.inventory_uuid = i.uuid
  WHERE 
    d.company_uuid = company_id AND
    d.status IN ('DELIVERED', 'CONFIRMED') AND
    d.delivery_date BETWEEN 
      DATE_TRUNC('month', CURRENT_DATE)::DATE AND
      (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
  
  -- Calculate previous month revenue
  SELECT 
    COALESCE(SUM(i.ending_inventory), 0) INTO previous_month_revenue
  FROM 
    delivery_items d
    JOIN inventory_items i ON d.inventory_uuid = i.uuid
  WHERE 
    d.company_uuid = company_id AND
    d.status IN ('DELIVERED', 'CONFIRMED') AND
    d.delivery_date BETWEEN 
      DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::DATE AND
      (DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') + INTERVAL '1 month - 1 day')::DATE;
      
  -- Calculate percentage change
  IF previous_month_revenue = 0 THEN
    percent_change := NULL;
  ELSE
    percent_change := ROUND(((current_month_revenue - previous_month_revenue) / previous_month_revenue) * 100, 1);
  END IF;
  
  SELECT json_build_object(
    'current_month', current_month_revenue,
    'previous_month', previous_month_revenue,
    'percent_change', percent_change
  ) INTO result;
    
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_monthly_revenue"("company_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "type" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "entity_name" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "read" boolean DEFAULT false NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "user_uuid" "uuid",
    "user_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_admin_only" boolean DEFAULT false,
    CONSTRAINT "notifications_action_check" CHECK (("action" = ANY (ARRAY['create'::"text", 'update'::"text", 'delete'::"text"]))),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['inventory'::"text", 'warehouse'::"text", 'profile'::"text", 'company'::"text", 'delivery'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_recent_notifications"("company_id" "uuid") RETURNS SETOF "public"."notifications"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT * FROM notifications
  WHERE company_uuid = company_id
  ORDER BY created_at DESC
  LIMIT 3;
$$;


ALTER FUNCTION "public"."get_dashboard_recent_notifications"("company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_reorder_points"("company_id" "uuid") RETURNS TABLE("uuid" "uuid", "name" "text", "current_stock" numeric, "reorder_point" numeric, "status" character varying)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH latest_logs AS (
    SELECT DISTINCT ON (rpl.inventory_uuid)
      rpl.inventory_uuid,
      rpl.current_stock,
      rpl.reorder_point,
      rpl.status
    FROM 
      reorder_point_logs rpl
    WHERE 
      rpl.company_uuid = company_id
    ORDER BY 
      rpl.inventory_uuid, rpl.updated_at DESC
  )
  SELECT 
    i.uuid,
    i.name,
    l.current_stock,
    l.reorder_point,
    l.status
  FROM 
    latest_logs l
    JOIN inventory_items i ON l.inventory_uuid = i.uuid
  WHERE 
    l.current_stock <= l.reorder_point
  ORDER BY 
    CASE l.status
      WHEN 'OUT_OF_STOCK' THEN 1
      WHEN 'CRITICAL' THEN 2
      WHEN 'WARNING' THEN 3
      WHEN 'IN_STOCK' THEN 4
      ELSE 5
    END ASC,
    (l.current_stock / NULLIF(l.reorder_point, 0)) ASC
  LIMIT 10;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_reorder_points"("company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_warehouse_items_stats"("company_id" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result JSON;
  total_count INT;
  by_warehouse_json JSON;
BEGIN
  -- Get total warehouse inventory items count
  SELECT COUNT(*) INTO total_count
  FROM warehouse_inventory_items
  WHERE company_uuid = company_id;
  
  -- Get warehouse item counts by warehouse
  WITH warehouse_counts AS (
    SELECT
      w.name as warehouse_name,
      w.uuid as warehouse_uuid,
      COUNT(wi.uuid) as item_count
    FROM
      warehouses w
      LEFT JOIN warehouse_inventory_items wi ON w.uuid = wi.warehouse_uuid
    WHERE
      w.company_uuid = company_id
    GROUP BY
      w.uuid, w.name
    ORDER BY
      item_count DESC
  )
  SELECT json_agg(
    json_build_object(
      'warehouse_name', warehouse_name,
      'warehouse_uuid', warehouse_uuid,
      'item_count', item_count
    )
  ) INTO by_warehouse_json
  FROM warehouse_counts;
  
  SELECT json_build_object(
    'total_count', total_count,
    'by_warehouse', COALESCE(by_warehouse_json, '[]'::json)
  ) INTO result;
    
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_warehouse_items_stats"("company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_delivery_items"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT ''::"text", "p_status" "text" DEFAULT NULL::"text", "p_warehouse_uuid" "uuid" DEFAULT NULL::"uuid", "p_operator_uuids" "uuid"[] DEFAULT NULL::"uuid"[], "p_inventory_uuid" "uuid" DEFAULT NULL::"uuid", "p_date_from" "date" DEFAULT NULL::"date", "p_date_to" "date" DEFAULT NULL::"date", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("uuid" "uuid", "admin_uuid" "uuid", "company_uuid" "uuid", "inventory_uuid" "uuid", "warehouse_uuid" "uuid", "inventory_item_bulk_uuids" "text"[], "name" "text", "delivery_address" "text", "delivery_date" "date", "notes" "text", "status" "text", "status_history" "jsonb", "locations" "jsonb"[], "location_codes" "text"[], "operator_uuids" "uuid"[], "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "inventory_items" "jsonb", "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  total_rows BIGINT;
BEGIN
  -- First get the total count
  SELECT COUNT(*) INTO total_rows
  FROM delivery_items di
  LEFT JOIN inventory_items inv ON di.inventory_uuid = inv.uuid
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
      OR di.delivery_address ILIKE '%' || p_search || '%'
      OR di.notes ILIKE '%' || p_search || '%'
      OR di.status ILIKE '%' || p_search || '%'
      
      -- UUID fields (converted to text)
      OR di.uuid::text ILIKE '%' || p_search || '%'
      OR di.company_uuid::text ILIKE '%' || p_search || '%'
      OR di.admin_uuid::text ILIKE '%' || p_search || '%'
      OR di.warehouse_uuid::text ILIKE '%' || p_search || '%'
      OR di.inventory_uuid::text ILIKE '%' || p_search || '%'
      
      -- Array fields
      OR array_to_string(di.inventory_item_bulk_uuids, ',') ILIKE '%' || p_search || '%'
      OR array_to_string(di.location_codes, ',') ILIKE '%' || p_search || '%'
      OR array_to_string(di.operator_uuids::text[], ',') ILIKE '%' || p_search || '%'
      
      -- Inventory fields
      OR inv.name ILIKE '%' || p_search || '%'
      OR inv.description ILIKE '%' || p_search || '%'
      OR COALESCE(inv.unit, '') ILIKE '%' || p_search || '%'
    );

  -- Return the paginated results with total count
  RETURN QUERY
  SELECT 
    di.uuid,
    di.admin_uuid,
    di.company_uuid,
    di.inventory_uuid,
    di.warehouse_uuid,
    di.inventory_item_bulk_uuids,
    di.name,
    di.delivery_address,
    di.delivery_date,
    di.notes,
    di.status,
    di.status_history,
    di.locations,
    di.location_codes,
    di.operator_uuids,
    di.created_at,
    di.updated_at,
    to_jsonb(inv.*) as inventory_items,
    total_rows as total_count
  FROM delivery_items di
  LEFT JOIN inventory_items inv ON di.inventory_uuid = inv.uuid
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
      OR di.delivery_address ILIKE '%' || p_search || '%'
      OR di.notes ILIKE '%' || p_search || '%'
      OR di.status ILIKE '%' || p_search || '%'
      
      -- UUID fields (converted to text)
      OR di.uuid::text ILIKE '%' || p_search || '%'
      OR di.company_uuid::text ILIKE '%' || p_search || '%'
      OR di.admin_uuid::text ILIKE '%' || p_search || '%'
      OR di.warehouse_uuid::text ILIKE '%' || p_search || '%'
      OR di.inventory_uuid::text ILIKE '%' || p_search || '%'
      
      -- Array fields
      OR array_to_string(di.inventory_item_bulk_uuids, ',') ILIKE '%' || p_search || '%'
      OR array_to_string(di.location_codes, ',') ILIKE '%' || p_search || '%'
      OR array_to_string(di.operator_uuids::text[], ',') ILIKE '%' || p_search || '%'
      
      -- Inventory fields
      OR inv.name ILIKE '%' || p_search || '%'
      OR inv.description ILIKE '%' || p_search || '%'
      OR COALESCE(inv.unit, '') ILIKE '%' || p_search || '%'
    )
  ORDER BY di.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_delivery_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_warehouse_uuid" "uuid", "p_operator_uuids" "uuid"[], "p_inventory_uuid" "uuid", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inventory_item_details"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean DEFAULT false) RETURNS TABLE("uuid" "uuid", "company_uuid" "uuid", "admin_uuid" "uuid", "name" "text", "description" "text", "unit" "text", "status" "text", "properties" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "inventory_item_bulks" "jsonb")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ii.uuid,
    ii.company_uuid,
    ii.admin_uuid,  
    ii.name,
    ii.description,
    ii.unit,
    ii.status,
    ii.properties,
    ii.created_at,
    ii.updated_at,
    COALESCE(
      jsonb_agg(
        CASE 
          WHEN iib.uuid IS NOT NULL THEN
            jsonb_build_object(
              'uuid', iib.uuid,
              'company_uuid', iib.company_uuid,
              'inventory_uuid', iib.inventory_uuid,
              'unit', iib.unit,
              'unit_value', iib.unit_value,
              'bulk_unit', iib.bulk_unit,
              'cost', iib.cost,
              'is_single_item', iib.is_single_item,
              'properties', iib.properties,
              'status', iib.status,
              'created_at', iib.created_at,
              'updated_at', iib.updated_at,
              'inventory_item_units', COALESCE(bulk_units.units, '[]'::jsonb)
            )
          ELSE NULL
        END
      ) FILTER (WHERE iib.uuid IS NOT NULL), 
      '[]'::jsonb
    ) AS inventory_item_bulks
  FROM inventory_items ii
  LEFT JOIN inventory_item_bulk iib ON ii.uuid = iib.inventory_uuid
    AND (p_include_warehouse_items OR iib.status != 'IN_WAREHOUSE' OR iib.status IS NULL)
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'uuid', iiu.uuid,
        'company_uuid', iiu.company_uuid,
        'inventory_uuid', iiu.inventory_uuid,
        'inventory_item_bulk_uuid', iiu.inventory_item_bulk_uuid,
        'code', iiu.code,
        'unit_value', iiu.unit_value,
        'unit', iiu.unit,
        'name', iiu.name,
        'cost', iiu.cost,
        'properties', iiu.properties,
        'status', iiu.status,
        'created_at', iiu.created_at,
        'updated_at', iiu.updated_at
      )
    ) AS units
    FROM inventory_item_unit iiu
    WHERE iiu.inventory_item_bulk_uuid = iib.uuid
  ) bulk_units ON true
  WHERE ii.uuid = p_inventory_uuid
  GROUP BY 
    ii.uuid,
    ii.company_uuid,
    ii.admin_uuid,
    ii.name,
    ii.description,
    ii.unit,
    ii.status,
    ii.properties,
    ii.created_at,
    ii.updated_at;
END;
$$;


ALTER FUNCTION "public"."get_inventory_item_details"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "uuid" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "admin_uuid" "uuid" NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "inventory_item_bulks" "uuid"[] DEFAULT '{}'::"uuid"[],
    "netsuite" numeric,
    "variance" numeric,
    "ending_inventory" numeric,
    "status" "text",
    "properties" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "unit" "text"
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT ''::"text", "p_status" "text" DEFAULT NULL::"text", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer) RETURNS SETOF "public"."inventory_items"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT i.*
  FROM inventory_items i
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
      OR i.uuid::TEXT ILIKE '%' || p_search || '%'
      OR i.company_uuid::TEXT ILIKE '%' || p_search || '%'
      OR i.admin_uuid::TEXT ILIKE '%' || p_search || '%'
      OR i.status ILIKE '%' || p_search || '%'
      OR i.name ILIKE '%' || p_search || '%'
      OR i.description ILIKE '%' || p_search || '%'
      OR EXISTS (
        SELECT 1 
        FROM inventory_item_bulk b 
        WHERE b.inventory_uuid = i.uuid 
        AND b.uuid::TEXT ILIKE '%' || p_search || '%'
      )
    )
  ORDER BY i.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT ''::"text", "p_status" "text" DEFAULT NULL::"text", "p_admin_uuid" "uuid" DEFAULT NULL::"uuid", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer) RETURNS TABLE("like" "public"."inventory_items")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT i.*
  FROM inventory_items i
  WHERE (p_company_uuid IS NULL OR i.company_uuid = p_company_uuid)
    AND (p_status IS NULL OR i.status = p_status)
    AND (p_admin_uuid IS NULL OR i.admin_uuid = p_admin_uuid)
    AND (p_year IS NULL OR EXTRACT(YEAR FROM i.created_at) = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM i.created_at) = p_month)
    AND (p_week IS NULL OR EXTRACT(WEEK FROM i.created_at) = p_week)
    AND (p_day IS NULL OR EXTRACT(DAY FROM i.created_at) = p_day)
    AND (
      p_search = '' OR
      i.uuid::text ILIKE '%' || p_search || '%' OR
      COALESCE(i.name, '') ILIKE '%' || p_search || '%' OR
      COALESCE(i.description, '') ILIKE '%' || p_search || '%' OR
      COALESCE(i.status, '') ILIKE '%' || p_search || '%' OR
      i.company_uuid::text ILIKE '%' || p_search || '%' OR
      i.admin_uuid::text ILIKE '%' || p_search || '%' OR
      EXISTS (
        SELECT 1 FROM inventory_item_bulk 
        WHERE inventory_uuid = i.uuid 
        AND uuid::text ILIKE '%' || p_search || '%'
      )
    )
  ORDER BY i.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_admin_uuid" "uuid", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT ''::"text", "p_status" "text" DEFAULT NULL::"text", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 100, "p_offset" integer DEFAULT 0) RETURNS TABLE("uuid" "uuid", "company_uuid" "uuid", "admin_uuid" "uuid", "name" "text", "description" "text", "unit" "text", "inventory_item_bulks" "uuid"[], "inventory_item_bulks_length" integer, "status" "text", "properties" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "total_count" bigint)
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
    FROM inventory_items i
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
          FROM inventory_item_bulk b 
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
    fi.unit,
    (
      SELECT array_agg(b.uuid)
      FROM inventory_item_bulk b
      WHERE b.inventory_uuid = fi.uuid
    ) AS inventory_item_bulks,
    (
      SELECT COUNT(*)
      FROM inventory_item_bulk b
      WHERE b.inventory_uuid = fi.uuid
      AND (b.status IS NULL OR b.status != 'IN_WAREHOUSE')
    )::INT AS inventory_item_bulks_length,
    fi.status,
    fi.properties,
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


ALTER FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT ''::"text", "p_status" "text" DEFAULT NULL::"text", "p_admin_uuid" "uuid" DEFAULT NULL::"uuid", "p_date_from" "date" DEFAULT NULL::"date", "p_date_to" "date" DEFAULT NULL::"date", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer) RETURNS TABLE("like" "public"."inventory_items")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT i.*
  FROM inventory_items i
  WHERE (p_company_uuid IS NULL OR i.company_uuid = p_company_uuid)
    AND (p_status IS NULL OR i.status = p_status)
    AND (p_admin_uuid IS NULL OR i.admin_uuid = p_admin_uuid)
    AND (p_date_from IS NULL OR i.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR i.created_at::date <= p_date_to)
    AND (p_year IS NULL OR EXTRACT(YEAR FROM i.created_at) = p_year)
    AND (p_month IS NULL OR EXTRACT(MONTH FROM i.created_at) = p_month)
    AND (p_week IS NULL OR EXTRACT(WEEK FROM i.created_at) = p_week)
    AND (p_day IS NULL OR EXTRACT(DAY FROM i.created_at) = p_day)
    AND (
      p_search = '' OR
      i.uuid::text ILIKE '%' || p_search || '%' OR
      COALESCE(i.name, '') ILIKE '%' || p_search || '%' OR
      COALESCE(i.description, '') ILIKE '%' || p_search || '%' OR
      COALESCE(i.status, '') ILIKE '%' || p_search || '%' OR
      i.company_uuid::text ILIKE '%' || p_search || '%' OR
      i.admin_uuid::text ILIKE '%' || p_search || '%' OR
      EXISTS (
        SELECT 1 FROM inventory_item_bulk 
        WHERE inventory_uuid = i.uuid 
        AND uuid::text ILIKE '%' || p_search || '%'
      )
    )
  ORDER BY i.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_admin_uuid" "uuid", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reorder_point_logs"("warehouse_id" "uuid" DEFAULT NULL::"uuid", "status_filter" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."reorder_point_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  auth_uid UUID := auth.uid();
  company_id UUID;
BEGIN
  -- Get the company UUID for the authenticated user
  SELECT company_uuid INTO company_id FROM profiles WHERE uuid = auth_uid;
  
  -- Return filtered logs
  RETURN QUERY
  SELECT * FROM "reorder_point_logs"
  WHERE 
    company_uuid = company_id
    AND (warehouse_uuid = warehouse_id OR warehouse_id IS NULL)
    AND (status = status_filter OR status_filter IS NULL)
  ORDER BY
    CASE 
      WHEN status = 'OUT_OF_STOCK' THEN 1
      WHEN status = 'CRITICAL' THEN 2
      WHEN status = 'WARNING' THEN 3
      WHEN status = 'IN_STOCK' THEN 4
      ELSE 5
    END,
    updated_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_reorder_point_logs"("warehouse_id" "uuid", "status_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reorder_point_logs_paginated"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_warehouse_uuid" "uuid" DEFAULT NULL::"uuid", "p_status" "text" DEFAULT NULL::"text", "p_search" "text" DEFAULT ''::"text", "p_date_from" "date" DEFAULT NULL::"date", "p_date_to" "date" DEFAULT NULL::"date", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 10, "p_offset" integer DEFAULT 0) RETURNS TABLE("uuid" "uuid", "company_uuid" "uuid", "warehouse_uuid" "uuid", "inventory_uuid" "uuid", "warehouse_inventory_uuid" "uuid", "status" character varying, "unit" character varying, "current_stock" numeric, "average_daily_unit_sales" numeric, "lead_time_days" numeric, "safety_stock" numeric, "custom_safety_stock" numeric, "reorder_point" numeric, "notes" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "warehouse_name" "text", "warehouse_inventory_name" "text", "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_search_pattern TEXT;
  total_rows BIGINT;
BEGIN
  -- Prepare search pattern once for better performance
  v_search_pattern := '%' || COALESCE(p_search, '') || '%';
  
  -- First get the total count
  SELECT COUNT(*) INTO total_rows
  FROM reorder_point_logs rpl
  LEFT JOIN warehouses w ON w.uuid = rpl.warehouse_uuid
  LEFT JOIN warehouse_inventory_items wi ON wi.uuid = rpl.warehouse_inventory_uuid
  WHERE 
    -- Company filter
    (p_company_uuid IS NULL OR rpl.company_uuid = p_company_uuid)
    
    -- Warehouse filter
    AND (p_warehouse_uuid IS NULL OR rpl.warehouse_uuid = p_warehouse_uuid)
    
    -- Status filter
    AND (p_status IS NULL OR rpl.status = p_status)
    
    -- Date range filter (using created_at as primary date field)
    AND (p_date_from IS NULL OR rpl.created_at::DATE >= p_date_from)
    AND (p_date_to IS NULL OR rpl.created_at::DATE <= p_date_to)
    
    -- Year filter
    AND (p_year IS NULL OR EXTRACT(YEAR FROM rpl.created_at) = p_year)
    
    -- Month filter
    AND (p_month IS NULL OR EXTRACT(MONTH FROM rpl.created_at) = p_month)
    
    -- Week filter
    AND (p_week IS NULL OR EXTRACT(WEEK FROM rpl.created_at) = p_week)
    
    -- Day filter
    AND (p_day IS NULL OR EXTRACT(DAY FROM rpl.created_at) = p_day)
    
    -- Text search across multiple columns
    AND (
      p_search = '' 
      OR p_search IS NULL
      OR rpl.uuid::TEXT ILIKE v_search_pattern
      OR COALESCE(rpl.status, '') ILIKE v_search_pattern
      OR COALESCE(rpl.unit, '') ILIKE v_search_pattern
      OR rpl.current_stock::TEXT ILIKE v_search_pattern
      OR rpl.average_daily_unit_sales::TEXT ILIKE v_search_pattern
      OR rpl.lead_time_days::TEXT ILIKE v_search_pattern
      OR rpl.safety_stock::TEXT ILIKE v_search_pattern
      OR rpl.custom_safety_stock::TEXT ILIKE v_search_pattern
      OR rpl.reorder_point::TEXT ILIKE v_search_pattern
      OR COALESCE(rpl.notes, '') ILIKE v_search_pattern
      OR w.name ILIKE v_search_pattern
      OR wi.name ILIKE v_search_pattern
    );

  -- Return the paginated results with total count
  RETURN QUERY
  SELECT 
    rpl.uuid,
    rpl.company_uuid,
    rpl.warehouse_uuid,
    rpl.inventory_uuid,
    rpl.warehouse_inventory_uuid,
    rpl.status,
    rpl.unit,
    rpl.current_stock,
    rpl.average_daily_unit_sales,
    rpl.lead_time_days,
    rpl.safety_stock,
    rpl.custom_safety_stock,
    rpl.reorder_point,
    rpl.notes,
    rpl.created_at,
    rpl.updated_at,
    w.name AS warehouse_name,
    wi.name AS warehouse_inventory_name,
    total_rows AS total_count
  FROM reorder_point_logs rpl
  LEFT JOIN warehouses w ON w.uuid = rpl.warehouse_uuid
  LEFT JOIN warehouse_inventory_items wi ON wi.uuid = rpl.warehouse_inventory_uuid
  WHERE 
    -- Company filter
    (p_company_uuid IS NULL OR rpl.company_uuid = p_company_uuid)
    
    -- Warehouse filter
    AND (p_warehouse_uuid IS NULL OR rpl.warehouse_uuid = p_warehouse_uuid)
    
    -- Status filter
    AND (p_status IS NULL OR rpl.status = p_status)
    
    -- Date range filter (using created_at as primary date field)
    AND (p_date_from IS NULL OR rpl.created_at::DATE >= p_date_from)
    AND (p_date_to IS NULL OR rpl.created_at::DATE <= p_date_to)
    
    -- Year filter
    AND (p_year IS NULL OR EXTRACT(YEAR FROM rpl.created_at) = p_year)
    
    -- Month filter
    AND (p_month IS NULL OR EXTRACT(MONTH FROM rpl.created_at) = p_month)
    
    -- Week filter
    AND (p_week IS NULL OR EXTRACT(WEEK FROM rpl.created_at) = p_week)
    
    -- Day filter
    AND (p_day IS NULL OR EXTRACT(DAY FROM rpl.created_at) = p_day)
    
    -- Text search across multiple columns
    AND (
      p_search = '' 
      OR p_search IS NULL
      OR rpl.uuid::TEXT ILIKE v_search_pattern
      OR COALESCE(rpl.status, '') ILIKE v_search_pattern
      OR COALESCE(rpl.unit, '') ILIKE v_search_pattern
      OR rpl.current_stock::TEXT ILIKE v_search_pattern
      OR rpl.average_daily_unit_sales::TEXT ILIKE v_search_pattern
      OR rpl.lead_time_days::TEXT ILIKE v_search_pattern
      OR rpl.safety_stock::TEXT ILIKE v_search_pattern
      OR rpl.custom_safety_stock::TEXT ILIKE v_search_pattern
      OR rpl.reorder_point::TEXT ILIKE v_search_pattern
      OR COALESCE(rpl.notes, '') ILIKE v_search_pattern
      OR w.name ILIKE v_search_pattern
      OR wi.name ILIKE v_search_pattern
    )
  ORDER BY rpl.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_reorder_point_logs_paginated"("p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_status" "text", "p_search" "text", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_company"("user_uuid" "uuid") RETURNS TABLE("company_uuid" "uuid", "company_name" "text", "company_address" "jsonb", "company_created_at" timestamp with time zone, "company_updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
    SELECT 
      c.uuid AS company_uuid,
      c.name AS company_name,
      c.address AS company_address,
      c.created_at AS company_created_at,
      c.updated_at AS company_updated_at
    FROM 
      public.companies c
    JOIN 
      public.profiles p ON p.company_uuid = c.uuid
    WHERE 
      p.uuid = user_uuid;
END;
$$;


ALTER FUNCTION "public"."get_user_company"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_warehouse_inventory_item_complete"("p_uuid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
      result_json JSONB;
  BEGIN
      -- Use a WITH clause (CTE) with a single query approach instead of nested subqueries
      WITH item_data AS MATERIALIZED (
          SELECT to_jsonb(wi) AS item_json
          FROM warehouse_inventory_items wi
          WHERE wi.uuid = p_uuid
      ),
      bulk_unit_data AS MATERIALIZED (
          -- Single join between bulks and units tables
          SELECT 
              wb.uuid AS bulk_uuid,
              to_jsonb(wb) AS bulk_data,
              jsonb_agg(
                  CASE WHEN wu.uuid IS NOT NULL THEN to_jsonb(wu) ELSE NULL END
              ) FILTER (WHERE wu.uuid IS NOT NULL) AS units_json
          FROM warehouse_inventory_item_bulk wb
          LEFT JOIN warehouse_inventory_item_unit wu ON wb.uuid = wu.warehouse_inventory_bulk_uuid
          WHERE wb.warehouse_inventory_uuid = p_uuid
          GROUP BY wb.uuid, wb.created_at
          ORDER BY wb.created_at DESC
      ),
      bulk_aggregation AS (
          SELECT jsonb_agg(
              jsonb_build_object(
                  'bulk_data', bulk_data,
                  'units', COALESCE(units_json, '[]'::jsonb)
              )
          ) AS bulks_json
          FROM bulk_unit_data
      )
      
      -- Build the final JSON result combining item and its related data
      SELECT jsonb_build_object(
          'item', i.item_json,
          'bulks', COALESCE(b.bulks_json, '[]'::jsonb)
      ) INTO result_json
      FROM item_data i
      LEFT JOIN bulk_aggregation b ON true;
      
      RETURN result_json;
  END;
  $$;


ALTER FUNCTION "public"."get_warehouse_inventory_item_complete"("p_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_warehouse_inventory_items"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_warehouse_uuid" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT ''::"text", "p_status" "text" DEFAULT NULL::"text", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 100, "p_offset" integer DEFAULT 0) RETURNS TABLE("uuid" "uuid", "admin_uuid" "uuid", "warehouse_uuid" "uuid", "company_uuid" "uuid", "inventory_uuid" "uuid", "warehouse_inventory_item_bulks" "uuid"[], "description" "text", "name" "text", "status" "text", "unit" "text", "properties" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_search_pattern TEXT;
BEGIN
  -- Prepare search pattern once for better performance
  v_search_pattern := '%' || COALESCE(p_search, '') || '%';
  
  RETURN QUERY
  WITH filtered_items AS (
    SELECT wi.*
    FROM warehouse_inventory_items wi
    WHERE 
      -- Company filter
      (p_company_uuid IS NULL OR wi.company_uuid = p_company_uuid)
      
      -- Warehouse filter
      AND (p_warehouse_uuid IS NULL OR wi.warehouse_uuid = p_warehouse_uuid)
      
      -- Status filter
      AND (p_status IS NULL OR wi.status = p_status)

      -- Date filters for created_at (timestamp type)
      AND (p_year IS NULL OR EXTRACT(YEAR FROM wi.created_at) = p_year)
      AND (p_month IS NULL OR EXTRACT(MONTH FROM wi.created_at) = p_month)
      AND (p_week IS NULL OR EXTRACT(WEEK FROM wi.created_at) = p_week)
      AND (p_day IS NULL OR EXTRACT(DAY FROM wi.created_at) = p_day)
      
      -- Text search across multiple columns
      AND (
        p_search = '' 
        OR p_search IS NULL
        OR wi.uuid::TEXT ILIKE v_search_pattern
        OR wi.company_uuid::TEXT ILIKE v_search_pattern
        OR wi.admin_uuid::TEXT ILIKE v_search_pattern
        OR wi.warehouse_uuid::TEXT ILIKE v_search_pattern
        OR wi.inventory_uuid::TEXT ILIKE v_search_pattern
        -- OR wi.delivery_uuid::TEXT ILIKE v_search_pattern
        OR COALESCE(wi.status, '') ILIKE v_search_pattern
        OR wi.name ILIKE v_search_pattern
        OR COALESCE(wi.description, '') ILIKE v_search_pattern
        -- Search in warehouse_inventory_item_bulks array
        OR EXISTS (
          SELECT 1 
          FROM warehouse_inventory_item_bulk b 
          WHERE b.warehouse_inventory_uuid = wi.uuid 
          AND b.uuid::TEXT ILIKE v_search_pattern
        )
        OR EXISTS (
          SELECT 1 
          FROM warehouses w 
          WHERE w.uuid = wi.warehouse_uuid 
          AND ( 
            w.name::TEXT ILIKE v_search_pattern
          OR w.address->>'fullAddress' ILIKE v_search_pattern)
        )
      )
  )
  SELECT 
    fi.uuid,
    fi.admin_uuid,
    fi.warehouse_uuid,
    fi.company_uuid,
    -- fi.delivery_uuid,
    fi.inventory_uuid,
    fi.warehouse_inventory_item_bulks,
    fi.description,
    fi.name,
    fi.status,
    fi.unit,
    fi.properties,
    fi.created_at,
    fi.updated_at,
    (SELECT COUNT(*) FROM filtered_items)::BIGINT
  FROM 
    filtered_items fi
  ORDER BY fi.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_warehouse_inventory_items"("p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_warehouse_item_by_inventory_complete"("p_inventory_uuid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
      result_json JSONB;
      v_item_uuid UUID;
  BEGIN
      -- First find the item UUID - use MATERIALIZED for better performance
      WITH item_lookup AS MATERIALIZED (
          SELECT uuid 
          FROM warehouse_inventory_items
          WHERE inventory_uuid = p_inventory_uuid
          ORDER BY created_at DESC
          LIMIT 1
      )
      SELECT uuid INTO v_item_uuid FROM item_lookup;
      
      -- If no item found, return NULL
      IF v_item_uuid IS NULL THEN
          RETURN NULL;
      END IF;
      
      -- Use CTEs with a single query approach for better performance
      WITH item_data AS MATERIALIZED (
          SELECT to_jsonb(wi) AS item_json
          FROM warehouse_inventory_items wi
          WHERE wi.uuid = v_item_uuid
      ),
      bulk_unit_data AS MATERIALIZED (
          -- Join bulks and units in a single query
          SELECT 
              wb.uuid AS bulk_uuid,
              to_jsonb(wb) AS bulk_data,
              jsonb_agg(
                  CASE WHEN wu.uuid IS NOT NULL THEN to_jsonb(wu) ELSE NULL END
              ) FILTER (WHERE wu.uuid IS NOT NULL) AS units_json
          FROM warehouse_inventory_item_bulk wb
          LEFT JOIN warehouse_inventory_item_unit wu ON wb.uuid = wu.warehouse_inventory_bulk_uuid
          WHERE wb.warehouse_inventory_uuid = v_item_uuid
          GROUP BY wb.uuid, wb.created_at
          ORDER BY wb.created_at DESC
      ),
      bulk_aggregation AS (
          SELECT jsonb_agg(
              jsonb_build_object(
                  'bulk_data', bulk_data,
                  'units', COALESCE(units_json, '[]'::jsonb)
              )
          ) AS bulks_json
          FROM bulk_unit_data
      )
      
      -- Build the final JSON result
      SELECT jsonb_build_object(
          'item', i.item_json,
          'bulks', COALESCE(b.bulks_json, '[]'::jsonb)
      ) INTO result_json
      FROM item_data i
      LEFT JOIN bulk_aggregation b ON true;
      
      RETURN result_json;
  END;
  $$;


ALTER FUNCTION "public"."get_warehouse_item_by_inventory_complete"("p_inventory_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_warehouses_filtered"("p_company_uuid" "uuid" DEFAULT NULL::"uuid", "p_search" "text" DEFAULT ''::"text", "p_year" integer DEFAULT NULL::integer, "p_month" integer DEFAULT NULL::integer, "p_week" integer DEFAULT NULL::integer, "p_day" integer DEFAULT NULL::integer, "p_limit" integer DEFAULT 100, "p_offset" integer DEFAULT 0) RETURNS TABLE("uuid" "uuid", "company_uuid" "uuid", "name" "text", "address" "jsonb", "warehouse_layout" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
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
      
      -- Date filters for created_at (timestamp type) - FIXED: changed i.created_at to w.created_at
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
        OR EXISTS (
          SELECT 1 FROM warehouse_inventory_item_bulk wib 
          WHERE wib.warehouse_uuid = w.uuid 
          AND wib.uuid::TEXT ILIKE v_search_pattern
        )
      )
  )
  SELECT 
    fw.uuid, 
    fw.company_uuid, 
    fw.name, 
    fw.address, 
    fw.warehouse_layout, 
    fw.created_at, 
    fw.updated_at,
    (SELECT COUNT(*) FROM filtered_warehouses)::BIGINT
  FROM 
    filtered_warehouses fw
  ORDER BY fw.name
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;


ALTER FUNCTION "public"."get_warehouses_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."handle_updated_at"() IS 'Trigger to update the updated_at timestamp automatically';



CREATE OR REPLACE FUNCTION "public"."is_admin_in_same_company"("user_id" "uuid", "target_company_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE uuid = user_id
    AND is_admin = true
    AND company_uuid = target_company_uuid
  );
END;
$$;


ALTER FUNCTION "public"."is_admin_in_same_company"("user_id" "uuid", "target_company_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manage_inventory_item_bulks_array"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE inventory_items
    SET inventory_item_bulks = array_append(inventory_item_bulks, NEW.uuid)
    WHERE uuid = NEW.inventory_uuid;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE inventory_items
    SET inventory_item_bulks = array_remove(inventory_item_bulks, OLD.uuid)
    WHERE uuid = OLD.inventory_uuid;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."manage_inventory_item_bulks_array"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manage_warehouse_inventory_item_bulks_array"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE warehouses
    SET warehouse_inventory_item_bulks = array_append(warehouse_inventory_item_bulks, NEW.uuid)
    WHERE uuid = NEW.warehouse_uuid;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE warehouses
    SET warehouse_inventory_item_bulks = array_remove(warehouse_inventory_item_bulks, OLD.uuid)
    WHERE uuid = OLD.warehouse_uuid;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."manage_warehouse_inventory_item_bulks_array"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_recalculate_reorder_point"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Just run the calculation for all items
  -- In a production system, you might want to be more selective
  PERFORM calculate_reorder_points();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_recalculate_reorder_point"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_set_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_custom_safety_stock"("p_inventory_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_custom_safety_stock" numeric, "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."reorder_point_logs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  result "reorder_point_logs"%ROWTYPE;
BEGIN
  -- Get the auth.uid() to ensure it's from an authenticated user
  DECLARE
    auth_uid UUID := auth.uid();
    company_id UUID;
  BEGIN
    -- Get the company UUID for the authenticated user
    SELECT company_uuid INTO company_id FROM profiles WHERE uuid = auth_uid;
    
    -- Update the custom safety stock
    UPDATE "reorder_point_logs"
    SET 
      custom_safety_stock = p_custom_safety_stock,
      notes = COALESCE(p_notes, notes),
      updated_at = NOW()
    WHERE 
      inventory_uuid = p_inventory_uuid
      AND warehouse_uuid = p_warehouse_uuid
      AND company_uuid = company_id
    RETURNING * INTO result;
    
    -- If no record exists yet, create one by running calculate_reorder_points first
    IF result IS NULL THEN
      PERFORM calculate_reorder_points();
      
      UPDATE "reorder_point_logs"
      SET 
        custom_safety_stock = p_custom_safety_stock,
        notes = COALESCE(p_notes, notes),
        updated_at = NOW()
      WHERE 
        inventory_uuid = p_inventory_uuid
        AND warehouse_uuid = p_warehouse_uuid
        AND company_uuid = company_id
      RETURNING * INTO result;
    END IF;
    
    RETURN result;
  END;
END;
$$;


ALTER FUNCTION "public"."update_custom_safety_stock"("p_inventory_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_custom_safety_stock" numeric, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_delivery_items_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_delivery_items_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_inventory_item_details"("p_inventory_uuid" "uuid", "p_item_updates" "jsonb" DEFAULT '{}'::"jsonb", "p_bulk_updates" "jsonb" DEFAULT '[]'::"jsonb", "p_unit_updates" "jsonb" DEFAULT '[]'::"jsonb", "p_new_bulks" "jsonb" DEFAULT '[]'::"jsonb", "p_new_units" "jsonb" DEFAULT '[]'::"jsonb", "p_deleted_bulks" "uuid"[] DEFAULT '{}'::"uuid"[], "p_deleted_units" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_created_bulk_uuids UUID[];
  v_bulk_record RECORD;
  v_unit_record RECORD;
  v_temp_uuid UUID;
BEGIN
  -- Update inventory item if updates provided
  IF jsonb_typeof(p_item_updates) = 'object' AND p_item_updates != '{}' THEN
    UPDATE inventory_items 
    SET 
      name = COALESCE((p_item_updates->>'name')::TEXT, name),
      description = COALESCE((p_item_updates->>'description')::TEXT, description),
      unit = COALESCE((p_item_updates->>'unit')::TEXT, unit),
      properties = COALESCE((p_item_updates->'properties')::JSONB, properties),
      updated_at = NOW()
    WHERE uuid = p_inventory_uuid;
    
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Inventory item not found'
      );
    END IF;
  END IF;

  -- Delete bulk items (cascade will handle units)
  IF array_length(p_deleted_bulks, 1) > 0 THEN
    DELETE FROM inventory_item_bulk 
    WHERE uuid = ANY(p_deleted_bulks);
  END IF;

  -- Delete unit items
  IF array_length(p_deleted_units, 1) > 0 THEN
    DELETE FROM inventory_item_unit 
    WHERE uuid = ANY(p_deleted_units);
  END IF;

  -- Update existing bulk items using bulk operations
  IF jsonb_typeof(p_bulk_updates) = 'array' AND jsonb_array_length(p_bulk_updates) > 0 THEN
    FOR v_bulk_record IN 
      SELECT 
        (elem->>'uuid')::UUID as uuid,
        (elem->>'unit')::TEXT as unit,
        (elem->>'unit_value')::NUMERIC as unit_value,
        (elem->>'bulk_unit')::TEXT as bulk_unit,
        (elem->>'cost')::NUMERIC as cost,
        (elem->>'is_single_item')::BOOLEAN as is_single_item,
        (elem->'properties')::JSONB as properties
      FROM jsonb_array_elements(p_bulk_updates) as elem
    LOOP
      UPDATE inventory_item_bulk
      SET 
        unit = COALESCE(v_bulk_record.unit, unit),
        unit_value = COALESCE(v_bulk_record.unit_value, unit_value),
        bulk_unit = COALESCE(v_bulk_record.bulk_unit, bulk_unit),
        cost = COALESCE(v_bulk_record.cost, cost),
        is_single_item = COALESCE(v_bulk_record.is_single_item, is_single_item),
        properties = COALESCE(v_bulk_record.properties, properties),
        updated_at = NOW()
      WHERE uuid = v_bulk_record.uuid;
    END LOOP;
  END IF;

  -- Update existing unit items using bulk operations
  IF jsonb_typeof(p_unit_updates) = 'array' AND jsonb_array_length(p_unit_updates) > 0 THEN
    FOR v_unit_record IN 
      SELECT 
        (elem->>'uuid')::UUID as uuid,
        (elem->>'code')::TEXT as code,
        (elem->>'unit_value')::NUMERIC as unit_value,
        (elem->>'unit')::TEXT as unit,
        (elem->>'name')::TEXT as name,
        (elem->>'cost')::NUMERIC as cost,
        (elem->'properties')::JSONB as properties
      FROM jsonb_array_elements(p_unit_updates) as elem
    LOOP
      UPDATE inventory_item_unit
      SET 
        code = COALESCE(v_unit_record.code, code),
        unit_value = COALESCE(v_unit_record.unit_value, unit_value),
        unit = COALESCE(v_unit_record.unit, unit),
        name = COALESCE(v_unit_record.name, name),
        cost = COALESCE(v_unit_record.cost, cost),
        properties = COALESCE(v_unit_record.properties, properties),
        updated_at = NOW()
      WHERE uuid = v_unit_record.uuid;
    END LOOP;
  END IF;

  -- Create new bulk items and collect their UUIDs
  v_created_bulk_uuids := ARRAY[]::UUID[];
  
  IF jsonb_typeof(p_new_bulks) = 'array' AND jsonb_array_length(p_new_bulks) > 0 THEN
    FOR v_bulk_record IN 
      SELECT 
        (elem->>'company_uuid')::UUID as company_uuid,
        (elem->>'unit')::TEXT as unit,
        (elem->>'unit_value')::NUMERIC as unit_value,
        (elem->>'bulk_unit')::TEXT as bulk_unit,
        (elem->>'cost')::NUMERIC as cost,
        (elem->>'is_single_item')::BOOLEAN as is_single_item,
        (elem->'properties')::JSONB as properties
      FROM jsonb_array_elements(p_new_bulks) as elem
    LOOP
      INSERT INTO inventory_item_bulk (
        company_uuid,
        inventory_uuid,
        unit,
        unit_value,
        bulk_unit,
        cost,
        is_single_item,
        properties
      ) VALUES (
        v_bulk_record.company_uuid,
        p_inventory_uuid,
        v_bulk_record.unit,
        v_bulk_record.unit_value,
        v_bulk_record.bulk_unit,
        v_bulk_record.cost,
        v_bulk_record.is_single_item,
        v_bulk_record.properties
      ) RETURNING uuid INTO v_temp_uuid;
      
      v_created_bulk_uuids := array_append(v_created_bulk_uuids, v_temp_uuid);
    END LOOP;
  END IF;

  -- Create new unit items using bulk insert
  IF jsonb_typeof(p_new_units) = 'array' AND jsonb_array_length(p_new_units) > 0 THEN
    INSERT INTO inventory_item_unit (
      company_uuid,
      inventory_uuid,
      inventory_item_bulk_uuid,
      code,
      unit_value,
      unit,
      name,
      cost,
      properties
    )
    SELECT 
      (elem->>'company_uuid')::UUID,
      p_inventory_uuid,
      CASE 
        WHEN (elem->>'inventory_item_bulk_uuid')::TEXT IS NOT NULL 
        THEN (elem->>'inventory_item_bulk_uuid')::UUID
        WHEN (elem->>'_bulkIndex')::INT IS NOT NULL AND (elem->>'_bulkIndex')::INT >= 0 
             AND (elem->>'_bulkIndex')::INT < array_length(v_created_bulk_uuids, 1)
        THEN v_created_bulk_uuids[(elem->>'_bulkIndex')::INT + 1]
        ELSE NULL
      END,
      (elem->>'code')::TEXT,
      (elem->>'unit_value')::NUMERIC,
      (elem->>'unit')::TEXT,
      (elem->>'name')::TEXT,
      (elem->>'cost')::NUMERIC,
      (elem->'properties')::JSONB
    FROM jsonb_array_elements(p_new_units) as elem;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'created_bulk_uuids', array_to_json(v_created_bulk_uuids)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."update_inventory_item_details"("p_inventory_uuid" "uuid", "p_item_updates" "jsonb", "p_bulk_updates" "jsonb", "p_unit_updates" "jsonb", "p_new_bulks" "jsonb", "p_new_units" "jsonb", "p_deleted_bulks" "uuid"[], "p_deleted_units" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_modified_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_modified_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."address_brgy" (
    "id" bigint NOT NULL,
    "brgyCode" bigint,
    "brgyDesc" "text",
    "regCode" bigint,
    "provCode" bigint,
    "citymunCode" bigint
);


ALTER TABLE "public"."address_brgy" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."address_citymun" (
    "id" bigint NOT NULL,
    "psgcCode" bigint,
    "citymunDesc" "text",
    "regCode" bigint,
    "provCode" bigint,
    "citymunCode" bigint
);


ALTER TABLE "public"."address_citymun" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."address_province" (
    "id" bigint NOT NULL,
    "psgcCode" bigint,
    "provDesc" "text",
    "regCode" bigint,
    "provCode" bigint
);


ALTER TABLE "public"."address_province" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."address_region" (
    "id" bigint NOT NULL,
    "psgcCode" bigint,
    "regDesc" "text",
    "regCode" bigint
);


ALTER TABLE "public"."address_region" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_items" (
    "id" bigint NOT NULL,
    "uuid" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "admin_uuid" "uuid" NOT NULL,
    "inventory_uuid" "uuid" NOT NULL,
    "recipient_name" "text",
    "recipient_contact" "text",
    "delivery_address" "text" NOT NULL,
    "delivery_date" "date" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'PENDING'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "operator_uuid" "uuid",
    "warehouse_uuid" "uuid",
    "name" "text",
    "status_history" "jsonb" DEFAULT '[]'::"jsonb",
    "inventory_item_bulk_uuids" "text"[] DEFAULT '{}'::"text"[],
    "locations" "jsonb"[] DEFAULT '{}'::"jsonb"[],
    "location_codes" "text"[] DEFAULT '{}'::"text"[],
    "warehouse_inventory_uuid" "uuid",
    "operator_uuids" "uuid"[]
);


ALTER TABLE "public"."delivery_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."delivery_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."delivery_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."delivery_items_id_seq" OWNED BY "public"."delivery_items"."id";



CREATE TABLE IF NOT EXISTS "public"."inventory_item_unit" (
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "inventory_uuid" "uuid" NOT NULL,
    "inventory_item_bulk_uuid" "uuid",
    "code" "text" NOT NULL,
    "unit_value" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "name" "text" NOT NULL,
    "cost" numeric DEFAULT 0 NOT NULL,
    "properties" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'AVAILABLE'::"text" NOT NULL,
    "description" "text",
    CONSTRAINT "inventory_item_unit_unit_value_check" CHECK (("unit_value" > (0)::numeric))
);


ALTER TABLE "public"."inventory_item_unit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_reads" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "notification_id" "uuid",
    "user_uuid" "uuid",
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_reads" OWNER TO "postgres";


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
    "full_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "warehouse_uuid" "uuid"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'User profile information with extended details';



CREATE TABLE IF NOT EXISTS "public"."warehouse_inventory_item_bulk" (
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "warehouse_uuid" "uuid" NOT NULL,
    "inventory_uuid" "uuid" NOT NULL,
    "inventory_bulk_uuid" "uuid" NOT NULL,
    "delivery_uuid" "uuid",
    "unit" "text" NOT NULL,
    "unit_value" numeric NOT NULL,
    "bulk_unit" "text" NOT NULL,
    "cost" numeric DEFAULT 0 NOT NULL,
    "is_single_item" boolean DEFAULT false NOT NULL,
    "location" "jsonb" NOT NULL,
    "location_code" "text" NOT NULL,
    "status" "text" DEFAULT 'AVAILABLE'::"text" NOT NULL,
    "properties" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "warehouse_inventory_uuid" "uuid" NOT NULL,
    "status_history" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "warehouse_inventory_item_bulk_unit_value_check" CHECK (("unit_value" > (0)::numeric))
);


ALTER TABLE "public"."warehouse_inventory_item_bulk" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouse_inventory_item_unit" (
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "warehouse_uuid" "uuid" NOT NULL,
    "inventory_uuid" "uuid" NOT NULL,
    "inventory_unit_uuid" "uuid" NOT NULL,
    "warehouse_inventory_bulk_uuid" "uuid" NOT NULL,
    "delivery_uuid" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "unit_value" numeric NOT NULL,
    "unit" "text" NOT NULL,
    "name" "text" NOT NULL,
    "cost" numeric DEFAULT 0 NOT NULL,
    "location" "jsonb" NOT NULL,
    "location_code" "text" NOT NULL,
    "status" "text" DEFAULT 'AVAILABLE'::"text" NOT NULL,
    "properties" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "warehouse_inventory_uuid" "uuid" NOT NULL,
    "status_history" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "warehouse_inventory_item_unit_unit_value_check" CHECK (("unit_value" > (0)::numeric))
);


ALTER TABLE "public"."warehouse_inventory_item_unit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouse_inventory_items" (
    "uuid" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "admin_uuid" "uuid" NOT NULL,
    "warehouse_uuid" "uuid" NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "inventory_uuid" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text" NOT NULL,
    "warehouse_inventory_item_bulks" "uuid"[] DEFAULT '{}'::"uuid"[],
    "description" "text",
    "status" "text" DEFAULT 'AVAILABLE'::"text" NOT NULL,
    "properties" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "unit" "text",
    "status_history" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."warehouse_inventory_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouses" (
    "uuid" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_uuid" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "warehouse_layout" "jsonb" DEFAULT '[]'::"jsonb",
    "warehouse_inventory_item_bulks" "uuid"[] DEFAULT '{}'::"uuid"[]
);


ALTER TABLE "public"."warehouses" OWNER TO "postgres";


ALTER TABLE ONLY "public"."delivery_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."delivery_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."address_brgy"
    ADD CONSTRAINT "brgy_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."address_brgy"
    ADD CONSTRAINT "brgy_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."address_citymun"
    ADD CONSTRAINT "citymun_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."address_citymun"
    ADD CONSTRAINT "citymun_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_uuid_key" UNIQUE ("uuid");



ALTER TABLE ONLY "public"."inventory_item_bulk"
    ADD CONSTRAINT "inventory_item_bulk_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."inventory_item_unit"
    ADD CONSTRAINT "inventory_item_unit_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_notification_id_user_uuid_key" UNIQUE ("notification_id", "user_uuid");



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."address_province"
    ADD CONSTRAINT "province_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."address_province"
    ADD CONSTRAINT "province_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."address_region"
    ADD CONSTRAINT "region_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."address_region"
    ADD CONSTRAINT "region_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reorder_point_logs"
    ADD CONSTRAINT "reorder_point_logs_company_uuid_warehouse_uuid_inventory_uu_key" UNIQUE ("company_uuid", "warehouse_uuid", "inventory_uuid");



ALTER TABLE ONLY "public"."reorder_point_logs"
    ADD CONSTRAINT "reorder_point_logs_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."warehouse_inventory_item_bulk"
    ADD CONSTRAINT "warehouse_inventory_item_bulk_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."warehouse_inventory_item_unit"
    ADD CONSTRAINT "warehouse_inventory_item_unit_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."warehouse_inventory_items"
    ADD CONSTRAINT "warehouse_inventory_items_pkey" PRIMARY KEY ("uuid");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_pkey" PRIMARY KEY ("uuid");



CREATE INDEX "idx_delivery_items_company_created" ON "public"."delivery_items" USING "btree" ("company_uuid", "created_at" DESC);



CREATE INDEX "idx_delivery_items_company_date" ON "public"."delivery_items" USING "btree" ("company_uuid", "delivery_date");



CREATE INDEX "idx_delivery_items_company_status_date" ON "public"."delivery_items" USING "btree" ("company_uuid", "status", "delivery_date" DESC);



CREATE INDEX "idx_delivery_items_company_uuid" ON "public"."delivery_items" USING "btree" ("company_uuid");



CREATE INDEX "idx_delivery_items_created_at" ON "public"."delivery_items" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_delivery_items_inventory" ON "public"."delivery_items" USING "btree" ("inventory_uuid");



CREATE INDEX "idx_delivery_items_operator" ON "public"."delivery_items" USING "btree" ("operator_uuid");



CREATE INDEX "idx_delivery_items_status" ON "public"."delivery_items" USING "btree" ("status");



CREATE INDEX "idx_delivery_items_warehouse" ON "public"."delivery_items" USING "btree" ("warehouse_uuid", "company_uuid");



CREATE INDEX "idx_inventory_company" ON "public"."inventory_items" USING "btree" ("company_uuid");



CREATE INDEX "idx_inventory_item_bulk_company_uuid" ON "public"."inventory_item_bulk" USING "btree" ("company_uuid");



CREATE INDEX "idx_inventory_item_bulk_inventory_uuid" ON "public"."inventory_item_bulk" USING "btree" ("inventory_uuid");



CREATE INDEX "idx_inventory_item_unit_bulk_uuid" ON "public"."inventory_item_unit" USING "btree" ("inventory_item_bulk_uuid");



CREATE INDEX "idx_inventory_item_unit_company_uuid" ON "public"."inventory_item_unit" USING "btree" ("company_uuid");



CREATE INDEX "idx_inventory_item_unit_inventory_uuid" ON "public"."inventory_item_unit" USING "btree" ("inventory_uuid");



CREATE INDEX "idx_inventory_items_company_status_created" ON "public"."inventory_items" USING "btree" ("company_uuid", "status", "created_at" DESC);



CREATE INDEX "idx_inventory_items_company_uuid" ON "public"."inventory_items" USING "btree" ("company_uuid");



CREATE INDEX "idx_inventory_items_created_at" ON "public"."inventory_items" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inventory_items_status" ON "public"."inventory_items" USING "btree" ("status");



CREATE INDEX "idx_notification_reads_notification" ON "public"."notification_reads" USING "btree" ("notification_id");



CREATE INDEX "idx_notification_reads_user" ON "public"."notification_reads" USING "btree" ("user_uuid");



CREATE INDEX "idx_notifications_company_read" ON "public"."notifications" USING "btree" ("company_uuid", "read");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_notifications_type" ON "public"."notifications" USING "btree" ("type");



CREATE INDEX "idx_warehouse_inventory_bulk_company_uuid" ON "public"."warehouse_inventory_item_bulk" USING "btree" ("company_uuid");



CREATE INDEX "idx_warehouse_inventory_bulk_delivery_uuid" ON "public"."warehouse_inventory_item_bulk" USING "btree" ("delivery_uuid");



CREATE INDEX "idx_warehouse_inventory_bulk_inventory_bulk_uuid" ON "public"."warehouse_inventory_item_bulk" USING "btree" ("inventory_bulk_uuid");



CREATE INDEX "idx_warehouse_inventory_bulk_inventory_uuid" ON "public"."warehouse_inventory_item_bulk" USING "btree" ("inventory_uuid");



CREATE INDEX "idx_warehouse_inventory_bulk_status" ON "public"."warehouse_inventory_item_bulk" USING "btree" ("status");



CREATE INDEX "idx_warehouse_inventory_bulk_warehouse_uuid" ON "public"."warehouse_inventory_item_bulk" USING "btree" ("warehouse_uuid");



CREATE INDEX "idx_warehouse_inventory_bulks_warehouse_uuid" ON "public"."warehouse_inventory_item_bulk" USING "btree" ("warehouse_uuid");



CREATE INDEX "idx_warehouse_inventory_item_bulk_created_at" ON "public"."warehouse_inventory_item_bulk" USING "btree" ("created_at");



CREATE INDEX "idx_warehouse_inventory_item_bulk_warehouse_inventory_uuid" ON "public"."warehouse_inventory_item_bulk" USING "btree" ("warehouse_inventory_uuid");



CREATE INDEX "idx_warehouse_inventory_item_unit_warehouse_inventory_bulk_uuid" ON "public"."warehouse_inventory_item_unit" USING "btree" ("warehouse_inventory_bulk_uuid");



CREATE INDEX "idx_warehouse_inventory_items_created_at" ON "public"."warehouse_inventory_items" USING "btree" ("created_at");



CREATE INDEX "idx_warehouse_inventory_items_inventory_uuid" ON "public"."warehouse_inventory_items" USING "btree" ("inventory_uuid");



CREATE INDEX "idx_warehouse_inventory_items_uuid" ON "public"."warehouse_inventory_items" USING "btree" ("uuid");



CREATE INDEX "idx_warehouse_inventory_unit_bulk_uuid" ON "public"."warehouse_inventory_item_unit" USING "btree" ("warehouse_inventory_bulk_uuid");



CREATE INDEX "idx_warehouse_inventory_unit_company_uuid" ON "public"."warehouse_inventory_item_unit" USING "btree" ("company_uuid");



CREATE INDEX "idx_warehouse_inventory_unit_delivery_uuid" ON "public"."warehouse_inventory_item_unit" USING "btree" ("delivery_uuid");



CREATE INDEX "idx_warehouse_inventory_unit_inventory_unit_uuid" ON "public"."warehouse_inventory_item_unit" USING "btree" ("inventory_unit_uuid");



CREATE INDEX "idx_warehouse_inventory_unit_inventory_uuid" ON "public"."warehouse_inventory_item_unit" USING "btree" ("inventory_uuid");



CREATE INDEX "idx_warehouse_inventory_unit_status" ON "public"."warehouse_inventory_item_unit" USING "btree" ("status");



CREATE INDEX "idx_warehouse_inventory_unit_warehouse_uuid" ON "public"."warehouse_inventory_item_unit" USING "btree" ("warehouse_uuid");



CREATE INDEX "idx_warehouse_items_bulks" ON "public"."warehouse_inventory_items" USING "gin" ("warehouse_inventory_item_bulks");



CREATE INDEX "idx_warehouse_items_company" ON "public"."warehouse_inventory_items" USING "btree" ("company_uuid");



CREATE INDEX "idx_warehouse_items_company_created_at" ON "public"."warehouse_inventory_items" USING "btree" ("company_uuid", "created_at" DESC);



CREATE INDEX "idx_warehouse_items_company_warehouse" ON "public"."warehouse_inventory_items" USING "btree" ("company_uuid", "warehouse_uuid");



CREATE INDEX "idx_warehouse_items_created_at" ON "public"."warehouse_inventory_items" USING "btree" ("created_at");



CREATE INDEX "idx_warehouse_items_name_gin" ON "public"."warehouse_inventory_items" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "idx_warehouse_items_status" ON "public"."warehouse_inventory_items" USING "btree" ("status");



CREATE INDEX "idx_warehouse_items_warehouse" ON "public"."warehouse_inventory_items" USING "btree" ("warehouse_uuid");



CREATE INDEX "idx_warehouses_address_gin" ON "public"."warehouses" USING "gin" ("address");



CREATE INDEX "idx_warehouses_company_created_at" ON "public"."warehouses" USING "btree" ("company_uuid", "created_at");



CREATE INDEX "idx_warehouses_company_created_name" ON "public"."warehouses" USING "btree" ("company_uuid", "created_at" DESC, "name");



CREATE INDEX "idx_warehouses_company_name" ON "public"."warehouses" USING "btree" ("company_uuid", "name");



CREATE INDEX "idx_warehouses_company_uuid" ON "public"."warehouses" USING "btree" ("company_uuid");



CREATE INDEX "idx_warehouses_created_at" ON "public"."warehouses" USING "btree" ("created_at");



CREATE INDEX "idx_warehouses_name" ON "public"."warehouses" USING "btree" ("name");



CREATE OR REPLACE TRIGGER "calculate_variance_trigger" BEFORE INSERT OR UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_inventory_variance"();



CREATE OR REPLACE TRIGGER "company_delete_notification_trigger" BEFORE DELETE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."create_delete_notification"();



CREATE OR REPLACE TRIGGER "company_notification_trigger" AFTER INSERT OR UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."create_notification"();



CREATE OR REPLACE TRIGGER "delivery_delete_notification_trigger" BEFORE DELETE ON "public"."delivery_items" FOR EACH ROW EXECUTE FUNCTION "public"."create_delete_notification"();



CREATE OR REPLACE TRIGGER "delivery_items_reorder_trigger" AFTER UPDATE ON "public"."delivery_items" FOR EACH ROW WHEN (("new"."status" = 'DELIVERED'::"text")) EXECUTE FUNCTION "public"."trigger_recalculate_reorder_point"();



CREATE OR REPLACE TRIGGER "delivery_items_updated_at" BEFORE UPDATE ON "public"."delivery_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_delivery_items_updated_at"();



CREATE OR REPLACE TRIGGER "delivery_notification_trigger" AFTER INSERT OR UPDATE ON "public"."delivery_items" FOR EACH ROW EXECUTE FUNCTION "public"."create_notification"();



CREATE OR REPLACE TRIGGER "inventory_delete_notification_trigger" BEFORE DELETE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."create_delete_notification"();



CREATE OR REPLACE TRIGGER "inventory_notification_trigger" AFTER INSERT OR UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."create_notification"();



CREATE OR REPLACE TRIGGER "manage_inventory_item_bulks" AFTER INSERT OR DELETE ON "public"."inventory_item_bulk" FOR EACH ROW EXECUTE FUNCTION "public"."manage_inventory_item_bulks_array"();



CREATE OR REPLACE TRIGGER "manage_warehouse_inventory_item_bulks" AFTER INSERT OR DELETE ON "public"."warehouse_inventory_item_bulk" FOR EACH ROW EXECUTE FUNCTION "public"."manage_warehouse_inventory_item_bulks_array"();



CREATE OR REPLACE TRIGGER "profile_delete_notification_trigger" BEFORE DELETE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."create_delete_notification"();



CREATE OR REPLACE TRIGGER "profile_notification_trigger" AFTER INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."create_notification"();



CREATE OR REPLACE TRIGGER "set_companies_updated_at" BEFORE UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_inventory_item_bulk" BEFORE UPDATE ON "public"."inventory_item_bulk" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_inventory_item_unit" BEFORE UPDATE ON "public"."inventory_item_unit" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_reorder_point_logs" BEFORE UPDATE ON "public"."reorder_point_logs" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_warehouse_inventory_item_bulk" BEFORE UPDATE ON "public"."warehouse_inventory_item_bulk" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_warehouse_inventory_item_unit" BEFORE UPDATE ON "public"."warehouse_inventory_item_unit" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "update_inventory_items_timestamp" BEFORE UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_modified_column"();



CREATE OR REPLACE TRIGGER "warehouse_delete_notification_trigger" BEFORE DELETE ON "public"."warehouses" FOR EACH ROW EXECUTE FUNCTION "public"."create_delete_notification"();



CREATE OR REPLACE TRIGGER "warehouse_inventory_item_bulks_reorder_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."warehouse_inventory_item_bulk" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_recalculate_reorder_point"();



CREATE OR REPLACE TRIGGER "warehouse_notification_trigger" AFTER INSERT OR UPDATE ON "public"."warehouses" FOR EACH ROW EXECUTE FUNCTION "public"."create_notification"();



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_admin_uuid_fkey" FOREIGN KEY ("admin_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_inventory_uuid_fkey" FOREIGN KEY ("inventory_uuid") REFERENCES "public"."inventory_items"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_operator_uuid_fkey" FOREIGN KEY ("operator_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_warehouse_inventory_uuid_fkey" FOREIGN KEY ("warehouse_inventory_uuid") REFERENCES "public"."warehouse_inventory_items"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_items"
    ADD CONSTRAINT "delivery_items_warehouse_uuid_fkey" FOREIGN KEY ("warehouse_uuid") REFERENCES "public"."warehouses"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_item_bulk"
    ADD CONSTRAINT "inventory_item_bulk_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_item_bulk"
    ADD CONSTRAINT "inventory_item_bulk_inventory_uuid_fkey" FOREIGN KEY ("inventory_uuid") REFERENCES "public"."inventory_items"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_item_unit"
    ADD CONSTRAINT "inventory_item_unit_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_item_unit"
    ADD CONSTRAINT "inventory_item_unit_inventory_item_bulk_uuid_fkey" FOREIGN KEY ("inventory_item_bulk_uuid") REFERENCES "public"."inventory_item_bulk"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_item_unit"
    ADD CONSTRAINT "inventory_item_unit_inventory_uuid_fkey" FOREIGN KEY ("inventory_uuid") REFERENCES "public"."inventory_items"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_admin_uuid_fkey" FOREIGN KEY ("admin_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_reads"
    ADD CONSTRAINT "notification_reads_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_uuid_fkey" FOREIGN KEY ("uuid") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_warehouse_uuid_fkey" FOREIGN KEY ("warehouse_uuid") REFERENCES "public"."warehouses"("uuid");



ALTER TABLE ONLY "public"."reorder_point_logs"
    ADD CONSTRAINT "reorder_point_logs_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reorder_point_logs"
    ADD CONSTRAINT "reorder_point_logs_inventory_uuid_fkey" FOREIGN KEY ("inventory_uuid") REFERENCES "public"."inventory_items"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reorder_point_logs"
    ADD CONSTRAINT "reorder_point_logs_warehouse_inventory_uuid_fkey" FOREIGN KEY ("warehouse_inventory_uuid") REFERENCES "public"."warehouse_inventory_items"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reorder_point_logs"
    ADD CONSTRAINT "reorder_point_logs_warehouse_uuid_fkey" FOREIGN KEY ("warehouse_uuid") REFERENCES "public"."warehouses"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_item_bulk"
    ADD CONSTRAINT "warehouse_inventory_item_bulk_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_item_bulk"
    ADD CONSTRAINT "warehouse_inventory_item_bulk_delivery_uuid_fkey" FOREIGN KEY ("delivery_uuid") REFERENCES "public"."delivery_items"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warehouse_inventory_item_bulk"
    ADD CONSTRAINT "warehouse_inventory_item_bulk_inventory_bulk_uuid_fkey" FOREIGN KEY ("inventory_bulk_uuid") REFERENCES "public"."inventory_item_bulk"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_item_bulk"
    ADD CONSTRAINT "warehouse_inventory_item_bulk_inventory_uuid_fkey" FOREIGN KEY ("inventory_uuid") REFERENCES "public"."inventory_items"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_item_bulk"
    ADD CONSTRAINT "warehouse_inventory_item_bulk_warehouse_inventory_uuid_fkey" FOREIGN KEY ("warehouse_inventory_uuid") REFERENCES "public"."warehouse_inventory_items"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_item_bulk"
    ADD CONSTRAINT "warehouse_inventory_item_bulk_warehouse_uuid_fkey" FOREIGN KEY ("warehouse_uuid") REFERENCES "public"."warehouses"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_item_unit"
    ADD CONSTRAINT "warehouse_inventory_item_unit_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_item_unit"
    ADD CONSTRAINT "warehouse_inventory_item_unit_delivery_uuid_fkey" FOREIGN KEY ("delivery_uuid") REFERENCES "public"."delivery_items"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warehouse_inventory_item_unit"
    ADD CONSTRAINT "warehouse_inventory_item_unit_inventory_unit_uuid_fkey" FOREIGN KEY ("inventory_unit_uuid") REFERENCES "public"."inventory_item_unit"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_item_unit"
    ADD CONSTRAINT "warehouse_inventory_item_unit_inventory_uuid_fkey" FOREIGN KEY ("inventory_uuid") REFERENCES "public"."inventory_items"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_item_unit"
    ADD CONSTRAINT "warehouse_inventory_item_unit_warehouse_inventory_bulk_uui_fkey" FOREIGN KEY ("warehouse_inventory_bulk_uuid") REFERENCES "public"."warehouse_inventory_item_bulk"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_item_unit"
    ADD CONSTRAINT "warehouse_inventory_item_unit_warehouse_inventory_uuid_fkey" FOREIGN KEY ("warehouse_inventory_uuid") REFERENCES "public"."warehouse_inventory_items"("uuid");



ALTER TABLE ONLY "public"."warehouse_inventory_item_unit"
    ADD CONSTRAINT "warehouse_inventory_item_unit_warehouse_uuid_fkey" FOREIGN KEY ("warehouse_uuid") REFERENCES "public"."warehouses"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_items"
    ADD CONSTRAINT "warehouse_inventory_items_admin_uuid_fkey" FOREIGN KEY ("admin_uuid") REFERENCES "public"."profiles"("uuid") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."warehouse_inventory_items"
    ADD CONSTRAINT "warehouse_inventory_items_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_items"
    ADD CONSTRAINT "warehouse_inventory_items_inventory_uuid_fkey" FOREIGN KEY ("inventory_uuid") REFERENCES "public"."inventory_items"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory_items"
    ADD CONSTRAINT "warehouse_inventory_items_warehouse_uuid_fkey" FOREIGN KEY ("warehouse_uuid") REFERENCES "public"."warehouses"("uuid") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_company_uuid_fkey" FOREIGN KEY ("company_uuid") REFERENCES "public"."companies"("uuid") ON DELETE CASCADE;



CREATE POLICY "Admins can delete company delivery items" ON "public"."delivery_items" FOR DELETE USING (("auth"."uid"() IN ( SELECT "profiles"."uuid"
   FROM "public"."profiles"
  WHERE (("profiles"."company_uuid" = "delivery_items"."company_uuid") AND ("profiles"."is_admin" = true)))));



CREATE POLICY "Admins can insert company delivery items" ON "public"."delivery_items" FOR INSERT WITH CHECK (("auth"."uid"() IN ( SELECT "profiles"."uuid"
   FROM "public"."profiles"
  WHERE (("profiles"."company_uuid" = "delivery_items"."company_uuid") AND ("profiles"."is_admin" = true)))));



CREATE POLICY "Admins can manage company inventory" ON "public"."inventory_items" USING (("auth"."uid"() IN ( SELECT "profiles"."uuid"
   FROM "public"."profiles"
  WHERE (("profiles"."company_uuid" = "inventory_items"."company_uuid") AND ("profiles"."is_admin" = true)))));



CREATE POLICY "Admins can manage company warehouse inventory" ON "public"."warehouse_inventory_items" USING (("auth"."uid"() IN ( SELECT "profiles"."uuid"
   FROM "public"."profiles"
  WHERE (("profiles"."company_uuid" = "warehouse_inventory_items"."company_uuid") AND ("profiles"."is_admin" = true)))));



CREATE POLICY "Allow admin users to delete their own company" ON "public"."companies" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."uuid" = "auth"."uid"()) AND ("profiles"."company_uuid" = "companies"."uuid") AND ("profiles"."is_admin" = true)))));



CREATE POLICY "Allow admin users to update profiles in their company" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "admin_profile"
  WHERE (("admin_profile"."uuid" = "auth"."uid"()) AND ("admin_profile"."is_admin" = true) AND ("admin_profile"."company_uuid" = "profiles"."company_uuid")))));



CREATE POLICY "Allow admin users to update their company" ON "public"."companies" FOR UPDATE TO "authenticated" USING ("public"."is_admin_in_same_company"("auth"."uid"(), "uuid"));



CREATE POLICY "Allow admins to view operator profiles in their company" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("public"."is_admin_in_same_company"("auth"."uid"(), "company_uuid") AND ("is_admin" = false)));



CREATE POLICY "Allow authenticated users to create companies" ON "public"."companies" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow users to delete their own profile" ON "public"."profiles" FOR DELETE USING (("auth"."uid"() = "uuid"));



CREATE POLICY "Allow users to update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "uuid"));



CREATE POLICY "Allow users to view companies they belong to" ON "public"."companies" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."uuid" = "auth"."uid"()) AND ("profiles"."company_uuid" = "companies"."uuid")))));



CREATE POLICY "Allow users to view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "uuid"));



CREATE POLICY "Enable read access for all users" ON "public"."address_brgy" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."address_province" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."address_region" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."inventory_items" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "profiles"."uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."company_uuid" = "inventory_items"."company_uuid"))));



CREATE POLICY "Everyone in the company can insert warehouse inventory items" ON "public"."warehouse_inventory_items" FOR INSERT WITH CHECK (("auth"."uid"() IN ( SELECT "profiles"."uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."company_uuid" = "warehouse_inventory_items"."company_uuid"))));



CREATE POLICY "Everyone in the company can update company delivery items" ON "public"."delivery_items" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "profiles"."uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."company_uuid" = "delivery_items"."company_uuid"))));



CREATE POLICY "Everyone in the company can update company warehouse inventory " ON "public"."warehouse_inventory_items" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "profiles"."uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."company_uuid" = "warehouse_inventory_items"."company_uuid"))));



CREATE POLICY "Only admins can create warehouses" ON "public"."warehouses" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."uuid" = "auth"."uid"()) AND ("profiles"."is_admin" = true) AND ("profiles"."company_uuid" = "warehouses"."company_uuid")))));



CREATE POLICY "Only admins can delete warehouses" ON "public"."warehouses" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."uuid" = "auth"."uid"()) AND ("profiles"."is_admin" = true) AND ("profiles"."company_uuid" = "warehouses"."company_uuid")))));



CREATE POLICY "Only admins can update warehouses" ON "public"."warehouses" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."uuid" = "auth"."uid"()) AND ("profiles"."is_admin" = true) AND ("profiles"."company_uuid" = "warehouses"."company_uuid")))));



CREATE POLICY "Users can delete their company's bulk items" ON "public"."inventory_item_bulk" FOR DELETE USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can delete their company's unit items" ON "public"."inventory_item_unit" FOR DELETE USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can delete their company's warehouse bulk items" ON "public"."warehouse_inventory_item_bulk" FOR DELETE USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can delete their company's warehouse unit items" ON "public"."warehouse_inventory_item_unit" FOR DELETE USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can insert their company's bulk items" ON "public"."inventory_item_bulk" FOR INSERT WITH CHECK (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can insert their company's unit items" ON "public"."inventory_item_unit" FOR INSERT WITH CHECK (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can insert their company's warehouse bulk items" ON "public"."warehouse_inventory_item_bulk" FOR INSERT WITH CHECK (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can insert their company's warehouse unit items" ON "public"."warehouse_inventory_item_unit" FOR INSERT WITH CHECK (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can update their company's bulk items" ON "public"."inventory_item_bulk" FOR UPDATE USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"())))) WITH CHECK (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can update their company's unit items" ON "public"."inventory_item_unit" FOR UPDATE USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"())))) WITH CHECK (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can update their company's warehouse bulk items" ON "public"."warehouse_inventory_item_bulk" FOR UPDATE USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"())))) WITH CHECK (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can update their company's warehouse unit items" ON "public"."warehouse_inventory_item_unit" FOR UPDATE USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"())))) WITH CHECK (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can view company inventory" ON "public"."inventory_items" FOR SELECT USING (("auth"."uid"() IN ( SELECT "p"."uuid"
   FROM ("public"."profiles" "p"
     JOIN "public"."companies" "c" ON (("p"."company_uuid" = "c"."uuid")))
  WHERE ("c"."uuid" = "inventory_items"."company_uuid"))));



CREATE POLICY "Users can view company warehouse inventory" ON "public"."warehouse_inventory_items" FOR SELECT USING (("auth"."uid"() IN ( SELECT "p"."uuid"
   FROM ("public"."profiles" "p"
     JOIN "public"."companies" "c" ON (("p"."company_uuid" = "c"."uuid")))
  WHERE ("c"."uuid" = "warehouse_inventory_items"."company_uuid"))));



CREATE POLICY "Users can view their company delivery items" ON "public"."delivery_items" FOR SELECT USING (("auth"."uid"() IN ( SELECT "profiles"."uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."company_uuid" = "delivery_items"."company_uuid"))));



CREATE POLICY "Users can view their company's bulk items" ON "public"."inventory_item_bulk" FOR SELECT USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can view their company's unit items" ON "public"."inventory_item_unit" FOR SELECT USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can view their company's warehouse bulk items" ON "public"."warehouse_inventory_item_bulk" FOR SELECT USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can view their company's warehouse unit items" ON "public"."warehouse_inventory_item_unit" FOR SELECT USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



CREATE POLICY "Users can view warehouses belonging to their company" ON "public"."warehouses" FOR SELECT USING (("company_uuid" IN ( SELECT "profiles"."company_uuid"
   FROM "public"."profiles"
  WHERE ("profiles"."uuid" = "auth"."uid"()))));



ALTER TABLE "public"."address_brgy" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."address_citymun" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "address_citymun_anon" ON "public"."address_citymun" FOR SELECT USING (true);



ALTER TABLE "public"."address_province" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."address_region" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_item_bulk" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_item_unit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouse_inventory_item_bulk" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouse_inventory_item_unit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouse_inventory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."companies";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."delivery_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."inventory_item_bulk";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."inventory_item_unit";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."inventory_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."warehouse_inventory_item_bulk";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."warehouse_inventory_item_unit";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."warehouse_inventory_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."warehouses";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";









































































































































































































GRANT ALL ON FUNCTION "public"."calculate_inventory_variance"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_inventory_variance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_inventory_variance"() TO "service_role";



GRANT ALL ON TABLE "public"."reorder_point_logs" TO "anon";
GRANT ALL ON TABLE "public"."reorder_point_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."reorder_point_logs" TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_reorder_points"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_reorder_points"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_reorder_points"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_specific_reorder_point"("p_inventory_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_company_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_specific_reorder_point"("p_inventory_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_company_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_specific_reorder_point"("p_inventory_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_company_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_delete_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_delete_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_delete_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user_account"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user_account"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_account"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_location_code"("location" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_location_code"("location" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_location_code"("location" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_accessible_companies"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_accessible_companies"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_accessible_companies"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_address_dropdown_data"("target_reg_code" "text", "target_prov_code" "text", "target_citymun_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_address_dropdown_data"("target_reg_code" "text", "target_prov_code" "text", "target_citymun_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_address_dropdown_data"("target_reg_code" "text", "target_prov_code" "text", "target_citymun_code" "text") TO "service_role";



GRANT ALL ON TABLE "public"."inventory_item_bulk" TO "anon";
GRANT ALL ON TABLE "public"."inventory_item_bulk" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_item_bulk" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_available_inventory_bulks"("inventory_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_inventory_bulks"("inventory_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_inventory_bulks"("inventory_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_companies_for_registration"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_companies_for_registration"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_companies_for_registration"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_complete_address_data"("citymun_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_complete_address_data"("citymun_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_complete_address_data"("citymun_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_delivery_counts"("company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_delivery_counts"("company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_delivery_counts"("company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_delivery_performance"("company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_delivery_performance"("company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_delivery_performance"("company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_inventory_stats"("company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_inventory_stats"("company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_inventory_stats"("company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_monthly_revenue"("company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_monthly_revenue"("company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_monthly_revenue"("company_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_recent_notifications"("company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_recent_notifications"("company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_recent_notifications"("company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_reorder_points"("company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_reorder_points"("company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_reorder_points"("company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_warehouse_items_stats"("company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_warehouse_items_stats"("company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_warehouse_items_stats"("company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_delivery_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_warehouse_uuid" "uuid", "p_operator_uuids" "uuid"[], "p_inventory_uuid" "uuid", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_delivery_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_warehouse_uuid" "uuid", "p_operator_uuids" "uuid"[], "p_inventory_uuid" "uuid", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_delivery_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_warehouse_uuid" "uuid", "p_operator_uuids" "uuid"[], "p_inventory_uuid" "uuid", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_item_details"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_item_details"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_item_details"("p_inventory_uuid" "uuid", "p_include_warehouse_items" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_admin_uuid" "uuid", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_admin_uuid" "uuid", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_admin_uuid" "uuid", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_admin_uuid" "uuid", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_admin_uuid" "uuid", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_inventory_items"("p_company_uuid" "uuid", "p_search" "text", "p_status" "text", "p_admin_uuid" "uuid", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_reorder_point_logs"("warehouse_id" "uuid", "status_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_reorder_point_logs"("warehouse_id" "uuid", "status_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reorder_point_logs"("warehouse_id" "uuid", "status_filter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_reorder_point_logs_paginated"("p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_status" "text", "p_search" "text", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_reorder_point_logs_paginated"("p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_status" "text", "p_search" "text", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reorder_point_logs_paginated"("p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_status" "text", "p_search" "text", "p_date_from" "date", "p_date_to" "date", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_company"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_company"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_company"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_item_complete"("p_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_item_complete"("p_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_item_complete"("p_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_items"("p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_items"("p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_warehouse_inventory_items"("p_company_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_search" "text", "p_status" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_warehouse_item_by_inventory_complete"("p_inventory_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_warehouse_item_by_inventory_complete"("p_inventory_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_warehouse_item_by_inventory_complete"("p_inventory_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_warehouses_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_warehouses_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_warehouses_filtered"("p_company_uuid" "uuid", "p_search" "text", "p_year" integer, "p_month" integer, "p_week" integer, "p_day" integer, "p_limit" integer, "p_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin_in_same_company"("user_id" "uuid", "target_company_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_in_same_company"("user_id" "uuid", "target_company_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_in_same_company"("user_id" "uuid", "target_company_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."manage_inventory_item_bulks_array"() TO "anon";
GRANT ALL ON FUNCTION "public"."manage_inventory_item_bulks_array"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_inventory_item_bulks_array"() TO "service_role";



GRANT ALL ON FUNCTION "public"."manage_warehouse_inventory_item_bulks_array"() TO "anon";
GRANT ALL ON FUNCTION "public"."manage_warehouse_inventory_item_bulks_array"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_warehouse_inventory_item_bulks_array"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_recalculate_reorder_point"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_recalculate_reorder_point"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_recalculate_reorder_point"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_custom_safety_stock"("p_inventory_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_custom_safety_stock" numeric, "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_custom_safety_stock"("p_inventory_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_custom_safety_stock" numeric, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_custom_safety_stock"("p_inventory_uuid" "uuid", "p_warehouse_uuid" "uuid", "p_custom_safety_stock" numeric, "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_delivery_items_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_delivery_items_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_delivery_items_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_inventory_item_details"("p_inventory_uuid" "uuid", "p_item_updates" "jsonb", "p_bulk_updates" "jsonb", "p_unit_updates" "jsonb", "p_new_bulks" "jsonb", "p_new_units" "jsonb", "p_deleted_bulks" "uuid"[], "p_deleted_units" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."update_inventory_item_details"("p_inventory_uuid" "uuid", "p_item_updates" "jsonb", "p_bulk_updates" "jsonb", "p_unit_updates" "jsonb", "p_new_bulks" "jsonb", "p_new_units" "jsonb", "p_deleted_bulks" "uuid"[], "p_deleted_units" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_inventory_item_details"("p_inventory_uuid" "uuid", "p_item_updates" "jsonb", "p_bulk_updates" "jsonb", "p_unit_updates" "jsonb", "p_new_bulks" "jsonb", "p_new_units" "jsonb", "p_deleted_bulks" "uuid"[], "p_deleted_units" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_modified_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";
























GRANT ALL ON TABLE "public"."address_brgy" TO "anon";
GRANT ALL ON TABLE "public"."address_brgy" TO "authenticated";
GRANT ALL ON TABLE "public"."address_brgy" TO "service_role";



GRANT ALL ON TABLE "public"."address_citymun" TO "anon";
GRANT ALL ON TABLE "public"."address_citymun" TO "authenticated";
GRANT ALL ON TABLE "public"."address_citymun" TO "service_role";



GRANT ALL ON TABLE "public"."address_province" TO "anon";
GRANT ALL ON TABLE "public"."address_province" TO "authenticated";
GRANT ALL ON TABLE "public"."address_province" TO "service_role";



GRANT ALL ON TABLE "public"."address_region" TO "anon";
GRANT ALL ON TABLE "public"."address_region" TO "authenticated";
GRANT ALL ON TABLE "public"."address_region" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_items" TO "anon";
GRANT ALL ON TABLE "public"."delivery_items" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."delivery_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."delivery_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."delivery_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_item_unit" TO "anon";
GRANT ALL ON TABLE "public"."inventory_item_unit" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_item_unit" TO "service_role";



GRANT ALL ON TABLE "public"."notification_reads" TO "anon";
GRANT ALL ON TABLE "public"."notification_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_reads" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."warehouse_inventory_item_bulk" TO "anon";
GRANT ALL ON TABLE "public"."warehouse_inventory_item_bulk" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouse_inventory_item_bulk" TO "service_role";



GRANT ALL ON TABLE "public"."warehouse_inventory_item_unit" TO "anon";
GRANT ALL ON TABLE "public"."warehouse_inventory_item_unit" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouse_inventory_item_unit" TO "service_role";



GRANT ALL ON TABLE "public"."warehouse_inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."warehouse_inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouse_inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."warehouses" TO "anon";
GRANT ALL ON TABLE "public"."warehouses" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouses" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
