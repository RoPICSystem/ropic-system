"use client";

import { createClient } from "@/utils/supabase/client";
import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Chip,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Select,
  SelectItem,
  Skeleton,
  Spinner,
  Textarea
} from "@heroui/react";
import { Icon } from "@iconify-icon/react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import React, { lazy, memo, useEffect, useState } from "react";

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialDark, materialLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';

// Import server actions
import CardList from "@/components/card-list";
import { motionTransition } from "@/utils/anim";
import {
  checkAdminStatus,
  createInventoryItem,
  getBulkUnitOptions,
  getInventoryItems,
  getUnitOptions,
  InventoryItem,
  updateInventoryItem,
} from "./actions";


const ShelfSelector3D = memo(lazy(() =>
  import("@/components/shelf-selector-3d-v4").then(mod => ({
    default: mod.ShelfSelector3D
  }))
));

export default function InventoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [admin, setAdmin] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [bulkUnitOptions, setBulkUnitOptions] = useState<string[]>([]);

  // Inventory list state
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Add state for QR code modal
  const [showQrCode, setShowQrCode] = useState(false);

  const generateProductJson = (space: number = 0) => {
    if (!selectedItemId || !formData) return "{}";

    // Remove data with null, "", or undefined values
    const filteredData = Object.fromEntries(
      Object.entries(formData).filter(([key, value]) =>
        value !== null && value !== "" && value !== undefined &&
        key !== "admin_uuid" && key !== "created_at" && key !== "updated_at" && key !== "status")
    );

    const productData = filteredData;

    return JSON.stringify(productData, null, space);
  };

  // Form state
  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    company_uuid: "",
    item_code: "",
    item_name: "",
    description: "",
    total_quantity: 1,
    bulk_quantity: 1,
    quantity: 1,
    bulk_unit: "",
    unit: "",
    unit_value: 1,
    total_cost: 1,
    bulk_ending_inventory: 1,
    ending_inventory: 1,
    netsuite: null,
    variance: null
  });

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  }


  const [warehouseOnly, setWarehouseOnly] = useState(false);

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Handle item search
  const handleSearch = async (query: string, filterByWarehouse = warehouseOnly) => {
    setSearchQuery(query);

    try {
      setIsLoadingItems(true);

      const result = await getInventoryItems(
        admin.company_uuid,
        query,
        filterByWarehouse ? "IN_WAREHOUSE" : undefined
      );

      setInventoryItems(result.data || []);
    } catch (error) {
      console.error("Error searching items:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Add a function to toggle warehouse filter
  const toggleWarehouseFilter = () => {
    const newFilterState = !warehouseOnly;
    setWarehouseOnly(newFilterState);
    handleSearch(searchQuery, newFilterState);
  };


  // In handleSelectItem function, just update the URL
  const handleSelectItem = (key: string) => {
    // Update the URL with the selected item ID without reloading the page
    const params = new URLSearchParams(searchParams.toString());
    params.set("itemId", key);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const isAvailable = (item: Partial<InventoryItem>) => {
    console.log("Item status:", item.status);
    return item.status === undefined || item.status?.toUpperCase() === "AVAILABLE" ;
  }

  // Add or update useEffect to watch for changes in search parameters
  useEffect(() => {
    if (!admin?.company_uuid || isLoadingItems || inventoryItems.length === 0) return;

    const itemId = searchParams.get("itemId");
    if (!itemId) {
      // Clear selection if no itemId in URL
      setSelectedItemId(null);

      setFormData({
        uuid: admin.uuid,
        company_uuid: admin.company_uuid,
        admin_uuid: admin.uuid,
        item_code: "",
        item_name: "",
        description: "",
        total_quantity: 1,
        bulk_quantity: 1,
        quantity: 1,
        bulk_unit: "",
        unit: "",
        unit_value: 1,
        total_cost: 1,
        bulk_ending_inventory: 1,
        ending_inventory: 1,
        netsuite: null,
        variance: null
      });

      setSelectedItemId(null);

      console.log("No itemId in URL");

      return;
    }

    // Find the item in inventory
    const item = inventoryItems.find(i => i.uuid === itemId) as InventoryItem;
    if (!item) return;

    // Set the selected item and form data
    setSelectedItemId(itemId);
    setFormData({
      ...item
    });

  }, [searchParams, admin?.company_uuid, isLoadingItems, inventoryItems]);

  // Fetch admin status and options when component mounts
  useEffect(() => {
    const initPage = async () => {
      const defaultLayout = [
        {
          height: 5,
          matrix: Array(16).fill(0).map(() => Array(32).fill(0))
        }
      ];

      try {
        const adminData = await checkAdminStatus();
        setAdmin(adminData);

        setFormData(prev => ({
          ...prev,
          admin_uuid: adminData.uuid,
          company_uuid: adminData.company_uuid,
        }));

        // Fetch initial inventory items
        const items = await getInventoryItems(
          adminData.company_uuid
        );

        setInventoryItems(items.data || []);
        setIsLoadingItems(false);
      } catch (error) {
        console.error("Error initializing page:", error);
      }
    };

    initPage();
  }, []);

  // Fetch admin status and options when component mounts
  useEffect(() => {
    const initPage = async () => {
      try {
        const adminData = await checkAdminStatus();
        setAdmin(adminData);

        setFormData(prev => ({
          ...prev,
          admin_uuid: adminData.uuid,
          company_uuid: adminData.company_uuid
        }));

        const unitOptions = await getUnitOptions();
        setUnitOptions(unitOptions);

        const bulkUnitOptions = await getBulkUnitOptions();
        setBulkUnitOptions(bulkUnitOptions);

        // Fetch inventory items with filter applied
        if (adminData.company_uuid) {
          const result = await getInventoryItems(
            adminData.company_uuid,
            searchQuery,
            warehouseOnly ? "IN_WAREHOUSE" : undefined
          );
          setInventoryItems(result.data || []);
          setIsLoadingItems(false);
        }

      } catch (error) {
        console.error("Error initializing page:", error);
      }
    };

    initPage();
  }, [warehouseOnly]); // Add warehouseOnly as a dependency

  useEffect(() => {
    if (!admin?.company_uuid) return;

    // Create a client-side Supabase client for real-time subscriptions
    const supabase = createClient();

    const channel = supabase
      .channel('inventory-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'inventory_items',
          filter: `company_uuid=eq.${admin.company_uuid}`
        },
        async (payload) => {
          console.log('Real-time update received:', payload);

          // Refresh inventory items with the current filter state
          const refreshedItems = await getInventoryItems(
            admin.company_uuid,
            searchQuery,
            warehouseOnly ? "IN_WAREHOUSE" : undefined
          );

          setInventoryItems(refreshedItems.data || []);
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(channel);
    };
  }, [admin?.company_uuid, searchQuery, warehouseOnly]);

  // Form change handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => {
        const parentObj = prev[parent as keyof typeof prev];
        return {
          ...prev,
          [parent]: {
            ...(parentObj && typeof parentObj === 'object' ? parentObj : {}),
            [child]: value
          }
        };
      });
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };


  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();


    const newErrors: Record<string, string> = {};
    if (!admin) {
      formData.admin_uuid = admin?.uuid;
      formData.company_uuid = admin?.company_uuid;
    }
    if (!formData.item_code) newErrors.item_code = "Item code is required";
    if (!formData.item_name) newErrors.item_name = "Item name is required";
    if (!formData.quantity || formData.quantity <= 0) newErrors.quantity = "Valid quantity is required";
    if (!formData.bulk_quantity || formData.bulk_quantity <= 0) newErrors.bulk_quantity = "Valid bulk quantity is required";
    if (!formData.unit) newErrors.unit = "Unit is required";
    if (!formData.bulk_unit) newErrors.bulk_unit = "Bulk unit is required";
    if (formData.total_cost === undefined || formData.total_cost < 0) newErrors.total_cost = "Valid total cost is required";
    if (formData.ending_inventory === undefined || formData.ending_inventory < 0) newErrors.ending_inventory = "Valid ending inventory is required";
    if (formData.bulk_ending_inventory === undefined || formData.bulk_ending_inventory < 0) newErrors.bulk_ending_inventory = "Valid bulk ending inventory is required";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }


    setIsLoading(true);

    try {
      // Determine if we're creating or updating
      let result;

      if (selectedItemId) {
        // Update existing item
        result = await updateInventoryItem(selectedItemId, formData as any);
      } else {
        // Create new item
        delete formData.uuid; // Remove uuid for new item creation
        result = await createInventoryItem(formData as any);
      }

      // If creating a new item, update the URL with the new item ID
      const newItemId = (result.data as any)[0].uuid;
      if (result.success && result.data && newItemId) {
        // First set a pending state to track the new item
        const newItem = result.success ? (result.data as any)[0] : null;
        setSelectedItemId(newItem?.uuid || null);

        // Wait for the items to be refreshed by the real-time subscription
        // by adding a slight delay before updating the URL
        setTimeout(() => {
          if (newItem?.uuid) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("itemId", newItem.uuid);
            router.push(`?${params.toString()}`, { scroll: false });
          }
          setErrors({});
        }, 500);
        setErrors({});
      }
      // You could add a success message here if you have a toast notification system
      else {
        setFormData({
          company_uuid: admin.company_uuid,
          admin_uuid: admin.uuid,
          item_code: "",
          item_name: "",
          description: "",
          total_quantity: 0,
          bulk_quantity: 0,
          quantity: 0,
          bulk_unit: "",
          unit: "",
          total_cost: 0,
          bulk_ending_inventory: 0,
          ending_inventory: 0,
          netsuite: null,
          variance: null
        });

        setSelectedItemId(null);

        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`Error ${selectedItemId ? 'updating' : 'creating'} inventory item:`, error);
      alert(`Failed to ${selectedItemId ? 'update' : 'save'} inventory item. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewItem = () => {
    // Clear the URL parameter
    const params = new URLSearchParams(searchParams.toString());
    params.delete("itemId");
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="container mx-auto p-2 max-w-4xl">
      <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
        <div className="flex flex-col w-full xl:text-left text-center">
          <h1 className="text-2xl font-bold">Inventory Management</h1>
          {(isLoading || isLoadingItems) ? (
            <div className="text-default-500 flex items-center">
              <p className='my-auto mr-1'>Loading inventory data</p>
              <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
            </div>
          ) : (
            <p className="text-default-500">Manage your inventory items efficiently.</p>
          )}
        </div>
        <div className="flex gap-4">
          <div className="mt-4 text-center">
            {!admin ? (
              <div className="flex gap-2">
                <Skeleton className="h-10 w-32 rounded-xl" />
                <Skeleton className="h-10 w-32 rounded-xl" />
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  color="secondary"
                  variant="shadow"
                  onPress={toggleWarehouseFilter}
                >
                  <div className="w-32">
                    <AnimatePresence>
                      {warehouseOnly ? (
                        <motion.div
                          {...motionTransition}
                          key="show-admin-only"
                        >
                          <div className="w-32 flex items-center gap-2 justify-center">
                            Show all
                            <Icon icon={warehouseOnly ? "mdi:eye" : "mdi:eye-off"} width={18} />
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          {...motionTransition}
                          key="hide-admin-only"
                        >
                          <div className="w-32 flex items-center gap-2 justify-center">
                            Warehouse only
                            <Icon icon={warehouseOnly ? "mdi:eye" : "mdi:eye-off"} width={18} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Button>


                <Button
                  color="primary"
                  variant="shadow"
                  onPress={handleNewItem}
                >
                  <Icon icon="mdi:plus" className="mr-2" />
                  New Item
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col xl:flex-row gap-4 ">
        {/* Left side: Inventory List */}
        <div className={`xl:w-1/3 shadow-xl shadow-primary/10 
          xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
          xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
          border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
        >
          <div className="flex flex-col h-full">
            <div className="p-4 sticky top-0 z-20 bg-background/80 border-b border-default-200 backdrop-blur-lg shadow-sm">
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Inventory Items</h2>
              {!admin ? (
                <Skeleton className="h-10 w-full rounded-xl" />
              ) : (
                <Input
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  isClearable
                  onClear={() => handleSearch("")}
                  startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
                />
              )}
            </div>
            <div className="h-full absolute w-full">
              {!admin || isLoadingItems ? (
                <div className="space-y-4 mt-1 p-4 pt-32 h-full relative">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="w-full min-h-[7.5rem] rounded-xl" />
                  ))}
                  <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                  <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Spinner />
                  </div>
                </div>
              ) : !isLoadingItems && inventoryItems.length !== 0 ? (
                <div
                  className='space-y-4 p-4 overflow-y-auto pt-[8.25rem] xl:h-full h-[42rem]'>
                  {inventoryItems.map((item) => (
                    <Button
                      key={item.uuid}
                      onPress={() => handleSelectItem(item.uuid)}
                      variant="shadow"
                      className={`w-full min-h-[7.5rem] !transition-all duration-200 rounded-xl p-0  ${selectedItemId === item.uuid ?
                        '!bg-primary hover:!bg-primary-400 !shadow-lg hover:!shadow-md hover:!shadow-primary-200 !shadow-primary-200' :
                        '!bg-default-100/50 shadow-none hover:!bg-default-200 !shadow-2xs hover:!shadow-md hover:!shadow-default-200 !shadow-default-200'}`}
                    >
                      <div className="w-full flex flex-col h-full">
                        <div className="flex-grow flex flex-col justify-center px-3">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{item.item_name}</span>
                            <Chip color="default" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">{item.item_code}</Chip>
                          </div>
                          {item.description &&
                            <div className={`w-full mt-1 text-sm ${selectedItemId === item.uuid ? 'text-default-800 ' : 'text-default-600'} text-start text-ellipsis overflow-hidden whitespace-nowrap`}>
                              {item.description}
                            </div>
                          }
                        </div>

                        {/* Footer - always at the bottom */}
                        <div className={`flex items-center gap-2 border-t ${selectedItemId === item.uuid ? 'border-primary-300' : 'border-default-100'} p-3`}>
                          <Chip color="secondary" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                            {item.bulk_quantity} {item.bulk_unit}
                          </Chip>
                          <Chip color="warning" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                            {item.quantity} {item.unit}
                          </Chip>
                          <Chip color="success" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                            ₱{item.ending_inventory.toFixed(2)}
                          </Chip>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              ) : null}

              {admin && !isLoadingItems && inventoryItems.length === 0 && (
                <div className="xl:h-full h-[42rem] absolute w-full">
                  <div className="py-4 flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Icon icon="fluent:box-dismiss-20-filled" className="text-5xl text-default-300" />
                    <p className="text-default-500 mt-2">No items found.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Item Form */}
        <div className="xl:w-2/3">
          <Form id="inventoryForm" onSubmit={handleSubmit} className="items-stretch space-y-4">
            <CardList>
              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Basic Information</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                    {!admin ? (
                      <>
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </>
                    ) : (
                      <>
                        <Input
                          name="item_code"
                          label="Item Code"
                          classNames={inputStyle}
                          placeholder="Enter item code"
                          value={formData.item_code || ""}
                          onChange={handleInputChange}
                          isReadOnly={!isAvailable(formData)}
                          isRequired={isAvailable(formData)}
                          isInvalid={!!errors.item_code}
                          errorMessage={errors.item_code}
                          startContent={<Icon icon="mdi:barcode" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <Input
                          name="item_name"
                          label="Item Name"
                          classNames={inputStyle}
                          placeholder="Enter item name"
                          value={formData.item_name || ""}
                          onChange={handleInputChange}
                          isReadOnly={!isAvailable(formData)}
                          isRequired={isAvailable(formData)}
                          isInvalid={!!errors.item_name}
                          errorMessage={errors.item_name}
                          startContent={<Icon icon="mdi:package-variant" className="text-default-500 pb-[0.1rem]" />}
                        />
                      </>
                    )}
                  </div>

                  {!admin ? (
                    <Skeleton className="h-16 w-full rounded-xl" />
                  ) : (
                    <Textarea
                      name="description"
                      label="Description"
                      maxRows={5}
                      minRows={1}
                      classNames={inputStyle}
                      placeholder="Enter item description (optional)"
                      value={formData.description || ""}
                      onChange={handleInputChange}
                    />
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Quantity & Costs</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4">
                    {!admin ? (
                      <>
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </>
                    ) : (
                      <>

                        <NumberInput
                          name="total_quantity"
                          label="Total Quantity"
                          classNames={inputStyle}
                          placeholder="0"
                          value={(formData.bulk_quantity || 0) * (formData.quantity || 0)}
                          isReadOnly
                          startContent={
                            <div className="flex items-center">
                              <Icon icon="mdi:calculator" className="text-default-500 pb-[0.1rem]" />
                            </div>
                          }
                          hideStepper
                        />

                        <NumberInput
                          name="bulk_quantity"
                          classNames={inputStyle}
                          label="Bulk Quantity"
                          placeholder="0"
                          minValue={1}
                          maxValue={999999}
                          step={1}
                          value={formData.bulk_quantity}
                          onValueChange={(e) => {
                            const bulkQuantity = e;
                            const itemQuantity = formData.quantity || 1;
                            const itemCost = formData.ending_inventory || 1;

                            // Calculate total cost
                            const totalCost = itemCost * itemQuantity * bulkQuantity;
                            // Calculate bulk cost
                            const bulkCost = itemCost * itemQuantity;

                            setFormData({
                              ...formData,
                              total_quantity: bulkQuantity * itemQuantity,
                              bulk_quantity: bulkQuantity,
                              bulk_ending_inventory: Number(bulkCost.toFixed(2)),
                              total_cost: Number(totalCost.toFixed(2))
                            });
                          }}
                          isReadOnly={!isAvailable(formData)}
                          hideStepper={!isAvailable(formData)}
                          isRequired={isAvailable(formData)}
                          isInvalid={!!errors.bulk_quantity}
                          errorMessage={errors.bulk_quantity}
                          startContent={<Icon icon="mdi:numeric" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <NumberInput
                          name="quantity"
                          classNames={inputStyle}
                          label="Items Per Bulk"
                          placeholder="0"
                          minValue={1}
                          maxValue={999999}
                          step={1}
                          value={formData.quantity}
                          onValueChange={(e) => {
                            const itemQuantity = e;
                            const itemCost = formData.ending_inventory || 1;
                            const bulkQuantity = formData.bulk_quantity || 1;

                            // Calculate bulk cost from per item cost
                            const bulkCost = itemCost * itemQuantity;
                            // Calculate total cost
                            const totalCost = bulkCost * bulkQuantity;

                            setFormData({
                              ...formData,
                              total_quantity: bulkQuantity * itemQuantity,
                              quantity: itemQuantity,
                              bulk_ending_inventory: Number(bulkCost.toFixed(2)),
                              total_cost: Number(totalCost.toFixed(2))
                            });
                          }}
                          isReadOnly={!isAvailable(formData)}
                          hideStepper={!isAvailable(formData)}
                          isRequired={isAvailable(formData)}
                          isInvalid={!!errors.quantity}
                          errorMessage={errors.quantity}
                          startContent={<Icon icon="mdi:numeric" className="text-default-500 pb-[0.1rem]" />}
                        />

                      </>
                    )}
                  </div>



                  <div className="grid grid-cols-1 md:grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4">
                    {!admin ? (
                      <>
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </>
                    ) : (
                      <>
                        {/* total delivery cost */}

                        <NumberInput
                          name="total_cost"
                          classNames={inputStyle}
                          label="Total Cost"
                          placeholder="0.00"
                          minValue={1}
                          maxValue={99999999}
                          step={1}
                          value={formData.total_cost || 1}
                          onValueChange={(e) => {
                            const totalCost = e;
                            const bulkQuantity = formData.bulk_quantity || 1;
                            const itemQuantity = formData.quantity || 1;

                            // Calculate bulk cost
                            const bulkCost = bulkQuantity > 0 ? totalCost / bulkQuantity : totalCost;
                            // Calculate item cost
                            const itemCost = itemQuantity > 0 ? bulkCost / itemQuantity : bulkCost;

                            setFormData({
                              ...formData,
                              total_cost: totalCost,
                              bulk_ending_inventory: Number(bulkCost.toFixed(2)),
                              ending_inventory: Number(itemCost.toFixed(2))
                            });
                          }}
                          isReadOnly={!isAvailable(formData)}
                          hideStepper={!isAvailable(formData)}
                          isRequired={isAvailable(formData)}
                          startContent={<Icon icon="mdi:currency-php" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <NumberInput
                          name="bulk_ending_inventory"
                          classNames={inputStyle}
                          label="Cost Per Bulk"
                          placeholder="0"
                          minValue={1}
                          maxValue={99999999}
                          step={1}
                          value={formData.bulk_ending_inventory}
                          onValueChange={(e) => {
                            // When bulk cost changes, update item cost accordingly
                            const bulkCost = e;
                            const itemQuantity = formData.quantity || 1;
                            const bulkQuantity = formData.bulk_quantity || 1;

                            // Calculate per item cost from bulk cost
                            const itemCost = itemQuantity > 0 ? bulkCost / itemQuantity : bulkCost;
                            // Calculate total cost
                            const totalCost = bulkCost * bulkQuantity;

                            setFormData({
                              ...formData,
                              bulk_ending_inventory: bulkCost,
                              ending_inventory: Number(itemCost.toFixed(2)),
                              total_cost: Number(totalCost.toFixed(2))
                            });
                          }}
                          isReadOnly={!isAvailable(formData)}
                          hideStepper={!isAvailable(formData)}
                          isRequired={isAvailable(formData)}
                          isInvalid={!!errors.bulk_ending_inventory}
                          errorMessage={errors.bulk_ending_inventory}
                          startContent={<Icon icon="mdi:currency-php" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <NumberInput
                          name="ending_inventory"
                          classNames={inputStyle}
                          label="Cost Per Item"
                          placeholder="0.00"
                          minValue={1}
                          maxValue={99999999}
                          value={formData.ending_inventory}
                          onValueChange={(e) => {
                            // When item cost changes, update bulk cost accordingly
                            const itemCost = e;
                            const itemQuantity = formData.quantity || 1;
                            const bulkQuantity = formData.bulk_quantity || 1;

                            // Calculate bulk cost from per item cost
                            const bulkCost = itemCost * itemQuantity;
                            // Calculate total cost
                            const totalCost = bulkCost * bulkQuantity;

                            setFormData({
                              ...formData,
                              ending_inventory: itemCost,
                              bulk_ending_inventory: Number(bulkCost.toFixed(2)),
                              total_cost: Number(totalCost.toFixed(2))
                            });
                          }}
                          isReadOnly={!isAvailable(formData)}
                          hideStepper={!isAvailable(formData)}
                          isRequired={isAvailable(formData)}
                          isInvalid={!!errors.ending_inventory}
                          errorMessage={errors.ending_inventory}
                          startContent={<Icon icon="mdi:currency-php" className="text-default-500 pb-[0.1rem]" />}
                        />
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-4">
                    {!admin ? (
                      <>
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </>
                    ) : (
                      <>

                        <Autocomplete
                          name="bulk_unit"
                          label="Bulk Unit"
                          placeholder="Select bulk unit"
                          selectedKey={formData.bulk_unit || ""}
                          onSelectionChange={(e) => {
                            const selectedWarehouse = bulkUnitOptions.find((unit) => unit === e);
                            if (selectedWarehouse) {
                              setFormData(prev => ({
                                ...prev,
                                bulk_unit: selectedWarehouse,
                              }));
                            } else {
                              setFormData(prev => ({
                                ...prev,
                                bulk_unit: "",
                              }));
                            }
                          }}
                          isReadOnly={!isAvailable(formData)}
                          selectorIcon={!isAvailable(formData) ? null : <Icon icon="heroicons:chevron-down" height={15} />}
                          isRequired={isAvailable(formData)}
                          inputProps={{classNames: inputStyle}}
                          isInvalid={!!errors.unit}
                          isClearable={false}
                          errorMessage={errors.unit}
                          startContent={<Icon icon="mdi:package-variant" className="text-default-500 pb-[0.1rem]" />}
                          popoverProps={{ className: !isAvailable(formData) ? "collapse" : "" }}
                        >
                          {bulkUnitOptions.map((unit) => (
                            <AutocompleteItem key={unit}>
                              {unit}
                            </AutocompleteItem>
                          ))}
                        </Autocomplete>

                        <NumberInput
                          name="unit_value"
                          classNames={inputStyle}
                          label="Unit Value"
                          placeholder="Input unit value"
                          minValue={1}
                          maxValue={999999}
                          step={1}
                          value={formData.unit_value}
                          onValueChange={(e) => setFormData({ ...formData, unit_value: e })}
                          isReadOnly={!isAvailable(formData)}
                          hideStepper={!isAvailable(formData)}
                          isRequired={isAvailable(formData)}
                          isInvalid={!!errors.unit_value}
                          errorMessage={errors.unit_value}
                          startContent={<Icon icon="mdi:numeric" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <Autocomplete
                          name="unit"
                          label="Item Unit"
                          placeholder="Select Item unit"
                          selectedKey={formData.unit || ""}
                          onSelectionChange={(e) => {
                            const selectedWarehouse = unitOptions.find((unit) => unit === e);
                            if (selectedWarehouse) {
                              setFormData(prev => ({
                                ...prev,
                                unit: selectedWarehouse,
                              }));
                            } else {
                              setFormData(prev => ({
                                ...prev,
                                unit: "",
                              }));
                            }
                          }}
                          isClearable={false}
                          isReadOnly={!isAvailable(formData)}
                          selectorIcon={!isAvailable(formData) ? null : <Icon icon="heroicons:chevron-down" height={15} />}
                          isRequired={isAvailable(formData)}
                          inputProps={{classNames: inputStyle}}
                          isInvalid={!!errors.unit}
                          errorMessage={errors.unit}
                          startContent={<Icon icon="mdi:package-variant" className="text-default-500 pb-[0.1rem]" />}
                          popoverProps={{ className: !isAvailable(formData) ? "collapse" : "" }}
                        >
                          {unitOptions.map((unit) => (
                            <AutocompleteItem key={unit}>
                              {unit}
                            </AutocompleteItem>
                          ))}
                        </Autocomplete>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                    {!admin ? (
                      <>
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </>
                    ) : (
                      <>
                        <NumberInput
                          name="netsuite"
                          classNames={inputStyle}
                          label="Netsuite (Optional)"
                          placeholder="0.00"
                          onValueChange={(e) => setFormData({ ...formData, netsuite: e })}
                          value={formData.netsuite || 0}
                          isReadOnly={!isAvailable(formData)}
                          hideStepper={!isAvailable(formData)}
                          startContent={<Icon icon="mdi:database" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <NumberInput
                          name="variance"
                          classNames={inputStyle}
                          label="Variance (Optional)"
                          placeholder="0.00"
                          onValueChange={(e) => setFormData({ ...formData, variance: e })}
                          value={formData.variance || 0}
                          isReadOnly={!isAvailable(formData)}
                          hideStepper={!isAvailable(formData)}
                          startContent={<Icon icon="mdi:chart-line-variant" className="text-default-500 pb-[0.1rem]" />}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>


              <div {...(admin && selectedItemId ? {} : { className: '!min-h-0 !p-0 !h-0  border-none z-0' })}>
                <AnimatePresence>
                  {admin && selectedItemId && (
                    <motion.div
                      {...motionTransition}>
                      <div className="flex flex-col">
                        <h2 className="text-xl font-semibold mb-4 w-full text-center">Item Status</h2>
                        <Input
                          name="variance"
                          classNames={{ inputWrapper: `${inputStyle.inputWrapper} h-10 w-full` }}
                          isReadOnly
                          className="w-full"
                          value={formData.status?.toUpperCase().replace('_', ' ') || "UNKNOWN"}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>


              <div>

                <div className="flex justify-center items-center gap-4">
                  {!admin ? (
                    <Skeleton className="h-10 w-full rounded-xl" />
                  ) : (
                    <>
                      {selectedItemId &&
                        <Button
                          form="inventoryForm"
                          color="secondary"
                          variant="shadow"
                          className="w-full"
                          onPress={() => {
                            const params = new URLSearchParams("");
                            if (formData.status?.toUpperCase() === "PENDING") {
                              params.set("deliveryId", selectedItemId);
                              router.replace(`/home/delivery?${params.toString()}`, { scroll: false });
                            } else {
                              params.set("setInventory", selectedItemId);
                              router.replace(`/home/delivery?${params.toString()}`, { scroll: false });
                            }
                          }}
                          isDisabled={formData.status?.toUpperCase() === "DELIVERED"}
                        >
                          {(() => {
                            if (isAvailable(formData)) {
                              return (
                                <div className="flex items-center gap-2">
                                  <Icon icon="mdi:truck-delivery" />
                                  <span>Deliver Item</span>
                                </div>
                              );
                            } else {
                              return (
                                <div className="flex items-center gap-2">
                                  <Icon icon="mdi:clock-time-four-outline" />
                                  <span>Check Delivery</span>
                                </div>
                              );
                            }
                          })()}
                        </Button>
                      }
                      <Button
                        type="submit"
                        form="inventoryForm"
                        color="primary"
                        variant="shadow"
                        className="w-full"
                        isLoading={isLoading}
                      >
                        <Icon icon="mdi:content-save" className="mr-1" />
                        {selectedItemId ? "Update Item" : "Save Item"}
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
          <ModalHeader>Product QR Code</ModalHeader>
          <ModalBody className="flex flex-col items-center">
            <div className="bg-white rounded-xl overflow-hidden">
              <QRCodeCanvas
                id="qrcode"
                value={generateProductJson()}
                size={320}
                marginSize={4}
                level="L"
              />
            </div>
            <p className="text-center mt-4 text-default-600">
              Scan this code to get product details
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
                {generateProductJson(2)}
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
                  downloadLink.download = `product-${new Date().toISOString()}.png`;
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

    </div >
  );
}