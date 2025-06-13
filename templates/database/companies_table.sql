-- Create companies table
create table if not exists public.companies (
  uuid UUID primary key default gen_random_uuid (),
  name TEXT not null,
  description TEXT,
  logo_image TEXT,
  address JSONB not null default '{}'::jsonb,
  company_layout JSONB default '[]',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.companies ENABLE row LEVEL SECURITY;
-- SELECT policy: Anyone can view companies (for registration purposes)
CREATE POLICY "companies_select_policy" ON public.companies 
FOR SELECT TO anon, authenticated 
USING (true);

-- INSERT policy: Any authenticated user can create companies
CREATE POLICY "companies_insert_policy" ON public.companies 
FOR INSERT TO authenticated
WITH CHECK (true);

-- UPDATE policy: Only admins can update their company
CREATE POLICY "companies_update_policy" ON public.companies
FOR UPDATE TO authenticated 
USING (
  public.is_user_admin((select auth.uid())) = true
  AND uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);

-- DELETE policy: Only admins can delete their company
CREATE POLICY "companies_delete_policy" ON public.companies 
FOR DELETE TO authenticated 
USING (
  public.is_user_admin((select auth.uid())) = true
  AND uuid = public.get_user_company_uuid((select auth.uid()))
  AND public.get_user_company_uuid((select auth.uid())) IS NOT NULL
);


create index IF not exists idx_profiles_company_uuid on public.profiles (company_uuid);
create index IF not exists idx_companies_name on public.companies (name);
create index IF not exists idx_companies_created_at on public.companies (created_at);
create index IF not exists idx_companies_updated_at on public.companies (updated_at);



create or replace function public.get_user_company (user_id UUID) 
returns setof companies 
language sql 
security definer 
set search_path = public
stable 
as $$
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