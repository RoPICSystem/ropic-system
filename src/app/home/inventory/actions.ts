"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

interface LocationData {
  company_uuid: string;
  floor: string;
  column: string;
  row: string;
  cabinet: string;
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