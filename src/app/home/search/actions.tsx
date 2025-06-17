"use server";

import { createClient } from "@/utils/supabase/server";
import { getProfileImagePath } from "@/utils/supabase/server/user";
import { DeliveryItem } from "../delivery/actions";

export interface GoPageDeliveryDetails {
  uuid: string;
  name?: string;
  delivery_address: string;
  delivery_date: string;
  status: string;
  notes: string;
  status_history?: Record<string, string>;
  locations: any[];
  location_codes: string[];
  operator_uuids?: string[];
  created_at: string;
  updated_at: string;

  // Related data
  inventory_item?: {
    uuid: string;
    name: string;
    description?: string;
    unit: string;
    properties?: Record<string, any>;
    status?: string;
  };
  warehouse?: {
    uuid: string;
    name: string;
    address: any;
  };
  operators?: {
    uuid: string;
    full_name: string;
    email: string;
    phone_number: string;
    profile_image: string;
  }[];
  inventory_bulks?: any[];
}

export interface GoPageInventoryDetails {
  uuid: string;
  name: string;
  description?: string;
  unit: string;
  status?: string;
  properties: Record<string, any>;
  created_at: string;
  updated_at: string;

  // Related data
  inventory_item_bulks: {
    uuid: string;
    unit: string;
    unit_value: number;
    bulk_unit: string;
    cost: number;
    is_single_item: boolean;
    status?: string;
    properties?: Record<string, any>;
    inventory_item_units?: {
      uuid: string;
      code: string;
      unit_value: number;
      unit: string;
      name: string;
      cost: number;
      status?: string;
      properties?: Record<string, any>;
    }[];
  }[];
  delivery_history?: {
    uuid: string;
    delivery_date: string;
    status: string;
    delivery_address: string;
  }[];
}

export interface GoPageWarehouseDetails {
  uuid: string;
  name: string;
  description?: string;
  status: string;
  unit: string;
  properties?: any;
  created_at?: string;
  updated_at?: string;

  // Related data
  warehouse?: {
    uuid: string;
    name: string;
    address: any;
  };
  inventory_item?: {
    uuid: string;
    name: string;
    description?: string;
    unit: string;
    properties: Record<string, any>;
  };
  bulks: {
    uuid: string;
    unit: string;
    unit_value: number;
    bulk_unit: string;
    cost: number;
    is_single_item: boolean;
    location: any;
    location_code: string;
    status: string;
    properties?: Record<string, any>;
    units?: {
      uuid: string;
      code: string;
      unit_value: number;
      unit: string;
      name: string;
      cost: number;
      location: any;
      location_code: string | null;
      status: string;
      properties?: Record<string, any>;
    }[];
    unit_count?: number;
  }[];
  delivery_item?: {
    uuid: string;
    delivery_date: string;
    status: string;
    delivery_address: string;
  };
}

export interface GoPageNewWarehouseInventoryDetails {
  delivery_uuid: string;
  delivery_name?: string;
  delivery_address: string;
  delivery_date: string;
  delivery_status: string;
  warehouse_uuid: string;
  company_uuid: string;
  matched_warehouse_inventory_uuids: string[]; // ✅ ADD: Array of matched UUIDs
  total_matched_items: number; // ✅ ADD: Count of matched items
  
  // Related data will be populated
  delivery?: DeliveryItem;
  warehouse?: {
    uuid: string;
    name: string;
    address: any;
  };
  matched_inventory_items?: { // ✅ ADD: Details of matched items
    uuid: string;
    name: string;
    description?: string;
    unit: string;
    properties: Record<string, any>;
  }[];
}

/**
 * Get detailed delivery item information by UUID
 */
