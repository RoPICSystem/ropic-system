'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import sharp from 'sharp'

export async function getRegions() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('address_region')
    .select('regCode, regDesc')
    .order('regDesc')
  
  if (error) {
    console.error('Error fetching regions:', error)
    return []
  }
  
  return data
}

export async function getProvinces(regCode: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('address_province')
    .select('provCode, provDesc')
    .eq('regCode', regCode)
    .order('provDesc')
  
  if (error) {
    console.error('Error fetching provinces:', error)
    return []
  }
  
  return data
}

export async function getCityMunicipalities(provCode: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('address_citymun')
    .select('citymunCode, citymunDesc')
    .eq('provCode', provCode)
    .order('citymunDesc')
  
  if (error) {
    console.error('Error fetching cities/municipalities:', error)
    return []
  }
  
  return data
}

export async function getBarangays(citymunCode: string) {
  const supabase = await createClient()
  
  const { data: rawData, error } = await supabase
    .from('address_brgy')
    .select('brgyCode, brgyDesc')
    .eq('citymunCode', citymunCode)
    .order('brgyDesc')
    
  // Transform brgyDesc to uppercase
  const data = rawData?.map(item => ({
    ...item,
    brgyDesc: item.brgyDesc.toUpperCase()
  })) || []
  
  if (error) {
    console.error('Error fetching barangays:', error)
    return []
  }
  
  return data
}

export async function register(formData: FormData) {
  const supabase = await createClient()

  // Extract basic form data
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string
  
  // Extract user metadata
  const firstName = formData.get('firstName') as string
  const lastName = formData.get('lastName') as string
  const middleName = formData.get('middleName') as string || null
  const suffix = formData.get('suffix') as string || null
  const profileImage = formData.get('profileImage') as File || null
  
  // Additional user metadata
  const isAdmin = formData.get('isAdmin') as string === 'true'
  const gender = formData.get('gender') as string || null
  const birthday = formData.get('birthday') as string || null
  const phoneNumber = formData.get('phoneNumber') as string || null
  
  // Address data
  const address = {
    country: formData.get('address.country') as string || null,
    region: formData.get('address.region') as string || null,
    province: formData.get('address.province') as string || null,
    municipality: formData.get('address.municipality') as string || null,
    barangay: formData.get('address.barangay') as string || null,
    streetAddress: formData.get('address.streetAddress') as string || null,
    postalCode: formData.get('address.postalCode') as string || null,
    fullAddress: formData.get('address.fullAddress') as string || null
  }
  
  // Company address data
  const companyAddress = {
    country: formData.get('companyAddress.country') as string || null,
    region: formData.get('companyAddress.region') as string || null,
    province: formData.get('companyAddress.province') as string || null,
    municipality: formData.get('companyAddress.municipality') as string || null,
    barangay: formData.get('companyAddress.barangay') as string || null,
    streetAddress: formData.get('companyAddress.streetAddress') as string || null,
    postalCode: formData.get('companyAddress.postalCode') as string || null,
    fullAddress: formData.get('companyAddress.fullAddress') as string || null
  }
  
  // Generate full addresses if components are available
  if (address.streetAddress) {
    const addressParts = [
      address.streetAddress,
      address.barangay,
      address.municipality,
      address.province,
      address.region,
      address.country,
      address.postalCode
    ].filter(Boolean);
    
    address.fullAddress = addressParts.join(', ');
  }
  
  if (companyAddress.streetAddress) {
    const companyAddressParts = [
      companyAddress.streetAddress,
      companyAddress.barangay,
      companyAddress.municipality,
      companyAddress.province,
      companyAddress.region,
      companyAddress.country,
      companyAddress.postalCode
    ].filter(Boolean);
    
    companyAddress.fullAddress = companyAddressParts.join(', ');
  }

  // Basic validation
  if (password !== confirmPassword) {
    redirect('/account/register?error=passwords-do-not-match')
  }

  let profileImageUrl = null
  let profileImageThumbUrl = null

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
      
      // Create thumbnail version
      const thumbnailBuffer = await sharp(buffer)
        .resize({
          width: 120,
          height: 120,
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality: 50 })
        .toBuffer()
      
      // Create user directory path
      const userProfilePath = `profiles/${email}`
      
      // Upload main image
      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(`${userProfilePath}/profileImage.webp`, processedImageBuffer, {
          contentType: 'image/webp',
          upsert: true
        })

      if (uploadError) {
        console.error('Error uploading main image:', uploadError)
      } else {
        // Upload thumbnail
        const { error: thumbError } = await supabase.storage
          .from('profile-images')
          .upload(`${userProfilePath}/profileImageThumb.webp`, thumbnailBuffer, {
            contentType: 'image/webp',
            upsert: true
          })
          
        if (thumbError) {
          console.error('Error uploading thumbnail:', thumbError)
        }
        
        // Get public URLs
        const { data: urlData } = supabase.storage
          .from('profile-images')
          .getPublicUrl(`${userProfilePath}/profileImage.webp`)
        
        const { data: thumbUrlData } = supabase.storage
          .from('profile-images')
          .getPublicUrl(`${userProfilePath}/profileImageThumb.webp`)
        
        profileImageUrl = urlData.publicUrl
        profileImageThumbUrl = thumbUrlData.publicUrl
      }
    } catch (error) {
      console.error('Error processing image:', error)
    }
  }

  // Create the user account with metadata
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        isAdmin: isAdmin,
        name: {
          full_name: `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}${suffix ? ' ' + suffix : ''}`,
          first_name: firstName,
          last_name: lastName,
          middle_name: middleName,
          suffix: suffix,
        },
        profile_image: {
          full_url: profileImageUrl,
          thumb_url: profileImageThumbUrl,
        },
        gender: gender,
        birthday: birthday,
        phone_number: phoneNumber,
        address: address,
        company_address: companyAddress,
      },
    },
  })

  if (error) {
    redirect(`/account/register?error=${error.message}`)
  }

  // Create a more detailed profile in a separate table
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').insert({
        id: user.id,
        email: email,
        isAdmin: isAdmin,
        name: {
          full_name: `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}${suffix ? ' ' + suffix : ''}`,
          first_name: firstName,
          last_name: lastName,
          middle_name: middleName,
          suffix: suffix,
        },
        profile_image: {
          full_url: profileImageUrl,
          thumb_url: profileImageThumbUrl,
        },
        gender: gender,
        birthday: birthday,
        phone_number: phoneNumber,
        address: address,
        company_address: companyAddress,
      });
    }
  } catch (error) {
    console.error('Error creating profile:', error)
    // Continue with the flow even if profile creation fails
  }

  revalidatePath('/', 'layout')
  redirect('/account/verification-requested')
}