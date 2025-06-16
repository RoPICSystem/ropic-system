"use server";

import { createClient } from "@/utils/supabase/server";

export type InventoryStatus = 'IN_STOCK' | 'WARNING' | 'CRITICAL' | 'OUT_OF_STOCK';

export interface ReorderPointLog {
  uuid: string;
  company_uuid: string;
  warehouse_uuid: string;
  inventory_uuid: string | null;
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

  // Additional fields for display
  warehouse_name?: string;
  inventory_name?: string;
}

/**
 * Fetches a specific reorder point log by UUID
 */
export async function getReorderPointLogDetails(logUuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc(
      'get_reorder_point_logs_filtered',
      {
        p_company_uuid: null,
        p_warehouse_uuid: null,
        p_status: null,
        p_search: logUuid,
        p_date_from: null,
        p_date_to: null,
        p_year: null,
        p_month: null,
        p_week: null,
        p_day: null,
        p_limit: 1,
        p_offset: 0
      }
    );

    if (error) {
      console.error("Database error in getReorderPointLogDetails:", error);
      throw error;
    }

    // Return the first item if found
    const item = data && data.length > 0 ? data[0] : null;
    
    return {
      success: true,
      data: item as ReorderPointLog | null
    };
  } catch (error: any) {
    console.error("Error fetching reorder point log details:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch reorder point log details",
      data: null
    };
  }
}

/**
 * Fetches reorder point logs with pagination and filtering
 */
export async function getReorderPointLogs(
  companyUuid: string,
  warehouseUuid?: string,
  statusFilter?: InventoryStatus,
  searchQuery: string = "",
  dateFrom?: string,
  dateTo?: string,
  year?: number,
  month?: number,
  week?: number,
  day?: number,
  limit: number = 10,
  offset: number = 0
) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc(
      'get_reorder_point_logs_filtered',
      {
        p_company_uuid: companyUuid || null,
        p_warehouse_uuid: warehouseUuid || null,
        p_status: statusFilter || null,
        p_search: searchQuery || "",
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_year: year || null,
        p_month: month || null,
        p_week: week || null,
        p_day: day || null,
        p_limit: limit,
        p_offset: offset
      }
    );

    if (error) {
      console.error("Database error in getReorderPointLogs:", error);
      throw error;
    }

    // Extract total count from first record
    const totalCount = data && data.length > 0 ? data[0].total_count : 0;
    
    // Calculate total pages
    const totalPages = Math.ceil(totalCount / limit);

    // Remove total_count from each item
    const items = data ? data.map(({ total_count, ...item }: any) => item) : [];

    return {
      success: true,
      data: items as ReorderPointLog[],
      totalCount,
      totalPages
    };
  } catch (error: any) {
    console.error("Error fetching reorder point logs:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch reorder point logs",
      data: [] as ReorderPointLog[],
      totalCount: 0,
      totalPages: 1
    };
  }
}

/**
 * Updates custom safety stock for an inventory item
 */
export async function updateCustomSafetyStock(
  warehouseInventoryUuid: string,
  customSafetyStock: number,
  notes?: string
) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc(
      'update_custom_safety_stock',
      {
        p_warehouse_inventory_uuid: warehouseInventoryUuid,
        p_custom_safety_stock: customSafetyStock,
        p_notes: notes || null
      }
    );

    if (error) {
      console.error("Database error in updateCustomSafetyStock:", error);
      throw error;
    }

    return {
      success: true,
      data: data as ReorderPointLog[]
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
 * Manually triggers reorder point calculation with better error handling
 */
export async function triggerReorderPointCalculation() {
  const supabase = await createClient();

  try {
    console.log("Starting reorder point calculation...");
    
    const { data, error } = await supabase.rpc('calculate_reorder_points');

    if (error) {
      console.error("Database error in triggerReorderPointCalculation:", error);
      throw error;
    }

    console.log("Reorder point calculation completed successfully");

    return {
      success: true,
      data: data as ReorderPointLog[],
      message: `Successfully calculated reorder points for ${data?.length || 0} items`
    };
  } catch (error: any) {
    console.error("Error calculating reorder points:", error);
    return {
      success: false,
      error: error.message || "Failed to calculate reorder points",
      data: [] as ReorderPointLog[]
    };
  }
}

/**
 * Triggers reorder point calculation for a specific warehouse inventory item
 */
export async function triggerSpecificReorderPointCalculation(
  warehouseInventoryUuid: string,
) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('calculate_specific_reorder_point', {
      p_warehouse_inventory_uuid: warehouseInventoryUuid,
    });

    if (error) {
      console.error("Database error in triggerSpecificReorderPointCalculation:", error);
      throw error;
    }

    console.log("Specific reorder point calculation completed successfully");

    return {
      success: true,
      data: data && data.length > 0 ? data[0] : null,
      message: "Successfully calculated reorder point for the specific item"
    };
  } catch (error: any) {
    console.error("Error calculating specific reorder point:", error);
    return {
      success: false,
      error: error.message || "Failed to calculate reorder point"
    };
  }
}

/**
 * Fetches users/operators for a company to resolve operator names
 */
export async function getOperators(operatorUuids: string[]) {
  const supabase = await createClient();

  try {
    // Return empty array if no UUIDs provided
    if (!operatorUuids || operatorUuids.length === 0) {
      return {
        success: true,
        data: []
      };
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('uuid, full_name, email')
      .in('uuid', operatorUuids);

    if (error) {
      console.error("Database error in getOperators:", error);
      throw error;
    }

    return {
      success: true,
      data: data || []
    };
  } catch (error: any) {
    console.error("Error fetching operators:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch operators",
      data: []
    };
  }
}

export async function getFilteredItems(supabaseFunction: string, params: Record<string, any>) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc(supabaseFunction, params);

    if (error) {
      console.error(`Database error in ${supabaseFunction}:`, error);
      throw error;
    }

    return {
      success: true,
      data: data || [],
      error: null
    };
  } catch (error: any) {
    console.error(`Error calling ${supabaseFunction}:`, error);
    return {
      success: false,
      data: [],
      error: error.message || `Failed to call ${supabaseFunction}`
    };
  }
}

export async function getWarehouseItemsByReorderPointLogs(
  reorderPointLogUuids: string[] = [],
  companyUuid?: string,
  limit: number = 100,
  offset: number = 0
) {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase.rpc('get_warehouse_items_by_reorder_point_logs', {
      p_reorder_point_log_uuids: reorderPointLogUuids.length > 0 ? reorderPointLogUuids : null,
      p_company_uuid: companyUuid,
      p_limit: limit,
      p_offset: offset
    });

    if (error) {
      console.error('Error fetching warehouse items by reorder point logs:', error);
      return {
        success: false,
        error: error.message,
        data: null,
        total: 0
      };
    }

    const total = data?.[0]?.total_count || 0;

    return {
      success: true,
      data: data || [],
      total: Number(total),
      error: null
    };
  } catch (error) {
    console.error('Error in getWarehouseItemsByReorderPointLogs:', error);
    return {
      success: false,
      error: 'Failed to fetch warehouse items',
      data: null,
      total: 0
    };
  }
}