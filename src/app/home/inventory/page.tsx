"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Textarea,
  Card,
  CardBody,
  CardHeader,
  CardFooter,
  Divider,
  Select,
  SelectItem,
  Switch,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Pagination,
  Skeleton,
  NumberInput,
  Form,
  Avatar,
  ListboxItem,
  Listbox,
  Badge,
  Spinner,
} from "@heroui/react";
import { useInfiniteScroll } from "@heroui/use-infinite-scroll";
import { Icon } from "@iconify-icon/react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import { FloorConfig, generateShelfOccupancyMatrix, ShelfLocation, ShelfSelector3D } from "@/components/shelf-selector-3d-v3";
import { useTheme } from "next-themes";
import { herouiColor } from "@/utils/colors";

// Import server actions
import {
  checkAdminStatus,
  createInventoryItem,
  getUnitOptions,
  getFloorOptions,
  getInventoryItems,
  getOccupiedShelfLocations,
} from "./actions";

import CardList from "@/components/card-list";
import { motionTransition } from "@/utils/anim";

interface LocationData {
  company_uuid: string;
  floor: number | null;
  column: number | null;
  row: number | null;
  cabinet: number | null;
}

interface InventoryItem {
  id: string;
  uuid: string;
  admin_uuid: string;
  company_uuid: string;
  item_code: string;
  item_name: string;
  description: string | null;
  quantity: number;
  unit: string;
  ending_inventory: number;
  netsuite: number | null;
  variance: number | null;
  location: LocationData;
}

