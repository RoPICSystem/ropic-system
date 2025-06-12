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

/**
 * Gets all warehouses for the user's company
 */
export async function getWarehouses(companyUuid: string, selectFields: string = 'uuid, name, address') {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('warehouses')
      .select(selectFields)
      .eq('company_uuid', companyUuid);

    if (error) {
      return { error: error.message, success: false };
    }

    return { success: true, data: (data || []) as Partial<Warehouse>[] };
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false
    };
  }
}
