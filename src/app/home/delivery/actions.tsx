"use server";

import { FloorConfig, ShelfLocation } from "@/components/shelf-selector-3d";
import { createClient } from "@/utils/supabase/server";
import { InventoryItem } from "../inventory/actions";
import { formatCode } from '@/utils/floorplan';


export interface DeliveryItem {
  uuid: string;

  admin_uuid: string | null;
  company_uuid: string | null;
  inventory_uuid: string | null;
  warehouse_uuid: string | null;
  inventory_item_bulk_uuids: string[]; // New field for selected bulks

  name?: string;
  delivery_address: string;
  delivery_date: string;
  notes: string;
  status: string;
  status_history?: Record<string, string>;
  locations: any[]; // Changed from location to locations array
  location_codes: string[]; // Changed from location_code to location_codes array
  operator_uuids?: string[]; // Changed from operator_uuid to operator_uuids array

  created_at: string;
  updated_at: string;
}

export interface Operator {
  uuid: string;
  email: string;
  full_name: string;
  phone_number: string;
}

export interface Address {
  code: string;
  desc: string;
}

/**
 * Creates a new delivery item in the database
 */

export async function createDeliveryItem(
  formData: Pick<
    DeliveryItem,
    "admin_uuid" | "company_uuid" | "inventory_uuid" | "warehouse_uuid" |
    "delivery_address" | "delivery_date" | "notes" | "status" | "status_history" |
    "name" | "locations" | "location_codes" | "operator_uuids">) { 
  const supabase = await createClient();

  try {
    // Create the delivery item
    const { data, error } = await supabase
      .from("delivery_items")
      .insert(formData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error: Error | any) {
    console.error("Error creating delivery item:", error);
    return {
      success: false,
      error: `Failed to create delivery item: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Get operator details by UUIDs
 */
export async function getOperatorDetails(operatorUuids: string[]) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('uuid, email, full_name, phone_number')
      .in('uuid', operatorUuids);

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error: Error | any) {
    console.error('Error fetching operator details:', error);
    return {
      success: false,
      error: `Failed to fetch operator details: ${error.message || "Unknown error"}`,
      data: []
    };
  }
}

/**
 * Updates an existing delivery item in the database
 */
export async function updateDeliveryItem(
  uuid: string,
  formData: Partial<DeliveryItem>
) {
  const supabase = await createClient();

  try {
    // Update the delivery item
    const { data, error } = await supabase
      .from("delivery_items")
      .update(formData)
      .eq("uuid", uuid)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error: Error | any) {
    console.error("Error updating delivery item:", error);
    return {
      success: false,
      error: `Failed to update delivery item: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Updates the status of an inventory item
 */
export async function updateInventoryItemStatus(inventoryItemUuid: string, status: string) {
  const supabase = await createClient();

  try {
    // Update the inventory item status
    const { data, error } = await supabase
      .from("inventory_items")
      .update({ status })
      .eq("uuid", inventoryItemUuid)
      .select();

    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error: Error | any) {
    console.error("Error updating inventory item status:", error);
    return {
      success: false,
      error: `Failed to update inventory item status: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Updates the status of inventory item units associated with specific bulks
 */
export async function updateInventoryItemUnitsStatus(bulkUuids: string[], status: string) {
  const supabase = await createClient();

  try {
    // Update all units that are associated with the specified bulks
    const { data, error } = await supabase
      .from("inventory_item_unit")
      .update({ status })
      .in("inventory_item_bulk_uuid", bulkUuids)
      .select()


    if (error) {
      throw error;
    }

    return { success: true, data };
  } catch (error: Error | any) {
    console.error("Error updating unit statuses:", error);
    return {
      success: false,
      error: `Failed to update unit statuses: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Updates the status of inventory item bulks and their associated units
 */
export async function updateInventoryItemBulksStatus(bulkUuids: string[], status: string) {
  const supabase = await createClient();

  try {
    // Update each bulk status
    const { data, error } = await supabase
      .from("inventory_item_bulk")
      .update({ status })
      .in("uuid", bulkUuids)
      .select();

    if (error) {
      throw error;
    }

    // Also update all associated units
    await updateInventoryItemUnitsStatus(bulkUuids, status);

    return { success: true, data };
  } catch (error: Error | any) {
    console.error("Error updating bulk statuses:", error);
    return {
      success: false,
      error: `Failed to update bulk statuses: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Fetches delivery items with flexible filtering options
 */
export async function getDeliveryItems(
  companyUuid?: string,
  search: string = "",
  status?: string | null,
  warehouseUuid?: string | null,
  operatorUuids?: string[] | null,
  inventoryUuid?: string | null,
  dateFrom?: string | null,
  dateTo?: string | null,
  year?: number | null,
  month?: number | null,
  week?: number | null,
  day?: number | null,
  limit: number = 10,
  offset: number = 0
) {
  const supabase = await createClient();

  try {
    const currentPage = Math.floor(offset / limit) + 1;

    const { data, error } = await supabase
      .rpc('get_delivery_items', {
        p_company_uuid: companyUuid || null,
        p_search: search || '',
        p_status: status || null,
        p_warehouse_uuid: warehouseUuid || null,
        p_operator_uuids: operatorUuids || null, // Changed parameter name
        p_inventory_uuid: inventoryUuid || null,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
        p_year: year || null,
        p_month: month || null,
        p_week: week || null,
        p_day: day || null,
        p_limit: limit,
        p_offset: offset
      });

    if (error) {
      throw error;
    }

    // Extract total count and remove from each item
    const totalCount = data && data.length > 0 ? data[0].total_count : 0;

    // Calculate total pages and has more
    const totalPages = Math.ceil(totalCount / limit);
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
    console.error("Error fetching delivery items:", error);
    return {
      success: false,
      data: [],
      totalCount: 0,
      hasMore: false,
      currentPage: 1,
      totalPages: 0,
      error: `Failed to fetch delivery items: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Fetches available inventory items for delivery
 */
export async function getInventoryItems(companyUuid?: string, search: string = "") {
  const supabase = await createClient();

  try {
    // Start building the query
    let query = supabase
      .from("inventory_items")
      .select("*")
      .order("created_at", { ascending: false });

    // Apply company filter if provided
    if (companyUuid) {
      query = query.eq("company_uuid", companyUuid);
    }

    // Apply search filter if provided
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,description.ilike.%${search}%,status.ilike.%${search}%`
      );
    }

    // Execute the query
    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data || []
    };
  } catch (error: Error | any) {
    console.error("Error fetching inventory items:", error);
    return {
      success: false,
      data: [],
      error: `Failed to fetch inventory items: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Fetches available inventory item bulks for an inventory item
 */
export async function getInventoryItemBulks(inventoryItemUuid: string, getItemsInWarehouse: boolean = false, condition: string = "") {
  const supabase = await createClient();

  try {
    let query = supabase
      .from("inventory_item_bulk")
      .select("*")
      .eq("inventory_uuid", inventoryItemUuid)
      .order("created_at", { ascending: false });

    if (!getItemsInWarehouse)
      query = query.neq("status", "IN_WAREHOUSE");

    if (condition) {
      query = query.or(`${condition}`);
    }


    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data || []
    };
  } catch (error: Error | any) {
    console.error("Error fetching inventory item bulks:", error);
    return {
      success: false,
      data: [],
      error: `Failed to fetch inventory item bulks: ${error.message || "Unknown error"}`,
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


// Get operators (users with isAdmin = false)
export async function getOperators(companyUuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('uuid, email, full_name, phone_number')
      .eq('company_uuid', companyUuid)
      .eq('is_admin', false);

    if (error) throw error;

    return { success: true, data };
  } catch (error: Error | any) {
    console.error('Error fetching operators:', error);
    return {
      success: false,
      error: `Failed to fetch operators: ${error.message || "Unknown error"}`,
    };
  }
}

// Get warehouses
export async function getWarehouses(companyUuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('company_uuid', companyUuid);

    if (error) throw error;

    return { success: true, data };
  } catch (error: Error | any) {
    console.error('Error fetching warehouses:', error);
    return {
      success: false,
      error: `Failed to fetch warehouses: ${error.message || "Unknown error"}`,
    };
  }
}


/**
 * Creates warehouse inventory items from delivered inventory
 */
export async function createWarehouseInventoryItems(
  inventoryUuid: string,
  warehouseUuid: string,
  deliveryUuid: string,
  bulkUuids: string[],
  locations: any[],
  locationCodes: string[]
) {
  const supabase = await createClient();

  try {
    // First get the inventory item details
    const { data: inventoryItem, error: invError } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("uuid", inventoryUuid)
      .single<InventoryItem>();

    if (invError) throw invError;

    // Get all bulks for this inventory item that match the provided UUIDs
    const { data: bulks, error: bulksError } = await supabase
      .from("inventory_item_bulk")
      .select("*, inventory_item_unit(*)")
      .eq("inventory_uuid", inventoryUuid)
      .in("uuid", bulkUuids);

    if (bulksError) throw bulksError;

    // Check if this inventory item already exists in the warehouse
    const { data: existingWarehouseInv, error: existingError } = await supabase
      .from("warehouse_inventory_items")
      .select("*")
      .eq("warehouse_uuid", warehouseUuid)
      .eq("inventory_uuid", inventoryUuid)
      .single();

    let warehouseInv;

    if (existingError && existingError.code !== 'PGRST116') {
      // If there's an error that's not "no rows returned", throw it
      throw existingError;
    }

    if (existingWarehouseInv) {
      // Update existing warehouse inventory item
      // Note: Not updating delivery_uuid as per requirements
      const { data: updatedWarehouseInv, error: updateError } = await supabase
        .from("warehouse_inventory_items")
        .update({
          admin_uuid: inventoryItem.admin_uuid,
          company_uuid: inventoryItem.company_uuid,
          name: inventoryItem.name,
          description: inventoryItem.description
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
          admin_uuid: inventoryItem.admin_uuid,
          warehouse_uuid: warehouseUuid,
          company_uuid: inventoryItem.company_uuid,
          inventory_uuid: inventoryUuid,
          name: inventoryItem.name,
          description: inventoryItem.description,
          unit: inventoryItem.unit,
        })
        .select()
        .single();

      if (whInvError) throw whInvError;
      warehouseInv = newWarehouseInv;
    }

    // Create warehouse inventory bulk items for each bulk
    const warehouseBulkPromises = bulks.map(async (bulk, index) => {
      // Find the matching location for this bulk
      const location = locations[index] || null;
      const locationCode = locationCodes[index] || null;

      // Create warehouse bulk item
      const { data: warehouseBulk, error: whBulkError } = await supabase
        .from("warehouse_inventory_item_bulk")
        .insert({
          company_uuid: inventoryItem.company_uuid,
          warehouse_uuid: warehouseUuid,
          inventory_uuid: inventoryUuid,
          inventory_bulk_uuid: bulk.uuid,
          delivery_uuid: deliveryUuid,
          warehouse_inventory_uuid: warehouseInv.uuid,

          unit: bulk.unit,
          unit_value: bulk.unit_value,
          bulk_unit: bulk.bulk_unit,
          cost: bulk.cost,
          is_single_item: bulk.is_single_item,
          location: location,
          location_code: locationCode,
          properties: bulk.properties
        })
        .select()
        .single();

      if (whBulkError) throw whBulkError;

      // Create warehouse units for this bulk
      if (bulk.inventory_item_unit && bulk.inventory_item_unit.length > 0) {
        const unitPromises = bulk.inventory_item_unit.map(async (unit: any) => {
          const { data: warehouseUnit, error: whUnitError } = await supabase
            .from("warehouse_inventory_item_unit")
            .insert({
              company_uuid: inventoryItem.company_uuid,
              warehouse_uuid: warehouseUuid,
              inventory_uuid: inventoryUuid,
              warehouse_inventory_uuid: warehouseInv.uuid,
              warehouse_inventory_bulk_uuid: warehouseBulk.uuid,
              inventory_unit_uuid: unit.uuid,
              delivery_uuid: deliveryUuid,

              description: unit.description,
              code: unit.code,
              unit_value: unit.unit_value,
              unit: unit.unit,
              name: unit.name || inventoryItem.name,
              cost: unit.cost || bulk.cost / bulk.unit_value,
              location: location,
              location_code: locationCode,
              properties: unit.properties
            })
            .select()
            .single();

          if (whUnitError) {
            console.error("Error creating warehouse unit:", whUnitError);
            throw whUnitError;
          }

          return warehouseUnit;
        });

        try {
          const warehouseUnits = await Promise.all(unitPromises);
          console.log(`Created ${warehouseUnits.length} warehouse units for bulk ${warehouseBulk.uuid}`);
        } catch (unitError) {
          console.error("Failed to create warehouse units:", unitError);
          throw unitError;
        }
      }

      return warehouseBulk;
    });

    const warehouseBulks = await Promise.all(warehouseBulkPromises);

    // Add the new warehouse_inventory_item_bulks to the warehouse inventory item's list
    // First, get existing bulks to append the new ones
    let existingBulkUuids: string[] = [];
    if (existingWarehouseInv && existingWarehouseInv.warehouse_inventory_item_bulks) {
      // If it's a string array, use it directly; if it's a JSON string, parse it
      existingBulkUuids = Array.isArray(existingWarehouseInv.warehouse_inventory_item_bulks)
        ? existingWarehouseInv.warehouse_inventory_item_bulks
        : JSON.parse(existingWarehouseInv.warehouse_inventory_item_bulks);
    }

    const newBulkUuids = warehouseBulks.map((bulk: any) => bulk.uuid);
    const allBulkUuids = [...existingBulkUuids, ...newBulkUuids];

    // Update the warehouse inventory item with all bulk UUIDs
    const { data: updatedWarehouseInv, error: updateError } = await supabase
      .from("warehouse_inventory_items")
      .update({
        warehouse_inventory_item_bulks: allBulkUuids
      })
      .eq("uuid", warehouseInv.uuid)
      .select()
      .single();

    if (updateError) throw updateError;

    return {
      success: true,
      data: {
        warehouseInventory: updatedWarehouseInv,
        warehouseBulks
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

export async function getWarehouseInventoryItems(warehouseUuid: string, deliveryUuid: string) {
  const supabase = await createClient();
  try {
    const { data, error } = await supabase
      .from("warehouse_inventory_items")
      .select(`
        *,
        warehouse_inventory_item_bulk(*)
      `)
      .eq("warehouse_uuid", warehouseUuid)
      .eq("delivery_uuid", deliveryUuid)
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      data: data || []
    };
  } catch (error: Error | any) {
    console.error("Error fetching warehouse inventory items:", error);
    return {
      success: false,
      data: [],
      error: `Failed to fetch warehouse inventory items: ${error.message || "Unknown error"}`,
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
      .select("locations") // Updated to match the new field name
      .eq("warehouse_uuid", warehouseUuid)
      .neq("status", "CANCELLED");

    if (deliveryError) {
      throw deliveryError;
    }

    // Flatten the array of location arrays and filter nulls
    const occupiedLocations = deliveryData
      .flatMap(item => item.locations || [])
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
 * Helper function to auto-assign shelf locations for bulk items
 * Takes a warehouse layout and returns suggested locations for each bulk
 */
export async function suggestShelfLocations(
  warehouseUuid: string,
  bulkCount: number,
  startingShelf?: { floor: number, group: number, row: number, column: number }
) {
  // Get warehouse layout
  const supabase = await createClient();

  try {
    // Get warehouse data with layout
    const { data: warehouseData, error: warehouseError } = await supabase
      .from('warehouses')
      .select('warehouse_layout')
      .eq('uuid', warehouseUuid)
      .single();

    if (warehouseError) throw warehouseError;

    // Get currently occupied locations
    const { data: occupiedLocations } = await getOccupiedShelfLocations(warehouseUuid);

    const layout = warehouseData.warehouse_layout as FloorConfig[];
    const suggestions: any[] = [];

    // Start from the specified shelf or default to first shelf
    let currentFloor = startingShelf?.floor || 0;
    let currentGroup = startingShelf?.group || 0;
    let currentRow = startingShelf?.row || 0;
    let currentColumn = startingShelf?.column || 0;
    let currentDepth = 0;

    // Logic to find available shelves
    for (let i = 0; i < bulkCount; i++) {
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

        // Check if this location is occupied
        const isOccupied = occupiedLocations?.some((loc: any) =>
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
            // Include max values for reference
            max_group: groups.length - 1,
            max_row: currentGroupData.rows - 1,
            max_column: currentGroupData.width - 1,
            max_depth: currentGroupData.depth - 1
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

    // Generate location codes for each suggested location
    const locationCodes = suggestions.map(loc => formatCode(loc));

    return {
      success: true,
      data: {
        locations: suggestions,
        locationCodes: locationCodes
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

// Helper function to process groups matrix (copied from shelf-selector-3d.tsx)
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

// Add this function to the existing actions.tsx file

/**
 * Fetches delivery history for a specific inventory item
 */
export async function getDeliveryHistory(inventoryUuid: string) {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("delivery_items")
      .select("uuid, inventory_uuid, delivery_date, status, location_codes, operator_uuids")
      .eq("inventory_uuid", inventoryUuid)
      .order("delivery_date", { ascending: false });

    if (error) throw error;

    return {
      success: true,
      data: data || []
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
 * Fetches detailed information about a specific bulk including its units
 */
export async function getBulkDetails(bulkUuid: string) {
  const supabase = await createClient();

  try {
    // First get the bulk details
    const { data: bulkData, error: bulkError } = await supabase
      .from("inventory_item_bulk")
      .select("*")
      .eq("uuid", bulkUuid)
      .single();

    if (bulkError) {
      throw bulkError;
    }

    // Then get all units associated with this bulk
    const { data: unitsData, error: unitsError } = await supabase
      .from("inventory_item_unit")
      .select("*")
      .eq("inventory_item_bulk_uuid", bulkUuid)
      .order("created_at", { ascending: true });

    if (unitsError) {
      throw unitsError;
    }

    // Combine bulk data with its units
    const bulkWithUnits = {
      ...bulkData,
      inventory_item_units: unitsData || []
    };

    return { success: true, data: bulkWithUnits };
  } catch (error: Error | any) {
    console.error("Error fetching bulk details:", error);
    return {
      success: false,
      error: `Failed to fetch bulk details: ${error.message || "Unknown error"}`,
    };
  }
}