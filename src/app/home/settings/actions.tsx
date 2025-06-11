"use server"

import { createClient } from '@/utils/supabase/server'

export type Settings = {
  fullScreen: boolean,
  defaultView: string,
  pageSize: number
}

export async function updateSettings(settings: Settings):
  Promise<{ error?: string, success?: boolean }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Update user metadata in auth
  const { error: authError } = await supabase.auth.updateUser({
    data: {
      ...user.user_metadata,
      settings
    }
  })

  if (authError) {
    return { error: authError.message }
  }

  try {
    const { error } = await supabase
      .from('profiles')
      .update({settings})
      .eq('uuid', user.id);

    if (error) {
      return { error: error.message};
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating settings:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
