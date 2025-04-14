'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import sharp from 'sharp'
import { redirect } from 'next/navigation'
import { User } from '@supabase/supabase-js'


export async function updateProfile(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Extract profile image if provided
  const profileImage = formData.get('profileImage') as File || null
  let imageUpdates = {}

  // Process and upload profile image if provided
  if (profileImage && profileImage.size > 0) {
    try {
      // Convert File to Buffer
      const arrayBuffer = await profileImage.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Process image with sharp
      const processedImageBuffer = await sharp(buffer)
        .resize({
          width: 720,
          height: 720,
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality: 80 })
        .toBuffer()

      // Create thumbnail
      const thumbnailBuffer = await sharp(buffer)
        .resize({
          width: 120,
          height: 120,
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality: 50 })
        .toBuffer()

      const email = user.email as string
      const imagePathFull = `profiles/${email}/profileImage.webp`

      // Upload main image
      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(imagePathFull, processedImageBuffer, {
          contentType: 'image/webp',
          upsert: true
        })

      if (uploadError) {
        return { error: 'Error uploading profile image' }
      }

      imageUpdates = {
        profile_image: imagePathFull,
      }
    } catch (error) {
      return { error: `Error processing profile image: ${error}` }
    }
  }

  // Extract form data for profile update
  const name = {
    first_name: formData.get('firstName') as string,
    last_name: formData.get('lastName') as string,
    middle_name: formData.get('middleName') as string || null,
    suffix: formData.get('suffix') as string || null,
  }

  const updatedProfile = {
    name,
    full_name: `${name.first_name} ${name.middle_name ? name.middle_name + ' ' : ''}${name.last_name}${name.suffix ? ' ' + name.suffix : ''}`,
    gender: formData.get('gender') as string,
    birthday: formData.get('birthday') as string,
    phone_number: formData.get('phoneNumber') as string,
    address: {
      country: {
        code: formData.get('address.country.code') || '1',
        desc: formData.get('address.country.desc') || 'PHILIPPINES'
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
      streetAddress: formData.get('address.streetAddress') as string,
      postalCode: formData.get('address.postalCode') as string,
    },
    full_address: formData.get('address.fullAddress') as string,
    company_address: {
      country: {
        code: formData.get('companyAddress.country.code') || '1',
        desc: formData.get('companyAddress.country.desc') || 'PHILIPPINES'
      },
      region: {
        code: formData.get('companyAddress.region.code') as string,
        desc: formData.get('companyAddress.region.desc') as string
      },
      province: {
        code: formData.get('companyAddress.province.code') as string,
        desc: formData.get('companyAddress.province.desc') as string
      },
      municipality: {
        code: formData.get('companyAddress.municipality.code') as string,
        desc: formData.get('companyAddress.municipality.desc') as string
      },
      barangay: {
        code: formData.get('companyAddress.barangay.code') as string,
        desc: formData.get('companyAddress.barangay.desc') as string
      },
      streetAddress: formData.get('companyAddress.streetAddress') as string,
      postalCode: formData.get('companyAddress.postalCode') as string,
    },
    full_company_address: formData.get('companyAddress.fullAddress') as string,
    company_name: formData.get('companyName') as string,
    ...imageUpdates
  }

  // Update profile in database
  const { error } = await supabase
    .from('profiles')
    .update(updatedProfile)
    .eq('user_id', user.id)

  if (error) {
    console.error('Error updating profile:', error)
    return { error: error.message }
  }

  // Also update user metadata in auth
  const { error: authError } = await supabase.auth.updateUser({
    data: updatedProfile
  })

  if (authError) {
    console.error('Error updating auth user:', authError)
    return { error: authError.message }
  }

  revalidatePath('/', 'layout')
  return { error: null }
}