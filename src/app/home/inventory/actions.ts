"use server";

import { getDefaultStandardUnit } from "@/utils/measurements";
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
  group_id?: string;
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
  standard_unit: string; // New field
  unit_values?: {
    inventory: number;
    warehouse: number;
    available: number;
    total: number;
  };
  count?: {
    inventory: number;
    warehouse: number;
    available: number;
    total: number;
  };
  inventory_items?: number;
  properties: Record<string, any>;
  status?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Gets inventory details with delivery-specific filtering
 */
export async function getInventoryItemForDelivery(
  inventoryUuid: string,
  includeWarehouseItems: boolean = false,
  deliveryUuid?: string
) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('get_inventory_details_for_delivery', {
      p_inventory_uuid: inventoryUuid,
      p_include_warehouse_items: includeWarehouseItems,
      p_delivery_uuid: deliveryUuid || null
    });

    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        success: false,
        data: null, 
        error: "Inventory item not found"
      };
    }
    // The RPC function should return the inventory 
    const inventoryItem = data[0];

    return {
      success: true,
      data: inventoryItem
    };

    return { success: true, data };
  } catch (error: Error | any) {
    console.error('Error fetching inventory details for delivery:', error);
    return {
      success: false,
      error: `Failed to fetch inventory details: ${error.message || "Unknown error"}`,
      data: null
    };
  }
}

/**
 * Gets inventory item details (existing function modified to use delivery context)
 */
export async function getInventoryItem(
  inventoryUuid: string,
  includeWarehouseItems: boolean = false,
  deliveryUuid?: string
) {
  const supabase = await createClient();

  console.log("Fetching inventory item:", {
    inventoryUuid,
    includeWarehouseItems,
    deliveryUuid
  });

  try {
    // Use the delivery-specific function when delivery context is provided
    if (deliveryUuid) {
      return await getInventoryItemForDelivery(inventoryUuid, includeWarehouseItems, deliveryUuid);
    }

    // Use original function for non-delivery contexts
    const { data, error } = await supabase.rpc('get_inventory_details', {
      p_inventory_uuid: inventoryUuid,
      p_include_warehouse_items: includeWarehouseItems
    });

   
    if (error) throw error;

    if (!data || data.length === 0) {
      return {
        success: false,
        data: null, 
        error: "Inventory item not found"
      };
    }

    // The RPC function should return the inventory 
    const inventoryItem = data[0];

    return {
      success: true,
      data: inventoryItem
    };
  } catch (error: Error | any) {
    console.error('Error fetching inventory details:', error);
    return {
      success: false,
      error: `Failed to fetch inventory details: ${error.message || "Unknown error"}`,
      data: null
    };
  }
}



/**
 * Fetches all inventory items for a company
 *
 */
export async function getInventoryItems(companyUuid: string, getAvailableItems: boolean = true, selectFields: string = "uuid, name, standard_unit, unit_values, count, status") {
  const supabase = await createClient();

  try {
    let query = supabase
      .from("inventory")
      .select(selectFields)
      .eq("company_uuid", companyUuid);

    if (getAvailableItems) {
      query = query.eq("status", "AVAILABLE");
    }

    const { data, error } = await query;

    if (error) throw error;

    return {
      success: true,
      data: (data || []) as Partial<Inventory>[]
    };
  }
  catch (error: any) {
    return {
      success: false,
      error: error.message || "Unknown error occurred"
    };
  }
}


/**
 * Creates a new inventory item with bulk
 */
export async function createInventoryItem(
  inventory: Pick<Inventory, "company_uuid" | "name" | "description" | "admin_uuid" | "measurement_unit" | "standard_unit" | "properties">,
  inventoryItems: Pick<InventoryItem, "company_uuid" | "item_code" | "unit" | "unit_value" | "packaging_unit" | "cost" | "properties" | "group_id">[],
) {
  const supabase = await createClient();

  try {
    // Ensure standard_unit is set
    const standard_unit = inventory.standard_unit || getDefaultStandardUnit(inventory.measurement_unit);

    const { data: inventoryData, error: inventoryError } = await supabase
      .from("inventory")
      .insert({
        company_uuid: inventory.company_uuid,
        admin_uuid: inventory.admin_uuid,
        name: inventory.name,
        description: inventory.description,
        measurement_unit: inventory.measurement_unit,
        standard_unit: standard_unit,
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
      properties: inventoryItem.properties,
      group_id: inventoryItem.group_id || ""
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
 * Updates an existing inventory
 */
export async function updateInventoryItem(
  uuid: string,
  inventoryUpdates: Partial<Inventory> & { properties?: Record<string, any> },
  inventoryItemUpdates: (Partial<InventoryItem> & { uuid: string })[],
  newInventoryItem: Pick<InventoryItem, "company_uuid" | "item_code" | "unit" | "unit_value" | "packaging_unit" | "cost" | "properties" | "group_id">[] = [],
  deletedInventoryItem: string[] = []
) {
  const supabase = await createClient();

  try {
    // Prepare item updates - only include defined properties
    const cleanInventoryUpdates: Record<string, any> = {};
    if (inventoryUpdates.name !== undefined) cleanInventoryUpdates.name = inventoryUpdates.name;
    if (inventoryUpdates.description !== undefined) cleanInventoryUpdates.description = inventoryUpdates.description;
    if (inventoryUpdates.measurement_unit !== undefined) cleanInventoryUpdates.measurement_unit = inventoryUpdates.measurement_unit;
    if (inventoryUpdates.standard_unit !== undefined) cleanInventoryUpdates.standard_unit = inventoryUpdates.standard_unit;
    if (inventoryUpdates.properties !== undefined) cleanInventoryUpdates.properties = inventoryUpdates.properties;

    // Prepare bulk updates - remove uuid from update data
    const cleanInventoryItemUpdates = inventoryItemUpdates.map(({ uuid: bulkUuid, ...rest }) => ({
      uuid: bulkUuid,
      ...rest
    }));

    const { data, error } = await supabase
      .rpc('update_inventory_details', {
        p_inventory_uuid: uuid,
        p_inventory_updates: Object.keys(cleanInventoryUpdates).length > 0 ? cleanInventoryUpdates : {},
        p_inventory_item_updates: cleanInventoryItemUpdates,
        p_new_inventory_item: newInventoryItem,
        p_deleted_inventory_item: deletedInventoryItem,
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
 * Deletes an inventory
 */
export async function deleteInventoryItem(uuid: string) {
  const supabase = await createClient();

  try {
    // Due to the cascading deletes, we only need to delete the inventory item
    const { error } = await supabase
      .from("inventory")
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