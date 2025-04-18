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
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify-icon/react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { motion } from "framer-motion";
import { FloorConfig, ShelfLocation, ShelfSelector3D } from "@/components/shelf-selector-3d";

// Import server actions
import {
  checkAdminStatus,
  createInventoryItem,
  getUnitOptions,
  getFloorOptions
} from "./actions";

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

  // Location state
  const [selectedFloor, setSelectedFloor] = useState("");
  const [selectedColumn, setSelectedColumn] = useState("");
  const [selectedRow, setSelectedRow] = useState("");
  const [selectedCabinet, setSelectedCabinet] = useState("");

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

  // Handler for ShelfSelector3D selection
  const handleShelfSelection = (location: ShelfLocation) => {
    // Map the ShelfLocation to the format expected by the form
    const floorNumber = location.floor + 1;
    const column = String.fromCharCode(65 + location.cabinet_column); // Convert to letter (A, B, C...)
    const row = `${location.cabinet_row + 1}`; // 1-indexed row number
    const cabinet = `C${location.cabinet_id + 1}`; // 1-indexed cabinet ID with prefix

    // Update the form state
    setSelectedFloor(`Floor ${floorNumber}`);
    setSelectedColumn(column);
    setSelectedRow(row);
    setSelectedCabinet(cabinet);
  };

  // Fetch admin status and options when component mounts
  useEffect(() => {
    const initPage = async () => {
      try {
        // Check admin status
        const adminData = await checkAdminStatus();
        setIsAdmin(true);
        setAdminUUID(adminData.uuid);
        setCompanyUUID(adminData.company.uuid);

        // Update formData with admin and company UUID
        setFormData(prev => ({
          ...prev,
          admin_uuid: adminData.uuid,
          company_uuid: adminData.company.uuid,
          location: {
            ...prev.location!,
            company_uuid: adminData.company.uuid
          }
        }));

        // Fetch available options
        const units = await getUnitOptions();
        const floors = await getFloorOptions();

        setUnitOptions(units);
        setFloorOptions(floors);
      } catch (error) {
        console.error("Error initializing page:", error);
        // The server action handles redirects for unauthorized access
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

  // Number input change handler
  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numValue = value === "" ? null : Number(value);

    setFormData(prev => ({
      ...prev,
      [name]: numValue
    }));
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
  }, [selectedFloor, selectedColumn, selectedRow, selectedCabinet]);

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    const newErrors: Record<string, string> = {};
    if (!formData.item_code) newErrors.item_code = "Item code is required";
    if (!formData.item_name) newErrors.item_name = "Item name is required";
    if (!formData.quantity || formData.quantity <= 0) newErrors.quantity = "Valid quantity is required";
    if (!formData.unit) newErrors.unit = "Unit is required";
    if (formData.ending_inventory === undefined || formData.ending_inventory < 0) newErrors.ending_inventory = "Valid ending inventory is required";

    // Location validation
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
      // Call server action to create inventory item
      const result = await createInventoryItem(formData as any);

      if (result.success) {
        // Success - redirect to inventory list
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

  // Add handler for animation toggle
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
      className="container mx-auto py-8 px-4"
    >
      <Card className="mb-8">
        <CardHeader className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Add New Inventory Item</h1>
          <Button
            color="primary"
            variant="light"
            onClick={() => router.push("/inventory/list")}
            startContent={<Icon icon="material-symbols:arrow-back" />}
          >
            Back to List
          </Button>
        </CardHeader>
      </Card>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Information */}
          <Card className="col-span-1">
            <CardHeader>
              <h2 className="text-xl font-semibold">Basic Information</h2>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-4">
              <Input
                name="item_code"
                label="Item Code"
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
                placeholder="Enter item name"
                value={formData.item_name || ""}
                onChange={handleInputChange}
                isRequired
                isInvalid={!!errors.item_name}
                errorMessage={errors.item_name}
                startContent={<Icon icon="mdi:package-variant" />}
              />

              <Textarea
                name="description"
                label="Description"
                placeholder="Enter item description (optional)"
                value={formData.description || ""}
                onChange={handleInputChange}
              />
            </CardBody>
          </Card>

          {/* Quantity and Costs */}
          <Card className="col-span-1">
            <CardHeader>
              <h2 className="text-xl font-semibold">Quantity & Costs</h2>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-4">
              <div className="flex gap-4">
                <Input
                  type="number"
                  name="quantity"
                  label="Quantity"
                  placeholder="0"
                  value={formData.quantity?.toString() || ""}
                  onChange={handleNumberChange}
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

              <Input
                type="number"
                name="ending_inventory"
                label="Ending Inventory (Cost)"
                placeholder="0.00"
                value={formData.ending_inventory?.toString() || ""}
                onChange={handleNumberChange}
                isRequired
                isInvalid={!!errors.ending_inventory}
                errorMessage={errors.ending_inventory}
                startContent={<Icon icon="mdi:currency-usd" />}
              />

              <div className="flex gap-4">
                <Input
                  type="number"
                  name="netsuite"
                  label="Netsuite (Optional)"
                  placeholder="0.00"
                  value={formData.netsuite?.toString() || ""}
                  onChange={handleNumberChange}
                  startContent={<Icon icon="mdi:database" />}
                  className="flex-1"
                />

                <Input
                  type="number"
                  name="variance"
                  label="Variance (Optional)"
                  placeholder="0.00"
                  value={formData.variance?.toString() || ""}
                  onChange={handleNumberChange}
                  startContent={<Icon icon="mdi:chart-line-variant" />}
                  className="flex-1"
                />
              </div>
            </CardBody>
          </Card>

          {/* Location Information */}
          <Card className="col-span-1 lg:col-span-2">
            <CardHeader>
              <div className="flex justify-between items-center w-full">
                <h2 className="text-xl font-semibold">Item Location</h2>
                <Button color="primary" onClick={onOpen}>
                  Open Interactive Floorplan
                </Button>
              </div>
            </CardHeader>
            <Divider />
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Select
                  name="location.floor"
                  label="Floor Level"
                  placeholder="Select floor"
                  value={selectedFloor}
                  onChange={(e) => setSelectedFloor(e.target.value)}
                  isRequired
                  isInvalid={!!errors["location.floor"]}
                  errorMessage={errors["location.floor"]}
                >
                  {floorOptions.map((floor) => (
                    <SelectItem key={floor}>
                      {floor}
                    </SelectItem>
                  ))}
                </Select>

                <Input
                  name="location.column"
                  label="Column"
                  placeholder="e.g. A"
                  value={selectedColumn}
                  onChange={(e) => setSelectedColumn(e.target.value)}
                  isRequired
                  isInvalid={!!errors["location.column"]}
                  errorMessage={errors["location.column"]}
                />

                <Input
                  name="location.row"
                  label="Row"
                  placeholder="e.g. 1"
                  value={selectedRow}
                  onChange={(e) => setSelectedRow(e.target.value)}
                  isRequired
                  isInvalid={!!errors["location.row"]}
                  errorMessage={errors["location.row"]}
                />

                <Input
                  name="location.cabinet"
                  label="Cabinet"
                  placeholder="e.g. C1"
                  value={selectedCabinet}
                  onChange={(e) => setSelectedCabinet(e.target.value)}
                  isRequired
                  isInvalid={!!errors["location.cabinet"]}
                  errorMessage={errors["location.cabinet"]}
                />
              </div>

              <div className="mt-4 p-3 rounded-md">
                <p className="font-semibold">Location Code:</p>
                <p className="text-lg mt-1 text-primary">
                  {selectedFloor ? selectedFloor.replace("Floor ", "F") : "F?"}-
                  {selectedColumn || "?"}-
                  {selectedRow || "?"}-
                  {selectedCabinet || "?"}
                </p>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="mt-8 flex justify-end gap-4">
          <Button
            color="danger"
            variant="flat"
            onClick={() => router.push("/inventory/list")}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            type="submit"
            isLoading={isLoading}
          >
            Save Inventory Item
          </Button>
        </div>
      </form>

      {/* 3D Floorplan Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="2xl">
        <ModalContent>
          <ModalHeader>Interactive Warehouse Floorplan</ModalHeader>
          <ModalBody>
            <div className="h-[500px] bg-default rounded-md">
              <ShelfSelector3D
                floors={floorConfigs}
                onSelect={handleShelfSelection}
                className="w-full h-full"
                highlightedFloor={highlightedFloor}
                onHighlightFloor={setHighlightedFloor}
                isFloorChangeAnimate={isFloorChangeAnimate}
                isShelfChangeAnimate={isShelfChangeAnimate}
                isCabinetChangeAnimate={isCabinetChangeAnimate}
                // Add color customization
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
            </div>
            <div className="mt-4">
              <p className="text-sm">
                Click on a shelf in the 3D warehouse to select floor, column, row, and cabinet.
              </p>

              {/* Add floor controls */}
              <div className="mt-4 p-3 rounded-md">
                <h3 className="text-md font-semibold mb-2">Floor Controls</h3>
                <div className="flex gap-2 mb-3">
                  {floorConfigs.map((_, index) => (
                    <Button
                      key={index}
                      variant={highlightedFloor === index ? "shadow" : "flat"}
                      color={highlightedFloor === index ? "primary" : "default"}
                      onPress={() => setHighlightedFloor(index)}
                    >
                      Floor {index + 1}
                    </Button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="flex items-center justify-between">
                    <span>Focus on floor change</span>
                    <Switch
                      isSelected={isFloorChangeAnimate}
                      onValueChange={(value) => handleAnimationToggle('floor', value)}
                      size="sm"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Focus on cabinet change</span>
                    <Switch
                      isSelected={isCabinetChangeAnimate}
                      onValueChange={(value) => handleAnimationToggle('cabinet', value)}
                      size="sm"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Focus on shelf selection</span>
                    <Switch
                      isSelected={isShelfChangeAnimate}
                      onValueChange={(value) => handleAnimationToggle('shelf', value)}
                      size="sm"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="p-2 rounded">
                  <p className="font-semibold">Floor: {selectedFloor || "Not selected"}</p>
                </div>
                <div className="p-2 rounded">
                  <p className="font-semibold">Column: {selectedColumn || "Not selected"}</p>
                </div>
                <div className="p-2 rounded">
                  <p className="font-semibold">Row: {selectedRow || "Not selected"}</p>
                </div>
                <div className="p-2 rounded">
                  <p className="font-semibold">Cabinet: {selectedCabinet || "Not selected"}</p>
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button color="primary" onClick={onClose}>
              Confirm Location
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </motion.div>
  );
}