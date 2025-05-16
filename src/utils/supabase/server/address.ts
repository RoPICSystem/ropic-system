"use server"

import { createClient } from '@/utils/supabase/server'


// Define address types (inside the Supabase Database for the address table)
export type Region = {
  regCode: string
  regDesc: string
}

export type Province = {
  provCode: string
  provDesc: string
}

export type CityMunicipality = {
  citymunCode: string
  citymunDesc: string
}

export type Barangay = {
  brgyCode: string
  brgyDesc: string
}

export type Country = {
  countryCode: string
  countryDesc: string
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

export async function getRegions() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('address_region')
    .select('regCode, regDesc')
    .order('regDesc')

  if (error) {
    console.error('Error fetching regions:', error)
    return []
  }

  return data
}

export async function getProvinces(regCode: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('address_province')
    .select('provCode, provDesc')
    .eq('regCode', regCode)
    .order('provDesc')

  if (error) {
    console.error('Error fetching provinces:', error)
    return []
  }

  return data
}

export async function getCityMunicipalities(provCode: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('address_citymun')
    .select('citymunCode, citymunDesc')
    .eq('provCode', provCode)
    .order('citymunDesc')

  if (error) {
    console.error('Error fetching cities/municipalities:', error)
    return []
  }

  return data
}

export async function getBarangays(citymunCode: string) {
  const supabase = await createClient()

  const { data: rawData, error } = await supabase
    .from('address_brgy')
    .select('brgyCode, brgyDesc')
    .eq('citymunCode', citymunCode)
    .order('brgyDesc')

  // Transform brgyDesc to uppercase
  const data = rawData?.map((item: Barangay) => ({
    ...item,
    brgyDesc: item.brgyDesc.toUpperCase()
  })) || []

  if (error) {
    console.error('Error fetching barangays:', error)
    return []
  }

  return data
}