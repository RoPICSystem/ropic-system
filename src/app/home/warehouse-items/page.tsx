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
  Select,
  SelectItem,
  Spinner,
  Textarea,
  Autocomplete,
  AutocompleteItem
} from "@heroui/react";
import { Icon } from "@iconify-icon/react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import React, { lazy, memo, Suspense, useEffect, useState } from "react";
import { format } from "date-fns";

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialDark, materialLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';

// Import server actions
import CardList from "@/components/card-list";
import { motionTransition } from "@/utils/anim";
import {
  checkAuthStatus,
  getWarehouseInventoryItems,
  getWarehouseInventoryItem,
  getWarehouseItemByInventory,
  getWarehouses,
  WarehouseInventoryItem,
} from "./actions";

// Lazy load 3D shelf selector
const ShelfSelector3D = memo(lazy(() =>
  import("@/components/shelf-selector-3d-v4").then(mod => ({
    default: mod.ShelfSelector3D
  }))
));

export default function WarehouseItemsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(true);

  // Warehouse items state
  const [warehouseItems, setWarehouseItems] = useState<WarehouseInventoryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Add state for QR code modal
  const [showQrCode, setShowQrCode] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<WarehouseInventoryItem>>({});

  // Input style for consistency
  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };

  // Generate item JSON for QR code
  const generateItemJson = (space: number = 0) => {
    if (!selectedItemId || !formData) return "{}";

    // Create a clean object with essential properties
    const itemData = {
      uuid: formData.uuid,
      item_code: formData.item_code,
      item_name: formData.item_name,
      location_code: formData.location_code,
      warehouse: formData.warehouse?.name,
      inventory_uuid: formData.inventory_uuid,
      // Include inventory item details that are useful
      inventory_item: formData.inventory_item ? {
        item_code: formData.inventory_item.item_code,
        item_name: formData.inventory_item.item_name,
        description: formData.inventory_item.description,
        quantity: formData.inventory_item.quantity,
        unit: formData.inventory_item.unit,
        unit_value: formData.inventory_item.unit_value,
        bulk_quantity: formData.inventory_item.bulk_quantity,
        bulk_unit: formData.inventory_item.bulk_unit,
      } : null
    };

    return JSON.stringify(itemData, null, space);
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
        }
      } else if (inventoryItemId) {
        // Get warehouse item by inventory UUID
        const result = await getWarehouseItemByInventory(inventoryItemId);
        if (result.success && result.data) {
          setSelectedItemId(result.data.uuid);
          setFormData(result.data);

          // Update URL to use warehouseItemId for consistency
          const params = new URLSearchParams(searchParams.toString());
          params.delete("itemId");
          params.set("warehouseItemId", result.data.uuid);
          router.push(`?${params.toString()}`, { scroll: false });
        } else {
          // If no warehouse item found for this inventory, clear selection
          setSelectedItemId(null);
          setFormData({});
        }
      } else {
        // No item selected
        setSelectedItemId(null);
        setFormData({});
      }
    };

    fetchItemDetails();
  }, [searchParams, user?.company_uuid, isLoadingItems]);

  // Initialize page data
  useEffect(() => {
    const initPage = async () => {
      try {
        const userData = await checkAuthStatus();
        setUser(userData);

        // Fetch warehouse items
        const itemsResult = await getWarehouseInventoryItems(userData.company_uuid);
        setWarehouseItems(itemsResult.data || []);

        // Fetch warehouses for filtering
        const warehousesResult = await getWarehouses(userData.company_uuid);
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
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(warehouseInventoryChannel);
    };
  }, [user?.company_uuid, searchQuery, selectedWarehouse]);

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
          <div className="mt-4 text-center">
            {!user ? (
              <Skeleton className="h-10 w-32 rounded-xl" />
            ) : (
              <div className="flex gap-2">
                <Button
                  color="secondary"
                  variant="shadow"
                  onPress={() => setShowLocationModal(true)}
                  isDisabled={!selectedItemId}
                >
                  <div className="flex items-center gap-2">
                    <Icon icon="mdi:map-marker" />
                    <span>View Location</span>
                  </div>
                </Button>

                <Button
                  color="primary"
                  variant="shadow"
                  onPress={() => setShowQrCode(true)}
                  isDisabled={!selectedItemId}
                >
                  <div className="flex items-center gap-2">
                    <Icon icon="mdi:qrcode" />
                    <span>QR Code</span>
                  </div>
                </Button>
              </div>
            )}
          </div>
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
                    name="unit"
                    label="Filter by Warehouse"
                    placeholder="All Warehouses"
                    selectedKey={selectedWarehouse || ""}
                    onSelectionChange={(e) => handleWarehouseChange(`${e}` || null)}
                    startContent={<Icon icon="mdi:warehouse" className="text-default-500 pb-[0.1rem]" />}
                    inputProps={{ classNames: inputStyle }}
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
                            <span className="font-semibold">{item.item_name}</span>
                            <Chip color="default" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">{item.location_code}</Chip>
                          </div>
                          <div className={`w-full mt-1 text-sm ${selectedItemId === item.uuid ? 'text-default-800 ' : 'text-default-600'} text-start`}>
                            {item.warehouse?.name}
                          </div>
                        </div>

                        {/* Footer - always at the bottom */}
                        <div className={`flex items-center gap-2 border-t ${selectedItemId === item.uuid ? 'border-primary-300' : 'border-default-100'} p-3`}>
                          <Chip color={item.status === "AVAILABLE" ? "success" : "warning"} variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                            {item.status}
                          </Chip>
                          <Chip color="secondary" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                            {(() => {
                              const deliveryDate = new Date(item.created_at || "");
                              const currentYear = new Date().getFullYear();
                              const deliveryYear = deliveryDate.getFullYear();

                              return deliveryYear < currentYear
                                ? format(deliveryDate, "MMM d, ''yy") // Shows year for past years
                                : format(deliveryDate, "MMM d");      // Current year format
                            })()}
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
          <Form id="warehouseItemForm" className="items-stretch space-y-4">
            <CardList>
              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Item Information</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {!user || !selectedItemId ? (
                      <>
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </>
                    ) : (
                      <>
                        <Input
                          label="Item Code"
                          value={formData.item_code || ""}
                          isReadOnly
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:barcode" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <Input
                          label="Item Name"
                          value={formData.item_name || ""}
                          isReadOnly
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:package-variant" className="text-default-500 pb-[0.1rem]" />}
                        />
                      </>
                    )}
                  </div>

                  {!user || !selectedItemId ? (
                    <Skeleton className="h-16 w-full rounded-xl" />
                  ) : formData.inventory_item?.description ? (
                    <Textarea
                      label="Description"
                      value={formData.inventory_item?.description || ""}
                      isReadOnly
                      classNames={inputStyle}
                      startContent={<Icon icon="mdi:text" className="text-default-500 pb-[0.1rem]" />}
                    />
                  ) : null}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Inventory Details</h2>
                <div className="space-y-4">
                  {!user || !selectedItemId ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                          label="Quantity per Unit"
                          value={`${formData.inventory_item?.quantity || ""} ${formData.inventory_item?.unit || ""}`}
                          isReadOnly
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:numeric" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <Input
                          label="Bulk Quantity"
                          value={`${formData.inventory_item?.bulk_quantity || ""} ${formData.inventory_item?.bulk_unit || ""}`}
                          isReadOnly
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:package-variant" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <Input
                          label="Total Units"
                          value={(formData.inventory_item?.quantity || 0) * (formData.inventory_item?.bulk_quantity || 0) + " " + (formData.inventory_item?.unit || "")}
                          isReadOnly
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:calculator" className="text-default-500 pb-[0.1rem]" />}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                          label="Unit Cost"
                          value={`₱${formData.inventory_item?.ending_inventory?.toFixed(2) || ""}`}
                          isReadOnly
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:currency-php" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <Input
                          label="Bulk Cost"
                          value={`₱${formData.inventory_item?.bulk_ending_inventory?.toFixed(2) || ""}`}
                          isReadOnly
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:currency-php" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <Input
                          label="Total Cost"
                          value={`₱${formData.inventory_item?.total_cost?.toFixed(2) || ""}`}
                          isReadOnly
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:currency-php" className="text-default-500 pb-[0.1rem]" />}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Warehouse Location</h2>
                <div className="space-y-4">
                  {!user || !selectedItemId ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </div>
                      <Skeleton className="h-16 w-full rounded-xl" />
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          label="Warehouse"
                          value={formData.warehouse?.name || ""}
                          isReadOnly
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:warehouse" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <Input
                          label="Status"
                          value={formData.status || ""}
                          isReadOnly
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:tag" className="text-default-500 pb-[0.1rem]" />}
                        />
                      </div>

                      <Input
                        label="Location Code"
                        value={formData.location_code || ""}
                        isReadOnly
                        classNames={inputStyle}
                        startContent={<Icon icon="mdi:map-marker" className="text-default-500 pb-[0.1rem]" />}
                      />
                    </>
                  )}
                </div>
              </div>

              <div>
                <div className="flex justify-center items-center gap-4">
                  {!user || !selectedItemId ? (
                    <Skeleton className="h-10 w-full rounded-xl" />
                  ) : (
                    <>
                      <Button
                        color="secondary"
                        variant="shadow"
                        className="w-full"
                        onPress={handleViewInventory}
                      >
                        <div className="flex items-center gap-2">
                          <Icon icon="mdi:package-variant" />
                          <span>View Inventory Item</span>
                        </div>
                      </Button>

                      <Button
                        color="primary"
                        variant="shadow"
                        className="w-full"
                        onPress={handleViewWarehouse}
                      >
                        <div className="flex items-center gap-2">
                          <Icon icon="mdi:warehouse" />
                          <span>View Warehouse</span>
                        </div>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardList>
          </Form>
        </div>
      </div>

      {/* Modal for QR Code */}
      <Modal
        isOpen={showQrCode}
        onClose={() => setShowQrCode(false)}
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
                style={window.currentTheme === 'dark' ? materialDark : materialLight}
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
              onPress={() => setShowQrCode(false)}
            >
              Close
            </Button>
            <Button
              color="primary"
              variant="shadow"
              onPress={() => {
                // save the QRCodeCanvas as an image
                const canvas = document.getElementById('qrcode') as HTMLCanvasElement;
                const pngUrl = canvas.toDataURL('image/png');
                const downloadLink = document.createElement('a');
                downloadLink.href = pngUrl;
                if (!formData.item_code || !formData.item_name)
                  downloadLink.download = `warehouse-item-${new Date().toISOString()}.png`;
                else
                  downloadLink.download = `${formData.item_name}-${formData.item_code}.png`;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                setShowQrCode(false);
              }}
            >
              <Icon icon="mdi:download" className="mr-1" />
              Download
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal for 3D Location View */}
      <Modal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        placement="auto"
        backdrop="blur"
        size="5xl"
        classNames={{
          backdrop: "bg-background/50",
          wrapper: 'overflow-hidden',
        }}
      >
        <ModalContent>
          <ModalHeader>Item Location in Warehouse</ModalHeader>
          <ModalBody className="p-0">
            <div className="h-[80vh] bg-primary-50 rounded-md overflow-hidden relative">
              <Suspense fallback={
                <div className="flex items-center justify-center h-full">
                  <Spinner size="lg" color="primary" />
                </div>
              }>
                {formData.location && (
                  <ShelfSelector3D
                    floors={formData.warehouse?.warehouse_layout || []}
                    onSelect={() => { }}
                    occupiedLocations={[formData.location]}
                    canSelectOccupiedLocations={false}
                    className="w-full h-full"
                    highlightedFloor={formData.location?.floor}
                    externalSelection={formData.location}
                    cameraOffsetY={-0.25}
                  />
                )}
              </Suspense>

              <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-md p-4 rounded-xl border border-default-200 shadow-lg">
                <h3 className="text-lg font-semibold mb-2">Location Details</h3>
                <p><span className="font-semibold">Code:</span> {formData.location_code}</p>
                <p><span className="font-semibold">Floor:</span> {formData.location?.floor}</p>
                <p><span className="font-semibold">Group:</span> {formData.location?.group}</p>
                <p><span className="font-semibold">Row:</span> {formData.location?.row}</p>
                <p><span className="font-semibold">Column:</span> {formData.location?.column}</p>
                <p><span className="font-semibold">Depth:</span> {formData.location?.depth || 0}</p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="primary" onPress={() => setShowLocationModal(false)}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}