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

  // Get the current path
  const path = request.nextUrl.pathname

  // Check user authentication status
  const { data: { user } } = await supabase.auth.getUser()
  const isAuthenticated = !!user

  // Define path checks
  const isAccountPath = path.startsWith('/account')
  const isHomePath = path.startsWith('/home')
  const isRootPath = path === '/'

  // 1. Handle root path '/'
  if (isRootPath) {
    if (isAuthenticated) {
      // If logged in, redirect from / to /home
      return NextResponse.redirect(new URL('/home', request.url))
    } else {
      // If not logged in, redirect from / to /account
      return NextResponse.redirect(new URL('/account', request.url))
    }
  }

  // 2. Handle /account paths
  if (isAccountPath && isAuthenticated) {
    // If logged in, redirect away from /account/* to /home
    return NextResponse.redirect(new URL('/home', request.url))
  }

  // 3. Handle /home paths
  if (isHomePath && !isAuthenticated) {
    // If not logged in, redirect away from /home/* to /account
    return NextResponse.redirect(new URL('/account', request.url))
  }

  // If no redirection rules matched, proceed with the request
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
