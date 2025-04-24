"use client";

import { FloorConfig, ShelfLocation } from "@/components/shelf-selector-3d-v4";
import { herouiColor } from "@/utils/colors";
import { createClient } from "@/utils/supabase/client";
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
  Pagination,
  Select,
  SelectItem,
  Skeleton,
  Spinner,
  Textarea,
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify-icon/react";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import React, { lazy, memo, Suspense, useEffect, useState } from "react";

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';

// Import server actions
import CardList from "@/components/card-list";
import { motionTransition } from "@/utils/anim";
import {
  checkAdminStatus,
  createInventoryItem,
  getFloorOptions,
  getInventoryItems,
  getOccupiedShelfLocations,
  getUnitOptions,
  updateInventoryItem,
} from "./actions";

interface LocationData {
  floor: number | null;
  column: number | null;
  row: number | null;
  group: number | null;
  depth: number | null;
}

interface InventoryItem {
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
  location_code: string | null;
  status: string | null;
}

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
  const [floorOptions, setFloorOptions] = useState<string[]>([]);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Inventory list state
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Inside the component, add state for ShelfSelector3D controls
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(null);
  const [isFloorChangeAnimate, setIsFloorChangeAnimate] = useState<boolean>(true);
  const [isShelfChangeAnimate, setIsShelfChangeAnimate] = useState<boolean>(true);
  const [isGroupChangeAnimate, setIsGroupChangeAnimate] = useState<boolean>(false);
  const [isSelectedLocationOccupied, setIsSelectedLocationOccupied] = useState(false);

  // Add state for QR code modal
  const [showQrCode, setShowQrCode] = useState(false);

  // Add this state near your other state declarations
  const [externalSelection, setExternalSelection] = useState<ShelfLocation | undefined>(undefined);
  // Inside your component, add this state
  const [occupiedLocations, setOccupiedLocations] = useState<ShelfLocation[]>([]);


  // Inside the InventoryPage component, add custom colors
  const [customColors, setCustomColors] = useState({
    backgroundColor: "#f0f7ff", // Light blue background
    floorColor: "#e0e0e0",      // Light gray floor
    floorHighlightedColor: "#c7dcff", // Highlighted floor
    groupColor: "#aaaaaa",    // Group color
    groupSelectedColor: "#4a80f5", // Selected group
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
        groupColor: herouiColor('default', 'hex') as string,
        groupSelectedColor: herouiColor('primary', 'hex') as string,
        shelfColor: herouiColor('default-600', 'hex') as string,
        shelfHoverColor: herouiColor('primary-400', 'hex') as string,
        shelfSelectedColor: herouiColor('primary', 'hex') as string,
        occupiedShelfColor: herouiColor('danger', 'hex') as string,
        occupiedHoverShelfColor: herouiColor('danger-400', 'hex') as string, // Add danger-400 for hover
        textColor: herouiColor('text', 'hex') as string,
      });
    }, 100);
  };

  const generateProductJson = (space: number = 0) => {
    if (!selectedItemId || !formData) return "{}";

    // Remove data with null, "", or undefined values
    const filteredData = Object.fromEntries(
      Object.entries(formData).filter(([key, value]) =>
        value !== null && value !== "" && value !== undefined &&
        key !== "admin_uuid" && key !== "created_at" && key !== "updated_at" && key !== "status")
    );

    const productData = {
      ...filteredData,
      location: selectedCode || "",
    };

    return JSON.stringify(productData, null, space);
  };

  const checkIfLocationOccupied = (location: ShelfLocation) => {
    return occupiedLocations.some(
      loc =>
        loc.floor === location.floor &&
        loc.group === location.group &&
        loc.row === location.row &&
        loc.column === location.column &&
        (loc.depth === location.depth || loc.depth === undefined)
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
      floor: null,
      column: null,
      row: null,
      depth: null,
      group: null
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
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [selectedCode, setSelectedCode] = useState("");
  const [selectedDepth, setSelectedDepth] = useState<number | null>(null);

  // Add state for temporary modal selections - use numbers instead of strings
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

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Define floor configurations for ShelfSelector3D
  const floorConfigs: FloorConfig[] = [
    {
      height: 3,
      matrix: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
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
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ]
    }
  ];


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
    const { floor, group: group, row: row, column: column, depth: depth = 0 } = location;
    const colStr = parseColumn(column);

    // Format with leading zeros: floor (2 digits), row (2 digits), depth (2 digits), group (2 digits)
    const floorStr = floor !== undefined && floor !== null ?
      floor.toString().padStart(2, '0') : "00";
    const rowStr = row !== undefined && row !== null ?
      row.toString().padStart(2, '0') : "??";
    const groupStr = group !== undefined && group !== null ?
      group.toString().padStart(2, '0') : "??";
    const depthStr = depth !== undefined && depth !== null ?
      depth.toString().padStart(2, '0') : "??";

    return `F${floorStr}${colStr}${rowStr}D${depthStr}C${groupStr}`;
  }


  // Update the handleShelfSelection function to check if selected location is occupied
  const handleShelfSelection = (location: ShelfLocation) => {
    const floorNumber = location.floor;
    const columnNumber = location.column;
    const columnCode = String.fromCharCode(65 + columnNumber);
    const rowNumber = location.row;
    const groupNumber = location.group;
    const depthNumber = location.depth || 0; // Get depth value

    // Update temporary selections with numerical values
    setTempSelectedFloor(floorNumber);
    setTempSelectedColumn(columnNumber);
    setTempSelectedColumnCode(columnCode);
    setTempSelectedRow(rowNumber);
    setTempSelectedGroup(groupNumber);
    setTempSelectedDepth(depthNumber); // Set depth value

    // Use formatCode for consistent code formatting
    setTempSelectedCode(formatCode(location));

    // Set the highlighted floor
    setHighlightedFloor(location.floor);

    // Update maximum values if available
    if (location.max_group !== undefined) setMaxGroupId(location.max_group);
    if (location.max_row !== undefined) setMaxRow(location.max_row);
    if (location.max_column !== undefined) setMaxColumn(location.max_column);
    if (location.max_depth !== undefined) setMaxDepth(location.max_depth); // Set max depth

    // Check if location is occupied
    setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
  };

  // Add a helper function to update the occupied status after selection changes
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

  // Update the handle functions to check for occupation after selection and use formatCode
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

      // Use formatCode for consistent formatting
      setTempSelectedCode(formatCode(location));

      // Check if new location is occupied
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

    if (tempSelectedFloor !== null && highlightedFloor !== null && tempSelectedGroup !== null) {
      const location = {
        floor: highlightedFloor,
        group: tempSelectedGroup,
        row: tempSelectedRow !== null ? tempSelectedRow : 0,
        column: adjustedCol,
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0
      };
      setExternalSelection(location);

      // Use formatCode for consistent formatting
      setTempSelectedCode(formatCode(location));

      // Check if new location is occupied
      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleDepthChange = (depthNum: number) => {
    const adjustedDepth = depthNum - 1;
    setTempSelectedDepth(adjustedDepth);

    if (tempSelectedFloor !== null && highlightedFloor !== null && tempSelectedGroup !== null && tempSelectedDepth !== null) {
      const location = {
        floor: highlightedFloor,
        group: tempSelectedGroup,
        row: tempSelectedRow !== null ? tempSelectedRow : 0,
        column: tempSelectedColumn !== null ? tempSelectedColumn : 0,
        depth: adjustedDepth
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
    setTempSelectedDepth(selectedDepth);
    setTempSelectedGroup(selectedGroup);
    setTempSelectedCode(selectedCode);

    console.log("Selected location:", {
      selectedFloor,
      selectedColumn,
      selectedRow,
      selectedGroup,
      selectedDepth,
      selectedColumnCode,
      selectedCode
    });


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

      // Check if current location is occupied
      setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
    } else {
      setExternalSelection(undefined);
    }

    onOpen();
  };

  const handleConfirmLocation = () => {
    setSelectedFloor(tempSelectedFloor);
    setSelectedColumn(tempSelectedColumn);
    setSelectedColumnCode(tempSelectedColumnCode);
    setSelectedRow(tempSelectedRow);
    setSelectedGroup(tempSelectedGroup);
    setSelectedDepth(tempSelectedDepth);

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
    setTempSelectedDepth(selectedDepth);
    setTempSelectedGroup(selectedGroup);
    setTempSelectedCode(selectedCode);
    onClose();
  }


  // Handle item search
  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    try {
      setIsLoadingItems(true);

      const result = await getInventoryItems(
        admin.company_uuid,
        query,
      );

      setInventoryItems(result.data || []);
    } catch (error) {
      console.error("Error searching items:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };


  // In handleSelectItem function, just update the URL
  const handleSelectItem = (key: string) => {
    // Update the URL with the selected item ID without reloading the page
    const params = new URLSearchParams(searchParams.toString());
    params.set("itemId", key);
    router.push(`?${params.toString()}`, { scroll: false });
  };

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
        quantity: 0,
        unit: "",
        ending_inventory: 0,
        netsuite: null,
        variance: null,
        location: {
          floor: null,
          column: null,
          row: null,
          depth: null,
          group: null,
        }
      });

      setSelectedItemId(null);
      setSelectedFloor(null);
      setSelectedColumn(null);
      setSelectedRow(null);
      setSelectedDepth(null);
      setSelectedGroup(null);
      setSelectedColumnCode("");
      setSelectedCode("");

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

    // Set location data
    if (item.location) {
      setSelectedFloor(item.location.floor);
      setSelectedColumnCode(parseColumn(item.location.column) || "");
      setSelectedColumn(item.location.column);
      setSelectedRow(item.location.row);
      setSelectedDepth(item.location.depth);
      setSelectedGroup(item.location.group);

      setSelectedCode(item.location_code || "");
    }
  }, [searchParams, admin?.company_uuid, isLoadingItems, inventoryItems]);

  // Fetch admin status and options when component mounts
  useEffect(() => {
    const initPage = async () => {
      try {
        const adminData = await checkAdminStatus();
        setAdmin(adminData);

        setFormData(prev => ({
          ...prev,
          admin_uuid: adminData.uuid,
          company_uuid: adminData.company_uuid,
          location: prev.location
        }));

        const units = await getUnitOptions();
        const floors = await getFloorOptions();

        setUnitOptions(units);
        setFloorOptions(floors);

        // Fetch initial inventory items
        const items = await getInventoryItems(
          adminData.company_uuid
        );

        // Fetch occupied shelf locations
        const locationsResult = await getOccupiedShelfLocations(adminData.company_uuid);
        if (locationsResult.success) {
          setOccupiedLocations(locationsResult.data);
        }

        setInventoryItems(items.data || []);
        setIsLoadingItems(false);
      } catch (error) {
        console.error("Error initializing page:", error);
      }
    };

    initPage();
  }, []);

  useEffect(() => {
    if (!admin?.company_uuid) return;

    // Create a client-side Supabase client for real-time subscriptions
    const supabase = createClient();

    // Set up the real-time subscription
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

          // Refresh inventory items
          const refreshedItems = await getInventoryItems(
            admin.company_uuid,
            searchQuery,
          );

          setInventoryItems(refreshedItems.data || []);

          // Update occupied locations as well
          const locationsResult = await getOccupiedShelfLocations(admin.company_uuid);
          if (locationsResult.success) {
            setOccupiedLocations(locationsResult.data);
          }
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(channel);
    };
  }, [admin?.company_uuid, searchQuery]);

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
    if (selectedFloor !== null && selectedColumnCode && selectedRow !== null && selectedGroup !== null) {
      // Create the location object
      const location = {
        floor: selectedFloor,
        group: selectedGroup,
        row: selectedRow,
        column: selectedColumn !== null ? selectedColumn : 0,
        depth: selectedDepth !== null ? selectedDepth : 0
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
          group: selectedGroup,
          depth: selectedDepth
        },
        location_code: code
      }));

      setSelectedCode(code);
    }
  }, [selectedFloor, selectedColumn, selectedColumnCode, selectedRow, selectedGroup, selectedDepth]);

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
    if (!formData.unit) newErrors.unit = "Unit is required";
    if (formData.ending_inventory === undefined || formData.ending_inventory < 0) newErrors.ending_inventory = "Valid ending inventory is required";
    if (formData.location!.floor === null) newErrors["location.floor"] = "Floor is required";
    if (formData.location!.column === null) newErrors["location.column"] = "Column is required";
    if (formData.location!.row === null) newErrors["location.row"] = "Row is required";
    if (formData.location!.group === null) newErrors["location.group"] = "Group is required";

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
          quantity: 0,
          unit: "",
          ending_inventory: 0,
          netsuite: null,
          variance: null,
          location: {
            floor: null,
            column: null,
            row: null,
            depth: null,
            group: null,
          }
        });

        setSelectedItemId(null);
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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Inventory Management</h1>
          <p className="text-default-500">Manage your inventory items efficiently.</p>
        </div>
        <div className="flex gap-4">
          <div className="mt-4 text-center">
            {!admin ? (
              <Skeleton className="h-10 w-32 rounded-xl" />
            ) : (
              <Button
                color="primary"
                variant="shadow"
                onPress={handleNewItem}
              >
                <Icon icon="mdi:plus" className="mr-2" />
                New Item
              </Button>
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
                    <Skeleton key={i} className="w-full min-h-28 rounded-xl" />
                  ))}
                  <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                  <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Spinner />
                  </div>
                </div>
              ) : !isLoadingItems && inventoryItems.length !== 0 ? (
                <Listbox
                  classNames={{ list: 'space-y-4 p-3 overflow-y-auto pt-32', base: 'xl:h-full h-[42rem]' }}
                  onSelectionChange={(item) => handleSelectItem((item as Set<string>).values().next().value || "")}
                  selectedKeys={[selectedItemId || ""]}
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
                              {item.location_code}
                            </Chip>
                          </div>
                        </div>
                      </div>
                    </ListboxItem>
                  ))}
                </Listbox>
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
                  <div className="grid grid-cols-1 md:grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
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
                          selectedKeys={[formData.unit || ""]}
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
                      </>
                    )}
                  </div>

                  {!admin ? (
                    <Skeleton className="h-16 w-full rounded-xl" />
                  ) : (
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
                  )}

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
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Item Location</h2>
                <div className="space-y-4">
                  {/* Floor and Group in the first row */}
                  <div className="grid grid-cols-1 md:grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 mb-4">
                    {!admin ? (
                      <>
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </>
                    ) : (
                      <>
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

                        <NumberInput
                          name="location.group"
                          classNames={inputStyle}
                          label="Group"
                          minValue={1}
                          placeholder="e.g. 1"
                          // Display group as 1-indexed but store as 0-indexed
                          value={selectedGroup !== null ? selectedGroup + 1 : 0}
                          onValueChange={(e) => setSelectedGroup(e - 1)}
                          isRequired
                          isInvalid={!!errors["location.group"]}
                          errorMessage={errors["location.group"]}
                        />
                      </>
                    )}
                  </div>

                  {/* Row, Column, and Depth grouped together in the second row */}
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
                          name="location.depth"
                          classNames={inputStyle}
                          label="Depth"
                          minValue={1}
                          placeholder="e.g. 1"
                          // Display depth as 1-indexed but store as 0-indexed
                          value={selectedDepth !== null ? selectedDepth + 1 : 0}
                          onValueChange={(e) => setSelectedDepth(e - 1)}
                          isRequired
                          isInvalid={!!errors["location.depth"]}
                          errorMessage={errors["location.depth"]}
                        />
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    {!admin ? (
                      <Skeleton className="h-7 w-32 rounded-xl" />
                    ) : (
                      <Chip className="mb-2 sm:mb-0">
                        CODE: <b>{selectedCode}</b>
                      </Chip>
                    )}
                  </div>

                  <div className="flex justify-center gap-4 border-t border-default-200 pt-4 px-4 -mx-4">
                    {!admin ? (
                      <Skeleton className="h-10 w-full rounded-xl" />
                    ) : (
                      <>
                        {selectedItemId &&
                          <Button
                            variant="faded"
                            color="secondary"
                            onPress={() => setShowQrCode(true)}
                            className="w-full border-default-200 text-secondary-600"
                            isDisabled={!selectedItemId}
                          >
                            <Icon icon="mdi:qrcode" className="mr-1" />
                            Show QR Code
                          </Button>
                        }
                        <Button
                          variant="faded"
                          color="primary"
                          onPress={handleOpenModal}
                          className="w-full border-default-200 text-primary-600"
                        >
                          <Icon icon="mdi:warehouse" className="mr-1" />
                          Open Floorplan
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {admin && selectedItemId && (
                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Item Status</h2>
                  <Input
                    name="variance"
                    classNames={{ inputWrapper: `${inputStyle.inputWrapper} h-10` }}
                    isReadOnly
                    value={formData.status?.toUpperCase() || "UNKNOWN"}
                  />
                </div>
              )}

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
                        isDisabled={formData.status?.toUpperCase() === "DELIVERED"}
                      >
                        {(() => {
                          if (formData.status?.toUpperCase() === "DELIVERED") {
                            return (
                              <div className="flex items-center gap-2">
                                <Icon icon="mdi:check" />
                                <span>Item Delivered</span>
                              </div>
                            );
                          } else if (formData.status?.toUpperCase() === "RECEIVED") {
                            return (
                              <div className="flex items-center gap-2">
                                <Icon icon="mdi:check" />
                                <span>Item Received</span>
                              </div>
                            );
                          } else if (formData.status?.toUpperCase() === "PENDING") {
                            return (
                              <div className="flex items-center gap-2">
                                <Icon icon="mdi:clock-time-four-outline" />
                                <span>Delivery Status</span>
                              </div>
                            );
                          } else {
                            return (
                              <div className="flex items-center gap-2">
                                <Icon icon="mdi:truck-delivery" />
                                <span>Deliver Item</span>
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
            </CardList>
          </Form>
        </div>
      </div>


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

              <Suspense fallback={
                <div className="flex items-center justify-center h-full">
                  <Spinner size="lg" color="primary" />
                  <span className="ml-2">Loading 3D viewer...</span>
                </div>
              }>
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
                  isGroupChangeAnimate={isGroupChangeAnimate}
                  externalSelection={externalSelection}
                  cameraOffsetY={-0.25}
                  backgroundColor={customColors.backgroundColor}
                  floorColor={customColors.floorColor}
                  floorHighlightedColor={customColors.floorHighlightedColor}
                  groupColor={customColors.groupColor}
                  groupSelectedColor={customColors.groupSelectedColor}
                  shelfColor={customColors.shelfColor}
                  shelfHoverColor={customColors.shelfHoverColor}
                  shelfSelectedColor={customColors.shelfSelectedColor}
                  occupiedShelfColor={customColors.occupiedShelfColor}
                  occupiedHoverShelfColor={customColors.occupiedHoverShelfColor}
                  textColor={customColors.textColor}
                />
              </Suspense>

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
                          <span className="text-sm font-semibold w-16">Group</span>
                          <Pagination
                            classNames={{ item: "bg-default/25" }}
                            initialPage={1}
                            size="sm"
                            page={(tempSelectedGroup || 0) + 1}
                            total={maxGroupId + 1}
                            onChange={handleGroupChange}
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

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Depth</span>
                          <Pagination
                            classNames={{ item: "bg-default/25" }}
                            initialPage={1}
                            size="sm"
                            page={(tempSelectedDepth || 0) + 1}
                            total={maxDepth + 1}
                            onChange={handleDepthChange}
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
    </div >
  );
}