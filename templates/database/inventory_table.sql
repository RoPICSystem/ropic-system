-- Create inventory_items table
CREATE TABLE IF NOT EXISTS public.inventory (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  admin_uuid UUID NOT NULL REFERENCES public.profiles(uuid) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  measurement_unit TEXT NOT NULL,
  standard_unit TEXT NOT NULL, -- New field for standard unit
  unit_values JSONB DEFAULT '{"inventory": 0, "warehouse": 0, "available": 0, "total": 0}'::jsonb, -- Aggregated unit values
  count JSONB DEFAULT '{"inventory": 0, "warehouse": 0, "available": 0, "total": 0}'::jsonb, -- Aggregated counts
  properties JSONB DEFAULT '{}'::jsonb,
  
  status TEXT DEFAULT 'AVAILABLE' check (
    status in ('AVAILABLE', 'WARNING', 'CRITICAL', 'OUT_OF_STOCK')
  ),
  status_history JSONB DEFAULT (jsonb_build_object(to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'AVAILABLE')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory REPLICA IDENTITY FULL;

CREATE or REPLACE TRIGGER trg_update_status_history_inventory
BEFORE UPDATE ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION update_status_history();

-- Enhanced trigger function to update inventory aggregations with detailed change tracking
CREATE OR REPLACE FUNCTION update_inventory_aggregations()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;


-- Helper function to update aggregations for a single inventory
CREATE OR REPLACE FUNCTION update_single_inventory_aggregation(p_inventory_uuid UUID)
RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql;

-- Drop and recreate the trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS trg_inventory_items_aggregation ON inventory_items;
CREATE TRIGGER trg_inventory_items_aggregation
    AFTER INSERT OR UPDATE OR DELETE ON inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_aggregations();

-- Add a trigger specifically for tracking status changes with detailed logging
CREATE OR REPLACE FUNCTION log_inventory_item_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if status actually changed
    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        -- Update the status_history
        NEW.status_history = COALESCE(NEW.status_history, '{}'::jsonb) || 
            jsonb_build_object(
                NOW()::text, 
                jsonb_build_object(
                    'from', COALESCE(OLD.status, 'NULL'),
                    'to', COALESCE(NEW.status, 'NULL'),
                    'trigger', 'inventory_item_status_change'
                )
            );
        NEW.updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add status change logging trigger
DROP TRIGGER IF EXISTS trg_inventory_item_status_change ON inventory_items;
CREATE TRIGGER trg_inventory_item_status_change
    BEFORE UPDATE ON inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION log_inventory_item_status_change();

-- Add a function to recalculate all inventory aggregations (useful for maintenance)
CREATE OR REPLACE FUNCTION recalculate_all_inventory_aggregations()
RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql;

-- Unit conversion function
CREATE OR REPLACE FUNCTION public.convert_unit(
    value NUMERIC,
    from_unit TEXT,
    to_unit TEXT
) RETURNS NUMERIC AS $$
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
$$ LANGUAGE plpgsql;

-- Unit conversion factor function
CREATE OR REPLACE FUNCTION public.get_unit_conversion_factor(
    from_unit TEXT,
    to_unit TEXT
) RETURNS NUMERIC AS $$
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
$$ LANGUAGE plpgsql;

-- Updated RPC functions
CREATE OR REPLACE FUNCTION public.get_inventory_filtered(
  p_company_uuid uuid DEFAULT NULL::uuid, 
  p_search text DEFAULT ''::text, 
  p_status text DEFAULT NULL::text, 
  p_year integer DEFAULT NULL::integer, 
  p_month integer DEFAULT NULL::integer, 
  p_week integer DEFAULT NULL::integer, 
  p_day integer DEFAULT NULL::integer, 
  p_limit integer DEFAULT 100, 
  p_offset integer DEFAULT 0)
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
  inventory_items_length integer, 
  status text, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone, 
  total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_inventory_details(
  p_inventory_uuid uuid, 
  p_include_warehouse_items boolean DEFAULT false)
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
$function$;

CREATE OR REPLACE FUNCTION public.update_inventory_details(
  p_inventory_uuid uuid, 
  p_inventory_updates jsonb DEFAULT '{}'::jsonb, 
  p_inventory_item_updates jsonb DEFAULT '[]'::jsonb, 
  p_new_inventory_item jsonb DEFAULT '[]'::jsonb, 
  p_deleted_inventory_item uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
      properties,
      status_history
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
      (elem->'properties')::JSONB,
      jsonb_build_object(to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'AVAILABLE')
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
$function$;

-- Policies remain the same...
CREATE POLICY "inventory_select_policy" ON public.inventory
FOR SELECT TO authenticated
USING (
  company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "inventory_insert_policy" ON public.inventory
FOR INSERT TO authenticated
WITH CHECK (
  public.is_user_admin((select auth.uid())) = true
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "inventory_update_policy" ON public.inventory
FOR UPDATE TO authenticated
USING (
  public.is_user_admin((select auth.uid())) = true
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

CREATE POLICY "inventory_delete_policy" ON public.inventory
FOR DELETE TO authenticated
USING (
  public.is_user_admin((select auth.uid())) = true
  AND company_uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

-- Add indexes for better performance on the tracked fields
CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_unit_value ON inventory_items(unit_value);
CREATE INDEX IF NOT EXISTS idx_inventory_items_unit ON inventory_items(unit);
CREATE INDEX IF NOT EXISTS idx_inventory_items_cost ON inventory_items(cost);
CREATE INDEX IF NOT EXISTS idx_inventory_items_inventory_uuid_status ON inventory_items(inventory_uuid, status);
CREATE INDEX IF NOT EXISTS idx_inventory_items_updated_at ON inventory_items(updated_at);