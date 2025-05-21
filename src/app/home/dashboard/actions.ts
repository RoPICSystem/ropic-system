"use server";

import { createClient } from "@/utils/supabase/server";
import { getUserCompany } from "@/utils/supabase/server/user";

/**
 * Fetches all dashboard data from Supabase
 */
export async function getDashboardData() {
  const supabase = await createClient();

  try {
    // Get the user's company
    const { data: company, error: companyError } = await getUserCompany();
    if (companyError || !company) {
      return {
        error: companyError || "Failed to retrieve company",
        data: null
      };
    }

    // Get delivery counts
    const { data: deliveryCounts, error: deliveryError } = await supabase.rpc(
      "get_dashboard_delivery_counts",
      { company_id: company.uuid }
    );

    // Get inventory stats
    const { data: inventoryStats, error: inventoryError } = await supabase.rpc(
      "get_dashboard_inventory_stats",
      { company_id: company.uuid }
    );

    // Get delivery performance metrics
    const { data: deliveryPerformance, error: performanceError } = await supabase.rpc(
      "get_dashboard_delivery_performance",
      { company_id: company.uuid }
    );

    // Get monthly revenue
    const { data: monthlyRevenue, error: revenueError } = await supabase.rpc(
      "get_dashboard_monthly_revenue",
      { company_id: company.uuid }
    );

    // Get recent notifications
    const { data: notifications, error: notificationsError } = await supabase.rpc(
      "get_dashboard_recent_notifications",
      { company_id: company.uuid }
    );

    // Get reorder point items
    const { data: reorderPointItems, error: reorderPointError } = await supabase.rpc(
      "get_dashboard_reorder_points",
      { company_id: company.uuid }
    );
    
    // Get warehouse items statistics (new)
    const { data: warehouseStats, error: warehouseError } = await supabase.rpc(
      "get_dashboard_warehouse_items_stats",
      { company_id: company.uuid }
    );

    // Check for errors
    if (deliveryError || inventoryError || performanceError || revenueError || 
        notificationsError || reorderPointError || warehouseError) {
      console.error("Dashboard data errors:", {
        deliveryError, inventoryError, performanceError, 
        revenueError, notificationsError, reorderPointError, warehouseError
      });
      
      return {
        error: "Failed to fetch some dashboard data",
        data: null
      };
    }

    // Return all dashboard data
    return {
      data: {
        deliveryCounts,
        inventoryStats,
        deliveryPerformance,
        monthlyRevenue,
        notifications,
        reorderPointItems,
        warehouseStats,
        company
      },
      error: null
    };
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
      data: null
    };
  }
}