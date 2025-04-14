'use client';

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from "next-themes";
import { hslToRgb } from '@/utils/colors';

import {
  register,
  getRegions,
  getProvinces,
  getCityMunicipalities,
  getBarangays
} from './actions';
import {
  Card,
  Form,
  Input,
  Autocomplete,
  AutocompleteItem,
  Link,
  Checkbox,
  Button,
  Image,
  Alert,
  CardBody,
  DatePicker,
  Tab,
  Tabs,
  Accordion,
  AccordionItem,
  NumberInput,
  Divider
} from "@heroui/react";
import {
  EyeSlashIcon,
  EyeIcon,
  UserIcon,
} from '@heroicons/react/24/solid';
import CardList from '@/components/card-list';
import { AnimatePresence, motion } from 'framer-motion';


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


export default function RegisterPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const [isLoading, setIsLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [primaryValue, setPrimaryValue] = useState('')

  const [isVisiblePassword, setIsVisiblePassword] = useState(false);
  const [isVisibleConfirmPassword, setIsVisibleConfirmPassword] = useState(false);

  const toggleVisibilityPassword = () => setIsVisiblePassword(!isVisiblePassword);
  const toggleVisibilityConfirmPassword = () => setIsVisibleConfirmPassword(!isVisibleConfirmPassword);

  // Add state for address data
  const [regions, setRegions] = useState<Region[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [cityMunicipalities, setCityMunicipalities] = useState<CityMunicipality[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);

  // Company address state
  const [companyProvinces, setCompanyProvinces] = useState<Province[]>([]);
  const [companyCityMunicipalities, setCompanyCityMunicipalities] = useState<CityMunicipality[]>([]);
  const [companyBarangays, setCompanyBarangays] = useState<Barangay[]>([]);

  // Selected values state
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [selectedCityMunicipality, setSelectedCityMunicipality] = useState<string>('');
  const [selectedBarangay, setSelectedBarangay] = useState<string>('');
  const [inputStreetAddress, setInputStreetAddress] = useState<string>('');
  const [inputPostalCode, setInputPostalCode] = useState<number>();
  const [fullAddress, setFullAddress] = useState<string>('');

  const [selectedCompanyRegion, setSelectedCompanyRegion] = useState<string>('');
  const [selectedCompanyProvince, setSelectedCompanyProvince] = useState<string>('');
  const [selectedCompanyCityMunicipality, setSelectedCompanyCityMunicipality] = useState<string>('');
  const [selectedCompanyBarangay, setSelectedCompanyBarangay] = useState<string>('');
  const [inputCompanyStreetAddress, setInputCompanyStreetAddress] = useState<string>('');
  const [inputCompanyPostalCode, setInputCompanyPostalCode] = useState<number>();
  const [fullCompanyAddress, setFullCompanyAddress] = useState<string>('');

  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" }
  const autoCompleteStyle = { classNames: inputStyle }
  const router = useRouter();



  const generateFullAddress = (
    streetAddress: string,
    barangay: string,
    municipality: string,
    province: string,
    region: string,
    country: string = 'PHILIPPINES',
    postalCode?: string
  ) => {
    const addressParts = [
      streetAddress,
      barangay,
      municipality,
      province,
      region,
      country,
      postalCode
    ].filter(Boolean);
    return addressParts.join(', ');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)

    try {
      const formData = new FormData(event.currentTarget)
      await register(formData)
    } catch (error) {
      console.error('Registration error:', error)
    } finally {
      setIsLoading(false)
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

  const { theme } = useTheme()

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


  // Fetch regions on component mount
  useEffect(() => {
    async function fetchRegions() {
      const regionsData = await getRegions();
      setRegions(regionsData);
    }
    fetchRegions();
  }, []);

  // Fetch provinces when region changes
  useEffect(() => {
    async function fetchProvinces() {
      if (selectedRegion) {
        const provincesData = await getProvinces(selectedRegion);
        setProvinces(provincesData);
        setSelectedProvince('');
        setCityMunicipalities([]);
        setBarangays([]);
      }
    }
    fetchProvinces();
  }, [selectedRegion]);

  // Fetch cities/municipalities when province changes
  useEffect(() => {
    async function fetchCityMunicipalities() {
      if (selectedProvince) {
        const cityMunData = await getCityMunicipalities(selectedProvince);
        setCityMunicipalities(cityMunData);
        setSelectedCityMunicipality('');
        setBarangays([]);
      }
    }
    fetchCityMunicipalities();
  }, [selectedProvince]);

  // Fetch barangays when city/municipality changes
  useEffect(() => {
    async function fetchBarangays() {
      if (selectedCityMunicipality) {
        const barangaysData = await getBarangays(selectedCityMunicipality);
        setBarangays(barangaysData);
      }
    }
    fetchBarangays();
  }, [selectedCityMunicipality]);

  // Company address handlers - similar logic
  useEffect(() => {
    async function fetchCompanyProvinces() {
      if (selectedCompanyRegion) {
        const provincesData = await getProvinces(selectedCompanyRegion);
        setCompanyProvinces(provincesData);
        setSelectedCompanyProvince('');
        setCompanyCityMunicipalities([]);
        setCompanyBarangays([]);
      }
    }
    fetchCompanyProvinces();
  }, [selectedCompanyRegion]);

  useEffect(() => {
    async function fetchCompanyCityMunicipalities() {
      if (selectedCompanyProvince) {
        const cityMunData = await getCityMunicipalities(selectedCompanyProvince);
        setCompanyCityMunicipalities(cityMunData);
        setSelectedCompanyCityMunicipality('');
        setCompanyBarangays([]);
      }
    }
    fetchCompanyCityMunicipalities();
  }, [selectedCompanyProvince]);

  useEffect(() => {
    async function fetchCompanyBarangays() {
      if (selectedCompanyCityMunicipality) {
        const barangaysData = await getBarangays(selectedCompanyCityMunicipality);
        setCompanyBarangays(barangaysData);
      }
    }
    fetchCompanyBarangays();
  }, [selectedCompanyCityMunicipality]);

  // Handle address selection changes
  const handleRegionChange = (value: string) => {
    setSelectedRegion(value);
  };

  const handleProvinceChange = (value: string) => {
    setSelectedProvince(value);
  };

  const handleCityMunicipalityChange = (value: string) => {
    setSelectedCityMunicipality(value);
  };

  // Company address selection handlers
  const handleCompanyRegionChange = (value: string) => {
    setSelectedCompanyRegion(value);
  };

  const handleCompanyProvinceChange = (value: string) => {
    setSelectedCompanyProvince(value);
  };

  const handleCompanyCityMunicipalityChange = (value: string) => {
    setSelectedCompanyCityMunicipality(value);
  };

  // Update the full address when components change
  useEffect(() => {
    console.log(
      selectedRegion,
      selectedProvince,
      selectedCityMunicipality,
      selectedBarangay,
    )
    console.log(regions)
    if (selectedRegion && selectedProvince && selectedCityMunicipality &&
      selectedBarangay && inputStreetAddress && inputPostalCode) {

      const regionName = regions.find(r => `${r.regCode}` === selectedRegion)?.regDesc || '';
      const provinceName = provinces.find(p => `${p.provCode}` === selectedProvince)?.provDesc || '';
      const cityMunName = cityMunicipalities.find(c => `${c.citymunCode}` === selectedCityMunicipality)?.citymunDesc || '';
      const barangayName = barangays.find(b => `${b.brgyCode}` === selectedBarangay)?.brgyDesc || '';

      setFullAddress(
        generateFullAddress(
          inputStreetAddress,
          barangayName,
          cityMunName,
          provinceName,
          regionName,
          'PHILIPPINES',
          inputPostalCode?.toString()
        )
      );
    }
  }, [selectedRegion, selectedProvince, selectedCityMunicipality,
    selectedBarangay, inputStreetAddress, inputPostalCode,
    regions, provinces, cityMunicipalities]);

  // Similar logic for company address
  useEffect(() => {
    if (selectedCompanyRegion && selectedCompanyProvince && selectedCompanyCityMunicipality) {
      const regionName = regions.find(r => `${r.regCode}` === selectedCompanyRegion)?.regDesc || '';
      const provinceName = companyProvinces.find(p => `${p.provCode}` === selectedCompanyProvince)?.provDesc || '';
      const cityMunName = companyCityMunicipalities.find(c => `${c.citymunCode}` === selectedCompanyCityMunicipality)?.citymunDesc || '';
      const barangayName = companyBarangays.find(b => `${b.brgyCode}` === selectedCompanyBarangay)?.brgyDesc || '';

      setFullCompanyAddress(
        generateFullAddress(
          inputCompanyStreetAddress,
          barangayName,
          cityMunName,
          provinceName,
          regionName,
          'PHILIPPINES',
          inputCompanyPostalCode?.toString()
        )
      );
    }
  }, [selectedCompanyRegion, selectedCompanyProvince, selectedCompanyCityMunicipality,
    selectedCompanyBarangay, inputCompanyStreetAddress, inputCompanyPostalCode,
    regions, companyProvinces, companyCityMunicipalities]);


  return (

    <div className="h-full overflow-auto">
      <div className="w-auto h-full 2xl:absolute fixed inset-0 overflow-hidden md:min-h-[55rem] top-0 ">
        <div className="absolute w-full max-w-[30rem] top-[calc(50%-20rem)] left-[calc(50%+8rem)] hidden xl:block select-none">
          {/* Ground element - positioned at bottom */}
          <Image
            src={theme === 'dark' ? "/operator-boy-desk.png" : "/operator-girl-desk.png"}
            alt="Operator"
            className="w-auto h-full object-cover relative"
            style={{ objectPosition: 'top', minHeight: '40rem' }}
          />
        </div>
        <div
          className="absolute 2xl:bottom-0 2xl:h-[25rem] left-0 w-full md:bottom-0 md:h-[calc(max(100vh-50vh-12rem,18rem))]"
          style={{
            backgroundColor: primaryValue
          }}
        />
      </div>

      <div className="w-full z-20 xl:pr-[28rem] md:pb-12 pt-4">
        <div className="flex flex-col items-center justify-between relative">
          {/* Left side - Login form */}
          <div className="max-w-[200rem] flex md:flex-col flex-row space-x-4 items-center justify-center md:mb-[-6rem] mb-4">
            <Image src="/logo.png" alt="Logo" className="md:h-48 h-20" />
            <div className="grid grid-cols-1 select-none md:hidden">
              <span className="sm:text-4xl md:text-3xl text-2xl text-center font-semibold font-serif">
                REORDER POINT
              </span>
              <span className="sm:text-sm md:text-xs text-[0.6rem] text-center tracking-widest">
                INVENTORY MANAGEMENT SYSTEM
              </span>
            </div>
          </div>
          <Card
            isBlurred
            className="dark:bg-primary-100/70 h-full md:w-[45rem] w-full md:rounded-2xl rounded-none">
            <div className="pt-[5.5rem] border-b-2 border-default-400 pb-6 select-none hidden md:block">
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
                <h1 className="text-3xl font-bold text-center sm:pt-0 pt-2">Account Registration</h1>
                <p className="text-sm text-center text-foreground/80">Kindly fill out the form below to create an account.</p>
              </div>

              <Form
                // validationBehavior="aria"
                className="sm:space-y-4 space-y-2 mt-8"
                onSubmit={handleSubmit}>
                {/* Profile Image Section */}
                <div className="space-y-4 w-full">
                  <CardList
                    className='bg-background/80'
                  >
                    <div className="space-y-4 sm:p-6 p-4">
                      <h2 className="text-xl font-semibold text-center pb-2">Profile Image Information</h2>
                      <Button
                        variant='faded'
                        className={`flex border-default-200 hover:border-default-400 flex-col space-y-2 items-center justify-center p-2 cursor-pointer w-full h-full p-4
                          ${imagePreview ? 'bg-default-100 hover:bg-default-200' : 'bg-danger-50'}
                          `}
                        onPress={() => fileInputRef.current?.click()}>
                        <div className="relative w-48 h-48">
                          {imagePreview ? (
                            <Image isBlurred src={imagePreview} radius='full' alt="Profile preview" className="w-48 h-48 object-cover bg-default-200" />
                          ) : (
                            <div className="w-full h-full bg-default-300/70 rounded-full flex items-center justify-center">
                              <UserIcon className="h-24 w-24 text-default-500" />
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-center justify-center">
                          <p className="text-sm text-default-500">Click to upload a profile image</p>
                          <p className="text-sm text-default-500">Max size: 2MB</p>
                        </div>

                        <Input
                          isRequired
                          type="file"
                          name="profileImage"
                          className="hidden"
                          ref={fileInputRef}
                          accept="image/*"
                          errorMessage="Please select a valid image file."
                          onChange={handleImageChange}>
                        </Input>
                      </Button>
                      {!imagePreview &&
                        <div className="justify-start text-danger text-tiny">
                          Please select a valid image file.
                        </div>
                      }
                    </div>

                    {/* Basic Information */}
                    <div className="space-y-4 sm:p-6 p-4">
                      <h2 className="text-xl font-semibold text-center pb-2">Basic Information</h2>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <Input

                          id="firstName"
                          name="firstName"
                          label="First Name"
                          type="text"
                          classNames={inputStyle}
                          isRequired
                        />
                        <Input

                          id="middleName"
                          name="middleName"
                          label="Middle Name"
                          type="text"
                          classNames={inputStyle}
                        />
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <Input
                          id="lastName"
                          name="lastName"
                          label="Last Name"
                          type="text"
                          classNames={inputStyle}
                          isRequired
                        />
                        <Input
                          id="suffix"
                          name="suffix"
                          label="Suffix"
                          type="text"
                          classNames={inputStyle}
                        />
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <Autocomplete
                          id="gender"
                          name="gender"
                          label="Gender"
                          inputProps={autoCompleteStyle}
                          classNames={{ clearButton: "text-default-800" }}
                          isRequired
                        >
                          <AutocompleteItem key="male">Male</AutocompleteItem>
                          <AutocompleteItem key="female">Female</AutocompleteItem>
                          <AutocompleteItem key="other">Other</AutocompleteItem>
                          <AutocompleteItem key="prefer_not_to_say">Prefer not to say</AutocompleteItem>
                        </Autocomplete>
                        <DatePicker
                          id="birthday"
                          name="birthday"
                          label="Birthday"
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
                    <div className="space-y-4 sm:p-6 p-4">
                      <h2 className="text-xl font-semibold  text-center pb-2">Address Information</h2>

                      <Accordion
                        variant="bordered"
                        selectionMode='multiple'
                        defaultExpandedKeys={["userAddress", "companyAddress"]}
                        itemClasses={
                          {
                            base: "p-0 w-full",
                            title: "font-normal text-lg font-semibold",
                            trigger: "p-4 data-[hover=true]:bg-default-100 h-14 flex items-center transition-colors",
                            indicator: "text-medium",
                            content: "text-small p-4",
                          }
                        }
                        className="w-full p-0  overflow-hidden">
                        <AccordionItem key="userAddress" aria-label="User Address" title="User Address">
                          <div className="space-y-4 pb-2">
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
                                formatOptions={{ useGrouping: false }}
                                hideStepper
                                isRequired
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
                        </AccordionItem>
                        <AccordionItem key="companyAddress" aria-label="Company Address" title="Company Address">
                          <div className="space-y-4 pb-2">
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
                                isRequired
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
                                formatOptions={{ useGrouping: false }}
                                hideStepper
                                isRequired
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
                        </AccordionItem>
                      </Accordion>
                    </div>
                    <div className="space-y-4 p-0">
                      {/* Account Information */}
                      <h2 className="text-xl font-semibold text-center pt-6">Account Information</h2>
                      <div className="space-y-4 sm:px-6 px-4 py-2">

                        <Input

                          id="email"
                          name="email"
                          type="email"
                          label="Email"
                          autoComplete="email"
                          classNames={inputStyle}
                          isRequired
                        />
                        <Input

                          id="password"
                          name="password"
                          classNames={inputStyle}
                          endContent={
                            <Button
                              aria-label="toggle password visibility"
                              className="focus:outline-none my-[-0.1rem] mr-[-0.4rem]"
                              type="button"
                              variant='light'
                              radius='full'
                              isIconOnly
                              onPress={toggleVisibilityPassword}
                            >
                              {isVisiblePassword ? (
                                <EyeIcon className="h-5 w-5 text-foreground" />
                              ) : (
                                <EyeSlashIcon className="h-5 w-5 text-foreground" />
                              )}
                            </Button>
                          }
                          type={isVisiblePassword ? "text" : "password"}
                          label="Password"
                          autoComplete="new-password"
                          isRequired
                          minLength={8}
                        />
                        <Input

                          id="confirmPassword"
                          name="confirmPassword"
                          classNames={inputStyle}
                          endContent={
                            <Button
                              aria-label="toggle password visibility"
                              className="focus:outline-none my-[-0.1rem] mr-[-0.4rem]"
                              type="button"
                              variant='light'
                              radius='full'
                              isIconOnly
                              onPress={toggleVisibilityConfirmPassword}
                            >
                              {isVisibleConfirmPassword ? (
                                <EyeIcon className="h-5 w-5" />
                              ) : (
                                <EyeSlashIcon className="h-5 w-5" />
                              )}
                            </Button>
                          }
                          type={isVisibleConfirmPassword ? "text" : "password"}
                          label="Confirm Password"
                          autoComplete="new-password"
                          isRequired
                          minLength={8}
                        />

                        <div className="flex sm:flex-row flex-col sm:space-y-0 space-y-4 justify-between items-center w-full bg-default-100 border-default-200 hover:border-default-400 border-2 rounded-md p-4 rounded-xl">
                          <div className="justify-left w-full">
                            Account type</div>
                          <Checkbox
                            defaultSelected
                            className="hidden"
                            id="isAdmin"
                            name="isAdmin"
                            value={isAdmin ? "true" : "false"}
                            isRequired
                          >
                            Is Admin
                          </Checkbox>
                          <Tabs color="primary"
                            className="rounded-xl bg-default-300 shadow-lg shadow-default-200/50 my-1 flex justify-center sm:w-auto w-full"
                            variant="light"
                            selectedKey={isAdmin ? "admin" : "operator"}
                            onSelectionChange={(key) => { setIsAdmin(key === "admin") }}
                          >
                            <Tab key="admin"
                              className=""
                              title={

                                <div className="flex items-center text-foreground">
                                  <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12c5.16-1.26 9-6.45 9-12V5Zm0 3.9a3 3 0 1 1-3 3a3 3 0 0 1 3-3m0 7.9c2 0 6 1.09 6 3.08a7.2 7.2 0 0 1-12 0c0-1.99 4-3.08 6-3.08" />
                                  </svg>
                                  Admin
                                </div>
                              } />
                            <Tab key="operator" title={
                              <div className="flex items-center text-foreground">
                                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                                  <path fill="currentColor" d="M1.05 20v-1.8q0-.825.425-1.55t1.175-1.1q1.275-.65 2.875-1.1T9.05 14t3.525.45t2.875 1.1q.75.375 1.175 1.1t.425 1.55V20q0 .425-.288.713T16.05 21h-14q-.425 0-.712-.288T1.05 20m8-7q-1.65 0-2.825-1.175T5.05 9H4.8q-.225 0-.362-.137T4.3 8.5t.138-.363T4.8 8h.25q0-1.125.55-2.025T7.05 4.55v.95q0 .225.138.363T7.55 6t.363-.137t.137-.363V4.15q.225-.075.475-.112T9.05 4t.525.038t.475.112V5.5q0 .225.138.363T10.55 6t.363-.137t.137-.363v-.95q.9.525 1.45 1.425T13.05 8h.25q.225 0 .363.138t.137.362t-.137.363T13.3 9h-.25q0 1.65-1.175 2.825T9.05 13m0-2q.825 0 1.413-.587T11.05 9h-4q0 .825.588 1.413T9.05 11m7.425 3.6l-.075-.35q-.15-.05-.287-.112t-.263-.188l-.3.1q-.175.05-.337 0t-.263-.225l-.1-.175q-.1-.15-.062-.325t.162-.3l.25-.225v-.6l-.25-.225q-.125-.125-.162-.3t.062-.325l.1-.175q.1-.175.263-.225t.337 0l.3.1q.1-.1.25-.175t.3-.125l.075-.35q.05-.175.175-.288t.3-.112h.2q.175 0 .3.113t.175.287l.075.35q.15.05.3.125t.25.175l.3-.1q.175-.05.338 0t.262.225l.1.175q.1.15.063.325t-.163.3l-.25.225v.6l.25.225q.125.125.163.3t-.063.325l-.1.175q-.1.175-.262.225t-.338 0l-.3-.1q-.125.125-.262.188t-.288.112l-.075.35q-.05.175-.175.288t-.3.112h-.2q-.175 0-.3-.112t-.175-.288m.575-1.35q.3 0 .525-.225t.225-.525t-.225-.525t-.525-.225t-.525.225t-.225.525t.225.525t.525.225m1.7-3.8l-.1-.5q-.225-.075-.413-.187T17.9 8.5l-.525.175q-.225.075-.45-.012t-.35-.288l-.15-.25q-.125-.2-.088-.437t.238-.413L17 6.9q-.05-.125-.05-.2v-.4q0-.075.05-.2l-.425-.375q-.2-.175-.238-.413t.088-.437l.15-.25q.125-.2.35-.288t.45-.012l.525.175q.15-.15.338-.262t.412-.188l.1-.5q.05-.25.238-.4t.437-.15h.25q.25 0 .438.15t.237.4l.1.5q.225.075.413.188t.337.262l.525-.175q.225-.075.45.013t.35.287l.15.25q.125.2.088.438t-.238.412L22.1 6.1q.05.125.05.2v.4q0 .075-.05.2l.425.375q.2.175.238.413t-.088.437l-.15.25q-.125.2-.35.288t-.45.012L21.2 8.5q-.15.15-.337.262t-.413.188l-.1.5q-.05.25-.238.4t-.437.15h-.25q-.25 0-.437-.15t-.238-.4m.8-1.7q.525 0 .888-.362T20.8 6.5t-.363-.888t-.887-.362t-.888.363t-.362.887t.363.888t.887.362" />
                                </svg>
                                Operator
                              </div>
                            } />
                          </Tabs>
                        </div>
                      </div>


                      <div className="flex flex-col items-center justify-center w-full space-y-4 border-t-2 border-default-200 sm:p-6 p-4">
                        <AnimatePresence>
                          {error && !isLoading && (
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
                              title={`Error`} 
                              onClose={() => {router.replace('/account/register')}}
                              description={error} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <div className="flex flex-row items-center justify-center w-full space-x-4">

                          <Button
                            as={Link}
                            variant="shadow"
                            className="w-full"
                            href='/account/login'
                          >
                            Log-in
                          </Button>
                          <Button
                            type="submit"
                            variant="shadow"
                            color="primary"
                            className="w-full"
                            disabled={isLoading}
                            isLoading={isLoading}
                          >
                            Create account
                          </Button>
                        </div>
                      </div>

                    </div>
                  </CardList>
                </div>
              </Form>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}       