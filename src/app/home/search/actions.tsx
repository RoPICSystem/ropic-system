"use server";

import { createClient } from "@/utils/supabase/server";

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
  created_at: Date;
  updated_at: Date;
  
  // Related data
  inventory_item_bulks: {
    uuid: string;
    unit: string;
    unit_value: number;
    bulk_unit: string;
    cost: number;
    is_single_item: boolean;
    status?: string;
    inventory_item_units?: {
      uuid: string;
      code: string;
      unit_value: number;
      unit: string;
      name: string;
      cost: number;
      status?: string;
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
          status
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
    let operators: { uuid: string; full_name: string; email: string; phone_number: string; }[] = [];
    if (deliveryData.operator_uuids && deliveryData.operator_uuids.length > 0) {
      const { data: operatorData, error: operatorError } = await supabase
        .from("profiles")  // Changed from "users" to "profiles" table
        .select("uuid, full_name, email, phone_number")
        .in("uuid", deliveryData.operator_uuids);

      if (!operatorError) {
        operators = operatorData || [];
      }
    }

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
        warehouse: deliveryData.warehouses,
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
    const { data: deliveryHistory, error: deliveryError } = await supabase
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
    const { data: warehouseInfo, error: warehouseInfoError } = await supabase
      .from("warehouses")
      .select("uuid, name, address")
      .eq("uuid", warehouseData.item.warehouse_uuid)
      .single();

    // Get original inventory item details
    const { data: inventoryInfo, error: inventoryInfoError } = await supabase
      .from("inventory_items")
      .select("uuid, name, description, unit")
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
  type?: 'delivery' | 'inventory' | 'warehouse';
  data?: GoPageDeliveryDetails | GoPageInventoryDetails | GoPageWarehouseDetails;
  error?: string;
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
        type: 'warehouse',
        data: result.data,
        error: result.error
      };
    }

    return {
      success: false,
      error: "Item not found in any table"
    };

  } catch (error: any) {
    console.error("Error detecting item type:", error);
    return {
      success: false,
      error: `Failed to detect item type: ${error.message || "Unknown error"}`,
    };
  }
}