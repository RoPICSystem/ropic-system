"use server";

import { ShelfLocation } from "@/components/shelf-selector-3d";
import { createClient } from "@/utils/supabase/server";
import { console } from "inspector";
import { revalidatePath } from "next/cache";

export type StatusHistory = Record<string, string>; // Example: { "available": "2025-05-22T10:00:00.000Z", "used": "2025-05-23T14:30:00.000Z" }

export interface WarehouseInventoryItem {
  uuid: string;

  admin_uuid: string;
  warehouse_uuid: string;
  company_uuid: string;
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


// inherit the WarehouseInventoryItem interface
export interface WarehouseInventoryItemWithBulkComplete extends WarehouseInventoryItemBulk {
  units: WarehouseInventoryItemUnit[];
}

export interface WarehouseInventoryItemComplete extends WarehouseInventoryItem {
  bulks: WarehouseInventoryItemWithBulkComplete[];
}

/**
 * Gets warehouse inventory items with advanced filtering capabilities
 */
export async function getWarehouseInventoryItems(
  companyUuid?: string,
  warehouseUuid?: string,
  search: string = "",
  status?: string | null,
  year?: number | null,
  month?: number | null,
  week?: number | null,
  day?: number | null,
  limit: number = 10,
  offset: number = 0
) {
  const supabase = await createClient();

  try {
    const currentPage = Math.floor(offset / limit) + 1;

    const { data, error } = await supabase.rpc('get_warehouse_inventory_items', {
      p_company_uuid: companyUuid || null,
      p_warehouse_uuid: warehouseUuid || null,
      p_search: search || '',
      p_status: status || null,
      p_year: year || null,
      p_month: month || null,
      p_week: week || null,
      p_day: day || null,
      p_limit: limit,
      p_offset: offset
    });

    if (error) {
      throw error;
    }


    // Extract total count from the first row (all rows have the same total_count)
    const totalCount = data && data.length > 0 ? data[0].total_count : 0;

    // Calculate total pages and has more
    const totalPages = Math.ceil(totalCount / limit);
    const hasMore = currentPage < totalPages;

    // Remove total_count from each item and return clean data
    const items = data ? data.map(({ total_count, ...item }: { total_count: number;[key: string]: any }) => item) : [];

    return {
      success: true,
      data: items,
      totalCount: Number(totalCount),
      hasMore,
      currentPage,
      totalPages
    };
  } catch (error: Error | any) {
    console.error("Error fetching warehouse inventory items:", error);
    return {
      success: false,
      data: [],
      totalCount: 0,
      hasMore: false,
      currentPage: 1,
      totalPages: 0,
      error: `Failed to fetch warehouse inventory items: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Gets a specific warehouse inventory item with its bulks and units by UUID
 */
export async function getWarehouseInventoryItem(uuid: string) {
  const supabase = await createClient();

  try {
    // First try using the RPC function for efficient data retrieval
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_warehouse_inventory_item_complete', { p_uuid: uuid });

    // If RPC function is available and works, use its result
    if (!rpcError && rpcData) {
      // Process the structured data from RPC
      return {
        success: true,
        data: {
          ...rpcData.item,
          bulks: rpcData.bulks.map((bulk: { bulk_data: any; units: any; }) => ({
            ...bulk.bulk_data,
            units: bulk.units || []
          }))
        }
      };
    }

    throw new Error(rpcError?.message || "RPC function not available or failed");

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
 * Gets a warehouse inventory item by inventory_uuid with its bulks and units
 */
export async function getWarehouseItemByInventory(inventoryUuid: string) {
  const supabase = await createClient();

  try {
    // First try using the RPC function
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_warehouse_item_by_inventory_complete', { p_inventory_uuid: inventoryUuid });

    // If RPC function is available and works, use its result
    if (!rpcError && rpcData) {
      // Process the structured data from RPC
      return {
        success: true,
        data: rpcData ? {
          ...rpcData.item,
          bulks: rpcData.bulks.map((bulk: { bulk_data: any; units: any; }) => ({
            ...bulk.bulk_data,
            units: bulk.units || []
          }))
        } : null
      };
    }
    throw new Error(rpcError?.message || "RPC function not available or failed");

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
    // 1. Find the warehouse inventory item and all its bulks
    const { data: bulkData, error: fetchBulksError } = await supabase
      .from('warehouse_inventory_item_bulk')
      .select('uuid, status_history, warehouse_inventory_uuid')
      .eq('uuid', uuid);

    if (fetchBulksError) {
      console.error('Error fetching warehouse item bulk:', fetchBulksError);
      return { success: false, message: `Failed to fetch item bulk: ${fetchBulksError.message}` };
    }

    if (!bulkData || bulkData.length === 0) {
      return { success: false, message: 'Bulk not found.' };
    }

    const bulk = bulkData[0];
    const warehouseInventoryUuid = bulk.warehouse_inventory_uuid;

    // 2. Update the specific bulk's status and status_history
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
      .eq('uuid', uuid);

    if (updateBulkError) {
      console.error(`Error updating bulk ${uuid}:`, updateBulkError);
      return { success: false, message: `Failed to update bulk: ${updateBulkError.message}` };
    }

    // 3. Find and update all units associated with this bulk
    const { data: unitsToUpdate, error: fetchUnitsError } = await supabase
      .from('warehouse_inventory_item_unit')
      .select('uuid, status_history')
      .eq('warehouse_inventory_bulk_uuid', uuid);

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
          return { success: false, message: `Failed to update unit ${unit.uuid}: ${updateUnitError.message}` };
        }
      }
    }

    // 4. Check all bulks for this warehouse inventory item to determine main item status
    const { data: allBulks, error: fetchAllBulksError } = await supabase
      .from('warehouse_inventory_item_bulk')
      .select('status')
      .eq('warehouse_inventory_uuid', warehouseInventoryUuid);

    if (fetchAllBulksError) {
      console.error('Error fetching all bulks for warehouse inventory item:', fetchAllBulksError);
      return { success: false, message: `Failed to fetch all bulks: ${fetchAllBulksError.message}` };
    }

    // 5. Determine the status of the main warehouse inventory item
    const allBulksAreUsed = allBulks && allBulks.every(b => b.status === 'USED');
    const mainItemStatus = allBulksAreUsed ? 'USED' : 'AVAILABLE';

    // 6. Update the main warehouse inventory item status
    const { error: updateMainItemError } = await supabase
      .from('warehouse_inventory_items')
      .update({
        status: mainItemStatus,
        updated_at: timestamp,
      })
      .eq('uuid', warehouseInventoryUuid);

    if (updateMainItemError) {
      console.error('Error updating main warehouse inventory item:', updateMainItemError);
      return { success: false, message: `Failed to update main item: ${updateMainItemError.message}` };
    }

    // 7. Revalidate relevant paths
    // revalidatePath('/home/warehouse-items');

    return {
      success: true,
      message: `Bulk marked as used successfully. Main item status set to ${mainItemStatus}.`
    };
  } catch (error: any) {
    console.error('Unexpected error marking bulk as used:', error);
    return { success: false, message: error.message || 'An unexpected error occurred.' };
  }
}

/**
 * Mark warehouse unit as used
 */
export async function markWarehouseUnitAsUsed(unitUuid: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const newStatus = 'USED';
  const timestamp = new Date().toISOString();

  try {
    // First get the unit to access its status history
    const { data: unitData, error: fetchError } = await supabase
      .from('warehouse_inventory_item_unit')
      .select('uuid, status_history, warehouse_inventory_bulk_uuid')
      .eq('uuid', unitUuid)
      .single();

    if (fetchError) {
      console.error('Error fetching unit:', fetchError);
      return { success: false, error: `Failed to fetch unit: ${fetchError.message}` };
    }

    if (!unitData) {
      return { success: false, error: 'Unit not found.' };
    }

    // Update the unit's status and status_history
    const currentStatusHistory: StatusHistory =
      unitData.status_history && typeof unitData.status_history === 'object' && !Array.isArray(unitData.status_history)
        ? (unitData.status_history as StatusHistory)
        : {};

    const updatedStatusHistory: StatusHistory = {
      ...currentStatusHistory,
      [timestamp]: newStatus,
    };

    const { error: updateError } = await supabase
      .from('warehouse_inventory_item_unit')
      .update({
        status: newStatus,
        status_history: updatedStatusHistory,
        updated_at: timestamp,
      })
      .eq('uuid', unitUuid);

    if (updateError) {
      console.error('Error updating unit status:', updateError);
      return { success: false, error: `Failed to update unit: ${updateError.message}` };
    }

    // Check if all units in the bulk are now used to update bulk status
    const { data: allUnitsInBulk, error: fetchUnitsError } = await supabase
      .from('warehouse_inventory_item_unit')
      .select('status')
      .eq('warehouse_inventory_bulk_uuid', unitData.warehouse_inventory_bulk_uuid);

    if (fetchUnitsError) {
      console.error('Error fetching all units in bulk:', fetchUnitsError);
      // Don't fail the operation if we can't update the bulk status
    } else if (allUnitsInBulk && allUnitsInBulk.every(u => u.status === 'USED')) {
      // Get the current bulk to preserve its status history
      const { data: bulkData, error: fetchBulkError } = await supabase
        .from('warehouse_inventory_item_bulk')
        .select('status_history, warehouse_inventory_uuid')
        .eq('uuid', unitData.warehouse_inventory_bulk_uuid)
        .single();

      if (!fetchBulkError && bulkData) {
        // Properly merge the bulk status history
        const currentBulkStatusHistory: StatusHistory =
          bulkData.status_history && typeof bulkData.status_history === 'object' && !Array.isArray(bulkData.status_history)
            ? (bulkData.status_history as StatusHistory)
            : {};

        const updatedBulkStatusHistory: StatusHistory = {
          ...currentBulkStatusHistory,
          [timestamp]: newStatus,
        };

        await supabase
          .from('warehouse_inventory_item_bulk')
          .update({
            status: newStatus,
            status_history: updatedBulkStatusHistory,
            updated_at: timestamp,
          })
          .eq('uuid', unitData.warehouse_inventory_bulk_uuid);

        // Check if we need to update the main warehouse inventory item
        const { data: allBulks, error: fetchAllBulksError } = await supabase
          .from('warehouse_inventory_item_bulk')
          .select('status')
          .eq('warehouse_inventory_uuid', bulkData.warehouse_inventory_uuid);

        if (!fetchAllBulksError && allBulks && allBulks.every(b => b.status === 'USED')) {
          await supabase
            .from('warehouse_inventory_items')
            .update({
              status: 'USED',
              updated_at: timestamp,
            })
            .eq('uuid', bulkData.warehouse_inventory_uuid);
        }
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error marking warehouse unit as used:", error);
    return {
      success: false,
      error: error.message || "Failed to mark warehouse unit as used"
    };
  }
}
