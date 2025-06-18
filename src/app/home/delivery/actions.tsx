"use server";

import { FloorConfig, ShelfLocation } from "@/components/shelf-selector-3d";
import { formatCode } from '@/utils/floorplan';
import { createClient } from "@/utils/supabase/server";

export interface DeliveryItem {
  uuid: string;
  admin_uuid: string | null;
  company_uuid: string | null;
  warehouse_uuid: string | null;
  name?: string;
  delivery_address: string;
  delivery_date: string;
  notes: string;
  status: string;
  status_history?: Record<string, string>;
  inventory_items: Record<string, {
    inventory_uuid: string;
    group_id: string | null;
    location: ShelfLocation;
  }>;
  warehouse_inventory_items?: Record<string, {
    warehouse_inventory_uuid: string;
    inventory_uuid: string;
    location: ShelfLocation;
    group_id: string | null;
  }>;
  operator_uuids?: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Creates a delivery with inventory item status updates using RPC
 */
export async function createDeliveryWithItems(
  adminUuid: string,
  companyUuid: string,
  warehouseUuid: string,
  inventoryItems: Record<string, {
    inventory_uuid: string;
    group_id: string | null; // Made nullable
    location: ShelfLocation;
  }>,
  deliveryAddress: string,
  deliveryDate: string,
  operatorUuids: string[] = [],
  notes: string = '',
  name?: string
) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('create_delivery_with_items', {
      p_admin_uuid: adminUuid,
      p_company_uuid: companyUuid,
      p_warehouse_uuid: warehouseUuid,
      p_inventory_items: inventoryItems,
      p_delivery_address: deliveryAddress,
      p_delivery_date: deliveryDate,
      p_operator_uuids: operatorUuids,
      p_notes: notes,
      p_name: name
    });

    if (error) {
      throw error;
    }

    if (!data.success) {
      throw new Error(data.error || 'Failed to create delivery');
    }

