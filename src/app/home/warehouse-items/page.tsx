"use client";

import { herouiColor } from "@/utils/colors";
import { createClient } from "@/utils/supabase/client";
import {
  Accordion,
  AccordionItem,
  Button,
  Chip,
  Input,
  Kbd,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Spinner,
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify-icon/react";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";
import { lazy, memo, Suspense, useEffect, useState } from "react";

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialDark, materialLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';

// Import components
import CardList from "@/components/card-list";
import { motionTransition } from "@/utils/anim";

// Import actions
import {
  getUser,
  getWarehouseItems,
  getCompanyLayout,
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

interface ShelfLocation {
  floor: number;
  group: number;
  row: number;
  column: number;
  depth: number;
  max_group?: number;
  max_row?: number;
  max_column?: number;
  max_depth?: number;
}

interface FloorConfig {
  height: number;
  matrix: number[][];
}

// Lazy load the 3D shelf selector
const ShelfSelector3D = memo(lazy(() =>
  import("@/components/shelf-selector-3d-v4").then(mod => ({
    default: mod.ShelfSelector3D
  }))
));

export default function WarehouseItemsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { theme } = useTheme()

  // Inventory list state
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState<Partial<InventoryItem>>({});

  // QR Code state
  const [showQrCode, setShowQrCode] = useState(false);

  // 3D Visualization state
  const [occupiedLocations, setOccupiedLocations] = useState<ShelfLocation[]>([]);
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(null);
  const [externalSelection, setExternalSelection] = useState<ShelfLocation | undefined>(undefined);
  const [isFloorChangeAnimate, setIsFloorChangeAnimate] = useState<boolean>(true);
  const [isShelfChangeAnimate, setIsShelfChangeAnimate] = useState<boolean>(true);
  const [isGroupChangeAnimate, setIsGroupChangeAnimate] = useState<boolean>(false);

  // Custom colors for shelf visualization
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

  // Define floor configurations for ShelfSelector3D
  const [floorConfigs, setFloorConfigs] = useState<FloorConfig[]>([]);


  const isDark = () => {
    if (theme === "dark") {
      return true;
    } else if (theme === "light") {
      return false;
    } else {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
  }

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

  // Generate JSON for QR code
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
      location: formData.location_code || "",
    };

    return JSON.stringify(productData, null, space);
  };

  // Handle item search
  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    try {
      setIsLoadingItems(true);

      const result = await getWarehouseItems(
        user.company_uuid,
        query,
      );

      // Filter inventory items to only show those with IN_WAREHOUSE status
      const filteredItems = result.data.filter(item => item.status === "IN_WAREHOUSE");

      setInventoryItems(filteredItems || []);
    } catch (error) {
      console.error("Error searching items:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Handle selecting an item
  const handleSelectItem = (key: string) => {
    // Update the URL with the selected item ID without reloading the page
    const params = new URLSearchParams(searchParams.toString());
    params.set("itemId", key);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // For 3D visualization
  const handleShelfSelection = (location: ShelfLocation) => {
    // This is only for visualization since operators can't modify locations
    setHighlightedFloor(location.floor);
    setExternalSelection(location);
  };

  // Handle opening floorplan modal
  const handleOpenFloorplan = () => {
    if (formData.location) {
      const location = {
        floor: formData.location.floor || 0,
        group: formData.location.group || 0,
        row: formData.location.row || 0,
        column: formData.location.column || 0,
        depth: formData.location.depth || 0
      };

      setHighlightedFloor(location.floor);
      setExternalSelection(location);
    }
    onOpen();
  };

  // Setup real-time updates for inventory items
  useEffect(() => {
    if (!user?.company_uuid) return;

    const supabase = createClient();

    // Set up real-time subscription
    const channel = supabase
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
          console.log('Real-time update received:', payload);

          // Refresh inventory items
          const refreshedItems = await getWarehouseItems(
            user.company_uuid,
            searchQuery,
          );

          // Filter to only IN_WAREHOUSE items
          const filteredItems = refreshedItems.data.filter(item => item.status === "IN_WAREHOUSE");
          setInventoryItems(filteredItems || []);

          // Update the occupiedLocations for visualization
          const locations = filteredItems.map(item => ({
            floor: item.location?.floor || 0,
            group: item.location?.group || 0,
            row: item.location?.row || 0,
            column: item.location?.column || 0,
            depth: item.location?.depth || 0
          }));
          setOccupiedLocations(locations);
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.company_uuid, searchQuery]);

  // Theme effect
  useEffect(() => {
    updateHeroUITheme();
  }, [theme]);

  // Initialize theme
  useEffect(() => {
    updateHeroUITheme();
  }, []);

  // Effect to handle URL params (itemId)
  useEffect(() => {
    if (!user?.company_uuid || isLoadingItems || inventoryItems.length === 0) return;

    const itemId = searchParams.get("itemId");
    if (!itemId) {
      // Clear selection if no itemId in URL
      setSelectedItemId(null);
      setFormData({});
      return;
    }

    // Find the item in inventory
    const item = inventoryItems.find(i => i.uuid === itemId);
    if (!item) return;

    // Set the selected item and form data
    setSelectedItemId(itemId);
    setFormData(item);
  }, [searchParams, user?.company_uuid, isLoadingItems, inventoryItems]);

  // Fetch user status and inventory items when component mounts
  useEffect(() => {
    const initPage = async () => {
      const defaultLayout = [
        {
          height: 5,
          matrix: Array(16).fill(0).map(() => Array(32).fill(0))
        }
      ];

      try {
        const { data, error } = await getUser();
        setUser(data);

        if (error) {
          console.error("Error fetching user:", error);
          return;
        }

        const company_layout = await getCompanyLayout(data.company_uuid);
        if (company_layout.success) {
          setFloorConfigs(company_layout.data || defaultLayout);
        } else {
          setFloorConfigs(defaultLayout);
        }


        // Fetch initial inventory items
        const itemsResult = await getWarehouseItems(data.company_uuid);

        // Filter to only show IN_WAREHOUSE items
        const filteredItems = itemsResult.data.filter(item => item.status === "IN_WAREHOUSE");
        setInventoryItems(filteredItems || []);

        // Set occupied locations for visualization
        const locations = filteredItems.map(item => ({
          floor: item.location?.floor || 0,
          group: item.location?.group || 0,
          row: item.location?.row || 0,
          column: item.location?.column || 0,
          depth: item.location?.depth || 0
        }));
        setOccupiedLocations(locations);

        setIsLoadingItems(false);
      } catch (error) {
        console.error("Error initializing page:", error);
      }
    };

    initPage();
  }, []);

  return (
    <div className="container mx-auto p-2 max-w-4xl">
      <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
        <div className="flex flex-col w-full xl:text-left text-center">
          <h1 className="text-2xl font-bold">Warehouse Items</h1>
          <p className="text-default-500">View items currently in your warehouse.</p>
        </div>
      </div>


      <div className="flex flex-col xl:flex-row gap-4">
        {/* Left side: Inventory List */}
        <div className={`xl:w-1/3 shadow-xl shadow-primary/10 
          xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
          xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
          border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
        >
          <div className="flex flex-col h-full">
            <div className="p-4 sticky top-0 z-20 bg-background/80 border-b border-default-200 backdrop-blur-lg shadow-sm">
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Warehouse Items</h2>
              {!user ? (
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
              {!user || isLoadingItems ? (
                <div className="space-y-4 mt-1 p-4 pt-32 h-full relative">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="w-full min-h-28 rounded-xl" />
                  ))}
                  <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                  <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Spinner />
                  </div>
                </div>
              ) : inventoryItems.length > 0 ? (
                <div
                  className='space-y-4 p-4 overflow-y-auto pt-[8.25rem] xl:h-full h-[42rem]'>
                  {inventoryItems.map((item) => (
                    <Button
                      key={item.uuid}
                      onPress={() => handleSelectItem(item.uuid)}
                      variant="shadow"
                      className={`w-full min-h-28 !transition-all duration-200 rounded-xl px-0 py-4  ${selectedItemId === item.uuid ?
                        '!bg-primary hover:!bg-primary-400 !shadow-lg hover:!shadow-md hover:!shadow-primary-200 !shadow-primary-200' :
                        '!bg-default-100/50 shadow-none hover:!bg-default-200 !shadow-2xs hover:!shadow-md hover:!shadow-default-200 !shadow-default-200'}`}
                    >
                      <div className="w-full flex justify-between items-start px-0">
                        <div className="flex-1">
                          <div className="flex items-center justify-between px-4">
                            <span className="font-semibold">{item.item_name}</span>
                            <Chip color="default" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">{item.item_code}</Chip>
                          </div>
                          {item.description && (
                            <p className={`text-sm px-4 ${selectedItemId === item.uuid ? 'text-default-800' : 'text-default-600'} line-clamp-1 text-start`}>
                              {item.description}
                            </p>
                          )}
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
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="xl:h-full h-[42rem] absolute w-full">
                  <div className="py-4 flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Icon icon="fluent:box-dismiss-20-filled" className="text-5xl text-default-300" />
                    <p className="text-default-500 mt-2">No warehouse items found.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Item Detail View (Read-only) */}
        <div className="xl:w-2/3">
          {selectedItemId && formData.uuid ? (
            <CardList>
              <div>
                <h2 className="text-xl font-semibold mb-4 w-full text-center">Item Details</h2>
                <div className="space-y-4">
                  {/* Item Basic Information */}
                  <div className="p-4 border border-default-200 rounded-xl">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-default-500">Item Code</span>
                      <Chip color="default" size="sm">
                        {formData.item_code}
                      </Chip>
                    </div>
                    <p className="font-semibold">
                      {formData.item_name}
                    </p>
                    {formData.description && (
                      <p className="mt-2 text-default-600">
                        {formData.description}
                      </p>
                    )}
                  </div>

                  {/* Quantity & Costs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 border border-default-200 rounded-xl">
                      <span className="text-default-500">Quantity</span>
                      <p className="font-medium mt-1">{formData.quantity} {formData.unit}</p>
                    </div>

                    <div className="p-4 border border-default-200 rounded-xl">
                      <span className="text-default-500">Ending Inventory</span>
                      <p className="font-medium mt-1">₱{formData.ending_inventory?.toFixed(2)}</p>
                    </div>

                    {(formData.netsuite !== null && formData.netsuite !== undefined) && (
                      <div className="p-4 border border-default-200 rounded-xl">
                        <span className="text-default-500">Netsuite</span>
                        <p className="font-medium mt-1">₱{formData.netsuite?.toFixed(2)}</p>
                      </div>
                    )}

                    {(formData.variance !== null && formData.variance !== undefined) && (
                      <div className="p-4 border border-default-200 rounded-xl">
                        <span className="text-default-500">Variance</span>
                        <p className="font-medium mt-1">₱{formData.variance?.toFixed(2)}</p>
                      </div>
                    )}
                  </div>

                  {/* Location Information */}
                  <div className="p-4 border border-default-200 rounded-xl">
                    <span className="text-default-500">Location Code</span>
                    <p className="font-medium mt-1">{formData.location_code}</p>
                  </div>


                </div>
              </div>

              <div>
                {/* Action Buttons */}
                <div className="flex justify-center gap-4">
                  <Button
                    variant="faded"
                    color="secondary"
                    onPress={() => setShowQrCode(true)}
                    className="w-full border-default-200 text-secondary-600"
                  >
                    <Icon icon="mdi:qrcode" className="mr-1" />
                    Show QR Code
                  </Button>

                  <Button
                    variant="faded"
                    color="primary"
                    onPress={handleOpenFloorplan}
                    className="w-full border-default-200 text-primary-600"
                  >
                    <Icon icon="mdi:warehouse" className="mr-1" />
                    View Location
                  </Button>
                </div>
              </div>
            </CardList>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-default-300 rounded-2xl bg-background">
              <Icon icon="mdi:package-variant" className="text-default-300" width={64} height={64} />
              <h3 className="text-xl font-semibold text-default-800">No Item Selected</h3>
              <p className="text-default-500 text-center mt-2 mb-6">
                Select an item from the list to view its details.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* QR Code Modal */}
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
            <div className="mt-4 w-full bg-default overflow-auto max-h-64 bg-default-50 rounded-xl">
              <SyntaxHighlighter
                language="json"
                style={isDark() ? materialDark : materialLight}
                customStyle={{
                  margin: 0,
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
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

      {/* Floorplan Modal - Read-only for operators */}
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
          <ModalHeader>Warehouse Floorplan View</ModalHeader>
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
                  canSelectOccupiedLocations={false}
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
                {externalSelection &&
                  <motion.div
                    {...motionTransition}
                    className="absolute bottom-4 left-4 flex flex-col gap-2 bg-background/50 rounded-2xl backdrop-blur-lg md:w-auto w-[calc(100%-2rem)]">
                    <div className="grid grid-cols-2 gap-3 p-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Floor</span>
                          <span className="font-medium">{externalSelection.floor + 1}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Group</span>
                          <span className="font-medium">{externalSelection.group + 1}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 md:border-default md:border-l md:pl-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Row</span>
                          <span className="font-medium">{externalSelection.row + 1}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Column</span>
                          <span className="font-medium">{externalSelection.column + 1}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold w-16">Depth</span>
                          <span className="font-medium">{(externalSelection.depth || 0) + 1}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-default-200 p-4 gap-4">
                      <span className="font-semibold">Code:</span>
                      <span className="ml-2 bg-primary-100 px-2 py-1 rounded-md font-mono">
                        {formData.location_code}
                      </span>
                    </div>
                  </motion.div>
                }
              </AnimatePresence>
            </div>
          </ModalBody>
          <ModalFooter className="flex justify-between gap-4 p-4">
            <Popover showArrow offset={10} placement="bottom-end">
              <PopoverTrigger>
                <Button className="capitalize" color="warning" variant="flat">
                  <Icon
                    icon="heroicons:question-mark-circle-solid"
                    className="w-4 h-4 mr-1"
                  />
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
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.floorColor }}></div>
                      <span className="text-xs">Floor</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.floorHighlightedColor }}></div>
                      <span className="text-xs">Selected Floor</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.groupColor }}></div>
                      <span className="text-xs">Group</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.groupSelectedColor }}></div>
                      <span className="text-xs">Selected Group</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.shelfColor }}></div>
                      <span className="text-xs">Shelf</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.shelfHoverColor }}></div>
                      <span className="text-xs">Hovered Shelf</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.shelfSelectedColor }}></div>
                      <span className="text-xs">Selected Shelf</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.occupiedShelfColor }}></div>
                      <span className="text-xs">Occupied Shelf</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-default-500">
                  Tip: Use WASD and arrow keys for easiest navigation through the warehouse.
                </div>
              </PopoverContent>
            </Popover>
            <Button
              color="default"
              onPress={onClose}
            >
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div >
  );
}