export async function getDeliveryItemDetails(uuid: string): Promise<{ success: boolean; data?: GoPageDeliveryDetails; error?: string }> {
  const supabase = await createClient();

  try {
    // Get delivery item with related data
    const { data: deliveryData, error: deliveryError } = await supabase
      .from("delivery_items")
      .select(`
        *,
        inventory_items!inventory_uuid (
          uuid,
          name,
          description,
          unit,
          status,
          properties
        ),
        warehouses!warehouse_uuid (
          uuid,
          name,
          address
        )
      `)
      .eq("uuid", uuid)
      .single();

    if (deliveryError) throw deliveryError;

    // Get operator details if any
    let operators: { uuid: string; full_name: string; email: string; phone_number: string; profile_image: string }[] = [];
    if (deliveryData.operator_uuids && deliveryData.operator_uuids.length > 0) {
      const { data: operatorData, error: operatorError } = await supabase
        .from("profiles")  // Changed from "users" to "profiles" table
        .select("uuid, full_name, email, phone_number, profile_image")
        .in("uuid", deliveryData.operator_uuids);

      if (!operatorError) {
        operators = operatorData || [];
      }
    }

    operators = await Promise.all(operators.map(async operator => ({
      ...operator,
      profile_image: (await getProfileImagePath(operator.profile_image!)) || '' // Handle null case with empty string
    })));

    // Get inventory bulks with basic details (units will be loaded lazily)
    let inventoryBulks = [];
    if (deliveryData.inventory_item_bulk_uuids && deliveryData.inventory_item_bulk_uuids.length > 0) {
      const { data: bulkData, error: bulkError } = await supabase
        .from("inventory_item_bulk")
        .select("*")
        .in("uuid", deliveryData.inventory_item_bulk_uuids);

      if (!bulkError) {
        inventoryBulks = bulkData || [];
      }
    }

    return {
      success: true,
      data: {
        ...deliveryData,
        inventory_item: deliveryData.inventory_items,
        warehouse: deliveryData.warehouses && deliveryData.warehouses.length > 0 ? deliveryData.warehouses[0] : undefined,
        operators,
        inventory_bulks: inventoryBulks
      }
    };
  } catch (error: any) {
    console.error("Error fetching delivery item details:", error);
    return {
      success: false,
      error: `Failed to fetch delivery item details: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Get detailed inventory item information by UUID
 */
export async function getInventoryItemDetails(uuid: string): Promise<{ success: boolean; data?: GoPageInventoryDetails; error?: string }> {
  const supabase = await createClient();

  try {
    // Get inventory item details using the existing RPC function
    const { data: inventoryData, error: inventoryError } = await supabase
      .rpc('get_inventory_item_details', {
        p_inventory_uuid: uuid,
        p_include_warehouse_items: false
      });

    if (inventoryError) throw inventoryError;

    if (!inventoryData || inventoryData.length === 0) {
      return {
        success: false,
        error: "Inventory item not found"
      };
    }

    const item = inventoryData[0];

    // Get delivery history for this inventory item
    // Get delivery history for this inventory item
    const { data: deliveryHistory } = await supabase
      .from("delivery_items")
      .select("uuid, delivery_date, status, delivery_address")
      .eq("inventory_uuid", uuid)
      .order("delivery_date", { ascending: false })
      .limit(10);
    return {
      success: true,
      data: {
        ...item,
        delivery_history: deliveryHistory || []
      }
    };
  } catch (error: any) {
    console.error("Error fetching inventory item details:", error);
    return {
      success: false,
      error: `Failed to fetch inventory item details: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Get detailed warehouse item information by UUID
 */
export async function getWarehouseItemDetails(uuid: string): Promise<{ success: boolean; data?: GoPageWarehouseDetails; error?: string }> {
  const supabase = await createClient();

  try {
    // Get warehouse item details using the existing RPC function
    const { data: warehouseData, error: warehouseError } = await supabase
      .rpc('get_warehouse_inventory_item_complete', { p_uuid: uuid });

    if (warehouseError) throw warehouseError;

    if (!warehouseData) {
      return {
        success: false,
        error: "Warehouse item not found"
      };
    }

    // Get warehouse details
    // Get warehouse details
    const { data: warehouseInfo } = await supabase
      .from("warehouses")
      .select("uuid, name, address")
      .eq("uuid", warehouseData.item.warehouse_uuid)
      .single();

    // Get original inventory item details
    const { data: inventoryInfo } = await supabase
      .from("inventory_items")
      .select("uuid, name, description, unit, properties")
      .eq("uuid", warehouseData.item.inventory_uuid)
      .single();
    // Get delivery item details if delivery_uuid exists in any bulk
    let deliveryItem = null;
    const deliveryUuids = warehouseData.bulks
      .map((bulk: any) => bulk.bulk_data.delivery_uuid)
      .filter((uuid: any) => uuid);

    if (deliveryUuids.length > 0) {
      const { data: deliveryData, error: deliveryDataError } = await supabase
        .from("delivery_items")
        .select("uuid, delivery_date, status, delivery_address")
        .eq("uuid", deliveryUuids[0])
        .single();

      if (!deliveryDataError) {
        deliveryItem = deliveryData;
      }
    }

    // Transform bulks to include basic unit info (detailed units will be loaded lazily)
    const transformedBulks = warehouseData.bulks.map((bulk: any) => ({
      ...bulk.bulk_data,
      units: bulk.units || [],
      unit_count: bulk.units ? bulk.units.length : 0
    }));

    return {
      success: true,
      data: {
        ...warehouseData.item,
        warehouse: warehouseInfo,
        inventory_item: inventoryInfo,
        bulks: transformedBulks,
        delivery_item: deliveryItem
      }
    };
  } catch (error: any) {
    console.error("Error fetching warehouse item details:", error);
    return {
      success: false,
      error: `Failed to fetch warehouse item details: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Get bulk details with units (for lazy loading)
 */
export async function getBulkUnitsDetails(bulkUuid: string, isWarehouseBulk: boolean = false): Promise<{ success: boolean; data?: any; error?: string }> {
  const supabase = await createClient();

  try {
    if (isWarehouseBulk) {
      // Get warehouse bulk units
      const { data: unitsData, error: unitsError } = await supabase
        .from("warehouse_inventory_item_unit")
        .select("*")
        .eq("warehouse_inventory_bulk_uuid", bulkUuid)
        .order("created_at", { ascending: true });

      if (unitsError) throw unitsError;

      return {
        success: true,
        data: unitsData || []
      };
    } else {
      // Get inventory bulk units
      const { data: unitsData, error: unitsError } = await supabase
        .from("inventory_item_unit")
        .select("*")
        .eq("inventory_item_bulk_uuid", bulkUuid)
        .order("created_at", { ascending: true });

      if (unitsError) throw unitsError;

      return {
        success: true,
        data: unitsData || []
      };
    }
  } catch (error: any) {
    console.error("Error fetching bulk units:", error);
    return {
      success: false,
      error: `Failed to fetch bulk units: ${error.message || "Unknown error"}`,
    };
  }
}


/**
 * Detect item type and get details based on UUID
 */
export async function getItemDetailsByUuid(uuid: string): Promise<{
  success: boolean;
  type?: 'delivery' | 'inventory' | 'warehouse_inventory' | 'warehouse_bulk' | 'new_warehouse_inventory';
  data?: GoPageDeliveryDetails | GoPageInventoryDetails | GoPageWarehouseDetails | GoPageNewWarehouseInventoryDetails;
  error?: string;
  warehouseBulkUuid?: string;
}> {
  const supabase = await createClient();

  try {
    // Try to find the UUID in different tables

    // Check delivery items
    const { data: deliveryCheck, error: deliveryCheckError } = await supabase
      .from("delivery_items")
      .select("uuid")
      .eq("uuid", uuid)
      .single();

    if (!deliveryCheckError && deliveryCheck) {
      const result = await getDeliveryItemDetails(uuid);
      return {
        success: result.success,
        type: 'delivery',
        data: result.data,
        error: result.error
      };
    }

    // Check inventory items
    const { data: inventoryCheck, error: inventoryCheckError } = await supabase
      .from("inventory_items")
      .select("uuid")
      .eq("uuid", uuid)
      .single();

    if (!inventoryCheckError && inventoryCheck) {
      const result = await getInventoryItemDetails(uuid);
      return {
        success: result.success,
        type: 'inventory',
        data: result.data,
        error: result.error
      };
    }

    // Check warehouse items
    const { data: warehouseCheck, error: warehouseCheckError } = await supabase
      .from("warehouse_inventory_items")
      .select("uuid")
      .eq("uuid", uuid)
      .single();

    if (!warehouseCheckError && warehouseCheck) {
      const result = await getWarehouseItemDetails(uuid);
      return {
        success: result.success,
        type: 'warehouse_inventory',
        data: result.data,
        error: result.error
      };
    }

    // Check warehouse inventory item bulk
    const { data: warehouseBulkCheck, error: warehouseBulkCheckError } = await supabase
      .from("warehouse_inventory_item_bulk")
      .select("uuid, warehouse_inventory_uuid")
      .eq("uuid", uuid)
      .single();

    if (!warehouseBulkCheckError && warehouseBulkCheck) {
      const result = await getWarehouseItemDetails(warehouseBulkCheck.warehouse_inventory_uuid);
      return {
        success: result.success,
        type: 'warehouse_bulk',
        data: result.data,
        error: result.error,
        warehouseBulkUuid: uuid
      };
    }

    // This handles the case where we're searching by delivery UUID for new_warehouse_inventory
    const { data: newWarehouseCheck, error: newWarehouseCheckError } = await supabase
      .from("delivery_items")
      .select("uuid, warehouse_inventory_items")
      .eq("uuid", uuid);

    if (!newWarehouseCheckError && newWarehouseCheck && newWarehouseCheck.length > 0) {
      const delivery = newWarehouseCheck[0];
      const warehouseInventoryItems = delivery.warehouse_inventory_items || {};
      const warehouseInventoryUuids = Object.keys(warehouseInventoryItems);

      if (warehouseInventoryUuids.length > 0) {
        // Check if any of these warehouse_inventory_uuids don't exist in warehouse_inventory table
        const { data: existingWarehouse, error: existingError } = await supabase
          .from("warehouse_inventory")
          .select("uuid")
          .in("uuid", warehouseInventoryUuids);

        const existingUuids = existingWarehouse?.map(item => item.uuid) || [];
        const newUuids = warehouseInventoryUuids.filter(uuid => !existingUuids.includes(uuid));

        if (newUuids.length > 0) {
          const result = await getNewWarehouseInventoryDetailsByDelivery(uuid, newUuids);
          return {
            success: result.success,
            type: 'new_warehouse_inventory',
            data: result.data,
            error: result.error
          };
        }
      }
    }

    // ✅ ADD: Also check if the UUID is a warehouse_inventory_uuid that doesn't exist yet
    const { data: deliveryByWarehouseInventory, error: deliveryByWarehouseError } = await supabase
      .from("delivery_items")
      .select("uuid, warehouse_inventory_items")
      .contains('warehouse_inventory_items', {
        [uuid]: {}
      });

    if (!deliveryByWarehouseError && deliveryByWarehouseInventory && deliveryByWarehouseInventory.length > 0) {
      // Verify this warehouse_inventory_uuid doesn't exist in warehouse_inventory table
      const { data: existingWarehouse, error: existingError } = await supabase
        .from("warehouse_inventory")
        .select("uuid")
        .eq("uuid", uuid)
        .single();

      if (existingError && existingError.code === 'PGRST116') { // Not found
        // Use the delivery UUID but specify the matched warehouse inventory UUID
        const result = await getNewWarehouseInventoryDetailsByDelivery(
          deliveryByWarehouseInventory[0].uuid, 
          [uuid] // Pass the specific warehouse inventory UUID that was matched
        );
        return {
          success: result.success,
          type: 'new_warehouse_inventory',
          data: result.data,
          error: result.error
        };
      }
    }

    return {
      success: false,
      error: "Item not found in any table"
    };

  } catch (error: any) {
    console.error("Error detecting item type:", error);
    return {
      success: false,
      error: `Failed to detect item type: \n${error.message || "Unknown error"}`,
    };
  }
}


/**
 * Get warehouse items (bulks and units) for a specific delivery
 */
export async function getWarehouseItemsByDelivery(deliveryUuid: string): Promise<{
  success: boolean;
  data?: any[];
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Get warehouse inventory items that were created from this delivery
    const { data: warehouseItems, error: warehouseError } = await supabase
      .from("warehouse_inventory_items")
      .select(`
        uuid,
        name,
        status,
        properties,
        created_at,
        updated_at,
        warehouse_inventory_item_bulk!inner (
          uuid,
          status,
          delivery_uuid,
          warehouse_inventory_uuid,
          properties,
          status_history,
          unit,
          unit_value,
          bulk_unit,
          location_code,
          cost,
          is_single_item,
          created_at,
          updated_at,
          warehouse_inventory_item_unit (
            uuid,
            code,
            status,
          unit,
          unit_value,
            properties,
            location,
            cost,
            location_code,
            status_history,
            created_at,
            updated_at
          )
        )
      `)
      .eq("warehouse_inventory_item_bulk.delivery_uuid", deliveryUuid);

    if (warehouseError) throw warehouseError;

    return {
      success: true,
      data: warehouseItems
    };
  } catch (error: any) {
    console.error("Error fetching warehouse items by delivery:", error);
    return {
      success: false,
      error: `Failed to fetch warehouse items: ${error.message || "Unknown error"}`
    };
  }
}






/**
 * Get detailed new warehouse inventory information by delivery UUID (grouped results)
 */
export async function getNewWarehouseInventoryDetailsByDelivery(deliveryUuid: string, matchedWarehouseInventoryUuids?: string[]): Promise<{ success: boolean; data?: GoPageNewWarehouseInventoryDetails; error?: string }> {
  const supabase = await createClient();

  try {
    // Get the delivery details
    const { data: deliveryData, error: deliveryError } = await supabase
      .from("delivery_items")
      .select(`
        uuid,
        name,
        delivery_address,
        delivery_date,
        status,
        warehouse_uuid,
        company_uuid,
        warehouse_inventory_items,
        warehouses!warehouse_uuid (
          uuid,
          name,
          address
        )
      `)
      .eq('uuid', deliveryUuid)
      .single();

    if (deliveryError) throw deliveryError;

    if (!deliveryData) {
      return {
        success: false,
        error: "Delivery not found"
      };
    }

    // Find all warehouse inventory UUIDs that don't exist in warehouse_inventory table
    const warehouseInventoryItems = deliveryData.warehouse_inventory_items || {};
    const allWarehouseInventoryUuids = Object.keys(warehouseInventoryItems);
    
    // Check which ones don't exist in warehouse_inventory table
    const { data: existingWarehouseInventory } = await supabase
      .from("warehouse_inventory")
      .select("uuid")
      .in("uuid", allWarehouseInventoryUuids);

    const existingUuids = existingWarehouseInventory?.map(item => item.uuid) || [];
    const newWarehouseInventoryUuids = allWarehouseInventoryUuids.filter(uuid => !existingUuids.includes(uuid));

    // If matchedWarehouseInventoryUuids is provided, filter to only those
    const finalMatchedUuids = matchedWarehouseInventoryUuids 
      ? newWarehouseInventoryUuids.filter(uuid => matchedWarehouseInventoryUuids.includes(uuid))
      : newWarehouseInventoryUuids;

    // Get inventory item details for matched items
    const matchedInventoryItems = [];
    for (const warehouseInventoryUuid of finalMatchedUuids) {
      const warehouseInventoryItem = warehouseInventoryItems[warehouseInventoryUuid];
      if (warehouseInventoryItem?.inventory_uuid) {
        const { data: inventoryData } = await supabase
          .from("inventory_items")
          .select(`
            uuid,
            inventory_uuid,
            item_code,
            unit,
            unit_value,
            packaging_unit,
            cost,
            properties,
            group_id,
            inventory!inventory_uuid (
              uuid,
              name,
              description,
              measurement_unit,
              standard_unit
            )
          `)
          .eq("uuid", warehouseInventoryItem.inventory_uuid)
          .single();

        if (inventoryData?.inventory && inventoryData.inventory.length > 0) {
          const inventory = inventoryData.inventory[0];
          matchedInventoryItems.push({
            warehouse_inventory_uuid: warehouseInventoryUuid,
            inventory_item_uuid: inventoryData.uuid,
            uuid: inventory.uuid,
            name: inventory.name,
            description: inventory.description,
            unit: inventory.measurement_unit,
            properties: inventoryData.properties || {}
          });
        }
      }
    }

    return {
      success: true,
      data: {
        delivery_uuid: deliveryData.uuid,
        delivery_name: deliveryData.name,
        delivery_address: deliveryData.delivery_address,
        delivery_date: deliveryData.delivery_date,
        delivery_status: deliveryData.status,
        warehouse_uuid: deliveryData.warehouse_uuid,
        company_uuid: deliveryData.company_uuid,
        matched_warehouse_inventory_uuids: finalMatchedUuids,
        total_matched_items: finalMatchedUuids.length,
        delivery: deliveryData as unknown as DeliveryItem,
        warehouse: deliveryData.warehouses?.[0],
        matched_inventory_items: matchedInventoryItems
      }
    };
  } catch (error: any) {
    console.error("Error fetching new warehouse inventory details by delivery:", error);
    return {
      success: false,
      error: `Failed to fetch new warehouse inventory details: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Mark warehouse bulks and/or units as used
 */
export async function markWarehouseItemsAsUsed(
  bulkUuids: string[],
  unitUuids: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    const currentTimestamp = new Date().toISOString();

    // Update bulk statuses
    if (bulkUuids.length > 0) {
      // First get current status history for bulks
      const { data: bulks, error: bulksError } = await supabase
        .from("warehouse_inventory_item_bulk")
        .select("uuid, status_history")
        .in("uuid", bulkUuids);

      if (bulksError) throw bulksError;

      // Update each bulk with new status and history
      for (const bulk of bulks || []) {
        const updatedStatusHistory = {
          ...(bulk.status_history || {}),
          [currentTimestamp]: "Changed to USED"
        };

        const { error: updateError } = await supabase
          .from("warehouse_inventory_item_bulk")
          .update({
            status: "USED",
            status_history: updatedStatusHistory
          })
          .eq("uuid", bulk.uuid);

        if (updateError) throw updateError;

        // Also update all units in this bulk to USED
        const { error: unitUpdateError } = await supabase
          .from("warehouse_inventory_item_unit")
          .update({
            status: "USED",
            status_history: updatedStatusHistory
          })
          .eq("warehouse_inventory_bulk_uuid", bulk.uuid);

        if (unitUpdateError) throw unitUpdateError;
      }
    }

    // Update individual unit statuses (only if not part of a bulk being updated)
    if (unitUuids.length > 0) {
      // Filter out units that belong to bulks being updated
      let filteredUnitUuids = unitUuids;

      if (bulkUuids.length > 0) {
        const { data: units, error: unitsError } = await supabase
          .from("warehouse_inventory_item_unit")
          .select("uuid, warehouse_inventory_bulk_uuid")
          .in("uuid", unitUuids);

        if (unitsError) throw unitsError;

        filteredUnitUuids = units
          ?.filter(unit => !bulkUuids.includes(unit.warehouse_inventory_bulk_uuid))
          .map(unit => unit.uuid) || [];
      }

      if (filteredUnitUuids.length > 0) {
        // Get current status history for units
        const { data: units, error: unitsError } = await supabase
          .from("warehouse_inventory_item_unit")
          .select("uuid, status_history")
          .in("uuid", filteredUnitUuids);

        if (unitsError) throw unitsError;

        // Update each unit
        for (const unit of units || []) {
          const updatedStatusHistory = {
            ...(unit.status_history || {}),
            [currentTimestamp]: "Changed to USED"
          };

          const { error: updateError } = await supabase
            .from("warehouse_inventory_item_unit")
            .update({
              status: "USED",
              status_history: updatedStatusHistory
            })
            .eq("uuid", unit.uuid);

          if (updateError) throw updateError;
        }
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error marking warehouse items as used:", error);
    return {
      success: false,
      error: `Failed to mark items as used: ${error.message || "Unknown error"}`
    };
  }
}
