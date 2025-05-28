"use client";

import { motionTransition, popoverTransition } from '@/utils/anim';
import { createClient } from "@/utils/supabase/client";
import {
  Accordion, AccordionItem, Alert, Autocomplete, AutocompleteItem, Button, Checkbox,
  Chip, DatePicker, form, Form, Input, Kbd, Modal, ModalBody, ModalContent, ModalFooter,
  ModalHeader, NumberInput, Pagination, Popover, PopoverContent, PopoverTrigger,
  ScrollShadow, Skeleton, Spinner, Switch, Table, TableBody, TableCell,
  TableColumn, TableHeader, TableRow, Textarea, Tooltip, useDisclosure,
  Select, SelectItem,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { getLocalTimeZone, parseDate, today } from '@internationalized/date';
import { format, parseISO } from "date-fns";
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from 'qrcode.react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialDark, materialLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';

import { ShelfSelectorColorAssignment } from '@/components/shelf-selector-3d';
import { formatCode, parseColumn } from '@/utils/floorplan';

// Import server actions
import CardList from '@/components/card-list';
import {
  createDeliveryItem,
  DeliveryItem,
  getDeliveryItems,
  getInventoryItemBulks,
  getInventoryItems,
  getOccupiedShelfLocations,
  createWarehouseInventoryItems,
  getOperators,
  getWarehouses,
  Operator,
  suggestShelfLocations,
  updateDeliveryItem,
  updateInventoryItemBulksStatus,
  updateInventoryItemStatus,
  getBulkDetails
} from "./actions";

// Import the QR code scanner library
import jsQR from "jsqr";
import { InventoryItem, InventoryItemBulk, InventoryItemUnit } from '../inventory/actions';
import { Warehouse } from '../warehouses/actions';
import { copyToClipboard, formatDate, formatNumber, toNormalCase, toSentenceCase, toTitleCase } from '@/utils/tools';
import { BitMatrix } from 'jsqr/dist/BitMatrix';
import { getUserFromCookies } from '@/utils/supabase/server/user';
import LoadingAnimation from '@/components/loading-animation';
import ListLoadingAnimation from '@/components/list-loading-animation';

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
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [showQrCode, setShowQrCode] = useState(false);
  const [showAcceptForm, setShowAcceptForm] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Delivery list state
  const [deliveryItems, setDeliveryItems] = useState<DeliveryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Available inventory items for delivery
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string>("");

  // Inventory bulk items
  const [inventoryBulks, setInventoryBulks] = useState<any[]>([]);
  const [selectedBulks, setSelectedBulks] = useState<string[]>([]);
  const [prevSelectedBulks, setPrevSelectedBulks] = useState<string[]>([]);
  const [isLoadingBulks, setIsLoadingBulks] = useState(false);

  // Bulk details state
  const [expandedBulkDetails, setExpandedBulkDetails] = useState<Set<string>>(new Set());
  const [bulkDetails, setBulkDetails] = useState<Map<string, InventoryItemBulk & { inventory_item_units: InventoryItemUnit[] }>>(new Map());
  const [loadingBulkDetails, setLoadingBulkDetails] = useState<Set<string>>(new Set());


  // Location management
  const [currentBulkLocationIndex, setCurrentBulkLocationIndex] = useState<number>(0);
  const [locations, setLocations] = useState<any[]>([]);
  const [locationCodes, setLocationCodes] = useState<string[]>([]);

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

  // Location state for current bulk
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedColumnCode, setSelectedColumnCode] = useState<string>("");
  const [selectedColumn, setSelectedColumn] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [selectedCode, setSelectedCode] = useState("");
  const [selectedDepth, setSelectedDepth] = useState<number | null>(null);
  const [floorOptions, setFloorOptions] = useState<string[]>([]);
  const [occupiedLocations, setOccupiedLocations] = useState<any[]>([]);

  // Auto-assignment state
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);

  // 3D shelf selector states
  const [tempSelectedFloor, setTempSelectedFloor] = useState<number | null>(null);
  const [tempSelectedColumnCode, setTempSelectedColumnCode] = useState<string>("");
  const [tempSelectedColumn, setTempSelectedColumn] = useState<number | null>(null);
  const [tempSelectedRow, setTempSelectedRow] = useState<number | null>(null);
  const [tempSelectedGroup, setTempSelectedGroup] = useState<number | null>(null);
  const [tempSelectedCode, setTempSelectedCode] = useState("");
  const [tempSelectedDepth, setTempSelectedDepth] = useState<number | null>(null);

  // Add state for maximum values
  const [maxGroupId, setMaxGroupId] = useState(0);
  const [maxRow, setMaxRow] = useState(0);
  const [maxColumn, setMaxColumn] = useState(0);
  const [maxDepth, setMaxDepth] = useState(0);

  const [error, setError] = useState<string | null>(null);

  // Shelf selector states
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(null);
  const isFloorChangeAnimate = true;
  const isShelfChangeAnimate = true;
  const isGroupChangeAnimate = false;
  const [isSelectedLocationOccupied, setIsSelectedLocationOccupied] = useState(false);
  const [externalSelection, setExternalSelection] = useState<any | undefined>(undefined);
  const [floorConfigs, setFloorConfigs] = useState<any[]>([]);

  // Create a state for shelf color assignments
  const [shelfColorAssignments, setShelfColorAssignments] = useState<Array<ShelfSelectorColorAssignment>>([]);
  const [showControls, setShowControls] = useState(false);

  // Add new state variables after other state declarations
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [operatorFilter, setOperatorFilter] = useState<string | null>(null);
  const [warehouseFilter, setWarehouseFilter] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // 1. Add state variables for pagination
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDeliveries, setTotalDeliveries] = useState(0);


  // Update operator selection state
  const [selectedOperators, setSelectedOperators] = useState<Operator[]>([]); // Changed from selectedOperator


  // Form state
  const [formData, setFormData] = useState<Partial<DeliveryItem>>({
    company_uuid: null,
    admin_uuid: null,
    inventory_uuid: null,
    inventory_item_bulk_uuids: [], // New field for selected bulks
    warehouse_uuid: null,
    delivery_address: "",
    delivery_date: format(new Date(), "yyyy-MM-dd"),
    locations: [], // Changed from location to locations array
    operator_uuids: [], // Changed from operator_uuid
    location_codes: [], // Changed from location_code to location_codes array
    notes: "",
    status: "PENDING",
  });

  // Refs
  const deliveryJsonTextareaRef = useRef<HTMLTextAreaElement>(null);
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
    setLocations([]);
    setLocationCodes([]);

    setTempSelectedFloor(null);
    setTempSelectedColumn(null);
    setTempSelectedRow(null);
    setTempSelectedDepth(null);
    setTempSelectedGroup(null);
    setTempSelectedColumnCode("");
    setTempSelectedCode("");

    setFloorConfigs([]);
    setFloorOptions([]);
    setOccupiedLocations([]);
  };

  // Generate JSON for QR code
  const generateDeliveryJson = (space: number = 0) => {
    if (!selectedDeliveryId || !formData) return "{}";

    // Only include specified keys
    const output: Record<string, any> = {};

    const keys: Array<keyof DeliveryItem> = [
      "uuid",
      "company_uuid",
      "inventory_uuid",
      "delivery_address",
      "delivery_date",
      "warehouse_uuid",
    ];

    keys.forEach((key) => {
      const value = (formData as any)[key];
      if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value) && value.length > 0)) {
        output[key] = value;
      }
    });

    // Include operator_uuid if assigned
    if (formData.operator_uuids && formData.operator_uuids.length > 0) {
      output.operator_uuids = formData.operator_uuids
    }

    return JSON.stringify(output, null, space);
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

  const checkIfLocationOccupied = (location: any) => {
    return occupiedLocations.some(
      loc =>
        loc.floor === location.floor &&
        loc.group === location.group &&
        loc.row === location.row &&
        loc.column === location.column &&
        loc.depth === location.depth
    );
  };

  const filteredOccupiedLocations = useMemo(() => {
    return occupiedLocations.filter(loc =>
      !shelfColorAssignments.some(
        assignment =>
          assignment.floor === loc.floor &&
          assignment.group === loc.group &&
          assignment.row === loc.row &&
          assignment.column === loc.column &&
          assignment.depth === (loc.depth || 0)
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
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0
      };
      setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
    }
  };

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

  const loadInventoryBulks = useCallback(async (inventoryItemUuid: string, preserveSelection: boolean = false) => {
    if (inventoryItemUuid === null || inventoryItemUuid === "null" || inventoryItemUuid === "") {
      setInventoryBulks([]);
      setSelectedBulks([]);
      setPrevSelectedBulks([]);
      setLocations([]);
      setLocationCodes([]);
      return;
    }


    setIsLoadingBulks(true);
    try {
      console.log("Status:", formData.status);


      const result = await getInventoryItemBulks(inventoryItemUuid, formData.status === "DELIVERED" || formData.status === "CANCELLED");
      if (result.success) {
        setInventoryBulks(result.data);

        // Reset selected bulks only when not preserving selection
        if (!preserveSelection) {
          setSelectedBulks([]);
          setPrevSelectedBulks([]);
          setLocations([]);
          setLocationCodes([]);
        }
      } else {
        console.error("Failed to load inventory bulks:", result.error);
      }
    } catch (error) {
      console.error("Error loading inventory bulks:", error);
    } finally {
      setIsLoadingBulks(false);
    }
  }, [formData.status]);

  // Handle bulk selection toggle
  const handleBulkSelectionToggle = (bulkUuid: string, isSelected: boolean) => {
    setSelectedBulks(prev => {
      if (isSelected) {
        return [...prev, bulkUuid];
      } else {
        return prev.filter(uuid => uuid !== bulkUuid);
      }
    });
  };

  // Auto-assign shelf locations for selected bulks
  const autoAssignShelfLocations = async () => {
    if (isWarehouseNotSet() || isFloorConfigNotSet() || selectedBulks.length === 0) {
      return;
    }

    setIsAutoAssigning(true);
    try {
      // Get the suggested locations
      const result = await suggestShelfLocations(
        formData.warehouse_uuid as string,
        selectedBulks.length,
        // Optionally provide a starting shelf
        selectedFloor !== null && selectedGroup !== null && selectedRow !== null && selectedColumn !== null
          ? { floor: selectedFloor, group: selectedGroup, row: selectedRow, column: selectedColumn }
          : undefined
      );

      if (result.success && result.data) {
        // Get locations and location codes from the result
        const { locations, locationCodes } = result.data;

        // Update state with the suggested locations and codes
        setLocations(locations);
        setLocationCodes(locationCodes);

        // Update formData with the new locations
        setFormData(prev => ({
          ...prev,
          locations: locations,
          location_codes: locationCodes
        }));

        // Select the first location in the 3D view
        if (locations.length > 0) {
          setCurrentBulkLocationIndex(0);
          const firstLocation = locations[0];

          setSelectedFloor(firstLocation.floor);
          setSelectedGroup(firstLocation.group);
          setSelectedRow(firstLocation.row);
          setSelectedColumn(firstLocation.column);
          setSelectedDepth(firstLocation.depth || 0);
          setSelectedColumnCode(parseColumn(firstLocation.column) || "");
          setSelectedCode(locationCodes[0]);

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

  // Use an effect to update the assignments when locations or currentBulkLocationIndex change
  useEffect(() => {
    const assignments: Array<ShelfSelectorColorAssignment> = [];

    // Get the currently focused bulk location
    const currentLocation = currentBulkLocationIndex >= 0 && locations && locations[currentBulkLocationIndex]
      ? locations[currentBulkLocationIndex]
      : null;

    // 1. Add all selected bulk locations as secondary color, except the current one
    if (locations && locations.length > 0) {
      locations.forEach((location, index) => {
        if (location && location.floor !== undefined) {
          // Skip the currently focused location as it will be added as tertiary later
          if (index === currentBulkLocationIndex) {
            return;
          }
          assignments.push({
            floor: location.floor,
            group: location.group,
            row: location.row,
            column: location.column,
            depth: location.depth || 0,
            colorType: 'secondary'
          });
        }
      });
    }

    // 2. Add the currently focused bulk location as tertiary 
    if (currentLocation && currentLocation.floor !== undefined) {
      assignments.push({
        floor: currentLocation.floor,
        group: currentLocation.group,
        row: currentLocation.row,
        column: currentLocation.column,
        depth: currentLocation.depth || 0,
        colorType: 'tertiary'
      });
    }

    // Update the state with the new assignments
    setShelfColorAssignments(assignments);
  }, [locations, currentBulkLocationIndex]);

  // Update the form validation function to remove assignOperator check
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.inventory_uuid) newErrors.inventory_uuid = "Please select an inventory item";
    if (!formData.delivery_address) newErrors.delivery_address = "Delivery address is required";
    if (!formData.delivery_date) newErrors.delivery_date = "Delivery date is required";
    if (!formData.warehouse_uuid) newErrors.warehouse_uuid = "Please select a warehouse";

    // Check if each selected bulk has a location assigned
    if (formData.inventory_item_bulk_uuids &&
      formData.inventory_item_bulk_uuids.length > 0 &&
      (!formData.locations || formData.locations.length !== formData.inventory_item_bulk_uuids.length)) {
      newErrors.locations = "Please assign a location for each selected bulk item";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle location assignment for a specific bulk
  const handleAssignLocation = (bulkIndex: number) => {
    setCurrentBulkLocationIndex(bulkIndex);

    // If we already have a location for this bulk, select it
    if (locations[bulkIndex]) {
      const location = locations[bulkIndex];
      setSelectedFloor(location.floor);
      setSelectedGroup(location.group);
      setSelectedRow(location.row);
      setSelectedColumn(location.column);
      setSelectedDepth(location.depth || 0);
      setSelectedColumnCode(parseColumn(location.column) || "");
      setSelectedCode(locationCodes[bulkIndex] || "");

      // Set external selection for the 3D viewer
      setExternalSelection(location);

      // Also set temp values for the modal
      setTempSelectedFloor(location.floor);
      setTempSelectedGroup(location.group);
      setTempSelectedRow(location.row);
      setTempSelectedColumn(location.column);
      setTempSelectedDepth(location.depth || 0);
      setTempSelectedColumnCode(parseColumn(location.column) || "");
      setTempSelectedCode(locationCodes[bulkIndex] || "");
    } else {
      // Reset all shelf selection state if no location exists for this bulk
      setSelectedFloor(null);
      setSelectedGroup(null);
      setSelectedRow(null);
      setSelectedColumn(null);
      setSelectedDepth(null);
      setSelectedColumnCode("");
      setSelectedCode("");

      // Also reset temporary selection values
      setTempSelectedFloor(null);
      setTempSelectedGroup(null);
      setTempSelectedRow(null);
      setTempSelectedColumn(null);
      setTempSelectedDepth(null);
      setTempSelectedColumnCode("");
      setTempSelectedCode("");

      // Clear external selection to ensure nothing is selected in 3D viewer
      setExternalSelection(undefined);

      // Reset highlighted floor
      setHighlightedFloor(null);
    }

    // Open the location selector modal
    onOpen();
  };

  // Update handleSearch to accept filter parameters
  const handleSearch = async (query: string, status?: string | null, warehouse?: string | null, currentPage: number = page) => {
    setSearchQuery(query);

    try {
      setIsLoadingItems(true);

      // Use provided parameters or fall back to state values
      const statusToUse = status !== undefined ? status : statusFilter;
      const warehouseToUse = warehouse !== undefined ? warehouse : warehouseFilter;

      // Calculate offset based on current page and rows per page
      const offset = (currentPage - 1) * rowsPerPage;

      const result = await getDeliveryItems(
        user.company_uuid,
        query,
        statusToUse,
        warehouseToUse,
        null, // operatorUuid
        null, // inventoryUuid
        null, // dateFrom
        null, // dateTo
        null, // year
        null, // month
        null, // week
        null, // day
        rowsPerPage, // limit
        offset // offset
      );

      setDeliveryItems(result.data || []);
      setTotalPages(result.totalPages || 1);
      setTotalDeliveries(result.totalCount || 0);
    } catch (error) {
      console.error("Error searching delivery items:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Handle bulk details expansion
  const handleBulkDetailsToggle = async (bulkUuid: string, bulkName?: string) => {
    const isExpanded = expandedBulkDetails.has(bulkUuid);

    if (isExpanded) {
      // Collapse
      setExpandedBulkDetails(prev => {
        const newSet = new Set(prev);
        newSet.delete(bulkUuid);
        return newSet;
      });
    } else {
      // Expand - check if we already have the details
      if (!bulkDetails.has(bulkUuid)) {
        // Load bulk details
        setLoadingBulkDetails(prev => new Set(prev).add(bulkUuid));

        try {
          const result = await getBulkDetails(bulkUuid);
          if (result.success && result.data) {
            setBulkDetails(prev => new Map(prev).set(bulkUuid, result.data));
          } else {
            console.error("Failed to load bulk details:", result.error);
            return; // Don't expand if loading failed
          }
        } catch (error) {
          console.error("Error loading bulk details:", error);
          return; // Don't expand if loading failed
        } finally {
          setLoadingBulkDetails(prev => {
            const newSet = new Set(prev);
            newSet.delete(bulkUuid);
            return newSet;
          });
        }
      }

      // Expand
      setExpandedBulkDetails(prev => new Set(prev).add(bulkUuid));
    }
  };

  // 3. Add function to handle page changes
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    handleSearch(searchQuery, statusFilter, warehouseFilter, newPage);
  };

  // 4. Update filter handlers to reset pagination
  const handleStatusFilterChange = (status: string | null) => {
    setStatusFilter(status);
    setPage(1); // Reset to first page when filter changes
    handleSearch(searchQuery, status, warehouseFilter, 1);
  };

  const handleOperatorFilterChange = (status: string | null) => {
    setOperatorFilter(status);
    setPage(1); // Reset to first page when filter changes
    handleSearch(searchQuery, statusFilter, warehouseFilter, 1);
  };

  const handleWarehouseFilterChange = (warehouseId: string | null) => {
    setWarehouseFilter(warehouseId);
    setPage(1); // Reset to first page when filter changes
    handleSearch(searchQuery, statusFilter, warehouseId, 1);
  };


  // Handle inventory item selection
  const handleInventoryItemChange = async (inventoryItemUuid: string | null) => {
    setSelectedItem(inventoryItemUuid || '');

    // Reset selected bulks and locations
    setSelectedBulks([]);
    setLocations([]);
    setLocationCodes([]);

    // Update form data
    setFormData(prev => ({
      ...prev,
      inventory_uuid: inventoryItemUuid,
      inventory_item_bulk_uuids: [], // Reset bulk selection
      locations: [], // Reset locations
      location_codes: [] // Reset location codes
    }));

    // Load bulk items for this inventory item (without preserving selection)
    if (inventoryItemUuid) {
      await loadInventoryBulks(inventoryItemUuid, false);
    }
  };

  // Update the operator assignment toggle handler (can be removed since no checkbox)
  // const handleAssignOperatorToggle = (checked: boolean) => {
  //   setAssignOperator(checked);
  //   if (checked) {
  //     // Keep existing operator_uuids if toggling back on
  //   } else {
  //     // Clear operator_uuids if toggling off
  //     setFormData(prev => {
  //       const { operator_uuids, ...rest } = prev;
  //       return { ...rest };
  //     });
  //     setSelectedOperators([]);
  //   }
  // };

  // Update the operator selection handler to add operator instead of replacing
  const handleAddOperator = (operatorUuid: string) => {
    if (!operatorUuid) return;

    const operatorToAdd = operators.find(op => op.uuid === operatorUuid);
    if (!operatorToAdd) return;

    // Check if operator is already selected
    if (selectedOperators.some(op => op.uuid === operatorUuid)) return;

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

  // Add function to remove operator
  const handleRemoveOperator = (operatorUuid: string) => {
    const newSelectedOperators = selectedOperators.filter(op => op.uuid !== operatorUuid);
    setSelectedOperators(newSelectedOperators);

    setFormData(prev => ({
      ...prev,
      operator_uuids: newSelectedOperators.map(op => op.uuid)
    }));
  };


  // Update the operator selection handler
  const handleOperatorSelection = (operatorUuids: string[]) => {
    const selectedOps = operators.filter(op => operatorUuids.includes(op.uuid));
    setSelectedOperators(selectedOps);

    setFormData(prev => ({
      ...prev,
      operator_uuids: operatorUuids
    }));

    // Clear validation error when operators are selected
    if (operatorUuids.length > 0) {
      setErrors(prev => {
        const { operator_uuids, ...rest } = prev;
        return rest;
      });
    }
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

  // Handle status change
  const handleStatusChange = async (status: string) => {
    if (!selectedDeliveryId) return { error: "No delivery selected" };

    // For operators, only allow changing to DELIVERED status when item is IN_TRANSIT
    if (!user?.is_admin) {
      if (formData.status !== "IN_TRANSIT" || status !== "DELIVERED") {
        return { error: "You can only change the status to DELIVERED when the item is IN_TRANSIT." };
      }
    }

    // If changing to DELIVERED, ensure we have location data for each bulk
    if (status === "DELIVERED" &&
      (formData.inventory_item_bulk_uuids?.length === 0 ||
        formData.locations?.length === 0 ||
        formData.location_codes?.length === 0 ||
        formData.locations?.length !== formData.inventory_item_bulk_uuids?.length)) {
      return { error: "Please assign warehouse locations for all selected bulk items before marking as delivered." };
    }

    setIsLoading(true);

    try {
      // Generate a timestamp for this status change
      const timestamp = new Date().toISOString();

      // Create or update the status history
      const currentHistory = formData.status_history || {};
      const updatedHistory = {
        ...currentHistory,
        [timestamp]: status
      };

      // Update form data with the new status and status history
      const { inventory_items, ...filteredFormData } = formData as any;
      const updatedFormData = {
        ...filteredFormData,
        status,
        status_history: updatedHistory
      };
      setFormData(updatedFormData);

      // Update the delivery item with the new status and history
      const { data: deliveryData, error: deliveryError } = await updateDeliveryItem(selectedDeliveryId, updatedFormData as any);

      if (deliveryError) {
        console.error("Failed to update delivery item:", deliveryError);
        return { error: "Failed to update delivery item" };
      }

      // Update inventory item status as well
      if (updatedFormData.inventory_uuid) {
        // Determine the inventory status based on delivery status
        let inventoryStatus: string;
        if (status === "DELIVERED") {
          inventoryStatus = "IN_WAREHOUSE";

          // Create warehouse inventory items for each bulk
          if (typeof formData.locations !== "undefined" &&
            typeof formData.inventory_item_bulk_uuids !== "undefined" &&
            formData.locations?.length > 0 && formData.inventory_item_bulk_uuids?.length > 0) {

            // Create warehouse inventory items with their bulks and units
            const warehouseResult = await createWarehouseInventoryItems(
              formData.inventory_uuid as string,
              formData.warehouse_uuid as string,
              deliveryData.uuid,
              formData.inventory_item_bulk_uuids,
              formData.locations,
              formData.location_codes || []
            );

            if (!warehouseResult.success) {
              console.error("Failed to create warehouse inventory items:", warehouseResult.error);
              // Continue with the process even if warehouse items creation fails
              // The inventory status will still be updated
            } else {
              console.log("Successfully created warehouse inventory items:", warehouseResult.data);

              // Update status of the inventory item bulks
              await updateInventoryItemBulksStatus(formData.inventory_item_bulk_uuids || [], "IN_WAREHOUSE");
            }
          }
        } else if (status === "CANCELLED") {
          inventoryStatus = "AVAILABLE";

          // Update status of the inventory item bulks
          if (typeof formData.inventory_item_bulk_uuids !== "undefined" && formData.inventory_item_bulk_uuids.length > 0) {
            await updateInventoryItemBulksStatus(formData.inventory_item_bulk_uuids, "AVAILABLE");
          }
        } else if (status === "IN_TRANSIT") {
          inventoryStatus = "ON_DELIVERY";

          // Update status of the inventory item bulks
          if (typeof formData.inventory_item_bulk_uuids !== "undefined" && formData.inventory_item_bulk_uuids.length > 0) {
            await updateInventoryItemBulksStatus(formData.inventory_item_bulk_uuids, "ON_DELIVERY");
          }
        } else {
          inventoryStatus = status;
        }

        // const inventoryResult = await updateInventoryItemStatus(
        //   updatedFormData.inventory_uuid,
        //   inventoryStatus
        // );

        // if (!inventoryResult.success) {
        //   return { error: "Failed to update inventory item status" };
        // }
      }

      // Refresh the delivery items list
      const refreshedItems = await getDeliveryItems(user?.company_uuid || "", searchQuery);
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

    // If warehouse is selected, load the layout
    if (name === "warehouse_uuid" && value) {
      await handleWarehouseChange(value);
    }

    // If inventory_uuid is changed, load bulk items
    if (name === "inventory_uuid" && value) {
      await loadInventoryBulks(value);
    }
  };

  const handleWarehouseChange = async (warehouseUuid: string) => {
    const selectedWarehouse = warehouses.find(wh => wh.uuid === warehouseUuid);
    if (selectedWarehouse) {
      // Fetch warehouse layout
      const warehouseLayout = selectedWarehouse.warehouse_layout!;
      setFloorConfigs(warehouseLayout);

      setFloorOptions(warehouseLayout.map((layout: any) => layout.floor));

      // Fetch occupied shelf locations
      const occupiedResult = await getOccupiedShelfLocations(selectedWarehouse.uuid);
      if (occupiedResult.success) {
        setOccupiedLocations(occupiedResult.data || []);
      }

    } else {
      resetWarehouseLocation();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Update form submission to remove assignOperator check
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Only allow admins to submit form changes
    if (!user?.is_admin) {
      return;
    }

    const newErrors: Record<string, string> = {};
    if (!formData.inventory_uuid) newErrors.inventory_uuid = "Please select an inventory item";
    if (!formData.inventory_item_bulk_uuids || formData.inventory_item_bulk_uuids.length === 0) {
      newErrors.inventory_item_bulk_uuids = "Please select at least one bulk item";
    }
    if (!formData.delivery_address) newErrors.delivery_address = "Delivery address is required";
    if (!formData.delivery_date) newErrors.delivery_date = "Delivery date is required";
    if (!formData.warehouse_uuid) newErrors.warehouse_uuid = "Please select a warehouse";

    // Check if each selected bulk has a location assigned
    if (formData.inventory_item_bulk_uuids &&
      formData.inventory_item_bulk_uuids.length > 0 &&
      (!formData.locations || formData.locations.length !== formData.inventory_item_bulk_uuids.length)) {
      newErrors.locations = "Please assign a location for each selected bulk item";
    }

    console.log("Form Data:", formData);

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      let result;
      const timestamp = new Date().toISOString();
      let newData: any = {
        admin_uuid: user.uuid,
        company_uuid: user.company_uuid,
        inventory_uuid: formData.inventory_uuid ? formData.inventory_uuid : null,
        inventory_item_bulk_uuids: formData.inventory_item_bulk_uuids,
        warehouse_uuid: formData.warehouse_uuid ? formData.warehouse_uuid : null,
        delivery_address: formData.delivery_address || "",
        delivery_date: formData.delivery_date || "",
        locations: formData.locations || [],
        location_codes: formData.location_codes || [],
        notes: formData.notes || "",
        // Include operator_uuids if any operators are selected
        ...(formData.operator_uuids && formData.operator_uuids.length > 0 ? {
          operator_uuids: formData.operator_uuids
        } : {}),
      };

      if (selectedDeliveryId) {
        // Update existing delivery
        result = await updateDeliveryItem(selectedDeliveryId, newData);

        // Update inventory item and bulk statuses to match delivery status
        if (result.success && formData.status) {
          // Set inventory status to ON_DELIVERY when delivery status is IN_TRANSIT
          const inventoryStatus = formData.status === "IN_TRANSIT" ? "ON_DELIVERY" : formData.status;
          await updateInventoryItemStatus(formData.inventory_uuid as string, inventoryStatus);

          // Update bulk statuses if they're selected
          if (formData.inventory_item_bulk_uuids && formData.inventory_item_bulk_uuids.length > 0) {
            await updateInventoryItemBulksStatus(formData.inventory_item_bulk_uuids, inventoryStatus);
          }
        }
      } else {
        // Create new delivery
        newData = {
          ...newData,
          status: formData.status || "PENDING",
          status_history: {
            ...formData.status_history
          }
        };

        result = await createDeliveryItem(newData as any);

        console.log("Updating inventory item status:", result.data);
        // Update inventory item status to match delivery status
        if (result.success && formData.inventory_uuid && formData.status) {
          // Set inventory status to ON_DELIVERY when delivery status is IN_TRANSIT
          console.log(await updateInventoryItemStatus(formData.inventory_uuid, "PENDING"));

          // Update bulk statuses if they're selected
          if (formData.inventory_item_bulk_uuids && formData.inventory_item_bulk_uuids.length > 0) {
            console.log(await updateInventoryItemBulksStatus(formData.inventory_item_bulk_uuids, "PENDING"));
          }
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

  /* 3D Shelf Selector */

  const handleShelfSelection = (location: any) => {
    const floorNumber = location.floor || 0;
    const columnNumber = location.column || 0;
    const columnCode = String.fromCharCode(65 + (columnNumber || 0));
    const rowNumber = location.row || 0;
    const groupNumber = location.group || 0;
    const depthNumber = location.depth || 0;

    // Update temporary selections with numerical values
    setTempSelectedFloor(floorNumber);
    setTempSelectedColumn(columnNumber);
    setTempSelectedColumnCode(columnCode);
    setTempSelectedRow(rowNumber);
    setTempSelectedGroup(groupNumber);
    setTempSelectedDepth(depthNumber);

    // Use formatCode for consistent code formatting
    setTempSelectedCode(formatCode(location));

    // Set the highlighted floor
    setHighlightedFloor(location.floor || 0);

    // Update maximum values if available
    if (location.max_group !== undefined) setMaxGroupId(location.max_group);
    if (location.max_row !== undefined) setMaxRow(location.max_row);
    if (location.max_column !== undefined) setMaxColumn(location.max_column);
    if (location.max_depth !== undefined) setMaxDepth(location.max_depth);

    // Check if location is occupied
    setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
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
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0
      };
      setExternalSelection(location);

      // Use formatCode for consistent formatting
      setTempSelectedCode(formatCode(location));

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
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0
      };
      setExternalSelection(location);

      setTempSelectedCode(formatCode(location));
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
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0
      };
      setExternalSelection(location);

      setTempSelectedCode(formatCode(location));
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
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0
      };
      setExternalSelection(location);

      setTempSelectedCode(formatCode(location));
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
        depth: adjustedDepth
      };
      setExternalSelection(location);

      setTempSelectedCode(formatCode(location));
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
        depth: selectedDepth
      };

      setExternalSelection(location);
      setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
    } else {
      setExternalSelection(undefined);
    }

    onOpen();
  };

  const handleConfirmLocation = () => {
    // Create the location object
    const location = {
      floor: tempSelectedFloor,
      column: tempSelectedColumn,
      row: tempSelectedRow,
      group: tempSelectedGroup,
      depth: tempSelectedDepth || 0
    };

    // Update the locations array
    const newLocations = [...locations];
    newLocations[currentBulkLocationIndex] = location;
    setLocations(newLocations);

    // Update the location codes array
    const newLocationCodes = [...locationCodes];
    newLocationCodes[currentBulkLocationIndex] = tempSelectedCode;
    setLocationCodes(newLocationCodes);

    // Update formData
    setFormData(prev => ({
      ...prev,
      locations: newLocations,
      location_codes: newLocationCodes
    }));

    // Update local state for the selected location
    setSelectedFloor(tempSelectedFloor);
    setSelectedColumn(tempSelectedColumn);
    setSelectedColumnCode(tempSelectedColumnCode);
    setSelectedRow(tempSelectedRow);
    setSelectedGroup(tempSelectedGroup);
    setSelectedDepth(tempSelectedDepth);
    setSelectedCode(tempSelectedCode);

    onClose();
  };

  const handleCancelLocation = () => {
    setTempSelectedFloor(selectedFloor);
    setTempSelectedColumn(selectedColumn);
    setTempSelectedColumnCode(selectedColumnCode);
    setTempSelectedRow(selectedRow);
    setTempSelectedDepth(selectedDepth);
    setTempSelectedGroup(selectedGroup);
    setTempSelectedCode(selectedCode);
    onClose();
  };

  /* QR Code Image Upload and Scanning */

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
      if (matchingDelivery.operator_uuids?.includes(user?.uuid) ||
        matchingDelivery.operator_uuids === null ||
        matchingDelivery.operator_uuids?.length === 0) {
        // Set as the selected delivery
        handleSelectDelivery(matchingDelivery.uuid);

        // Update the form data with the delivery details
        setFormData({ ...matchingDelivery, status: "DELIVERED" });

        // Directly update the delivery status without using handleStatusChange
        const currentTimestamp = new Date().toISOString();
        const updatedStatusHistory = {
          ...(matchingDelivery.status_history || {}),
          [currentTimestamp]: "DELIVERED"
        };

        const updatedFormData = {
          status: "DELIVERED",
          status_history: updatedStatusHistory
        };
        const result = await updateDeliveryItem(matchingDelivery.uuid, updatedFormData);

        if (result.success && matchingDelivery.inventory_uuid) {
          // Change status to IN_WAREHOUSE when delivery status is DELIVERED
          console.log("Updating inventory item status to IN_WAREHOUSE");

          // const inventoryResult = await updateInventoryItemStatus(
          //   matchingDelivery.inventory_uuid,
          //   "IN_WAREHOUSE"
          // );

          // if (inventoryResult.success) {
          // Create warehouse inventory item records if location data is present
          if (matchingDelivery.locations?.length > 0 &&
            matchingDelivery.location_codes?.length > 0 &&
            matchingDelivery.inventory_item_bulk_uuids?.length > 0) {

            try {
              // Prepare items data for warehouse creation
              const { data: warehouseResult, error: wwarehouseError } = await createWarehouseInventoryItems(
                matchingDelivery.inventory_uuid as string,
                matchingDelivery.warehouse_uuid as string,
                matchingDelivery.uuid,
                matchingDelivery.inventory_item_bulk_uuids,
                matchingDelivery.locations,
                matchingDelivery.location_codes || []
              );

              // Update status of the inventory item bulks
              await updateInventoryItemBulksStatus(matchingDelivery.inventory_item_bulk_uuids, "IN_WAREHOUSE");

              setJsonValidationSuccess(true);

              // Wait for a moment before closing the modal
              setTimeout(() => {
                setShowAcceptDeliveryModal(false);
                setJsonValidationSuccess(false);
                setDeliveryJson("");
              }, 1000);

              // Refresh delivery items to show updated status
              const refreshedItems = await getDeliveryItems(user?.company_uuid);
              setDeliveryItems(refreshedItems.data || []);
            } catch (error) {
              console.error("Error creating warehouse inventory items:", error);
              setJsonValidationError("Delivery accepted but failed to create warehouse items");
            }
          } else {
            console.warn("Delivery marked as DELIVERED but missing location or bulk data");
            setJsonValidationError("Missing location data for delivery - please contact admin");
          }
          // } else {
          //   console.error("Failed to update inventory status:", inventoryResult.error);
          //   setJsonValidationError("Delivery accepted but failed to update inventory status");
          // }
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

  // Add this useEffect to focus on the textarea when modal opens
  useEffect(() => {
    if (showAcceptDeliveryModal && deliveryJsonTextareaRef.current) {
      // Short timeout to ensure the modal is rendered before focusing
      setTimeout(() => {
        deliveryJsonTextareaRef.current?.focus();
      }, 100);
    }
  }, [showAcceptDeliveryModal]);


  // Update the useEffect for URL params to remove assignOperator references
  useEffect(() => {
    if (!user?.company_uuid || isLoadingItems) return;

    const deliveryId = searchParams.get("deliveryId");
    const setInventoryId = searchParams.get("setInventory");

    if (deliveryId) {
      // Set selected delivery from URL
      setSelectedDeliveryId(deliveryId);

      const delivery = deliveryItems.find(d => d.uuid === deliveryId);
      if (!delivery) return;

      console.log("Selected Delivery:", delivery);

      setFormData(delivery);
      setSelectedItem(delivery.inventory_uuid || "");

      if (delivery.inventory_uuid) {
        loadInventoryBulks(delivery.inventory_uuid, true);

        if (delivery.inventory_item_bulk_uuids && delivery.inventory_item_bulk_uuids.length > 0) {
          setSelectedBulks(delivery.inventory_item_bulk_uuids);
          setPrevSelectedBulks(delivery.inventory_item_bulk_uuids);
        }
      }

      if (delivery.locations && delivery.locations.length > 0) {
        setLocations(delivery.locations);

        const firstLoc = delivery.locations[0];
        setSelectedFloor(firstLoc.floor);
        setSelectedColumnCode(parseColumn(firstLoc.column) || "");
        setSelectedColumn(firstLoc.column);
        setSelectedRow(firstLoc.row);
        setSelectedDepth(firstLoc.depth || 0);
        setSelectedGroup(firstLoc.group);
      }

      if (delivery.location_codes && delivery.location_codes.length > 0) {
        setLocationCodes(delivery.location_codes);
        setSelectedCode(delivery.location_codes[0] || "");
      }

      handleWarehouseChange(delivery.warehouse_uuid || "");

      // Set selected operators if any are assigned
      if (delivery.operator_uuids && delivery.operator_uuids.length > 0) {
        const assignedOperators = operators.filter(op => delivery.operator_uuids?.includes(op.uuid));
        setSelectedOperators(assignedOperators);
      } else {
        setSelectedOperators([]);
      }

    } else if (setInventoryId) {
      // First check if there's already a delivery for this inventory item
      const existingDelivery = deliveryItems.find(item => item.inventory_uuid === setInventoryId);

      if (existingDelivery) {
        // If delivery exists for this inventory item, select it
        setSelectedDeliveryId(existingDelivery.uuid);
        setFormData({ ...existingDelivery });
        setSelectedItem(existingDelivery.inventory_uuid || "");

        // Load bulk items and set selected bulks
        if (existingDelivery.inventory_uuid) {
          loadInventoryBulks(existingDelivery.inventory_uuid);

          if (existingDelivery.inventory_item_bulk_uuids && existingDelivery.inventory_item_bulk_uuids.length > 0) {
            setSelectedBulks(existingDelivery.inventory_item_bulk_uuids);
            setPrevSelectedBulks(existingDelivery.inventory_item_bulk_uuids);
          }
        }

        // Set locations
        if (existingDelivery.locations && existingDelivery.locations.length > 0) {
          setLocations(existingDelivery.locations);
          setLocationCodes(existingDelivery.location_codes || []);
        }

        // Check if there are operators assigned
        const hasOperators = !!existingDelivery.operator_uuids && existingDelivery.operator_uuids.length > 0;
        setAssignOperator(hasOperators);

        if (hasOperators && existingDelivery.operator_uuids && existingDelivery.operator_uuids.length > 0) {
          const assignedOperators = operators.filter(op => existingDelivery.operator_uuids?.includes(op.uuid));
          setSelectedOperators(assignedOperators);
        } else {
          setSelectedOperators([]);
        }

        // Update URL with the found delivery ID
        const params = new URLSearchParams(searchParams.toString());
        params.delete("setInventory");
        params.set("deliveryId", existingDelivery.uuid);
        router.push(`?${params.toString()}`, { scroll: false });

        resetWarehouseLocation();
        handleWarehouseChange(existingDelivery.warehouse_uuid || "");
      } else {
        // Creating a new delivery with pre-selected inventory item
        setSelectedDeliveryId(null);

        // Find the inventory item
        const inventoryItem = inventoryItems.find(item => item.uuid === setInventoryId);
        if (!inventoryItem) {
          setIsLoading(false);
          return;
        }

        // Set up the form with the selected inventory item
        setFormData({
          company_uuid: user.company_uuid,
          admin_uuid: user.uuid,
          inventory_uuid: setInventoryId,
          inventory_item_bulk_uuids: [],
          delivery_address: "",
          delivery_date: today(getLocalTimeZone()).toString(),
          notes: "",
          status: "PENDING",
          locations: [],
          location_codes: [],
          warehouse_uuid: null
        });

        setSelectedItem(setInventoryId);
        setAssignOperator(false);
        setSelectedOperator(null);

        // Load bulk items for this inventory item
        loadInventoryBulks(setInventoryId);

        resetWarehouseLocation();
      }
    } else {
      // Reset form for new delivery
      setSelectedDeliveryId(null);
      setFormData({
        company_uuid: user.company_uuid,
        admin_uuid: user.uuid,
        inventory_uuid: null,
        inventory_item_bulk_uuids: [],
        delivery_address: "",
        delivery_date: format(new Date(), "yyyy-MM-dd"),
        locations: [],
        location_codes: [],
        notes: "",
        status: "PENDING",
        warehouse_uuid: null
      });
      setSelectedItem("");
      setSelectedBulks([]);
      setLocations([]);
      setLocationCodes([]);
      setSelectedOperators([]);
      setDeliveryJson("");

      resetWarehouseLocation();
    }

    setIsLoading(false);

  }, [searchParams, user?.company_uuid, isLoadingItems, deliveryItems, inventoryItems, operators, loadInventoryBulks]);

  // Initialize page data
  useEffect(() => {
    const initPage = async () => {
      setIsLoadingWarehouses(true);

      try {
        const userData = await getUserFromCookies();
        if (userData === null) {
          setError('User not found');
          return;
        }

        setUser(userData);

        setFormData(prev => ({
          ...prev,
          admin_uuid: userData.uuid,
          company_uuid: userData.company_uuid,
        }));

        // Fetch initial delivery items
        const deliveriesResult = await getDeliveryItems(
          userData.company_uuid,
          "", // search
          null, // status
          null, // warehouse
          null, // operator
          null, // inventory
          null, // dateFrom
          null, // dateTo
          null, // year
          null, // month
          null, // week
          null, // day
          rowsPerPage, // limit
          0 // offset for first page
        );
        setDeliveryItems(deliveriesResult.data || []);
        setTotalPages(deliveriesResult.totalPages || 1);
        setTotalDeliveries(deliveriesResult.totalCount || 0);

        // Fetch available inventory items
        const inventoryResult = await getInventoryItems(userData.company_uuid);
        setInventoryItems(inventoryResult.data || []);

        // Fetch operators (users with isAdmin = false)
        const operatorsResult = await getOperators(userData.company_uuid);
        setOperators(operatorsResult.data || []);

        // Fetch warehouses
        const warehousesResult = await getWarehouses(userData.company_uuid);
        setWarehouses(warehousesResult.data || []);
        setIsLoadingWarehouses(false);

        setIsLoadingItems(false);
      } catch (error) {
        console.error("Error initializing page:", error);
      }
    };

    initPage();
  }, []);


  // Update useEffect with real-time subscription to include filter parameters
  useEffect(() => {
    if (!user?.company_uuid) return;

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
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async (payload) => {
          console.log('Real-time delivery update received:', payload);

          // Refresh delivery items with filters and pagination
          const refreshedItems = await getDeliveryItems(
            user.company_uuid,
            searchQuery,
            statusFilter,
            warehouseFilter,
            null, // operatorUuid
            null, // inventoryUuid
            null, // dateFrom
            null, // dateTo
            null, // year
            null, // month
            null, // week
            null, // day
            rowsPerPage, // limit
            (page - 1) * rowsPerPage // offset
          );

          setDeliveryItems(refreshedItems.data || []);
          setTotalPages(refreshedItems.totalPages || 1);
          setTotalDeliveries(refreshedItems.totalCount || 0);
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
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async (payload) => {
          console.log('Real-time inventory update received:', payload);

          // Refresh inventory items
          const refreshedItems = await getInventoryItems(user.company_uuid);
          setInventoryItems(refreshedItems.data || []);

          // If we have a selected item, refresh its bulks
          if (selectedItem) {
            loadInventoryBulks(selectedItem);
          }
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(deliveryChannel);
      supabase.removeChannel(inventoryChannel);
    };
  }, [user?.company_uuid, searchQuery, statusFilter, warehouseFilter, selectedItem, loadInventoryBulks]);


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

      // Create the location object for current bulk
      const location = {
        floor: selectedFloor,
        group: selectedGroup,
        row: selectedRow,
        column: selectedColumn !== null ? selectedColumn : 0,
        depth: selectedDepth !== null ? selectedDepth : 0
      };

      // Create new locations and location codes arrays if needed
      const newLocations = [...locations];
      const newLocationCodes = [...locationCodes];

      // Update for current bulk
      if (currentBulkLocationIndex < newLocations.length) {
        newLocations[currentBulkLocationIndex] = location;
        newLocationCodes[currentBulkLocationIndex] = selectedCode || "";
      } else {
        newLocations.push(location);
        newLocationCodes.push(selectedCode || "");
      }

      // Update form data
      setFormData(prev => ({
        ...prev,
        locations: newLocations,
        location_codes: newLocationCodes
      }));

      // Update local state
      setLocations(newLocations);
      setLocationCodes(newLocationCodes);
    }
  }, [selectedFloor, selectedColumn, selectedRow, selectedGroup, selectedDepth, formData.status, currentBulkLocationIndex, locations, locationCodes, selectedCode, selectedDeliveryId]);

  return (
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
              isDisabled={isLoading || isLoadingItems || isLoadingBulks}>
              New Delivery
            </Button>
          ) : selectedDeliveryId ? (
            <Button color="primary" variant="shadow" onPress={() => setShowAcceptDeliveryModal(true)}
              startContent={<Icon icon="mdi:qrcode-scan" />}
              isDisabled={isLoading || isLoadingItems}>
              Accept Delivery
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col xl:flex-row gap-4">
        {/* Left side: Delivery List */}
        <div className={`xl:w-1/3 shadow-xl shadow-primary/10 xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}>
          <div className="flex flex-col h-full">
            <div className="p-4 sticky top-0 z-20 bg-background/80 border-b border-default-200 backdrop-blur-lg shadow-sm">

              <LoadingAnimation
                condition={!user || isLoadingWarehouses}
                skeleton={
                  <>
                    {/* Heading skeleton */}
                    <Skeleton className="h-[1.75rem] w-48 mx-auto mb-4 rounded-full" />

                    <div className="space-y-4">
                      {/* Search input skeleton */}
                      <Skeleton className="h-10 w-full rounded-xl" />

                      {/* Filter controls skeleton */}
                      <ScrollShadow orientation="horizontal" className="flex-1" hideScrollBar>
                        <div className="flex flex-row gap-2 items-center">
                          {/* Filter button skeleton */}
                          <Skeleton className="h-10 w-24 rounded-xl flex-none" />

                          {/* Filter chips area skeleton */}
                          <Skeleton className="h-8 w-32 rounded-full flex-none" />
                          <Skeleton className="h-8 w-36 rounded-full flex-none" />
                          <Skeleton className="h-8 w-24 rounded-full flex-none" />
                        </div>
                      </ScrollShadow>
                    </div>
                  </>
                }>

                <h2 className="text-xl font-semibold mb-4 w-full text-center">Delivery Items</h2>
                <Input
                  placeholder="Search deliveries..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  isClearable
                  onClear={() => handleSearch("")}
                  startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
                />
                <div className="flex items-center gap-2 mt-4">
                  <ScrollShadow orientation="horizontal" className="flex-1 overflow-x-auto" hideScrollBar>
                    <div className="inline-flex items-center gap-2">
                      <Popover
                        isOpen={isFilterOpen}
                        onOpenChange={setIsFilterOpen}
                        classNames={{ content: "!backdrop-blur-lg bg-background/65" }}
                        motionProps={popoverTransition()}
                        placement="bottom-start">
                        <PopoverTrigger>
                          <Button
                            variant="flat"
                            color="default"
                            className="w-24 h-10 rounded-lg !outline-none rounded-xl"
                            startContent={<Icon icon="mdi:filter-variant" className="text-default-500" />}
                          >
                            Filters
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-4 w-80 p-0 overflow-hidden">
                          <div>
                            <div className="space-y-4 p-4">
                              <h3 className="text-lg font-semibold items-center w-full text-center">
                                Filter Options
                              </h3>

                              {/* Warehouse filter */}
                              <Autocomplete
                                name="warehouse_filter"
                                label="Filter by Warehouse"
                                placeholder="All Warehouses"
                                selectedKey={warehouseFilter || ""}
                                onSelectionChange={(key) => handleWarehouseFilterChange(key as string || null)}
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

                              {/* Status filter */}
                              <Autocomplete
                                name="status_filter"
                                label="Filter by Status"
                                placeholder="All Statuses"
                                selectedKey={statusFilter || ""}
                                onSelectionChange={(key) => handleStatusFilterChange(key as string || null)}
                                startContent={<Icon icon="mdi:filter-variant" className="text-default-500 mb-[0.2rem]" />}
                                inputProps={autoCompleteStyle}
                              >
                                <AutocompleteItem key="">All Statuses</AutocompleteItem>
                                <AutocompleteItem key="PENDING">Pending</AutocompleteItem>
                                <AutocompleteItem key="PROCESSING">Processing</AutocompleteItem>
                                <AutocompleteItem key="IN_TRANSIT">In Transit</AutocompleteItem>
                                <AutocompleteItem key="DELIVERED">Delivered</AutocompleteItem>
                                <AutocompleteItem key="CANCELLED">Cancelled</AutocompleteItem>
                              </Autocomplete>

                              {/* Operator filter */}
                              <Autocomplete
                                name="operator_filter"
                                label="Filter by Operator"
                                placeholder="All Operators"
                                selectedKey={operatorFilter}
                                onSelectionChange={(key) => {
                                  handleOperatorFilterChange(key as string || null);
                                }}
                                startContent={<Icon icon="mdi:account" className="text-default-500 mb-[0.2rem]" />}
                                inputProps={autoCompleteStyle}
                              >
                                {[
                                  (<AutocompleteItem key="">All Operators</AutocompleteItem>),
                                  ...operators.map((operator) => (
                                    <AutocompleteItem key={operator.uuid}>
                                      {operator.full_name}
                                    </AutocompleteItem>
                                  ))]}
                              </Autocomplete>
                            </div>

                            <div className="p-4 border-t border-default-200 flex justify-end gap-2 bg-default-100/50">
                              <Button
                                size="sm"
                                variant="flat"
                                onPress={() => setIsFilterOpen(false)}
                              >
                                Close
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>

                      {/* Display selected filters as chips */}
                      {warehouseFilter && (
                        <Chip
                          variant="flat"
                          color="primary"
                          onClose={() => handleWarehouseFilterChange(null)}
                          size="sm"
                          className="h-8 p-2"
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:warehouse" className="text-xs" />
                            {warehouses.find(w => w.uuid === warehouseFilter)?.name || 'Unknown Warehouse'}
                          </div>
                        </Chip>
                      )}

                      {statusFilter && (
                        <Chip
                          variant="flat"
                          color={getStatusColor(statusFilter)}
                          onClose={() => handleStatusFilterChange(null)}
                          size="sm"
                          className="h-8 p-2"
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:filter-variant" className="text-xs" />
                            {statusFilter.replaceAll('_', ' ')}
                          </div>
                        </Chip>
                      )}

                      {(warehouseFilter || statusFilter) && (
                        <Button
                          size="sm"
                          variant="light"
                          className="rounded-lg"
                          onPress={() => {
                            handleWarehouseFilterChange(null);
                            handleStatusFilterChange(null);
                          }}
                        >
                          Clear all
                        </Button>
                      )}
                    </div>
                  </ScrollShadow>
                </div>
              </LoadingAnimation>

            </div>


            <div className="h-full absolute w-full">
              <div className={`space-y-4 p-4 mt-1 pt-[11.5rem] h-full relative ${(user && !isLoadingItems) && "overflow-y-auto"}`}>
                <ListLoadingAnimation
                  condition={!user || isLoadingItems}
                  containerClassName="space-y-4"
                  skeleton={[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="w-full min-h-[7.5rem] rounded-xl" />
                  ))}>
                  {deliveryItems.map((delivery) => (
                    <Button
                      key={delivery.uuid}
                      onPress={() => handleSelectDelivery(delivery.uuid)}
                      variant="shadow"
                      className={`w-full min-h-[7.5rem] !transition-all duration-200 rounded-xl p-0 ${selectedDeliveryId === delivery.uuid ? '!bg-primary hover:!bg-primary-400 !shadow-lg hover:!shadow-md hover:!shadow-primary-200 !shadow-primary-200' : '!bg-default-100/50 shadow-none hover:!bg-default-200 !shadow-2xs hover:!shadow-md hover:!shadow-default-200 !shadow-default-200'}`}
                    >
                      <div className="w-full flex flex-col h-full">
                        <div className="flex-grow flex flex-col justify-center px-3">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">
                              {inventoryItems.find(i => i.uuid === delivery.inventory_uuid)?.name || 'Unknown Item'}
                            </span>
                            <Chip color="default" variant={selectedDeliveryId === delivery.uuid ? "shadow" : "flat"} size="sm">
                              {delivery.inventory_item_bulk_uuids?.length || 0} bulks
                            </Chip>
                          </div>
                          {delivery.delivery_address && (
                            <div className={`w-full mt-1 text-sm ${selectedDeliveryId === delivery.uuid ? 'text-default-800 ' : 'text-default-600'} text-start text-ellipsis overflow-hidden whitespace-nowrap`}>
                              {delivery.delivery_address}
                            </div>
                          )}
                        </div>
                        {/* Footer - always at the bottom */}
                        <div className={`flex items-center gap-2 border-t ${selectedDeliveryId === delivery.uuid ? 'border-primary-300' : 'border-default-100'} p-3`}>
                          <Chip
                            color={selectedDeliveryId === delivery.uuid ? "default" : "primary"}
                            variant={selectedDeliveryId === delivery.uuid ? "shadow" : "flat"}
                            size="sm">
                            {formatDate(delivery.delivery_date)}
                          </Chip>
                          <Chip color={getStatusColor(delivery.status)} variant={selectedDeliveryId === delivery.uuid ? "shadow" : "flat"} size="sm">
                            {delivery.status.replaceAll('_', ' ')}
                          </Chip>
                          {delivery.operator_uuids && delivery.operator_uuids.length > 0 && (
                            <Chip color="success" variant={selectedDeliveryId === delivery.uuid ? "shadow" : "flat"} size="sm">
                              <div className="flex items-center gap-1">
                                <Icon icon="mdi:account" className="mb-[0.1rem]" />
                                {delivery.operator_uuids.length === 1
                                  ? operators.find(op => delivery.operator_uuids?.includes(op.uuid))?.full_name.split(' ')[0] || 'Operator'
                                  : `${delivery.operator_uuids.length} operators`
                                }
                              </div>
                            </Chip>
                          )}
                        </div>
                      </div>
                    </Button>
                  ))}
                </ListLoadingAnimation>
                {deliveryItems.length > 0 && (
                  <div className="flex flex-col items-center pt-2 pb-4 px-2">
                    <div className="text-sm text-default-500 mb-2">
                      Showing {(page - 1) * rowsPerPage + 1} to {Math.min(page * rowsPerPage, totalDeliveries)} of {totalDeliveries} {totalDeliveries === 1 ? 'delivery' : 'deliveries'}
                    </div>
                    <Pagination
                      total={totalPages}
                      initialPage={1}
                      page={page}
                      onChange={handlePageChange}
                      color="primary"
                      size="sm"
                      showControls
                    />
                  </div>
                )}
                <AnimatePresence>
                  {(!user || isLoadingItems) && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0, filter: "blur(8px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(8px)" }}
                      transition={{ duration: 0.3, delay: 0.3 }}
                    >
                      <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                      <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                        <Spinner />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <AnimatePresence>
                {user && !isLoadingItems && deliveryItems.length === 0 && (
                  <motion.div
                    className="xl:h-full h-[42rem] absolute w-full"
                    initial={{ opacity: 0, filter: "blur(8px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, filter: "blur(8px)" }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="py-4 flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                      <Icon icon="fluent:box-dismiss-20-filled" className="text-5xl text-default-300" />
                      <p className="text-default-500 mt-2">No deliveries found</p>
                      <Button color="primary" variant="light" size="sm" className="mt-4" onPress={handleNewDelivery}>
                        Create New Delivery
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>
        </div>

        {/* Right side: Delivery Form */}
        <div className="xl:w-2/3">
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
                          isRequired={isDeliveryProcessing() && (user === null || user.is_admin)}
                          isReadOnly={!isDeliveryProcessing() || !(user === null || user.is_admin)}
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
                          isRequired={isDeliveryProcessing() && (user === null || user.is_admin)}
                          isReadOnly={!isDeliveryProcessing() || !(user === null || user.is_admin)}
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
                      {isDeliveryProcessing() && (user === null || user.is_admin) && (
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

                              {/* Only show delete button if delivery is processing and user is admin */}
                              {isDeliveryProcessing() && (user === null || user.is_admin) && (
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
                          {isDeliveryProcessing() && (user === null || user.is_admin)
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
                            <Skeleton className="h-8 w-32 rounded-xl" />
                          </div>
                          <div className="space-y-4 p-4">
                            <div className="flex flex-row-reverse justify-between items-center mb-4">
                              <Skeleton className="h-4 w-24 rounded-xl" />
                              <div className="flex items-center gap-2">
                                <Skeleton className="h-5 w-5 rounded" />
                                <Skeleton className="h-4 w-16 rounded-xl" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              {[...Array(3)].map((_, i) => (
                                <div key={i} className="flex items-center justify-between p-3 border border-default-200 rounded-xl">
                                  <div className="flex items-center">
                                    <Skeleton className="h-5 w-5 rounded mr-2" />
                                    <div className="flex flex-col ml-2 space-y-1">
                                      <Skeleton className="h-5 w-24 rounded-xl" />
                                      <Skeleton className="h-3 w-32 rounded-xl" />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Skeleton className="h-6 w-20 rounded-xl" />
                                    <Skeleton className="h-8 w-24 rounded-xl" />
                                  </div>
                                </div>
                              ))}
                            </div>
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
                          // if (searchParams.get("setInventory")) {
                          //   const params = new URLSearchParams(searchParams.toString());
                          //   params.delete("setInventory");
                          //   router.push(`?${params.toString()}`, { scroll: false });
                          // }
                        }}
                        // disabledKeys={deliveryItems
                        //   .filter(item => item.status !== "AVAILABLE")
                        //   .map(item => item.inventory_uuid || "")}
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
                        {inventoryItems
                          .map((item) => (
                            <AutocompleteItem key={item.uuid}>
                              {item.name}
                            </AutocompleteItem>
                          ))}
                      </Autocomplete>

                      {/* Inventory Bulks Selection */}
                      {formData.inventory_uuid && (
                        <div className="border-2 border-default-200 rounded-xl bg-gradient-to-b from-background to-default-50/30">
                          <div className="flex justify-between items-center border-b border-default-200 p-4">
                            <h3 className="text-md font-medium">
                              {formData.status === "PENDING" ? "Select Bulk Items to Deliver" :
                                formData.status === "DELIVERED" ? "Bulk Items Delivered" : "Selected Bulk Items"}
                            </h3>
                            {formData.status === "DELIVERED" && (
                              <span className="text-sm text-default-600">
                                {selectedBulks.length} bulks
                              </span>
                            )}

                            {(isDeliveryProcessing() && user.is_admin) && (
                              <Button
                                size="sm"
                                color="primary"
                                variant="flat"
                                onPress={autoAssignShelfLocations}
                                isDisabled={selectedBulks.length === 0 || isWarehouseNotSet() || isFloorConfigNotSet() || !user.is_admin}
                                isLoading={isAutoAssigning}
                                startContent={!isAutoAssigning && <Icon icon="mdi:robot" className="text-sm" />}
                              >
                                Auto Assign Locations
                              </Button>
                            )}
                          </div>
                          <div className="space-y-4 p-2">


                            <div className="space-y-2">

                              {(isDeliveryProcessing() && user.is_admin) && (
                                <div className="flex flex-row-reverse justify-between items-center mb-2 p-2 pb-0">

                                  <span className="text-sm text-default-600">
                                    {selectedBulks.length} of {inventoryBulks.length} selected
                                  </span>
                                  <Checkbox
                                    isSelected={selectedBulks.length === inventoryBulks
                                      .filter(bulk => bulk.status === "AVAILABLE" || prevSelectedBulks.includes(bulk.uuid))
                                      .length && inventoryBulks.length > 0}
                                    isIndeterminate={selectedBulks.length > 0 && selectedBulks.length < inventoryBulks.length}
                                    onValueChange={(isSelected) => {
                                      // Select or deselect all bulks
                                      if (isSelected) {
                                        // Select all bulks
                                        const allBulkUuids = inventoryBulks
                                          .filter(bulk => bulk.status === "AVAILABLE" || prevSelectedBulks.includes(bulk.uuid))
                                          .map(bulk => bulk.uuid);
                                        setSelectedBulks(allBulkUuids);

                                        // Update form data with all bulk UUIDs
                                        setFormData(prev => ({
                                          ...prev,
                                          inventory_item_bulk_uuids: allBulkUuids
                                        }));
                                      } else {
                                        // Deselect all bulks
                                        setSelectedBulks([]);

                                        // Update form data to clear bulk UUIDs
                                        setFormData(prev => ({
                                          ...prev,
                                          inventory_item_bulk_uuids: []
                                        }));

                                        // Also clear locations data
                                        setLocations([]);
                                        setLocationCodes([]);
                                      }
                                    }}
                                    isDisabled={formData.status !== "PENDING" || !(user === null || user.is_admin) || inventoryBulks.length === 0}
                                  >
                                    Select All
                                  </Checkbox>
                                </div>
                              )}

                              <ScrollShadow
                                className="max-h-[40rem] overflow-y-auto overflow-x-hidden">
                                <div>
                                  {/* When not in PENDING status, only show selected bulks */}
                                  <ListLoadingAnimation
                                    delayContentReveal={400}
                                    containerClassName="space-y-2 p-2"
                                    condition={!user || isLoadingBulks}
                                    skeleton={[...Array(3)].map((_, i) => (
                                      <div key={i} className="flex items-center justify-between p-3 border border-default-200 rounded-xl">
                                        <div className="flex items-center">
                                          <Skeleton className="h-5 w-5 rounded mr-2" />
                                          <div className="flex flex-col ml-2 space-y-1">
                                            <Skeleton className="h-5 w-24 rounded-xl" />
                                            <Skeleton className="h-3 w-32 rounded-xl" />
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Skeleton className="h-6 w-20 rounded-xl" />
                                          <Skeleton className="h-8 w-24 rounded-xl" />
                                        </div>
                                      </div>
                                    ))}>

                                    {((formData.status === "PENDING" && user.is_admin) ? inventoryBulks : inventoryBulks.filter(bulk =>
                                      selectedBulks.includes(bulk.uuid)
                                    )).map((bulk, index) => (

                                      <div key={bulk.uuid}>
                                        <div className="flex items-center justify-between p-3 border border-default-200 rounded-xl">
                                          <div className="flex items-center">
                                            {(isDeliveryProcessing() && user.is_admin) && (
                                              <div className="flex items-center pr-2">
                                                <Checkbox
                                                  isSelected={selectedBulks.includes(bulk.uuid)}
                                                  onValueChange={(isSelected) => {
                                                    handleBulkSelectionToggle(bulk.uuid, isSelected);
                                                    // Update the form data
                                                    setFormData(prev => {
                                                      const newBulkUuids = isSelected
                                                        ? [...(prev.inventory_item_bulk_uuids || []), bulk.uuid]
                                                        : (prev.inventory_item_bulk_uuids || []).filter(uuid => uuid !== bulk.uuid);

                                                      return {
                                                        ...prev,
                                                        inventory_item_bulk_uuids: newBulkUuids
                                                      };
                                                    });
                                                  }}
                                                  isDisabled={formData.status !== "PENDING" || !(user === null || user.is_admin) || (bulk.status !== "AVAILABLE" && !prevSelectedBulks.includes(bulk.uuid))}
                                                >

                                                </Checkbox>
                                              </div>
                                            )}

                                            <Button
                                              className=" py-6 px-2 -m-2"
                                              variant='light'
                                              endContent={expandedBulkDetails.has(bulk.uuid) && bulkDetails.has(bulk.uuid) ?
                                                <Icon icon="mdi:chevron-up" className="text-default-500" width={18} /> :
                                                <Icon icon="mdi:chevron-down" className="text-default-500" width={18} />}
                                              onPress={() => handleBulkDetailsToggle(bulk.uuid, bulk.name)}
                                              isLoading={loadingBulkDetails.has(bulk.uuid)}
                                            >
                                              <div className="flex flex-0 flex-col items-start rounded-lg">
                                                <span className="font-medium">{bulk.name || `Bulk ${index + 1}`}</span>
                                                <div className="flex items-center gap-2">
                                                  <span className="text-xs text-default-500">
                                                    {bulk.bulk_unit ? `${bulk.unit_value} ${bulk.unit} (${bulk.bulk_unit})` : `${bulk.unit_value} ${bulk.unit}`}
                                                  </span>
                                                </div>
                                              </div>
                                            </Button>
                                          </div>



                                          <div className="flex items-center gap-2">
                                            {bulk.status && bulk.status !== "AVAILABLE" && !prevSelectedBulks.includes(bulk.uuid) && (
                                              <Chip color={bulk.status === "AVAILABLE" ? "success" : "danger"} variant="flat" size="sm">
                                                {bulk.status}
                                              </Chip>
                                            )}
                                            {selectedBulks.includes(bulk.uuid) && (
                                              <div className="flex items-center">
                                                <Chip
                                                  size="sm"
                                                  color={locationCodes[selectedBulks.indexOf(bulk.uuid)] ? "success" : "warning"}
                                                  variant="flat"
                                                  className="mr-2"
                                                >
                                                  {locationCodes[selectedBulks.indexOf(bulk.uuid)] || "No location"}
                                                </Chip>
                                                <Button
                                                  size="sm"
                                                  color="primary"
                                                  variant="flat"
                                                  onPress={() => handleAssignLocation(selectedBulks.indexOf(bulk.uuid))}
                                                  isDisabled={isWarehouseNotSet() || isFloorConfigNotSet()}
                                                >
                                                  {(formData.status === "DELIVERED" || formData.status === "CANCELLED" || !user.is_admin) ? "View Location" :
                                                    locationCodes[selectedBulks.indexOf(bulk.uuid)] ? "Change Location" : "Assign Location"}
                                                </Button>
                                              </div>
                                            )}
                                          </div>
                                        </div>




                                        {/* Bulk Details Expansion */}
                                        <AnimatePresence>
                                          {expandedBulkDetails.has(bulk.uuid) && bulkDetails.has(bulk.uuid) && (
                                            <motion.div {...motionTransition} className="mt-2">
                                              <div className="border border-default-200 rounded-xl bg-default-50/50">
                                                {(() => {
                                                  const details = bulkDetails.get(bulk.uuid);
                                                  if (!details) return null;

                                                  return (
                                                    <div className="p-4 space-y-4">
                                                      {/* Bulk Information */}
                                                      <div className="space-y-3">

                                                        <div className="flex items-center justify-between">
                                                          <h4 className="font-semibold text-lg">Bulk Information</h4>
                                                          <Button
                                                            variant="flat"
                                                            color="default"
                                                            size="sm"
                                                            isIconOnly
                                                            onPress={() => copyToClipboard(details.uuid)}
                                                          >
                                                            <Icon icon="mdi:content-copy" className="text-default-500" />
                                                          </Button>
                                                        </div>

                                                        <div className="grid grid-cols-1 gap-3 text-sm bg-default-50 p-3 rounded-xl border-2 border-default-200">
                                                          <div className="col-span-1">
                                                            <span className="text-default-500">Bulk ID:</span>
                                                            <span className="ml-2 font-mono text-xs">{details.uuid}</span>
                                                          </div>
                                                          <div className="grid grid-cols-2 gap-3">
                                                            <div>
                                                              <span className="text-default-500">Unit Value:</span>
                                                              <span className="ml-2">{formatNumber(details.unit_value)} {details.unit}</span>
                                                            </div>
                                                            <div>
                                                              <span className="text-default-500">Bulk Unit:</span>
                                                              <span className="ml-2">{details.bulk_unit}</span>
                                                            </div>
                                                            <div>
                                                              <span className="text-default-500">Total Cost:</span>
                                                              <span className="ml-2">₱{formatNumber(details.cost)}</span>
                                                            </div>
                                                            <div>
                                                              <span className="text-default-500">Type:</span>
                                                              <span className="ml-2">{details.is_single_item ? "Single Item" : "Multiple Units"}</span>
                                                            </div>
                                                          </div>
                                                          {/* Custom Properties */}
                                                          {details.properties && Object.keys(details.properties).length > 0 && (
                                                            <div className="p-3 bg-default-100 rounded-xl border-2 border-default-200">
                                                              <div className="flex items-center gap-2 mb-2">
                                                                <Icon icon="mdi:tag-multiple" className="text-default-500" width={16} />
                                                                <span className="text-sm font-medium">Bulk Properties</span>
                                                              </div>
                                                              <div className="grid grid-cols-2 gap-3 text-sm">
                                                                {Object.entries(details.properties).map(([key, value]) => (
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

                                                      {/* Units Section */}
                                                      {details.inventory_item_units && details.inventory_item_units.length > 0 && (
                                                        <div className="space-y-4 border-2 border-default-200 rounded-xl bg-default-50/50 p-4">
                                                          <div className="flex items-center justify-between">
                                                            <h4 className="font-semibold text-lg">Units in this Bulk</h4>
                                                            <Chip color="default" variant="flat" size="sm">
                                                              {details.inventory_item_units.length} unit{details.inventory_item_units.length > 1 ? 's' : ''}
                                                            </Chip>
                                                          </div>

                                                          <div className="space-y-3">
                                                            {details.inventory_item_units.map((unit, unitIndex) => (
                                                              <div key={unit.uuid} className="p-3 bg-default-50 rounded-xl border-2 space-y-3 border-default-200">
                                                                <div className="flex items-center justify-between mb-3">
                                                                  <div className="flex items-center gap-2">
                                                                    <Icon icon="mdi:cube-outline" className="text-default-500" width={16} />
                                                                    <span className="font-medium">
                                                                      {unit.name || `Unit ${unitIndex + 1}`}
                                                                    </span>
                                                                  </div>
                                                                  <div className="flex items-center gap-2">
                                                                    <Button
                                                                      variant="flat"
                                                                      color="default"
                                                                      size="sm"
                                                                      isIconOnly
                                                                      onPress={() => copyToClipboard(unit.uuid)}
                                                                    >
                                                                      <Icon icon="mdi:content-copy" className="text-default-500" />
                                                                    </Button>
                                                                  </div>
                                                                </div>
                                                                <div className="grid grid-cols-1 gap-3 text-sm">
                                                                  <div className="col-span-1">
                                                                    <span className="text-default-500">Unit ID:</span>
                                                                    <span className="ml-2 font-mono text-xs">{unit.uuid}</span>
                                                                  </div>
                                                                  <div className="grid grid-cols-2 gap-3">
                                                                    <div>
                                                                      <span className="text-default-500">Code:</span>
                                                                      <span className="ml-2 font-mono">{unit.code || 'N/A'}</span>
                                                                    </div>
                                                                    <div>
                                                                      <span className="text-default-500">Value:</span>
                                                                      <span className="ml-2">{formatNumber(unit.unit_value)} {unit.unit}</span>
                                                                    </div>
                                                                    <div>
                                                                      <span className="text-default-500">Cost:</span>
                                                                      <span className="ml-2">₱{formatNumber(unit.cost)}</span>
                                                                    </div>
                                                                    <div>
                                                                      <span className="text-default-500">Status:</span>
                                                                      <span className={`text-${unit.status === "AVAILABLE" ? "success" : "danger"}-500 ml-2`}>{(unit.status || 'N/A').replaceAll('_', ' ')}</span>
                                                                    </div>
                                                                  </div>
                                                                </div>

                                                                {/* Unit Properties */}
                                                                {unit.properties && Object.keys(unit.properties).length > 0 && (
                                                                  <div className="p-3 bg-default-100 rounded-xl border-2 border-default-200">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                      <Icon icon="mdi:tag" className="text-default-500" width={14} />
                                                                      <span className="text-sm font-medium">Unit Properties</span>
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                                                      {Object.entries(unit.properties).map(([key, value]) => (
                                                                        <div key={key}>
                                                                          <span className="text-default-500">{toTitleCase(toNormalCase(key))}:</span>
                                                                          <span className="ml-2">{String(value)}</span>
                                                                        </div>
                                                                      ))}
                                                                    </div>
                                                                  </div>
                                                                )}
                                                              </div>
                                                            ))}
                                                          </div>
                                                        </div>
                                                      )}

                                                      {/* No units message for single items */}
                                                      {(!details.inventory_item_units || details.inventory_item_units.length === 0) && details.is_single_item && (
                                                        <div className="p-4 text-center text-default-500 border border-dashed border-default-200 rounded-lg">
                                                          <Icon icon="mdi:information-outline" className="mx-auto mb-2" width={24} height={24} />
                                                          <p className="text-sm">This is a single item bulk with no individual units.</p>
                                                        </div>
                                                      )}
                                                    </div>
                                                  );
                                                })()}
                                              </div>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    ))}
                                  </ListLoadingAnimation>
                                </div>
                              </ScrollShadow>

                              {errors.inventory_item_bulk_uuids && (
                                <div className="text-danger text-sm mt-1">{errors.inventory_item_bulk_uuids}</div>
                              )}
                              {errors.locations && (
                                <div className="text-danger text-sm mt-1">{errors.locations}</div>
                              )}
                            </div>


                            <AnimatePresence>
                              {user && !isLoadingItems && deliveryItems.length === 0 && (
                                <motion.div
                                  className="xl:h-full h-[42rem] absolute w-full"
                                  initial={{ opacity: 0, filter: "blur(8px)" }}
                                  animate={{ opacity: 1, filter: "blur(0px)" }}
                                  exit={{ opacity: 0, filter: "blur(8px)" }}
                                  transition={{ duration: 0.3 }}
                                >
                                  <div className="flex items-center justify-center p-4 border-2 border-dashed border-default-300 rounded-xl">
                                    <p className="text-default-500">No bulk items available for this inventory item</p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>


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
                              {formData.status?.replaceAll('_', ' ') || "PENDING"}
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
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4">
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
                                  isDisabled={formData.status === "DELIVERED" || formData.status === "CANCELLED" || isLoading || isFloorConfigNotSet() || selectedBulks.length === 0 || locations.length < selectedBulks.length}
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
                        condition={!user || isLoading || isLoadingItems || isLoadingBulks}
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
                    onPress={() => setShowAcceptDeliveryModal(true)}
                  >
                    <Icon icon="mdi:qrcode-scan" className="mr-2" />
                    Accept Delivery
                  </Button>
                </div>
              </LoadingAnimation>
            </div>
          )
          }
        </div >
      </div >

      {/* QR Code Modal */}
      < Modal isOpen={showQrCode} onClose={() => setShowQrCode(false)
      } placement="auto" backdrop="blur" size="lg" classNames={{ backdrop: "bg-background/50" }}>
        <ModalContent>
          <ModalHeader>Delivery QR Code</ModalHeader>
          <ModalBody className="flex flex-col items-center">
            <div className="bg-white rounded-xl overflow-hidden">
              <QRCodeCanvas id="delivery-qrcode" value={generateDeliveryJson()} size={320} marginSize={4} level="L" />
            </div>
            <p className="text-center mt-4 text-default-600">
              Scan this code to get delivery details
            </p>
            <div className="mt-4 w-full bg-default-50 overflow-auto max-h-64 rounded-xl">
              <SyntaxHighlighter language="json" style={window.resolveTheme === 'dark' ? materialDark : materialLight} customStyle={{ margin: 0, borderRadius: '0.5rem', fontSize: '0.75rem' }}>
                {generateDeliveryJson(2)}
              </SyntaxHighlighter>
            </div>
          </ModalBody>
          <ModalFooter className="flex justify-end p-4 gap-4">
            <Button color="default" onPress={() => setShowQrCode(false)}>Close</Button>
            <Button color="primary" variant="shadow" onPress={() => {
              const canvas = document.getElementById('delivery-qrcode') as HTMLCanvasElement;
              const pngUrl = canvas.toDataURL('image/png');
              const downloadLink = document.createElement('a');
              downloadLink.href = pngUrl;
              downloadLink.download = `delivery-${user.full_name?.replace(/\s+/g, '-') || 'item'}-${new Date().toISOString()}.png`;
              document.body.appendChild(downloadLink);
              downloadLink.click();
              document.body.removeChild(downloadLink);
              setShowQrCode(false);
            }}>
              <Icon icon="mdi:download" className="mr-1" />
              Download QR
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal >

      {/* Accept Delivery Modal */}
      < Modal isOpen={showAcceptDeliveryModal} onClose={() => { setShowAcceptDeliveryModal(false); setDeliveryJson(""); setJsonValidationError(""); setJsonValidationSuccess(false); }} isDismissable={!isLoading && !isProcessingImage} placement="auto" backdrop="blur" size="lg" classNames={{ backdrop: "bg-background/50" }}>
        <ModalContent>
          <ModalHeader>Accept Delivery</ModalHeader>
          <ModalBody className="flex flex-col items-center">
            <div className="w-full space-y-4">
              <p className="text-default-700">
                Scan the delivery QR code or enter the delivery code provided by the user:
              </p>

              {/* QR Code Image Upload */}
              <div className="flex flex-col items-center w-full">
                <input type="file" accept="image/*" onChange={handleQrImageUpload} className="hidden" ref={fileInputRef} />
                <Button color="primary" variant="flat" className="w-full mb-4" onPress={() => fileInputRef.current?.click()}
                  startContent={<Icon icon="mdi:camera" />} isLoading={isProcessingImage} isDisabled={isLoading || jsonValidationSuccess}>
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
            <Button color="default" onPress={() => {
              setShowAcceptDeliveryModal(false);
              setDeliveryJson("");
              setJsonValidationError("");
              setJsonValidationSuccess(false);
            }} isDisabled={isLoading || isProcessingImage}>
              Cancel
            </Button>
            <Button {...isLoading ? {} : { startContent: <Icon icon="mdi:check" className="mr-1" /> }} color="primary" variant="shadow" onPress={(e) => handleDeliveryJsonValidation()} isLoading={isLoading || isProcessingImage}
              isDisabled={jsonValidationSuccess || isLoading || isProcessingImage || !deliveryJson.trim()}>
              Validate & Accept
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal >

      {/* Modal for the 3D shelf selector */}
      < Modal isOpen={isOpen} onClose={handleCancelLocation} placement='auto' classNames={{ backdrop: "bg-background/50", wrapper: 'overflow-hidden' }} backdrop="blur" size="5xl" >
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
                {tempSelectedCode && showControls &&
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
                {(tempSelectedCode || showControls) &&
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
                {tempSelectedCode &&
                  <motion.div {...motionTransition} className="absolute top-4 right-4 flex items-center gap-2 bg-background/50 rounded-2xl backdrop-blur-lg">
                    <span className="text-sm font-semibold p-4">CODE: <b>{tempSelectedCode}</b></span>
                  </motion.div>
                }
              </AnimatePresence>
            </div>
          </ModalBody>
          <ModalFooter className="flex justify-between gap-4 p-4">
            <Popover
              classNames={{ content: "!backdrop-blur-lg bg-background/65" }}
              motionProps={popoverTransition(false)}
              placement="bottom">
              <PopoverTrigger>
                <Button className="capitalize" color="warning" variant="flat">
                  <Icon icon="heroicons:question-mark-circle-solid" className="w-4 h-4 mr-1" />
                  Help
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-4 max-w-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Icon icon="heroicons:lifebuoy" className="w-5 h-5 text-warning-500" width={20} />
                  <h3 className="font-semibold text-lg">3D Navigation Controls</h3>
                </div>

                <Accordion variant="splitted">
                  <AccordionItem key="mouse" aria-label="Mouse Controls" title="Mouse Controls" className="text-sm overflow-hidden bg-primary-50">
                    <div className="space-y-2 pb-2">
                      <div className="flex items-start gap-2">
                        <Icon icon="heroicons:cursor-arrow-ripple" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                        <p><strong>Left Click</strong>: Select a shelf</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Icon icon="heroicons:hand-raised" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                        <p><strong>Click + Drag</strong>: Rotate camera around scene</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Icon icon="heroicons:cursor-arrow-rays" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                        <p><strong>Right Click + Drag</strong>: Pan camera</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Icon icon="heroicons:view-columns" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                        <p><strong>Mouse Wheel</strong>: Zoom in/out</p>
                      </div>
                    </div>
                  </AccordionItem>

                  <AccordionItem key="keyboard" aria-label="Keyboard Controls" title="Keyboard Controls" className="text-sm overflow-hidden bg-primary-50">
                    <div className="space-y-2 pb-2">
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300">W</Kbd>
                        <p className="my-auto">Move camera forward</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300">S</Kbd>
                        <p className="my-auto">Move camera backward</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300">A</Kbd>
                        <p className="my-auto">Move camera left</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300">D</Kbd>
                        <p className="my-auto">Move camera right</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['shift']}>W</Kbd>
                        <p className="my-auto">Move camera up</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['shift']}>S</Kbd>
                        <p className="my-auto">Move camera down</p>
                      </div>
                    </div>
                  </AccordionItem>

                  <AccordionItem key="shelf-navigation" aria-label="Shelf Navigation" title="Shelf Navigation" className="text-sm overflow-hidden bg-primary-50">
                    <div className="space-y-2 pb-2">
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['left']}></Kbd>
                        <p>Move to previous shelf or group</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['right']}></Kbd>
                        <p>Move to next shelf or group</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['up']}></Kbd>
                        <p>Move to shelf above</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['down']}></Kbd>
                        <p>Move to shelf below</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex">
                          <Kbd className="border border-default-300" keys={['shift']}></Kbd>
                          <span className="mx-1">+</span>
                          <Kbd className="border border-default-300" keys={['up', 'down', 'left', 'right']}></Kbd>
                        </div>
                        <p>Navigate between shelf groups</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex">
                          <Kbd className="border border-default-300" keys={['ctrl']}></Kbd>
                          <span className="mx-1">+</span>
                          <Kbd className="border border-default-300" keys={['up', 'down']}></Kbd>
                        </div>
                        <p>Navigate shelf depth (front/back)</p>
                      </div>
                    </div>
                  </AccordionItem>
                </Accordion>

                <div className="mt-4 border-t pt-3 border-default-200 w-full px-4">
                  <h4 className="font-medium mb-2">Color Legend:</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.floorColor }}></div>
                      <span className="text-xs">Floor</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.floorHighlightedColor }}></div>
                      <span className="text-xs">Selected Floor</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.groupColor }}></div>
                      <span className="text-xs">Group</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.groupSelectedColor }}></div>
                      <span className="text-xs">Selected Group</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.shelfColor }}></div>
                      <span className="text-xs">Shelf</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.shelfHoverColor }}></div>
                      <span className="text-xs">Hovered Shelf</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.shelfSelectedColor }}></div>
                      <span className="text-xs">Selected Shelf</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.occupiedShelfColor }}></div>
                      <span className="text-xs">Occupied Shelf</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-default-500">
                  Tip: Use WASD and arrow keys for easiest navigation through the warehouse.
                </div>
              </PopoverContent>
            </Popover>

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
  );
}