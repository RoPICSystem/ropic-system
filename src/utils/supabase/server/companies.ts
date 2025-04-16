"use server"

import { createClient } from '@/utils/supabase/server'

// Function to get existing companies for dropdown selection
export async function getExistingCompanies() {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('companies')
      .select('uuid, name, address')
      .eq('active', true)
      .order('name');

    if (error) {
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching companies:', error);
    return [];
  }
}