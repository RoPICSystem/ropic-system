"use server";

import { createClient } from "@/utils/supabase/server";

export async function getFilteredItems(
  functionName: string,
  params: Record<string, any>
) {
  const supabase = await createClient();

  try {
    let retryCount = 0;
    const maxRetries = 3;
    let data, error;

    while (retryCount < maxRetries) {
      try {
        const result = await supabase.rpc(functionName, params);
        data = result.data;
        error = result.error;
        break;
      } catch (err: any) {
        retryCount++;
        if (err.message?.includes('timeout') && retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          continue;
        }
        error = err;
        break;
      }
    }

    if (error) throw error;

    // Extract total count and remove from each item
    const totalCount = data && data.length > 0 ? data[0].total_count : 0;
    const currentPage = Math.floor(params.p_offset / params.p_limit) + 1;

    // Calculate total pages and has more
    const totalPages = Math.ceil(totalCount / params.p_limit);
    const hasMore = currentPage < totalPages;

    // Remove total_count from each item
    const items = data ? data.map(({ total_count, ...item }: any) => item) : [];

    return {
      success: true,
      data: items,
      totalCount,
      hasMore,
      currentPage,
      totalPages
    };
  } catch (error: Error | any) {
    return {
      success: false,
      data: [],
      totalCount: 0,
      hasMore: false,
      currentPage: 1,
      totalPages: 0,
      error: `Failed to fetch items: ${error.message || "Unknown error"}`,
    };
  }
}