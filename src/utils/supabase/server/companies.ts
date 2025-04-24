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

    return { data: data[0] }
  } catch (error) {
    console.error(`Error fetching company details for user ${userId}:`, error)
    return { error }
  }
}