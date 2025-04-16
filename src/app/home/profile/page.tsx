'use client'


import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getUserProfile } from '@/utils/supabase/server/user'
import {
  Card,
  CardHeader,
  CardBody,
  Form,
  Input,
  Autocomplete,
  AutocompleteItem,
  Button,
  Spinner,
  Image,
  Alert,
  DatePicker,
  Skeleton,
  CardFooter,
  Divider,
  Avatar,
  NumberInput
} from "@heroui/react"
import {
  EyeSlashIcon,
  ChevronRightIcon,
  EyeIcon,
  UserIcon,
} from '@heroicons/react/24/solid'
import { today, getLocalTimeZone, parseDate } from '@internationalized/date'

// Import address utilities
import {
  getRegions,
  getProvinces,
  getCityMunicipalities,
  getBarangays
} from '@/utils/supabase/server/address'
import CardList from '@/components/card-list'
import { AnimatePresence, motion } from 'framer-motion'
import { motionTransition } from '@/utils/anim'

// Types for address data
interface Region {
  regCode: string;
  regDesc: string;
}

interface Province {
  provCode: string;
  provDesc: string;
}

interface CityMunicipality {
  citymunCode: string;
  citymunDesc: string;
}

interface Barangay {
  brgyCode: string;
  brgyDesc: string;
}

