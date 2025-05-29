"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Button,
  Chip,
  Divider,
  Skeleton,
  Avatar,
  Progress,
  Badge,
  Spacer,
  Accordion,
  AccordionItem,
  Spinner,
  CardFooter,
  Alert,
  Snippet,
  Tooltip,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";

import { getUserFromCookies } from "@/utils/supabase/server/user";
import { formatDate, formatNumber } from "@/utils/tools";
import { motionTransition, motionTransitionScale } from "@/utils/anim";
import LoadingAnimation from "@/components/loading-animation";

import {
  getItemDetailsByUuid,
  getBulkUnitsDetails,
  GoPageDeliveryDetails,
  GoPageInventoryDetails,
  GoPageWarehouseDetails,
} from "./actions";
import CardList from "@/components/card-list";

export default function GoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  // Item details states
  const [itemType, setItemType] = useState<'delivery' | 'inventory' | 'warehouse_inventory' | null>(null);
  const [itemDetails, setItemDetails] = useState<GoPageDeliveryDetails | GoPageInventoryDetails | GoPageWarehouseDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Bulk details state for lazy loading
  const [loadedBulkUnits, setLoadedBulkUnits] = useState<Map<string, any[]>>(new Map());
  const [loadingBulkUnits, setLoadingBulkUnits] = useState<Set<string>>(new Set());

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'PHP',
    }).format(value);
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const renderProperties = (properties: Record<string, any> | undefined) => {
    if (!properties || Object.keys(properties).length === 0) return null;

    return (
      <div className="mt-4">
        <p className="text-sm font-medium text-default-500 mb-2">Custom Properties</p>
        <div className="space-y-2">
          {Object.entries(properties).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center p-2 bg-default-100 rounded-lg">
              <span className="text-sm font-medium text-default-700">{key}:</span>
              <span className="text-sm text-default-600">{JSON.stringify(value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Load user and check for UUID in URL
  useEffect(() => {
    const initPage = async () => {
      try {
        const userData = await getUserFromCookies();
        if (!userData) {
          router.push("/auth/login");
          return;
        }
        setUser(userData);

        // Check for UUID parameters
        const deliveryId = searchParams.get("deliveryId");
        const inventoryId = searchParams.get("inventoryId");
        const warehouseItemId = searchParams.get("warehouseItemId");
        const itemId = searchParams.get("itemId");
        const query = searchParams.get("q");

        const uuid = deliveryId || inventoryId || warehouseItemId || itemId || query;

        if (uuid) {
          await loadItemDetails(uuid);
        }

      } catch (error) {
        console.error("Error initializing page:", error);
        setError("Failed to initialize page");
      } finally {
        setIsLoading(false);
      }
    };

    initPage();
  }, [router, searchParams]);

  const loadItemDetails = async (uuid: string) => {
    setIsSearching(true);
    setError(null);

    try {
      const result = await getItemDetailsByUuid(uuid);

      if (result.success && result.data && result.type) {
        setItemType(result.type);
        setItemDetails(result.data);
        setSearchQuery(uuid);
      } else {
        setError(result.error || "Item not found");
        setItemDetails(null);
        setItemType(null);
      }
    } catch (error: any) {
      console.error("Error loading item details:", error);
      setError("Failed to load item details");
    } finally {
      setIsSearching(false);
    }
  };

  const loadBulkUnits = async (bulkUuid: string, isWarehouseBulk: boolean = false) => {
    if (loadedBulkUnits.has(bulkUuid) || loadingBulkUnits.has(bulkUuid)) {
      return; // Already loaded or loading
    }

    setLoadingBulkUnits(prev => new Set(prev).add(bulkUuid));

    try {
      const result = await getBulkUnitsDetails(bulkUuid, isWarehouseBulk);
      if (result.success) {
        setLoadedBulkUnits(prev => new Map(prev).set(bulkUuid, result.data || []));
      }
    } catch (error) {
      console.error("Error loading bulk units:", error);
    } finally {
      setLoadingBulkUnits(prev => {
        const newSet = new Set(prev);
        newSet.delete(bulkUuid);
        return newSet;
      });
    }
  };

  const handleSearch = async () => {
    // check if the search query changed from the current URL
    const currentQuery = searchParams.get("q");
    if (currentQuery === searchQuery.trim()) {
      return; // No change in search query
    }

    setIsSearching(true);

    if (!searchQuery.trim()) {
      setItemDetails(null);
      setItemType(null);
      setError(null);

      // Clear the search parameter from URL
      router.push('/home/search');
      return;
    }

    // Update URL with search query
    router.push(`/home/search?q=${encodeURIComponent(searchQuery.trim())}`);

  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getStatusColor = (status: string) => {
    const statusColors: Record<string, "success" | "warning" | "danger" | "primary" | "secondary" | "default"> = {
      "AVAILABLE": "success",
      "IN_WAREHOUSE": "primary",
      "PENDING": "warning",
      "IN_TRANSIT": "warning",
      "DELIVERED": "success",
      "CANCELLED": "danger",
      "USED": "secondary",
    };
    return statusColors[status] || "default";
  };

  const inputStyle = {
    inputWrapper: "bg-default-100 border-2 border-default-200 hover:border-default-300 focus-within:!border-primary-500 !cursor-text",
    input: "text-default-500",
    label: "text-default-600"
  };

  const renderDeliveryDetails = (details: GoPageDeliveryDetails) => (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-background">
        <CardHeader className="p-4 justify-between flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-warning-100 rounded-lg">
              <Icon icon="mdi:truck-delivery" className="text-warning-600" width={24} />
            </div>
            <div className="flex-1 flex items-center gap-4 mt-1">
              <h2 className="text-lg font-semibold">
                {details.name || "Delivery Item"}
              </h2>
              <div className="flex items-center gap-2">
                <div
                  className="xl:block hidden">
                  <Snippet
                    symbol=""
                    variant="flat"
                    color="default"
                    size="sm"
                    className="text-xs p-1 pl-2"
                    classNames={{ copyButton: "bg-default-200 hover:bg-default-300 text-sm p-0 h-6 w-6" }}
                    codeString={details.uuid}
                    checkIcon={<Icon icon="fluent:checkmark-16-filled" className="text-success" />}
                    copyIcon={<Icon icon="fluent:copy-16-regular" className="text-default-500" />}
                    onCopy={() => copyToClipboard(details.uuid)}
                  >
                    {details.uuid}
                  </Snippet>
                </div>
                <Button
                  size="sm"
                  variant="flat"
                  color="default"
                  isIconOnly
                  className="xl:hidden"
                  onPress={() => copyToClipboard(details.uuid)}
                >
                  <Icon icon="fluent:copy-16-regular" className="text-default-500 text-sm" />
                </Button>
              </div>

            </div>
          </div>
          <Chip size='sm' color={getStatusColor(details.status)} variant="flat">
            {details.status}
          </Chip>
        </CardHeader>
        <Divider />
        <CardBody className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-sm font-medium text-default-500">Delivery Address</p>
              <p>{details.delivery_address}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-default-500">Delivery Date</p>
              <p>{formatDate(details.delivery_date)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-default-500">Created At</p>
              <p>{formatDate(details.created_at)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-default-500">Last Updated</p>
              <p>{formatDate(details.updated_at)}</p>
            </div>
          </div>

          {details.notes && (
            <div className="mt-4">
              <p className="text-sm font-medium text-default-500">Notes</p>
              <p>{details.notes}</p>
            </div>
          )}

          {/* Status History */}
          {details.status_history && Object.keys(details.status_history).length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-default-500 mb-2">Status History</p>
              <div className="space-y-2">
                {Object.entries(details.status_history).map(([status, timestamp]) => (
                  <div key={status} className="flex justify-between items-center p-2 bg-default-100 rounded-lg">
                    <Chip size="sm" color={getStatusColor(status)} variant="flat">
                      {status}
                    </Chip>
                    <span className="text-xs text-default-600">{formatDate(timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Location Information */}
          {details.locations && details.locations.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-default-500 mb-2">Locations</p>
              <div className="space-y-2">
                {details.locations.map((location, index) => (
                  <div key={index} className="p-3 bg-default-100 rounded-lg">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      <div>
                        <p className="text-default-600">Floor</p>
                        <p>{location.floor}</p>
                      </div>
                      <div>
                        <p className="text-default-600">Group</p>
                        <p>{location.group}</p>
                      </div>
                      <div>
                        <p className="text-default-600">Row</p>
                        <p>{location.row}</p>
                      </div>
                      <div>
                        <p className="text-default-600">Column</p>
                        <p>{location.column}</p>
                      </div>
                    </div>
                    {details.location_codes && details.location_codes[index] && (
                      <div className="mt-2 flex items-center gap-2">
                        <p className="text-default-600 text-sm">Location Code:</p>
                        <Snippet
                          symbol=""
                          variant="flat"
                          color="primary"
                          size="sm"
                          className="text-xs p-1 pl-2 mt-1"
                          classNames={{ copyButton: "bg-default-300 hover:bg-default-300 text-sm p-0 h-6 w-6" }}
                          codeString={details.location_codes[index]}
                          onCopy={() => copyToClipboard(details.location_codes![index])}
                        >
                          {details.location_codes[index]}
                        </Snippet>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Related Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Inventory Item */}
        {details.inventory_item && (
          <Card className="bg-background mt-4">
            <CardHeader className="p-4">
              <div className="flex items-center gap-2">
                <Icon icon="mdi:package-variant" className="text-primary" width={20} />
                <h3 className="text-lg font-semibold">Inventory Item</h3>
              </div>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3 p-4">
              <div>
                <p className="text-sm font-medium text-default-500">Name</p>
                <p>{details.inventory_item.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-default-500">Unit</p>
                <p>{details.inventory_item.unit}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-default-500 mb-1">Inventory ID</p>
                <Snippet
                  symbol=""
                  variant="flat"
                  color="primary"
                  size="sm"
                  className="text-xs p-1 pl-2"
                  classNames={{ copyButton: "bg-primary-100 hover:!bg-primary-200 text-sm p-0 h-6 w-6" }}
                  codeString={details.inventory_item.uuid}
                  onCopy={() => copyToClipboard(details.inventory_item!.uuid)}
                >
                  {details.inventory_item.uuid}
                </Snippet>
              </div>
              {details.inventory_item.description && (
                <div>
                  <p className="text-sm font-medium text-default-500">Description</p>
                  <p>{details.inventory_item.description}</p>
                </div>
              )}
              {renderProperties(details.inventory_item.properties)}
            </CardBody>
            <CardFooter>
              <Button
                className="w-full"
                size="sm"
                color="primary"
                variant="flat"
                onPress={() => router.push(`/home/inventory?itemId=${details.inventory_item!.uuid}`)}
              >
                View Details
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Warehouse */}
        {details.warehouse && (
          <Card className="bg-background mt-4">
            <CardHeader className="p-4">
              <div className="flex items-center gap-2">
                <Icon icon="mdi:warehouse" className="text-success" width={20} />
                <h3 className="text-lg font-semibold">Warehouse</h3>
              </div>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3 p-4">
              <div>
                <p className="text-sm font-medium text-default-500">Name</p>
                <p>{details.warehouse.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-default-500 mb-1">Warehouse ID</p>
                <Snippet
                  symbol=""
                  variant="flat"
                  color="success"
                  size="sm"
                  className="text-xs p-1 pl-2"
                  classNames={{ copyButton: "bg-success-100 hover:!bg-success-200 text-sm p-0 h-6 w-6" }}
                  codeString={details.warehouse.uuid}
                  onCopy={() => copyToClipboard(details.warehouse?.uuid || '')}
                >
                  {details.warehouse.uuid}
                </Snippet>
              </div>
              <div>
                <p className="text-sm font-medium text-default-500">Address</p>
                <p>
                  {details.warehouse.address?.fullAddress || "Address not available"}
                </p>
              </div>
            </CardBody>
            <CardFooter>
              <Button
                className="w-full"
                size="sm"
                color="success"
                variant="flat"
                onPress={() => router.push(`/home/warehouses?warehouseId=${details.warehouse!.uuid}`)}
              >
                View Details
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>

      {/* Operators */}
      {details.operators && details.operators.length > 0 && (
        <Card className="bg-background mt-4">
          <CardHeader className="p-4">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:account-group" className="text-secondary" width={20} />
              <h3 className="text-lg font-semibold">Assigned Operators</h3>
              <Chip size="sm" variant="flat" color="secondary">
                {details.operators.length}
              </Chip>
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {details.operators.map((operator) => (
                <div key={operator.uuid} className="flex items-center gap-3 p-3 bg-default-100 border-2 border-default-200 rounded-xl shadow-lg">
                  <Avatar
                    name={operator.full_name}
                    size="sm"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-default-900">{operator.full_name}</p>
                    <p className="text-sm text-default-600">{operator.email}</p>
                    {operator.phone_number && (
                      <p className="text-sm text-default-600">{operator.phone_number}</p>
                    )}
                    <Snippet
                      symbol=""
                      variant="flat"
                      color="secondary"
                      size="sm"
                      className="text-xs p-1 pl-2 mt-1"
                      classNames={{ copyButton: "bg-secondary-100 hover:!bg-secondary-200 text-sm p-0 h-6 w-6" }}
                      codeString={operator.uuid}
                      onCopy={() => copyToClipboard(operator.uuid)}
                    >
                      {operator.uuid.slice(0, 8)}...
                    </Snippet>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Inventory Bulks - Using Accordion like inventory details */}
      {details.inventory_bulks && details.inventory_bulks.length > 0 && (
        <Card className="bg-background mt-4">
          <CardHeader className="p-4">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:cube-outline" className="text-primary" width={20} />
              <h3 className="text-lg font-semibold">Inventory Bulks</h3>
              <Chip size="sm" variant="flat" color="primary">
                {details.inventory_bulks.length}
              </Chip>
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="px-2 py-4">
            <Accordion
              selectionMode="multiple"
              variant="splitted"
              itemClasses={{
                base: "p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
                title: "font-normal text-lg font-semibold",
                trigger: "p-4 data-[hover=true]:bg-default-100 h-14 flex items-center transition-colors",
                indicator: "text-medium",
                content: "text-small p-0",
              }}
              onSelectionChange={(keys) => {
                // Load units for opened accordion items
                if (keys instanceof Set) {
                  keys.forEach(key => {
                    const bulkIndex = parseInt(key.toString());
                    if (details.inventory_bulks && details.inventory_bulks[bulkIndex]) {
                      const bulk = details.inventory_bulks[bulkIndex];
                      loadBulkUnits(bulk.uuid, false);
                    }
                  });
                }
              }}>
              {details.inventory_bulks.map((bulk, index) => (
                <AccordionItem
                  key={index}
                  title={
                    <div className="flex items-center justify-between w-full">
                      <span>Bulk #{index + 1}</span>
                      <div className="flex items-center gap-2">
                        <Chip size="sm" color={getStatusColor(bulk.status || "AVAILABLE")} variant="flat">
                          {bulk.status || "AVAILABLE"}
                        </Chip>
                        <span className="text-sm text-default-600">
                          {bulk.unit_value} {bulk.unit} • {formatCurrency(bulk.cost)}
                        </span>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-4 p-4">
                    {/* Bulk ID */}
                    <div>
                      <p className="text-sm font-medium text-default-500 mb-1">Bulk ID</p>
                      <Snippet
                        symbol=""
                        variant="flat"
                        color="primary"
                        size="sm"
                        className="text-xs p-1 pl-2"
                        classNames={{ copyButton: "bg-primary-100 hover:!bg-primary-200 text-sm p-0 h-6 w-6" }}
                        codeString={bulk.uuid}
                        onCopy={() => copyToClipboard(bulk.uuid)}
                      >
                        {bulk.uuid}
                      </Snippet>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm font-medium text-default-500">Unit Value</p>
                        <p>{bulk.unit_value} {bulk.unit}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-default-500">Bulk Unit</p>
                        <p>{bulk.bulk_unit}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-default-500">Cost</p>
                        <p>{formatCurrency(bulk.cost)}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-default-500">Type</p>
                        <p>{bulk.is_single_item ? "Single Item" : "Multiple Items"}</p>
                      </div>
                    </div>

                    {/* Custom Properties */}
                    {renderProperties(bulk.properties)}

                    {/* Units */}
                    <div>
                      <h4 className="font-semibold text-default-900 mb-3">
                        Units {loadingBulkUnits.has(bulk.uuid) ? "(Loading...)" :
                          loadedBulkUnits.has(bulk.uuid) ? `(${loadedBulkUnits.get(bulk.uuid)?.length || 0})` : ""}
                      </h4>
                      {loadingBulkUnits.has(bulk.uuid) ? (
                        <div className="space-y-2">
                          {[...Array(3)].map((_, i) => (
                            <Skeleton key={i} className="h-20 rounded-lg" />
                          ))}
                        </div>
                      ) : loadedBulkUnits.has(bulk.uuid) ? (
                        <div className="space-y-2">
                          {loadedBulkUnits.get(bulk.uuid)?.map((unit: any) => (
                            <div key={unit.uuid} className="p-3 bg-default-100 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-default-900">{unit.name || unit.code}</span>
                                <div className="flex items-center gap-2">
                                  <Chip size="sm" color={getStatusColor(unit.status || "AVAILABLE")} variant="flat">
                                    {unit.status || "AVAILABLE"}
                                  </Chip>
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    color="default"
                                    isIconOnly
                                    onPress={() => copyToClipboard(unit.uuid)}
                                  >
                                    <Icon icon="mdi:content-copy" className="text-default-500 text-sm" />
                                  </Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-2">
                                <div>
                                  <p className="text-default-600">Code</p>
                                  <p>{unit.code}</p>
                                </div>
                                <div>
                                  <p className="text-default-600">Value</p>
                                  <p>{unit.unit_value} {unit.unit}</p>
                                </div>
                                <div>
                                  <p className="text-default-600">Cost</p>
                                  <p>{formatCurrency(unit.cost)}</p>
                                </div>
                                <div>
                                  <p className="text-default-600">Status</p>
                                  <p>{unit.status || "AVAILABLE"}</p>
                                </div>
                              </div>
                              <div className="mb-2">
                                <p className="text-default-600 text-sm mb-1">Unit ID:</p>
                                <Snippet
                                  symbol=""
                                  variant="flat"
                                  color="default"
                                  size="sm"
                                  className="text-xs p-1 pl-2"
                                  classNames={{ copyButton: "bg-default-300 hover:!bg-default-400 text-sm p-0 h-6 w-6" }}
                                  codeString={unit.uuid}
                                  onCopy={() => copyToClipboard(unit.uuid)}
                                >
                                  {unit.uuid}
                                </Snippet>
                              </div>
                              {renderProperties(unit.properties)}
                            </div>
                          )) || (
                              <p className="text-default-600 text-center py-4">No units found</p>
                            )}
                        </div>
                      ) : (
                        <p className="text-default-600 text-center py-4">Click to load units</p>
                      )}
                    </div>
                  </div>
                </AccordionItem>
              ))}
            </Accordion>
          </CardBody>
        </Card>
      )}
    </div>
  );

  const renderInventoryDetails = (details: GoPageInventoryDetails) => (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-background">
        <CardHeader className="p-4 justify-between flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-secondary-100 rounded-lg">
              <Icon icon="mdi:package-variant" className="text-secondary" width={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">
                {details.name || "Inventory Item"}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-default-500">Inventory ID:</p>
                <Snippet
                  symbol=""
                  variant="flat"
                  color="default"
                  size="sm"
                  className="text-xs"
                  codeString={details.uuid}
                  onCopy={() => copyToClipboard(details.uuid)}
                >
                  {details.uuid.slice(0, 8)}...
                </Snippet>
              </div>
            </div>
          </div>
          <Chip size='sm' color={getStatusColor(details.status || "AVAILABLE")} variant="flat">
            {details.status || "AVAILABLE"}
          </Chip>
        </CardHeader>
        <Divider />
        <CardBody className="space-y-4 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-default-500">Unit</p>
              <p>{details.unit}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-default-500">Total Bulks</p>
              <p>{details.inventory_item_bulks.length}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-default-500">Created At</p>
              <p>{formatDate(`${details.created_at}`)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-default-500">Last Updated</p>
              <p>{formatDate(`${details.updated_at}`)}</p>
            </div>
          </div>

          {details.description && (
            <div>
              <p className="text-sm font-medium text-default-500">Description</p>
              <p>{details.description}</p>
            </div>
          )}

          {/* Custom Properties */}
          {renderProperties(details.properties)}
        </CardBody>
      </Card>

      {/* Inventory Bulks */}
      <Card className="bg-background mt-4">
        <CardHeader className="p-4">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:cube-outline" className="text-primary" width={20} />
            <h3 className="text-lg font-semibold">Inventory Bulks</h3>
            <Chip size="sm" variant="flat" color="primary">
              {details.inventory_item_bulks.length}
            </Chip>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="px-2 py-4">
          <Accordion
            selectionMode="multiple"
            variant="splitted"
            itemClasses={{
              base: "p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
              title: "font-normal text-lg font-semibold",
              trigger: "p-4 data-[hover=true]:bg-default-100 h-14 flex items-center transition-colors",
              indicator: "text-medium",
              content: "text-small p-0",
            }}>
            {details.inventory_item_bulks.map((bulk, index) => (
              <AccordionItem
                key={bulk.uuid}
                title={
                  <div className="flex items-center justify-between w-full">
                    <span>Bulk #{index + 1}</span>
                    <div className="flex items-center gap-2">
                      <Chip size="sm" color={getStatusColor(bulk.status || "AVAILABLE")} variant="flat">
                        {bulk.status || "AVAILABLE"}
                      </Chip>
                      <span className="text-sm text-default-600">
                        {bulk.unit_value} {bulk.unit} • {formatCurrency(bulk.cost)}
                      </span>
                    </div>
                  </div>
                }
              >
                <div className="space-y-4 p-4">
                  {/* Bulk ID */}
                  <div>
                    <p className="text-sm font-medium text-default-500 mb-1">Bulk ID</p>
                    <Snippet
                      symbol=""
                      variant="flat"
                      color="primary"
                      size="sm"
                      className="text-xs"
                      codeString={bulk.uuid}
                      onCopy={() => copyToClipboard(bulk.uuid)}
                    >
                      {bulk.uuid}
                    </Snippet>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm font-medium text-default-500">Unit Value</p>
                      <p>{bulk.unit_value} {bulk.unit}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-default-500">Bulk Unit</p>
                      <p>{bulk.bulk_unit}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-default-500">Cost</p>
                      <p>{formatCurrency(bulk.cost)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-default-500">Type</p>
                      <p>{bulk.is_single_item ? "Single Item" : "Multiple Items"}</p>
                    </div>
                  </div>

                  {/* Custom Properties */}
                  {renderProperties(bulk.properties)}

                  {/* Units */}
                  {bulk.inventory_item_units && bulk.inventory_item_units.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-default-900 mb-3">Units ({bulk.inventory_item_units.length})</h4>
                      <div className="space-y-2">
                        {bulk.inventory_item_units.map((unit) => (
                          <div key={unit.uuid} className="p-3 bg-default-100 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-default-900">{unit.name || unit.code}</span>
                              <div className="flex items-center gap-2">
                                <Chip size="sm" color={getStatusColor(unit.status || "AVAILABLE")} variant="flat">
                                  {unit.status || "AVAILABLE"}
                                </Chip>
                                <Button
                                  size="sm"
                                  variant="flat"
                                  color="default"
                                  isIconOnly
                                  onPress={() => copyToClipboard(unit.uuid)}
                                >
                                  <Icon icon="mdi:content-copy" className="text-default-500 text-sm" />
                                </Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-2">
                              <div>
                                <p className="text-default-600">Code</p>
                                <p>{unit.code}</p>
                              </div>
                              <div>
                                <p className="text-default-600">Value</p>
                                <p>{unit.unit_value} {unit.unit}</p>
                              </div>
                              <div>
                                <p className="text-default-600">Cost</p>
                                <p>{formatCurrency(unit.cost)}</p>
                              </div>
                              <div>
                                <p className="text-default-600">Status</p>
                                <p>{unit.status || "AVAILABLE"}</p>
                              </div>
                            </div>
                            <div className="mb-2">
                              <p className="text-default-600 text-sm mb-1">Unit ID:</p>
                              <Snippet
                                symbol=""
                                variant="flat"
                                color="default"
                                size="sm"
                                className="text-xs"
                                codeString={unit.uuid}
                                onCopy={() => copyToClipboard(unit.uuid)}
                              >
                                {unit.uuid}
                              </Snippet>
                            </div>
                            {renderProperties(unit.properties)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionItem>
            ))}
          </Accordion>
        </CardBody>
      </Card>

      {/* Delivery History */}
      {details.delivery_history && details.delivery_history.length > 0 && (
        <Card className="bg-background mt-4">
          <CardHeader className="p-4">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:history" className="text-warning" width={20} />
              <h3 className="text-lg font-semibold">Delivery History</h3>
              <Chip size="sm" variant="flat" color="warning">
                {details.delivery_history.length}
              </Chip>
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="p-4">
            <div className="space-y-3">
              {details.delivery_history.map((delivery) => (
                <div
                  key={delivery.uuid}
                  className="flex items-center justify-between p-3 bg-default-50 rounded-lg cursor-pointer hover:bg-default-100 transition-colors"
                  onClick={() => router.push(`/home/delivery?deliveryId=${delivery.uuid}`)}
                >
                  <div className="flex-1">
                    <p className="font-medium text-default-900">{delivery.delivery_address}</p>
                    <p className="text-sm text-default-600">{formatDate(delivery.delivery_date)}</p>
                    <Snippet
                      symbol=""
                      variant="flat"
                      color="warning"
                      size="sm"
                      className="text-xs mt-1"
                      codeString={delivery.uuid}
                      onCopy={() => copyToClipboard(delivery.uuid)}
                    >
                      {delivery.uuid.slice(0, 8)}...
                    </Snippet>
                  </div>
                  <Chip size="sm" color={getStatusColor(delivery.status)} variant="flat">
                    {delivery.status}
                  </Chip>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );

  const renderWarehouseDetails = (details: GoPageWarehouseDetails) => (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-background">
        <CardHeader className="p-4 justify-between flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-secondary-100 rounded-lg">
              <Icon icon="mdi:package-variant" className="text-secondary" width={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">
                {details.name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-default-500">Warehouse Item ID:</p>
                <Snippet
                  symbol=""
                  variant="flat"
                  color="default"
                  size="sm"
                  className="text-xs"
                  codeString={details.uuid}
                  onCopy={() => copyToClipboard(details.uuid)}
                >
                  {details.uuid.slice(0, 8)}...
                </Snippet>
              </div>
            </div>
          </div>
          <Chip size='sm' color={getStatusColor(details.status)} variant="flat">
            {details.status}
          </Chip>
        </CardHeader>
        <Divider />
        <CardBody className="space-y-4 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-default-500">Unit</p>
              <p>{details.unit}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-default-500">Total Bulks</p>
              <p>{details.bulks.length}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-default-500">Total Units</p>
              <p>
                {details.bulks.reduce((sum, bulk) => sum + (bulk.unit_count || bulk.units?.length || 0), 0)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-default-500">Created At</p>
              <p>{formatDate(details.created_at || "")}</p>
            </div>
          </div>

          {details.description && (
            <div>
              <p className="text-sm font-medium text-default-500">Description</p>
              <p>{details.description}</p>
            </div>
          )}

          {/* Custom Properties */}
          {renderProperties(details.properties)}
        </CardBody>
      </Card>

      {/* Related Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Warehouse Info */}
        {details.warehouse && (
          <Card className="bg-background mt-4">
            <CardHeader className="p-4">
              <div className="flex items-center gap-2">
                <Icon icon="mdi:warehouse" className="text-success" width={20} />
                <h3 className="text-lg font-semibold">Warehouse</h3>
              </div>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3 p-4">
              <div>
                <p className="text-sm font-medium text-default-500">Name</p>
                <p>{details.warehouse.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-default-500 mb-1">Warehouse ID</p>
                <Snippet
                  symbol=""
                  variant="flat"
                  color="success"
                  size="sm"
                  className="text-xs"
                  codeString={details.warehouse.uuid}
                  onCopy={() => copyToClipboard(details.warehouse?.uuid || '')}
                >
                  {details.warehouse.uuid.slice(0, 8)}...
                </Snippet>
              </div>
              <div>
                <p className="text-sm font-medium text-default-500">Address</p>
                <p>
                  {details.warehouse.address?.fullAddress || "Address not available"}
                </p>
              </div>
              <Button
                size="sm"
                color="success"
                variant="flat"
                onPress={() => router.push(`/home/warehouses?warehouseItemId=${details.warehouse!.uuid}`)}
              >
                View Warehouse
              </Button>
            </CardBody>
          </Card>
        )}

        {/* Original Inventory Item */}
        {details.inventory_item && (
          <Card className="bg-background mt-4">
            <CardHeader className="p-4">
              <div className="flex items-center gap-2">
                <Icon icon="mdi:package-variant" className="text-primary" width={20} />
                <h3 className="text-lg font-semibold">Original Inventory</h3>
              </div>
            </CardHeader>
            <Divider />
            <CardBody className="space-y-3 p-4">
              <div>
                <p className="text-sm font-medium text-default-500">Name</p>
                <p>{details.inventory_item.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-default-500">Unit</p>
                <p>{details.inventory_item.unit}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-default-500 mb-1">Inventory ID</p>
                <Snippet
                  symbol=""
                  variant="flat"
                  color="primary"
                  size="sm"
                  className="text-xs"
                  codeString={details.inventory_item.uuid}
                  onCopy={() => copyToClipboard(details.inventory_item?.uuid || '')}
                >
                  {details.inventory_item.uuid.slice(0, 8)}...
                </Snippet>
              </div>
              {details.inventory_item.description && (
                <div>
                  <p className="text-sm font-medium text-default-500">Description</p>
                  <p>{details.inventory_item.description}</p>
                </div>
              )}
              <Button
                size="sm"
                color="primary"
                variant="flat"
                onPress={() => router.push(`/home/inventory?itemId=${details.inventory_item!.uuid}`)}
              >
                View Original
              </Button>
            </CardBody>
          </Card>
        )}
      </div>

      {/* Delivery Information */}
      {details.delivery_item && (
        <Card className="bg-background mt-4">
          <CardHeader className="p-4">
            <div className="flex items-center gap-2">
              <Icon icon="mdi:truck-delivery" className="text-warning" width={20} />
              <h3 className="text-lg font-semibold">Delivery Information</h3>
            </div>
          </CardHeader>
          <Divider />
          <CardBody className="p-4">
            <div className="flex items-center justify-between p-3 bg-default-50 rounded-lg cursor-pointer hover:bg-default-100 transition-colors"
              onClick={() => router.push(`/home/delivery?deliveryId=${details.delivery_item!.uuid}`)}
            >
              <div className="flex-1">
                <p className="font-medium text-default-900">{details.delivery_item.delivery_address}</p>
                <p className="text-sm text-default-600">{formatDate(details.delivery_item.delivery_date)}</p>
                <Snippet
                  symbol=""
                  variant="flat"
                  color="warning"
                  size="sm"
                  className="text-xs mt-1"
                  codeString={details.delivery_item.uuid}
                  onCopy={() => copyToClipboard(details.delivery_item?.uuid || '')}
                >
                  {details.delivery_item.uuid.slice(0, 8)}...
                </Snippet>
              </div>
              <Chip size="sm" color={getStatusColor(details.delivery_item.status)} variant="flat">
                {details.delivery_item.status}
              </Chip>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Warehouse Bulks with Units - Using Accordion */}
      <Card className="bg-background mt-4">
        <CardHeader className="p-4">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:cube-outline" className="text-success" width={20} />
            <h3 className="text-lg font-semibold">Storage Bulks</h3>
            <Chip size="sm" variant="flat" color="success">
              {details.bulks.length}
            </Chip>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="px-2 py-4">
          <Accordion
            selectionMode="multiple"
            variant="splitted"
            itemClasses={{
              base: "p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
              title: "font-normal text-lg font-semibold",
              trigger: "p-4 data-[hover=true]:bg-default-100 h-14 flex items-center transition-colors",
              indicator: "text-medium",
              content: "text-small p-0",
            }}
            onSelectionChange={(keys) => {
              // Load units for opened accordion items
              if (keys instanceof Set) {
                keys.forEach(key => {
                  const bulkIndex = parseInt(key.toString());
                  if (details.bulks && details.bulks[bulkIndex]) {
                    const bulk = details.bulks[bulkIndex];
                    loadBulkUnits(bulk.uuid, true);
                  }
                });
              }
            }}
          >
            {details.bulks.map((bulk, index) => (
              <AccordionItem
                key={index}
                title={
                  <div className="flex items-center justify-between w-full">
                    <span>Bulk #{index + 1} - {bulk.location_code}</span>
                    <div className="flex items-center gap-2">
                      <Chip size="sm" color={getStatusColor(bulk.status)} variant="flat">
                        {bulk.status}
                      </Chip>
                      <span className="text-sm text-default-600">
                        {bulk.unit_value} {bulk.unit} • {formatCurrency(bulk.cost)}
                      </span>
                    </div>
                  </div>
                }
              >
                <div className="space-y-4 p-4">
                  {/* Bulk ID */}
                  <div>
                    <p className="text-sm font-medium text-default-500 mb-1">Bulk ID</p>
                    <Snippet
                      symbol=""
                      variant="flat"
                      color="success"
                      size="sm"
                      className="text-xs"
                      codeString={bulk.uuid}
                      onCopy={() => copyToClipboard(bulk.uuid)}
                    >
                      {bulk.uuid}
                    </Snippet>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm font-medium text-default-500">Location Code</p>
                      <p>{bulk.location_code}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-default-500">Bulk Unit</p>
                      <p>{bulk.bulk_unit}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-default-500">Cost</p>
                      <p>{formatCurrency(bulk.cost)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-default-500">Type</p>
                      <p>{bulk.is_single_item ? "Single Item" : "Multiple Items"}</p>
                    </div>
                  </div>

                  {/* Location Details */}
                  {bulk.location && (
                    <div className="p-3 bg-default-100 rounded-lg">
                      <p className="font-medium text-default-900 mb-2">Storage Location</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div>
                          <p className="text-default-600">Floor</p>
                          <p>{bulk.location.floor}</p>
                        </div>
                        <div>
                          <p className="text-default-600">Group</p>
                          <p>{bulk.location.group}</p>
                        </div>
                        <div>
                          <p className="text-default-600">Row</p>
                          <p>{bulk.location.row}</p>
                        </div>
                        <div>
                          <p className="text-default-600">Column</p>
                          <p>{bulk.location.column}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Custom Properties */}
                  {renderProperties(bulk.properties)}

                  {/* Units - Lazy loaded */}
                  <div>
                    <h4 className="font-semibold text-default-900 mb-3">
                      Units {loadingBulkUnits.has(bulk.uuid) ? "(Loading...)" :
                        loadedBulkUnits.has(bulk.uuid) ? `(${loadedBulkUnits.get(bulk.uuid)?.length || 0})` :
                          bulk.unit_count ? `(${bulk.unit_count})` : ""}
                    </h4>
                    {loadingBulkUnits.has(bulk.uuid) ? (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-20 rounded-lg" />
                        ))}
                      </div>
                    ) : loadedBulkUnits.has(bulk.uuid) ? (
                      <div className="space-y-2">
                        {loadedBulkUnits.get(bulk.uuid)?.map((unit: any) => (
                          <div key={unit.uuid} className="p-3 bg-default-100 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-default-900">{unit.name || unit.code}</span>
                              <div className="flex items-center gap-2">
                                <Chip size="sm" color={getStatusColor(unit.status)} variant="flat">
                                  {unit.status}
                                </Chip>
                                <Button
                                  size="sm"
                                  variant="flat"
                                  color="default"
                                  isIconOnly
                                  onPress={() => copyToClipboard(unit.uuid)}
                                >
                                  <Icon icon="mdi:content-copy" className="text-default-500 text-sm" />
                                </Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mb-2">
                              <div>
                                <p className="text-default-600">Code</p>
                                <p>{unit.code}</p>
                              </div>
                              <div>
                                <p className="text-default-600">Value</p>
                                <p>{unit.unit_value} {unit.unit}</p>
                              </div>
                              <div>
                                <p className="text-default-600">Cost</p>
                                <p>{formatCurrency(unit.cost)}</p>
                              </div>
                              <div>
                                <p className="text-default-600">Location</p>
                                <p>{unit.location_code || "Not set"}</p>
                              </div>
                            </div>
                            <div className="mb-2">
                              <p className="text-default-600 text-sm mb-1">Unit ID:</p>
                              <Snippet
                                symbol=""
                                variant="flat"
                                color="default"
                                size="sm"
                                className="text-xs"
                                codeString={unit.uuid}
                                onCopy={() => copyToClipboard(unit.uuid)}
                              >
                                {unit.uuid}
                              </Snippet>
                            </div>
                            {renderProperties(unit.properties)}
                          </div>
                        )) || (
                            <p className="text-default-600 text-center py-4">No units found</p>
                          )}
                      </div>
                    ) : (
                      <p className="text-default-600 text-center py-4">Click to load units</p>
                    )}
                  </div>
                </div>
              </AccordionItem>
            ))}
          </Accordion>
        </CardBody>
      </Card>
    </div>
  );


  return (
    <div className="container mx-auto p-2 max-w-5xl">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <motion.div
          {...motionTransitionScale}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Search for Item Details</h1>
            {(isLoading) ? (
              <div className="text-default-500 flex xl:justify-start justify-center items-center">
                <p className='my-auto mr-1'>Loading item details</p>
                <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
              </div>
            ) : (
              <p className="text-default-500">Enter an identifier to view detailed information about any item in your system.</p>
            )}
          </div>

          {/* Search Bar */}
          <CardList>
            <div className="flex gap-3 items-center w-full relative">
              <Input
                placeholder="Enter UUID (delivery, inventory, or warehouse item)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isSearching || !searchQuery.trim()}
                onKeyPress={handleKeyPress}
                startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
                classNames={{
                  inputWrapper: "bg-default-100 border-2 border-default-200 hover:border-default-300 focus-within:!border-primary-500 !cursor-text rounded-lg",
                  input: "text-default-500",
                  label: "text-default-600"
                }}
                size="lg"
                className="flex-1"
              />
              <Button
                color="primary"
                variant="shadow"
                onPress={handleSearch}
                className="rounded-lg absolute right-2 -translate-y-1/2 top-1/2"
                size="sm"
                isLoading={isSearching}
                startContent={!isSearching && <Icon icon="mdi:magnify" />}
                disabled={isSearching || !searchQuery.trim()}
              >
                Search
              </Button>
            </div>
          </CardList>
        </motion.div>
        <AnimatePresence mode="wait">
          {/* Error Message */}
          {error && (
            <motion.div
              key="error"
              {...motionTransition}
            >
              <Alert
                color="danger"
                variant="solid"
                className="shadow-danger-500/20 shadow-xl"
                icon={
                  <Icon icon="mdi:alert-circle" width={24} />
                }
                endContent={
                  <Button
                    color="danger"
                    variant="solid"
                    isIconOnly
                    onPress={() => setError(null)}
                  >
                    <Icon icon="mdi:close" />
                  </Button>
                }
                title="Error"
                description={error}
              />
            </motion.div>
          )}

          {/* Loading State */}
          {isSearching && !error && (
            <motion.div
              key="loading"
              {...motionTransition}
            >
              <Card className="bg-background">
                <CardBody className="p-6">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full">
                      <Icon icon="mdi:magnify" className="text-primary-600 animate-pulse" width={32} />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-default-900 mb-2">
                        Searching for Item Details
                      </h3>
                      <p className="text-default-500 mb-4">
                        Please wait while we retrieve the information...
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <Spinner size="sm" color="primary" />
                        <span className="text-sm text-default-600">Processing your request</span>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </motion.div>
          )}

          {/* Item Delivery Details */}
          {itemDetails && itemType && itemType === 'delivery' && (
            <motion.div
              key="delivery-details"
              {...motionTransition}
            >
              <div className={`transition-opacity transition-blur ${isSearching && !error && 'opacity-75 blur-sm'}`}>
                {renderDeliveryDetails(itemDetails as GoPageDeliveryDetails)}
              </div>
            </motion.div>
          )}

          {/* Item Inventory Details */}
          {itemDetails && itemType && itemType === 'inventory' && (
            <motion.div
              key="inventory-details"
              {...motionTransition}
            >
              <div className={`transition-opacity transition-blur ${isSearching && !error && 'opacity-75 blur-sm'}`}>
                {renderInventoryDetails(itemDetails as GoPageInventoryDetails)}
              </div>
            </motion.div>
          )}

          {/* Item Warehouse Invenrtory Details */}
          {itemDetails && itemType && itemType === 'warehouse_inventory' && (
            <motion.div
              key="warehouse-details"
              {...motionTransition}
            >
              <div className={`transition-opacity transition-blur ${isSearching && !error && 'opacity-75 blur-sm'}`}>
                {renderWarehouseDetails(itemDetails as GoPageWarehouseDetails)}
              </div>
            </motion.div>
          )}

          {/* Instructions */}
          {!itemDetails && !error && !isSearching && (
            <motion.div
              key="instructions"
              {...motionTransition}
            >
              <Card className="bg-background">
                <CardBody className="text-center py-12">
                  <Icon icon="mdi:information-outline" className="text-default-400 mx-auto mb-4" width={48} />
                  <h3 className="text-xl font-semibold text-default-900 mb-2">
                    How to Use Go to Item Details
                  </h3>
                  <p className="text-default-600 mb-6 max-w-md mx-auto">
                    Enter any UUID from your delivery items, inventory items, or warehouse items to view comprehensive details.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-warning-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                        <Icon icon="mdi:truck-delivery" className="text-warning" width={24} />
                      </div>
                      <p className="font-medium text-default-900">Delivery Items</p>
                      <p className="text-sm text-default-600">View delivery details, operators, locations</p>
                    </div>

                    <div className="text-center">
                      <div className="w-12 h-12 bg-secondary-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                        <Icon icon="mdi:package-variant" className="text-secondary" width={24} />
                      </div>
                      <p className="font-medium text-default-900">Inventory Items</p>
                      <p className="text-sm text-default-600">View bulks, units, delivery history</p>
                    </div>

                    <div className="text-center">
                      <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                        <Icon icon="mdi:warehouse" className="text-success" width={24} />
                      </div>
                      <p className="font-medium text-default-900">Warehouse Items</p>
                      <p className="text-sm text-default-600">View storage locations, units</p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div >
    </div >
  );
}