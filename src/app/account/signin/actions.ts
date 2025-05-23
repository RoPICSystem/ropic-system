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

  // wait fot the window to be defined
  if (typeof window !== "undefined") {
    window.userData = data;
  } else {
    return { error: "Window is not defined" }
  }

  // Add the userdata in cookies
  const { cookies } = await import('next/headers');
  const essentialUserData = {
    id: data?.id,
    email: data?.email,
    name: data?.full_name || data?.email
  };
  (await cookies()).set('userData', JSON.stringify(essentialUserData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  });

  console.log("User data:", data);

  // Revalidate cache to reflect the new authentication state
  revalidatePath('/', 'layout')

  // Redirect to dashboard or home page
  redirect('/home/dashboard')
  return { success: true }
}