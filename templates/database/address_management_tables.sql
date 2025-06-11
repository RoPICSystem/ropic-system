-- Create address_region table
create table if not exists public.address_region (
  id BIGSERIAL primary key,
  psgc_code BIGINT not null unique,
  reg_desc VARCHAR(255) not null,
  reg_code INT not null unique
);

-- Create address_province table
create table if not exists public.address_province (
  id BIGSERIAL primary key,
  psgc_code BIGINT not null unique,
  prov_desc VARCHAR(255) not null,
  reg_code INT not null references public.address_region (reg_code),
  prov_code INT not null unique
);

-- Create address_citymun table
create table if not exists public.address_citymun (
  id BIGSERIAL primary key,
  psgc_code BIGINT not null unique,
  citymun_desc VARCHAR(255) not null,
  reg_code INT not null references public.address_region (reg_code),
  prov_code INT not null references public.address_province (prov_code),
  citymun_code INT not null unique
);

-- Create address_brgy table
create table if not exists public.address_brgy (
  id BIGSERIAL primary key,
  brgy_code BIGINT not null unique,
  brgy_desc VARCHAR(255) not null,
  reg_code INT not null references public.address_region (reg_code),
  prov_code INT not null references public.address_province (prov_code),
  citymun_code INT not null references public.address_citymun (citymun_code)
);

-- Create indexes for better performance
create index IF not exists idx_address_region_reg_code on public.address_region (reg_code);
create index IF not exists idx_address_province_reg_code on public.address_province (reg_code);
create index IF not exists idx_address_province_prov_code on public.address_province (prov_code);
create index IF not exists idx_address_citymun_reg_code on public.address_citymun (reg_code);
create index IF not exists idx_address_citymun_prov_code on public.address_citymun (prov_code);
create index IF not exists idx_address_citymun_citymun_code on public.address_citymun (citymun_code);
create index IF not exists idx_address_brgy_reg_code on public.address_brgy (reg_code);
create index IF not exists idx_address_brgy_prov_code on public.address_brgy (prov_code);
create index IF not exists idx_address_brgy_citymun_code on public.address_brgy (citymun_code);
create index IF not exists idx_address_brgy_brgy_code on public.address_brgy (brgy_code);

-- Create text search indexes for fast searching
create index IF not exists idx_address_region_desc_gin on public.address_region using gin (to_tsvector('english', reg_desc));
create index IF not exists idx_address_province_desc_gin on public.address_province using gin (to_tsvector('english', prov_desc));
create index IF not exists idx_address_citymun_desc_gin on public.address_citymun using gin (to_tsvector('english', citymun_desc));
create index IF not exists idx_address_brgy_desc_gin on public.address_brgy using gin (to_tsvector('english', brgy_desc));

-- Enable RLS for each table
alter table public.address_region ENABLE row LEVEL SECURITY;
alter table public.address_province ENABLE row LEVEL SECURITY;
alter table public.address_citymun ENABLE row LEVEL SECURITY;
alter table public.address_brgy ENABLE row LEVEL SECURITY;

-- Allow all users to SELECT (read) data from address_region
create policy "Allow read for all users" on public.address_region for
select
  using (true);

-- Allow all users to SELECT (read) data from address_province
create policy "Allow read for all users" on public.address_province for
select
  using (true);

-- Allow all users to SELECT (read) data from address_citymun
create policy "Allow read for all users" on public.address_citymun for
select
  using (true);

-- Allow all users to SELECT (read) data from address_brgy
create policy "Allow read for all users" on public.address_brgy for
select
  using (true);

-- Get address data efficiently based on current selections
create or replace function get_address_dropdown_data (
  target_reg_code TEXT default null,
  target_prov_code TEXT default null,
  target_citymun_code TEXT default null
) RETURNS JSON as $$
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
$$ LANGUAGE plpgsql
set
  search_path = public;

-- Function to get complete address data for a location
create or replace function get_complete_address_data (citymun_code text) RETURNS json LANGUAGE plpgsql
set
  search_path = public as $$
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