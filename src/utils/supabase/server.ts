import { createServerClient } from '@supabase/ssr'
import { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Cache for server clients (keyed by cookie store hash)
const clientCache = new Map()
const adminClientCache = new Map()

export async function createClient(): Promise<SupabaseClient<any, "public", any>> {
  const cookieStore = await cookies()
  
  // Create a hash key based on the cookies to identify this user session
  const cookieString = JSON.stringify(cookieStore.getAll().map(c => `${c.name}=${c.value}`).sort())
  const cacheKey = btoa(cookieString)
  
  // Return cached client if it exists for this session
  if (clientCache.has(cacheKey)) {
    // console.log('Using cached client')
    return clientCache.get(cacheKey)
  }
  
  // Create a new client if needed
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
  
  // Cache the client for future use
  clientCache.set(cacheKey, client)
  
  return client
}

export async function createAdminClient(): Promise<SupabaseClient<any, "public", any>> {
  const cookieStore = await cookies()
  
  // Create a hash key based on the cookies to identify this user session
  const cookieString = JSON.stringify(cookieStore.getAll().map(c => `${c.name}=${c.value}`).sort())
  const cacheKey = btoa(cookieString)
  
  // Return cached admin client if it exists for this session
  if (adminClientCache.has(cacheKey)) {
    // console.log('Using cached admin client')
    return adminClientCache.get(cacheKey)
  }
  
  // Create a new admin client if needed
  const adminClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
  
  // Cache the admin client for future use
  adminClientCache.set(cacheKey, adminClient)
  
  return adminClient
}