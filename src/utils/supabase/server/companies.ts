"use server"

import { createClient } from '@/utils/supabase/server'

// Function to get existing companies for dropdown selection
export async function getExistingCompanies(isLogoRequired: boolean = false) {
  const supabase = await createClient()

  // get all companies without rpc
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')

    if (error) {
      console.error('Error fetching existing companies:', error)
      return { error: error.message }
    }

    if (isLogoRequired) {
      // Get logo image URLs
      const companiesWithLogoUrls = await Promise.all(data.map(async (company) => {
        let logoImageData = null
        if (company.logo_image) {
          try {
            const { data } = supabase
              .storage
              .from('company-images')
              .getPublicUrl(company.logo_image)

            logoImageData = data?.publicUrl || null
          } catch (err) {
            console.error('Error getting image URL:', err)
          }
        }
        return { ...company, logo_url: logoImageData }
      }))

      return { data: companiesWithLogoUrls, error: null }
    } else {
      // Return companies without logo URLs
      return { data, error: null }
    }

  } catch (error) {
    console.error('Error fetching existing companies:', error)
    return { error }
  }
}

// New function to get a single company's details
export async function getUserCompanyDetails(userId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase.rpc(
      'get_user_company',  // This is a function we'll create in SQL
      { user_id: userId }
    )

    if (error) {
      console.error('Error fetching company details:', error)
      return { error: error.message }
    }

    const company = data[0]


    // Get logo image URL if available
    let logoImageData = null
    if (company.logo_image) {
      try {
        // Construct the full path according to storage policy structure
        const fullPath = company.logo_image

        const { data } = supabase
          .storage
          .from('company-images')
          .getPublicUrl(fullPath)

        logoImageData = data?.publicUrl || null
      } catch (err) {
        console.error('Error getting image URL:', err)
      }
    }

    return {
      data: {
        ...company,
        logo_url: logoImageData,
        logo_path: company.logo_image || null
      },
      error: null
    }
  } catch (error) {
    console.error(`Error fetching company details for user ${userId}:`, error)
    return { error }
  }
}