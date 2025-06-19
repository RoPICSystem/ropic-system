import { motionTransition, popoverTransition } from '@/utils/anim';
import {
  Accordion, AccordionItem, Alert, Autocomplete, AutocompleteItem, Button,
  Chip, Input, Modal, ModalBody, ModalContent, ModalFooter,
  ModalHeader, NumberInput, Popover, PopoverContent, PopoverTrigger,
  PressEvent,
  Skeleton, Spinner, Switch, useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeCanvas } from "qrcode.react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";

import CardList from '@/components/card-list';
import CustomScrollbar from "@/components/custom-scrollbar";
import LoadingAnimation from '@/components/loading-animation';
import { getStatusColor } from '@/utils/colors';
import { convertUnit, getUnitFullName } from '@/utils/measurements';
import { copyToClipboard, formatNumber, formatStatus, toNormalCase, toTitleCase } from '@/utils/tools';

import {
  getWarehouseInventoryItem,
  markWarehouseGroupAsUsed,
  markWarehouseGroupBulkUsed,
  markWarehouseItemAsUsed,
  markWarehouseItemsBulkUsed,
  WarehouseInventory
} from './actions';

// Add these imports for 3D location functionality
import { Popover3dNavigationHelp } from "@/components/popover-3dnavigation-help";
import { ShelfSelectorColorAssignment } from '@/components/shelf-selector-3d';
import { getOccupiedShelfLocations } from "../delivery/actions";
import { createClient } from '@/utils/supabase/client';
// Add the lazy import for the 3D component
const ShelfSelector3D = lazy(() =>
  import("@/components/shelf-selector-3d").then(mod => ({
    default: mod.ShelfSelector3D
  }))
);

interface Warehouse {
  uuid: string;
  name: string;
  layout?: any[];
}

interface InventoryComponentProps {
  // Core identifiers
  inventoryId: string | null;

  // User and permissions
  user: any;

  // Data arrays
  warehouses: Array<Partial<Warehouse> & { uuid: string }>;
  inventories: any[];

  // Callbacks for actions
  handleViewWarehouse: ((e: PressEvent) => void) | null;
  handleViewInventory: ((e: PressEvent) => void) | null;
  onLoadingChange?: (isLoading: boolean) => void;

  // Optional overrides for specific behaviors
  readOnlyMode?: boolean;

  // Optional initial data
  initialFormData?: Partial<WarehouseInventory>;
}

