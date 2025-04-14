'use server'

import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function verifyOtp(formData: FormData) {
  const email = formData.get('email') as string
  const token = formData.get('token') as string
  
  if (!email || !token) {
    return {
      error: 'Email and verification code are required'
    }
  }

  const supabase = await createClient( )

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error) {
    return {
      error: error.message
    }
  }

  // Redirect to dashboard or homepage after successful verification
  redirect('/')
}