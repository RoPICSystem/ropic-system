"use server"

import { createClient } from '@/utils/supabase/server'


// Define address types (inside the Supabase Database for the address table)
export type Country = {
  countryCode: string
  countryDesc: string
}

export type Region = {
  reg_code: string
  reg_desc: string
}

export type Province = {
  reg_code: string
  prov_code: string
  prov_desc: string
}

export type CityMunicipality = {
  reg_code: string
  prov_code: string
  citymun_code: string
  citymun_desc: string
}

export type Barangay = {
  reg_code: string
  prov_code: string
  citymun_code: string
  brgy_code: string
  brgy_desc: string
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
  reg_code?: string
  prov_code?: string
  citymun_code?: string
}): Promise<AddressDropdownData> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_address_dropdown_data', {
    target_reg_code: options?.reg_code || null,
    target_prov_code: options?.prov_code || null,
    target_citymun_code: options?.citymun_code || null
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

export async function getProvinces(reg_code: string) {
  const data = await getAddressDropdownData({ reg_code })
  return data.provinces
}

export async function getCityMunicipalities(prov_code: string) {
  const data = await getAddressDropdownData({ prov_code })
  return data.cities
}

export async function getBarangays(citymun_code: string) {
  const data = await getAddressDropdownData({ citymun_code })
  return data.barangays
}