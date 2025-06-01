'use client'

import { getUserCompanyDetails } from '@/utils/supabase/server/companies'
import { getUserFromCookies } from '@/utils/supabase/server/user'
import {
  ChevronRightIcon,
  UserIcon
} from '@heroicons/react/24/solid'
import {
  Button,
  DatePicker,
  Image,
  Input,
  Skeleton,
  Spinner
} from "@heroui/react"
import { getLocalTimeZone, parseDate, today } from '@internationalized/date'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// Import address utilities
import CardList from '@/components/card-list'
import LoadingAnimation from '@/components/loading-animation'
import { motionTransition, motionTransitionScale } from '@/utils/anim'
import { AnimatePresence, motion } from 'framer-motion'


export default function ProfilePage() {
  const router = useRouter()
  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" }
  const autoCompleteStyle = { classNames: inputStyle }

  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null);

  // Load user data on initial render
  useEffect(() => {
    async function fetchUserData() {
      try {
        setIsLoading(true)

        const userData = await getUserFromCookies();
        if (userData === null) {
          setError('User not found')
          return
        }

        const { data: companyData, error: companyError } = await getUserCompanyDetails(userData?.uuid)

        if (error) {
          setError(error)
          return
        }

        if (companyError) {
          setError(`${companyError}`)
          return
        } else {
          setUser({
            ...userData,
            company: companyData
          })
          setIsAdmin(userData?.is_admin)
        }

        if (!userData?.profile_image.error) {
          await setImagePreview(userData.profile_image_url)
        }
      } catch (err: any) {
        console.error('Error fetching user profile:', err)
        setError(err.message || 'An unexpected error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserData()
  }, [])

  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto max-w-5xl p-2">
        <div className="space-y-4 items-center w-full">
          <div className="space-y-4 w-full">

            <div className="flex flex-col w-full xl:text-left text-center">
              <h1 className="text-2xl font-bold">Profile</h1>
              {(isLoading) ? (
                <div className="text-default-500 flex xl:justify-start justify-center items-center">
                  <p className='my-auto mr-1'>Loading profile data</p>
                  <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
                </div>
              ) : (
                <p className="text-default-500">Listed below is your profile information.</p>
              )}
            </div>

            {/* Basic Information */}
            <CardList>
              <LoadingAnimation
                condition={isLoading}
                skeleton={
                  <div>
                    <Skeleton className="h-6 w-48 mx-auto rounded-xl mb-4" /> {/* Section Title */}
                    <div className="flex flex-col items-center justify-center pb-4">
                      <Skeleton className="flex rounded-full w-48 h-48 m-1" /> {/* Profile Image */}
                    </div>
                    <div className="space-y-4 mt-3">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <Skeleton className="h-14 rounded-xl" /> {/* First Name */}
                        <Skeleton className="h-14 rounded-xl" /> {/* Middle Name */}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <Skeleton className="h-14 rounded-xl" /> {/* Last Name */}
                        <Skeleton className="h-14 rounded-xl" /> {/* Suffix */}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <Skeleton className="h-14 rounded-xl" /> {/* Gender */}
                        <Skeleton className="h-14 rounded-xl" /> {/* Birthday */}
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        <Skeleton className="h-14 rounded-xl" /> {/* Phone Number */}
                      </div>
                    </div>
                  </div>
                }>
                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Basic Information</h2>
                  <div className="space-y-4">
                    <div className="relative w-full flex items-center justify-center pb-4">
                      {imagePreview ? (
                        <Image isBlurred src={imagePreview} radius='full' alt="Profile preview" className="w-48 h-48 object-cover bg-default-200" />
                      ) : (
                        <div className="w-full h-full bg-default-300/70 rounded-full flex items-center justify-center">
                          <UserIcon className="h-16 w-16 text-default-500" />
                        </div>
                      )}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input
                        label="First Name"
                        type="text"
                        classNames={inputStyle}
                        value={user?.name?.first_name || ''}
                        isReadOnly
                      />
                      <Input
                        label="Middle Name"
                        type="text"
                        classNames={inputStyle}
                        value={user?.name?.middle_name || ''}
                        isReadOnly
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input
                        label="Last Name"
                        type="text"
                        classNames={inputStyle}
                        value={user?.name?.last_name || ''}
                        isReadOnly
                      />
                      <Input
                        label="Suffix"
                        type="text"
                        classNames={inputStyle}
                        value={user?.name?.suffix || ''}
                        isReadOnly
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input
                        label="Gender"
                        type="text"
                        classNames={inputStyle}
                        value={(user?.gender || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        isReadOnly
                      />
                      <DatePicker
                        name="birthday"
                        label="Birthday"
                        value={user?.birthday ?
                          parseDate(new Date(user.birthday).toISOString().split('T')[0]) :
                          today(getLocalTimeZone()).subtract({ years: 18 })}
                        isReadOnly
                        classNames={{
                          base: "w-full",
                          ...inputStyle,
                          selectorButton: "w-12 h-10 mb-4 mr-[-0.4rem]",
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <Input
                        label="Phone Number"
                        type="text"
                        classNames={inputStyle}
                        value={user?.phone_number || ''}
                        startContent={
                          <div className="pointer-events-none flex items-center">
                            <span className="text-default-600 text-small">+63</span>
                          </div>
                        }
                        isReadOnly
                      />
                    </div>
                  </div>
                </div>
              </LoadingAnimation>
            </CardList>

            {/* Address Information */}
            <CardList>
              <LoadingAnimation
                condition={isLoading}
                skeleton={
                  <div>
                    <Skeleton className="h-6 w-48 rounded-xl m-1 mx-auto" /> {/* Section Title */}
                    <div className="space-y-4 mt-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <Skeleton className="h-14 rounded-xl" /> {/* Country */}
                        <Skeleton className="h-14 rounded-xl" /> {/* Region */}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <Skeleton className="h-14 rounded-xl" /> {/* Province */}
                        <Skeleton className="h-14 rounded-xl" /> {/* Municipality/City */}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <Skeleton className="h-14 rounded-xl" /> {/* Barangay */}
                        <Skeleton className="h-14 rounded-xl" /> {/* Street Address */}
                      </div>
                      <div className="flex sm:flex-row flex-col gap-4">
                        <Skeleton className="h-14 sm:w-[10rem] w-full rounded-xl" /> {/* Postal Code */}
                        <Skeleton className="h-14 w-full rounded-xl" /> {/* Full Address */}
                      </div>
                    </div>
                  </div>
                }>
                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Personal Address</h2>
                  <div className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input
                        label="Country"
                        type="text"
                        classNames={inputStyle}
                        value="PHILIPPINES"
                        isReadOnly
                      />
                      <Input
                        label="Region"
                        type="text"
                        classNames={inputStyle}
                        value={user?.address?.region?.desc || ''}
                        isReadOnly
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input
                        label="Province"
                        type="text"
                        classNames={inputStyle}
                        value={user?.address?.province?.desc || ''}
                        isReadOnly
                      />
                      <Input
                        label="Municipality/City"
                        type="text"
                        classNames={inputStyle}
                        value={user?.address?.municipality?.desc || ''}
                        isReadOnly
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input
                        label="Barangay"
                        type="text"
                        classNames={inputStyle}
                        value={user?.address?.barangay?.desc || ''}
                        isReadOnly
                      />
                      <Input
                        label="Street Address"
                        type="text"
                        classNames={inputStyle}
                        value={user?.address?.street || ''}
                        isReadOnly
                      />
                    </div>

                    <div className="flex sm:flex-row flex-col gap-4">
                      <Input
                        label="Postal Code"
                        type="text"
                        classNames={inputStyle}
                        className="md:w-[10rem]"
                        value={user?.address?.postalCode || ''}
                        isReadOnly
                      />
                      <Input
                        label="Full Address"
                        type="text"
                        classNames={inputStyle}
                        value={user?.address?.fullAddress || ''}
                        isReadOnly
                      />
                    </div>
                  </div>
                </div>
              </LoadingAnimation>
            </CardList>

            {/* Company Profile */}
            <CardList>
              <LoadingAnimation
                condition={isLoading}
                skeleton={
                  <div>
                    <Skeleton className="h-6 w-48 rounded-xl m-1 mx-auto" /> {/* Section Title */}
                    <Skeleton className="h-14 rounded-xl my-4" /> {/* Company Name */}
                  </div>
                }>
                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Company Profile</h2>
                  <div className="space-y-4">
                    <Input
                      label="Company Name"
                      type="text"
                      classNames={inputStyle}
                      value={user?.company?.name || ''}
                      isReadOnly
                    />
                  </div>
                </div>
              </LoadingAnimation>

              <div {...(!isAdmin ? { className: '!min-h-0 !p-0 !h-0  border-none' } : {})}>
                <AnimatePresence mode="popLayout">
                  {isAdmin && (
                    <motion.div
                      {...motionTransition}
                    >
                      <LoadingAnimation
                        condition={isLoading}
                        skeleton={
                          <div className="flex items-center justify-between py-1">
                            <Skeleton className="h-5 w-[60%] rounded-xl" /> {/* Change company information */}
                            <Skeleton className="h-10 w-10 rounded-xl" /> {/* Button */}
                          </div>
                        }>
                        <div className="flex items-center justify-between">
                          <span>Change company information</span>
                          <Button
                            variant="shadow"
                            color="primary"
                            onPress={() => router.push('/home/company/edit')}
                            className="my-1">
                            <ChevronRightIcon className="w-4 h-4" />
                          </Button>
                        </div>
                      </LoadingAnimation>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>


              <LoadingAnimation
                condition={isLoading}
                skeleton={
                  <div className="flex items-center justify-between py-1">
                    <Skeleton className="h-5 w-[60%] rounded-xl" /> {/* View more about your company */}
                    <Skeleton className="h-10 w-10 rounded-xl" /> {/* Button */}
                  </div>
                }>
                <div className="flex items-center justify-between">
                  <span>View more about your company</span>
                  <Button
                    variant="shadow"
                    color="primary"
                    onPress={() => router.push('/home/company')}
                    className="my-1">
                    <ChevronRightIcon className="w-4 h-4" />
                  </Button>
                </div>
              </LoadingAnimation>
            </CardList>

            {/* Account Information */}
            <CardList>
              <LoadingAnimation
                condition={isLoading}
                skeleton={
                  <div>
                    <Skeleton className="h-6 w-48 rounded-xl m-1 mx-auto" /> {/* Section Title */}
                    <Skeleton className="h-14 rounded-xl mt-4" /> {/* Email Field */}
                  </div>
                }>
                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Account Information</h2>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    label="Email"
                    autoComplete="email"
                    classNames={inputStyle}
                    value={user?.email || ''}
                    isReadOnly
                  />
                </div>
              </LoadingAnimation>
            </CardList>

            {/* Action Items */}
            <CardList>
              <LoadingAnimation
                condition={isLoading}
                className="w-full"
                skeleton={
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-[40%] rounded-xl" /> {/* Change password */}
                    <Skeleton className="h-10 w-10 rounded-xl" /> {/* Button */}
                  </div>
                }>
                <div className="flex items-center justify-between">
                  <span>Change profile information</span>
                  <Button
                    variant="shadow"
                    color="primary"
                    onPress={() => router.push('/home/profile/edit')}
                    className="my-1">
                    <ChevronRightIcon className="w-4 h-4" />
                  </Button>
                </div>
              </LoadingAnimation>

              {/* <LoadingAnimation
              condition={isLoading}
              className="w-full"
              skeleton={
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-[40%] rounded-xl" /> 
                  <Skeleton className="h-10 w-10 rounded-xl" /> 
                </div>
              }>
              <div className="flex items-center justify-between">
                <span>Change password</span>
                <Button
                  variant="shadow"
                  color="primary"
                  className="my-1">
                  <ChevronRightIcon className="w-4 h-4" />
                </Button>
              </div>
            </LoadingAnimation> */}
            </CardList>

          </div>
        </div>
      </div>
    </motion.div>
  )
}