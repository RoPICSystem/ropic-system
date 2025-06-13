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

// Import server actions
import CardList from '@/components/card-list';
import {
  createDeliveryWithItems,
  DeliveryItem,
  getDeliveryDetails,
  getOccupiedShelfLocations,
  suggestShelfLocations,
  updateDeliveryItem,
  updateDeliveryStatusWithItems,
  updateDeliveryWithItems
} from "./actions";

// Import the QR code scanner library
import ListLoadingAnimation from '@/components/list-loading-animation';
import LoadingAnimation from '@/components/loading-animation';
import { getUserFromCookies, getUsersFromCompany, UserProfile } from '@/utils/supabase/server/user';
import { copyToClipboard, formatDate, formatStatus, showErrorToast } from '@/utils/tools';
import jsQR from "jsqr";
import { getInventoryItem, getInventoryItems, Inventory } from '../inventory/actions';
import { getWarehouses, Warehouse } from '../warehouses/actions';

// Import at the top of your DeliveryPage component 
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


// Import the ShelfSelector3D component
const ShelfSelector3D = lazy(() =>
  import("@/components/shelf-selector-3d").then(mod => ({
    default: mod.ShelfSelector3D
  }))
);

export default function DeliveryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<Array<Partial<Warehouse> & { uuid: string }>>([]);
  const [operators, setOperators] = useState<Array<Partial<UserProfile> & { uuid: string }>>([]);
  const [inventoryItems, setInventoryItems] = useState<Array<Partial<Inventory> & { uuid: string }>>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);
  const [isLoadingInventoryItems, setIsLoadingInventoryItems] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [showQrCode, setShowQrCode] = useState(false);
  const [showAcceptForm, setShowAcceptForm] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Delivery list state
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);

  // Inventory inventoryitem items
  const [inventoryInventoryItems, setInventoryInventoryItems] = useState<any[]>([]);
  const [selectedInventoryItems, setSelectedInventoryItems] = useState<string[]>([]);
  const [prevSelectedInventoryItems, setPrevSelectedInventoryItems] = useState<string[]>([]);

  // InventoryItem details state
  const [expandedInventoryItemDetails, setExpandedInventoryItemDetails] = useState<Set<string>>(new Set());

  // Location management
  const [currentInventoryItemLocationIndex, setCurrentInventoryItemLocationIndex] = useState<number>(0);
  const [locations, setLocations] = useState<any[]>([]);

  // QR Code generation
  const [showAcceptDeliveryModal, setShowAcceptDeliveryModal] = useState(false);
  const [deliveryInput, setDeliveryInput] = useState("");
  const [validationError, setValidationError] = useState("");
  const [validationSuccess, setValidationSuccess] = useState(false);

  // Add delivery acceptance states
  const [isAcceptingDelivery, setIsAcceptingDelivery] = useState(false);
  const [acceptDeliveryError, setAcceptDeliveryError] = useState<string | null>(null);
  const [acceptDeliverySuccess, setAcceptDeliverySuccess] = useState(false);
  const [showAcceptStatusModal, setShowAcceptStatusModal] = useState(false);

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Location state for current inventoryitem
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedColumnCode, setSelectedColumnCode] = useState<string>("");
  const [selectedColumn, setSelectedColumn] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [selectedDepth, setSelectedDepth] = useState<number | null>(null);
  const [selectedCode, setSelectedCode] = useState("");
  const [occupiedLocations, setOccupiedLocations] = useState<any[]>([]);

  // Auto-assignment state
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);

  // 3D shelf selector states
  const [tempSelectedFloor, setTempSelectedFloor] = useState<number | null>(null);
  const [tempSelectedColumnCode, setTempSelectedColumnCode] = useState<string>("");
  const [tempSelectedColumn, setTempSelectedColumn] = useState<number | null>(null);
  const [tempSelectedRow, setTempSelectedRow] = useState<number | null>(null);
  const [tempSelectedGroup, setTempSelectedGroup] = useState<number | null>(null);
  const [tempSelectedDepth, setTempSelectedDepth] = useState<number | null>(null);
  const [tempSelectedCode, setTempSelectedCode] = useState<string>("");

  // Add state for maximum values
  const [maxGroupId, setMaxGroupId] = useState(0);
  const [maxRow, setMaxRow] = useState(0);
  const [maxColumn, setMaxColumn] = useState(0);
  const [maxDepth, setMaxDepth] = useState(0);

  const [error, setError] = useState<string | null>(null);

  // Shelf selector states
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(null);
  const [isSelectedLocationOccupied, setIsSelectedLocationOccupied] = useState(false);
  const [externalSelection, setExternalSelection] = useState<ShelfLocation | undefined>(undefined);
  const [floorConfigs, setFloorConfigs] = useState<any[]>([]);

  // Create a state for shelf color assignments
  const [shelfColorAssignments, setShelfColorAssignments] = useState<Array<ShelfSelectorColorAssignment>>([]);
  const [showControls, setShowControls] = useState(false);

  // Update operator selection state
  const [selectedOperators, setSelectedOperators] = useState<Array<Partial<UserProfile> & { uuid: string }>>([]);

  // Add new state for tab management
  const [acceptDeliveryTab, setAcceptDeliveryTab] = useState("paste-link");
  const [isLoadingAvailableDeliveries, setIsLoadingAvailableDeliveries] = useState(false);

  // Add state for "select all" functionality
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);
  const [isSelectAllIndeterminate, setIsSelectAllIndeterminate] = useState(false);


  // Add new state for QR code data with auto accept option
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

  // Add to the existing state declarations in the DeliveryPage component
  const [inventoryViewMode, setInventoryViewMode] = useState<'grouped' | 'flat'>('grouped');

  // Add next item ID state for generating sequential IDs
  const [nextItemId, setNextItemId] = useState(1);

  // Helper functions for inventory grouping
  const getGroupedInventoryItems = () => groupInventoryItems(inventoryInventoryItems);

  // Update the getDisplayInventoryItemsList function to filter out IN_WAREHOUSE and USED items
  const getDisplayInventoryItemsList = () => {
    let items = inventoryInventoryItems;

    // Filter out IN_WAREHOUSE and USED items unless we're viewing a delivered delivery
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

    // For grouped view, only show the first item of each group
    const seenGroups = new Set<string>();
    const displayItems: any[] = [];

    items.forEach(item => {
      const groupInfo = getGroupInfo(item, groupedItems);

      if (groupInfo.isGroup && groupInfo.groupId) {
        // For grouped items, only add if we haven't seen this group yet
        if (!seenGroups.has(groupInfo.groupId)) {
          seenGroups.add(groupInfo.groupId);
          displayItems.push(item);
        }
      } else {
        // For non-grouped items, always add
        displayItems.push(item);
      }
    });

    return displayItems;
  };

  useEffect(() => {
    const fetchData = async () => {
      const fetchedUser = await getUserFromCookies();
      setUser(fetchedUser);

      if (!fetchedUser) {
        showErrorToast("Failed to fetch user data", "User data error");
        return;
      }

      const fetchedInventoryItems = await getInventoryItems(fetchedUser.company_uuid || "", true);
      if (fetchedInventoryItems.success) {
        setInventoryItems(fetchedInventoryItems.data as any[]);
      } else {
        showErrorToast("Failed to fetch inventory items", "Inventory items error");
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

  // Update the handleStatusChange function to refresh occupied locations
  const handleStatusChange = async (status: string) => {
    if (!selectedDeliveryId) return { error: "No delivery selected" };

    // For operators, only allow changing to DELIVERED status when item is IN_TRANSIT
    if (!user?.is_admin) {
      if (formData.status !== "IN_TRANSIT" || status !== "DELIVERED") {
        return { error: "You can only change the status to DELIVERED when the item is IN_TRANSIT." };
      }
    }

    // If changing to DELIVERED, ensure we have location data for each inventory item
    if (status === "DELIVERED" && formData.inventory_locations) {
      const inventoryItemCount = Object.keys(formData.inventory_locations).length;
      if (inventoryItemCount === 0) {
        return { error: "Please assign warehouse locations for all selected inventory items before marking as delivered." };
      }
    }

    setIsLoading(true);

    try {
      // Use the RPC function to update delivery status with inventory item synchronization
      const result = await updateDeliveryStatusWithItems(
        selectedDeliveryId,
        status,
        user?.company_uuid
      );

      if (result.success) {
        // Update local form data with the returned data
        setFormData(prev => ({
          ...prev,
          status: result.data.status,
          status_history: result.data.status_history,
          updated_at: result.data.updated_at,
          inventory_locations: result.data.inventory_locations || prev.inventory_locations
        }));

        // Update prevSelectedInventoryItems to reflect the current state
        setPrevSelectedInventoryItems(selectedInventoryItems);

        // Refresh occupied locations after status change
        await refreshOccupiedLocations();

        // Reload inventory items to show updated statuses with delivery context
        if (formData.inventory_uuid) {
          await loadInventoryInventoryItems(formData.inventory_uuid, true);
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

  // Update the handleSubmit function to refresh occupied locations after successful updates
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Only allow admins to submit form changes
    if (!user?.is_admin) {
      return;
    }

    const newErrors: Record<string, string> = {};

    // For IN_TRANSIT status, only validate inventory locations
    if (formData.status === "IN_TRANSIT") {
      const inventoryLocations = formData.inventory_locations || {};
      const inventoryItemUuids = selectedInventoryItems;

      if (inventoryItemUuids.length === 0) {
        newErrors.inventory_item_uuids = "Please select at least one inventory item";
      }

      // Check if each selected inventory item has a location assigned
      if (inventoryItemUuids.length > 0) {
        const missingLocations = inventoryItemUuids.filter(uuid =>
          !inventoryLocations[uuid] ||
          inventoryLocations[uuid].floor === undefined ||
          inventoryLocations[uuid].floor === null
        );

        if (missingLocations.length > 0) {
          newErrors.locations = `Please assign a location for all selected inventory items. Missing locations for ${missingLocations.length} item(s).`;
        }
      }
    } else {
      // Full validation for other statuses
      if (!formData.inventory_uuid) newErrors.inventory_uuid = "Please select an inventory item";

      const inventoryLocations = formData.inventory_locations || {};
      const inventoryItemUuids = selectedInventoryItems;

      if (inventoryItemUuids.length === 0) {
        newErrors.inventory_item_uuids = "Please select at least one inventory item";
      }
      if (!formData.delivery_address) newErrors.delivery_address = "Delivery address is required";
      if (!formData.delivery_date) newErrors.delivery_date = "Delivery date is required";
      if (!formData.warehouse_uuid) newErrors.warehouse_uuid = "Please select a warehouse";

      // Check if each selected inventory item has a location assigned
      if (inventoryItemUuids.length > 0) {
        const missingLocations = inventoryItemUuids.filter(uuid =>
          !inventoryLocations[uuid] ||
          inventoryLocations[uuid].floor === undefined ||
          inventoryLocations[uuid].floor === null
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
        // For IN_TRANSIT status, only pass inventory_locations and required params
        if (formData.status === "IN_TRANSIT") {
          result = await updateDeliveryWithItems(
            selectedDeliveryId,
            formData.inventory_locations || {},
            undefined, // Don't update delivery_address
            undefined, // Don't update delivery_date  
            undefined, // Don't update operator_uuids
            undefined, // Don't update notes
            undefined, // Don't update name
            user.company_uuid
          );
        } else {
          // Full update for other statuses
          result = await updateDeliveryWithItems(
            selectedDeliveryId,
            formData.inventory_locations || {},
            formData.delivery_address,
            formData.delivery_date,
            formData.operator_uuids,
            formData.notes,
            formData.name,
            user.company_uuid
          );
        }
      } else {
        // Create new delivery using the new RPC function
        result = await createDeliveryWithItems(
          user.uuid,
          user.company_uuid,
          formData.inventory_uuid as string,
          formData.warehouse_uuid as string,
          formData.inventory_locations || {},
          formData.delivery_address || "",
          formData.delivery_date || "",
          formData.operator_uuids || [],
          formData.notes || "",
          formData.name
        );
      }

      // Handle successful creation/update
      if (result.success && result.data) {
        const newDelivery = result.data;

        // Update URL with new delivery ID for new deliveries
        setTimeout(() => {
          if (!selectedDeliveryId && newDelivery?.uuid) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("deliveryId", newDelivery.uuid);
            router.push(`?${params.toString()}`, { scroll: false });
          }
          setErrors({});
        }, 500);

        // Update local form data
        setFormData(prev => ({
          ...prev,
          ...newDelivery
        }));

        // Update prevSelectedInventoryItems to reflect the new state
        setPrevSelectedInventoryItems(selectedInventoryItems);

        // Refresh occupied locations after successful update
        await refreshOccupiedLocations();

        // Reload inventory items to show updated statuses
        if (formData.inventory_uuid) {
          await loadInventoryInventoryItems(formData.inventory_uuid, true);
        }

      } else {
        alert(`Failed to ${selectedDeliveryId ? 'update' : 'create'} delivery. Please try again.`);
      }
    } catch (error) {
      console.error(`Error ${selectedDeliveryId ? 'updating' : 'creating'} delivery:`, error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update the loadDeliveryDetails function to properly set prevSelectedInventoryItems
  const loadDeliveryDetails = async (deliveryId: string) => {
    try {
      const result = await getDeliveryDetails(deliveryId, user?.company_uuid);
      setIsLoading(false);

      if (result.success && result.data) {
        const deliveryData = result.data;

        // Update form data with detailed information
        setFormData(deliveryData);

        // Extract inventory item UUIDs and locations from inventory_locations
        if (deliveryData.inventory_locations) {
          const inventoryItemUuids = getInventoryItemUuidsFromLocations(deliveryData.inventory_locations);
          const locations = getLocationsFromInventoryLocations(deliveryData.inventory_locations);

          // Set the selected items and locations immediately
          setSelectedInventoryItems(inventoryItemUuids);
          setPrevSelectedInventoryItems(inventoryItemUuids); // This is crucial for proper checkbox logic
          setLocations(locations);

          // Set first location details for 3D viewer
          if (locations.length > 0) {
            const firstLoc = locations[0];
            setSelectedFloor(firstLoc.floor ?? null);
            setSelectedColumnCode(parseColumn(firstLoc.column ?? null) || "");
            setSelectedColumn(firstLoc.column ?? null);
            setSelectedRow(firstLoc.row ?? null);
            setSelectedDepth(firstLoc.depth ?? null);
            setSelectedGroup(firstLoc.group ?? null);
          }
        } else {
          setSelectedInventoryItems([]);
          setPrevSelectedInventoryItems([]);
          setLocations([]);
        }

        // Set selected operators if any are assigned
        if (deliveryData.operator_info && Array.isArray(deliveryData.operator_info)) {
          setSelectedOperators(deliveryData.operator_info);
        } else {
          setSelectedOperators([]);
        }

        // Load inventory items AFTER setting the form data and selections
        if (deliveryData.inventory_uuid) {
          await loadInventoryInventoryItems(deliveryData.inventory_uuid, true);
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

  // Update the auto-assign shelf locations function to work with new format
  const autoAssignShelfLocations = async () => {
    if (isWarehouseNotSet() || isFloorConfigNotSet() || selectedInventoryItems.length === 0) {
      return;
    }

    setIsAutoAssigning(true);
    try {
      // Get the suggested locations
      const result = await suggestShelfLocations(
        formData.warehouse_uuid as string,
        selectedInventoryItems.length,
      );

      if (result.success && result.data) {
        // Get locations from the result
        const { locations } = result.data;

        // Create inventory_locations object
        const inventoryLocations: Record<string, ShelfLocation> = {};
        selectedInventoryItems.forEach((uuid, index) => {
          if (locations[index]) {
            inventoryLocations[uuid] = locations[index];
          }
        });

        // Update state with the suggested locations
        setLocations(locations);

        // Update formData with the new inventory_locations
        setFormData(prev => ({
          ...prev,
          inventory_locations: inventoryLocations,
          // Remove old format fields for consistency
          inventory_item_uuids: selectedInventoryItems,
          locations: locations
        }));

        // Select the first location in the 3D view
        if (locations.length > 0) {
          setCurrentInventoryItemLocationIndex(0);
          const firstLocation = locations[0];

          setSelectedFloor(firstLocation.floor);
          setSelectedGroup(firstLocation.group);
          setSelectedRow(firstLocation.row);
          setSelectedColumn(firstLocation.column);
          setSelectedDepth(firstLocation.depth);
          setSelectedColumnCode(parseColumn(firstLocation.column) || "");

          // Set external selection for the 3D viewer
          setExternalSelection(firstLocation);
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


  // Update the handleSelectAllToggle function to respect the filtered items
  const handleSelectAllToggle = (isSelected: boolean) => {
    const displayItems = getDisplayInventoryItemsList();

    if (isSelected) {
      // Select all available items (excluding those with certain statuses unless they're in current delivery)
      const availableItems = displayItems.filter(item => {
        const statusStyling = getInventoryItemStatusStyling(item);
        return !statusStyling.isDisabled;
      });

      // Get all inventory item UUIDs that should be selected
      const allItemsToSelect: string[] = [];

      availableItems.forEach(item => {
        const groupedItems = getGroupedInventoryItems();
        const groupInfo = getGroupInfo(item, groupedItems);

        if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
          // For grouped items, add all items in the group (but only those that pass the filter)
          const groupItems = inventoryInventoryItems.filter(groupItem =>
            groupItem.group_id === groupInfo.groupId &&
            // Filter out IN_WAREHOUSE and USED unless delivered
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
          // For single items, add the item UUID
          if (!allItemsToSelect.includes(item.uuid)) {
            allItemsToSelect.push(item.uuid);
          }
        }
      });

      setSelectedInventoryItems(allItemsToSelect);

      // Update formData with inventory_locations format
      const newInventoryLocations: Record<string, ShelfLocation> = {};
      allItemsToSelect.forEach(uuid => {
        const existingLocation = formData.inventory_locations?.[uuid];
        if (existingLocation) {
          newInventoryLocations[uuid] = existingLocation;
        }
      });

      setFormData(prev => ({
        ...prev,
        inventory_locations: newInventoryLocations,
        inventory_item_uuids: allItemsToSelect,
        locations: Object.values(newInventoryLocations).filter(loc => loc && loc.floor !== undefined)
      }));

      const newLocationsArray = Object.values(newInventoryLocations).filter(loc => loc !== null && loc.floor !== undefined);
      setLocations(newLocationsArray);

    } else {
      // Deselect all items
      setSelectedInventoryItems([]);
      setFormData(prev => ({
        ...prev,
        inventory_locations: {},
        inventory_item_uuids: [],
        locations: []
      }));
      setLocations([]);
    }
  };


  // Update the handleConfirmLocation function to work with new format
  const handleConfirmLocation = () => {
    // Create the location object with null values converted to undefined
    const location: ShelfLocation = {
      floor: tempSelectedFloor ?? undefined,
      column: tempSelectedColumn ?? undefined,
      row: tempSelectedRow ?? undefined,
      group: tempSelectedGroup ?? undefined,
      depth: tempSelectedDepth ?? undefined,
      code: tempSelectedCode
    };

    // Update the locations array
    const newLocations = [...locations];
    newLocations[currentInventoryItemLocationIndex] = location;
    setLocations(newLocations);

    // Update inventory_locations object
    const currentInventoryItemUuid = selectedInventoryItems[currentInventoryItemLocationIndex];
    if (currentInventoryItemUuid) {
      const newInventoryLocations = { ...formData.inventory_locations };
      newInventoryLocations[currentInventoryItemUuid] = location;

      // Update formData
      setFormData(prev => ({
        ...prev,
        inventory_locations: newInventoryLocations,
        locations: newLocations, // Keep backward compatibility
        inventory_item_uuids: selectedInventoryItems // Keep backward compatibility
      }));
    }

    // Update local state for the selected location
    setSelectedFloor(tempSelectedFloor);
    setSelectedColumn(tempSelectedColumn);
    setSelectedColumnCode(tempSelectedColumnCode);
    setSelectedRow(tempSelectedRow);
    setSelectedGroup(tempSelectedGroup);
    setSelectedDepth(tempSelectedDepth);

    onClose();
  };

  // Update the useEffect for URL params to ensure proper loading sequence
  useEffect(() => {
    const handleURLParams = async () => {
      setIsLoading(true);

      // Wait for all required data to be loaded before processing URL params
      if (!user?.company_uuid || isLoadingItems || isLoadingWarehouses || warehouses.length === 0) return;

      const deliveryId = searchParams.get("deliveryId");
      const setInventoryId = searchParams.get("setInventory");

      if (deliveryId) {
        // Set selected delivery from URL and load detailed information
        setSelectedDeliveryId(deliveryId);

        // Reset states before loading
        setSelectedInventoryItems([]);
        setLocations([]);
        setSelectedOperators([]);
        setDeliveryInput("");
        resetWarehouseLocation();

        // Use the updated detailed loading function
        const deliveryData = await loadDeliveryDetails(deliveryId);

        if (deliveryData && deliveryData.warehouse_uuid) {
          await handleWarehouseChange(deliveryData.warehouse_uuid);
        }

      } else if (setInventoryId) {
        // Handle setting inventory ID logic (existing code)
        setSelectedDeliveryId(null);
        setFormData({
          company_uuid: user.company_uuid,
          admin_uuid: user.uuid,
          inventory_uuid: setInventoryId,
          inventory_locations: {},
          delivery_address: "",
          delivery_date: format(new Date(), "yyyy-MM-dd"),
          notes: "",
          status: "PENDING",
          warehouse_uuid: null,
          operator_uuids: []
        });
        setSelectedInventoryItems([]);
        setLocations([]);
        setSelectedOperators([]);
        setDeliveryInput("");
        resetWarehouseLocation();

        // Load inventory items for the set inventory
        await loadInventoryInventoryItems(setInventoryId, false);

        setIsLoading(false);
      } else {
        // Reset form for new delivery
        setSelectedDeliveryId(null);
        setFormData({
          company_uuid: user.company_uuid,
          admin_uuid: user.uuid,
          inventory_uuid: null,
          inventory_locations: {},
          delivery_address: "",
          delivery_date: format(new Date(), "yyyy-MM-dd"),
          notes: "",
          status: "PENDING",
          warehouse_uuid: null,
          operator_uuids: []
        });
        setSelectedInventoryItems([]);
        setLocations([]);
        setSelectedOperators([]);
        setDeliveryInput("");
        resetWarehouseLocation();
        setIsLoading(false);
      }
    };

    handleURLParams();
  }, [searchParams, user?.company_uuid, isLoadingItems, isLoadingWarehouses, warehouses.length]);

  // Update the handleInventoryItemSelectionToggle function to respect the filtered items
  const handleInventoryItemSelectionToggle = (inventoryitemUuid: string, isSelected: boolean) => {
    // Find the inventory item to check its status and group
    const inventoryItem = inventoryInventoryItems.find(item => item.uuid === inventoryitemUuid);

    // If we're in grouped view, check if this is a group selection
    const groupedItems = getGroupedInventoryItems();
    const groupInfo = getGroupInfo(inventoryItem!, groupedItems);

    // Get all items that should be toggled (either the single item or all items in the group)
    // But filter out IN_WAREHOUSE and USED items unless we're viewing delivered items
    const itemsToToggle = inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId
      ? inventoryInventoryItems.filter(groupItem =>
        groupItem.group_id === groupInfo.groupId &&
        // Filter out IN_WAREHOUSE and USED unless delivered
        (formData.status === 'DELIVERED' || formData.status === 'CANCELLED' ||
          (groupItem.status !== 'IN_WAREHOUSE' && groupItem.status !== 'USED'))
      )
      : [inventoryItem!];

    // Check if any of the items are already assigned to another delivery
    for (const item of itemsToToggle) {
      if (!isSelected && item.status === 'ON_DELIVERY' && selectedDeliveryId) {
        // Check if this item belongs to the current delivery (was originally selected or currently selected)
        const isAssignedToCurrentDelivery = formData.inventory_locations?.[item.uuid] ||
          prevSelectedInventoryItems.includes(item.uuid) ||
          selectedInventoryItems.includes(item.uuid); // Add current selection check

        if (!isAssignedToCurrentDelivery) {
          // Show error message or toast
          console.warn("One or more items are already assigned to another delivery");
          return;
        }
      }
    }

    setSelectedInventoryItems(prev => {
      let newSelectedItems;

      if (isSelected) {
        // Add all items in the group/single item
        const itemUuidsToAdd = itemsToToggle.map(item => item.uuid);
        newSelectedItems = [...prev, ...itemUuidsToAdd.filter(uuid => !prev.includes(uuid))];
      } else {
        // Remove all items in the group/single item
        const itemUuidsToRemove = itemsToToggle.map(item => item.uuid);
        newSelectedItems = prev.filter(uuid => !itemUuidsToRemove.includes(uuid));
      }

      // Update formData with inventory_locations format
      const currentInventoryLocations = formData.inventory_locations || {};
      const newInventoryLocations: Record<string, ShelfLocation> = {};

      // Keep existing locations for items that are still selected
      newSelectedItems.forEach(uuid => {
        if (currentInventoryLocations[uuid]) {
          newInventoryLocations[uuid] = currentInventoryLocations[uuid];
        }
      });

      // Update form data
      setFormData(prev => ({
        ...prev,
        inventory_locations: newInventoryLocations,
        // Keep backward compatibility
        inventory_item_uuids: newSelectedItems,
        locations: Object.values(newInventoryLocations).filter(loc => loc && loc.floor !== undefined)
      }));

      // Update locations array to match selected items - only include valid locations
      const newLocationsArray = newSelectedItems.map(uuid =>
        newInventoryLocations[uuid] || null
      ).filter(loc => loc !== null && loc.floor !== undefined);

      setLocations(newLocationsArray);

      return newSelectedItems;
    });
  };

  // Form state
  const [formData, setFormData] = useState<Partial<DeliveryItem>>({
    company_uuid: null,
    admin_uuid: null,
    inventory_uuid: null,
    inventory_locations: {}, // Changed from inventory_item_uuids and locations to inventory_locations
    warehouse_uuid: null,
    delivery_address: "",
    delivery_date: format(new Date(), "yyyy-MM-dd"),
    operator_uuids: [], // Changed from operator_uuid
    notes: "",
    status: "PENDING",
  });

  // Add helper function to update locations when current index changes
  useEffect(() => {
    if (currentInventoryItemLocationIndex >= 0 &&
      currentInventoryItemLocationIndex < selectedInventoryItems.length &&
      formData.inventory_locations) {

      const currentItemUuid = selectedInventoryItems[currentInventoryItemLocationIndex];
      const currentLocation = formData.inventory_locations[currentItemUuid];

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
  }, [currentInventoryItemLocationIndex, selectedInventoryItems, formData.inventory_locations]);



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
        const groupItems = inventoryInventoryItems.filter(groupItem =>
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
  }, [selectedInventoryItems, inventoryInventoryItems, inventoryViewMode, formData.status, formData.inventory_locations, prevSelectedInventoryItems]);


  /**
   * Helper function to extract inventory item UUIDs from inventory_locations
   */
  function getInventoryItemUuidsFromLocations(inventoryLocations: Record<string, ShelfLocation>): string[] {
    return Object.keys(inventoryLocations);
  }

  /**
   * Helper function to extract locations array from inventory_locations
   */
  function getLocationsFromInventoryLocations(inventoryLocations: Record<string, ShelfLocation>): ShelfLocation[] {
    return Object.values(inventoryLocations);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  const autoCompleteStyle = { classNames: inputStyle };

  const resetWarehouseLocation = () => {
    setSelectedFloor(null);
    setSelectedColumn(null);
    setSelectedRow(null);
    setSelectedGroup(null);
    setSelectedDepth(null);
    setSelectedColumnCode("");
    setSelectedCode("");

    setTempSelectedFloor(null);
    setTempSelectedColumn(null);
    setTempSelectedRow(null);
    setTempSelectedDepth(null);
    setTempSelectedGroup(null);
    setTempSelectedColumnCode("");
    setTempSelectedCode("");

    setLocations([]);
    setFloorConfigs([]);
    setOccupiedLocations([]);
  };

  // Generate URL for QR code 
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

  // Updated function to regenerate URL when auto accept or show options changes
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

  // Add new function to update show options
  const updateShowOptions = (showOptions: boolean) => {
    setQrCodeData(prev => ({
      ...prev,
      showOptions,
      url: generateDeliveryUrl(prev.deliveryId, prev.autoAccept, showOptions)
    }));
  };

  // Updated function to show QR code with proper state setup
  const handleShowDeliveryQR = () => {
    if (!selectedDeliveryId || !formData) return;

    const deliveryName = `Delivery of ${inventoryItems.find(item => item.uuid === formData.inventory_uuid)?.name || 'Unknown Item'}`;
    setQrCodeData({
      url: generateDeliveryUrl(selectedDeliveryId, false, true), // Start with autoAccept false, showOptions true
      title: "Delivery QR Code",
      description: `Scan this code to view delivery details for ${deliveryName}.`,
      deliveryId: selectedDeliveryId,
      deliveryName: deliveryName,
      autoAccept: false, // Default to false
      showOptions: true  // Default to true
    });
    setShowQrCode(true);
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

  // Add a new helper function to check if only locations can be edited
  const canOnlyEditLocations = (): boolean => {
    return formData.status === "IN_TRANSIT" && user?.is_admin === true;
  }

  // Add a new helper function to check if all fields can be edited
  const canEditAllFields = (): boolean => {
    return (formData.status === "PENDING" || formData.status === "PROCESSING") && user?.is_admin === true;
  }

  const checkIfLocationOccupied = (location: any) => {
    // Check if location is in occupied locations
    const isOccupied = occupiedLocations.some(
      loc =>
        loc.floor === location.floor &&
        loc.group === location.group &&
        loc.row === location.row &&
        loc.column === location.column &&
        loc.depth === location.depth
    );

    // Check if location is in shelf color assignments (selected for delivery)
    const isAssigned = shelfColorAssignments.some(
      assignment =>
        assignment.floor === location.floor &&
        assignment.group === location.group &&
        assignment.row === location.row &&
        assignment.column === location.column &&
        assignment.depth === location.depth
    );

    return isOccupied || isAssigned;
  };

  const filteredOccupiedLocations = useMemo(() => {
    return occupiedLocations.filter(loc =>
      !shelfColorAssignments.some(
        assignment =>
          assignment.floor === loc.floor &&
          assignment.group === loc.group &&
          assignment.row === loc.row &&
          assignment.column === loc.column &&
          assignment.depth === loc.depth
      )
    );
  }, [occupiedLocations, shelfColorAssignments]);

  // Update the handle functions to check for occupation after selection and use formatCode
  const updateLocationOccupiedStatus = () => {
    if (highlightedFloor !== null && tempSelectedGroup !== null &&
      tempSelectedRow !== null && tempSelectedColumn !== null) {
      const location = {
        floor: highlightedFloor,
        group: tempSelectedGroup,
        row: tempSelectedRow,
        column: tempSelectedColumn,
        depth: tempSelectedDepth,
        code: tempSelectedCode
      };
      setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
    }
  };

  // Update the loadInventoryInventoryItems function to properly handle delivery context
  const loadInventoryInventoryItems = useCallback(async (inventoryItemUuid: string, preserveSelection: boolean = false) => {
    if (inventoryItemUuid === null || inventoryItemUuid === "null" || inventoryItemUuid === "") {
      setInventoryInventoryItems([]);
      setSelectedInventoryItems([]);
      setLocations([]);
      return;
    }

    setIsLoadingInventoryItems(true);
    try {
      // For existing deliveries, we need to load items differently
      if (selectedDeliveryId && formData.inventory_locations) {
        // When we have a selected delivery, load all inventory items for the inventory
        // but prioritize showing the ones that are part of this delivery
        const result = await getInventoryItem(
          inventoryItemUuid,
          false, // Don't filter by delivered status when loading for existing delivery
          undefined // Don't filter by delivery UUID to get all items
        );

        if (result.success) {
          const allInventoryItems = result.data.inventory_items || [];

          // Add sequential IDs to all items
          const inventoryItemsWithIds = allInventoryItems.map((item: any, index: number) => ({
            ...item,
            id: index + 1,
          }));

          setInventoryInventoryItems(inventoryItemsWithIds);
          setNextItemId(inventoryItemsWithIds.length + 1);

          // If we have inventory_locations in formData, extract the selected items
          if (formData.inventory_locations && Object.keys(formData.inventory_locations).length > 0) {
            const selectedItemUuids = Object.keys(formData.inventory_locations);

            if (!preserveSelection) {
              setSelectedInventoryItems(selectedItemUuids);

              // Convert inventory_locations back to locations array
              const locationsArray = selectedItemUuids.map(uuid => formData.inventory_locations![uuid]);
              setLocations(locationsArray);
            }
          } else if (!preserveSelection) {
            setSelectedInventoryItems([]);
            setLocations([]);
          }
        } else {
          console.error("Failed to load inventory items:", result.error);
          setInventoryInventoryItems([]);
          if (!preserveSelection) {
            setSelectedInventoryItems([]);
            setLocations([]);
          }
        }
      } else {
        // For new deliveries or when no delivery is selected, use the original logic
        const result = await getInventoryItem(
          inventoryItemUuid,
          formData.status === "DELIVERED" || formData.status === "CANCELLED",
          selectedDeliveryId || undefined
        );

        if (result.success) {
          console.log("Loaded inventory items:", result.data.inventory_items);
          const inventoryItemsWithIds = (result.data.inventory_items || []).map((item: any, index: number) => ({
            ...item,
            id: index + 1,
          }));

          setInventoryInventoryItems(inventoryItemsWithIds);
          setNextItemId(inventoryItemsWithIds.length + 1);

          // Reset selected items only when not preserving selection and no existing delivery
          if (!preserveSelection) {
            setSelectedInventoryItems([]);
            setLocations([]);
          }
        } else {
          console.error("Failed to load inventory items:", result.error);
          setInventoryInventoryItems([]);
          if (!preserveSelection) {
            setSelectedInventoryItems([]);
            setLocations([]);
          }
        }
      }
    } catch (error) {
      console.error("Error loading inventory items:", error);
      setInventoryInventoryItems([]);
      if (!preserveSelection) {
        setSelectedInventoryItems([]);
        setLocations([]);
      }
    } finally {
      setIsLoadingInventoryItems(false);
    }
  }, [formData.status, selectedDeliveryId, formData.inventory_locations]);

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

  // Update the inventory item change handler to use delivery context
  const handleInventoryItemChange = async (inventoryItemUuid: string | null) => {
    // Reset selected inventoryitems and locations
    setSelectedInventoryItems([]);
    setLocations([]);

    // Update form data
    setFormData(prev => ({
      ...prev,
      inventory_uuid: inventoryItemUuid,
      inventory_item_uuids: [], // Reset inventoryitem selection
      locations: [], // Reset locations
      inventory_locations: {} // Reset inventory locations
    }));

    // Load inventoryitem items for this inventory item with delivery context
    if (inventoryItemUuid) {
      await loadInventoryInventoryItems(inventoryItemUuid, false);
    }
  };

  // Update the operator selection handler to add operator instead of replacing
  const handleAddOperator = (operatorUuid: string) => {
    if (!operatorUuid) return;

    const operatorToAdd = operators.find(op => op.uuid === operatorUuid);
    if (!operatorToAdd) return;

    // Check if operator is already selected
    if (selectedOperators.some(op => op.uuid === operatorUuid)) return;

    // Ensure operator has uuid before adding and use type assertion to match the state type
    const newSelectedOperators = [...selectedOperators, operatorToAdd];
    setSelectedOperators(newSelectedOperators);

    setFormData(prev => ({
      ...prev,
      operator_uuids: newSelectedOperators.map(op => op.uuid)
    }));

    // Clear validation error when operators are selected
    setErrors(prev => {
      const { operator_uuids, ...rest } = prev;
      return rest;
    });
  };

  const handleRemoveOperator = (operatorUuid: string) => {
    const newSelectedOperators = selectedOperators.filter(op => op.uuid !== operatorUuid);
    // Use type assertion to match the state type
    setSelectedOperators(newSelectedOperators);

    setFormData(prev => ({
      ...prev,
      operator_uuids: newSelectedOperators.map(op => op.uuid)
    }));
  };

  const handleViewInventory = () => {
    if (formData.inventory_uuid) {
      // Navigate to inventory page with the item ID
      if ((user === null || user.is_admin))
        router.push(`/home/inventory?itemId=${formData.inventory_uuid}`);
      else
        router.push(`/home/warehouse-items?itemId=${formData.inventory_uuid}`);
    }
  };

  // Handle creating a new delivery
  const handleNewDelivery = () => {
    // check if the current url is already a new delivery page
    setIsLoading(searchParams.get("deliveryId") !== null);

    // Clear the URL parameter
    const params = new URLSearchParams(searchParams.toString());
    params.delete("deliveryId");
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle selecting a delivery
  const handleSelectDelivery = (deliveryId: string) => {
    setIsLoading(searchParams.get("deliveryId") !== deliveryId);

    // Update the URL with the selected delivery ID without reloading the page
    const params = new URLSearchParams(searchParams.toString());
    params.set("deliveryId", deliveryId);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle selecting a delivery
  const handleGoToWarehouse = (warehouseUuid: string) => {
    // Update the URL with the selected delivery ID without reloading the page
    router.push(`/home/warehouses?warehouseId=${warehouseUuid}`);
  };

  // Handle form changes
  const handleAutoSelectChange = async (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));

    // If warehouse is selected, load the layout
    if (name === "warehouse_uuid" && value) {
      await handleWarehouseChange(value);
    }

    // If inventory_uuid is changed, load inventoryitem items
    if (name === "inventory_uuid" && value) {
      await loadInventoryInventoryItems(value);
    }
  };


  // Update the handleWarehouseChange function to properly filter occupied locations
  const handleWarehouseChange = async (warehouseUuid: string) => {
    const selectedWarehouse = warehouses.find(wh => wh.uuid === warehouseUuid);
    if (selectedWarehouse) {
      // Fetch warehouse layout
      const warehouseLayout = selectedWarehouse.layout || [];
      setExternalSelection(undefined);
      setFloorConfigs(warehouseLayout);

      setFormData(prev => ({
        ...prev,
        delivery_address: selectedWarehouse.address!.fullAddress || "",
      }));

      // Fetch occupied shelf locations
      const occupiedResult = await getOccupiedShelfLocations(selectedWarehouse.uuid || "");
      if (occupiedResult.success) {
        // Filter out locations that are in current delivery's shelf color assignments
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

  // Add a new function to refresh occupied locations after form updates
  const refreshOccupiedLocations = async () => {
    if (!formData.warehouse_uuid) return;

    const occupiedResult = await getOccupiedShelfLocations(formData.warehouse_uuid);
    if (occupiedResult.success) {
      // Filter out locations that are in current delivery's shelf color assignments
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


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  /* 3D Shelf Selector */
  const handleShelfSelection = (location: ShelfLocation) => {
    const floorNumber = location.floor || 0;
    const columnNumber = location.column || 0;
    const columnCode = String.fromCharCode(65 + columnNumber);
    const rowNumber = location.row || 0;
    const groupNumber = location.group || 0;
    const depthNumber = location.depth || 0;
    const code = location.code || "";

    // Update temporary selections with numerical values
    setTempSelectedFloor(floorNumber);
    setTempSelectedColumn(columnNumber);
    setTempSelectedColumnCode(columnCode);
    setTempSelectedRow(rowNumber);
    setTempSelectedGroup(groupNumber);
    setTempSelectedDepth(depthNumber);
    setTempSelectedCode(code);

    // Set the highlighted floor
    setHighlightedFloor(location.floor || 0);

    // Update maximum values if available
    if (location.max_group !== undefined) setMaxGroupId(location.max_group);
    if (location.max_row !== undefined) setMaxRow(location.max_row);
    if (location.max_column !== undefined) setMaxColumn(location.max_column);
    if (location.max_depth !== undefined) setMaxDepth(location.max_depth);

    // Check if location is occupied
    setIsSelectedLocationOccupied(checkIfLocationOccupied(location));

    setExternalSelection(location);
  };

  const handleFloorChange = (floorNum: number) => {
    const floorIndex = floorNum - 1;
    setTempSelectedFloor(floorIndex);
    setHighlightedFloor(floorIndex);

    if (tempSelectedGroup !== null) {
      const location = {
        floor: floorIndex,
        group: tempSelectedGroup,
        row: tempSelectedRow !== null ? tempSelectedRow : 0,
        column: tempSelectedColumn !== null ? tempSelectedColumn : 0,
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0,
        code: tempSelectedCode
      };
      setExternalSelection(location);

      // Check if new location is occupied
      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleGroupChange = (groupId: number) => {
    const adjustedId = groupId - 1;
    setTempSelectedGroup(adjustedId);

    if (tempSelectedFloor !== null && highlightedFloor !== null) {
      const location = {
        floor: highlightedFloor,
        group: adjustedId,
        row: tempSelectedRow !== null ? tempSelectedRow : 0,
        column: tempSelectedColumn !== null ? tempSelectedColumn : 0,
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0,
        code: tempSelectedCode
      };
      setExternalSelection(location);

      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleRowChange = (rowNum: number) => {
    const adjustedRow = rowNum - 1;
    setTempSelectedRow(adjustedRow);

    if (tempSelectedFloor !== null && highlightedFloor !== null && tempSelectedGroup !== null) {
      const location = {
        floor: highlightedFloor,
        group: tempSelectedGroup,
        row: adjustedRow,
        column: tempSelectedColumn !== null ? tempSelectedColumn : 0,
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0,
        code: tempSelectedCode
      };
      setExternalSelection(location);

      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleColumnChange = (colNum: number) => {
    const adjustedCol = colNum - 1;
    const colLetter = String.fromCharCode(64 + colNum);

    setTempSelectedColumn(adjustedCol);
    setTempSelectedColumnCode(colLetter);

    if (tempSelectedFloor !== null && highlightedFloor !== null && tempSelectedGroup !== null) {
      const location = {
        floor: highlightedFloor,
        group: tempSelectedGroup,
        row: tempSelectedRow !== null ? tempSelectedRow : 0,
        column: adjustedCol,
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0,
        code: tempSelectedCode
      };
      setExternalSelection(location);

      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleDepthChange = (depthNum: number) => {
    const adjustedDepth = depthNum - 1;
    setTempSelectedDepth(adjustedDepth);

    if (tempSelectedFloor !== null && highlightedFloor !== null && tempSelectedGroup !== null) {
      const location = {
        floor: highlightedFloor,
        group: tempSelectedGroup,
        row: tempSelectedRow !== null ? tempSelectedRow : 0,
        column: tempSelectedColumn !== null ? tempSelectedColumn : 0,
        depth: adjustedDepth,
        code: tempSelectedCode
      };
      setExternalSelection(location);

      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleOpenModal = () => {
    setTempSelectedFloor(selectedFloor);
    setTempSelectedColumn(selectedColumn);
    setTempSelectedColumnCode(selectedColumnCode);
    setTempSelectedRow(selectedRow);
    setTempSelectedDepth(selectedDepth);
    setTempSelectedGroup(selectedGroup);
    setTempSelectedCode(selectedCode);

    if (selectedFloor !== null && selectedColumn !== null &&
      selectedRow !== null && selectedGroup !== null && selectedDepth !== null) {
      setHighlightedFloor(selectedFloor);

      const location = {
        floor: selectedFloor,
        group: selectedGroup,
        row: selectedRow,
        column: selectedColumn,
        depth: selectedDepth,
        code: selectedCode
      };

      setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
    }

    onOpen();
  };

  const handleCancelLocation = () => {
    setTempSelectedFloor(selectedFloor);
    setTempSelectedColumn(selectedColumn);
    setTempSelectedColumnCode(selectedColumnCode);
    setTempSelectedRow(selectedRow);
    setTempSelectedDepth(selectedDepth);
    setTempSelectedGroup(selectedGroup);
    onClose();
  };

  /* QR Code Image Upload and Scanning */
  // Update image upload handler to auto-accept
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
          // Extract UUID from the QR code data (URL or direct UUID)
          let deliveryUuid = code.data;

          try {
            const url = new URL(code.data);
            const searchParams = new URLSearchParams(url.search);
            const qParam = searchParams.get('q');
            if (qParam) {
              deliveryUuid = qParam;
            }
          } catch (error) {
            // Not a URL, treat as UUID directly
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

  // Update the existing handleDeliveryJsonValidation function to work with paste link
  const handlePasteLinkAccept = async (inputData = deliveryInput) => {
    if (!inputData.trim()) return;

    // Extract UUID from URL or use the input directly as UUID
    let deliveryUuid = inputData.trim();

    // If it's a URL, extract the UUID from query parameters
    try {
      const url = new URL(inputData);
      const searchParams = new URLSearchParams(url.search);
      const qParam = searchParams.get('q');
      if (qParam) {
        deliveryUuid = qParam;
      }
    } catch (error) {
      // Not a valid URL, treat as UUID directly
    }

    await handleAcceptDelivery(deliveryUuid);
  };

  // Handle Enter key in paste link input
  const handlePasteLinkKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlePasteLinkAccept();
    }
  };

  // Accept delivery function (updated for current version)
  const handleAcceptDelivery = async (deliveryUuid?: string) => {
    if (!deliveryUuid || !user) return;

    setIsAcceptingDelivery(true);
    setAcceptDeliveryError(null);
    setAcceptDeliverySuccess(false);

    try {
      // Load delivery details first
      const deliveryResult = await getDeliveryDetails(deliveryUuid, user.company_uuid);

      if (!deliveryResult.success || !deliveryResult.data) {
        setAcceptDeliveryError("Failed to load delivery details");
        setShowAcceptStatusModal(true);
        return;
      }

      const targetDelivery = deliveryResult.data;

      // Check if the user is an operator (not admin)
      if (user.is_admin) {
        setAcceptDeliveryError("Admins cannot accept deliveries - only operators can");
        setShowAcceptStatusModal(true);
        return;
      }

      // Check if the delivery status is IN_TRANSIT
      if (targetDelivery.status !== "IN_TRANSIT") {
        setAcceptDeliveryError("This delivery cannot be accepted because it is not in transit");
        setShowAcceptStatusModal(true);
        return;
      }

      // Check if the operator is assigned to this delivery
      const isAssignedOperator = targetDelivery.operator_uuids?.includes(user.uuid) ||
        targetDelivery.operator_uuids === null ||
        targetDelivery.operator_uuids?.length === 0;

      if (!isAssignedOperator) {
        setAcceptDeliveryError("You are not assigned to this delivery");
        setShowAcceptStatusModal(true);
        return;
      }

      // Update delivery status to DELIVERED using the RPC function
      const result = await updateDeliveryStatusWithItems(
        deliveryUuid,
        "DELIVERED",
        user.company_uuid
      );

      if (result.success) {
        setAcceptDeliverySuccess(true);
        setShowAcceptStatusModal(true);

        // Update the current form data if this is the selected delivery
        if (selectedDeliveryId === deliveryUuid) {
          setFormData(prev => ({
            ...prev,
            status: "DELIVERED",
            status_history: result.data.status_history,
            updated_at: result.data.updated_at
          }));

          // Reload inventory items to show updated statuses
          if (formData.inventory_uuid) {
            await loadInventoryInventoryItems(formData.inventory_uuid, true);
          }
        }

        // Clear validation states
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
      filters: inventoryItems.reduce(
        (acc, item) => ({
          ...acc,
          [item.uuid]: item.name
        }),
        { "": "All Items" }
      )
    }
  };

  // Update the getInventoryItemStatusStyling function to properly handle previously selected items
  const getInventoryItemStatusStyling = (item: any) => {
    // For new delivery creation (no selectedDeliveryId), only allow AVAILABLE items
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

    // For editing existing delivery, check if item is part of current delivery or was previously selected
    const isPartOfCurrentDelivery = formData.inventory_locations?.[item.uuid] ||
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

  useEffect(() => {
    // Refresh occupied locations when shelf color assignments change
    if (formData.warehouse_uuid && shelfColorAssignments.length >= 0) {
      refreshOccupiedLocations();
    }
  }, [shelfColorAssignments, formData.warehouse_uuid]);


  // Update the inventory item rendering to include status indicators
  // This would be used in the inventory item selection UI components
  const renderInventoryItemWithStatus = (item: any, isSelected: boolean) => {
    const statusStyling = getInventoryItemStatusStyling(item);

    // Get group information
    const groupedItems = getGroupedInventoryItems();
    const groupInfo = getGroupInfo(item, groupedItems);

    // Calculate display number for the item
    const displayItems = getDisplayInventoryItemsList();
    const displayIndex = displayItems.findIndex(displayItem => displayItem.uuid === item.uuid);
    const displayNumber = displayIndex + 1;

    // Calculate group totals if this is a group item
    let groupStats = null;
    if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
      const groupItems = inventoryInventoryItems.filter(groupItem => groupItem.group_id === groupInfo.groupId);
      const availableGroupItems = groupItems.filter(groupItem => {
        const groupItemStatusStyling = getInventoryItemStatusStyling(groupItem);
        return !groupItemStatusStyling.isDisabled;
      });
      const selectedGroupItems = groupItems.filter(groupItem => selectedInventoryItems.includes(groupItem.uuid));

      groupStats = {
        total: groupItems.length,
        available: availableGroupItems.length,
        selected: selectedGroupItems.length
      };
    }

    // Function to determine if checkbox should be shown
    const shouldShowCheckbox = () => {
      if (formData.status !== 'PENDING') {
        return false;
      }

      // For editing existing delivery, check if item is part of current delivery
      if (['ON_DELIVERY', 'IN_WAREHOUSE', 'USED'].includes(item.status)) {
        const isPartOfCurrentDelivery = formData.inventory_locations?.[item.uuid] ||
          prevSelectedInventoryItems.includes(item.uuid) ||
          selectedInventoryItems.includes(item.uuid);

        return isPartOfCurrentDelivery || formData.status === 'PENDING';
      }

      return true;
    };

    return (
      <div className={`rounded-lg ${statusStyling.isDisabled ? 'opacity-60' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {shouldShowCheckbox() && (
              <Checkbox
                isSelected={isSelected}
                onValueChange={(checked) => handleInventoryItemSelectionToggle(item.uuid, checked)}
                isDisabled={statusStyling.isDisabled}
              />
            )}
            <div>
              {/* Show Group/Item number as main text */}
              <p className="font-medium">
                {inventoryViewMode === 'grouped' && groupInfo.isGroup
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
            {/* Item code as a chip */}
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
              onExport={async (data) => {
                setIsPdfGenerating(true);

                try {
                  // Get selected deliveries
                  const deliveriesToExport = data.selectedItems.length > 0
                    ? data.allFilteredItems.filter(item => data.selectedItems.includes(item.uuid))
                    : data.allFilteredItems;

                  // Prepare deliveries with QR URLs and warehouse names
                  const preparedDeliveries = deliveriesToExport.map(delivery => {
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
              }}
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
            filters={deliveryFilters}
            companyUuid={user?.company_uuid}
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
                          {inventoryItems.find(i => i.uuid === delivery.inventory_uuid)?.name || 'Unknown Item'}
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
                            {Object.keys(delivery.inventory_locations || {}).length} item{(Object.keys(delivery.inventory_locations || {}).length) !== 1 ? 's' : ''}
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
                <p className="text-default-500 mt-2">No deliveries found</p>
                <Button color="primary" variant="light" size="sm" className="mt-4" onPress={handleNewDelivery}>
                  Create New Delivery
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
                        {canEditAllFields() && (
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
                        {/* Inventory Item Selection */}
                        <Autocomplete
                          selectedKey={formData.inventory_uuid || ""}
                          name="inventory_uuid"
                          label="Inventory Item"
                          placeholder="Select an inventory item"
                          onSelectionChange={(e) => {
                            handleInventoryItemChange(e as any);
                          }}
                          popoverProps={{ className: !!selectedDeliveryId ? "collapse" : "" }}
                          isRequired={!selectedDeliveryId}
                          inputProps={autoCompleteStyle}
                          classNames={{ clearButton: "text-default-800" }}
                          isInvalid={!!errors.inventory_uuid}
                          errorMessage={errors.inventory_uuid}
                          isReadOnly={!!selectedDeliveryId}
                          selectorIcon={!!selectedDeliveryId ? null : <Icon icon="heroicons:chevron-down" height={15} />}
                          startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                        >
                          {inventoryItems.map((item) => (
                            <AutocompleteItem key={item.uuid}>
                              {item.name}
                            </AutocompleteItem>
                          ))}
                        </Autocomplete>

                        {/* Inventory Items Selection */}
                        {formData.inventory_uuid && (
                          <div className="border-2 border-default-200 rounded-xl bg-gradient-to-b from-background to-default-50/30 overflow-hidden">
                            <div className="flex justify-between items-center border-b border-default-200 p-4">
                              <h3 className="text-lg font-semibold">Inventory Items</h3>
                              <div className="flex gap-2 items-center">
                                {selectedInventoryItems.length > 0 && !(canEditAllFields() || canOnlyEditLocations()) && (
                                  <Chip color="primary" size="sm" variant="flat">
                                    {selectedInventoryItems.length} selected
                                  </Chip>
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

                            {/* Add Select All Checkbox Section */}
                            {(user && user.is_admin) && inventoryInventoryItems.length > 0 && (
                              (canEditAllFields() || canOnlyEditLocations()) && formData.status === "PENDING"
                            ) && (
                                <div className="border-b border-default-200 px-4 py-3 bg-default-50/50">
                                  <div className="flex items-center justify-between flex-row-reverse">
                                    <div className="flex items-center gap-2">
                                      {selectedInventoryItems.length > 0 && (
                                        <Chip color="primary" size="sm" variant="flat">
                                          {selectedInventoryItems.length} selected
                                        </Chip>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <Checkbox
                                        isSelected={isSelectAllChecked}
                                        isIndeterminate={isSelectAllIndeterminate}
                                        onValueChange={handleSelectAllToggle}
                                        color="primary" />
                                      <div className="flex flex-col">
                                        <span className="text-sm font-medium text-default-700">
                                          Select All Available Items
                                        </span>
                                        <span className="text-xs text-default-500">
                                          {(() => {
                                            const displayItems = getDisplayInventoryItemsList();
                                            const availableItems = displayItems.filter(item => {
                                              const statusStyling = getInventoryItemStatusStyling(item);
                                              return !statusStyling.isDisabled;
                                            });

                                            let totalAvailableCount = 0;
                                            availableItems.forEach(item => {
                                              const groupedItems = getGroupedInventoryItems();
                                              const groupInfo = getGroupInfo(item, groupedItems);

                                              if (inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId) {
                                                const groupItems = inventoryInventoryItems.filter(groupItem =>
                                                  groupItem.group_id === groupInfo.groupId
                                                );
                                                const availableGroupItems = groupItems.filter(groupItem => {
                                                  const groupItemStatusStyling = getInventoryItemStatusStyling(groupItem);
                                                  return !groupItemStatusStyling.isDisabled;
                                                });
                                                totalAvailableCount += availableGroupItems.length;
                                              } else {
                                                totalAvailableCount += 1;
                                              }
                                            });

                                            return `${selectedInventoryItems.length} of ${totalAvailableCount} available items selected`;
                                          })()}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                            <div>
                              <LoadingAnimation
                                condition={isLoadingInventoryItems}
                                skeleton={
                                  <div className="space-y-2 p-4">
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
                                {inventoryInventoryItems.length === 0 ? (
                                  <div className="text-center py-8 text-default-500">
                                    <Icon icon="mdi:package-variant-closed" className="mx-auto mb-2 opacity-50" width={40} height={40} />
                                    <p>No inventory items available</p>
                                  </div>
                                ) : (
                                  <div className="py-4">
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
                                      {getDisplayInventoryItemsList()
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
                                              const groupItems = inventoryInventoryItems.filter(groupItem =>
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
                                        .map((item, index: number) => {
                                          const groupedItems = getGroupedInventoryItems();
                                          const groupInfo = getGroupInfo(item, groupedItems);
                                          const displayNumber = index + 1; // Simple display number based on filtered list

                                          // Get all items that should be selected for this display item
                                          const itemsToSelect = inventoryViewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId
                                            ? inventoryInventoryItems.filter(groupItem => groupItem.group_id === groupInfo.groupId)
                                            : [item];

                                          const isSelected = itemsToSelect.every(groupItem => selectedInventoryItems.includes(groupItem.uuid));

                                          return (
                                            <AccordionItem
                                              key={`${item.uuid}-${inventoryViewMode}`} // Use uuid + view mode for unique key
                                              aria-label={`Item ${displayNumber}`}
                                              className="mx-2"
                                              title={
                                                renderInventoryItemWithStatus(item, isSelected)
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
                                                    const itemsToShow = inventoryViewMode === 'grouped' && groupInfo.isGroup
                                                      ? inventoryInventoryItems.filter(groupItem => groupItem.group_id === groupInfo.groupId)
                                                      : [item];

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

                                                        {/* List individual items */}
                                                        {itemsToShow.map((inventoryItem, itemIndex) => {
                                                          const itemLocationIndex = selectedInventoryItems.indexOf(inventoryItem.uuid);
                                                          const hasAssignedLocation = itemLocationIndex >= 0 && locations[itemLocationIndex];
                                                          const isItemSelected = selectedInventoryItems.includes(inventoryItem.uuid);

                                                          return (
                                                            <div key={inventoryItem.uuid} className="border border-default-200 rounded-xl p-4 bg-default-50/50">
                                                              <div className="space-y-3">
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

                                                                {/* Item status - show for each individual item in grouped view only */}
                                                                {inventoryViewMode === 'grouped' && inventoryItem.status && (
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

                                                                        if (hasAssignedLocation) {
                                                                          setExternalSelection(locations[itemLocationIndex]);
                                                                        } else {
                                                                          setExternalSelection(undefined);
                                                                        }

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
                                                        })}
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

                              {/* Auto-assign locations button - only show when not delivered/cancelled */}
                              {selectedInventoryItems.length > 0 && user.is_admin && !isWarehouseNotSet() && !isFloorConfigNotSet() &&
                                (canEditAllFields() || canOnlyEditLocations()) && (
                                  <div className="bg-default-100 p-4">
                                    <Button
                                      color="secondary"
                                      variant="shadow"
                                      className="w-full"
                                      onPress={autoAssignShelfLocations}
                                      startContent={!isAutoAssigning && <Icon icon="mdi:auto-fix" />}
                                      isLoading={isAutoAssigning}
                                      isDisabled={isLoading || isLoadingItems || isLoadingInventoryItems}
                                    >
                                      {isAutoAssigning ? "Auto-assigning..." : "Auto-assign Locations"}
                                    </Button>
                                  </div>
                                )}

                              {/* Validation message for locations */}
                              {errors.locations && (
                                <Alert color="danger" variant="flat" className="mt-4">
                                  {errors.locations}
                                </Alert>
                              )}
                            </div>
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

                  <div>
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
                        <AnimatePresence>
                          {error && (
                            <motion.div {...motionTransition}>
                              <Alert color="danger" variant="flat" onClose={() => setError(null)}>
                                {error}
                              </Alert>
                            </motion.div>
                          )}
                        </AnimatePresence>

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

                                {formData.status === "DELIVERED" && (
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
                                )}
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
                                isLoading={isLoading || isAcceptingDelivery}
                                isDisabled={!deliveryInput.trim()}
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

        {/* Modal for the 3D shelf selector */}
        <Modal isOpen={isOpen} onClose={handleCancelLocation} placement='auto' classNames={{ backdrop: "bg-background/50", wrapper: 'overflow-hidden' }} backdrop="blur" size="5xl" >
          <ModalContent>
            <ModalHeader>Interactive Warehouse Floorplan</ModalHeader>
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
                    onSelect={handleShelfSelection}
                    occupiedLocations={filteredOccupiedLocations}
                    canSelectOccupiedLocations={false}
                    className="w-full h-full"
                    highlightedFloor={highlightedFloor}
                    onHighlightFloor={setHighlightedFloor}
                    externalSelection={externalSelection}
                    cameraOffsetY={-0.25}
                    shelfColorAssignments={shelfColorAssignments}
                  />
                </Suspense>


                {/* Shelf controls */}
                <AnimatePresence>
                  {externalSelection && showControls &&
                    <motion.div {...motionTransition}
                      className="absolute overflow-hidden bottom-4 left-4 flex flex-col gap-2 bg-background/50 rounded-2xl backdrop-blur-lg w-auto">
                      <div className="grid md:grid-cols-2 grid-cols-1 gap-3 p-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-16">Floor</span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleFloorChange(Math.max(1, ((externalSelection?.floor || 0) + 1) - 1))}
                                isDisabled={(externalSelection?.floor || 0) <= 0}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-left" className="text-sm" />
                              </Button>
                              <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                                {(externalSelection?.floor || 0) + 1}
                              </div>
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleFloorChange(Math.min(floorConfigs.length, ((externalSelection?.floor || 0) + 1) + 1))}
                                isDisabled={(externalSelection?.floor || 0) + 1 >= floorConfigs.length}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-right" className="text-sm" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-16">Group</span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleGroupChange(Math.max(1, ((externalSelection?.group || 0) + 1) - 1))}
                                isDisabled={(externalSelection?.group || 0) <= 0}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-left" className="text-sm" />
                              </Button>
                              <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                                {(externalSelection?.group || 0) + 1}
                              </div>
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleGroupChange(Math.min(maxGroupId + 1, ((externalSelection?.group || 0) + 1) + 1))}
                                isDisabled={(externalSelection?.group || 0) + 1 > maxGroupId}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-right" className="text-sm" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 md:pl-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-16">Row</span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleRowChange(Math.max(1, ((externalSelection?.row || 0) + 1) - 1))}
                                isDisabled={(externalSelection?.row || 0) <= 0}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-left" className="text-sm" />
                              </Button>
                              <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                                {(externalSelection?.row || 0) + 1}
                              </div>
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleRowChange(Math.min(maxRow + 1, ((externalSelection?.row || 0) + 1) + 1))}
                                isDisabled={(externalSelection?.row || 0) + 1 > maxRow}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-right" className="text-sm" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-16">Column</span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleColumnChange(Math.max(1, ((externalSelection?.column || 0) + 1) - 1))}
                                isDisabled={(externalSelection?.column || 0) <= 0}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-left" className="text-sm" />
                              </Button>
                              <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                                {parseColumn((externalSelection?.column || 0) + 1) || ""}
                              </div>
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleColumnChange(Math.min(maxColumn + 1, ((externalSelection?.column || 0) + 1) + 1))}
                                isDisabled={(externalSelection?.column || 0) + 1 > maxColumn}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-right" className="text-sm" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 md:mb-0 mb-10">
                            <span className="text-sm font-semibold w-16">Depth</span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleDepthChange(Math.max(1, ((externalSelection?.depth || 0) + 1) - 1))}
                                isDisabled={(externalSelection?.depth || 0) <= 0}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-left" className="text-sm" />
                              </Button>
                              <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                                {(externalSelection?.depth || 0) + 1}
                              </div>
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleDepthChange(Math.min(maxDepth + 1, ((externalSelection?.depth || 0) + 1) + 1))}
                                isDisabled={(externalSelection?.depth || 0) + 1 > maxDepth}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-right" className="text-sm" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  }
                </AnimatePresence>

                <AnimatePresence>
                  {(externalSelection || showControls) &&
                    <motion.div {...motionTransition}
                      className={`absolute overflow-hidden ${showControls ? "bottom-8 left-8 h-8 shadow-sm" : "bottom-4 left-4 h-10 shadow-lg"} w-[12.6rem] bg-default-200/50 rounded-xl backdrop-blur-lg z-10 transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]`}>
                      <Button
                        onPress={() => setShowControls(!showControls)}
                        color="default"
                        className={`flex items-center p-4 text-default-800 bg-transparent w-full !scale-100 ${showControls ? "h-8" : "h-10"} !transition-all !duration-500 duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]`}
                      >
                        <Icon icon="ic:round-control-camera" className="w-4 h-4" />
                        <span className="text-sm font-semibold">
                          {showControls ? "Hide Controls" : "Show Controls"}
                        </span>
                      </Button>
                    </motion.div>
                  }
                </AnimatePresence>

                <AnimatePresence>
                  {externalSelection &&
                    <motion.div {...motionTransition} className="absolute top-4 right-4 flex items-center gap-2 bg-background/50 rounded-2xl backdrop-blur-lg">
                      <span className="text-sm font-semibold p-4">CODE: <b>{externalSelection?.code}</b></span>
                    </motion.div>
                  }
                </AnimatePresence>
              </div>
            </ModalBody>
            <ModalFooter className="flex justify-between gap-4 p-4">
              <Popover3dNavigationHelp />

              <div className="flex items-center gap-2">
                <Button color="danger" variant="shadow" onPress={handleCancelLocation}>
                  {isDeliveryProcessing() && (user === null || user.is_admin) ? "Cancel" : "Close"}
                </Button>
                {isDeliveryProcessing() && (user === null || user.is_admin) && (
                  <Button color="primary" variant="shadow" onPress={handleConfirmLocation} isDisabled={isSelectedLocationOccupied}>
                    {isSelectedLocationOccupied ? "Location Occupied" : "Confirm Location"}
                  </Button>
                )}
              </div>
            </ModalFooter>
          </ModalContent>
        </Modal >
      </div >
    </motion.div >
  );
}