"use server";

import { createClient } from "@/utils/supabase/server";

export interface InventoryItem {
  uuid: string;
  company_uuid: string;
  inventory_uuid: string;
  item_code: string;
  unit: string;
  unit_value: number;
  packaging_unit: string;
  cost?: number;
  properties: Record<string, any>;
  status?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Inventory {
  uuid: string;
  company_uuid: string;
  admin_uuid: string;
  name: string;
  description?: string;
  measurement_unit: string;
  inventory_items?: number;
  properties: Record<string, any>;
  status?: string;
  created_at: Date;
  updated_at: Date;
}


/**
 * Fetches inventory items for a company with pagination
 */
export async function getInventoryItems(
  companyUuid?: string,
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
    const { data, error } = await supabase
      .rpc('get_inventories', {
        p_company_uuid: companyUuid || null,
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

    // Extract total count from first row (all rows have the same total_count)
    const totalCount = data && data.length > 0 ? data[0].total_count : 0;

    // Remove total_count from each item and return clean inventory items
    const items = data ? data.map(({ total_count, ...item }: { total_count: number } & Record<string, any>) => item) : [];

    return {
      success: true,
      data: items,
      totalCount: Number(totalCount),
      hasMore: offset + items.length < totalCount,
      currentPage: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(totalCount / limit)
    };
  } catch (error: Error | any) {
    console.error("Error fetching inventory items:", error);
    return {
      success: false,
      data: [],
      totalCount: 0,
      hasMore: false,
      currentPage: 1,
      totalPages: 0,
      error: `Failed to fetch inventory items: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Fetches a single inventory item with its bulks and units
 */
export async function getInventoryItem(uuid: string, getItemsInWarehouse: boolean = false) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .rpc('get_inventory_details', {
        p_inventory_uuid: uuid,
        p_include_warehouse_items: getItemsInWarehouse
      });

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        success: false,
        error: "Inventory item not found"
      };
    }

    // The RPC function should return the inventory item with nested bulks and units
    const inventoryItem = data[0];

    return {
      success: true,
      data: inventoryItem
    };
  } catch (error) {
    console.error("Error fetching inventory item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Creates a new inventory item with bulk
 */
export async function createInventoryItem(
  inventory: Pick<Inventory, "company_uuid" | "name" | "description" | "admin_uuid" | "measurement_unit" | "properties">,
  inventoryItems: Pick<InventoryItem, "company_uuid" | "item_code" | "unit" | "unit_value" | "packaging_unit" | "cost" | "properties">[],
) {
  const supabase = await createClient();

  try {
    const { data: inventoryData, error: inventoryError } = await supabase
      .from("inventory")
      .insert({
        company_uuid: inventory.company_uuid,
        admin_uuid: inventory.admin_uuid,
        name: inventory.name,
        description: inventory.description,
        measurement_unit: inventory.measurement_unit,
        properties: inventory.properties 
      })
      .select()
      .single();

    if (inventoryError) throw inventoryError;

    const bulkItemsToInsert = inventoryItems.map(inventoryItem => ({
      company_uuid: inventoryItem.company_uuid,
      inventory_uuid: inventoryData.uuid,
      item_code: inventoryItem.item_code,
      unit: inventoryItem.unit,
      unit_value: inventoryItem.unit_value,
      packaging_unit: inventoryItem.packaging_unit,
      cost: inventoryItem.cost,
      properties: inventoryItem.properties
    }));

    const { error: bulkError } = await supabase
      .from("inventory_items")
      .insert(bulkItemsToInsert);

    if (bulkError) throw bulkError;

    return { success: true, data: inventoryData };
  } catch (error: any) {
    console.error("Error creating inventory item:", error);
    return {
      success: false,
      error: `${error.message}`
    };
  }
}

/**
 * Updates an existing inventory item with its bulks and units using RPC
 */
export async function updateInventoryItem(
  uuid: string,
  itemUpdates: Partial<Inventory> & { properties?: Record<string, any> },
  bulkUpdates: (Partial<InventoryItem> & { uuid: string })[],
  newBulks: Pick<InventoryItem, "company_uuid" | "item_code" | "unit" | "unit_value" | "packaging_unit" | "cost" | "properties">[] = [],
  deletedBulks: string[] = []
) {
  const supabase = await createClient();

  try {
    // Prepare item updates - only include defined properties
    const cleanItemUpdates: Record<string, any> = {};
    if (itemUpdates.name !== undefined) cleanItemUpdates.name = itemUpdates.name;
    if (itemUpdates.description !== undefined) cleanItemUpdates.description = itemUpdates.description;
    if (itemUpdates.measurement_unit !== undefined) cleanItemUpdates.unit = itemUpdates.measurement_unit;
    if (itemUpdates.properties !== undefined) cleanItemUpdates.properties = itemUpdates.properties;

    // Prepare bulk updates - remove uuid from update data
    const cleanBulkUpdates = bulkUpdates.map(({ uuid: bulkUuid, ...rest }) => ({
      uuid: bulkUuid,
      ...rest
    }));

    const { data, error } = await supabase
      .rpc('update_inventory_item_details', {
        p_inventory_uuid: uuid,
        p_item_updates: Object.keys(cleanItemUpdates).length > 0 ? cleanItemUpdates : {},
        p_bulk_updates: cleanBulkUpdates,
        p_new_bulks: newBulks,
        p_deleted_bulks: deletedBulks,
      });

    if (error) throw error;

    if (!data.success) {
      throw new Error(data.error || "Unknown error occurred");
    }

    return {
      success: true,
      createdBulkUuids: data.created_bulk_uuids || []
    };
  } catch (error) {
    console.error("Error updating inventory item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Deletes an inventory item with all its bulks and units
 */
export async function deleteInventoryItem(uuid: string) {
  const supabase = await createClient();

  try {
    // Due to the cascading deletes, we only need to delete the inventory item
    const { error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("uuid", uuid);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Error deleting inventory item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Deletes a bulk item and all its units
 */
export async function deleteInventoryItemBulk(uuid: string) {
  const supabase = await createClient();

  try {
    // Due to the cascading deletes, we only need to delete the bulk item
    const { error } = await supabase
      .from("inventory_item_bulk")
      .delete()
      .eq("uuid", uuid);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Error deleting bulk item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}
