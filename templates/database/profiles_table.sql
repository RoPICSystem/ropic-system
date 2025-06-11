-- Create profiles table (with company_uuid as the only company reference)
create table if not exists public.profiles (
  uuid UUID primary key references auth.users (id) on delete CASCADE,
  email TEXT unique not null,
  full_name TEXT not null,
  is_admin BOOLEAN not null default false,
  name JSONB not null default '{}'::jsonb,
  profile_image TEXT,
  gender TEXT,
  birthday TIMESTAMPTZ,
  phone_number TEXT,
  address JSONB not null default '{}'::jsonb,
  settings JSONB default '{}'::jsonb,
  company_uuid UUID references public.companies (uuid) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.profiles ENABLE row LEVEL SECURITY;

-- Create helper functions that bypass RLS using SECURITY DEFINER
create or replace function public.get_user_company_uuid(user_id uuid) 
returns uuid 
security definer
set search_path = public
language plpgsql
as $$
declare
  company_id uuid;
begin
  select company_uuid into company_id 
  from profiles 
  where uuid = user_id;
  return company_id;
end;
$$;

create or replace function public.is_user_admin(user_id uuid) 
returns boolean 
security definer
set search_path = public
language plpgsql
as $$
declare
  admin_status boolean;
begin
  select is_admin into admin_status 
  from profiles 
  where uuid = user_id;
  return coalesce(admin_status, false);
end;
$$;

-- Simplified SELECT policy: Users can view their own profile OR profiles in their company
create policy "profiles_select_policy" on public.profiles
for select to authenticated
using (
  -- Own profile
  auth.uid() = uuid
  or
  -- Same company (using helper function to avoid recursion)
  (
    public.get_user_company_uuid(auth.uid()) is not null
    and public.get_user_company_uuid(auth.uid()) = company_uuid
  )
);

-- INSERT policy: Users can only insert their own profile
create policy "profiles_insert_policy" on public.profiles
for insert to authenticated
with check (auth.uid() = uuid);

-- UPDATE policy: Users can update their own profile OR admins can update profiles in their company
create policy "profiles_update_policy" on public.profiles
for update to authenticated
using (
  -- Own profile
  auth.uid() = uuid
  or
  -- Admin updating profile in same company
  (
    public.is_user_admin(auth.uid()) = true
    and public.get_user_company_uuid(auth.uid()) = company_uuid
    and public.get_user_company_uuid(auth.uid()) is not null
  )
);

-- Optional: DELETE policy if needed
create policy "profiles_delete_policy" on public.profiles
for delete to authenticated
using (
  -- Only admins can delete profiles in their company (excluding themselves)
  public.is_user_admin(auth.uid()) = true
  and public.get_user_company_uuid(auth.uid()) = company_uuid
  and public.get_user_company_uuid(auth.uid()) is not null
  and auth.uid() != uuid -- Prevent self-deletion
);