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

-- Companies policies
create policy "Allow users to view companies they belong to" on public.companies for
select
  to authenticated using (
    exists (
      select
        1
      from
        profiles
      where
        profiles.uuid = auth.uid ()
        and profiles.company_uuid = companies.uuid
    )
  );

create policy "Allow admin users to delete their own company" on public.companies for DELETE to authenticated using (
  exists (
    select
      1
    from
      profiles
    where
      profiles.uuid = auth.uid ()
      and profiles.company_uuid = companies.uuid
      and profiles.is_admin = true
  )
);

create policy "Allow authenticated users to create companies" on public.companies for INSERT to authenticated
with
  check (true);

create policy "Allow admin users to update their company" on public.companies
for update
  to authenticated using (
    public.is_user_admin(auth.uid())
    and public.get_user_company_uuid(auth.uid()) = companies.uuid
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