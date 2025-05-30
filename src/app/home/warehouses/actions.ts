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
  warehouse_layout?: FloorConfig[];

  created_at: string;
  updated_at: string;
}

/**
 * Creates a new warehouse
 */
export async function createWarehouse(data: 
  Pick<Warehouse, 'company_uuid' | 'name' | 'address' | 'warehouse_layout'>) {
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
export async function updateWarehouse(data:
  Pick<Warehouse, 'uuid' | 'company_uuid' | 'name' | 'address' | 'warehouse_layout'>) {
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
 * Saves warehouse layout data
 * @param warehouseUuid The warehouse's UUID
 * @param layout The layout data to save
 * @returns Object containing success status and error message if any
 */
export async function saveWarehouseLayout(warehouseUuid: string, layout: FloorConfig[]): Promise<{ success: boolean, error?: string }> {
  try {
    // Validate layout
    for (const floor of layout) {
      if (typeof floor.height !== "number" || floor.height <= 0) {
        return { success: false, error: "Invalid layout format: each floor must have a positive height" };
      }
      
      if (!Array.isArray(floor.matrix)) {
        return { success: false, error: "Invalid layout format: each floor must have a matrix" };
      }
      
      for (const row of floor.matrix) {
        if (!Array.isArray(row)) {
          return { success: false, error: "Invalid layout format: each row must be an array" };
        }
        
        for (const cell of row) {
          if (typeof cell !== "number" || cell < 0 || cell > 100) {
            return { success: false, error: "Invalid layout format: each cell must be a number between 0 and 100" };
          }
        }
      }
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("warehouses")
      .update({ warehouse_layout: layout })
      .eq("uuid", warehouseUuid);

    if (error) {
      return { success: false, error: error.message };
    }

    // Revalidate paths that might show warehouse data
    revalidatePath('/home/warehouses');
    revalidatePath('/home/inventory');
    
    return { success: true };
  } catch (error: any) {
    console.error("Error saving warehouse layout:", error);
    return { success: false, error: error.message };
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
  limit: number = 10,
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

/**
 * Fetches warehouse layout data
 * @param warehouseUuid The warehouse's UUID
 * @returns Object containing success status, layout data, and error message if any
 */
export async function getWarehouseLayout(warehouseUuid: string): Promise<{ success: boolean, data: FloorConfig[] | null, error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("warehouses")
      .select("warehouse_layout")
      .eq("uuid", warehouseUuid)
      .single();

    if (error) {
      return { success: false, data: null, error: error.message };
    }

    if (!data || !data.warehouse_layout) {
      // If no layout exists, return an empty layout
      return {
        success: true,
        data: [{
          height: 5,
          matrix: Array(10).fill(0).map(() => Array(10).fill(0))
        }]
      };
    }

    // Transform the warehouse_layout into the format expected by ShelfSelector3D
    const floorConfigs: FloorConfig[] = data.warehouse_layout;
    
    // Validate the transformed layout
    for (const floor of floorConfigs) {
      if (typeof floor.height !== "number" || floor.height <= 0) {
        return { success: false, data: null, error: "Invalid layout format: each floor must have a positive height" };
      }
      if (!Array.isArray(floor.matrix)) {
        return { success: false, data: null, error: "Invalid layout format: each floor must have a matrix" };
      }
      for (const row of floor.matrix) {
        if (!Array.isArray(row)) {
          return { success: false, data: null, error: "Invalid layout format: each row must be an array" };
        }
      }
    }

    return { success: true, data: floorConfigs };
  } catch (error: any) {
    console.error("Error fetching warehouse layout:", error);
    return { success: false, data: null, error: error.message };
  }
}
