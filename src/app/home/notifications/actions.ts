"use server";

import { createClient } from "@/utils/supabase/server";

interface NotificationOptions {
  companyUuid?: string;
  userUuid?: string;
  isAdmin?: boolean;
  type?: 'reorder_point_logs' | 'warehouses' | 'warehouse_inventory_items' | 'warehouse_inventory' | 'profiles' | 'inventory_items' | 'inventory' | 'delivery_items' | 'companies';
  action?: 'create' | 'update' | 'delete' | 'status_change';
  read?: boolean;
  limit?: number;
  offset?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Fetches notifications with filtering and pagination options
 */
export async function getNotifications(options: NotificationOptions = {}) {
  const supabase = await createClient();
  
  try {
    let query = supabase
      .from("notifications")
      .select(`
        *,
        user_profile:profiles!notifications_user_uuid_fkey(
          full_name,
          email,
          name
        )
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (options.companyUuid) {
      query = query.eq('company_uuid', options.companyUuid);
    }

    if (options.userUuid) {
      query = query.eq('user_uuid', options.userUuid);
    }

    if (options.type) {
      query = query.eq('type', options.type);
    }

    if (options.action) {
      query = query.eq('action', options.action);
    }

    if (typeof options.read === 'boolean') {
      query = query.eq('read', options.read);
    }

    if (options.search) {
      query = query.or(`entity_name.ilike.%${options.search}%,user_name.ilike.%${options.search}%,details::text.ilike.%${options.search}%`);
    }

    if (options.dateFrom) {
      query = query.gte('created_at', options.dateFrom);
    }

    if (options.dateTo) {
      query = query.lte('created_at', options.dateTo);
    }

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, (options.offset + (options.limit || 50)) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Marks a notification as read for a specific user
 */
export async function markNotificationAsRead(notificationId: string, userUuid: string) {
  const supabase = await createClient();
  
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);
      
    if (error) {
      throw error;
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Marks all notifications as read for a specific user and company
 */
export async function markAllNotificationsAsRead(companyUuid: string, userUuid: string, notificationIds: string[]) {
  const supabase = await createClient();
  
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("company_uuid", companyUuid)
      .in("id", notificationIds);
      
    if (error) {
      throw error;
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Counts unread notifications for a specific user in a company
 */
export async function countUnreadNotifications(companyUuid: string, userUuid: string, isAdmin: boolean = false) {
  const supabase = await createClient();
  
  try {
    let query = supabase
      .from("notifications")
      .select("*", { count: 'exact', head: true })
      .eq("company_uuid", companyUuid)
      .eq("read", false);

    // Filter admin-only notifications based on user role
    if (!isAdmin) {
      query = query.eq("is_admin_only", false);
    }

    const { count, error } = await query;
    
    if (error) {
      throw error;
    }
    
    return { count: count || 0, error: null };
  } catch (error) {
    console.error("Error counting unread notifications:", error);
    return {
      count: 0,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Creates an admin-only notification
 */
export async function createAdminNotification(data: any) {
  const supabase = await createClient();
  
  try {
    const { error } = await supabase
      .from("notifications")
      .insert({
        ...data,
        is_admin_only: true
      });
      
    if (error) {
      throw error;
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error creating admin notification:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Gets notification statistics by type
 */
export async function getNotificationStats(companyUuid: string, isAdmin: boolean = false) {
  const supabase = await createClient();
  
  try {
    let query = supabase
      .from("notifications")
      .select("type, action, read")
      .eq("company_uuid", companyUuid);

    // Filter admin-only notifications based on user role
    if (!isAdmin) {
      query = query.eq("is_admin_only", false);
    }

    const { data, error } = await query;
    
    if (error) {
      throw error;
    }

    // Process the data to create statistics
    const stats = data?.reduce((acc, notification) => {
      const { type, action, read } = notification;
      
      if (!acc[type]) {
        acc[type] = {
          total: 0,
          unread: 0,
          actions: {}
        };
      }
      
      acc[type].total++;
      if (!read) {
        acc[type].unread++;
      }
      
      if (!acc[type].actions[action]) {
        acc[type].actions[action] = { total: 0, unread: 0 };
      }
      
      acc[type].actions[action].total++;
      if (!read) {
        acc[type].actions[action].unread++;
      }
      
      return acc;
    }, {} as Record<string, any>) || {};
    
    return { data: stats, error: null };
  } catch (error) {
    console.error("Error getting notification stats:", error);
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Deletes old notifications (cleanup function)
 */
export async function deleteOldNotifications(companyUuid: string, daysOld: number = 30) {
  const supabase = await createClient();
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("company_uuid", companyUuid)
      .eq("read", true)
      .lt("created_at", cutoffDate.toISOString());
      
    if (error) {
      throw error;
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error deleting old notifications:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}

/**
 * Gets notification details with related entity information
 */
export async function getNotificationDetails(notificationId: string) {
  const supabase = await createClient();
  
  try {
    const { data: notification, error } = await supabase
      .from("notifications")
      .select(`
        *,
        user_profile:profiles!notifications_user_uuid_fkey(
          full_name,
          email,
          name,
          profile_image
        )
      `)
      .eq("id", notificationId)
      .single();

    if (error) {
      throw error;
    }

    // Fetch additional related entity data based on type
    let entityData = null;
    if (notification.type && notification.entity_id) {
      try {
        switch (notification.type) {
          case 'inventory':
            const { data: inventoryData } = await supabase
              .from("inventory")
              .select("*")
              .eq("uuid", notification.entity_id)
              .single();
            entityData = inventoryData;
            break;
            
          case 'inventory_items':
            const { data: inventoryItemData } = await supabase
              .from("inventory_items")
              .select(`
                *,
                inventory:inventory(name, description)
              `)
              .eq("uuid", notification.entity_id)
              .single();
            entityData = inventoryItemData;
            break;
            
          case 'warehouse_inventory':
            const { data: warehouseInventoryData } = await supabase
              .from("warehouse_inventory")
              .select(`
                *,
                warehouse:warehouses(name, address),
                inventory:inventory(name, description)
              `)
              .eq("uuid", notification.entity_id)
              .single();
            entityData = warehouseInventoryData;
            break;
            
          case 'warehouse_inventory_items':
            const { data: warehouseItemData } = await supabase
              .from("warehouse_inventory_items")
              .select(`
                *,
                warehouse:warehouses(name, address),
                inventory:inventory(name, description)
              `)
              .eq("uuid", notification.entity_id)
              .single();
            entityData = warehouseItemData;
            break;
            
          case 'delivery_items':
            const { data: deliveryData } = await supabase
              .from("delivery_items")
              .select(`
                *,
                warehouse:warehouses(name, address)
              `)
              .eq("uuid", notification.entity_id)
              .single();
            entityData = deliveryData;
            break;
            
          case 'reorder_point_logs':
            const { data: reorderData } = await supabase
              .from("reorder_point_logs")
              .select(`
                *,
                warehouse:warehouses(name, address),
                inventory:inventory(name, description),
                warehouse_inventory:warehouse_inventory(name)
              `)
              .eq("uuid", notification.entity_id)
              .single();
            entityData = reorderData;
            break;
            
          case 'warehouses':
            const { data: warehouseData } = await supabase
              .from("warehouses")
              .select("*")
              .eq("uuid", notification.entity_id)
              .single();
            entityData = warehouseData;
            break;
            
          case 'profiles':
            const { data: profileData } = await supabase
              .from("profiles")
              .select(`
                *,
                company:companies(name)
              `)
              .eq("uuid", notification.entity_id)
              .single();
            entityData = profileData;
            break;
            
          case 'companies':
            const { data: companyData } = await supabase
              .from("companies")
              .select("*")
              .eq("uuid", notification.entity_id)
              .single();
            entityData = companyData;
            break;
        }
      } catch (entityError) {
        console.warn("Error fetching entity data:", entityError);
        // Continue without entity data
      }
    }

    return { 
      data: { 
        ...notification, 
        entity_data: entityData 
      }, 
      error: null 
    };
  } catch (error) {
    console.error("Error getting notification details:", error);
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}