-- Create reorder_point_logs table
create table if not exists public.reorder_point_logs (
  uuid UUID primary key default gen_random_uuid(),
  company_uuid UUID not null references public.companies (uuid) on delete cascade,
  warehouse_uuid UUID not null references public.warehouses (uuid) on delete cascade,
  inventory_uuid UUID not null references public.inventory (uuid) on delete cascade,
  warehouse_inventory UUID references public.warehouse_inventory (uuid) on delete set null,
  current_stock numeric not null,
  average_daily_unit_sales numeric(10,2) not null,
  lead_time_days numeric(10,2) not null,
  safety_stock numeric(10,2) not null,
  reorder_point numeric(10,2) not null,
  status character varying(20) not null,
  custom_safety_stock numeric(10,2),
  notes text,
  unit character varying(20),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint reorder_point_logs_status_check check (status in ('IN_STOCK', 'WARNING', 'CRITICAL', 'OUT_OF_STOCK'))
);



CREATE OR REPLACE FUNCTION public.get_reorder_point_logs_paginated(p_company_uuid uuid DEFAULT NULL::uuid, p_warehouse_uuid uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_search text DEFAULT ''::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_year integer DEFAULT NULL::integer, p_month integer DEFAULT NULL::integer, p_week integer DEFAULT NULL::integer, p_day integer DEFAULT NULL::integer, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
 RETURNS TABLE(uuid uuid, company_uuid uuid, warehouse_uuid uuid, inventory_uuid uuid, warehouse_inventory_uuid uuid, status character varying, unit character varying, current_stock numeric, average_daily_unit_sales numeric, lead_time_days numeric, safety_stock numeric, custom_safety_stock numeric, reorder_point numeric, notes text, created_at timestamp with time zone, updated_at timestamp with time zone, warehouse_name text, warehouse_inventory_name text, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$