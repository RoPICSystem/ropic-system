'use server'

import { createClient } from '@/utils/supabase/server'
import { getUserCompany } from '@/utils/supabase/server/user'

interface WarehouseAddress {
  country: { code: string, desc: string };
  region: { code: string, desc: string };
  province: { code: string, desc: string };
  municipality: { code: string, desc: string };
  barangay: { code: string, desc: string };
  street: string;
  postalCode: string;
  fullAddress: string;
}

interface WarehouseData {
  uuid?: string;
  company_uuid: string;
  name: string;
  address: WarehouseAddress;
  created_at?: string;
  updated_at?: string;
}

/**
 * Creates a new warehouse
 */
export async function createWarehouse(data: WarehouseData) {
  const supabase = await createClient();

  try {
    // Get the user's auth ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Not authenticated', data: null };
    }

    const { data: createdWarehouse, error } = await supabase
      .from('warehouses')
      .insert({
        company_uuid: data.company_uuid,
        name: data.name,
        address: data.address
      })
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
export async function updateWarehouse(data: WarehouseData) {
  const supabase = await createClient();

  try {
    // Get the user's auth ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'Not authenticated', data: null };
    }

    const { data: updatedWarehouse, error } = await supabase
      .from('warehouses')
      .update({
        name: data.name,
        address: data.address,
        updated_at: new Date().toISOString()
      })
      .eq('uuid', data.uuid)
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
 * Gets all warehouses for the user's company
 */
export async function getWarehouses(search: string = "") {
  const supabase = await createClient();

  try {
    // Get the user's company
    const { data: company, error: companyError } = await getUserCompany();
    if (companyError || !company) {
      return { 
        error: companyError || 'Company not found', 
        data: [], 
        success: false 
      };
    }

    let query = supabase
      .from('warehouses')
      .select('*')
      .eq('company_uuid', company.uuid)
      .order('name');

    if (search) {
      query = query.or(`name.ilike.%${search}%,address->fullAddress.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      return { error: error.message, data: [], success: false };
    }

    return { data: data || [], success: true };
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return { 
      error: error instanceof Error ? error.message : 'Unknown error occurred', 
      data: [], 
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
 * Gets warehouses with pagination, search, and company filtering
 */
export async function getWarehousesPage(options: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const supabase = await createClient();
  const page = options.page || 1;
  const pageSize = options.pageSize || 10;
  const search = options.search || "";

  try {
    // Get the user's company
    const { data: company, error: companyError } = await getUserCompany();
    if (companyError || !company) {
      return { 
        error: companyError || 'Company not found', 
        data: [], 
        totalCount: 0, 
        success: false 
      };
    }

    // Calculate pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Build query
    let query = supabase
      .from('warehouses')
      .select('*', { count: 'exact' })
      .eq('company_uuid', company.uuid)
      .order('name')
      .range(from, to);

    // Add search if provided
    if (search) {
      query = query.or(`name.ilike.%${search}%`);
    }

    // Execute the query
    const { data, error, count } = await query;

    if (error) {
      return { 
        error: error.message, 
        data: [], 
        totalCount: 0, 
        success: false 
      };
    }

    return { 
      data: data || [], 
      totalCount: count || 0, 
      success: true 
    };
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return { 
      error: error instanceof Error ? error.message : 'Unknown error occurred', 
      data: [], 
      totalCount: 0, 
      success: false 
    };
  }
}