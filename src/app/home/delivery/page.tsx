"use client";

import { motionTransition } from '@/utils/anim';
import { createClient } from "@/utils/supabase/client";
import {
  Button,
  Chip,
  DatePicker,
  Input,
  Listbox,
  ListboxItem,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Autocomplete,
  AutocompleteItem,
  Skeleton,
  Form,
  Spinner,
  Switch,
  Textarea,
  useDisclosure,
} from "@heroui/react";
import { Icon } from "@iconify-icon/react";
import { getLocalTimeZone, parseDate, today } from '@internationalized/date';
import { format } from "date-fns";
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from 'qrcode.react';
import { useEffect, useRef, useState } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';


// Import server actions
import {
  checkAdminStatus,
  createDeliveryItem,
  getDeliveryItems,
  getInventoryItems,
  getOperators,
  getWarehouses,
  updateDeliveryItem,
  updateInventoryItemStatus,
} from "./actions";
import CardList from '@/components/card-list';

// Import the QR code scanner library
import jsQR from "jsqr";

interface DeliveryItem {
  uuid: string;
  admin_uuid: string | null;
  company_uuid: string | null;
  inventory_item_uuid: string | null;
  warehouse_uuid: string | null; // New field for warehouse
  delivery_address: string;
  delivery_date: string;
  notes: string;
  status: string;
  operator_uuid?: string; // New field for operator assignment
  recipient_name?: string;
  recipient_contact?: string;
  created_at?: string;
  updated_at?: string;
}

interface InventoryItem {
  uuid: string;
  item_code: string;
  item_name: string;
  quantity: number;
  unit: string;
  location_code: string;
  status: string;
}

interface Operator {
  uuid: string;
  email: string;
  full_name: string;
  phone_number: string;
}

interface Address {
  code: string;
  desc: string;
}


interface Warehouse {
  uuid: string;
  name: string;
  address: {
    region: Address;
    province: Address;
    municipality: Address;
    barangay: Address;
    streetAddress: string;
    postalCode: number;
    fullAddress: string;
  }
}