export default function InventoryPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUUID, setAdminUUID] = useState("");
  const [companyUUID, setCompanyUUID] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [floorOptions, setFloorOptions] = useState<string[]>([]);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Inventory list state
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Inside the component, add state for ShelfSelector3D controls
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(null);
  const [isFloorChangeAnimate, setIsFloorChangeAnimate] = useState<boolean>(true);
  const [isShelfChangeAnimate, setIsShelfChangeAnimate] = useState<boolean>(true);
  const [isCabinetChangeAnimate, setIsCabinetChangeAnimate] = useState<boolean>(false);
  const [isSelectedLocationOccupied, setIsSelectedLocationOccupied] = useState(false);


  // Add this state near your other state declarations
  const [externalSelection, setExternalSelection] = useState<ShelfLocation | undefined>(undefined);
  // Inside your component, add this state
  const [occupiedLocations, setOccupiedLocations] = useState<ShelfLocation[]>([]);


  // Inside the InventoryPage component, add custom colors
  const [customColors, setCustomColors] = useState({
    backgroundColor: "#f0f7ff", // Light blue background
    floorColor: "#e0e0e0",      // Light gray floor
    floorHighlightedColor: "#c7dcff", // Highlighted floor
    cabinetColor: "#aaaaaa",    // Cabinet color
    cabinetSelectedColor: "#4a80f5", // Selected cabinet
    shelfColor: "#dddddd",      // Default shelf
    shelfHoverColor: "#ffb74d", // Hover orange
    shelfSelectedColor: "#ff5252", // Selected red
    occupiedShelfColor: "#8B0000", // Occupied red
    occupiedHoverShelfColor: "#BB3333", // New occupied hover color - lighter red
    textColor: "#2c3e50",       // Dark blue text
  });


  const { theme } = useTheme()

  const updateHeroUITheme = () => {
    setTimeout(() => {
      setCustomColors({
        backgroundColor: herouiColor('primary-50', 'hex') as string,
        floorColor: herouiColor('primary-200', 'hex') as string,
        floorHighlightedColor: herouiColor('primary-300', 'hex') as string,
        cabinetColor: herouiColor('default', 'hex') as string,
        cabinetSelectedColor: herouiColor('primary', 'hex') as string,
        shelfColor: herouiColor('default-600', 'hex') as string,
        shelfHoverColor: herouiColor('primary-400', 'hex') as string,
        shelfSelectedColor: herouiColor('primary', 'hex') as string,
        occupiedShelfColor: herouiColor('danger', 'hex') as string,
        occupiedHoverShelfColor: herouiColor('danger-400', 'hex') as string, // Add danger-400 for hover
        textColor: herouiColor('text', 'hex') as string,
      });
    }, 100);
  };

  const checkIfLocationOccupied = (location: ShelfLocation) => {
    return occupiedLocations.some(
      loc =>
        loc.floor === location.floor &&
        loc.cabinet_id === location.cabinet_id &&
        loc.cabinet_row === location.cabinet_row &&
        loc.cabinet_column === location.cabinet_column
    );
  };

  useEffect(() => {
    updateHeroUITheme();
  }, [theme])

  useEffect(() => {
    updateHeroUITheme();
  }, []);

  // Form state
  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    company_uuid: "",
    item_code: "",
    item_name: "",
    description: "",
    quantity: 0,
    unit: "",
    ending_inventory: 0,
    netsuite: null,
    variance: null,
    location: {
      company_uuid: "",
      floor: null,
      column: null,
      row: null,
      cabinet: null
    }
  });

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  }

  // Location state - change from strings to numbers and add columnCode for the letter representation
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedColumnCode, setSelectedColumnCode] = useState<string>("");
  const [selectedColumn, setSelectedColumn] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedCabinet, setSelectedCabinet] = useState<number | null>(null);
  const [selectedCode, setSelectedCode] = useState("");

  // Add state for temporary modal selections - use numbers instead of strings
  const [tempSelectedFloor, setTempSelectedFloor] = useState<number | null>(null);
  const [tempSelectedColumnCode, setTempSelectedColumnCode] = useState<string>("");
  const [tempSelectedColumn, setTempSelectedColumn] = useState<number | null>(null);
  const [tempSelectedRow, setTempSelectedRow] = useState<number | null>(null);
  const [tempSelectedCabinet, setTempSelectedCabinet] = useState<number | null>(null);
  const [tempSelectedCode, setTempSelectedCode] = useState("");

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Define floor configurations for ShelfSelector3D
  const floorConfigs: FloorConfig[] = [
    {
      height: 3,
      matrix: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ]
    },
    {
      height: 3,
      matrix: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ]
    }
  ];

  // Add state for maximum values
  const [maxCabinetId, setMaxCabinetId] = useState(0);
  const [maxRow, setMaxRow] = useState(0);
  const [maxColumn, setMaxColumn] = useState(0);

  // Convert column to Excel style (AA = 0, AB = 1, etc.)
  const parseColumn = (column: number | null) => {
    if (column === null || column === undefined) return null;

    const firstChar = String.fromCharCode(65 + Math.floor(column / 26));
    const secondChar = String.fromCharCode(65 + (column % 26));
    const colStr = column !== undefined && column !== null ?
      firstChar + secondChar :
      null;
    return colStr;
  }

  const formatCode = (location: ShelfLocation | any) => {
    // Format the location code
    const { floor, cabinet_id: cabinet, cabinet_row: row, cabinet_column: column } = location;
    const colStr = parseColumn(column);

    // Format with leading zeros: floor (2 digits), row (2 digits), cabinet (3 digits)
    const floorStr = floor !== undefined && floor !== null ?
      floor.toString().padStart(2, '0') : "???";
    const rowStr = row !== undefined && row !== null ?
      row.toString().padStart(2, '0') : "???";
    const cabinetStr = cabinet !== undefined && cabinet !== null ?
      cabinet.toString().padStart(3, '0') : "???";

    return `F${floorStr}${colStr}${rowStr}C${cabinetStr}`;
  }


  // Update the handleShelfSelection function to check if selected location is occupied
  const handleShelfSelection = (location: ShelfLocation) => {
    const floorNumber = location.floor;
    const columnNumber = location.cabinet_column;
    const columnCode = String.fromCharCode(65 + columnNumber);
    const rowNumber = location.cabinet_row;
    const cabinetNumber = location.cabinet_id;

    console.log("Selected Floor:", floorNumber, "Column:", columnNumber, "Row:", rowNumber, "Cabinet:", cabinetNumber);


    // Update temporary selections with numerical values
    setTempSelectedFloor(floorNumber);
    setTempSelectedColumn(columnNumber);
    setTempSelectedColumnCode(columnCode);
    setTempSelectedRow(rowNumber);
    setTempSelectedCabinet(cabinetNumber);

    // Use formatCode for consistent code formatting
    setTempSelectedCode(formatCode(location));

    // Set the highlighted floor
    setHighlightedFloor(location.floor);

    // Update maximum values if available
    if (location.max_cabinet_id !== undefined) setMaxCabinetId(location.max_cabinet_id);
    if (location.max_row !== undefined) setMaxRow(location.max_row);
    if (location.max_column !== undefined) setMaxColumn(location.max_column);

    // Check if location is occupied
    setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
  };

  // Add a helper function to update the occupied status after selection changes
  const updateLocationOccupiedStatus = () => {
    if (highlightedFloor !== null && tempSelectedCabinet !== null &&
      tempSelectedRow !== null && tempSelectedColumn !== null) {
      const location = {
        floor: highlightedFloor,
        cabinet_id: tempSelectedCabinet,
        cabinet_row: tempSelectedRow,
        cabinet_column: tempSelectedColumn
      };
      setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
    }
  };

  // Update the handle functions to check for occupation after selection and use formatCode
  const handleFloorChange = (floorNum: number) => {
    const floorIndex = floorNum - 1;
    setTempSelectedFloor(floorIndex);
    setHighlightedFloor(floorIndex);

    if (tempSelectedCabinet !== null) {
      const location = {
        floor: floorIndex,
        cabinet_id: tempSelectedCabinet,
        cabinet_row: tempSelectedRow !== null ? tempSelectedRow : 0,
        cabinet_column: tempSelectedColumn !== null ? tempSelectedColumn : 0
      };
      setExternalSelection(location);

      // Use formatCode for consistent formatting
      setTempSelectedCode(formatCode(location));

      // Check if new location is occupied
      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleCabinetChange = (cabinetId: number) => {
    const adjustedId = cabinetId - 1;
    setTempSelectedCabinet(adjustedId);

    if (tempSelectedFloor !== null && highlightedFloor !== null) {
      const location = {
        floor: highlightedFloor,
        cabinet_id: adjustedId,
        cabinet_row: tempSelectedRow !== null ? tempSelectedRow : 0,
        cabinet_column: tempSelectedColumn !== null ? tempSelectedColumn : 0
      };
      setExternalSelection(location);

      // Use formatCode for consistent formatting
      setTempSelectedCode(formatCode(location));

      // Check if new location is occupied
      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleRowChange = (rowNum: number) => {
    const adjustedRow = rowNum - 1;
    setTempSelectedRow(adjustedRow);

    if (tempSelectedFloor !== null && highlightedFloor !== null && tempSelectedCabinet !== null) {
      const location = {
        floor: highlightedFloor,
        cabinet_id: tempSelectedCabinet,
        cabinet_row: adjustedRow,
        cabinet_column: tempSelectedColumn !== null ? tempSelectedColumn : 0
      };
      setExternalSelection(location);

      // Use formatCode for consistent formatting
      setTempSelectedCode(formatCode(location));

      // Check if new location is occupied
      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleColumnChange = (colNum: number) => {
    const adjustedCol = colNum - 1;
    const colLetter = String.fromCharCode(64 + colNum);

    setTempSelectedColumn(adjustedCol);
    setTempSelectedColumnCode(colLetter);

    if (tempSelectedFloor !== null && highlightedFloor !== null && tempSelectedCabinet !== null) {
      const location = {
        floor: highlightedFloor,
        cabinet_id: tempSelectedCabinet,
        cabinet_row: tempSelectedRow !== null ? tempSelectedRow : 0,
        cabinet_column: adjustedCol
      };
      setExternalSelection(location);

      // Use formatCode for consistent formatting
      setTempSelectedCode(formatCode(location));

      // Check if new location is occupied
      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  // Modified modal open handler to also check occupation status
  const handleOpenModal = () => {
    setTempSelectedFloor(selectedFloor);
    setTempSelectedColumn(selectedColumn);
    setTempSelectedColumnCode(selectedColumnCode);
    setTempSelectedRow(selectedRow);
    setTempSelectedCabinet(selectedCabinet);
    setTempSelectedCode(selectedCode);

    if (selectedFloor !== null && selectedColumn !== null &&
      selectedRow !== null && selectedCabinet !== null) {
      setHighlightedFloor(selectedFloor);

      const location = {
        floor: selectedFloor,
        cabinet_id: selectedCabinet,
        cabinet_row: selectedRow,
        cabinet_column: selectedColumn
      };

      setExternalSelection(location);

      // Check if current location is occupied
      setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
    }

    onOpen();
  };

  const handleConfirmLocation = () => {
    setSelectedFloor(tempSelectedFloor);
    setSelectedColumn(tempSelectedColumn);
    setSelectedColumnCode(tempSelectedColumnCode);
    setSelectedRow(tempSelectedRow);
    setSelectedCabinet(tempSelectedCabinet);

    // Generate and set the location code
    const locationCode = tempSelectedCode;
    setSelectedCode(locationCode);

    // Update formData to include location_code
    setFormData(prev => ({
      ...prev,
      location_code: locationCode
    }));

    onClose();
  };

  // Cancel location handler 
  const handleCancelLocation = () => {
    setTempSelectedFloor(selectedFloor);
    setTempSelectedColumn(selectedColumn);
    setTempSelectedColumnCode(selectedColumnCode);
    setTempSelectedRow(selectedRow);
    setTempSelectedCabinet(selectedCabinet);
    setTempSelectedCode(selectedCode);
    onClose();
  }

  // Load more inventory items
  const loadMoreItems = async () => {
    if (!hasMore || isLoadingItems) return;

    try {
      setIsLoadingItems(true);
      const nextPage = page + 1;
      const result = await getInventoryItems({
        page: nextPage,
        pageSize: 10,
        search: searchQuery,
        companyUuid: companyUUID
      });

      if (result.data && result.data.length > 0) {
        setInventoryItems(prev => [...prev, ...result.data]);
        setPage(nextPage);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error loading more items:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };


  // Infinite scroll for inventory list
  const [, scrollRef] = useInfiniteScroll({
    hasMore,
    onLoadMore: loadMoreItems,
  });

  // Handle item search
  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    try {
      setIsLoadingItems(true);
      setPage(1);
      setHasMore(true);

      const result = await getInventoryItems({
        page: 1,
        pageSize: 10,
        search: query,
        companyUuid: companyUUID
      });

      setInventoryItems(result.data || []);
    } catch (error) {
      console.error("Error searching items:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // In handleSelectItem function:
  const handleSelectItem = (key: string) => {
    const item = inventoryItems.find(i => i.uuid === key) as InventoryItem;
    if (!item) return;

    setSelectedItemId(item.uuid);
    setFormData({
      ...item,
      admin_uuid: adminUUID,
    });

    // Update location fields - convert strings to numbers
    if (item.location) {
      const floorNumber = item.location.floor || null;
      const columnNumber = item.location.column;
      const rowNumber = item.location.row;
      const cabinetNumber = item.location.cabinet;

      setSelectedFloor(floorNumber);
      setSelectedColumnCode(parseColumn(columnNumber) || "");
      setSelectedColumn(item.location.column);
      setSelectedRow(rowNumber);
      setSelectedCabinet(cabinetNumber);

      // Create a location object and use formatCode
      const location = {
        floor: floorNumber,
        cabinet_id: cabinetNumber,
        cabinet_row: rowNumber,
        cabinet_column: columnNumber
      };

      const code = formatCode(location);
      setSelectedCode(code);

      // Ensure location_code is updated in formData
      setFormData(prev => ({
        ...prev,
        location_code: code
      }));
    }
  };

  // Add this to your initPage function or create a separate function
  const fetchOccupiedLocations = async () => {
    try {
      const result = await getOccupiedShelfLocations(adminUUID);
      if (result.success) {
        setOccupiedLocations(result.data);
      }
    } catch (error) {
      console.error("Error fetching occupied locations:", error);
    }
  };

  // Fetch admin status and options when component mounts
  useEffect(() => {
    const initPage = async () => {
      try {
        const adminData = await checkAdminStatus();
        setIsAdmin(true);
        setAdminUUID(adminData.uuid);
        setCompanyUUID(adminData.company.uuid);

        console.log("Admin Data:", adminData);

        setFormData(prev => ({
          ...prev,
          admin_uuid: adminData.uuid,
          company_uuid: adminData.company.uuid,
          location: {
            ...prev.location!,
            company_uuid: adminData.company.uuid
          }
        }));

        const units = await getUnitOptions();
        const floors = await getFloorOptions();

        setUnitOptions(units);
        setFloorOptions(floors);

        // Fetch initial inventory items
        const items = await getInventoryItems({
          page: 1,
          pageSize: 10,
          companyUuid: adminData.company.uuid
        });

        setInventoryItems(items.data || []);
        setIsLoadingItems(false);

        // Fetch occupied shelf locations
        const locationsResult = await getOccupiedShelfLocations(adminData.company.uuid);
        if (locationsResult.success) {
          setOccupiedLocations(locationsResult.data);
          console.log("Occupied locations:", locationsResult.data);
        }
      } catch (error) {
        console.error("Error initializing page:", error);
      }
    };

    initPage();
  }, []);

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

  useEffect(() => {
    if (selectedFloor !== null && selectedColumnCode && selectedRow !== null && selectedCabinet !== null) {
      // Create the location object
      const location = {
        floor: selectedFloor,
        cabinet_id: selectedCabinet,
        cabinet_row: selectedRow,
        cabinet_column: selectedColumn !== null ? selectedColumn : 0
      };

      // Generate the location code
      const code = formatCode(location);

      setFormData(prev => ({
        ...prev,
        location: {
          ...prev.location!,
          floor: selectedFloor,
          column: selectedColumn,
          row: selectedRow,
          cabinet: selectedCabinet
        },
        location_code: code // Set the location_code field
      }));

      setSelectedCode(code);
    }
  }, [selectedFloor, selectedColumn, selectedColumnCode, selectedRow, selectedCabinet]);

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log("Form Data:", formData);

    const newErrors: Record<string, string> = {};
    if (!formData.item_code) newErrors.item_code = "Item code is required";
    if (!formData.item_name) newErrors.item_name = "Item name is required";
    if (!formData.quantity || formData.quantity <= 0) newErrors.quantity = "Valid quantity is required";
    if (!formData.unit) newErrors.unit = "Unit is required";
    if (formData.ending_inventory === undefined || formData.ending_inventory < 0) newErrors.ending_inventory = "Valid ending inventory is required";
    if (formData.location!.floor === null) newErrors["location.floor"] = "Floor is required";
    if (formData.location!.column === null) newErrors["location.column"] = "Column is required";
    if (formData.location!.row === null) newErrors["location.row"] = "Row is required";
    if (formData.location!.cabinet === null) newErrors["location.cabinet"] = "Cabinet is required";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      const result = await createInventoryItem(formData as any);

      if (result.success) {
        // Reset page to 1 and refresh inventory list
        setPage(1);

        // Refresh the inventory items list
        const refreshedItems = await getInventoryItems({
          page: 1,
          pageSize: 10,
          search: searchQuery,
          companyUuid: companyUUID
        });

        setInventoryItems(refreshedItems.data || []);
        setHasMore(refreshedItems.data?.length >= 10);

        // Clear form if it's a new item, or select the updated item
        if (!selectedItemId) {
          // If new item was created, reset form
          setFormData({
            company_uuid: companyUUID,
            admin_uuid: adminUUID,
            item_code: "",
            item_name: "",
            description: "",
            quantity: 0,
            unit: "",
            ending_inventory: 0,
            netsuite: null,
            variance: null,
            location: {
              company_uuid: companyUUID,
              floor: null,
              column: null,
              row: null,
              cabinet: null,
            }
          });
          setSelectedFloor(null);
          setSelectedColumn(null);
          setSelectedRow(null);
          setSelectedCabinet(null);
          setSelectedCode("");
        } else if (result.data) {
          if ((result.data as any).uuid)
            setSelectedItemId((result.data as any).uuid);
        }

        // Clear any previous errors
        setErrors({});

        // You could add a success message here if you have a toast notification system
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Error submitting inventory item:", error);
      alert("Failed to save inventory item. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-2 gap-6 flex flex-col max-w-4xl">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Inventory Management</h1>
            <p className="text-default-500">Manage your inventory items efficiently.</p>
          </div>
          <Skeleton className="h-10 w-40 rounded-xl" /> {/* Save button */}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Basic Information Skeleton */}
          <CardList>
            <div>
              <Skeleton className="h-6 w-48 mx-auto rounded-xl mb-5" /> {/* Section Title */}
              <div className="space-y-4">
                <div className="flex gap-4">
                  <Skeleton className="h-16 w-full rounded-xl" /> {/* Item Code */}
                  <Skeleton className="h-16 w-full rounded-xl" /> {/* Item Name */}
                </div>
                <Skeleton className="h-36 w-full rounded-xl" /> {/* Description */}
              </div>
            </div>
          </CardList>

          {/* Quantity & Costs Skeleton */}
          <CardList>
            <div>
              <Skeleton className="h-6 w-48 mx-auto rounded-xl mb-5" /> {/* Section Title */}
              <div className="space-y-4">
                <div className="flex gap-4">
                  <Skeleton className="h-16 w-full rounded-xl" /> {/* Quantity */}
                  <Skeleton className="h-16 w-full rounded-xl" /> {/* Unit */}
                </div>
                <Skeleton className="h-16 w-full rounded-xl" /> {/* Ending Inventory */}
                <div className="flex gap-4">
                  <Skeleton className="h-16 w-full rounded-xl" /> {/* Netsuite */}
                  <Skeleton className="h-16 w-full rounded-xl" /> {/* Variance */}
                </div>
              </div>
            </div>
          </CardList>

          {/* Item Location Skeleton */}
          <div className="col-span-1 lg:col-span-2">
            <CardList>
              <div>
                <Skeleton className="h-6 w-48 mx-auto rounded-xl mb-5" /> {/* Section Title */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Skeleton className="h-16 rounded-xl" /> {/* Floor Level */}
                    <Skeleton className="h-16 rounded-xl" /> {/* Column */}
                    <Skeleton className="h-16 rounded-xl" /> {/* Row */}
                    <Skeleton className="h-16 rounded-xl" /> {/* Cabinet */}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <Skeleton className="h-8 w-32 rounded-xl" /> {/* Location Code Chip */}
                    <Skeleton className="h-10 w-48 rounded-xl" /> {/* Open Floorplan Button */}
                  </div>
                </div>
              </div>
            </CardList>
          </div>
        </div>
      </div>
    );
  }

  const handleAnimationToggle = (type: 'floor' | 'shelf' | 'cabinet', value: boolean) => {
    if (type === 'floor') setIsFloorChangeAnimate(value);
    else if (type === 'shelf') setIsShelfChangeAnimate(value);
    else if (type === 'cabinet') setIsCabinetChangeAnimate(value);
  };


  return (
    <div className="container mx-auto p-2 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Inventory Management</h1>
          <p className="text-default-500">Manage your inventory items efficiently.</p>
        </div>
        <div className="flex gap-4">
          {!isLoadingItems && inventoryItems.length > 0 && (
            <div className="mt-4 text-center">
              <Button
                color="primary"
                variant="shadow"
                onPress={() => {
                  setFormData({
                    uuid: companyUUID,
                    item_code: "",
                    item_name: "",
                    description: "",
                    quantity: 0,
                    unit: "",
                    ending_inventory: 0,
                    netsuite: null,
                    variance: null,
                    location: {
                      company_uuid: companyUUID,
                      floor: null,
                      column: null,
                      row: null,
                      cabinet: null,
                    }
                  });
                  setSelectedItemId(null);
                  setSelectedFloor(null);
                  setSelectedColumn(null);
                  setSelectedRow(null);
                  setSelectedCabinet(null);
                  setSelectedCode("");
                }}
              >
                New Item
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col lg:flex-row gap-4 ">
        {/* Left side: Inventory List */}
        <div className="lg:w-1/3 shadow-xl shadow-primary/10 min-h-[32rem] 
            min-w-[350px] rounded-2xl overflow-hidden bg-background border border-default-200"
        >
          <div className="flex flex-col h-full relative">
            <div className="p-4 absolute w-full z-20 top-0 bg-background/50 border-b border-default-200 backdrop-blur-lg">
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Inventory Items</h2>
              <Input
                placeholder="Search items..."
                value={searchQuery}
                onChange={handleSearch}
                startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
              />
            </div>
            <div className="h-full absolute w-full">
              {!isLoadingItems && inventoryItems.length !== 0 && (
                <Listbox
                  classNames={{ list: 'space-y-4 p-3 overflow-y-auto pt-32', base: 'h-full' }}
                  onSelectionChange={(item) => handleSelectItem((item as Set<string>).values().next().value || "")}
                  selectedKeys={[selectedItemId || ""]}
                  ref={scrollRef}
                  selectionMode="single">
                  {inventoryItems.map((item) => (
                    <ListboxItem
                      key={item.uuid}
                      as={Button}
                      onPress={() => handleSelectItem(item.uuid)}
                      variant="shadow"
                      className={`w-full min-h-28 !transition-all duration-200 rounded-xl px-0 py-4 ${selectedItemId === item.uuid ?
                        '!bg-primary hover:!bg-primary-400 !shadow-lg hover:!shadow-md hover:!shadow-primary-200 !shadow-primary-200' :
                        '!bg-default-100/50 hover:!bg-default-200 !shadow-2xs hover:!shadow-md hover:!shadow-default-200 !shadow-default-200'}`}
                      hideSelectedIcon
                    >
                      <div className="flex justify-between items-start px-0">
                        <div className="flex-1">
                          <div className="flex items-center justify-between px-4">
                            <span className="font-semibold">{item.item_name}</span>
                            <Chip color="default" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">{item.item_code}</Chip>
                          </div>
                          {item.description &&
                            <p className={`text-sm px-4 ${selectedItemId === item.uuid ? 'text-default-800 ' : 'text-default-600'} line-clamp-1 text-start`}>
                              {item.description}
                            </p>
                          }
                          <div className={`flex items-center gap-2 mt-3 border-t ${selectedItemId === item.uuid ? 'border-primary-300' : 'border-default-100'} px-4 pt-4`}>
                            <Chip color="secondary" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                              {item.quantity} {item.unit}
                            </Chip>
                            <Chip color="success" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                              ₱{item.ending_inventory.toFixed(2)}
                            </Chip>
                            <Chip color="danger" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                              {formatCode({
                                floor: item.location?.floor,
                                cabinet_column: item.location?.column,
                                cabinet_row: item.location?.row,
                                cabinet_id: item.location?.cabinet
                              })}
                            </Chip>
                          </div>
                        </div>
                      </div>
                    </ListboxItem>
                  ))}
                </Listbox>
              )}
            </div>

            {isLoadingItems && (
              <div className="py-4 flex left-[50%] top-[50%] absolute translate-x-[-50%] translate-y-[-50%] absolute">
                <Spinner size="sm" />
              </div>
            )}
          </div>
        </div>

        {/* Right side: Item Form */}
        <div className="lg:w-2/3">
          <Form id="inventoryForm" onSubmit={handleSubmit} className="items-stretch space-y-4">
            <CardList>
              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Basic Information</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2  gap-4">
                    <Input
                      name="item_code"
                      label="Item Code"
                      classNames={inputStyle}
                      placeholder="Enter item code"
                      value={formData.item_code || ""}
                      onChange={handleInputChange}
                      isRequired
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
                      isRequired
                      isInvalid={!!errors.item_name}
                      errorMessage={errors.item_name}
                      startContent={<Icon icon="mdi:package-variant" className="text-default-500 pb-[0.1rem]" />}
                    />
                  </div>

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
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Quantity & Costs</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                    <NumberInput
                      name="quantity"
                      classNames={inputStyle}
                      label="Quantity"
                      placeholder="0"
                      minValue={0}
                      maxValue={999999}
                      step={1}
                      value={formData.quantity}
                      onValueChange={(e) => setFormData({ ...formData, quantity: e })}
                      isRequired
                      isInvalid={!!errors.quantity}
                      errorMessage={errors.quantity}
                      startContent={<Icon icon="mdi:numeric" className="text-default-500 pb-[0.1rem]" />}
                    />

                    <Select
                      name="unit"
                      label="Unit"
                      placeholder="Select unit"
                      value={formData.unit || ""}
                      onChange={handleInputChange}
                      isRequired
                      classNames={{ trigger: inputStyle.inputWrapper }}
                      isInvalid={!!errors.unit}
                      errorMessage={errors.unit}
                    >
                      {unitOptions.map((unit) => (
                        <SelectItem key={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </Select>
                  </div>

                  <NumberInput
                    name="ending_inventory"
                    classNames={inputStyle}
                    label="Ending Inventory (Cost)"
                    placeholder="0.00"
                    minValue={0}
                    maxValue={999999}
                    value={formData.ending_inventory}
                    onValueChange={(e) => setFormData({ ...formData, ending_inventory: e })}
                    isRequired
                    isInvalid={!!errors.ending_inventory}
                    errorMessage={errors.ending_inventory}
                    startContent={<Icon icon="mdi:currency-php" className="text-default-500 pb-[0.1rem]" />}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                    <NumberInput
                      name="netsuite"
                      classNames={inputStyle}
                      label="Netsuite (Optional)"
                      placeholder="0.00"
                      onValueChange={(e) => setFormData({ ...formData, netsuite: e })}
                      value={formData.netsuite || 0}
                      startContent={<Icon icon="mdi:database" className="text-default-500 pb-[0.1rem]" />}
                    />

                    <NumberInput
                      name="variance"
                      classNames={inputStyle}
                      label="Variance (Optional)"
                      placeholder="0.00"
                      onValueChange={(e) => setFormData({ ...formData, variance: e })}
                      value={formData.variance || 0}
                      startContent={<Icon icon="mdi:chart-line-variant" className="text-default-500 pb-[0.1rem]" />}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Item Location</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">

                    <NumberInput
                      name="location.floor"
                      classNames={inputStyle}
                      label="Floor"
                      placeholder="e.g. 1"
                      maxValue={floorOptions.length - 1}
                      minValue={1}
                      // Display floor as 1-indexed but store as 0-indexed
                      value={selectedFloor !== null ? selectedFloor + 1 : 0}
                      onValueChange={(e) => setSelectedFloor(e - 1)}
                      isRequired
                      isInvalid={!!errors["location.floor"]}
                      errorMessage={errors["location.floor"]}
                    />

                    <Input
                      name="location.column"
                      classNames={inputStyle}
                      label="Column"
                      placeholder="e.g. A"
                      value={selectedColumnCode || ""}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setSelectedColumnCode(val);
                        if (val) {
                          setSelectedColumn(val.charCodeAt(0) - 65);
                        }
                      }}
                      isRequired
                      isInvalid={!!errors["location.column"]}
                      errorMessage={errors["location.column"]}
                    />

                    <NumberInput
                      name="location.row"
                      classNames={inputStyle}
                      label="Row"
                      minValue={1}
                      placeholder="e.g. 1"
                      // Display row as 1-indexed but store as 0-indexed
                      value={selectedRow !== null ? selectedRow + 1 : 0}
                      onValueChange={(e) => setSelectedRow(e - 1)}
                      isRequired
                      isInvalid={!!errors["location.row"]}
                      errorMessage={errors["location.row"]}
                    />

                    <NumberInput
                      name="location.cabinet"
                      classNames={inputStyle}
                      label="Cabinet"
                      minValue={1}
                      placeholder="e.g. 1"
                      // Display cabinet as 1-indexed but store as 0-indexed
                      value={selectedCabinet !== null ? selectedCabinet + 1 : 0}
                      onValueChange={(e) => setSelectedCabinet(e - 1)}
                      isRequired
                      isInvalid={!!errors["location.cabinet"]}
                      errorMessage={errors["location.cabinet"]}
                    />
                  </div>

                  <div className="mt-4 rounded-md flex flex-row items-center justify-between gap-3">
                    <Chip className="mb-2 sm:mb-0">
                      CODE: <b>{selectedCode}</b>
                    </Chip>
                    <Button color="primary" onClick={handleOpenModal}>
                      Open Floorplan
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex justify-center">
                <Button
                  type="submit"
                  form="inventoryForm"
                  color="primary"
                  variant="shadow"
                  isLoading={isLoading}
                  className="mb-2 w-full max-w-[200px]"
                >
                  Save Item
                </Button>
              </div>
            </CardList>
          </Form>
        </div>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={handleCancelLocation}
        placement='auto'
        classNames={{
          backdrop: "bg-background/50",
          wrapper: 'overflow-hidden',
        }}
        backdrop="blur"
        size="5xl">
        <ModalContent>
          <ModalHeader>Interactive Warehouse Floorplan</ModalHeader>
          <ModalBody className='p-0'>
            <div className="h-[80vh] bg-primary-50 rounded-md overflow-hidden relative">
              <ShelfSelector3D
                floors={floorConfigs}
                onSelect={handleShelfSelection}
                occupiedLocations={occupiedLocations}
                canSelectOccupiedLocations={true}
                className="w-full h-full"
                highlightedFloor={highlightedFloor}
                onHighlightFloor={setHighlightedFloor}
                isFloorChangeAnimate={isFloorChangeAnimate}
                isShelfChangeAnimate={isShelfChangeAnimate}
                isCabinetChangeAnimate={isCabinetChangeAnimate}
                externalSelection={externalSelection}
                cameraOffsetY={-0.25}
                backgroundColor={customColors.backgroundColor}
                floorColor={customColors.floorColor}
                floorHighlightedColor={customColors.floorHighlightedColor}
                cabinetColor={customColors.cabinetColor}
                cabinetSelectedColor={customColors.cabinetSelectedColor}
                shelfColor={customColors.shelfColor}
                shelfHoverColor={customColors.shelfHoverColor}
                shelfSelectedColor={customColors.shelfSelectedColor}
                occupiedShelfColor={customColors.occupiedShelfColor}
                occupiedHoverShelfColor={customColors.occupiedHoverShelfColor}
                textColor={customColors.textColor}
              />

              <AnimatePresence>
                {tempSelectedCode &&
                  <motion.div
                    {...motionTransition}
                    className="absolute bottom-4 left-4 flex flex-col gap-2 bg-background/50 rounded-2xl backdrop-blur-lg md:w-auto w-[calc(100%-2rem)]">
                    <div className="grid md:grid-cols-2 grid-cols-1 gap-3 p-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Floor</span>
                          <Pagination
                            classNames={{ item: "bg-default/25" }}
                            initialPage={0}
                            size="sm"
                            page={(tempSelectedFloor || 0) + 1}
                            total={floorConfigs.length}
                            onChange={handleFloorChange}
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Cabinet</span>
                          <Pagination
                            classNames={{ item: "bg-default/25" }}
                            initialPage={1}
                            size="sm"
                            page={(tempSelectedCabinet || 0) + 1}
                            total={maxCabinetId + 1}
                            onChange={handleCabinetChange}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 md:border-default md:border-l md:pl-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Row</span>
                          <Pagination
                            classNames={{ item: "bg-default/25" }}
                            initialPage={1}
                            size="sm"
                            page={(tempSelectedRow || 0) + 1}
                            total={maxRow + 1}
                            onChange={handleRowChange}
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Column</span>
                          <Pagination
                            classNames={{ item: "bg-default/25" }}
                            initialPage={1}
                            size="sm"
                            page={(tempSelectedColumn || 0) + 1}
                            total={maxColumn + 1}
                            onChange={handleColumnChange}
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                }
              </AnimatePresence>

              <AnimatePresence>
                {tempSelectedCode &&
                  <motion.div
                    {...motionTransition}
                    className="absolute top-4 right-4 flex items-center gap-2 bg-background/50 rounded-2xl backdrop-blur-lg">
                    <span className="text-sm font-semibold p-4">CODE: <b>{tempSelectedCode}</b></span>
                  </motion.div>
                }
              </AnimatePresence>


            </div>
          </ModalBody>
          <ModalFooter className="flex justify-end gap-4 p-4">
            <Button color="danger" variant="shadow" onPress={handleCancelLocation}>
              Cancel
            </Button>
            <Button
              color="primary"
              variant="shadow"
              onPress={handleConfirmLocation}
              isDisabled={isSelectedLocationOccupied}
            >
              {isSelectedLocationOccupied ? "Location Occupied" : "Confirm Location"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}