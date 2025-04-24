"use server";

import { createClient } from "@/utils/supabase/server";

interface NotificationOptions {
  companyUuid?: string;
  page?: number;
  pageSize?: number;
  type?: string;
  userUuid?: string;
  isAdmin?: boolean;
}

/**
 * Fetches notifications with filtering and pagination options
 */
export async function getNotifications(options: NotificationOptions) {
  const { companyUuid, page = 1, pageSize = 10, type, userUuid, isAdmin = false } = options;
  const supabase = await createClient();

  try {
    // Calculate pagination values
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Start building the query - use a regular select without joins
    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply filters
    if (companyUuid) {
      query = query.eq("company_uuid", companyUuid);
    }

    if (type && type !== "all") {
      query = query.eq("type", type);
    }

    // Filter for admin-only notifications if the user is not an admin
    if (!isAdmin) {
      query = query.eq("is_admin_only", false);
    }

    // Apply pagination
    query = query.range(from, to);

    // Execute the query
    const { data: notifications, error } = await query;

    if (error) {
      throw error;
    }

    if (!notifications || notifications.length === 0) {
      return {
        success: true,
        data: [],
        total: 0
      };
    }

    // Get read status for each notification for the current user
    const { data: readData, error: readError } = await supabase
      .from("notification_reads")
      .select("notification_id")
      .eq("user_uuid", userUuid || "")
      .in("notification_id", notifications.map(n => n.id));

    if (readError) {
      throw readError;
    }

    // Create a set of read notification IDs for efficient lookup
    const readNotificationIds = new Set((readData || []).map(item => item.notification_id));

    // Process notifications with read status
    const data = notifications.map(notification => ({
      ...notification,
      read: readNotificationIds.has(notification.id)
    }));

    // Get total count in a separate query
    const countQuery = supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("company_uuid", companyUuid || "");
    
    // Add admin-only filter if user is not admin
    if (!isAdmin) {
      countQuery.eq("is_admin_only", false);
    }
    
    const { count: totalCount } = await countQuery;

    return {
      success: true,
      data: data || [],
      total: totalCount || 0
    };
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : "Unknown error occurred",
      total: 0
    };
  }
}

/**
 * Marks a notification as read for a specific user
 */
export async function markNotificationAsRead(notificationId: string, userUuid: string) {
  const supabase = await createClient();

  try {
    // Insert into notification_reads, ignore if already exists
    const { error } = await supabase
      .from("notification_reads")
      .upsert(
        { 
          notification_id: notificationId, 
          user_uuid: userUuid,
          read_at: new Date().toISOString()
        },
        { onConflict: 'notification_id,user_uuid' }
      );

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
    // Get notifications for this company that aren't already read by this user
    const { data: unreadNotifications, error: fetchError } = await supabase
      .from("notifications")
      .select("id")
      .eq("company_uuid", companyUuid)
      .in("id", notificationIds);

    if (fetchError) {
      throw fetchError;
    }

    if (!unreadNotifications || unreadNotifications.length === 0) {
      return { success: true, count: 0 };
    }

    // Create read entries for all unread notifications
    const readEntries = unreadNotifications.map(notif => ({
      notification_id: notif.id,
      user_uuid: userUuid,
      read_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from("notification_reads")
      .upsert(readEntries, { onConflict: 'notification_id,user_uuid' });

    if (error) {
      throw error;
    }

    return { success: true, count: readEntries.length };
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
    // First get all notifications for this company
    let query = supabase
      .from("notifications")
      .select("id")
      .eq("company_uuid", companyUuid);
    
    // If not admin, filter out admin-only notifications
    if (!isAdmin) {
      query = query.eq("is_admin_only", false);
    }
    
    const { data: allNotifications, error: notifError } = await query;

    if (notifError) {
      throw notifError;
    }

    if (!allNotifications || allNotifications.length === 0) {
      return { success: true, count: 0 };
    }

    // Now get all read notifications for this user
    const { data: readNotifications, error: readError } = await supabase
      .from("notification_reads")
      .select("notification_id")
      .eq("user_uuid", userUuid)
      .in("notification_id", allNotifications.map(n => n.id));

    if (readError) {
      throw readError;
    }

    // Calculate unread count
    const readSet = new Set((readNotifications || []).map(r => r.notification_id));
    const unreadCount = allNotifications.filter(n => !readSet.has(n.id)).length;

    return { success: true, count: unreadCount };
  } catch (error) {
    console.error("Error counting unread notifications:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      count: 0
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