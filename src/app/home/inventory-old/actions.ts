"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export type InventoryItem = {
  uuid: string;
  admin_uuid: string;
  company_uuid: string;
  item_code: string;
  item_name: string;
  description: string | null;
  total_quantity: number;
  bulk_quantity: number;
  quantity: number;
  bulk_unit: string;
  unit: string;
  unit_value: number;
  bulk_ending_inventory: number;
  ending_inventory: number;
  total_cost: number;
  netsuite: number | null;
  variance: number | null;
  status: string | null;
}

/**
 * Creates a new inventory item in the database
 */
export async function createInventoryItem(formData: InventoryItem) {
  const supabase = await createClient();

  try {
    // remove uuid from formData if it exists
    const { data, error } = await supabase
      .from("inventory_items")
      .insert(formData)
      .select();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error("Error creating inventory item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Updates an existing inventory item in the database
 */
export async function updateInventoryItem(uuid: string, formData: Partial<InventoryItem>) {
  const supabase = await createClient();
  console.log("Updating inventory item with UUID:", uuid);
  console.log("Form data:", formData);

  try {
    const { data, error } = await supabase
      .from("inventory_items")
      .update(formData)
      .eq("uuid", uuid)
      .select();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error("Error updating inventory item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Deletes an inventory item from the database
 */
export async function deleteInventoryItem(uuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("uuid", uuid)
      .select();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error("Error deleting inventory item:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Fetches available units from the database or returns default ones
 */
export async function getUnitOptions() {
  // You could fetch this from a database table if needed
  return [
    "kg", "g", "lb", "oz", "l", "ml", "m", "cm", "ft", "in",
    "pcs", "units", "each", "dozen", "gross"
  ];
}

/**
 * Fetches available bulk units from the database or returns default ones
 */
export async function getBulkUnitOptions() {
  // You could fetch this from a database table if needed
  return [
    "box", "carton", "pack", "set", "pallet", "container", "drum", "bag", "crate"
  ];
}

/**
 * Fetches available floor options
 */
export async function getFloorOptions() {
  // You could fetch this from a database table if needed
  return ["Floor 1", "Floor 2", "Floor 3"];
}

/**
 * Fetches available shelf locations for a specific company
 * @param companyUuid The company's UUID
 * @param search Optional search term to filter locations
 * @param status Optional status to filter locations
 * @returns Array of shelf locations
 */
export async function getInventoryItems(
  companyUuid: string,
  searchQuery: string = "",
  status?: string
) {
  const supabase = await createClient();

  try {
    let query = supabase
      .from("inventory_items")
      .select("*")
      .eq("company_uuid", companyUuid)
      .order("created_at", { ascending: false });

    // Add search filter if provided
    if (searchQuery) {
      query = query.or(
        `item_code.ilike.%${searchQuery}%,item_name.ilike.%${searchQuery}%`
      );
    }

    // Add status filter if provided
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error("Error fetching inventory items:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      data: []
    };
  }
}

/**
 * Fetches inventory items with pagination, search, and company filtering
 * @param options Query options including pagination, search, and company UUID
 * @returns Object containing inventory items and pagination details
 */
export async function getInventoryItemsPage(options: {
  page?: number;
  pageSize?: number;
  search?: string;
  companyUuid?: string;
}) {
  const { page = 1, pageSize = 10, search = "", companyUuid } = options;
  const supabase = await createClient();

  try {
    // Calculate pagination values
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

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
        `item_code.ilike.%${search}%,item_name.ilike.%${search}%,description.ilike.%${search}%`
      );
    }

    // Apply pagination
    query = query.range(from, to);

    // Execute the query
    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    // Get total count in a separate query
    const { count: totalCount } = await supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true });

    return {
      success: true,
      data: data || [],
      pagination: {
        page,
        pageSize,
        total: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / pageSize)
      }
    };
  } catch (error) {
    console.error("Error fetching inventory items:", error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error occurred",
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0
      }
    };
  }
}

