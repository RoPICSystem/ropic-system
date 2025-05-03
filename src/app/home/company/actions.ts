'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// Any additional server actions needed for the company page
export async function refreshCompanyData() {
  revalidatePath('/home/company')
  return { success: true }
}