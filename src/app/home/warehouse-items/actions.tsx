"use server";

import { ShelfLocation } from "@/components/shelf-selector-3d";
import { createClient } from "@/utils/supabase/server";

export interface WarehouseInventoryItem {
  uuid: string;

  admin_uuid: string;
  warehouse_uuid: string;
  company_uuid: string;
  delivery_uuid: string;
  inventory_uuid: string;
  warehouse_inventory_item_bulks: {};

  description?: string;
  name: string;
  status: string;
  properties?: any; // JSONB type
  
  created_at?: string;
  updated_at?: string;
}

export interface WarehouseInventoryItemBulk {
  uuid: string;

  company_uuid: string;
  warehouse_uuid: string;
  inventory_uuid: string;
  warehouse_inventory_uuid: string;
  inventory_bulk_uuid: string;
  delivery_uuid: string;

  unit: string;
  unit_value: number;
  bulk_unit: string;
  cost: number;
  is_single_item: boolean;
  location: ShelfLocation; // JSONB type
  location_code: string;
  description?: string;
  properties?: any; // JSONB type
  status: string;

  created_at: string;
  updated_at: string;
}

export interface WarehouseInventoryItemUnit {
  uuid: string;

  company_uuid: string;
  warehouse_uuid: string;
  inventory_uuid: string;
  warehouse_inventory_uuid: string;
  warehouse_inventory_bulk_uuid?: string;
  inventory_unit_uuid: string;
  delivery_uuid: string;

  description?: string;
  code: string;
  unit_value: number;
  unit: string;
  name: string;
  cost: number;
  location: ShelfLocation | null;
  location_code: string | null;
  properties?: any; // JSONB type
  status: string;

  created_at: string;
  updated_at: string;
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
    let query = supabase
      .from("warehouse_inventory_items")
      .select("*")
      .eq("company_uuid", companyUuid);

    if (warehouseUuid) {
      query = query.eq("warehouse_uuid", warehouseUuid);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%`);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data || []
    };
  } catch (error: Error | any) {
    console.error("Error fetching warehouse inventory items:", error);
    return {
      success: false,
      data: [],
      error: `Failed to fetch warehouse inventory items: ${error.message || "Unknown error"}`,
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
      .select("*")
      .eq("uuid", uuid)
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data
    };
  } catch (error: Error | any) {
    console.error("Error fetching warehouse inventory item:", error);
    return {
      success: false,
      data: null,
      error: `Failed to fetch warehouse inventory item: ${error.message || "Unknown error"}`,
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
      .select("*")
      .eq("inventory_uuid", inventoryUuid)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - not an error for our purposes
        return {
          success: true,
          data: null
        };
      }
      throw error;
    }

    return {
      success: true,
      data: data
    };
  } catch (error: Error | any) {
    console.error("Error fetching warehouse inventory item by inventory UUID:", error);
    return {
      success: false,
      data: null,
      error: `Failed to fetch warehouse inventory item: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Gets warehouse inventory bulks for a warehouse inventory item
 */
export async function getWarehouseInventoryItemBulks(warehouseInventoryUuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("warehouse_inventory_item_bulk")
      .select("*")
      .eq("warehouse_inventory_uuid", warehouseInventoryUuid)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data || []
    };
  } catch (error: Error | any) {
    console.error("Error fetching warehouse inventory item bulks:", error);
    return {
      success: false,
      data: [],
      error: `Failed to fetch warehouse inventory item bulks: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Gets warehouse inventory units for a warehouse inventory bulk
 */
export async function getWarehouseInventoryItemUnits(warehouseInventoryBulkUuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("warehouse_inventory_item_unit")
      .select("*")
      .eq("warehouse_inventory_bulk_uuid", warehouseInventoryBulkUuid)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data || []
    };
  } catch (error: Error | any) {
    console.error("Error fetching warehouse inventory item units:", error);
    return {
      success: false,
      data: [],
      error: `Failed to fetch warehouse inventory item units: ${error.message || "Unknown error"}`,
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
      .from("warehouses")
      .select("*")
      .eq("company_uuid", companyUuid)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data || []
    };
  } catch (error: Error | any) {
    console.error("Error fetching warehouses:", error);
    return {
      success: false,
      data: [],
      error: `Failed to fetch warehouses: ${error.message || "Unknown error"}`,
    };
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
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      data
    };
  } catch (error: Error | any) {
    console.error("Error updating warehouse inventory item:", error);
    return {
      success: false,
      data: null,
      error: `Failed to update warehouse inventory item: ${error.message || "Unknown error"}`,
    };
  }
}