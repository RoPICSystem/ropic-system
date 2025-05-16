"use server";

import { FloorConfig } from "@/components/shelf-selector-3d-v4";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";


export interface DeliveryItem {
  uuid: string;
  admin_uuid: string | null;
  company_uuid: string | null;
  inventory_item_uuid: string | null;
  warehouse_uuid: string | null;
  delivery_address: string;
  delivery_date: string;
  notes: string;
  status: string;
  status_history?: Record<string, string>; // New field for status history with timestamps
  item_code: string;
  item_name: string;
  location_code: string;
  location: any;
  operator_uuid?: string;
  recipient_name?: string;
  recipient_contact?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Operator {
  uuid: string;
  email: string;
  full_name: string;
  phone_number: string;
}

export interface Address {
  code: string;
  desc: string;
}


export interface Warehouse {
  uuid: string;
  name: string;
  address: {
    region: Address;
    province: Address;
    municipality: Address;
    barangay: Address;
    street: string;
    postalCode: number;
    fullAddress: string;
  }
  warehouse_layout: FloorConfig[];
}

/**
 * Checks if the current user is an admin and returns admin data
 */
export async function checkAdminStatus() {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth/signin");
    }

    // Get the profile data
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("uuid", user.id)
      .single();

    if (profileError || !profile) {
      redirect("/auth/signin");
    }

    return {
      ...profile,
      // Make sure is_admin is available in the profile data
      is_admin: profile.is_admin ?? true
    };
  } catch (error) {
    console.error("Error checking admin status:", error);
    redirect("/auth/signin");
  }
}

/**
 * Creates a new delivery item in the database
 */
export async function createDeliveryItem(formData: DeliveryItem) {
  const supabase = await createClient();

  try {
    // Create the delivery item
    const { data, error } = await supabase
      .from("delivery_items")
      .insert(formData)
      .select();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error("Error creating delivery item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Updates an existing delivery item in the database
 */
export async function updateDeliveryItem(uuid: string, formData: Partial<DeliveryItem>) {
  const supabase = await createClient();

  try {
    // Update the delivery item
    const { data, error } = await supabase
      .from("delivery_items")
      .update(formData)
      .eq("uuid", uuid)
      .select();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error("Error updating delivery item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Updates the status of an inventory item
 */
export async function updateInventoryItemStatus(inventoryItemUuid: string, status: string) {
  const supabase = await createClient();

  try {
    // Update the inventory item status
    const { data, error } = await supabase
      .from("inventory_items")
      .update({ status })
      .eq("uuid", inventoryItemUuid)
      .select();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error("Error updating inventory item status:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Fetches delivery items with optional search
 */
export async function getDeliveryItems(companyUuid?: string, search: string = "") {
  const supabase = await createClient();

  try {
    // Start building the query
    let query = supabase
      .from("delivery_items")
      .select(`
        *,
        inventory_item:inventory_item_uuid!inner(
          uuid,
          item_code,
          item_name,
          description,
          quantity,
          unit,
          status
        )
      `)
      .order("created_at", { ascending: false });

    // Apply company filter if provided
    if (companyUuid) {
      query = query.eq("company_uuid", companyUuid);
    }

    // Apply search filter if provided
    if (search) {
      query = query.or(
        `item_name.ilike.%${search}%,description.ilike.%${search}%,item_code.ilike.%${search}%`, { referencedTable: "inventory_item" }
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
    console.error("Error fetching delivery items:", error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Fetches available inventory items for delivery
 */
export async function getInventoryItems(companyUuid?: string, search: string = "") {
  const supabase = await createClient();

  try {
    // Start building the query
    let query = supabase
      .from("inventory_items")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply company filter if provided
    if (companyUuid) {
      query = query.eq("company_uuid", companyUuid);
    }

    // Apply search filter if provided
    if (search) {
      query = query.or(
        `item_code.ilike.%${search}%,item_name.ilike.%${search}%,description.ilike.%${search}%,status.ilike.%${search}%`
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
    console.error("Error fetching inventory items:", error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Deletes a delivery item
 */
export async function deleteDeliveryItem(uuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("delivery_items")
      .delete()
      .eq("uuid", uuid)
      .select();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error("Error deleting delivery item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}


// Get operators (users with isAdmin = false)
export async function getOperators(companyUuid: string) {
  const supabase = await createClient();
  
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('uuid, email, full_name, phone_number')
      .eq('company_uuid', companyUuid)
      .eq('is_admin', false);
    
    if (error) throw error;
    
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching operators:', error);
    return { success: false, error: 'Failed to fetch operators' };
  }
}

// Get warehouses
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
    return { success: false, error: 'Failed to fetch warehouses' };
  }
}

/**
 * Creates a warehouse inventory item record when an item is delivered
 */
export async function createWarehouseInventoryItem(itemData: {
  admin_uuid: string;
  warehouse_uuid: string;
  company_uuid: string;
  inventory_uuid: string;
  item_code: string;
  item_name: string;
  location: any;
  location_code: string;
  status: string;
}) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("warehouse_inventory_items")
      .insert(itemData)
      .select();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error("Error creating warehouse inventory item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Gets occupied shelf locations
 */
export async function getOccupiedShelfLocations(warehouseUuid: string) {
  const supabase = await createClient();

  try {
    const { data: deliveryData, error: deliveryError } = await supabase
      .from("delivery_items")
      .select("location")
      .eq("warehouse_uuid", warehouseUuid);
    if (deliveryError) {
      throw deliveryError;
    }

    // Map to the expected format and filter out null values
    const deliveryLocations = deliveryData
      .filter(item => item.location !== null)
      .map(item => item.location);

    return {
      success: true,
      data:  deliveryLocations
    };
  } catch (error) {
    console.error("Error fetching occupied shelf locations:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      data: []
    };
  }
}
