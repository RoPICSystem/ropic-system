"use server";

import { createClient } from "@/utils/supabase/server";

export type InventoryStatus = 'IN_STOCK' | 'WARNING' | 'CRITICAL' | 'OUT_OF_STOCK';

export interface ReorderPointLog {
  uuid: string;
  company_uuid: string;
  warehouse_uuid: string;
  inventory_uuid: string;
  warehouse_inventory_uuid: string;
  
  current_stock: number;
  unit: string;
  average_daily_unit_sales: number;
  lead_time_days: number;
  safety_stock: number;
  reorder_point: number;
  status: InventoryStatus;
  
  custom_safety_stock?: number | null;
  notes?: string | null;
  
  created_at: string;
  updated_at: string;
}
/**
 * Fetches reorder point logs for the current company
 */
export async function getReorderPointLogs(
  warehouseUuid?: string,
  statusFilter?: InventoryStatus
) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc(
      'get_reorder_point_logs',
      {
        warehouse_id: warehouseUuid || null,
        status_filter: statusFilter || null
      }
    );

    if (error) throw error;

    return {
      success: true,
      data: data as ReorderPointLog[]
    };
  } catch (error: any) {
    console.error("Error fetching reorder point logs:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch reorder point logs",
      data: [] as ReorderPointLog[]
    };
  }
}

/**
 * Updates custom safety stock for an inventory item
 */
export async function updateCustomSafetyStock(
  inventoryUuid: string,
  warehouseUuid: string,
  customSafetyStock: number,
  notes?: string
) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc(
      'update_custom_safety_stock',
      {
        p_inventory_uuid: inventoryUuid,
        p_warehouse_uuid: warehouseUuid,
        p_custom_safety_stock: customSafetyStock,
        p_notes: notes || null
      }
    );

    if (error) throw error;

    return {
      success: true,
      data: data as ReorderPointLog
    };
  } catch (error: any) {
    console.error("Error updating custom safety stock:", error);
    return {
      success: false,
      error: error.message || "Failed to update custom safety stock"
    };
  }
}

/**
 * Manually triggers reorder point calculation
 */
export async function triggerReorderPointCalculation() {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('calculate_reorder_points');

    if (error) throw error;

    return {
      success: true,
      data: data as ReorderPointLog[]
    };
  } catch (error: any) {
    console.error("Error calculating reorder points:", error);
    return {
      success: false,
      error: error.message || "Failed to calculate reorder points"
    };
  }
}