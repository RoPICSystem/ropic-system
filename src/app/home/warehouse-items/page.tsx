"use client";

import { createClient } from "@/utils/supabase/client";
import {
  Accordion,
  AccordionItem,
  AutocompleteItem,
  Autocomplete,
  Button,
  Chip,
  Input,
  Kbd,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollShadow,
  Skeleton,
  Spinner,
  Textarea,
  Tooltip,
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import React, { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialLight, materialDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';

// Import server actions
import CardList from "@/components/card-list";
import { motionTransition, popoverTransition } from "@/utils/anim";
import {
  getWarehouseInventoryItems,
  getWarehouseInventoryItem,
  getWarehouseItemByInventory,
  getWarehouses,
  getWarehouseInventoryItemBulks,
  getWarehouseInventoryItemUnits,
  WarehouseInventoryItem,
  WarehouseInventoryItemBulk,
  WarehouseInventoryItemUnit,
} from "./actions";
import { getOccupiedShelfLocations } from "../delivery/actions";
import { formatCode, parseColumn } from '@/utils/floorplan';
import { copyToClipboard, formatDate, formatNumber } from "@/utils/tools";
// Lazy load 3D shelf selector
const ShelfSelector3D = memo(lazy(() =>
  import("@/components/shelf-selector-3d").then(mod => ({
    default: mod.ShelfSelector3D
  }))
));

export default function WarehouseItemsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isLoadingBulks, setIsLoadingBulks] = useState(false);
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);

  // Warehouse items state
  const [warehouseItems, setWarehouseItems] = useState<WarehouseInventoryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Bulks and units state
  const [itemBulks, setItemBulks] = useState<WarehouseInventoryItemBulk[]>([]);
  const [itemUnits, setItemUnits] = useState<WarehouseInventoryItemUnit[]>([]);

  // Expanded accordion state
  const [expandedBulks, setExpandedBulks] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());

  // QR code modal state
  const qrCodeModal = useDisclosure();
  const locationModal = useDisclosure();

  // Add this state for location modal
  const [selectedBulkForLocation, setSelectedBulkForLocation] = useState<WarehouseInventoryItemBulk | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<WarehouseInventoryItem>>({});

  // 3D shelf selector states
  const [floorConfigs, setFloorConfigs] = useState<any[]>([]);
  const [occupiedLocations, setOccupiedLocations] = useState<any[]>([]);
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(null);
  const [externalSelection, setExternalSelection] = useState<any | undefined>(undefined);
  const [shelfColorAssignments, setShelfColorAssignments] = useState<Array<any>>([]);

  const [isSearchFilterOpen, setIsSearchFilterOpen] = useState(false);

  // Add this derived state
  const [locationCode, setLocationCode] = useState("");

  // Add state for maximum values
  const [maxGroupId, setMaxGroupId] = useState(0);
  const [maxRow, setMaxRow] = useState(0);
  const [maxColumn, setMaxColumn] = useState(0);
  const [maxDepth, setMaxDepth] = useState(0);
  const [isSelectedLocationOccupied, setIsSelectedLocationOccupied] = useState(false);

  const [showControls, setShowControls] = useState(false);

  // Add near your other state variables
  const [currentBulkIndex, setCurrentBulkIndex] = useState<number | null>(null);

  // Input style for consistency
  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  const autoCompleteStyle = { classNames: inputStyle };

  // Generate item JSON for QR code
  const generateItemJson = (space: number = 0) => {
    if (!selectedItemId || !formData) return "{}";

    // Create a clean object with essential properties
    const data = {
      uuid: formData.uuid,
      inventory_uuid: formData.inventory_uuid,
      warehouse_uuid: formData.warehouse_uuid,
      company_uuid: formData.company_uuid,
      name: formData.name
    };

    return JSON.stringify(data, null, space);
  };

  const handleViewBulkLocation = (bulk: WarehouseInventoryItemBulk) => {
    setSelectedBulkForLocation(bulk);

    // Prepare the 3D visualization data
    if (bulk.location) {
      // Set the highlighted floor
      setHighlightedFloor(bulk.location.floor || 0);

      // Set up external selection to highlight this location
      setExternalSelection(bulk.location);

      // Generate location code
      setLocationCode(formatCode(bulk.location));

      // Find the index of the selected bulk in the itemBulks array
      const bulkIndex = itemBulks.findIndex(b => b.uuid === bulk.uuid);
      setCurrentBulkIndex(bulkIndex);

      // Load warehouse configuration if not already loaded
      if (floorConfigs.length === 0) {
        loadWarehouseConfiguration(formData.warehouse_uuid as string);
      }
    }

    locationModal.onOpen();
  };

  // Add these handler functions
  const handleShelfSelection = (location: any) => {
    // Set the highlighted floor
    setHighlightedFloor(location.floor || 0);

    // Set external selection directly
    setExternalSelection(location);

    // Generate location code
    setLocationCode(formatCode(location));

    // Update maximum values if available
    if (location.max_group !== undefined) setMaxGroupId(location.max_group);
    if (location.max_row !== undefined) setMaxRow(location.max_row);
    if (location.max_column !== undefined) setMaxColumn(location.max_column);
    if (location.max_depth !== undefined) setMaxDepth(location.max_depth);
  };

  const handleFloorChange = (floorNum: number) => {
    const floorIndex = floorNum - 1;
    setHighlightedFloor(floorIndex);

    // Update the external selection with the new floor
    if (externalSelection) {
      const newSelection = {
        ...externalSelection,
        floor: floorIndex
      };
      setExternalSelection(newSelection);
      setLocationCode(formatCode(newSelection));
    }
  };

  const handleGroupChange = (groupId: number) => {
    const adjustedId = groupId - 1;

    if (externalSelection) {
      const newSelection = {
        ...externalSelection,
        group: adjustedId
      };
      setExternalSelection(newSelection);
      setLocationCode(formatCode(newSelection));
    }
  };

  const handleRowChange = (rowNum: number) => {
    const adjustedRow = rowNum - 1;

    if (externalSelection) {
      const newSelection = {
        ...externalSelection,
        row: adjustedRow
      };
      setExternalSelection(newSelection);
      setLocationCode(formatCode(newSelection));
    }
  };

  const handleColumnChange = (colNum: number) => {
    const adjustedCol = colNum - 1;

    if (externalSelection) {
      const newSelection = {
        ...externalSelection,
        column: adjustedCol
      };
      setExternalSelection(newSelection);
      setLocationCode(formatCode(newSelection));
    }
  };

  const handleDepthChange = (depthNum: number) => {
    const adjustedDepth = depthNum - 1;

    if (externalSelection) {
      const newSelection = {
        ...externalSelection,
        depth: adjustedDepth
      };
      setExternalSelection(newSelection);
      setLocationCode(formatCode(newSelection));
    }
  };

  // Function to load warehouse configuration
  const loadWarehouseConfiguration = async (warehouseId: string) => {
    try {
      // Find the warehouse in the list
      const warehouse = warehouses.find(w => w.uuid === warehouseId);
      if (warehouse && warehouse.warehouse_layout) {
        setFloorConfigs(warehouse.warehouse_layout);

        // Load occupied locations
        const occupiedResult = await getOccupiedShelfLocations(warehouseId);
        if (occupiedResult.success) {
          setOccupiedLocations(occupiedResult.data || []);
        }
      }
    } catch (error) {
      console.error("Error loading warehouse configuration:", error);
    }
  };

  // Handle item search
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    try {
      setIsLoadingItems(true);
      const result = await getWarehouseInventoryItems(
        user.company_uuid,
        selectedWarehouse || undefined,
        query
      );
      setWarehouseItems(result.data || []);
    } catch (error) {
      console.error("Error searching warehouse items:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Handle warehouse filter change
  const handleWarehouseChange = async (warehouseId: string | null) => {
    setSelectedWarehouse(warehouseId);
    try {
      setIsLoadingItems(true);
      const result = await getWarehouseInventoryItems(
        user.company_uuid,
        warehouseId || undefined,
        searchQuery
      );
      setWarehouseItems(result.data || []);
    } catch (error) {
      console.error("Error filtering by warehouse:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // In handleSelectItem function, just update the URL
  const handleSelectItem = (key: string) => {
    setSelectedItemId(key);
    // Update the URL with the selected item ID without reloading the page
    const params = new URLSearchParams(searchParams.toString());
    params.set("warehouseItemId", key);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle view inventory details
  const handleViewInventory = () => {
    if (formData.inventory_uuid) {
      router.push(`/home/inventory?itemId=${formData.inventory_uuid}`);
    }
  };

  // Handle view warehouse details
  const handleViewWarehouse = () => {
    if (formData.warehouse_uuid) {
      router.push(`/home/warehouses?warehouseId=${formData.warehouse_uuid}`);
    }
  };

  // Handle view delivery details
  const handleViewDelivery = (deliveryId: string) => {
    router.push(`/home/delivery?deliveryId=${deliveryId}`);
  };

  // Function to load bulks for an item
  const loadItemBulks = async (itemId: string) => {
    setIsLoadingBulks(true);
    try {
      const result = await getWarehouseInventoryItemBulks(itemId);
      if (result.success) {
        setItemBulks(result.data || []);
        // Pre-select the first bulk to show units
        if (result.data?.length > 0) {
          setExpandedBulks(new Set([result.data[0].uuid]));
          await loadItemUnits(result.data[0].uuid);
        }
      } else {
        setItemBulks([]);
      }
    } catch (error) {
      console.error("Error loading warehouse item bulks:", error);
      setItemBulks([]);
    } finally {
      setIsLoadingBulks(false);
    }
  };

  // Function to load units for a bulk
  const loadItemUnits = async (bulkId: string) => {
    setIsLoadingUnits(true);
    try {
      const result = await getWarehouseInventoryItemUnits(bulkId);
      if (result.success) {
        setItemUnits(result.data || []);
        // If there are units, expand the first one
        if (result.data?.length > 0) {
          setExpandedUnits(new Set([result.data[0].uuid]));
        }
      } else {
        setItemUnits([]);
      }
    } catch (error) {
      console.error("Error loading warehouse item units:", error);
      setItemUnits([]);
    } finally {
      setIsLoadingUnits(false);
    }
  };


  const filteredOccupiedLocations = useMemo(() => {
    return occupiedLocations.filter(loc =>
      !shelfColorAssignments.some(
        assignment =>
          assignment.floor === loc.floor &&
          assignment.group === loc.group &&
          assignment.row === loc.row &&
          assignment.column === loc.column &&
          assignment.depth === (loc.depth || 0)
      )
    );
  }, [occupiedLocations, shelfColorAssignments]);

  // Add or update useEffect to watch for changes in search parameters
  useEffect(() => {
    if (!user?.company_uuid || isLoadingItems) return;

    const warehouseItemId = searchParams.get("warehouseItemId");
    const inventoryItemId = searchParams.get("itemId");

    // Handle both warehouseItemId and itemId params
    const fetchItemDetails = async () => {
      if (warehouseItemId) {
        // Get warehouse item by its UUID
        const result = await getWarehouseInventoryItem(warehouseItemId);
        if (result.success && result.data) {
          setSelectedItemId(warehouseItemId);
          setFormData(result.data);

          // Load bulks for this item
          await loadItemBulks(warehouseItemId);

          // If the item has a warehouse_uuid, load its configuration
          if (result.data.warehouse_uuid) {
            await loadWarehouseConfiguration(result.data.warehouse_uuid);
          }
        }
      } else if (inventoryItemId) {
        // Get warehouse item by inventory UUID
        const result = await getWarehouseItemByInventory(inventoryItemId);
        if (result.success && result.data) {
          setSelectedItemId(result.data.uuid);
          setFormData(result.data);

          // Load bulks for this item
          await loadItemBulks(result.data.uuid);

          // If the item has a warehouse_uuid, load its configuration
          if (result.data.warehouse_uuid) {
            await loadWarehouseConfiguration(result.data.warehouse_uuid);
          }

          // Update URL to use warehouseItemId for consistency
          const params = new URLSearchParams(searchParams.toString());
          params.delete("itemId");
          params.set("warehouseItemId", result.data.uuid);
          router.push(`?${params.toString()}`, { scroll: false });
        } else {
          // If no warehouse item found for this inventory, clear selection
          setSelectedItemId(null);
          setFormData({});
          setItemBulks([]);
          setItemUnits([]);
        }
      } else {
        // No item selected
        setSelectedItemId(null);
        setFormData({});
        setItemBulks([]);
        setItemUnits([]);
      }
    };

    fetchItemDetails();
  }, [searchParams, user?.company_uuid, isLoadingItems]);

  // Initialize page data
  useEffect(() => {
    const initPage = async () => {
      try {
        setUser(window.userData);

        // Fetch warehouse items
        const itemsResult = await getWarehouseInventoryItems(window.userData.company_uuid);
        setWarehouseItems(itemsResult.data || []);

        // Fetch warehouses for filtering
        const warehousesResult = await getWarehouses(window.userData.company_uuid);
        setWarehouses(warehousesResult.data || []);

        setIsLoadingItems(false);
      } catch (error) {
        console.error("Error initializing page:", error);
      }
    };

    initPage();
  }, []);

  // Set up real-time updates
  useEffect(() => {
    if (!user?.company_uuid) return;

    const supabase = createClient();

    // Set up real-time subscription for warehouse inventory items
    const warehouseInventoryChannel = supabase
      .channel('warehouse-inventory-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'warehouse_inventory_items',
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async (payload) => {
          console.log('Real-time warehouse inventory update received:', payload);

          // Refresh warehouse items
          const refreshedItems = await getWarehouseInventoryItems(
            user.company_uuid,
            selectedWarehouse || undefined,
            searchQuery
          );
          setWarehouseItems(refreshedItems.data || []);

          // If we have a selected item, refresh its details including bulks and units
          if (selectedItemId) {
            const refreshedItem = await getWarehouseInventoryItem(selectedItemId);
            if (refreshedItem.success && refreshedItem.data) {
              setFormData(refreshedItem.data);
              await loadItemBulks(selectedItemId);
            }
          }
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(warehouseInventoryChannel);
    };
  }, [user?.company_uuid, searchQuery, selectedWarehouse, selectedItemId]);

  // Add this useEffect after your other useEffects
  useEffect(() => {
    const assignments: Array<any> = [];

    // Only process if we have bulks with locations
    const bulksWithLocations = itemBulks.filter(bulk => bulk.location);

    if (bulksWithLocations.length > 0) {
      // Add all bulk locations as secondary color (green), except the current one
      bulksWithLocations.forEach((bulk, index) => {
        if (currentBulkIndex !== null && index === currentBulkIndex) {
          // Skip current - will add as tertiary below
          return;
        }

        if (bulk.location) {
          assignments.push({
            floor: bulk.location.floor,
            group: bulk.location.group,
            row: bulk.location.row,
            column: bulk.location.column,
            depth: bulk.location.depth || 0,
            colorType: 'secondary'
          });
        }
      });

      // Add the currently focused bulk location as tertiary (blue)
      if (currentBulkIndex !== null && bulksWithLocations[currentBulkIndex]?.location) {
        const currentLocation = bulksWithLocations[currentBulkIndex].location;
        assignments.push({
          floor: currentLocation.floor,
          group: currentLocation.group,
          row: currentLocation.row,
          column: currentLocation.column,
          depth: currentLocation.depth || 0,
          colorType: 'tertiary'
        });
      }
    }

    setShelfColorAssignments(assignments);
  }, [itemBulks, currentBulkIndex]);

  return (
    <div className="container mx-auto p-2 max-w-4xl">
      <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
        <div className="flex flex-col w-full xl:text-left text-center">
          <h1 className="text-2xl font-bold">Warehouse Inventory</h1>
          {(isLoading || isLoadingItems) ? (
            <div className="text-default-500 flex items-center">
              <p className='my-auto mr-1'>Loading warehouse items</p>
              <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
            </div>
          ) : (
            <p className="text-default-500">View and manage items stored in your warehouses.</p>
          )}
        </div>
        <div className="flex gap-4">

        </div>
      </div>
      <div className="flex flex-col xl:flex-row gap-4">
        {/* Left side: Warehouse Items List */}
        <div className={`xl:w-1/3 shadow-xl shadow-primary/10 
          xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
          xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
          border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
        >
          <div className="flex flex-col h-full">
            <div className="p-4 sticky top-0 z-20 bg-background/80 border-b border-default-200 backdrop-blur-lg shadow-sm">
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Warehouse Items</h2>

              {!user ? (
                <>
                  <Skeleton className="h-10 w-full rounded-xl mb-4" />
                  <Skeleton className="h-[4rem] w-full rounded-xl" />
                </>
              ) : (
                <div className="space-y-4">
                  <Input
                    placeholder="Search items..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    isClearable
                    onClear={() => handleSearch("")}
                    startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
                  />

                  {/* Replace the single Autocomplete with this new filter UI */}
                  <div className="flex items-center gap-2 mt-2">
                    <Popover
                      isOpen={isSearchFilterOpen}
                      onOpenChange={setIsSearchFilterOpen}
                      classNames={{ content: "!backdrop-blur-lg bg-background/65" }}
                      motionProps={popoverTransition()}
                      offset={10}
                      placement="bottom-start">
                      <PopoverTrigger>
                        <Button
                          variant="flat"
                          color="default"
                          className="w-24 h-10 rounded-lg !outline-none rounded-xl"
                          startContent={<Icon icon="mdi:filter-variant" className="text-default-500" />}
                        >
                          Filters
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-4 w-80 p-0">
                        <div>
                          <div className="space-y-4 p-4">
                            <h3 className="text-lg font-semibold items-center w-full text-center">
                              Filter Options
                            </h3>

                            {/* Warehouse filter */}
                            <Autocomplete
                              name="warehouse_uuid"
                              label="Filter by Warehouse"
                              placeholder="All Warehouses"
                              selectedKey={selectedWarehouse || ""}
                              onSelectionChange={(e) => handleWarehouseChange(`${e}` || null)}
                              startContent={<Icon icon="mdi:warehouse" className="text-default-500 mb-[0.2rem]" />}
                              inputProps={autoCompleteStyle}
                            >
                              {[
                                (<AutocompleteItem key="">All Warehouses</AutocompleteItem>),
                                ...warehouses.map((warehouse) => (
                                  <AutocompleteItem key={warehouse.uuid}>
                                    {warehouse.name}
                                  </AutocompleteItem>
                                ))]}
                            </Autocomplete>

                          </div>

                          <div className="p-4 border-t border-default-200 flex justify-end gap-2  bg-default-100/50 ">
                            <Button
                              size="sm"
                              variant="flat"
                              onPress={() => setIsSearchFilterOpen(false)}
                            >
                              Close
                            </Button>

                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    <ScrollShadow orientation="horizontal" className="flex-1 overflow-x-auto" hideScrollBar>
                      <div className="inline-flex items-center gap-2">
                        {selectedWarehouse && (
                          <Chip
                            variant="flat"
                            color="primary"
                            onClose={() => handleWarehouseChange(null)}
                            size="sm"
                            className="h-8 p-2"
                          >
                            <div className="flex items-center gap-1">
                              <Icon icon="mdi:warehouse" className="text-xs" />
                              {warehouses.find(w => w.uuid === selectedWarehouse)?.name || 'Unknown Warehouse'}
                            </div>
                          </Chip>
                        )}

                        {selectedWarehouse && (
                          <Button
                            size="sm"
                            variant="light"
                            className="rounded-lg"
                            onPress={() => handleWarehouseChange(null)}
                          >
                            Clear all
                          </Button>
                        )}
                      </div>
                    </ScrollShadow>
                  </div>
                </div>
              )}
            </div>
            <div className="h-full absolute w-full">
              {!user || isLoadingItems ? (
                <div className="space-y-4 mt-1 p-4 pt-[11.5rem] h-full relative">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="w-full min-h-[7.5rem] rounded-xl" />
                  ))}
                  <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                  <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Spinner />
                  </div>
                </div>
              ) : !isLoadingItems && warehouseItems.length !== 0 ? (
                <div
                  className='space-y-4 p-4 overflow-y-auto pt-[12rem] xl:h-full h-[42rem]'>
                  {warehouseItems.map((item) => (
                    <Button
                      key={item.uuid}
                      onPress={() => handleSelectItem(item.uuid)}
                      variant="shadow"
                      className={`w-full min-h-[7.5rem] !transition-all duration-200 rounded-xl p-0 ${selectedItemId === item.uuid ?
                        '!bg-primary hover:!bg-primary-400 !shadow-lg hover:!shadow-md hover:!shadow-primary-200 !shadow-primary-200' :
                        '!bg-default-100/50 shadow-none hover:!bg-default-200 !shadow-2xs hover:!shadow-md hover:!shadow-default-200 !shadow-default-200'}`}
                    >
                      <div className="w-full flex flex-col h-full">
                        <div className="flex-grow flex flex-col justify-center px-3">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">
                              {item.name}
                            </span>
                            <Chip color="default" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                              {typeof item.warehouse_inventory_item_bulks === 'object'
                                ? Object.keys(item.warehouse_inventory_item_bulks).length
                                : 0} bulk(s)
                            </Chip>
                          </div>
                          <div className={`w-full mt-1 text-sm ${selectedItemId === item.uuid ? 'text-default-800 ' : 'text-default-600'} text-start text-ellipsis overflow-hidden whitespace-nowrap`}>
                            {warehouses.find(w => w.uuid === item.warehouse_uuid)?.name || 'Unknown Warehouse'}
                          </div>
                        </div>

                        {/* Footer - always at the bottom */}
                        <div className={`flex items-center gap-2 border-t ${selectedItemId === item.uuid ? 'border-primary-300' : 'border-default-100'} p-3`}>
                          <Chip
                            color={selectedItemId === item.uuid ? "default" : "primary"}
                            variant={selectedItemId === item.uuid ? "shadow" : "flat"}
                            size="sm">
                            {formatDate(item.created_at || "")}
                          </Chip>
                          <Chip color={item.status === "AVAILABLE" ? "success" : "warning"} variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                            {item.status}
                          </Chip>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              ) : null}

              {user && !isLoadingItems && warehouseItems.length === 0 && (
                <div className="xl:h-full h-[42rem] absolute w-full">
                  <div className="py-4 flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Icon icon="fluent:box-dismiss-20-filled" className="text-5xl text-default-300" />
                    <p className="text-default-500 mt-2">No warehouse items found.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Item Details */}
        <div className="xl:w-2/3">
          {selectedItemId ? (
            <div className="flex flex-col gap-2">
              <CardList>
                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Item Details</h2>
                  <div className="space-y-4">
                    {isLoading ? (
                      <>
                        <div className="space-y-2">
                          <Skeleton className="h-16 w-full rounded-xl" />
                        </div>
                        <div className="space-y-2">
                          <Skeleton className="h-24 w-full rounded-xl" />
                        </div>
                      </>
                    ) : (
                      <>
                        <Input
                          label="Warehouse Item Identifier"
                          value={formData.uuid}
                          isReadOnly
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                          endContent={
                            <Button
                              variant="flat"
                              color="default"
                              isIconOnly
                              onPress={() => copyToClipboard(formData.uuid || "")}
                            >
                              <Icon icon="mdi:content-copy" className="text-default-500" />
                            </Button>
                          }
                        />
                        <div className="flex items-center justify-between gap-4">
                          <Input
                            label="Item Name"
                            value={formData.name || ""}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:tag" className="text-default-500 mb-[0.2rem]" />}
                          />
                          <Input
                            label="Item Unit"
                            value={formData.unit || ""}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:ruler" className="text-default-500 mb-[0.1rem]" />}
                          />
                        </div>

                        {formData.description && (
                          <Textarea
                            label="Description"
                            value={formData.description || ""}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:text-box" className="text-default-500 mb-[0.2rem]" />}
                          />
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            label="Status"
                            value={formData.status || ""}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:tag" className="text-default-500 mb-[0.2rem]" />}
                          />

                          <Input
                            label="Warehouse"
                            value={warehouses.find(w => w.uuid === formData.warehouse_uuid)?.name || ""}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:warehouse" className="text-default-500 mb-[0.2rem]" />}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            label="Created"
                            value={formData.created_at ? format(new Date(formData.created_at), "MMM d, yyyy") : ""}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:calendar" className="text-default-500 mb-[0.2rem]" />}
                          />

                          <Input
                            label="Last Updated"
                            value={formData.updated_at ? format(new Date(formData.updated_at), "MMM d, yyyy") : ""}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:calendar-clock" className="text-default-500 mb-[0.2rem]" />}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Bulk Items</h2>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        {isLoadingBulks ? (
                          <>
                            <Skeleton className="h-6 w-20 rounded-xl" />
                          </>
                        ) : (
                          <Chip color="default" variant="flat" size="sm">
                            {itemBulks.length} bulk{itemBulks.length !== 1 ? "s" : ""}
                          </Chip>
                        )}
                      </div>
                    </div>

                    <AnimatePresence>
                      {isLoadingBulks ? (
                        <motion.div {...motionTransition}>
                          <div className="space-y-4">
                            <div className="p-4 border-2 border-default-200 rounded-xl space-y-4">
                              <div className="flex justify-between">
                                <Skeleton className="h-6 w-40 rounded-lg" />
                                <Skeleton className="h-6 w-24 rounded-lg" />
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Skeleton className="h-16 w-full rounded-xl" />
                                <Skeleton className="h-16 w-full rounded-xl" />
                                <Skeleton className="h-16 w-full rounded-xl" />
                                <Skeleton className="h-16 w-full rounded-xl" />
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ) : itemBulks.length === 0 ? (
                        <motion.div {...motionTransition}>
                          <div className="py-8 h-48 text-center text-default-500 border border-dashed border-default-300 rounded-lg justify-center flex flex-col items-center">
                            <Icon icon="mdi:package-variant-closed" className="mx-auto mb-2 opacity-50" width={40} height={40} />
                            <p>No bulk items available for this warehouse item</p>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>

                    <AnimatePresence>
                      {!isLoadingBulks && itemBulks.length > 0 && (
                        <motion.div {...motionTransition}>
                          <Accordion
                            selectionMode="multiple"
                            variant="splitted"
                            selectedKeys={expandedBulks}
                            onSelectionChange={(keys) => {
                              setExpandedBulks(keys as Set<string>);
                              // Load units when a bulk is expanded
                              const newKeys = Array.from(keys as Set<string>);
                              if (newKeys.length > 0 && !Array.from(expandedBulks).includes(newKeys[0])) {
                                loadItemUnits(newKeys[0]);
                              }
                            }}
                            itemClasses={{
                              base: "p-0 w-full bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
                              title: "font-normal text-lg font-semibold",
                              trigger: "p-4 data-[hover=true]:bg-default-100 h-14 flex items-center transition-colors",
                              indicator: "text-medium",
                              content: "text-small p-0",
                            }}
                            className="w-full p-0 overflow-hidden"
                          >
                            {itemBulks.map(bulk => (
                              <AccordionItem
                                key={bulk.uuid}
                                title={
                                  <div className="flex justify-between items-center w-full">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">
                                        {bulk.is_single_item ? "Single Item" : `Bulk ${bulk.bulk_unit || ''}`}
                                      </span>
                                    </div>
                                    <div className="flex gap-2">
                                      <Chip color="primary" variant="flat" size="sm">
                                        {formatNumber(bulk.unit_value)} {bulk.unit}
                                      </Chip>
                                      {bulk.location_code && (
                                        <Chip color="success" variant="flat" size="sm">
                                          {bulk.location_code}
                                        </Chip>
                                      )}
                                    </div>
                                  </div>
                                }
                              >
                                <div>
                                  {bulk.uuid && (
                                    <Input
                                      label="Warehouse Bulk Identifier"
                                      value={bulk.uuid}
                                      isReadOnly
                                      classNames={{ inputWrapper: inputStyle.inputWrapper, base: "p-4 pb-0" }}
                                      startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                                      endContent={
                                        <Button
                                          variant="flat"
                                          color="default"
                                          isIconOnly
                                          onPress={() => copyToClipboard(bulk.uuid)}
                                        >
                                          <Icon icon="mdi:content-copy" className="text-default-500" />
                                        </Button>
                                      }
                                    />
                                  )}

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 pb-0">
                                    <Input
                                      label="Unit"
                                      value={`${bulk.unit_value} ${bulk.unit}`}
                                      isReadOnly
                                      classNames={inputStyle}
                                      startContent={<Icon icon="mdi:ruler" className="text-default-500 mb-[0.2rem]" />}
                                    />

                                    <Input
                                      label="Bulk Unit"
                                      value={bulk.bulk_unit || "N/A"}
                                      isReadOnly
                                      classNames={inputStyle}
                                      startContent={<Icon icon="mdi:cube-outline" className="text-default-500 mb-[0.2rem]" />}
                                    />

                                    <Input
                                      label="Cost"
                                      value={`${bulk.cost}`}
                                      isReadOnly
                                      classNames={inputStyle}
                                      startContent={<Icon icon="mdi:currency-php" className="text-default-500 mb-[0.2rem]" />}
                                    />

                                    <Input
                                      label="Location"
                                      value={bulk.location_code || "Not assigned"}
                                      isReadOnly
                                      classNames={inputStyle}
                                      startContent={<Icon icon="mdi:map-marker" className="text-default-500 mb-[0.2rem]" />}
                                    />
                                  </div>

                                  <div className="overflow-hidden px-4 py-4">
                                    {bulk.is_single_item ? (
                                      <motion.div {...motionTransition}>
                                        <div className="space-y-4 border-2 border-default-200 rounded-xl p-4">
                                          <div className="flex justify-between items-center">
                                            <h3 className="text-lg font-semibold">Single Item Details</h3>
                                            <Tooltip
                                              content="This is a single large item (e.g., mother roll) rather than a collection of units">
                                              <span>
                                                <Icon icon="mdi:information-outline" className="text-default-500" width={16} height={16} />
                                              </span>
                                            </Tooltip>
                                          </div>



                                          {itemUnits.length > 0 && itemUnits[0] && (
                                            <>
                                              <Input
                                                label="Warehouse Unit Identifier"
                                                value={itemUnits[0].uuid}
                                                isReadOnly
                                                classNames={{ inputWrapper: inputStyle.inputWrapper }}
                                                startContent={<Icon icon="mdi:cube-outline" className="text-default-500 mb-[0.2rem]" />}
                                                endContent={
                                                  <Button
                                                    variant="flat"
                                                    color="default"
                                                    isIconOnly
                                                    onPress={() => copyToClipboard(itemUnits[0].uuid)}
                                                  >
                                                    <Icon icon="mdi:content-copy" className="text-default-500" />
                                                  </Button>
                                                }
                                              />

                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <Input
                                                  label="Item Code"
                                                  value={itemUnits[0].code || ""}
                                                  isReadOnly
                                                  classNames={inputStyle}
                                                  startContent={<Icon icon="mdi:barcode" className="text-default-500 mb-[0.2rem]" />}
                                                />

                                                <Input
                                                  label="Item Name"
                                                  value={itemUnits[0].name || ""}
                                                  isReadOnly
                                                  classNames={inputStyle}
                                                  startContent={<Icon icon="mdi:tag" className="text-default-500 mb-[0.2rem]" />}
                                                />

                                                <Input
                                                  label="Unit"
                                                  value={`${itemUnits[0].unit_value} ${itemUnits[0].unit}`}
                                                  isReadOnly
                                                  classNames={inputStyle}
                                                  startContent={<Icon icon="mdi:ruler" className="text-default-500 mb-[0.2rem]" />}
                                                />

                                                <Input
                                                  label="Cost"
                                                  value={`${itemUnits[0].cost}`}
                                                  isReadOnly
                                                  classNames={inputStyle}
                                                  startContent={<Icon icon="mdi:currency-php" className="text-default-500 mb-[0.2rem]" />}
                                                />
                                              </div>
                                            </>
                                          )}

                                          {itemUnits.length === 0 && (
                                            <div className="py-4 text-center text-default-500">
                                              <p>No details available for this single item</p>
                                            </div>
                                          )}
                                        </div>
                                      </motion.div>
                                    ) : (
                                      <div className="space-y-4 border-2 border-default-200 rounded-xl p-4">
                                        <div className="flex justify-between items-center">
                                          <h3 className="text-lg font-semibold">Units in this Bulk</h3>
                                        </div>

                                        <AnimatePresence>
                                          {isLoadingUnits ? (
                                            <motion.div {...motionTransition}>
                                              <div className="flex items-center justify-center p-4">
                                                <Spinner size="sm" />
                                                <span className="ml-2">Loading units...</span>
                                              </div>
                                            </motion.div>
                                          ) : itemUnits.length === 0 ? (
                                            <motion.div {...motionTransition}>
                                              <div className="py-4 h-48 text-center text-default-500 border border-dashed border-default-200 rounded-lg justify-center flex flex-col items-center">
                                                <Icon icon="mdi:cube-outline" className="mx-auto mb-2 opacity-50" width={40} height={40} />
                                                <p className="text-sm">No units available for this bulk</p>
                                              </div>
                                            </motion.div>
                                          ) : (
                                            <motion.div {...motionTransition}>
                                              <Accordion
                                                selectionMode="multiple"
                                                variant="splitted"
                                                selectedKeys={expandedUnits}
                                                onSelectionChange={(keys) => setExpandedUnits(keys as Set<string>)}
                                                itemClasses={{
                                                  base: "p-0 w-full bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
                                                  title: "font-normal text-lg font-semibold",
                                                  trigger: "p-4 data-[hover=true]:bg-default-100 h-14 flex items-center transition-colors",
                                                  indicator: "text-medium",
                                                  content: "text-small p-0",
                                                }}
                                                className="w-full p-0 overflow-hidden"
                                              >
                                                {itemUnits.map(unit => (
                                                  <AccordionItem
                                                    key={unit.uuid}
                                                    title={
                                                      <div className="flex justify-between items-center w-full">
                                                        <div className="flex items-center gap-2">
                                                          <span>
                                                            {unit.name || `Unit ${unit.code}`}
                                                          </span>
                                                        </div>
                                                        <Chip size="sm" color="primary" variant="flat">
                                                          {formatNumber(unit.unit_value)} {unit.unit}
                                                        </Chip>
                                                      </div>
                                                    }
                                                  >
                                                    <div className="space-y-4">
                                                      {unit.uuid && (
                                                        <Input
                                                          label="Warehouse Unit Identifier"
                                                          value={unit.uuid}
                                                          isReadOnly
                                                          classNames={{ inputWrapper: inputStyle.inputWrapper, base: "p-4 pb-0" }}
                                                          startContent={<Icon icon="mdi:cube-outline" className="text-default-500 mb-[0.2rem]" />}
                                                          endContent={
                                                            <Button
                                                              variant="flat"
                                                              color="default"
                                                              isIconOnly
                                                              onPress={() => copyToClipboard(unit.uuid)}
                                                            >
                                                              <Icon icon="mdi:content-copy" className="text-default-500" />
                                                            </Button>
                                                          }
                                                        />
                                                      )}

                                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 pt-0">
                                                        <Input
                                                          label="Item Code"
                                                          value={unit.code || ""}
                                                          isReadOnly
                                                          classNames={inputStyle}
                                                          startContent={<Icon icon="mdi:barcode" className="text-default-500 mb-[0.2rem]" />}
                                                        />

                                                        <Input
                                                          label="Item Name"
                                                          value={unit.name || ""}
                                                          isReadOnly
                                                          classNames={inputStyle}
                                                          startContent={<Icon icon="mdi:tag" className="text-default-500 mb-[0.2rem]" />}
                                                        />

                                                        <Input
                                                          label="Unit"
                                                          value={`${unit.unit_value} ${unit.unit}`}
                                                          isReadOnly
                                                          classNames={inputStyle}
                                                          startContent={<Icon icon="mdi:ruler" className="text-default-500 mb-[0.2rem]" />}
                                                        />

                                                        <Input
                                                          label="Cost"
                                                          value={`${unit.cost}`}
                                                          isReadOnly
                                                          classNames={inputStyle}
                                                          startContent={<Icon icon="mdi:currency-php" className="text-default-500 mb-[0.2rem]" />}
                                                        />
                                                      </div>
                                                    </div>
                                                  </AccordionItem>
                                                ))}
                                              </Accordion>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    )}
                                  </div>


                                  {/* <div className="p-4 pb-0"> */}
                                  <div className="flex justify-end gap-2 bg-default-100/50 p-4">
                                    {bulk.location && (
                                      <div className="flex justify-end gap-2">
                                        <Button
                                          color="secondary"
                                          variant="flat"
                                          size="sm"
                                          onPress={() => handleViewBulkLocation(bulk)}
                                          startContent={<Icon icon="mdi:view-in-ar" />}
                                        >
                                          View 3D Location
                                        </Button>

                                        <Button
                                          color="success"
                                          variant="flat"
                                          size="sm"
                                          onPress={() => handleViewDelivery(bulk.delivery_uuid)}
                                          startContent={<Icon icon="mdi:truck-delivery" />}
                                        >
                                          View Delivery
                                        </Button>
                                      </div>

                                    )}

                                  </div>
                                </div>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </CardList>

              <CardList>
                {user && user.is_admin && (
                  <div className="flex items-center justify-between h-full w-full">
                    <span>View warehouse information</span>
                    <Button
                      variant="shadow"
                      color="primary"
                      onPress={handleViewWarehouse}
                      className="my-1">
                      <Icon icon="mdi:chevron-right" width={16} height={16} />
                    </Button>
                  </div>
                )}
                {user && user.is_admin && (
                  <div className="flex items-center justify-between h-full w-full">
                    <span>View inventory info</span>
                    <Button
                      variant="shadow"
                      color="primary"
                      onPress={handleViewInventory}
                      className="my-1">
                      <Icon icon="mdi:chevron-right" width={16} height={16} />
                    </Button>
                  </div>
                )}

                <div className="w-full flex gap-2 flex-row">
                  <Button
                    color="primary"
                    variant="shadow"
                    className="flex-1 basis-0"
                    onPress={locationModal.onOpen}
                    isDisabled={!selectedItemId || itemBulks.length === 0
                      || !itemBulks.some(bulk => bulk.location)}
                  >
                    <div className="flex items-center gap-2">
                      <Icon icon="mdi:map-marker" />
                      <span>View Location</span>
                    </div>
                  </Button>

                  <Button
                    color="secondary"
                    variant="shadow"
                    className="flex-1 basis-0"
                    onPress={qrCodeModal.onOpen}
                    isDisabled={!selectedItemId}
                  >
                    <div className="flex items-center gap-2">
                      <Icon icon="mdi:qrcode" />
                      <span>Show QR Code</span>
                    </div>
                  </Button>
                </div>
              </CardList>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-default-300 rounded-2xl bg-background">
              <Icon icon="mdi:package-variant" className="text-default-300" width={64} height={64} />
              <h3 className="text-xl font-semibold text-default-800">No Item Selected</h3>
              <p className="text-default-500 text-center mt-2 mb-6">
                Select an item from the list on the left to view its details.
              </p>
              <Button
                color="primary"
                variant="shadow"
                className="mb-4"
                onPress={() => {
                  if (warehouseItems.length > 0) {
                    handleSelectItem(warehouseItems[0].uuid);
                  }
                }}
                isDisabled={warehouseItems.length === 0}
              >
                <Icon icon="mdi:package-variant" className="mr-2" />
                View First Item
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Modal for QR Code */}
      <Modal
        isOpen={qrCodeModal.isOpen} onClose={qrCodeModal.onClose}
        placement="auto"
        backdrop="blur"
        size="lg"
        classNames={{
          backdrop: "bg-background/50"
        }}
      >
        <ModalContent>
          <ModalHeader>Item QR Code</ModalHeader>
          <ModalBody className="flex flex-col items-center">
            <div className="bg-white rounded-xl overflow-hidden">
              <QRCodeCanvas
                id="qrcode"
                value={generateItemJson()}
                size={320}
                marginSize={4}
                level="L"
              />
            </div>
            <p className="text-center mt-4 text-default-600">
              Scan this code to get warehouse item details
            </p>
            <div className="mt-4 w-full bg-default overflow-auto max-h-64 bg-default-50 rounded-xl">
              <SyntaxHighlighter
                language="json"
                style={window.resolveTheme === 'dark' ? materialDark : materialLight}
                customStyle={{
                  margin: 0,
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                }}
              >
                {generateItemJson(2)}
              </SyntaxHighlighter>
            </div>
          </ModalBody>
          <ModalFooter className="flex justify-end p-4 gap-4">
            <Button
              color="default"
              onPress={qrCodeModal.onClose}>
              Close
            </Button>
            <Button
              color="primary"
              variant="shadow"
              onPress={() => {
                // Create an image from the QR code and download it
                const canvas = document.querySelector('canvas');
                if (canvas) {
                  const pngUrl = canvas.toDataURL('image/png');
                  const downloadLink = document.createElement('a');
                  downloadLink.href = pngUrl;
                  downloadLink.download = `warehouse-item-${formData.uuid}.png`;
                  document.body.appendChild(downloadLink);
                  downloadLink.click();
                  document.body.removeChild(downloadLink);
                }
              }}
            >
              <Icon icon="mdi:download" className="mr-1" />
              Download QR
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal for 3D Location Viewer */}
      <Modal
        isOpen={locationModal.isOpen}
        onClose={locationModal.onClose}
        placement="auto"
        backdrop="blur"
        size="5xl"
        classNames={{ backdrop: "bg-background/50", wrapper: 'overflow-hidden' }}
      >
        <ModalContent>
          <ModalHeader>
            {selectedBulkForLocation && (
              <>
                Location for {formData.name}
              </>
            )}
          </ModalHeader>
          <ModalBody className='p-0'>
            <div className="h-[80vh] bg-primary-50 rounded-md overflow-hidden relative">
              <Suspense fallback={
                <div className="flex items-center justify-center h-full">
                  <Spinner size="lg" color="primary" />
                  <span className="ml-2">Loading 3D viewer...</span>
                </div>
              }>
                <ShelfSelector3D
                  floors={floorConfigs}
                  onSelect={handleShelfSelection}
                  occupiedLocations={filteredOccupiedLocations}
                  canSelectOccupiedLocations={true}
                  className="w-full h-full"
                  highlightedFloor={highlightedFloor}
                  onHighlightFloor={setHighlightedFloor}
                  externalSelection={externalSelection}
                  cameraOffsetY={-0.25}
                  shelfColorAssignments={shelfColorAssignments}
                />
              </Suspense>

              {/* Shelf controls */}
              <AnimatePresence>
                {locationCode && showControls &&
                  <motion.div {...motionTransition}
                    className="absolute overflow-hidden bottom-4 left-4 flex flex-col gap-2 bg-background/50 rounded-2xl backdrop-blur-lg w-auto">
                    <div className="grid md:grid-cols-2 grid-cols-1 gap-3 p-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Floor</span>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              isIconOnly
                              onPress={() => handleFloorChange(Math.max(1, ((externalSelection?.floor || 0) + 1) - 1))}
                              isDisabled={(externalSelection?.floor || 0) <= 0}
                              className="min-w-8 h-8"
                            >
                              <Icon icon="mdi:chevron-left" className="text-sm" />
                            </Button>
                            <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                              {(externalSelection?.floor || 0) + 1}
                            </div>
                            <Button
                              size="sm"
                              isIconOnly
                              onPress={() => handleFloorChange(Math.min(floorConfigs.length, ((externalSelection?.floor || 0) + 1) + 1))}
                              isDisabled={(externalSelection?.floor || 0) + 1 >= floorConfigs.length}
                              className="min-w-8 h-8"
                            >
                              <Icon icon="mdi:chevron-right" className="text-sm" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Group</span>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              isIconOnly
                              onPress={() => handleGroupChange(Math.max(1, ((externalSelection?.group || 0) + 1) - 1))}
                              isDisabled={(externalSelection?.group || 0) <= 0}
                              className="min-w-8 h-8"
                            >
                              <Icon icon="mdi:chevron-left" className="text-sm" />
                            </Button>
                            <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                              {(externalSelection?.group || 0) + 1}
                            </div>
                            <Button
                              size="sm"
                              isIconOnly
                              onPress={() => handleGroupChange(Math.min(maxGroupId + 1, ((externalSelection?.group || 0) + 1) + 1))}
                              isDisabled={(externalSelection?.group || 0) + 1 > maxGroupId}
                              className="min-w-8 h-8"
                            >
                              <Icon icon="mdi:chevron-right" className="text-sm" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 md:pl-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Row</span>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              isIconOnly
                              onPress={() => handleRowChange(Math.max(1, ((externalSelection?.row || 0) + 1) - 1))}
                              isDisabled={(externalSelection?.row || 0) <= 0}
                              className="min-w-8 h-8"
                            >
                              <Icon icon="mdi:chevron-left" className="text-sm" />
                            </Button>
                            <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                              {(externalSelection?.row || 0) + 1}
                            </div>
                            <Button
                              size="sm"
                              isIconOnly
                              onPress={() => handleRowChange(Math.min(maxRow + 1, ((externalSelection?.row || 0) + 1) + 1))}
                              isDisabled={(externalSelection?.row || 0) + 1 > maxRow}
                              className="min-w-8 h-8"
                            >
                              <Icon icon="mdi:chevron-right" className="text-sm" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Column</span>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              isIconOnly
                              onPress={() => handleColumnChange(Math.max(1, ((externalSelection?.column || 0) + 1) - 1))}
                              isDisabled={(externalSelection?.column || 0) <= 0}
                              className="min-w-8 h-8"
                            >
                              <Icon icon="mdi:chevron-left" className="text-sm" />
                            </Button>
                            <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                              {parseColumn((externalSelection?.column || 0) + 1) || ""}
                            </div>
                            <Button
                              size="sm"
                              isIconOnly
                              onPress={() => handleColumnChange(Math.min(maxColumn + 1, ((externalSelection?.column || 0) + 1) + 1))}
                              isDisabled={(externalSelection?.column || 0) + 1 > maxColumn}
                              className="min-w-8 h-8"
                            >
                              <Icon icon="mdi:chevron-right" className="text-sm" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 md:mb-0 mb-10">
                          <span className="text-sm font-semibold w-16">Depth</span>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              isIconOnly
                              onPress={() => handleDepthChange(Math.max(1, ((externalSelection?.depth || 0) + 1) - 1))}
                              isDisabled={(externalSelection?.depth || 0) <= 0}
                              className="min-w-8 h-8"
                            >
                              <Icon icon="mdi:chevron-left" className="text-sm" />
                            </Button>
                            <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                              {(externalSelection?.depth || 0) + 1}
                            </div>
                            <Button
                              size="sm"
                              isIconOnly
                              onPress={() => handleDepthChange(Math.min(maxDepth + 1, ((externalSelection?.depth || 0) + 1) + 1))}
                              isDisabled={(externalSelection?.depth || 0) + 1 > maxDepth}
                              className="min-w-8 h-8"
                            >
                              <Icon icon="mdi:chevron-right" className="text-sm" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                }
              </AnimatePresence>

              <AnimatePresence>
                {(locationCode || showControls) &&
                  <motion.div {...motionTransition}
                    className={`absolute overflow-hidden ${showControls ? "bottom-8 left-8 h-8" : "bottom-4 left-4 h-10"} w-[12.6rem] bg-background/50 rounded-xl backdrop-blur-lg z-10 transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]`}>
                    <Button
                      onPress={() => setShowControls(!showControls)}
                      color="primary"
                      variant="light"
                      className={`flex items-center p-4  bg-transparent w-full !scale-100 ${showControls ? "h-8" : "h-10"} !transition-all !duration-500 duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]`}
                    >
                      <Icon icon="ic:round-control-camera" className="w-4 h-4" />
                      <span className="text-sm font-semibold">
                        {showControls ? "Hide Controls" : "Show Controls"}
                      </span>
                    </Button>
                  </motion.div>
                }
              </AnimatePresence>

              <AnimatePresence>
                {locationCode &&
                  <motion.div {...motionTransition} className="absolute overflow-hidden top-4 right-4 flex items-start gap-2 bg-background/50 rounded-2xl backdrop-blur-lg flex flex-col p-4">
                    {selectedBulkForLocation && selectedBulkForLocation.location && (
                      <span className="text-sm font-semibold"> Selected Code: <b>{selectedBulkForLocation.location_code || formatCode(selectedBulkForLocation.location)}</b></span>
                    )}
                    <span className="text-sm font-semibold">Current Code: <b>{locationCode}</b></span>
                  </motion.div>
                }
              </AnimatePresence>

            </div>
          </ModalBody>
          <ModalFooter className="flex justify-between gap-4 p-4">
            <Popover
              classNames={{ content: "!backdrop-blur-lg bg-background/65" }}
              motionProps={popoverTransition(false)}
              placement="bottom">
              <PopoverTrigger>
                <Button className="capitalize" color="warning" variant="flat">
                  <Icon icon="heroicons:question-mark-circle-solid" className="w-4 h-4 mr-1" />
                  Help
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-4 max-w-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Icon icon="heroicons:lifebuoy" className="w-5 h-5 text-warning-500" width={20} />
                  <h3 className="font-semibold text-lg">3D Navigation Controls</h3>
                </div>

                <Accordion variant="splitted">
                  <AccordionItem key="mouse" aria-label="Mouse Controls" title="Mouse Controls" className="text-sm overflow-hidden bg-primary-50">
                    <div className="space-y-2 pb-2">
                      <div className="flex items-start gap-2">
                        <Icon icon="heroicons:cursor-arrow-ripple" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                        <p><strong>Left Click</strong>: Select a shelf</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Icon icon="heroicons:hand-raised" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                        <p><strong>Click + Drag</strong>: Rotate camera around scene</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Icon icon="heroicons:cursor-arrow-rays" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                        <p><strong>Right Click + Drag</strong>: Pan camera</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Icon icon="heroicons:view-columns" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                        <p><strong>Mouse Wheel</strong>: Zoom in/out</p>
                      </div>
                    </div>
                  </AccordionItem>

                  <AccordionItem key="keyboard" aria-label="Keyboard Controls" title="Keyboard Controls" className="text-sm overflow-hidden bg-primary-50">
                    <div className="space-y-2 pb-2">
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300">W</Kbd>
                        <p className="my-auto">Move camera forward</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300">S</Kbd>
                        <p className="my-auto">Move camera backward</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300">A</Kbd>
                        <p className="my-auto">Move camera left</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300">D</Kbd>
                        <p className="my-auto">Move camera right</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['shift']}>W</Kbd>
                        <p className="my-auto">Move camera up</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['shift']}>S</Kbd>
                        <p className="my-auto">Move camera down</p>
                      </div>
                    </div>
                  </AccordionItem>

                  <AccordionItem key="shelf-navigation" aria-label="Shelf Navigation" title="Shelf Navigation" className="text-sm overflow-hidden bg-primary-50">
                    <div className="space-y-2 pb-2">
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['left']}></Kbd>
                        <p>Move to previous shelf or group</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['right']}></Kbd>
                        <p>Move to next shelf or group</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['up']}></Kbd>
                        <p>Move to shelf above</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['down']}></Kbd>
                        <p>Move to shelf below</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex">
                          <Kbd className="border border-default-300" keys={['shift']}></Kbd>
                          <span className="mx-1">+</span>
                          <Kbd className="border border-default-300" keys={['up', 'down', 'left', 'right']}></Kbd>
                        </div>
                        <p>Navigate between shelf groups</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex">
                          <Kbd className="border border-default-300" keys={['ctrl']}></Kbd>
                          <span className="mx-1">+</span>
                          <Kbd className="border border-default-300" keys={['up', 'down']}></Kbd>
                        </div>
                        <p>Navigate shelf depth (front/back)</p>
                      </div>
                    </div>
                  </AccordionItem>
                </Accordion>

                <div className="mt-4 border-t pt-3 border-default-200 w-full px-4">
                  <h4 className="font-medium mb-2">Color Legend:</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors?.floorColor }}></div>
                      <span className="text-xs">Floor</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors?.floorHighlightedColor }}></div>
                      <span className="text-xs">Selected Floor</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors?.groupColor }}></div>
                      <span className="text-xs">Group</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors?.groupSelectedColor }}></div>
                      <span className="text-xs">Selected Group</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors?.shelfColor }}></div>
                      <span className="text-xs">Shelf</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors?.shelfHoverColor }}></div>
                      <span className="text-xs">Hovered Shelf</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors?.shelfSelectedColor }}></div>
                      <span className="text-xs">Selected Shelf</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors?.occupiedShelfColor }}></div>
                      <span className="text-xs">Occupied Shelf</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-default-500">
                  Tip: Use WASD and arrow keys for easiest navigation through the warehouse.
                </div>
              </PopoverContent>
            </Popover>

            <Button color="primary" variant="shadow" onPress={locationModal.onClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div >
  );
}