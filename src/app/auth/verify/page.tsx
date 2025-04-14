import { redirect } from 'next/navigation'
import { verifyEmail } from './actions'

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: { code?: string }
}) {
  const code = searchParams.code

  if (!code) {
    return (
      <div className="error-container">
        <h1>Verification Error</h1>
        <p>Missing verification code</p>
        <a href="/auth/signin">Return to sign in</a>
      </div>
    )
  }

  const { success, error } = await verifyEmail(code)

  if (!success) {
    return (
      <div className="error-container">
        <h1>Verification Failed</h1>
        <p>{error || 'An error occurred during verification'}</p>
        <a href="/auth/signin">Return to sign in</a>
      </div>
    )
  }

  // If verification successful, redirect to home page
  return redirect('/')
}