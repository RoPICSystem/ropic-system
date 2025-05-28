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
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";

import { getUserFromCookies } from "@/utils/supabase/server/user";
import { formatDate, formatNumber } from "@/utils/tools";
import { motionTransition } from "@/utils/anim";
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
  const [itemType, setItemType] = useState<'delivery' | 'inventory' | 'warehouse' | null>(null);
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

        const uuid = deliveryId || inventoryId || warehouseItemId || itemId;

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
    if (!searchQuery.trim()) {
      setItemDetails(null);
      setItemType(null);
      setError(null);
      return;
    }

    await loadItemDetails(searchQuery.trim());
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
    <div className="space-2">
      {/* Header */}

      <Card className="bg-background mt-4">
        <CardHeader className="p-4 justify-between flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-warning-100 rounded-lg">
              <Icon icon="mdi:truck-delivery" className="text-warning" width={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">
                {details.name || "Delivery Item"}
              </h2>
              <p className="text-xs text-default-500">Delivery ID: {details.uuid}</p>
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
            <div>
              <p className="text-sm font-medium text-default-500">Notes</p>
              <p>{details.notes}</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Related Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                View Details
              </Button>
            </CardBody>
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
                                <Chip size="sm" color={getStatusColor(unit.status || "AVAILABLE")} variant="flat">
                                  {unit.status || "AVAILABLE"}
                                </Chip>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
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
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-background mt-2">
        <CardHeader className="p-4 justify-between flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-secondary-100 rounded-lg">
              <Icon icon="mdi:package-variant" className="text-secondary" width={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">
                {details.name || "Delivery Item"}
              </h2>
              <p className="text-xs text-default-500">Inventory ID: {details.uuid}</p>
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

                  {/* Units */}
                  {bulk.inventory_item_units && bulk.inventory_item_units.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-default-900 mb-3">Units ({bulk.inventory_item_units.length})</h4>
                      <div className="space-y-2">
                        {bulk.inventory_item_units.map((unit) => (
                          <div key={unit.uuid} className="p-3 bg-default-100 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-default-900">{unit.name || unit.code}</span>
                              <Chip size="sm" color={getStatusColor(unit.status || "AVAILABLE")} variant="flat">
                                {unit.status || "AVAILABLE"}
                              </Chip>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
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
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-background mt-4">
        <CardHeader className="p-4 justify-between flex-wrap">
           <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-secondary-100 rounded-lg">
              <Icon icon="mdi:package-variant" className="text-secondary" width={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">
                {details.name}
              </h2>
              <p className="text-xs text-default-500">Warehouse ID: {details.uuid}</p>
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
                              <Chip size="sm" color={getStatusColor(unit.status)} variant="flat">
                                {unit.status}
                              </Chip>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
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
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionTransition}
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
              <p className="text-default-500">Enter a UUID to view detailed information about any item in your system.</p>
            )}
          </div>

          {/* Search Bar */}
          <CardList>
            <div className="flex gap-3 items-center w-full">
              <Input
                placeholder="Enter UUID (delivery, inventory, or warehouse item)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
                classNames={inputStyle}
                size="lg"
                className="flex-1"
              />
              <Button
                color="primary"
                onPress={handleSearch}
                className="px-8 h-12"
                size="lg"
                startContent={
                  isSearching ? <Spinner className="inline-block scale-75" size="sm" color="default" /> : <Icon icon="mdi:magnify" />
                }
                disabled={isSearching || !searchQuery.trim()}
              >
                Search
              </Button>
            </div>
          </CardList>
        </motion.div>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionTransition}
          >
            <Card className="shadow-md border-l-4 border-l-danger">
              <CardBody className="p-4">
                <div className="flex items-center gap-3">
                  <Icon icon="mdi:alert-circle" className="text-danger" width={24} />
                  <div>
                    <p className="font-semibold text-danger">Error</p>
                    <p className="text-default-500">{error}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        )}

        {/* Item Details */}
        {itemDetails && itemType && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...motionTransition, delay: 0.1 }}
          >
            {itemType === 'delivery' && renderDeliveryDetails(itemDetails as GoPageDeliveryDetails)}
            {itemType === 'inventory' && renderInventoryDetails(itemDetails as GoPageInventoryDetails)}
            {itemType === 'warehouse' && renderWarehouseDetails(itemDetails as GoPageWarehouseDetails)}
          </motion.div>
        )}

        {/* Instructions */}
        {!itemDetails && !error && !isSearching && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...motionTransition, delay: 0.2 }}
          >
            <Card className="bg-background mt-4">
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
                    <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <Icon icon="mdi:package-variant" className="text-primary" width={24} />
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
      </div>
    </div>
  );
}