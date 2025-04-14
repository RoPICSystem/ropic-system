import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // refreshing the auth token
  await supabase.auth.getUser()

  return supabaseResponse
}


export async function middleware(request: NextRequest) {
  // Create a response and supabase client
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Get the current path
  const path = request.nextUrl.pathname
  
  // Define public and protected paths
  const isPublicPath = ['/account'].includes(path)
  const isProtectedPath = path.startsWith('/home') || 
                          path === '/'
  
  // Check user authentication status
  const { data: { user } } = await supabase.auth.getUser()
  const isAuthenticated = !!user

  console.log('User authentication status:', isAuthenticated)

  // Redirect logic
  if (isAuthenticated && isPublicPath) {
    // Authenticated users trying to access public pages get redirected to home
    return NextResponse.redirect(new URL('/home', request.url))
  }

  if (!isAuthenticated && isProtectedPath) {
    // Unauthenticated users trying to access protected pages get redirected to account
    return NextResponse.redirect(new URL('/account', request.url))
  }

  // Update the session
  return supabaseResponse
}

// Configure which routes this middleware applies to
export const config = {
  matcher: [
    '/',
    '/home',
    '/home/:path*',
    '/account/:path*',
    '/account'
  ]
}
