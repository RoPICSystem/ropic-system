'use client';

import { hslToRgb } from '@/utils/colors';
import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from "next-themes";
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signin } from './actions';

import { motionTransition } from '@/utils/anim';
import {
  EyeIcon,
  EyeSlashIcon,
  XMarkIcon
} from '@heroicons/react/24/solid';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Checkbox,
  Form,
  Image,
  Input,
  Link
} from "@heroui/react";


export default function SigninPage() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [primaryValue, setPrimaryValue] = useState('')
  const { theme } = useTheme()
  const router = useRouter();

  const [isVisiblePassword, setIsVisiblePassword] = useState(false);
  const toggleVisibilityPassword = () => setIsVisiblePassword(!isVisiblePassword);

  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" }


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
  }, [theme])

  useEffect(() => {
    updateHeroUITheme();
  }, []);


  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)


    const formData = new FormData(event.currentTarget)
    const { error, success } = await signin(formData)
    if (error) {
      setError(error)
    }
    setIsLoading(false)
  }


  return (
    <div className="h-full overflow-auto">
      <div className="w-auto h-full 2xl:absolute fixed inset-0 overflow-hidden min-h-[55rem] top-0 z-2">
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
          {/* Left side - Sign-in form */}
          <div className="max-w-[200rem] flex sm:flex-col flex-row space-x-4 items-center justify-center sm:mb-[-6rem] mb-4">
            <Image src="/logo.png" alt="Logo" className="sm:h-48 h-20" />
            <div className="grid grid-cols-1 select-none sm:hidden">
              <span className="sm:text-4xl text-2xl text-center font-semibold font-serif">
                REORDER POINT
              </span>
              <span className="sm:text-sm text-[0.6rem] text-center tracking-widest">
                INVENTORY CONTROL MANAGEMENT SYSTEM
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
                  INVENTORY CONTROL MANAGEMENT SYSTEM
                </span>
              </div>
            </div>
            <div className="w-full space-y-8 sm:p-6 p-4">
              <div className='space-y-1'>
                <h1 className="text-3xl font-bold text-center sm:pt-0 pt-2">Sign-in</h1>
                <p className="text-sm text-center text-foreground/80">Welcome back! Please enter your details.</p>
              </div>
              <Card
                className="border-none bg-background/60 dark:bg-default-50/80 w-full">
                <CardBody className="p-0">
                  <div>
                    <Form className="sm:space-y-4 space-y-2"
                      onSubmit={handleSubmit}>
                      <div className="space-y-4 w-full sm:px-6 px-4 sm:pt-6 pt-4">
                        <div>
                          <Input
                            classNames={inputStyle}
                            id="email"
                            name="email"
                            label="Email"
                            type="email"
                            autoComplete="email"
                            isDisabled={isLoading}
                            isRequired
                          />
                        </div>

                        <div>
                          <Input
                            classNames={inputStyle}
                            id="password"
                            name="password"
                            endContent={
                              <Button
                                aria-label="toggle password visibility"
                                className="focus:outline-none my-[-0.25rem] mr-[-0.4rem]"
                                type="button"
                                variant='light'
                                radius='full'
                                isIconOnly
                                onPress={toggleVisibilityPassword}
                              >
                                {isVisiblePassword ? (
                                  <EyeIcon className="h-5 w-5 text-default-500" />
                                ) : (
                                  <EyeSlashIcon className="h-5 w-5 text-default-500" />
                                )}
                              </Button>
                            }
                            type={isVisiblePassword ? "text" : "password"}
                            label="Password"
                            autoComplete="new-password"
                            isDisabled={isLoading}
                            isRequired
                            minLength={8}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between w-full sm:px-6 px-4">
                        {/* <div className="flex items-center">
                          <Checkbox
                            defaultSelected
                            id="remember-me"
                            isDisabled={isLoading}
                            name="remember-me">
                            Remember me
                          </Checkbox>
                        </div> */}
                        <div className="text-sm">
                          <Link
                            isDisabled={isLoading}
                            href="/account/forgot-password">
                            Forgot your password?
                          </Link>
                        </div>
                      </div>

                      <div className="flex flex-col space-y-4 w-full border-t-2 border-default-200 sm:p-6 p-4">
                        <AnimatePresence>
                          {error && !isLoading && (
                            <motion.div
                              {...motionTransition}
                              className='w-full'
                            >
                              <Alert
                                color='danger'
                                variant='solid'
                                endContent={
                                  <Button
                                    variant='shadow'
                                    color='danger'
                                    isIconOnly
                                    onPress={() => { setError(null) }}>
                                      <XMarkIcon className="h-5 w-5 text-danger-50" />
                                  </Button>
                                }
                                title={`Error Logging In`}
                                description={error} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <Button
                          type="submit"
                          variant="shadow"
                          color="primary"
                          className="w-full"
                          isLoading={isLoading}
                          onPress={(event) => { setError(null) }}
                        >
                          Sign in
                        </Button>
                        <Button
                          as={Link}
                          href="/account/register"
                          type="submit"
                          variant="shadow"
                          color="default"
                          isDisabled={isLoading}
                          className="w-full"
                        >
                          Register Account
                        </Button>
                      </div>
                    </Form>
                  </div>
                </CardBody>
              </Card>
            </div>
          </Card>
        </div>

      </div>
    </div>
  )
}