'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Verify a user's email with the provided OTP code
 */
export async function verifyEmail(code: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.auth.verifyOtp({
      type: 'email',
      token_hash: code,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    return { 
      success: false, 
      error: error.message || 'An error occurred during verification' 
    }
  }
}

/**
 * Sign in user with email (passwordless)
 */
export async function signInWithEmail(email: string, redirectTo: string = '/auth/verify') {
  try {
    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_BASE_URL}${redirectTo}`,
      },
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to send verification email'
    }
  }
}

/**
 * Sign out the current user
 */
export async function signOut() {
  const supabase =  await createClient()
  
  await supabase.auth.signOut()
  redirect('/auth/signin')
}