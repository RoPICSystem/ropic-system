"use server";

import { FloorConfig, ShelfLocation } from "@/components/shelf-selector-3d";
import { createClient } from "@/utils/supabase/server";
import { Inventory, InventoryItem } from "../inventory/actions";
import { formatCode } from '@/utils/floorplan';

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
    group_id: string | null; // Made nullable
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
      throw error;
    }

    if (!data.success) {
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
 * Creates warehouse inventory items from delivered inventory
 */
export async function createWarehouseInventoryItems(
  warehouseUuid: string,
  deliveryUuid: string,
  inventoryItems: Record<string, {
    inventory_uuid: string;
    group_id: string | null;
    location: ShelfLocation;
  }>
) {
  const supabase = await createClient();

  try {
    // Extract inventory item UUIDs from the structure
    const inventoryItemUuids = Object.values(inventoryItems).map(item => item.group_id);

    // Get all inventory items that match the provided UUIDs
    const { data: inventoryItemDetails, error: itemsError } = await supabase
      .from("inventory_items")
      .select("*")
      .in("uuid", inventoryItemUuids);

    if (itemsError) throw itemsError;

    // Group items by inventory_uuid
    const inventoryGroups: Record<string, any[]> = {};
    inventoryItemDetails.forEach(item => {
      if (!inventoryGroups[item.inventory_uuid]) {
        inventoryGroups[item.inventory_uuid] = [];
      }
      inventoryGroups[item.inventory_uuid].push(item);
    });

    // Process each inventory group
    for (const [inventoryUuid, items] of Object.entries(inventoryGroups)) {
      // Get the inventory details
      const { data: inventoryData, error: invError } = await supabase
        .from("inventory")
        .select("*")
        .eq("uuid", inventoryUuid)
        .single();

      if (invError) throw invError;

      // Check if this inventory already exists in the warehouse
      const { data: existingWarehouseInv, error: existingError } = await supabase
        .from("warehouse_inventory_items")
        .select("*")
        .eq("warehouse_uuid", warehouseUuid)
        .eq("inventory_uuid", inventoryUuid)
        .single();

      let warehouseInv;

      if (existingError && existingError.code !== 'PGRST116') {
        throw existingError;
      }

      if (existingWarehouseInv) {
        // Prepare status update logic
        let updatedStatus = existingWarehouseInv.status;
        let updatedStatusHistory = existingWarehouseInv.status_history || {};

        // If current status is USED, change to AVAILABLE and add to history
        if (existingWarehouseInv.status === 'USED') {
          updatedStatus = 'AVAILABLE';
          updatedStatusHistory = {
            ...updatedStatusHistory,
            [new Date().toISOString()]: 'Changed from USED to AVAILABLE'
          };
        }

        // Update existing warehouse inventory item
        const { data: updatedWarehouseInv, error: updateError } = await supabase
          .from("warehouse_inventory_items")
          .update({
            admin_uuid: inventoryData.admin_uuid,
            company_uuid: inventoryData.company_uuid,
            name: inventoryData.name,
            description: inventoryData.description,
            status: updatedStatus,
            status_history: updatedStatusHistory
          })
          .eq("uuid", existingWarehouseInv.uuid)
          .select()
          .single();

        if (updateError) throw updateError;
        warehouseInv = updatedWarehouseInv;
      } else {
        // Create new warehouse inventory item records
        const { data: newWarehouseInv, error: whInvError } = await supabase
          .from("warehouse_inventory_items")
          .insert({
            admin_uuid: inventoryData.admin_uuid,
            warehouse_uuid: warehouseUuid,
            company_uuid: inventoryData.company_uuid,
            inventory_uuid: inventoryUuid,
            name: inventoryData.name,
            description: inventoryData.description,
            measurement_unit: inventoryData.measurement_unit,
            standard_unit: inventoryData.standard_unit,
            status: 'AVAILABLE',
            status_history: {
              [new Date().toISOString()]: 'Created as AVAILABLE'
            }
          })
          .select()
          .single();

        if (whInvError) throw whInvError;
        warehouseInv = newWarehouseInv;
      }

      // Create warehouse inventory items for each inventory item
      const warehouseItemPromises = items.map(async (item) => {
        // Find the matching location for this item
        const inventoryItemEntry = Object.entries(inventoryItems).find(
          ([key, _]) => key === item.uuid
        );
        const location = inventoryItemEntry ? inventoryItemEntry[1].location : null;

        // Create warehouse item
        const { data: warehouseItem, error: whItemError } = await supabase
          .from("warehouse_inventory_item_details")
          .insert({
            company_uuid: inventoryData.company_uuid,
            warehouse_uuid: warehouseUuid,
            inventory_uuid: inventoryUuid,
            inventory_item_uuid: item.uuid,
            delivery_uuid: deliveryUuid,
            warehouse_inventory_uuid: warehouseInv.uuid,
            item_code: item.item_code,
            unit: item.unit,
            unit_value: item.unit_value,
            packaging_unit: item.packaging_unit,
            cost: item.cost,
            location: location,
            properties: item.properties,
            group_id: item.group_id,
            status: 'AVAILABLE',
            status_history: {
              [new Date().toISOString()]: 'Created as AVAILABLE'
            }
          })
          .select()
          .single();

        if (whItemError) throw whItemError;
        return warehouseItem;
      });

      const warehouseItems = await Promise.all(warehouseItemPromises);

      // Update the warehouse inventory with the new item UUIDs
      const existingItemUuids: string[] = [];
      if (existingWarehouseInv && existingWarehouseInv.warehouse_inventory_item_uuids) {
        existingItemUuids.push(...(Array.isArray(existingWarehouseInv.warehouse_inventory_item_uuids)
          ? existingWarehouseInv.warehouse_inventory_item_uuids
          : JSON.parse(existingWarehouseInv.warehouse_inventory_item_uuids)));
      }

      const newItemUuids = warehouseItems.map((item: any) => item.uuid);
      const allItemUuids = [...existingItemUuids, ...newItemUuids];

      // Update the warehouse inventory item with all item UUIDs
      const { data: updatedWarehouseInv, error: updateError } = await supabase
        .from("warehouse_inventory_items")
        .update({
          warehouse_inventory_item_uuids: allItemUuids
        })
        .eq("uuid", warehouseInv.uuid)
        .select()
        .single();

      if (updateError) throw updateError;
    }

    return {
      success: true,
      data: {
        message: 'Warehouse inventory items created successfully'
      }
    };
  } catch (error: Error | any) {
    console.error("Error creating/updating warehouse inventory items:", error);
    return {
      success: false,
      error: `Failed to create/update warehouse inventory items: ${error.message || "Unknown error"}`,
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
 * Fetches delivery history for specific inventories
 */
export async function getDeliveryHistory(inventoryUuids: string[]) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("delivery_items")
      .select("uuid, inventory_items, delivery_date, status, operator_uuids")
      .order("delivery_date", { ascending: false });

    if (error) throw error;

    // Filter deliveries that contain any of the specified inventory UUIDs
    const filteredData = data?.filter(delivery => {
      if (!delivery.inventory_items) return false;

      const deliveryInventoryUuids = Object.values(delivery.inventory_items as Record<string, {
        inventory_uuid: string;
        group_id: string | null;
        location: ShelfLocation;
      }>).map(item => item.inventory_uuid);

      return inventoryUuids.some(uuid => deliveryInventoryUuids.includes(uuid));
    }) || [];

    return {
      success: true,
      data: filteredData
    };
  } catch (error: any) {
    console.error("Error fetching delivery history:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch delivery history",
      data: []
    };
  }
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
