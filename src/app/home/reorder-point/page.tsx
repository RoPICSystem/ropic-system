"use client";

import { createClient } from "@/utils/supabase/client";
import {
  Accordion,
  AccordionItem,
  AutocompleteItem,
  Autocomplete,
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  Popover,
  PopoverContent,
  ScrollShadow,
  PopoverTrigger,
  Skeleton,
  Spinner,
  Tooltip,
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

// Import server actions
import CardList from "@/components/card-list";
import { motionTransition } from "@/utils/anim";
import { getReorderPointLogs, updateCustomSafetyStock, triggerReorderPointCalculation, InventoryStatus, ReorderPointLog } from "./actions";
import { getWarehouses } from "../warehouses/actions";
import { getInventoryItems } from "../inventory/actions";
import { formatDate } from "@/utils/tools";

// Add these imports to the existing imports at the top of the file
import { generatePdfBlob } from './pdf-document';
import { getDeliveryHistory } from '../delivery/actions';
import { getCompanyData } from "../company/actions";

export default function ReorderPointPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(true);

  // Modal states
  const customSafetyStockModal = useDisclosure();

  // Reorder point logs state
  const [reorderPointLogs, setReorderPointLogs] = useState<ReorderPointLog[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<InventoryStatus | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<ReorderPointLog>>({});
  const [customSafetyStock, setCustomSafetyStock] = useState<number | null>(null);
  const [safetyStockNotes, setSafetyStockNotes] = useState("");

  // Input style for consistency
  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  const autoCompleteStyle = { classNames: inputStyle };

  // Add to the existing state declarations in the ReorderPointPage component
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  // Add this function inside the ReorderPointPage component
  const handleGeneratePdf = async () => {
    setIsPdfGenerating(true);

    try {
      // Prepare logs with resolved names
      const preparedLogs = selectedItemId
        ? [{
          ...formData as ReorderPointLog,
          inventoryItemName: getInventoryItemName(formData.inventory_uuid || ""),
          warehouseName: getWarehouseName(formData.warehouse_uuid || "")
        }]
        : reorderPointLogs.map(log => ({
          ...log,
          inventoryItemName: getInventoryItemName(log.inventory_uuid),
          warehouseName: getWarehouseName(log.warehouse_uuid)
        }));

      // Get delivery history
      let history: { uuid: any; inventory_uuid: any; delivery_date: any; status: any; location_codes: any; recipient_name: any; }[] = [];
      if (selectedItemId && formData.inventory_uuid) {
        const result = await getDeliveryHistory(formData.inventory_uuid as string);
        if (result.success) {
          history = result.data;
        }
      }

      const companyData = await getCompanyData(window.userData.company_uuid);
      

      // Generate PDF
      const pdfBlob = await generatePdfBlob({
        logs: preparedLogs,
        deliveryHistory: history,
        warehouseName: selectedWarehouse ? getWarehouseName(selectedWarehouse) : "All Warehouses",
        companyName: companyData.data?.name || "Your Company",
        dateGenerated: new Date().toLocaleString()
      });

      // Create download link
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reorder-point-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsPdfGenerating(false);
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

  // Handle item search
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    try {
      setIsLoadingItems(true);
      const result = await getReorderPointLogs(
        selectedWarehouse || undefined,
        statusFilter || undefined
      );

      let filteredLogs = result.data || [];
      if (query) {
        // Find matching inventory item names
        const matchingItemIds = inventoryItems
          .filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
          .map(item => item.uuid);

        // Filter logs by these inventory IDs
        filteredLogs = filteredLogs.filter(log =>
          matchingItemIds.includes(log.inventory_uuid)
        );
      }

      setReorderPointLogs(filteredLogs);
    } catch (error) {
      console.error("Error searching reorder point logs:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Handle warehouse filter change
  const handleWarehouseChange = async (warehouseId: string | null) => {
    setSelectedWarehouse(warehouseId);
    try {
      setIsLoadingItems(true);
      const result = await getReorderPointLogs(
        warehouseId || undefined,
        statusFilter || undefined
      );
      setReorderPointLogs(result.data || []);
    } catch (error) {
      console.error("Error filtering by warehouse:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Handle status filter change
  const handleStatusFilterChange = async (status: InventoryStatus | null) => {
    setStatusFilter(status);
    try {
      setIsLoadingItems(true);
      const result = await getReorderPointLogs(
        selectedWarehouse || undefined,
        status || undefined
      );
      setReorderPointLogs(result.data || []);
    } catch (error) {
      console.error("Error filtering by status:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Handle selecting a reorder point log
  const handleSelectItem = (key: string) => {
    setSelectedItemId(key);
    // Update the URL with the selected item ID without reloading the page
    const params = new URLSearchParams(searchParams.toString());
    params.set("logId", key);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle saving custom safety stock
  const handleSaveCustomSafetyStock = async () => {
    if (!selectedItemId || customSafetyStock === null) return;

    setIsLoading(true);
    try {
      const result = await updateCustomSafetyStock(
        formData.inventory_uuid as string,
        formData.warehouse_uuid as string,
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

        // Refresh the reorder point logs
        const refreshedLogs = await getReorderPointLogs(
          selectedWarehouse || undefined,
          statusFilter || undefined
        );
        setReorderPointLogs(refreshedLogs.data || []);
      }
    } catch (error) {
      console.error("Error updating custom safety stock:", error);
    } finally {
      setIsLoading(false);
      customSafetyStockModal.onClose();
    }
  };

  // Handle recalculating reorder points
  const handleRecalculateReorderPoints = async () => {
    setIsLoading(true);
    try {
      const result = await triggerReorderPointCalculation();

      if (result.success) {
        // Refresh the reorder point logs
        const refreshedLogs = await getReorderPointLogs(
          selectedWarehouse || undefined,
          statusFilter || undefined
        );
        setReorderPointLogs(refreshedLogs.data || []);

        // If we have a selected item, refresh its details
        if (selectedItemId) {
          const selectedLog = refreshedLogs.data?.find(log => log.uuid === selectedItemId);
          if (selectedLog) {
            setFormData(selectedLog);
          }
        }
      }
    } catch (error) {
      console.error("Error recalculating reorder points:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle viewing inventory details
  const handleViewInventory = () => {
    if (formData.inventory_uuid) {
      router.push(`/home/inventory?itemId=${formData.inventory_uuid}`);
    }
  };

  // Handle viewing warehouse details
  const handleViewWarehouse = () => {
    if (formData.warehouse_uuid) {
      router.push(`/home/warehouses?warehouseId=${formData.warehouse_uuid}`);
    }
  };

  // Effect to handle URL params (logId)
  useEffect(() => {
    if (!user?.company_uuid || isLoadingItems) return;

    const logId = searchParams.get("logId");
    if (logId) {
      setSelectedItemId(logId);

      // Find the log in the list
      const log = reorderPointLogs.find(l => l.uuid === logId);
      if (log) {
        setFormData(log);
        setCustomSafetyStock(log.custom_safety_stock !== null ? log.custom_safety_stock ?? 0 : log.safety_stock ?? 0);
        setSafetyStockNotes(log.notes || "");
      }
    } else {
      setSelectedItemId(null);
      setFormData({});
      setCustomSafetyStock(null);
      setSafetyStockNotes("");
    }
  }, [searchParams, user?.company_uuid, isLoadingItems, reorderPointLogs]);

  // Initialize page data
  useEffect(() => {
    const initPage = async () => {
      try {
        setUser(window.userData);

        // Fetch reorder point logs
        const logsResult = await getReorderPointLogs();
        setReorderPointLogs(logsResult.data || []);

        // Fetch warehouses for filtering
        const warehousesResult = await getWarehouses();
        setWarehouses(warehousesResult.data || []);

        // Fetch inventory items for name lookup
        const inventoryResult = await getInventoryItems(window.userData.company_uuid);
        setInventoryItems(inventoryResult.data || []);

        setIsLoadingItems(false);
      } catch (error) {
        console.error("Error initializing page:", error);
      }
    };

    initPage();
  }, []);

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
          console.log('Real-time reorder point log update received:', payload);

          // Refresh reorder point logs
          const refreshedLogs = await getReorderPointLogs(
            selectedWarehouse || undefined,
            statusFilter || undefined
          );
          setReorderPointLogs(refreshedLogs.data || []);

          // If we have a selected item, refresh its details
          if (selectedItemId) {
            const selectedLog = refreshedLogs.data?.find(log => log.uuid === selectedItemId);
            if (selectedLog) {
              setFormData(selectedLog);
              setCustomSafetyStock(selectedLog.custom_safety_stock !== null ? selectedLog.custom_safety_stock ?? 0 : selectedLog.safety_stock ?? 0);
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
  }, [user?.company_uuid, searchQuery, selectedWarehouse, selectedItemId, statusFilter]);

  // Helper to get inventory item name
  const getInventoryItemName = useCallback((inventoryId: string) => {
    const item = inventoryItems.find(i => i.uuid === inventoryId);
    return item ? item.name : 'Unknown Item';
  }, [inventoryItems]);

  // Helper to get warehouse name
  const getWarehouseName = useCallback((warehouseId: string) => {
    const warehouse = warehouses.find(w => w.uuid === warehouseId);
    return warehouse ? warehouse.name : 'Unknown Warehouse';
  }, [warehouses]);

  return (
    <div className="container mx-auto p-2 max-w-4xl">
      <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
        <div className="flex flex-col w-full xl:text-left text-center">
          <h1 className="text-2xl font-bold">Reorder Point Management</h1>
          {(isLoading || isLoadingItems) ? (
            <div className="text-default-500 flex items-center">
              <p className='my-auto mr-1'>Loading reorder point data</p>
              <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
            </div>
          ) : (
            <p className="text-default-500">Monitor stock levels and set reorder points for your inventory.</p>
          )}
        </div>
        <div className="flex gap-4">
          <Button
            color="primary"
            variant="shadow"
            onPress={handleRecalculateReorderPoints}
            isLoading={isLoading}
            startContent={!isLoading && <Icon icon="mdi:refresh" />}
          >
            Recalculate All
          </Button>

          {/* Add PDF Export Button */}
          <Button
            color="secondary"
            variant="shadow"
            onPress={handleGeneratePdf}
            isLoading={isPdfGenerating}
            startContent={!isPdfGenerating && <Icon icon="mdi:file-pdf-box" />}
          >
            Export PDF
          </Button>
        </div>
      </div>
      <div className="flex flex-col xl:flex-row gap-4">
        {/* Left side: Reorder Point Logs List */}
        <div className={`xl:w-1/3 shadow-xl shadow-primary/10 
          xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
          xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
          border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
        >
          <div className="flex flex-col h-full">
            <div className="p-4 sticky top-0 z-20 bg-background/80 border-b border-default-200 backdrop-blur-lg shadow-sm">
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Inventory Items</h2>

              {!user ? (
                <>
                  <Skeleton className="h-10 w-full rounded-xl mb-4" />
                  <Skeleton className="h-[4rem] w-full rounded-xl" />
                </>
              ) : (


                <div className="space-y-4">
                  <Input
                    placeholder="Search items..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    isClearable
                    onClear={() => handleSearch("")}
                    startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
                  />

                  {/* Replace the two Autocomplete components with this new filter UI */}
                  <div className="flex items-center gap-2 mt-2">
                    <ScrollShadow orientation="horizontal" className="flex-1 overflow-x-auto" hideScrollBar>
                      <div className="inline-flex items-center gap-2">
                        <Popover placement="bottom-start">
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
                          <PopoverContent className="p-4 w-80">
                            <div className="space-y-4">
                              <Autocomplete
                                name="warehouse_uuid"
                                label="Filter by Warehouse"
                                placeholder="All Warehouses"
                                selectedKey={selectedWarehouse || ""}
                                onSelectionChange={(e) => handleWarehouseChange(`${e}` || null)}
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

                              <Autocomplete
                                name="status_filter"
                                label="Filter by Status"
                                placeholder="All Statuses"
                                selectedKey={statusFilter || ""}
                                onSelectionChange={(e) => handleStatusFilterChange(e as InventoryStatus || null)}
                                startContent={<Icon icon="mdi:filter-variant" className="text-default-500 mb-[0.2rem]" />}
                                inputProps={autoCompleteStyle}
                              >
                                <AutocompleteItem key="">All Statuses</AutocompleteItem>
                                <AutocompleteItem key="IN_STOCK">In Stock</AutocompleteItem>
                                <AutocompleteItem key="WARNING">Warning</AutocompleteItem>
                                <AutocompleteItem key="CRITICAL">Critical</AutocompleteItem>
                                <AutocompleteItem key="OUT_OF_STOCK">Out of Stock</AutocompleteItem>
                              </Autocomplete>
                            </div>
                          </PopoverContent>
                        </Popover>

                        {selectedWarehouse && (
                          <Chip
                            variant="flat"
                            color="primary"
                            onClose={() => handleWarehouseChange(null)}
                            size="sm"
                            className="h-8 p-2"
                          >
                            <div className="flex items-center gap-1">
                              <Icon icon="mdi:warehouse" className="text-xs" />
                              {getWarehouseName(selectedWarehouse)}
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

                        {(selectedWarehouse || statusFilter) && (
                          <Button
                            size="sm"
                            variant="light"
                            className="rounded-lg"
                            onPress={() => {
                              handleWarehouseChange(null);
                              handleStatusFilterChange(null);
                            }}
                          >
                            Clear all
                          </Button>
                        )}
                      </div>
                    </ScrollShadow>
                  </div>
                </div>
              )}
            </div>
            <div className="h-full absolute w-full">
              {!user || isLoadingItems ? (
                <div className="space-y-4 mt-1 p-4 pt-[11.5rem] h-full relative">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="w-full min-h-[7.5rem] rounded-xl" />
                  ))}
                  <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                  <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Spinner />
                  </div>
                </div>
              ) : !isLoadingItems && reorderPointLogs.length !== 0 ? (
                <div
                  className='space-y-4 p-4 overflow-y-auto pt-[12rem] xl:h-full h-[42rem]'>
                  {reorderPointLogs.map((log) => (
                    <Button
                      key={log.uuid}
                      onPress={() => handleSelectItem(log.uuid)}
                      variant="shadow"
                      className={`w-full min-h-[7.5rem] !transition-all duration-200 rounded-xl p-0 ${selectedItemId === log.uuid ?
                        '!bg-primary hover:!bg-primary-400 !shadow-lg hover:!shadow-md hover:!shadow-primary-200 !shadow-primary-200' :
                        '!bg-default-100/50 shadow-none hover:!bg-default-200 !shadow-2xs hover:!shadow-md hover:!shadow-default-200 !shadow-default-200'}`}
                    >
                      <div className="w-full flex flex-col h-full">
                        <div className="flex-grow flex flex-col justify-center px-3">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">
                              {getInventoryItemName(log.inventory_uuid)}
                            </span>
                            <Chip color={getStatusColor(log.status)} variant={selectedItemId === log.uuid ? "shadow" : "flat"} size="sm">
                              {log.status.replaceAll('_', ' ')}
                            </Chip>
                          </div>
                          <div className={`w-full mt-1 text-sm ${selectedItemId === log.uuid ? 'text-default-800 ' : 'text-default-600'} text-start text-ellipsis overflow-hidden whitespace-nowrap`}>
                            {getWarehouseName(log.warehouse_uuid)}
                          </div>
                        </div>

                        {/* Footer - always at the bottom */}
                        <div className={`flex items-center gap-2 border-t ${selectedItemId === log.uuid ? 'border-primary-300' : 'border-default-100'} p-3`}>
                          <Chip
                            color={selectedItemId === log.uuid ? "default" : "primary"}
                            variant={selectedItemId === log.uuid ? "shadow" : "flat"}
                            size="sm">
                            {formatDate(log.updated_at)}
                          </Chip>
                          <Chip color="default" variant={selectedItemId === log.uuid ? "shadow" : "flat"} size="sm">
                            {log.current_stock} {log.unit}
                          </Chip>
                          <Chip color="default" variant={selectedItemId === log.uuid ? "shadow" : "flat"} size="sm">
                            RP: {Math.ceil(log.reorder_point)} {log.unit}
                          </Chip>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              ) : null}

              {user && !isLoadingItems && reorderPointLogs.length === 0 && (
                <div className="xl:h-full h-[42rem] absolute w-full">
                  <div className="py-4 flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Icon icon="fluent:box-dismiss-20-filled" className="text-5xl text-default-300" />
                    <p className="text-default-500 mt-2">No reorder point logs found.</p>
                    <Button
                      color="primary"
                      variant="light"
                      size="sm"
                      className="mt-4"
                      onPress={handleRecalculateReorderPoints}
                    >
                      Calculate Reorder Points
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Reorder Point Details */}
        <div className="xl:w-2/3">
          {selectedItemId ? (
            <div className="flex flex-col gap-2">
              <CardList>
                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Inventory Status</h2>
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
                          value={getInventoryItemName(formData.inventory_uuid || "")}
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
                            label="Status"
                            value={formData.status?.replaceAll('_', ' ') || ""}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:tag" className="text-default-500 mb-[0.1rem]" />}
                            endContent={
                              <Chip
                                className="absolute right-3 bottom-2"
                                color={getStatusColor(formData.status as InventoryStatus)} size="sm">
                                {formData.status?.replaceAll('_', ' ')}
                              </Chip>
                            }
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>

                <div>
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
                </div>
              </CardList>

              <CardList>
                <div className="flex items-center justify-between h-full w-full">
                  <span>View inventory details</span>
                  <Button
                    variant="shadow"
                    color="primary"
                    onPress={handleViewInventory}
                    className="my-1">
                    <Icon icon="mdi:chevron-right" width={16} height={16} />
                  </Button>
                </div>

                <div className="flex items-center justify-between h-full w-full">
                  <span>View warehouse info</span>
                  <Button
                    variant="shadow"
                    color="primary"
                    onPress={handleViewWarehouse}
                    className="my-1">
                    <Icon icon="mdi:chevron-right" width={16} height={16} />
                  </Button>
                </div>

                <div className="w-full flex gap-2 flex-row">
                  <Button
                    color="primary"
                    variant="shadow"
                    className="flex-1 basis-0"
                    onPress={() => {
                      setCustomSafetyStock(formData.custom_safety_stock !== null ? formData.custom_safety_stock ?? 0 : formData.safety_stock ?? 0);
                      setSafetyStockNotes(formData.notes || "");
                      customSafetyStockModal.onOpen();
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Icon icon="mdi:shield-edit" />
                      <span>Customize Safety Stock</span>
                    </div>
                  </Button>

                  <Button
                    color="secondary"
                    variant="shadow"
                    className="flex-1 basis-0"
                    onPress={handleRecalculateReorderPoints}
                    isLoading={isLoading}
                  >
                    <div className="flex items-center gap-2">
                      {!isLoading && <Icon icon="mdi:refresh" />}
                      <span>Recalculate</span>
                    </div>
                  </Button>

                  {/* Add PDF Export Button */}
                  <Button
                    color="success"
                    variant="shadow"
                    className="flex-1 basis-0"
                    onPress={handleGeneratePdf}
                    isLoading={isPdfGenerating}
                  >
                    <div className="flex items-center gap-2">
                      {!isPdfGenerating && <Icon icon="mdi:file-pdf-box" />}
                      <span>Export PDF</span>
                    </div>
                  </Button>
                </div>
              </CardList>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-default-300 rounded-2xl bg-background">
              <Icon icon="mdi:chart-bell-curve" className="text-default-300" width={64} height={64} />
              <h3 className="text-xl font-semibold text-default-800">No Item Selected</h3>
              <p className="text-default-500 text-center mt-2 mb-6">
                Select an item from the list on the left to view its reorder point details.
              </p>
              <Button
                color="primary"
                variant="shadow"
                className="mb-4"
                onPress={() => {
                  if (reorderPointLogs.length > 0) {
                    handleSelectItem(reorderPointLogs[0].uuid);
                  } else {
                    handleRecalculateReorderPoints();
                  }
                }}
              >
                {reorderPointLogs.length > 0 ? (
                  <>
                    <Icon icon="mdi:eye" className="mr-2" />
                    View First Item
                  </>
                ) : (
                  <>
                    <Icon icon="mdi:refresh" className="mr-2" />
                    Calculate Reorder Points
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Modal for Custom Safety Stock */}
      <Modal
        isOpen={customSafetyStockModal.isOpen}
        onClose={customSafetyStockModal.onClose}
        placement="auto"
        backdrop="blur"
        size="lg"
        classNames={{
          backdrop: "bg-background/50"
        }}
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
      </Modal>
    </div>
  );
}