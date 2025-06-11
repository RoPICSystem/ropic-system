'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import sharp from 'sharp'
import { getLocalTimeZone, parseDate } from '@internationalized/date'


export async function updateProfile(formData: FormData):
  Promise<{ error?: string, success?: boolean }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Extract basic user data
  const email = formData.get('email') as string;
  const profileImage = formData.get('profileImage') as File;

  // Extract address data
  const address = {
    country: {
      code: formData.get('address.country.code') as string,
      desc: formData.get('address.country.desc') as string
    },
    region: {
      code: formData.get('address.region.code') as string,
      desc: formData.get('address.region.desc') as string
    },
    province: {
      code: formData.get('address.province.code') as string,
      desc: formData.get('address.province.desc') as string
    },
    municipality: {
      code: formData.get('address.municipality.code') as string,
      desc: formData.get('address.municipality.desc') as string
    },
    barangay: {
      code: formData.get('address.barangay.code') as string,
      desc: formData.get('address.barangay.desc') as string
    },
    street: formData.get('address.street') as string,
    postalCode: formData.get('address.postalCode') as string,
    fullAddress: formData.get('address.fullAddress') as string
  };

  const name = {
    first_name: formData.get('firstName') as string,
    last_name: formData.get('lastName') as string,
    middle_name: formData.get('middleName') as string || null,
    suffix: formData.get('suffix') as string || null,
  }

  const birthdayString = formData.get('birthday') as string | null;
  let birthday: string | null = null;
  if (birthdayString) {
    try {
      birthday = parseDate(birthdayString).toDate(getLocalTimeZone()).toISOString();
    } catch (error: any) {
      return { error: error.message || 'Invalid date format for birthday' }
    }
  }

  try {
    const metadata = {
      name,
      full_name: `${name.first_name} ${name.middle_name ? name.middle_name + ' ' : ''}${name.last_name}${name.suffix ? ' ' + name.suffix : ''}`,
      profile_image: `profiles/${email}/profileImage.webp`,
      gender: formData.get('gender.key') as string,
      birthday,
      phone_number: formData.get('phoneNumber') as string,
      address,
    }

    // Update user metadata in auth
    const { error: authError } = await supabase.auth.updateUser({
      data: metadata
    })

    if (authError) {
      return { error: authError.message }
    }

    // Update profile in database
    const { error: profileError } = await supabase
      .from('profiles')
      .update(metadata)
      .eq('uuid', user.id)

    if (profileError) {
      return { error: profileError.message }
    }

    // Process and upload profile image if provided
    if (profileImage && profileImage.size > 0) {
      try {
        // Convert File to Buffer
        const arrayBuffer = await profileImage.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Process image with sharp - create full size version (cropped to square)
        const processedImageBuffer = await sharp(buffer)
          .resize({
            width: 1024,
            height: 1024,
            fit: 'cover',
            position: 'center'
          })
          .webp({ quality: 80 })
          .toBuffer()

        // Upload main image
        const { error: uploadError } = await supabase.storage
          .from('profile-images')
          .upload(`profiles/${email}/profileImage.webp`, processedImageBuffer, {
            contentType: 'image/webp',
            upsert: true
          })

        if (uploadError) {
          return { error: uploadError.message }
        }
      } catch (error: any) {
        return { error: error.message || 'Error processing profile image' }
      }
    }

  } catch (error: any) {
    console.error('Error updating profile:', error)
    return { error: error.message || 'An unexpected error occurred' }
  }
  
  revalidatePath('/', 'layout')
  return { success: true }
}