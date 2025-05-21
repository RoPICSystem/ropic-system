'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getUserProfile } from '@/utils/supabase/server/user';

declare global {
  interface Window {
    userData?: any;
  }
}

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


  const { data, error: userError } = await getUserProfile();

  if (userError) {
    console.error("Error fetching user profile:", error);
    return { error: `${userError}`}
  }

  if (typeof window !== "undefined") {
    window.userData = data;
  };


  // Revalidate cache to reflect the new authentication state
  revalidatePath('/', 'layout')

  // Redirect to dashboard or home page
  redirect('/home/dashboard')
  return { success: true }
}