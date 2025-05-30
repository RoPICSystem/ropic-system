import { createBrowserClient } from '@supabase/ssr'
import { SupabaseClient } from '@supabase/supabase-js'

// Cache client instances
let cachedClient: ReturnType<typeof createBrowserClient> | null = null
let cachedAdminClient: ReturnType<typeof createBrowserClient> | null = null

export function createClient(): SupabaseClient<any, "public", any> {
  if (cachedClient) {
    // console.log('Using cached client')
    return cachedClient
  }
  
  // Create a new client only if needed
  cachedClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  
  return cachedClient
}

export function createAdminClient(): SupabaseClient<any, "public", any> {
  if (cachedAdminClient) {
    // console.log('Using cached admin client')
    return cachedAdminClient
  }
  
  // Create a new admin client only if needed
  cachedAdminClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    }
  })
  
  return cachedAdminClient
}