-- First, check if the bucket already exists to avoid errors
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'profile-images') THEN
    -- Create the storage bucket for profile images
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('profile-images', 'profile-images', true);
  END IF;
END $$;

-- Allow users to upload their own profile image - fixed ambiguous column reference
CREATE POLICY "Users can upload their own profile image"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-images' AND
    (storage.foldername(storage.objects.name))[1] = 'profiles' AND
    (storage.foldername(storage.objects.name))[2] = (
      SELECT email
      FROM public.profiles
      WHERE uuid = auth.uid()
    )
  );

-- Allow users to update their own profile image
CREATE POLICY "Users can update their own profile image"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-images' AND
    (storage.foldername(storage.objects.name))[1] = 'profiles' AND
    (storage.foldername(storage.objects.name))[2] = (
      SELECT email
      FROM public.profiles
      WHERE uuid = auth.uid()
    )
  );

-- Allow users to delete their own profile image
CREATE POLICY "Users can delete their own profile image"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-images' AND
    (storage.foldername(storage.objects.name))[1] = 'profiles' AND
    (storage.foldername(storage.objects.name))[2] = (
      SELECT email
      FROM public.profiles
      WHERE uuid = auth.uid()
    )
  );

-- Allow users to view their own profile image or images from users in the same company
CREATE POLICY "Users can view profile images in their company"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'profile-images' AND
    (storage.foldername(storage.objects.name))[1] = 'profiles' AND
    (
      -- User can view their own profile image
      (storage.foldername(storage.objects.name))[2] = (
        SELECT email
        FROM public.profiles
        WHERE uuid = auth.uid()
      )
      OR
      -- User can view profile images of people in the same company
      EXISTS (
        SELECT 1
        FROM profiles viewing_user
        JOIN profiles target_user ON viewing_user.company_uuid = target_user.company_uuid
        WHERE viewing_user.uuid = auth.uid()
        AND target_user.email = (storage.foldername(storage.objects.name))[2]
      )
    )
  );


