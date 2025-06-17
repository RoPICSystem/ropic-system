"use server";

import { createClient } from "@/utils/supabase/server";
import { getProfileImagePath } from "@/utils/supabase/server/user";
import { DeliveryItem } from "../delivery/actions";
import { markWarehouseGroupAsUsed, markWarehouseItemAsUsed, markWarehouseItemsBulkUsed } from "../warehouse-items/actions";

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
  matched_warehouse_inventory_uuids: string[];
  total_matched_items: number;

  // Related data will be populated
  delivery?: DeliveryItem;
  warehouse?: {
    uuid: string;
    name: string;
    address: any;
  };
  matched_inventory_items?: {
    uuid: string;
    name: string;
    description?: string;
    unit: string;
    properties: Record<string, any>;
  }[];
}



// Updated function to mark warehouse inventory item as used with proper parameter handling
export async function markWarehouseInventoryItemAsUsed(
  warehouseInventoryUuid: string,
  inventoryItemUuid: string | null,
  isGroup: boolean,
  userDetails: any
) {
  try {
    // If we have a specific item or group identifier
    if (inventoryItemUuid) {
      if (isGroup) {
        // Mark entire group as used
        return await markWarehouseGroupAsUsed(inventoryItemUuid);
      } else {
        // Mark specific item as used
        return await markWarehouseItemAsUsed(inventoryItemUuid);
      }
    } else {
      // Mark one item from the warehouse inventory as used (bulk with count 1)
      return await markWarehouseItemsBulkUsed(warehouseInventoryUuid, 1);
    }
  } catch (error) {
    console.error('Error marking warehouse inventory item as used:', error);
    return { 
      success: false, 
      error: `Failed to mark item as used: ${(error as Error).message}` 
    };
  }
}

/**
 * Handle auto-accept for new warehouse inventory items
 */
export async function handleAcceptNewWarehouseInventory(
  deliveryUuid: string,
  warehouseInventoryUuids: string[],
  userDetails: any
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  try {
    // Check if the user is an operator
    if (!userDetails || !userDetails.uuid || userDetails.is_admin) {
      return {
        success: false,
        error: "You are not authorized to accept new warehouse inventory items"
      };
    }

    // Get the delivery details
    const { data: deliveryData, error: deliveryError } = await supabase
      .from("delivery_items")
      .select(`
        uuid,
        status,
        warehouse_uuid,
        company_uuid,
        warehouse_inventory_items,
        operator_uuids
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

    // Check if the delivery status is IN_TRANSIT
    if (deliveryData.status !== "IN_TRANSIT") {
      if (deliveryData.status === "DELIVERED") {
        return {
          success: false,
          error: "This delivery has already been delivered"
        };
      } else {
        return {
          success: false,
          error: "This delivery cannot be accepted because it is not in transit"
        };
      }
    }

    // Check if the operator is assigned to this delivery
    const operatorUuids = deliveryData.operator_uuids || [];
    const isAssigned = operatorUuids.includes(userDetails.uuid) || operatorUuids.length === 0;

    if (!isAssigned) {
      return {
        success: false,
        error: "You are not assigned to this delivery"
      };
    }

    // Use the new RPC function to update delivery status to DELIVERED
    const { updateDeliveryStatusWithItems } = await import("../delivery/actions");

    const result = await updateDeliveryStatusWithItems(
      deliveryData.uuid,
      "DELIVERED",
      userDetails.company_uuid
    );

    if (result.success) {
      return { success: true };
    } else {
      return {
        success: false,
        error: result.error || "Failed to update delivery status"
      };
    }

  } catch (error: any) {
    console.error("Error accepting new warehouse inventory:", error);
    return {
      success: false,
      error: `Failed to accept new warehouse inventory: ${error.message || "Unknown error"}`
    };
  }
}