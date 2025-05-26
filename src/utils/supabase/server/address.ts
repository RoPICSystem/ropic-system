"use server"

import { createClient } from '@/utils/supabase/server'


// Define address types (inside the Supabase Database for the address table)
export type Country = {
  countryCode: string
  countryDesc: string
}

export type Region = {
  regCode: string
  regDesc: string
}

export type Province = {
  regCode: string
  provCode: string
  provDesc: string
}

export type CityMunicipality = {
  regCode: string
  provCode: string
  citymunCode: string
  citymunDesc: string
}

export type Barangay = {
  regCode: string
  provCode: string
  citymunCode: string
  brgyCode: string
  brgyDesc: string
}

// New type for RPC response
export type AddressDropdownData = {
  regions: Region[]
  provinces: Province[]
  cities: CityMunicipality[]
  barangays: Barangay[]
}


// Define address types
export type AddressType = {
  code: string
  desc: string
}

export type Address = {
  region: AddressType
  country: AddressType
  barangay: AddressType
  province: AddressType
  postalCode: string
  fullAddress: string
  street: string
  municipality: AddressType
}

// New efficient RPC function
export async function getAddressDropdownData(options?: {
  regCode?: string
  provCode?: string
  citymunCode?: string
}): Promise<AddressDropdownData> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_address_dropdown_data', {
    target_reg_code: options?.regCode || null,
    target_prov_code: options?.provCode || null,
    target_citymun_code: options?.citymunCode || null
  })

  if (error) {
    console.error('Error fetching address dropdown data:', error)
    return { regions: [], provinces: [], cities: [], barangays: [] }
  }

  return {
    regions: data?.regions || [],
    provinces: data?.provinces || [],
    cities: data?.cities || [],
    barangays: data?.barangays || []
  }
}

// Keep existing functions for backward compatibility but optimize them
export async function getRegions() {
  const data = await getAddressDropdownData()
  return data.regions
}

export async function getProvinces(regCode: string) {
  const data = await getAddressDropdownData({ regCode })
  return data.provinces
}

export async function getCityMunicipalities(provCode: string) {
  const data = await getAddressDropdownData({ provCode })
  return data.cities
}

export async function getBarangays(citymunCode: string) {
  const data = await getAddressDropdownData({ citymunCode })
  return data.barangays
}