'use client';

import CardList from "@/components/card-list";
import CustomProperties from "@/components/custom-properties";
import LoadingAnimation from '@/components/loading-animation';
import { SearchListPanel } from "@/components/search-list-panel/search-list-panel";
import { getStatusColor, herouiColor } from "@/utils/colors";
import { motionTransition, motionTransitionScale, motionTransitionX, popoverTransition } from "@/utils/anim";
import { getUserFromCookies } from '@/utils/supabase/server/user';
import { copyToClipboard, formatDate, formatNumber, toNormalCase, toTitleCase } from "@/utils/tools";
import { getGroupInfo, getItemDisplayNumber } from "@/utils/inventory-group";
import {
  Accordion,
  AccordionItem,
  Alert,
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Spinner,
  Switch,
  Textarea,
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeCanvas } from "qrcode.react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import CustomScrollbar from "@/components/custom-scrollbar";
import { createClient } from "@/utils/supabase/client";

import {
  getWarehouseInventoryItems,
  getWarehouseInventoryItem,
  getWarehouseItemByInventory,
  markWarehouseItemAsUsed,
  markWarehouseGroupAsUsed,
  getWarehouses
} from "./actions";
import { getUnitFullName } from "@/utils/measurements";

export default function WarehouseItemsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const [showInventorySearch, setShowInventorySearch] = useState(false);
  const [showInventorySearchFilter, setShowInventorySearchFilter] = useState(false);
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");
  const [inventorySearchFilters, setInventorySearchFilters] = useState({
    status: null as string | null,
    unit: null as string | null,
    unit_value: null as number | null,
    packaging_unit: null as string | null,
  });

  // Input style for consistency
  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200"
  };

  // Handle select item
  const handleSelectItem = (itemId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("warehouseItemId", itemId);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle view inventory details
  const handleViewInventory = () => {
    if (formData?.inventory_uuid) {
      router.push(`/home/inventory?itemId=${formData.inventory_uuid}`);
    }
  };

  const handleViewWarehouse = () => {
    if (formData?.warehouse_uuid) {
      router.push(`/home/warehouses?warehouseId=${formData.warehouse_uuid}`);
    }
  };

  // Handle mark item as used
  const handleMarkItemAsUsed = async (itemUuid: string) => {
    setIsLoadingMarkAsUsed(true);
    try {
      const result = await markWarehouseItemAsUsed(itemUuid);
      if (result.success) {
        // Refresh the details
        if (selectedItemId) {
          const refreshedItem = await getWarehouseInventoryItem(selectedItemId);
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
        if (selectedItemId) {
          const refreshedItem = await getWarehouseInventoryItem(selectedItemId);
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
      itemId: selectedItemId || '',
      itemName: formData.name || 'Warehouse Item',
      url: generateUrl(selectedItemId || '', false),
      autoMarkAsUsed: false,
      description: `Scan this code to view details for ${formData.name || 'Warehouse Item'}`
    }));
    qrModal.onOpen();
  };

  const handleViewBulkLocation = (itemUuid: string | null) => {
    const locationUrl = itemUuid
      ? `/home/location?warehouseItemUuid=${itemUuid}`
      : `/home/location?warehouseInventoryUuid=${selectedItemId}`;
    router.push(locationUrl);
  };

  // Load warehouse inventory item details
  const fetchItemDetails = async (itemId: string) => {
    if (!itemId) return;

    setIsLoading(true);
    try {
      const result = await getWarehouseInventoryItem(itemId);
      if (result.success && result.data) {
        setFormData(result.data);

        console.log("Fetched warehouse item details:", result.data);

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
    return grouped;
  };

  const getDisplayItemsList = () => {
    if (!formData.items) return [];

    if (viewMode === 'flat') {
      return filterItems(formData.items);
    }

    const groupedItems = getGroupedItems();
    const displayItems: any[] = [];

    Object.entries(groupedItems).forEach(([groupId, items]) => {
      if (groupId === 'ungrouped') {
        displayItems.push(...filterItems(items));
      } else {
        // Show only the first item of each group
        const groupItems = filterItems(items);
        if (groupItems.length > 0) {
          displayItems.push({
            ...groupItems[0],
            _isGroupRepresentative: true,
            _groupSize: items.length,
            _groupId: groupId
          });
        }
      }
    });

    return displayItems;
  };

  // Handle URL params
  useEffect(() => {
    const warehouseItemId = searchParams.get("warehouseItemId");
    const inventoryItemId = searchParams.get("itemId");

    if (warehouseItemId) {
      setSelectedItemId(warehouseItemId);
      fetchItemDetails(warehouseItemId);
    } else if (inventoryItemId) {
      // Handle navigation from inventory page
      const fetchFromInventory = async () => {
        const result = await getWarehouseItemByInventory(inventoryItemId);
        if (result.success && result.data) {
          setSelectedItemId(result.data.uuid);
          setFormData(result.data);

          // Update URL
          const params = new URLSearchParams(searchParams.toString());
          params.delete("itemId");
          params.set("warehouseItemId", result.data.uuid);
          router.push(`?${params.toString()}`, { scroll: false });
        }
      };
      fetchFromInventory();
    } else {
      setSelectedItemId(null);
      setFormData({});
      setExpandedItems(new Set());
    }
  }, [searchParams]);


  // Initialize page data
  useEffect(() => {
    const initPage = async () => {
      try {
        const userData = await getUserFromCookies();
        if (userData === null) {
          setError('User not found');
          return;
        }

        setUser(userData);
        setViewMode((searchParams.get("viewMode") as 'flat' | 'grouped') || 'grouped');

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
          console.log('Warehouse inventory changed:', payload);
          // The SearchListPanel will handle the refresh
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up real-time subscriptions for warehouse inventory');
      supabase.removeChannel(warehouseInventoryChannel);
    };
  }, [user?.company_uuid]);

  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Warehouse Inventory</h1>
            {(isLoading) ? (
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
          {/* Left side: Warehouse Inventory List */}
          <SearchListPanel
            title="Warehouse Inventory"
            tableName="warehouse_inventory"
            searchPlaceholder="Search warehouse inventory..."
            searchLimit={10}
            dateFilters={["weekFilter", "specificDate"]}
            companyUuid={user?.company_uuid}
            renderItem={(warehouseItem) => (
              <Button
                key={warehouseItem.uuid}
                onPress={() => handleSelectItem(warehouseItem.uuid || "")}
                variant="shadow"
                className={`w-full !transition-all duration-300 rounded-2xl p-0 group overflow-hidden
                  ${warehouseItem.description ? 'min-h-[9.5rem]' : 'min-h-[7rem]'}
                  ${selectedItemId === warehouseItem.uuid ?
                    '!bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500 !shadow-xl hover:!shadow-2xl !shadow-primary-300/50 border-2 border-primary-300/30' :
                    '!bg-gradient-to-br from-background to-default-50 hover:from-default-50 hover:to-default-100 !shadow-lg hover:!shadow-xl !shadow-default-300/30 border-2 border-default-200/50 hover:border-default-300/50'}`}
              >

                <div className="w-full flex flex-col h-full relative">
                  {/* Background pattern */}
                  <div className={`absolute inset-0 opacity-5 ${selectedItemId === warehouseItem.uuid ? 'bg-white' : 'bg-primary-500'}`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,_var(--tw-gradient-stops))] from-current via-transparent to-transparent"></div>
                  </div>

                  {/* Item details */}
                  <div className="flex-grow flex flex-col justify-center px-4 relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 text-left">
                        <span className={`font-bold text-lg leading-tight block truncate text-left
                                ${selectedItemId === warehouseItem.uuid ? 'text-primary-50' : 'text-default-800'}`}>
                          {warehouseItem.name}
                        </span>
                        {warehouseItem.description && (
                          <div className={`w-full mt-2 text-sm leading-relaxed text-left break-words whitespace-normal
                            ${selectedItemId === warehouseItem.uuid ? 'text-primary-100' : 'text-default-600'}`}
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              lineHeight: '1.3'
                            }}>
                            {warehouseItem.description}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 self-start">
                        <Chip
                          color={selectedItemId === warehouseItem.uuid ? "default" : "primary"}
                          variant="shadow"
                          size="sm"
                          className={`font-semibold ${selectedItemId === warehouseItem.uuid ? 'bg-primary-50 text-primary-600' : ''}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:package-variant" width={14} height={14} />
                            {warehouseItem.count?.total || 0} item{(warehouseItem.count?.total || 0) !== 1 ? 's' : ''}
                          </div>
                        </Chip>
                      </div>
                    </div>
                  </div>

                  {/* Item metadata */}
                  <div className={`flex items-center gap-2 backdrop-blur-sm rounded-b-2xl border-t relative z-10 justify-start
                  ${selectedItemId === warehouseItem.uuid ?
                      'border-primary-300/30 bg-primary-700/20' :
                      'border-default-200/50 bg-default-100/50'} p-4`}>
                    <CustomScrollbar
                      direction="horizontal"
                      hideScrollbars
                      gradualOpacity
                      className="flex items-center gap-2">

                      <Chip
                        color={selectedItemId === warehouseItem.uuid ? "default" : "secondary"}
                        variant="flat"
                        size="sm"
                        className={`font-medium ${selectedItemId === warehouseItem.uuid ? 'bg-primary-100/80 text-primary-700 border-primary-200/60' : 'bg-secondary-100/80'}`}
                      >
                        <div className="flex items-center gap-1">
                          <Icon icon="mdi:calendar" width={12} height={12} />
                          {formatDate(warehouseItem.created_at.toString())}
                        </div>
                      </Chip>

                      {warehouseItem.unit_values?.available > 0 && (
                        <Chip
                          color="success"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedItemId === warehouseItem.uuid ? 'bg-success-100/80 text-success-700 border-success-200/60' : 'bg-success-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:check-circle" width={12} height={12} />
                            {formatNumber(warehouseItem.unit_values.available)} available
                          </div>
                        </Chip>
                      )}

                      {warehouseItem.count?.total > 0 && (
                        <Chip
                          color="primary"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedItemId === warehouseItem.uuid ? 'bg-primary-100/80 text-primary-700 border-primary-200/60' : 'bg-primary-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:package-variant" width={12} height={12} />
                            {warehouseItem.count.total} items
                          </div>
                        </Chip>
                      )}

                      {warehouseItem.warehouse_name && (
                        <Chip
                          color="warning"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedItemId === warehouseItem.uuid ? 'bg-warning-100/80 text-warning-700 border-warning-200/60' : 'bg-warning-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:warehouse" width={12} height={12} />
                            {warehouseItem.warehouse_name}
                          </div>
                        </Chip>
                      )}

                    </CustomScrollbar>
                  </div>

                  {/* Hover effect overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                </div>
              </Button>
            )}
            renderSkeletonItem={(i) => (
              <Skeleton key={i} className="w-full min-h-[8.5rem] rounded-xl" />
            )}
            renderEmptyCard={(
              <>
                <Icon icon="mdi:package-variant" className="text-5xl text-default-300" />
                <p className="text-default-500 mt-2">No warehouse inventory items found</p>
              </>
            )}
            onItemSelect={handleSelectItem}
            supabaseFunction="get_warehouse_inventory_filtered"
            className={`xl:w-1/3 shadow-xl shadow-primary/10 
                      xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
                      xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
                      border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
          />

          {/* Right side: Item Details */}
          <div className="xl:w-2/3 overflow-hidden">
            {selectedItemId ? (
              <div className="flex flex-col gap-2">
                <CardList>
                  <LoadingAnimation
                    condition={isLoading || !formData}
                    skeleton={
                      <div>
                        <Skeleton className="h-6 w-48 rounded-xl mb-4" />
                        <div className="space-y-4">
                          <Skeleton className="h-16 w-full rounded-xl" />
                          <Skeleton className="h-16 w-full rounded-xl" />
                          <Skeleton className="h-24 w-full rounded-xl" />
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
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-default-100 rounded-xl border-2 border-default-200">
                            <div className="text-center">
                              <div className="text-xl inline-flex items-end gap-1 font-bold text-default-600">
                                {formatNumber(formData.unit_values.total)}
                                <span className="text-sm">{formData.standard_unit}</span>
                              </div>
                              <div className="text-sm text-default-600">
                                Total
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xl inline-flex items-end gap-1 font-bold text-success-600">
                                {formatNumber(formData.unit_values.available)}
                                <span className="text-sm">{formData.standard_unit}</span>
                              </div>
                              <div className="text-sm text-success-600">
                                Available
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xl inline-flex items-end gap-1 font-bold text-warning-600">
                                {formatNumber(formData.unit_values.used)}
                                <span className="text-sm">{formData.standard_unit}</span>
                              </div>
                              <div className="text-sm text-warning-600">
                                Used
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Warehouse Properties */}
                        {formData.properties && Object.keys(formData.properties).length > 0 && (
                          <div className="p-3 bg-default-100 rounded-xl border-2 border-default-200">
                            <div className="flex items-center gap-3 mb-3">
                              <Icon icon="mdi:tag" className="text-default-500 w-4 h-4 flex-shrink-0" />
                              <span className="text-xs text-default-600 font-medium">
                                Warehouse Properties
                              </span>
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
                              {[1, 2].map((i) => (
                                <div key={i} className="mt-4 p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200">
                                  <div className="p-4 bg-default-100/25">
                                    <div className="flex justify-between items-center w-full">
                                      <div className="flex items-center gap-2">
                                        <Skeleton className="h-6 w-16 rounded-xl" />
                                      </div>
                                      <div className="flex gap-2">
                                        <Skeleton className="h-6 w-20 rounded-full" />
                                        <Skeleton className="h-6 w-24 rounded-full" />
                                      </div>
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
                                {...motionTransitionScale}
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
                                {...motionTransitionX}
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
                                    isOpen={showInventorySearchFilter}
                                    onOpenChange={setShowInventorySearchFilter}
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
                                          <Icon icon="mdi:filter" className="text-default-500" />
                                        </div>
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80">
                                      <div className="px-1 py-2">
                                        <div className="text-small font-bold text-foreground mb-2">Filter Options</div>
                                        <div className="flex flex-col gap-2">
                                          {/* Filter controls would go here */}
                                          <Button
                                            size="sm"
                                            variant="flat"
                                            onPress={() => setShowInventorySearchFilter(false)}
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
                                <Chip color="default" variant="flat" size="sm">
                                  {formData.items.length} item{formData.items.length > 1 ? "s" : ""}
                                </Chip>
                                <Chip color="default" variant="flat" size="sm" className="flex-shrink-0">
                                  {(() => {
                                    const filteredItems = getDisplayItemsList();
                                    return `${filteredItems.length} group${filteredItems.length > 1 ? 's' : ''}`;
                                  })()}
                                </Chip>
                                {formData.standard_unit && (
                                  <Chip color="primary" variant="flat" size="sm">
                                    {formatNumber(formData.unit_values?.total || 0)} {formData.standard_unit}
                                  </Chip>
                                )}
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
                                    const groupedItems = getGroupedItems();
                                    const isGroupRepresentative = item._isGroupRepresentative;
                                    const groupSize = item._groupSize;
                                    const groupId = item._groupId;
                                    const displayNumber = index + 1;

                                    return (
                                      <AccordionItem
                                        key={item.uuid}
                                        aria-label={`Item ${item.uuid}`}
                                        className={`${displayNumber === 1 ? 'mt-4' : ''} mx-2`}
                                        title={
                                          <div className="flex justify-between items-center w-full">
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium">
                                                {isGroupRepresentative ? `Group ${displayNumber}` : `Item ${displayNumber}`}
                                              </span>
                                            </div>
                                            <div className="flex gap-2">
                                              {isGroupRepresentative && (
                                                <Chip color="secondary" variant="flat" size="sm">
                                                  {groupSize} items
                                                </Chip>
                                              )}
                                              {item.unit && item.unit !== "" && item.unit_value && item.unit_value > 0 && (
                                                <Chip color="primary" variant="flat" size="sm">
                                                  {(() => {
                                                    if (isGroupRepresentative) {
                                                      // Calculate total for the group
                                                      const groupItems = formData.items.filter((groupItem: any) =>
                                                        groupItem.group_id === groupId
                                                      );
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
                                              {item.status && item.status !== "AVAILABLE" && (
                                                <Chip color="warning" variant="flat" size="sm">
                                                  {item.status}
                                                </Chip>
                                              )}
                                            </div>
                                          </div>
                                        }
                                      >
                                        <div className="space-y-4">
                                          {/* Item Identifier */}
                                          {item.uuid && (
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
                                                          {groupSize} items
                                                        </Chip>
                                                        <Chip color="secondary" variant="flat" size="sm">
                                                          View Details
                                                        </Chip>
                                                      </div>
                                                    </div>
                                                  }
                                                >
                                                  <div className="space-y-4 p-4">
                                                    {formData.items
                                                      .filter((groupItem: any) => groupItem.group_id === groupId)
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
                                                              {groupItem.status && groupItem.status !== "AVAILABLE" && (
                                                                <Chip
                                                                  color={getStatusColor(groupItem.status)}
                                                                  variant="flat"
                                                                  size="sm"
                                                                >
                                                                  {groupItem.status}
                                                                </Chip>
                                                              )}
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
                                                            <div className="mb-4">
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
                                            ) : (
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
                  condition={false}
                  skeleton={<></>}>
                  <div className="text-center text-default-500">
                    <Icon icon="mdi:package-variant" className="mx-auto mb-4 opacity-50" width={64} height={64} />
                    <p className="text-lg">Select a warehouse item to view details</p>
                  </div>
                </LoadingAnimation>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* QR Code Modal */}
      <Modal
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
    </motion.div >
  );
}