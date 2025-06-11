-- First, create the storage bucket if it doesn't exist
insert into
  storage.buckets (id, name, public)
values
  ('company-images', 'company-images', true)
on conflict do nothing;

-- Allow company admins to upload company images
-- Path format: logo/{company_uuid}/logo.webp
create policy "Company admins can upload company images" on storage.objects 
for insert 
to authenticated
with check (
  bucket_id = 'company-images'
  and (storage.foldername(name))[1] = 'logo'
  and public.is_user_admin(auth.uid())
  and public.get_user_company_uuid(auth.uid()) = (storage.foldername(name))[2]::uuid
);

-- Allow company admins to update company images
create policy "Company admins can update company images" on storage.objects
for update
to authenticated 
using (
  bucket_id = 'company-images'
  and (storage.foldername(name))[1] = 'logo'
  and public.is_user_admin(auth.uid())
  and public.get_user_company_uuid(auth.uid()) = (storage.foldername(name))[2]::uuid
)
with check (
  bucket_id = 'company-images'
  and (storage.foldername(name))[1] = 'logo'
  and public.is_user_admin(auth.uid())
  and public.get_user_company_uuid(auth.uid()) = (storage.foldername(name))[2]::uuid
);

-- Allow company admins to delete company images
create policy "Company admins can delete company images" on storage.objects 
for delete 
to authenticated 
using (
  bucket_id = 'company-images'
  and (storage.foldername(name))[1] = 'logo'
  and public.is_user_admin(auth.uid())
  and public.get_user_company_uuid(auth.uid()) = (storage.foldername(name))[2]::uuid
);

CREATE POLICY "Individual user Access" ON "storage"."objects"
AS PERMISSIVE FOR SELECT
TO public
USING ((( SELECT auth.uid() AS uid) = (owner_id)::uuid))
