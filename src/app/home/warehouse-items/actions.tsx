"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Warehouse } from "../warehouses/actions";
import { InventoryItem } from "../inventory/actions";

export type WarehouseInventoryItem = {
  uuid: string;
  admin_uuid: string;
  warehouse_uuid: string;
  company_uuid: string;
  inventory_uuid: string;
  delivery_uuid: string;
  item_code: string;
  item_name: string;
  location: any;
  location_code: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  warehouse?: Warehouse;
  inventory_item?: InventoryItem
}


/**
 * Gets all warehouse inventory items with optional search
 */
export async function getWarehouseInventoryItems(
  companyUuid: string, 
  warehouseUuid?: string,
  search: string = ""
) {
  const supabase = await createClient();

  try {
    // Start building the query
    let query = supabase
      .from("warehouse_inventory_items")
      .select(`
        *,
        warehouse:warehouse_uuid(
          uuid,
          name,
          warehouse_layout
        ),
        inventory_item:inventory_uuid(
          uuid,
          item_code,
          item_name,
          description,
          quantity,
          unit,
          unit_value,
          bulk_quantity,
          bulk_unit,
          ending_inventory,
          bulk_ending_inventory,
          total_cost
        )
      `)
      .eq("company_uuid", companyUuid)
      .order("created_at", { ascending: false });

    // Apply warehouse filter if provided
    if (warehouseUuid) {
      query = query.eq("warehouse_uuid", warehouseUuid);
    }

    // Apply search filter if provided
    if (search) {
      query = query.or(
        `item_code.ilike.%${search}%,item_name.ilike.%${search}%,location_code.ilike.%${search}%`
      );
    }

    // Execute the query
    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data || []
    };
  } catch (error) {
    console.error("Error fetching warehouse inventory items:", error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Gets a specific warehouse inventory item by UUID
 */
export async function getWarehouseInventoryItem(uuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("warehouse_inventory_items")
      .select(`
        *,
        warehouse:warehouse_uuid(
          uuid,
          name,
          warehouse_layout
        ),
        inventory_item:inventory_uuid(
          uuid,
          item_code,
          item_name,
          description,
          quantity,
          unit,
          unit_value,
          bulk_quantity,
          bulk_unit,
          ending_inventory,
          bulk_ending_inventory,
          total_cost
        )
      `)
      .eq("uuid", uuid)
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error("Error fetching warehouse inventory item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Gets a warehouse inventory item by inventory_uuid
 */
export async function getWarehouseItemByInventory(inventoryUuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("warehouse_inventory_items")
      .select(`
        *,
        warehouse:warehouse_uuid(
          uuid,
          name,
          warehouse_layout
        ),
        inventory_item:inventory_uuid(
          uuid,
          item_code,
          item_name,
          description,
          quantity,
          unit,
          unit_value,
          bulk_quantity,
          bulk_unit,
          ending_inventory,
          bulk_ending_inventory,
          total_cost
        )
      `)
      .eq("inventory_uuid", inventoryUuid)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data && data.length > 0 ? data[0] : null
    };
  } catch (error) {
    console.error("Error fetching warehouse item by inventory:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Gets all warehouses for a company
 */
export async function getWarehouses(companyUuid: string) {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('company_uuid', companyUuid);
    
    if (error) throw error;
    
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    return { success: false, error: 'Failed to fetch warehouses', data: [] };
  }
}

/**
 * Updates a warehouse inventory item
 */
export async function updateWarehouseInventoryItem(uuid: string, updates: Partial<WarehouseInventoryItem>) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("warehouse_inventory_items")
      .update(updates)
      .eq("uuid", uuid)
      .select();

    if (error) {
      throw error;
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error("Error updating warehouse inventory item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Deletes a warehouse inventory item
 */
export async function deleteWarehouseInventoryItem(uuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("warehouse_inventory_items")
      .delete()
      .eq("uuid", uuid)
      .select();

    if (error) {
      throw error;
    }

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error("Error deleting warehouse inventory item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}