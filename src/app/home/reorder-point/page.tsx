"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Input,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Skeleton,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import CardList from "@/components/card-list";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { motionTransition } from "@/utils/anim";
import {
  getReorderPointLogs,
  getReorderPointLogDetails,
  updateCustomSafetyStock,
  triggerReorderPointCalculation,
  InventoryStatus,
  ReorderPointLog,
  getOperators,
  triggerSpecificReorderPointCalculation
} from "./actions";
import { getWarehouses } from "../warehouses/actions";
import { formatDate, showErrorToast } from "@/utils/tools";
import { getUserFromCookies } from "@/utils/supabase/server/user";
import LoadingAnimation from "@/components/loading-animation";
import { createClient } from "@/utils/supabase/client";
import { FilterOption, SearchListPanel } from '@/components/search-list-panel/search-list-panel';

export default function ReorderPointPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Modal states
  const customSafetyStockModal = useDisclosure();

  // Reorder point logs state
  const [reorderPointLogs, setReorderPointLogs] = useState<ReorderPointLog[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState<Partial<ReorderPointLog>>({});
  const [customSafetyStock, setCustomSafetyStock] = useState<number | null>(null);
  const [safetyStockNotes, setSafetyStockNotes] = useState("");

  // Autocomplete style
  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };

  // Filter options for SearchListPanel
  const reorderPointFilters: Record<string, FilterOption> = {
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
        IN_STOCK: "In Stock",
        WARNING: "Warning",
        CRITICAL: "Critical",
        OUT_OF_STOCK: "Out of Stock"
      }
    }
  };

  // Helper function to get status chip color
  const getStatusColor = (status: InventoryStatus): "success" | "warning" | "danger" | "default" => {
    switch (status) {
      case "IN_STOCK": return "success";
      case "WARNING": return "warning";
      case "CRITICAL": return "danger";
      case "OUT_OF_STOCK": return "danger";
      default: return "default";
    }
  };

  // Load specific reorder point log details
  const loadReorderPointLogDetails = useCallback(async (logId: string) => {
    if (!logId) return;

    setIsLoading(true);
    try {
      const result = await getReorderPointLogDetails(logId);

      if (result.success && result.data) {
        setFormData(result.data);
        setCustomSafetyStock(
          result.data.custom_safety_stock !== null
            ? result.data.custom_safety_stock ?? 0
            : result.data.safety_stock ?? 0
        );
        setSafetyStockNotes(result.data.notes || "");
      } else {
        console.error("Failed to load reorder point log details:", result.error);
        setError("Failed to load selected item details");
      }
    } catch (error) {
      console.error("Error loading reorder point log details:", error);
      setError("Failed to load selected item details");
    } finally {
      setIsLoading(false);
    }
  }, []);


  // Handle selecting a reorder point log
  const handleSelectItem = (key: string) => {
    // Update the URL with the selected item ID without reloading the page
    const params = new URLSearchParams(searchParams.toString());
    params.set("logId", key);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle saving custom safety stock
  const handleSaveCustomSafetyStock = async () => {
    if (!selectedItemId || customSafetyStock === null || !formData.warehouse_inventory_uuid) return;

    setIsLoading(true);
    try {
      const result = await updateCustomSafetyStock(
        formData.warehouse_inventory_uuid,
        customSafetyStock,
        safetyStockNotes
      );

      if (result.success) {
        // Update the local form data
        setFormData(prev => ({
          ...prev,
          custom_safety_stock: customSafetyStock,
          safety_stock: customSafetyStock,
          notes: safetyStockNotes
        }));
      }
    } catch (error) {
      console.error("Error updating custom safety stock:", error);
    } finally {
      setIsLoading(false);
      customSafetyStockModal.onClose();
    }
  };

  // Handle recalculating reorder points (modified to handle both specific and all)
  const handleRecalculateReorderPoints = async (isSpecific: boolean = false) => {
    setIsLoading(true);
    try {
      let result;

      if (isSpecific && formData.warehouse_inventory_uuid) {
        // Recalculate for specific item
        result = await triggerSpecificReorderPointCalculation(
          formData.warehouse_inventory_uuid
        );
      } else {
        // Recalculate for all items
        result = await triggerReorderPointCalculation();
      }

      if (result.success) {
        // If we have a selected item and did specific calculation, refresh its details
        if (isSpecific && selectedItemId && result.data) {
          const updatedLog = Array.isArray(result.data) ? result.data[0] : result.data;
          if (updatedLog) {
            setFormData(updatedLog);
            setCustomSafetyStock(updatedLog.custom_safety_stock !== null ? updatedLog.custom_safety_stock ?? 0 : updatedLog.safety_stock ?? 0);
            setSafetyStockNotes(updatedLog.notes || "");
          }
        }
      }
    } catch (error) {
      console.error("Error recalculating reorder points:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle viewing warehouse details
  const handleViewWarehouse = () => {
    if (formData.warehouse_uuid) {
      router.push(`/home/warehouses?warehouseId=${formData.warehouse_uuid}`);
    }
  };

  // Handle view warehouse inventory
  const handleViewWarehouseInventory = () => {
    if (formData.warehouse_inventory_uuid) {
      router.push(`/home/warehouse-items?warehouseItemId=${formData.warehouse_inventory_uuid}`);
    }
  }

  // Effect to handle URL params (logId)
  useEffect(() => {
    const logId = searchParams.get("logId");

    if (logId && logId !== selectedItemId) {
      setSelectedItemId(logId);
      loadReorderPointLogDetails(logId);
    } else if (!logId && selectedItemId) {
      // Clear selection if no logId in URL
      setSelectedItemId(null);
      setFormData({});
      setCustomSafetyStock(null);
      setSafetyStockNotes("");
      setIsLoading(false);
    }
  }, [searchParams, selectedItemId, loadReorderPointLogDetails]);


  // Update the initPage function to fetch with pagination
  useEffect(() => {
    const initPage = async () => {
      try {
        setIsLoadingWarehouses(true);

        const userData = await getUserFromCookies();
        if (userData === null) {
          setError('User not found');
          return;
        }

        setUser(userData);

        // Fetch warehouses for filtering
        const warehousesResult = await getWarehouses(userData.company_uuid);
        setWarehouses(warehousesResult.data || []);
        setIsLoadingWarehouses(false);

      } catch (error) {
        console.error("Error initializing page:", error);
        setError("Failed to load data. Please try again later.");
        setIsLoadingWarehouses(false);
      }
    };

    initPage();
  }, []);

  useEffect(() => {
    if (!user?.company_uuid) return;

    const supabase = createClient();

    // Set up real-time subscription for reorder point logs
    const reorderLogsChannel = supabase
      .channel('reorder-logs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reorder_point_logs',
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async (payload) => {
          // If we have a selected item, refresh its details
          if (selectedItemId) {
            // Reload the specific log details
            await loadReorderPointLogDetails(selectedItemId);
          }
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(reorderLogsChannel);
    };
  }, [user?.company_uuid, selectedItemId, loadReorderPointLogDetails]);


  // Set up real-time updates
  useEffect(() => {
    if (!user?.company_uuid) return;

    const supabase = createClient();

    // Set up real-time subscription for reorder point logs
    const reorderLogsChannel = supabase
      .channel('reorder-logs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reorder_point_logs',
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async (payload) => {
          // If we have a selected item, refresh its details
          if (selectedItemId) {
            // Find updated log and refresh form data
            const refreshedLogs = await getReorderPointLogs(
              user.company_uuid,
              undefined,
              undefined
            );

            const selectedLog = refreshedLogs.data?.find(log => log.uuid === selectedItemId);
            if (selectedLog) {
              setFormData(selectedLog);
              setCustomSafetyStock(selectedLog.custom_safety_stock ? selectedLog.safety_stock : selectedLog.custom_safety_stock || 0);
              setSafetyStockNotes(selectedLog.notes || "");
            }
          }
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(reorderLogsChannel);
    };
  }, [user?.company_uuid, selectedItemId]);

  // error handling for loading states
  useEffect(() => {
    if (error) {
      showErrorToast("Error", error);
      setError(null);
    }
  }, [error]);

  // Helper to get warehouse name
  const getWarehouseName = useCallback((warehouseId: string) => {
    const warehouse = warehouses.find(w => w.uuid === warehouseId);
    return warehouse ? warehouse.name : 'Unknown Warehouse';
  }, [warehouses]);

  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Reorder Point Management</h1>
            <p className="text-default-500">Monitor stock levels and set reorder points for your inventory.</p>
          </div>
          <div className="flex gap-4 xl:mt-0 mt-4 text-center">
            <Button
              color="primary"
              variant="shadow"
              onPress={() => { handleRecalculateReorderPoints() }}
              isLoading={isLoading}
              startContent={!isLoading && <Icon icon="mdi:refresh" />}
            >
              Recalculate All
            </Button>
          </div>
        </div>
        <div className="flex flex-col xl:flex-row gap-4">
          {/* Left side: Reorder Point Logs List using SearchListPanel */}
          <SearchListPanel
            title="Reorder Point Logs"
            tableName="reorder_point_logs"
            searchPlaceholder="Search logs..."
            searchLimit={10}
            dateFilters={["dateRange", "weekFilter", "specificDate"]}
            companyUuid={user?.company_uuid}
            filters={reorderPointFilters}
            renderItem={(log) => (
              <Button
                key={log.uuid}
                onPress={() => handleSelectItem(log.uuid)}
                variant="shadow"
                className={`w-full !transition-all duration-300 rounded-2xl p-0 group overflow-hidden min-h-[8.5rem]
                            ${selectedItemId === log.uuid ?
                    '!bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500 !shadow-xl hover:!shadow-2xl !shadow-primary-300/50 border-2 border-primary-300/30' :
                    '!bg-gradient-to-br from-background to-default-50 hover:from-default-50 hover:to-default-100 !shadow-lg hover:!shadow-xl !shadow-default-300/30 border-2 border-default-200/50 hover:border-default-300/50'}`}
              >
                <div className="w-full flex flex-col h-full relative">
                  {/* Background pattern */}
                  <div className={`absolute inset-0 opacity-5 ${selectedItemId === log.uuid ? 'bg-white' : 'bg-primary-500'}`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,_var(--tw-gradient-stops))] from-current via-transparent to-transparent"></div>
                  </div>

                  {/* Log details */}
                  <div className="flex-grow flex flex-col justify-center px-4 relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 text-left">
                        <span className={`font-bold text-lg leading-tight block truncate text-left
                                          ${selectedItemId === log.uuid ? 'text-primary-50' : 'text-default-800'}`}>
                          {log.inventory_name || 'Unknown Item'}
                        </span>
                        <div className={`w-full mt-1 text-sm leading-relaxed text-left
                                        ${selectedItemId === log.uuid ? 'text-primary-100' : 'text-default-600'}`}>
                          {getWarehouseName(log.warehouse_uuid)}
                        </div>
                      </div>
                      <div className="flex-shrink-0 self-start">
                        <Chip
                          color={selectedItemId === log.uuid ? "default" : getStatusColor(log.status)}
                          variant="shadow"
                          size="sm"
                          className={`font-semibold ${selectedItemId === log.uuid ? 'bg-primary-50 text-primary-600' : ''}`}
                        >
                          {log.status.replaceAll('_', ' ')}
                        </Chip>
                      </div>
                    </div>
                  </div>

                  {/* Log metadata */}
                  <div className={`flex items-center gap-2 backdrop-blur-sm rounded-b-2xl border-t relative z-10 justify-start
        ${selectedItemId === log.uuid ?
                      'border-primary-300/30 bg-primary-700/20' :
                      'border-default-200/50 bg-default-100/50'} p-4`}>
                    <Chip
                      color={selectedItemId === log.uuid ? "default" : "secondary"}
                      variant="flat"
                      size="sm"
                      className={`font-medium ${selectedItemId === log.uuid ? 'bg-secondary-100/80 text-primary-700 border-primary-200/60' : 'bg-secondary-100/80'}`}
                    >
                      <div className="flex items-center gap-1">
                        <Icon icon="mdi:calendar" width={12} height={12} />
                        {formatDate(log.updated_at)}
                      </div>
                    </Chip>

                    <Chip
                      color={selectedItemId === log.uuid ? "default" : "warning"}
                      variant="flat"
                      size="sm"
                      className={`font-medium ${selectedItemId === log.uuid ? 'bg-warning-100/80 text-warning-700 border-warning-200/60' : 'bg-warning-100/80'}`}
                    >
                      <div className="flex items-center gap-1">
                        <Icon icon="mdi:package-variant" width={12} height={12} />
                        {log.current_stock} {log.unit}
                      </div>
                    </Chip>

                    <Chip
                      color={selectedItemId === log.uuid ? "default" : "success"}
                      variant="flat"
                      size="sm"
                      className={`font-medium ${selectedItemId === log.uuid ? 'bg-success-100/80 text-success-700 border-success-200/60' : 'bg-success-100/80'}`}
                    >
                      <div className="flex items-center gap-1">
                        <Icon icon="mdi:alert-circle" width={12} height={12} />
                        RP: {Math.ceil(log.reorder_point)} {log.unit}
                      </div>
                    </Chip>
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
                <Icon icon="mdi:chart-bell-curve" className="text-5xl text-default-300" />
                <p className="text-default-500 mt-2 mx-8 text-center">
                  No reorder point logs found
                </p>
                <Button
                  color="primary"
                  variant="flat"
                  size="sm"
                  className="mt-4"
                  onPress={() => handleRecalculateReorderPoints()}
                  startContent={<Icon icon="mdi:refresh" className="text-default-500" />}>
                  Calculate Reorder Points
                </Button>
              </>
            )}
            onItemSelect={handleSelectItem}
            supabaseFunction="get_reorder_point_logs_filtered"
            className={`xl:w-1/3 shadow-xl shadow-primary/10 
            xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
            xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
            border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
          />

          {/* Right side: Reorder Point Details */}
          <div className="xl:w-2/3 overflow-hidden">
            {selectedItemId ? (
              <div className="flex flex-col gap-2">
                <CardList>
                  <div>
                    <LoadingAnimation
                      condition={isLoading || isLoadingWarehouses}
                      skeleton={
                        <>
                          {/* Header skeleton */}
                          <div className="space-y-4">
                            <div className="relative">
                              <Skeleton className="h-7 w-40 mx-auto rounded-full" />
                              <Skeleton className="absolute right-0 bottom-0 h-6 w-20 rounded-full" />
                            </div>

                            {/* Item Name skeleton */}
                            <Skeleton className="h-16 w-full rounded-xl" />

                            {/* Warehouse skeleton */}
                            <Skeleton className="h-16 w-full rounded-xl" />

                            {/* Current Stock and Last Updated flex skeleton */}
                            <div className="flex flex-col md:flex-row gap-4">
                              <Skeleton className="h-16 w-full rounded-xl" />
                              <Skeleton className="h-16 w-full rounded-xl" />
                            </div>
                          </div>
                        </>
                      }>
                      <div className="relative">
                        <h2 className="text-xl font-semibold mb-4 w-full text-center">Warehouse Inventory Details</h2>
                        <Chip
                          className="absolute right-0 bottom-0"
                          color={getStatusColor(formData.status as InventoryStatus)} size="sm">
                          {formData.status?.replaceAll('_', ' ')}
                        </Chip>
                      </div>
                      <div className="space-y-4">
                        {isLoading ? (
                          <>
                            <div className="space-y-2">
                              <Skeleton className="h-16 w-full rounded-xl" />
                            </div>
                            <div className="space-y-2">
                              <Skeleton className="h-24 w-full rounded-xl" />
                            </div>
                          </>
                        ) : (
                          <>
                            <Input
                              label="Item Name"
                              value={formData.inventory_name || "Unknown Item"}
                              isReadOnly
                              classNames={inputStyle}
                              startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.1rem]" />}
                            />

                            <Input
                              label="Warehouse"
                              value={getWarehouseName(formData.warehouse_uuid || "")}
                              isReadOnly
                              classNames={inputStyle}
                              startContent={<Icon icon="mdi:warehouse" className="text-default-500 mb-[0.1rem]" />}
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <Input
                                label="Current Stock"
                                value={`${formData.current_stock || 0} ${formData.unit || 'units'}`}
                                isReadOnly
                                classNames={inputStyle}
                                startContent={<Icon icon="mdi:package-variant-closed" className="text-default-500 mb-[0.1rem]" />}
                              />

                              <Input
                                label="Last Updated"
                                value={formData.updated_at ? format(new Date(formData.updated_at), "MMM d, yyyy") : ""}
                                isReadOnly
                                classNames={inputStyle}
                                startContent={<Icon icon="mdi:calendar-clock" className="text-default-500 mb-[0.1rem]" />}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </LoadingAnimation>
                  </div>

                  <div>
                    <LoadingAnimation
                      condition={isLoading}
                      skeleton={
                        <>
                          {/* Header skeleton */}
                          <Skeleton className="h-7 w-64 mx-auto rounded-full mb-4" />

                          {/* Form fields grid skeleton */}
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Average Daily Sales and Lead Time skeleton */}
                              <Skeleton className="h-16 w-full rounded-xl" />
                              <Skeleton className="h-16 w-full rounded-xl" />

                              <Skeleton className="h-4 w-1/2 rounded-xl -mt-2" />
                              <Skeleton className="h-4 w-1/2 rounded-xl -mt-2" />

                              {/* Safety Stock and Reorder Point skeleton */}
                              <Skeleton className="h-16 w-full rounded-xl" />
                              <Skeleton className="h-16 w-full rounded-xl" />

                              <Skeleton className="h-4 w-1/2 rounded-xl -mt-2" />
                              <Skeleton className="h-4 w-1/2 rounded-xl -mt-2" />
                            </div>

                            {/* Calculation Formula box skeleton */}
                            <div className="p-4 border-2 border-default-200 rounded-xl bg-default-50/30">
                              <Skeleton className="h-5 w-32 rounded-full mb-3" />
                              <div className="space-y-3">
                                {/* Formula lines skeleton */}
                                <Skeleton className="h-4 w-5/6 rounded-full" />
                                <Skeleton className="h-4 w-4/5 rounded-full" />
                                <Skeleton className="h-4 w-3/4 rounded-full" />
                                <Skeleton className="h-4 w-2/3 rounded-full" />
                                <Skeleton className="h-4 w-1/2 rounded-full" />
                              </div>
                            </div>

                            {/* Notes section skeleton (optional) */}
                            <div className="p-4 border-2 border-default-200 rounded-xl">
                              <Skeleton className="h-5 w-16 rounded-full mb-2" />
                              <Skeleton className="h-4 w-full rounded-full" />
                            </div>
                          </div>
                        </>
                      }>

                      <h2 className="text-xl font-semibold mb-4 w-full text-center">Reorder Point Calculation</h2>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            label="Average Daily Sales"
                            value={`${formData.average_daily_unit_sales?.toFixed(2) || "0"} ${formData.unit || 'units'}`}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:chart-line" className="text-default-500 mb-[0.1rem]" />}
                            description="Average units sold per day"
                          />

                          <Input
                            label="Lead Time (days)"
                            value={formData.lead_time_days?.toFixed(1) || "0"}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:clock-outline" className="text-default-500 mb-[0.1rem]" />}
                            description="Average time to receive stock"
                          />

                          <Input
                            label="Safety Stock"
                            value={`${formData.safety_stock?.toFixed(2) || "0.00"} ${formData.unit || 'units'}`}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:shield-outline" className="text-default-500 mb-[0.1rem]" />}
                            description={formData.custom_safety_stock !== null ? "Custom safety stock" : "Automatically calculated"}
                            endContent={
                              <Button
                                size="sm"
                                color="primary"
                                variant="flat"
                                className="absolute right-3 bottom-2"
                                isIconOnly
                                onPress={() => {
                                  setCustomSafetyStock(formData.custom_safety_stock !== null ? formData.custom_safety_stock ?? 0 : formData.safety_stock ?? 0);
                                  setSafetyStockNotes(formData.notes || "");
                                  customSafetyStockModal.onOpen();
                                }}
                              >
                                <Icon icon="mdi:pencil" />
                              </Button>
                            }
                          />

                          <Input
                            label="Reorder Point"
                            value={`${Math.ceil(formData.reorder_point || 0).toString()} ${formData.unit || 'units'}`}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:alert-circle-outline" className="text-default-500 mb-[0.1rem]" />}
                            description="Order when stock reaches this level"
                            endContent={
                              formData.current_stock !== undefined && formData.reorder_point !== undefined && (
                                <Chip
                                  className="absolute right-3 bottom-2"
                                  color={formData.current_stock <= formData.reorder_point ? "warning" : "success"}
                                  size="sm"
                                >
                                  {formData.current_stock <= formData.reorder_point ? "Reorder Now" : "Stock OK"}
                                </Chip>
                              )
                            }
                          />
                        </div>

                        <div className="p-4 border-2 border-default-200 rounded-xl bg-default-50/30">
                          <h3 className="text-md font-medium mb-2">Calculation Formula</h3>
                          <div className="text-sm text-default-600 space-y-2">
                            <div className="flex items-center gap-2">
                              <Icon icon="mdi:function-variant" className="text-primary-500" />
                              <span>Average Daily Sales = {formData.average_daily_unit_sales?.toFixed(2) || "0"} units</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Icon icon="mdi:function-variant" className="text-primary-500" />
                              <span>Lead Time = {formData.lead_time_days?.toFixed(1) || "0"} days</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Icon icon="mdi:function-variant" className="text-primary-500" />
                              <span>Safety Stock = {formData.custom_safety_stock !== null ? `${formData.safety_stock?.toFixed(2)} (Custom)` : formData.safety_stock?.toFixed(2) || "0"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Icon icon="mdi:function-variant" className="text-primary-500" />
                              <span>Reorder Point = (Average Daily Sales × Lead Time) + Safety Stock</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Icon icon="mdi:function-variant" className="text-primary-500" />
                              <span>= ({formData.average_daily_unit_sales?.toFixed(2) || "0"} × {formData.lead_time_days?.toFixed(1) || "0"}) + {formData.safety_stock?.toFixed(2) || "0"} = {Math.ceil(formData.reorder_point || 0)}</span>
                            </div>
                          </div>
                        </div>

                        {formData.notes && (
                          <div className="p-4 border-2 border-default-200 rounded-xl">
                            <h3 className="text-md font-medium mb-2">Notes</h3>
                            <p className="text-sm text-default-600">{formData.notes}</p>
                          </div>
                        )}
                      </div>
                    </LoadingAnimation>
                  </div>
                </CardList>

                <CardList>



                  <div className="flex items-center justify-between h-full w-full">
                    <span>View warehouse info</span>
                    <Button
                      variant="shadow"
                      color="primary"
                      onPress={handleViewWarehouse}
                      isDisabled={!formData.warehouse_uuid || isLoading}
                      className="my-1">
                      <Icon icon="mdi:chevron-right" width={16} height={16} />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between h-full w-full">
                    <span>View warehouse inventory details  </span>
                    <Button
                      variant="shadow"
                      color="primary"
                      onPress={handleViewWarehouseInventory}
                      isDisabled={!formData.warehouse_inventory_uuid || isLoading}
                      className="my-1">
                      <Icon icon="mdi:chevron-right" width={16} height={16} />
                    </Button>
                  </div>


                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row justify-center items-center gap-4">
                      <Button
                        color="primary"
                        variant="shadow"
                        className="w-full"
                        onPress={() => {
                          setCustomSafetyStock(formData.custom_safety_stock !== null ? formData.custom_safety_stock ?? 0 : formData.safety_stock ?? 0);
                          setSafetyStockNotes(formData.notes || "");
                          customSafetyStockModal.onOpen();
                        }}
                        isDisabled={isLoading || !formData.warehouse_inventory_uuid || !formData.warehouse_uuid}
                      >
                        <div className="flex items-center gap-2">
                          <Icon icon="mdi:shield-edit" />
                          <span>Custom Safety Stock</span>
                        </div>
                      </Button>

                      <Button
                        color="secondary"
                        variant="shadow"
                        className="w-full"
                        onPress={() => handleRecalculateReorderPoints(true)}
                        isLoading={isLoading}
                        isDisabled={!formData.warehouse_inventory_uuid || !formData.warehouse_uuid}
                      >
                        <div className="flex items-center gap-2">
                          {!isLoading && <Icon icon="mdi:refresh" />}
                          <span>Recalculate</span>
                        </div>
                      </Button>
                    </div>
                  </div>
                </CardList>
              </div>
            ) : (
              <div className="items-center justify-center p-12 border border-dashed border-default-300 rounded-2xl bg-background">
                <LoadingAnimation
                  condition={!user || isLoadingWarehouses}
                  skeleton={
                    <div className="flex flex-col items-center justify-center">
                      <Skeleton className="w-16 h-16 rounded-full mb-4" />
                      <Skeleton className="h-6 w-48 rounded-xl mb-2" />
                      <Skeleton className="h-4 w-64 rounded-xl mb-6" />
                      <Skeleton className="h-10 w-32 rounded-xl" />
                    </div>
                  }>
                  <div className="flex flex-col items-center justify-center">
                    <Icon icon="mdi:chart-bell-curve" className="text-default-300" width={64} height={64} />
                    <h3 className="text-xl font-semibold text-default-800">No Item Selected</h3>
                    <p className="text-default-500 text-center mt-2 mb-6">
                      Select an item from the list on the left to view its details.
                    </p>
                    <Button
                      color="primary"
                      variant="shadow"
                      className="mb-4"
                      onPress={() => handleRecalculateReorderPoints()}
                    >
                      <Icon icon="mdi:refresh" className="mr-2" />
                      Calculate Reorder Points
                    </Button>
                  </div>
                </LoadingAnimation>

              </div>
            )}
          </div>
        </div >

        {/* Modal for Custom Safety Stock */}
        < Modal
          isOpen={customSafetyStockModal.isOpen}
          onClose={customSafetyStockModal.onClose}
          placement="auto"
          backdrop="blur"
          size="lg"
          classNames={{
            backdrop: "bg-background/50"
          }
          }
        >
          <ModalContent>
            <ModalHeader>Customize Safety Stock</ModalHeader>
            <ModalBody className="flex flex-col">
              <p className="text-default-600 mb-4">
                Set a custom safety stock value for this item. The system will use this value
                instead of the automatically calculated one.
              </p>

              <Input
                label="Custom Safety Stock"
                type="number"
                min="0"
                step="0.1"
                value={customSafetyStock?.toString() || ""}
                onChange={(e) => setCustomSafetyStock(parseFloat(e.target.value))}
                classNames={inputStyle}
                startContent={<Icon icon="mdi:shield-edit" className="text-default-500 mb-[0.2rem]" />}
              />

              <Input
                label="Notes"
                placeholder="Reason for custom safety stock"
                value={safetyStockNotes}
                onChange={(e) => setSafetyStockNotes(e.target.value)}
                classNames={inputStyle}
                startContent={<Icon icon="mdi:note-text" className="text-default-500 mb-[0.2rem]" />}
              />

              <div className="p-4 bg-default-50 rounded-xl mt-4">
                <h3 className="text-sm font-medium mb-2">Safety Stock Impact</h3>
                <p className="text-xs text-default-600 mb-2">
                  Current automatic safety stock: <b>{formData.safety_stock?.toFixed(2) || "0"}</b>
                </p>
                <p className="text-xs text-default-600 mb-2">
                  Current reorder point: <b>{formData.reorder_point?.toFixed(2) || "0"}</b>
                </p>
                {customSafetyStock !== null && (
                  <p className="text-xs text-default-600">
                    New reorder point: <b>{((formData.average_daily_unit_sales || 0) * (formData.lead_time_days || 0) + customSafetyStock).toFixed(2)}</b>
                  </p>
                )}
              </div>
            </ModalBody>
            <ModalFooter className="flex justify-end p-4 gap-4">
              <Button
                color="default"
                onPress={customSafetyStockModal.onClose}>
                Cancel
              </Button>
              <Button
                color="primary"
                variant="shadow"
                onPress={handleSaveCustomSafetyStock}
                isLoading={isLoading}
                isDisabled={customSafetyStock === null || customSafetyStock < 0}
              >
                Save Custom Safety Stock
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal >
      </div >
    </motion.div >
  );
}