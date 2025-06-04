"use client";

import ListLoadingAnimation from "@/components/list-loading-animation";
import { createClient } from "@/utils/supabase/client";
import {
  Accordion,
  AccordionItem,
  Alert,
  Autocomplete,
  AutocompleteItem,
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
  Switch,
  Textarea,
  Tooltip,
  useDisclosure
} from "@heroui/react";

import { Icon } from "@iconify/react";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import { lazy, memo, Suspense, useEffect, useMemo, useState } from "react";


// Import server actions
import CardList from "@/components/card-list";
import LoadingAnimation from "@/components/loading-animation";
import { ShelfLocation } from "@/components/shelf-selector-3d";
import { motionTransition, popoverTransition } from "@/utils/anim";
import { formatCode, parseColumn } from '@/utils/floorplan';
import { getUserFromCookies } from "@/utils/supabase/server/user";
import { copyToClipboard, formatDate, formatNumber, toNormalCase, toTitleCase } from "@/utils/tools";
import { getOccupiedShelfLocations } from "../delivery/actions";
import {
  getWarehouseInventoryItem,
  getWarehouseInventoryItems,
  getWarehouseItemByInventory,
  getWarehouses,
  markWarehouseBulkAsUsed,
  WarehouseInventoryItem,
  WarehouseInventoryItemBulk,
  WarehouseInventoryItemComplete
} from "./actions";
import CustomScrollbar from "@/components/custom-scrollbar";
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
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);

  // Warehouse items state
  const [warehouseItems, setWarehouseItems] = useState<WarehouseInventoryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Add status filter state
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Expanded accordion state
  const [expandedBulks, setExpandedBulks] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());

  // QR code modal state
  const qrCodeModal = useDisclosure();
  const locationModal = useDisclosure();

  // Add new state for QR code data
  const [qrCodeData, setQrCodeData] = useState<{
    url: string;
    title: string;
    description: string;
    itemId: string;
    itemName: string;
    isBulkItem: boolean;
    autoMarkAsUsed: boolean;
  }>({
    url: "",
    title: "",
    description: "",
    itemId: "",
    itemName: "",
    isBulkItem: false,
    autoMarkAsUsed: true
  });


  // Form state
  const [formData, setFormData] = useState<Partial<WarehouseInventoryItemComplete>>();

  // 3D shelf selector states
  const [floorConfigs, setFloorConfigs] = useState<any[]>([]);
  const [occupiedLocations, setOccupiedLocations] = useState<any[]>([]);
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(null);
  const [externalSelection, setExternalSelection] = useState<any | undefined>(undefined);
  const [shelfColorAssignments, setShelfColorAssignments] = useState<Array<any>>([]);

  const [isSearchFilterOpen, setIsSearchFilterOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add this derived state
  const [locationCode, setLocationCode] = useState("");

  // Add state for maximum values
  const [maxGroupId, setMaxGroupId] = useState(0);
  const [maxRow, setMaxRow] = useState(0);
  const [maxColumn, setMaxColumn] = useState(0);
  const [maxDepth, setMaxDepth] = useState(0);
  const [isLoadingMarkAsUsed, setIsLoadingMarkAsUsed] = useState(false);

  const [showControls, setShowControls] = useState(false);

  // Add near your other state variables
  const [currentBulkIndex, setCurrentBulkIndex] = useState<number | null>(null);

  // Input style for consistency
  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  const autoCompleteStyle = { classNames: inputStyle };

  // Add pagination state
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

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

  const handleViewBulkLocation = (location: ShelfLocation | null) => {

    let updatedAssignments = shelfColorAssignments;
    if (!location) {
      // reset all assignments to secondary
      updatedAssignments = shelfColorAssignments.map(assignment => ({
        ...assignment,
        colorType: 'secondary'
      }));
    } else {
      // match the location  shelfColorAssignments then change the colorType to tertiary
      // then set the rest to secondary
      updatedAssignments = shelfColorAssignments.map(assignment => {
        if (
          assignment.floor === location.floor &&
          assignment.group === location.group &&
          assignment.row === location.row &&
          assignment.column === location.column &&
          assignment.depth === (location.depth || 0)
        ) {
          return { ...assignment, colorType: 'tertiary' }; // Highlight this one
        } else {
          return { ...assignment, colorType: 'secondary' }; // Set others to secondary
        }
      });
    }

    setShelfColorAssignments(updatedAssignments);

    // Prepare the 3D visualization data
    if (location) {
      // Set the highlighted floor
      setHighlightedFloor(location.floor || 0);

      // Set up external selection to highlight this location
      setExternalSelection(location);

      // Generate location code
      setLocationCode(formatCode(location));

      // Load warehouse configuration if not already loaded
      if (floorConfigs.length === 0) {
        loadWarehouseConfiguration(formData?.warehouse_uuid || '' as string);
      }
    } else {
      // Reset external selection if no location is provided
      setExternalSelection(undefined);
      setLocationCode("");
    }

    locationModal.onOpen();
  };

  // Add these handler functions
  const handleShelfSelection = (location: any) => {
    // Set the highlighted floor
    setHighlightedFloor(location.floor || 0);

    // Set external selection directly
    setExternalSelection(location);

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

  // Handle search with pagination
  const handleSearch = async (query: string, currentPage: number = page) => {
    setSearchQuery(query);
    setIsLoadingItems(true);

    try {
      if (user?.company_uuid) {
        // Calculate offset based on current page and rows per page
        const offset = (currentPage - 1) * rowsPerPage;

        const result = await getWarehouseInventoryItems(
          user.company_uuid,
          selectedWarehouse || undefined,
          query,
          statusFilter || null, // Include status filter
          null, // year
          null, // month
          null, // week
          null, // day
          rowsPerPage, // limit
          offset // offset
        );

        setWarehouseItems(result.data || []);
        setTotalPages(result.totalPages || 1);
        setTotalItems(result.totalCount || 0);
      }
    } catch (error) {
      console.error("Error searching warehouse items:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Function to handle page changes
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    handleSearch(searchQuery, newPage);
  };

  // Add status filter handler
  const handleStatusFilterChange = async (status: string | null) => {
    setStatusFilter(status);
    setIsLoadingItems(true);
    setPage(1); // Reset to first page on filter change

    try {
      const result = await getWarehouseInventoryItems(
        user?.company_uuid || "",
        selectedWarehouse || undefined,
        searchQuery,
        status || null,
        null, // year
        null, // month
        null, // week
        null, // day
        rowsPerPage, // limit
        0 // offset for first page
      );

      setWarehouseItems(result.data || []);
      setTotalPages(result.totalPages || 1);
      setTotalItems(result.totalCount || 0);
    } catch (error) {
      console.error("Error filtering by status:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Helper function to get status chip color
  const getStatusColor = (status: string): "success" | "warning" | "danger" | "default" => {
    switch (status?.toUpperCase()) {
      case "AVAILABLE": return "success";
      case "IN_USE": return "warning";
      case "USED": return "danger";
      case "RESERVED": return "warning";
      default: return "default";
    }
  };

  // Update warehouse filter change handler to use pagination
  const handleWarehouseChange = async (warehouseId: string | null) => {
    setIsLoadingItems(true);
    setPage(1); // Reset to first page on filter change

    try {
      let result;
      if (!warehouseId || warehouseId === "null") {
        setSelectedWarehouse(null);

        result = await getWarehouseInventoryItems(
          user.company_uuid,
          undefined, // No warehouse filter
          searchQuery,
          statusFilter || null, // Include status filter
          null, // year
          null, // month
          null, // week
          null, // day
          rowsPerPage, // limit
          0 // offset for first page
        );

      } else {
        setSelectedWarehouse(warehouseId);
        result = await getWarehouseInventoryItems(
          user.company_uuid,
          warehouseId || undefined,
          searchQuery,
          statusFilter || null, // Include status filter
          null, // year
          null, // month
          null, // week
          null, // day
          rowsPerPage, // limit
          0 // offset for first page
        );
      }

      setWarehouseItems(result.data || []);
      setTotalPages(result.totalPages || 1);
      setTotalItems(result.totalCount || 0);
    } catch (error) {
      console.error("Error filtering by warehouse:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // In handleSelectItem function, just update the URL
  const handleSelectItem = (key: string) => {
    setIsLoading(true);

    // Update the URL with the selected item ID without reloading the page
    const params = new URLSearchParams(searchParams.toString());
    params.set("warehouseItemId", key);
    router.push(`?${params.toString()}`, { scroll: false });

    setSelectedItemId(key);
  };

  // Handle view inventory details
  const handleViewInventory = () => {
    if (formData?.inventory_uuid) {
      router.push(`/home/inventory?itemId=${formData.inventory_uuid}`);
    }
  };

  // Handle view warehouse details
  const handleViewWarehouse = () => {
    if (formData?.warehouse_uuid) {
      router.push(`/home/warehouses?warehouseId=${formData.warehouse_uuid}`);
    }
  };

  // Handle view delivery details
  const handleViewDelivery = (deliveryId: string) => {
    router.push(`/home/delivery?deliveryId=${deliveryId}`);
  };


  const handleMarkComponentsAsUsed = async (warehouseInventoryItemUuid: string) => {
    setIsLoadingMarkAsUsed(true);

    try {
      const result = await markWarehouseBulkAsUsed(warehouseInventoryItemUuid);
      if (result.success) {

      } else {
        console.error(result.message);
        setError(result.message || "Failed to mark components as used");
      }
    } catch (error) {
      console.error("Failed to mark components as used:", error);
    } finally {
      setIsLoadingMarkAsUsed(false);

      // Refresh the item bulks and all units
      if (selectedItemId) {
        // await loadItemBulks(selectedItemId);
      }
    }
  };


  // Generate URL for QR code 
  const generateDeliveryUrl = (q: string, itemAutoMarkAsUsed: boolean = false) => {
    if (!selectedItemId || !formData) return "https://ropic.vercel.app/home/search";

    const baseUrl = "https://ropic.vercel.app/home/search";
    const params = new URLSearchParams({
      q,
      ...(itemAutoMarkAsUsed && { itemAutoMarkAsUsed: "true" })
    });

    return `${baseUrl}?${params.toString()}`;
  };

  // Updated function to regenerate URL when auto mark as used changes
  const updateQrCodeUrl = (autoMarkAsUsed: boolean) => {
    setQrCodeData(prev => ({
      ...prev,
      autoMarkAsUsed,
      url: generateDeliveryUrl(prev.itemId, autoMarkAsUsed),
      description: prev.isBulkItem
        ? `Scan this code to view details for ${prev.itemName} in ${formData?.name || 'warehouse item'}${autoMarkAsUsed ? '. This will mark the bulk as USED automatically.' : '.'}`
        : `Scan this code to view details for ${prev.itemName}`
    }));
  };

  // Handle showing QR code for warehouse item
  const handleShowWarehouseItemQR = () => {
    if (!selectedItemId || !formData) return;

    setQrCodeData({
      url: generateDeliveryUrl(selectedItemId),
      title: "Warehouse Item QR Code",
      description: `Scan this code to view details for ${formData.name || 'this warehouse item'}`,
      itemId: selectedItemId,
      itemName: formData.name || 'this warehouse item',
      isBulkItem: false,
      autoMarkAsUsed: true
    });
    qrCodeModal.onOpen();
  };

  // Handle showing QR code for bulk item
  const handleShowBulkQR = (bulkId: string, bulkName?: string) => {
    if (!selectedItemId || !formData) return;

    const itemName = bulkName || 'this bulk item';
    setQrCodeData({
      url: generateDeliveryUrl(bulkId, false), // Start with false, user can toggle
      title: "Bulk Item QR Code",
      description: `Scan this code to view details for ${itemName} in ${formData.name || 'warehouse item'}.`,
      itemId: bulkId,
      itemName: itemName,
      isBulkItem: true,
      autoMarkAsUsed: true
    });
    qrCodeModal.onOpen();
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
    setIsLoading(true);

    const warehouseItemId = searchParams.get("warehouseItemId");
    const inventoryItemId = searchParams.get("itemId");

    // Handle both warehouseItemId and itemId params
    const fetchItemDetails = async () => {
      const result = warehouseItemId ? (await getWarehouseInventoryItem(warehouseItemId)) : inventoryItemId ? (await getWarehouseItemByInventory(inventoryItemId)) : null;

      if (result && result.success && result.data) {
        const bulk: WarehouseInventoryItemComplete = result.data;

        setSelectedItemId(warehouseItemId);
        setFormData(bulk);

        // Set the first bulk and first unit as expanded
        if (bulk.bulks && bulk.bulks.length > 0) {
          setExpandedBulks(new Set([bulk.bulks[0].uuid]));

          // If the first bulk has units, expand the first unit too
          if (bulk.bulks[0].units && bulk.bulks[0].units.length > 0) {
            setExpandedUnits(new Set([bulk.bulks[0].units[0].uuid]));
          } else {
            setExpandedUnits(new Set());
          }
        } else {
          setExpandedBulks(new Set());
          setExpandedUnits(new Set());
        }

        // If the item has a warehouse_uuid, load its configuration
        if (bulk.warehouse_uuid) {
          await loadWarehouseConfiguration(bulk.warehouse_uuid);
        }

        if (inventoryItemId) {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("itemId");
          params.set("warehouseItemId", result.data.uuid);
          router.push(`?${params.toString()}`, { scroll: false });
        }

        const assignments: Array<any> = bulk.bulks.map((bulk: WarehouseInventoryItemBulk, index: number) => {
          if (bulk.location) {
            return {
              floor: bulk.location.floor,
              group: bulk.location.group,
              row: bulk.location.row,
              column: bulk.location.column,
              depth: bulk.location.depth || 0,
              colorType: 'secondary'
            };
          }
          return null;
        }).filter(Boolean);

        setShelfColorAssignments(assignments);
        setIsLoading(false);
      } else {
        setSelectedItemId(null);
        setFormData({});
        setExpandedBulks(new Set());
        setExpandedUnits(new Set());
        setIsLoading(false);
      }

    };

    fetchItemDetails();
  }, [searchParams]);


  // Initialize page data
  useEffect(() => {
    const initPage = async () => {
      try {
        setIsLoadingItems(true);
        setIsLoadingWarehouses(true);

        const userData = await getUserFromCookies();
        if (userData === null) {
          setError('User not found');
          return;
        }

        setUser(userData);

        if (userData.company_uuid) {
          // Use pagination parameters
          const result = await getWarehouseInventoryItems(
            userData.company_uuid,
            selectedWarehouse || undefined,
            searchQuery,
            statusFilter || null, // Include status filter
            null, // year
            null, // month
            null, // week
            null, // day
            rowsPerPage, // limit
            0 // offset for first page
          );

          setWarehouseItems(result.data || []);
          setTotalPages(result.totalPages || 1);
          setTotalItems(result.totalCount || 0);
        }

        // Fetch warehouses for filtering
        const warehousesResult = await getWarehouses(userData.company_uuid);
        setWarehouses(warehousesResult.data || []);
        setIsLoadingWarehouses(false);

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
          // Refresh warehouse items list with current pagination
          try {
            const refreshedItems = await getWarehouseInventoryItems(
              user.company_uuid,
              selectedWarehouse || undefined,
              searchQuery,
              statusFilter || null, // Include status filter
              null, // year
              null, // month
              null, // week
              null, // day
              rowsPerPage, // limit
              (page - 1) * rowsPerPage // offset
            );

            if (refreshedItems.success) {
              setWarehouseItems(refreshedItems.data || []);
              setTotalPages(refreshedItems.totalPages || 1);
              setTotalItems(refreshedItems.totalCount || 0);
            }
          } catch (error) {
            console.error('Error refreshing warehouse items after real-time update:', error);
          }

          // If we have a selected item and it was updated, refresh its details
          if (selectedItemId && payload.new && (payload.new as any)?.uuid === selectedItemId) {
            try {
              const refreshedItem = await getWarehouseInventoryItem(selectedItemId);
              if (refreshedItem.success && refreshedItem.data) {
                setFormData(refreshedItem.data);
              }
            } catch (error) {
              console.error('Error refreshing selected item after real-time update:', error);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'warehouse_inventory_item_bulk',
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async (payload) => {
          // If we have a selected item, refresh its details including bulks and units
          if (selectedItemId) {
            try {
              const refreshedItem = await getWarehouseInventoryItem(selectedItemId);
              if (refreshedItem.success && refreshedItem.data) {
                setFormData(refreshedItem.data);

                // Update shelf color assignments if bulk locations changed
                const assignments: Array<any> = refreshedItem.data.bulks.map((bulk: WarehouseInventoryItemBulk) => {
                  if (bulk.location) {
                    return {
                      floor: bulk.location.floor,
                      group: bulk.location.group,
                      row: bulk.location.row,
                      column: bulk.location.column,
                      depth: bulk.location.depth || 0,
                      colorType: 'secondary'
                    };
                  }
                  return null;
                }).filter(Boolean);

                setShelfColorAssignments(assignments);
              }
            } catch (error) {
              console.error('Error refreshing item after bulk update:', error);
            }
          }

          // Also refresh the warehouse items list to update bulk counts
          try {
            const refreshedItems = await getWarehouseInventoryItems(
              user.company_uuid,
              selectedWarehouse || undefined,
              searchQuery,
              statusFilter || null, // Include status filter
              null, // year
              null, // month
              null, // week
              null, // day
              rowsPerPage, // limit
              (page - 1) * rowsPerPage // offset
            );

            if (refreshedItems.success) {
              setWarehouseItems(refreshedItems.data || []);
              console.log(`Refreshed warehouse items list after bulk change`);
            }
          } catch (error) {
            console.error('Error refreshing warehouse items after bulk update:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'warehouse_inventory_item_unit',
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async (payload) => {
          // If we have a selected item, refresh its details to include updated units
          if (selectedItemId) {
            try {
              const refreshedItem = await getWarehouseInventoryItem(selectedItemId);
              if (refreshedItem.success && refreshedItem.data) {
                setFormData(refreshedItem.data);

                // Count total units across all bulks
                const totalUnits = refreshedItem.data.bulks.reduce((sum: number, bulk: any) => sum + (bulk.units?.length || 0), 0);
              }
            } catch (error) {
              console.error('Error refreshing item after unit update:', error);
            }
          }
        }
      )
      .subscribe((status) => {

      });

    // Cleanup function
    return () => {
      console.log('Cleaning up real-time subscriptions for warehouse inventory');
      supabase.removeChannel(warehouseInventoryChannel);
    };
  }, [user?.company_uuid, searchQuery, selectedWarehouse, selectedItemId, page, rowsPerPage]);



  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Warehouse Inventory</h1>
            {(isLoading || isLoadingItems) ? (
              <div className="text-default-500 flex xl:justify-start justify-center items-center">
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
                <LoadingAnimation
                  condition={!user || isLoadingWarehouses}
                  skeleton={
                    <>
                      {/* Heading skeleton */}
                      <Skeleton className="h-[1.75rem] w-48 mx-auto mb-4 rounded-full" />

                      <div className="space-y-4">
                        {/* Search input skeleton */}
                        <Skeleton className="h-10 w-full rounded-xl" />

                        {/* Filter controls skeleton */}
                        <ScrollShadow orientation="horizontal" className="flex-1" hideScrollBar>
                          <div className="flex flex-row gap-2 items-center">
                            {/* Filter button skeleton */}
                            <Skeleton className="h-10 w-24 rounded-xl flex-none" />

                            {/* Filter chips area skeleton */}
                            <Skeleton className="h-8 w-32 rounded-full flex-none" />
                            <Skeleton className="h-8 w-36 rounded-full flex-none" />
                            <Skeleton className="h-8 w-24 rounded-full flex-none" />
                          </div>
                        </ScrollShadow>
                      </div>
                    </>
                  }>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Warehouse Items</h2>
                  <div className="space-y-4">
                    <Input
                      placeholder="Search warehouse items..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value, 1)}
                      isClearable
                      onClear={() => handleSearch("", 1)}
                      startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
                    />

                    {/* Updated filter UI with status filter */}
                    <div className="flex items-center gap-2 mt-2">
                      <ScrollShadow orientation="horizontal" className="flex-1 overflow-x-auto" hideScrollBar>
                        <div className="inline-flex items-center gap-2">
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
                            <PopoverContent className="w-96 p-0 overflow-hidden">
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

                                  {/* Add Status filter */}
                                  <Autocomplete
                                    name="status_filter"
                                    label="Filter by Status"
                                    placeholder="All Statuses"
                                    selectedKey={statusFilter || ""}
                                    onSelectionChange={(e) => handleStatusFilterChange(e as string || null)}
                                    startContent={<Icon icon="mdi:filter-variant" className="text-default-500 mb-[0.2rem]" />}
                                    inputProps={autoCompleteStyle}
                                  >
                                    <AutocompleteItem key="">All Statuses</AutocompleteItem>
                                    <AutocompleteItem key="AVAILABLE">Available</AutocompleteItem>
                                    <AutocompleteItem key="IN_USE">In Use</AutocompleteItem>
                                    <AutocompleteItem key="USED">Used</AutocompleteItem>
                                    <AutocompleteItem key="RESERVED">Reserved</AutocompleteItem>
                                  </Autocomplete>
                                </div>

                                <div className="p-4 border-t border-default-200 flex justify-end gap-2 bg-default-100/50">
                                  {/* Clear All Filters Button */}
                                  {(selectedWarehouse || statusFilter) && (
                                    <Button
                                      variant="flat"
                                      color="danger"
                                      size="sm"
                                      onPress={() => {
                                        handleWarehouseChange(null);
                                        handleStatusFilterChange(null);
                                      }}
                                      startContent={<Icon icon="mdi:filter-remove" />}
                                    >
                                      Clear All Filters
                                    </Button>
                                  )}
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

                          {statusFilter && (
                            <Chip
                              variant="flat"
                              color={getStatusColor(statusFilter)}
                              onClose={() => handleStatusFilterChange(null)}
                              size="sm"
                              className="h-8 p-2"
                            >
                              <div className="flex items-center gap-1">
                                <Icon icon="mdi:filter-variant" className="text-xs" />
                                {statusFilter.replaceAll('_', ' ')}
                              </div>
                            </Chip>
                          )}

                          {(selectedWarehouse || statusFilter) && (
                            <Button
                              size="sm"
                              variant="light"
                              className="rounded-lg"
                              onPress={() => {
                                handleWarehouseChange(null);
                                handleStatusFilterChange(null);
                              }}
                            >
                              Clear all
                            </Button>
                          )}
                        </div>
                      </ScrollShadow>
                    </div>
                  </div>
                </LoadingAnimation>
              </div>

              <div className="h-full absolute w-full">
                <CustomScrollbar
                  scrollbarMarginTop="10.75rem"
                  scrollbarMarginBottom="0.5rem"
                  disabled={!user || isLoadingItems}
                  className="space-y-4 p-4 mt-1 pt-[11.5rem] h-full relative">
                  <ListLoadingAnimation
                    condition={!user || isLoadingItems}
                    containerClassName="space-y-4"
                    skeleton={[...Array(10)].map((_, i) => (
                      <Skeleton key={i} className="w-full min-h-[7.5rem] rounded-xl" />
                    ))}
                  >

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
                  </ListLoadingAnimation>

                  {/* Add pagination */}
                  {warehouseItems.length > 0 && (
                    <div className="flex flex-col items-center pt-2 pb-4 px-2">
                      <div className="text-sm text-default-500 mb-2">
                        Showing {(page - 1) * rowsPerPage + 1} to {Math.min(page * rowsPerPage, totalItems)} of {totalItems} {totalItems === 1 ? 'item' : 'items'}
                      </div>
                      <Pagination
                        total={totalPages}
                        initialPage={1}
                        page={page}
                        onChange={handlePageChange}
                        color="primary"
                        size="sm"
                        showControls
                      />
                    </div>
                  )}

                  {/* Empty state and loading animations */}
                  <AnimatePresence>
                    {(!user || isLoadingItems) && (
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center"
                        initial={{ opacity: 0, filter: "blur(8px)" }}
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        exit={{ opacity: 0, filter: "blur(8px)" }}
                        transition={{ duration: 0.3, delay: 0.3 }}
                      >
                        <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                        <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                          <Spinner />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CustomScrollbar>

                {/* No items found state */}
                <AnimatePresence>
                  {user && !isLoadingItems && warehouseItems.length === 0 && (
                    <motion.div
                      className="xl:h-full h-[42rem] absolute w-full"
                      initial={{ opacity: 0, filter: "blur(8px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(8px)" }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="py-4 flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                        <Icon icon="mdi:package-variant" className="text-5xl text-default-300" />
                        <p className="text-default-500 mt-2">No warehouse inventory items found</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Right side: Item Details */}
          <div className="xl:w-2/3">
            {selectedItemId ? (
              <div className="flex flex-col gap-2">
                <CardList>

                  <LoadingAnimation
                    condition={isLoading || isLoadingWarehouses || !formData}
                    skeleton={
                      <div>
                        <Skeleton className="h-6 w-48 rounded-xl mb-4 mx-auto" />
                        <div className="space-y-4">
                          <Skeleton className="h-16 w-full rounded-xl" />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Skeleton className="h-16 rounded-xl" />
                            <Skeleton className="h-16 rounded-xl" />
                            <Skeleton className="h-16 rounded-xl" />
                            <Skeleton className="h-16 rounded-xl" />
                            <Skeleton className="h-16 rounded-xl" />
                            <Skeleton className="h-16 rounded-xl" />
                          </div>
                          <Skeleton className="h-28 w-full rounded-xl" />
                          <Skeleton className="h-28 w-full rounded-xl" />
                        </div>
                      </div>
                    }>
                    {formData && formData.bulks && (
                      <div>
                        <h2 className="text-xl font-semibold mb-4 w-full text-center">Item Details</h2>
                        <div className="space-y-4">
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

                          <Textarea
                            label="Description"
                            value={formData.description || undefined}
                            isReadOnly
                            placeholder="Empty description"
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:text-box" className="text-default-500 mb-[0.2rem]" />}
                          />

                          {/* Warehouse Properties */}
                          {formData.properties && Object.keys(formData.properties).length > 0 && (
                            <div className="mt-4 p-3 bg-default-100 rounded-xl border-2 border-default-200">
                              <div className="flex items-center gap-2 mb-3">
                                <Icon icon="mdi:tag" className="text-default-500" width={16} />
                                <span className="text-sm font-medium">Warehouse Properties</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                {Object.entries(formData.properties).map(([key, value]) => (
                                  <div key={key}>
                                    <span className="text-default-500">{toTitleCase(toNormalCase(key))}:</span>
                                    <span className="ml-2">{String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </LoadingAnimation>


                  <div className="space-y-4">
                    <LoadingAnimation
                      condition={isLoading || isLoadingWarehouses}
                      skeleton={
                        <div>
                          <Skeleton className="h-6 w-48 rounded-xl mb-4 mx-auto" />
                          <div className="space-y-4">
                            <div className="flex justify-between items-center mb-4">
                              <Skeleton className="h-6 w-20 rounded-xl" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="p-4 border-2 border-default-200 rounded-xl space-y-4">
                              <div className="flex justify-between items-center mb-8">
                                <Skeleton className="h-6 w-40 rounded-full" />
                                <div className="flex items-center gap-4">
                                  <Skeleton className="h-5 w-16 rounded-full" />
                                  <Skeleton className="h-5 w-5 rounded-full" />
                                </div>
                              </div>
                              <Skeleton className="h-16 w-full rounded-xl" />

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Skeleton className="h-16 w-full rounded-xl" />
                                <Skeleton className="h-16 w-full rounded-xl" />
                                <Skeleton className="h-16 w-full rounded-xl" />
                                <Skeleton className="h-16 w-full rounded-xl" />
                              </div>

                              <Skeleton className="h-28 w-full rounded-xl" />

                              <div className="p-4 border-2 border-default-200 rounded-xl space-y-2">
                                <div className="flex justify-between items-center mb-4">
                                  <Skeleton className="h-6 w-40 rounded-full" />
                                  <Skeleton className="h-5 w-5 rounded-full" />
                                </div>
                                <div className="p-4 border-2 border-default-200 rounded-xl space-y-4">
                                  <div className="flex justify-between items-center mb-8">
                                    <Skeleton className="h-6 w-32 rounded-full" />
                                    <div className="flex items-center gap-4">
                                      <Skeleton className="h-5 w-16 rounded-full" />
                                      <Skeleton className="h-5 w-5 rounded-full" />
                                    </div>
                                  </div>
                                  <Skeleton className="h-16 w-full rounded-xl" />

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Skeleton className="h-16 w-full rounded-xl" />
                                    <Skeleton className="h-16 w-full rounded-xl" />
                                    <Skeleton className="h-16 w-full rounded-xl" />
                                    <Skeleton className="h-16 w-full rounded-xl" />
                                  </div>

                                  <Skeleton className="h-28 w-full rounded-xl" />

                                </div>

                                <div className="p-4 border-2 border-default-200 rounded-xl flex justify-between">
                                  <Skeleton className="h-6 w-40 rounded-full" />
                                  <div className="flex items-center gap-4">
                                    <Skeleton className="h-5 w-16 rounded-full" />
                                    <Skeleton className="h-5 w-5 rounded-full" />
                                  </div>
                                </div>

                                <div className="p-4 border-2 border-default-200 rounded-xl flex justify-between">
                                  <Skeleton className="h-6 w-40 rounded-full" />
                                  <div className="flex items-center gap-4">
                                    <Skeleton className="h-5 w-16 rounded-full" />
                                    <Skeleton className="h-5 w-5 rounded-full" />
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="p-4 border-2 border-default-200 rounded-xl flex justify-between">
                              <Skeleton className="h-6 w-40 rounded-full" />
                              <div className="flex items-center gap-4">
                                <Skeleton className="h-5 w-16 rounded-full" />
                                <Skeleton className="h-5 w-5 rounded-full" />
                              </div>
                            </div>

                            <div className="p-4 border-2 border-default-200 rounded-xl flex justify-between">
                              <Skeleton className="h-6 w-40 rounded-full" />
                              <div className="flex items-center gap-4">
                                <Skeleton className="h-5 w-16 rounded-full" />
                                <Skeleton className="h-5 w-5 rounded-full" />
                              </div>
                            </div>
                          </div>
                        </div>
                      }>
                      {formData && formData.bulks && (
                        <div>
                          <h2 className="text-xl font-semibold mb-4 w-full text-center">Bulk Items</h2>
                          <div>
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">

                                <Chip color="default" variant="flat" size="sm">
                                  {formData.bulks.length} bulk{formData.bulks.length !== 1 ? "s" : ""}
                                </Chip>

                              </div>
                            </div>

                            {formData.bulks.length === 0 ? (
                              <motion.div {...motionTransition}>
                                <div className="py-8 h-48 text-center text-default-500 border border-dashed border-default-300 rounded-lg justify-center flex flex-col items-center">
                                  <Icon icon="mdi:package-variant-closed" className="mx-auto mb-2 opacity-50" width={40} height={40} />
                                  <p>No bulk items available for this warehouse item</p>
                                </div>
                              </motion.div>
                            ) : (
                              <motion.div {...motionTransition} className="-mx-4">
                                <Accordion
                                  selectionMode="multiple"
                                  variant="splitted"
                                  selectedKeys={expandedBulks}
                                  onSelectionChange={(keys) => setExpandedBulks(keys as Set<string>)}
                                  itemClasses={{
                                    base: "p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
                                    title: "font-normal text-lg font-semibold",
                                    trigger: "p-4 data-[hover=true]:bg-default-100 flex items-center transition-colors",
                                    indicator: "text-medium",
                                    content: "text-small p-0",
                                  }}
                                >
                                  {formData.bulks.map((bulk, index) => (
                                    <AccordionItem
                                      key={bulk.uuid}
                                      aria-label={`Bulk ${bulk.uuid}`}
                                      className={`${index === 0 ? 'mt-4' : ''} mx-2`}
                                      title={
                                        <div className="flex justify-between items-center w-full">
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium">
                                              {bulk.is_single_item ? "Single Item" : `Bulk ${bulk.bulk_unit || ''}`}
                                            </span>
                                          </div>
                                          <div className="flex gap-2 flex-wrap justify-end">
                                            <Chip color="primary" variant="flat" size="sm">
                                              {formatNumber(bulk.unit_value)} {bulk.unit}
                                            </Chip>
                                            {bulk.location_code && (
                                              <Chip color="secondary" variant="flat" size="sm">
                                                {bulk.location_code}
                                              </Chip>
                                            )}
                                            {bulk.status && (
                                              <Chip color={bulk.status === "AVAILABLE" ? "success" : "danger"} variant="flat" size="sm">
                                                {bulk.status}
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

                                        {/* Bulk Properties */}
                                        {bulk.properties && Object.keys(bulk.properties).length > 0 && (
                                          <div className="mt-4 mx-4 p-3 bg-default-100 rounded-xl border-2 border-default-200">
                                            <div className="flex items-center gap-2 mb-3">
                                              <Icon icon="mdi:tag" className="text-default-500" width={16} />
                                              <span className="text-sm font-medium">Bulk Properties</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                              {Object.entries(bulk.properties).map(([key, value]) => (
                                                <div key={key}>
                                                  <span className="text-default-500">{toTitleCase(toNormalCase(key))}:</span>
                                                  <span className="ml-2">{String(value)}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        <div className="overflow-hidden px-4 py-4">
                                          <AnimatePresence mode="popLayout">
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

                                                  {/* Use the bulk's units from the itemUnits map */}
                                                  {(bulk.units.length > 0) ? (
                                                    <>
                                                      <Input
                                                        label="Warehouse Unit Identifier"
                                                        value={bulk.units[0].uuid}
                                                        isReadOnly
                                                        classNames={{ inputWrapper: inputStyle.inputWrapper }}
                                                        startContent={<Icon icon="mdi:cube-outline" className="text-default-500 mb-[0.2rem]" />}
                                                        endContent={
                                                          <Button
                                                            variant="flat"
                                                            color="default"
                                                            isIconOnly
                                                            onPress={() => copyToClipboard(bulk.units[0].uuid)}
                                                          >
                                                            <Icon icon="mdi:content-copy" className="text-default-500" />
                                                          </Button>
                                                        }
                                                      />

                                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <Input
                                                          label="Item Code"
                                                          value={bulk.units[0].code || ""}
                                                          isReadOnly
                                                          classNames={inputStyle}
                                                          startContent={<Icon icon="mdi:barcode" className="text-default-500 mb-[0.2rem]" />}
                                                        />

                                                        <Input
                                                          label="Item Name"
                                                          value={bulk.units[0].name || ""}
                                                          isReadOnly
                                                          classNames={inputStyle}
                                                          startContent={<Icon icon="mdi:tag" className="text-default-500 mb-[0.2rem]" />}
                                                        />

                                                        <Input
                                                          label="Unit"
                                                          value={`${bulk.units[0].unit_value} ${bulk.units[0].unit}`}
                                                          isReadOnly
                                                          classNames={inputStyle}
                                                          startContent={<Icon icon="mdi:ruler" className="text-default-500 mb-[0.2rem]" />}
                                                        />

                                                        <Input
                                                          label="Cost"
                                                          value={`${bulk.units[0].cost}`}
                                                          isReadOnly
                                                          classNames={inputStyle}
                                                          startContent={<Icon icon="mdi:currency-php" className="text-default-500 mb-[0.2rem]" />}
                                                        />
                                                      </div>
                                                    </>
                                                  ) : (
                                                    <div className="py-4 text-center text-default-500">
                                                      <p>No details available for this single item</p>
                                                    </div>
                                                  )}
                                                </div>
                                              </motion.div>
                                            ) : (
                                              <AnimatePresence mode="popLayout">
                                                {(bulk.units && bulk.units.length === 0) ? (
                                                  <motion.div {...motionTransition}>
                                                    <div className="py-4 m-4 h-48 text-center text-default-500 border border-dashed border-default-200 rounded-lg justify-center flex flex-col items-center">
                                                      <Icon icon="mdi:cube-outline" className="mx-auto mb-2 opacity-50" width={40} height={40} />
                                                      <p className="text-sm">No units available for this bulk</p>
                                                    </div>
                                                  </motion.div>
                                                ) : (
                                                  <motion.div
                                                    {...motionTransition}>
                                                    <div className="border-2 border-default-200 rounded-xl">
                                                      <div className="flex justify-between items-center p-4 pb-0">
                                                        <h3 className="text-lg font-semibold">Units in this Bulk</h3>
                                                      </div>

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
                                                        className="p-4 overflow-hidden"
                                                      >
                                                        {/* Use the bulk's units from the itemUnits map */}
                                                        {bulk.units.map((unit: any) => (
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
                                                            <div className="space-y-4 pb-4">
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

                                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 py-0">
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

                                                              {/* Unit Properties */}
                                                              {unit.properties && Object.keys(unit.properties).length > 0 && (
                                                                <div className="mx-4 p-3 bg-default-100 rounded-xl border-2 border-default-200">
                                                                  <div className="flex items-center gap-2 mb-3">
                                                                    <Icon icon="mdi:tag" className="text-default-500" width={16} />
                                                                    <span className="text-sm font-medium">Unit Properties</span>
                                                                  </div>
                                                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                                                    {Object.entries(unit.properties).map(([key, value]) => (
                                                                      <div key={key}>
                                                                        <span className="text-default-500">{toTitleCase(toNormalCase(key))}:</span>
                                                                        <span className="ml-2">{String(value)}</span>
                                                                      </div>
                                                                    ))}
                                                                  </div>
                                                                </div>
                                                              )}
                                                            </div>
                                                          </AccordionItem>
                                                        ))}
                                                      </Accordion>
                                                    </div>
                                                  </motion.div>
                                                )}
                                              </AnimatePresence>
                                            )}
                                          </AnimatePresence>
                                        </div>


                                        <div className="flex justify-end gap-2 bg-default-100/50 p-4">
                                          {bulk.location && (
                                            <div className="flex flex-wrap justify-end gap-2">
                                              <Button
                                                color="secondary"
                                                variant="flat"
                                                size="sm"
                                                onPress={() => handleViewBulkLocation(bulk.location)}
                                                startContent={<Icon icon="mdi:view-in-ar" />}
                                              >
                                                View Location
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

                                              <Button
                                                color="primary"
                                                variant="flat"
                                                size="sm"
                                                onPress={() => handleShowBulkQR(bulk.uuid, bulk.is_single_item ? "Single Item" : `Bulk ${bulk.bulk_unit || ''}`)}
                                                startContent={<Icon icon="mdi:qrcode" />}
                                              >
                                                Show QR
                                              </Button>

                                              <Button
                                                color="warning"
                                                variant="flat"
                                                size="sm"
                                                isDisabled={isLoadingMarkAsUsed || bulk.status === "USED"}
                                                onPress={() => handleMarkComponentsAsUsed(bulk.uuid)}
                                                startContent={
                                                  isLoadingMarkAsUsed ?
                                                    <Spinner size="sm" color="warning" />
                                                    : <Icon icon="mdi:check-circle" />
                                                }
                                              >
                                                Mark as Used
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
                          </div>
                        </div>
                      )}
                    </LoadingAnimation>
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
                        isDisabled={!formData?.warehouse_uuid || isLoading}
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
                        isDisabled={!formData?.inventory_uuid || isLoading}
                        className="my-1">
                        <Icon icon="mdi:chevron-right" width={16} height={16} />
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-col gap-4">
                    <AnimatePresence>
                      {error && (
                        <motion.div {...motionTransition}>
                          <Alert color="danger" variant="flat" onClose={() => setError(null)}>
                            {error}
                          </Alert>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex flex-col md:flex-row justify-center items-center gap-4">
                      <Button
                        color="primary"
                        variant="shadow"
                        className="w-full"
                        onPress={() => handleViewBulkLocation(null)}
                        isDisabled={!selectedItemId || isLoading}
                      >
                        <div className="flex items-center gap-2">
                          <Icon icon="mdi:map-marker" />
                          <span>View Location</span>
                        </div>
                      </Button>

                      <Button
                        color="secondary"
                        variant="shadow"
                        className="w-full"
                        onPress={handleShowWarehouseItemQR}
                        isDisabled={!selectedItemId || isLoading}
                      >
                        <div className="flex items-center gap-2">
                          <Icon icon="mdi:qrcode" />
                          <span>Show QR Code</span>
                        </div>
                      </Button>
                    </div>
                  </div>
                </CardList>
              </div>
            ) : (
              <div className="items-center justify-center p-12 border border-dashed border-default-300 rounded-2xl bg-background">
                <LoadingAnimation
                  condition={!user || isLoadingItems}
                  skeleton={
                    <div className="flex flex-col items-center justify-center">
                      <Skeleton className="w-16 h-16 rounded-full mb-4" />
                      <Skeleton className="h-6 w-48 rounded-xl mb-2" />
                      <Skeleton className="h-4 w-64 rounded-xl mb-6" />
                      <Skeleton className="h-10 w-32 rounded-xl" />
                    </div>
                  }>
                  <div className="flex flex-col items-center justify-center">
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
                </LoadingAnimation>

              </div>
            )}
          </div>
        </div>

        {/* Modal for QR Code */}
        <Modal
          isOpen={qrCodeModal.isOpen}
          onClose={qrCodeModal.onClose}
          placement="auto"
          backdrop="blur"
          size="lg"
          classNames={{
            backdrop: "bg-background/50"
          }}
        >
          <ModalContent>
            <ModalHeader>{qrCodeData.title}</ModalHeader>
            <ModalBody className="flex flex-col items-center">
              <div className="bg-white rounded-xl overflow-hidden">
                <QRCodeCanvas
                  id="warehouse-item-qrcode"
                  value={qrCodeData.url}
                  size={320}
                  marginSize={4}
                  level="L"
                />
              </div>

              <p className="text-center mt-4 text-default-600">
                {qrCodeData.description}
              </p>

              {/* Auto Mark as Used Toggle - Only show for bulk items */}
              {qrCodeData.isBulkItem && (
                <div className="w-full mt-4 p-4 bg-default-50 overflow-hidden rounded-xl border-2 border-default-200">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-default-700">Auto Mark as Used</span>
                      <span className="text-xs text-default-500">
                        When enabled, scanning this QR code will automatically mark the bulk item as USED
                      </span>
                    </div>
                    <Switch
                      isSelected={qrCodeData.autoMarkAsUsed}
                      onValueChange={updateQrCodeUrl}
                      color="warning"
                      size="sm"
                    />
                  </div>

                  <AnimatePresence>
                    {qrCodeData.autoMarkAsUsed && (
                      <motion.div
                        {...motionTransition}>
                        <div className="mt-3 p-2 bg-warning-50 border border-warning-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <Icon icon="mdi:alert" className="text-warning-600 mt-0.5 flex-shrink-0" width={16} />
                            <div>
                              <p className="text-xs font-medium text-warning-700">Warning</p>
                              <p className="text-xs text-warning-600">
                                This action cannot be undone. The bulk item will be marked as USED when scanned.
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* QR Code URL */}
              <div className="w-full bg-default-50 overflow-auto max-h-64 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-default-700">QR Code URL:</p>
                  <Button
                    size="sm"
                    variant="flat"
                    color="default"
                    isIconOnly
                    onPress={() => copyToClipboard(qrCodeData.url)}
                  >
                    <Icon icon="mdi:content-copy" className="text-default-500 text-sm" />
                  </Button>
                </div>
                <code className="text-xs text-default-600 break-all">
                  {qrCodeData.url}
                </code>
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
                  const canvas = document.getElementById('warehouse-item-qrcode') as HTMLCanvasElement;
                  const pngUrl = canvas.toDataURL('image/png');
                  const downloadLink = document.createElement('a');
                  downloadLink.href = pngUrl;
                  downloadLink.download = `warehouse-item-${formData?.uuid || 'item'}-${new Date().toISOString().split('T')[0]}.png`;
                  document.body.appendChild(downloadLink);
                  downloadLink.click();
                  document.body.removeChild(downloadLink);
                  qrCodeModal.onClose();
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
              Location for {formData?.name || "Warehouse Item"}
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
                      className={`absolute overflow-hidden ${showControls ? "bottom-8 left-8 h-8 shadow-sm" : "bottom-4 left-4 h-10 shadow-lg"} w-[12.6rem] bg-default-200/50 rounded-xl backdrop-blur-lg z-10 transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]`}>
                      <Button
                        onPress={() => setShowControls(!showControls)}
                        color="default"
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
                  {externalSelection &&
                    <motion.div {...motionTransition} className="absolute overflow-hidden top-4 right-4 flex items-start gap-2 bg-background/50 rounded-2xl backdrop-blur-lg flex flex-col p-4">
                      {locationCode &&
                        <span className="text-sm font-semibold"> Selected Code: <b>{locationCode}</b></span>
                      }
                      <span className="text-sm font-semibold">Current Code: <b>{formatCode(externalSelection)}</b></span>
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
    </motion.div>
  );
}