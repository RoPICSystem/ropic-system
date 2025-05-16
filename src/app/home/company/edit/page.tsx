'use client'

import CardList from '@/components/card-list';
import { motionTransition } from '@/utils/anim';
import {
  Barangay,
  CityMunicipality,
  getBarangays,
  getCityMunicipalities,
  getProvinces,
  getRegions,
  Province,
  Region
} from '@/utils/supabase/server/address';

import { getUserCompanyDetails } from '@/utils/supabase/server/companies';
import { getUserProfile } from '@/utils/supabase/server/user';
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

// Import ShelfSelector3D component with lazy loading
const ShelfSelector3D = memo(lazy(() =>
  import("@/components/shelf-selector-3d").then(mod => ({
    default: mod.ShelfSelector3D
  }))
));


export default function CompanyEditPage() {
  const [companyData, setCompanyData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [originalCompanyData, setOriginalCompanyData] = useState<any>(null)

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


  // Function to compare values
  const compare = (a: any, b: any) => {
    return `${a}` === `${b}`
  }

  // Initialize regions
  const fetchRegions = async () => {
    const regionsData = await getRegions()
    setRegions(regionsData)
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


  // Form submission
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)

    const formData = new FormData(event.currentTarget)

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

  // Load company data on initial render
  useEffect(() => {
    async function fetchCompanyData() {
      try {
        setIsLoading(true)
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

        // Initialize logo preview
        if (companyData?.logo_url && !companyData.logo_url.error) {
          setLogoPreview(companyData.logo_url)
        }
      } catch (err) {
        console.error('Error fetching company profile:', err)
        setError('Failed to load company data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchCompanyData()
  }, [])

  // Fetch address data on initial render
  useEffect(() => {
    fetchRegions()
  }, [])

  // Set form values when companyData is loaded
  useEffect(() => {
    async function initializeCompanyData() {
      if (companyData && regions.length) {
        // Handle company address
        if (companyData.address?.region?.code) {
          const region = regions.find(r => compare(r.regCode, companyData.address.region.code))
          if (region) {
            setSelectedRegion(region.regCode)
          }
        }

        // Set street address and postal code
        setInputStreetAddress(companyData.address?.street || '')
        setInputPostalCode(companyData.address?.postalCode ? Number(companyData.address.postalCode) : undefined)

        // Set full address
        setFullAddress(companyData.address?.fullAddress || '')
      }
    }

    initializeCompanyData()
  }, [companyData, regions])

  // Fetch provinces when region changes
  const fetchProvinces = async () => {
    if (selectedRegion) {
      const provincesData = await getProvinces(selectedRegion)
      setProvinces(provincesData)

      // If companyData has province code, set it
      if (companyData?.address?.province?.code) {
        const province = provincesData.find(p => compare(p.provCode, companyData.address.province.code))
        if (province) {
          setSelectedProvince(province.provCode)
        }
      } else {
        setSelectedProvince('')
      }
      setCityMunicipalities([])
      setBarangays([])
    }
  }

  // Fetch municipalities when province changes
  const fetchCityMunicipalities = async () => {
    if (selectedProvince) {
      const cityMunData = await getCityMunicipalities(selectedProvince)
      setCityMunicipalities(cityMunData)

      // If companyData has municipality code, set it
      if (companyData?.address?.municipality?.code) {
        const cityMun = cityMunData.find(c => compare(c.citymunCode, companyData.address.municipality.code))
        if (cityMun) {
          setSelectedCityMunicipality(cityMun.citymunCode)
        }
      } else {
        setSelectedCityMunicipality('')
      }
      setBarangays([])
    }
  }

  // Fetch barangays when municipality changes
  const fetchBarangays = async () => {
    if (selectedCityMunicipality) {
      const barangaysData = await getBarangays(selectedCityMunicipality)
      setBarangays(barangaysData)

      // If companyData has barangay code, set it
      if (companyData?.address?.barangay?.code) {
        const barangay = barangaysData.find(b => compare(b.brgyCode, companyData.address.barangay.code))
        if (barangay) {
          setSelectedBarangay(barangay.brgyCode)
        }
      } else {
        setSelectedBarangay('')
      }
    }
  }

  // Handle province loading when region changes
  useEffect(() => {
    if (selectedRegion && companyData?.address?.province?.code) {
      fetchProvinces()
    }
  }, [selectedRegion, companyData])

  // Handle city/municipality loading when province changes
  useEffect(() => {
    if (selectedProvince && companyData?.address?.municipality?.code) {
      fetchCityMunicipalities()
    }
  }, [selectedProvince, companyData])

  // Handle barangay loading when city/municipality changes
  useEffect(() => {
    if (selectedCityMunicipality && companyData?.address?.barangay?.code) {
      fetchBarangays()
    }
  }, [selectedCityMunicipality, companyData])

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


  // Show loading state
  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl p-2">
        <div className='space-y-4'>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Edit Company</h1>
              <div className="text-default-500 flex items-center">
                <p className='my-auto mr-1'>Loading company information</p>
                <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
              </div>
            </div>
          </div>

          {/* Company Logo Skeleton */}
          <CardList>
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
          </CardList>

          {/* Address Information Skeleton */}
          <CardList>
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
          </CardList>

          {/* Company Update Options Skeleton */}
          <CardList>
            <div>
              <Skeleton className="h-6 w-48 rounded-xl m-1 mx-auto" /> {/* Section Title */}
              <div className="flex justify-center gap-4 mt-4">
                <Skeleton className="h-12 w-full rounded-xl" /> {/* Discard Button */}
                <Skeleton className="h-12 w-full rounded-xl" /> {/* Save Button */}
              </div>
            </div>
          </CardList>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl p-2">
      <Form className="space-y-4 items-center w-full" onSubmit={handleSubmit}
        onInvalid={(error) => {
          setError("Please fill out all required fields.")
          setIsSaving(false)
        }}>
        <div className="space-y-4 w-full">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Edit Company</h1>
              <p className="text-default-500">Update your company information.</p>
            </div>
          </div>

          <CardList>
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
                    <BuildingOfficeIcon className="h-16 w-16 text-default-500" />
                  )}
                  <div className="text-center">
                    <p>Click to upload company logo</p>
                    <p className="text-default-500 text-xs">Max size: 2MB</p>
                  </div>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                  name="logoImage"
                />
              </div>

              <div className="space-y-4 mt-4">
                <Input
                  id="name"
                  name="name"
                  label="Company Name"
                  type="text"
                  classNames={inputStyle}
                  defaultValue={companyData?.name || ''}
                  isRequired
                />

                <Input
                  id="description"
                  name="description"
                  label="Company Description"
                  type="text"
                  classNames={inputStyle}
                  defaultValue={companyData?.description || ''}
                />
              </div>
            </div>
          </CardList>
          <CardList>
            <div>
              <h3 className="text-xl font-semibold mb-4 w-full text-center">Company Address</h3>
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
                    isDisabled={isLoading}
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
                    isDisabled={isLoading}
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
                    isDisabled={!selectedRegion || isLoading}
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
                    isDisabled={!selectedProvince || isLoading}
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
                    isDisabled={!selectedCityMunicipality || isLoading}
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
                    isDisabled={isLoading}
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
                    isDisabled={isLoading}
                  />
                  <Textarea
                    id="address.fullAddress"
                    name="address.fullAddress"
                    label="Full Address"
                    type="text"
                    maxRows={5}
                    minRows={1}
                    value={fullAddress}
                    classNames={inputStyle}
                    isReadOnly
                    isRequired
                    isDisabled={isLoading}
                  />
                </div>
              </div>
            </div>
          </CardList>


          {/* Update Options */}
          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Company Update Options</h2>

              <AnimatePresence>
                {error && (
                  <motion.div
                    {...motionTransition}>
                    <Alert color="danger" variant="solid" title="Error"
                      endContent={
                        <Button
                          aria-label="close error alert"
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
          </CardList>
        </div>
      </Form>

    </div>
  )
}