
"use client";

import { motionTransition } from '@/utils/anim';
import {
  Accordion, AccordionItem, Alert, Autocomplete, AutocompleteItem, Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  Chip, DatePicker,
  Form, Input,
  Modal, ModalBody, ModalContent, ModalFooter,
  ModalHeader,
  ScrollShadow, Skeleton, Spinner,
  Switch,
  Tab,
  Tabs,
  Textarea,
  Tooltip,
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { getLocalTimeZone, parseDate, today } from '@internationalized/date';
import { format, parseISO } from "date-fns";
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from 'qrcode.react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ShelfLocation, ShelfSelectorColorAssignment } from '@/components/shelf-selector-3d';
import { parseColumn } from '@/utils/floorplan';

import CardList from '@/components/card-list';
import {
  createDeliveryWithItems,
  DeliveryItem,
  getDeliveryDetails,
  getOccupiedShelfLocations,
  suggestShelfLocations,
  updateDeliveryStatusWithItems,
  updateDeliveryWithItems
} from "./actions";

import ListLoadingAnimation from '@/components/list-loading-animation';
import LoadingAnimation from '@/components/loading-animation';
import { getUserFromCookies, getUsersFromCompany, UserProfile } from '@/utils/supabase/server/user';
import { copyToClipboard, formatDate, formatStatus, showErrorToast } from '@/utils/tools';
import jsQR from "jsqr";
import { getInventoryItem, getInventoryItems, Inventory } from '../inventory/actions';
import { getWarehouses, Warehouse } from '../warehouses/actions';

import { Popover3dNavigationHelp } from '@/components/popover-3dnavigation-help';
import { FilterOption, SearchListPanel } from '@/components/search-list-panel/search-list-panel';
import { getUserCompanyDetails } from "@/utils/supabase/server/companies";
import { generatePdfBlob } from './pdf-document';

import {
  getGroupInfo,
  groupInventoryItems
} from "@/utils/inventory-group";
import { DeliveryExportPopover } from './delivery-export';
import CustomScrollbar from '@/components/custom-scrollbar';
import { getStatusColor, herouiColor } from '@/utils/colors';

import { Delivery3DShelfSelector } from './delivery-3d-shelf-selector';









export default function DeliveryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Core user and data states
  const [user, setUser] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<Array<Partial<Warehouse> & { uuid: string }>>([]);
  const [operators, setOperators] = useState<Array<Partial<UserProfile> & { uuid: string }>>([]);

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);
  const [isLoadingInventoryItems, setIsLoadingInventoryItems] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  // Modal states
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [showQrCode, setShowQrCode] = useState(false);
  const [showAcceptForm, setShowAcceptForm] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Error and validation states
  const [errors, setErrors] = useState<Record<string, string>>({});



  // ===== DELIVERY DATABASE STATES =====
  // Core delivery management
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [selectedOperators, setSelectedOperators] = useState<Array<Partial<UserProfile> & { uuid: string }>>([]);

  // ===== DELIVERY DATABASE - FORM STATE =====
  const [formData, setFormData] = useState<Partial<DeliveryItem>>({
    company_uuid: null,
    admin_uuid: null,
    inventory_items: {},
    warehouse_uuid: null,
    delivery_address: "",
    delivery_date: format(new Date(), "yyyy-MM-dd"),
    operator_uuids: [],
    notes: "",
    status: "PENDING",
    name: "",
  });

  // ===== DELIVERY DATABASE - INVENTORY STATES =====
  const [selectedInventoryUuids, setSelectedInventoryUuids] = useState<string[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [inventories, setInventories] = useState<any[]>([]);
  const [selectedInventoryItems, setSelectedInventoryItems] = useState<string[]>([]);
  const [prevSelectedInventoryItems, setPrevSelectedInventoryItems] = useState<string[]>([]);
  const [inventorySearchTerm, setInventorySearchTerm] = useState<string>('');
  const [showInventorySelector, setShowInventorySelector] = useState<boolean>(false);
  const [expandedInventoryItemDetails, setExpandedInventoryItemDetails] = useState<Set<string>>(new Set());
  const [expandedInventories, setExpandedInventories] = useState<Set<string>>(new Set());
  const [inventoryViewMode, setInventoryViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [nextItemId, setNextItemId] = useState(1);
  const [inventorySelectAllStates, setInventorySelectAllStates] = useState<Record<string, { isChecked: boolean; isIndeterminate: boolean; }>>({});
  const [loadedInventoryUuids, setLoadedInventoryUuids] = useState<Set<string>>(new Set());
  const [pendingInventorySelection, setPendingInventorySelection] = useState<{ inventoryUuid: string; isSelected: boolean } | null>(null);
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);
  const [isSelectAllIndeterminate, setIsSelectAllIndeterminate] = useState(false);

  // ===== DELIVERY DATABASE - LOCATION STATES =====
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedColumnCode, setSelectedColumnCode] = useState<string>("");
  const [selectedColumn, setSelectedColumn] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [selectedDepth, setSelectedDepth] = useState<number | null>(null);
  const [selectedCode, setSelectedCode] = useState("");
  const [occupiedLocations, setOccupiedLocations] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [currentInventoryItemLocationIndex, setCurrentInventoryItemLocationIndex] = useState<number>(0);
  const [floorConfigs, setFloorConfigs] = useState<any[]>([]);
  const [shelfColorAssignments, setShelfColorAssignments] = useState<Array<ShelfSelectorColorAssignment>>([]);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);

  // ===== ACCEPT DELIVERY STATES =====
  const [showAcceptDeliveryModal, setShowAcceptDeliveryModal] = useState(false);
  const [deliveryInput, setDeliveryInput] = useState("");
  const [validationError, setValidationError] = useState("");
  const [validationSuccess, setValidationSuccess] = useState(false);
  const [acceptDeliveryTab, setAcceptDeliveryTab] = useState("paste-link");
  const [isLoadingAvailableDeliveries, setIsLoadingAvailableDeliveries] = useState(false);
  const [isAcceptingDelivery, setIsAcceptingDelivery] = useState(false);
  const [acceptDeliveryError, setAcceptDeliveryError] = useState<string | null>(null);
  const [acceptDeliverySuccess, setAcceptDeliverySuccess] = useState(false);

  // ===== ACCEPT DELIVERY STATUS STATES =====
  const [showAcceptStatusModal, setShowAcceptStatusModal] = useState(false);

  // ===== QR CODE STATES =====
  const [qrCodeData, setQrCodeData] = useState<{
    url: string;
    title: string;
    description: string;
    deliveryId: string;
    deliveryName: string;
    autoAccept: boolean;
    showOptions: boolean;
  }>({
    url: "",
    title: "",
    description: "",
    deliveryId: "",
    deliveryName: "",
    autoAccept: false,
    showOptions: true
  });

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

  // ===== OTHER STATES =====
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  const autoCompleteStyle = { classNames: inputStyle };






























  // ===== DELIVERY DATABASE - HELPER FUNCTIONS =====
  const getGroupedInventoryItems = () => groupInventoryItems(inventoryItems);

  const getDisplayInventoryItemsList = () => {
    let items = inventoryItems;

    if (formData.status !== 'DELIVERED' && formData.status !== 'CANCELLED') {
      items = items.filter(item =>
        item.status !== 'IN_WAREHOUSE' &&
        item.status !== 'USED'
      );
    }

    if (inventoryViewMode === 'flat') {
      return items;
    }

    const groupedItems = groupInventoryItems(items);
    const seenGroups = new Set<string>();
    const displayItems: any[] = [];

    items.forEach(item => {
      const groupInfo = getGroupInfo(item, groupedItems);

      if (groupInfo.isGroup && groupInfo.groupId) {
        if (!seenGroups.has(groupInfo.groupId)) {
          seenGroups.add(groupInfo.groupId);
          displayItems.push(item);
        }
      } else {
        displayItems.push(item);
      }
    });

    return displayItems;
  };

  const getInventoryItemsForInventory = (inventoryUuid: string) => {
    return inventoryItems.filter(item => item.inventory_uuid === inventoryUuid);
  };


  const getDisplayInventoryItemsListForInventory = (inventoryUuid: string) => {
    let items = getInventoryItemsForInventory(inventoryUuid);

    // UPDATED: For delivered/cancelled status, don't filter out IN_WAREHOUSE/USED items
    // since they might be part of the delivery we're viewing
    if (formData.status !== 'DELIVERED' && formData.status !== 'CANCELLED' &&
      formData.status !== 'PROCESSING' && formData.status !== 'IN_TRANSIT') {
      items = items.filter(item =>
        item.status !== 'IN_WAREHOUSE' &&
        item.status !== 'USED'
      );
    }

    if (inventoryViewMode === 'flat') {
      return items;
    }

    const groupedItems = groupInventoryItems(items);
    const seenGroups = new Set<string>();
    const displayItems: any[] = [];

    items.forEach(item => {
      const groupInfo = getGroupInfo(item, groupedItems);

      if (groupInfo.isGroup && groupInfo.groupId) {
        if (!seenGroups.has(groupInfo.groupId)) {
          seenGroups.add(groupInfo.groupId);
          displayItems.push(item);
        }
      } else {
        displayItems.push(item);
      }
    });

    return displayItems;
  };

  const isWarehouseNotSet = (): boolean => {
    return formData.warehouse_uuid === "" || formData.warehouse_uuid === undefined || formData.warehouse_uuid === null
  }

  const isFloorConfigNotSet = (): boolean => {
    return floorConfigs.length === 0 || floorConfigs === undefined || floorConfigs === null
  }

  const isDeliveryProcessing = (): boolean => {
    return formData.status !== "DELIVERED" && formData.status !== "CANCELLED"
  }

  const canEditLimited = (): boolean => {
    return ["PENDING", "PROCESSING", "IN_TRANSIT"].includes(formData.status || '') && user?.is_admin === true || selectedDeliveryId === null;
  }

  const canEditAllFields = (): boolean => {
    return ["PENDING", "PROCESSING"].includes(formData.status || '') && user?.is_admin === true || selectedDeliveryId === null;
  };

  const getInventoryItemStatusStyling = (item: any) => {
    if (!selectedDeliveryId) {
      switch (item.status) {
        case 'AVAILABLE':
          return {
            isDisabled: false,
            disabledReason: null
          };
        case 'ON_DELIVERY':
          return {
            isDisabled: true,
            disabledReason: 'This item is assigned to another delivery'
          };
        case 'IN_WAREHOUSE':
          return {
            isDisabled: true,
            disabledReason: 'This item is already in warehouse'
          };
        case 'USED':
          return {
            isDisabled: true,
            disabledReason: 'This item has been used'
          };
        default:
          return {
            isDisabled: true,
            disabledReason: 'Item is not available for delivery'
          };
      }
    }

    const isPartOfCurrentDelivery = formData.inventory_items?.[item.uuid] ||
      prevSelectedInventoryItems.includes(item.uuid);

    switch (item.status) {
      case 'ON_DELIVERY':
        return {
          isDisabled: !isPartOfCurrentDelivery,
          disabledReason: isPartOfCurrentDelivery ? null : 'This item is assigned to another delivery'
        };
      case 'IN_WAREHOUSE':
        return {
          isDisabled: formData.status !== 'DELIVERED' && formData.status !== 'CANCELLED',
          disabledReason: 'This item is already in warehouse'
        };
      case 'USED':
        return {
          isDisabled: formData.status !== 'DELIVERED' && formData.status !== 'CANCELLED',
          disabledReason: 'This item has been used'
        };
      case 'AVAILABLE':
      default:
        return {
          isDisabled: false,
          disabledReason: null
        };
    }
  };


  const getDefaultDeliveryName = () => {
    if (!selectedInventoryItems.length) return "";

    // Get unique inventory UUIDs from selected items
    const selectedInventoryUuidsFromItems = [...new Set(
      selectedInventoryItems.map(itemUuid => {
        const item = inventoryItems.find(inv => inv.uuid === itemUuid);
        return item?.inventory_uuid;
      }).filter(Boolean)
    )];

    // Get inventory names for those UUIDs
    const selectedInventoryNames = selectedInventoryUuidsFromItems
      .map(uuid => inventories.find(inv => inv.uuid === uuid)?.name)
      .filter(Boolean);

    if (selectedInventoryNames.length === 0) return "";
    if (selectedInventoryNames.length === 1) return selectedInventoryNames[0];
    if (selectedInventoryNames.length === 2) return selectedInventoryNames.join(' and ');

    return selectedInventoryNames.slice(0, -1).join(', ') + ' and ' + selectedInventoryNames[selectedInventoryNames.length - 1];
  };

  // Add this computed value for the delivery name
  const deliveryNameValue = useMemo(() => {
    // If formData.name is already set (either from loaded delivery or user input), use it
    if (formData.name && formData.name.trim()) {
      return formData.name;
    }

    // If we're creating a new delivery (no selectedDeliveryId) and have selected inventory items,
    // use the default name based on selected items' inventories
    if (!selectedDeliveryId && selectedInventoryItems.length > 0) {
      return getDefaultDeliveryName();
    }

    // Otherwise, return empty string
    return "";
  }, [formData.name, selectedDeliveryId, selectedInventoryItems, inventories, inventoryItems]);



  const resetWarehouseLocation = () => {
    setSelectedFloor(null);
    setSelectedColumn(null);
    setSelectedRow(null);
    setSelectedGroup(null);
    setSelectedDepth(null);
    setSelectedColumnCode("");
    setSelectedCode("");
    setLocations([]);
    setFloorConfigs([]);
    setOccupiedLocations([]);
  };

  // ===== DELIVERY DATABASE - CORE FUNCTIONS =====
  const loadDeliveryDetails = async (deliveryId: string) => {
    try {
      const result = await getDeliveryDetails(deliveryId, user?.company_uuid);
      setIsLoading(false);

      if (result.success && result.data) {
        const deliveryData = result.data;

        // Set formData first and wait for state update
        setFormData(deliveryData);

        if (deliveryData.inventory_items) {
          const inventoryUuids = [...new Set(
            Object.values(deliveryData.inventory_items).map((item: any) => item.inventory_uuid)
          )];

          setSelectedInventoryUuids(inventoryUuids);

          const inventoryItemUuids = Object.keys(deliveryData.inventory_items);
          const locations = Object.values(deliveryData.inventory_items).map((item: any) => item.location).filter(Boolean);

          setSelectedInventoryItems(inventoryItemUuids);
          setPrevSelectedInventoryItems(inventoryItemUuids);
          setLocations(locations);

          if (locations.length > 0) {
            const firstLoc = locations[0];
            setSelectedFloor(firstLoc.floor ?? null);
            setSelectedColumnCode(parseColumn(firstLoc.column ?? null) || "");
            setSelectedColumn(firstLoc.column ?? null);
            setSelectedRow(firstLoc.row ?? null);
            setSelectedDepth(firstLoc.depth ?? null);
            setSelectedGroup(firstLoc.group ?? null);
          }

          for (const inventoryUuid of inventoryUuids) {
            try {
              await loadInventoryItemsWithCurrentData(inventoryUuid, true, deliveryData, deliveryId);
            } catch (error) {
              console.error(`Error loading inventory items for ${inventoryUuid}:`, error);
            }
          }
        } else {
          setSelectedInventoryUuids([]);
          setSelectedInventoryItems([]);
          setPrevSelectedInventoryItems([]);
          setLocations([]);
        }

        if (deliveryData.operator_info && Array.isArray(deliveryData.operator_info)) {
          setSelectedOperators(deliveryData.operator_info);
        } else {
          setSelectedOperators([]);
        }

        return deliveryData;
      } else {
        console.error("Failed to load delivery details:", result.error);
        return null;
      }
    } catch (error) {
      console.error("Error loading delivery details:", error);
      return null;
    }
  };

  // Create a version that uses current formData
  const loadInventoryItemsWithCurrentData = useCallback(async (inventoryUuid: string, forceReload: boolean = false, currentFormData?: any, currentSelectedDeliveryId?: string | null) => {
    if (!inventoryUuid) {
      return Promise.resolve();
    }

    if (!forceReload && loadedInventoryUuids.has(inventoryUuid)) {
      return Promise.resolve();
    }

    setIsLoadingInventoryItems(true);
    try {


      const result = await getInventoryItem(
        inventoryUuid,
        (currentFormData || formData).status === "DELIVERED" || (currentFormData || formData).status === "CANCELLED",
        currentSelectedDeliveryId || selectedDeliveryId || undefined
      );

      console.log("Loaded inventory items for", inventoryUuid, result);

      if (result.success && result.data.inventory_items) {
        const itemsWithInventoryInfo = result.data.inventory_items.map((item: any) => ({
          ...item,
          inventory_uuid: inventoryUuid,
          inventory_name: result.data.name || 'Unknown'
        }));

        const inventoryItemsWithIds = itemsWithInventoryInfo.map((item: any, index: number) => ({
          ...item,
          id: index + 1,
        }));

        setInventoryItems(prev => {
          const filteredItems = prev.filter(item => item.inventory_uuid !== inventoryUuid);
          return [...filteredItems, ...inventoryItemsWithIds];
        });

        setLoadedInventoryUuids(prev => new Set([...prev, inventoryUuid]));
        setNextItemId(prev => Math.max(prev, inventoryItemsWithIds.length + 1));

        return Promise.resolve();
      }
    } catch (error) {
      console.error("Error loading inventory items:", error);
      return Promise.reject(error);
    } finally {
      setIsLoadingInventoryItems(false);
    }
  }, [formData, selectedDeliveryId, loadedInventoryUuids]);


  const handleStatusChange = async (status: string) => {
    if (!selectedDeliveryId) return { error: "No delivery selected" };

    if (!user?.is_admin) {
      if (formData.status !== "IN_TRANSIT" || status !== "DELIVERED") {
        return { error: "You can only change the status to DELIVERED when the item is IN_TRANSIT." };
      }
    }

    if (status === "DELIVERED" && formData.inventory_items) {
      const inventoryItemCount = Object.keys(formData.inventory_items).length;
      if (inventoryItemCount === 0) {
        return { error: "Please assign warehouse locations for all selected inventory items before marking as delivered." };
      }
    }

    setIsLoading(true);

    try {
      const result = await updateDeliveryStatusWithItems(
        selectedDeliveryId,
        status,
        user?.company_uuid
      );

      if (result.success) {
        setFormData(prev => ({
          ...prev,
          status: result.data.status,
          status_history: result.data.status_history,
          updated_at: result.data.updated_at,
          inventory_items: result.data.inventory_items || prev.inventory_items
        }));

        setPrevSelectedInventoryItems(selectedInventoryItems);

        await refreshOccupiedLocations();
        return { error: null };
      } else {
        return { error: result.error || "Failed to update delivery status" };
      }
    } catch (error) {
      console.error("Error updating status:", error);
      return { error: `Failed to update status: ${(error as Error).message}` };
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.is_admin) {
      return;
    }

    const newErrors: Record<string, string> = {};

    if (formData.status === "IN_TRANSIT") {
      const inventoryItems = formData.inventory_items || {};
      const inventoryItemUuids = selectedInventoryItems;

      if (inventoryItemUuids.length === 0) {
        newErrors.inventory_item_uuids = "Please select at least one inventory item";
      }

      if (inventoryItemUuids.length > 0) {
        const missingLocations = inventoryItemUuids.filter(uuid =>
          !inventoryItems[uuid]?.location ||
          inventoryItems[uuid].location.floor === undefined ||
          inventoryItems[uuid].location.floor === null
        );

        if (missingLocations.length > 0) {
          newErrors.locations = `Please assign a location for all selected inventory items. Missing locations for ${missingLocations.length} item(s).`;
        }
      }
    } else {
      const inventoryItems = formData.inventory_items || {};
      const inventoryItemUuids = selectedInventoryItems;

      if (selectedInventoryUuids.length === 0) {
        newErrors.inventory_uuids = "Please select at least one inventory";
      }
      if (inventoryItemUuids.length === 0) {
        newErrors.inventory_item_uuids = "Please select at least one inventory item";
      }
      if (!formData.delivery_address) newErrors.delivery_address = "Delivery address is required";
      if (!formData.delivery_date) newErrors.delivery_date = "Delivery date is required";
      if (!formData.warehouse_uuid) newErrors.warehouse_uuid = "Please select a warehouse";

      if (inventoryItemUuids.length > 0) {
        const missingLocations = inventoryItemUuids.filter(uuid =>
          !inventoryItems[uuid]?.location ||
          inventoryItems[uuid].location.floor === undefined ||
          inventoryItems[uuid].location.floor === null
        );

        if (missingLocations.length > 0) {
          newErrors.locations = `Please assign a location for all selected inventory items. Missing locations for ${missingLocations.length} item(s).`;
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      let result;

      if (selectedDeliveryId) {
        if (formData.status === "IN_TRANSIT") {
          result = await updateDeliveryWithItems(
            selectedDeliveryId,
            formData.inventory_items || {},
            undefined,
            undefined,
            formData.operator_uuids,
            undefined,
            undefined,
            user.company_uuid
          );
        } else {
          result = await updateDeliveryWithItems(
            selectedDeliveryId,
            formData.inventory_items || {},
            formData.delivery_address,
            formData.delivery_date,
            formData.operator_uuids,
            formData.notes,
            formData.name,
            user.company_uuid
          );
        }
      } else {
        // Fix: Pass the delivery name when creating a new delivery
        result = await createDeliveryWithItems(
          user.uuid,
          user.company_uuid,
          formData.warehouse_uuid as string,
          formData.inventory_items || {},
          formData.delivery_address || "",
          formData.delivery_date || "",
          formData.operator_uuids || [],
          formData.notes || "",
          deliveryNameValue
        );
      }

      if (result.success && result.data) {
        const newDelivery = result.data;

        setTimeout(() => {
          if (!selectedDeliveryId && newDelivery?.uuid) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("deliveryId", newDelivery.uuid);
            router.push(`?${params.toString()}`, { scroll: false });
          }
          setErrors({});
        }, 500);

        setFormData(prev => ({
          ...prev,
          ...newDelivery
        }));

        setPrevSelectedInventoryItems(selectedInventoryItems);

        await refreshOccupiedLocations();

      } else {
        setErrors({
          delivery: `Failed to ${selectedDeliveryId ? 'update' : 'create'} delivery. Please try again.`
        });
      }
    } catch (error) {
      console.error(`Error ${selectedDeliveryId ? 'updating' : 'creating'} delivery:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWarehouseChange = async (warehouseUuid: string) => {
    const selectedWarehouse = warehouses.find(wh => wh.uuid === warehouseUuid);
    if (selectedWarehouse) {
      const warehouseLayout = selectedWarehouse.layout || [];
      setFloorConfigs(warehouseLayout);

      setFormData(prev => ({
        ...prev,
        delivery_address: selectedWarehouse.address!.fullAddress || "",
      }));

      const occupiedResult = await getOccupiedShelfLocations(selectedWarehouse.uuid || "");
      if (occupiedResult.success) {
        const filteredOccupiedLocations = (occupiedResult.data || []).filter(loc =>
          !shelfColorAssignments.some(
            assignment =>
              assignment.floor === loc.floor &&
              assignment.group === loc.group &&
              assignment.row === loc.row &&
              assignment.column === loc.column &&
              assignment.depth === loc.depth
          )
        );
        setOccupiedLocations(filteredOccupiedLocations);
      }
    } else {
      setFormData(prev => ({
        ...prev,
        delivery_address: ""
      }));
      resetWarehouseLocation();
    }
  };

  const refreshOccupiedLocations = async () => {
    if (!formData.warehouse_uuid) return;

    const occupiedResult = await getOccupiedShelfLocations(formData.warehouse_uuid);
    if (occupiedResult.success) {
      const filteredOccupiedLocations = (occupiedResult.data || []).filter(loc =>
        !shelfColorAssignments.some(
          assignment =>
            assignment.floor === loc.floor &&
            assignment.group === loc.group &&
            assignment.row === loc.row &&
            assignment.column === loc.column &&
            assignment.depth === loc.depth
        )
      );
      setOccupiedLocations(filteredOccupiedLocations);
    }
  };

  const autoAssignShelfLocations = async () => {
    if (isWarehouseNotSet() || isFloorConfigNotSet() || selectedInventoryItems.length === 0) {
      return;
    }

    setIsAutoAssigning(true);
    try {
      // UPDATED: Get current delivery's assigned locations using inventory item UUIDs
      const currentDeliveryLocations = selectedInventoryItems
        .map(itemUuid => formData.inventory_items?.[itemUuid]?.location)
        .filter((location): location is ShelfLocation => location != null && location.floor !== undefined);

      const result = await suggestShelfLocations(
        formData.warehouse_uuid as string,
        selectedInventoryItems.length,
        undefined,
        currentDeliveryLocations,
      );

      if (result.success && result.data) {
        const { locations } = result.data;

        setLocations(locations);

        // UPDATED: Build inventory_items using inventory item UUIDs as keys
        setFormData(prev => ({
          ...prev,
          inventory_items: {
            ...prev.inventory_items,
            ...Object.fromEntries(selectedInventoryItems.map((uuid, index) => {
              const inventoryItem = inventoryItems.find(item => item.uuid === uuid);
              return [
                uuid, // Use inventory item UUID as key
                {
                  inventory_uuid: inventoryItem?.inventory_uuid || "",
                  group_id: inventoryItem?.group_id || null,
                  location: locations[index] || null
                }
              ];
            }))
          },
          inventory_item_uuids: selectedInventoryItems,
          locations: locations
        }));

        if (locations.length > 0) {
          setCurrentInventoryItemLocationIndex(0);
          const firstLocation = locations[0];

          setSelectedFloor(firstLocation.floor);
          setSelectedGroup(firstLocation.group);
          setSelectedRow(firstLocation.row);
          setSelectedColumn(firstLocation.column);
          setSelectedDepth(firstLocation.depth);
          setSelectedColumnCode(parseColumn(firstLocation.column) || "");
        }
      } else {
        console.error("Failed to auto-assign shelf locations:", result.error);
      }
    } catch (error) {
      console.error("Error auto-assigning shelf locations:", error);
    } finally {
      setIsAutoAssigning(false);
    }
  };

  const handleInventoryItemSelectionToggle = async (inventoryitemUuid: string, isSelected: boolean) => {
    let inventoryItem = inventoryItems.find(item => item.uuid === inventoryitemUuid);

    if (!inventoryItem) {
      console.error("Inventory item not found:", inventoryitemUuid);
      return;
    }

    const inventoryUuid = inventoryItem.inventory_uuid;
    if (!loadedInventoryUuids.has(inventoryUuid)) {
      await loadInventoryItemsWithCurrentData(inventoryUuid, false, formData, selectedDeliveryId);
      inventoryItem = inventoryItems.find(item => item.uuid === inventoryitemUuid);
      if (!inventoryItem) return;
    }

    // Check if this is an ON_DELIVERY item that doesn't belong to current delivery
    if (!isSelected && inventoryItem.status === 'ON_DELIVERY' && selectedDeliveryId) {
      const isAssignedToCurrentDelivery = formData.inventory_items?.[inventoryItem.uuid] ||
        prevSelectedInventoryItems.includes(inventoryItem.uuid) ||
        selectedInventoryItems.includes(inventoryItem.uuid);

      if (!isAssignedToCurrentDelivery) {
        console.warn("Item is already assigned to another delivery");
        return;
      }
    }

    setSelectedInventoryItems(prev => {
      let newSelectedItems;

      if (isSelected) {
        newSelectedItems = [...prev, inventoryitemUuid].filter((uuid, index, arr) => arr.indexOf(uuid) === index);
      } else {
        newSelectedItems = prev.filter(uuid => uuid !== inventoryitemUuid);
      }

      // UPDATED: Build inventory_items using inventory item UUIDs as keys
      const currentInventoryItems = formData.inventory_items || {};
      const newInventoryItems: Record<string, { inventory_uuid: string; group_id: string | null; location: any }> = {};

      newSelectedItems.forEach(uuid => {
        if (currentInventoryItems[uuid]) {
          newInventoryItems[uuid] = currentInventoryItems[uuid];
        } else {
          const item = inventoryItems.find(i => i.uuid === uuid);
          if (item) {
            // UPDATED: Use inventory item UUID as key, store group_id as nullable value
            newInventoryItems[uuid] = {
              inventory_uuid: item.inventory_uuid,
              group_id: item.group_id || null,
              location: {}
            };
          }
        }
      });

      setFormData(prev => ({
        ...prev,
        inventory_items: newInventoryItems
      }));

      const newLocationsArray = newSelectedItems.map(uuid =>
        newInventoryItems[uuid]?.location || {}
      ).filter(loc => loc && loc.floor !== undefined);

      setLocations(newLocationsArray);

      return newSelectedItems;
    });
  };


  const handleGroupSelectionToggle = async (groupId: string, inventoryUuid: string, isSelected: boolean) => {
    // Handle null/empty group_id case
    if (!groupId || groupId === '' || groupId === 'null') {
      // For items without groups, find individual items
      const individualItems = inventoryItems.filter(item =>
        item.inventory_uuid === inventoryUuid &&
        (!item.group_id || item.group_id === '' || item.group_id === null) &&
        (formData.status === 'DELIVERED' || formData.status === 'CANCELLED' ||
          (item.status !== 'IN_WAREHOUSE' && item.status !== 'USED'))
      );

      const availableIndividualItems = individualItems.filter(item => {
        const statusStyling = getInventoryItemStatusStyling(item);
        return !statusStyling.isDisabled;
      });

      for (const item of availableIndividualItems) {
        const isCurrentlySelected = selectedInventoryItems.includes(item.uuid);
        if (isSelected !== isCurrentlySelected) {
          await handleInventoryItemSelectionToggle(item.uuid, isSelected);
        }
      }
      return;
    }

    // Handle grouped items
    const groupItems = inventoryItems.filter(item =>
      item.group_id === groupId &&
      item.inventory_uuid === inventoryUuid &&
      (formData.status === 'DELIVERED' || formData.status === 'CANCELLED' ||
        (item.status !== 'IN_WAREHOUSE' && item.status !== 'USED'))
    );

    const availableGroupItems = groupItems.filter(item => {
      const statusStyling = getInventoryItemStatusStyling(item);
      return !statusStyling.isDisabled;
    });

    for (const item of availableGroupItems) {
      const isCurrentlySelected = selectedInventoryItems.includes(item.uuid);
      if (isSelected !== isCurrentlySelected) {
        await handleInventoryItemSelectionToggle(item.uuid, isSelected);
      }
    }
  };

  const handleSelectAllToggle = (isSelected: boolean) => {
    const displayItems = getDisplayInventoryItemsList();

    if (isSelected) {
      const availableItems = displayItems.filter(item => {
        const statusStyling = getInventoryItemStatusStyling(item);
        return !statusStyling.isDisabled;
      });

      const allItemsToSelect: string[] = [];

      availableItems.forEach(item => {
        const groupedItems = getGroupedInventoryItems();
        const groupInfo = getGroupInfo(item, groupedItems);

        if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
          const groupItems = inventoryItems.filter(groupItem =>
            groupItem.group_id === groupInfo.groupId &&
            (formData.status === 'DELIVERED' || formData.status === 'CANCELLED' ||
              (groupItem.status !== 'IN_WAREHOUSE' && groupItem.status !== 'USED'))
          );
          groupItems.forEach(groupItem => {
            const groupItemStatusStyling = getInventoryItemStatusStyling(groupItem);
            if (!groupItemStatusStyling.isDisabled && !allItemsToSelect.includes(groupItem.uuid)) {
              allItemsToSelect.push(groupItem.uuid);
            }
          });
        } else {
          if (!allItemsToSelect.includes(item.uuid)) {
            allItemsToSelect.push(item.uuid);
          }
        }
      });

      setSelectedInventoryItems(allItemsToSelect);

      const newInventoryLocations: Record<string, ShelfLocation> = {};
      allItemsToSelect.forEach(uuid => {
        const existingLocation = formData.inventory_items?.[uuid]?.location || null;
        if (existingLocation) {
          newInventoryLocations[uuid] = existingLocation;
        }
      });

      // UPDATED: Build inventory_items using inventory item UUIDs as keys
      setFormData(prev => ({
        ...prev,
        inventory_items: {
          ...prev.inventory_items,
          ...Object.fromEntries(allItemsToSelect.map(uuid => [
            uuid, // Use inventory item UUID as key
            {
              inventory_uuid: inventoryItems.find(item => item.uuid === uuid)?.inventory_uuid || "",
              group_id: inventoryItems.find(item => item.uuid === uuid)?.group_id || null,
              location: newInventoryLocations[uuid] || null
            }
          ]))
        },
        inventory_item_uuids: allItemsToSelect,
        locations: Object.values(newInventoryLocations).filter(loc => loc !== null && loc.floor !== undefined)
      }));

      const newLocationsArray = Object.values(newInventoryLocations).filter(loc => loc !== null && loc.floor !== undefined);
      setLocations(newLocationsArray);

    } else {
      setSelectedInventoryItems([]);
      setFormData(prev => ({
        ...prev,
        inventory_item_uuids: [],
        locations: []
      }));
      setLocations([]);
    }
  };

  const _performInventorySelectionLogic = (inventoryUuid: string, isSelected: boolean) => {
    const currentInventoryItems = inventoryItems;
    const inventoryItemsForThisInventory = currentInventoryItems.filter(item => item.inventory_uuid === inventoryUuid);
    const displayItems = getDisplayInventoryItemsListForInventory(inventoryUuid);

    if (isSelected) {
      const availableItems = displayItems.filter(item => {
        const statusStyling = getInventoryItemStatusStyling(item);
        return !statusStyling.isDisabled;
      });

      const itemsToSelect: string[] = [];
      availableItems.forEach(item => {
        const groupedItems = getGroupedInventoryItems();
        const groupInfo = getGroupInfo(item, groupedItems);

        if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
          const groupItems = inventoryItemsForThisInventory.filter(groupItem =>
            groupItem.group_id === groupInfo.groupId &&
            (formData.status === 'DELIVERED' || formData.status === 'CANCELLED' ||
              (groupItem.status !== 'IN_WAREHOUSE' && groupItem.status !== 'USED'))
          );
          groupItems.forEach(groupItem => {
            const groupItemStatusStyling = getInventoryItemStatusStyling(groupItem);
            if (!groupItemStatusStyling.isDisabled && !itemsToSelect.includes(groupItem.uuid)) {
              itemsToSelect.push(groupItem.uuid);
            }
          });
        } else {
          if (!itemsToSelect.includes(item.uuid)) {
            itemsToSelect.push(item.uuid);
          }
        }
      });

      setSelectedInventoryItems(prevSelected => {
        const newSelectedItems = Array.from(new Set([...prevSelected, ...itemsToSelect]));
        setFormData(prevFd => {
          const newFdInventoryItems = { ...prevFd.inventory_items };

          // UPDATED: Use inventory item UUIDs as keys
          itemsToSelect.forEach(uuid => {
            const itemDetails = currentInventoryItems.find(i => i.uuid === uuid);
            newFdInventoryItems[uuid] = {
              inventory_uuid: itemDetails?.inventory_uuid || inventoryUuid,
              group_id: itemDetails?.group_id || null,
              location: itemDetails?.location || null
            };
          });

          const derivedLocations = Object.values(newFdInventoryItems)
            .map((item: any) => item.location)
            .filter(loc => loc && typeof loc.floor !== 'undefined');
          setLocations(derivedLocations);

          return {
            ...prevFd,
            inventory_items: newFdInventoryItems,
            inventory_item_uuids: newSelectedItems,
          };
        });
        return newSelectedItems;
      });
    } else {
      const itemsToDeselect = inventoryItemsForThisInventory.map(item => item.uuid);
      setSelectedInventoryItems(prevSelected => {
        const newSelectedItems = prevSelected.filter(uuid => !itemsToDeselect.includes(uuid));
        setFormData(prevFd => {
          const newFdInventoryItems = { ...prevFd.inventory_items };

          // UPDATED: Remove by inventory item UUID keys
          itemsToDeselect.forEach(uuid => {
            delete newFdInventoryItems[uuid];
          });

          const derivedLocations = Object.values(newFdInventoryItems)
            .map((item: any) => item.location)
            .filter(loc => loc && typeof loc.floor !== 'undefined');
          setLocations(derivedLocations);

          return {
            ...prevFd,
            inventory_items: newFdInventoryItems,
            inventory_item_uuids: newSelectedItems,
          };
        });
        return newSelectedItems;
      });
    }
  };

  const handleInventorySelectAllToggle = async (inventoryUuid: string, isSelected: boolean) => {
    if (!loadedInventoryUuids.has(inventoryUuid)) {
      setPendingInventorySelection({ inventoryUuid, isSelected });
      try {
        await loadInventoryItemsWithCurrentData(inventoryUuid, false, formData, selectedDeliveryId);
      } catch (error) {
        console.error("Error loading inventory items for selection:", error);
        setPendingInventorySelection(null);
      }
    } else {
      _performInventorySelectionLogic(inventoryUuid, isSelected);
    }
  };

  const toggleInventoryExpansion = (inventoryUuid: string) => {
    setExpandedInventories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(inventoryUuid)) {
        newSet.delete(inventoryUuid);
      } else {
        newSet.add(inventoryUuid);
      }
      return newSet;
    });
  };

  const handleAccordionSelectionChange = useCallback(async (keys: any) => {
    const newExpandedKeys = keys as Set<string>;
    setExpandedInventories(newExpandedKeys);

    const newlyExpanded = Array.from(newExpandedKeys).filter(uuid =>
      !expandedInventories.has(uuid) && !loadedInventoryUuids.has(uuid)
    );

    for (const inventoryUuid of newlyExpanded) {
      try {
        await loadInventoryItemsWithCurrentData(inventoryUuid, false, formData, selectedDeliveryId);
      } catch (error) {
        console.error(`Error loading items for inventory ${inventoryUuid}:`, error);
      }
    }
  }, [expandedInventories, loadedInventoryUuids, loadInventoryItemsWithCurrentData]);

  const handleAddOperator = (operatorUuid: string) => {
    if (!operatorUuid) return;

    const operatorToAdd = operators.find(op => op.uuid === operatorUuid);
    if (!operatorToAdd) return;

    if (selectedOperators.some(op => op.uuid === operatorUuid)) return;

    const newSelectedOperators = [...selectedOperators, operatorToAdd];
    setSelectedOperators(newSelectedOperators);

    setFormData(prev => ({
      ...prev,
      operator_uuids: newSelectedOperators.map(op => op.uuid)
    }));

    setErrors(prev => {
      const { operator_uuids, ...rest } = prev;
      return rest;
    });
  };

  const handleRemoveOperator = (operatorUuid: string) => {
    const newSelectedOperators = selectedOperators.filter(op => op.uuid !== operatorUuid);
    setSelectedOperators(newSelectedOperators);

    setFormData(prev => ({
      ...prev,
      operator_uuids: newSelectedOperators.map(op => op.uuid)
    }));
  };

  const handleNewDelivery = () => {
    setIsLoading(searchParams.get("deliveryId") !== null);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("deliveryId");
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleSelectDelivery = (deliveryId: string) => {
    setIsLoading(searchParams.get("deliveryId") !== deliveryId);

    const params = new URLSearchParams(searchParams.toString());
    params.set("deliveryId", deliveryId);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleGoToWarehouse = (warehouseUuid: string) => {
    router.push(`/home/warehouses?warehouseId=${warehouseUuid}`);
  };

  const handleAutoSelectChange = async (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));

    if (name === "warehouse_uuid" && value) {
      await handleWarehouseChange(value);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    console.log(`Input change - Name: ${name}, Value: ${value}`);
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const renderInventoryItemWithStatus = (item: any, isSelected: boolean, showAsGroup: boolean = false, groupId?: string, inventoryUuid?: string) => {
    const statusStyling = getInventoryItemStatusStyling(item);

    const groupedItems = getGroupedInventoryItems();
    const groupInfo = getGroupInfo(item, groupedItems);

    const displayItems = getDisplayInventoryItemsList();
    const displayIndex = displayItems.findIndex(displayItem => displayItem.uuid === item.uuid);
    const displayNumber = displayIndex + 1;

    let groupStats = null;
    if (showAsGroup && groupId) {
      const groupItems = inventoryItems.filter(groupItem =>
        groupItem.group_id === groupId &&
        groupItem.inventory_uuid === inventoryUuid
      );
      const availableGroupItems = groupItems.filter(groupItem => {
        const groupItemStatusStyling = getInventoryItemStatusStyling(groupItem);
        return !groupItemStatusStyling.isDisabled;
      });
      const selectedGroupItems = groupItems.filter(groupItem =>
        selectedInventoryItems.includes(groupItem.uuid)
      );

      groupStats = {
        total: groupItems.length,
        available: availableGroupItems.length,
        selected: selectedGroupItems.length,
      };
    } else if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
      const groupItems = inventoryItems.filter(groupItem => groupItem.group_id === groupInfo.groupId);
      const availableGroupItems = groupItems.filter(groupItem => {
        const groupItemStatusStyling = getInventoryItemStatusStyling(groupItem);
        return !groupItemStatusStyling.isDisabled;
      });
      const selectedGroupItems = groupItems.filter(groupItem => selectedInventoryItems.includes(groupItem.uuid));

      groupStats = {
        total: groupItems.length,
        available: availableGroupItems.length,
        selected: selectedGroupItems.length,
      };
    }

    const shouldShowCheckbox = () => {
      if (formData.status !== 'PENDING') {
        return false;
      }

      if (['ON_DELIVERY', 'IN_WAREHOUSE', 'USED'].includes(item.status)) {
        const isPartOfCurrentDelivery = formData.inventory_items?.[item.uuid] ||
          prevSelectedInventoryItems.includes(item.uuid) ||
          selectedInventoryItems.includes(item.uuid);

        return isPartOfCurrentDelivery || formData.status === 'PENDING';
      }

      return true;
    };

    // Calculate the actual selection state for group checkboxes
    let actualIsSelected = isSelected;
    if (showAsGroup && groupId && inventoryUuid) {
      const groupSelectionState = getGroupItemSelectionState(groupId, inventoryUuid);
      actualIsSelected = groupSelectionState.isChecked;
    }

    return (
      <div className={`rounded-lg ${statusStyling.isDisabled ? 'opacity-60' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {shouldShowCheckbox() && (
              <Checkbox
                isSelected={actualIsSelected}
                onValueChange={(checked) => {
                  if (showAsGroup && groupId && inventoryUuid) {
                    handleGroupSelectionToggle(groupId, inventoryUuid, checked);
                  } else {
                    // For individual items, use the item's own UUID
                    handleInventoryItemSelectionToggle(item.uuid, checked);
                  }
                }}
                isDisabled={statusStyling.isDisabled}
                {...(showAsGroup && groupId && inventoryUuid && {
                  isIndeterminate: getGroupItemSelectionState(groupId, inventoryUuid).isIndeterminate
                })}
              />
            )}
            <div>
              <p className="font-medium">
                {showAsGroup
                  ? `Group ${displayNumber}`
                  : inventoryViewMode === 'grouped' && groupInfo.isGroup
                    ? `Group ${displayNumber}`
                    : `Item ${inventoryViewMode === 'flat' ? item.id : displayNumber}`
                }
              </p>
              <p className="text-sm text-default-500">
                {item.unit_value} {item.unit}
                {groupStats && (
                  <span className="ml-2 text-xs">
                    ({groupStats.selected}/{groupStats.total} selected)
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Chip
              color="default"
              size="sm"
              variant="flat"
              className="font-mono text-xs"
            >
              {item.item_code || 'No Code'}
            </Chip>

            <Chip
              color={getStatusColor(item.status)}
              size="sm"
              variant="flat"
            >
              {formatStatus(item.status || 'Unknown')}
            </Chip>
            {statusStyling.isDisabled && statusStyling.disabledReason && (
              <Tooltip content={statusStyling.disabledReason}>
                <Icon icon="mdi:information-outline" className="text-warning" />
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Add this helper function near the other helper functions (around line 300)
  const getGroupItemSelectionState = (groupId: string, inventoryUuid: string) => {
    let groupItems;

    // Handle items without groups
    if (!groupId || groupId === '' || groupId === 'null') {
      groupItems = inventoryItems.filter(item =>
        item.inventory_uuid === inventoryUuid &&
        (!item.group_id || item.group_id === '' || item.group_id === null) &&
        (formData.status === 'DELIVERED' || formData.status === 'CANCELLED' ||
          (item.status !== 'IN_WAREHOUSE' && item.status !== 'USED'))
      );
    } else {
      // Handle grouped items
      groupItems = inventoryItems.filter(item =>
        item.group_id === groupId &&
        item.inventory_uuid === inventoryUuid &&
        (formData.status === 'DELIVERED' || formData.status === 'CANCELLED' ||
          (item.status !== 'IN_WAREHOUSE' && item.status !== 'USED'))
      );
    }

    const availableGroupItems = groupItems.filter(item => {
      const statusStyling = getInventoryItemStatusStyling(item);
      return !statusStyling.isDisabled;
    });

    const selectedGroupItems = availableGroupItems.filter(item =>
      selectedInventoryItems.includes(item.uuid)
    );

    if (availableGroupItems.length === 0) {
      return { isChecked: false, isIndeterminate: false };
    }

    if (selectedGroupItems.length === 0) {
      return { isChecked: false, isIndeterminate: false };
    } else if (selectedGroupItems.length === availableGroupItems.length) {
      return { isChecked: true, isIndeterminate: false };
    } else {
      return { isChecked: false, isIndeterminate: true };
    }
  };

  // Add this function to handle group item selection
  const handleGroupItemSelectionToggle = async (itemUuid: string, isSelected: boolean, groupId: string) => {
    await handleInventoryItemSelectionToggle(itemUuid, isSelected);
  };
















  // ===== 3D LOCATION MODAL FUNCTIONS =====

  const handle3DLocationConfirm = (location: ShelfLocation) => {
    const newLocations = [...locations];
    newLocations[currentInventoryItemLocationIndex] = location;
    setLocations(newLocations);

    const currentInventoryItemUuid = selectedInventoryItems[currentInventoryItemLocationIndex];
    if (currentInventoryItemUuid) {
      const newInventoryItems = { ...formData.inventory_items };
      if (newInventoryItems[currentInventoryItemUuid]) {
        newInventoryItems[currentInventoryItemUuid] = {
          ...newInventoryItems[currentInventoryItemUuid],
          location: location
        };
      }

      setFormData(prev => ({
        ...prev,
        inventory_items: newInventoryItems
      }));
    }

    setSelectedFloor(location.floor ?? null);
    setSelectedColumn(location.column ?? null);
    setSelectedColumnCode(parseColumn(location.column ?? null) || "");
    setSelectedRow(location.row ?? null);
    setSelectedGroup(location.group ?? null);
    setSelectedDepth(location.depth ?? null);
    setSelectedCode(location.code || "");
  };


  const handleOpenModal = () => {
    onOpen();
  };

  const getCurrentLocation = (): ShelfLocation | undefined => {
    if (currentInventoryItemLocationIndex >= 0 &&
      currentInventoryItemLocationIndex < selectedInventoryItems.length &&
      formData.inventory_items) {

      const currentItemUuid = selectedInventoryItems[currentInventoryItemLocationIndex];
      const currentLocation = formData.inventory_items[currentItemUuid]?.location;

      if (currentLocation) {
        return {
          floor: currentLocation.floor ?? undefined,
          column: currentLocation.column ?? undefined,
          row: currentLocation.row ?? undefined,
          group: currentLocation.group ?? undefined,
          depth: currentLocation.depth ?? undefined,
          code: currentLocation.code || ""
        };
      }
    }

    return undefined;
  };

  // ===== QR CODE FUNCTIONS =====
  const generateDeliveryUrl = (deliveryId?: string, autoAccept: boolean = false, showOptions: boolean = true) => {
    const targetDeliveryId = deliveryId || selectedDeliveryId;
    if (!targetDeliveryId || !formData) return "https://ropic.vercel.app/home/search";

    const baseUrl = "https://ropic.vercel.app/home/search";
    const params = new URLSearchParams({
      q: targetDeliveryId,
      ...(autoAccept && { deliveryAutoAccept: "true" }),
      ...(showOptions && { showOptions: "true" })
    });

    return `${baseUrl}?${params.toString()}`;
  };

  const updateQrCodeUrl = (autoAccept: boolean, showOptions?: boolean) => {
    const currentShowOptions = showOptions !== undefined ? showOptions : qrCodeData.showOptions;
    setQrCodeData(prev => ({
      ...prev,
      autoAccept,
      ...(showOptions !== undefined && { showOptions }),
      url: generateDeliveryUrl(prev.deliveryId, autoAccept, currentShowOptions),
      description: `Scan this code to view delivery details for ${prev.deliveryName}${autoAccept ? '. This will automatically accept the delivery when scanned.' : '.'}`
    }));
  };

  const updateShowOptions = (showOptions: boolean) => {
    setQrCodeData(prev => ({
      ...prev,
      showOptions,
      url: generateDeliveryUrl(prev.deliveryId, prev.autoAccept, showOptions)
    }));
  };

  const handleShowDeliveryQR = () => {
    if (!selectedDeliveryId || !formData) return;

    const inventoryNames = selectedInventoryUuids
      .map(uuid => inventoryItems.find(item => item.uuid === uuid)?.name)
      .filter(Boolean);
    const deliveryName = inventoryNames.length > 0
      ? `Delivery of ${inventoryNames.join(', ')}`
      : 'Delivery';

    setQrCodeData({
      url: generateDeliveryUrl(selectedDeliveryId, false, true),
      title: "Delivery QR Code",
      description: `Scan this code to view delivery details for ${deliveryName}.`,
      deliveryId: selectedDeliveryId,
      deliveryName: deliveryName,
      autoAccept: false,
      showOptions: true
    });
    setShowQrCode(true);
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
          setValidationError("Failed to process image");
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
          setValidationError("No QR code found in the image");
        }

        setIsProcessingImage(false);
        URL.revokeObjectURL(objectUrl);
      };

      img.onerror = () => {
        setValidationError("Failed to load image");
        setIsProcessingImage(false);
        URL.revokeObjectURL(objectUrl);
      };

      img.src = objectUrl;
    } catch (error) {
      console.error("Error processing QR image:", error);
      setValidationError("Failed to process the uploaded image");
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

        if (selectedDeliveryId === deliveryUuid) {
          setFormData(prev => ({
            ...prev,
            status: "DELIVERED",
            status_history: result.data.status_history,
            updated_at: result.data.updated_at
          }));

        }

        setValidationError("");
        setValidationSuccess(true);
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

  // Function to automatically validate when text is pasted
  const handleDeliveryPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');

    if (pastedText.trim()) {
      // Set the pasted text
      setDeliveryInput(pastedText);

      // Validate instantly only when pasted
      setTimeout(() => {
        handlePasteLinkAccept(pastedText);
      }, 100);
    }
  };



  // === PDF GENERATION FUNCTIONS ===
  const handlePdfExport = async (data: any) => {
    setIsPdfGenerating(true);

    try {
      // Get selected deliveries
      const deliveriesToExport = data.selectedItems.length > 0
        ? data.allFilteredItems.filter((item: { uuid: any; }) => data.selectedItems.includes(item.uuid))
        : data.allFilteredItems;

      // Prepare deliveries with QR URLs and warehouse names
      const preparedDeliveries = deliveriesToExport.map((delivery: { uuid: string; warehouse_uuid: string; delivery_date: any; inventory_uuid: any; }) => {
        // Generate QR URL for each delivery with options
        const baseUrl = "https://ropic.vercel.app/home/search";
        const params = new URLSearchParams();

        params.set('q', delivery.uuid);

        if (data.exportOptions.includeAutoAccept) {
          params.set('deliveryAutoAccept', 'true');
        }

        if (data.exportOptions.includeShowOptions) {
          params.set('showOptions', 'true');
        }

        const qrUrl = `${baseUrl}?${params.toString()}`;

        // Find warehouse name
        const warehouse = warehouses.find(w => w.uuid === delivery.warehouse_uuid);
        const warehouseName = warehouse?.name || 'Unknown Warehouse';

        return {
          ...delivery,
          qrUrl,
          deliveryDate: delivery.delivery_date,
          itemName: inventoryItems.find(i => i.uuid === delivery.inventory_uuid)?.name || 'Unknown Item',
          warehouse_name: warehouseName
        };
      });

      // Get company data including logo
      const companyData = await getUserCompanyDetails(user.uuid);

      let companyLogoUrl = null;
      if (companyData?.data?.logo_url && !companyData?.data?.logo_url.error) {
        companyLogoUrl = companyData.data.logo_url;
      }

      // Generate PDF with selected page size
      const pdfBlob = await generatePdfBlob({
        deliveries: preparedDeliveries,
        companyName: companyData?.data?.name || "Your Company",
        companyLogoUrl: companyLogoUrl,
        dateGenerated: new Date().toLocaleString(),
        pageSize: data.exportOptions.pageSize
      });

      // Create download link
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Delivery_QR_Codes_${data.exportOptions.pageSize}_${new Date().toISOString().split('T')[0]}_${new Date().toTimeString().split(' ')[0].replace(/:/g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error generating delivery QR PDF:", error);
    } finally {
      setIsPdfGenerating(false);
    }
  };












































  // Use an effect to update the assignments when locations or currentInventoryItemLocationIndex change
  useEffect(() => {
    const assignments: Array<ShelfSelectorColorAssignment> = [];

    // Get the currently focused inventoryitem location
    const currentLocation = currentInventoryItemLocationIndex >= 0 && locations && locations[currentInventoryItemLocationIndex]
      ? locations[currentInventoryItemLocationIndex]
      : null;

    // 1. Add all selected inventoryitem locations as secondary color, except the current one
    if (locations && locations.length > 0) {
      locations.forEach((location, index) => {
        if (location && location.floor !== undefined) {
          // Skip the currently focused location as it will be added as tertiary later
          if (index === currentInventoryItemLocationIndex) {
            return;
          }
          assignments.push({
            floor: location.floor,
            group: location.group,
            row: location.row,
            column: location.column,
            depth: location.depth,
            colorType: 'secondary'
          });
        }
      });
    }

    // 2. Add the currently focused inventoryitem location as tertiary 
    if (currentLocation && currentLocation.floor !== undefined) {
      assignments.push({
        floor: currentLocation.floor,
        group: currentLocation.group,
        row: currentLocation.row,
        column: currentLocation.column,
        depth: currentLocation.depth,
        colorType: 'tertiary'
      });
    }

    // Update the state with the new assignments
    setShelfColorAssignments(assignments);
  }, [locations, currentInventoryItemLocationIndex]);

  // Add this useEffect to focus on the textarea when modal opens
  useEffect(() => {
    if (showAcceptDeliveryModal && acceptDeliveryTab === "paste-link") {
      // Short timeout to ensure the modal is rendered before focusing
      setTimeout(() => {
        const input = document.querySelector('[placeholder="Paste delivery UUID or URL here..."]') as HTMLInputElement;
        input?.focus();
      }, 100);
    }
  }, [showAcceptDeliveryModal, acceptDeliveryTab]);

  useEffect(() => {
    // Refresh occupied locations when shelf color assignments change
    if (formData.warehouse_uuid && shelfColorAssignments.length >= 0) {
      refreshOccupiedLocations();
    }
  }, [shelfColorAssignments, formData.warehouse_uuid]);

  useEffect(() => {
    // When the delivery status changes to DELIVERED, we want to ensure location fields are ready
    // Skip this effect for already delivered items that are just being viewed
    if (formData.status === "DELIVERED" &&
      // Add this condition to prevent the infinite loop for already delivered items
      !selectedDeliveryId &&
      selectedFloor !== null &&
      selectedColumn !== null &&
      selectedRow !== null &&
      selectedGroup !== null) {

      // Create the location object for current inventoryitem
      const location = {
        floor: selectedFloor,
        group: selectedGroup,
        row: selectedRow,
        column: selectedColumn !== null ? selectedColumn : 0,
        depth: selectedDepth !== null ? selectedDepth : 0
      };

      // Create new locations and location codes arrays if needed
      const newLocations = [...locations];

      // Update for current inventoryitem
      if (currentInventoryItemLocationIndex < newLocations.length) {
        newLocations[currentInventoryItemLocationIndex] = location;
      } else {
        newLocations.push(location);
      }

      // Update form data
      setFormData(prev => ({
        ...prev,
        locations: newLocations
      }));

      // Update local state
      setLocations(newLocations);
    }

  }, [selectedFloor, selectedColumn, selectedRow, selectedGroup, selectedDepth, formData.status, currentInventoryItemLocationIndex, locations, selectedDeliveryId]);

  // Add helper function to update locations when current index changes
  useEffect(() => {
    if (currentInventoryItemLocationIndex >= 0 &&
      currentInventoryItemLocationIndex < selectedInventoryItems.length &&
      formData.inventory_items) {

      // UPDATED: Use inventory item UUID to get location
      const currentItemUuid = selectedInventoryItems[currentInventoryItemLocationIndex];
      const currentLocation = formData.inventory_items[currentItemUuid]?.location;

      if (currentLocation) {
        setSelectedFloor(currentLocation.floor ?? null);
        setSelectedGroup(currentLocation.group ?? null);
        setSelectedRow(currentLocation.row ?? null);
        setSelectedColumn(currentLocation.column ?? null);
        setSelectedDepth(currentLocation.depth ?? null);
        setSelectedColumnCode(parseColumn(currentLocation.column ?? null) || "");
        setSelectedCode(currentLocation.code || "");
      }
    }
  }, [currentInventoryItemLocationIndex, selectedInventoryItems, formData.inventory_items]);


  // Update the effect that manages select all state to account for filtered items
  useEffect(() => {
    const displayItems = getDisplayInventoryItemsList();
    const availableItems = displayItems.filter(item => {
      const statusStyling = getInventoryItemStatusStyling(item);
      return !statusStyling.isDisabled;
    });

    if (availableItems.length === 0) {
      setIsSelectAllChecked(false);
      setIsSelectAllIndeterminate(false);
      return;
    }

    // Count how many available items are selected
    let selectedAvailableCount = 0;
    let totalAvailableCount = 0;

    availableItems.forEach(item => {
      const groupedItems = getGroupedInventoryItems();
      const groupInfo = getGroupInfo(item, groupedItems);

      if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
        const groupItems = inventoryItems.filter(groupItem =>
          groupItem.group_id === groupInfo.groupId &&
          // Filter out IN_WAREHOUSE and USED unless delivered
          (formData.status === 'DELIVERED' || formData.status === 'CANCELLED' ||
            (groupItem.status !== 'IN_WAREHOUSE' && groupItem.status !== 'USED'))
        );
        const availableGroupItems = groupItems.filter(groupItem => {
          const groupItemStatusStyling = getInventoryItemStatusStyling(groupItem);
          return !groupItemStatusStyling.isDisabled;
        });

        totalAvailableCount += availableGroupItems.length;
        selectedAvailableCount += availableGroupItems.filter(groupItem =>
          selectedInventoryItems.includes(groupItem.uuid)
        ).length;
      } else {
        totalAvailableCount += 1;
        if (selectedInventoryItems.includes(item.uuid)) {
          selectedAvailableCount += 1;
        }
      }
    });

    if (selectedAvailableCount === 0) {
      setIsSelectAllChecked(false);
      setIsSelectAllIndeterminate(false);
    } else if (selectedAvailableCount === totalAvailableCount) {
      setIsSelectAllChecked(true);
      setIsSelectAllIndeterminate(false);
    } else {
      setIsSelectAllChecked(false);
      setIsSelectAllIndeterminate(true);
    }
  }, [selectedInventoryItems, inventoryItems, inventoryViewMode, formData.status, formData.inventory_items, prevSelectedInventoryItems]);

  // UPDATED: Effect to handle pendingInventorySelection with better timing
  useEffect(() => {
    if (pendingInventorySelection && loadedInventoryUuids.has(pendingInventorySelection.inventoryUuid)) {
      // Use setTimeout to ensure inventoryItems state is properly updated
      setTimeout(() => {
        _performInventorySelectionLogic(pendingInventorySelection.inventoryUuid, pendingInventorySelection.isSelected);
        setPendingInventorySelection(null);
      }, 100);
    }
  }, [inventoryItems, loadedInventoryUuids, pendingInventorySelection]);

  // UPDATED: URL parameter handling
  useEffect(() => {
    const handleURLParams = async () => {
      setIsLoading(true);

      if (!user?.company_uuid || isLoadingItems || isLoadingWarehouses || warehouses.length === 0) return;

      const deliveryId = searchParams.get("deliveryId");

      if (deliveryId) {
        // Set selected delivery from URL and load detailed information
        setSelectedDeliveryId(deliveryId);

        // Reset states before loading
        setSelectedInventoryUuids([]);
        setSelectedInventoryItems([]);
        setLocations([]);
        setSelectedOperators([]);
        setDeliveryInput("");
        setLoadedInventoryUuids(new Set());
        setInventoryItems([]);
        resetWarehouseLocation();

        // Load delivery details which will handle formData update and inventory loading
        const deliveryData = await loadDeliveryDetails(deliveryId);

        if (deliveryData && deliveryData.warehouse_uuid) {
          await handleWarehouseChange(deliveryData.warehouse_uuid);
        }

      } else {
        // Reset form for new delivery
        setSelectedDeliveryId(null);
        const newFormData = {
          company_uuid: user.company_uuid,
          admin_uuid: user.uuid,
          inventory_items: {},
          delivery_address: "",
          delivery_date: format(new Date(), "yyyy-MM-dd"),
          notes: "",
          status: "PENDING",
          warehouse_uuid: null,
          operator_uuids: [],
          name: "" // Clear the name for new deliveries
        };

        setFormData(newFormData);

        // Reset all inventory-related states
        setSelectedInventoryUuids([]);
        setSelectedInventoryItems([]);
        setLocations([]);
        setSelectedOperators([]);
        setDeliveryInput("");
        setLoadedInventoryUuids(new Set());
        setInventoryItems([]);
        resetWarehouseLocation();

        // Load fresh inventory metadata for base URL
        try {
          const fetchedInventories = await getInventoryItems(user.company_uuid || "", true);
          if (fetchedInventories.success && fetchedInventories.data) {
            setInventories(fetchedInventories.data as any[]);
            // Show all inventories initially
            const allInventoryUuids = fetchedInventories.data.map((item: any) => item.uuid);
            setSelectedInventoryUuids(allInventoryUuids);
          }
        } catch (error) {
          console.error("Error loading inventories:", error);
        }

        setIsLoading(false);
      }
    };

    setExpandedInventories(new Set());
    handleURLParams();
  }, [searchParams, user?.company_uuid, isLoadingItems, isLoadingWarehouses, warehouses.length]);



  // Add effect to update per-inventory select all states
  useEffect(() => {
    const newStates: Record<string, { isChecked: boolean; isIndeterminate: boolean }> = {};

    selectedInventoryUuids.forEach(inventoryUuid => {
      // Only process if we have loaded the inventory items
      if (!loadedInventoryUuids.has(inventoryUuid)) {
        newStates[inventoryUuid] = { isChecked: false, isIndeterminate: false };
        return;
      }

      const inventoryItemsForThisInventory = getInventoryItemsForInventory(inventoryUuid);
      const displayItems = getDisplayInventoryItemsListForInventory(inventoryUuid);
      const availableItems = displayItems.filter(item => {
        const statusStyling = getInventoryItemStatusStyling(item);
        return !statusStyling.isDisabled;
      });

      if (availableItems.length === 0) {
        newStates[inventoryUuid] = { isChecked: false, isIndeterminate: false };
        return;
      }

      // Count how many available items are selected in this inventory
      let selectedAvailableCount = 0;
      let totalAvailableCount = 0;

      availableItems.forEach(item => {
        const groupedItems = getGroupedInventoryItems();
        const groupInfo = getGroupInfo(item, groupedItems);

        if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
          const groupItems = inventoryItemsForThisInventory.filter(groupItem =>
            groupItem.group_id === groupInfo.groupId &&
            // Filter out IN_WAREHOUSE and USED unless delivered
            (formData.status === 'DELIVERED' || formData.status === 'CANCELLED' ||
              (groupItem.status !== 'IN_WAREHOUSE' && groupItem.status !== 'USED'))
          );
          const availableGroupItems = groupItems.filter(groupItem => {
            const groupItemStatusStyling = getInventoryItemStatusStyling(groupItem);
            return !groupItemStatusStyling.isDisabled;
          });

          totalAvailableCount += availableGroupItems.length;
          selectedAvailableCount += availableGroupItems.filter(groupItem =>
            selectedInventoryItems.includes(groupItem.uuid)
          ).length;
        } else {
          totalAvailableCount += 1;
          if (selectedInventoryItems.includes(item.uuid)) {
            selectedAvailableCount += 1;
          }
        }
      });

      if (selectedAvailableCount === 0) {
        newStates[inventoryUuid] = { isChecked: false, isIndeterminate: false };
      } else if (selectedAvailableCount === totalAvailableCount) {
        newStates[inventoryUuid] = { isChecked: true, isIndeterminate: false };
      } else {
        newStates[inventoryUuid] = { isChecked: false, isIndeterminate: true };
      }
    });

    setInventorySelectAllStates(newStates);
  }, [
    selectedInventoryItems,
    inventoryItems,
    inventoryViewMode,
    formData.status,
    formData.inventory_items,
    prevSelectedInventoryItems,
    selectedInventoryUuids,
    loadedInventoryUuids
  ]);

  // Update the effect that loads initial data
  useEffect(() => {
    const fetchData = async () => {
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
        // Show all inventories initially
        const allInventoryUuids = fetchedInventories.data.map((item: any) => item.uuid);
        setSelectedInventoryUuids(allInventoryUuids);
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
    }

    fetchData();
  }, [user?.company_uuid]);


  // error handling for loading states
  useEffect(() => {
    if (errors && Object.keys(errors).length > 0) {
      Object.values(errors).forEach(error => {
        showErrorToast("Error", error);
      });
      setErrors({});
    }
  }, [errors]);

  useEffect(() => {
    if (validationError) {
      showErrorToast("Validation error", validationError);
      setValidationError('');
    }
  }, [validationError, errors]);


  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Delivery Management</h1>
            {(isLoading || isLoadingItems) ? (
              <div className="text-default-500 flex xl:justify-start justify-center items-center">
                <p className='my-auto mr-1'>Loading delivery data</p>
                <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
              </div>
            ) : (
              <p className="text-default-500">Track and manage your deliveries efficiently.</p>
            )}
          </div>
          <div className="flex gap-4 xl:mt-0 mt-4 text-center">
            {user && user.is_admin ? (
              <Button color="primary" variant="shadow" onPress={handleNewDelivery}
                startContent={<Icon icon="mdi:plus" />}
                isDisabled={isLoading || isLoadingItems || isLoadingInventoryItems}>
                New Delivery
              </Button>
            ) : selectedDeliveryId ? (
              <Button color="primary" variant="shadow" onPress={() => setShowAcceptDeliveryModal(true)}
                startContent={<Icon icon="mdi:check" />}
                isDisabled={isLoading || isLoadingItems}>
                Accept Deliveries
              </Button>
            ) : null}

            {/* PDF Export Popover */}
            <DeliveryExportPopover
              user={user}
              warehouses={warehouses}
              operators={operators}
              inventoryItems={inventoryItems}
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

          {/* Right side: Delivery Form */}
          <div className="xl:w-2/3 overflow-hidden">
            {((user && user.is_admin) || selectedDeliveryId) ? (
              <Form id="deliveryForm" onSubmit={handleSubmit} className="items-stretch space-y-4">
                <CardList>
                  <div className="space-y-4">
                    <LoadingAnimation
                      condition={!user || isLoading}
                      skeleton={
                        <div className="space-y-4">
                          <Skeleton className="h-[1.75rem] w-48 rounded-xl mx-auto" />

                          <Skeleton className="h-16 w-full rounded-xl" />

                          <div className="flex flex-col lg:flex-row gap-4">
                            <Skeleton className="h-16 w-full rounded-xl" />
                            <Skeleton className="h-16 w-full rounded-xl" />
                          </div>
                        </div>

                      }>
                      <div className="space-y-4">
                        <h2 className="text-xl font-semibold w-full text-center">Delivery Information</h2>
                        {selectedDeliveryId && (
                          <Input
                            label="Delivery Identifier"
                            value={selectedDeliveryId}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:truck-delivery" className="text-default-500 mb-[0.2rem]" />}
                            endContent={
                              <Button
                                variant="flat"
                                color="default"
                                isIconOnly
                                onPress={() => copyToClipboard(selectedDeliveryId || "")}
                              >
                                <Icon icon="mdi:content-copy" className="text-default-500" />
                              </Button>
                            }
                          />
                        )}

                        <Input
                          name="name"
                          label="Delivery Name"
                          value={deliveryNameValue}
                          onChange={handleInputChange}
                          isRequired={canEditAllFields()}
                          isReadOnly={!canEditAllFields()}
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:package" className="text-default-500 mb-[0.2rem]" />}
                          placeholder={selectedDeliveryId && selectedInventoryUuids.length > 0 ? getDefaultDeliveryName() : "Enter delivery name"}
                        />

                        {/* Warehouse Selection and Date Picker */}
                        <div className="flex flex-col lg:flex-row gap-4">
                          <Autocomplete
                            label="Warehouse"
                            placeholder="Select warehouse"
                            selectedKey={formData.warehouse_uuid || ""}
                            onSelectionChange={(value) => handleAutoSelectChange("warehouse_uuid", value)}
                            isRequired={canEditAllFields()}
                            isReadOnly={!canEditAllFields()}
                            inputProps={autoCompleteStyle}
                            isInvalid={!!errors.warehouse_uuid}
                            errorMessage={errors.warehouse_uuid}
                            startContent={<Icon icon="mdi:warehouse" className="text-default-500 mb-[0.2rem]" />}
                            isLoading={isLoadingWarehouses}
                          >
                            {warehouses.map((warehouse) => (
                              <AutocompleteItem key={warehouse.uuid}>
                                {warehouse.name}
                              </AutocompleteItem>
                            ))}
                          </Autocomplete>

                          <DatePicker
                            name="delivery_date"
                            label="Delivery Date"
                            defaultValue={formData.delivery_date ?
                              parseDate(formData.delivery_date) :
                              today(getLocalTimeZone())}
                            onChange={(date: any) => {
                              const dateString = date.toString();
                              handleAutoSelectChange("delivery_date", dateString);
                            }}
                            isRequired={canEditAllFields()}
                            isReadOnly={!canEditAllFields()}
                            classNames={{
                              base: "w-full",
                              inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
                              selectorButton: "w-12 h-10 mb-4 mr-[-0.4rem]",
                            }}
                            isInvalid={!!errors.delivery_date}
                            errorMessage={errors.delivery_date}
                          />
                        </div>
                      </div>
                    </LoadingAnimation>
                  </div>

                  <div>
                    <LoadingAnimation
                      condition={!user || isLoading}
                      skeleton={
                        <div className="space-y-4 justify-center items-center">
                          <Skeleton className="h-[1.75rem] w-48 rounded-xl mx-auto" /> {/* Title skeleton */}
                          <Skeleton className="h-16 w-full rounded-xl" /> {/* Autocomplete input skeleton */}

                          {/* Selected operators list skeleton */}
                          <div className="space-y-2">
                            {[...Array(2)].map((_, i) => (
                              <div key={i} className="flex items-center justify-between p-4 bg-default-50 rounded-xl border border-default-200 gap-4">
                                <div className="flex items-center gap-3">
                                  <Skeleton className="w-10 h-10 rounded-full" /> {/* Profile icon skeleton */}
                                  <div className="flex flex-col gap-1">
                                    <Skeleton className="h-5 w-32 rounded-xl" /> {/* Name skeleton */}
                                    <div className="flex flex-col sm:flex-row sm:gap-4">
                                      <Skeleton className="h-4 w-40 rounded-xl" /> {/* Email skeleton */}
                                      <Skeleton className="h-4 w-28 rounded-xl" /> {/* Phone skeleton */}
                                    </div>
                                  </div>
                                </div>
                                <Skeleton className="w-8 h-8 rounded-xl" /> {/* Delete button skeleton */}
                              </div>
                            ))}
                          </div>
                        </div>
                      }>
                      <div className="space-y-4 justify-center items-center">
                        <h3 className="text-lg text-center font-semibold">Assigned Operators</h3>

                        {/* Operator Selection Autocomplete - only show if delivery is processing and user is admin */}
                        {canEditLimited() && (
                          <Autocomplete
                            label="Add Operator"
                            placeholder="Select an operator to add"
                            onSelectionChange={(value) => {
                              if (value) {
                                handleAddOperator(value as string);
                              }
                            }}
                            inputProps={autoCompleteStyle}
                            startContent={<Icon icon="mdi:account-plus" className="text-default-500 mb-[0.2rem]" />}
                          >
                            {operators
                              .filter(operator => !selectedOperators.some(selected => selected.uuid === operator.uuid))
                              .map((operator) => (
                                <AutocompleteItem key={operator.uuid}>
                                  {operator.full_name} - {operator.email}
                                </AutocompleteItem>
                              ))}
                          </Autocomplete>
                        )}

                        {/* Display Selected Operators */}
                        {selectedOperators.length > 0 ? (
                          <div className="space-y-2">
                            {selectedOperators.map((operator) => (
                              <div key={operator.uuid} className="flex items-center justify-between p-4 bg-default-50 rounded-xl border border-default-200 gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                                    <Icon icon="mdi:account" className="text-primary-600" />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <p className="font-medium text-default-800">{operator.full_name}</p>
                                    <div className="flex flex-col sm:flex-row sm:gap-4 text-sm text-default-600">
                                      <p className="text-sm text-default-500 flex items-center gap-1">
                                        <Icon icon="mdi:email" className="text-xs" />
                                        {operator.email}
                                      </p>
                                      {operator.phone_number && (
                                        <p className="text-sm text-default-500 flex items-center gap-1">
                                          <Icon icon="mdi:phone" className="text-xs" />
                                          {operator.phone_number}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Only show delete button if can edit all fields */}
                                {canEditAllFields() && (
                                  <Button
                                    color="danger"
                                    variant="light"
                                    isIconOnly
                                    size="sm"
                                    onPress={() => handleRemoveOperator(operator.uuid)}
                                  >
                                    <Icon icon="mdi:delete" className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 text-center text-default-500 bg-default-50 rounded-xl border border-dashed border-default-300">
                            {canEditAllFields()
                              ? "No operators assigned. Use the dropdown above to add operators."
                              : "No operators assigned to this delivery."
                            }
                          </div>
                        )}
                      </div>
                    </LoadingAnimation>
                  </div>


                  <div>
                    <LoadingAnimation
                      condition={!user || isLoading}
                      skeleton={
                        <div className="space-y-4">
                          <Skeleton className="h-[1.75rem] w-48 rounded-xl mx-auto" />
                          <Skeleton className="h-16 w-full rounded-xl" />

                          <div className="border-2 border-default-200 rounded-xl bg-gradient-to-b from-background to-default-50/30">
                            <div className="flex justify-between items-center border-b border-default-200 p-4">
                              <Skeleton className="h-6 w-48 rounded-xl" />
                              <div className="flex gap-2 items-center">
                                <Skeleton className="h-6 w-20 rounded-xl" />
                                <Skeleton className="h-8 w-24 rounded-xl" />
                              </div>
                            </div>

                            {/* Select All Section Skeleton */}
                            <div className="border-b border-default-200 px-4 py-3 bg-default-50/50">
                              <div className="flex items-center justify-between flex-row-reverse">
                                <Skeleton className="h-6 w-24 rounded-xl" />
                                <div className="flex items-center gap-3">
                                  <Skeleton className="w-5 h-5 rounded" />
                                  <div className="flex flex-col gap-1">
                                    <Skeleton className="h-4 w-40 rounded-xl" />
                                    <Skeleton className="h-3 w-56 rounded-xl" />
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="py-4">
                              <div className="space-y-2 mx-4">
                                {[...Array(3)].map((_, i) => (
                                  <div key={i} className="border-2 border-default-200 rounded-xl overflow-hidden">
                                    <div className="p-4 bg-default-100 flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <Skeleton className="w-5 h-5 rounded" />
                                        <div className="flex flex-col gap-1">
                                          <Skeleton className="h-5 w-32 rounded-xl" />
                                          <Skeleton className="h-4 w-24 rounded-xl" />
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Skeleton className="h-6 w-16 rounded-xl" />
                                        <Skeleton className="h-6 w-20 rounded-xl" />
                                      </div>
                                    </div>

                                    {/* Expanded content skeleton */}
                                    <div className="p-4 space-y-4">
                                      <div className="bg-default-100/50 rounded-xl p-3 border border-default-200">
                                        <Skeleton className="h-4 w-28 rounded-xl mb-2" />
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                          {[...Array(4)].map((_, j) => (
                                            <div key={j} className="flex justify-between">
                                              <Skeleton className="h-3 w-20 rounded-xl" />
                                              <Skeleton className="h-3 w-16 rounded-xl" />
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      <div className="border border-default-200 rounded-xl p-4 bg-default-50/50">
                                        <div className="space-y-3">
                                          <Skeleton className="h-16 w-full rounded-xl" />
                                          <div className="flex items-center justify-between gap-3">
                                            <Skeleton className="h-6 w-32 rounded-xl" />
                                            <Skeleton className="h-8 w-28 rounded-xl" />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Auto-assign button skeleton */}
                            <div className="bg-default-100 p-4">
                              <Skeleton className="h-10 w-full rounded-xl" />
                            </div>
                          </div>
                        </div>
                      }>
                      <h2 className="text-xl font-semibold mb-4 w-full text-center">
                        {formData.status === "DELIVERED" ? "Inventory Details" : "Inventory to Deliver"}
                      </h2>
                      <div className="space-y-4">
                        {/* Multiple Inventory Selection */}
                        <div className="space-y-4">
                          {/* Inventories Display */}
                          <div className="border-2 border-default-200 rounded-xl bg-gradient-to-b from-background to-default-50/30 overflow-hidden">
                            <div className="flex justify-between items-center border-b border-default-200 p-4">
                              <h3 className="text-lg font-semibold">Inventories</h3>
                              <div className="flex gap-2 items-center">
                                <Chip color="primary" size="sm" variant="flat">
                                  {selectedInventoryItems.length} items selected
                                </Chip>

                                {/* Auto-assign locations button - only show for admin when items are selected and warehouse is set */}
                                {(user?.is_admin) && selectedInventoryItems.length > 0 && !isWarehouseNotSet() && !isFloorConfigNotSet() && (canEditAllFields() || canEditLimited()) && (
                                  <Button
                                    color="warning"
                                    variant="shadow"
                                    size="sm"
                                    onPress={autoAssignShelfLocations}
                                    isLoading={isAutoAssigning}
                                    startContent={!isAutoAssigning && <Icon icon="mdi:auto-fix" />}
                                  >
                                    {isAutoAssigning ? 'Auto-assigning...' : 'Auto-assign'}
                                  </Button>
                                )}

                                <Button
                                  color={inventoryViewMode === 'grouped' ? "primary" : "default"}
                                  variant={inventoryViewMode === 'grouped' ? "shadow" : "flat"}
                                  size="sm"
                                  onPress={() => {
                                    setInventoryViewMode(inventoryViewMode === 'grouped' ? 'flat' : 'grouped')
                                    setExpandedInventoryItemDetails(new Set())
                                  }}
                                  startContent={<Icon icon={inventoryViewMode === 'grouped' ? "mdi:format-list-group" : "mdi:format-list-bulleted"} />}
                                >
                                  {inventoryViewMode === 'grouped' ? 'Grouped' : 'Flat'}
                                </Button>
                              </div>
                            </div>
                            <div className="py-4">
                              <Accordion
                                selectionMode="multiple"
                                variant="splitted"
                                selectedKeys={expandedInventories}
                                onSelectionChange={handleAccordionSelectionChange}  // Use the new handler
                                itemClasses={{
                                  base: "p-0 bg-default-50 rounded-xl overflow-hidden border-2 border-default-200",
                                  title: "font-normal text-lg font-semibold",
                                  trigger: "p-4 data-[hover=true]:bg-default-100 flex items-center transition-colors",
                                  indicator: "text-medium",
                                  content: "text-small py-4 px-2",
                                }}
                              >
                                {selectedInventoryUuids.map((inventoryUuid) => {
                                  // Fix: Get inventory from the inventories array, not inventoryItems
                                  const inventory = inventories.find(inv => inv.uuid === inventoryUuid);
                                  const inventoryItemsForThisInventory = getInventoryItemsForInventory(inventoryUuid);
                                  const selectedItemCount = inventoryItemsForThisInventory.filter(item =>
                                    selectedInventoryItems.includes(item.uuid)
                                  ).length;

                                  return (
                                    <AccordionItem
                                      key={inventoryUuid}
                                      aria-label={inventory?.name || 'Unknown Inventory'}
                                      className="mx-2"
                                      title={
                                        <div className="flex items-center justify-between w-full">
                                          <div className="flex items-center gap-3">
                                            {(user && user.is_admin) && (
                                              (canEditAllFields() || canEditLimited()) && formData.status === "PENDING"
                                            ) && (
                                                <Checkbox
                                                  isSelected={inventorySelectAllStates[inventoryUuid]?.isChecked || false}
                                                  isIndeterminate={inventorySelectAllStates[inventoryUuid]?.isIndeterminate || false}
                                                  onValueChange={(checked) => handleInventorySelectAllToggle(inventoryUuid, checked)}
                                                  color="primary" />
                                              )}

                                            <div className="text-left">
                                              <p className="font-medium">{inventory?.name || 'Unknown Inventory'}</p>
                                              <p className="text-sm text-default-500">
                                                {selectedItemCount}/{inventory?.count?.inventory || 0} items selected
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      }
                                    >
                                      <div className="space-y-4">
                                        {/* Items display using same layout as main inventory items section */}
                                        <LoadingAnimation
                                          condition={isLoadingInventoryItems && !loadedInventoryUuids.has(inventoryUuid)}
                                          skeleton={
                                            <div className="space-y-2 mx-2">
                                              {[...Array(3)].map((_, i) => (
                                                <div key={i} className="border border-default-200 rounded-xl p-4">
                                                  <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                      <Skeleton className="w-5 h-5 rounded" />
                                                      <Skeleton className="h-4 w-32 rounded-xl" />
                                                    </div>
                                                    <Skeleton className="h-6 w-16 rounded-xl" />
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          }
                                        >
                                          {inventoryItemsForThisInventory.length === 0 ? (
                                            <div className="text-center py-8 text-default-500">
                                              <Icon icon="mdi:package-variant-closed" className="mx-auto mb-2 opacity-50" width={40} height={40} />
                                              <p>No inventory items available</p>
                                            </div>
                                          ) : (
                                            <div>
                                              <Accordion
                                                selectionMode="multiple"
                                                variant="splitted"
                                                selectedKeys={expandedInventoryItemDetails}
                                                onSelectionChange={(keys) => setExpandedInventoryItemDetails(keys as Set<string>)}
                                                itemClasses={{
                                                  base: "p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
                                                  title: "font-normal text-lg font-semibold",
                                                  trigger: "p-4 data-[hover=true]:bg-default-100 flex items-center transition-colors",
                                                  indicator: "text-medium",
                                                  content: "text-small p-0",
                                                }}
                                              >
                                                {/* Filter the display list based on status and selection */}
                                                {getDisplayInventoryItemsListForInventory(inventoryUuid)
                                                  .filter((item, index) => {
                                                    // If status is PROCESSING or beyond, only show selected items
                                                    if (
                                                      formData.status === "PROCESSING" ||
                                                      formData.status === "IN_TRANSIT" ||
                                                      formData.status === "DELIVERED" ||
                                                      formData.status === "CANCELLED"
                                                    ) {
                                                      const groupedItems = getGroupedInventoryItems();
                                                      const groupInfo = getGroupInfo(item, groupedItems);

                                                      // For grouped view, check if any item in the group is selected
                                                      if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
                                                        const groupItems = inventoryItemsForThisInventory.filter(groupItem =>
                                                          groupItem.group_id === groupInfo.groupId
                                                        );
                                                        return groupItems.some(groupItem => selectedInventoryItems.includes(groupItem.uuid));
                                                      } else {
                                                        // For flat view or non-grouped items, check if the item itself is selected
                                                        return selectedInventoryItems.includes(item.uuid);
                                                      }
                                                    }

                                                    // For PENDING status, show all items
                                                    return true;
                                                  })
                                                  .map((item: any, index: number) => {
                                                    const groupedItems = getGroupedInventoryItems();
                                                    const groupInfo = getGroupInfo(item, groupedItems);
                                                    const displayNumber = index + 1; // Simple display number based on filtered list

                                                    // Get all items that should be selected for this display item
                                                    const itemsToSelect = inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId
                                                      ? inventoryItemsForThisInventory.filter(groupItem => groupItem.group_id === groupInfo.groupId)
                                                      : [item];

                                                    const isSelected = itemsToSelect.every(groupItem => selectedInventoryItems.includes(groupItem.uuid));

                                                    return (
                                                      <AccordionItem
                                                        key={`${item.uuid}-${inventoryViewMode}-${inventoryUuid}`} // Use uuid + view mode + inventory for unique key
                                                        aria-label={`Item ${displayNumber}`}
                                                        title={
                                                          renderInventoryItemWithStatus(
                                                            item,
                                                            isSelected,
                                                            inventoryViewMode === 'grouped' && groupInfo.isGroup,
                                                            groupInfo.groupId || '',
                                                            inventoryUuid
                                                          )
                                                        }
                                                      >
                                                        <div>
                                                          {/* Group identifier for grouped items */}
                                                          {inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId && (
                                                            <div className="space-y-4 px-4 pt-4">
                                                              <Input
                                                                label="Group Identifier"
                                                                value={groupInfo.groupId}
                                                                isReadOnly
                                                                classNames={{ inputWrapper: inputStyle.inputWrapper }}
                                                                startContent={<Icon icon="mdi:group" className="text-default-500 mb-[0.2rem]" />}
                                                                endContent={
                                                                  <Button
                                                                    variant="flat"
                                                                    color="default"
                                                                    isIconOnly
                                                                    onPress={() => copyToClipboard(groupInfo.groupId!)}
                                                                  >
                                                                    <Icon icon="mdi:content-copy" className="text-default-500" />
                                                                  </Button>
                                                                }
                                                              />
                                                            </div>
                                                          )}

                                                          {/* List all items in group or show single item */}
                                                          <div className="space-y-4 p-4">
                                                            {(() => {
                                                              let itemsToShow = inventoryViewMode === 'grouped' && groupInfo.isGroup
                                                                ? inventoryItemsForThisInventory.filter(groupItem => groupItem.group_id === groupInfo.groupId)
                                                                : [item];

                                                              // Filter out items with IN_WAREHOUSE or USED status unless delivery is delivered/cancelled
                                                              if (formData.status !== 'DELIVERED' && formData.status !== 'CANCELLED') {
                                                                itemsToShow = itemsToShow.filter(inventoryItem =>
                                                                  inventoryItem.status !== 'IN_WAREHOUSE' && inventoryItem.status !== 'USED'
                                                                );
                                                              }

                                                              // Filter out unselected items for non-PENDING statuses
                                                              if (
                                                                formData.status === "PROCESSING" ||
                                                                formData.status === "IN_TRANSIT" ||
                                                                formData.status === "DELIVERED" ||
                                                                formData.status === "CANCELLED"
                                                              ) {
                                                                itemsToShow = itemsToShow.filter(inventoryItem =>
                                                                  selectedInventoryItems.includes(inventoryItem.uuid)
                                                                );
                                                              }

                                                              return (
                                                                <div className="space-y-4">
                                                                  {/* Show item details only once for grouped items */}
                                                                  {inventoryViewMode === 'grouped' && groupInfo.isGroup ? (
                                                                    <div className="bg-default-100/50 rounded-xl p-3 border border-default-200">
                                                                      <h4 className="text-sm font-medium text-default-700 mb-2">Group Item Details</h4>
                                                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                                                        <div>
                                                                          <span className="text-default-500">Item Code:</span>
                                                                          <span className="ml-2 font-medium text-default-700">{item.item_code || 'Not set'}</span>
                                                                        </div>
                                                                        <div>
                                                                          <span className="text-default-500">Unit Value:</span>
                                                                          <span className="ml-2 font-medium text-default-700">
                                                                            {item.unit_value || 0} {item.unit || 'units'}
                                                                          </span>
                                                                        </div>
                                                                        <div>
                                                                          <span className="text-default-500">Packaging:</span>
                                                                          <span className="ml-2 font-medium text-default-700">{item.packaging_unit || 'Not set'}</span>
                                                                        </div>
                                                                        <div>
                                                                          <span className="text-default-500">Cost:</span>
                                                                          <span className="ml-2 font-medium text-default-700">₱{item.cost || 0}</span>
                                                                        </div>
                                                                      </div>
                                                                    </div>
                                                                  ) : null}

                                                                  {/* Show message if no items to display (all filtered out) */}
                                                                  {itemsToShow.length === 0 ? (
                                                                    <div className="text-center py-4 text-default-500">
                                                                      <Icon icon="mdi:package-variant-closed" className="mx-auto mb-2 opacity-50" width={32} height={32} />
                                                                      <p className="text-sm">
                                                                        {formData.status === 'DELIVERED' || formData.status === 'CANCELLED'
                                                                          ? "No selected items in this group"
                                                                          : "No available items in this group"
                                                                        }
                                                                      </p>
                                                                    </div>
                                                                  ) : (
                                                                    /* List individual items */
                                                                    itemsToShow.map((inventoryItem, itemIndex) => {
                                                                      const itemLocationIndex = selectedInventoryItems.indexOf(inventoryItem.uuid);
                                                                      const hasAssignedLocation = itemLocationIndex >= 0 && locations[itemLocationIndex];
                                                                      const isItemSelected = selectedInventoryItems.includes(inventoryItem.uuid);
                                                                      const itemStatusStyling = getInventoryItemStatusStyling(inventoryItem);

                                                                      return (
                                                                        <div key={inventoryItem.uuid} className="border border-default-200 rounded-xl p-4 bg-default-50/50">
                                                                          <div className="space-y-3">
                                                                            {/* Individual item header with checkbox for grouped items */}
                                                                            {inventoryViewMode === 'grouped' && groupInfo.isGroup && (
                                                                              <div className="flex items-center justify-between">
                                                                                <div className="flex items-center gap-3">
                                                                                  {formData.status === 'PENDING' && (
                                                                                    <Checkbox
                                                                                      isSelected={isItemSelected}
                                                                                      onValueChange={(checked) => handleInventoryItemSelectionToggle(inventoryItem.uuid, checked)}
                                                                                      isDisabled={itemStatusStyling.isDisabled}
                                                                                      size="sm"
                                                                                    />
                                                                                  )}
                                                                                  <div>
                                                                                    <span className="text-sm font-medium text-default-700">Item {itemIndex + 1}</span>
                                                                                    <p className="text-xs text-default-500">
                                                                                      {inventoryItem.unit_value} {inventoryItem.unit}
                                                                                    </p>
                                                                                  </div>
                                                                                </div>
                                                                                <div className="flex items-center gap-2">
                                                                                  <Chip color={getStatusColor(inventoryItem.status)} variant="flat" size="sm">
                                                                                    {formatStatus(inventoryItem.status)}
                                                                                  </Chip>
                                                                                  {itemStatusStyling.isDisabled && itemStatusStyling.disabledReason && (
                                                                                    <Tooltip content={itemStatusStyling.disabledReason}>
                                                                                      <Icon icon="mdi:information-outline" className="text-warning" />
                                                                                    </Tooltip>
                                                                                  )}
                                                                                </div>
                                                                              </div>
                                                                            )}

                                                                            {/* Item status - show for each individual item in grouped view only */}
                                                                            {inventoryViewMode === 'grouped' && inventoryItem.status && !groupInfo.isGroup && (
                                                                              <div className="flex items-center gap-2 justify-between">
                                                                                <span className="text-sm text-default-500">Item {itemIndex + 1}</span>
                                                                                <Chip color={getStatusColor(inventoryItem.status)} variant="flat" size="sm">
                                                                                  {formatStatus(inventoryItem.status)}
                                                                                </Chip>
                                                                              </div>
                                                                            )}

                                                                            {/* Group identifier for flat view if item has group */}
                                                                            {inventoryViewMode === 'flat' && inventoryItem.group_id && (
                                                                              <Input
                                                                                label="Group Identifier"
                                                                                value={inventoryItem.group_id}
                                                                                isReadOnly
                                                                                classNames={{ inputWrapper: inputStyle.inputWrapper }}
                                                                                startContent={<Icon icon="mdi:group" className="text-default-500 mb-[0.2rem]" />}
                                                                                endContent={
                                                                                  <Button
                                                                                    variant="flat"
                                                                                    color="default"
                                                                                    isIconOnly
                                                                                    onPress={() => copyToClipboard(inventoryItem.group_id!)}
                                                                                  >
                                                                                    <Icon icon="mdi:content-copy" className="text-default-500" />
                                                                                  </Button>
                                                                                }
                                                                              />
                                                                            )}

                                                                            {/* Item identifier */}
                                                                            <Input
                                                                              label={"Item Identifier"}
                                                                              value={inventoryItem.uuid}
                                                                              isReadOnly
                                                                              classNames={{ inputWrapper: inputStyle.inputWrapper }}
                                                                              startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                                                                              endContent={
                                                                                <Button
                                                                                  variant="flat"
                                                                                  color="default"
                                                                                  isIconOnly
                                                                                  onPress={() => copyToClipboard(inventoryItem.uuid)}
                                                                                >
                                                                                  <Icon icon="mdi:content-copy" className="text-default-500" />
                                                                                </Button>
                                                                              }
                                                                            />

                                                                            {/* Location */}
                                                                            {hasAssignedLocation && (formData.status === "DELIVERED" || formData.status === "CANCELLED") && (
                                                                              <Input
                                                                                label="Assigned Location"
                                                                                value={locations[itemLocationIndex]?.code || 'Not assigned'}
                                                                                isReadOnly
                                                                                classNames={{ inputWrapper: inputStyle.inputWrapper }}
                                                                                startContent={<Icon icon="mdi:map-marker" className="text-default-500 mb-[0.2rem]" />}
                                                                                endContent={
                                                                                  <Button
                                                                                    variant="flat"
                                                                                    color="default"
                                                                                    isIconOnly
                                                                                    onPress={() => copyToClipboard(locations[itemLocationIndex]?.code || '')}
                                                                                  >
                                                                                    <Icon icon="mdi:content-copy" className="text-default-500" />
                                                                                  </Button>
                                                                                }
                                                                              />
                                                                            )}

                                                                            {/* Item details section - display only for single items (not grouped) */}
                                                                            {!(inventoryViewMode === 'grouped' && groupInfo.isGroup) && (
                                                                              <div className="bg-default-100/50 rounded-xl p-3 border border-default-200">
                                                                                <h4 className="text-sm font-medium text-default-700 mb-2">Item Details</h4>
                                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                                                                  <div>
                                                                                    <span className="text-default-500">Item Code:</span>
                                                                                    <span className="ml-2 font-medium text-default-700">{inventoryItem.item_code || 'Not set'}</span>
                                                                                  </div>
                                                                                  <div>
                                                                                    <span className="text-default-500">Unit Value:</span>
                                                                                    <span className="ml-2 font-medium text-default-700">
                                                                                      {inventoryItem.unit_value || 0} {inventoryItem.unit || 'units'}
                                                                                    </span>
                                                                                  </div>
                                                                                  <div>
                                                                                    <span className="text-default-500">Packaging:</span>
                                                                                    <span className="ml-2 font-medium text-default-700">{inventoryItem.packaging_unit || 'Not set'}</span>
                                                                                  </div>
                                                                                  <div>
                                                                                    <span className="text-default-500">Cost:</span>
                                                                                    <span className="ml-2 font-medium text-default-700">₱{inventoryItem.cost || 0}</span>
                                                                                  </div>
                                                                                </div>
                                                                              </div>
                                                                            )}

                                                                            {/* Location assignment - only show if item is selected AND not delivered/cancelled */}
                                                                            {isItemSelected && formData.status !== "DELIVERED" && formData.status !== "CANCELLED" && (
                                                                              <div className="flex items-center justify-between gap-3">
                                                                                <div className="flex-1">
                                                                                  {hasAssignedLocation ? (
                                                                                    <div className="flex items-center gap-2">
                                                                                      <Chip color="success" variant="flat" size="sm">
                                                                                        <div className="flex items-center gap-1">
                                                                                          <Icon icon="mdi:map-marker-check" width={14} height={14} />
                                                                                          {locations[itemLocationIndex]?.code}
                                                                                        </div>
                                                                                      </Chip>
                                                                                    </div>
                                                                                  ) : (
                                                                                    <Chip color="warning" variant="flat" size="sm">
                                                                                      <div className="flex items-center gap-1">
                                                                                        <Icon icon="mdi:map-marker-alert" width={14} height={14} />
                                                                                        No Location Assigned
                                                                                      </div>
                                                                                    </Chip>
                                                                                  )}
                                                                                </div>

                                                                                <Button
                                                                                  color="primary"
                                                                                  variant="flat"
                                                                                  size="sm"
                                                                                  onPress={() => {
                                                                                    // Set the current item location index and open modal
                                                                                    setCurrentInventoryItemLocationIndex(itemLocationIndex >= 0 ? itemLocationIndex : selectedInventoryItems.length);

                                                                                    // Ensure the item is selected first
                                                                                    if (!selectedInventoryItems.includes(inventoryItem.uuid)) {
                                                                                      handleInventoryItemSelectionToggle(inventoryItem.uuid, true);
                                                                                    }

                                                                                    handleOpenModal();
                                                                                  }}
                                                                                  isDisabled={!(user === null || user.is_admin) || isWarehouseNotSet() || isFloorConfigNotSet()}
                                                                                  startContent={<Icon icon="mdi:map-marker-plus" width={14} height={14} />}
                                                                                >
                                                                                  {hasAssignedLocation ? 'Change Location' : 'Assign Location'}
                                                                                </Button>
                                                                              </div>
                                                                            )}
                                                                          </div>
                                                                        </div>
                                                                      );
                                                                    })
                                                                  )}
                                                                </div>
                                                              );
                                                            })()}
                                                          </div>
                                                        </div>
                                                      </AccordionItem>
                                                    );
                                                  })}
                                              </Accordion>
                                            </div>
                                          )}
                                        </LoadingAnimation>
                                      </div>
                                    </AccordionItem>
                                  );
                                })}
                              </Accordion>
                            </div>
                          </div>


                          {/* Error display for inventory selection */}
                          {errors.inventory_uuids && (
                            <Alert color="danger" variant="flat">
                              {errors.inventory_uuids}
                            </Alert>
                          )}
                        </div>

                      </div>
                    </LoadingAnimation>
                  </div>


                  <div>
                    <LoadingAnimation
                      condition={!user || isLoading}
                      skeleton={
                        <div className="space-y-4">
                          <Skeleton className="h-[1.75rem] w-48 rounded-xl mx-auto" /> {/* Title skeleton */}
                          <Skeleton className="h-16 w-full rounded-xl" /> {/* Delivery address textarea skeleton */}
                          <Skeleton className="h-16 w-full rounded-xl" /> {/* Notes textarea skeleton */}
                        </div>
                      }
                    >
                      <h2 className="text-xl font-semibold mb-4 w-full text-center">
                        Delivery Details
                      </h2>
                      <div className="space-y-4">
                        {/* Only show recipient details when an operator is assigned */}
                        <Textarea
                          name="delivery_address"
                          label="Delivery Address"
                          classNames={inputStyle}
                          placeholder="Enter complete delivery address"
                          value={formData.delivery_address || ""}
                          onChange={handleInputChange}
                          maxRows={5}
                          minRows={1}
                          isRequired={isDeliveryProcessing() && (user === null || user.is_admin)}
                          isReadOnly
                          errorMessage={errors.delivery_address}
                          startContent={<Icon icon="mdi:map-marker" className="text-default-500 mb-[0.2rem]" />}
                        />


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
                          isReadOnly={!isDeliveryProcessing() || !(user === null || user.is_admin)}
                        />
                      </div>

                    </LoadingAnimation>
                  </div>

                  <div
                    {...(formData.status_history && Object.keys(formData.status_history).length > 0 ? {} : { className: '!min-h-0 !p-0 !h-0 collapse border-none z-0' })}>
                    <LoadingAnimation
                      condition={!user || isLoading}
                      skeleton={
                        <div className="space-y-4">
                          <Skeleton className="h-[1.75rem] w-48 rounded-xl mx-auto" /> {/* Section title */}
                          <div className="border-2 border-default-200 rounded-xl bg-gradient-to-b from-background to-default-50/30">
                            {/* Status box header */}
                            <div className="flex justify-between items-center border-b border-default-200 p-4">
                              <Skeleton className="h-5 w-32 rounded-xl" /> {/* Current Status text */}
                              <Skeleton className="h-6 w-24 rounded-xl" /> {/* Status chip */}
                            </div>

                            {/* Status history section */}
                            <div className="p-4">
                              <Skeleton className="h-5 w-36 rounded-xl mb-4" /> {/* Status History text */}
                              <div className="relative">
                                {/* Timeline line */}
                                <div className="absolute left-[calc((3rem/2)-0.1rem)] top-0 bottom-1 w-0.5 bg-default-100 rounded-full"></div>

                                {/* Timeline entries */}
                                <div className="space-y-5">
                                  {[...Array(3)].map((_, i) => (
                                    <div key={i} className="flex items-start">
                                      <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" /> {/* Timeline icon */}
                                      <div className="ml-4 p-3 rounded-xl border border-default-200 flex-grow">
                                        <div className="flex justify-between items-center flex-wrap gap-2">
                                          <Skeleton className="h-6 w-28 rounded-xl" /> {/* Status text */}
                                          <Skeleton className="h-4 w-36 rounded-xl" /> {/* Date text */}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      }>

                      <h2 className="text-xl font-semibold mb-4 w-full text-center">Delivery Status</h2>
                      <div>
                        {!user ? (
                          <Skeleton className="h-16 w-full rounded-xl" />
                        ) : (
                          <div className="border-2 border-default-200 rounded-xl bg-gradient-to-b from-background to-default-50/30">
                            <div className="flex justify-between items-center border-b border-default-200 p-4">
                              <h3 className="text-md font-medium">Current Status</h3>
                              <Chip
                                color={getStatusColor(formData.status || "PENDING")}
                                size="sm"
                                variant="shadow"
                                className="px-3 font-medium"
                              >
                                {formatStatus(formData.status || "PENDING")}
                              </Chip>
                            </div>

                            {formData.status_history && Object.keys(formData.status_history).length > 0 ? (
                              <div className="p-4">
                                <h3 className="text-md font-medium mb-4">Status History</h3>
                                <div className="relative">
                                  {/* Fixed timeline line with better alignment */}
                                  <div className="absolute left-[calc((3rem/2)-0.1rem)] top-0 bottom-1 w-0.5 bg-default-100 rounded-full"></div>
                                  <div className="space-y-5">
                                    {Object.entries(formData.status_history)
                                      .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()) // Sort by timestamp descending
                                      .map(([timestamp, status]) => {
                                        // Determine icon based on status
                                        const statusIcon =
                                          status === "PENDING" ? "mdi:clock-outline" :
                                            status === "PROCESSING" ? "mdi:clock-start" :
                                              status === "IN_TRANSIT" ? "mdi:truck-fast" :
                                                status === "DELIVERED" ? "mdi:check" :
                                                  status === "CANCELLED" ? "mdi:close" :
                                                    "mdi:help-circle";

                                        return (
                                          <div key={timestamp} className="flex items-start group">
                                            <div className={`w-12 h-12 rounded-full flex-shrink-0 bg-${getStatusColor(status)}-100 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-200 z-10`}>
                                              <Icon
                                                icon={statusIcon}
                                                className={`text-${getStatusColor(status)}-900 text-[1.25rem]`}
                                              />
                                            </div>
                                            <div className="ml-4 bg-background/50 p-3 rounded-xl border border-default-200 shadow-sm flex-grow group-hover:shadow-md group-hover:border-default-300 transition-all duration-200">
                                              <div className="flex justify-between items-center flex-wrap gap-2">
                                                <Chip
                                                  color={getStatusColor(status)}
                                                  size="sm"
                                                  variant="flat"
                                                  className="font-medium"
                                                >
                                                  {status.replaceAll('_', ' ')}
                                                </Chip>
                                                <div className="text-xs text-default-500 flex items-center">
                                                  <Icon icon="mdi:calendar-clock" className="mr-1" />
                                                  {format(parseISO(timestamp), "MMM d, yyyy 'at' h:mm a")}
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <Alert
                                variant="faded"
                                color="danger"
                                className="text-center m-4 w-[calc(100%-2rem)]"
                                icon={<Icon icon="mdi:history" className="text-default-500" />}
                              >
                                No status history available.
                              </Alert>
                            )}
                          </div>
                        )}

                        <AnimatePresence>
                          {(user === null || user.is_admin) && selectedDeliveryId && formData.status !== "DELIVERED" && formData.status !== "CANCELLED" && (
                            <motion.div {...motionTransition}>
                              <div className="flex flex-col gap-4 pt-4 -mx-4">
                                <hr className="border-default-200" />
                                <h3 className="text-lg font-semibold w-full text-center">Quick Status Update</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4">
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
                                  {/* <Button
                                  color="success"
                                  variant="flat"
                                  className="w-full"
                                  isDisabled
                                  // isDisabled={formData.status === "DELIVERED" || formData.status === "CANCELLED" || isLoading || isFloorConfigNotSet() || selectedInventoryItems.length === 0 || locations.length < selectedInventoryItems.length}
                                  onPress={() => handleStatusChange("DELIVERED")}
                                >
                                  <Icon icon="mdi:check-circle" className="mr-1" />
                                  Delivered
                                </Button> */}
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
                    </LoadingAnimation>

                  </div>

                  {(user === null || user.is_admin || formData.status === "DELIVERED") && (
                    <motion.div {...motionTransition}>
                      <div className="flex flex-col flex-1 gap-4">
                        <LoadingAnimation
                          condition={!user || isLoading || isLoadingItems || isLoadingInventoryItems}
                          skeleton={
                            <div className="flex justify-center items-center gap-4">
                              <Skeleton className="h-10 w-full rounded-xl" />
                              <Skeleton className="h-10 w-full rounded-xl" />
                            </div>
                          }
                        >
                          <div className="flex flex-col md:flex-row justify-center items-center gap-4">
                            {selectedDeliveryId && (
                              <>
                                <Button
                                  color="secondary"
                                  variant="shadow"
                                  className="w-full"
                                  onPress={handleShowDeliveryQR}
                                >
                                  <Icon icon="mdi:qrcode" className="mr-1" />
                                  Show Delivery QR
                                </Button>

                                {/* {formData.status === "DELIVERED" && (
                                  <Button
                                    color="success"
                                    variant="shadow"
                                    className="w-full"
                                    onPress={handleViewInventory}
                                  >
                                    <Icon icon="mdi:package-variant" className="mr-1" />
                                    {(user === null || user.is_admin)
                                      ? "Show Inventory"
                                      : "Show in Warehouse"}
                                  </Button>
                                )} */}
                              </>
                            )}

                            {/* Show submit button only for admins creating/updating or operators with selected delivery */}
                            {(user.is_admin && formData.status !== "DELIVERED") && (
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
                          </div>
                        </LoadingAnimation>
                      </div>
                    </motion.div>
                  )}
                </CardList>
              </Form>
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
                </LoadingAnimation>
              </div>
            )
            }
          </div >
        </div >

        {/* QR Code Modal */}
        <Modal
          isOpen={showQrCode}
          onClose={() => setShowQrCode(false)}
          placement="auto"
          backdrop="blur"
          size="lg"
          classNames={{ backdrop: "bg-background/50" }}
        >
          <ModalContent>
            <ModalHeader>{qrCodeData.title}</ModalHeader>
            <ModalBody className="flex flex-col items-center">
              <div className="bg-white rounded-xl overflow-hidden">
                <QRCodeCanvas
                  id="delivery-qrcode"
                  value={qrCodeData.url}
                  size={320}
                  marginSize={4}
                  level="L"
                />
              </div>

              <p className="text-center mt-4 text-default-600">
                {qrCodeData.description}
              </p>

              {/* QR Code Options */}
              <div className="w-full overflow-hidden mt-4 space-y-4">
                {/* Show Options Toggle */}
                <div className="p-4 bg-default-50 rounded-xl border-2 border-default-200">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-default-700">Show Options</span>
                      <span className="text-xs text-default-500">
                        Display additional options when the QR code is scanned
                      </span>
                    </div>
                    <Switch
                      isSelected={qrCodeData.showOptions}
                      onValueChange={updateShowOptions}
                      color="secondary"
                      size="sm"
                    />
                  </div>
                </div>

                {/* Auto Accept Toggle */}
                <div className="p-4 bg-default-50 rounded-xl border-2 border-default-200">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-default-700">Auto Accept Delivery</span>
                      <span className="text-xs text-default-500">
                        When enabled, scanning this QR code will automatically accept the delivery
                      </span>
                    </div>
                    <Switch
                      isSelected={qrCodeData.autoAccept}
                      onValueChange={(checked) => updateQrCodeUrl(checked)}
                      color="warning"
                      size="sm"
                    />
                  </div>

                  <AnimatePresence>
                    {qrCodeData.autoAccept && (
                      <motion.div
                        {...motionTransition}
                      >
                        <div className="mt-3 p-2 bg-warning-50 border border-warning-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <Icon icon="mdi:alert" className="text-warning-600 mt-0.5 flex-shrink-0" width={16} />
                            <div>
                              <p className="text-xs font-medium text-warning-700">Warning</p>
                              <p className="text-xs text-warning-600">
                                This action cannot be undone. The delivery will be automatically accepted when scanned by an authorized operator.
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

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
              <Button color="default" onPress={() => setShowQrCode(false)}>
                Close
              </Button>
              <Button
                color="primary"
                variant="shadow"
                onPress={() => {
                  const canvas = document.getElementById('delivery-qrcode') as HTMLCanvasElement;
                  const pngUrl = canvas.toDataURL('image/png');
                  const downloadLink = document.createElement('a');
                  downloadLink.href = pngUrl;
                  downloadLink.download = `delivery-${user.full_name?.replace(/\s+/g, '-') || 'item'}-${new Date().toISOString().split('T')[0]}.png`;
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
        </Modal>

        {/* Accept Delivery Modal */}
        <Modal
          isOpen={showAcceptDeliveryModal}
          onClose={() => {
            setShowAcceptDeliveryModal(false);
            setDeliveryInput("");
            setValidationError("");
            setValidationSuccess(false);
            setAcceptDeliveryTab("paste-link");
          }}
          isDismissable={!isLoading && !isProcessingImage && !isAcceptingDelivery}
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
                                    setValidationError("");
                                    setValidationSuccess(false);
                                  }
                                }}
                                onKeyDown={handlePasteLinkKeyDown}
                                onPaste={handleDeliveryPaste}
                                startContent={<Icon icon="mdi:link-variant" className="text-default-500" />}
                                classNames={{
                                  ...inputStyle,
                                  inputWrapper: "border-2 border-default-200 hover:border-primary-400 focus-within:border-primary-500 !transition-all duration-200 h-12"
                                }}
                                isDisabled={isLoading || isAcceptingDelivery}
                                autoFocus
                                size="md"
                              />

                              <Button
                                color="primary"
                                className="w-full"
                                onPress={() => handlePasteLinkAccept()}
                                isDisabled={!deliveryInput.trim() || isLoading || isAcceptingDelivery}
                                variant="flat"
                              >
                                {isLoading || isAcceptingDelivery ? (
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
                  setValidationError("");
                  setValidationSuccess(false);
                  setAcceptDeliveryTab("paste-link");
                }}
                isDisabled={isLoading || isProcessingImage || isAcceptingDelivery}
              >
                Cancel
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Accept Delivery Status Modal */}
        <Modal
          isOpen={showAcceptStatusModal}
          onClose={() => {
            setShowAcceptStatusModal(false);
            setAcceptDeliveryError(null);
            setAcceptDeliverySuccess(false);
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
                  setAcceptDeliveryError(null);
                  setAcceptDeliverySuccess(false);
                }}
                className="w-full"
              >
                {acceptDeliverySuccess ? "Great!" : "Close"}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <Delivery3DShelfSelector
          isOpen={isOpen}
          onClose={onClose}
          floorConfigs={floorConfigs}
          occupiedLocations={occupiedLocations}
          shelfColorAssignments={shelfColorAssignments}
          selectedLocation={getCurrentLocation()}
          onLocationConfirm={handle3DLocationConfirm}
          isDeliveryProcessing={isDeliveryProcessing()}
          isAdmin={user?.is_admin || false}
        />
      </div >
    </motion.div >
  );
}