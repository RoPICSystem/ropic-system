'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import sharp from 'sharp'
import { redirect } from 'next/navigation'
import { getLocalTimeZone, parseDate } from '@internationalized/date'



export async function updateProfile(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  const returnError = (message: string) => {
    console.error(message)
    redirect(`home/profile/?error=${encodeURIComponent(message)}`)
  }

  // Extract basic user data
  const email = formData.get('email') as string;
  const profileImage = formData.get('profileImage') as File;
  const isNewCompany = formData.get('isNewCompany') === 'true';
  const updateCompany = formData.get('updateCompany') === 'true';

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
    streetAddress: formData.get('address.streetAddress') as string,
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

  let company: {
    uuid: string;
    name: string;
    address: {}
  } | null = null;

  try {
    // Begin database transaction
    const { data: client } = await supabase.auth.getSession();

    if (!client.session) {
      // Step 2: Handle company creation or selection
      if (updateCompany) {
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
            streetAddress: formData.get('newCompany.address.streetAddress') as string,
            postalCode: formData.get('newCompany.address.postalCode') as string,
            fullAddress: formData.get('newCompany.address.fullAddress') as string
          };

          // Create a new company
          const { error: companyError, data: companyData } = await supabase
            .from('companies')
            .insert({
              name: newCompanyName,
              address: newCompanyAddressData
            })
            .select('uuid, name, address')
            .single();

          company = companyData;

          if (companyError) {
            returnError(`Error creating company: ${companyError.message}`);
            return { error: companyError.message }
          }

        } else {
          // Use existing company
          const companyId = formData.get('existingCompany.uuid') as string;

          // Verify if company exists
          const { data: companyData, error: companyCheckError } = await supabase
            .from('companies')
            .select('uuid, name, address')
            .eq('uuid', companyId)
            .single();

          if (companyCheckError || !companyData) {
            return { error: 'Selected company does not exist or is invalid' }
          }

          // Check admin count if user is registering as admin
          const isAdmin = formData.get('isAdmin') as string === 'true';
          if (isAdmin) {
            // Count existing admins in this company
            const { count: adminCount, error: countError } = await supabase
              .from('profiles')
              .select('uuid', { count: 'exact' })
              .eq('company.uuid', companyId)
              .eq('is_admin', true);

            if (countError) {
              return { error: countError.message }
            }

            if (adminCount && adminCount >= 2) {
              return { error: 'This company already has the maximum number of admins (2). Please register as an operator or contact existing admins.' }
            }
          }

          company = companyData
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
        full_address: formData.get('address.fullAddress') as string,
        ...(updateCompany ? { company } : {}),
      }

      // Also update user metadata in auth
      const { error: authError } = await supabase.auth.updateUser({
        data: metadata
      })

      if (authError) {
        return { error: authError.message }
      }

      // Update profile in database
      const { error } = await supabase
        .from('profiles')
        .update(metadata)
        .eq('uuid', user.id)

      if (error) {
        return { error: error.message }
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

    }
  } catch (error: any) {
    console.error('Error during registration:', error)
    returnError('An unexpected error occurred during registration')
    return { error: error.message || 'An unexpected error occurred' }
  }

  revalidatePath('/', 'layout')
  return { success: true, error: null }
}