export function WarehouseInventoryComponent({
  inventoryId,
  user,
  warehouses,
  inventories,
  handleViewWarehouse = (e: PressEvent) => { },
  handleViewInventory = (e: PressEvent) => { },
  onLoadingChange,
  readOnlyMode = false,
  initialFormData = {}
}: InventoryComponentProps) {

  // ===== STATE MANAGEMENT =====
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<any>({});

  // View and UI states
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedGroupDetails, setExpandedGroupDetails] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('grouped');

  // QR Code modal
  const qrModal = useDisclosure();
  const [qrData, setQrData] = useState({
    itemId: '',
    itemName: '',
    url: '',
    autoMarkAsUsed: false,
    description: ''
  });

  // Mark as used loading states
  const [isLoadingMarkAsUsed, setIsLoadingMarkAsUsed] = useState(false);
  const [isLoadingMarkGroupAsUsed, setIsLoadingMarkGroupAsUsed] = useState(false);
  const [isLoadingMarkBulkAsUsed, setIsLoadingMarkBulkAsUsed] = useState(false);
  const [isLoadingMarkGroupBulkAsUsed, setIsLoadingMarkGroupBulkAsUsed] = useState(false);

  // Bulk mark as used states
  const [bulkMarkCount, setBulkMarkCount] = useState(1);
  const [groupBulkMarkCounts, setGroupBulkMarkCounts] = useState<{ [key: string]: number }>({});

  // Search and filter states
  const [showInventorySearch, setShowInventorySearch] = useState(false);
  const [isInventorySearchFilterOpen, setIsInventorySearchFilterOpen] = useState(false);
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");
  const [inventorySearchFilters, setInventorySearchFilters] = useState({
    status: null as string | null,
    unit: null as string | null,
    unit_value: null as number | null,
    packaging_unit: null as string | null,
  });

  // 3D Location states
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedItemLocation, setSelectedItemLocation] = useState<any>(null);
  const [floorConfigs, setFloorConfigs] = useState<any[]>([]);
  const [occupiedLocations, setOccupiedLocations] = useState<any[]>([]);
  const [shelfColorAssignments, setShelfColorAssignments] = useState<Array<ShelfSelectorColorAssignment>>([]);
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(null);
  const [externalSelection, setExternalSelection] = useState<any>(null);

  // Input style for consistency
  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200"
  };
  const autoCompleteStyle = { classNames: inputStyle };

  // ===== HELPER FUNCTIONS =====
  const getFilterOptions = (items: any[]) => {
    const statuses = new Set<string>();
    const units = new Set<string>();
    const unitValues = new Set<number>();
    const packagingUnits = new Set<string>();

    items.forEach(item => {
      if (item.status) statuses.add(item.status);
      if (item.unit) units.add(item.unit);
      if (item.unit_value) unitValues.add(item.unit_value);
      if (item.packaging_unit) packagingUnits.add(item.packaging_unit);
    });

    return {
      statuses: Array.from(statuses).sort(),
      units: Array.from(units).sort(),
      unitValues: Array.from(unitValues).sort((a, b) => a - b),
      packagingUnits: Array.from(packagingUnits).sort()
    };
  };

  // Get grouped items for display
  const getGroupedItems = () => {
    if (!formData.items) return {};

    const grouped: { [key: string]: any[] } = {};
    formData.items.forEach((item: any) => {
      const groupId = item.group_id || 'ungrouped';
      if (!grouped[groupId]) {
        grouped[groupId] = [];
      }
      grouped[groupId].push(item);
    });

    // Sort items within each group - available items first, used items last
    Object.keys(grouped).forEach(groupId => {
      grouped[groupId].sort((a, b) => {
        // First sort by status: AVAILABLE items come first
        if (a.status === 'AVAILABLE' && b.status !== 'AVAILABLE') return -1;
        if (a.status !== 'AVAILABLE' && b.status === 'AVAILABLE') return 1;
        if (a.status === 'USED' && b.status !== 'USED') return 1;
        if (a.status !== 'USED' && b.status === 'USED') return -1;

        // Then sort by creation date (newest first within same status)
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
    });

    return grouped;
  };

  // Filter items based on search and filters
  const filterItems = useCallback((items: any[]) => {
    if (!items) return [];

    return items.filter(item => {
      // Search query filter
      if (inventorySearchQuery) {
        const searchLower = inventorySearchQuery.toLowerCase();
        const matchesSearch =
          item.item_code?.toLowerCase().includes(searchLower) ||
          item.properties && Object.values(item.properties).some((value: any) =>
            String(value).toLowerCase().includes(searchLower)
          );
        if (!matchesSearch) return false;
      }

      // Status filter
      if (inventorySearchFilters.status && item.status !== inventorySearchFilters.status) {
        return false;
      }

      // Unit filter
      if (inventorySearchFilters.unit && item.unit !== inventorySearchFilters.unit) {
        return false;
      }

      // Unit value filter
      if (inventorySearchFilters.unit_value && item.unit_value !== inventorySearchFilters.unit_value) {
        return false;
      }

      // Packaging unit filter
      if (inventorySearchFilters.packaging_unit && item.packaging_unit !== inventorySearchFilters.packaging_unit) {
        return false;
      }

      return true;
    });
  }, [inventorySearchQuery, inventorySearchFilters]);

  const getDisplayItemsList = () => {
    if (!formData.items) return [];

    if (viewMode === 'flat') {
      const filteredItems = filterItems(formData.items);
      // Sort filtered items - available items first, used items last
      return filteredItems.sort((a, b) => {
        // First sort by status: AVAILABLE items come first
        if (a.status === 'AVAILABLE' && b.status !== 'AVAILABLE') return -1;
        if (a.status !== 'AVAILABLE' && b.status === 'AVAILABLE') return 1;
        if (a.status === 'USED' && b.status !== 'USED') return 1;
        if (a.status !== 'USED' && b.status === 'USED') return -1;

        // Then sort by creation date (newest first within same status)
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      });
    }

    const groupedItems = getGroupedItems();
    const displayItems: any[] = [];

    Object.entries(groupedItems).forEach(([groupId, items]) => {
      if (groupId === 'ungrouped') {
        const filteredItems = filterItems(items);
        displayItems.push(...filteredItems);
      } else {
        // Show only the first item of each group (which is now sorted with available items first)
        const groupItems = filterItems(items);
        if (groupItems.length > 0) {
          // Use the first available item as representative, or first item if none available
          const representativeItem = groupItems.find(item => item.status === 'AVAILABLE') || groupItems[0];
          displayItems.push({
            ...representativeItem,
            _isGroupRepresentative: true,
            _groupSize: items.length,
            _groupId: groupId
          });
        }
      }
    });

    // Sort display items by group status - groups with available items first
    return displayItems.sort((a, b) => {
      if (a._isGroupRepresentative && b._isGroupRepresentative) {
        // Both are group representatives - sort by group status
        const aGroupItems = formData.items?.filter((item: any) => item.group_id === a._groupId) || [];
        const bGroupItems = formData.items?.filter((item: any) => item.group_id === b._groupId) || [];

        const aHasAvailable = aGroupItems.some((item: any) => item.status === 'AVAILABLE');
        const bHasAvailable = bGroupItems.some((item: any) => item.status === 'AVAILABLE');

        if (aHasAvailable && !bHasAvailable) return -1;
        if (!aHasAvailable && bHasAvailable) return 1;
      } else if (a._isGroupRepresentative && !b._isGroupRepresentative) {
        // Group vs individual item
        const aGroupItems = formData.items?.filter((item: any) => item.group_id === a._groupId) || [];
        const aHasAvailable = aGroupItems.some((item: any) => item.status === 'AVAILABLE');

        if (aHasAvailable && b.status !== 'AVAILABLE') return -1;
        if (!aHasAvailable && b.status === 'AVAILABLE') return 1;
      } else if (!a._isGroupRepresentative && b._isGroupRepresentative) {
        // Individual item vs group
        const bGroupItems = formData.items?.filter((item: any) => item.group_id === b._groupId) || [];
        const bHasAvailable = bGroupItems.some((item: any) => item.status === 'AVAILABLE');

        if (a.status === 'AVAILABLE' && !bHasAvailable) return -1;
        if (a.status !== 'AVAILABLE' && bHasAvailable) return 1;
      } else {
        // Both are individual items
        if (a.status === 'AVAILABLE' && b.status !== 'AVAILABLE') return -1;
        if (a.status !== 'AVAILABLE' && b.status === 'AVAILABLE') return 1;
        if (a.status === 'USED' && b.status !== 'USED') return 1;
        if (a.status !== 'USED' && b.status === 'USED') return -1;
      }

      // Default sort by creation date
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  };

  // ===== ACTION HANDLERS =====
  // Handle mark item as used
  const handleMarkItemAsUsed = async (itemUuid: string) => {
    setIsLoadingMarkAsUsed(true);
    try {
      const result = await markWarehouseItemAsUsed(itemUuid);
      if (result.success) {
        // Refresh the details
        if (inventoryId) {
          const refreshedItem = await getWarehouseInventoryItem(inventoryId);
          if (refreshedItem.success && refreshedItem.data) {
            setFormData(refreshedItem.data);
          }
        }
      } else {
        setError(result.error || "Failed to mark item as used");
      }
    } catch (error) {
      console.error("Failed to mark item as used:", error);
      setError("Failed to mark item as used");
    } finally {
      setIsLoadingMarkAsUsed(false);
    }
  };

  // Handle mark group as used
  const handleMarkGroupAsUsed = async (groupId: string) => {
    setIsLoadingMarkGroupAsUsed(true);
    try {
      const result = await markWarehouseGroupAsUsed(groupId);
      if (result.success) {
        // Refresh the details
        if (inventoryId) {
          const refreshedItem = await getWarehouseInventoryItem(inventoryId);
          if (refreshedItem.success && refreshedItem.data) {
            setFormData(refreshedItem.data);
          }
        }
      } else {
        setError(result.error || "Failed to mark group as used");
      }
    } catch (error) {
      console.error("Failed to mark group as used:", error);
      setError("Failed to mark group as used");
    } finally {
      setIsLoadingMarkGroupAsUsed(false);
    }
  };

  // Handle bulk mark items as used
  const handleMarkItemsBulkAsUsed = async (count: number) => {
    if (!inventoryId || count <= 0) return;

    setIsLoadingMarkBulkAsUsed(true);
    try {
      const result = await markWarehouseItemsBulkUsed(inventoryId, count);
      if (result.success) {
        // Refresh the details
        const refreshedItem = await getWarehouseInventoryItem(inventoryId);
        if (refreshedItem.success && refreshedItem.data) {
          setFormData(refreshedItem.data);
        }
      } else {
        setError(result.error || "Failed to mark items as used");
      }
    } catch (error) {
      console.error("Failed to mark items as used:", error);
      setError("Failed to mark items as used");
    } finally {
      setIsLoadingMarkBulkAsUsed(false);
    }
  };

  // Handle bulk mark group as used
  const handleMarkGroupBulkAsUsed = async (groupId: string, count: number) => {
    if (count <= 0) return;

    setIsLoadingMarkGroupBulkAsUsed(true);
    try {
      const result = await markWarehouseGroupBulkUsed(groupId, count);
      if (result.success) {
        // Refresh the details
        if (inventoryId) {
          const refreshedItem = await getWarehouseInventoryItem(inventoryId);
          if (refreshedItem.success && refreshedItem.data) {
            setFormData(refreshedItem.data);
          }
        }
      } else {
        setError(result.error || "Failed to mark group items as used");
      }
    } catch (error) {
      console.error("Failed to mark group items as used:", error);
      setError("Failed to mark group items as used");
    } finally {
      setIsLoadingMarkGroupBulkAsUsed(false);
    }
  };

  // Handle view delivery
  const handleViewDelivery = (deliveryId: string) => {
    // Router navigation would be handled by parent component
    console.log("Navigate to delivery:", deliveryId);
  };

  // QR Code generation functions
  const generateUrl = (itemId: string, autoMarkAsUsed: boolean) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const params = new URLSearchParams();
    if (autoMarkAsUsed) {
      params.set('autoUse', 'true');
    }
    return `${baseUrl}/home/warehouse-items?warehouseItemId=${itemId}${params.toString() ? '&' + params.toString() : ''}`;
  };

  const handleShowWarehouseItemQR = () => {
    setQrData(prev => ({
      ...prev,
      itemId: inventoryId || '',
      itemName: formData.name || 'Warehouse Item',
      url: generateUrl(inventoryId || '', false),
      autoMarkAsUsed: false,
      description: `Scan this code to view details for ${formData.name || 'Warehouse Item'}`
    }));
    qrModal.onOpen();
  };

  // 3D Location functionality
  const handleViewBulkLocation = async (itemUuid: string | null, groupId?: string) => {
    if (!formData?.warehouse_uuid) {
      setError("No warehouse information available");
      return;
    }

    try {
      // Get warehouse information using the getOccupiedShelfLocations function which has warehouse data access
      // First, let's create a helper function to get warehouse layout
      const getWarehouseLayout = async (warehouseUuid: string) => {
        try {
          const supabase = createClient();
          const { data: warehouseData, error: warehouseError } = await supabase
            .from('warehouses')
            .select('layout')
            .eq('uuid', warehouseUuid)
            .single();

          if (warehouseError) {
            throw warehouseError;
          }

          return warehouseData?.layout || [];
        } catch (error) {
          console.error("Error fetching warehouse layout:", error);
          return [];
        }
      };

      // Get warehouse layout directly from database instead of relying on props
      const warehouseLayout = await getWarehouseLayout(formData.warehouse_uuid);

      if (!warehouseLayout || warehouseLayout.length === 0) {
        setError("Warehouse layout not configured");
        return;
      }

      setFloorConfigs(warehouseLayout);

      // Set up color assignments for current item(s)
      const assignments: Array<ShelfSelectorColorAssignment> = [];
      let navigationTarget: any = null;

      if (groupId) {
        // Handle group selection - show group items as tertiary, rest as secondary
        const groupItems = formData.items?.filter((item: any) => item.group_id === groupId) || [];
        const otherItems = formData.items?.filter((item: any) => item.group_id !== groupId) || [];

        // Add group items as tertiary (highlighted)
        groupItems.forEach((item: any) => {
          if (item.location) {
            assignments.push({
              floor: item.location.floor,
              group: item.location.group,
              row: item.location.row,
              column: item.location.column,
              depth: item.location.depth,
              colorType: 'tertiary'
            });
          }
        });

        // Set navigation target to the first group item's location
        if (groupItems.length > 0 && groupItems[0].location) {
          navigationTarget = groupItems[0].location;
          setHighlightedFloor(groupItems[0].location.floor);
        }

        // Set selected item location to the first group item for the overlay
        setSelectedItemLocation(groupItems[0] || null);

        // Add other items as secondary
        otherItems.forEach((item: any) => {
          if (item.location) {
            assignments.push({
              floor: item.location.floor,
              group: item.location.group,
              row: item.location.row,
              column: item.location.column,
              depth: item.location.depth,
              colorType: 'secondary'
            });
          }
        });
      } else if (itemUuid) {
        // Handle individual item selection - show selected item as tertiary, rest as secondary
        const selectedItem = formData.items?.find((item: any) => item.uuid === itemUuid);
        const otherItems = formData.items?.filter((item: any) => item.uuid !== itemUuid) || [];

        // Add selected item as tertiary
        if (selectedItem?.location) {
          assignments.push({
            floor: selectedItem.location.floor,
            group: selectedItem.location.group,
            row: selectedItem.location.row,
            column: selectedItem.location.column,
            depth: selectedItem.location.depth,
            colorType: 'tertiary'
          });

          navigationTarget = selectedItem.location;
          setHighlightedFloor(selectedItem.location.floor);
        }

        // Add other items as secondary
        otherItems.forEach((item: any) => {
          if (item.location) {
            assignments.push({
              floor: item.location.floor,
              group: item.location.group,
              row: item.location.row,
              column: item.location.column,
              depth: item.location.depth,
              colorType: 'secondary'
            });
          }
        });

        setSelectedItemLocation(selectedItem || null);
      } else {
        // Show all items as secondary (overview mode)
        formData.items?.forEach((item: any) => {
          if (item.location) {
            assignments.push({
              floor: item.location.floor,
              group: item.location.group,
              row: item.location.row,
              column: item.location.column,
              depth: item.location.depth,
              colorType: 'secondary'
            });
          }
        });
        setSelectedItemLocation(null);
      }

      setShelfColorAssignments(assignments);

      // Set external selection for 3D navigation
      if (navigationTarget) {
        setExternalSelection({
          floor: navigationTarget.floor,
          group: navigationTarget.group,
          row: navigationTarget.row,
          column: navigationTarget.column,
          depth: navigationTarget.depth,
          code: navigationTarget.code
        });
      } else {
        setExternalSelection(null);
      }

      // Load occupied locations, excluding those in assignments
      const occupiedResult = await getOccupiedShelfLocations(formData.warehouse_uuid);
      if (occupiedResult.success) {
        const filteredOccupied = (occupiedResult.data || []).filter((occupied: any) => {
          return !assignments.some(assignment =>
            assignment.floor === occupied.floor &&
            assignment.group === occupied.group &&
            assignment.row === occupied.row &&
            assignment.column === occupied.column &&
            assignment.depth === occupied.depth
          );
        });
        setOccupiedLocations(filteredOccupied);
      }

      setShowLocationModal(true);
    } catch (error) {
      console.error("Error loading warehouse location:", error);
      setError("Failed to load warehouse location");
    }
  };


  // ===== CORE FUNCTIONS =====
  // Load warehouse inventory item details
  const fetchItemDetails = async (itemId: string) => {
    if (!itemId) return;

    setIsLoading(true);
    try {
      const result = await getWarehouseInventoryItem(itemId);
      if (result.success && result.data) {
        setFormData(result.data);

        // Set expanded state for first items if they exist
        if (result.data.items && result.data.items.length > 0) {
          setExpandedItems(new Set([`${result.data.items[0].uuid}`]));
        }
      } else {
        setError("Failed to load warehouse item details");
      }
    } catch (err) {
      console.error("Error fetching item details:", err);
      setError("An error occurred while loading item details");
    } finally {
      setIsLoading(false);
    }
  };

  // ===== EFFECTS =====
  useEffect(() => {
    if (inventoryId) {
      fetchItemDetails(inventoryId);
    } else {
      setFormData({});
      setExpandedItems(new Set());
    }
  }, [inventoryId]);

  // Set up real-time updates
  useEffect(() => {
    if (!user?.company_uuid || !inventoryId) return;

    const supabase = createClient();

    const warehouseInventoryChannel = supabase
      .channel('warehouse-inventory-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'warehouse_inventory',
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async (payload) => {
          console.log('Real-time update received:', payload);

          // Only handle updates for the current inventory item
          if (payload.new &&
            inventoryId &&
            typeof payload.new === 'object' &&
            'uuid' in payload.new &&
            payload.new.uuid === inventoryId) {
            try {
              const result = await getWarehouseInventoryItem(inventoryId);
              if (result.success && result.data) {
                setFormData(result.data);
                setExpandedItems(new Set([`${result.data.items?.[0]?.uuid || ''}`]));
              } else {
                console.error("Failed to refresh warehouse item details");
              }
            } catch (error) {
              console.error("Error refreshing warehouse item details:", error);
            }
          }
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up real-time subscriptions for warehouse inventory');
      supabase.removeChannel(warehouseInventoryChannel);
    };
  }, [user?.company_uuid, inventoryId]);



  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  return (
    <div className="flex flex-col gap-2">
      <CardList>
        <LoadingAnimation
          condition={isLoading || !formData}
          skeleton={
            <div>
              <Skeleton className="h-6 w-48 rounded-xl mb-4 mx-auto" />
              <div className="space-y-4">
                {/* Warehouse Item Identifier Skeleton */}
                <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl">
                  <div className="flex items-center gap-3 flex-1">
                    <Skeleton className="w-4 h-4 rounded-full flex-shrink-0" />
                    <div className="flex flex-col flex-1">
                      <Skeleton className="h-3 w-32 rounded-xl mb-1" />
                      <Skeleton className="h-4 w-64 rounded-xl" />
                    </div>
                  </div>
                  <Skeleton className="w-8 h-8 rounded-xl" />
                </div>

                {/* Item Name Skeleton */}
                <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl">
                  <div className="flex items-center gap-3 flex-1">
                    <Skeleton className="w-4 h-4 rounded-full flex-shrink-0" />
                    <div className="flex flex-col flex-1">
                      <Skeleton className="h-3 w-20 rounded-xl mb-1" />
                      <Skeleton className="h-4 w-48 rounded-xl" />
                    </div>
                  </div>
                </div>

                {/* Standard Unit and Measurement Unit Skeleton */}
                <div className="flex items-start justify-between gap-4 md:flex-row flex-col">
                  <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl w-full">
                    <div className="flex items-center gap-3 flex-1">
                      <Skeleton className="w-4 h-4 rounded-full flex-shrink-0" />
                      <div className="flex flex-col flex-1">
                        <Skeleton className="h-3 w-24 rounded-xl mb-1" />
                        <Skeleton className="h-4 w-32 rounded-xl" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl w-full">
                    <div className="flex items-center gap-3 flex-1">
                      <Skeleton className="w-4 h-4 rounded-full flex-shrink-0" />
                      <div className="flex flex-col flex-1">
                        <Skeleton className="h-3 w-28 rounded-xl mb-1" />
                        <Skeleton className="h-4 w-20 rounded-xl" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description Skeleton */}
                <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl">
                  <div className="flex items-center gap-3 flex-1">
                    <Skeleton className="w-4 h-4 rounded-full flex-shrink-0" />
                    <div className="flex flex-col flex-1">
                      <Skeleton className="h-3 w-20 rounded-xl mb-1" />
                      <Skeleton className="h-4 w-full rounded-xl" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2 bg-default-100/50 rounded-xl border-2 border-default-200">
                  <div className="text-center flex flex-col items-center gap-1 bg-default-200/50 rounded-md p-4">
                    <Skeleton className="h-4 w-12 rounded-xl" />
                    <div className="flex flex-col items-center gap-1">
                      <Skeleton className="h-8 w-20 rounded-xl" />
                      <Skeleton className="h-6 w-16 rounded-full" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  </div>
                  <div className="text-center flex flex-col items-center gap-1 bg-success-200/50 rounded-md p-4">
                    <Skeleton className="h-4 w-16 rounded-xl" />
                    <div className="flex flex-col items-center gap-1">
                      <Skeleton className="h-8 w-24 rounded-xl" />
                      <Skeleton className="h-6 w-16 rounded-full" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                  </div>
                  <div className="text-center flex flex-col items-center gap-1 bg-warning-200/50 rounded-md p-4">
                    <Skeleton className="h-4 w-20 rounded-xl" />
                    <div className="flex flex-col items-center gap-1">
                      <Skeleton className="h-8 w-28 rounded-xl" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </div>
                  </div>
                </div>

                {/* Bulk Mark as Used Skeleton */}
                <div className="p-4 bg-warning-50/30 rounded-xl border-2 border-warning-200/30">
                  <div className="flex items-center gap-3 mb-3 justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="w-4 h-4 rounded-full" />
                      <Skeleton className="h-4 w-32 rounded-xl" />
                    </div>
                  </div>
                  <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 w-full">
                    <div className="flex flex-col gap-1 flex-1 w-full lg:w-auto">
                      <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                    <div className="flex gap-2 w-full lg:w-auto lg:flex-shrink-0">
                      <Skeleton className="h-8 w-28 rounded-xl flex-1 lg:flex-initial" />
                      <Skeleton className="h-8 w-24 rounded-xl flex-1 lg:flex-initial" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }>

          <div>
            <h2 className="text-xl font-semibold mb-4 w-full text-center">
              Warehouse Item Details
            </h2>

            <div className="space-y-4">
              {/* Warehouse Item Identifier */}
              {formData.uuid && (
                <div>
                  <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200">
                    <div className="flex items-center gap-3">
                      <Icon icon="mdi:package-variant" className="text-default-500 w-4 h-4 flex-shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs text-default-600 font-medium">Warehouse Item Identifier</span>
                        <span className="text-md font-semibold text-default-700">
                          {formData.uuid}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="flat"
                      color="default"
                      isIconOnly
                      onPress={() => copyToClipboard(formData.uuid || "")}
                    >
                      <Icon icon="mdi:content-copy" className="text-default-500" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Item Name */}
              <div>
                <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200">
                  <div className="flex items-center gap-3">
                    <Icon icon="mdi:tag" className="text-default-500 w-4 h-4 flex-shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-xs text-default-600 font-medium">Item Name</span>
                      <span className="text-md font-semibold text-default-700">
                        {formData.name || "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start justify-between gap-4 md:flex-row flex-col">
                {/* Standard Unit */}
                {formData.standard_unit && (
                  <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200 w-full">
                    <div className="flex items-center gap-3">
                      <Icon icon="mdi:scale-balance" className="text-default-500 w-4 h-4 flex-shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs text-default-600 font-medium">Standard Unit</span>
                        <span className="text-md font-semibold text-default-700">
                          {getUnitFullName(formData.standard_unit)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Measurement Unit */}
                {formData.measurement_unit && (
                  <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200 w-full">
                    <div className="flex items-center gap-3">
                      <Icon icon="mdi:weight-kilogram" className="text-default-500 w-4 h-4 flex-shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs text-default-600 font-medium">Measurement Unit</span>
                        <span className="text-md font-semibold text-default-700">
                          {toNormalCase(formData.measurement_unit)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              {formData.description && (
                <div>
                  <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200">
                    <div className="flex items-center gap-3">
                      <Icon icon="mdi:text-box" className="text-default-500 w-4 h-4 flex-shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-xs text-default-600 font-medium">Description</span>
                        <span className="text-md font-semibold text-default-700">
                          {formData.description || "Empty description"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Display aggregated values if they exist */}
              {formData.unit_values && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2 bg-default-100/50 rounded-xl border-2 border-default-200">
                  <div className="text-center flex flex-col items-center gap-1 bg-default-200/50 rounded-md p-4">
                    <div className="text-sm text-default-600">
                      Total
                    </div>
                    <div className="text-default-600 flex flex-col items-center gap-1">
                      <span className="inline-flex items-end gap-1">
                        <span className="text-2xl font-bold">
                          {formatNumber(formData.unit_values.total)}
                        </span>
                        <span className="text-md text-default-600/75 font-semibold">
                          {formData.standard_unit}
                        </span>
                      </span>
                      {(() => {
                        const totalCost = formData.items?.reduce((total: number, item: any) => total + (item.cost || 0), 0) || 0;

                        return totalCost > 0 ? (
                          <span className="inline-flex text-default-600 items-center gap-1 bg-default-200 rounded-full px-2 py-[0.15rem] w-full justify-center">
                            <span className="text-sm font-semibold">
                              ₱ {formatNumber(totalCost)}
                            </span>
                          </span>
                        ) : null;
                      })()}
                      <span className="inline-flex text-default-100 items-center gap-1 bg-default-600 rounded-full px-2 py-[0.15rem] w-full justify-center">
                        <span className="text-sm font-bold">
                          {formatNumber(formData.count.total)}
                        </span>
                        <span className="text-xs text-default-100/75 font-semibold">
                          items
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="text-center flex flex-col items-center gap-1 bg-success-200/50 rounded-md p-4">
                    <div className="text-sm text-success-600">
                      Available
                    </div>
                    <div className="text-success-600 flex flex-col items-center gap-1">
                      <span className="inline-flex items-end gap-1">
                        <span className="text-2xl font-bold">
                          {formatNumber(formData.unit_values.available)}
                        </span>
                        <span className="text-md text-success-600/75 font-semibold">
                          {formData.standard_unit}
                        </span>
                      </span>
                      {(() => {
                        const availableCost = formData.items?.filter((item: any) => item.status === 'AVAILABLE')
                          .reduce((total: number, item: any) => total + (item.cost || 0), 0) || 0;

                        return availableCost > 0 ? (
                          <span className="inline-flex text-success-600 items-center gap-1 bg-success-200 rounded-full px-2 py-[0.15rem] w-full justify-center">
                            <span className="text-sm font-semibold">
                              ₱ {formatNumber(availableCost)}
                            </span>
                          </span>
                        ) : null;
                      })()}
                      <span className="inline-flex text-success-100 items-center gap-1 bg-success-600 rounded-full px-2 py-[0.15rem] w-full justify-center">
                        <span className="text-sm font-bold">
                          {formatNumber(formData.count.available)}
                        </span>
                        <span className="text-xs text-success-100/75 font-semibold">
                          items
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="text-center flex flex-col items-center gap-1 bg-warning-200/50 rounded-md p-4">
                    <div className="text-sm text-warning-600">
                      Used
                    </div>
                    <div className="text-warning-600 flex flex-col items-center gap-1">
                      <span className="inline-flex items-end gap-1">
                        <span className="text-2xl font-bold">
                          {formatNumber(formData.unit_values.used)}
                        </span>
                        <span className="text-md text-warning-600/75 font-semibold">
                          {formData.standard_unit}
                        </span>
                      </span>
                      {(() => {
                        const usedCost = formData.items?.filter((item: any) => item.status === 'USED')
                          .reduce((total: number, item: any) => total + (item.cost || 0), 0) || 0;

                        return usedCost > 0 ? (
                          <span className="inline-flex text-warning-600 items-center gap-1 bg-warning-200 rounded-full px-2 py-[0.15rem] w-full justify-center">
                            <span className="text-sm font-semibold">
                              ₱ {formatNumber(usedCost)}
                            </span>
                          </span>
                        ) : null;
                      })()}
                      <span className="inline-flex text-warning-100 items-center gap-1 bg-warning-600  rounded-full px-2 py-[0.15rem] w-full justify-center">
                        <span className="text-sm font-bold">
                          {formatNumber(formData.count.used)}
                        </span>
                        <span className="text-xs text-warning-100/75 font-semibold">
                          items
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Bulk Mark as Used Section */}
              {!readOnlyMode && formData.count?.available > 0 && (
                <div className="p-4 bg-warning-50 rounded-xl border-2 border-warning-200">
                  <div className="flex items-center gap-3 mb-3 justify-between">
                    <div className="flex items-center gap-2">
                      <Icon icon="mdi:package-variant-closed" className="text-warning-600 w-4 h-4 flex-shrink-0" />
                      <span className="text-sm text-warning-700 font-medium">
                        Bulk Mark as Used
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 w-full">
                    <NumberInput
                      label="Number of items"
                      value={bulkMarkCount}
                      onValueChange={setBulkMarkCount}
                      minValue={1}
                      maxValue={formData.count.available}
                      className="flex-1 w-full lg:w-auto"
                      classNames={inputStyle}
                    />
                    <div className="flex gap-2 w-full lg:w-auto lg:flex-shrink-0">
                      <Button
                        color="warning"
                        variant="shadow"
                        size="sm"
                        onPress={() => handleMarkItemsBulkAsUsed(bulkMarkCount)}
                        startContent={
                          isLoadingMarkBulkAsUsed ?
                            <Spinner size="sm" color="warning" />
                            : <Icon icon="mdi:check-circle" width={16} height={16} />
                        }
                        isDisabled={isLoadingMarkBulkAsUsed || bulkMarkCount <= 0 || bulkMarkCount > formData.count.available}
                        className="flex-1 lg:flex-initial"
                      >
                        Mark as Used
                      </Button>
                      <Button
                        color="warning"
                        variant="flat"
                        size="sm"
                        onPress={() => handleMarkItemsBulkAsUsed(1)}
                        startContent={
                          isLoadingMarkBulkAsUsed ?
                            <Spinner size="sm" color="warning" />
                            : <Icon icon="mdi:package-variant" width={16} height={16} />
                        }
                        isDisabled={isLoadingMarkBulkAsUsed || formData.count.available <= 0}
                        className="flex-1 lg:flex-initial"
                      >
                        Mark 1 Item
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </LoadingAnimation>
      </CardList>

      <CardList>
        <LoadingAnimation
          condition={isLoading || !formData}
          skeleton={
            <div>
              <Skeleton className="h-6 w-48 rounded-xl mb-4 mx-auto" />
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-18 rounded-full" />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Skeleton className="h-8 w-20 rounded-xl" />
                    <Skeleton className="h-8 w-24 rounded-xl" />
                  </div>
                </div>
                <div className="-m-4">
                  <div className="space-y-4 mx-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="mt-4 p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200">
                        <div className="p-4 bg-default-100/25 flex justify-between items-center w-full">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-6 w-16 rounded-xl" />
                          </div>
                          <div className="flex gap-2">
                            <Skeleton className="h-6 w-20 rounded-full" />
                            <Skeleton className="h-6 w-24 rounded-full" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          }>
          <div>
            <div className="flex lg:justify-between justify-center items-center mb-4 flex-col lg:flex-row gap-2">
              <h2 className="text-xl font-semibold">Warehouse Items</h2>
              <div className="flex">
                <AnimatePresence mode="popLayout">
                  {!showInventorySearch ? (
                    <motion.div
                      key="search-button"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Button
                        variant="flat"
                        color="default"
                        size="sm"
                        startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
                        onPress={() => setShowInventorySearch(true)}
                      >
                        Search & Filter
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="search-form"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-center gap-2 w-full overflow-hidden">
                        <Input
                          placeholder="Search keywords..."
                          value={inventorySearchQuery}
                          onChange={(e) => setInventorySearchQuery(e.target.value)}
                          isClearable
                          onClear={() => setInventorySearchQuery("")}
                          startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
                          size="sm"
                          className="max-w-48 flex-grow"
                        />
                        <Popover
                          isOpen={isInventorySearchFilterOpen}
                          onOpenChange={setIsInventorySearchFilterOpen}
                          classNames={{ content: "!backdrop-blur-lg bg-background/65" }}
                          motionProps={popoverTransition()}
                          offset={10}
                          placement="bottom-start"
                        >
                          <PopoverTrigger>
                            <Button
                              variant="flat"
                              color="default"
                              size="sm"
                              className="min-w-18 w-18"
                            >
                              <div className="flex items-center gap-1">
                                <Icon icon="fluent:filter-12-filled" className="text-default-500" />
                                Filter
                              </div>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-96 p-0 overflow-hidden">
                            <div className="w-full">
                              <div className="space-y-4 p-4">
                                <h3 className="text-lg font-semibold items-center w-full text-center">
                                  Bulk Filter Options
                                </h3>

                                {/* Filters */}
                                <div className="grid grid-cols-1 gap-4">
                                  {(() => {
                                    const filterOptions = getFilterOptions(formData?.items || []);

                                    return (
                                      <>
                                        {/* Status Filter */}
                                        <Autocomplete
                                          label="Filter by Status"
                                          placeholder="All Statuses"
                                          selectedKey={inventorySearchFilters.status || ""}
                                          onSelectionChange={(value) =>
                                            setInventorySearchFilters(prev => ({ ...prev, status: value as string || null }))
                                          }
                                          startContent={<Icon icon="mdi:information" className="text-default-500 mb-[0.2rem]" />}
                                          inputProps={autoCompleteStyle}
                                        >
                                          {[<AutocompleteItem key="">All Statuses</AutocompleteItem>,
                                          ...filterOptions.statuses.map((status) => (
                                            <AutocompleteItem key={status}>
                                              {status}
                                            </AutocompleteItem>
                                          ))]}
                                        </Autocomplete>

                                        {/* Unit Filter */}
                                        <Autocomplete
                                          label="Filter by Unit"
                                          placeholder="All Units"
                                          selectedKey={inventorySearchFilters.unit || ""}
                                          onSelectionChange={(value) =>
                                            setInventorySearchFilters(prev => ({ ...prev, unit: value as string || null }))
                                          }
                                          startContent={<Icon icon="mdi:ruler" className="text-default-500 mb-[0.2rem]" />}
                                          inputProps={autoCompleteStyle}
                                        >
                                          {[<AutocompleteItem key="">All Units</AutocompleteItem>,
                                          ...filterOptions.units.map((unit) => (
                                            <AutocompleteItem key={unit}>
                                              {getUnitFullName(unit)}
                                            </AutocompleteItem>
                                          ))]}
                                        </Autocomplete>

                                        {/* Unit Value Filter */}
                                        <Autocomplete
                                          label="Filter by Unit Value"
                                          placeholder="All Unit Values"
                                          selectedKey={inventorySearchFilters.unit_value || ""}
                                          onSelectionChange={(value) =>
                                            setInventorySearchFilters(prev => ({ ...prev, unit_value: value as number || null }))
                                          }
                                          startContent={<Icon icon="mdi:currency-usd" className="text-default-500 mb-[0.2rem]" />}
                                          inputProps={autoCompleteStyle}
                                        >
                                          {[<AutocompleteItem key="">All Unit Values</AutocompleteItem>,
                                          ...filterOptions.unitValues.map((unitValue) => (
                                            <AutocompleteItem key={unitValue}>
                                              {formatNumber(unitValue)}
                                            </AutocompleteItem>
                                          ))]}
                                        </Autocomplete>

                                        {/* Packaging Unit Filter */}
                                        <Autocomplete
                                          label="Filter by Packaging Unit"
                                          placeholder="All Packaging Units"
                                          selectedKey={inventorySearchFilters.packaging_unit || ""}
                                          onSelectionChange={(value) =>
                                            setInventorySearchFilters(prev => ({ ...prev, packaging_unit: value as string || null }))
                                          }
                                          startContent={<Icon icon="mdi:package-variant-closed" className="text-default-500 mb-[0.2rem]" />}
                                          inputProps={autoCompleteStyle}
                                        >
                                          {[<AutocompleteItem key="">All Packaging Units</AutocompleteItem>,
                                          ...filterOptions.packagingUnits.map((packagingUnit) => (
                                            <AutocompleteItem key={packagingUnit}>
                                              {packagingUnit}
                                            </AutocompleteItem>
                                          ))]}
                                        </Autocomplete>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>

                              <div className="p-4 border-t border-default-200 flex justify-end gap-2 bg-default-100/50">
                                {/* Clear All Filters Button */}
                                {(inventorySearchFilters.status ||
                                  inventorySearchFilters.unit ||
                                  inventorySearchFilters.unit_value ||
                                  inventorySearchFilters.packaging_unit) && (
                                    <Button
                                      variant="flat"
                                      color="danger"
                                      size="sm"
                                      onPress={() => {
                                        setInventorySearchFilters({ status: null, unit: null, unit_value: null, packaging_unit: null });
                                      }}
                                      startContent={<Icon icon="mdi:filter-remove" />}
                                    >
                                      Clear All Filters
                                    </Button>
                                  )}
                                <Button
                                  size="sm"
                                  variant="flat"
                                  onPress={() => setIsInventorySearchFilterOpen(false)}
                                >
                                  Close
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                        <Button
                          variant="flat"
                          color="danger"
                          size="sm"
                          isIconOnly
                          onPress={() => {
                            setShowInventorySearch(false);
                            setInventorySearchQuery("");
                            setInventorySearchFilters({ status: null, unit: null, unit_value: null, packaging_unit: null });
                          }}
                        >
                          <Icon icon="mdi:close" className="text-default-500" />
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Active filters display */}
                  {(inventorySearchQuery || inventorySearchFilters.status || inventorySearchFilters.unit || inventorySearchFilters.unit_value || inventorySearchFilters.packaging_unit) && (
                    <div className="flex-1 min-w-0">
                      <CustomScrollbar
                        direction="horizontal"
                        className="w-full"
                        scrollShadow
                        hideScrollbars
                      >
                        <div className="flex items-center gap-1 min-w-max pr-4">
                          {inventorySearchQuery && (
                            <Chip
                              variant="flat"
                              color="primary"
                              size="sm"
                              onClose={() => setInventorySearchQuery("")}
                              className="flex-shrink-0"
                            >
                              Search: {inventorySearchQuery}
                            </Chip>
                          )}
                          <Button
                            size="sm"
                            variant="light"
                            onPress={() => {
                              setInventorySearchQuery("");
                              setInventorySearchFilters({ status: null, unit: null, unit_value: null, packaging_unit: null });
                            }}
                            className="flex-shrink-0"
                          >
                            Clear all
                          </Button>
                        </div>
                      </CustomScrollbar>
                    </div>
                  )}
                </div>
              </div>

              {/* View Mode Toggle */}
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {formData.items && formData.items.length > 0 && (
                    <>
                      {(() => {
                        const groupedItems = getGroupedItems();
                        const groupCount = Object.keys(groupedItems).length;
                        const ungroupedCount = groupedItems['ungrouped']?.length || 0;
                        const actualGroupCount = ungroupedCount > 0 ? groupCount - 1 : groupCount;

                        return (
                          <>
                            {actualGroupCount > 0 && (
                              <Chip color="primary" variant="flat" size="sm" className="flex-shrink-0">
                                {actualGroupCount} group{actualGroupCount !== 1 ? 's' : ''}
                              </Chip>
                            )}
                            {ungroupedCount > 0 && (
                              <Chip color="secondary" variant="flat" size="sm" className="flex-shrink-0">
                                {ungroupedCount} ungrouped item{ungroupedCount !== 1 ? 's' : ''}
                              </Chip>
                            )}
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    color={viewMode === 'grouped' ? "primary" : "default"}
                    variant={viewMode === 'grouped' ? "shadow" : "flat"}
                    size="sm"
                    onPress={() => {
                      setViewMode(viewMode === 'grouped' ? 'flat' : 'grouped');
                      setExpandedItems(new Set());
                      setExpandedGroupDetails(new Set());
                    }}
                    startContent={<Icon icon={viewMode === 'grouped' ? "mdi:format-list-group" : "mdi:format-list-bulleted"} />}
                  >
                    {viewMode === 'grouped' ? 'Grouped' : 'Flat'}
                  </Button>
                </div>
              </div>


              {/* Items content */}
              <div>
                <AnimatePresence>
                  {!formData.items || formData.items.length === 0 ? (
                    <motion.div {...motionTransition}>
                      <div className="py-8 h-48 text-center text-default-500 border border-dashed border-default-300 rounded-lg justify-center flex flex-col items-center">
                        <Icon icon="mdi:package-variant-closed" className="mx-auto mb-2 opacity-50" width={40} height={40} />
                        <p>No warehouse items found</p>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <AnimatePresence>
                  {formData.items && formData.items.length > 0 && (
                    <motion.div {...motionTransition} className="-m-4">
                      <Accordion
                        selectionMode="multiple"
                        variant="splitted"
                        selectedKeys={expandedItems}
                        onSelectionChange={(keys) => setExpandedItems(keys as Set<string>)}
                        itemClasses={{
                          base: "p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
                          title: "font-normal text-lg font-semibold",
                          trigger: "p-4 data-[hover=true]:bg-default-100 flex items-center transition-colors",
                          indicator: "text-medium",
                          content: "text-small p-0",
                        }}>
                        {getDisplayItemsList().map((item, index) => {
                          const isGroupRepresentative = item._isGroupRepresentative;
                          const groupSize = item._groupSize;
                          const groupId = item._groupId;
                          const displayNumber = index + 1;
                          const groupItems = formData.items.filter((groupItem: any) =>
                            groupItem.group_id === groupId
                          );
                          const availableCount = groupItems.filter((item: any) => item.status === 'AVAILABLE').length;
                          const usedCount = groupItems.filter((item: any) => item.status === 'USED').length;

                          return (
                            <AccordionItem
                              key={item.uuid}
                              aria-label={`Item ${item.uuid}`}
                              className={`${displayNumber === 1 ? 'mt-4' : ''} mx-2`}
                              title={
                                <div className="flex justify-between items-center w-full">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium whitespace-nowrap">
                                      {isGroupRepresentative ? `Group ${displayNumber}` : `Item ${displayNumber}`}
                                    </span>
                                  </div>
                                  <div className="flex gap-2 flex-wrap items-center justify-end">
                                    {isGroupRepresentative && availableCount > 0 && (
                                      <Chip color="success" variant="flat" size="sm" className="whitespace-nowrap">
                                        {(() => {
                                          const availableGroupItems = groupItems.filter((item: any) => item.status === 'AVAILABLE');
                                          const totalAvailableValue = availableGroupItems.reduce((total: number, groupItem: any) => {
                                            const unitValue = parseFloat(String(groupItem.unit_value || 0));
                                            return total + unitValue;
                                          }, 0);

                                          if (totalAvailableValue > 0 && item.unit) {
                                            // Show original unit value and converted standard unit value
                                            const originalDisplay = `${formatNumber(totalAvailableValue)} ${item.unit}`;

                                            // Convert to standard unit if different from current unit
                                            if (formData.standard_unit && item.unit !== formData.standard_unit) {
                                              // Calculate total in standard unit using conversion
                                              const totalInStandardUnit = availableGroupItems.reduce((total: number, groupItem: { unit: string; unit_value: number; }) => {
                                                if (groupItem.unit && groupItem.unit_value && formData.standard_unit) {
                                                  return total + convertUnit(groupItem.unit_value, groupItem.unit, formData.standard_unit);
                                                }
                                                return total;
                                              }, 0);
                                              const convertedDisplay = `(${formatNumber(totalInStandardUnit)} ${formData.standard_unit})`;
                                              return `${originalDisplay} ${convertedDisplay} available`;
                                            }

                                            return `${originalDisplay} available`;
                                          }
                                          return '';
                                        })()}
                                      </Chip>
                                    )}
                                    {isGroupRepresentative && usedCount > 0 && (
                                      <Chip color="warning" variant="flat" size="sm" className="whitespace-nowrap">
                                        {(() => {
                                          const usedGroupItems = groupItems.filter((item: any) => item.status === 'USED');
                                          const totalUsedValue = usedGroupItems.reduce((total: number, groupItem: any) => {
                                            const unitValue = parseFloat(String(groupItem.unit_value || 0));
                                            return total + unitValue;
                                          }, 0);

                                          if (totalUsedValue > 0 && item.unit) {
                                            // Show original unit value and converted standard unit value
                                            const originalDisplay = `${formatNumber(totalUsedValue)} ${item.unit}`;

                                            // Convert to standard unit if different from current unit
                                            if (formData.standard_unit && item.unit !== formData.standard_unit) {
                                              // Calculate total in standard unit using conversion
                                              const totalInStandardUnit = usedGroupItems.reduce((total: number, groupItem: { unit: string; unit_value: number; }) => {
                                                if (groupItem.unit && groupItem.unit_value && formData.standard_unit) {
                                                  return total + convertUnit(groupItem.unit_value, groupItem.unit, formData.standard_unit);
                                                }
                                                return total;
                                              }, 0);
                                              const convertedDisplay = `(${formatNumber(totalInStandardUnit)} ${formData.standard_unit})`;
                                              return `${originalDisplay} ${convertedDisplay} used`;
                                            }

                                            return `${originalDisplay} used`;
                                          }
                                          return '';
                                        })()}
                                      </Chip>
                                    )}
                                    {!isGroupRepresentative && item.unit && item.unit !== "" && item.unit_value && item.unit_value > 0 && (
                                      <Chip color="primary" variant="flat" size="sm" className="whitespace-nowrap">
                                        {(() => {
                                          if (isGroupRepresentative) {
                                            // Calculate total for the group
                                            const totalValue = groupItems.reduce((total: number, groupItem: any) => {
                                              const unitValue = parseFloat(String(groupItem.unit_value || 0));
                                              return total + unitValue;
                                            }, 0);
                                            return `${formatNumber(totalValue)} ${item.unit}`;
                                          } else {
                                            const unitValue = parseFloat(String(item.unit_value || 0));
                                            return `${formatNumber(unitValue)} ${item.unit}`;
                                          }
                                        })()}
                                      </Chip>
                                    )}
                                    {!isGroupRepresentative && item.status && item.status !== "AVAILABLE" && (
                                      <Chip
                                        color={getStatusColor(item.status)}
                                        variant="flat"
                                        size="sm"
                                        className="whitespace-nowrap">
                                        {formatStatus(item.status)}
                                      </Chip>
                                    )}
                                  </div>
                                </div>
                              }
                            >
                              <div className="space-y-4">
                                {/* Group Identifier - for group representatives */}
                                {((isGroupRepresentative && groupId) || (!isGroupRepresentative && item.group_id && viewMode === 'flat')) && (
                                  <div className="mx-4 mt-4">
                                    <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200">
                                      <div className="flex items-center gap-3">
                                        <Icon icon="mdi:group" className="text-default-500 w-4 h-4 flex-shrink-0" />
                                        <div className="flex flex-col">
                                          <span className="text-xs text-default-600 font-medium">Group Identifier</span>
                                          <span className="text-md font-semibold text-default-700">
                                            {groupId || item.group_id || "N/A"}
                                          </span>
                                        </div>
                                      </div>
                                      <Button
                                        variant="flat"
                                        color="default"
                                        isIconOnly
                                        onPress={() => copyToClipboard(groupId)}
                                      >
                                        <Icon icon="mdi:content-copy" className="text-default-500" />
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {/* Item Identifier */}
                                {item.uuid && !isGroupRepresentative && (
                                  <div className="mx-4 mt-4">
                                    <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200">
                                      <div className="flex items-center gap-3">
                                        <Icon icon="mdi:package-variant" className="text-default-500 w-4 h-4 flex-shrink-0" />
                                        <div className="flex flex-col">
                                          <span className="text-xs text-default-600 font-medium">Item Identifier</span>
                                          <span className="text-md font-semibold text-default-700">
                                            {item.uuid}
                                          </span>
                                        </div>
                                      </div>
                                      <Button
                                        variant="flat"
                                        color="default"
                                        isIconOnly
                                        onPress={() => copyToClipboard(item.uuid || "")}
                                      >
                                        <Icon icon="mdi:content-copy" className="text-default-500" />
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {/* Item Code */}
                                <div className="mx-4">
                                  <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200">
                                    <div className="flex items-center gap-3">
                                      <Icon icon="mdi:barcode" className="text-default-500 w-4 h-4 flex-shrink-0" />
                                      <div className="flex flex-col">
                                        <span className="text-xs text-default-600 font-medium">Item Code</span>
                                        <span className="text-md font-semibold text-default-700">
                                          {item.item_code || "N/A"}
                                        </span>
                                      </div>
                                    </div>
                                    <Button
                                      variant="flat"
                                      color="default"
                                      isIconOnly
                                      onPress={() => copyToClipboard(item.item_code || "")}
                                    >
                                      <Icon icon="mdi:content-copy" className="text-default-500" />
                                    </Button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mx-4">
                                  {/* Item Value */}
                                  <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200">
                                    <div className="flex items-center gap-3">
                                      <Icon icon="mdi:numeric" className="text-default-500 w-4 h-4 flex-shrink-0" />
                                      <div className="flex flex-col">
                                        <span className="text-xs text-default-600 font-medium">
                                          {`${formData.measurement_unit ? formData.measurement_unit.charAt(0).toUpperCase() + formData.measurement_unit.slice(1) : "Item"} Value`}
                                        </span>
                                        <span className="text-md font-semibold text-default-700">
                                          {String(item.unit_value || 0)}
                                        </span>
                                      </div>
                                    </div>
                                    {item.unit && (
                                      <Chip
                                        color="primary"
                                        variant="flat"
                                        size="sm"
                                      >
                                        {item.unit}
                                      </Chip>
                                    )}
                                  </div>

                                  {/* Item Unit */}
                                  <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200">
                                    <div className="flex items-center gap-3">
                                      <Icon icon="mdi:scale-balance" className="text-default-500 w-4 h-4 flex-shrink-0" />
                                      <div className="flex flex-col">
                                        <span className="text-xs text-default-600 font-medium">
                                          {`${formData.measurement_unit ? formData.measurement_unit.charAt(0).toUpperCase() + formData.measurement_unit.slice(1) : "Item"} Unit`}
                                        </span>
                                        <span className="text-md font-semibold text-default-700">
                                          {item.unit || "N/A"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mx-4">
                                  {/* Packaging Unit */}
                                  <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200">
                                    <div className="flex items-center gap-3">
                                      <Icon icon="mdi:package" className="text-default-500 w-4 h-4 flex-shrink-0" />
                                      <div className="flex flex-col">
                                        <span className="text-xs text-default-600 font-medium">Packaging Unit</span>
                                        <span className="text-md font-semibold text-default-700">
                                          {item.packaging_unit || "N/A"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Cost */}
                                  <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200">
                                    <div className="flex items-center gap-3">
                                      <Icon icon="mdi:currency-php" className="text-default-500 w-4 h-4 flex-shrink-0" />
                                      <div className="flex flex-col">
                                        <span className="text-xs text-default-600 font-medium">Cost</span>
                                        <span className="text-md font-semibold text-default-700">
                                          {item.cost ? `₱ ${formatNumber(item.cost)}` : "N/A"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Item/Group Properties */}
                                {item.properties && Object.keys(item.properties).length > 0 && (
                                  <div className="m-4 p-3 bg-default-100 rounded-xl border-2 border-default-200">
                                    <div className="flex items-center gap-3 mb-3">
                                      <Icon icon="mdi:tag" className="text-default-500 w-4 h-4 flex-shrink-0" />
                                      <span className="text-xs text-default-600 font-medium">
                                        {viewMode === 'grouped' ? "Grouped Item Properties" : "Item Properties"}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                      {Object.entries(item.properties).map(([key, value]) => (
                                        <div key={key}>
                                          <span className="text-default-500">{toTitleCase(toNormalCase(key))}:</span>
                                          <span className="ml-2">{String(value)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Group Bulk Mark as Used Section */}
                                {(() => {
                                  const groupItems = formData.items?.filter((groupItem: any) => groupItem.group_id === groupId) || [];
                                  const availableCount = groupItems.filter((item: any) => item.status === 'AVAILABLE').length;
                                  const groupBulkCount = groupBulkMarkCounts[groupId] || 1;

                                  return availableCount > 0 ? (
                                    <div className="p-4 bg-warning-50 rounded-xl border-2 border-warning-200 mx-4 mb-4">
                                      <div className="flex items-center gap-3 mb-3 justify-between">
                                        <div className="flex items-center gap-2">
                                          <Icon icon="mdi:package-variant-closed" className="text-warning-600 w-4 h-4 flex-shrink-0" />
                                          <span className="text-sm text-warning-700 font-medium">
                                            Bulk Mark Group as Used
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                          <div className="flex items-center rounded-full bg-warning-100 text-warning-700 text-xs p-2 py-1">
                                            {availableCount} available
                                          </div>
                                          <div className="flex items-center rounded-full bg-warning-100 text-warning-700 text-xs p-2 py-1">
                                            {groupItems.filter((item: any) => item.status === 'USED').length} used
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3 w-full">
                                        <NumberInput
                                          label="Number of items"
                                          value={groupBulkCount}
                                          onValueChange={(value) => setGroupBulkMarkCounts(prev => ({ ...prev, [groupId]: value }))}
                                          minValue={1}
                                          maxValue={availableCount}
                                          className="flex-1 w-full lg:w-auto"
                                          classNames={inputStyle}
                                        />
                                        <div className="flex gap-2 w-full lg:w-auto lg:flex-shrink-0">
                                          <Button
                                            color="warning"
                                            variant="shadow"
                                            size="sm"
                                            onPress={() => handleMarkGroupBulkAsUsed(groupId, groupBulkCount)}
                                            startContent={
                                              isLoadingMarkGroupBulkAsUsed ?
                                                <Spinner size="sm" color="warning" />
                                                : <Icon icon="mdi:check-circle" width={16} height={16} />
                                            }
                                            isDisabled={isLoadingMarkGroupBulkAsUsed || groupBulkCount <= 0 || groupBulkCount > availableCount}
                                            className="flex-1 lg:flex-initial"
                                          >
                                            Mark as Used
                                          </Button>
                                          <Button
                                            color="warning"
                                            variant="flat"
                                            size="sm"
                                            onPress={() => handleMarkGroupBulkAsUsed(groupId, 1)}
                                            startContent={
                                              isLoadingMarkGroupBulkAsUsed ?
                                                <Spinner size="sm" color="warning" />
                                                : <Icon icon="mdi:package-variant" width={16} height={16} />
                                            }
                                            isDisabled={isLoadingMarkGroupBulkAsUsed || availableCount <= 0}
                                            className="flex-1 lg:flex-initial"
                                          >
                                            Mark 1 Item
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : null;
                                })()}
                                {/* Group Items Details - only show for groups in grouped view */}
                                {viewMode === 'grouped' && isGroupRepresentative && groupId && (
                                  <div className="px-2">
                                    <Accordion
                                      selectionMode="multiple"
                                      variant="splitted"
                                      selectedKeys={expandedGroupDetails}
                                      onSelectionChange={(keys) => setExpandedGroupDetails(keys as Set<string>)}
                                      itemClasses={{
                                        base: "p-0 bg-default-50 rounded-xl overflow-hidden border-2 border-default-200",
                                        title: "font-normal text-lg font-semibold",
                                        trigger: "p-4 data-[hover=true]:bg-default-100 flex items-center transition-colors",
                                        indicator: "text-medium",
                                        content: "text-small p-0",
                                      }}
                                    >
                                      <AccordionItem
                                        key={`group-details-${groupId}`}
                                        title={
                                          <div className="flex justify-between items-center w-full">
                                            <span className="text-lg font-semibold">
                                              Group Items
                                            </span>
                                            <div className="flex items-center gap-2">
                                              <Chip color="primary" variant="flat" size="sm">
                                                {groupSize} total items
                                              </Chip>
                                              {/* Total unit value */}
                                              <Chip color="primary" variant="flat" size="sm">
                                                {(() => {
                                                  const totalInOriginalUnit = groupItems.reduce((total: number, groupItem: any) => {
                                                    const unitValue = parseFloat(String(groupItem.unit_value || 0));
                                                    return total + unitValue;
                                                  }, 0);

                                                  // Show converted value if standard unit is different from item unit
                                                  if (formData.standard_unit && item.unit && item.unit !== formData.standard_unit) {
                                                    const totalInStandardUnit = groupItems.reduce((total: number, groupItem: any) => {
                                                      if (groupItem.unit && groupItem.unit_value && formData.standard_unit) {
                                                        return total + convertUnit(groupItem.unit_value, groupItem.unit, formData.standard_unit);
                                                      }
                                                      return total;
                                                    }, 0);

                                                    return `${formatNumber(totalInOriginalUnit)} ${item.unit} (${formatNumber(totalInStandardUnit)} ${formData.standard_unit}) in total`;
                                                  } else {
                                                    return `${formatNumber(totalInOriginalUnit)} ${item.unit || "units"} in total`;
                                                  }
                                                })()}
                                              </Chip>
                                            </div>
                                          </div>
                                        }
                                      >
                                        <div className="space-y-4 p-4">
                                          {formData.items
                                            .filter((groupItem: any) => groupItem.group_id === groupId)
                                            .sort((a: any, b: any) => {
                                              // Sort group items - available first, used last
                                              if (a.status === 'AVAILABLE' && b.status !== 'AVAILABLE') return -1;
                                              if (a.status !== 'AVAILABLE' && b.status === 'AVAILABLE') return 1;
                                              if (a.status === 'USED' && b.status !== 'USED') return 1;
                                              if (a.status !== 'USED' && b.status === 'USED') return -1;

                                              // Then sort by creation date
                                              return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                                            })
                                            .map((groupItem: any, index: number) => (
                                              <div
                                                key={groupItem.uuid}
                                                className="p-4 bg-background/50 rounded-xl border-2 border-default-200"
                                              >
                                                {/* Item header with buttons */}
                                                <div className="flex items-center justify-between mb-4">
                                                  <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-default-800">
                                                      Item {index + 1}
                                                    </span>
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <Button
                                                      color="warning"
                                                      variant="flat"
                                                      size="sm"
                                                      onPress={() => handleMarkItemAsUsed(groupItem.uuid)}
                                                      startContent={
                                                        isLoadingMarkAsUsed ?
                                                          <Spinner size="sm" color="warning" />
                                                          : <Icon icon="mdi:check-circle" width={14} height={14} />
                                                      }
                                                      isDisabled={isLoadingMarkAsUsed || groupItem.status === "USED"}
                                                    >
                                                      {groupItem.status === "USED" ? "Used" : "Mark as Used"}
                                                    </Button>
                                                    <Button
                                                      color="primary"
                                                      variant="flat"
                                                      size="sm"
                                                      onPress={() => handleViewBulkLocation(groupItem.uuid)}
                                                      startContent={<Icon icon="mdi:map-marker" width={14} height={14} />}
                                                    >
                                                      Location
                                                    </Button>
                                                  </div>
                                                </div>

                                                {/* Item Identifier */}
                                                {groupItem.uuid && (
                                                  <div className="mb-4">
                                                    <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200">
                                                      <div className="flex items-center gap-3">
                                                        <Icon icon="mdi:package-variant" className="text-default-500 w-4 h-4 flex-shrink-0" />
                                                        <div className="flex flex-col">
                                                          <span className="text-xs text-default-600 font-medium">Item Identifier</span>
                                                          <span className="text-md font-semibold text-default-700">
                                                            {groupItem.uuid}
                                                          </span>
                                                        </div>
                                                      </div>
                                                      <Button
                                                        variant="flat"
                                                        color="default"
                                                        isIconOnly
                                                        onPress={() => copyToClipboard(groupItem.uuid || "")}
                                                      >
                                                        <Icon icon="mdi:content-copy" className="text-default-500" />
                                                      </Button>
                                                    </div>
                                                  </div>
                                                )}

                                                {/* Item Location */}
                                                {groupItem.location && (
                                                  <div>
                                                    <div className="flex items-center justify-between p-3 min-h-16 bg-default-100 border-2 border-default-200 rounded-xl hover:border-default-400 hover:bg-default-200 transition-all duration-200">
                                                      <div className="flex items-center gap-3">
                                                        <Icon icon="mdi:map-marker" className="text-default-500 w-4 h-4 flex-shrink-0" />
                                                        <div className="flex flex-col">
                                                          <span className="text-xs text-default-600 font-medium">Location</span>
                                                          <span className="text-md font-semibold text-default-700">
                                                            {groupItem.location.code || "No location assigned"}
                                                          </span>
                                                        </div>
                                                      </div>
                                                      <Button
                                                        variant="flat"
                                                        color="default"
                                                        isIconOnly
                                                        onPress={() => handleViewBulkLocation(groupItem.uuid)}
                                                      >
                                                        <Icon icon="mdi:map-marker" className="text-default-500" />
                                                      </Button>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                        </div>
                                      </AccordionItem>
                                    </Accordion>
                                  </div>
                                )}

                                <div className="flex justify-end gap-2 bg-default-100/50 p-4 flex-wrap">
                                  {/* Mark as Used Button */}
                                  {isGroupRepresentative ? (
                                    <>
                                      <Button
                                        color="warning"
                                        variant="flat"
                                        size="sm"
                                        onPress={() => handleMarkGroupAsUsed(groupId)}
                                        startContent={
                                          isLoadingMarkGroupAsUsed ?
                                            <Spinner size="sm" color="warning" />
                                            : <Icon icon="mdi:check-circle" width={16} height={16} />
                                        }
                                        isDisabled={isLoadingMarkGroupAsUsed || item.status === "USED"}
                                      >
                                        {item.status === "USED" ? "Already Used" : "Mark Group as Used"}
                                      </Button>
                                      <Button
                                        color="primary"
                                        variant="flat"
                                        size="sm"
                                        onPress={() => handleViewBulkLocation(null, groupId)}
                                        startContent={<Icon icon="mdi:map-marker" width={16} height={16} />}
                                      >
                                        Group Location
                                      </Button>
                                      {/* Navigation to delivery page */}
                                      {item.delivery_uuid && (
                                        <Button
                                          color="success"
                                          variant="flat"
                                          size="sm"
                                          onPress={() => handleViewDelivery(item.delivery_uuid)}
                                          startContent={<Icon icon="mdi:truck-delivery" width={16} height={16} />}
                                        >
                                          View Delivery
                                        </Button>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        color="warning"
                                        variant="flat"
                                        size="sm"
                                        onPress={() => handleMarkItemAsUsed(item.uuid)}
                                        startContent={
                                          isLoadingMarkAsUsed ?
                                            <Spinner size="sm" color="warning" />
                                            : <Icon icon="mdi:check-circle" width={16} height={16} />
                                        }
                                        isDisabled={isLoadingMarkAsUsed || item.status === "USED"}
                                      >
                                        {item.status === "USED" ? "Already Used" : "Mark as Used"}
                                      </Button>
                                      <Button
                                        color="primary"
                                        variant="flat"
                                        size="sm"
                                        onPress={() => handleViewBulkLocation(item.uuid)}
                                        startContent={<Icon icon="mdi:map-marker" width={16} height={16} />}
                                      >
                                        View Item Location
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </LoadingAnimation>
      </CardList>

      <CardList>
        {user && user.is_admin && handleViewWarehouse && (
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
        {user && user.is_admin && handleViewInventory && (
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
              isDisabled={!inventoryId || isLoading}
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
              isDisabled={!inventoryId || isLoading}
            >
              <div className="flex items-center gap-2">
                <Icon icon="mdi:qrcode" />
                <span>Show QR Code</span>
              </div>
            </Button>
          </div>
        </div>
      </CardList>


      {/* 3D Location Viewer Modal */}
      < Modal
        isOpen={showLocationModal}
        onClose={() => {
          setShowLocationModal(false);
          setSelectedItemLocation(null);
          setFloorConfigs([]);
          setOccupiedLocations([]);
          setShelfColorAssignments([]);
          setHighlightedFloor(null);
          setExternalSelection(null);
        }}
        placement='auto'
        classNames={{
          backdrop: "bg-background/50",
          wrapper: 'overflow-hidden'
        }}
        backdrop="blur"
        size="5xl"
      >
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center gap-2">
              <Icon icon="mdi:map-marker" />
              <span>
                {selectedItemLocation
                  ? externalSelection
                    ? formData.items?.some((item: any) => item.group_id === selectedItemLocation.group_id && formData.items?.filter((gi: any) => gi.group_id === selectedItemLocation.group_id).length > 1)
                      ? `Group Location for: ${formData.name}`
                      : `Item Location for: ${selectedItemLocation.item_code || selectedItemLocation.uuid}`
                    : `Item Location for: ${selectedItemLocation.item_code || selectedItemLocation.uuid}`
                  : `All Locations for ${formData.name}`
                }
              </span>
            </div>
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
                  onSelect={() => { }} // Read-only mode
                  occupiedLocations={occupiedLocations}
                  canSelectOccupiedLocations={false}
                  className="w-full h-full"
                  highlightedFloor={highlightedFloor}
                  onHighlightFloor={setHighlightedFloor}
                  cameraOffsetY={-0.25}
                  shelfColorAssignments={shelfColorAssignments}
                  externalSelection={externalSelection}
                />
              </Suspense>

              {/* Location info overlay */}
              {selectedItemLocation?.location && (
                <div className="absolute top-4 left-4 flex items-center gap-2 bg-background/90 rounded-xl backdrop-blur-lg p-3 border border-default-200">
                  <Icon icon="mdi:package-variant" className="text-secondary-500" />
                  <span className="text-sm font-semibold">
                    {selectedItemLocation
                      ? externalSelection
                        ? formData.items?.some((item: any) => item.group_id === selectedItemLocation.group_id && formData.items?.filter((gi: any) => gi.group_id === selectedItemLocation.group_id).length > 1)
                          ? `Group View (${shelfColorAssignments.filter(a => a.colorType === 'tertiary').length} highlighted)`
                          : "Single Item View"
                        : "Single Item View"
                      : `${shelfColorAssignments.length} Item${shelfColorAssignments.length !== 1 ? 's' : ''} Shown`
                    }
                  </span>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter className="flex justify-between gap-4 p-4">
            <Popover3dNavigationHelp />
            <Button
              color="primary"
              variant="shadow"
              onPress={() => {
                setShowLocationModal(false);
                setSelectedItemLocation(null);
                setFloorConfigs([]);
                setOccupiedLocations([]);
                setShelfColorAssignments([]);
                setHighlightedFloor(null);
                setExternalSelection(null);
              }}
            >
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal >

      {/* QR Code Modal */}
      < Modal
        isOpen={qrModal.isOpen}
        onOpenChange={qrModal.onOpenChange}
        classNames={{
          base: "!backdrop-blur-lg bg-background/20",
          backdrop: "!backdrop-blur-lg bg-background/20"
        }}
        motionProps={popoverTransition()}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Icon icon="mdi:qrcode" />
                  <span>QR Code for {qrData.itemName}</span>
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 bg-white rounded-lg">
                    <QRCodeCanvas
                      value={qrData.url}
                      size={200}
                      level="M"
                      includeMargin={true}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-default-600 mb-2">
                      {qrData.description}
                    </p>
                    <div className="flex items-center gap-2 justify-center">
                      <Switch
                        size="sm"
                        isSelected={qrData.autoMarkAsUsed}
                        onValueChange={(checked) => {
                          const newUrl = generateUrl(qrData.itemId, checked);
                          setQrData(prev => ({
                            ...prev,
                            autoMarkAsUsed: checked,
                            url: newUrl,
                            description: checked
                              ? `Scan this code to view details for ${prev.itemName} and automatically mark it as USED.`
                              : `Scan this code to view details for ${prev.itemName}`
                          }));
                        }}
                      >
                        Auto mark as used
                      </Switch>
                    </div>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Close
                </Button>
                <Button
                  color="primary"
                  onPress={() => copyToClipboard(qrData.url)}
                >
                  Copy URL
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}