export default function VerificationRequestedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 text-center">
        <h1 className="text-3xl font-bold">Check your email</h1>
        <p className="mt-2">
          We've sent you a verification email. Please check your inbox and click the verification link to complete your registration.
        </p>
        <p className="mt-4 text-sm text-gray-500">
          If you don't see the email, check your spam folder or{" "}
          <a href="/account/login" className="text-blue-600 hover:underline">
            return to login
          </a>
        </p>
      </div>
    </div>
  )
}