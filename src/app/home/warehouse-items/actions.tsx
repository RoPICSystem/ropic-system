"use server";

import { FloorConfig } from "@/components/shelf-selector-3d-v4";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

/**
 * Checks if the current user is an admin and returns admin data
 */
export async function getUser() {
  const supabase = await createClient();

  try {
    // Get session data
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return { data: null, error: "No session found" };
    }

    // Get user profile from the database
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("uuid", session.user.id)
      .single();
   
    return { data: profile, error: profileError };
  } catch (error) {
    console.error("Error checking getting data:", error);
    return { data: null, error: "Error checking getting data" };
  }
}

/**
 * Fetches available inventory items with IN_WAREHOUSE status
 */
export async function getWarehouseItems(companyUuid?: string, search: string = "") {
  const supabase = await createClient();

  try {
    // Start building the query
    let query = supabase
      .from("inventory_items")
      .select("*")
      .eq("status", "IN_WAREHOUSE")
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
    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data || []
    };
  } catch (error) {
    console.error("Error fetching warehouse items:", error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Fetches only occupied shelf locations for visualization
 */
export async function getOccupiedShelfLocations(companyUuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("location")
      .eq("company_uuid", companyUuid)
      .eq("status", "IN_WAREHOUSE")
      .not("location", "is", null);

    if (error) {
      throw error;
    }

    // Map data to the expected ShelfLocation format
    const occupiedLocations = data
      .filter(item => item.location && 
        item.location.floor !== null &&
        item.location.column !== null &&
        item.location.row !== null)
      .map(item => ({
        floor: item.location.floor,
        column: item.location.column,
        row: item.location.row,
        group: item.location.group || 0,
        depth: item.location.depth || 0,
      }));

    return {
      success: true,
      data: occupiedLocations
    };
  } catch (error) {
    console.error("Error fetching occupied shelf locations:", error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error occurred",
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