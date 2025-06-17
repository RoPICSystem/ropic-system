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

    // Execute all dashboard functions in parallel with error handling
    const [
      deliveryCountsResult,
      inventoryStatsResult,
      deliveryPerformanceResult,
      monthlyRevenueResult,
      notificationsResult,
      reorderPointItemsResult,
      warehouseStatsResult
    ] = await Promise.allSettled([
      supabase.rpc("get_dashboard_delivery_counts", { company_id: company.uuid }),
      supabase.rpc("get_dashboard_inventory_stats", { company_id: company.uuid }),
      supabase.rpc("get_dashboard_delivery_performance", { company_id: company.uuid }),
      supabase.rpc("get_dashboard_monthly_revenue", { company_id: company.uuid }),
      supabase.rpc("get_dashboard_recent_notifications", { company_id: company.uuid }),
      supabase.rpc("get_dashboard_reorder_points", { company_id: company.uuid }),
      supabase.rpc("get_dashboard_warehouse_items_stats", { company_id: company.uuid })
    ]);

    // Extract data and handle errors
    const extractResult = (result: any, defaultValue: any = null) => {
      if (result.status === 'fulfilled' && !result.value.error) {
        return result.value.data && result.value.data.length > 0 ? result.value.data[0] : defaultValue;
      }
      console.error("Dashboard function error:", result.reason || result.value?.error);
      return defaultValue;
    };

    // Return consolidated dashboard data with proper fallbacks
    return {
      data: {
        deliveryCounts: extractResult(deliveryCountsResult, {
          total_deliveries: 0,
          pending_deliveries: 0,
          in_transit_deliveries: 0,
          delivered_deliveries: 0,
          recent_deliveries: []
        }),
        inventoryStats: extractResult(inventoryStatsResult, {
          total_items: 0,
          active_groups: 0,
          active_items: 0,
          available_groups: 0,
          available_items: 0,
          reserved_groups: 0,
          reserved_items: 0,
          in_warehouse_groups: 0,
          in_warehouse_items: 0,
          top_items: []
        }),
        deliveryPerformance: extractResult(deliveryPerformanceResult, {
          on_time_percentage: 0,
          average_delivery_time_days: 0,
          total_delivered_this_month: 0,
          delivery_trends: []
        }),
        monthlyRevenue: extractResult(monthlyRevenueResult, {
          current_month_revenue: 0,
          previous_month_revenue: 0,
          revenue_change_percentage: 0,
          monthly_breakdown: []
        }),
        notifications: extractResult(notificationsResult, {
          unread_count: 0,
          critical_notifications: [],
          recent_notifications: []
        }),
        reorderPointItems: extractResult(reorderPointItemsResult, {
          critical_count: 0,
          warning_count: 0,
          out_of_stock_count: 0,
          items: []
        }),
        warehouseStats: extractResult(warehouseStatsResult, {
          total_count: 0,
          available_count: 0,
          used_count: 0,
          transferred_count: 0,
          by_warehouse: [],
          by_status: []
        }),
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

/**
 * Get user-specific dashboard data based on role
 */
export async function getUserDashboardData(userUuid: string, isAdmin: boolean) {
  const supabase = await createClient();

  try {
    const { data: company, error: companyError } = await getUserCompany();
    if (companyError || !company) {
      return {
        error: companyError || "Failed to retrieve company",
        data: null
      };
    }

    if (isAdmin) {
      // Admin gets comprehensive data
      return await getDashboardData();
    } else {
      // Regular users get limited data
      const [
        deliveryCountsResult,
        warehouseStatsResult,
        notificationsResult
      ] = await Promise.allSettled([
        supabase.rpc("get_dashboard_delivery_counts", { company_id: company.uuid }),
        supabase.rpc("get_dashboard_warehouse_items_stats", { company_id: company.uuid }),
        supabase.rpc("get_dashboard_recent_notifications", { company_id: company.uuid })
      ]);

      const extractResult = (result: any, defaultValue: any = null) => {
        if (result.status === 'fulfilled' && !result.value.error) {
          return result.value.data && result.value.data.length > 0 ? result.value.data[0] : defaultValue;
        }
        console.error("Dashboard function error:", result.reason || result.value?.error);
        return defaultValue;
      };

      return {
        data: {
          deliveryCounts: extractResult(deliveryCountsResult, {
            total_deliveries: 0,
            pending_deliveries: 0,
            in_transit_deliveries: 0,
            delivered_deliveries: 0,
            recent_deliveries: []
          }),
          warehouseStats: extractResult(warehouseStatsResult, {
            total_count: 0,
            available_count: 0,
            used_count: 0,
            transferred_count: 0,
            by_warehouse: [],
            by_status: []
          }),
          notifications: extractResult(notificationsResult, {
            unread_count: 0,
            critical_notifications: [],
            recent_notifications: []
          }),
          company
        },
        error: null
      };
    }
  } catch (error) {
    console.error("Error fetching user dashboard data:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
      data: null
    };
  }
}

/**
 * Get notification count for user
 */
export async function getNotificationCount(userUuid: string, isAdmin: boolean) {
  const supabase = await createClient();

  try {
    const { data: company, error: companyError } = await getUserCompany();
    if (companyError || !company) {
      return { error: companyError || "Failed to retrieve company", count: 0 };
    }

    let query = supabase
      .from("notifications")
      .select("*", { count: 'exact', head: true })
      .eq("company_uuid", company.uuid)
      .eq("read", false);

    // Filter admin-only notifications based on user role
    if (!isAdmin) {
      query = query.eq("is_admin_only", false);
    }

    const { count, error } = await query;
    
    if (error) {
      console.error("Error fetching notification count:", error);
      return { error: error.message, count: 0 };
    }
    
    return { count: count || 0, error: null };
  } catch (error) {
    console.error("Error in getNotificationCount:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
      count: 0
    };
  }
}

/**
 * Get recent activity for dashboard
 */
export async function getRecentActivity(limit: number = 10) {
  const supabase = await createClient();

  try {
    const { data: company, error: companyError } = await getUserCompany();
    if (companyError || !company) {
      return {
        error: companyError || "Failed to retrieve company",
        data: null
      };
    }

    // Execute queries in parallel
    const [
      recentDeliveriesResult,
      recentWarehouseItemsResult,
      recentNotificationsResult
    ] = await Promise.allSettled([
      supabase
        .from("delivery_items")
        .select(`
          uuid,
          name,
          delivery_address,
          delivery_date,
          status,
          created_at,
          inventory_items
        `)
        .eq("company_uuid", company.uuid)
        .order("created_at", { ascending: false })
        .limit(limit),
      
      supabase
        .from("warehouse_inventory_items")
        .select(`
          uuid,
          item_code,
          status,
          created_at,
          warehouse:warehouses(name),
          inventory:inventory(name)
        `)
        .eq("company_uuid", company.uuid)
        .order("created_at", { ascending: false })
        .limit(limit),
      
      supabase
        .from("notifications")
        .select(`
          id,
          type,
          action,
          entity_name,
          created_at,
          read
        `)
        .eq("company_uuid", company.uuid)
        .order("created_at", { ascending: false })
        .limit(limit)
    ]);

    // Extract results with error handling
    const extractData = (result: any) => {
      if (result.status === 'fulfilled' && !result.value.error) {
        return result.value.data || [];
      }
      console.error("Recent activity error:", result.reason || result.value?.error);
      return [];
    };

    return {
      data: {
        recentDeliveries: extractData(recentDeliveriesResult),
        recentWarehouseItems: extractData(recentWarehouseItemsResult),
        recentNotifications: extractData(recentNotificationsResult)
      },
      error: null
    };
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
      data: null
    };
  }
}

/**
 * Get system health status
 */
export async function getSystemHealth() {
  const supabase = await createClient();

  try {
    const { data: company, error: companyError } = await getUserCompany();
    if (companyError || !company) {
      return {
        error: companyError || "Failed to retrieve company",
        data: null
      };
    }

    // Check various system components
    const [
      dbCheckResult,
      criticalAlertsResult,
      failedDeliveriesResult
    ] = await Promise.allSettled([
      supabase.from("companies").select("uuid").eq("uuid", company.uuid).single(),
      supabase.from("reorder_point_logs")
        .select("*", { count: 'exact', head: true })
        .eq("company_uuid", company.uuid)
        .eq("status", "CRITICAL"),
      supabase.from("delivery_items")
        .select("*", { count: 'exact', head: true })
        .eq("company_uuid", company.uuid)
        .eq("status", "CANCELLED")
    ]);

    const health = {
      database: dbCheckResult.status === 'fulfilled' && !dbCheckResult.value.error ? 'healthy' : 'error',
      critical_alerts: criticalAlertsResult.status === 'fulfilled' && !criticalAlertsResult.value.error ? 
        (criticalAlertsResult.value.count || 0) : 0,
      failed_deliveries: failedDeliveriesResult.status === 'fulfilled' && !failedDeliveriesResult.value.error ? 
        (failedDeliveriesResult.value.count || 0) : 0,
      overall_status: dbCheckResult.status === 'fulfilled' && !dbCheckResult.value.error ? 'operational' : 'degraded'
    };

    return {
      data: health,
      error: null
    };
  } catch (error) {
    console.error("Error checking system health:", error);
    return {
      error: error instanceof Error ? error.message : "Unknown error occurred",
      data: {
        database: 'error',
        critical_alerts: 0,
        failed_deliveries: 0,
        overall_status: 'down'
      }
    };
  }
}