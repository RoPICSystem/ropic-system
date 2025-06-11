'use server'

import { createClient } from '@/utils/supabase/server'
import { getUserProfile, setUserInCookies } from '@/utils/supabase/server/user'
import { redirect } from 'next/navigation'

/**
 * Verify a user's email with the provided OTP code
 */
export async function verifyEmail(token_hash: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase.auth.verifyOtp({
      type: 'email',
      token_hash
    })

    if (error) {
      return { success: false, error: error.message }
    }

    const { data, error: userError } = await getUserProfile();

    if (userError) {
      console.error("Error fetching user profile:", error);
      return { error: `${userError}` }
    }

    // Add the userdata in cookies
    await setUserInCookies(data);

    console.log("Email verified successfully:", data);

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
export async function signInWithEmail(email: string, redirectTo: string = '/account/verify') {
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

    const { data, error: userError } = await getUserProfile();

    if (userError) {
      console.error("Error fetching user profile:", error);
      return { error: `${userError}` }
    }

    // Add the userdata in cookies
    await setUserInCookies(data);

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to send verification email'
    }
  }
}
