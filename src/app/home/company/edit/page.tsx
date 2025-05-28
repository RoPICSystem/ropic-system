'use client'

import CardList from '@/components/card-list';
import LoadingAnimation from '@/components/loading-animation';
import { motionTransition } from '@/utils/anim';
import {
  Barangay,
  CityMunicipality,
  getAddressDropdownData,
  Province,
  Region
} from '@/utils/supabase/server/address';

import { getUserCompanyDetails } from '@/utils/supabase/server/companies';
import { getUserFromCookies, getUserProfile } from '@/utils/supabase/server/user';
import { useRouter } from 'next/navigation';
import { lazy, memo, useEffect, useRef, useState } from 'react';
import { updateCompany } from './actions';

import {
  BuildingOfficeIcon,
  XMarkIcon
} from '@heroicons/react/24/solid';
import {
  Alert,
  Autocomplete,
  AutocompleteItem,
  Button,
  Form,
  Image,
  Input,
  NumberInput,
  Skeleton,
  Spinner,
  Textarea
} from "@heroui/react";

import { AnimatePresence, motion } from 'framer-motion';

export default function CompanyEditPage() {
  const [companyData, setCompanyData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAddressLoading, setIsAddressLoading] = useState(true) // Separate loading state for address
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [originalCompanyData, setOriginalCompanyData] = useState<any>(null)
  const [user, setUser] = useState<any>(null);

  // Router
  const router = useRouter()

  // Address form state
  const [regions, setRegions] = useState<Region[]>([])
  const [provinces, setProvinces] = useState<Province[]>([])
  const [cityMunicipalities, setCityMunicipalities] = useState<CityMunicipality[]>([])
  const [barangays, setBarangays] = useState<Barangay[]>([])

  const [selectedRegion, setSelectedRegion] = useState<string>('')
  const [selectedProvince, setSelectedProvince] = useState<string>('')
  const [selectedCityMunicipality, setSelectedCityMunicipality] = useState<string>('')
  const [selectedBarangay, setSelectedBarangay] = useState<string>('')
  const [inputStreetAddress, setInputStreetAddress] = useState<string>('')
  const [inputPostalCode, setInputPostalCode] = useState<number | undefined>()
  const [fullAddress, setFullAddress] = useState<string>('')

  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" }
  const autoCompleteStyle = { classNames: inputStyle }

  // Optimized function to load address data efficiently
  const loadAddressData = async (options?: {
    regCode?: string
    provCode?: string
    citymunCode?: string
  }) => {
    try {
      const addressData = await getAddressDropdownData(options)

      console.log(selectedRegion === '', selectedProvince === '', selectedCityMunicipality === '', selectedBarangay === '')

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

  // Handle logo change
  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      // Check file size (2MB limit)
      if (file.size > 2 * 1024 * 1024) {
        setError('Logo image must be less than 2MB')
        return
      }

      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
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

    // Reset dependent selections
    setProvinces([])
    setCityMunicipalities([])
    setBarangays([])
    setInputStreetAddress('')
    setInputPostalCode(undefined)
    setFullAddress('')

    // Load provinces for the selected region
    loadAddressData({ regCode: value })
  }

  // Handle province selection change
  function handleProvinceChange(value: string) {
    setSelectedProvince(value)
    setSelectedCityMunicipality('')
    setSelectedBarangay('')

    // Reset dependent selections
    setCityMunicipalities([])
    setBarangays([])
    setInputStreetAddress('')
    setInputPostalCode(undefined)
    setFullAddress('')

    // Load cities for the selected province
    loadAddressData({ provCode: value })
  }

  // Handle city/municipality selection change
  function handleCityMunicipalityChange(value: string) {
    setSelectedCityMunicipality(value)
    setSelectedBarangay('')

    // Reset dependent selections
    setBarangays([])
    setInputStreetAddress('')
    setInputPostalCode(undefined)
    setFullAddress('')

    // Load barangays for the selected city/municipality
    loadAddressData({ citymunCode: value })
  }

  // Form submission
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)

    const formData = new FormData(event.currentTarget)

    if (selectedRegion === '' || selectedProvince === '' || selectedCityMunicipality === '' || selectedBarangay === '') {
      setError('Please fill out all required fields.')
      setIsSaving(false)
      return
    }

    formData.append('address.country.code', '1')
    formData.append('address.region.code', selectedRegion)
    formData.append('address.province.code', selectedProvince)
    formData.append('address.municipality.code', selectedCityMunicipality)
    formData.append('address.barangay.code', selectedBarangay)

    const { error, success } = await updateCompany(formData)

    if (error) {
      console.error('Error updating company:', error)
      setError(error)
    }
    else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      // Update original data with the new saved data
      const { data, error } = await getUserProfile()
      const { data: companyData, error: companyError } = await getUserCompanyDetails(data?.uuid)

      if (error) {
        setError(error)
        return
      }

      if (!data?.is_admin) {
        router.back()
        return
      }

      if (companyError) {
        setError(`${companyError}`)
        return
      }

      setCompanyData(companyData)
      setOriginalCompanyData(JSON.parse(JSON.stringify(companyData)))
      router.back()
    }

    setIsSaving(false)
  }

  // Function to discard changes and reset to original data
  function handleDiscardChanges() {
    router.back()
  }

  // Load company data and initial address data efficiently
  useEffect(() => {
    async function fetchCompanyData() {
      try {
        setIsLoading(true)
        setIsAddressLoading(true) // Set address loading to true initially

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
          setError(error)
          return
        }

        if (!userData?.is_admin) {
          router.back()
          return
        }

        if (companyError) {
          setError(`${companyError}`)
          return
        }

        setCompanyData(companyData)
        setOriginalCompanyData(JSON.parse(JSON.stringify(companyData)))

        // Initialize logo preview
        if (companyData?.logo_url && !companyData.logo_url.error) {
          setLogoPreview(companyData.logo_url)
        }


        setIsLoading(false)


        // Load address data based on company data efficiently
        const regCode = companyData?.address?.region?.code
        const provCode = companyData?.address?.province?.code
        const citymunCode = companyData?.address?.municipality?.code

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
        if (companyData?.address) {
          if (companyData.address.region?.code) {
            setSelectedRegion(companyData.address.region.code)
          }
          if (companyData.address.province?.code) {
            setSelectedProvince(companyData.address.province.code)
          }
          if (companyData.address.municipality?.code) {
            setSelectedCityMunicipality(companyData.address.municipality.code)
          }
          if (companyData.address.barangay?.code) {
            setSelectedBarangay(companyData.address.barangay.code)
          }

          setInputStreetAddress(companyData.address.street || '')
          setInputPostalCode(companyData.address.postalCode ? Number(companyData.address.postalCode) : undefined)
          setFullAddress(companyData.address.fullAddress || '')
        }

        setIsAddressLoading(false) // Set address loading to true

      } catch (err) {
        console.error('Error fetching company profile:', err)
        setError('Failed to load company data')
      } finally {
        setIsLoading(false)
        setIsAddressLoading(false) // Set address loading to true
      }
    }

    fetchCompanyData()
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
      <Form onSubmit={handleSubmit}>
        <div className="space-y-4 w-full">
          <div className="flex justify-between items-center">
            <div className="flex flex-col w-full xl:text-left text-center">
              <h1 className="text-2xl font-bold">Edit Company</h1>
              {isLoading ? (
                <div className="text-default-500 flex xl:justify-start justify-center items-center">
                  <p className='my-auto mr-1'>Loading company information</p>
                  <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
                </div>
              ) : (
                <p className="text-default-500">Update your company information.</p>
              )}
            </div>
          </div>

          {/* Company Logo and Info Section */}
          <CardList>
            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div>
                  <Skeleton className="h-6 w-48 mx-auto rounded-xl mb-4" /> {/* Section Title */}
                  <div className="flex flex-col items-center justify-center p-4 bg-default-100 border border-default-200 rounded-xl w-full">
                    <Skeleton className="w-48 h-48 rounded-xl mb-4" /> {/* Company Logo */}
                    <Skeleton className="h-4 w-52 rounded-lg mb-1 mt-2" /> {/* "Click to upload" text */}
                    <Skeleton className="h-3 w-32 rounded-lg" /> {/* "Max size: 2MB" text */}
                  </div>
                  <div className="space-y-4 mt-4">
                    <Skeleton className="h-14 rounded-xl" /> {/* Company Name */}
                    <Skeleton className="h-14 rounded-xl" /> {/* Company Description */}
                  </div>
                </div>
              }>
              <div>
                <div className="flex flex-col items-center justify-center w-full">
                  <h3 className="text-xl font-semibold mb-4">Company Logo</h3>
                  <Button
                    variant='faded'
                    className={`flex border-default-200 hover:border-default-400 flex-col space-y-2 items-center justify-center p-2 cursor-pointer w-full h-full p-4
                                      ${logoPreview ? 'bg-default-100 hover:bg-default-200' : 'bg-danger-50'}
                                      `}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {logoPreview ? (
                      <Image isBlurred src={logoPreview} alt="Logo preview" className="w-48 h-48 object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center w-48 h-48">
                        <BuildingOfficeIcon className="h-24 w-24 text-default-400 mb-2" />
                        <p className="text-default-600 text-center">No logo uploaded</p>
                      </div>
                    )}
                    <div className="text-center mt-2">
                      <p className="text-default-600 font-medium">Click to upload logo</p>
                      <p className="text-default-500 text-sm">Max size: 2MB</p>
                    </div>
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleLogoChange}
                    accept="image/*"
                    className="hidden"
                    name="logoImage"
                  />
                </div>
                <div className="space-y-4 mt-4">
                  <Input
                    id="name"
                    name="name"
                    label="Company Name"
                    type="text"
                    defaultValue={companyData?.name || ''}
                    classNames={inputStyle}
                    isRequired
                    isDisabled={isLoading}
                  />
                  <Textarea
                    id="description"
                    name="description"
                    label="Company Description"
                    defaultValue={companyData?.description || ''}
                    classNames={inputStyle}
                    isDisabled={isLoading}
                  />
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
                <div className="flex items-center justify-center mb-4">
                  <h3 className="text-xl font-semibold">Company Address</h3>
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
                      defaultSelectedKey={companyData?.address?.region?.code || ''}
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
                      defaultSelectedKey={companyData?.address?.province?.code || ''}
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
                      defaultSelectedKey={companyData?.address?.municipality?.code || ''}
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
                      defaultSelectedKey={companyData?.address?.barangay?.code || ''}
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
                      onValueChange={setInputStreetAddress}
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

          {/* Update Options */}
          <CardList>
            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div>
                  <Skeleton className="h-6 w-48 rounded-xl m-1 mx-auto" /> {/* Section Title */}
                  <div className="flex justify-center gap-4 mt-4">
                    <Skeleton className="h-12 w-full rounded-xl" /> {/* Discard Button */}
                    <Skeleton className="h-12 w-full rounded-xl" /> {/* Save Button */}
                  </div>
                </div>
              }>
              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Company Update Options</h2>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      {...motionTransition}
                      className="mb-4">
                      <Alert color="danger" variant="solid" title="Error"
                        endContent={
                          <Button
                            aria-label="close error alert"
                            className="focus:outline-none my-[-0.25rem] mr-[-0.4rem]"
                            type="button"
                            color="danger"
                            radius='full'
                            isIconOnly
                            variant="light"
                            onPress={() => setError(null)}
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </Button>
                        }
                      >
                        {error}
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {success && (
                    <motion.div
                      {...motionTransition}
                      className="mb-4">
                      <Alert color="success" variant="solid"
                        title="Success" onClose={() => setSuccess(false)}>
                        Company information has been updated successfully.
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