
import { motionTransition } from '@/utils/anim';
import {
  Accordion, AccordionItem, Alert, Autocomplete, AutocompleteItem, Button,
  Checkbox,
  Chip, DatePicker,
  Form, Input,
  Modal, ModalBody, ModalContent, ModalFooter,
  ModalHeader,
  Skeleton,
  Switch,
  Textarea,
  Tooltip,
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { getLocalTimeZone, parseDate, today } from '@internationalized/date';
import { format, parseISO } from "date-fns";
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

import LoadingAnimation from '@/components/loading-animation';
import { UserProfile } from '@/utils/supabase/server/user';
import { copyToClipboard, formatStatus } from '@/utils/tools';
import { getInventoryItem } from '../inventory/actions';
import { Warehouse } from '../warehouses/actions';


import { getStatusColor } from '@/utils/colors';
import {
  getGroupInfo,
  groupInventoryItems
} from "@/utils/inventory-group";

import { createClient } from '@/utils/supabase/client';
import { Delivery3DShelfSelector } from './delivery-3d-shelf-selector';


interface DeliveryComponentProps {
  // Core identifiers
  deliveryId: string | null;

  // User and permissions
  user: any;

  // Data arrays
  warehouses: Array<Partial<Warehouse> & { uuid: string }>;
  operators: Array<Partial<UserProfile> & { uuid: string }>;
  inventories: any[];

  // Callbacks for external actions
  onDeliveryUpdate?: (deliveryId: string) => void;
  onStatusChange?: (status: string) => void;
  onGoToWarehouse?: (warehouseUuid: string) => void;
  onErrors?: (errors: Record<string, string>) => void;
  onLoadingChange?: (isLoading: boolean) => void;

  // Optional overrides for specific behaviors
  allowStatusUpdates?: boolean;
  showQRGeneration?: boolean;
  readOnlyMode?: boolean;

  // Optional initial data
  initialFormData?: Partial<DeliveryItem>;
}

export function DeliveryComponent({
  deliveryId,
  user,
  warehouses,
  operators,
  inventories,
  onDeliveryUpdate,
  onStatusChange,
  onGoToWarehouse,
  onErrors,
  onLoadingChange,
  allowStatusUpdates = true,
  showQRGeneration = true,
  readOnlyMode = false,
  initialFormData = {}
}: DeliveryComponentProps) {

  // ===== STATE MANAGEMENT =====
  // Loading states
  const [isLoading, setIsLoading] = useState(false);

  // Individual loading states for specific operations
  const [isLoadingInventoryItems, setIsLoadingInventoryItems] = useState(false);
  const [isTransitioningToNew, setIsTransitioningToNew] = useState(false);


  // Modal states
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [showQrCode, setShowQrCode] = useState(false);
  const [showAcceptDeliveryModal, setShowAcceptDeliveryModal] = useState(false);

  // Error and validation states
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form state
  const [formData, setFormData] = useState<Partial<DeliveryItem>>({
    company_uuid: user?.company_uuid || null,
    admin_uuid: user?.uuid || null,
    inventory_items: {},
    warehouse_inventory_items: {},
    warehouse_uuid: null,
    delivery_address: "",
    delivery_date: format(new Date(), "yyyy-MM-dd"),
    operator_uuids: [],
    notes: "",
    status: "PENDING",
    name: "",
    ...initialFormData
  });

  // Inventory states
  const [selectedInventoryUuids, setSelectedInventoryUuids] = useState<string[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [selectedInventoryItems, setSelectedInventoryItems] = useState<string[]>([]);
  const [prevSelectedInventoryItems, setPrevSelectedInventoryItems] = useState<string[]>([]);
  const [expandedInventoryItemDetails, setExpandedInventoryItemDetails] = useState<Set<string>>(new Set());
  const [expandedInventories, setExpandedInventories] = useState<Set<string>>(new Set());
  const [inventoryViewMode, setInventoryViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [nextItemId, setNextItemId] = useState(1);
  const [inventorySelectAllStates, setInventorySelectAllStates] = useState<Record<string, { isChecked: boolean; isIndeterminate: boolean; }>>({});
  const [loadedInventoryUuids, setLoadedInventoryUuids] = useState<Set<string>>(new Set());
  const [pendingInventorySelection, setPendingInventorySelection] = useState<{ inventoryUuid: string; isSelected: boolean } | null>(null);
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);
  const [isSelectAllIndeterminate, setIsSelectAllIndeterminate] = useState(false);

  // Location states
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

  // Accept delivery states
  const [deliveryInput, setDeliveryInput] = useState("");
  const [acceptDeliveryTab, setAcceptDeliveryTab] = useState("paste-link");
  const [isAcceptingDelivery, setIsAcceptingDelivery] = useState(false);
  const [acceptDeliveryError, setAcceptDeliveryError] = useState<string | null>(null);
  const [acceptDeliverySuccess, setAcceptDeliverySuccess] = useState(false);

  // Add new QR Code states for inventory item targeting and loading
  const [selectedInventoryItemForQR, setSelectedInventoryItemForQR] = useState<{
    uuid: string;
    isGroup: boolean;
  } | null>(null);

  // Add new states for QR modal inventory loading
  const [isLoadingQRInventoryItems, setIsLoadingQRInventoryItems] = useState(false);


  // Operator states
  const [selectedOperators, setSelectedOperators] = useState<Array<Partial<UserProfile> & { uuid: string }>>([]);

  // QR Code states
  const [qrCodeData, setQrCodeData] = useState<{
    url: string;
    title: string;
    description: string;
    deliveryId: string;
    deliveryName: string;
    auto: boolean;
    showOptions: boolean;
  }>({
    url: "",
    title: "",
    description: "",
    deliveryId: "",
    deliveryName: "",
    auto: true,
    showOptions: true
  });

  // Other states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };

  // ===== HELPER FUNCTIONS =====
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
    return ["PENDING", "PROCESSING", "IN_TRANSIT"].includes(formData.status || '') && user?.is_admin === true || deliveryId === null;
  }

  const canEditAllFields = (): boolean => {
    return ["PENDING", "PROCESSING"].includes(formData.status || '') && user?.is_admin === true || deliveryId === null;
  };

  const getInventoryItemStatusStyling = (item: any) => {
    if (!deliveryId) {
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


  // Add new function to get group status styling
  const getGroupStatusStyling = (groupId: string, inventoryUuid: string) => {
    let groupItems;

    if (!groupId || groupId === '' || groupId === 'null') {
      groupItems = inventoryItems.filter(item =>
        item.inventory_uuid === inventoryUuid &&
        (!item.group_id || item.group_id === '' || item.group_id === null)
      );
    } else {
      groupItems = inventoryItems.filter(item =>
        item.group_id === groupId &&
        item.inventory_uuid === inventoryUuid
      );
    }

    if (groupItems.length === 0) {
      return {
        isDisabled: true,
        disabledReason: 'No items in group'
      };
    }

    // Check if ALL items are on delivery (and not part of current delivery)
    const allOnDelivery = groupItems.every(item => item.status === 'ON_DELIVERY');
    const allPartOfCurrentDelivery = groupItems.every(item =>
      formData.inventory_items?.[item.uuid] ||
      prevSelectedInventoryItems.includes(item.uuid)
    );

    if (allOnDelivery && !allPartOfCurrentDelivery) {
      return {
        isDisabled: true,
        disabledReason: 'All items in this group are assigned to another delivery'
      };
    }

    // Check if all items are in warehouse
    const allInWarehouse = groupItems.every(item => item.status === 'IN_WAREHOUSE');
    if (allInWarehouse && formData.status !== 'DELIVERED' && formData.status !== 'CANCELLED') {
      return {
        isDisabled: true,
        disabledReason: 'All items in this group are already in warehouse'
      };
    }

    // Check if all items are used
    const allUsed = groupItems.every(item => item.status === 'USED');
    if (allUsed && formData.status !== 'DELIVERED' && formData.status !== 'CANCELLED') {
      return {
        isDisabled: true,
        disabledReason: 'All items in this group have been used'
      };
    }

    // If there are available items, group is not disabled
    const hasAvailableItems = groupItems.some(item => {
      const itemStatusStyling = getInventoryItemStatusStyling(item);
      return !itemStatusStyling.isDisabled;
    });

    return {
      isDisabled: !hasAvailableItems,
      disabledReason: hasAvailableItems ? null : 'No available items in this group'
    };
  };

  // Add function to sort group items with ON_DELIVERY items at the bottom
  const sortGroupItems = (items: any[]) => {
    return [...items].sort((a, b) => {
      // Put ON_DELIVERY items at the bottom
      if (a.status === 'ON_DELIVERY' && b.status !== 'ON_DELIVERY') return 1;
      if (b.status === 'ON_DELIVERY' && a.status !== 'ON_DELIVERY') return -1;

      // For other statuses, maintain original order or sort by status priority
      const statusPriority: Record<string, number> = {
        'AVAILABLE': 0,
        'IN_WAREHOUSE': 1,
        'USED': 2,
        'ON_DELIVERY': 3
      };

      return (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99);
    });
  };

  const getDefaultDeliveryName = () => {
    if (!selectedInventoryItems.length) return "";

    const selectedInventoryUuidsFromItems = [...new Set(
      selectedInventoryItems.map(itemUuid => {
        const item = inventoryItems.find(inv => inv.uuid === itemUuid);
        return item?.inventory_uuid;
      }).filter(Boolean)
    )];

    const selectedInventoryNames = selectedInventoryUuidsFromItems
      .map(uuid => inventories.find(inv => inv.uuid === uuid)?.name)
      .filter(Boolean);

    if (selectedInventoryNames.length === 0) return "";
    if (selectedInventoryNames.length === 1) return selectedInventoryNames[0];
    if (selectedInventoryNames.length === 2) return selectedInventoryNames.join(' and ');

    return selectedInventoryNames.slice(0, -1).join(', ') + ' and ' + selectedInventoryNames[selectedInventoryNames.length - 1];
  };

  const deliveryNameValue = useMemo(() => {
    if (formData.name && formData.name.trim()) {
      return formData.name;
    }

    if (!deliveryId && selectedInventoryItems.length > 0) {
      return getDefaultDeliveryName();
    }

    return "";
  }, [formData.name, deliveryId, selectedInventoryItems, inventories, inventoryItems]);

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

  // ===== CORE FUNCTIONS =====
  const loadDeliveryDetails = async (deliveryId: string) => {
    try {
      setIsLoading(true);
      const result = await getDeliveryDetails(deliveryId, user?.company_uuid);

      if (result.success && result.data) {
        const deliveryData = result.data;
        setFormData(deliveryData);

        if (deliveryData.inventory_items) {
          // Extract inventory item UUIDs from the keys of inventory_items
          const inventoryItemUuids = Object.keys(deliveryData.inventory_items);
          setSelectedInventoryItems(inventoryItemUuids);
          setPrevSelectedInventoryItems(inventoryItemUuids);

          // Extract unique inventory UUIDs for loading
          const uniqueInventoryUuids = [...new Set(
            Object.values(deliveryData.inventory_items).map((item: any) => item.inventory_uuid)
          )];
          setSelectedInventoryUuids(uniqueInventoryUuids);

          // Extract locations from inventory_items
          const locations = Object.values(deliveryData.inventory_items).map((item: any) => item.location).filter(Boolean);
          setLocations(locations);

          // Set the first location for the 3D selector
          if (locations.length > 0) {
            const firstLoc = locations[0];
            setSelectedFloor(firstLoc.floor ?? null);
            setSelectedColumnCode(parseColumn(firstLoc.column ?? null) || "");
            setSelectedColumn(firstLoc.column ?? null);
            setSelectedRow(firstLoc.row ?? null);
            setSelectedDepth(firstLoc.depth ?? null);
            setSelectedGroup(firstLoc.group ?? null);
          }

          // Load inventory items for each unique inventory UUID
          for (const inventoryUuid of uniqueInventoryUuids) {
            try {
              await loadInventoryItemsWithCurrentData(inventoryUuid, true, deliveryData, deliveryId);
            } catch (error) {
              console.error(`Error loading inventory items for ${inventoryUuid}:`, error);
            }
          }

          console.log("Loaded delivery with inventory items:", deliveryData.inventory_items);
          console.log("Selected inventory item UUIDs:", inventoryItemUuids);
          console.log("Unique inventory UUIDs:", uniqueInventoryUuids);
        } else {
          setSelectedInventoryItems([]);
          setPrevSelectedInventoryItems([]);
          setSelectedInventoryUuids([]);
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
    } finally {
      setIsLoading(false);
    }
  };

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
        currentSelectedDeliveryId || deliveryId || undefined
      );

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
          const existingItems = prev.filter(item => item.inventory_uuid !== inventoryUuid);
          return [...existingItems, ...inventoryItemsWithIds];
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
  }, [formData, deliveryId, loadedInventoryUuids]);

  const handleStatusChange = async (status: string) => {
    if (!deliveryId) return { error: "No delivery selected" };

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
        deliveryId,
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

        if (onStatusChange) {
          onStatusChange(status);
        }

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
          newErrors.locations = `Please assign warehouse locations for all selected items. ${missingLocations.length} item(s) missing location.`;
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
          newErrors.locations = `Please assign warehouse locations for all selected items. ${missingLocations.length} item(s) missing location.`;
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

      if (deliveryId) {
        if (formData.status === "IN_TRANSIT") {
          result = await updateDeliveryStatusWithItems(
            deliveryId,
            "IN_TRANSIT",
            user.company_uuid
          );
        } else {
          result = await updateDeliveryWithItems(
            deliveryId,
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

        setFormData(prev => ({
          ...prev,
          ...newDelivery
        }));

        setPrevSelectedInventoryItems(selectedInventoryItems);
        await refreshOccupiedLocations();

        if (onDeliveryUpdate && newDelivery.uuid) {
          onDeliveryUpdate(newDelivery.uuid);
        }

        setErrors({});
      } else {
        setErrors({
          delivery: `Failed to ${deliveryId ? 'update' : 'create'} delivery. Please try again.`
        });
      }
    } catch (error) {
      console.error(`Error ${deliveryId ? 'updating' : 'creating'} delivery:`, error);
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

        setFormData(prev => ({
          ...prev,
          inventory_items: {
            ...prev.inventory_items,
            ...Object.fromEntries(selectedInventoryItems.map((uuid, index) => {
              const inventoryItem = inventoryItems.find(item => item.uuid === uuid);
              return [
                uuid,
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
          setSelectedCode(firstLocation.code || "");
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

  // In the handleInventoryItemSelectionToggle function, update this part:
  const handleInventoryItemSelectionToggle = async (inventoryitemUuid: string, isSelected: boolean) => {
    let inventoryItem = inventoryItems.find(item => item.uuid === inventoryitemUuid);

    if (!inventoryItem) {
      console.error("Inventory item not found:", inventoryitemUuid);
      return;
    }

    const inventoryUuid = inventoryItem.inventory_uuid;
    if (!loadedInventoryUuids.has(inventoryUuid)) {
      await loadInventoryItemsWithCurrentData(inventoryUuid, false, formData, deliveryId);
      inventoryItem = inventoryItems.find(item => item.uuid === inventoryitemUuid);
      if (!inventoryItem) {
        console.error("Inventory item still not found after loading:", inventoryitemUuid);
        return;
      }
    }

    if (!isSelected && inventoryItem.status === 'ON_DELIVERY' && deliveryId) {
      const isAssignedToCurrentDelivery = formData.inventory_items?.[inventoryItem.uuid] ||
        prevSelectedInventoryItems.includes(inventoryItem.uuid) ||
        selectedInventoryItems.includes(inventoryItem.uuid);

      if (!isAssignedToCurrentDelivery) {
        console.warn("Cannot deselect item assigned to another delivery");
        return;
      }
    }

    setSelectedInventoryItems(prev => {
      let newSelectedItems;

      if (isSelected) {
        newSelectedItems = [...prev, inventoryitemUuid];
      } else {
        newSelectedItems = prev.filter(uuid => uuid !== inventoryitemUuid);
      }

      // Update formData.inventory_items with inventory ITEM UUIDs as keys
      const currentInventoryItems = formData.inventory_items || {};
      const newInventoryItems: Record<string, { inventory_uuid: string; group_id: string | null; location: any }> = {};

      // Keep existing items that are still selected
      newSelectedItems.forEach(itemUuid => {
        const item = inventoryItems.find(inv => inv.uuid === itemUuid);
        if (item) {
          newInventoryItems[itemUuid] = {
            inventory_uuid: item.inventory_uuid,
            group_id: item.group_id || null,
            location: currentInventoryItems[itemUuid]?.location || null
          };
        }
      });

      console.log("Updated inventory items structure:", newInventoryItems);
      console.log("Keys (inventory item UUIDs):", Object.keys(newInventoryItems));

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

  // Update the handleGroupSelectionToggle function:
  const handleGroupSelectionToggle = async (groupId: string, inventoryUuid: string, isSelected: boolean) => {
    if (!groupId || groupId === '' || groupId === 'null') {
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
        await handleInventoryItemSelectionToggle(item.uuid, isSelected);
      }
      return;
    }

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

  // Update the handleSelectAllToggle function:
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
          const groupItems = inventoryItems.filter(groupItem => groupItem.group_id === groupInfo.groupId);
          const availableGroupItems = groupItems.filter(groupItem => {
            const statusStyling = getInventoryItemStatusStyling(groupItem);
            return !statusStyling.isDisabled;
          });
          availableGroupItems.forEach(groupItem => {
            if (!allItemsToSelect.includes(groupItem.uuid)) {
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

      // Build inventory_items with item UUIDs as keys
      const newInventoryItems: Record<string, { inventory_uuid: string; group_id: string | null; location: any }> = {};
      const newInventoryLocations: Record<string, ShelfLocation> = {};

      allItemsToSelect.forEach(itemUuid => {
        const item = inventoryItems.find(inv => inv.uuid === itemUuid);
        if (item) {
          newInventoryItems[itemUuid] = {
            inventory_uuid: item.inventory_uuid,
            group_id: item.group_id || null,
            location: formData.inventory_items?.[itemUuid]?.location || null
          };
          if (formData.inventory_items?.[itemUuid]?.location) {
            newInventoryLocations[itemUuid] = formData.inventory_items[itemUuid].location;
          }
        }
      });

      setFormData(prev => ({
        ...prev,
        inventory_items: newInventoryItems
      }));

      const newLocationsArray = Object.values(newInventoryLocations).filter(loc => loc !== null && loc.floor !== undefined);
      setLocations(newLocationsArray);

    } else {
      setSelectedInventoryItems([]);
      setFormData(prev => ({
        ...prev,
        inventory_items: {}
      }));
      setLocations([]);
    }
  };

  // Update the _performInventorySelectionLogic function:
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
        const groupedItems = groupInventoryItems(inventoryItemsForThisInventory);
        const groupInfo = getGroupInfo(item, groupedItems);

        if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
          const groupItems = inventoryItemsForThisInventory.filter(groupItem => groupItem.group_id === groupInfo.groupId);
          const availableGroupItems = groupItems.filter(groupItem => {
            const statusStyling = getInventoryItemStatusStyling(groupItem);
            return !statusStyling.isDisabled;
          });
          availableGroupItems.forEach(groupItem => {
            if (!itemsToSelect.includes(groupItem.uuid)) {
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
        const newSelected = [...prevSelected];
        itemsToSelect.forEach(itemUuid => {
          if (!newSelected.includes(itemUuid)) {
            newSelected.push(itemUuid);
          }
        });

        // Update inventory_items with item UUIDs as keys
        const newInventoryItems = { ...formData.inventory_items };
        itemsToSelect.forEach(itemUuid => {
          const item = inventoryItems.find(inv => inv.uuid === itemUuid);
          if (item) {
            newInventoryItems[itemUuid] = {
              inventory_uuid: item.inventory_uuid,
              group_id: item.group_id || null,
              location: newInventoryItems[itemUuid]?.location || null
            };
          }
        });

        setFormData(prev => ({
          ...prev,
          inventory_items: newInventoryItems
        }));

        return newSelected;
      });
    } else {
      const itemsToDeselect = inventoryItemsForThisInventory.map(item => item.uuid);
      setSelectedInventoryItems(prevSelected => {
        const newSelected = prevSelected.filter(uuid => !itemsToDeselect.includes(uuid));

        // Update inventory_items by removing deselected items
        const newInventoryItems = { ...formData.inventory_items };
        itemsToDeselect.forEach(itemUuid => {
          delete newInventoryItems[itemUuid];
        });

        setFormData(prev => ({
          ...prev,
          inventory_items: newInventoryItems
        }));

        return newSelected;
      });
    }
  };

  const handleInventorySelectAllToggle = async (inventoryUuid: string, isSelected: boolean) => {
    if (!loadedInventoryUuids.has(inventoryUuid)) {
      setPendingInventorySelection({ inventoryUuid, isSelected });
      try {
        await loadInventoryItemsWithCurrentData(inventoryUuid, false, formData, deliveryId);
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
    // if no keys are selected, reset expanded inventories
    if (!keys || keys.length === 0) {
      setExpandedInventories(new Set());
      setSelectedInventoryUuids([]);
      setSelectedInventoryItems([]);
      setPrevSelectedInventoryItems([]);
      resetWarehouseLocation();
      return;
    }

    const newExpandedKeys = keys as Set<string>;
    setExpandedInventories(newExpandedKeys);

    const newlyExpanded = Array.from(newExpandedKeys).filter(uuid =>
      !expandedInventories.has(uuid) && !loadedInventoryUuids.has(uuid)
    );

    for (const inventoryUuid of newlyExpanded) {
      try {
        await loadInventoryItemsWithCurrentData(inventoryUuid, false, formData, deliveryId);
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

  const handleAutoSelectChange = async (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));

    if (name === "warehouse_uuid" && value) {
      await handleWarehouseChange(value);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };


  const renderInventoryItemWithStatus = (item: any, isSelected: boolean, showAsGroup: boolean = false, groupId?: string, inventoryUuid?: string) => {
    // Use group status styling if it's a group, otherwise use individual item styling
    const statusStyling = showAsGroup && groupId && inventoryUuid
      ? getGroupStatusStyling(groupId, inventoryUuid)
      : getInventoryItemStatusStyling(item);

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

      if (showAsGroup && groupId && inventoryUuid) {
        // For groups, check if any item in the group can be selected
        const groupItems = inventoryItems.filter(groupItem =>
          groupItem.group_id === groupId &&
          groupItem.inventory_uuid === inventoryUuid
        );

        return groupItems.some(groupItem => {
          if (['ON_DELIVERY', 'IN_WAREHOUSE', 'USED'].includes(groupItem.status)) {
            const isPartOfCurrentDelivery = formData.inventory_items?.[groupItem.uuid] ||
              prevSelectedInventoryItems.includes(groupItem.uuid) ||
              selectedInventoryItems.includes(groupItem.uuid);
            return isPartOfCurrentDelivery || formData.status === 'PENDING';
          }
          return true;
        });
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
                    ({groupStats.selected}/{groupStats.available} selected)
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

  const getGroupItemSelectionState = (groupId: string, inventoryUuid: string) => {
    let groupItems;

    if (!groupId || groupId === '' || groupId === 'null') {
      groupItems = inventoryItems.filter(item =>
        item.inventory_uuid === inventoryUuid &&
        (!item.group_id || item.group_id === '' || item.group_id === null) &&
        (formData.status === 'DELIVERED' || formData.status === 'CANCELLED' ||
          (item.status !== 'IN_WAREHOUSE' && item.status !== 'USED'))
      );
    } else {
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

  const handleGroupItemSelectionToggle = async (itemUuid: string, isSelected: boolean, groupId: string) => {
    await handleInventoryItemSelectionToggle(itemUuid, isSelected);
  };

  // 3D Location modal functions
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

  // QR Code functions
  const generateDeliveryUrl = (deliveryId: string, auto: boolean, showOptions?: boolean, inventoryItemUuid?: string, isGroup?: boolean) => {
    const baseUrl = `${window.location.origin}/home/search`;

    // Get warehouse inventory UUID from the selected item or group
    let warehouseInventoryUuid: string | undefined;

    if (inventoryItemUuid) {
      if (isGroup) {
        // Find warehouse inventory UUID from any item in the group
        const groupItem = Object.entries(formData.warehouse_inventory_items || {}).find(([itemUuid, itemData]) => {
          return itemData.group_id === inventoryItemUuid;
        });
        if (groupItem) {
          warehouseInventoryUuid = groupItem[1].warehouse_inventory_uuid;
        }
      } else {
        // Get warehouse inventory UUID directly from the item
        const itemData = formData.warehouse_inventory_items?.[inventoryItemUuid];
        warehouseInventoryUuid = itemData?.warehouse_inventory_uuid;
      }
    }

    const params = new URLSearchParams({
      q: warehouseInventoryUuid || deliveryId, // Use warehouse inventory UUID if available, fallback to delivery ID
      ...(auto && { auto: 'true' }),
      ...(showOptions && { showOptions: 'true' }),
      ...(inventoryItemUuid && isGroup && { group: inventoryItemUuid }),
      ...(inventoryItemUuid && !isGroup && { item: inventoryItemUuid })
    });

    return `${baseUrl}?${params.toString()}`;
  };

  const updateQrCodeUrl = (auto: boolean, showOptions?: boolean, inventoryItemUuid?: string, isGroup?: boolean) => {
    const currentShowOptions = showOptions !== undefined ? showOptions : qrCodeData.showOptions;
    setQrCodeData(prev => ({
      ...prev,
      auto,
      ...(showOptions !== undefined && { showOptions }),
      url: generateDeliveryUrl(prev.deliveryId, auto, currentShowOptions, inventoryItemUuid, isGroup),
      description: `Scan this code to view delivery details for ${prev.deliveryName}${auto ? '. This will automatically accept the delivery when scanned.' : '.'}`
    }));
  };

  // Updated function to load all delivery inventory items for QR modal
  const loadAllDeliveryInventoryItems = async () => {
    if (!selectedInventoryItems.length) return;

    setIsLoadingQRInventoryItems(true);
    try {
      // Get unique inventory UUIDs from selected items
      const uniqueInventoryUuids = [...new Set(
        selectedInventoryItems.map(itemUuid => {
          const item = inventoryItems.find(inv => inv.uuid === itemUuid);
          return item?.inventory_uuid;
        }).filter(Boolean)
      )];

      // Load any missing inventory data
      const loadPromises = uniqueInventoryUuids.map(async (inventoryUuid) => {
        if (!loadedInventoryUuids.has(inventoryUuid)) {
          await loadInventoryItemsWithCurrentData(inventoryUuid, true, formData, deliveryId);
        }
      });

      await Promise.all(loadPromises);
    } catch (error) {
      console.error("Error loading inventory items for QR modal:", error);
    } finally {
      setIsLoadingQRInventoryItems(false);
    }
  };

  // Get unique options for QR code targeting (no duplicate group IDs)
  const getQRTargetOptions = () => {
    if (!formData.warehouse_inventory_items || Object.keys(formData.warehouse_inventory_items).length === 0) return [];

    const seenGroups = new Set<string>();
    const options: Array<{
      uuid: string;
      label: string;
      isGroup: boolean;
      groupId?: string;
      inventoryName?: string;
    }> = [];

    // Iterate through key-value pairs of warehouse inventory items
    Object.entries(formData.warehouse_inventory_items).forEach(([itemUuid, item]) => {
      // Find the inventory name for this item
      const inventoryItem = inventoryItems.find(invItem => invItem.uuid === itemUuid);
      const inventoryName = inventoryItem?.inventory_name || 'Unknown Inventory';

      if (item.group_id && item.group_id !== '' && item.group_id !== null) {
        // Handle grouped items - only add unique group IDs
        if (!seenGroups.has(item.group_id)) {
          seenGroups.add(item.group_id);
          options.push({
            uuid: itemUuid, // Use any item UUID from the group as reference
            label: `${inventoryName} (Group): ${item.group_id}`,
            isGroup: true,
            groupId: item.group_id,
            inventoryName: inventoryName
          });
        }
      } else {
        // Handle individual items (no group or empty group)
        options.push({
          uuid: itemUuid,
          label: `${inventoryName} (Item): ${itemUuid}`,
          isGroup: false,
          inventoryName: inventoryName
        });
      }
    });

    return options;
  };

  const updateShowOptions = (showOptions: boolean) => {
    setQrCodeData(prev => ({
      ...prev,
      showOptions,
      url: generateDeliveryUrl(prev.deliveryId, prev.auto, showOptions)
    }));
  };

  const handleShowDeliveryQR = async () => {
    if (!deliveryId || !formData) return;

    const inventoryNames = selectedInventoryUuids
      .map(uuid => inventories.find(item => item.uuid === uuid)?.name)
      .filter(Boolean);
    const deliveryName = inventoryNames.length > 0
      ? `Delivery of ${inventoryNames.join(', ')}`
      : 'Delivery';

    setQrCodeData({
      url: generateDeliveryUrl(deliveryId, true, true),
      title: "Delivery QR Code",
      description: `Scan this code to view delivery details for ${deliveryName}.`,
      deliveryId: deliveryId,
      deliveryName: deliveryName,
      auto: true,
      showOptions: true
    });

    setShowQrCode(true);

    // Load all delivery inventory items when QR modal is shown
    await loadAllDeliveryInventoryItems();
  };

  // Update QR Code Modal content to include inventory item selection with loaded items
  const renderQRCodeModal = () => (
    <Modal
      isOpen={showQrCode}
      onClose={() => {
        setShowQrCode(false);
        setSelectedInventoryItemForQR(null);
      }}
      placement="auto"
      backdrop="blur"
      size="lg"
      classNames={{ backdrop: "bg-background/50" }}
    >
      <ModalContent>
        <ModalHeader>{qrCodeData.title}</ModalHeader>
        <ModalBody className="flex flex-col items-center">
          <div className="bg-white rounded-xl overflow-hidden">
            {selectedInventoryItemForQR?.uuid ?
              <QRCodeCanvas
                id="delivery-qrcode"
                value={qrCodeData.url}
                size={320}
                marginSize={4}
                level="L"
              />
              :
              <div className="h-80 w-80 flex items-center justify-center text-primary-500 text-center">
                Select an inventory item to <br />generate QR code
              </div>
            }
          </div>

          <p className="text-center mt-4 text-default-600">
            {qrCodeData.description}
          </p>

          <div className="w-full overflow-hidden mt-4 space-y-4">
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
                  onValueChange={(checked) => {
                    updateShowOptions(checked);
                    if (checked && selectedInventoryItemForQR) {
                      updateQrCodeUrl(qrCodeData.auto, checked, selectedInventoryItemForQR.uuid, selectedInventoryItemForQR.isGroup);
                    }
                  }}
                  size="sm"
                />
              </div>
            </div>

            <div className="p-4 bg-default-50 rounded-xl border-2 border-default-200">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-default-700">Auto Accept Delivery</span>
                  <span className="text-xs text-default-500">
                    When enabled, scanning this QR code will automatically accept the delivery or mark the item as used
                  </span>
                </div>
                <Switch
                  isSelected={qrCodeData.auto}
                  onValueChange={(checked) => {
                    updateQrCodeUrl(checked, qrCodeData.showOptions, selectedInventoryItemForQR?.uuid, selectedInventoryItemForQR?.isGroup);
                  }}
                  size="sm"
                />
              </div>
            </div>

            {/* Inventory Item Selection for QR Code */}
            {qrCodeData.showOptions && (
              <div className="p-4 bg-warning-50 rounded-xl border-2 border-warning-200">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-warning-700">Target Specific Item</span>
                    <span className="text-xs text-warning-600">
                      Generate QR code to mark a specific inventory item as used from warehouse
                    </span>
                  </div>

                  <LoadingAnimation
                    condition={isLoadingQRInventoryItems}
                    skeleton={
                      <Skeleton className="h-10 w-full rounded-xl" />
                    }
                  >
                    <div className="flex gap-2 flex-col">
                      <Autocomplete
                        placeholder="Select inventory item (optional)"
                        size="sm"
                        selectedKey={selectedInventoryItemForQR?.uuid || ""}
                        onSelectionChange={(selectedKey) => {
                          if (selectedKey) {
                            const targetOptions = getQRTargetOptions();
                            const selectedOption = targetOptions.find(option => option.uuid === selectedKey);

                            if (selectedOption) {
                              setSelectedInventoryItemForQR({
                                uuid: selectedOption.isGroup ? selectedOption.groupId! : selectedKey as string,
                                isGroup: selectedOption.isGroup
                              });
                              updateQrCodeUrl(
                                qrCodeData.auto,
                                qrCodeData.showOptions,
                                selectedOption.isGroup ? selectedOption.groupId! : selectedKey as string,
                                selectedOption.isGroup
                              );
                            }
                          } else {
                            setSelectedInventoryItemForQR(null);
                            updateQrCodeUrl(qrCodeData.auto, qrCodeData.showOptions);
                          }
                        }}
                        isDisabled={isLoadingQRInventoryItems}
                      >
                        {getQRTargetOptions().map(option => (
                          <AutocompleteItem key={option.uuid}>
                            {option.label}
                          </AutocompleteItem>
                        ))}
                      </Autocomplete>
                      {selectedInventoryItemForQR && (
                        <div className="text-xs text-warning-800 bg-warning-100 p-2 rounded">
                          <div className="flex items-center justify-between">
                            <div>
                              QR will target: {selectedInventoryItemForQR.isGroup ? 'Group' : 'Item'} {selectedInventoryItemForQR.uuid}
                              {selectedInventoryItemForQR.isGroup && (
                                <div className="mt-1 text-warning-600">
                                  This will mark one item from the group as used
                                </div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="flat"
                              color="danger"
                              isIconOnly
                              onPress={() => {
                                setSelectedInventoryItemForQR(null);
                                updateQrCodeUrl(qrCodeData.auto, qrCodeData.showOptions);
                              }}
                            >
                              <Icon icon="mdi:close" />
                            </Button>
                          </div>
                        </div>
                      )}

                      {!isLoadingQRInventoryItems && formData.warehouse_inventory_items && Object.keys(formData.warehouse_inventory_items).length === 0 && (
                        <div className="text-xs text-warning-600 bg-warning-100 p-2 rounded">
                          No inventory items loaded. Please ensure the delivery has selected items.
                        </div>
                      )}

                      {!isLoadingQRInventoryItems && formData.warehouse_inventory_items && Object.keys(formData.warehouse_inventory_items).length > 0 && (
                        <div className="text-xs text-default-600 bg-default-50 p-2 rounded">
                          Loaded {Object.keys(formData.warehouse_inventory_items).length} inventory items • {getQRTargetOptions().length} unique options available
                        </div>
                      )}
                    </div>
                  </LoadingAnimation>
                </div>
              </div>
            )}
          </div>

          <AnimatePresence>
            {selectedInventoryItemForQR?.uuid && (
              <motion.div
                {...motionTransition}>
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
              </motion.div>
            )}
          </AnimatePresence>
        </ModalBody>
        <ModalFooter className="flex justify-end p-4 gap-4">
          <Button color="default" onPress={() => {
            setShowQrCode(false);
            setSelectedInventoryItemForQR(null);
          }}>
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
              setSelectedInventoryItemForQR(null);
            }}
          >
            <Icon icon="mdi:download" className="mr-1" />
            Download QR
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );


  // === EFFECTS ===

  useEffect(() => {
    const assignments: Array<ShelfSelectorColorAssignment> = [];

    const currentLocation = currentInventoryItemLocationIndex >= 0 && locations && locations[currentInventoryItemLocationIndex]
      ? locations[currentInventoryItemLocationIndex]
      : null;

    if (locations && locations.length > 0) {
      locations.forEach((location, index) => {
        if (location && location.floor !== undefined) {
          if (index !== currentInventoryItemLocationIndex) {
            assignments.push({
              floor: location.floor,
              group: location.group,
              row: location.row,
              column: location.column,
              depth: location.depth,
              colorType: 'secondary'
            });
          }
        }
      });
    }

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

    setShelfColorAssignments(assignments);
  }, [locations, currentInventoryItemLocationIndex]);

  useEffect(() => {
    if (showAcceptDeliveryModal && acceptDeliveryTab === "paste-link") {
      setTimeout(() => {
        const input = document.querySelector('[placeholder="Paste delivery UUID or URL here..."]') as HTMLInputElement;
        input?.focus();
      }, 100);
    }
  }, [showAcceptDeliveryModal, acceptDeliveryTab]);

  useEffect(() => {
    if (formData.warehouse_uuid && shelfColorAssignments.length >= 0) {
      refreshOccupiedLocations();
    }
  }, [shelfColorAssignments, formData.warehouse_uuid]);

  useEffect(() => {
    if (formData.status === "DELIVERED" &&
      !deliveryId &&
      selectedFloor !== null &&
      selectedColumn !== null &&
      selectedRow !== null &&
      selectedGroup !== null) {

      const location = {
        floor: selectedFloor,
        group: selectedGroup,
        row: selectedRow,
        column: selectedColumn !== null ? selectedColumn : 0,
        depth: selectedDepth !== null ? selectedDepth : 0
      };

      const newLocations = [...locations];

      if (currentInventoryItemLocationIndex < newLocations.length) {
        newLocations[currentInventoryItemLocationIndex] = location;
      } else {
        newLocations.push(location);
      }

      setFormData(prev => ({
        ...prev,
        locations: newLocations
      }));

      setLocations(newLocations);
    }

  }, [selectedFloor, selectedColumn, selectedRow, selectedGroup, selectedDepth, formData.status, currentInventoryItemLocationIndex, locations, deliveryId]);

  useEffect(() => {
    if (currentInventoryItemLocationIndex >= 0 &&
      currentInventoryItemLocationIndex < selectedInventoryItems.length &&
      formData.inventory_items) {

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

  // Load delivery when deliveryId changes
  useEffect(() => {
    const loadDelivery = async () => {
      handleAccordionSelectionChange([]);

      if (!deliveryId || !user?.company_uuid) {
        // Show brief loading animation when transitioning to new delivery
        if (deliveryId === null) {
          setIsTransitioningToNew(true);

          // Brief delay to show the loading animation
          setTimeout(() => {
            setIsTransitioningToNew(false);
          }, 300);
        }

        // Reset form for new delivery
        setFormData({
          company_uuid: user?.company_uuid || null,
          admin_uuid: user?.uuid || null,
          inventory_items: {},
          warehouse_uuid: null,
          delivery_address: "",
          delivery_date: format(new Date(), "yyyy-MM-dd"),
          operator_uuids: [],
          notes: "",
          status: "PENDING",
          name: "",
          ...initialFormData
        });

        return;
      }

      try {
        // Load delivery details (this will set isLoading internally)
        const deliveryData = await loadDeliveryDetails(deliveryId);

        if (deliveryData && deliveryData.warehouse_uuid) {
          await handleWarehouseChange(deliveryData.warehouse_uuid);
        }
      } catch (error) {
        console.error("Error loading delivery:", error);
        setIsLoading(false);
      }
    };

    loadDelivery();
  }, [deliveryId, user?.company_uuid]);

  // Load initial inventory data when inventories prop changes
  useEffect(() => {
    if (!deliveryId && inventories.length > 0) {
      // For new deliveries, show all inventories initially
      const allInventoryUuids = inventories.map((item: any) => item.uuid);
      setSelectedInventoryUuids(allInventoryUuids);
    }
  }, [inventories, deliveryId]);

  // Handle pending inventory selection
  useEffect(() => {
    if (pendingInventorySelection && loadedInventoryUuids.has(pendingInventorySelection.inventoryUuid)) {
      setTimeout(() => {
        _performInventorySelectionLogic(pendingInventorySelection.inventoryUuid, pendingInventorySelection.isSelected);
        setPendingInventorySelection(null);
      }, 100);
    }
  }, [inventoryItems, loadedInventoryUuids, pendingInventorySelection]);

  // Update select all states
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

    let selectedAvailableCount = 0;
    let totalAvailableCount = 0;

    availableItems.forEach(item => {
      const groupedItems = getGroupedInventoryItems();
      const groupInfo = getGroupInfo(item, groupedItems);

      if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
        const groupItems = inventoryItems.filter(groupItem =>
          groupItem.group_id === groupInfo.groupId &&
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

  // Update per-inventory select all states
  useEffect(() => {
    const newStates: Record<string, { isChecked: boolean; isIndeterminate: boolean }> = {};

    selectedInventoryUuids.forEach(inventoryUuid => {
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

      let selectedAvailableCount = 0;
      let totalAvailableCount = 0;

      availableItems.forEach(item => {
        const groupedItems = getGroupedInventoryItems();
        const groupInfo = getGroupInfo(item, groupedItems);

        if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
          const groupItems = inventoryItemsForThisInventory.filter(groupItem =>
            groupItem.group_id === groupInfo.groupId &&
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

  useEffect(() => {
    if (Object.keys(errors).length > 0 && onErrors) {
      onErrors(errors);
    }
  }, [errors, onErrors]);

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  const updateMainLoadingState = useCallback(() => {
    const isAnyLoading = isLoadingInventoryItems || isTransitioningToNew || isAutoAssigning || isAcceptingDelivery;
    setIsLoading(isAnyLoading);
  }, [isLoadingInventoryItems, isTransitioningToNew, isAutoAssigning, isAcceptingDelivery]);

  // Set up real-time updates
  useEffect(() => {
    if (!user?.company_uuid) return;

    const supabase = createClient();

    const deliveryInventoryChannel = supabase
      .channel('delivery_inventory')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_inventory',
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async (payload) => {
          console.log('Real-time update received for delivery inventory:', payload);

          // Handle insert, update, delete events
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const updatedDeliveryId = payload.new.delivery_id;
            if (updatedDeliveryId === deliveryId && deliveryId) {
              // Reload the delivery details to reflect changes
              await loadDeliveryDetails(deliveryId);
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedDeliveryId = payload.old.delivery_id;
            if (deletedDeliveryId === deliveryId) {
              // Reset form if the current delivery was deleted
              setFormData(initialFormData);
            }
          }
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up real-time subscriptions for delivery inventory');
      supabase.removeChannel(deliveryInventoryChannel);
    };
  }, [user?.company_uuid]);

  return (
    <div>
      <Form id="deliveryForm" onSubmit={handleSubmit} className="items-stretch space-y-4">
        <CardList>
          <div className="space-y-4">
            <LoadingAnimation
              condition={!user || isLoading || isTransitioningToNew}
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
                <AnimatePresence>
                  {deliveryId && (
                    <motion.div
                      {...motionTransition}>
                      <Input
                        label="Delivery Identifier"
                        value={deliveryId}
                        isReadOnly
                        classNames={inputStyle}
                        startContent={<Icon icon="mdi:truck-delivery" className="text-default-500 mb-[0.2rem]" />}
                        endContent={
                          <Button
                            variant="flat"
                            color="default"
                            isIconOnly
                            onPress={() => copyToClipboard(deliveryId || "")}
                          >
                            <Icon icon="mdi:content-copy" className="text-default-500" />
                          </Button>
                        }
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <Input
                  name="name"
                  label="Delivery Name"
                  value={deliveryNameValue}
                  onChange={handleInputChange}
                  isRequired={canEditAllFields()}
                  isReadOnly={deliveryId !== null && !readOnlyMode}
                  classNames={inputStyle}
                  startContent={<Icon icon="mdi:package" className="text-default-500 mb-[0.2rem]" />}
                  placeholder={deliveryId && selectedInventoryUuids.length > 0 ? getDefaultDeliveryName() : "Enter delivery name"}
                />

                {/* Warehouse Selection and Date Picker */}
                <div className="flex flex-col lg:flex-row gap-4">
                  <Autocomplete
                    label="Warehouse"
                    placeholder="Select warehouse"
                    selectedKey={formData.warehouse_uuid || ""}
                    onSelectionChange={(value) => handleAutoSelectChange("warehouse_uuid", value)}
                    isRequired={canEditAllFields()}
                    isReadOnly={deliveryId !== null || readOnlyMode}
                    inputProps={{ classNames: inputStyle }}
                    isInvalid={!!errors.warehouse_uuid}
                    errorMessage={errors.warehouse_uuid}
                    startContent={<Icon icon="mdi:warehouse" className="text-default-500 mb-[0.2rem]" />}
                    isLoading={false}
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
                    isReadOnly={deliveryId !== null || readOnlyMode}
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
              condition={!user || isLoading || isTransitioningToNew}
              skeleton={
                <div className="space-y-4 justify-center items-center">
                  <Skeleton className="h-[1.75rem] w-48 rounded-xl mx-auto" />
                  <Skeleton className="h-16 w-full rounded-xl" />

                  <div className="space-y-2">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-default-50 rounded-xl border border-default-200 gap-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="w-10 h-10 rounded-full" />
                          <div className="flex flex-col gap-1">
                            <Skeleton className="h-5 w-32 rounded-xl" />
                            <div className="flex flex-col sm:flex-row sm:gap-4">
                              <Skeleton className="h-4 w-40 rounded-xl" />
                              <Skeleton className="h-4 w-28 rounded-xl" />
                            </div>
                          </div>
                        </div>
                        <Skeleton className="w-8 h-8 rounded-xl" />
                      </div>
                    ))}
                  </div>
                </div>
              }>
              <div className="space-y-4 justify-center items-center">
                <h3 className="text-lg text-center font-semibold">Assigned Operators</h3>

                {canEditLimited() && !readOnlyMode && (
                  <Autocomplete
                    label="Add Operator"
                    placeholder="Select an operator to add"
                    onSelectionChange={(value) => {
                      if (value) {
                        handleAddOperator(value as string);
                      }
                    }}
                    inputProps={{ classNames: inputStyle }}
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

                <AnimatePresence mode="wait">
                  {selectedOperators.length > 0 && (
                    <motion.div className="space-y-2" {...motionTransition}>
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

                          {canEditAllFields() && !readOnlyMode && (
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
                    </motion.div>
                  )}
                  {selectedOperators.length === 0 && (
                    <div className="p-4 text-center text-default-500 bg-default-50 rounded-xl border border-dashed border-default-300">
                      {canEditAllFields() && !readOnlyMode
                        ? "No operators assigned. Use the dropdown above to add operators."
                        : "No operators assigned to this delivery."
                      }
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </LoadingAnimation>
          </div>

          <div>
            <LoadingAnimation
              condition={!user || isLoading || isTransitioningToNew}
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
                <div className="space-y-4">
                  <div className="border-2 border-default-200 rounded-xl bg-gradient-to-b from-background to-default-50/30 overflow-hidden">
                    <div className="flex justify-between items-center border-b border-default-200 p-4">
                      <h3 className="text-lg font-semibold">Inventories</h3>
                      <div className="flex gap-2 items-center">
                        <Chip color="primary" size="sm" variant="flat">
                          {selectedInventoryItems.length} items selected
                        </Chip>

                        {(user?.is_admin && !readOnlyMode) && selectedInventoryItems.length > 0 && !isWarehouseNotSet() && !isFloorConfigNotSet() && (canEditAllFields() || canEditLimited()) && (
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
                        onSelectionChange={handleAccordionSelectionChange}
                        itemClasses={{
                          base: "p-0 bg-default-50 rounded-xl overflow-hidden border-2 border-default-200",
                          title: "font-normal text-lg font-semibold",
                          trigger: "p-4 data-[hover=true]:bg-default-100 flex items-center transition-colors",
                          indicator: "text-medium",
                          content: "text-small py-4 px-2",
                        }}
                      >
                        {selectedInventoryUuids.map((inventoryUuid) => {
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
                                    {(user && user.is_admin && !readOnlyMode) && (
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
                                        {(formData.status === "PENDING" || formData.status === "PROCESSING") && (user?.is_admin && !readOnlyMode) ?
                                          `${selectedItemCount}/${inventory?.count?.inventory || 0} items selected` :
                                          `${selectedItemCount} items selected`}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              }
                            >
                              <div className="space-y-4">
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
                                        {getDisplayInventoryItemsListForInventory(inventoryUuid)
                                          .filter((item, index) => {
                                            if (
                                              formData.status === "PROCESSING" ||
                                              formData.status === "IN_TRANSIT" ||
                                              formData.status === "DELIVERED" ||
                                              formData.status === "CANCELLED"
                                            ) {
                                              const groupedItems = getGroupedInventoryItems();
                                              const groupInfo = getGroupInfo(item, groupedItems);

                                              if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
                                                const groupItems = inventoryItemsForThisInventory.filter(groupItem =>
                                                  groupItem.group_id === groupInfo.groupId
                                                );
                                                return groupItems.some(groupItem => selectedInventoryItems.includes(groupItem.uuid));
                                              } else {
                                                return selectedInventoryItems.includes(item.uuid);
                                              }
                                            }
                                            return true;
                                          })
                                          .map((item: any, index: number) => {
                                            const groupedItems = getGroupedInventoryItems();
                                            const groupInfo = getGroupInfo(item, groupedItems);
                                            const displayNumber = index + 1;

                                            const itemsToSelect = inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId
                                              ? inventoryItemsForThisInventory.filter(groupItem => groupItem.group_id === groupInfo.groupId)
                                              : [item];

                                            const isSelected = itemsToSelect.every(groupItem => selectedInventoryItems.includes(groupItem.uuid));

                                            return (
                                              <AccordionItem
                                                key={`${item.uuid}-${inventoryViewMode}-${inventoryUuid}`}
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

                                                  <div className="space-y-4 p-4">
                                                    {(() => {
                                                      let itemsToShow = inventoryViewMode === 'grouped' && groupInfo.isGroup
                                                        ? inventoryItemsForThisInventory.filter(groupItem => groupItem.group_id === groupInfo.groupId)
                                                        : [item];

                                                      if (formData.status !== 'DELIVERED' && formData.status !== 'CANCELLED') {
                                                        itemsToShow = itemsToShow.filter(inventoryItem =>
                                                          inventoryItem.status !== 'IN_WAREHOUSE' && inventoryItem.status !== 'USED'
                                                        );
                                                      }

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

                                                      // Sort items with ON_DELIVERY items at the bottom
                                                      itemsToShow = sortGroupItems(itemsToShow);

                                                      return (
                                                        <div className="space-y-4">
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
                                                            itemsToShow.map((inventoryItem, itemIndex) => {
                                                              const itemLocationIndex = selectedInventoryItems.indexOf(inventoryItem.uuid);
                                                              const hasAssignedLocation = itemLocationIndex >= 0 && locations[itemLocationIndex];
                                                              const isItemSelected = selectedInventoryItems.includes(inventoryItem.uuid);
                                                              const itemStatusStyling = getInventoryItemStatusStyling(inventoryItem);

                                                              return (
                                                                <div key={inventoryItem.uuid} className="border border-default-200 rounded-xl p-4 bg-default-50/50">
                                                                  <div className="space-y-3">
                                                                    {inventoryViewMode === 'grouped' && groupInfo.isGroup && !readOnlyMode && (
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

                                                                    {inventoryViewMode === 'grouped' && inventoryItem.status && !groupInfo.isGroup && (
                                                                      <div className="flex items-center gap-2 justify-between">
                                                                        <span className="text-sm text-default-500">Item {itemIndex + 1}</span>
                                                                        <Chip color={getStatusColor(inventoryItem.status)} variant="flat" size="sm">
                                                                          {formatStatus(inventoryItem.status)}
                                                                        </Chip>
                                                                      </div>
                                                                    )}

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

                                                                    {hasAssignedLocation && (formData.status === "DELIVERED" || formData.status === "CANCELLED") && (
                                                                      <Input
                                                                        label="Assigned Location"
                                                                        value={locations[itemLocationIndex]?.code || 'Not assigned'}
                                                                        isReadOnly
                                                                        classNames={{ inputWrapper: inputStyle.inputWrapper }}
                                                                        startContent={<Icon icon="mdi:map-marker" className="text-default-500 mb-[0.2rem]" />}
                                                                        endContent={
                                                                          <div className="flex items-center gap-2">
                                                                            <Button
                                                                              variant="flat"
                                                                              color="default"
                                                                              isIconOnly
                                                                              onPress={() => {
                                                                                setCurrentInventoryItemLocationIndex(itemLocationIndex >= 0 ? itemLocationIndex : selectedInventoryItems.length);

                                                                                if (!selectedInventoryItems.includes(inventoryItem.uuid)) {
                                                                                  handleInventoryItemSelectionToggle(inventoryItem.uuid, true);
                                                                                }

                                                                                onOpen();
                                                                              }}
                                                                              isDisabled={!(user === null || user.is_admin) || isWarehouseNotSet() || isFloorConfigNotSet() || readOnlyMode}
                                                                            >
                                                                              <Icon icon="mdi:map-marker-plus" className="text-default-500" />
                                                                            </Button>
                                                                            <Button
                                                                              variant="flat"
                                                                              color="default"
                                                                              isIconOnly
                                                                              onPress={() => copyToClipboard(locations[itemLocationIndex]?.code || '')}
                                                                            >
                                                                              <Icon icon="mdi:content-copy" className="text-default-500" />
                                                                            </Button>
                                                                          </div>
                                                                        }
                                                                      />
                                                                    )}

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

                                                                    {isItemSelected && formData.status !== "DELIVERED" && formData.status !== "CANCELLED" && !readOnlyMode && (
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
                                                                            setCurrentInventoryItemLocationIndex(itemLocationIndex >= 0 ? itemLocationIndex : selectedInventoryItems.length);

                                                                            if (!selectedInventoryItems.includes(inventoryItem.uuid)) {
                                                                              handleInventoryItemSelectionToggle(inventoryItem.uuid, true);
                                                                            }

                                                                            onOpen();
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
              condition={!user || isLoading || isTransitioningToNew}
              skeleton={
                <div className="space-y-4">
                  <Skeleton className="h-[1.75rem] w-48 rounded-xl mx-auto" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              }
            >
              <h2 className="text-xl font-semibold mb-4 w-full text-center">
                Delivery Details
              </h2>
              <div className="space-y-4">
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
                  isReadOnly={!isDeliveryProcessing() || !(user === null || user.is_admin) || readOnlyMode}
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
                  <Skeleton className="h-[1.75rem] w-48 rounded-xl mx-auto" />
                  <div className="border-2 border-default-200 rounded-xl bg-gradient-to-b from-background to-default-50/30">
                    <div className="flex justify-between items-center border-b border-default-200 p-4">
                      <Skeleton className="h-5 w-32 rounded-xl" />
                      <Skeleton className="h-6 w-24 rounded-xl" />
                    </div>

                    <div className="p-4">
                      <Skeleton className="h-5 w-36 rounded-xl mb-4" />
                      <div className="relative">
                        <div className="absolute left-[calc((3rem/2)-0.1rem)] top-0 bottom-1 w-0.5 bg-default-100 rounded-full"></div>

                        <div className="space-y-5">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-start">
                              <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
                              <div className="ml-4 p-3 rounded-xl border border-default-200 flex-grow">
                                <div className="flex justify-between items-center flex-wrap gap-2">
                                  <Skeleton className="h-6 w-28 rounded-xl" />
                                  <Skeleton className="h-4 w-36 rounded-xl" />
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
                          <div className="absolute left-[calc((3rem/2)-0.1rem)] top-0 bottom-1 w-0.5 bg-default-100 rounded-full"></div>
                          <div className="space-y-5">
                            {Object.entries(formData.status_history)
                              .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
                              .map(([timestamp, status]) => {
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
                  {(user === null || user.is_admin) && deliveryId && formData.status !== "DELIVERED" && formData.status !== "CANCELLED" && allowStatusUpdates && !readOnlyMode && (
                    <motion.div {...motionTransition}>
                      <div className="flex flex-col gap-4 pt-4 -mx-4">
                        <hr className="border-default-200" />
                        <h3 className="text-lg font-semibold w-full text-center">Quick Status Update</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 px-4">
                          <Button
                            color="warning"
                            variant="flat"
                            className="w-full"
                            isDisabled={formData.status === "PROCESSING" || formData.status === "IN_TRANSIT" || formData.status === "DELIVERED" || formData.status === "CANCELLED" || isLoading || isTransitioningToNew}
                            onPress={() => handleStatusChange("PROCESSING")}
                          >
                            <Icon icon="mdi:clock-start" className="mr-1" />
                            Processing
                          </Button>
                          <Button
                            color="primary"
                            variant="flat"
                            className="w-full"
                            isDisabled={formData.status === "IN_TRANSIT" || formData.status === "DELIVERED" || formData.status === "CANCELLED" || isLoading || isTransitioningToNew}
                            onPress={() => handleStatusChange("IN_TRANSIT")}
                          >
                            <Icon icon="mdi:truck-fast" className="mr-1" />
                            In Transit
                          </Button>
                          <Button
                            color="danger"
                            variant="flat"
                            className="w-full"
                            isDisabled={formData.status === "CANCELLED" || formData.status === "DELIVERED" || isLoading || isTransitioningToNew}
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

          {(user === null || user.is_admin || formData.status === "DELIVERED") && formData.status !== "CANCELLED" && !readOnlyMode && (
            <motion.div {...motionTransition}>
              <div className="flex flex-col flex-1 gap-4">
                <LoadingAnimation
                  condition={!user || isLoading || isLoadingInventoryItems}
                  skeleton={
                    <div className="flex justify-center items-center gap-4">
                      <Skeleton className="h-10 w-full rounded-xl" />
                      <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                  }
                >
                  <div className="flex flex-col md:flex-row justify-center items-center gap-4">
                    {deliveryId && showQRGeneration && (formData.status === "DELIVERED" || formData.status === 'IN_TRANSIT') && (
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
                      </>
                    )}

                    {(user.is_admin && formData.status !== "DELIVERED") && (
                      <Button
                        type="submit"
                        form="deliveryForm"
                        color="primary"
                        variant="shadow"
                        className="w-full"
                        isLoading={isLoading || isTransitioningToNew}
                      >
                        <Icon icon="mdi:content-save" className="mr-1" />
                        {deliveryId ? "Update Delivery" : "Create Delivery"}
                      </Button>
                    )}
                  </div>
                </LoadingAnimation>
              </div>
            </motion.div>
          )}
        </CardList>
      </Form>

      {/* QR Code Modal */}
      {renderQRCodeModal()}

      {/* 3D Shelf Selector */}
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
    </div>
  );
}