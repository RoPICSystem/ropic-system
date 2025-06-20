'use server'

import { createClient } from '@/utils/supabase/server'
import { Address } from '@/utils/supabase/server/address'
import { PostgrestFilterBuilder } from '@supabase/postgrest-js'
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { cookies } from 'next/headers'


export type Name = {
  suffix: string | null
  last_name: string
  first_name: string
  middle_name: string | null
}

// Define types for the user data
export type UserProfile = {
  uuid: string
  email: string
  full_name: string
  name: Name
  is_admin: boolean
  profile_image: string
  gender: string
  birthday: string
  phonenumber: string
  address: Address
  company_uuid: string
  role: string
  created_at: string
  updated_at: string
  [key: string]: any // For any additional fields
}

export type UserCompany = {
  uuid: string
  name: string
  address: Address
  description: string | null
  logo_image: string | null
  created_at: string
  updated_at: string
  [key: string]: any // For any additional fields
}


// Fetch user profile data
export async function getUserProfile() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated', data: null }
  }

  // First get only the current user's profile using auth.uid() equality
  // This avoids the recursive policy issue
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('uuid', user.id)
    .maybeSingle()

  if (error) {
    console.error('Error fetching profile:', error)
    return { error: error.message, data: null }
  }

  if (!profile) {
    return { error: 'Profile not found', data: null }
  }

  // Get profile image URL if available
  let profileImageData = null
  if (profile.profile_image) {
    try {
      // Construct the full path according to storage policy structure
      const fullPath = profile.profile_image

      const { data } = supabase
        .storage
        .from('profile-images')
        .getPublicUrl(fullPath)

      profileImageData = data?.publicUrl || null
    } catch (err) {
      console.error('Error getting image URL:', err)
    }
  }

  return {
    data: {
      ...profile,
      email: user.email,
      profile_image_url: profileImageData,
      profile_image_path: profile.profile_image || null
    },
    error: null
  }
}

// gets profile_image full path based from the profile data
export async function getProfileImagePath(profile_image: string): Promise<string | null> {
  if (!profile_image) return null

  const supabase = await createClient()

  try {
    // Construct the full path according to storage policy structure
    const fullPath = profile_image

    const { data } = supabase
      .storage
      .from('profile-images')
      .getPublicUrl(fullPath)

    return data?.publicUrl || null
  } catch (err) {
    console.error('Error getting image URL:', err)
    return null
  }
}

// Provides parameters needed to set up real-time profile subscription in client component
export async function getProfileSubscription(
  uuid: string,
  payload: (payload: RealtimePostgresChangesPayload<{ [key: string]: any; }>) => void): Promise<RealtimeChannel> {
  const supabase = await createClient()

  // Set up real-time subscription for delivery items
  return supabase
    .channel('delivery-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `uuid=eq.${uuid}`
      },
      payload
    );
}

// Generate download image URL
export async function getImageUrl(path: string, isThumbnail: boolean = false) {
  if (!path) return { data: null, error: 'No image path provided' }

  const supabase = await createClient()

  try {
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

    return { data: { url: data.publicUrl, baseUrl: path }, error: null }
  } catch (err) {
    console.error('Error fetching image URL:', err)
    return { error: 'Error fetching image URL', data: null }
  }
}

export async function signOut() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('Error signing out:', error)
    return { error: error.message }
  }

  setUserInCookies(null);

  return { data: 'Signed out successfully', error: null }
}

// New function to get user's company data separately, avoiding the recursion
export async function getUserCompany() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated', data: null }
  }

  // First get the user's profile to get company_uuid
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_uuid')
    .eq('uuid', user.id)
    .single()

  if (!profile?.company_uuid) {
    return { error: 'No company found', data: null }
  }

  // Then get the company details directly using UUID
  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('uuid', profile.company_uuid)
    .single()

  if (error) {
    console.error('Error fetching company:', error)
    return { error: error.message, data: null }
  }

  return { data: company, error: null }
}

// Get user
export async function getUserFromCookies() {
  const userData = (await cookies())
    .get('userData')?.value

  if (!userData) {
    return null
  }

  try {
    return JSON.parse(userData)
  } catch (error) {
    console.error('Error parsing user data from cookies:', error)
    return null
  }
}

// Set user
export async function setUserInCookies(userData: UserProfile | null) {
  if (userData) {
    (await cookies())
      .set(
        'userData',
        JSON.stringify(userData),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 60 * 60 * 24 * 7, // 1 week
          path: '/',
        });
  } else {
    // remove cookie
    (await cookies())
      .delete('userData')
  }
}

// Get users from company
export async function getUsersFromCompany(
  companyUuid: string,
  userType: 'all' | 'admin' | 'operator' = 'all',
  getImageUrl: boolean = false,
  selectFields: string = 'uuid, email, full_name, is_admin'
) {
  const supabase = await createClient()

  const queryFields = getImageUrl
    ? `${selectFields}${selectFields.includes('profile_image') ? '' : ', profile_image'}${selectFields.includes('is_admin') ? '' : ', is_admin'}`
    : selectFields.includes('is_admin') ? selectFields : `${selectFields}, is_admin`;

  let query = supabase
    .from('profiles')
    .select(queryFields)
    .eq('company_uuid', companyUuid);

  if (userType === 'admin') {
    query = query.eq('is_admin', true);
  }
  else if (userType === 'operator') {
    query = query.eq('is_admin', false);
  }
  try {
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching users:', error);
      return { error: error.message, data: [], success: false  };
    }

    // If getImageUrl is true, fetch image URLs for each user
    if (getImageUrl && data) {
      for (const user of data as any[]) {
        if (user.profile_image) {
          const imageUrl = await getProfileImagePath(user.profile_image);
          user.profile_image_url = imageUrl;
        }
      }
    }

    return { data: data || [], error: null, success: true };
  }
  catch (error: any) {
    console.error('Error fetching users:', error);
    return { error: error.message || 'Unknown error occurred', data: [], success: false  };
  }
}