export default function ProfilePage() {
  const router = useRouter()
  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" }
  const autoCompleteStyle = { classNames: inputStyle }

  const [userData, setUserData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  // Load user data on initial render
  useEffect(() => {
    async function fetchUserData() {
      try {
        setIsLoading(true)
        const { data, error } = await getUserProfile()

        if (error) {
          setError(error)
          return
        }

        setUserData(data)

        if (!data?.profile_image.error) {
          await setImagePreview(data.profile_image.data.url)
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

  // Show loading state
  if (isLoading && !userData) {
    return (
      <div className="container mx-auto max-w-4xl">
        <div className='space-y-4 '>
          {/* Basic Information Skeleton */}
          <CardList>
            <div>
              <Skeleton className="h-6 w-48 mx-auto rounded-lg mb-6" /> {/* Section Title */}
              <div className="flex flex-col items-center justify-center">
                <Skeleton className="flex rounded-full w-48 h-48 mb-8" /> {/* Profile Image */}
              </div>
              <div className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                </div>
                <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
              </div>
            </div>
          </CardList>

          {/* Address Information Skeleton */}
          < CardList>
            <div>
              <Skeleton className="h-6 w-48 mx-auto rounded-lg mb-6" /> {/* Section Title */}
              <div className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                </div>
                <div className="flex sm:flex-row flex-col gap-4">
                  <Skeleton className="h-12 w-full sm:w-[10rem] rounded-lg" /> {/* Postal Code */}
                  <Skeleton className="h-12 w-full rounded-lg" /> {/* Full Address */}
                </div>
              </div>
            </div>

          </CardList >
          {/* Company Information Skeleton */}
          < CardList >
            <div>
              <Skeleton className="h-6 w-48 mx-auto rounded-lg mb-6" /> {/* Section Title */}
              <Skeleton className="h-12 rounded-lg mb-4" /> {/* Company Name */}
              <div className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                  <Skeleton className="h-12 rounded-lg" /> {/* Form Field */}
                </div>
                <div className="flex sm:flex-row flex-col gap-4">
                  <Skeleton className="h-12 w-full sm:w-[10rem] rounded-lg" /> {/* Postal Code */}
                  <Skeleton className="h-12 w-full rounded-lg" /> {/* Full Address */}
                </div>
              </div>
            </div>
          </CardList >

          {/* Account Information Skeleton */}
          < CardList >
            <div>
              <Skeleton className="h-6 w-48 mx-auto rounded-lg mb-6" /> {/* Section Title */}
              <Skeleton className="h-12 rounded-lg" /> {/* Email Field */}
            </div>
          </CardList >
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl">
      <div className="space-y-4 items-center w-full">
        <div className="space-y-4 w-full">


          {/* Basic Information */}
          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4  w-full text-center">Basic Information</h2>
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
                    value={userData?.name?.first_name || ''}
                    isReadOnly
                  />
                  <Input
                    label="Middle Name"
                    type="text"
                    classNames={inputStyle}
                    value={userData?.name?.middle_name || ''}
                    isReadOnly
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Last Name"
                    type="text"
                    classNames={inputStyle}
                    value={userData?.name?.last_name || ''}
                    isReadOnly
                  />
                  <Input
                    label="Suffix"
                    type="text"
                    classNames={inputStyle}
                    value={userData?.name?.suffix || ''}
                    isReadOnly
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Gender"
                    type="text"
                    classNames={inputStyle}
                    value={userData?.name?.suffix || ''}
                    isReadOnly
                  />
                  <DatePicker
                    name="birthday"
                    label="Birthday"
                    value={userData?.birthday ?
                      parseDate(new Date(userData.birthday).toISOString().split('T')[0]) :
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
                    value={userData?.phone_number || ''}
                    isReadOnly
                  />
                </div>
              </div>
            </div>
          </CardList>

          {/* Address Information */}
          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4  w-full text-center">Personal Address</h2>
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
                    value={userData?.address?.region?.desc || ''}
                    isReadOnly
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Province"
                    type="text"
                    classNames={inputStyle}
                    value={userData?.address?.province?.desc || ''}
                    isReadOnly
                  />
                  <Input
                    label="Municipality/City"
                    type="text"
                    classNames={inputStyle}
                    value={userData?.address?.region?.desc || ''}
                    isReadOnly
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Barangay"
                    type="text"
                    classNames={inputStyle}
                    value={userData?.address?.barangay?.desc || ''}
                    isReadOnly
                  />
                  <Input
                    label="Street Address"
                    type="text"
                    classNames={inputStyle}
                    value={userData?.address?.streetAddress || ''}
                    isReadOnly
                  />
                </div>

                <div className="flex sm:flex-row flex-col gap-4">
                  <Input
                    label="Postal Code"
                    type="text"
                    classNames={inputStyle}
                    className="md:w-[10rem]"
                    value={userData?.address?.postalCode || ''}
                    isReadOnly
                  />
                  <Input
                    label="Full Address"
                    type="text"
                    classNames={inputStyle}
                    value={userData?.address?.fullAddress || ''}
                    isReadOnly
                  />
                </div>
              </div>
            </div>
          </CardList>

          {/* Company Profile */}
          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4  w-full text-center">Company Profile</h2>
              <div className="space-y-4">
                <Input
                  label="Company Name"
                  type="text"
                  classNames={inputStyle}
                  value={userData?.company?.name || ''}
                  isReadOnly
                />
                <div className="space-y-4 border-2 border-default-200 p-4 rounded-2xl">
                  <h2 className="text-lg font-semibold text-center">Company Address</h2>
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
                      value={userData?.company?.address?.region?.desc || ''}
                      isReadOnly
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input
                      label="Province"
                      type="text"
                      classNames={inputStyle}
                      value={userData?.company?.address?.province?.desc || ''}
                      isReadOnly
                    />
                    <Input
                      label="Municipality/City"
                      type="text"
                      classNames={inputStyle}
                      value={userData?.company?.address?.region?.desc || ''}
                      isReadOnly
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input
                      label="Barangay"
                      type="text"
                      classNames={inputStyle}
                      value={userData?.company?.address?.barangay?.desc || ''}
                      isReadOnly
                    />
                    <Input
                      label="Street Address"
                      type="text"
                      classNames={inputStyle}
                      value={userData?.company?.address?.streetAddress || ''}
                      isReadOnly
                    />
                  </div>

                  <div className="flex sm:flex-row flex-col gap-4">
                    <Input
                      label="Postal Code"
                      type="text"
                      classNames={inputStyle}
                      className="md:w-[10rem]"
                      value={userData?.company?.address?.postalCode || ''}
                      isReadOnly
                    />
                    <Input
                      label="Full Address"
                      type="text"
                      classNames={inputStyle}
                      value={userData?.company?.address?.fullAddress || ''}
                      isReadOnly
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardList>
          {/* Account Information */}
          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Account Information</h2>
              <Input
                id="email"
                name="email"
                type="email"
                label="Email"
                autoComplete="email"
                classNames={inputStyle}
                value={userData?.email || ''}
                isReadOnly

              />
            </div>
          </CardList>
          <CardList>
            <div className="flex items-center justify-between h-full w-full">
              <span>Change profile information</span>
              <Button
                variant="shadow"
                color="primary"
                onPress={() => router.push('/home/profile/edit')}
                className="my-1">
                <ChevronRightIcon className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between h-full w-full">
              <span>Change password</span>
              <Button
                variant="shadow"
                color="primary"
                className="my-1]">
                <ChevronRightIcon className="w-4 h-4" />
              </Button>
            </div>
          </CardList>

        </div>
      </div >
    </div >
  )
}