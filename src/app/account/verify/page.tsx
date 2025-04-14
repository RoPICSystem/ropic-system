'use client';

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { verifyEmail } from './actions'
import { useTheme } from "next-themes";
import { hslToRgb } from '@/utils/colors';
import { AnimatePresence, motion } from 'framer-motion';

import {
  Card,
  Button,
  Image,
  CardBody,
  Progress
} from "@heroui/react";

export default function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>
}) {
  const token_hash = use(searchParams).token_hash;
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);
  const [verificationState, setVerificationState] = useState<{
    isVerifying: boolean;
    success: boolean;
    error: string | null;
  }>({
    isVerifying: true,
    success: false,
    error: null
  });
  const { theme } = useTheme();
  const [primaryValue, setPrimaryValue] = useState('');

  // Update theme colors
  const updateHeroUITheme = () => {
    setTimeout(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      const primaryHsl = rootStyle.getPropertyValue('--heroui-primary-400').trim().split(' ').map(val => {
        return parseFloat(val.replace('%', ''));
      });
      setPrimaryValue(`rgba(${hslToRgb(primaryHsl[0], primaryHsl[1], primaryHsl[2]).join(',')}, 1)`);
    }, 100);
  };

  useEffect(() => {
    updateHeroUITheme();
  }, [theme]);

  useEffect(() => {
    updateHeroUITheme();
  }, []);

  // Handle verification
  useEffect(() => {
    const verify = async () => {
      if (!token_hash) {
        setVerificationState({
          isVerifying: false,
          success: false,
          error: "Missing verification code"
        });
        return;
      }

      try {
        const result = await verifyEmail(token_hash);

        if (result.success) {
          setVerificationState({
            isVerifying: false,
            success: true,
            error: null
          });
        } else {
          setVerificationState({
            isVerifying: false,
            success: false,
            error: result.error || "Verification failed"
          });
        }
      } catch (error) {
        setVerificationState({
          isVerifying: false,
          success: false,
          error: "An unexpected error occurred"
        });
      }
    };

    verify();
  }, [token_hash]);

  // Handle countdown and redirect
  useEffect(() => {
    if (!verificationState.isVerifying && verificationState.success) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            router.replace('/home/dashboard');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [verificationState.isVerifying, verificationState.success, router]);

  return (
    <div className="h-full overflow-auto">
      <div className="w-auto h-full 2xl:absolute fixed inset-0 overflow-hidden top-0 z-2">
        <div className="absolute w-full max-w-[30rem] top-[calc(50%-20rem)] left-[calc(50%+5rem)] hidden xl:block select-none z-1">
          {/* Operator image */}
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
          {/* Header with logo */}
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

          {/* Main Card */}
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
                <h1 className="text-3xl font-bold text-center sm:pt-0 pt-2">
                  {verificationState.isVerifying
                    ? "Verifying Email"
                    : verificationState.success
                      ? "Email Verified!"
                      : "Verification Failed"}
                </h1>
                <p className="text-sm text-center text-foreground/80">
                  {verificationState.isVerifying
                    ? "Please wait while we verify your email address..."
                    : verificationState.success
                      ? `Redirecting you to the homepage in ${countdown} seconds`
                      : "We encountered an issue while verifying your email."}
                </p>
              </div>
              <Card
                className="border-none bg-background/60 dark:bg-default-50/80 w-full">
                <CardBody className="p-8 flex flex-col items-center justify-center gap-6">
                  <AnimatePresence>
                    {verificationState.isVerifying ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="w-full flex flex-col items-center gap-4"
                      >
                        <Progress
                          size="lg"
                          isIndeterminate
                          aria-label="Loading..."
                          className="max-w-md"
                        />
                        <p className="text-center text-default-500">Verifying your email address...</p>
                      </motion.div>
                    ) : verificationState.success ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full flex flex-col items-center gap-4"
                      >
                        <div className="w-24 h-24 bg-success-100 rounded-full flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-success-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <p className="text-success-500 font-medium text-lg">Your email has been successfully verified!</p>
                        <div className="w-full max-w-md mt-4">
                          <Progress
                            value={(5 - countdown) * 20}
                            aria-label="Redirect countdown"
                            className="w-full"
                            color="success"
                          />
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full flex flex-col items-center gap-4"
                      >
                        <div className="w-24 h-24 bg-danger-100 rounded-full flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-danger-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <p className="text-danger-500 font-medium text-lg">Verification Failed</p>
                        <p className="text-center text-default-600">{verificationState.error || "An error occurred during verification"}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Action button */}
                  <Button
                    color={verificationState.success ? "success" : "primary"}
                    variant="shadow"
                    className="mt-4 w-full max-w-xs"
                    onPress={() => router.push(verificationState.success ? '/home' : '/account/login')}
                  >
                    {verificationState.success ? `Go to Homepage (${countdown}s)` : "Return to Log-In"}
                  </Button>
                </CardBody>
              </Card>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}