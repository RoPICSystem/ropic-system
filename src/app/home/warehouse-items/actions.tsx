"use server";

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