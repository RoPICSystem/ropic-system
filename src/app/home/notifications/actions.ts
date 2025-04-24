"use server";

import { createClient } from "@/utils/supabase/server";

interface NotificationOptions {
  companyUuid?: string;
  page?: number;
  pageSize?: number;
  type?: string;
  read?: boolean;
}

/**
 * Fetches notifications with filtering and pagination options
 */
export async function getNotifications(options: NotificationOptions) {
  const { companyUuid, page = 1, pageSize = 10, type, read } = options;
  const supabase = await createClient();

  try {
    // Calculate pagination values
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Start building the query
    let query = supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply filters
    if (companyUuid) {
      query = query.eq("company_uuid", companyUuid);
    }

    if (type) {
      query = query.eq("type", type);
    }

    if (read !== undefined) {
      query = query.eq("read", read);
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
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("company_uuid", companyUuid || "");

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
 * Counts unread notifications for a company
 */
export async function countUnreadNotifications(companyUuid: string) {
  const supabase = await createClient();

  try {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("company_uuid", companyUuid)
      .eq("read", false);

    if (error) {
      throw error;
    }

    return { success: true, count: count || 0 };
  } catch (error) {
    console.error("Error counting unread notifications:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      count: 0
    };
  }
}