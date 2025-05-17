"use client";

import { createClient } from "@/utils/supabase/client";
import {
  Button,
  Chip,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Spinner,
  Textarea,
  Autocomplete,
  AutocompleteItem,
  Accordion,
  AccordionItem,
  useDisclosure,
  Tooltip,
  Card,
  CardBody,
  CardHeader,
  CardFooter,
  NumberInput
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import React, { lazy, memo, Suspense, useEffect, useState } from "react";
import { format } from "date-fns";

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';

// Import server actions
import CardList from "@/components/card-list";
import { motionTransition } from "@/utils/anim";
import {
  getWarehouseInventoryItems,
  getWarehouseInventoryItem,
  getWarehouseItemByInventory,
  getWarehouses,
  getWarehouseInventoryItemBulks,
  getWarehouseInventoryItemUnits,
  WarehouseInventoryItem,
  WarehouseInventoryItemBulk,
  WarehouseInventoryItemUnit
} from "./actions";

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

  // Form state
  const [formData, setFormData] = useState<Partial<WarehouseInventoryItem>>({});

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
      type: "warehouse_item",
      uuid: formData.uuid,
      inventory_uuid: formData.inventory_uuid,
      name: formData.name,
      warehouse_uuid: formData.warehouse_uuid,
      timestamp: new Date().toISOString()
    };

    return JSON.stringify(data, null, space);
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
  const handleViewDelivery = () => {
    if (formData.delivery_uuid) {
      router.push(`/home/delivery?deliveryId=${formData.delivery_uuid}`);
    }
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
        }
      } else if (inventoryItemId) {
        // Get warehouse item by inventory UUID
        const result = await getWarehouseItemByInventory(inventoryItemId);
        if (result.success && result.data) {
          setSelectedItemId(result.data.uuid);
          setFormData(result.data);
          
          // Load bulks for this item
          await loadItemBulks(result.data.uuid);

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
          {!user ? (
            <>
              <Skeleton className="h-10 w-32 rounded-xl" />
            </>
          ) : (
            <>
              <Button
                color="primary"
                variant="shadow"
                onPress={() => qrCodeModal.onOpen()}
                isDisabled={!selectedItemId}
              >
                <Icon icon="mdi:qrcode" className="mr-2" />
                Generate QR Code
              </Button>
            </>
          )}
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
              )}
            </div>
            <div className="h-full absolute w-full">
              {!user || isLoadingItems ? (
                <div className="space-y-4 mt-1 p-4 pt-[13.25rem] h-full relative">
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
                  className='space-y-4 p-4 overflow-y-auto pt-[13.25rem] xl:h-full h-[42rem]'>
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
                          <Chip color={item.status === "AVAILABLE" ? "success" : "warning"} variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                            {item.status}
                          </Chip>
                          <Chip color="secondary" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                            {format(new Date(item.created_at || ""), "MMM d, yyyy")}
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
                        label="Name"
                        value={formData.name || ""}
                        isReadOnly
                        classNames={inputStyle}
                        startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                      />

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
                                      {bulk.unit_value} {bulk.unit}
                                    </Chip>
                                    {bulk.location_codes && (
                                      <Chip color="success" variant="flat" size="sm">
                                        {bulk.location_codes}
                                      </Chip>
                                    )}
                                    {bulk.is_single_item && (
                                      <Chip color="success" variant="flat" size="sm">
                                        Single Item
                                      </Chip>
                                    )}
                                  </div>
                                </div>
                              }
                            >
                              <div>
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

                                  <NumberInput
                                    label="Cost"
                                    value={bulk.cost}
                                    isReadOnly
                                    classNames={inputStyle}
                                    startContent={<Icon icon="mdi:currency-php" className="text-default-500 mb-[0.2rem]" />}
                                  />

                                  <Input
                                    label="Location"
                                    value={bulk.location_codes || "Not assigned"}
                                    isReadOnly
                                    classNames={inputStyle}
                                    startContent={<Icon icon="mdi:map-marker" className="text-default-500 mb-[0.2rem]" />}
                                  />
                                </div>

                                <div className="p-4 pb-0">
                                  {/* Show 3D location button if location exists */}
                                  {bulk.locations && bulk.locations.length > 0 && (
                                    <div className="flex justify-end mb-4">
                                      <Button
                                        color="secondary"
                                        variant="flat"
                                        onPress={() => locationModal.onOpen()}
                                        startContent={<Icon icon="mdi:view-in-ar" />}
                                      >
                                        View 3D Location
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                <div className="overflow-hidden px-4 pb-4">
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
                                                      {unit.unit_value} {unit.unit}
                                                    </Chip>
                                                  </div>
                                                }
                                              >
                                                <div className="space-y-4">
                                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
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

                                                    <NumberInput
                                                      label="Cost"
                                                      value={unit.cost}
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

              <motion.div {...motionTransition}>
                <div className="flex flex-col md:flex-row justify-center items-center gap-4">
                  <Button
                    color="primary"
                    variant="shadow"
                    className="w-full"
                    onPress={handleViewInventory}
                    isDisabled={!formData.inventory_uuid}
                    startContent={<Icon icon="mdi:archive-outline" />}
                  >
                    View Inventory Item
                  </Button>

                  <Button
                    color="secondary"
                    variant="shadow"
                    className="w-full"
                    onPress={handleViewWarehouse}
                    isDisabled={!formData.warehouse_uuid}
                    startContent={<Icon icon="mdi:warehouse" />}
                  >
                    View Warehouse
                  </Button>

                  {formData.delivery_uuid && (
                    <Button
                      color="warning"
                      variant="shadow"
                      className="w-full"
                      onPress={handleViewDelivery}
                      startContent={<Icon icon="mdi:truck-delivery" />}
                    >
                      View Delivery
                    </Button>
                  )}
                </div>
              </motion.div>
            </CardList>
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
                <Icon icon="mdi:qrcode-scan" className="mr-2" />
                Find Item
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Modal for QR Code */}
      <Modal isOpen={qrCodeModal.isOpen} onClose={qrCodeModal.onClose} size="lg">
        <ModalContent>
          <ModalHeader>Item QR Code</ModalHeader>
          <ModalBody>
            <div className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-xl">
                <QRCodeCanvas
                  value={generateItemJson()}
                  size={256}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="L"
                  includeMargin={false}
                />
              </div>
              <p className="text-center mt-4 text-default-600">
                Scan this code to quickly access this warehouse item
              </p>
              <div className="mt-6 w-full">
                <SyntaxHighlighter
                  language="json"
                  style={materialLight}
                  customStyle={{ borderRadius: '0.5rem' }}
                >
                  {generateItemJson(2)}
                </SyntaxHighlighter>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={qrCodeModal.onClose}>
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
              Download QR
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal for 3D Location View */}
      {/* <Modal isOpen={locationModal.isOpen} onClose={locationModal.onClose} size="xl">
        <ModalContent>
          <ModalHeader>3D Location View</ModalHeader>
          <ModalBody>
            <div className="h-[500px] w-full">
              <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>}>
                {itemBulks.length > 0 && itemBulks[0].locations && (
                  <ShelfSelector3D
                    floorConfig={{
                      floor: 1,
                      matrix: Array(10).fill(Array(10).fill(2)), // Default matrix
                      name: "Warehouse Floor"
                    }}
                    readOnly={true}
                    preselectedLocations={itemBulks[0].locations}
                    occupiedLocations={[]}
                    onSelectionChange={() => {}}
                  />
                )}
              </Suspense>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={locationModal.onClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal> */}
    </div>
  );
}