export default function DeliveryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [admin, setAdmin] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [showQrCode, setShowQrCode] = useState(false);
  const [showAcceptForm, setShowAcceptForm] = useState(false);

  // Delivery list state
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Available inventory items for delivery
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string>("");

  // Operator assignment
  const [operators, setOperators] = useState<Operator[]>([]);
  const [assignOperator, setAssignOperator] = useState<boolean>(false);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);

  // QR Code generation
  const [showAcceptDeliveryModal, setShowAcceptDeliveryModal] = useState(false);
  const [deliveryJson, setDeliveryJson] = useState("");
  const [jsonValidationError, setJsonValidationError] = useState("");
  const [jsonValidationSuccess, setJsonValidationSuccess] = useState(false);


  // Warehouse options
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form state
  const [formData, setFormData] = useState<Partial<DeliveryItem>>({
    company_uuid: null,
    admin_uuid: null,
    inventory_item_uuid: null,
    warehouse_uuid: null,
    delivery_address: "",
    delivery_date: format(new Date(), "yyyy-MM-dd"),
    notes: "",
    status: "PENDING",
  });

  // Add this ref at the top with your other refs
  const deliveryJsonTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Add this useEffect to focus on the textarea when modal opens
  useEffect(() => {
    if (showAcceptDeliveryModal && deliveryJsonTextareaRef.current) {
      // Short timeout to ensure the modal is rendered before focusing
      setTimeout(() => {
        deliveryJsonTextareaRef.current?.focus();
      }, 100);
    }
  }, [showAcceptDeliveryModal]);

  const handleDeliveryJsonValidation = async (jsonData = deliveryJson) => {
    // Reset states
    setJsonValidationError("");
    setJsonValidationSuccess(false);
    setIsLoading(true);

    try {
      // Parse the entered JSON
      const parsedJson = JSON.parse(jsonData.trim());

      // Find the delivery that matches this JSON
      const matchingDelivery = deliveryItems.find(
        delivery => delivery.uuid === parsedJson.uuid
      );

      if (!matchingDelivery) {
        setJsonValidationError("No matching delivery found with this code");
        setIsLoading(false);
        return;
      }

      // Check if the delivery status is IN_TRANSIT
      if (matchingDelivery.status !== "IN_TRANSIT") {
        setJsonValidationError("This delivery cannot be accepted because it is not in transit");
        setIsLoading(false);
        return;
      }

      // If the operator is assigned to this delivery, select it
      if (matchingDelivery.operator_uuid === admin?.uuid || matchingDelivery.operator_uuid === null) {
        // Set as the selected delivery
        handleSelectDelivery(matchingDelivery.uuid);

        console.log("Selected Delivery:", matchingDelivery);

        // Update the form data with the delivery details
        setFormData({ ...matchingDelivery, status: "DELIVERED" });

        // Directly update the delivery status without using handleStatusChange
        const updatedFormData = { status: "DELIVERED" };
        const result = await updateDeliveryItem(matchingDelivery.uuid, updatedFormData);

        if (result.success && matchingDelivery.inventory_item_uuid) {
          // Change status to IN_WAREHOUSE when delivery is DELIVERED
          console.log("Updating inventory item status to IN_WAREHOUSE");

          const inventoryResult = await updateInventoryItemStatus(
            matchingDelivery.inventory_item_uuid,
            "IN_WAREHOUSE"
          );

          console.log("Inventory status update result:", inventoryResult);

          if (inventoryResult.success) {
            setJsonValidationSuccess(true);

            // Wait for a moment before closing the modal
            setTimeout(() => {
              setShowAcceptDeliveryModal(false);
              setJsonValidationSuccess(false);
              setDeliveryJson("");
            }, 1000);

            // Refresh delivery items to show updated status
            const refreshedItems = await getDeliveryItems(admin?.company_uuid);
            setDeliveryItems(refreshedItems.data || []);
          } else {
            console.error("Failed to update inventory status:", inventoryResult.error);
            setJsonValidationError("Delivery accepted but failed to update inventory status");
          }
        }
      } else {
        setJsonValidationError("You are not assigned to this delivery");
      }
    } catch (error) {
      console.error("Error parsing delivery JSON:", error);
      setJsonValidationError("Invalid delivery code format");
    } finally {
      setIsLoading(false);
    }
  };

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  const autoCompleteStyle = { classNames: inputStyle }

  // Generate JSON for QR code
  const generateDeliveryJson = (space: number = 0) => {
    if (!selectedDeliveryId || !formData) return "{}";

    // Only include specified keys
    const output: Record<string, any> = {};

    const keys: Array<keyof DeliveryItem> = [
      "uuid",
      "company_uuid",
      "inventory_item_uuid",
      "delivery_address",
      "delivery_date",
      "warehouse_uuid",
    ];

    keys.forEach((key) => {
      const value = (formData as any)[key];
      if (value !== undefined && value !== null && value !== "") {
        output[key] = value;
      }
    });

    // Include operator_uuid if assigned
    if (formData.operator_uuid) {
      output.operator_uuid = formData.operator_uuid;
    }

    return JSON.stringify(output, null, space);
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

  // Handle inventory item selection
  const handleInventoryItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const inventoryItemUuid = e.target.value;
    setSelectedItem(inventoryItemUuid);

    // Find the selected inventory item
    const item = inventoryItems.find(item => item.uuid === inventoryItemUuid);

    setFormData(prev => ({
      ...prev,
      inventory_item_uuid: inventoryItemUuid,
      // Pre-populate warehouse based on the inventory item's location if possible
      // This would require your inventory items to have warehouse information
    }));
  };

  // Handle operator assignment toggle
  const handleAssignOperatorToggle = (checked: boolean) => {
    setAssignOperator(checked);

    if (checked) {
      // Keep existing operator_uuid if toggling back on
    } else {
      // Clear recipient info and operator_uuid if toggling off
      // Remove operator_uuid, recipient_name, and recipient_contact from formData
      setFormData(prev => {
        const { operator_uuid, recipient_name, recipient_contact, ...rest } = prev;
        return {
          ...rest
        };
      });
      setSelectedOperator(null);
    }
  };

  const handleViewInventory = () => {
    if (formData.inventory_item_uuid) {
      // Navigate to inventory page with the item ID
      router.push(`/home/inventory?itemId=${formData.inventory_item_uuid}`);
    }
  };

  // Handle operator selection
  const handleOperatorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const operatorUuid = e.target.value;
    const operator = operators.find(op => op.uuid === operatorUuid);

    setFormData(prev => ({
      ...prev,
      operator_uuid: operatorUuid
    }));

    setSelectedOperator(operator || null);
  };

  // Handle creating a new delivery
  const handleNewDelivery = () => {
    // Clear the URL parameter
    const params = new URLSearchParams(searchParams.toString());
    params.delete("deliveryId");
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle status change
  const handleStatusChange = async (status: string) => {
    if (!selectedDeliveryId) return { error: "No delivery selected" };

    // For operators, only allow changing to DELIVERED status when item is IN_TRANSIT
    if (!admin?.is_admin) {
      if (formData.status !== "IN_TRANSIT" || status !== "DELIVERED") {
        return { error: "You can only change the status to DELIVERED when the item is IN_TRANSIT." };
      }
    }

    setIsLoading(true);

    try {
      // Update form data with the new status
      const { inventory_item, ...filteredFormData } = formData as any;
      const updatedFormData = { ...filteredFormData, status };
      setFormData(updatedFormData);

      // Update the delivery item with the new status
      const result = await updateDeliveryItem(selectedDeliveryId, updatedFormData as any);

      // Update inventory item status as well
      if (updatedFormData.inventory_item_uuid) {
        // Determine the inventory status based on delivery status
        let inventoryStatus: string;
        if (status === "DELIVERED") {
          inventoryStatus = "IN_WAREHOUSE";
        } else if (status === "CANCELLED") {
          inventoryStatus = "AVAILABLE";
        } else if (status === "IN_TRANSIT") {
          inventoryStatus = "ON_DELIVERY";
        } else {
          inventoryStatus = status;
        }

        const inventoryResult = await updateInventoryItemStatus(updatedFormData.inventory_item_uuid, inventoryStatus);

        console.log("Inventory status update result:", inventoryResult);

        if (!inventoryResult.success) {
          return { error: "Failed to update inventory item status" };
        }
      }

      // Refresh the delivery items list
      const refreshedItems = await getDeliveryItems(admin?.company_uuid || "", searchQuery);
      setDeliveryItems(refreshedItems.data || []);

      return { error: null };
    } catch (error) {
      console.error("Error updating status:", error);
      return { error: `Failed to update status: ${(error as Error).message}` };
    } finally {
      setIsLoading(false);
    }
  };

  // Handle selecting a delivery
  const handleSelectDelivery = (deliveryId: string) => {
    // Update the URL with the selected delivery ID without reloading the page
    const params = new URLSearchParams(searchParams.toString());
    params.set("deliveryId", deliveryId);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle form changes
  const handleAutoSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));

    // If operator is selected, auto-populate recipient fields
    if (name === "operator_uuid" && value) {
      const selectedOperator = operators.find(op => op.uuid === value);
      if (selectedOperator) {
        // Set the selected operator state
        setSelectedOperator(selectedOperator);

        // Auto-populate recipient name and contact with operator details
        setFormData(prev => ({
          ...prev,
          recipient_name: selectedOperator.full_name,
          recipient_contact: selectedOperator.phone_number // Assuming email is the contact, update if you have phone field
        }));
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Only allow admins to submit form changes
    if (!admin?.is_admin) {
      return;
    }

    const newErrors: Record<string, string> = {};
    if (!formData.inventory_item_uuid) newErrors.inventory_item_uuid = "Please select an inventory item";
    if (!formData.delivery_address) newErrors.delivery_address = "Delivery address is required";
    if (!formData.delivery_date) newErrors.delivery_date = "Delivery date is required";
    if (!formData.warehouse_uuid) newErrors.warehouse_uuid = "Please select a warehouse";
    if (assignOperator) {
      if (!formData.operator_uuid) newErrors.operator_uuid = "Please select an operator";
      if (!formData.recipient_name) newErrors.recipient_name = "Recipient name is required when assigning an operator";
      if (!formData.recipient_contact) newErrors.recipient_contact = "Recipient contact is required when assigning an operator";
    } else {
      // Clear recipient details if not assigning an operator
      setFormData(prev => {
        const { operator_uuid, recipient_name, recipient_contact, ...rest } = prev;
        return {
          ...rest
        };
      });
    }

    console.log("Form Data:", formData);

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      let result;
      const newData = {
        admin_uuid: admin.uuid,
        company_uuid: admin.company_uuid,
        inventory_item_uuid: formData.inventory_item_uuid,
        warehouse_uuid: formData.warehouse_uuid,
        delivery_address: formData.delivery_address,
        delivery_date: formData.delivery_date,
        notes: formData.notes,
        status: formData.status,
        ...(assignOperator ?
          {
            operator_uuid: formData.operator_uuid,
            recipient_name: formData.recipient_name,
            recipient_contact: formData.recipient_contact,
          } : {}),
      };

      if (selectedDeliveryId) {
        // Update existing delivery
        result = await updateDeliveryItem(selectedDeliveryId, newData);

        // Update inventory item status to match delivery status
        if (result.success && formData.status) {
          // Set inventory status to ON_DELIVERY when delivery status is IN_TRANSIT
          const inventoryStatus = formData.status === "IN_TRANSIT" ? "ON_DELIVERY" : formData.status;
          await updateInventoryItemStatus(formData.inventory_item_uuid as string, inventoryStatus);
        }
      } else {
        // Create new delivery
        result = await createDeliveryItem(newData as any);

        // Update inventory item status to match delivery status
        if (result.success && formData.inventory_item_uuid && formData.status) {
          // Set inventory status to ON_DELIVERY when delivery status is IN_TRANSIT
          const inventoryStatus = formData.status === "IN_TRANSIT" ? "ON_DELIVERY" : formData.status;
          await updateInventoryItemStatus(formData.inventory_item_uuid, inventoryStatus);
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
        alert(`Failed to ${selectedDeliveryId ? 'update' : 'create'} delivery. Please try again.`);
      }
    } catch (error) {
      console.error(`Error ${selectedDeliveryId ? 'updating' : 'creating'} delivery:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  // Effect to handle URL params (deliveryId and setInventory)
  useEffect(() => {
    if (!admin?.company_uuid || isLoadingItems) return;

    // Check if we have a deliveryId in the URL
    const deliveryId = searchParams.get("deliveryId");

    // Check if we're adding an inventory item to a new delivery
    const setInventoryId = searchParams.get("setInventory");

    if (deliveryId) {
      // Set selected delivery from URL
      setSelectedDeliveryId(deliveryId);

      // Find the delivery in the list
      const delivery = deliveryItems.find(d => d.uuid === deliveryId);
      if (!delivery) return;

      // Set the form data
      setFormData({ ...delivery });
      setSelectedItem(delivery.inventory_item_uuid || "");

      // Check if there's an operator assigned
      const hasOperator = !!delivery.operator_uuid;
      setAssignOperator(hasOperator);

      if (hasOperator && delivery.operator_uuid) {
        const operator = operators.find(op => op.uuid === delivery.operator_uuid);
        setSelectedOperator(operator || null);
      } else {
        setSelectedOperator(null);
      }

    } else if (setInventoryId) {
      // First check if there's already a delivery for this inventory item
      const existingDelivery = deliveryItems.find(item => item.inventory_item_uuid === setInventoryId);

      if (existingDelivery) {
        // If delivery exists for this inventory item, select it
        setSelectedDeliveryId(existingDelivery.uuid);
        setFormData({ ...existingDelivery });
        setSelectedItem(existingDelivery.inventory_item_uuid || "");

        // Check if there's an operator assigned
        const hasOperator = !!existingDelivery.operator_uuid;
        setAssignOperator(hasOperator);

        if (hasOperator && existingDelivery.operator_uuid) {
          const operator = operators.find(op => op.uuid === existingDelivery.operator_uuid);
          setSelectedOperator(operator || null);
        } else {
          setSelectedOperator(null);
        }

        // Update URL with the found delivery ID
        const params = new URLSearchParams(searchParams.toString());
        params.delete("setInventory");
        params.set("deliveryId", existingDelivery.uuid);
        router.push(`?${params.toString()}`, { scroll: false });
      } else {
        // Creating a new delivery with pre-selected inventory item
        setSelectedDeliveryId(null);

        // Find the inventory item
        const inventoryItem = inventoryItems.find(item => item.uuid === setInventoryId);
        if (!inventoryItem) return;

        // Set up the form with the selected inventory item
        setFormData({
          company_uuid: admin.company_uuid,
          admin_uuid: admin.uuid,
          inventory_item_uuid: setInventoryId,
          delivery_address: "",
          delivery_date: today(getLocalTimeZone()).toString(),
          notes: "",
          status: "PENDING",
          warehouse_uuid: null
        });

        setSelectedItem(setInventoryId);
        setAssignOperator(false);
        setSelectedOperator(null);
      }
    } else {
      // Reset form for new delivery
      setSelectedDeliveryId(null);
      setFormData({
        company_uuid: admin.company_uuid,
        admin_uuid: admin.uuid,
        inventory_item_uuid: null,
        delivery_address: "",
        delivery_date: format(new Date(), "yyyy-MM-dd"),
        notes: "",
        status: "PENDING",
        warehouse_uuid: null
      });
      setSelectedItem("");
      setAssignOperator(false);
      setSelectedOperator(null);
    }
  }, [searchParams, admin?.company_uuid, isLoadingItems, deliveryItems, inventoryItems, operators]);

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

        // Fetch operators (users with isAdmin = false)
        const operatorsResult = await getOperators(adminData.company_uuid);
        setOperators(operatorsResult.data || []);

        // Fetch warehouses
        const warehousesResult = await getWarehouses(adminData.company_uuid);
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

  // Helper function to determine chip color based on status
  function getStatusColor(status: string): "default" | "primary" | "secondary" | "success" | "warning" | "danger" {
    switch (status?.toUpperCase()) {
      case "PENDING": return "primary";
      case "PROCESSING": return "warning";
      case "IN_TRANSIT": return "secondary";
      case "DELIVERED": return "success";
      case "CANCELLED": return "danger";
      default: return "default";
    }
  }

  // Add these new state variables
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New function to handle QR code image upload and scanning
  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);

    try {
      // Create an image from the file
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        // Create canvas to process the image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          setJsonValidationError("Failed to process image");
          setIsProcessingImage(false);
          URL.revokeObjectURL(objectUrl);
          return;
        }

        // Set canvas size to match image
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0);

        // Get image data for QR processing
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Process with jsQR
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          // Set the extracted data to the textarea
          setDeliveryJson(code.data);

          // Automatically validate the code
          setTimeout(() => {
            handleDeliveryJsonValidation(code.data);
          }, 300);
        } else {
          setJsonValidationError("No QR code found in the image");
        }

        setIsProcessingImage(false);
        URL.revokeObjectURL(objectUrl);
      };

      img.onerror = () => {
        setJsonValidationError("Failed to load image");
        setIsProcessingImage(false);
        URL.revokeObjectURL(objectUrl);
      };

      img.src = objectUrl;
    } catch (error) {
      console.error("Error processing QR image:", error);
      setJsonValidationError("Failed to process the uploaded image");
      setIsProcessingImage(false);
    }
  };

  // Function to automatically validate when text is pasted
  const handleDeliveryJsonPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');

    if (pastedText.trim()) {
      // Set the pasted text
      setDeliveryJson(pastedText);

      // Wait for state to update then validate
      setTimeout(() => {
        handleDeliveryJsonValidation(pastedText);
      }, 100);
    }
  };

  return (
    <div className="container mx-auto p-2 max-w-4xl">
      <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
        <div className="flex flex-col w-full xl:text-left text-center">
          <h1 className="text-2xl font-bold">Delivery Management</h1>
          {(isLoading || isLoadingItems) ? (
            <div className="text-default-500 flex items-center">
              <p className='my-auto mr-1'>Loading delivery data</p>
              <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
            </div>
          ) : (
            <p className="text-default-500">Track and manage your deliveries efficiently.</p>
          )}
        </div>
        <div className="flex gap-4">
          <div className="mt-4 text-center">
            {!admin ? (
              <Skeleton className="h-10 w-32 rounded-xl" />
            ) : admin.is_admin ? (
              <Button
                color="primary"
                variant="shadow"
                onPress={handleNewDelivery}
              >
                <Icon icon="mdi:plus" className="mr-2" />
                New Delivery
              </Button>
            ) : selectedDeliveryId ? (
              <Button
                color="primary"
                variant="shadow"
                onPress={() => setShowAcceptDeliveryModal(true)}
              >
                <Icon icon="mdi:qrcode-scan" className="mr-1" />
                Accept Delivery
              </Button>
            ) : null}
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
                <div
                  className='space-y-4 p-4 overflow-y-auto pt-[8.25rem] xl:h-full h-[42rem]'>
                  {deliveryItems.map((delivery) => (
                    <Button
                      key={delivery.uuid}
                      onPress={() => handleSelectDelivery(delivery.uuid)}
                      variant="shadow"
                      className={`w-full min-h-28 !transition-all duration-200 rounded-xl px-0 py-4 ${selectedDeliveryId === delivery.uuid ?
                        '!bg-primary hover:!bg-primary-400 !shadow-lg hover:!shadow-md hover:!shadow-primary-200 !shadow-primary-200' :
                        '!bg-default-100/50 shadow-none hover:!bg-default-200 !shadow-2xs hover:!shadow-md hover:!shadow-default-200 !shadow-default-200'}`}
                    >
                      <div className="w-full flex justify-between items-start px-0">
                        <div className="flex-1">
                          <div className="flex items-center justify-between px-4">
                            <span className="font-semibold">
                              {inventoryItems.find(i => i.uuid === delivery.inventory_item_uuid)?.item_name || 'Unknown Item'}
                            </span>
                            <Chip color="default" variant={selectedDeliveryId === delivery.uuid ? "shadow" : "flat"} size="sm">
                              {inventoryItems.find(i => i.uuid === delivery.inventory_item_uuid)?.item_code || 'N/A'}
                            </Chip>
                          </div>
                          {delivery.recipient_name && (
                            <p className={`text-sm px-4 ${selectedDeliveryId === delivery.uuid ? 'text-default-800 ' : 'text-default-600'} line-clamp-1 text-start`}>
                              To: {delivery.recipient_name}
                            </p>
                          )}
                          <div className={`flex items-center gap-2 mt-3 border-t ${selectedDeliveryId === delivery.uuid ? 'border-primary-300' : 'border-default-100'} px-4 pt-4`}>
                            <Chip color={getStatusColor(delivery.status)} variant={selectedDeliveryId === delivery.uuid ? "shadow" : "flat"} size="sm">
                              {delivery.status}
                            </Chip>
                            <Chip color="default" variant={selectedDeliveryId === delivery.uuid ? "shadow" : "flat"} size="sm">
                              {new Date(delivery.delivery_date).toLocaleDateString()}
                            </Chip>
                            {delivery.operator_uuid && (
                              <Chip color="success" variant={selectedDeliveryId === delivery.uuid ? "shadow" : "flat"} size="sm">
                                <Icon icon="mdi:account" className="mr-1" />
                                {operators.find(op => op.uuid === delivery.operator_uuid)?.full_name.split(' ')[0] || 'Operator'}
                              </Chip>
                            )}
                          </div>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              ) : null}

              {admin && !isLoadingItems && deliveryItems.length === 0 && (
                <div className="xl:h-full h-[42rem] absolute w-full">
                  <div className="py-4 flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Icon icon="fluent:box-dismiss-20-filled" className="text-5xl text-default-300" />
                    <p className="text-default-500 mt-2">No deliveries found</p>
                    <Button color="primary" variant="light" size="sm" className="mt-4" onPress={handleNewDelivery}>
                      Create New Delivery
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Delivery Form */}
        <div className="xl:w-2/3">
          {/* Only show the form if admin is creating new delivery or any user has selected a delivery */}
          {admin === null || admin.is_admin ? (
            <Form id="deliveryForm" onSubmit={handleSubmit} className="items-stretch space-y-4">
              <CardList>
                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Delivery Information</h2>
                  <div className="space-y-4">
                    {/* Inventory Item Selection */}
                    <div>
                      {!admin ? (
                        <Skeleton className="h-16 w-full rounded-xl" />
                      ) : (
                        <Autocomplete
                          selectedKey={formData.inventory_item_uuid || ""}
                          name="inventory_item_uuid"
                          label="Inventory Item"
                          placeholder="Select an inventory item"
                          onSelectionChange={(e) => {
                            handleAutoSelectChange(`inventory_item_uuid`, `${e}`)
                            if (searchParams.get("setInventory")) {
                              // remove the setInventory query param
                              const params = new URLSearchParams(searchParams.toString());
                              params.delete("setInventory");
                              router.push(`?${params.toString()}`, { scroll: false });
                            }
                          }}
                          isRequired
                          inputProps={autoCompleteStyle}
                          classNames={{ clearButton: "text-default-800" }}
                          isInvalid={!!errors.inventory_item_uuid}
                          errorMessage={errors.inventory_item_uuid}
                          isDisabled={!!selectedDeliveryId}
                          startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                        >
                          {inventoryItems
                            .filter(item => item.status !== "DELIVERED" && item.status !== "ON_DELIVERY") // Only show available items
                            .map((item) => (
                              <AutocompleteItem key={item.uuid}>
                                {`${item.item_name} (${item.item_code})`}
                              </AutocompleteItem>
                            ))}
                        </Autocomplete>
                      )}
                    </div>

                    <div className="space-y-0">
                      {/* Operator Assignment Toggle */}
                      <div className="flex items-center justify-between">
                        {!admin ? (
                          <Skeleton className="h-10 w-full rounded-xl" />
                        ) : (
                          <>
                            <span className="text-default-700 font-medium">Assign Operator</span>
                            <Switch
                              isSelected={assignOperator}
                              onValueChange={handleAssignOperatorToggle}
                              color="primary"
                            />
                          </>
                        )}
                      </div>

                      {/* Operator Selection (shown only when assignOperator is true) */}
                      <AnimatePresence>
                        {assignOperator && (
                          <motion.div
                            {...motionTransition}>
                            {!admin ? (
                              <Skeleton className="h-16 w-full rounded-xl mt-4" />
                            ) : (
                              <Autocomplete
                                name="operator_uuid"
                                label="Select Operator"
                                placeholder="Choose an operator"
                                selectedKey={formData.operator_uuid || ""}
                                onSelectionChange={(e) => handleAutoSelectChange(`operator_uuid`, `${e}`)}
                                isRequired={assignOperator}
                                inputProps={autoCompleteStyle}
                                classNames={{ clearButton: "text-default-800" }}
                                isInvalid={!!errors.operator_uuid}
                                errorMessage={errors.operator_uuid}
                                startContent={<Icon icon="mdi:account" className="text-default-500 mb-[0.2rem]" />}
                                className='mt-4'
                              >
                                {operators.map((operator) => (
                                  <AutocompleteItem key={operator.uuid}>
                                    {`${operator.full_name} (${operator.email})`}
                                  </AutocompleteItem>
                                ))}
                              </Autocomplete>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                    </div>


                    {/* Warehouse Selection */}
                    <div>
                      {!admin ? (
                        <Skeleton className="h-16 w-full rounded-xl" />
                      ) : (
                        <Autocomplete
                          id="warehouse_uuid"
                          name="warehouse_uuid"
                          label="Warehouse"
                          isReadOnly={formData.status?.toUpperCase() === "DELIVERED"}
                          placeholder="Select warehouse"
                          selectedKey={formData.warehouse_uuid || ""}
                          onSelectionChange={(e) => {
                            handleAutoSelectChange(`warehouse_uuid`, `${e}`)
                            // get warehouse details
                            const selectedWarehouse = warehouses.find(w => w.uuid === e);
                            if (selectedWarehouse) {
                              setFormData(prev => ({
                                ...prev,
                                delivery_address: selectedWarehouse.address.fullAddress
                              }));
                            }
                          }}
                          isRequired
                          inputProps={autoCompleteStyle}
                          classNames={{ clearButton: "text-default-800" }}
                          isInvalid={!!errors.warehouse_uuid}
                          errorMessage={errors.warehouse_uuid}
                          startContent={<Icon icon="mdi:warehouse" className="text-default-500 mb-[0.2rem]" />}
                        >
                          {warehouses.map((warehouse) => (
                            <AutocompleteItem key={warehouse.uuid}>
                              {`${warehouse.name} (${warehouse.address.municipality.desc}, ${warehouse.address.barangay.desc})`}
                            </AutocompleteItem>
                          ))}
                        </Autocomplete>
                      )}
                    </div>

                    <div>
                      {!admin ? (
                        <Skeleton className="h-16 w-full rounded-xl" />
                      ) : (
                        <DatePicker
                          name="delivery_date"
                          label="Delivery Date"
                          defaultValue={formData.delivery_date ?
                            parseDate(formData.delivery_date) :
                            today(getLocalTimeZone())}
                          onChange={(date: any) => {
                            setFormData(prev => ({
                              ...prev,
                              delivery_date: date.toString()
                            }));
                          }}
                          isRequired
                          classNames={{
                            base: "w-full",
                            inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
                            selectorButton: "w-12 h-10 mb-4 mr-[-0.4rem]",
                          }}
                          isInvalid={!!errors.delivery_date}
                          errorMessage={errors.delivery_date}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div {...(!assignOperator ? { className: '!min-h-0 !p-0 !h-0 collapse border-none z-0' } : {})}>
                  {/* Recipient Details (shown only when assignOperator is true) */}
                  <AnimatePresence>
                    {assignOperator && (
                      <motion.div
                        {...motionTransition}>
                        <div>
                          <h2 className="text-xl font-semibold mb-4 w-full text-center">
                            Recipient Details
                          </h2>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
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
                                  isRequired={assignOperator}
                                  isInvalid={!!errors.recipient_name}
                                  errorMessage={errors.recipient_name}
                                  startContent={<Icon icon="mdi:account" className="text-default-500 mb-[0.2rem]" />}
                                />

                                <Input
                                  name="recipient_contact"
                                  label="Contact Number"
                                  classNames={inputStyle}
                                  placeholder="Enter contact number"
                                  value={formData.recipient_contact || ""}
                                  onChange={handleInputChange}
                                  isRequired={assignOperator}
                                  isInvalid={!!errors.recipient_contact}
                                  errorMessage={errors.recipient_contact}
                                  startContent={<Icon icon="mdi:phone" className="text-default-500 mb-[0.2rem]" />}
                                />
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">
                    Delivery Details
                  </h2>
                  <div className="space-y-4">
                    {/* Only show recipient details when an operator is assigned */}
                    {!admin ? (
                      <Skeleton className="h-16 w-full rounded-xl" />
                    ) : (
                      <Input
                        name="delivery_address"
                        label="Delivery Address"
                        classNames={inputStyle}
                        placeholder="Enter complete delivery address"
                        value={formData.delivery_address || ""}
                        onChange={handleInputChange}
                        isRequired
                        isReadOnly
                        isInvalid={!!errors.delivery_address}
                        errorMessage={errors.delivery_address}
                        startContent={<Icon icon="mdi:map-marker" className="text-default-500 mb-[0.2rem]" />}
                      />
                    )}

                    {!admin ? (
                      <Skeleton className="h-16 w-full rounded-xl" />
                    ) : (
                      <Textarea
                        name="notes"
                        label="Additional Notes"
                        maxRows={5}
                        minRows={1}
                        classNames={inputStyle}
                        placeholder="Enter any special instructions or notes"
                        value={formData.notes || ""}
                        onChange={handleInputChange}
                        startContent={<Icon icon="mdi:note-text" className="text-default-500 mt-[0.1rem]" />}
                      />
                    )}
                  </div>
                </div>

                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Delivery Status</h2>
                  <div>
                    {!admin ? (
                      <Skeleton className="h-16 w-full rounded-xl" />
                    ) : (
                      <Input
                        name="status"
                        label="Status"
                        placeholder="Status"
                        value={formData.status || "PENDING"}
                        isReadOnly={!selectedDeliveryId}  // Make it readonly when creating new delivery
                        classNames={inputStyle}
                        isRequired
                        isInvalid={!!errors.status}
                        errorMessage={errors.status}
                        startContent={<Icon icon="mdi:truck-delivery" className="text-default-500 mb-[0.2rem]" />}
                      />
                    )}

                    <AnimatePresence>
                      {admin && selectedDeliveryId && formData.status !== "DELIVERED" && formData.status !== "CANCELLED" && (
                        <motion.div
                          {...motionTransition}>
                          <div className="flex flex-col gap-4 pt-4">
                            <hr className="border-default-200" />
                            <h3 className="text-lg font-semibold w-full text-center">Quick Status Update</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              <Button
                                color="warning"
                                variant="flat"
                                className="w-full"
                                isDisabled={formData.status === "PROCESSING" || formData.status === "IN_TRANSIT" || formData.status === "DELIVERED" || formData.status === "CANCELLED" || isLoading}
                                onPress={() => handleStatusChange("PROCESSING")}
                              >
                                <Icon icon="mdi:clock-start" className="mr-1" />
                                Processing
                              </Button>
                              <Button
                                color="primary"
                                variant="flat"
                                className="w-full"
                                isDisabled={formData.status === "IN_TRANSIT" || formData.status === "DELIVERED" || formData.status === "CANCELLED" || isLoading}
                                onPress={() => handleStatusChange("IN_TRANSIT")}
                              >
                                <Icon icon="mdi:truck-fast" className="mr-1" />
                                In Transit
                              </Button>
                              <Button
                                color="success"
                                variant="flat"
                                className="w-full"
                                isDisabled={formData.status === "DELIVERED" || formData.status === "CANCELLED" || isLoading}
                                onPress={() => handleStatusChange("DELIVERED")}
                              >
                                <Icon icon="mdi:check-circle" className="mr-1" />
                                Delivered
                              </Button>
                              <Button
                                color="danger"
                                variant="flat"
                                className="w-full"
                                isDisabled={formData.status === "CANCELLED" || formData.status === "DELIVERED" || isLoading}
                                onPress={() => handleStatusChange("CANCELLED")}
                              >
                                <Icon icon="mdi:close-circle" className="mr-1" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div>
                  <div className="flex flex-col md:flex-row justify-center items-center gap-4">
                    {!admin ? (
                      <Skeleton className="h-10 w-full rounded-xl" />
                    ) : (
                      <>
                        {selectedDeliveryId && admin.is_admin && (
                          <>
                            <Button
                              color="secondary"
                              variant="shadow"
                              className="w-full"
                              onPress={() => setShowQrCode(true)}
                            >
                              <Icon icon="mdi:qrcode" className="mr-1" />
                              Show Delivery QR
                            </Button>
                            {formData.status === "DELIVERED" && (
                              <Button
                                color="success"
                                variant="shadow"
                                className="w-full"
                                onPress={handleViewInventory}
                              >
                                <Icon icon="mdi:package-variant" className="mr-1" />
                                Show Inventory
                              </Button>
                            )}

                          </>
                        )}

                        {/* Show submit button only for admins creating/updating or operators with selected delivery */}
                        {((admin.is_admin || selectedDeliveryId) && formData.status !== "DELIVERED") && (
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
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardList>
            </Form>
          ) : selectedDeliveryId ? (
            <CardList>
              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Delivery Information</h2>
                <div className="space-y-4">
                  {/* Read-only view for operators */}
                  <div className="space-y-4">
                    <div className="p-4 border border-default-200 rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-default-500">Item</span>
                        <Chip color="default" size="sm">
                          {inventoryItems.find(i => i.uuid === formData.inventory_item_uuid)?.item_code || 'N/A'}
                        </Chip>
                      </div>
                      <p className="font-semibold">
                        {inventoryItems.find(i => i.uuid === formData.inventory_item_uuid)?.item_name || 'Unknown Item'}
                      </p>
                    </div>

                    <div className="p-4 border border-default-200 rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-default-500">Status</span>
                        <Chip color={getStatusColor(formData.status as string)} size="sm">
                          {formData.status}
                        </Chip>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-default-500">Delivery Date</span>
                        <span>{new Date(formData.delivery_date as string).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="p-4 border border-default-200 rounded-xl">
                      <span className="text-default-500">Delivery Address</span>
                      <p className="mt-1">{formData.delivery_address}</p>
                    </div>

                    {formData.notes && (
                      <div className="p-4 border border-default-200 rounded-xl">
                        <span className="text-default-500">Notes</span>
                        <p className="mt-1">{formData.notes}</p>
                      </div>
                    )}

                    {formData.recipient_name && (
                      <div className="p-4 border border-default-200 rounded-xl">
                        <span className="text-default-500">Recipient</span>
                        <p className="font-medium mt-1">{formData.recipient_name}</p>
                        <p className="text-default-500">{formData.recipient_contact}</p>
                      </div>
                    )}

                    {formData.status === "DELIVERED" && (
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

                  </div>
                </div>
              </div>
            </CardList>
          ) : (
            /* Show message for operators when no delivery is selected */
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-default-300 rounded-2xl bg-background">
              <Icon icon="mdi:truck-delivery" className="text-default-300" width={64} height={64} />
              <h3 className="text-xl font-semibold text-default-800">No Delivery Selected</h3>
              <p className="text-default-500 text-center mt-2 mb-6">
                Select a delivery from the list to view details, or click the "Accept Delivery" button to scan a QR code.
              </p>
              <Button
                color="primary"
                variant="shadow"
                className="mb-4"
                onPress={() => setShowAcceptDeliveryModal(true)}
              >
                <Icon icon="mdi:qrcode-scan" className="mr-2" />
                Accept Delivery
              </Button>
            </div>
          )}
        </div>
      </div >

      {/* QR Code Modal */}
      < Modal
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
            <div className="mt-4 w-full bg-default-50 overflow-auto max-h-64 rounded-xl">
              <SyntaxHighlighter
                language="json"
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
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
                // save the QRCodeCanvas as an image
                const canvas = document.getElementById('delivery-qrcode') as HTMLCanvasElement;
                const pngUrl = canvas.toDataURL('image/png');
                const downloadLink = document.createElement('a');
                downloadLink.href = pngUrl;
                downloadLink.download = `delivery-${formData.recipient_name?.replace(/\s+/g, '-') || 'item'}-${new Date().toISOString()}.png`;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                setShowQrCode(false);
              }}
            >
              <Icon icon="mdi:download" className="mr-1" />
              Download QR
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal >

      <Modal
        isOpen={showAcceptDeliveryModal}
        onClose={() => {
          setShowAcceptDeliveryModal(false);
          setDeliveryJson("");
          setJsonValidationError("");
          setJsonValidationSuccess(false);
        }}
        isDismissable={!isLoading && !isProcessingImage}
        placement="auto"
        backdrop="blur"
        size="lg"
        classNames={{
          backdrop: "bg-background/50"
        }}
      >
        <ModalContent>
          <ModalHeader>Accept Delivery</ModalHeader>
          <ModalBody className="flex flex-col items-center">
            <div className="w-full space-y-4">
              <p className="text-default-700">
                Scan the delivery QR code or enter the delivery code provided by the admin:
              </p>

              {/* QR Code Image Upload */}
              <div className="flex flex-col items-center w-full">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQrImageUpload}
                  className="hidden"
                  ref={fileInputRef}
                />

                <Button
                  color="primary"
                  variant="flat"
                  className="w-full mb-4"
                  onPress={() => fileInputRef.current?.click()}
                  startContent={<Icon icon="mdi:camera" />}
                  isLoading={isProcessingImage}
                  isDisabled={isLoading || jsonValidationSuccess}
                >
                  Upload QR Code Image
                </Button>

                <div className="w-full border-t border-default-200 my-4 relative">
                  <span className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-content1 px-4 text-default-400 text-sm">
                    OR
                  </span>
                </div>
              </div>

              <Textarea
                ref={deliveryJsonTextareaRef}
                label="Delivery Code"
                placeholder="Paste the delivery JSON code here"
                value={deliveryJson}
                onChange={(e) => setDeliveryJson(e.target.value)}
                onPaste={handleDeliveryJsonPaste}
                minRows={4}
                maxRows={6}

                classNames={{
                  base: "w-full",
                  inputWrapper: `border-2 ${jsonValidationError ? 'border-danger' : jsonValidationSuccess ? 'border-success' : 'border-default-200'} hover:border-default-400 !transition-all duration-200`
                }}
                isInvalid={!!jsonValidationError}
                errorMessage={jsonValidationError}
                startContent={<Icon icon="mdi:code-json" className="text-default-500 mt-[0.15rem]" />}
              />

              {jsonValidationSuccess && (
                <div className="flex items-center py-2 px-4 bg-success-50 rounded-xl">
                  <Icon icon="mdi:check-circle" className="text-success text-xl mr-2" />
                  <div>
                    <p className="font-medium text-success">Delivery accepted successfully!</p>
                  </div>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter className="flex justify-end p-4 gap-4">
            <Button
              color="default"
              onPress={() => {
                setShowAcceptDeliveryModal(false);
                setDeliveryJson("");
                setJsonValidationError("");
                setJsonValidationSuccess(false);
              }}
              isDisabled={isLoading || isProcessingImage}
            >
              Cancel
            </Button>
            <Button
              {...isLoading ? {} : { startContent: <Icon icon="mdi:check" className="mr-1" /> }}
              color="primary"
              variant="shadow"
              onPress={(e) => handleDeliveryJsonValidation()}
              isLoading={isLoading || isProcessingImage}
              isDisabled={jsonValidationSuccess || isLoading || isProcessingImage || !deliveryJson.trim()}
            >
              Validate & Accept
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div >
  );
}