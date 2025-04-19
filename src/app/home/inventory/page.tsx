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
  NumberInput,
  Form,
} from "@heroui/react";
import { Icon } from "@iconify-icon/react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { motion } from "framer-motion";
import { FloorConfig, ShelfLocation, ShelfSelector3D } from "@/components/shelf-selector-3d-v3";
import { useTheme } from "next-themes";
import { herouiColor } from "@/utils/colors";

// Import server actions
import {
  checkAdminStatus,
  createInventoryItem,
  getUnitOptions,
  getFloorOptions
} from "./actions";
import CardList from "@/components/card-list";

interface LocationData {
  company_uuid: string;
  floor: string;
  column: string;
  row: string;
  cabinet: string;
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

  // Inside the component, add state for ShelfSelector3D controls
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(null);
  const [isFloorChangeAnimate, setIsFloorChangeAnimate] = useState<boolean>(true);
  const [isShelfChangeAnimate, setIsShelfChangeAnimate] = useState<boolean>(true);
  const [isCabinetChangeAnimate, setIsCabinetChangeAnimate] = useState<boolean>(false);

  // Add this state near your other state declarations
  const [externalSelection, setExternalSelection] = useState<ShelfLocation | undefined>(undefined);

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
        textColor: herouiColor('text', 'hex') as string,
      });
    }, 100);
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
      floor: "",
      column: "",
      row: "",
      cabinet: ""
    }
  });

  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" }

  // Location state
  const [selectedFloor, setSelectedFloor] = useState("");
  const [selectedColumn, setSelectedColumn] = useState("");
  const [selectedRow, setSelectedRow] = useState("");
  const [selectedCabinet, setSelectedCabinet] = useState("");
  const [selectedCode, setSelectedCode] = useState("");

  // Add state for temporary modal selections
  const [tempSelectedFloor, setTempSelectedFloor] = useState("");
  const [tempSelectedColumn, setTempSelectedColumn] = useState("");
  const [tempSelectedRow, setTempSelectedRow] = useState("");
  const [tempSelectedCabinet, setTempSelectedCabinet] = useState("");
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

  // Update the handleShelfSelection function
  const handleShelfSelection = (location: ShelfLocation) => {
    const floorNumber = location.floor + 1;
    const column = String.fromCharCode(65 + location.cabinet_column);
    const row = `${location.cabinet_row + 1}`;
    const cabinet = `${location.cabinet_id + 1}`;

    // Update temporary selections
    setTempSelectedFloor(`${floorNumber}`);
    setTempSelectedColumn(column);
    setTempSelectedRow(row);
    setTempSelectedCabinet(cabinet);

    // Update temp code
    setTempSelectedCode(`F${floorNumber || "?"}-${column || "?"}${row || "?"}-C${cabinet || "?"}`);

    // Set the highlighted floor
    setHighlightedFloor(location.floor);

    // Update maximum values if available
    if (location.max_cabinet_id !== undefined) setMaxCabinetId(location.max_cabinet_id);
    if (location.max_row !== undefined) setMaxRow(location.max_row);
    if (location.max_column !== undefined) setMaxColumn(location.max_column);
  };

  // Update the handle functions for modal pagination controls
  const handleFloorChange = (floorNum: number) => {
    const floorIndex = floorNum - 1;
    setTempSelectedFloor(`${floorNum}`);
    setHighlightedFloor(floorIndex);

    if (tempSelectedCabinet) {
      setExternalSelection({
        floor: floorIndex,
        cabinet_id: parseInt(tempSelectedCabinet) - 1,
        cabinet_row: tempSelectedRow ? parseInt(tempSelectedRow) - 1 : 0,
        cabinet_column: tempSelectedColumn ? tempSelectedColumn.charCodeAt(0) - 65 : 0
      });
    }

    // Update temp code
    setTempSelectedCode(`F${floorNum || "?"}-${tempSelectedColumn || "?"}${tempSelectedRow || "?"}-C${tempSelectedCabinet || "?"}`);
  };

  const handleCabinetChange = (cabinetId: number) => {
    const adjustedId = cabinetId - 1;
    setTempSelectedCabinet(`${cabinetId}`);

    if (tempSelectedFloor && highlightedFloor !== null) {
      setExternalSelection({
        floor: highlightedFloor,
        cabinet_id: adjustedId,
        cabinet_row: tempSelectedRow ? parseInt(tempSelectedRow) - 1 : 0,
        cabinet_column: tempSelectedColumn ? tempSelectedColumn.charCodeAt(0) - 65 : 0
      });
    }

    setTempSelectedCode(`F${tempSelectedFloor || "?"}-${tempSelectedColumn || "?"}${tempSelectedRow || "?"}-C${cabinetId || "?"}`);
  };

  const handleRowChange = (rowNum: number) => {
    const adjustedRow = rowNum - 1;
    setTempSelectedRow(`${rowNum}`);

    if (tempSelectedFloor && highlightedFloor !== null && tempSelectedCabinet) {
      setExternalSelection({
        floor: highlightedFloor,
        cabinet_id: parseInt(tempSelectedCabinet) - 1,
        cabinet_row: adjustedRow,
        cabinet_column: tempSelectedColumn ? tempSelectedColumn.charCodeAt(0) - 65 : 0
      });
    }

    setTempSelectedCode(`F${tempSelectedFloor || "?"}-${tempSelectedColumn || "?"}${rowNum || "?"}-C${tempSelectedCabinet || "?"}`);
  };

  const handleColumnChange = (colNum: number) => {
    const colLetter = String.fromCharCode(64 + colNum);
    setTempSelectedColumn(colLetter);

    const adjustedCol = colNum - 1;

    if (tempSelectedFloor && highlightedFloor !== null && tempSelectedCabinet) {
      setExternalSelection({
        floor: highlightedFloor,
        cabinet_id: parseInt(tempSelectedCabinet) - 1,
        cabinet_row: tempSelectedRow ? parseInt(tempSelectedRow) - 1 : 0,
        cabinet_column: adjustedCol
      });
    }

    setTempSelectedCode(`F${tempSelectedFloor || "?"}-${colLetter || "?"}${tempSelectedRow || "?"}-C${tempSelectedCabinet || "?"}`);
  };

  // Modified modal open handler to initialize with current values
  const handleOpenModal = () => {
    setTempSelectedFloor(selectedFloor);
    setTempSelectedColumn(selectedColumn);
    setTempSelectedRow(selectedRow);
    setTempSelectedCabinet(selectedCabinet);
    setTempSelectedCode(selectedCode);

    if (selectedFloor && selectedColumn && selectedRow && selectedCabinet) {
      const floorIndex = parseInt(selectedFloor) - 1;
      setHighlightedFloor(floorIndex);

      setExternalSelection({
        floor: floorIndex,
        cabinet_id: parseInt(selectedCabinet) - 1,
        cabinet_row: parseInt(selectedRow) - 1,
        cabinet_column: selectedColumn.charCodeAt(0) - 65
      });
    }

    onOpen();
  };

  // Confirm location handler
  const handleConfirmLocation = () => {
    setSelectedFloor(tempSelectedFloor);
    setSelectedColumn(tempSelectedColumn);
    setSelectedRow(tempSelectedRow);
    setSelectedCabinet(tempSelectedCabinet);
    onClose();
  };

  // Fetch admin status and options when component mounts
  useEffect(() => {
    const initPage = async () => {
      try {
        const adminData = await checkAdminStatus();
        setIsAdmin(true);
        setAdminUUID(adminData.uuid);
        setCompanyUUID(adminData.company.uuid);

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

  // Update location
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      location: {
        ...prev.location!,
        floor: selectedFloor,
        column: selectedColumn,
        row: selectedRow,
        cabinet: selectedCabinet
      }
    }));

    setSelectedCode(`F${selectedFloor || "?"}-${selectedColumn || "?"}${selectedRow || "?"}-C${selectedCabinet || "?"}`);
  }, [selectedFloor, selectedColumn, selectedRow, selectedCabinet]);

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!formData.item_code) newErrors.item_code = "Item code is required";
    if (!formData.item_name) newErrors.item_name = "Item name is required";
    if (!formData.quantity || formData.quantity <= 0) newErrors.quantity = "Valid quantity is required";
    if (!formData.unit) newErrors.unit = "Unit is required";
    if (formData.ending_inventory === undefined || formData.ending_inventory < 0) newErrors.ending_inventory = "Valid ending inventory is required";

    if (!formData.location!.floor) newErrors["location.floor"] = "Floor is required";
    if (!formData.location!.column) newErrors["location.column"] = "Column is required";
    if (!formData.location!.row) newErrors["location.row"] = "Row is required";
    if (!formData.location!.cabinet) newErrors["location.cabinet"] = "Cabinet is required";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      const result = await createInventoryItem(formData as any);

      if (result.success) {
        router.push("/inventory/list");
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
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardBody>
            <p className="text-center">Loading or checking permissions...</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const handleAnimationToggle = (type: 'floor' | 'shelf' | 'cabinet', value: boolean) => {
    if (type === 'floor') setIsFloorChangeAnimate(value);
    else if (type === 'shelf') setIsShelfChangeAnimate(value);
    else if (type === 'cabinet') setIsCabinetChangeAnimate(value);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto md:p-6 p-2 gap-6 flex flex-col max-w-4xl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Inventory Management</h1>
          <p className="text-default-500">Manage your inventory items efficiently.</p>
        </div>
        <div className="flex gap-4">

        </div>
      </div>

      <Form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4  w-full text-center">Basic Information</h2>
              <div className="space-y-4">

                <div className="flex gap-4">

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
                    startContent={<Icon icon="mdi:barcode" />}
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
                    startContent={<Icon icon="mdi:package-variant" />}
                  />
                </div>


                <Textarea
                  name="description"
                  label="Description"
                  classNames={inputStyle}
                  size="lg"
                  placeholder="Enter item description (optional)"
                  value={formData.description || ""}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </CardList>


          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4  w-full text-center">Quantity & Costs</h2>
              <div className="space-y-4">
                <div className="flex gap-4">
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
                    startContent={<Icon icon="mdi:numeric" />}
                    className="flex-1"
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
                    className="flex-1"
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
                  startContent={<Icon icon="mdi:currency-php" />}
                />

                <div className="flex gap-4">
                  <NumberInput
                    name="netsuite"
                    classNames={inputStyle}
                    label="Netsuite (Optional)"
                    placeholder="0.00"
                    onValueChange={(e) => setFormData({ ...formData, netsuite: e })}
                    value={formData.netsuite || 0}
                    startContent={<Icon icon="mdi:database" />}
                    className="flex-1"
                  />

                  <NumberInput
                    name="variance"
                    classNames={inputStyle}
                    label="Variance (Optional)"
                    placeholder="0.00"
                    onValueChange={(e) => setFormData({ ...formData, variance: e })}
                    value={formData.variance || 0}
                    startContent={<Icon icon="mdi:chart-line-variant" />}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </CardList>

          <div className="col-span-1 lg:col-span-2">

            <CardList>
              <div>
                <h2 className="text-xl font-semibold mb-4  w-full text-center">Item Location</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

                    <NumberInput
                      name="location.floor"
                      classNames={inputStyle}
                      label="Floor Level"
                      placeholder="e.g. A"
                      maxValue={floorOptions.length - 1}
                      minValue={1}
                      value={parseInt(selectedFloor) || 0}
                      onChange={(e) => setSelectedFloor(`${e}`)}
                      isRequired
                      isInvalid={!!errors["location.column"]}
                      errorMessage={errors["location.column"]}
                    />
                    <Input
                      name="location.column"
                      classNames={inputStyle}
                      label="Column"
                      placeholder="e.g. A"
                      value={selectedColumn}
                      onChange={(e) => setSelectedColumn(e.target.value)}
                      isRequired
                      isInvalid={!!errors["location.column"]}
                      errorMessage={errors["location.column"]}
                    />

                    <NumberInput
                      name="location.row"
                      classNames={inputStyle}
                      label="Row"
                      placeholder="e.g. 1"
                      value={parseInt(selectedRow) || 0}
                      onChange={(e) => setSelectedRow(`${e}`)}
                      isRequired
                      isInvalid={!!errors["location.row"]}
                      errorMessage={errors["location.row"]}
                    />

                    <NumberInput
                      name="location.cabinet"
                      classNames={inputStyle}
                      label="Cabinet"
                      placeholder="e.g. C1"
                      value={parseInt(selectedCabinet) || 0}
                      onChange={(e) => setSelectedCabinet(`${e}`)}
                      isRequired
                      isInvalid={!!errors["location.cabinet"]}
                      errorMessage={errors["location.cabinet"]}
                    />
                  </div>

                  <div className="mt-4rounded-md flex items-center justify-between">
                    <Chip>
                      Location Code: <b>{selectedCode}</b>
                    </Chip>
                    <Button color="primary" onClick={handleOpenModal}>
                      Open Interactive Floorplan
                    </Button>
                  </div>
                </div>
              </div>
            </CardList>



          </div>
        </div>

        <div className="mt-8 flex justify-end gap-4">
          <Button
            color="primary"
            type="submit"
            isLoading={isLoading}
          >
            Save Inventory Item
          </Button>
        </div>
      </Form>

      <Modal
        isOpen={isOpen}
        onClose={onClose}
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
                textColor={customColors.textColor}
              />

              <div className="absolute bottom-4 left-4 flex flex-col gap-2 bg-background/50 rounded-2xl p-4 backdrop-blur-lg md:w-auto w-[calc(100%-2rem)]">
                <div className="grid md:grid-cols-2 grid-cols-1 gap-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold w-16">Floor</span>
                      <Pagination
                        classNames={{ item: "bg-default/25" }}
                        initialPage={0}
                        size="sm"
                        page={tempSelectedFloor ? parseInt(tempSelectedFloor) : 0}
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
                        page={tempSelectedCabinet ? parseInt(tempSelectedCabinet) : 1}
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
                        page={tempSelectedRow ? parseInt(tempSelectedRow) : 1}
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
                        page={tempSelectedColumn ? tempSelectedColumn.charCodeAt(0) - 64 : 1}
                        total={maxColumn + 1}
                        onChange={handleColumnChange}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute top-4 right-4 flex items-center gap-2 bg-background/50 rounded-2xl p-2 backdrop-blur-lg">
                <span className="text-sm font-semibold p-2">CODE: <b>{tempSelectedCode}</b></span>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <div className="flex justify-between w-full">
              <Button color="default" variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button color="primary" variant="shadow" onPress={handleConfirmLocation} className="mb-2">
                Confirm Location
              </Button>
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </motion.div>
  );
}