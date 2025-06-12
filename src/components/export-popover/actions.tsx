"use server";

import { createClient } from "@/utils/supabase/server";

export async function getFilteredExportItems(
  functionName: string,
  params: Record<string, any>
) {
  const supabase = await createClient();

  console.log("Export function:", functionName, params);

  try {
    const { data, error } = await supabase.rpc(functionName, params);

    console.log("Export error:", error);
    if (error) throw error;

    // Extract total count and remove from each item
    const totalCount = data && data.length > 0 ? data[0].total_count : 0;

    // Remove total_count from each item
    const items = data ? data.map(({ total_count, ...item }: any) => item) : [];

    return {
      success: true,
      data: items,
      totalCount
    };
  } catch (error) {
    console.error("Error in getFilteredExportItems:", error);
    return {
      success: false,
      error: (error as Error).message,
      data: [],
      totalCount: 0
    };
  }
}