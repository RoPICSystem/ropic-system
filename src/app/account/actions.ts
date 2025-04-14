'use server'

import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function confirmEmail(formData: FormData) {
  const token = formData.get('token') as string
  const type = formData.get('type') as string
  
  if (!token) {
    return { error: 'Missing confirmation token' }
  }

  try {
    // For type=signup, use verifyOtp method
    if (type === 'signup') {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'signup',
      })
      
      if (error) throw error
    } 
    // For email change confirmation
    else if (type === 'email_change') {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'email_change',
      })
      
      if (error) throw error
    }
    
    // Redirect to success page
    redirect('/account/confirmed')
  } catch (error) {
    console.error('Error confirming email:', error)
    return { error: 'Failed to confirm email' }
  }
}