    return { success: true, data: data.data };
  } catch (error: Error | any) {
    console.error("Error creating delivery with items:", error);
    return {
      success: false,
      error: `Failed to create delivery: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Updates delivery status with inventory item synchronization using RPC
 */
export async function updateDeliveryStatusWithItems(
  deliveryUuid: string,
  status: string,
  companyUuid?: string
) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('update_delivery_status_with_items', {
      p_delivery_uuid: deliveryUuid,
      p_status: status,
      p_company_uuid: companyUuid
    });

    if (error) {
      throw error;
    }

    if (!data.success) {
      throw new Error(data.error || 'Failed to update delivery status');
    }

    return { success: true, data: data.data };
  } catch (error: Error | any) {
    console.error("Error updating delivery status with items:", error);
    return {
      success: false,
      error: `Failed to update delivery status: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Updates an existing delivery with inventory item status management using RPC
 */
export async function updateDeliveryWithItems(
  deliveryUuid: string,
  inventoryItems: Record<string, {
    inventory_uuid: string;
    group_id: string | null;
    location: ShelfLocation;
  }>,
  deliveryAddress?: string,
  deliveryDate?: string,
  operatorUuids?: string[],
  notes?: string,
  name?: string,
  companyUuid?: string
) {
  const supabase = await createClient();

  try {
    // Debug: Log the inventory items structure
    console.log("Updating delivery with inventory items:", inventoryItems);
    console.log("Keys (should be inventory item UUIDs):", Object.keys(inventoryItems));

    const { data, error } = await supabase.rpc('update_delivery_with_items', {
      p_delivery_uuid: deliveryUuid,
      p_inventory_items: inventoryItems,
      p_delivery_address: deliveryAddress,
      p_delivery_date: deliveryDate,
      p_operator_uuids: operatorUuids,
      p_notes: notes,
      p_name: name,
      p_company_uuid: companyUuid
    });

    if (error) {
      console.error("Supabase RPC error:", error);
      throw error;
    }

    if (!data.success) {
      console.error("RPC returned failure:", data);
      throw new Error(data.error || 'Failed to update delivery');
    }

    return { success: true, data: data.data };
  } catch (error: Error | any) {
    console.error("Error updating delivery with items:", error);
    return {
      success: false,
      error: `Failed to update delivery: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Deletes a delivery item
 */
export async function deleteDeliveryItem(uuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("delivery_items")
      .delete()
      .eq("uuid", uuid)
      .select();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error: Error | any) {
    console.error("Error deleting delivery item:", error);
    return {
      success: false,
      error: `Failed to delete delivery item: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Create warehouse inventory with specific UUID
 */
export async function createWarehouseInventoryWithUuid(
  warehouseInventoryUuid: string,
  warehouseUuid: string,
  inventoryUuid: string,
  companyUuid: string
) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('create_warehouse_inventory_with_uuid', {
      p_warehouse_inventory_uuid: warehouseInventoryUuid,
      p_warehouse_uuid: warehouseUuid,
      p_inventory_uuid: inventoryUuid,
      p_company_uuid: companyUuid
    });

    if (error) {
      throw error;
    }

    return data;
  } catch (error: Error | any) {
    console.error("Error creating warehouse inventory with UUID:", error);
    return {
      success: false,
      error: `Failed to create warehouse inventory: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Gets delivery details with warehouse inventory items structure
 */
export async function getDeliveryDetailsWithWarehouseItems(
  deliveryUuid: string,
  companyUuid?: string
) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('get_delivery_details', {
      p_delivery_uuid: deliveryUuid,
      p_company_uuid: companyUuid
    });

    if (error) {
      throw error;
    }

    if (!data.success) {
      throw new Error(data.error || 'Failed to get delivery details');
    }

    // The delivery details now include warehouse_inventory_items
    return { success: true, data: data.data };
  } catch (error: Error | any) {
    console.error("Error getting delivery details:", error);
    return {
      success: false,
      error: `Failed to get delivery details: ${error.message || "Unknown error"}`,
      data: null
    };
  }
}

export const getWarehouseInventoryUuid = async (warehouseUuid: string, inventoryUuid: string): Promise<string | null> => {
  try {
    const supabase = await createClient();

    // Query warehouse_inventory table to get the actual UUID
    const { data, error } = await supabase
      .from('warehouse_inventory')
      .select('uuid')
      .eq('warehouse_uuid', warehouseUuid)
      .eq('inventory_uuid', inventoryUuid)
      .single();

    if (error) {
      console.error('Error fetching warehouse inventory UUID:', error);
      return null;
    }

    return data?.uuid || null;
  } catch (error) {
    console.error('Error in getWarehouseInventoryUuid:', error);
    return null;
  }
};

/**
 * Generate warehouse inventory items structure for testing/preview
 */
export async function generateWarehouseInventoryItemsStructure(deliveryUuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('generate_warehouse_inventory_items_structure', {
      p_delivery_uuid: deliveryUuid
    });

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error: Error | any) {
    console.error("Error generating warehouse inventory items structure:", error);
    return {
      success: false,
      error: `Failed to generate warehouse inventory items structure: ${error.message || "Unknown error"}`,
      data: {}
    };
  }
}

/**
 * Gets occupied shelf locations
 */
export async function getOccupiedShelfLocations(warehouseUuid: string) {
  const supabase = await createClient();

  try {
    // Get all occupied locations from delivery_items
    const { data: deliveryData, error: deliveryError } = await supabase
      .from("delivery_items")
      .select("inventory_items")
      .eq("warehouse_uuid", warehouseUuid)
      .neq("status", "CANCELLED");

    if (deliveryError) {
      throw deliveryError;
    }

    // Extract locations from inventory_items objects and filter nulls
    const occupiedLocations = deliveryData
      .flatMap(item => {
        if (!item.inventory_items) return [];
        return Object.values(item.inventory_items as Record<string, {
          inventory_uuid: string;
          group_id: string | null;
          location: ShelfLocation;
        }>).map(entry => entry.location);
      })
      .filter(location => location !== null);

    return {
      success: true,
      data: occupiedLocations
    };
  } catch (error: Error | any) {
    console.error("Error fetching occupied shelf locations:", error);
    return {
      success: false,
      error: `Failed to fetch occupied shelf locations: ${error.message || "Unknown error"}`,
      data: []
    };
  }
}

/**
 * Helper function to auto-assign shelf locations for inventory items
 */
export async function suggestShelfLocations(
  warehouseUuid: string,
  itemCount: number,
  startingShelf?: { floor: number, group: number, row: number, column: number, depth: number },
  currentDeliveryLocations?: ShelfLocation[] // Add parameter to exclude current delivery locations
) {
  // Get warehouse layout
  const supabase = await createClient();

  try {
    // Get warehouse data with layout
    const { data: warehouseData, error: warehouseError } = await supabase
      .from('warehouses')
      .select('layout')
      .eq('uuid', warehouseUuid)
      .single();

    if (warehouseError) throw warehouseError;

    // Get currently occupied locations
    const { data: occupiedLocations } = await getOccupiedShelfLocations(warehouseUuid);

    // Filter out locations that belong to the current delivery being edited
    const filteredOccupiedLocations = occupiedLocations?.filter((occupiedLoc: any) => {
      // If currentDeliveryLocations is provided, exclude those locations from occupied list
      if (currentDeliveryLocations && currentDeliveryLocations.length > 0) {
        return !currentDeliveryLocations.some((currentLoc: any) =>
          currentLoc.floor === occupiedLoc.floor &&
          currentLoc.group === occupiedLoc.group &&
          currentLoc.row === occupiedLoc.row &&
          currentLoc.column === occupiedLoc.column &&
          currentLoc.depth === occupiedLoc.depth
        );
      }
      return true;
    }) || [];

    const layout = warehouseData.layout as FloorConfig[];
    const suggestions: any[] = [];

    // Start from the specified shelf or default to first shelf
    let currentFloor = startingShelf?.floor || 0;
    let currentGroup = startingShelf?.group || 0;
    let currentRow = startingShelf?.row || 0;
    let currentColumn = startingShelf?.column || 0;
    let currentDepth = startingShelf?.depth || 0;

    // Logic to find available shelves
    for (let i = 0; i < itemCount; i++) {
      let locationFound = false;

      // Try to find a free location
      while (!locationFound && currentFloor < layout.length) {
        const floorLayout = layout[currentFloor];
        const { groups } = processGroupsMatrix(floorLayout.matrix, currentFloor);

        // Skip if we're beyond available groups
        if (currentGroup >= groups.length) {
          currentGroup = 0;
          currentFloor++;
          continue;
        }

        const currentGroupData = groups[currentGroup];

        // Skip if we're beyond rows in this group
        if (currentRow >= currentGroupData.rows) {
          currentRow = 0;
          currentGroup++;
          continue;
        }

        // Skip if we're beyond columns in this group
        if (currentColumn >= currentGroupData.width) {
          currentColumn = 0;
          currentRow++;
          continue;
        }

        // Skip if we're beyond depth in this group
        if (currentDepth >= currentGroupData.depth) {
          currentDepth = 0;
          currentColumn++;
          continue;
        }

        // Check if this location is occupied (using filtered list)
        const isOccupied = filteredOccupiedLocations?.some((loc: any) =>
          loc.floor === currentFloor &&
          loc.group === currentGroup &&
          loc.row === currentRow &&
          loc.column === currentColumn &&
          loc.depth === currentDepth
        );

        if (!isOccupied) {
          // Found a free location
          suggestions.push({
            floor: currentFloor,
            group: currentGroup,
            row: currentRow,
            column: currentColumn,
            depth: currentDepth,
            code: formatCode({
              floor: currentFloor,
              group: currentGroup,
              row: currentRow,
              column: currentColumn,
              depth: currentDepth,
            })
          });

          locationFound = true;
        }

        // Move to next position
        currentDepth++;
      }

      // If we've gone through all possibilities and couldn't find enough spaces
      if (!locationFound) {
        break; // Stop trying to find more locations
      }
    }

    return {
      success: true,
      data: {
        locations: suggestions
      }
    };

  } catch (error: Error | any) {
    console.error("Error suggesting shelf locations:", error);
    return {
      success: false,
      error: `Failed to suggest shelf locations: ${error.message || "Unknown error"}`,
      data: { locations: [], locationCodes: [] }
    };
  }
}

// Helper function to process groups matrix
function processGroupsMatrix(floorMatrix: number[][], floorIndex: number) {
  const groups = [];
  const groupPositions = [];
  const visited = Array(floorMatrix.length).fill(0).map(() => Array(floorMatrix[0].length).fill(false));
  let groupId = 0;

  for (let i = 0; i < floorMatrix.length; i++) {
    for (let j = 0; j < floorMatrix[i].length; j++) {
      if (floorMatrix[i][j] > 0 && !visited[i][j]) {
        const value = floorMatrix[i][j];
        let minI = i, maxI = i;
        let minJ = j, maxJ = j;

        // BFS to find group extent
        const queue = [[i, j]];
        visited[i][j] = true;

        while (queue.length > 0) {
          const [x, y] = queue.shift()!;

          // Check horizontal connections
          if (y + 1 < floorMatrix[x].length && floorMatrix[x][y + 1] === value && !visited[x][y + 1]) {
            visited[x][y + 1] = true;
            queue.push([x, y + 1]);
            maxJ = Math.max(maxJ, y + 1);
          }

          if (y - 1 >= 0 && floorMatrix[x][y - 1] === value && !visited[x][y - 1]) {
            visited[x][y - 1] = true;
            queue.push([x, y - 1]);
            minJ = Math.min(minJ, y - 1);
          }

          // Check vertical connections
          if (x + 1 < floorMatrix.length && floorMatrix[x + 1][y] === value && !visited[x + 1][y]) {
            visited[x + 1][y] = true;
            queue.push([x + 1, y]);
            maxI = Math.max(maxI, x + 1);
          }

          if (x - 1 >= 0 && floorMatrix[x - 1][y] === value && !visited[x - 1][y]) {
            visited[x - 1][y] = true;
            queue.push([x - 1, y]);
            minI = Math.min(minI, x - 1);
          }
        }

        const width = maxJ - minJ + 1;
        const depth = maxI - minI + 1;

        groups.push({
          id: groupId,
          rows: value,
          width,
          depth,
          position: [minI, minJ],
          minI,
          maxI,
          minJ,
          maxJ
        });

        groupPositions.push([minI, minJ, groupId]);
        groupId++;
      }
    }
  }

  return { groups, groupPositions };
}


/**
 * Fetches detailed information about inventory items
 */
export async function getInventoryItemDetails(inventoryItemUuids: string[]) {
  const supabase = await createClient();

  try {
    const { data: itemsData, error: itemsError } = await supabase
      .from("inventory_items")
      .select("*")
      .in("uuid", inventoryItemUuids)
      .order("created_at", { ascending: true });

    if (itemsError) {
      throw itemsError;
    }

    return { success: true, data: itemsData || [] };
  } catch (error: Error | any) {
    console.error("Error fetching inventory item details:", error);
    return {
      success: false,
      error: `Failed to fetch inventory item details: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Gets detailed delivery information using RPC
 */
export async function getDeliveryDetails(
  deliveryUuid: string,
  companyUuid?: string
) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc('get_delivery_details', {
      p_delivery_uuid: deliveryUuid,
      p_company_uuid: companyUuid
    });

    if (error) {
      throw error;
    }

    if (!data.success) {
      throw new Error(data.error || 'Failed to get delivery details');
    }

    return { success: true, data: data.data };
  } catch (error: Error | any) {
    console.error("Error getting delivery details:", error);
    return {
      success: false,
      error: `Failed to get delivery details: ${error.message || "Unknown error"}`,
      data: null
    };
  }
}
