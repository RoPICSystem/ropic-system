'use server'

import { createClient } from '@/utils/supabase/server'

// Fetch user profile data
export async function getUserProfile() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated', data: null }
  }

  // Fetch profile from profiles table
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (error) {
    console.error('Error fetching profile:', error)
    return { error: error.message, data: null }
  }

  const profile_image = await getImageUrl(profile.profile_image)

  console.log({ ...profile, email: user.email, profile_image });

  return { data: { ...profile, email: user.email, profile_image }, error: null }
}

// Generate download image URL
export async function getImageUrl(path: string, isThumbnail: boolean = false) {
  const supabase = await createClient()

  const { data } = supabase
    .storage
    .from('profile-images')
    .getPublicUrl(path, {
      ...(!isThumbnail ? {} : {
        transform: {
          width: 120,
          height: 120,
          quality: 80
        }
      })
    })

  if (!data) {
    console.error('Error fetching image URL:', data)
    return { error: 'Error fetching image URL', data: null }
  }

  return { data: { url: data.publicUrl, baseUrl: path }, error: null }
}