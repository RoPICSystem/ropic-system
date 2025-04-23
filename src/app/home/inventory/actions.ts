"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

interface LocationData {
  floor: number;
  column: number;
  row: number;
  depth: number;
  group: number;
}

interface InventoryItemData {
  admin_uuid: string;
  company_uuid: string;
  item_code: string;
  item_name: string;
  description: string | null;
  quantity: number;
  unit: string;
  ending_inventory: number;
  netsuite: number | null;
  variance: number | null;
  location: LocationData;
  location_code: string | null;
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
    .select("uuid, company")
    .eq("is_admin", true)
    .single();

  if (error || !adminData) {
    console.error("Not an admin or error:", error);
    redirect("/home/dashboard");
  }
  return adminData;
}

/**
 * Creates a new inventory item in the database
 */
export async function createInventoryItem(formData: InventoryItemData) {
  const supabase = await createClient();

  try {
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
export async function updateInventoryItem(uuid: string, formData: Partial<InventoryItemData>) {
  const supabase = await createClient();

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
    "piece", "kg", "g", "mg", "L", "mL", "m", "cm", "mm", "box", "carton", "pack", "set"
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
 * @returns Array of shelf locations
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
        `item_code.ilike.%${search}%,item_name.ilike.%${search}%,description.ilike.%${search}%,location_code.ilike.%${search}%`
      );
    }

    // Execute the query
    const { data, error, count } = await query;

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

/**
 * Fetches only occupied shelf locations for a specific company
 * @param companyUuid The company's UUID
 * @returns Array of occupied shelf locations
 */
export async function getOccupiedShelfLocations(companyUuid: string) {
  const supabase = await createClient();

  try {
    // Only select the location fields we need
    const { data, error } = await supabase
      .from("inventory_items")
      .select("location")
      .eq("company_uuid", companyUuid);

    if (error) {
      throw error;
    }

    // Transform database location format to ShelfLocation format
    const occupiedLocations = data
      .filter(item => item.location)
      .map(item => {
        return item.location;
      });

    return {
      success: true,
      data: occupiedLocations
    };
  } catch (error) {
    console.error("Error fetching occupied shelf locations:", error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}