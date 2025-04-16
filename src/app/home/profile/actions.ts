'use server'

import { createClient } from '@/utils/supabase/server'


export async function changePassword(formData: FormData) {
  const supabase = await createClient()

  try {
    const currentPassword = formData.get('currentPassword') as string
    const newPassword = formData.get('newPassword') as string
    const confirmPassword = formData.get('confirmPassword') as string

    // // Validate password inputs
    // if (!currentPassword) return { error: 'Current password is required' }
    // if (!newPassword) return { error: 'New password is required' }
    // if (newPassword.length < 8) return { error: 'Password must be at least 8 characters long' }
    // if (!/\d/.test(newPassword)) return { error: 'Password must include at least one number' }
    // if (!/[A-Z]/.test(newPassword)) return { error: 'Password must include at least one uppercase letter' }
    // if (!/[a-z]/.test(newPassword)) return { error: 'Password must include at least one lowercase letter' }
    // if (!/[@$!%*?&]/.test(newPassword)) return { error: 'Password must include at least one special character (@$!%*?&)' }
    // if (newPassword !== confirmPassword) return { error: 'Passwords do not match' }

    // Get current session and user
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'No active session found' }

    // Update the password
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (error) {
      console.error('Error changing password:', error)
      return { error: error.message }
    }

    return { success: true, error: null }
  } catch (error: any) {
    console.error('Unexpected error during password change:', error)
    return { error: error.message || 'An unexpected error occurred' }
  }
}