CREATE TABLE IF NOT EXISTS public.warehouses (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_uuid UUID NOT NULL REFERENCES public.companies(uuid) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  layout JSONB[] NOT NULL DEFAULT '{}'::jsonb[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;


-- Allow users to SELECT warehouses that belong to their company
CREATE POLICY "Users can view warehouses belonging to their company" ON public.warehouses
  FOR SELECT USING (
    company_uuid IN (
      SELECT company_uuid FROM public.profiles
      WHERE uuid = auth.uid()
    )
  );

-- Allow ONLY ADMINS to INSERT warehouses
CREATE POLICY "Only admins can create warehouses" ON public.warehouses
  FOR INSERT WITH CHECK (
    -- Check if the user is an admin
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE uuid = auth.uid()
      AND is_admin = true
      AND company_uuid = public.warehouses.company_uuid
    )
  );

-- Allow ONLY ADMINS to UPDATE warehouses that belong to their company
CREATE POLICY "Only admins can update warehouses" ON public.warehouses
  FOR UPDATE USING (
    -- Check if the user is an admin
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE uuid = auth.uid()
      AND is_admin = true
      AND company_uuid = public.warehouses.company_uuid
    )
  );

-- Allow ONLY ADMINS to DELETE warehouses that belong to their company
CREATE POLICY "Only admins can delete warehouses" ON public.warehouses
  FOR DELETE USING (
    -- Check if the user is an admin
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE uuid = auth.uid()
      AND is_admin = true
      AND company_uuid = public.warehouses.company_uuid
    )
  );


CREATE INDEX IF NOT EXISTS idx_warehouses_company_uuid
ON public.warehouses (company_uuid);

CREATE INDEX IF NOT EXISTS idx_warehouses_name
ON public.warehouses (name);

CREATE INDEX IF NOT EXISTS idx_warehouses_address_fullAddress
ON public.warehouses ((address->>'fullAddress'));

CREATE INDEX IF NOT EXISTS idx_warehouses_created_at
ON public.warehouses (created_at);



CREATE OR REPLACE FUNCTION public.get_warehouses_filtered(
  p_company_uuid uuid DEFAULT NULL::uuid, 
  p_search text DEFAULT ''::text, 
  p_year integer DEFAULT NULL::integer, 
  p_month integer DEFAULT NULL::integer, 
  p_week integer DEFAULT NULL::integer, 
  p_day integer DEFAULT NULL::integer, 
  p_limit integer DEFAULT 100, 
  p_offset integer DEFAULT 0)
 RETURNS 
 TABLE(
  uuid uuid, 
  company_uuid uuid, 
  name text, 
  address jsonb,
  created_at timestamp with time zone, 
  updated_at timestamp with time zone,
  floors_count integer,
  rows_count integer,
  columns_count integer,
  total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$DECLARE
v_search_pattern TEXT;
BEGIN
-- Prepare search pattern once for better performance
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
END;$function$
