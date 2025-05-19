'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// Any additional server actions needed for the company page
export async function refreshCompanyData() {
  revalidatePath('/home/company')
  return { success: true }
}

// get company data based on uuid
export async function getCompanyData(uuid: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('uuid', uuid)
      .single()

    if (error) throw error

    return {
      success: true,
      data: data,
    }
  } catch (error: any) {
    console.error('Error fetching company data:', error)
    return {
      success: false,
      error: error.message || 'Failed to fetch company data',
    }
  }
}
