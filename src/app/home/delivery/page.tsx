"use client";

import { motionTransition, motionTransitionScale, popoverTransition } from '@/utils/anim';
import { createClient } from "@/utils/supabase/client";
import {
  Accordion, AccordionItem, Alert, Autocomplete, AutocompleteItem, Button, Checkbox,
  Chip, DatePicker,
  Form, Input, Kbd, Modal, ModalBody, ModalContent, ModalFooter,
  ModalHeader,
  Pagination, Popover, PopoverContent, PopoverTrigger,
  ScrollShadow, Skeleton, Spinner,
  Tabs, Tab,
  Textarea,
  useDisclosure,
  Card,
  CardFooter,
  CardBody,
  CardHeader,
  DateRangePicker,
  Switch,
  Select,
  SelectItem
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { getLocalTimeZone, parseDate, today } from '@internationalized/date';
import { format, parseISO } from "date-fns";
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from 'qrcode.react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ShelfLocation, ShelfSelectorColorAssignment } from '@/components/shelf-selector-3d';
import { formatCode, parseColumn } from '@/utils/floorplan';

// Import server actions
import CardList from '@/components/card-list';
import {
  createDeliveryItem,
  createWarehouseInventoryItems,
  DeliveryItem,
  getBulkDetails,
  getDeliveryItems,
  getInventoryItemBulks,
  getInventoryItems,
  getOccupiedShelfLocations,
  getOperators,
  getWarehouses,
  Operator,
  suggestShelfLocations,
  updateDeliveryItem,
  updateInventoryItemBulksStatus,
  updateInventoryItemStatus
} from "./actions";

// Import the QR code scanner library
import ListLoadingAnimation from '@/components/list-loading-animation';
import LoadingAnimation from '@/components/loading-animation';
import { getUserFromCookies } from '@/utils/supabase/server/user';
import { copyToClipboard, formatDate, formatNumber, toNormalCase, toTitleCase } from '@/utils/tools';
import jsQR from "jsqr";
import { Inventory, InventoryItem } from '../inventory/actions';
import { Warehouse } from '../warehouses/actions';

// Import at the top of your DeliveryPage component 
import { generatePdfBlob } from './pdf-document';
import { getUserCompanyDetails } from "@/utils/supabase/server/companies";
import CustomScrollbar from '@/components/custom-scrollbar';
import { FilterOption, SearchListPanel } from '@/components/search-list-panel/search-list-panel';

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
  const [inventoryItems, setInventoryItems] = useState<Inventory[]>([]);
  const [selectedItem, setSelectedItem] = useState<string>("");

  // Inventory bulk items
  const [inventoryBulks, setInventoryBulks] = useState<any[]>([]);
  const [selectedBulks, setSelectedBulks] = useState<string[]>([]);
  const [prevSelectedBulks, setPrevSelectedBulks] = useState<string[]>([]);
  const [isLoadingBulks, setIsLoadingBulks] = useState(false);

  // Bulk details state
  const [expandedBulkDetails, setExpandedBulkDetails] = useState<Set<string>>(new Set());
  const [bulkDetails, setBulkDetails] = useState<Map<string, InventoryItem & { inventory_item_units: InventoryItemUnit[] }>>(new Map());
  const [loadingBulkDetails, setLoadingBulkDetails] = useState<Set<string>>(new Set());


  // Location management
  const [currentBulkLocationIndex, setCurrentBulkLocationIndex] = useState<number>(0);
  const [locations, setLocations] = useState<any[]>([]);

  // Operator assignment
  const [operators, setOperators] = useState<Operator[]>([]);
  const [assignOperator, setAssignOperator] = useState<boolean>(false);
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);

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
  const [selectedDepth, setSelectedDepth] = useState<number | null>(null);
  const [selectedCode, setSelectedCode] = useState("");
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
  const isFloorChangeAnimate = true;
  const isShelfChangeAnimate = true;
  const isGroupChangeAnimate = false;
  const [isSelectedLocationOccupied, setIsSelectedLocationOccupied] = useState(false);
  const [externalSelection, setExternalSelection] = useState<ShelfLocation | undefined>(undefined);
  const [floorConfigs, setFloorConfigs] = useState<any[]>([]);

  // Create a state for shelf color assignments
  const [shelfColorAssignments, setShelfColorAssignments] = useState<Array<ShelfSelectorColorAssignment>>([]);
  const [showControls, setShowControls] = useState(false);

  // Add state for export options collapse
  const [isExportOptionsOpen, setIsExportOptionsOpen] = useState(false);

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

  // Add new state for tab management
  const [acceptDeliveryTab, setAcceptDeliveryTab] = useState("paste-link");
  const [availableDeliveries, setAvailableDeliveries] = useState<DeliveryItem[]>([]);
  const [isLoadingAvailableDeliveries, setIsLoadingAvailableDeliveries] = useState(false);

  // Add to the existing state declarations in the DeliveryPage component
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  // State for PDF export popover and filters
  const [pdfExportState, setPdfExportState] = useState({
    isPopoverOpen: false,
    selectedDeliveries: [] as string[],
    searchQuery: "",
    statusFilter: null as string | null,
    warehouseFilter: null as string | null,
    operatorFilter: null as string | null,
    inventoryFilter: null as string | null, // Add inventory filter
    dateFrom: null as any,
    dateTo: null as any,
    yearFilter: null as number | null,
    monthFilter: null as number | null,
    weekFilter: null as number | null,
    dayFilter: null as number | null,
    dateTabKey: "range" as string,
    // Add new options
    pageSize: "A4" as "A4" | "A3" | "LETTER" | "LEGAL",
    includeAutoAccept: false,
    includeShowOptions: true,
  });

  // Add state for export search filter open
  const [isExportSearchFilterOpen, setIsExportSearchFilterOpen] = useState(false);

  // Add comprehensive main list filter states
  const [mainFilterState, setMainFilterState] = useState({
    dateFrom: null as any,
    dateTo: null as any,
    yearFilter: null as number | null,
    monthFilter: null as number | null,
    weekFilter: null as number | null,
    dayFilter: null as number | null,
    dateTabKey: "range" as string,
    inventoryFilter: null as string | null,
  });

  // Add state for main search filter open
  const [isMainSearchFilterOpen, setIsMainSearchFilterOpen] = useState(false);

  // Add new state for QR code data with auto accept option
  const [qrCodeData, setQrCodeData] = useState<{
    url: string;
    title: string;
    description: string;
    deliveryId: string;
    deliveryName: string;
    autoAccept: boolean;
    showOptions: boolean; // Add this new property
  }>({
    url: "",
    title: "",
    description: "",
    deliveryId: "",
    deliveryName: "",
    autoAccept: false, // Change default to false
    showOptions: true  // Add this with default true
  });

  // Clear PDF export date filters
  const clearPdfDateFilters = () => {
    setPdfExportState(prev => ({
      ...prev,
      dateFrom: null,
      dateTo: null,
      yearFilter: null,
      monthFilter: null,
      weekFilter: null,
      dayFilter: null
    }));
  };


  // State for PDF export deliveries list
  const [pdfExportDeliveries, setPdfExportDeliveries] = useState<DeliveryItem[]>([]);
  const [isLoadingPdfDeliveries, setIsLoadingPdfDeliveries] = useState(false);


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

    setTempSelectedFloor(null);
    setTempSelectedColumn(null);
    setTempSelectedRow(null);
    setTempSelectedDepth(null);
    setTempSelectedGroup(null);
    setTempSelectedColumnCode("");
    setTempSelectedCode("");

    setLocations([]);
    setFloorConfigs([]);
    setFloorOptions([]);
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

  const checkIfLocationOccupied = (location: any) => {
    return occupiedLocations.some(
      loc =>
        loc.floor === location.floor &&
        loc.group === location.group &&
        loc.row === location.row &&
        loc.column === location.column &&
        loc.depth === location.depth &&
        loc.code === location.code
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
      return;
    }

    setIsLoadingBulks(true);
    try {

      const result = await getInventoryItemBulks(inventoryItemUuid, formData.status === "DELIVERED" || formData.status === "CANCELLED");
      if (result.success) {
        setInventoryBulks(result.data);

        // Reset selected bulks only when not preserving selection
        if (!preserveSelection) {
          setSelectedBulks([]);
          setPrevSelectedBulks([]);
          setLocations([]);
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
        const { locations } = result.data;

        // Update state with the suggested locations and codes
        setLocations(locations);

        // Update formData with the new locations
        setFormData(prev => ({
          ...prev,
          locations: locations
        }));

        // Select the first location in the 3D view
        if (locations.length > 0) {
          setCurrentBulkLocationIndex(0);
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
            depth: location.depth,
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
        depth: currentLocation.depth,
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

  // Add function to load available deliveries for acceptance
  const loadAvailableDeliveries = async () => {
    if (!user) return;

    setIsLoadingAvailableDeliveries(true);
    try {
      const result = await getDeliveryItems(
        user.company_uuid,
        "", // search
        "IN_TRANSIT", // only IN_TRANSIT deliveries
        null, // warehouse
        null, // operator
        null, // inventory
        null, // dateFrom
        null, // dateTo
        null, // year
        null, // month
        null, // week
        null, // day
        50, // limit - get more items for selection
        0 // offset
      );

      // Filter deliveries that the current user can accept
      const acceptableDeliveries = (result.data || []).filter((delivery: { operator_uuids: string | any[] | null; }) =>
        delivery.operator_uuids?.includes(user.uuid) ||
        delivery.operator_uuids === null ||
        delivery.operator_uuids?.length === 0
      );

      setAvailableDeliveries(acceptableDeliveries);
    } catch (error) {
      console.error("Error loading available deliveries:", error);
      setAvailableDeliveries([]);
    } finally {
      setIsLoadingAvailableDeliveries(false);
    }
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
      setSelectedDepth(location.depth);
      setSelectedColumnCode(parseColumn(location.column) || "");

      // Set external selection for the 3D viewer
      setExternalSelection(location);

      // Also set temp values for the modal
      setTempSelectedFloor(location.floor);
      setTempSelectedGroup(location.group);
      setTempSelectedRow(location.row);
      setTempSelectedColumn(location.column);
      setTempSelectedDepth(location.depth);
      setTempSelectedCode(location.code);
      setTempSelectedColumnCode(parseColumn(location.column) || "");
    } else {
      // Reset all shelf selection state if no location exists for this bulk
      setSelectedFloor(null);
      setSelectedGroup(null);
      setSelectedRow(null);
      setSelectedColumn(null);
      setSelectedDepth(null);
      setSelectedColumnCode("");

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

  // Update handleSearch to accept all filter parameters
  const handleSearch = async (query: string, status?: string | null, warehouse?: string | null, operator?: string | null, inventory?: string | null, dateFrom?: string | null, dateTo?: string | null, year?: number | null, month?: number | null, week?: number | null, day?: number | null, currentPage: number = page) => {
    setSearchQuery(query);

    try {
      setIsLoadingItems(true);

      // Use provided parameters or fall back to state values
      const statusToUse = status !== undefined ? status : statusFilter;
      const warehouseToUse = warehouse !== undefined ? warehouse : warehouseFilter;
      const operatorToUse = operator !== undefined ? operator : operatorFilter;
      const inventoryToUse = inventory !== undefined ? inventory : mainFilterState.inventoryFilter;

      // Use date parameters or fall back to state values
      const dateFromToUse = dateFrom !== undefined ? dateFrom :
        (mainFilterState.dateFrom ? new Date(mainFilterState.dateFrom.year, mainFilterState.dateFrom.month - 1, mainFilterState.dateFrom.day).toISOString().split('T')[0] : null);
      const dateToToUse = dateTo !== undefined ? dateTo :
        (mainFilterState.dateTo ? new Date(mainFilterState.dateTo.year, mainFilterState.dateTo.month - 1, mainFilterState.dateTo.day).toISOString().split('T')[0] : null);
      const yearToUse = year !== undefined ? year : mainFilterState.yearFilter;
      const monthToUse = month !== undefined ? month : mainFilterState.monthFilter;
      const weekToUse = week !== undefined ? week : mainFilterState.weekFilter;
      const dayToUse = day !== undefined ? day : mainFilterState.dayFilter;

      // Calculate offset based on current page and rows per page
      const offset = (currentPage - 1) * rowsPerPage;

      const result = await getDeliveryItems(
        user.company_uuid,
        query,
        statusToUse,
        warehouseToUse,
        operatorToUse ? [operatorToUse] : null,
        inventoryToUse,
        dateFromToUse,
        dateToToUse,
        yearToUse,
        monthToUse,
        weekToUse,
        dayToUse,
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

  // Function to generate QR PDF with new options
  const handleGenerateQrPdf = async (selectedDeliveryIds: string[]) => {
    setIsPdfGenerating(true);

    try {
      // Get selected deliveries
      const deliveriesToExport = selectedDeliveryIds.length > 0
        ? deliveryItems.filter(item => selectedDeliveryIds.includes(item.uuid))
        : (selectedDeliveryId
          ? [deliveryItems.find(item => item.uuid === selectedDeliveryId)!].filter(Boolean)
          : deliveryItems);

      // Prepare deliveries with QR URLs and warehouse names
      const preparedDeliveries = deliveriesToExport.map(delivery => {
        // Generate QR URL for each delivery with options
        const baseUrl = "https://ropic.vercel.app/home/search";
        const params = new URLSearchParams();


        params.set('q', delivery.uuid)

        if (pdfExportState.includeAutoAccept) {
          params.set('deliveryAutoAccept', 'true');
        }

        if (pdfExportState.includeShowOptions) {
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
        pageSize: pdfExportState.pageSize
      });

      // Create download link
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Delivery_QR_Codes_${pdfExportState.pageSize}_${new Date().toISOString().split('T')[0]}_${new Date().toTimeString().split(' ')[0].replace(/:/g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error generating delivery QR PDF:", error);
    } finally {
      setIsPdfGenerating(false);
    }
  };

  // Function to fetch filtered deliveries for PDF export
  const fetchPdfExportDeliveries = useCallback(async () => {
    if (!user?.company_uuid) return;

    setIsLoadingPdfDeliveries(true);
    try {
      // Convert date objects to strings if they exist
      const dateFromString = pdfExportState.dateFrom ?
        new Date(pdfExportState.dateFrom.year, pdfExportState.dateFrom.month - 1, pdfExportState.dateFrom.day).toISOString().split('T')[0] :
        undefined;
      const dateToString = pdfExportState.dateTo ?
        new Date(pdfExportState.dateTo.year, pdfExportState.dateTo.month - 1, pdfExportState.dateTo.day).toISOString().split('T')[0] :
        undefined;

      const result = await getDeliveryItems(
        user.company_uuid,
        pdfExportState.searchQuery,
        pdfExportState.statusFilter,
        pdfExportState.warehouseFilter,
        pdfExportState.operatorFilter ? [pdfExportState.operatorFilter] : null,
        pdfExportState.inventoryFilter,
        dateFromString,
        dateToString,
        pdfExportState.yearFilter,
        pdfExportState.monthFilter,
        pdfExportState.weekFilter,
        pdfExportState.dayFilter,
        1000, // Get more items for export
        0
      );

      setPdfExportDeliveries(result.data || []);
    } catch (error) {
      console.error("Error fetching PDF export deliveries:", error);
      setPdfExportDeliveries([]);
    } finally {
      setIsLoadingPdfDeliveries(false);
    }
  }, [user?.company_uuid, pdfExportState.warehouseFilter, pdfExportState.statusFilter, pdfExportState.searchQuery, pdfExportState.operatorFilter, pdfExportState.inventoryFilter, pdfExportState.dateFrom, pdfExportState.dateTo, pdfExportState.yearFilter, pdfExportState.monthFilter, pdfExportState.weekFilter, pdfExportState.dayFilter]);

  // Effect to fetch PDF export deliveries when popover opens
  useEffect(() => {
    if (pdfExportState.isPopoverOpen) {
      fetchPdfExportDeliveries();
    }
  }, [pdfExportState.isPopoverOpen, fetchPdfExportDeliveries]);

  // Add this function to handle PDF export delivery selection
  const handleTogglePdfDeliverySelection = (deliveryId: string) => {
    setPdfExportState(prev => {
      if (prev.selectedDeliveries.includes(deliveryId)) {
        return { ...prev, selectedDeliveries: prev.selectedDeliveries.filter(id => id !== deliveryId) };
      } else {
        return { ...prev, selectedDeliveries: [...prev.selectedDeliveries, deliveryId] };
      }
    });
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
    handleSearch(searchQuery, statusFilter, warehouseFilter, operatorFilter, mainFilterState.inventoryFilter, null, null, mainFilterState.yearFilter, mainFilterState.monthFilter, mainFilterState.weekFilter, mainFilterState.dayFilter, newPage);
  };

  // 4. Update filter handlers to reset pagination and include new filters
  const handleStatusFilterChange = (status: string | null) => {
    setStatusFilter(status);
    setPage(1); // Reset to first page when filter changes
    handleSearch(searchQuery, status, warehouseFilter, operatorFilter, mainFilterState.inventoryFilter, null, null, mainFilterState.yearFilter, mainFilterState.monthFilter, mainFilterState.weekFilter, mainFilterState.dayFilter, 1);
  };

  const handleOperatorFilterChange = (operator: string | null) => {
    setOperatorFilter(operator);
    setPage(1); // Reset to first page when filter changes
    handleSearch(searchQuery, statusFilter, warehouseFilter, operator, mainFilterState.inventoryFilter, null, null, mainFilterState.yearFilter, mainFilterState.monthFilter, mainFilterState.weekFilter, mainFilterState.dayFilter, 1);
  };

  const handleWarehouseFilterChange = (warehouseId: string | null) => {
    setWarehouseFilter(warehouseId);
    setPage(1); // Reset to first page when filter changes
    handleSearch(searchQuery, statusFilter, warehouseId, operatorFilter, mainFilterState.inventoryFilter, null, null, mainFilterState.yearFilter, mainFilterState.monthFilter, mainFilterState.weekFilter, mainFilterState.dayFilter, 1);
  };

  // Add new filter handlers for main list
  const handleMainInventoryFilterChange = (inventoryId: string | null) => {
    setMainFilterState(prev => ({ ...prev, inventoryFilter: inventoryId }));
    setPage(1);
    handleSearch(searchQuery, statusFilter, warehouseFilter, operatorFilter, inventoryId, null, null, mainFilterState.yearFilter, mainFilterState.monthFilter, mainFilterState.weekFilter, mainFilterState.dayFilter, 1);
  };

  const handleMainDateFromChange = (date: any) => {
    setMainFilterState(prev => ({ ...prev, dateFrom: date }));
    setPage(1);
    const dateString = date ? new Date(date.year, date.month - 1, date.day).toISOString().split('T')[0] : null;
    handleSearch(searchQuery, statusFilter, warehouseFilter, operatorFilter, mainFilterState.inventoryFilter, dateString, null, mainFilterState.yearFilter, mainFilterState.monthFilter, mainFilterState.weekFilter, mainFilterState.dayFilter, 1);
  };

  const handleMainDateToChange = (date: any) => {
    setMainFilterState(prev => ({ ...prev, dateTo: date }));
    setPage(1);
    const dateString = date ? new Date(date.year, date.month - 1, date.day).toISOString().split('T')[0] : null;
    handleSearch(searchQuery, statusFilter, warehouseFilter, operatorFilter, mainFilterState.inventoryFilter, null, dateString, mainFilterState.yearFilter, mainFilterState.monthFilter, mainFilterState.weekFilter, mainFilterState.dayFilter, 1);
  };

  const handleMainYearFilterChange = (year: number | null) => {
    setMainFilterState(prev => ({ ...prev, yearFilter: year }));
    setPage(1);
    handleSearch(searchQuery, statusFilter, warehouseFilter, operatorFilter, mainFilterState.inventoryFilter, null, null, year, mainFilterState.monthFilter, mainFilterState.weekFilter, mainFilterState.dayFilter, 1);
  };

  const handleMainMonthFilterChange = (month: number | null) => {
    setMainFilterState(prev => ({ ...prev, monthFilter: month }));
    setPage(1);
    handleSearch(searchQuery, statusFilter, warehouseFilter, operatorFilter, mainFilterState.inventoryFilter, null, null, mainFilterState.yearFilter, month, mainFilterState.weekFilter, mainFilterState.dayFilter, 1);
  };

  const handleMainWeekFilterChange = (week: number | null) => {
    setMainFilterState(prev => ({ ...prev, weekFilter: week }));
    setPage(1);
    handleSearch(searchQuery, statusFilter, warehouseFilter, operatorFilter, mainFilterState.inventoryFilter, null, null, mainFilterState.yearFilter, mainFilterState.monthFilter, week, mainFilterState.dayFilter, 1);
  };

  const handleMainDayFilterChange = (day: number | null) => {
    setMainFilterState(prev => ({ ...prev, dayFilter: day }));
    setPage(1);
    handleSearch(searchQuery, statusFilter, warehouseFilter, operatorFilter, mainFilterState.inventoryFilter, null, null, mainFilterState.yearFilter, mainFilterState.monthFilter, mainFilterState.weekFilter, day, 1);
  };

  // Clear main list date filters
  const clearMainDateFilters = () => {
    setMainFilterState(prev => ({
      ...prev,
      dateFrom: null,
      dateTo: null,
      yearFilter: null,
      monthFilter: null,
      weekFilter: null,
      dayFilter: null
    }));
    setPage(1);
    handleSearch(searchQuery, statusFilter, warehouseFilter, operatorFilter, mainFilterState.inventoryFilter, null, null, null, null, null, null, 1);
  };


  // Handle inventory item selection
  const handleInventoryItemChange = async (inventoryItemUuid: string | null) => {
    setSelectedItem(inventoryItemUuid || '');

    // Reset selected bulks and locations
    setSelectedBulks([]);
    setLocations([]);

    // Update form data
    setFormData(prev => ({
      ...prev,
      inventory_uuid: inventoryItemUuid,
      inventory_item_bulk_uuids: [], // Reset bulk selection
      locations: [], // Reset locations
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
              formData.locations
            );

            if (!warehouseResult.success) {
              console.error("Failed to create warehouse inventory items:", warehouseResult.error);
              // Continue with the process even if warehouse items creation fails
              // The inventory status will still be updated
            } else {
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

      setFormData(prev => ({
        ...prev,
        delivery_address: selectedWarehouse.address.fullAddress
      }));

      // Fetch occupied shelf locations
      const occupiedResult = await getOccupiedShelfLocations(selectedWarehouse.uuid);
      if (occupiedResult.success) {
        setOccupiedLocations(occupiedResult.data || []);
      }
    } else {
      setFormData(prev => ({
        ...prev,
        delivery_address: ""
      }));
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
        const newDelivery = result.data;

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
    setTempSelectedCode(code)

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
      depth: tempSelectedDepth
    };

    // Update the locations array
    const newLocations = [...locations];
    newLocations[currentBulkLocationIndex] = location;
    setLocations(newLocations);

    // Update formData
    setFormData(prev => ({
      ...prev,
      locations: newLocations
    }));

    // Update local state for the selected location
    setSelectedFloor(tempSelectedFloor);
    setSelectedColumn(tempSelectedColumn);
    setSelectedColumnCode(tempSelectedColumnCode);
    setSelectedRow(tempSelectedRow);
    setSelectedGroup(tempSelectedGroup);
    setSelectedDepth(tempSelectedDepth);

    onClose();
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


  // Load available deliveries when modal opens and tab changes to deliverables
  useEffect(() => {
    if (showAcceptDeliveryModal && acceptDeliveryTab === "deliverables") {
      // reset the input field
      loadAvailableDeliveries();
    }
  }, [showAcceptDeliveryModal, acceptDeliveryTab]);


  // Function to automatically validate when text is pasted
  const handleDeliveryPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');

    if (pastedText.trim()) {
      // Set the pasted text
      setDeliveryInput(pastedText);

      // Validate instantly only when pasted
      setTimeout(() => {
        handleDeliveryValidation(pastedText);
      }, 100);
    }
  };

  const handleDeliveryValidation = async (inputData = deliveryInput) => {
    // Reset states
    setValidationError("");
    setValidationSuccess(false);
    setIsLoading(true);

    try {
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

      // Find the delivery that matches this UUID
      const matchingDelivery = deliveryItems.find(
        delivery => delivery.uuid === deliveryUuid
      );

      if (!matchingDelivery) {
        setAcceptDeliveryError("No matching delivery found with this UUID");
        setShowAcceptDeliveryModal(false);
        setDeliveryInput(""); // Reset input on error
        setShowAcceptStatusModal(true);
        setIsLoading(false);
        return;
      }

      // Check if the delivery status is IN_TRANSIT
      if (matchingDelivery.status !== "IN_TRANSIT") {
        setAcceptDeliveryError("This delivery cannot be accepted because it is not in transit");
        setShowAcceptDeliveryModal(false);
        setDeliveryInput(""); // Reset input on error
        setShowAcceptStatusModal(true);
        setIsLoading(false);
        return;
      }

      // If the operator is assigned to this delivery, select it
      if (matchingDelivery.operator_uuids?.includes(user?.uuid) ||
        matchingDelivery.operator_uuids === null ||
        matchingDelivery.operator_uuids?.length === 0) {

        // Reset input on successful validation
        setDeliveryInput("");

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

          // Create warehouse inventory item records if location data is present
          if (matchingDelivery.locations?.length > 0 &&
            matchingDelivery.inventory_item_bulk_uuids?.length > 0) {

            try {
              // Prepare items data for warehouse creation
              const { data: warehouseResult, error: wwarehouseError } = await createWarehouseInventoryItems(
                matchingDelivery.inventory_uuid as string,
                matchingDelivery.warehouse_uuid as string,
                matchingDelivery.uuid,
                matchingDelivery.inventory_item_bulk_uuids,
                matchingDelivery.locations
              );

              // Update status of the inventory item bulks
              await updateInventoryItemBulksStatus(matchingDelivery.inventory_item_bulk_uuids, "IN_WAREHOUSE");

              setAcceptDeliverySuccess(true);
              setShowAcceptDeliveryModal(false);
              setShowAcceptStatusModal(true);

              // Refresh delivery items to show updated status
              const refreshedItems = await getDeliveryItems(user?.company_uuid);
              setDeliveryItems(refreshedItems.data || []);
            } catch (error) {
              console.error("Error creating warehouse inventory items:", error);
              setAcceptDeliveryError("Delivery accepted but failed to create warehouse items");
              setShowAcceptDeliveryModal(false);
              setShowAcceptStatusModal(true);
            }
          } else {
            console.warn("Delivery marked as DELIVERED but missing location or bulk data");
            setAcceptDeliveryError("Missing location data for delivery - please contact admin");
            setShowAcceptDeliveryModal(false);
            setShowAcceptStatusModal(true);
          }
        }
      } else {
        setAcceptDeliveryError("You are not assigned to this delivery");
        setShowAcceptDeliveryModal(false);
        setDeliveryInput(""); // Reset input on error
        setShowAcceptStatusModal(true);
      }
    } catch (error) {
      console.error("Error validating delivery:", error);
      setAcceptDeliveryError("Invalid delivery UUID or URL format");
      setShowAcceptDeliveryModal(false);
      setDeliveryInput(""); // Reset input on error
      setShowAcceptStatusModal(true);
    } finally {
      setIsLoading(false);
    }
  };




  // Accept delivery function (similar to search page)
  const handleAcceptDelivery = async (deliveryUuid?: string) => {
    const targetDelivery = deliveryUuid ?
      deliveryItems.find(d => d.uuid === deliveryUuid) :
      deliveryItems.find(d => d.uuid === selectedDeliveryId);

    if (!targetDelivery || !user) return;

    setIsAcceptingDelivery(true);
    setAcceptDeliveryError(null);
    setAcceptDeliverySuccess(false);

    try {
      // Check if the user is an operator
      if (user.is_admin) {
        setAcceptDeliveryError("You are not authorized to accept this delivery");
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
      if (targetDelivery.operator_uuids?.includes(user.uuid) ||
        targetDelivery.operator_uuids === null ||
        targetDelivery.operator_uuids?.length === 0) {

        // Update delivery status to DELIVERED
        const currentTimestamp = new Date().toISOString();
        const updatedStatusHistory = {
          ...(targetDelivery.status_history || {}),
          [currentTimestamp]: "DELIVERED"
        };

        const updatedFormData = {
          status: "DELIVERED",
          status_history: updatedStatusHistory
        };

        const result = await updateDeliveryItem(targetDelivery.uuid, updatedFormData);

        if (result.success && targetDelivery.inventory_uuid) {
          // Update inventory item bulks status
          if (targetDelivery.inventory_item_bulk_uuids && targetDelivery.inventory_item_bulk_uuids.length > 0) {
            await updateInventoryItemBulksStatus(targetDelivery.inventory_item_bulk_uuids, "IN_WAREHOUSE");
          }

          // Create warehouse inventory items if locations are available
          if (targetDelivery.locations && targetDelivery.locations.length > 0 &&
            targetDelivery.inventory_item_bulk_uuids && targetDelivery.inventory_item_bulk_uuids.length > 0) {
            try {
              if (!targetDelivery.warehouse_uuid) {
                setAcceptDeliveryError("Warehouse information is missing");
                setShowAcceptStatusModal(true);
                return;
              }

              await createWarehouseInventoryItems(
                targetDelivery.inventory_uuid,
                targetDelivery.warehouse_uuid,
                targetDelivery.uuid,
                targetDelivery.inventory_item_bulk_uuids,
                targetDelivery.locations
              );
            } catch (error) {
              console.error("Error creating warehouse inventory items:", error);
              setAcceptDeliveryError("Delivery accepted but failed to create warehouse items");
              setShowAcceptStatusModal(true);
              return;
            }
          }

          setAcceptDeliverySuccess(true);
          setShowAcceptStatusModal(true);

          // Update selected delivery if it's the current one
          if (selectedDeliveryId === targetDelivery.uuid) {
            setFormData(prev => ({ ...prev, status: "DELIVERED" }));
          }

        } else {
          setAcceptDeliveryError("Failed to update delivery status");
          setShowAcceptStatusModal(true);
        }
      } else {
        setAcceptDeliveryError("You are not assigned to this delivery");
        setShowAcceptStatusModal(true);
      }
    } catch (error) {
      console.error("Error accepting delivery:", error);
      setAcceptDeliveryError("Failed to accept delivery");
      setShowAcceptStatusModal(true);
    } finally {
      setIsAcceptingDelivery(false);
    }
  };

  // Update the getFilteredPdfDeliveries function
  const getFilteredPdfDeliveries = useCallback(() => {
    return pdfExportDeliveries.filter((delivery) => {
      // Search filter
      if (pdfExportState.searchQuery) {
        const searchTerm = pdfExportState.searchQuery.toLowerCase();
        const matchesSearch =
          delivery.name?.toLowerCase().includes(searchTerm) ||
          delivery.delivery_address?.toLowerCase().includes(searchTerm) ||
          delivery.notes?.toLowerCase().includes(searchTerm) ||
          delivery.status?.toLowerCase().includes(searchTerm) ||
          delivery.uuid?.toLowerCase().includes(searchTerm);

        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [pdfExportDeliveries, pdfExportState.searchQuery]);


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
        setSelectedDepth(firstLoc.depth);
        setSelectedGroup(firstLoc.group);
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
        notes: "",
        status: "PENDING",
        warehouse_uuid: null
      });
      setSelectedItem("");
      setSelectedBulks([]);
      setLocations([]);
      setSelectedOperators([]);
      setDeliveryInput("");

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


  // Update the useEffect with real-time subscription to include bulk details refresh
  useEffect(() => {
    if (!user?.company_uuid) return;

    const supabase = createClient();

    // Set up real-time subscription for delivery items with more specific filtering
    const deliveryChannel = supabase
      .channel('delivery-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'delivery_items',
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async (payload) => {
          // Only refresh if the change affects current view
          const shouldRefresh =
            payload.eventType === 'INSERT' ||
            payload.eventType === 'DELETE' ||
            (payload.eventType === 'UPDATE' && payload.old && payload.new);

          if (shouldRefresh) {
            // Refresh delivery items with current filters and pagination
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

            // If currently viewing an updated delivery, refresh its data
            if (selectedDeliveryId && payload.new && (payload.new as any)?.uuid === selectedDeliveryId) {
              const updatedDelivery = refreshedItems.data?.find((d: any) => d.uuid === selectedDeliveryId);
              if (updatedDelivery) {
                setFormData(updatedDelivery);

                // Update selected bulks if they changed
                if (updatedDelivery.inventory_item_bulk_uuids) {
                  setSelectedBulks(updatedDelivery.inventory_item_bulk_uuids);
                  setPrevSelectedBulks(updatedDelivery.inventory_item_bulk_uuids);
                }

                // Update locations if they changed
                if (updatedDelivery.locations) {
                  setLocations(updatedDelivery.locations);
                }
              }
            }
          }
        }
      )
      .subscribe();

    // Set up real-time subscription for inventory items with specific event filtering
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
          // Only refresh inventory list if items were added, removed, or significantly updated
          if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE' ||
            (payload.eventType === 'UPDATE' && payload.old?.name !== payload.new?.name)) {

            const refreshedItems = await getInventoryItems(user.company_uuid);
            setInventoryItems(refreshedItems.data || []);
          }

          // If we have a selected item and it was updated, refresh its bulks
          if (selectedItem && payload.eventType === 'UPDATE' && payload.new?.uuid === selectedItem) {
            loadInventoryBulks(selectedItem, true); // Preserve selection
          }
        }
      )
      .subscribe();

    // Set up real-time subscription for inventory item bulks with more detailed filtering
    const bulkChannel = supabase
      .channel('bulk-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_item_bulk',
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async (payload) => {

          // Check if the change affects currently displayed inventory item
          const affectedInventoryUuid = (payload.new as any)?.inventory_item_uuid || (payload.old as any)?.inventory_item_uuid;

          if (selectedItem && affectedInventoryUuid === selectedItem) {
            await loadInventoryBulks(selectedItem, true); // Preserve selection
          }

          // Handle bulk detail updates for expanded bulks
          if (expandedBulkDetails.size > 0) {
            const affectedBulkUuid = (payload.new as any)?.uuid || (payload.old as any)?.uuid;

            if (affectedBulkUuid && expandedBulkDetails.has(affectedBulkUuid)) {
              try {
                if (payload.eventType === 'DELETE') {
                  // Remove from expanded details if bulk was deleted
                  setExpandedBulkDetails(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(affectedBulkUuid);
                    return newSet;
                  });
                  setBulkDetails(prev => {
                    const newMap = new Map(prev);
                    newMap.delete(affectedBulkUuid);
                    return newMap;
                  });
                } else {
                  // Refresh bulk details for updates/inserts
                  const result = await getBulkDetails(affectedBulkUuid);
                  if (result.success && result.data) {
                    setBulkDetails(prev => new Map(prev).set(affectedBulkUuid, result.data));
                  }
                }
              } catch (error) {
                console.error(`Error handling bulk details update for ${affectedBulkUuid}:`, error);
              }
            }
          }
        }
      )
      .subscribe();

    // Set up real-time subscription for inventory item units with specific filtering
    const unitChannel = supabase
      .channel('unit-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_item_unit',
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async (payload) => {
          // Get the affected bulk UUID from both new and old records
          const affectedBulkUuid = (payload.new as any)?.inventory_item_bulk_uuid || (payload.old as any)?.inventory_item_bulk_uuid;

          if (!affectedBulkUuid || !expandedBulkDetails.has(affectedBulkUuid)) {
            return; // Skip if bulk is not currently expanded
          }

          try {
            // Refresh the bulk details to get updated unit information
            const result = await getBulkDetails(affectedBulkUuid);
            if (result.success && result.data) {
              setBulkDetails(prev => new Map(prev).set(affectedBulkUuid, result.data));
            } else if (payload.eventType === 'DELETE') {
              // If bulk no longer exists, remove from expanded details
              setExpandedBulkDetails(prev => {
                const newSet = new Set(prev);
                newSet.delete(affectedBulkUuid);
                return newSet;
              });
              setBulkDetails(prev => {
                const newMap = new Map(prev);
                newMap.delete(affectedBulkUuid);
                return newMap;
              });
            }
          } catch (error) {
            console.error(`Error refreshing bulk details for ${affectedBulkUuid}:`, error);
          }
        }
      )
      .subscribe();

    // Set up real-time subscription for warehouse inventory items (for location tracking)
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
          // Refresh occupied locations if warehouse is selected
          if (formData.warehouse_uuid) {
            const occupiedResult = await getOccupiedShelfLocations(formData.warehouse_uuid);
            if (occupiedResult.success) {
              setOccupiedLocations(occupiedResult.data || []);
            }
          }
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(deliveryChannel);
      supabase.removeChannel(inventoryChannel);
      supabase.removeChannel(bulkChannel);
      supabase.removeChannel(unitChannel);
      supabase.removeChannel(warehouseInventoryChannel);
    };
  }, [
    user?.company_uuid,
    searchQuery,
    statusFilter,
    warehouseFilter,
    selectedItem,
    selectedDeliveryId,
    loadInventoryBulks,
    expandedBulkDetails,
    page,
    rowsPerPage,
    formData.warehouse_uuid
  ]);

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

      // Update for current bulk
      if (currentBulkLocationIndex < newLocations.length) {
        newLocations[currentBulkLocationIndex] = location;
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
  }, [selectedFloor, selectedColumn, selectedRow, selectedGroup, selectedDepth, formData.status, currentBulkLocationIndex, locations, selectedDeliveryId]);

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
                isDisabled={isLoading || isLoadingItems || isLoadingBulks}>
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
            <Popover
              isOpen={pdfExportState.isPopoverOpen}
              onOpenChange={(open) => {
                setPdfExportState(prev => ({
                  ...prev,
                  isPopoverOpen: open,
                  // When opening, default to selected item or clear selection
                  selectedDeliveries: open
                    ? (selectedDeliveryId ? [selectedDeliveryId] : [])
                    : prev.selectedDeliveries,
                  searchQuery: "",
                  statusFilter: null,
                  warehouseFilter: null,
                  operatorFilter: null,
                  inventoryFilter: null
                }));
              }}
              motionProps={popoverTransition()}
              classNames={{ content: "backdrop-blur-lg bg-background/65" }}
              placement="bottom-end"
            >
              <PopoverTrigger>
                <Button
                  color="secondary"
                  variant="shadow"
                  startContent={!isPdfGenerating && <Icon icon="mdi:file-pdf-box" />}
                  isLoading={isPdfGenerating}
                  isDisabled={isPdfGenerating || isLoading || deliveryItems.length === 0}
                  onPress={() => setPdfExportState(prev => ({ ...prev, isPopoverOpen: true }))}
                >
                  Export QR PDF
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-0 overflow-hidden">
                <div className="w-full">
                  <div className="px-4 pt-4 text-center">
                    <h3 className="text-lg font-semibold">Export Delivery QR Report</h3>
                    <p className="text-sm text-default-500">Select deliveries to include in the PDF report</p>
                  </div>

                  <div className="p-4 border-b border-default-200 space-y-3">
                    <Input
                      placeholder="Search deliveries..."
                      value={pdfExportState.searchQuery}
                      onChange={(e) => setPdfExportState(prev => ({ ...prev, searchQuery: e.target.value }))}
                      isClearable
                      onClear={() => setPdfExportState(prev => ({ ...prev, searchQuery: "" }))}
                      startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
                    />

                    <div className="flex items-center gap-2 mt-2">
                      <ScrollShadow orientation="horizontal" className="flex-1 overflow-x-auto" hideScrollBar>
                        <div className="inline-flex items-center gap-2">
                          <Popover
                            isOpen={isExportSearchFilterOpen}
                            onOpenChange={setIsExportSearchFilterOpen}
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
                            <PopoverContent className="w-96 p-0 overflow-hidden">
                              <div>
                                <div className="space-y-4 p-4">
                                  <h3 className="text-lg font-semibold items-center w-full text-center">
                                    Filter Options
                                  </h3>

                                  {/* Warehouse filter */}
                                  <Autocomplete
                                    name="warehouse_uuid"
                                    label="Filter by Warehouse"
                                    placeholder="All Warehouses"
                                    selectedKey={pdfExportState.warehouseFilter || ""}
                                    onSelectionChange={(key) => setPdfExportState(prev => ({ ...prev, warehouseFilter: key as string || null }))}
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
                                    selectedKey={pdfExportState.statusFilter || ""}
                                    onSelectionChange={(key) => setPdfExportState(prev => ({ ...prev, statusFilter: key as string || null }))}
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
                                    selectedKey={pdfExportState.operatorFilter || ""}
                                    onSelectionChange={(key) => setPdfExportState(prev => ({ ...prev, operatorFilter: key as string || null }))}
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

                                  {/* Inventory filter */}
                                  <Autocomplete
                                    name="inventory_filter"
                                    label="Filter by Item"
                                    placeholder="All Items"
                                    selectedKey={pdfExportState.inventoryFilter || ""}
                                    onSelectionChange={(key) => setPdfExportState(prev => ({ ...prev, inventoryFilter: key as string || null }))}
                                    startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                                    inputProps={autoCompleteStyle}
                                  >
                                    {[
                                      (<AutocompleteItem key="">All Items</AutocompleteItem>),
                                      ...inventoryItems.map((item) => (
                                        <AutocompleteItem key={item.uuid}>
                                          {item.name}
                                        </AutocompleteItem>
                                      ))]}
                                  </Autocomplete>

                                  {/* Date Filters using Tabs */}
                                  <div className="space-y-3 border-2 border-default-200 rounded-xl p-4 bg-default-100/25">
                                    <div className="flex items-center gap-2">
                                      <Icon icon="mdi:calendar-range" className="text-default-500" />
                                      <span className="text-sm font-medium">Date Filters</span>
                                    </div>

                                    <Tabs
                                      variant="solid"
                                      color="primary"
                                      fullWidth
                                      size="md"
                                      classNames={{
                                        panel: "p-0",
                                        tabList: "border-2 border-default-200",
                                        tabContent: "text-default-700",
                                      }}
                                      selectedKey={pdfExportState.dateTabKey}
                                      onSelectionChange={(key) => {
                                        const tabKey = key as string;
                                        setPdfExportState(prev => ({
                                          ...prev,
                                          dateTabKey: tabKey,
                                          // Reset all date filters when switching tabs
                                          dateFrom: null,
                                          dateTo: null,
                                          yearFilter: null,
                                          monthFilter: null,
                                          weekFilter: null,
                                          dayFilter: null
                                        }));
                                      }}
                                      className="w-full"
                                    >
                                      <Tab key="range" title="Date Range">
                                        <DateRangePicker
                                          label="Select Date Range"
                                          className="w-full"
                                          value={pdfExportState.dateFrom && pdfExportState.dateTo ? {
                                            start: pdfExportState.dateFrom,
                                            end: pdfExportState.dateTo
                                          } : null}
                                          onChange={(range) => {
                                            setPdfExportState(prev => ({
                                              ...prev,
                                              dateFrom: range?.start || null,
                                              dateTo: range?.end || null
                                            }));
                                          }}
                                          classNames={inputStyle}
                                        />
                                      </Tab>

                                      <Tab key="week" title="By Week">
                                        <div className="space-y-3">
                                          <div className="flex gap-2">
                                            <Input
                                              type="number"
                                              label="Year"
                                              placeholder="2024"
                                              value={pdfExportState.yearFilter?.toString() || ""}
                                              onChange={(e) => setPdfExportState(prev => ({
                                                ...prev,
                                                yearFilter: e.target.value ? parseInt(e.target.value) : null
                                              }))}
                                              className="flex-1"
                                              classNames={inputStyle}
                                              min="2000"
                                              max="2100"
                                            />
                                            <Input
                                              type="number"
                                              label="Week"
                                              placeholder="1-53"
                                              value={pdfExportState.weekFilter?.toString() || ""}
                                              onChange={(e) => setPdfExportState(prev => ({
                                                ...prev,
                                                weekFilter: e.target.value ? parseInt(e.target.value) : null,
                                                // Auto-set current year if not set
                                                yearFilter: prev.yearFilter || new Date().getFullYear()
                                              }))}
                                              className="flex-1"
                                              classNames={inputStyle}
                                              min="1"
                                              max="53"
                                            />
                                          </div>
                                          {(pdfExportState.yearFilter || pdfExportState.weekFilter) && (
                                            <Button
                                              size="sm"
                                              variant="flat"
                                              color="warning"
                                              onPress={() => setPdfExportState(prev => ({
                                                ...prev,
                                                yearFilter: null,
                                                weekFilter: null
                                              }))}
                                              className="w-full"
                                              startContent={<Icon icon="mdi:close" />}
                                            >
                                              Clear Week Filter
                                            </Button>
                                          )}
                                        </div>
                                      </Tab>

                                      <Tab key="specific" title="Specific Date">
                                        <div className="space-y-3">
                                          <div className="grid grid-cols-3 gap-2">
                                            <Input
                                              type="number"
                                              label="Year"
                                              placeholder="2024"
                                              value={pdfExportState.yearFilter?.toString() || ""}
                                              onChange={(e) => setPdfExportState(prev => ({
                                                ...prev,
                                                yearFilter: e.target.value ? parseInt(e.target.value) : null
                                              }))}
                                              classNames={inputStyle}
                                              min="2000"
                                              max="2100"
                                            />
                                            <Input
                                              type="number"
                                              label="Month"
                                              placeholder="1-12"
                                              value={pdfExportState.monthFilter?.toString() || ""}
                                              onChange={(e) => setPdfExportState(prev => ({
                                                ...prev,
                                                monthFilter: e.target.value ? parseInt(e.target.value) : null
                                              }))}
                                              classNames={inputStyle}
                                              min="1"
                                              max="12"
                                            />
                                            <Input
                                              type="number"
                                              label="Day"
                                              placeholder="1-31"
                                              value={pdfExportState.dayFilter?.toString() || ""}
                                              onChange={(e) => setPdfExportState(prev => ({
                                                ...prev,
                                                dayFilter: e.target.value ? parseInt(e.target.value) : null
                                              }))}
                                              classNames={inputStyle}
                                              min="1"
                                              max="31"
                                            />
                                          </div>
                                          {(pdfExportState.yearFilter || pdfExportState.monthFilter || pdfExportState.dayFilter) && (
                                            <Button
                                              size="sm"
                                              variant="flat"
                                              color="warning"
                                              onPress={() => setPdfExportState(prev => ({
                                                ...prev,
                                                yearFilter: null,
                                                monthFilter: null,
                                                dayFilter: null
                                              }))}
                                              className="w-full"
                                              startContent={<Icon icon="mdi:close" />}
                                            >
                                              Clear Specific Date Filter
                                            </Button>
                                          )}
                                        </div>
                                      </Tab>
                                    </Tabs>
                                  </div>
                                </div>

                                <div className="p-4 border-t border-default-200 flex justify-end gap-2 bg-default-100/50">
                                  {/* Clear All Filters Button */}
                                  {(pdfExportState.warehouseFilter || pdfExportState.statusFilter || pdfExportState.operatorFilter || pdfExportState.inventoryFilter || pdfExportState.dateFrom || pdfExportState.dateTo || pdfExportState.yearFilter || pdfExportState.monthFilter || pdfExportState.weekFilter || pdfExportState.dayFilter) && (
                                    <Button
                                      variant="flat"
                                      color="danger"
                                      size="sm"
                                      onPress={() => {
                                        setPdfExportState(prev => ({
                                          ...prev,
                                          warehouseFilter: null,
                                          statusFilter: null,
                                          operatorFilter: null,
                                          inventoryFilter: null,
                                          dateFrom: null,
                                          dateTo: null,
                                          yearFilter: null,
                                          monthFilter: null,
                                          weekFilter: null,
                                          dayFilter: null,
                                          dateTabKey: "range" // Reset to default tab
                                        }));
                                      }}
                                      startContent={<Icon icon="mdi:filter-remove" />}
                                    >
                                      Clear All Filters
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    onPress={() => setIsExportSearchFilterOpen(false)}
                                  >
                                    Close
                                  </Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>

                          {/* Filter chips */}
                          {pdfExportState.warehouseFilter && (
                            <Chip
                              variant="flat"
                              color="primary"
                              onClose={() => setPdfExportState(prev => ({ ...prev, warehouseFilter: null }))}
                              size="sm"
                              className="h-8 p-2"
                            >
                              <div className="flex items-center gap-1">
                                <Icon icon="mdi:warehouse" className="text-xs" />
                                {warehouses.find(w => w.uuid === pdfExportState.warehouseFilter)?.name || 'Unknown Warehouse'}
                              </div>
                            </Chip>
                          )}

                          {pdfExportState.statusFilter && (
                            <Chip
                              variant="flat"
                              color={getStatusColor(pdfExportState.statusFilter)}
                              onClose={() => setPdfExportState(prev => ({ ...prev, statusFilter: null }))}
                              size="sm"
                              className="h-8 p-2"
                            >
                              <div className="flex items-center gap-1">
                                <Icon icon="mdi:filter-variant" className="text-xs" />
                                {pdfExportState.statusFilter.charAt(0).toUpperCase() + pdfExportState.statusFilter.slice(1).toLowerCase().replace('_', ' ')}
                              </div>
                            </Chip>
                          )}

                          {pdfExportState.operatorFilter && (
                            <Chip
                              variant="flat"
                              color="secondary"
                              onClose={() => setPdfExportState(prev => ({ ...prev, operatorFilter: null }))}
                              size="sm"
                              className="h-8 p-2"
                            >
                              <div className="flex items-center gap-1">
                                <Icon icon="mdi:account" className="text-xs" />
                                {operators.find(op => op.uuid === pdfExportState.operatorFilter)?.full_name || 'Unknown Operator'}
                              </div>
                            </Chip>
                          )}

                          {pdfExportState.inventoryFilter && (
                            <Chip
                              variant="flat"
                              color="success"
                              onClose={() => setPdfExportState(prev => ({ ...prev, inventoryFilter: null }))}
                              size="sm"
                              className="h-8 p-2"
                            >
                              <div className="flex items-center gap-1">
                                <Icon icon="mdi:package-variant" className="text-xs" />
                                {inventoryItems.find(item => item.uuid === pdfExportState.inventoryFilter)?.name || 'Unknown Item'}
                              </div>
                            </Chip>
                          )}

                          {(pdfExportState.dateFrom || pdfExportState.dateTo) && (
                            <Chip
                              variant="flat"
                              color="secondary"
                              onClose={() => setPdfExportState(prev => ({ ...prev, dateFrom: null, dateTo: null }))}
                              size="sm"
                              className="h-8 p-2"
                            >
                              <div className="flex items-center gap-1">
                                <Icon icon="mdi:calendar-range" className="text-xs" />
                                {pdfExportState.dateFrom && pdfExportState.dateTo ? `${format(new Date(pdfExportState.dateFrom.year, pdfExportState.dateFrom.month - 1, pdfExportState.dateFrom.day), 'MMM d')} - ${format(new Date(pdfExportState.dateTo.year, pdfExportState.dateTo.month - 1, pdfExportState.dateTo.day), 'MMM d')}` : 'Date Range'}
                              </div>
                            </Chip>
                          )}

                          {pdfExportState.weekFilter && (
                            <Chip
                              variant="flat"
                              color="secondary"
                              onClose={() => setPdfExportState(prev => ({ ...prev, weekFilter: null, yearFilter: null }))}
                              size="sm"
                              className="h-8 p-2"
                            >
                              <div className="flex items-center gap-1">
                                <Icon icon="mdi:calendar-week" className="text-xs" />
                                Week {pdfExportState.weekFilter}/{pdfExportState.yearFilter || new Date().getFullYear()}
                              </div>
                            </Chip>
                          )}

                          {(pdfExportState.yearFilter || pdfExportState.monthFilter || pdfExportState.dayFilter) && !pdfExportState.weekFilter && (
                            <Chip
                              variant="flat"
                              color="secondary"
                              onClose={() => setPdfExportState(prev => ({ ...prev, yearFilter: null, monthFilter: null, dayFilter: null }))}
                              size="sm"
                              className="h-8 p-2"
                            >
                              <div className="flex items-center gap-1">
                                <Icon icon="mdi:calendar" className="text-xs" />
                                {pdfExportState.yearFilter && pdfExportState.monthFilter && pdfExportState.dayFilter
                                  ? `${pdfExportState.dayFilter}/${pdfExportState.monthFilter}/${pdfExportState.yearFilter}`
                                  : `Custom Date`}
                              </div>
                            </Chip>
                          )}

                          {(pdfExportState.warehouseFilter || pdfExportState.statusFilter || pdfExportState.operatorFilter || pdfExportState.inventoryFilter || pdfExportState.dateFrom || pdfExportState.dateTo || pdfExportState.yearFilter || pdfExportState.monthFilter || pdfExportState.weekFilter || pdfExportState.dayFilter) && (
                            <Button
                              size="sm"
                              variant="light"
                              className="rounded-lg"
                              onPress={() => {
                                setPdfExportState(prev => ({
                                  ...prev,
                                  warehouseFilter: null,
                                  statusFilter: null,
                                  operatorFilter: null,
                                  inventoryFilter: null,
                                  dateFrom: null,
                                  dateTo: null,
                                  yearFilter: null,
                                  monthFilter: null,
                                  weekFilter: null,
                                  dayFilter: null
                                }));
                              }}
                            >
                              Clear all
                            </Button>
                          )}
                        </div>
                      </ScrollShadow>
                    </div>
                  </div>


                  <CustomScrollbar
                    disabled={isLoadingPdfDeliveries || getFilteredPdfDeliveries().length === 0}
                    className="max-h-64">
                    <div className="p-2">
                      <ListLoadingAnimation
                        condition={isLoadingPdfDeliveries}
                        containerClassName="space-y-2"
                        skeleton={[
                          /* Select All skeleton */
                          <div key="select-all" className="flex items-center justify-between p-2 pb-0">
                            <div className="flex items-center gap-2">
                              <Skeleton className="w-5 h-5 rounded" />
                              <Skeleton className="h-4 w-20 rounded-xl" />
                            </div>
                            <Skeleton className="h-4 w-16 rounded-xl" />
                          </div>,
                          /* Delivery items skeleton */
                          ...[...Array(5)].map((_, i) => (
                            <div key={i} className="flex items-center gap-2 p-2 rounded-md">
                              <Skeleton className="w-5 h-5 rounded" />
                              <div className="flex-1 min-w-0 space-y-1">
                                <Skeleton className="h-4 w-32 rounded-xl" />
                                <Skeleton className="h-3 w-48 rounded-xl" />
                              </div>
                              <Skeleton className="h-6 w-16 rounded-xl" />
                            </div>
                          ))
                        ]}
                      >
                        {getFilteredPdfDeliveries().length === 0 ? (
                          [<div className="p-4 text-center text-default-500 h-64 flex items-center justify-center flex-col">
                            <Icon icon="mdi:alert-circle-outline" className="text-4xl mb-2" />
                            No items match the selected filters
                          </div>]
                        ) : (
                          [
                            <div className="flex items-center justify-between p-2 pb-0">
                              <Checkbox
                                isSelected={pdfExportState.selectedDeliveries.length === getFilteredPdfDeliveries().length && getFilteredPdfDeliveries().length > 0}
                                isIndeterminate={pdfExportState.selectedDeliveries.length > 0 && pdfExportState.selectedDeliveries.length < getFilteredPdfDeliveries().length}
                                onValueChange={(selected) => {
                                  if (selected) {
                                    setPdfExportState(prev => ({
                                      ...prev,
                                      selectedDeliveries: getFilteredPdfDeliveries().map(delivery => delivery.uuid)
                                    }));
                                  } else {
                                    setPdfExportState(prev => ({ ...prev, selectedDeliveries: [] }));
                                  }
                                }}
                              >
                                <span className="text-small font-medium pl-2">Select All</span>
                              </Checkbox>
                              <span className="text-small text-default-400">
                                {pdfExportState.selectedDeliveries.length} selected
                              </span>
                            </div>,
                            ...getFilteredPdfDeliveries().map((delivery) => (
                              <div key={delivery.uuid} className="flex items-center gap-2 p-2 hover:bg-default-100 rounded-md cursor-pointer transition-all duration-200">
                                <Checkbox
                                  isSelected={pdfExportState.selectedDeliveries.includes(delivery.uuid)}
                                  onValueChange={() => handleTogglePdfDeliverySelection(delivery.uuid)}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-small truncate">
                                    {inventoryItems.find(i => i.uuid === delivery.inventory_uuid)?.name || 'Unknown Item'}
                                  </div>
                                  <div className="text-tiny text-default-400 truncate">
                                    {warehouses.find(w => w.uuid === delivery.warehouse_uuid)?.name || 'Unknown Warehouse'} • {formatDate(delivery.delivery_date)}
                                  </div>
                                </div>
                                <Chip color={getStatusColor(delivery.status)} size="sm" variant="flat">
                                  {delivery.status.charAt(0).toUpperCase() + delivery.status.slice(1).toLowerCase().replace('_', ' ')}
                                </Chip>
                              </div>
                            ))
                          ]
                        )}
                      </ListLoadingAnimation>
                    </div>
                  </CustomScrollbar>


                  <div className="border-t border-default-200 flex justify-between items-center bg-default-100/50 flex-col w-full">
                    <div className="w-full">
                      {/* Collapsible Export Options Header */}
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-default-100 transition-colors duration-200"
                        onClick={() => setIsExportOptionsOpen(!isExportOptionsOpen)}
                      >
                        <h4 className="text-sm font-medium text-default-700">Export Options</h4>
                        <Icon
                          icon={isExportOptionsOpen ? "mdi:chevron-up" : "mdi:chevron-down"}
                          className="text-default-500 transition-transform duration-200"
                        />
                      </div>

                      {/* Collapsible Export Options Content */}
                      <AnimatePresence>
                        {isExportOptionsOpen && (
                          <motion.div
                            {...motionTransition}
                            className="overflow-hidden"
                          >
                            <div className="space-y-3 px-4 pb-4">
                              {/* Page Size Selection */}
                              <div className="space-y-2">
                                <label className="text-xs font-medium text-default-600">Page Size</label>
                                <Select
                                  size="sm"
                                  selectedKeys={[pdfExportState.pageSize]}
                                  onSelectionChange={(keys) => {
                                    const selectedKey = Array.from(keys)[0] as string;
                                    setPdfExportState(prev => ({ ...prev, pageSize: selectedKey as any }));
                                  }}
                                  classNames={{
                                    trigger: "h-8",
                                    value: "text-xs"
                                  }}
                                >
                                  <SelectItem key="A4">A4 (210 × 297 mm)</SelectItem>
                                  <SelectItem key="A3">A3 (297 × 420 mm)</SelectItem>
                                  <SelectItem key="LETTER">Letter (8.5 × 11 in)</SelectItem>
                                  <SelectItem key="LEGAL">Legal (8.5 × 14 in)</SelectItem>
                                </Select>
                              </div>

                              {/* QR Code Options */}
                              <div className="space-y-3">
                                <label className="text-xs font-medium text-default-600">QR Code Options</label>

                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                      <span className="text-xs font-medium text-default-700">Auto Accept Delivery</span>
                                      <span className="text-xs text-default-500">Automatically accept delivery when scanned</span>
                                    </div>
                                    <Switch
                                      size="sm"
                                      isSelected={pdfExportState.includeAutoAccept}
                                      onValueChange={(checked) =>
                                        setPdfExportState(prev => ({ ...prev, includeAutoAccept: checked }))
                                      }
                                      color="warning"
                                    />
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                      <span className="text-xs font-medium text-default-700">Show Options</span>
                                      <span className="text-xs text-default-500">Display additional options when scanned</span>
                                    </div>
                                    <Switch
                                      size="sm"
                                      isSelected={pdfExportState.includeShowOptions}
                                      onValueChange={(checked) =>
                                        setPdfExportState(prev => ({ ...prev, includeShowOptions: checked }))
                                      }
                                      color="secondary"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex justify-end gap-2 w-full border-t border-default-200 p-4">
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => setPdfExportState(prev => ({ ...prev, isPopoverOpen: false }))}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        color="primary"
                        isDisabled={pdfExportState.selectedDeliveries.length === 0}
                        isLoading={isPdfGenerating}
                        onPress={() => {
                          setPdfExportState(prev => ({ ...prev, isPopoverOpen: false }));
                          handleGenerateQrPdf(pdfExportState.selectedDeliveries);
                        }}
                      >
                        Generate PDF
                      </Button>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

          </div>
        </div>
        <div className="flex flex-col xl:flex-row gap-4">
          {/* Left side: Delivery List */}
          <SearchListPanel
            title="Delivery Items"
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
            supabaseFunction="get_delivery_items"
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
                                    <div className="flex items-center gap-2 flex-wrap justify-end">
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
                          <div className="border-2 border-default-200 rounded-xl bg-gradient-to-b from-background to-default-50/30 overflow-hidden">
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
                            <div className="space-y-4">


                              <div className="space-y-2">

                                {(isDeliveryProcessing() && user.is_admin) && (
                                  <div className="flex flex-row-reverse justify-between items-center mb-2 p-4 pb-0">

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
                                        }
                                      }}
                                      isDisabled={formData.status !== "PENDING" || !(user === null || user.is_admin) || inventoryBulks.length === 0}
                                    >
                                      Select All
                                    </Checkbox>
                                  </div>
                                )}

                                <CustomScrollbar
                                  scrollShadow
                                  className="max-h-[40rem] overflow-y-auto overflow-x-hidden p-2">

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
                                          <div className="flex items-center gap-2 flex-wrap justify-end">
                                            <Skeleton className="h-6 w-20 rounded-xl" />
                                            <Skeleton className="h-8 w-24 rounded-xl" />
                                          </div>
                                        </div>
                                      ))}>

                                      {((formData.status === "PENDING" && user.is_admin) ? inventoryBulks : inventoryBulks.filter(bulk =>
                                        selectedBulks.includes(bulk.uuid)
                                      )).map((bulk, index) => (

                                        <div key={bulk.uuid}>
                                          <div className="flex flex-col gap-2 border border-default-200 rounded-xl bg-default-50/50 mb-2">
                                            <div className="flex items-center justify-between p-3 ">
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
                                                  className="py-6 px-2 -m-2 rounded-lg"
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
                                                {/* {selectedBulks.includes(bulk.uuid) && (
                                                  <div className="flex flex-wrap justify-end items-center gap-2">
                                                    <Chip
                                                      size="sm"
                                                      color={locationCodes[selectedBulks.indexOf(bulk.uuid)] ? "success" : "warning"}
                                                      variant="flat"
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
                                                )} */}
                                              </div>
                                            </div>

                                            {/* Bulk Details Expansion */}
                                            <AnimatePresence>
                                              {expandedBulkDetails.has(bulk.uuid) && bulkDetails.has(bulk.uuid) && (
                                                <motion.div {...motionTransition}>
                                                  <div className="border border-default-200 rounded-xl bg-default-50/50 m-3 mt-0">
                                                    {(() => {
                                                      const details = bulkDetails.get(bulk.uuid);
                                                      if (!details) return null;

                                                      return (
                                                        <div className="p-4 space-y-4">
                                                          {/* Bulk Information */}
                                                          <div className="space-y-3">

                                                            <div className="flex items-center justify-between">
                                                              <h4 className="font-semibold text-lg">Bulk Information</h4>
                                                              <div className="flex items-center gap-2">
                                                                <Button
                                                                  variant="flat"
                                                                  color="default"
                                                                  size="sm"
                                                                  isIconOnly
                                                                  onPress={async () => {
                                                                    setLoadingBulkDetails(prev => new Set(prev).add(bulk.uuid));
                                                                    try {
                                                                      const result = await getBulkDetails(bulk.uuid);
                                                                      if (result.success && result.data) {
                                                                        setBulkDetails(prev => new Map(prev).set(bulk.uuid, result.data));
                                                                      }
                                                                    } catch (error) {
                                                                      console.error(`Error refreshing bulk details for ${bulk.uuid}:`, error);
                                                                    } finally {
                                                                      setLoadingBulkDetails(prev => {
                                                                        const newSet = new Set(prev);
                                                                        newSet.delete(bulk.uuid);
                                                                        return newSet;
                                                                      });
                                                                    }
                                                                  }}
                                                                  isLoading={loadingBulkDetails.has(bulk.uuid)}
                                                                >
                                                                  <Icon icon="mdi:refresh" className="text-default-500 text-lg" />
                                                                </Button>
                                                                <Button
                                                                  variant="flat"
                                                                  color="default"
                                                                  size="sm"
                                                                  isIconOnly
                                                                  onPress={() => copyToClipboard(details.uuid)}
                                                                >
                                                                  <Icon icon="mdi:content-copy" className="text-default-500 text-sm" />
                                                                </Button>
                                                              </div>
                                                            </div>

                                                            <div className="grid grid-cols-1 gap-3 text-sm bg-default-50 p-3 rounded-xl border-2 border-default-200">
                                                              <div className="col-span-1">
                                                                <span className="text-default-500">Bulk ID:</span>
                                                                <span className="ml-2 font-mono text-xs">{details.uuid}</span>
                                                              </div>
                                                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                                <div>
                                                                  <span className="text-default-500">Unit Value:</span>
                                                                  <span className="ml-2">{formatNumber(details.unit_value)} {details.unit}</span>
                                                                </div>
                                                                <div>
                                                                  <span className="text-default-500">Packkaging Unit:</span>
                                                                  <span className="ml-2">{details.packaging_unit}</span>
                                                                </div>
                                                                <div>
                                                                  <span className="text-default-500">Total Cost:</span>
                                                                  <span className="ml-2">₱{formatNumber(details.cost || 0)}</span>
                                                                </div>
                                                              </div>
                                                              {/* Custom Properties */}
                                                              {details.properties && Object.keys(details.properties).length > 0 && (
                                                                <div className="p-3 bg-default-100 rounded-xl border-2 border-default-200">
                                                                  <div className="flex items-center gap-2 mb-2">
                                                                    <Icon icon="mdi:tag-multiple" className="text-default-500" width={16} />
                                                                    <span className="text-sm font-medium">Bulk Properties</span>
                                                                  </div>
                                                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
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
                                                        </div>
                                                      );
                                                    })()}
                                                  </div>
                                                </motion.div>
                                              )}
                                            </AnimatePresence>
                                          </div>



                                        </div>
                                      ))}
                                    </ListLoadingAnimation>
                                  </div>
                                </CustomScrollbar>

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
                                  // isDisabled={formData.status === "DELIVERED" || formData.status === "CANCELLED" || isLoading || isFloorConfigNotSet() || selectedBulks.length === 0 || locations.length < selectedBulks.length}
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

                  <Tab
                    key="deliverables"
                    title={
                      <div className="flex items-center space-x-2 px-1">
                        <Icon icon="mdi:truck-delivery" className="text-base" />
                        <span className="font-medium text-sm">Deliverables</span>
                      </div>
                    }
                  >
                    <Card className="flex flex-col bg-background h-[500px]">
                      {/* Header section */}
                      <CardHeader className="space-y-4 flex-shrink-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="w-8 h-8 bg-success-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <Icon icon="mdi:truck-check" className="text-success-600 text-sm" />
                          </div>
                          <div className="text-left">
                            <h3 className="text-base font-semibold text-default-800">Available Deliveries</h3>
                            <p className="text-xs text-default-600">
                              Select from deliveries that are in transit and assigned to you
                            </p>
                          </div>
                        </div>
                      </CardHeader>

                      <CardBody className="flex flex-col flex-1 px-4">
                        <ScrollShadow className="h-full overflow-y-auto overflow-x-hidden">
                          <ListLoadingAnimation
                            condition={isLoadingAvailableDeliveries}
                            containerClassName="space-y-2 p-1"
                            skeleton={[...Array(3)].map((_, i) => (
                              <div key={i} className="border border-default-200 rounded-xl p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <Skeleton className="w-10 h-10 rounded-xl" />
                                    <div className="space-y-1">
                                      <Skeleton className="h-4 w-32 rounded-xl" />
                                      <Skeleton className="h-3 w-24 rounded-xl" />
                                      <div className="flex gap-1">
                                        <Skeleton className="h-5 w-16 rounded-full" />
                                        <Skeleton className="h-5 w-14 rounded-full" />
                                      </div>
                                    </div>
                                  </div>
                                  <Skeleton className="h-6 w-6 rounded-xl" />
                                </div>
                              </div>
                            ))}
                          >
                            {availableDeliveries.length > 0 ?
                              availableDeliveries.map(delivery => (
                                <Button
                                  key={delivery.uuid}
                                  variant="flat"
                                  color="default"
                                  className="w-full justify-start p-0 h-auto bg-background hover:bg-success-50 border border-default-200 hover:border-success-300 transition-all duration-200"
                                  onPress={() => {
                                    setShowAcceptDeliveryModal(false);
                                    handleAcceptDelivery(delivery.uuid);
                                  }}
                                  isDisabled={isAcceptingDelivery}
                                >
                                  <div className="flex items-center justify-between w-full p-3">
                                    <div className="flex items-center space-x-3">
                                      <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center shadow-sm">
                                        <Icon icon="mdi:package-variant" className="text-primary-600 text-base" />
                                      </div>
                                      <div className="flex flex-col items-start space-y-1">
                                        <span className="font-semibold text-left text-default-800 text-sm">
                                          {inventoryItems.find(i => i.uuid === delivery.inventory_uuid)?.name || 'Unknown Item'}
                                        </span>
                                        <p className="text-xs text-default-600 text-left max-w-40 truncate">
                                          {delivery.delivery_address}
                                        </p>
                                        <div className="flex items-center space-x-1">
                                          <Chip size="sm" variant="flat" color="primary" className="text-xs h-5">
                                            <div className="flex items-center gap-1">
                                              <Icon icon="mdi:calendar" className="text-xs" />
                                              {formatDate(delivery.delivery_date)}
                                            </div>
                                          </Chip>
                                          <Chip size="sm" variant="flat" color="secondary" className="text-xs h-5">
                                            <div className="flex items-center gap-1">
                                              <Icon icon="mdi:cube-outline" className="text-xs" />
                                              {delivery.inventory_item_bulk_uuids?.length || 0} bulks
                                            </div>
                                          </Chip>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center">
                                      <Icon icon="mdi:chevron-right" className="text-default-400 text-base" />
                                    </div>
                                  </div>
                                </Button>
                              ))
                              : (
                                [<div key="no-deliveries" className="text-center py-8 space-y-3 h-56 flex flex-col items-center justify-center">
                                  <div className="w-12 h-12 bg-default-100 rounded-full flex items-center justify-center mx-auto">
                                    <Icon icon="mdi:truck-remove" className="text-default-500 text-lg" />
                                  </div>
                                  <div className="space-y-1">
                                    <h4 className="font-semibold text-default-700 text-sm">No deliveries available</h4>
                                    <p className="text-xs text-default-500 max-w-sm mx-auto">
                                      Only in transit deliveries assigned to you will appear here for acceptance
                                    </p>
                                  </div>
                                </div>]
                              )}
                          </ListLoadingAnimation>
                        </ScrollShadow>
                      </CardBody>
                      {/* Footer section */}
                      <CardFooter>
                        <div className="w-full space-y-3">
                          {/* {availableDeliveries.length > 0 && ( */}
                          <div className="bg-default-50 rounded-xl p-3 border border-default-200">
                            <div className="flex items-start gap-2">
                              <Icon icon="mdi:information-outline" className="text-primary-500 text-sm mt-0.5 flex-shrink-0" />
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-default-700">Quick acceptance:</p>
                                <p className="text-xs text-default-600">
                                  Click on any delivery item above to instantly accept and mark it as delivered
                                </p>
                              </div>
                            </div>
                          </div>
                          {/* )} */}

                          <Button
                            key="refresh-button"
                            variant="flat"
                            color="primary"
                            className="w-full"
                            onPress={() => loadAvailableDeliveries()}
                            startContent={isLoadingAvailableDeliveries ? <Spinner size="sm" color="primary" /> : <Icon icon="mdi:refresh" className="text-base" />}
                          >
                            Refresh
                          </Button>
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
    </motion.div >
  );
}