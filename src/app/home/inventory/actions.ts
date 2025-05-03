"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { FloorConfig } from "@/components/shelf-selector-3d-v4";
import { revalidatePath } from "next/cache";

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
 * Creates a new inventory item in the database
 */
export async function createInventoryItem(formData: InventoryItemData) {
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

/**
 * Fetches company layout data
 * @param companyUuid The company's UUID
 * @returns Object containing success status, layout data, and error message if any
 */
export async function getCompanyLayout(companyUuid: string): Promise<{ success: boolean, data: FloorConfig[] | null, error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("companies")
      .select("company_layout")
      .eq("uuid", companyUuid)
      .single();

    if (error) {
      return { success: false, data: null, error: error.message };
    }

    if (!data || !data.company_layout) {
      // If no layout exists, return a default layout
      return {
        success: false,
        data: null,
        error: "No layout found, returning default layout",
      };
    }

    // Transform the company_layout into the format expected by ShelfSelector3D
    const floorConfigs: FloorConfig[] = data.company_layout.map((floor: any) => {
      if (typeof floor.height !== "number" || floor.height <= 0) {
        throw new Error("Invalid layout format: each floor must have a positive height");
      }

      if (!Array.isArray(floor.matrix)) {
        throw new Error("Invalid layout format: each floor must have a matrix");
      }

      return {
        height: floor.height,
        matrix: floor.matrix.map((row: any) => {
          if (!Array.isArray(row)) {
            throw new Error("Invalid layout format: each row must be an array");
          }
          return row;
        })
      };
    });
    
    // Validate the transformed layout
    for (const floor of floorConfigs) {
      if (typeof floor.height !== "number" || floor.height <= 0) {
        return { success: false, data: null, error: "Invalid layout format: each floor must have a positive height" };
      }
      if (!Array.isArray(floor.matrix)) {
        return { success: false, data: null, error: "Invalid layout format: each floor must have a matrix" };
      }
      for (const row of floor.matrix) {
        if (!Array.isArray(row)) {
          return { success: false, data: null, error: "Invalid layout format: each row must be an array" };
        }
        for (const cell of row) {
          if (typeof cell !== "number" || cell < 0 || cell > 100) {
            return { success: false, data: null, error: "Invalid layout format: each cell must be a number between 0 and 100" };
          }
        }
      }
    }
    // Return the transformed layout

    return { success: true, data: floorConfigs };
  } catch (error: any) {
    console.error("Error fetching company layout:", error);
    return { success: false, data: null, error: error.message };
  }
}