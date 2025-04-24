"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

interface DeliveryItemData {
  uuid: string;
  admin_uuid: string | null;
  company_uuid: string | null;
  inventory_item_uuid: string | null;
  warehouse_uuid: string | null; // New field for warehouse
  delivery_address: string;
  delivery_date: string;
  notes: string;
  status: string;
  operator_uuid?: string; // New field for operator assignment
  recipient_name?: string;
  recipient_contact?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Checks if the current user is an admin and returns admin data
 */
export async function checkAdminStatus() {
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user is admin
  const { data: adminData, error } = await supabase
    .from("profiles")
    .select("uuid, company_uuid")
    .eq("is_admin", true)
    .single();

  if (error || !adminData) {
    console.error("Not an admin or error:", error);
    redirect("/home/dashboard");
  }
  return adminData;
}

/**
 * Creates a new delivery item in the database
 */
export async function createDeliveryItem(formData: DeliveryItemData) {
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
export async function updateDeliveryItem(uuid: string, formData: Partial<DeliveryItemData>) {
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
          location_code,
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
        `item_name.ilike.%${search}%,description.ilike.%${search}%,item_code.ilike.%${search}%,location_code.ilike.%${search}%`, { referencedTable: "inventory_item" }
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
      .select("uuid, item_code, item_name, description, quantity, unit, location_code, status")
      .order("created_at", { ascending: false });

    // Apply company filter if provided
    if (companyUuid) {
      query = query.eq("company_uuid", companyUuid);
    }

    // Apply search filter if provided
    if (search) {
      query = query.or(
        `item_code.ilike.%${search}%,item_name.ilike.%${search}%,description.ilike.%${search}%`
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
      .select('uuid, email, full_name')
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
