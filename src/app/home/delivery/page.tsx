"use client";

import { motionTransition } from '@/utils/anim';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Skeleton,
  Spinner,
  Tab,
  Tabs,
  useDisclosure,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";


import LoadingAnimation from '@/components/loading-animation';
import { getUserFromCookies, getUsersFromCompany, UserProfile } from '@/utils/supabase/server/user';
import { formatDate, formatStatus, showErrorToast } from '@/utils/tools';
import { getInventoryItems } from '../inventory/actions';
import { getWarehouses, Warehouse } from '../warehouses/actions';

import { FilterOption, SearchListPanel } from '@/components/search-list-panel/search-list-panel';
import { getUserCompanyDetails } from "@/utils/supabase/server/companies";
import { generatePdfBlob } from './pdf-document';

import CustomScrollbar from '@/components/custom-scrollbar';
import { getStatusColor } from '@/utils/colors';
import jsQR from 'jsqr';
import { getDeliveryDetails, updateDeliveryStatusWithItems } from './actions';
import { DeliveryComponent } from './delivery-component';
import { DeliveryExportPopover } from './delivery-export';

export default function DeliveryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Core user and data states
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Array<Partial<Warehouse> & { uuid: string }>>([]);
  const [operators, setOperators] = useState<Array<Partial<UserProfile> & { uuid: string }>>([]);
  const [inventories, setInventories] = useState<any[]>([]);

  // Loading states
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  // Core delivery management
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);

  // Accept delivery states
  const [deliveryInput, setDeliveryInput] = useState("");
  const [acceptDeliveryTab, setAcceptDeliveryTab] = useState("paste-link");
  const [isAcceptingDelivery, setIsAcceptingDelivery] = useState(false);
  const [acceptDeliveryError, setAcceptDeliveryError] = useState<string | null>(null);
  const [acceptDeliverySuccess, setAcceptDeliverySuccess] = useState(false);

  // Modal states
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [showQrCode, setShowQrCode] = useState(false);
  const [showAcceptDeliveryModal, setShowAcceptDeliveryModal] = useState(false);
  const [showAcceptStatusModal, setShowAcceptStatusModal] = useState(false);

  // QR Code states
  const [qrCodeData, setQrCodeData] = useState<{
    url: string;
    title: string;
    description: string;
    warehouseInventoryId: string;
    deliveryName: string;
    auto: boolean;
    showOptions: boolean;
  }>({
    url: "",
    title: "",
    description: "",
    warehouseInventoryId: "",
    deliveryName: "",
    auto: false,
    showOptions: true
  });

  // Other states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };

  // ===== SEARCH AND FILTER STATES =====
  const deliveryFilters: Record<string, FilterOption> = {
    warehouse_filter: {
      name: "Warehouse",
      valueName: "warehouse_uuid",
      color: "danger",
      filters: warehouses.reduce(
        (acc, warehouse) => ({
          ...acc,
          [warehouse.uuid]: warehouse.name
        }),
        { "": "All Warehouses" }
      )
    },
    status_filter: {
      name: "Status",
      valueName: "status",
      color: "primary",
      filters: {
        "": "All Statuses",
        PENDING: "Pending",
        PROCESSING: "Processing",
        IN_TRANSIT: "In Transit",
        DELIVERED: "Delivered",
        CANCELLED: "Cancelled"
      }
    },
    operator_filter: {
      name: "Operator",
      valueName: "operator_uuids",
      color: "secondary",
      filters: operators.reduce(
        (acc, operator) => ({
          ...acc,
          [operator.uuid]: operator.full_name
        }),
        { "": "All Operators" }
      )
    },
    inventory_filter: {
      name: "Inventory",
      valueName: "inventory_uuid",
      color: "success",
      filters: inventories.reduce(
        (acc, item) => ({
          ...acc,
          [item.uuid]: item.name
        }),
        { "": "All Items" }
      )
    }
  };

  const handleNewDelivery = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("deliveryId");
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleSelectDelivery = (deliveryId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("deliveryId", deliveryId);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleGoToWarehouse = (warehouseUuid: string) => {
    router.push(`/home/warehouses?warehouseId=${warehouseUuid}`);
  };

  const handleDeliveryUpdate = (deliveryId: string) => {
    // Update URL if creating a new delivery
    if (!selectedDeliveryId && deliveryId) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("deliveryId", deliveryId);
      router.push(`?${params.toString()}`, { scroll: false });
    }
  };

  const handleStatusChange = (status: string) => {
    // Handle any page-level status change logic here if needed
    console.log("Delivery status changed to:", status);
  };

  // === PDF GENERATION FUNCTIONS ===

  // Find the section in handlePdfExport where groups are processed
  const handlePdfExport = async (data: {
    selectedItems: string[];
    searchQuery: string;
    filters: Record<string, any>;
    dateFilters: Record<string, any>;
    exportOptions: Record<string, any>;
    allFilteredItems: any[];
  }) => {
    setIsPdfGenerating(true);

    try {
      // Get selected deliveries
      const deliveriesToExport = data.selectedItems.length > 0
        ? data.allFilteredItems.filter((item: { uuid: any; }) => data.selectedItems.includes(item.uuid))
        : data.allFilteredItems;

      console.log('Deliveries to export:', deliveriesToExport);

      // Prepare warehouse inventories for export instead of deliveries
      const warehouseInventoriesForExport: any[] = [];

      for (const delivery of deliveriesToExport) {
        try {
          console.log(`Processing delivery ${delivery.uuid} for warehouse inventory export`);

          // Get detailed delivery data to access warehouse inventory items
          const deliveryDetails = await getDeliveryDetails(delivery.uuid, user.company_uuid);

          if (deliveryDetails.success && deliveryDetails.data?.warehouse_inventory_items) {
            const warehouseInventoryItemsData = deliveryDetails.data.warehouse_inventory_items;
            console.log('Raw warehouse inventory items data:', warehouseInventoryItemsData);

            // Group items by warehouse_inventory_uuid
            const warehouseInventoryGroups = new Map();

            Object.entries(warehouseInventoryItemsData).forEach(([itemUuid, itemData]: [string, any]) => {
              const warehouseInventoryUuid = itemData.warehouse_inventory_uuid;

              if (!warehouseInventoryUuid) {
                console.warn('Item missing warehouse_inventory_uuid:', itemData);
                return;
              }

              if (!warehouseInventoryGroups.has(warehouseInventoryUuid)) {
                warehouseInventoryGroups.set(warehouseInventoryUuid, {
                  warehouse_inventory_uuid: warehouseInventoryUuid,
                  inventory_uuid: itemData.inventory_uuid,
                  items: [],
                  delivery: delivery
                });
              }

              warehouseInventoryGroups.get(warehouseInventoryUuid).items.push({
                uuid: itemUuid,
                ...itemData
              });
            });

            // Process each warehouse inventory group
            for (const [warehouseInventoryUuid, groupData] of warehouseInventoryGroups) {
              let inventoryItemsForExport = [];

              // Process warehouse inventory items based on the inclusion type
              if (data.exportOptions.inventoryInclusionType !== 'warehouse_inventories_only') {
                const warehouseInventoryItems = groupData.items;

                // Group items by group_id
                const itemGroups = new Map();
                const individualItems: any[] = [];
                let groupCounter = 1;

                warehouseInventoryItems.forEach((item: any) => {
                  if (item.group_id && item.group_id !== '' && item.group_id !== null) {
                    if (!itemGroups.has(item.group_id)) {
                      itemGroups.set(item.group_id, {
                        type: 'group',
                        group_id: item.group_id,
                        group_number: groupCounter++,
                        warehouse_inventory_uuid: item.warehouse_inventory_uuid,
                        inventory_uuid: item.inventory_uuid,
                        items: []
                      });
                    }
                    itemGroups.get(item.group_id).items.push(item);
                  } else {
                    individualItems.push({
                      type: 'item',
                      ...item
                    });
                  }
                });

                // Process based on inventoryInclusionType
                switch (data.exportOptions.inventoryInclusionType) {
                  case 'all_items': {
                    // Include all individual items (both grouped and ungrouped)
                    let itemCounter = 1;
                    warehouseInventoryItems.forEach((item: any, index: number) => {
                      const baseUrl = "https://ropic.vercel.app/home/search";
                      const itemParams = new URLSearchParams();
                      itemParams.set('q', item.warehouse_inventory_uuid);
                      itemParams.set('delivery', delivery.uuid); // Add delivery parameter
                      itemParams.set('item', item.uuid);
                      itemParams.set('auto', 'true'); // Auto on by default

                      if (data.exportOptions.includeShowOptions) {
                        itemParams.set('showOptions', 'true');
                      }

                      const itemQrUrl = `${baseUrl}?${itemParams.toString()}`;

                      inventoryItemsForExport.push({
                        type: 'item',
                        id: item.uuid,
                        name: `Item ${itemCounter++}`,
                        qrUrl: itemQrUrl,
                        warehouseInventoryUuid: item.warehouse_inventory_uuid,
                        inventoryUuid: item.inventory_uuid,
                        status: 'AVAILABLE'
                      });
                    });
                    break;
                  }
                  case 'all_groups': {
                    // Include only groups (no individual items)
                    for (const [groupId, groupData] of itemGroups) {
                      const baseUrl = "https://ropic.vercel.app/home/search";
                      const groupParams = new URLSearchParams();
                      groupParams.set('q', groupData.warehouse_inventory_uuid);
                      groupParams.set('delivery', delivery.uuid); // Add delivery parameter
                      groupParams.set('group', groupId);
                      groupParams.set('auto', 'true'); // Auto on by default

                      if (data.exportOptions.includeShowOptions) {
                        groupParams.set('showOptions', 'true');
                      }

                      const groupQrUrl = `${baseUrl}?${groupParams.toString()}`;

                      inventoryItemsForExport.push({
                        type: 'group',
                        id: groupId,
                        name: `Group ${groupData.group_number}`,
                        qrUrl: groupQrUrl,
                        itemCount: groupData.items.length,
                        warehouseInventoryUuid: groupData.warehouse_inventory_uuid,
                        inventoryUuid: groupData.inventory_uuid,
                        items: groupData.items,
                        status: 'AVAILABLE'
                      });
                    }
                    break;
                  }
                  case 'items_and_groups': {
                    // Include both all groups and all individual items
                    // First add groups
                    for (const [groupId, groupData] of itemGroups) {
                      const baseUrl = "https://ropic.vercel.app/home/search";
                      const groupParams = new URLSearchParams();
                      groupParams.set('q', groupData.warehouse_inventory_uuid);
                      groupParams.set('delivery', delivery.uuid); // Add delivery parameter
                      groupParams.set('group', groupId);
                      groupParams.set('auto', 'true'); // Auto on by default

                      if (data.exportOptions.includeShowOptions) {
                        groupParams.set('showOptions', 'true');
                      }

                      const groupQrUrl = `${baseUrl}?${groupParams.toString()}`;

                      inventoryItemsForExport.push({
                        type: 'group',
                        id: groupId,
                        name: `Group ${groupData.group_number}`,
                        qrUrl: groupQrUrl,
                        itemCount: groupData.items.length,
                        warehouseInventoryUuid: groupData.warehouse_inventory_uuid,
                        inventoryUuid: groupData.inventory_uuid,
                        items: groupData.items,
                        status: 'AVAILABLE'
                      });
                    }

                    // Then add all individual items
                    let itemCounter = 1;
                    warehouseInventoryItems.forEach((item: any, index: number) => {
                      const baseUrl = "https://ropic.vercel.app/home/search";
                      const itemParams = new URLSearchParams();
                      itemParams.set('q', item.warehouse_inventory_uuid);
                      itemParams.set('delivery', delivery.uuid); // Add delivery parameter
                      itemParams.set('item', item.uuid);
                      itemParams.set('auto', 'true'); // Auto on by default

                      if (data.exportOptions.includeShowOptions) {
                        itemParams.set('showOptions', 'true');
                      }

                      const itemQrUrl = `${baseUrl}?${itemParams.toString()}`;

                      inventoryItemsForExport.push({
                        type: 'item',
                        id: item.uuid,
                        name: `Item ${itemCounter++}`,
                        qrUrl: itemQrUrl,
                        warehouseInventoryUuid: item.warehouse_inventory_uuid,
                        inventoryUuid: item.inventory_uuid,
                        status: 'AVAILABLE'
                      });
                    });
                    break;
                  }
                  case 'grouped_items': {
                    // Include groups + ungrouped individual items (default behavior)
                    // Add groups
                    for (const [groupId, groupData] of itemGroups) {
                      const baseUrl = "https://ropic.vercel.app/home/search";
                      const groupParams = new URLSearchParams();
                      groupParams.set('q', groupData.warehouse_inventory_uuid);
                      groupParams.set('delivery', delivery.uuid); // Add delivery parameter
                      groupParams.set('group', groupId);
                      groupParams.set('auto', 'true'); // Auto on by default

                      if (data.exportOptions.includeShowOptions) {
                        groupParams.set('showOptions', 'true');
                      }

                      const groupQrUrl = `${baseUrl}?${groupParams.toString()}`;

                      inventoryItemsForExport.push({
                        type: 'group',
                        id: groupId,
                        name: `Group ${groupData.group_number}`,
                        qrUrl: groupQrUrl,
                        itemCount: groupData.items.length,
                        warehouseInventoryUuid: groupData.warehouse_inventory_uuid,
                        inventoryUuid: groupData.inventory_uuid,
                        items: groupData.items,
                        status: 'AVAILABLE'
                      });
                    }

                    // Add only ungrouped individual items
                    let itemCounter = 1;
                    individualItems.forEach((item: any, index: number) => {
                      const baseUrl = "https://ropic.vercel.app/home/search";
                      const itemParams = new URLSearchParams();
                      itemParams.set('q', item.warehouse_inventory_uuid);
                      itemParams.set('delivery', delivery.uuid); // Add delivery parameter
                      itemParams.set('item', item.uuid);
                      itemParams.set('auto', 'true'); // Auto on by default

                      if (data.exportOptions.includeShowOptions) {
                        itemParams.set('showOptions', 'true');
                      }

                      const itemQrUrl = `${baseUrl}?${itemParams.toString()}`;

                      inventoryItemsForExport.push({
                        type: 'item',
                        id: item.uuid,
                        name: `Item ${itemCounter++}`,
                        qrUrl: itemQrUrl,
                        warehouseInventoryUuid: item.warehouse_inventory_uuid,
                        inventoryUuid: item.inventory_uuid,
                        status: 'AVAILABLE'
                      });
                    });
                    break;
                  }
                }

                console.log(`Generated ${inventoryItemsForExport.length} warehouse inventory items for export`);
              }

              // Generate QR URL for warehouse inventory
              const baseUrl = "https://ropic.vercel.app/home/search";
              const params = new URLSearchParams();
              params.set('q', warehouseInventoryUuid);
              params.set('delivery', delivery.uuid); // Add delivery parameter
              params.set('auto', 'true'); // Auto on by default

              if (data.exportOptions.includeShowOptions) {
                params.set('showOptions', 'true');
              }

              const qrUrl = `${baseUrl}?${params.toString()}`;

              // Find warehouse and inventory names
              const warehouse = warehouses.find(w => w.uuid === delivery.warehouse_uuid);
              const inventory = inventories.find(i => i.uuid === groupData.inventory_uuid);

              warehouseInventoriesForExport.push({
                uuid: warehouseInventoryUuid,
                qrUrl,
                deliveryDate: delivery.delivery_date,
                itemName: inventory?.name || 'Unknown Inventory',
                warehouse_name: warehouse?.name || 'Unknown Warehouse',
                inventoryItemsForExport,
                delivery: delivery,
                status: 'AVAILABLE'
              });
            }
          } else {
            console.warn('No warehouse inventory items found for delivery:', delivery.uuid);
          }
        } catch (error) {
          console.error(`Error loading warehouse inventory items for delivery ${delivery.uuid}:`, error);
        }
      }

      console.log('Final prepared warehouse inventories:', warehouseInventoriesForExport);

      // Get company data including logo
      const companyData = await getUserCompanyDetails(user.uuid);

      let companyLogoUrl = null;
      if (companyData?.data?.logo_url && !companyData?.data?.logo_url.error) {
        companyLogoUrl = companyData.data.logo_url;
      }

      // Generate PDF with selected options
      const pdfBlob = await generatePdfBlob({
        deliveries: warehouseInventoriesForExport,
        companyName: companyData?.data?.name || "Your Company",
        companyLogoUrl: companyLogoUrl,
        dateGenerated: new Date().toLocaleString(),
        pageSize: data.exportOptions.pageSize,
        inventoryInclusionType: data.exportOptions.inventoryInclusionType
      });

      // Create download link with descriptive filename
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;

      const inclusionTypeSuffixes: Record<string, string> = {
        'warehouse_inventories_only': '',
        'all_items': '_all_items',
        'all_groups': '_all_groups',
        'items_and_groups': '_items_and_groups',
        'grouped_items': '_grouped_items'
      };
      const inclusionTypeSuffix = inclusionTypeSuffixes[data.exportOptions.inventoryInclusionType] || '';

      link.download = `Warehouse_Inventory_QR_Codes_${data.exportOptions.pageSize}${inclusionTypeSuffix}_${new Date().toISOString().split('T')[0]}_${new Date().toTimeString().split(' ')[0].replace(/:/g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error generating warehouse inventory QR PDF:", error);
    } finally {
      setIsPdfGenerating(false);
    }
  };

  // QR Code functions - Updated to use warehouse inventory UUIDs
  const generateDeliveryUrl = (warehouseInventoryId?: string, auto: boolean = true, showOptions: boolean = true) => {
    const targetDeliveryId = warehouseInventoryId || selectedDeliveryId;
    if (!targetDeliveryId) return "https://ropic.vercel.app/home/search";

    const baseUrl = "https://ropic.vercel.app/home/search";
    const params = new URLSearchParams({
      q: targetDeliveryId, // This should now be a warehouse inventory UUID
      ...(auto && { auto: "true" }),
      ...(showOptions && { showOptions: "true" })
    });

    return `${baseUrl}?${params.toString()}`;
  };

  const updateQrCodeUrl = (auto: boolean, showOptions?: boolean) => {
    const currentShowOptions = showOptions !== undefined ? showOptions : qrCodeData.showOptions;
    setQrCodeData(prev => ({
      ...prev,
      auto,
      ...(showOptions !== undefined && { showOptions }),
      url: generateDeliveryUrl(prev.warehouseInventoryId, auto, currentShowOptions),
      description: `Scan this code to mark warehouse inventory items as used for ${prev.deliveryName}${auto ? '. This will automatically mark the items as used when scanned.' : '.'}`
    }));
  };

  const updateShowOptions = (showOptions: boolean) => {
    setQrCodeData(prev => ({
      ...prev,
      showOptions,
      url: generateDeliveryUrl(prev.warehouseInventoryId, prev.auto, showOptions)
    }));
  };

  // ===== ACCEPT DELIVERY FUNCTIONS =====
  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);

    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          setError("Failed to process image");
          setIsProcessingImage(false);
          URL.revokeObjectURL(objectUrl);
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          let deliveryUuid = code.data;

          try {
            const url = new URL(code.data);
            const searchParams = new URLSearchParams(url.search);
            const qParam = searchParams.get('q');
            if (qParam) {
              deliveryUuid = qParam;
            }
          } catch (error) {
          }

          await handleAcceptDelivery(deliveryUuid);
        } else {
          setError("No QR code found in the image");
        }

        setIsProcessingImage(false);
        URL.revokeObjectURL(objectUrl);
      };

      img.onerror = () => {
        setError("Failed to load image");
        setIsProcessingImage(false);
        URL.revokeObjectURL(objectUrl);
      };

      img.src = objectUrl;
    } catch (error) {
      console.error("Error processing QR image:", error);
      setError("Failed to process the uploaded image");
      setIsProcessingImage(false);
    }
  };

  const handlePasteLinkAccept = async (inputData = deliveryInput) => {
    if (!inputData.trim()) return;

    let deliveryUuid = inputData.trim();

    try {
      const url = new URL(inputData);
      const searchParams = new URLSearchParams(url.search);
      const qParam = searchParams.get('q');
      if (qParam) {
        deliveryUuid = qParam;
      }
    } catch (error) {
    }

    await handleAcceptDelivery(deliveryUuid);
  };

  const handlePasteLinkKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlePasteLinkAccept();
    }
  };

  const handleAcceptDelivery = async (deliveryUuid?: string) => {
    if (!deliveryUuid || !user) return;

    setIsAcceptingDelivery(true);
    setAcceptDeliveryError(null);
    setAcceptDeliverySuccess(false);

    try {
      const deliveryResult = await getDeliveryDetails(deliveryUuid, user.company_uuid);

      if (!deliveryResult.success || !deliveryResult.data) {
        setAcceptDeliveryError("Failed to load delivery details");
        setShowAcceptStatusModal(true);
        return;
      }

      const targetDelivery = deliveryResult.data;

      if (user.is_admin) {
        setAcceptDeliveryError("Admins cannot accept deliveries - only operators can");
        setShowAcceptStatusModal(true);
        return;
      }

      if (targetDelivery.status !== "IN_TRANSIT") {
        setAcceptDeliveryError("This delivery cannot be accepted because it is not in transit");
        setShowAcceptStatusModal(true);
        return;
      }

      const isAssignedOperator = targetDelivery.operator_uuids?.includes(user.uuid) ||
        targetDelivery.operator_uuids === null ||
        targetDelivery.operator_uuids?.length === 0;

      if (!isAssignedOperator) {
        setAcceptDeliveryError("You are not assigned to this delivery");
        setShowAcceptStatusModal(true);
        return;
      }

      const result = await updateDeliveryStatusWithItems(
        deliveryUuid,
        "DELIVERED",
        user.company_uuid
      );

      if (result.success) {
        setAcceptDeliverySuccess(true);
        setShowAcceptStatusModal(true);

        setError("");
        setDeliveryInput("");

      } else {
        setAcceptDeliveryError(result.error || "Failed to accept delivery");
        setShowAcceptStatusModal(true);
      }

    } catch (error) {
      console.error("Error accepting delivery:", error);
      setAcceptDeliveryError(`Failed to accept delivery: ${(error as Error).message}`);
      setShowAcceptStatusModal(true);
    } finally {
      setIsAcceptingDelivery(false);
    }
  };

  const handleDeliveryPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');

    if (pastedText.trim()) {
      setDeliveryInput(pastedText);

      setTimeout(() => {
        handlePasteLinkAccept(pastedText);
      }, 100);
    }
  };


  // UPDATED: URL parameter handling
  useEffect(() => {
    const handleURLParams = async () => {
      if (!user?.company_uuid || isLoadingItems || isLoadingWarehouses || warehouses.length === 0) return;

      const deliveryId = searchParams.get("deliveryId");
      setSelectedDeliveryId(deliveryId);
    };

    handleURLParams();
  }, [searchParams, user?.company_uuid, isLoadingItems, isLoadingWarehouses, warehouses.length]);

  // Update the effect that loads initial data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingItems(true);
      setIsLoadingWarehouses(true);

      const fetchedUser = await getUserFromCookies();
      setUser(fetchedUser);

      if (!fetchedUser) {
        showErrorToast("Failed to fetch user data", "User data error");
        return;
      }

      // Fetch inventory metadata first
      const fetchedInventories = await getInventoryItems(fetchedUser.company_uuid || "", true);
      if (fetchedInventories.success && fetchedInventories.data) {
        setInventories(fetchedInventories.data as any[]);
      } else {
        showErrorToast("Failed to fetch inventories", "Inventories error");
      }

      const fetchedWarehouses = await getWarehouses(fetchedUser.company_uuid || "", 'uuid, name, address, layout');
      if (fetchedWarehouses.success) {
        setWarehouses(fetchedWarehouses.data as any[]);
      } else {
        showErrorToast("Failed to fetch warehouses", "Warehouses error");
      }

      const fetchedOperators = await getUsersFromCompany(fetchedUser.company_uuid || "", 'operator')
      if (fetchedOperators.success) {
        setOperators(fetchedOperators.data as any[]);
      } else {
        showErrorToast("Failed to fetch operators", "Operators error");
      }

      setIsLoadingItems(false);
      setIsLoadingWarehouses(false);
    }

    fetchData();
  }, []);


  useEffect(() => {
    if (showAcceptDeliveryModal && acceptDeliveryTab === "paste-link") {
      setTimeout(() => {
        const input = document.querySelector('[placeholder="Paste delivery UUID or URL here..."]') as HTMLInputElement;
        input?.focus();
      }, 100);
    }
  }, [showAcceptDeliveryModal, acceptDeliveryTab]);

  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Delivery Management</h1>
            {isLoadingItems ? (
              <div className="text-default-500 flex xl:justify-start justify-center items-center">
                <p className='my-auto mr-1'>Loading delivery data</p>
                <Icon icon="mdi:loading" className="animate-spin inline-block scale-75 translate-y-[0.125rem]" />
              </div>
            ) : (
              <p className="text-default-500">Track and manage your deliveries efficiently.</p>
            )}
          </div>
          <div className="flex gap-4 xl:mt-0 mt-4 text-center">
            {user && user.is_admin ? (
              <Button color="primary" variant="shadow" onPress={handleNewDelivery}
                startContent={<Icon icon="mdi:plus" />}
                isDisabled={isLoadingItems || isLoadingWarehouses}>
                New Delivery
              </Button>
            ) : selectedDeliveryId ? (
              <Button color="primary" variant="shadow"
                onPress={() => setShowAcceptDeliveryModal(true)}
                startContent={<Icon icon="mdi:check" />}
                isDisabled={isLoadingItems}>
                Accept Deliveries
              </Button>
            ) : null}

            {/* PDF Export Popover */}
            <DeliveryExportPopover
              user={user}
              warehouses={warehouses}
              operators={operators}
              inventoryItems={inventories}
              isPdfGenerating={isPdfGenerating}
              onExport={handlePdfExport}
            />
          </div>
        </div>
        <div className="flex flex-col xl:flex-row gap-4">
          {/* Left side: Delivery List */}
          <SearchListPanel
            title="Deliveries"
            tableName="delivery_items"
            searchPlaceholder="Search deliveries..."
            searchLimit={10}
            dateFilters={["dateRange", "weekFilter", "specificDate"]}
            companyUuid={user?.company_uuid}
            filters={deliveryFilters}
            renderItem={(delivery) => (
              <Button
                key={delivery.uuid}
                onPress={() => handleSelectDelivery(delivery.uuid)}
                variant="shadow"
                className={`w-full !transition-all duration-300 rounded-2xl p-0 group overflow-hidden
                            ${delivery.delivery_address ? 'min-h-[9.5rem]' : 'min-h-[7rem]'}
                            ${selectedDeliveryId === delivery.uuid ?
                    '!bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500 !shadow-xl hover:!shadow-2xl !shadow-primary-300/50 border-2 border-primary-300/30' :
                    '!bg-gradient-to-br from-background to-default-50 hover:from-default-50 hover:to-default-100 !shadow-lg hover:!shadow-xl !shadow-default-300/30 border-2 border-default-200/50 hover:border-default-300/50'}`}
              >
                <div className="w-full flex flex-col h-full relative">
                  {/* Background pattern */}
                  <div className={`absolute inset-0 opacity-5 ${selectedDeliveryId === delivery.uuid ? 'bg-white' : 'bg-primary-500'}`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,_var(--tw-gradient-stops))] from-current via-transparent to-transparent"></div>
                  </div>

                  {/* Delivery details */}
                  <div className="flex-grow flex flex-col justify-center px-4 relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 text-left">
                        <span className={`font-bold text-lg leading-tight block truncate text-left
                                          ${selectedDeliveryId === delivery.uuid ? 'text-primary-50' : 'text-default-800'}`}>
                          {delivery.name || 'Unknown Item'}
                        </span>
                        {delivery.delivery_address && (
                          <div className={`w-full mt-2 text-sm leading-relaxed text-left break-words whitespace-normal
                                          ${selectedDeliveryId === delivery.uuid ? 'text-primary-100' : 'text-default-600'}`}
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              lineHeight: '1.3'
                            }}>
                            {delivery.delivery_address}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 self-start">
                        <Chip
                          color={selectedDeliveryId === delivery.uuid ? "default" : "primary"}
                          variant="shadow"
                          size="sm"
                          className={`font-semibold ${selectedDeliveryId === delivery.uuid ? 'bg-primary-50 text-primary-600' : ''}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:package-variant" width={14} height={14} />
                            {Object.keys(delivery.inventory_items || {}).length} item{(Object.keys(delivery.inventory_items || {}).length) !== 1 ? 's' : ''}
                          </div>
                        </Chip>
                      </div>
                    </div>
                  </div>

                  {/* Delivery metadata */}
                  <div className={`flex items-center gap-2 backdrop-blur-sm rounded-b-2xl border-t relative z-10 justify-start
        ${selectedDeliveryId === delivery.uuid ?
                      'border-primary-300/30 bg-primary-700/20' :
                      'border-default-200/50 bg-default-100/50'} p-4`}>
                    <CustomScrollbar
                      direction="horizontal"
                      hideScrollbars
                      gradualOpacity
                      className="flex items-center gap-2">

                      <Chip
                        color={selectedDeliveryId === delivery.uuid ? "default" : "secondary"}
                        variant="flat"
                        size="sm"
                        className={`font-medium ${selectedDeliveryId === delivery.uuid ? 'bg-secondary-100/80 text-primary-700 border-primary-200/60' : 'bg-secondary-100/80'}`}
                      >
                        <div className="flex items-center gap-1">
                          <Icon icon="mdi:calendar" width={12} height={12} />
                          {formatDate(delivery.delivery_date)}
                        </div>
                      </Chip>

                      <Chip
                        color={selectedDeliveryId === delivery.uuid ? "default" : getStatusColor(delivery.status)}
                        variant="flat"
                        size="sm"
                        className={`font-medium ${selectedDeliveryId === delivery.uuid ?
                          `bg-${getStatusColor(delivery.status)}-100 text-${getStatusColor(delivery.status)}-500` :
                          `bg-${getStatusColor(delivery.status)}-100 text-${getStatusColor(delivery.status)}-500`}`}
                      >
                        <div className="flex items-center gap-1">
                          <Icon icon="mdi:truck-delivery" width={12} height={12} />
                          {formatStatus(delivery.status) || 'Unknown Status'}
                        </div>
                      </Chip>

                      {delivery.operator_uuids && delivery.operator_uuids.length > 0 && (
                        <Chip
                          color="success"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedDeliveryId === delivery.uuid ? 'bg-success-100/80 text-success-700 border-success-200/60' : 'bg-success-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:account" width={12} height={12} />
                            {delivery.operator_uuids.length === 1
                              ? operators.find(op => delivery.operator_uuids && delivery.operator_uuids.includes(op.uuid))?.name?.first_name || 'Operator'
                              : `${delivery.operator_uuids.length} operators`
                            }
                          </div>
                        </Chip>
                      )}

                      {/* Show warehouse info if available */}
                      {delivery.warehouse_uuid && (
                        <Chip
                          color="warning"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedDeliveryId === delivery.uuid ? 'bg-warning-100/80 text-warning-700 border-warning-200/60' : 'bg-warning-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:warehouse" width={12} height={12} />
                            {warehouses.find(w => w.uuid === delivery.warehouse_uuid)?.name || 'Warehouse'}
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
              <Skeleton key={i} className="w-full min-h-[7.5rem] rounded-xl" />
            )}
            renderEmptyCard={(
              <>
                <Icon icon="fluent:box-dismiss-20-filled" className="text-5xl text-default-300" />
                <p className="text-default-500 mt-2 mx-8 text-center">
                  No deliveries found
                </p>
                <Button
                  color="primary"
                  variant="flat"
                  size="sm"
                  className="mt-4"
                  onPress={handleNewDelivery}
                  startContent={<Icon icon="mdi:plus" className="text-default-500" />}>
                  Create Delivery
                </Button>
              </>
            )}
            onItemSelect={handleSelectDelivery}
            supabaseFunction="get_delivery_filtered"
            className={`xl:w-1/3 shadow-xl shadow-primary/10 
            xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
            xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
            border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
          />

          {/* Right side: Delivery Component */}
          <div className="xl:w-2/3 overflow-hidden">
            <LoadingAnimation
              condition={isLoadingItems || isLoadingWarehouses || !user}
              skeleton={
                <div className="flex flex-col h-full shadow-xl shadow-primary/10 bg-background p-12 py-24 rounded-2xl rounded-2xl p-6 items-center justify-center gap-4">
                  <Spinner size="lg" className="text-primary-500" />
                  <span className="ml-2 text-default-500">Loading delivery page...</span>
                </div>
              }
            >
              <LoadingAnimation
                condition={(user && user.is_admin) || selectedDeliveryId}
                skeleton={
                  <DeliveryComponent
                    deliveryId={selectedDeliveryId}
                    user={user}
                    warehouses={warehouses}
                    operators={operators}
                    inventories={inventories}
                    onDeliveryUpdate={handleDeliveryUpdate}
                    onStatusChange={handleStatusChange}
                    onGoToWarehouse={handleGoToWarehouse}
                    allowStatusUpdates={true}
                    showQRGeneration={true}
                    readOnlyMode={false}
                  />
                }
              >
                <div className="items-center justify-center p-12 border border-dashed border-default-300 rounded-2xl bg-background">
                  <div className="flex flex-col items-center justify-center">
                    <Icon icon="mdi:truck-delivery" className="text-default-300" width={64} height={64} />
                    <h3 className="text-xl font-semibold text-default-800">No Delivery Selected</h3>
                    <p className="text-default-500 text-center mt-2 mb-6">
                      Select a delivery from the list to view details, or click the "Accept Delivery" button to scan a QR code.
                    </p>
                    <Button
                      color="primary"
                      variant="shadow"
                      className="mb-4"
                      startContent={<Icon icon="mdi:check" />}
                      onPress={() => setShowAcceptDeliveryModal(true)}
                    >
                      Accept Deliveries
                    </Button>
                  </div>
                </div>
              </LoadingAnimation>
            </LoadingAnimation>
          </div>
        </div>
      </div >


      {/* Accept Delivery Modal */}
      < Modal
        isOpen={showAcceptDeliveryModal}
        onClose={() => {
          setShowAcceptDeliveryModal(false);
          setDeliveryInput("");
          setError("");
          setAcceptDeliveryTab("paste-link");
        }
        }
        isDismissable={!isProcessingImage && !isAcceptingDelivery}
        scrollBehavior="inside"
        placement="auto"
        backdrop="blur"
        size="lg"
        classNames={{ backdrop: "bg-background/50" }}
      >
        <ModalContent>
          <ModalHeader>
            <div className="flex flex-col">
              <span>Accept Delivery</span>
              <p className="text-sm text-default-500 font-normal">
                Choose a method to accept a delivery:
              </p>
            </div>
          </ModalHeader>
          <ModalBody className="flex flex-col items-center">
            <div className="w-full space-y-4">
              <Tabs
                selectedKey={acceptDeliveryTab}
                onSelectionChange={(key) => setAcceptDeliveryTab(key as string)}
                variant="solid"
                color="primary"
                fullWidth
                classNames={{
                  panel: "p-0",
                  tabList: "border-2 border-default-200",
                  tabContent: "text-default-700",
                }}
              >
                <Tab
                  key="paste-link"
                  title={
                    <div className="flex items-center space-x-2 px-1">
                      <Icon icon="mdi:link" className="text-base" />
                      <span className="font-medium text-sm">Paste Link</span>
                    </div>
                  }
                >
                  <Card className="flex flex-col bg-background h-[500px]">
                    {/* Header section */}
                    <CardHeader className="space-y-4 flex-shrink-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Icon icon="mdi:clipboard-text" className="text-primary-600 text-sm" />
                        </div>
                        <div className="text-left">
                          <h3 className="text-base font-semibold text-default-800">Paste Delivery Code</h3>
                          <p className="text-xs text-default-600">
                            Paste a delivery UUID or QR code URL to accept a delivery
                          </p>
                        </div>
                      </div>
                    </CardHeader>

                    <CardBody className="flex flex-col flex-1 px-4 items-center justify-center">
                      <div className="border-2 border-dashed border-default-300 hover:border-primary-400 transition-colors duration-200 rounded-xl p-6 text-center bg-primary-50 w-full">
                        <div className="space-y-3">
                          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center mx-auto">
                            <Icon icon="mdi:clipboard-text" className="text-primary-600 text-base" />
                          </div>

                          <div className="space-y-1">
                            <h4 className="font-medium text-sm text-default-700">Paste delivery code or URL</h4>
                            <p className="text-xs text-default-500">
                              Enter a delivery UUID or QR code URL
                            </p>
                          </div>

                          <div className="space-y-3 w-full">
                            <Input
                              placeholder="Paste delivery UUID or URL here..."
                              value={deliveryInput}
                              onChange={(e) => {
                                setDeliveryInput(e.target.value);
                                if (!e.target.value.trim()) {

                                }
                              }}
                              onKeyDown={handlePasteLinkKeyDown}
                              onPaste={handleDeliveryPaste}
                              startContent={<Icon icon="mdi:link-variant" className="text-default-500" />}
                              classNames={{
                                ...inputStyle,
                                inputWrapper: "border-2 border-default-200 hover:border-primary-400 focus-within:border-primary-500 !transition-all duration-200 h-12"
                              }}
                              isDisabled={isAcceptingDelivery}
                              autoFocus
                              size="md"
                            />

                            <Button
                              color="primary"
                              className="w-full"
                              onPress={() => handlePasteLinkAccept()}
                              isDisabled={!deliveryInput.trim() || isAcceptingDelivery}
                              variant="flat"
                            >
                              {isAcceptingDelivery ? (
                                <div className="flex items-center gap-2">
                                  <Spinner size="sm" />
                                  <span>Processing...</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Icon icon="mdi:check-circle" className="text-base" />
                                  <span>Accept Delivery</span>
                                </div>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardBody>

                    {/* Footer section */}
                    <CardFooter>
                      <div className="bg-default-50 rounded-xl p-3 border border-default-200 w-full">
                        <div className="flex items-start gap-2">
                          <Icon icon="mdi:information-outline" className="text-primary-500 text-sm mt-0.5 flex-shrink-0" />
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-default-700">How to use:</p>
                            <ul className="text-xs text-default-600 space-y-0.5">
                              <li>• Paste a delivery UUID directly</li>
                              <li>• Paste a QR code URL from a delivery</li>
                              <li>• Press Enter to accept the delivery</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </CardFooter>
                  </Card>
                </Tab>

                <Tab
                  key="upload-image"
                  title={
                    <div className="flex items-center space-x-2 px-1">
                      <Icon icon="mdi:camera" className="text-base" />
                      <span className="font-medium text-sm">Upload Image</span>
                    </div>
                  }
                >
                  <Card className="flex flex-col bg-background h-[500px]">
                    {/* Header section */}
                    <CardHeader className="space-y-4 flex-shrink-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="w-8 h-8 bg-secondary-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Icon icon="mdi:qrcode-scan" className="text-secondary-600 text-sm" />
                        </div>
                        <div className="text-left">
                          <h3 className="text-base font-semibold text-default-800">Scan QR Code</h3>
                          <p className="text-xs text-default-600">
                            Upload an image containing a delivery QR code
                          </p>
                        </div>
                      </div>
                    </CardHeader>

                    <CardBody className="flex flex-col flex-1 px-4 items-center justify-center">
                      <div className="border-2 border-dashed border-default-300 hover:border-secondary-400 transition-colors duration-200 rounded-xl p-6 text-center bg-secondary-50">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleQrImageUpload}
                          accept="image/*"
                          className="hidden"
                          disabled={isProcessingImage || isAcceptingDelivery}
                        />

                        <div className="space-y-3">
                          <div className="w-8 h-8 bg-secondary-100 rounded-full flex items-center justify-center mx-auto">
                            <Icon icon="mdi:upload" className="text-secondary-600 text-base" />
                          </div>

                          <div className="space-y-1">
                            <h4 className="font-medium text-sm text-default-700">Choose an image file</h4>
                            <p className="text-xs text-default-500">
                              Supports JPG, PNG, WEBP and other common image formats
                            </p>
                          </div>

                          <Button
                            color="secondary"
                            variant="flat"
                            onPress={() => fileInputRef.current?.click()}
                            isDisabled={isAcceptingDelivery}
                          >
                            {isProcessingImage ? (
                              <div className="flex items-center gap-2">
                                <Spinner size="sm" />
                                <span>Scanning QR Code...</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Icon icon="mdi:image-plus" className="text-base" />
                                <span>Select Image</span>
                              </div>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardBody>

                    {/* Footer section */}
                    <CardFooter>
                      <div className="bg-default-50 rounded-xl p-3 border border-default-200 w-full">
                        <div className="flex items-start gap-2">
                          <Icon icon="mdi:lightbulb-outline" className="text-warning-500 text-sm mt-0.5 flex-shrink-0" />
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-default-700">Tips for best results:</p>
                            <ul className="text-xs text-default-600 space-y-0.5">
                              <li>• Ensure the QR code is clearly visible</li>
                              <li>• Avoid blurry or low-quality images</li>
                              <li>• Make sure the QR code takes up a good portion of the image</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </CardFooter>
                  </Card>
                </Tab>
              </Tabs>
            </div>
          </ModalBody>
          <ModalFooter className="flex justify-end gap-4">
            <Button
              color="default"
              onPress={() => {
                setShowAcceptDeliveryModal(false);
                setDeliveryInput("");
                setError(null);
                setAcceptDeliveryTab("paste-link");
              }}
              isDisabled={isProcessingImage || isAcceptingDelivery}
            >
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal >

      {/* Accept Delivery Status Modal */}
      < Modal
        isOpen={showAcceptStatusModal}
        onClose={() => {
          setShowAcceptStatusModal(false);
          setError(null);
        }}
        placement="center"
        backdrop="blur"
        size="md"
        classNames={{ backdrop: "bg-background/50" }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            {acceptDeliverySuccess ? (
              <>
                <Icon icon="mdi:check-circle" className="text-success" width={24} />
                <span>Delivery Accepted Successfully</span>
              </>
            ) : (
              <>
                <Icon icon="mdi:alert-circle" className="text-danger" width={24} />
                <span>Delivery Acceptance Failed</span>
              </>
            )}
          </ModalHeader>
          <ModalBody>
            {acceptDeliverySuccess ? (
              <div className="text-center py-4">
                <div className="flex items-center justify-center w-16 h-16 bg-success-100 rounded-full mx-auto mb-4">
                  <Icon icon="mdi:check-circle" className="text-success" width={32} />
                </div>
                <p className="text-default-700">
                  The delivery has been marked as delivered and inventory items have been added to the warehouse.
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="flex items-center justify-center w-16 h-16 bg-danger-100 rounded-full mx-auto mb-4">
                  <Icon icon="mdi:alert-circle" className="text-danger" width={32} />
                </div>
                <p className="text-default-700">
                  {acceptDeliveryError}
                </p>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              color={acceptDeliverySuccess ? "success" : "danger"}
              variant="solid"
              onPress={() => {
                setShowAcceptStatusModal(false);
                setError(null);
              }}
              className="w-full"
            >
              {acceptDeliverySuccess ? "Great!" : "Close"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal >
    </motion.div >
  );
}