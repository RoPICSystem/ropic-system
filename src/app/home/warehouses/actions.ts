'use server'

import { FloorConfig } from '@/components/shelf-selector-3d';
import { createClient } from '@/utils/supabase/server'
import { Address } from '@/utils/supabase/server/address';
import { getUserCompany } from '@/utils/supabase/server/user'
import { revalidatePath } from 'next/cache';

export type Warehouse = {
  uuid: string;

  company_uuid: string;
  name: string;
  address: Address;
  layout?: FloorConfig[];

  created_at: string;
  updated_at: string;
}


/**
 * Creates a new warehouse
 */
export async function createWarehouse(data:
  Pick<Warehouse, 'company_uuid' | 'name' | 'address' | 'layout'>) {
  const supabase = await createClient();


  try {
    const { data: createdWarehouse, error } = await supabase
      .from('warehouses')
      .insert(data)
      .select('*')
      .single();

    if (error) {
      return { error: error.message, data: null };
    }

    return { error: null, data: createdWarehouse };
  } catch (error) {
    console.error('Error creating warehouse:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      data: null
    };
  }
}

/**
 * Updates an existing warehouse
 */
export async function updateWarehouse(
  uuid: string,
  data: Pick<Warehouse, 'name' | 'address' | 'layout'>) {
  const supabase = await createClient();

  try {
    const { data: updatedWarehouse, error } = await supabase
      .from('warehouses')
      .update(data)
      .eq('uuid', uuid)
      .select('*')
      .single();

    if (error) {
      return { error: error.message, data: null };
    }

    return { error: null, data: updatedWarehouse };
  } catch (error) {
    console.error('Error updating warehouse:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      data: null
    };
  }
}


/**
 * Deletes a warehouse
 */
export async function deleteWarehouse(uuid: string) {
  const supabase = await createClient();

  try {
    // Get the user's auth ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Not authenticated', success: false };
    }

    const { error } = await supabase
      .from('warehouses')
      .delete()
      .eq('uuid', uuid);

    if (error) {
      return { error: error.message, success: false };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting warehouse:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false
    };
  }
}


/**
 * Gets warehouses with advanced filtering capabilities through RPC
 */
export async function getWarehouses(
  company_uuid?: string,
  search?: string | null,
  year?: number | null,
  month?: number | null,
  week?: number | null,
  day?: number | null,
  limit: number = 15,
  offset: number = 0,
) {
  const supabase = await createClient();

  try {

    const currentPage = Math.floor(offset / limit) + 1;

    const { data, error } = await supabase.rpc('get_warehouses_filtered', {
      p_company_uuid: company_uuid,
      p_search: search || '',
      p_year: year || null,
      p_month: month || null,
      p_week: week || null,
      p_day: day || null,
      p_limit: limit,
      p_offset: offset
    });

    if (error) {
      return {
        success: false,
        data: [],
        totalCount: 0,
        hasMore: false,
        currentPage: currentPage,
        totalPages: 0,
        error: error.message
      };
    }

    // Define the type for the warehouse with total_count
    type WarehouseWithTotalCount = Warehouse & { total_count: number };

    // Extract total count from the first row
    const totalCount = data && data.length > 0 ? data[0].total_count : 0;

    // Calculate total pages and has more
    const totalPages = Math.ceil(totalCount / limit);
    const hasMore = currentPage < totalPages;

    // Remove total_count from the warehouse objects
    const warehouses = data?.map(({ total_count, ...warehouse }: WarehouseWithTotalCount) => warehouse) || [];

    return {
      success: true,
      data: warehouses,
      totalCount,
      hasMore,
      currentPage,
      totalPages,
      error: undefined
    };
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return {
      success: false,
      data: [],
      totalCount: 0,
      hasMore: false,
      currentPage: 1,
      totalPages: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Gets a warehouse by UUID
 */
export async function getWarehouseByUuid(uuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('uuid', uuid)
      .single();

    if (error) {
      return { error: error.message, data: null, success: false };
    }

    return { data, success: true };
  } catch (error) {
    console.error('Error fetching warehouse:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      data: null,
      success: false
    };
  }
}