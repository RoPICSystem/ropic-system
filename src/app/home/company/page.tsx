'use client'

import CardList from '@/components/card-list'
import LoadingAnimation from '@/components/loading-animation'
import { motionTransition, motionTransitionScale } from '@/utils/anim'
import { getUserCompanyDetails } from '@/utils/supabase/server/companies'
import { getUserFromCookies, getUserProfile } from '@/utils/supabase/server/user'
import {
  BuildingOfficeIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/solid'
import {
  Button,
  Card,
  CardBody,
  Image,
  Input,
  Skeleton,
  Spinner,
  Textarea
} from "@heroui/react"
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function CompanyPage() {
  const router = useRouter()
  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" }

  const [companyData, setCompanyData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null);

  // Load company data on initial render
  useEffect(() => {
    const fetchCompanyData = async () => {
      try {
        setIsLoading(true)

        const userData = await getUserFromCookies();
        if (userData === null) {
          setUser(null);
          setError('User not found')
          return
        }
        else
          setUser(userData);

        const { data: companyData, error: companyError } = await getUserCompanyDetails(userData?.uuid)

        if (error) {
          setError(`${error}`)
          return
        }
        if (companyError) {
          setError(`${companyError}`)
          return
        }

        setCompanyData(companyData)

        if (companyData?.logo_url && !companyData?.logo_url.error) {
          setImagePreview(companyData.logo_url)
        }
      } catch (err: any) {
        console.error('Error fetching company profile:', err)
        setError(err.message || 'An unexpected error occurred')
      } finally {
        setIsLoading(false)
      }
    };

    fetchCompanyData();
  }, [])

  return (
    <motion.div {...motionTransitionScale}>
      <div className="container mx-auto max-w-5xl p-2">
        <div className="space-y-4 items-center w-full">
          <div className="space-y-4 w-full">
            <div className="flex justify-between items-center">
              <div className="flex flex-col w-full xl:text-left text-center">
                <h1 className="text-2xl font-bold">Company Profile</h1>
                {isLoading ? (
                  <div className="text-default-500 flex xl:justify-start justify-center items-center">
                    <p className='my-auto mr-1'>Loading company data</p>
                    <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
                  </div>
                ) : (
                  <p className="text-default-500">Listed below is your company information.</p>
                )}
              </div>
            </div>

            {/* Basic Company Information */}
            <CardList>
              <LoadingAnimation
                condition={isLoading}
                skeleton={
                  <div>
                    <Skeleton className="h-6 w-48 mx-auto rounded-xl mb-4" /> {/* Section Title */}
                    <div className="flex flex-col items-center justify-center pb-4">
                      <Skeleton className="flex rounded-xl w-48 h-48 m-1" /> {/* Company Logo */}
                    </div>
                    <div className="space-y-4 mt-3">
                      <Skeleton className="h-14 rounded-xl" /> {/* Company Name */}
                      <Skeleton className="h-14 rounded-xl" /> {/* Company Description */}
                    </div>
                  </div>
                }>
                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Basic Information</h2>
                  <div className="space-y-4">
                    <div className="relative w-full flex items-center justify-center pb-4">
                      {imagePreview ? (
                        <Image
                          isBlurred
                          src={imagePreview}
                          alt="Company logo"
                          className="w-48 h-48 object-cover bg-default-200"
                        />
                      ) : (
                        <div className="w-48 h-48 bg-default-300/70 rounded-xl flex items-center justify-center">
                          <BuildingOfficeIcon className="h-16 w-16 text-default-500" />
                        </div>
                      )}
                    </div>

                    <Input
                      label="Company Name"
                      type="text"
                      classNames={inputStyle}
                      value={companyData?.name || ''}
                      isReadOnly
                    />

                    <Input
                      label="Company Description"
                      type="text"
                      classNames={inputStyle}
                      value={companyData?.description || ''}
                      isReadOnly
                    />
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
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Company Address</h2>
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
                        value={companyData?.address?.region?.desc || ''}
                        isReadOnly
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input
                        label="Province"
                        type="text"
                        classNames={inputStyle}
                        value={companyData?.address?.province?.desc || ''}
                        isReadOnly
                      />
                      <Input
                        label="Municipality/City"
                        type="text"
                        classNames={inputStyle}
                        value={companyData?.address?.municipality?.desc || ''}
                        isReadOnly
                      />
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <Input
                        label="Barangay"
                        type="text"
                        classNames={inputStyle}
                        value={companyData?.address?.barangay?.desc || ''}
                        isReadOnly
                      />
                      <Input
                        label="Street Address"
                        type="text"
                        classNames={inputStyle}
                        value={companyData?.address?.street || ''}
                        isReadOnly
                      />
                    </div>

                    <div className="flex sm:flex-row flex-col gap-4">
                      <Input
                        label="Postal Code"
                        type="text"
                        classNames={inputStyle}
                        className="md:w-[10rem]"
                        value={companyData?.address?.postalCode || ''}
                        isReadOnly
                      />
                      <Input
                        label="Full Address"
                        type="text"
                        classNames={inputStyle}
                        value={companyData?.address?.fullAddress || ''}
                        isReadOnly
                      />
                    </div>
                  </div>
                </div>
              </LoadingAnimation>
            </CardList>

            {/* Actions */}

            <AnimatePresence>
              {user?.is_admin && (
                <motion.div
                  {...motionTransition}>
                  <CardList>
                    <LoadingAnimation
                      condition={isLoading}
                      className="w-full"
                      skeleton={
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-5 w-[60%] rounded-xl" /> {/* Edit company information */}
                          <Skeleton className="h-10 w-10 rounded-xl" /> {/* Button */}
                        </div>
                      }>
                      <div className="flex items-center justify-between h-full w-full">
                        <span>Edit company information</span>
                        <Button
                          variant="shadow"
                          color="primary"
                          onPress={() => router.push('/home/company/edit')}
                          className="my-1">
                          <ChevronRightIcon className="w-4 h-4" />
                        </Button>
                      </div>
                    </LoadingAnimation>
                  </CardList>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>
      </div>
    </motion.div>
  )
}