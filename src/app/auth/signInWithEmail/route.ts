import { NextRequest, NextResponse } from 'next/server'
import { signInWithEmail } from '../../account/verify/actions'

export async function GET(request: NextRequest) {
  // Get the email from the URL query parameters
  const searchParams = request.nextUrl.searchParams
  const email = searchParams.get('email')
  const redirectTo = searchParams.get('redirectTo') || '/account/verify'

  if (!email) {
    return NextResponse.json(
      { error: 'Email parameter is required' },
      { status: 400 }
    )
  }

  // Call the existing signInWithEmail function
  const result = await signInWithEmail(email, redirectTo)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    )
  }

  // Return success response
  return NextResponse.json(
    { 
      message: 'Verification email sent. Please check your inbox.',
      success: true 
    },
    { status: 200 }
  )
}