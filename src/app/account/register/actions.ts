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


export async function register(formData: FormData) : 
  Promise<{ error?: string, success?: boolean  }> {
  const supabase = await createClient()
  const supabaseAdmin = await createAdminClient();

  const deleteAccount = async (user: User | null, companyUuid: string | null = null) => {

    // delete company if it exists
    if (companyUuid) {
      const { error: companyError } = await supabaseAdmin
        .from('companies')
        .delete()
        .eq('uuid', companyUuid)

      if (companyError) {
        console.error('Error deleting company:', companyError)
      }
    }

    if (!user) return

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
    if (authError) {
      console.error('Error deleting user:', authError)
    }

    const userProfilePath = `profiles/${email}`
    const { error: deleteError } = await supabaseAdmin.storage
      .from('profile-images')
      .remove([`${userProfilePath}/profileImage.webp`])

    if (deleteError) {
      console.error('Error deleting main image:', deleteError)
      return { error: deleteError }
    }
  }
  // return { error: 'Not implemented' }

  // Extract basic user data
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const profileImage = formData.get('profileImage') as File;
  const isNewCompany = formData.get('isNewCompany') === 'true';

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
      return { error: error.message || 'Invalid date format' }
    }
  }

  let companyUuid: string | null = null;

  try {
    // Begin database transaction
    const { data: client } = await supabase.auth.getSession();

    if (!client.session) {
      // Step 2: Handle company creation or selection
      if (isNewCompany) {
        // Extract new company data
        const newCompanyName = formData.get('newCompanyName') as string;
        const newCompanyAddressData = {
          country: {
            code: formData.get('newCompany.address.country.code') as string,
            desc: formData.get('newCompany.address.country.desc') as string
          },
          region: {
            code: formData.get('newCompany.address.region.code') as string,
            desc: formData.get('newCompany.address.region.desc') as string
          },
          province: {
            code: formData.get('newCompany.address.province.code') as string,
            desc: formData.get('newCompany.address.province.desc') as string
          },
          municipality: {
            code: formData.get('newCompany.address.municipality.code') as string,
            desc: formData.get('newCompany.address.municipality.desc') as string
          },
          barangay: {
            code: formData.get('newCompany.address.barangay.code') as string,
            desc: formData.get('newCompany.address.barangay.desc') as string
          },
          street: formData.get('newCompany.address.street') as string,
          postalCode: formData.get('newCompany.address.postalCode') as string,
          fullAddress: formData.get('newCompany.address.fullAddress') as string
        };

        // Create a new company
        const { error: companyError, data: companyData } = await supabaseAdmin
        .from('companies')
        .insert({
          name: newCompanyName,
          address: newCompanyAddressData
        })
        .select('uuid')
        .single();

        if (companyError) {
          return { error: companyError.message }
        }
        
        companyUuid = companyData.uuid;

      } else {
        // Use existing company
        companyUuid = formData.get('existingCompany.uuid') as string;

        // Verify if company exists
        const { data: companyData, error: companyCheckError } = await supabaseAdmin
          .from('companies')
          .select('uuid')
          .eq('uuid', companyUuid)
          .single();

        if (companyCheckError || !companyData) {
          return { error: 'Company not found' }
        }

        // Check admin count if user is registering as admin
        const isAdmin = formData.get('isAdmin') as string === 'true';
        if (isAdmin) {
          // Count existing admins in this company
          const { count: adminCount, error: countError } = await supabase
            .from('profiles')
            .select('uuid', { count: 'exact' })
            .eq('company_uuid', companyUuid)
            .eq('is_admin', true);

          if (countError) {
            return { error: countError.message }
          }

          if (adminCount && adminCount >= 2) {
            return { error: 'This company already has 2 admins. Please contact support for assistance.' }
          }
        }
      }

      const metadata = {
        is_admin: formData.get('isAdmin') as string === 'true',
        name,
        full_name: `${name.first_name} ${name.middle_name ? name.middle_name + ' ' : ''}${name.last_name}${name.suffix ? ' ' + name.suffix : ''}`,
        profile_image: `profiles/${email}/profileImage.webp`,
        gender: formData.get('gender.key') as string,
        birthday,
        phone_number: formData.get('phoneNumber') as string,
        address,
        company_uuid: companyUuid,
        settings: {
          fullScreen: false,
          defaultView: 'grouped',
          pageSize: 15
        }
      }

      // Step 3: Create user in auth.users
      const { data: userData, error: userError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata
        }
      });

      if (userError) {
        if (isNewCompany) {
          deleteAccount(null, companyUuid)
        }
        return { error: userError.message }
      }

      // Step 4: Create detailed user profile in profiles table
      const userId = userData.user?.id;
      if (!userId) {
        if (isNewCompany) {
          deleteAccount(null, companyUuid)
        }
        return { error: 'User ID not found' }
      }

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          ...metadata,
          uuid: userId,
          email: email,
        });

      if (profileError) {
        deleteAccount(userData.user, companyUuid)
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
          const { error: uploadError } = await supabaseAdmin.storage
            .from('profile-images')
            .upload(`profiles/${email}/profileImage.webp`, processedImageBuffer, {
              contentType: 'image/webp',
              upsert: true
            })

          if (uploadError) {
            deleteAccount(userData.user, isNewCompany ? companyUuid : null)
            return { error: uploadError.message }
          }
        } catch (error: any) {
          deleteAccount(userData.user, isNewCompany ? companyUuid : null)
          return { error: error.message || 'Error processing image' }
        }
      }

    } else {
      return { error: 'Session not found' }
    }
  } catch (error: any) {
    console.error('Error during registration:', error)
    return { error: error.message || 'An error occurred during registration' }
  }

  revalidatePath('/', 'layout')
  redirect(`/account/verification?email=${encodeURIComponent(email)}`)
  
  return { success: true }
}