'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function signin(formData: FormData):
  Promise<{ error?: string, success?: boolean }> {
  const supabase = await createClient()

  // Extract form data
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // Attempt to sign in
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    console.error('Sign-in error:', error)
    return { error: error.message }
  }

  // Revalidate cache to reflect the new authentication state
  revalidatePath('/', 'layout')

  // Redirect to dashboard or home page
  redirect('/home/dashboard')
  return { success: true }
}