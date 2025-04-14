'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/utils/supabase/server'
import sharp from 'sharp'
import { baseURL } from '@/utils/tools'
import {
  getLocalTimeZone,
  parseDate
} from "@internationalized/date";
import { User } from '@supabase/supabase-js'


export async function register(formData: FormData) {
  const supabase = await createClient()

  const returnError = (message: string) => {
    console.error(message)
    redirect(`/account/register?error=${encodeURIComponent(message)}`)
  }

  // Extract basic form data
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  // Basic validation
  if (password !== confirmPassword) {
    returnError('Passwords do not match')
  }
  
  const profileImage = formData.get('profileImage') as File || null

  const birthdayString = formData.get('birthday') as string | null;
  let birthday: string | null = null;
  if (birthdayString) {
    try {
      birthday = parseDate(birthdayString).toDate(getLocalTimeZone()).toISOString();
    } catch (error) {
      returnError('Invalid date format for birthday')
    }
  }

  const name = {
    first_name: formData.get('firstName') as string,
    last_name: formData.get('lastName') as string,
    middle_name: formData.get('middleName') as string || null,
    suffix: formData.get('suffix') as string || null,
  }



  const metadata = {
    is_admin: formData.get('isAdmin') as string === 'true',
    name,
    full_name: `${name.first_name} ${name.middle_name ? name.middle_name + ' ' : ''}${name.last_name}${name.suffix ? ' ' + name.suffix : ''}`,
    profile_image: `profiles/${email}/profileImage.webp`,
    gender: formData.get('gender') as string,
    birthday: birthday,
    phone_number: formData.get('phoneNumber') as string,
    address: {
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
      streetAddress: formData.get('address.streetAddress') as string,
      postalCode: formData.get('address.postalCode') as string,
    },
    full_address: formData.get('address.fullAddress') as string,
    company_address: {
      country: {
        code: formData.get('companyAddress.country.code') as string,
        desc: formData.get('companyAddress.country.desc') as string
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
    company_name: formData.get('companyName') as string
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
          width: 720,
          height: 720,
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality: 80 })
        .toBuffer()

      // Upload main image
      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(metadata.profile_image, processedImageBuffer, {
          contentType: 'image/webp',
          upsert: true
        })

      if (uploadError) {
        returnError('Error uploading profile image')
      } 
    } catch (error) {
      returnError(`Error processing profile image: ${error}`)
    }
  }

  const { error, data: { user } } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${baseURL()}/account/verification`,
      data: metadata
    },
  })

  const deleteAccount = async (user: User | null) => {
    const supabaseAdmin = await createAdminClient()

    if (!user) return

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
    if (authError) {
      console.error('Error deleting user:', authError)
    }

    const userProfilePath = `profiles/${email}`
    const { error: deleteError } = await supabaseAdmin.storage
      .from('profile-images')
      .remove([`${userProfilePath}/profileImage.webp`, `${userProfilePath}/profileImageThumb.webp`])

    if (deleteError) {
      console.error('Error deleting main image:', deleteError)
      returnError('Error deleting main image')
    }
  }

  if (error) {
    deleteAccount(user)
    returnError(error.message)
  }

  // Create a more detailed profile in a separate table
  if (user) {
    const { error } = await supabase
      .from('profiles')
      .insert({
        ...metadata,
        user_id: user.id,
        email: email,
      })
      .select();
    if (error) {
      deleteAccount(user)
      returnError(`Error creating user table: ${error.message}`)
    }
  } else {
    deleteAccount(user)
    returnError('User creation failed')
  }

  revalidatePath('/', 'layout')
  redirect(`/account/verification?email=${encodeURIComponent(email)}`)
}