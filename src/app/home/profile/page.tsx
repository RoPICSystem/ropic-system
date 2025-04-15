'use client'


import { useEffect, useState, useRef } from 'react'
import { updateProfile } from './actions'
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
  const [userData, setUserData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [originalUserData, setOriginalUserData] = useState<any>(null)

  // Address form state
  const [regions, setRegions] = useState<Region[]>([])
  const [provinces, setProvinces] = useState<Province[]>([])
  const [cityMunicipalities, setCityMunicipalities] = useState<CityMunicipality[]>([])
  const [barangays, setBarangays] = useState<Barangay[]>([])

  // Company address state
  const [companyProvinces, setCompanyProvinces] = useState<Province[]>([])
  const [companyCityMunicipalities, setCompanyCityMunicipalities] = useState<CityMunicipality[]>([])
  const [companyBarangays, setCompanyBarangays] = useState<Barangay[]>([])

  // Selected values state
  const [selectedRegion, setSelectedRegion] = useState<string>('')
  const [selectedProvince, setSelectedProvince] = useState<string>('')
  const [selectedCityMunicipality, setSelectedCityMunicipality] = useState<string>('')
  const [selectedBarangay, setSelectedBarangay] = useState<string>('')
  const [inputStreetAddress, setInputStreetAddress] = useState<string>('')
  const [inputPostalCode, setInputPostalCode] = useState<number | undefined>()
  const [fullAddress, setFullAddress] = useState<string>('')

  // Company address form state
  const [selectedCompanyRegion, setSelectedCompanyRegion] = useState<string>('')
  const [selectedCompanyProvince, setSelectedCompanyProvince] = useState<string>('')
  const [selectedCompanyCityMunicipality, setSelectedCompanyCityMunicipality] = useState<string>('')
  const [selectedCompanyBarangay, setSelectedCompanyBarangay] = useState<string>('')
  const [inputCompanyStreetAddress, setInputCompanyStreetAddress] = useState<string>('')
  const [inputCompanyPostalCode, setInputCompanyPostalCode] = useState<number | undefined>()
  const [fullCompanyAddress, setFullCompanyAddress] = useState<string>('')

  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" }
  const autoCompleteStyle = { classNames: inputStyle }

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
        setOriginalUserData(JSON.parse(JSON.stringify(data))) // Create a deep copy for reset

        if (!data?.profile_image.error) {
          await setImagePreview(data.profile_image.data.url)
        }
      } catch (err) {
        console.error('Error fetching user profile:', err)
        setError('Failed to load profile data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserData()
  }, [])

  // Fetch regions on component mount
  useEffect(() => {
    async function fetchRegions() {
      const regionsData = await getRegions()
      setRegions(regionsData)
    }
    fetchRegions()
  }, [])

  const compare = (a: any, b: any) => {
    return `${a}` === `${b}`
  }

  // Set form values when userData is loaded
  useEffect(() => {
    if (userData) {
      // Set region code for address and load provinces
      if (userData.address?.region?.code && regions.length) {
        const region = regions.find(r => compare(r.regCode, userData.address.region.code))
        if (region) {
          setSelectedRegion(region.regCode)
        }
      }

      // Set region code for company address
      if (userData.company_address?.region?.code && regions.length) {
        const region = regions.find(r => compare(r.regCode, userData.company_address.region.code))
        if (region) {
          setSelectedCompanyRegion(region.regCode)
        }
      }

      // Set street address and postal code
      setInputStreetAddress(userData.address?.streetAddress || '')
      setInputPostalCode(userData.address?.postalCode ? Number(userData.address.postalCode) : undefined)

      setInputCompanyStreetAddress(userData.company_address?.streetAddress || '')
      setInputCompanyPostalCode(userData.company_address?.postalCode ? Number(userData.company_address.postalCode) : undefined)

      // Set full addresses
      setFullAddress(userData.full_address || '')
      setFullCompanyAddress(userData.full_company_address || '')
    }
  }, [userData])

  // Fetch provinces when region changes
  useEffect(() => {
    async function fetchProvinces() {
      if (selectedRegion) {
        const provincesData = await getProvinces(selectedRegion)
        setProvinces(provincesData)

        // If userData has province code, set it
        if (userData?.address?.province?.code) {
          const province = provincesData.find(p => compare(p.provCode, userData.address.province.code))
          if (province) {
            setSelectedProvince(province.provCode)
          }
        } else {
          setSelectedProvince('')
          setCityMunicipalities([])
          setBarangays([])
        }
      }
    }
    fetchProvinces()
  }, [selectedRegion, userData])

  // Fetch cities/municipalities when province changes
  useEffect(() => {
    async function fetchCityMunicipalities() {
      if (selectedProvince) {
        const cityMunData = await getCityMunicipalities(selectedProvince)
        setCityMunicipalities(cityMunData)

        // If userData has municipality code, set it
        if (userData?.address?.municipality?.code) {
          const cityMun = cityMunData.find(c => compare(c.citymunCode, userData.address.municipality.code))
          if (cityMun) {
            setSelectedCityMunicipality(cityMun.citymunCode)
          }
        } else {
          setSelectedCityMunicipality('')
          setBarangays([])
        }
      }
    }
    fetchCityMunicipalities()
  }, [selectedProvince, userData])

  // Fetch barangays when city/municipality changes
  useEffect(() => {
    async function fetchBarangays() {
      if (selectedCityMunicipality) {
        const barangaysData = await getBarangays(selectedCityMunicipality)
        setBarangays(barangaysData)

        // If userData has barangay code, set it
        if (userData?.address?.barangay?.code) {
          const barangay = barangaysData.find(b => compare(b.brgyCode, userData.address.barangay.code))
          if (barangay) {
            setSelectedBarangay(barangay.brgyCode)
          }
        } else {
          setSelectedBarangay('')
        }
      }
    }
    fetchBarangays()
  }, [selectedCityMunicipality, userData])

  // Company address fetch effects
  useEffect(() => {
    async function fetchCompanyProvinces() {
      if (selectedCompanyRegion) {
        const provincesData = await getProvinces(selectedCompanyRegion)
        setCompanyProvinces(provincesData)

        if (userData?.company_address?.province?.code) {
          const province = provincesData.find(p => compare(p.provCode, userData.company_address.province.code))
          if (province) {
            setSelectedCompanyProvince(province.provCode)
          }
        } else {
          setSelectedCompanyProvince('')
          setCompanyCityMunicipalities([])
          setCompanyBarangays([])
        }
      }
    }
    fetchCompanyProvinces()
  }, [selectedCompanyRegion, userData])

  useEffect(() => {
    async function fetchCompanyCityMunicipalities() {
      if (selectedCompanyProvince) {
        const cityMunData = await getCityMunicipalities(selectedCompanyProvince)
        setCompanyCityMunicipalities(cityMunData)

        if (userData?.company_address?.municipality?.code) {
          const cityMun = cityMunData.find(c => compare(c.citymunCode, userData.company_address.municipality.code))
          if (cityMun) {
            setSelectedCompanyCityMunicipality(cityMun.citymunCode)
          }
        } else {
          setSelectedCompanyCityMunicipality('')
          setCompanyBarangays([])
        }
      }
    }
    fetchCompanyCityMunicipalities()
  }, [selectedCompanyProvince, userData])

  useEffect(() => {
    async function fetchCompanyBarangays() {
      if (selectedCompanyCityMunicipality) {
        const barangaysData = await getBarangays(selectedCompanyCityMunicipality)
        setCompanyBarangays(barangaysData)

        if (userData?.company_address?.barangay?.code) {
          const barangay = barangaysData.find(b => compare(b.brgyCode, userData.company_address.barangay.code))
          if (barangay) {
            setSelectedCompanyBarangay(barangay.brgyCode)
          }
        } else {
          setSelectedCompanyBarangay('')
        }
      }
    }
    fetchCompanyBarangays()
  }, [selectedCompanyCityMunicipality, userData])

  // Generate full address when components change
  useEffect(() => {
    if (!regions.length) return

    const regionName = regions.find(r => r.regCode === selectedRegion)?.regDesc || ''
    const provinceName = provinces.find(p => p.provCode === selectedProvince)?.provDesc || ''
    const cityMunName = cityMunicipalities.find(c => c.citymunCode === selectedCityMunicipality)?.citymunDesc || ''
    const barangayName = barangays.find(b => b.brgyCode === selectedBarangay)?.brgyDesc || ''

    const addressParts = [
      inputStreetAddress,
      barangayName,
      cityMunName,
      provinceName,
      regionName,
      'PHILIPPINES',
      inputPostalCode?.toString()
    ].filter(Boolean)

    setFullAddress(addressParts.join(', '))
  }, [selectedRegion, selectedProvince, selectedCityMunicipality,
    selectedBarangay, inputStreetAddress, inputPostalCode,
    regions, provinces, cityMunicipalities, barangays])

  // Generate full company address when components change
  useEffect(() => {
    if (!regions.length) return

    const regionName = regions.find(r => r.regCode === selectedCompanyRegion)?.regDesc || ''
    const provinceName = companyProvinces.find(p => p.provCode === selectedCompanyProvince)?.provDesc || ''
    const cityMunName = companyCityMunicipalities.find(c => c.citymunCode === selectedCompanyCityMunicipality)?.citymunDesc || ''
    const barangayName = companyBarangays.find(b => b.brgyCode === selectedCompanyBarangay)?.brgyDesc || ''

    const addressParts = [
      inputCompanyStreetAddress,
      barangayName,
      cityMunName,
      provinceName,
      regionName,
      'PHILIPPINES',
      inputCompanyPostalCode?.toString()
    ].filter(Boolean)

    setFullCompanyAddress(addressParts.join(', '))
  }, [selectedCompanyRegion, selectedCompanyProvince, selectedCompanyCityMunicipality,
    selectedCompanyBarangay, inputCompanyStreetAddress, inputCompanyPostalCode,
    regions, companyProvinces, companyCityMunicipalities, companyBarangays])

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // Function to discard changes and reset to original data
  function handleDiscardChanges() {
    setUserData(JSON.parse(JSON.stringify(originalUserData)))
    setSelectedRegion(originalUserData?.address?.region?.code || '')
    setSelectedProvince(originalUserData?.address?.province?.code || '')
    setSelectedCityMunicipality(originalUserData?.address?.municipality?.code || '')
    setSelectedBarangay(originalUserData?.address?.barangay?.code || '')
    setInputStreetAddress(originalUserData?.address?.streetAddress || '')
    setInputPostalCode(originalUserData?.address?.postalCode ? Number(originalUserData.address.postalCode) : undefined)

    setSelectedCompanyRegion(originalUserData?.company_address?.region?.code || '')
    setSelectedCompanyProvince(originalUserData?.company_address?.province?.code || '')
    setSelectedCompanyCityMunicipality(originalUserData?.company_address?.municipality?.code || '')
    setSelectedCompanyBarangay(originalUserData?.company_address?.barangay?.code || '')
    setInputCompanyStreetAddress(originalUserData?.company_address?.streetAddress || '')
    setInputCompanyPostalCode(originalUserData?.company_address?.postalCode ? Number(originalUserData.company_address.postalCode) : undefined)

    if (originalUserData?.profile_image?.data?.url) {
      setImagePreview(originalUserData.profile_image.data.url)
    } else {
      setImagePreview(null)
    }

    setIsEditMode(false)
  }

  // Handle region selection change
  function handleRegionChange(value: string) {
    setSelectedRegion(value)
    setSelectedProvince('')
    setSelectedCityMunicipality('')
    setSelectedBarangay('')
  }

  // Handle province selection change
  function handleProvinceChange(value: string) {
    setSelectedProvince(value)
    setSelectedCityMunicipality('')
    setSelectedBarangay('')
  }

  // Handle city/municipality selection change
  function handleCityMunicipalityChange(value: string) {
    setSelectedCityMunicipality(value)
    setSelectedBarangay('')
  }

  // Handle barangay selection change
  function handleBarangayChange(value: string) {
    setSelectedBarangay(value)
  }

  // Handle company region selection change
  function handleCompanyRegionChange(value: string) {
    setSelectedCompanyRegion(value)
    setSelectedCompanyProvince('')
    setSelectedCompanyCityMunicipality('')
    setSelectedCompanyBarangay('')
  }

  // Handle company province selection change
  function handleCompanyProvinceChange(value: string) {
    setSelectedCompanyProvince(value)
    setSelectedCompanyCityMunicipality('')
    setSelectedCompanyBarangay('')
  }

  // Handle company city/municipality selection change
  function handleCompanyCityMunicipalityChange(value: string) {
    setSelectedCompanyCityMunicipality(value)
    setSelectedCompanyBarangay('')
  }

  // Handle company barangay selection change
  function handleCompanyBarangayChange(value: string) {
    setSelectedCompanyBarangay(value)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)

    try {
      const formData = new FormData(event.currentTarget)

      // Add codes for address location components
      formData.append('address.country.code', '1')
      formData.append('address.region.code', selectedRegion)
      formData.append('address.province.code', selectedProvince)
      formData.append('address.municipality.code', selectedCityMunicipality)
      formData.append('address.barangay.code', selectedBarangay)
      formData.append('address.fullAddress', fullAddress)

      // Add codes for company address location components
      formData.append('companyAddress.country.code', '1')
      formData.append('companyAddress.region.code', selectedCompanyRegion)
      formData.append('companyAddress.province.code', selectedCompanyProvince)
      formData.append('companyAddress.municipality.code', selectedCompanyCityMunicipality)
      formData.append('companyAddress.barangay.code', selectedCompanyBarangay)
      formData.append('companyAddress.fullAddress', fullCompanyAddress)

      const result = await updateProfile(formData)

      if (result.error) {
        setError(result.error)
      } else {
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
        // Update original data with the new saved data
        const { data } = await getUserProfile()
        if (data) {
          setOriginalUserData(JSON.parse(JSON.stringify(data)))
        }
        setIsEditMode(false)
      }
    } catch (error: any) {
      setError('An unexpected error occurred')
      console.error('Error updating profile:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Show loading state
  if (isLoading && !userData) {
    return (
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
    );
  }

  return (
    <div className="container mx-auto max-w-4xl">
      <Form className="space-y-4 items-center w-full" onSubmit={handleSubmit}>
        <div className="space-y-4 w-full">

          {/* Profile Image Section */}
          {isEditMode && (
            <CardList>
              <div className="flex flex-col items-center justify-center w-full lg:p-4">
                <h2 className="text-xl font-semibold mb-4 ">Profile Image</h2>
                <Button
                  variant='faded'
                  className={`flex border-default-200 hover:border-default-400 flex-col space-y-2 items-center justify-center cursor-pointer w-full h-full p-4
                ${imagePreview ? 'bg-default-100 hover:bg-default-200' : 'bg-danger-50'}
                `}
                  isDisabled={!isEditMode}
                  onPress={() => fileInputRef.current?.click()}>
                  <div className="relative w-32 h-32">
                    {imagePreview ? (
                      <Image isBlurred src={imagePreview} radius='full' alt="Profile preview" className="w-32 h-32 object-cover bg-default-200" />
                    ) : (
                      <div className="w-full h-full bg-default-300/70 rounded-full flex items-center justify-center">
                        <UserIcon className="h-16 w-16 text-default-500" />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center justify-center">
                    {isEditMode ? (
                      <>
                        <p className="text-sm text-default-500">Click to update your profile image</p>
                        <p className="text-xs text-default-400">Max size: 2MB</p>
                      </>
                    ) : (
                      <p className="text-sm text-default-500">Profile image</p>
                    )}
                  </div>

                  <Input
                    type="file"
                    name="profileImage"
                    className="hidden"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageChange}
                    isDisabled={!isEditMode}>
                  </Input>
                </Button>
              </div>
            </CardList>
          )}

          {/* Basic Information */}
          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4  w-full text-center">Basic Information</h2>
              <div className="space-y-4">
                {!isEditMode && (
                  <div className="relative w-full flex items-center justify-center pb-4">
                    {imagePreview ? (
                      <Image isBlurred src={imagePreview} radius='full' alt="Profile preview" className="w-48 h-48 object-cover bg-default-200" />
                    ) : (
                      <div className="w-full h-full bg-default-300/70 rounded-full flex items-center justify-center">
                        <UserIcon className="h-16 w-16 text-default-500" />
                      </div>
                    )}
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    id="firstName"
                    name="firstName"
                    label="First Name"
                    type="text"
                    classNames={inputStyle}
                    defaultValue={userData?.name?.first_name || ''}
                    isRequired
                    isReadOnly={!isEditMode}
                  />
                  <Input
                    id="middleName"
                    name="middleName"
                    label="Middle Name"
                    type="text"
                    classNames={inputStyle}
                    defaultValue={userData?.name?.middle_name || ''}
                    isReadOnly={!isEditMode}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    id="lastName"
                    name="lastName"
                    label="Last Name"
                    type="text"
                    classNames={inputStyle}
                    defaultValue={userData?.name?.last_name || ''}
                    isRequired
                    isReadOnly={!isEditMode}
                  />
                  <Input
                    id="suffix"
                    name="suffix"
                    label="Suffix"
                    type="text"
                    classNames={inputStyle}
                    defaultValue={userData?.name?.suffix || ''}
                    isReadOnly={!isEditMode}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Autocomplete
                    id="gender"
                    name="gender"
                    label="Gender"
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    defaultSelectedKey={userData?.gender || ''}
                    isRequired
                    isReadOnly={!isEditMode}
                    {...(isEditMode ? {} : { selectorIcon: null, popoverProps: { className: "hidden" } })}
                  >
                    <AutocompleteItem key="male">Male</AutocompleteItem>
                    <AutocompleteItem key="female">Female</AutocompleteItem>
                    <AutocompleteItem key="other">Other</AutocompleteItem>
                    <AutocompleteItem key="prefer_not_to_say">Prefer not to say</AutocompleteItem>
                  </Autocomplete>
                  <DatePicker
                    name="birthday"
                    label="Birthday"
                    defaultValue={userData?.birthday ?
                      parseDate(new Date(userData.birthday).toISOString().split('T')[0]) :
                      today(getLocalTimeZone()).subtract({ years: 18 })}
                    minValue={today(getLocalTimeZone()).subtract({ years: 100 })}
                    maxValue={today(getLocalTimeZone())}
                    isRequired
                    isReadOnly={!isEditMode}
                    classNames={{
                      base: "w-full",
                      ...inputStyle,
                      selectorButton: "w-12 h-10 mb-4 mr-[-0.4rem]",
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <Input
                    id="phoneNumber"
                    name="phoneNumber"
                    label="Phone Number"
                    type="tel"
                    classNames={inputStyle}
                    defaultValue={userData?.phone_number || ''}
                    startContent={
                      <div className="pointer-events-none flex items-center">
                        <span className="text-default-600 text-small">+63</span>
                      </div>
                    }
                    validate={(value) => {
                      const phoneRegex = /^9[0-9]{9}$/;
                      return phoneRegex.test(value) || 'Invalid phone number';
                    }}
                    isRequired
                    isReadOnly={!isEditMode}
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
                    id="address.country"
                    name="address.country"
                    label="Country"
                    defaultValue="PHILIPPINES"
                    classNames={inputStyle}
                    isRequired
                    isReadOnly
                  />
                  <Autocomplete
                    id="address.region"
                    name="address.region"
                    label="Region"
                    isRequired
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    onSelectionChange={(e) => handleRegionChange(`${e}`)}
                    defaultSelectedKey={userData?.address?.region?.code || ''}
                    isReadOnly={!isEditMode}
                    {...(isEditMode ? {} : { selectorIcon: null, popoverProps: { className: "hidden" } })}
                  >
                    {regions.map(region => (
                      <AutocompleteItem key={region.regCode}>
                        {region.regDesc}
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Autocomplete
                    id="address.province"
                    name="address.province"
                    label="Province"
                    isRequired
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    onSelectionChange={(e) => handleProvinceChange(`${e}`)}
                    isDisabled={!selectedRegion}
                    isReadOnly={!isEditMode}
                    defaultSelectedKey={userData?.address?.province?.code || ''}
                    {...(isEditMode ? {} : { selectorIcon: null, popoverProps: { className: "hidden" } })}
                  >
                    {provinces.map(province => (
                      <AutocompleteItem key={province.provCode}>
                        {province.provDesc}
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                  <Autocomplete
                    id="address.municipality"
                    name="address.municipality"
                    label="Municipality/City"
                    isRequired
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    onSelectionChange={(e) => handleCityMunicipalityChange(`${e}`)}
                    isDisabled={!selectedProvince}
                    isReadOnly={!isEditMode}
                    defaultSelectedKey={userData?.address?.municipality?.code || ''}
                    {...(isEditMode ? {} : { selectorIcon: null, popoverProps: { className: "hidden" } })}
                  >
                    {cityMunicipalities.map(city => (
                      <AutocompleteItem key={city.citymunCode}>
                        {city.citymunDesc}
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Autocomplete
                    id="address.barangay"
                    name="address.barangay"
                    label="Barangay"
                    isRequired
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    onSelectionChange={(e) => setSelectedBarangay(`${e}`)}
                    isDisabled={!selectedCityMunicipality}
                    isReadOnly={!isEditMode}
                    defaultSelectedKey={userData?.address?.barangay?.code || ''}
                    {...(isEditMode ? {} : { selectorIcon: null, popoverProps: { className: "hidden" } })}
                  >
                    {barangays.map(barangay => (
                      <AutocompleteItem key={barangay.brgyCode}>
                        {barangay.brgyDesc}
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                  <Input
                    id="address.streetAddress"
                    name="address.streetAddress"
                    label="Street Address"
                    type="text"
                    classNames={inputStyle}
                    value={inputStreetAddress}
                    onValueChange={(value) => setInputStreetAddress(value.toUpperCase())}
                    isRequired
                    isReadOnly={!isEditMode}
                  />
                </div>

                <div className="flex sm:flex-row flex-col gap-4">
                  <NumberInput
                    id="address.postalCode"
                    name="address.postalCode"
                    label="Postal Code"
                    className="md:w-[10rem]"
                    classNames={inputStyle}
                    onValueChange={setInputPostalCode}
                    value={inputPostalCode}
                    formatOptions={{ useGrouping: false }}
                    hideStepper
                    isRequired
                    isReadOnly={!isEditMode}
                  />
                  <Input
                    id="address.fullAddress"
                    name="address.fullAddress"
                    label="Full Address"
                    type="text"
                    value={fullAddress}
                    classNames={inputStyle}
                    isReadOnly
                    isRequired
                  />
                </div>
              </div>
            </div>
          </CardList>

          {/* Company Address */}
          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4  w-full text-center">Company Information</h2>
              <div className="space-y-4">
                <Input
                  id="companyName"
                  name="companyName"
                  label="Company Name"
                  type="text"
                  classNames={inputStyle}
                  defaultValue={userData?.company_name || ''}
                  isRequired
                  isReadOnly={!isEditMode}
                />

                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    id="companyAddress.country"
                    name="companyAddress.country"
                    label="Country"
                    defaultValue="PHILIPPINES"
                    classNames={inputStyle}
                    isRequired
                    isReadOnly
                  />
                  <Autocomplete
                    id="companyAddress.region"
                    name="companyAddress.region"
                    label="Region"
                    isRequired
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    onSelectionChange={(e) => handleCompanyRegionChange(`${e}`)}
                    defaultSelectedKey={userData?.company_address?.region?.code || ''}
                    isReadOnly={!isEditMode}
                    {...(isEditMode ? {} : { selectorIcon: null, popoverProps: { className: "hidden" } })}
                  >
                    {regions.map(region => (
                      <AutocompleteItem key={region.regCode}>
                        {region.regDesc}
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Autocomplete
                    id="companyAddress.province"
                    name="companyAddress.province"
                    label="Province"
                    isRequired
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    onSelectionChange={(e) => handleCompanyProvinceChange(`${e}`)}
                    isDisabled={!selectedCompanyRegion}
                    isReadOnly={!isEditMode}
                    defaultSelectedKey={userData?.company_address?.province?.code || ''}
                    {...(isEditMode ? {} : { selectorIcon: null, popoverProps: { className: "hidden" } })}
                  >
                    {companyProvinces.map(province => (
                      <AutocompleteItem key={province.provCode} >
                        {province.provDesc}
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                  <Autocomplete
                    id="companyAddress.municipality"
                    name="companyAddress.municipality"
                    label="Municipality/City"
                    isRequired
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    onSelectionChange={(e) => handleCompanyCityMunicipalityChange(`${e}`)}
                    isDisabled={!selectedCompanyProvince}
                    isReadOnly={!isEditMode}
                    defaultSelectedKey={userData?.company_address?.municipality?.code || ''}
                    {...(isEditMode ? {} : { selectorIcon: null, popoverProps: { className: "hidden" } })}
                  >
                    {companyCityMunicipalities.map(city => (
                      <AutocompleteItem key={city.citymunCode} >
                        {city.citymunDesc}
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Autocomplete
                    id="companyAddress.barangay"
                    name="companyAddress.barangay"
                    label="Barangay"
                    isRequired
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    onSelectionChange={(e) => setSelectedCompanyBarangay(`${e}`)}
                    isDisabled={!selectedCompanyCityMunicipality}
                    isReadOnly={!isEditMode}
                    defaultSelectedKey={userData?.company_address?.barangay?.code || ''}
                    {...(isEditMode ? {} : { selectorIcon: null, popoverProps: { className: "hidden" } })}
                  >
                    {companyBarangays.map(barangay => (
                      <AutocompleteItem key={barangay.brgyCode}>
                        {barangay.brgyDesc}
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                  <Input
                    id="companyAddress.streetAddress"
                    name="companyAddress.streetAddress"
                    label="Street Address"
                    type="text"
                    classNames={inputStyle}
                    onValueChange={setInputCompanyStreetAddress}
                    value={inputCompanyStreetAddress}
                    isRequired
                    isReadOnly={!isEditMode}
                  />
                </div>

                <div className="flex sm:flex-row flex-col gap-4">
                  <NumberInput
                    id="companyAddress.postalCode"
                    name="companyAddress.postalCode"
                    label="Postal Code"
                    type="text"
                    className="sm:w-[10rem]"
                    classNames={inputStyle}
                    onValueChange={setInputCompanyPostalCode}
                    value={inputCompanyPostalCode}
                    formatOptions={{ useGrouping: false }}
                    hideStepper
                    isRequired
                    isReadOnly={!isEditMode}
                  />
                  <Input
                    id="companyAddress.fullAddress"
                    name="companyAddress.fullAddress"
                    label="Full Company Address"
                    type="text"
                    value={fullCompanyAddress}
                    classNames={inputStyle}
                    isReadOnly
                    isRequired
                  />
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
                defaultValue={userData?.email || ''}
                isReadOnly
                isRequired
              />
            </div>
          </CardList>

          {isEditMode ? (
            <CardList>
              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Profile Update Options</h2>

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
                      className="mb-4 p-1">
                      <Alert color="danger" variant="solid" title="Error" onClose={() => setError(null)}>
                        {error}
                      </Alert>
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
                      className="mb-4 p-1">
                      <Alert color="success" variant="solid" title="Success" onClose={() => setSuccess(false)}>
                        Your profile has been updated successfully.
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>


                <div className="flex justify-center gap-4">
                  <Button
                    type="button"
                    color="danger"
                    variant="shadow"
                    size="lg"
                    className="w-full"
                    onPress={handleDiscardChanges}
                    disabled={isSaving}
                  >
                    Discard Changes
                  </Button>
                  <Button
                    type="submit"
                    color="primary"
                    variant="shadow"
                    size="lg"
                    className="w-full"
                    isLoading={isSaving}
                    disabled={isSaving}
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardList>
          ) : (
            <CardList>
              <div className="flex items-center justify-between h-full w-full">
                <span>Change profile information</span>
                <Button
                  variant="shadow"
                  color="primary"
                  onPress={() => setIsEditMode(true)}
                  className="my-1">
                  <ChevronRightIcon className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between h-full w-full">
                <span>Change password</span>
                <Button
                  variant="shadow"
                  color="primary"
                  className="my-1">
                  <ChevronRightIcon className="w-4 h-4" />
                </Button>
              </div>
            </CardList>
          )}

        </div>
      </Form >
    </div >
  )
}