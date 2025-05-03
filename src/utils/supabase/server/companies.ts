"use server"

import { createClient } from '@/utils/supabase/server'

// Function to get existing companies for dropdown selection
export async function getExistingCompanies() {
  const supabase = await createClient()

  try {
    // Get the user's auth ID
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('Not authenticated')
    }

    // Query companies directly with a stronger approach that avoids recursion
    const { data, error } = await supabase.rpc(
      'get_accessible_companies',  // This is a function we'll create in SQL
      { user_id: user.id }
    )

    console.log('Fetched companies:', data)

    if (error) {
      console.error('Error fetching companies:', error)
      return { error: error.message }
    }

    return { data }
  } catch (error) {
    console.error('Error fetching companies:', error)
    return { error }
  }
}

// New function to get a single company's details
export async function getUserCompanyDetails(userId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase.rpc(
      'get_accessible_companies',  // This is a function we'll create in SQL
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
      error: null}
  } catch (error) {
    console.error(`Error fetching company details for user ${userId}:`, error)
    return { error }
  }
}

// Add this new function specifically for registration page
export async function getCompaniesForRegistration() {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase.rpc(
      'get_companies_for_registration'
    )

    if (error) {
      console.error('Error fetching companies for registration:', error)
      return { error: error.message }
    }

    return { data }
  } catch (error) {
    console.error('Error fetching companies for registration:', error)
    return { error }
  }
}