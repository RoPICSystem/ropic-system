-- Create inventory_items table
CREATE TABLE IF NOT EXISTS public.inventory (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  admin_uuid UUID NOT NULL REFERENCES public.profiles(uuid) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  measurement_unit TEXT NOT NULL,
  properties JSONB DEFAULT '{}'::jsonb,
  
  status TEXT DEFAULT 'AVAILABLE' check (
    status in ('AVAILABLE', 'WARNING', 'CRITICAL', 'OUT_OF_STOCK')
  ),
  status_history JSONB DEFAULT '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory REPLICA IDENTITY FULL;

CREATE or REPLACE TRIGGER trg_update_status_history_inventory
BEFORE UPDATE ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION update_status_history();


CREATE POLICY "Admins can manage company inventory" 
ON public.inventory_items USING (
  (auth.uid() IN ( 
    SELECT profiles.uuid
  FROM public.profiles
  WHERE (
    (profiles.company_uuid = inventory_items.company_uuid)
     AND (profiles.is_admin = true)))));

CREATE POLICY "Admins can manage company inventory"
ON public.inventory_items FOR INSERT, UPDATE, DELETE USING (
  (auth.uid() IN ( 
    SELECT profiles.uuid
   FROM public.profiles
  WHERE (
    (profiles.company_uuid = inventory_items.company_uuid)
     AND (profiles.is_admin = true)))));

CREATE POLICY "Users can view company inventory" 
ON public.inventory_items FOR SELECT USING (
  (auth.uid() IN ( 
    SELECT p.uuid
   FROM (public.profiles p
     JOIN public.companies c ON (
      (p.company_uuid = c.uuid)))
  WHERE (c.uuid = inventory_items.company_uuid))));



CREATE OR REPLACE FUNCTION public.get_inventories(
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
    (
      SELECT COUNT(*)
      FROM inventory_items b
      WHERE b.inventory_uuid = fi.uuid
      AND (b.status IS NULL OR b.status != 'IN_WAREHOUSE')
    )::INT AS inventory_items_length,
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
$function$



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
              'description', ii.description,
              'properties', ii.properties,
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
    AND (p_include_warehouse_items OR ii.status != 'IN_WAREHOUSE' OR ii.status IS NULL)
  WHERE i.uuid = p_inventory_uuid
  GROUP BY 
    i.uuid,
    i.company_uuid,
    i.admin_uuid,
    i.name,
    i.description,
    i.measurement_unit,
    i.status,
    i.properties,
    i.created_at,
    i.updated_at;
END;
$function$