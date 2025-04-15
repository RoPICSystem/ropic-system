'use client'

import { useEffect, useState, useRef } from 'react'
import { verifyOtp } from './actions'
import { useSearchParams, useRouter } from 'next/navigation'
import { hslToRgb } from '@/utils/colors';
import { useTheme } from "next-themes";
import { Alert, Button, Link, InputOtp, Form, Card, CardBody, Image } from "@heroui/react"
import { AnimatePresence, motion } from 'framer-motion';

export default function VerificationRequestedPage() {
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const searchParams = useSearchParams()
  const [primaryValue, setPrimaryValue] = useState('')
  const router = useRouter()
  const email = searchParams.get('email') || ''
  const { theme } = useTheme()

  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" }

  // Redirect if no email was provided
  useEffect(() => {
    if (!email) {
      router.replace('/account/signin')
    }
  }, [email, router])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const token = formData.get("token") as string

    if (!token || token.length !== 6) {
      setError('Please enter all 6 digits of the verification code')
      setIsSubmitting(false)
      return
    }

    formData.append('email', email)

    try {
      const result = await verifyOtp(formData)

      if (result?.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        // The server action will handle redirect on success
      }
    } catch (error) {
      setError('Verification failed. Please try again.')
    }

    setIsSubmitting(false)
  }


  const updateHeroUITheme = () => {
    setTimeout(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      const primaryHsl = rootStyle.getPropertyValue('--heroui-primary-400').trim().split(' ').map(val => {
        return parseFloat(val.replace('%', ''));
      });
      setPrimaryValue(`rgba(${hslToRgb(primaryHsl[0], primaryHsl[1], primaryHsl[2]).join(',')}, 1)`);

      console.log('Primary HSL:', primaryHsl);
    }, 100);
  };

  useEffect(() => {
    updateHeroUITheme();
  }, [theme])

  useEffect(() => {
    updateHeroUITheme();
  }, []);


  return (
    <div className="h-full overflow-auto">
      <div className="w-auto h-full 2xl:absolute fixed inset-0 overflow-hidden top-0 z-2">
        <div className="absolute w-full max-w-[30rem] top-[calc(50%-20rem)] left-[calc(50%+5rem)] hidden xl:block select-none z-1">
          {/* Ground element - positioned at bottom */}
          <Image
            src={theme === 'dark' ? "/operator-boy.png" : "/operator-girl.png"}
            alt="Operator"
            className="w-auto h-full object-cover relative bottom-12"
            style={{ objectPosition: 'top', minHeight: '40rem' }}
          />
        </div>
        <div
          className="absolute 2xl:bottom-0 2xl:h-[15rem] left-0 w-full sm:bottom-0 sm:h-[calc(max(100vh-50vh-12rem,18rem))]"
          style={{
            backgroundColor: primaryValue
          }}
        />
      </div>

      <div className="w-full z-3 xl:pr-[25rem] sm:pb-12 pt-4 sm:min-h-[55rem] h-full flex flex-col justify-center">
        <div className="flex flex-col items-center justify-between relative">
          {/* Left side - Login form */}
          <div className="max-w-[200rem] flex sm:flex-col flex-row space-x-4 items-center justify-center sm:mb-[-6rem] mb-4">
            <Image src="/logo.png" alt="Logo" className="sm:h-48 h-20" />
            <div className="grid grid-cols-1 select-none sm:hidden">
              <span className="sm:text-4xl text-2xl text-center font-semibold font-serif">
                REORDER POINT
              </span>
              <span className="sm:text-sm text-[0.6rem] text-center tracking-widest">
                INVENTORY MANAGEMENT SYSTEM
              </span>
            </div>
          </div>
          <Card
            isBlurred
            className="dark:bg-primary-100/70 h-full sm:w-[30rem] w-full sm:rounded-2xl rounded-none">
            <div className="pt-[5.5rem] border-b-2 border-default-400 pb-6 select-none hidden sm:block">
              <div className="grid grid-cols-1">
                <span className="text-4xl text-center font-semibold font-serif">
                  REORDER POINT
                </span>
                <span className="text-sm text-center tracking-widest">
                  INVENTORY MANAGEMENT SYSTEM
                </span>
              </div>
            </div>
            <div className="w-full space-y-8 sm:p-6 p-4">
              <div className='space-y-1'>
                <h1 className="text-3xl font-bold text-center sm:pt-0 pt-2">Verify Your Account</h1>
                <div className="text-sm text-center text-foreground/80 sm:pb-6 pb-4">
                  {email && (
                    <div className="text-center">
                      <p className="mt-2">
                        We've sent a verification email to:<br /><strong>{email}</strong>
                      </p>
                    </div>
                  )}
                </div>
                <Card
                  className="border-none bg-background/60 dark:bg-default-50/80 w-full">
                  <CardBody className="p-0">
                    <Form onSubmit={handleSubmit} className="space-y-6 w-full">
                      <div className='w-full sm:pt-6 pt-4 text-center'>
                        <h2 className="text-xl font-semibold">Enter verification code</h2>
                        <span className="text-sm text-foreground/80">
                          Enter the 6-digit code sent to your email address
                        </span>
                      </div>

                      <input type="hidden" name="email" value={email} />

                      <div className="flex justify-center w-full">
                        <InputOtp
                          isRequired
                          classNames={{
                            segment: inputStyle.inputWrapper,
                            segmentWrapper: "gap-x-2",
                          }}
                          aria-label="Verification code"
                          length={6}
                          name="token"
                          id="token"
                          placeholder="Enter verification code"
                          className="mx-auto"
                          isDisabled={isSubmitting || success}
                          size="lg"
                        />
                      </div>

                      <div className="flex flex-col space-y-4 w-full border-t-2 border-default-200 sm:p-6 p-4">
                        <AnimatePresence>
                          {error && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)", height: 0 }}
                              animate={{ opacity: 1, scale: 1, filter: "blur(0px)", height: "auto" }}
                              exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)", height: 0 }}
                              transition={{
                                duration: 0.3,
                                type: "spring",
                                stiffness: 300,
                                damping: 20,
                              }}
                              className='w-full'
                            >
                              <Alert
                                color='danger'
                                variant='solid'
                                title="Verification Error"
                                description={error} />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <AnimatePresence>
                          {success && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)", height: 0 }}
                              animate={{ opacity: 1, scale: 1, filter: "blur(0px)", height: "auto" }}
                              exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)", height: 0 }}
                              transition={{
                                duration: 0.3,
                                type: "spring",
                                stiffness: 300,
                                damping: 20,
                              }}
                              className='w-full'
                            >
                              <Alert
                                color='success'
                                variant='solid'
                                title="Verification Success"
                                description="Your email has been verified successfully!" />
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <Button
                          type="submit"
                          color="primary"
                          className="w-full"
                          disabled={isSubmitting || success}
                          isLoading={isSubmitting}
                        >
                          {isSubmitting ? 'Verifying...' : 'Verify Email'}
                        </Button>
                        <p className="sm:mt-6 mt-4 text-sm text-foreground/80 text-center">
                          If you don't see the email, check your spam folder or{" "}
                          <Link href="/account/signin" color="primary" className="text-sm font-semibold">
                            return to sign-in
                          </Link>
                        </p>
                      </div>
                    </Form>
                  </CardBody>
                </Card>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </div>
  )
}