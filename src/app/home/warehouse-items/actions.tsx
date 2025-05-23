"use server";

import { ShelfLocation } from "@/components/shelf-selector-3d";
import { createClient } from "@/utils/supabase/server";
import { console } from "inspector";
import { revalidatePath } from "next/cache";

type StatusHistory = Record<string, string>; // Example: { "available": "2025-05-22T10:00:00.000Z", "used": "2025-05-23T14:30:00.000Z" }

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
  unit: string;
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


export async function markWarehouseBulkAsUsed(
  uuid: string
): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient();
  const newStatus = 'USED';
  const timestamp = new Date().toISOString();

  try {
    // 1. Find all bulks associated with the main warehouse_inventory_item
    const { data: bulksToUpdate, error: fetchBulksError } = await supabase
      .from('warehouse_inventory_item_bulk')
      .select('uuid, status_history') // Select status_history to update it
      .eq('uuid', uuid);

    if (fetchBulksError) {
      console.error('Error fetching warehouse item bulks:', fetchBulksError);
      return { success: false, message: `Failed to fetch item bulks: ${fetchBulksError.message}` };
    }

    if (!bulksToUpdate || bulksToUpdate.length === 0) {
      return { success: true, message: 'No associated bulks found to mark as used.' };
    }

    const updatedBulkUuids: string[] = [];

    // 2. Update each bulk's status and status_history
    for (const bulk of bulksToUpdate) {
      const currentBulkStatusHistory: StatusHistory =
        bulk.status_history && typeof bulk.status_history === 'object' && !Array.isArray(bulk.status_history)
          ? (bulk.status_history as StatusHistory)
          : {};

      const updatedBulkStatusHistory: StatusHistory = {
        ...currentBulkStatusHistory,
        [timestamp]: newStatus,
      };

      const { error: updateBulkError } = await supabase
        .from('warehouse_inventory_item_bulk')
        .update({
          status: newStatus,
          status_history: updatedBulkStatusHistory,
          updated_at: timestamp,
        })
        .eq('uuid', bulk.uuid);

      if (updateBulkError) {
        console.error(`Error updating bulk ${bulk.uuid}:`, updateBulkError);
        // Consider how to handle partial failures. For now, returning on first error.
        return { success: false, message: `Failed to update bulk ${bulk.uuid}: ${updateBulkError.message}` };
      }
      updatedBulkUuids.push(bulk.uuid);
    }

    // 3. Find and update all units associated with these bulks
    if (updatedBulkUuids.length > 0) {
      const { data: unitsToUpdate, error: fetchUnitsError } = await supabase
        .from('warehouse_inventory_item_unit')
        .select('uuid, status_history') // Select status_history to update it
        .in('warehouse_inventory_bulk_uuid', updatedBulkUuids);

      if (fetchUnitsError) {
        console.error('Error fetching warehouse item units:', fetchUnitsError);
        return { success: false, message: `Failed to fetch item units: ${fetchUnitsError.message}` };
      }

      if (unitsToUpdate && unitsToUpdate.length > 0) {
        for (const unit of unitsToUpdate) {
          const currentUnitStatusHistory: StatusHistory =
            unit.status_history && typeof unit.status_history === 'object' && !Array.isArray(unit.status_history)
              ? (unit.status_history as StatusHistory)
              : {};

          const updatedUnitStatusHistory: StatusHistory = {
            ...currentUnitStatusHistory,
            [timestamp]: newStatus,
          };

          const { error: updateUnitError } = await supabase
            .from('warehouse_inventory_item_unit')
            .update({
              status: newStatus,
              status_history: updatedUnitStatusHistory,
              updated_at: timestamp,
            })
            .eq('uuid', unit.uuid);

          if (updateUnitError) {
            console.error(`Error updating unit ${unit.uuid}:`, updateUnitError);
            // Consider how to handle partial failures. For now, returning on first error.
            return { success: false, message: `Failed to update unit ${unit.uuid}: ${updateUnitError.message}` };
          }
        }
      }
    }

    // 4. Revalidate relevant paths
    revalidatePath('/home/warehouse-items');

    return { success: true, message: 'Associated item bulks and units marked as used successfully.' };
  } catch (error: any) {
    console.error('Unexpected error marking item components as used:', error);
    return { success: false, message: error.message || 'An unexpected error occurred.' };
  }
}
