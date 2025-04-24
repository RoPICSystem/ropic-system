"use client";

import CardList from "@/components/card-list";
import { motionTransition } from "@/utils/anim";
import {
  checkAdminStatus,
  createDeliveryItem,
  getDeliveryItems,
  getInventoryItems,
  updateDeliveryItem,
  updateInventoryItemStatus
} from "./actions";
import {
  Button,
  Chip,
  Form,
  Input,
  Listbox,
  ListboxItem,
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
  Textarea,
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify-icon/react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { format } from "date-fns";
import { QRCodeCanvas } from "qrcode.react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';

interface DeliveryItem {
  id: string;
  uuid: string;
  company_uuid: string;
  admin_uuid: string;
  inventory_item_uuid: string;
  recipient_name: string;
  recipient_contact: string;
  delivery_address: string;
  quantity: number;
  delivery_date: string;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  inventory_item?: InventoryItem;
}

interface InventoryItem {
  uuid: string;
  item_code: string;
  item_name: string;
  description: string | null;
  quantity: number;
  unit: string;
  location_code: string | null;
  status: string | null;
}

export default function DeliveryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [admin, setAdmin] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [showQrCode, setShowQrCode] = useState(false);

  // Delivery list state
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Available inventory items for delivery
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string>("");

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form state
  const [formData, setFormData] = useState<Partial<DeliveryItem>>({
    company_uuid: "",
    admin_uuid: "",
    inventory_item_uuid: "",
    recipient_name: "",
    recipient_contact: "",
    delivery_address: "",
    quantity: 1,
    delivery_date: format(new Date(), "yyyy-MM-dd"),
    notes: "",
    status: "PENDING"
  });

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  }

  // Generate delivery details JSON for QR code
  const generateDeliveryJson = (space: number = 0) => {
    if (!selectedDeliveryId || !formData) return "{}";

    // Remove data with null, "", or undefined values
    const filteredData = Object.fromEntries(
      Object.entries(formData).filter(([key, value]) =>
        value !== null && value !== "" && value !== undefined &&
        key !== "admin_uuid" && key !== "created_at" && key !== "updated_at")
    );

    // Add inventory item details if available
    const selectedInventoryItem = inventoryItems.find(item => item.uuid === formData.inventory_item_uuid);
    if (selectedInventoryItem) {
      (filteredData as any).inventory_item = {
        item_code: selectedInventoryItem.item_code,
        item_name: selectedInventoryItem.item_name,
        location_code: selectedInventoryItem.location_code,
        unit: selectedInventoryItem.unit
      };
    }

    return JSON.stringify(filteredData, null, space);
  };

  // Handle item search
  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    try {
      setIsLoadingItems(true);

      const result = await getDeliveryItems(admin.company_uuid, query);
      setDeliveryItems(result.data || []);
    } catch (error) {
      console.error("Error searching delivery items:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Handle selecting a delivery item
  const handleSelectDelivery = (key: string) => {
    // Update the URL with the selected delivery ID without reloading the page
    const params = new URLSearchParams(searchParams.toString());
    params.set("deliveryId", key);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle form input changes
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

  // Handle inventory item selection
  const handleInventoryItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const inventoryItemUuid = e.target.value;
    setSelectedItem(inventoryItemUuid);

    setFormData(prev => ({
      ...prev,
      inventory_item_uuid: inventoryItemUuid
    }));
  };

  // Handle creating a new delivery
  const handleNewDelivery = () => {
    // Clear the URL parameter
    const params = new URLSearchParams(searchParams.toString());
    params.delete("deliveryId");
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!formData.inventory_item_uuid) newErrors.inventory_item_uuid = "Please select an inventory item";
    if (!formData.recipient_name) newErrors.recipient_name = "Recipient name is required";
    if (!formData.recipient_contact) newErrors.recipient_contact = "Contact information is required";
    if (!formData.delivery_address) newErrors.delivery_address = "Delivery address is required";
    if (!formData.quantity || formData.quantity <= 0) newErrors.quantity = "Valid quantity is required";
    if (!formData.delivery_date) newErrors.delivery_date = "Delivery date is required";
    if (!formData.status) newErrors.status = "Status is required";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      // Ensure admin data is included
      if (!admin) {
        throw new Error("Admin data not available");
      }

      formData.admin_uuid = admin.uuid;
      formData.company_uuid = admin.company_uuid;

      let result;

      if (selectedDeliveryId) {
        // Update existing delivery
        result = await updateDeliveryItem(selectedDeliveryId, formData as any);

        // Update inventory item status
        if (result.success && formData.status) {
          await updateInventoryItemStatus(formData.inventory_item_uuid as string, formData.status);
        }
      } else {
        // Create new delivery
        result = await createDeliveryItem(formData as any);

        // Update inventory item status to match delivery status
        if (result.success && formData.inventory_item_uuid && formData.status) {
          await updateInventoryItemStatus(formData.inventory_item_uuid, formData.status);
        }
      }

      // Handle successful creation/update
      if (result.success && result.data) {
        const newDelivery = (result.data as any)[0];
        setSelectedDeliveryId(newDelivery?.uuid || null);

        // Update URL with new delivery ID
        setTimeout(() => {
          if (newDelivery?.uuid) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("deliveryId", newDelivery.uuid);
            router.push(`?${params.toString()}`, { scroll: false });
          }
          setErrors({});
        }, 500);
      } else {
        // Reset form on error
        if (!selectedDeliveryId) {
          setFormData({
            company_uuid: admin.company_uuid,
            admin_uuid: admin.uuid,
            inventory_item_uuid: "",
            recipient_name: "",
            recipient_contact: "",
            delivery_address: "",
            quantity: 1,
            delivery_date: format(new Date(), "yyyy-MM-dd"),
            notes: "",
            status: "PENDING"
          });
          setSelectedItem("");
          setSelectedDeliveryId(null);
        }
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`Error ${selectedDeliveryId ? 'updating' : 'creating'} delivery:`, error);
      alert(`Failed to ${selectedDeliveryId ? 'update' : 'create'} delivery. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  // Update delivery status
  const handleStatusChange = async (newStatus: string) => {
    if (!selectedDeliveryId || !formData.inventory_item_uuid) return;

    setIsLoading(true);

    try {
      // Update the delivery status
      const updatedFormData = { ...formData, status: newStatus };
      const result = await updateDeliveryItem(selectedDeliveryId, updatedFormData as any);

      // Update the inventory item status
      if (result.success) {
        await updateInventoryItemStatus(formData.inventory_item_uuid, newStatus);

        // Update local form data
        setFormData(updatedFormData);
      }
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Failed to update status. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Watch for URL changes to update selected delivery
  useEffect(() => {
    if (!admin?.company_uuid || isLoadingItems || deliveryItems.length === 0) return;

    const deliveryId = searchParams.get("deliveryId");
    if (!deliveryId) {
      // Clear selection if no deliveryId in URL
      setSelectedDeliveryId(null);
      setFormData({
        company_uuid: admin.company_uuid,
        admin_uuid: admin.uuid,
        inventory_item_uuid: "",
        recipient_name: "",
        recipient_contact: "",
        delivery_address: "",
        quantity: 1,
        delivery_date: format(new Date(), "yyyy-MM-dd"),
        notes: "",
        status: "PENDING"
      });
      setSelectedItem("");
      return;
    }

    // Find the delivery in the list
    const delivery = deliveryItems.find(d => d.uuid === deliveryId);
    if (!delivery) return;

    // Set the selected delivery and form data
    setSelectedDeliveryId(deliveryId);
    setFormData({
      ...delivery
    });
    setSelectedItem(delivery.inventory_item_uuid);
  }, [searchParams, admin?.company_uuid, isLoadingItems, deliveryItems]);

  // Initialize page data
  useEffect(() => {
    const initPage = async () => {
      try {
        const adminData = await checkAdminStatus();
        setAdmin(adminData);

        setFormData(prev => ({
          ...prev,
          admin_uuid: adminData.uuid,
          company_uuid: adminData.company_uuid,
        }));

        // Fetch initial delivery items
        const deliveriesResult = await getDeliveryItems(adminData.company_uuid);
        setDeliveryItems(deliveriesResult.data || []);

        // Fetch available inventory items
        const inventoryResult = await getInventoryItems(adminData.company_uuid);
        setInventoryItems(inventoryResult.data || []);

        setIsLoadingItems(false);
      } catch (error) {
        console.error("Error initializing page:", error);
      }
    };

    initPage();
  }, []);

  // Set up real-time updates
  useEffect(() => {
    if (!admin?.company_uuid) return;

    const supabase = createClient();

    // Set up real-time subscription for delivery items
    const deliveryChannel = supabase
      .channel('delivery-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_items',
          filter: `company_uuid=eq.${admin.company_uuid}`
        },
        async (payload) => {
          console.log('Real-time delivery update received:', payload);

          // Refresh delivery items
          const refreshedItems = await getDeliveryItems(admin.company_uuid, searchQuery);
          setDeliveryItems(refreshedItems.data || []);
        }
      )
      .subscribe();

    // Set up real-time subscription for inventory items
    const inventoryChannel = supabase
      .channel('inventory-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_items',
          filter: `company_uuid=eq.${admin.company_uuid}`
        },
        async (payload) => {
          console.log('Real-time inventory update received:', payload);

          // Refresh inventory items
          const refreshedItems = await getInventoryItems(admin.company_uuid);
          setInventoryItems(refreshedItems.data || []);
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(deliveryChannel);
      supabase.removeChannel(inventoryChannel);
    };
  }, [admin?.company_uuid, searchQuery]);


  return (
    <div className="container mx-auto p-2 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Delivery Management</h1>
          <p className="text-default-500">Track and manage your deliveries efficiently.</p>
        </div>
        <div className="flex gap-4">
          <div className="mt-4 text-center">
            {!admin ? (
              <Skeleton className="h-10 w-32 rounded-xl" />
            ) : (
              <Button
                color="primary"
                variant="shadow"
                onPress={handleNewDelivery}
              >
                <Icon icon="mdi:plus" className="mr-2" />
                New Delivery
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col xl:flex-row gap-4">
        {/* Left side: Delivery List */}
        <div className={`xl:w-1/3 shadow-xl shadow-primary/10 
          xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
          xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
          border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
        >
          <div className="flex flex-col h-full">
            <div className="p-4 sticky top-0 z-20 bg-background/80 border-b border-default-200 backdrop-blur-lg shadow-sm">
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Delivery Items</h2>
              {!admin ? (
                <Skeleton className="h-10 w-full rounded-xl" />
              ) : (
                <Input
                  placeholder="Search deliveries..."
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
                <div className="space-y-4 p-4 mt-1 pt-32 h-full relative">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="w-full min-h-28 rounded-xl" />
                  ))}
                  <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                  <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Spinner />
                  </div>
                </div>
              ) : !isLoadingItems && deliveryItems.length !== 0 ? (
                <Listbox
                  classNames={{ list: 'space-y-4 p-3 overflow-y-auto pt-32', base: 'xl:h-full h-[42rem]' }}
                  onSelectionChange={(item) => handleSelectDelivery((item as Set<string>).values().next().value || "")}
                  selectedKeys={[selectedDeliveryId || ""]}
                  selectionMode="single">
                  {deliveryItems.map((delivery) => (
                    <ListboxItem
                      key={delivery.uuid}
                      as={Button}
                      onPress={() => handleSelectDelivery(delivery.uuid)}
                      variant="shadow"
                      className={`w-full min-h-28 !transition-all duration-200 rounded-xl px-0 py-4 ${selectedDeliveryId === delivery.uuid ?
                        '!bg-primary hover:!bg-primary-400 !shadow-lg hover:!shadow-md hover:!shadow-primary-200 !shadow-primary-200' :
                        '!bg-default-100/50 hover:!bg-default-200 !shadow-2xs hover:!shadow-md hover:!shadow-default-200 !shadow-default-200'}`}
                      hideSelectedIcon
                    >
                      <div className="flex justify-between items-start px-0">
                        <div className="flex-1">
                          <div className="flex items-center justify-between px-4">
                            <span className="font-semibold">{delivery.inventory_item?.item_name || "Unknown Item"}</span>
                            <Chip color="default" variant={selectedDeliveryId === delivery.uuid ? "shadow" : "flat"} size="sm">
                              {delivery.inventory_item?.item_code || "N/A"}
                            </Chip>
                          </div>
                          <p className={`text-sm px-4 ${selectedDeliveryId === delivery.uuid ? 'text-default-800' : 'text-default-600'} line-clamp-1 text-start`}>
                            To: {delivery.recipient_name}
                          </p>
                          <div className={`flex items-center gap-2 mt-3 border-t ${selectedDeliveryId === delivery.uuid ? 'border-primary-300' : 'border-default-100'} px-4 pt-4`}>
                            <Chip color={getStatusColor(delivery.status)} variant={selectedDeliveryId === delivery.uuid ? "shadow" : "flat"} size="sm">
                              {delivery.status}
                            </Chip>
                            <Chip color="secondary" variant={selectedDeliveryId === delivery.uuid ? "shadow" : "flat"} size="sm">
                              {new Date(delivery.delivery_date).toLocaleDateString()}
                            </Chip>
                            <Chip color="success" variant={selectedDeliveryId === delivery.uuid ? "shadow" : "flat"} size="sm">
                              Qty: {delivery.quantity}
                            </Chip>
                          </div>
                        </div>
                      </div>
                    </ListboxItem>
                  ))}
                </Listbox>
              ) : null}


              {admin && !isLoadingItems && deliveryItems.length === 0 && (
                <div className="xl:h-full h-[42rem] absolute w-full">
                  <div className="py-4 flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Icon icon="heroicons:truck-solid" className="text-5xl text-default-300" />
                    <p className="text-default-500 mt-2">No deliveries found</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Delivery Form */}
        <div className="xl:w-2/3">
          <Form id="deliveryForm" onSubmit={handleSubmit} className="items-stretch space-y-4">
            <CardList>
              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Delivery Information</h2>
                <div className="space-y-4">
                  {!admin ? (
                    <Skeleton className="h-16 w-full rounded-xl" />
                  ) : (
                    <Select
                      name="inventory_item_uuid"
                      label="Inventory Item"
                      placeholder="Select an inventory item"
                      selectedKeys={[selectedItem]}
                      onChange={handleInventoryItemChange}
                      isRequired
                      classNames={{ trigger: inputStyle.inputWrapper }}
                      isInvalid={!!errors.inventory_item_uuid}
                      errorMessage={errors.inventory_item_uuid}
                      isDisabled={!!selectedDeliveryId}
                      startContent={<Icon icon="mdi:package-variant" className="text-default-500" />}
                    >
                      {inventoryItems
                        .filter(item => item.status !== "DELIVERED") // Only show items that haven't been delivered
                        .map((item) => (
                          <SelectItem key={item.uuid}>
                            {item.item_name} ({item.item_code}) - {item.quantity} {item.unit}
                          </SelectItem>
                        ))}
                    </Select>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {!admin ? (
                      <>
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </>
                    ) : (
                      <>
                        <Input
                          name="recipient_name"
                          label="Recipient Name"
                          classNames={inputStyle}
                          placeholder="Enter recipient name"
                          value={formData.recipient_name || ""}
                          onChange={handleInputChange}
                          isRequired
                          isInvalid={!!errors.recipient_name}
                          errorMessage={errors.recipient_name}
                          startContent={<Icon icon="mdi:account" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <Input
                          name="recipient_contact"
                          label="Contact Information"
                          classNames={inputStyle}
                          placeholder="Phone number or email"
                          value={formData.recipient_contact || ""}
                          onChange={handleInputChange}
                          isRequired
                          isInvalid={!!errors.recipient_contact}
                          errorMessage={errors.recipient_contact}
                          startContent={<Icon icon="mdi:phone" className="text-default-500 pb-[0.1rem]" />}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Delivery Details</h2>
                <div className="space-y-4">
                  {!admin ? (
                    <Skeleton className="h-16 w-full rounded-xl" />
                  ) : (
                    <Textarea
                      name="delivery_address"
                      label="Delivery Address"
                      classNames={inputStyle}
                      placeholder="Enter complete delivery address"
                      value={formData.delivery_address || ""}
                      onChange={handleInputChange}
                      isRequired
                      isInvalid={!!errors.delivery_address}
                      errorMessage={errors.delivery_address}
                      maxRows={3}
                      minRows={1}
                    />
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {!admin ? (
                      <>
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </>
                    ) : (
                      <>
                        <NumberInput
                          name="quantity"
                          classNames={inputStyle}
                          label="Quantity"
                          placeholder="1"
                          minValue={1}
                          maxValue={
                            // Maximum is the available quantity of the selected inventory item
                            selectedItem ?
                              inventoryItems.find(item => item.uuid === selectedItem)?.quantity || 999999
                              : 999999
                          }
                          step={1}
                          value={formData.quantity || 1}
                          onValueChange={(e) => setFormData({ ...formData, quantity: e })}
                          isRequired
                          isInvalid={!!errors.quantity}
                          errorMessage={errors.quantity}
                          startContent={<Icon icon="mdi:numeric" className="text-default-500 pb-[0.1rem]" />}
                        />

                        <Input
                          name="delivery_date"
                          label="Delivery Date"
                          type="date"
                          classNames={inputStyle}
                          value={formData.delivery_date || format(new Date(), "yyyy-MM-dd")}
                          onChange={handleInputChange}
                          isRequired
                          isInvalid={!!errors.delivery_date}
                          errorMessage={errors.delivery_date}
                          startContent={<Icon icon="mdi:calendar" className="text-default-500 pb-[0.1rem]" />}
                        />
                      </>
                    )}
                  </div>

                  {!admin ? (
                    <Skeleton className="h-16 w-full rounded-xl" />
                  ) : (
                    <Textarea
                      name="notes"
                      label="Additional Notes"
                      classNames={inputStyle}
                      placeholder="Add any special instructions or notes (optional)"
                      value={formData.notes || ""}
                      onChange={handleInputChange}
                      maxRows={3}
                      minRows={1}
                    />
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Delivery Status</h2>
                <div className="space-y-4">
                  {!admin ? (
                    <Skeleton className="h-16 w-full rounded-xl" />
                  ) : (
                    <Select
                      name="status"
                      label="Status"
                      placeholder="Select status"
                      selectedKeys={[formData.status || "PENDING"]}
                      onChange={handleInputChange}
                      isRequired
                      classNames={{ trigger: inputStyle.inputWrapper }}
                      isInvalid={!!errors.status}
                      errorMessage={errors.status}
                      startContent={<Icon icon="mdi:truck-delivery" className="text-default-500" />}
                    >
                      <SelectItem key="PENDING">PENDING</SelectItem>
                      <SelectItem key="PROCESSING">PROCESSING</SelectItem>
                      <SelectItem key="IN_TRANSIT">IN TRANSIT</SelectItem>
                      <SelectItem key="DELIVERED">DELIVERED</SelectItem>
                      <SelectItem key="CANCELLED">CANCELLED</SelectItem>
                    </Select>
                  )}
                </div>
              </div>

              <div className="flex flex-col md:flex-row justify-center items-center gap-4">
                {!admin ? (
                  <Skeleton className="h-10 w-full rounded-xl" />
                ) : (
                  <>
                    {selectedDeliveryId && (
                      <Button
                        color="secondary"
                        variant="shadow"
                        className="w-full"
                        onPress={() => setShowQrCode(true)}
                      >
                        <Icon icon="mdi:qrcode" className="mr-1" />
                        Show Delivery QR
                      </Button>
                    )}
                    <Button
                      type="submit"
                      form="deliveryForm"
                      color="primary"
                      variant="shadow"
                      className="w-full"
                      isLoading={isLoading}
                    >
                      <Icon icon="mdi:content-save" className="mr-1" />
                      {selectedDeliveryId ? "Update Delivery" : "Create Delivery"}
                    </Button>
                  </>
                )}
              </div>

              {admin && selectedDeliveryId && (
                <div className="flex flex-col gap-4">
                  <hr className="border-default-200" />
                  <h3 className="text-lg font-semibold w-full text-center">Quick Status Update</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Button
                      color="warning"
                      variant="flat"
                      className="w-full"
                      isDisabled={formData.status === "PROCESSING" || isLoading}
                      onPress={() => handleStatusChange("PROCESSING")}
                    >
                      <Icon icon="mdi:clock-start" className="mr-1" />
                      Processing
                    </Button>
                    <Button
                      color="primary"
                      variant="flat"
                      className="w-full"
                      isDisabled={formData.status === "IN_TRANSIT" || isLoading}
                      onPress={() => handleStatusChange("IN_TRANSIT")}
                    >
                      <Icon icon="mdi:truck-fast" className="mr-1" />
                      In Transit
                    </Button>
                    <Button
                      color="success"
                      variant="flat"
                      className="w-full"
                      isDisabled={formData.status === "DELIVERED" || isLoading}
                      onPress={() => handleStatusChange("DELIVERED")}
                    >
                      <Icon icon="mdi:check-circle" className="mr-1" />
                      Delivered
                    </Button>
                    <Button
                      color="danger"
                      variant="flat"
                      className="w-full"
                      isDisabled={formData.status === "CANCELLED" || isLoading}
                      onPress={() => handleStatusChange("CANCELLED")}
                    >
                      <Icon icon="mdi:cancel" className="mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardList>
          </Form>
        </div>
      </div>

      {/* QR Code Modal */}
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
          <ModalHeader>Delivery QR Code</ModalHeader>
          <ModalBody className="flex flex-col items-center">
            <div className="bg-white rounded-xl overflow-hidden">
              <QRCodeCanvas
                id="delivery-qrcode"
                value={generateDeliveryJson()}
                size={320}
                marginSize={4}
                level="L"
              />
            </div>
            <p className="text-center mt-4 text-default-600">
              Scan this code to get delivery details
            </p>
            <div className="mt-4 w-full bg-default-100 rounded-lg overflow-auto max-h-48">
              <SyntaxHighlighter
                language="json"
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  backgroundColor: 'var(--heroui-default-100)',
                }}
              >
                {generateDeliveryJson(2)}
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
                // Save QR code as image
                const canvas = document.getElementById('delivery-qrcode') as HTMLCanvasElement;
                const pngUrl = canvas.toDataURL('image/png');
                const downloadLink = document.createElement('a');
                downloadLink.href = pngUrl;
                downloadLink.download = `delivery-${selectedDeliveryId}.png`;
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
    </div>
  );
}

// Helper function to determine chip color based on status
function getStatusColor(status: string): "default" | "primary" | "secondary" | "success" | "warning" | "danger" {
  switch (status) {
    case "PENDING":
      return "warning";
    case "PROCESSING":
      return "secondary";
    case "IN_TRANSIT":
      return "primary";
    case "DELIVERED":
      return "success";
    case "CANCELLED":
      return "danger";
    default:
      return "default";
  }
}