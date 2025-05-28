'use client'


import { getUserProfile } from '@/utils/supabase/server/user'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { updateProfile } from './actions'

import {
  UserIcon,
  XMarkIcon
} from '@heroicons/react/24/solid'
import {
  Alert,
  Autocomplete,
  AutocompleteItem,
  Button,
  DatePicker,
  Form,
  Image,
  Input,
  NumberInput,
  Skeleton,
  Spinner,
  Textarea
} from "@heroui/react"
import { getLocalTimeZone, parseDate, today } from '@internationalized/date'

// Import address utilities
import CardList from '@/components/card-list'
import LoadingAnimation from '@/components/loading-animation'
import { motionTransition } from '@/utils/anim'
import {
  Barangay,
  CityMunicipality,
  getAddressDropdownData,
  Province,
  Region
} from '@/utils/supabase/server/address'
import { AnimatePresence, motion } from 'framer-motion'

export default function ProfileEditPage() {
  const [userData, setUserData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAddressLoading, setIsAddressLoading] = useState(true) // Separate loading state for address
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [originalUserData, setOriginalUserData] = useState<any>(null)

  // Router
  const router = useRouter()

  const [selectedGender, setSelectedGender] = useState<string>('');

  // Address form state
  const [regions, setRegions] = useState<Region[]>([])
  const [provinces, setProvinces] = useState<Province[]>([])
  const [cityMunicipalities, setCityMunicipalities] = useState<CityMunicipality[]>([])
  const [barangays, setBarangays] = useState<Barangay[]>([])

  // Selected values state
  const [selectedRegion, setSelectedRegion] = useState<string>('')
  const [selectedProvince, setSelectedProvince] = useState<string>('')
  const [selectedCityMunicipality, setSelectedCityMunicipality] = useState<string>('')
  const [selectedBarangay, setSelectedBarangay] = useState<string>('')
  const [inputStreetAddress, setInputStreetAddress] = useState<string>('')
  const [inputPostalCode, setInputPostalCode] = useState<number | undefined>()
  const [fullAddress, setFullAddress] = useState<string>('')

  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" }
  const autoCompleteStyle = { classNames: inputStyle }

  // Function to compare values
  const compare = (a: any, b: any) => {
    return `${a}` === `${b}`
  }

  // Optimized function to load address data efficiently
  const loadAddressData = async (options?: {
    regCode?: string
    provCode?: string
    citymunCode?: string
  }) => {
    try {
      const addressData = await getAddressDropdownData(options)

      setRegions(addressData.regions)

      if (options?.regCode) {
        setProvinces(addressData.provinces)
      }

      if (options?.provCode) {
        setCityMunicipalities(addressData.cities)
      }

      if (options?.citymunCode) {
        setBarangays(addressData.barangays)
      }

      return addressData
    } catch (error) {
      console.error('Error loading address data:', error)
      return { regions: [], provinces: [], cities: [], barangays: [] }
    }
  }

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

  // Handle region selection change
  function handleRegionChange(value: string) {
    setSelectedRegion(value)
    setSelectedProvince('')
    setSelectedCityMunicipality('')
    setSelectedBarangay('')

    // Load provinces for the selected region
    loadAddressData({ regCode: value })
  }

  // Handle province selection change
  function handleProvinceChange(value: string) {
    setSelectedProvince(value)
    setSelectedCityMunicipality('')
    setSelectedBarangay('')

    // Load cities for the selected province
    loadAddressData({ provCode: value })
  }

  // Handle city/municipality selection change
  function handleCityMunicipalityChange(value: string) {
    setSelectedCityMunicipality(value)
    setSelectedBarangay('')

    // Load barangays for the selected city/municipality
    loadAddressData({ citymunCode: value })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)

    const formData = new FormData(event.currentTarget)

    formData.append('gender.key', selectedGender)

    formData.append('address.country.code', '1')
    formData.append('address.region.code', selectedRegion)
    formData.append('address.province.code', selectedProvince)
    formData.append('address.municipality.code', selectedCityMunicipality)
    formData.append('address.barangay.code', selectedBarangay)

    // Set updateCompany to false since we're removing company profile
    formData.append('updateCompany', 'false')
    formData.append('isNewCompany', 'false')

    const { error, success } = await updateProfile(formData)

    if (error) {
      console.error('Error updating profile:', error)
      setError(error)
    }
    else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      // Update original data with the new saved data
      const { data } = await getUserProfile()
      if (data) {
        setOriginalUserData(JSON.parse(JSON.stringify(data)))
      }
      router.back()
    }

    setIsSaving(false)
  }

  // Function to discard changes and reset to original data
  function handleDiscardChanges() {
    router.back()
  }

  // Load user data and initial address data efficiently
  useEffect(() => {
    async function fetchUserData() {
      try {
        setIsLoading(true)
        setIsAddressLoading(true) // Set address loading to true

        const { data, error } = await getUserProfile();

        if (error) {
          setError(error)
          return
        }

        setUserData(data)
        setSelectedGender(data.gender)
        setOriginalUserData(JSON.parse(JSON.stringify(data))) // Create a deep copy for reset

        if (!data?.profile_image.error) {
          await setImagePreview(data.profile_image_url)
        }

        setIsLoading(false)

        // Load address data based on user data efficiently
        const regCode = data?.address?.region?.code
        const provCode = data?.address?.province?.code
        const citymunCode = data?.address?.municipality?.code

        let addressData;
        if (regCode && provCode && citymunCode) {
          // Load all levels at once
          addressData = await loadAddressData({ regCode, provCode, citymunCode })
        } else if (regCode && provCode) {
          // Load up to cities
          addressData = await loadAddressData({ regCode, provCode })
        } else if (regCode) {
          // Load up to provinces
          addressData = await loadAddressData({ regCode })
        } else {
          // Load only regions
          addressData = await loadAddressData()
        }

        // Set selected values after data is loaded
        if (data?.address) {
          if (data.address.region?.code) {
            setSelectedRegion(data.address.region.code)
          }
          if (data.address.province?.code) {
            setSelectedProvince(data.address.province.code)
          }
          if (data.address.municipality?.code) {
            setSelectedCityMunicipality(data.address.municipality.code)
          }
          if (data.address.barangay?.code) {
            setSelectedBarangay(data.address.barangay.code)
          }

          setInputStreetAddress(data.address.street || '')
          setInputPostalCode(data.address.postalCode ? Number(data.address.postalCode) : undefined)
          setFullAddress(data.full_address || '')

          setIsAddressLoading(false) // Set address loading to false when done
        }

      } catch (err) {
        console.error('Error fetching user profile:', err)
        setError('Failed to load profile data')
      } finally {
        setIsLoading(false)
        setIsAddressLoading(false) // Ensure loading state is reset
      }
    }

    fetchUserData()
  }, [])

  // Update the full address when components change
  useEffect(() => {
    if (!regions.length) return

    const regionName = regions.find(r => r.regCode === selectedRegion)?.regDesc || '';
    const provinceName = provinces.find(p => p.provCode === selectedProvince)?.provDesc || '';
    const cityMunName = cityMunicipalities.find(c => c.citymunCode === selectedCityMunicipality)?.citymunDesc || '';
    const barangayName = barangays.find(b => b.brgyCode === selectedBarangay)?.brgyDesc || '';

    const addressParts = [
      inputStreetAddress,
      barangayName,
      cityMunName,
      provinceName,
      regionName,
      'PHILIPPINES',
      inputPostalCode?.toString()
    ].filter(Boolean);

    setFullAddress(addressParts.join(', '));

  }, [selectedRegion, selectedProvince, selectedCityMunicipality,
    selectedBarangay, inputStreetAddress, inputPostalCode,
    regions, provinces, cityMunicipalities, barangays]);

  return (
    <div className="container mx-auto max-w-5xl p-2">
      <Form className="space-y-4" onSubmit={handleSubmit}
        onInvalid={(error) => {
          setError("Please fill out all required fields.")
          setIsSaving(false)
        }}>
        <div className="space-y-4 w-full">
          <div className="flex justify-between items-center">
            <div className="flex flex-col w-full xl:text-left text-center">
              <h1 className="text-2xl font-bold">Edit Profile</h1>
              {isLoading ? (
                <div className="text-default-500 flex xl:justify-start justify-center items-center">
                  <p className='my-auto mr-1'>Loading profile editing components</p>
                  <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
                </div>
              ) : (
                <p className="text-default-500">Update your profile information.</p>
              )}
            </div>
          </div>

          {/* Profile Image Section */}
          <CardList>
            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div className="flex flex-col items-center justify-center w-full">
                  <Skeleton className="h-6 w-36 rounded-lg mb-4" /> {/* "Profile Image" title */}
                  <div className="flex flex-col items-center justify-center p-4 bg-default-100 border border-default-200 rounded-xl w-full">
                    <Skeleton className="rounded-full w-48 h-48 mb-4" /> {/* Profile Image */}
                    <Skeleton className="h-4 w-52 rounded-lg mb-1 mt-2" /> {/* "Click to upload" text */}
                    <Skeleton className="h-3 w-32 rounded-lg" /> {/* "Max size: 2MB" text */}
                  </div>
                </div>
              }>
              <div className="flex flex-col items-center justify-center w-full">
                <h2 className="text-xl font-semibold mb-4">Profile Image</h2>
                <Button
                  variant='faded'
                  className={`flex border-default-200 hover:border-default-400 flex-col space-y-2 items-center justify-center p-2 cursor-pointer w-full h-full p-4
                          ${imagePreview ? 'bg-default-100 hover:bg-default-200' : 'bg-danger-50'}
                          `}
                  onPress={() => fileInputRef.current?.click()}
                >
                  {imagePreview ? (
                    <Image isBlurred src={imagePreview} alt="Profile preview" className="rounded-full w-48 h-48 object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-full w-48 h-48">
                      <UserIcon className="h-24 w-24 text-default-400 mb-2" />
                      <p className="text-default-600 text-center">No profile image</p>
                    </div>
                  )}
                  <div className="text-center mt-2">
                    <p className="text-default-600 font-medium">Click to upload image</p>
                    <p className="text-default-500 text-sm">Max size: 2MB</p>
                  </div>
                  <Input
                    id="profileImage"
                    name="profileImage"
                    type="file"
                    className="hidden"
                    ref={fileInputRef}
                    accept="image/*"
                    errorMessage="Please select a valid image file."
                    onChange={handleImageChange}>
                  </Input>
                </Button>
              </div>
            </LoadingAnimation>
          </CardList>

          {/* Basic Information */}
          <CardList>
            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div>
                  <Skeleton className="h-6 w-48 rounded-xl m-1 mx-auto" /> {/* "Basic Information" title */}
                  <div className="space-y-4 mt-4">
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
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input
                      id="firstName"
                      name="firstName"
                      label="First Name"
                      type="text"
                      classNames={inputStyle}
                      defaultValue={userData?.name?.first_name || ''}
                      isRequired
                    />
                    <Input
                      id="middleName"
                      name="middleName"
                      label="Middle Name"
                      type="text"
                      classNames={inputStyle}
                      defaultValue={userData?.name?.middle_name || ''}
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
                    />
                    <Input
                      id="suffix"
                      name="suffix"
                      label="Suffix"
                      type="text"
                      classNames={inputStyle}
                      defaultValue={userData?.name?.suffix || ''}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <Autocomplete
                      id="gender"
                      name="gender"
                      label="Gender"
                      inputProps={autoCompleteStyle}
                      onSelectionChange={(e) => setSelectedGender(`${e}`)}
                      classNames={{ clearButton: "text-default-800" }}
                      defaultSelectedKey={userData?.gender || ''}
                      isRequired
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
                    />
                  </div>
                </div>
              </div>
            </LoadingAnimation>
          </CardList>

          {/* Address Information */}
          <CardList>
            <LoadingAnimation
              condition={isAddressLoading}
              skeleton={
                <div>
                  <Skeleton className="h-6 w-48 rounded-xl m-1 mx-auto" /> {/* "Personal Address" title */}
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
                <div className="flex items-center justify-center mb-4">
                  <h2 className="text-xl font-semibold">Personal Address</h2>
                  {isAddressLoading && (
                    <Spinner className="ml-2 scale-75" size="sm" variant="dots" color="default" />
                  )}
                </div>
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input
                      id="address.country.desc"
                      name="address.country.desc"
                      label="Country"
                      defaultValue="PHILIPPINES"
                      classNames={inputStyle}
                      isRequired
                      isReadOnly
                      isDisabled={isAddressLoading}
                    />
                    <Autocomplete
                      id="address.region.desc"
                      name="address.region.desc"
                      label="Region"
                      isRequired
                      inputProps={autoCompleteStyle}
                      classNames={{ clearButton: "text-default-800" }}
                      onSelectionChange={(e) => handleRegionChange(`${e}`)}
                      defaultSelectedKey={userData?.address?.region?.code || ''}
                      isDisabled={isAddressLoading}
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
                      id="address.province.desc"
                      name="address.province.desc"
                      label="Province"
                      isRequired
                      inputProps={autoCompleteStyle}
                      classNames={{ clearButton: "text-default-800" }}
                      onSelectionChange={(e) => handleProvinceChange(`${e}`)}
                      defaultSelectedKey={userData?.address?.province?.code || ''}
                      isDisabled={!selectedRegion || isAddressLoading}
                    >
                      {provinces.map(province => (
                        <AutocompleteItem key={province.provCode}>
                          {province.provDesc}
                        </AutocompleteItem>
                      ))}
                    </Autocomplete>
                    <Autocomplete
                      id="address.municipality.desc"
                      name="address.municipality.desc"
                      label="Municipality/City"
                      isRequired
                      inputProps={autoCompleteStyle}
                      classNames={{ clearButton: "text-default-800" }}
                      onSelectionChange={(e) => handleCityMunicipalityChange(`${e}`)}
                      defaultSelectedKey={userData?.address?.municipality?.code || ''}
                      isDisabled={!selectedProvince || isAddressLoading}
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
                      id="address.barangay.desc"
                      name="address.barangay.desc"
                      label="Barangay"
                      isRequired
                      inputProps={autoCompleteStyle}
                      classNames={{ clearButton: "text-default-800" }}
                      onSelectionChange={(e) => setSelectedBarangay(`${e}`)}
                      defaultSelectedKey={userData?.address?.barangay?.code || ''}
                      isDisabled={!selectedCityMunicipality || isAddressLoading}
                    >
                      {barangays.map(barangay => (
                        <AutocompleteItem key={barangay.brgyCode}>
                          {barangay.brgyDesc}
                        </AutocompleteItem>
                      ))}
                    </Autocomplete>
                    <Input
                      id="address.street"
                      name="address.street"
                      label="Street Address"
                      type="text"
                      classNames={inputStyle}
                      value={inputStreetAddress}
                      onValueChange={(value) => setInputStreetAddress(value.toUpperCase())}
                      isRequired
                      isDisabled={isAddressLoading}
                    />
                  </div>

                  <div className="flex sm:flex-row flex-col gap-4">
                    <NumberInput
                      id="address.postalCode"
                      name="address.postalCode"
                      label="Postal Code"
                      className="md:w-[10rem]"
                      minValue={0}
                      classNames={inputStyle}
                      value={inputPostalCode}
                      onValueChange={setInputPostalCode}
                      formatOptions={{ useGrouping: false }}
                      hideStepper
                      isRequired
                      isDisabled={isAddressLoading}
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
                      isDisabled={isAddressLoading}
                    />
                  </div>
                </div>
              </div>
            </LoadingAnimation>
          </CardList>

          {/* Account Information */}
          <CardList>
            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div>
                  <Skeleton className="h-6 w-48 rounded-xl m-1 mx-auto" /> {/* "Account Information" title */}
                  <Skeleton className="h-14 rounded-xl mt-4" /> {/* Email field */}
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
                  defaultValue={userData?.email || ''}
                  isReadOnly
                  isRequired
                />
              </div>
            </LoadingAnimation>
          </CardList>

          {/* Profile Update Options */}
          <CardList>
            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div>
                  <Skeleton className="h-6 w-48 rounded-xl m-1 mx-auto" /> {/* "Profile Update Options" title */}
                  <div className="flex justify-center gap-4 mt-4">
                    <Skeleton className="h-12 w-full rounded-xl" /> {/* Discard Changes button */}
                    <Skeleton className="h-12 w-full rounded-xl" /> {/* Save Changes button */}
                  </div>
                </div>
              }>
              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Profile Update Options</h2>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      {...motionTransition}
                      className="mb-4">
                      <Alert color="danger" variant="solid" title="Error"
                        endContent={
                          <Button
                            aria-label="toggle password visibility"
                            className="focus:outline-none my-[-0.25rem] mr-[-0.4rem]"
                            type="button"
                            color="danger"
                            radius='full'
                            isIconOnly
                            onPress={() => setError(null)}>
                            <XMarkIcon className="h-4 w-4" />
                          </Button>
                        }>
                        {error}
                      </Alert>
                      <div className='h-4' />
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
            </LoadingAnimation>
          </CardList>
        </div>
      </Form>
    </div>
  )
}