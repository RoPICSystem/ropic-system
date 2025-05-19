"use server";

import { createClient } from "@/utils/supabase/server";

export interface InventoryItemUnit {
  uuid: string;
  company_uuid: string;
  inventory_uuid: string;
  inventory_item_bulk_uuid?: string;
  code: string;
  unit_value: number;
  unit: string;
  name: string;
  cost: number;
  properties: Record<string, any>;
  status?: string;
  created_at: Date;
  updated_at: Date;
}

export interface InventoryItemBulk {
  uuid: string;
  company_uuid: string;
  inventory_uuid: string;
  unit: string;
  unit_value: number;
  bulk_unit: string;
  cost: number;
  is_single_item: boolean;
  properties: Record<string, any>;
  inventory_item_units?: InventoryItemUnit[];
  status?: string;
  created_at: Date;
  updated_at: Date;
}

export interface InventoryItem {
  uuid: string;
  company_uuid: string;
  admin_uuid: string;
  name: string;
  description?: string;
  inventory_item_bulks: string[];
  inventory_item_bulks_length?: number;
  status?: string;
  properties: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Fetches available units from the database or returns default ones
 */
export async function getUnitOptions() {
  return [
    "kg", "g", "lb", "oz", "l", "ml", "m", "cm", "ft", "in",
    "pcs", "units", "each", "dozen", "gross"
  ];
}

/**
 * Fetches available bulk units from the database or returns default ones
 */
export async function getBulkUnitOptions() {
  return [
    "box", "carton", "pack", "set", "pallet", "container", "drum", "bag", "crate"
  ];
}

/**
 * Fetches inventory items for a company
 */
export async function getInventoryItems(companyUuid: string, searchQuery?: string) {
  const supabase = await createClient();

  try {
    let query = supabase
      .from("inventory_items")
      .select('*')
      .eq("company_uuid", companyUuid)
      .order("name");

    if (searchQuery) {
      query = query.ilike("name", `%${searchQuery}%`);
    }

    const { data, error } = await query;

    if (error) throw error;

    // For each inventory item, get the available bulk count
    const itemsWithBulkCount = await Promise.all(data.map(async (item) => {
      // Get available bulks using our function
      const { data: bulks, error: bulksError } = await supabase
        .rpc('get_available_inventory_bulks', { inventory_id: item.uuid });

      if (bulksError) {
        console.error("Error getting bulks:", bulksError);
        return {
          ...item,
          inventory_item_bulks_length: 0
        };
      }
      
      return {
        ...item,
        inventory_item_bulks_length: bulks.length,
        inventory_item_bulks: bulks
      };
    }));

    return { success: true, data: itemsWithBulkCount };
  } catch (error) {
    console.error("Error fetching inventory items:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Fetches a single inventory item with its bulks and units
 */
export async function getInventoryItem(uuid: string, getItemsInWarehouse: boolean = false) {
  const supabase = await createClient();

  try {
    // First get the inventory item
    const { data: item, error: itemError } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("uuid", uuid)
      .single();

    if (itemError) throw itemError;

    // Then get all bulk items for this inventory item
    let queryBulk = supabase
      .from("inventory_item_bulk")
      .select("*")
      .eq("inventory_uuid", uuid)

    if (!getItemsInWarehouse) 
      queryBulk = queryBulk.neq("status", "IN_WAREHOUSE");

    const { data: bulks, error: bulksError } = await queryBulk;
    
    if (bulksError) throw bulksError;

    // Then get all unit items
    const { data: units, error: unitsError } = await supabase
      .from("inventory_item_unit")
      .select("*")
      .eq("inventory_uuid", uuid);

    if (unitsError) throw unitsError;

    // Group units by their bulk
    const bulksWithUnits = bulks.map(bulk => ({
      ...bulk,
      inventory_item_units: units.filter(unit => unit.inventory_item_bulk_uuid === bulk.uuid)
    }));

    return {
      success: true,
      data: {
        ...item,
        inventory_item_bulks: bulksWithUnits
      }
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
 * Creates a new inventory item with bulk and unit items
 */

export async function createInventoryItem(
  item: Pick<InventoryItem, "company_uuid" | "name" | "description" | "admin_uuid">,
  bulks: Pick<InventoryItemBulk, "company_uuid" | "unit" | "unit_value" | "bulk_unit" | "cost" | "is_single_item" | "properties">[],
  units: (Pick<InventoryItemUnit, "company_uuid" | "code" | "unit_value" | "unit" | "name" | "cost" | "properties"> & { _bulkIndex?: number })[]
) {
  const supabase = await createClient();

  console.log("Creating inventory item with bulks and units:", item);
  console.log("Bulks data:", bulks);
  console.log("Units data with _bulkIndex values:", units.map(u => ({ ...u, _bulkIndex: u._bulkIndex })));

  try {
    // Create the inventory item
    const { data: inventoryItem, error: inventoryError } = await supabase
      .from("inventory_items")
      .insert({
        company_uuid: item.company_uuid,
        name: item.name,
        description: item.description,
        admin_uuid: item.admin_uuid
      })
      .select()
      .single();

    if (inventoryError) throw inventoryError;

    // Create bulk items and store their UUIDs
    const createdBulkUuids: string[] = [];
    const singleItemBulkMap = new Map(); // Track which bulks are single items by index

    for (let i = 0; i < bulks.length; i++) {
      const bulk = bulks[i];
      const { data: bulkItem, error: bulkError } = await supabase
        .from("inventory_item_bulk")
        .insert({
          company_uuid: bulk.company_uuid,
          inventory_uuid: inventoryItem.uuid,
          unit: bulk.unit,
          unit_value: bulk.unit_value,
          bulk_unit: bulk.bulk_unit,
          cost: bulk.cost,
          is_single_item: bulk.is_single_item,
          properties: bulk.properties
        })
        .select()
        .single();

      if (bulkError) throw bulkError;

      createdBulkUuids.push(bulkItem.uuid);
      
      // Mark if this is a single item bulk
      if (bulk.is_single_item) {
        singleItemBulkMap.set(i, true);
      }
    }

    console.log("Created bulk UUIDs:", createdBulkUuids);
    console.log("Single item bulks by index:", [...singleItemBulkMap.entries()]);

    // Track which units we've already created for single-item bulks
    const processedSingleItemBulks = new Set();

    // Create unit items
    for (const unit of units) {
      // Determine which bulk this unit belongs to
      const bulkIndex = unit._bulkIndex !== undefined ? unit._bulkIndex : null;
      
      // Skip if we've already created a unit for this single-item bulk
      if (bulkIndex !== null && singleItemBulkMap.has(bulkIndex) && processedSingleItemBulks.has(bulkIndex)) {
        console.log(`Skipping duplicate unit for single-item bulk at index ${bulkIndex}`);
        continue;
      }
      
      const bulkUuid = bulkIndex !== null && bulkIndex >= 0 && bulkIndex < createdBulkUuids.length
        ? createdBulkUuids[bulkIndex]
        : null;

      console.log(`Creating unit with bulk index: ${bulkIndex}, bulk UUID: ${bulkUuid}`);
      console.log("Unit details:", unit);

      const { error: unitError } = await supabase
        .from("inventory_item_unit")
        .insert({
          company_uuid: unit.company_uuid,
          inventory_uuid: inventoryItem.uuid,
          inventory_item_bulk_uuid: bulkUuid, // Will be null only if bulkIndex is invalid
          code: unit.code,
          unit_value: unit.unit_value,
          unit: unit.unit,
          name: unit.name,
          cost: unit.cost,
          properties: unit.properties
        });

      if (unitError) throw unitError;
      
      // Mark this single-item bulk as processed
      if (bulkIndex !== null && singleItemBulkMap.has(bulkIndex)) {
        processedSingleItemBulks.add(bulkIndex);
      }
    }

    return { success: true, data: inventoryItem };
  } catch (error: any) {
    console.error("Error creating inventory item:", error);
    return {
      success: false,
      error: `${error.message}`
    };
  }
}

/**
 * Updates an existing inventory item with its bulks and units
 */
export async function updateInventoryItem(
  uuid: string,
  itemUpdates: Partial<InventoryItem>,
  bulkUpdates: (Partial<InventoryItemBulk> & { uuid: string })[],
  unitUpdates: (Partial<InventoryItemUnit> & { uuid: string })[],
  newBulks: Pick<InventoryItemBulk, "company_uuid" | "unit" | "unit_value" | "bulk_unit" | "cost" | "is_single_item" | "properties">[],
  newUnits: (Pick<InventoryItemUnit, "company_uuid" | "code" | "unit_value" | "unit" | "name" | "cost" | "properties"> & { _bulkIndex?: number })[]
) {
  const supabase = await createClient();

  try {
    // // Start a transaction
    // const { data: client } = await supabase.rpc('begin_transaction');

    // Update inventory item
    const { error: inventoryError } = await supabase
      .from("inventory_items")
      .update(itemUpdates)
      .eq("uuid", uuid);

    if (inventoryError) throw inventoryError;

    // Update existing bulk items
    for (const bulk of bulkUpdates) {
      const bulkUuid = bulk.uuid;
      // Remove uuid from the update object
      const { uuid: _, ...bulkUpdateData } = bulk;

      const { error: bulkError } = await supabase
        .from("inventory_item_bulk")
        .update(bulkUpdateData)
        .eq("uuid", bulkUuid);

      if (bulkError) throw bulkError;
    }

    // Update existing unit items
    for (const unit of unitUpdates) {
      const unitUuid = unit.uuid;
      // Remove uuid from the update object
      const { uuid: _, ...unitUpdateData } = unit;

      const { error: unitError } = await supabase
        .from("inventory_item_unit")
        .update(unitUpdateData)
        .eq("uuid", unitUuid);

      if (unitError) throw unitError;
    }

    // Create new bulk items and store their UUIDs
    const createdBulkUuids: string[] = [];

    for (const bulk of newBulks) {
      const { data: bulkItem, error: bulkError } = await supabase
        .from("inventory_item_bulk")
        .insert({
          company_uuid: bulk.company_uuid,
          inventory_uuid: uuid,
          unit: bulk.unit,
          unit_value: bulk.unit_value,
          bulk_unit: bulk.bulk_unit,
          cost: bulk.cost,
          is_single_item: bulk.is_single_item,
          properties: bulk.properties
        })
        .select()
        .single();

      if (bulkError) throw bulkError;

      createdBulkUuids.push(bulkItem.uuid);
    }

    // Create new unit items
    for (const unit of newUnits) {
      const bulkUuid = unit._bulkIndex !== undefined && unit._bulkIndex >= 0 && unit._bulkIndex < createdBulkUuids.length
        ? createdBulkUuids[unit._bulkIndex]
        : null;

      const { error: unitError } = await supabase
        .from("inventory_item_unit")
        .insert({
          company_uuid: unit.company_uuid,
          inventory_uuid: uuid,
          inventory_item_bulk_uuid: bulkUuid,
          code: unit.code,
          unit_value: unit.unit_value,
          unit: unit.unit,
          name: unit.name,
          cost: unit.cost,
          properties: unit.properties
        });

      if (unitError) throw unitError;
    }

    // // Commit the transaction
    // await supabase.rpc('commit_transaction', { client_id: client.client_id });

    return { success: true };
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

/**
 * Deletes a unit item
 */
export async function deleteInventoryItemUnit(uuid: string) {
  const supabase = await createClient();

  try {
    const { error } = await supabase
      .from("inventory_item_unit")
      .delete()
      .eq("uuid", uuid);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error("Error deleting unit item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}