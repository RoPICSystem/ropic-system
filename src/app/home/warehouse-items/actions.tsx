'use server';

import { createClient } from '@/utils/supabase/server';

export type StatusHistory = Record<string, string>; 

export interface WarehouseInventoryItem {
  uuid: string;
  company_uuid: string;
  admin_uuid: string;
  warehouse_uuid: string;
  inventory_uuid: string;
  group_id: string | null;
  item_code: string;
  unit: string;
  unit_value: string;
  packaging_unit: string;
  cost: number;
  properties: Record<string, any>;
  location: Record<string, any>;
  status: 'AVAILABLE' | 'USED' | 'TRANSFERRED';
  status_history: StatusHistory;
  created_at: string;
  updated_at: string;
}

export interface WarehouseInventory {
  uuid: string;
  company_uuid: string;
  admin_uuid: string;
  warehouse_uuid: string;
  inventory_uuid: string;
  name: string;
  description?: string;
  measurement_unit: string;
  standard_unit: string;
  unit_values: {
    available: number;
    used: number;
    transferred: number;
    total: number;
  };
  count: {
    available: number;
    used: number;
    transferred: number;
    total: number;
  };
  properties: Record<string, any>;
  status: 'AVAILABLE' | 'WARNING' | 'CRITICAL' | 'USED';
  status_history: StatusHistory;
  created_at: string;
  updated_at: string;
}


/**
 * Fetches inventory items for a specific company.
 * 
 * @param companyUuid - The UUID of the company to fetch inventory items for.
 * @param getAvailableItems - Whether to filter for available items only. Defaults to true.
 * @param selectFields - Comma-separated list of fields to select from the inventory table. Defaults to "uuid, name, standard_unit, unit_values, count, status".
 * @returns An object containing success status and either the data or an error message.
 *  
 */
export async function getWarehouseInventoryItems(companyUuid: string, getAvailableItems: boolean = true, selectFields: string = "uuid, name, standard_unit, unit_values, count, status") {
  const supabase = await createClient();

  try {
    let query = supabase
      .from("warehouse_inventory")
      .select(selectFields)
      .eq("company_uuid", companyUuid);

    if (getAvailableItems) {
      query = query.eq("status", "AVAILABLE");
    }

    const { data, error } = await query;

    if (error) throw error;

    return {
      success: true,
      data: (data || []) as Partial<WarehouseInventory>[]
    };
  }
  catch (error: any) {
    return {
      success: false,
      error: error.message || "Unknown error occurred"
    };
  }
}

// Get warehouse inventory item details
export async function getWarehouseInventoryItem(uuid: string) {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase.rpc('get_warehouse_inventory_details', {
      p_warehouse_inventory_uuid: uuid
    });

    if (error) {
      console.error('Error fetching warehouse inventory details:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: data?.[0] || null };
  } catch (error) {
    console.error('Error in getWarehouseInventoryItem:', error);
    return { success: false, error: 'Failed to fetch warehouse inventory details' };
  }
}

// Get warehouse inventory by original inventory UUID
export async function getWarehouseItemByInventory(inventoryUuid: string) {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('warehouse_inventory')
      .select(`
        *,
        warehouse_inventory_items(*)
      `)
      .eq('inventory_uuid', inventoryUuid)
      .single();

    if (error) {
      console.error('Error fetching warehouse inventory by inventory UUID:', error);
      return { success: false, error: error.message };
    }

    // Transform the data to match expected format
    const transformedData = {
      ...data,
      items: data.warehouse_inventory_items || []
    };

    return { success: true, data: transformedData };
  } catch (error) {
    console.error('Error in getWarehouseItemByInventory:', error);
    return { success: false, error: 'Failed to fetch warehouse inventory by inventory UUID' };
  }
}

// Mark warehouse inventory item as used
export async function markWarehouseItemAsUsed(itemUuid: string) {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase.rpc('mark_warehouse_item_as_used', {
      p_item_uuid: itemUuid
    });

    if (error) {
      console.error('Error marking warehouse item as used:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in markWarehouseItemAsUsed:', error);
    return { success: false, error: 'Failed to mark warehouse item as used' };
  }
}

// Mark warehouse inventory group as used
export async function markWarehouseGroupAsUsed(groupId: string) {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase.rpc('mark_warehouse_group_as_used', {
      p_group_id: groupId
    });

    if (error) {
      console.error('Error marking warehouse group as used:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in markWarehouseGroupAsUsed:', error);
    return { success: false, error: 'Failed to mark warehouse group as used' };
  }
}

// Mark specific number of warehouse inventory items as used
export async function markWarehouseItemsBulkUsed(warehouseInventoryUuid: string, count: number) {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase.rpc('mark_warehouse_items_bulk_used', {
      p_warehouse_inventory_uuid: warehouseInventoryUuid,
      p_count: count
    });

    if (error) {
      console.error('Error marking warehouse items bulk as used:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in markWarehouseItemsBulkUsed:', error);
    return { success: false, error: 'Failed to mark warehouse items bulk as used' };
  }
}

// Mark specific number of warehouse group items as used
export async function markWarehouseGroupBulkUsed(groupId: string, count: number) {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase.rpc('mark_warehouse_group_bulk_used', {
      p_group_id: groupId,
      p_count: count
    });

    if (error) {
      console.error('Error marking warehouse group bulk as used:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in markWarehouseGroupBulkUsed:', error);
    return { success: false, error: 'Failed to mark warehouse group bulk as used' };
  }
}


// Delete warehouse inventory item
export async function deleteWarehouseInventoryItem(uuid: string) {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('warehouse_inventory_items')
      .delete()
      .eq('uuid', uuid);

    if (error) {
      console.error('Error deleting warehouse inventory item:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in deleteWarehouseInventoryItem:', error);
    return { success: false, error: 'Failed to delete warehouse inventory item' };
  }
}

// Create warehouse inventory item
export async function createWarehouseInventoryItem(data: any) {
  try {
    const supabase = await createClient();

    const { data: result, error } = await supabase
      .from('warehouse_inventory_items')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating warehouse inventory item:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: result };
  } catch (error) {
    console.error('Error in createWarehouseInventoryItem:', error);
    return { success: false, error: 'Failed to create warehouse inventory item' };
  }
}

// Update warehouse inventory item
export async function updateWarehouseInventoryItem(uuid: string, data: any) {
  try {
    const supabase = await createClient();

    const { data: result, error } = await supabase
      .from('warehouse_inventory_items')
      .update(data)
      .eq('uuid', uuid)
      .select()
      .single();

    if (error) {
      console.error('Error updating warehouse inventory item:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: result };
  } catch (error) {
    console.error('Error in updateWarehouseInventoryItem:', error);
    return { success: false, error: 'Failed to update warehouse inventory item' };
  }
}

