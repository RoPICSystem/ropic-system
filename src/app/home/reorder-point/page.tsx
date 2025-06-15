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
  Autocomplete,
  AutocompleteItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  DateRangePicker,
  Tab,
  Tabs,
  Spinner,
  Pagination,
  ScrollShadow,
  Skeleton,
  Alert,
  Select,
  SelectItem,
  CalendarDate
} from "@heroui/react";
import { Icon } from "@iconify/react";
import CardList from "@/components/card-list";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { motionTransition, motionTransitionScale, popoverTransition } from "@/utils/anim";
import { getReorderPointLogs, updateCustomSafetyStock, triggerReorderPointCalculation, InventoryStatus, ReorderPointLog, getOperators, triggerSpecificReorderPointCalculation } from "./actions";
import { getWarehouses } from "../warehouses/actions";
import { getInventoryItems } from "../inventory/actions";
import { formatDate, showErrorToast } from "@/utils/tools";

// Add these imports to the existing imports at the top of the file
import { generatePdfBlob } from './pdf-document';
import { getDeliveryHistory } from '../delivery/actions';
import { getCompanyData } from "../company/actions";
import { getUserFromCookies } from "@/utils/supabase/server/user";
import LoadingAnimation from "@/components/loading-animation";
import ListLoadingAnimation from "@/components/list-loading-animation";
import { getUserCompanyDetails } from "@/utils/supabase/server/companies";
import CustomScrollbar from "@/components/custom-scrollbar";
import { ReorderPointExportPopover } from "./reorder-point-export";
import { createClient } from "@/utils/supabase/client";

export default function ReorderPointPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);

  const [error, setError] = useState<string | null>(null);

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

  const [isSearchFilterOpen, setIsSearchFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Add date filter states
  const [dateFrom, setDateFrom] = useState<any>(null);
  const [dateTo, setDateTo] = useState<any>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [monthFilter, setMonthFilter] = useState<number | null>(null);
  const [weekFilter, setWeekFilter] = useState<number | null>(null);
  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [dateTabKey, setDateTabKey] = useState<string>("range");

  // PDF export state
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  // Autocomplete style
  const autoCompleteStyle = {
    classNames: {
      inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
    }
  };
  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };

  // Clear date filters function
  const clearDateFilters = () => {
    setDateFrom(null);
    setDateTo(null);
    setYearFilter(null);
    setMonthFilter(null);
    setWeekFilter(null);
    setDayFilter(null);
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

  // Update handleSearch function to use pagination
  const handleSearch = async (query: string, currentPage: number = page) => {
    setSearchQuery(query);
    try {
      setIsLoadingItems(true);
      const result = await getReorderPointLogs(
        user?.company_uuid || "",
        selectedWarehouse || undefined,
        statusFilter || undefined,
        query,
        dateFrom || undefined,
        dateTo || undefined,
        yearFilter || undefined,
        monthFilter || undefined,
        weekFilter || undefined,
        dayFilter || undefined,
        rowsPerPage, // limit
        (currentPage - 1) * rowsPerPage // offset
      );

      setReorderPointLogs(result.data || []);
      setTotalPages(result.totalPages || 1);
      setTotalItems(result.totalCount || 0);

      // Reset to page 1 when search changes
      if (currentPage !== 1) {
        setPage(1);
      }
    } catch (error) {
      console.error("Error searching reorder point logs:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Update handleWarehouseChange to include pagination
  const handleWarehouseChange = async (warehouseId: string | null) => {
    setSelectedWarehouse(warehouseId);

    if (!warehouseId || warehouseId === "null") {
      setSelectedWarehouse(null);
      setIsLoadingItems(false);
      return;
    };

    try {
      setIsLoadingItems(true);
      const result = await getReorderPointLogs(
        user?.company_uuid || "",
        warehouseId || undefined,
        statusFilter || undefined,
        searchQuery,
        dateFrom || undefined,
        dateTo || undefined,
        yearFilter || undefined,
        monthFilter || undefined,
        weekFilter || undefined,
        dayFilter || undefined,
        rowsPerPage, // limit
        0 // offset (reset to first page)
      );
      setReorderPointLogs(result.data || []);
      setTotalPages(result.totalPages || 1);
      setTotalItems(result.totalCount || 0);
      setPage(1); // Reset to first page on filter change
    } catch (error) {
      console.error("Error filtering by warehouse:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Update handleStatusFilterChange to include pagination
  const handleStatusFilterChange = async (status: InventoryStatus | null) => {
    setStatusFilter(status);
    try {
      setIsLoadingItems(true);
      const result = await getReorderPointLogs(
        user?.company_uuid || "",
        selectedWarehouse || undefined,
        status || undefined,
        searchQuery,
        dateFrom || undefined,
        dateTo || undefined,
        yearFilter || undefined,
        monthFilter || undefined,
        weekFilter || undefined,
        dayFilter || undefined,
        rowsPerPage, // limit
        0 // offset (reset to first page)
      );
      setReorderPointLogs(result.data || []);
      setTotalPages(result.totalPages || 1);
      setTotalItems(result.totalCount || 0);
      setPage(1); // Reset to first page on filter change
    } catch (error) {
      console.error("Error filtering by status:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Helper function to apply date filters
  const applyDateFilters = async (
    dateFromParam: string,
    dateToParam: string,
    yearParam: number | null,
    monthParam: number | null,
    weekParam: number | null,
    dayParam: number | null
  ) => {
    try {
      setIsLoadingItems(true);
      const result = await getReorderPointLogs(
        user?.company_uuid || "",
        selectedWarehouse || undefined,
        statusFilter || undefined,
        searchQuery,
        dateFromParam || undefined,
        dateToParam || undefined,
        yearParam || undefined,
        monthParam || undefined,
        weekParam || undefined,
        dayParam || undefined,
        rowsPerPage,
        0 // reset to first page
      );
      setReorderPointLogs(result.data || []);
      setTotalPages(result.totalPages || 1);
      setTotalItems(result.totalCount || 0);
      setPage(1);
    } catch (error) {
      console.error("Error applying date filters:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Handle page change
  const handlePageChange = async (newPage: number) => {
    setPage(newPage);
    try {
      setIsLoadingItems(true);
      const result = await getReorderPointLogs(
        user?.company_uuid || "",
        selectedWarehouse || undefined,
        statusFilter || undefined,
        searchQuery,
        dateFrom || undefined,
        dateTo || undefined,
        yearFilter || undefined,
        monthFilter || undefined,
        weekFilter || undefined,
        dayFilter || undefined,
        rowsPerPage,
        (newPage - 1) * rowsPerPage
      );
      setReorderPointLogs(result.data || []);
      setTotalPages(result.totalPages || 1);
      setTotalItems(result.totalCount || 0);
    } catch (error) {
      console.error("Error changing page:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Handle PDF export using the new ExportPopover
  const handlePdfExport = async (data: {
    selectedItems: string[];
    searchQuery: string;
    filters: Record<string, any>;
    dateFilters: Record<string, any>;
    exportOptions: Record<string, any>;
    allFilteredItems: any[];
  }) => {
    setIsPdfGenerating(true);

    try {
      // Get selected logs or use all filtered items if none selected
      const logsToExport = data.selectedItems.length > 0
        ? data.allFilteredItems.filter(log => data.selectedItems.includes(log.uuid))
        : data.allFilteredItems;

      // Prepare logs with resolved names
      const preparedLogs = logsToExport.map(log => ({
        ...log,
        inventoryName: inventoryItems.find(i => i.uuid === log.inventory_uuid)?.name || 'Unknown Item',
        warehouseName: warehouses.find(w => w.uuid === log.warehouse_uuid)?.name || 'Unknown Warehouse'
      }));

      // Get delivery history and operator data
      const allDeliveryHistory = await getDeliveryHistory(user.company_uuid);
      const operatorData = await getOperators(user.company_uuid);

      // Create operator name mapping
      const operatorNameMap: { [key: string]: string } = {};
      operatorData.data?.forEach((operator: any) => {
        operatorNameMap[operator.uuid] = operator.full_name;
      });

      // Create inventory name mapping
      const inventoryNameMap: { [key: string]: string } = {};
      inventoryItems.forEach((item: any) => {
        inventoryNameMap[item.uuid] = item.name;
      });

      // Map operator names to delivery history
      const deliveryHistoryWithOperatorNames = allDeliveryHistory.data?.map((delivery: any) => ({
        ...delivery,
        recipient_name: delivery.operator_uuids && Array.isArray(delivery.operator_uuids)
          ? delivery.operator_uuids
            .map((uuid: string) => operatorNameMap[uuid] || 'Unknown Operator')
            .join(', ')
          : 'No Operator Assigned'
      })) || [];

      // Get company data including logo
      const companyData = await getCompanyData(user.company_uuid);
      const { data: companyDetails, error: companyError } = await getUserCompanyDetails(user.uuid);

      let companyLogoUrl = null;
      if (companyDetails?.logo_url && !companyDetails?.logo_url.error) {
        companyLogoUrl = companyDetails.logo_url;
      }

      // Determine warehouse name for the report
      let warehouseNameForReport = "All Warehouses";
      if (data.filters.warehouse_uuid) {
        warehouseNameForReport = warehouses.find(w => w.uuid === data.filters.warehouse_uuid)?.name || "Unknown Warehouse";
      } else if (preparedLogs.length === 1) {
        warehouseNameForReport = preparedLogs[0].warehouseName || "All Warehouses";
      }

      // Generate PDF with selected page size
      const pdfBlob = await generatePdfBlob({
        logs: preparedLogs,
        deliveryHistory: deliveryHistoryWithOperatorNames,
        warehouseName: warehouseNameForReport,
        companyName: companyData.data?.name || "Your Company",
        companyLogoUrl: companyLogoUrl,
        dateGenerated: new Date().toLocaleString(),
        inventoryNameMap,
        pageSize: data.exportOptions.pageSize || "A4"
      });

      // Create download link with page size in filename
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RoPIC_Reorder_Point_Report_${data.exportOptions.pageSize || "A4"}_${(companyData.data?.name || 'Company').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}_${new Date().toLocaleTimeString('en-US', { hour12: false }).replace(/:/g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsPdfGenerating(false);
    }
  };

  // Handle selecting a reorder point log
  const handleSelectItem = (key: string) => {
    setSelectedItemId(key);
    setIsLoading(true);
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
          user?.company_uuid || "",
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

  // Handle recalculating reorder points (modified to handle both specific and all)
  const handleRecalculateReorderPoints = async (isSpecific: boolean = false) => {
    setIsLoading(true);
    try {
      let result;

      if (isSpecific && formData.inventory_uuid && formData.warehouse_uuid && user?.company_uuid) {
        // Recalculate for specific item
        result = await triggerSpecificReorderPointCalculation(
          formData.inventory_uuid,
          formData.warehouse_uuid,
          user.company_uuid
        );
      } else {
        // Recalculate for all items
        result = await triggerReorderPointCalculation();
      }

      if (result.success) {
        // Refresh the reorder point logs
        const refreshedLogs = await getReorderPointLogs(
          user?.company_uuid || "",
          selectedWarehouse || undefined,
          statusFilter || undefined,
          searchQuery,
          dateFrom || undefined,
          dateTo || undefined,
          yearFilter || undefined,
          monthFilter || undefined,
          weekFilter || undefined,
          dayFilter || undefined,
          rowsPerPage,
          (page - 1) * rowsPerPage
        );
        setReorderPointLogs(refreshedLogs.data || []);
        setTotalPages(refreshedLogs.totalPages || 1);
        setTotalItems(refreshedLogs.totalCount || 0);

        // If we have a selected item and did specific calculation, refresh its details
        if (isSpecific && selectedItemId && result.data) {
          const updatedLog = Array.isArray(result.data) ? result.data[0] : result.data;
          if (updatedLog) {
            setFormData(updatedLog);
            setCustomSafetyStock(updatedLog.custom_safety_stock !== null ? updatedLog.custom_safety_stock ?? 0 : updatedLog.safety_stock ?? 0);
            setSafetyStockNotes(updatedLog.notes || "");
          }
        } else if (selectedItemId) {
          // For general recalculation, find the updated log
          const selectedLog = refreshedLogs.data?.find(log => log.uuid === selectedItemId);
          if (selectedLog) {
            setFormData(selectedLog);
            setCustomSafetyStock(selectedLog.custom_safety_stock !== null ? selectedLog.custom_safety_stock ?? 0 : selectedLog.safety_stock ?? 0);
            setSafetyStockNotes(selectedLog.notes || "");
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

  // Handle view warehouse inventory
  const handleViewWarehouseInventory = () => {
    if (formData.warehouse_inventory_uuid) {
      router.push(`/home/warehouse-items?warehouseItemId=${formData.warehouse_inventory_uuid}`);
    }
  }

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

    setIsLoading(false);
  }, [searchParams, user?.company_uuid, isLoadingItems, reorderPointLogs]);

  // Update the initPage function to fetch with pagination
  useEffect(() => {
    const initPage = async () => {
      try {
        setIsLoadingItems(true);
        setIsLoadingWarehouses(true);

        const userData = await getUserFromCookies();
        if (userData === null) {
          setError('User not found');
          return;
        }

        setUser(userData);

        // Fetch warehouses for filtering
        (async () => {
          const warehousesResult = await getWarehouses(userData.company_uuid);
          setWarehouses(warehousesResult.data || []);
          setIsLoadingWarehouses(false);
        })();

        // Fetch inventory items for name lookup and reorder point logs with pagination
        (async () => {
          const inventoryResult = await getInventoryItems(userData.company_uuid);
          const logsResult = await getReorderPointLogs(
            userData.company_uuid,
            undefined, // warehouseUuid
            undefined, // statusFilter
            "", // searchQuery
            undefined, // dateFrom
            undefined, // dateTo
            undefined, // year
            undefined, // month
            undefined, // week
            undefined, // day
            rowsPerPage, // limit
            0 // offset
          );

          setReorderPointLogs(logsResult.data || []);
          setTotalPages(logsResult.totalPages || 1);
          setTotalItems(logsResult.totalCount || 0);
          setInventoryItems(inventoryResult.data || []);
          setIsLoadingItems(false);
        })();

      } catch (error) {
        console.error("Error initializing page:", error);
        setError("Failed to load data. Please try again later.");
        setIsLoadingItems(false);
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
          // Refresh reorder point logs with pagination and date filters
          const refreshedLogs = await getReorderPointLogs(
            user.company_uuid,
            selectedWarehouse || undefined,
            statusFilter || undefined,
            searchQuery,
            dateFrom || undefined,
            dateTo || undefined,
            yearFilter || undefined,
            monthFilter || undefined,
            weekFilter || undefined,
            dayFilter || undefined,
            rowsPerPage, // limit
            (page - 1) * rowsPerPage // offset
          );

          setReorderPointLogs(refreshedLogs.data || []);
          setTotalPages(refreshedLogs.totalPages || 1);
          setTotalItems(refreshedLogs.totalCount || 0);

          // If we have a selected item, refresh its details
          if (selectedItemId) {
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
  }, [user?.company_uuid, searchQuery, selectedWarehouse, selectedItemId, statusFilter, page, rowsPerPage, dateFrom, dateTo, yearFilter, monthFilter, weekFilter, dayFilter]);

  // error handling for loading states
  useEffect(() => {
    if (error) {
      showErrorToast("Error", error);
      setError(null);
    }
  }, [error]);

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
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Reorder Point Management</h1>
            {(isLoading || isLoadingItems) ? (
              <div className="text-default-500 flex xl:justify-start justify-center items-center">
                <p className='my-auto mr-1'>Loading reorder point data</p>
                <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
              </div>
            ) : (
              <p className="text-default-500">Monitor stock levels and set reorder points for your inventory.</p>
            )}
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

            {/* PDF Export using new ExportPopover */}
            <ReorderPointExportPopover
              user={user}
              warehouses={warehouses}
              inventoryItems={inventoryItems}
              isPdfGenerating={isPdfGenerating}
              onExport={handlePdfExport}
            />
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
                <LoadingAnimation
                  condition={!user || isLoadingWarehouses}
                  skeleton={
                    <>
                      {/* Heading skeleton */}
                      <Skeleton className="h-[1.75rem] w-48 mx-auto mb-4 rounded-full" />

                      <div className="space-y-4">
                        {/* Search input skeleton */}
                        <Skeleton className="h-10 w-full rounded-xl" />

                        {/* Filter controls skeleton */}
                        <div className="flex items-center gap-2 mt-2">
                          <ScrollShadow orientation="horizontal" className="flex-1" hideScrollBar>
                            <div className="flex flex-row gap-2 items-center">
                              {/* Filter button skeleton */}
                              <Skeleton className="h-10 w-24 rounded-xl flex-none" />

                              {/* Filter chips area skeleton */}
                              <Skeleton className="h-8 w-32 rounded-full flex-none" />
                              <Skeleton className="h-8 w-36 rounded-full flex-none" />
                              <Skeleton className="h-8 w-24 rounded-full flex-none" />
                            </div>
                          </ScrollShadow>
                        </div>
                      </div>
                    </>
                  }>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Reorder Point Logs</h2>
                  <div className="space-y-4">
                    <Input
                      placeholder="Search logs..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      isClearable
                      onClear={() => handleSearch("")}
                      startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
                    />

                    {/* Replace the single Autocomplete with this new filter UI */}
                    <div className="flex items-center gap-2 mt-2">
                      <ScrollShadow orientation="horizontal" className="flex-1 overflow-x-auto" hideScrollBar>
                        <div className="inline-flex items-center gap-2">
                          <Popover
                            isOpen={isSearchFilterOpen}
                            onOpenChange={setIsSearchFilterOpen}
                            classNames={{ content: "!backdrop-blur-lg bg-background/65" }}
                            motionProps={popoverTransition()}
                            offset={10}
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
                                    onSelectionChange={(key) => handleStatusFilterChange(key as InventoryStatus || null)}
                                    startContent={<Icon icon="mdi:filter-variant" className="text-default-500 mb-[0.2rem]" />}
                                    inputProps={autoCompleteStyle}
                                  >
                                    <AutocompleteItem key="">All Statuses</AutocompleteItem>
                                    <AutocompleteItem key="IN_STOCK">In Stock</AutocompleteItem>
                                    <AutocompleteItem key="WARNING">Warning</AutocompleteItem>
                                    <AutocompleteItem key="CRITICAL">Critical</AutocompleteItem>
                                    <AutocompleteItem key="OUT_OF_STOCK">Out of Stock</AutocompleteItem>
                                  </Autocomplete>

                                  {/* Date Filters */}
                                  <div className="space-y-3 border-2 border-default-200 rounded-xl p-4 bg-default-100/25">
                                    <div className="flex items-center gap-2">
                                      <Icon icon="mdi:calendar-range" className="text-default-500" />
                                      <span className="text-sm font-medium">Date Filters</span>
                                    </div>

                                    <Tabs
                                      selectedKey={dateTabKey}
                                      onSelectionChange={(key) => {
                                        const tabKey = key as string;
                                        setDateTabKey(tabKey);
                                        // Reset all date filters when switching tabs
                                        setDateFrom(null);
                                        setDateTo(null);
                                        setYearFilter(null);
                                        setMonthFilter(null);
                                        setWeekFilter(null);
                                        setDayFilter(null);
                                        applyDateFilters("", "", null, null, null, null);
                                      }}
                                      variant="solid"
                                      color="primary"
                                      fullWidth
                                      size="md"
                                      classNames={{
                                        panel: "p-0",
                                        tabList: "border-2 border-default-200",
                                        tabContent: "text-default-700",
                                      }}
                                      className="w-full"
                                    >
                                      <Tab key="range" title="Date Range">
                                        <DateRangePicker
                                          label="Select Date Range"
                                          className="w-full"
                                          value={dateFrom && dateTo ? {
                                            start: dateFrom,
                                            end: dateTo
                                          } : null}
                                          onChange={(range) => {
                                            if (range) {
                                              setDateFrom(range.start);
                                              setDateTo(range.end);
                                              const dateFromString = new Date(range.start.year, range.start.month - 1, range.start.day).toISOString().split('T')[0];
                                              const dateToString = new Date(range.end.year, range.end.month - 1, range.end.day).toISOString().split('T')[0];
                                              applyDateFilters(dateFromString, dateToString, null, null, null, null);
                                            } else {
                                              setDateFrom(null);
                                              setDateTo(null);
                                              applyDateFilters("", "", null, null, null, null);
                                            }
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
                                              value={yearFilter?.toString() || ""}
                                              onChange={(e) => {
                                                const year = e.target.value ? parseInt(e.target.value) : null;
                                                setYearFilter(year);
                                                applyDateFilters("", "", year, null, weekFilter, null);
                                              }}
                                              className="flex-1"
                                              classNames={inputStyle}
                                              min="2000"
                                              max="2100"
                                            />
                                            <Input
                                              type="number"
                                              label="Week"
                                              placeholder="1-53"
                                              value={weekFilter?.toString() || ""}
                                              onChange={(e) => {
                                                const week = e.target.value ? parseInt(e.target.value) : null;
                                                setWeekFilter(week);
                                                applyDateFilters("", "", yearFilter || new Date().getFullYear(), null, week, null);
                                              }}
                                              className="flex-1"
                                              classNames={inputStyle}
                                              min="1"
                                              max="53"
                                            />
                                          </div>
                                          {(yearFilter || weekFilter) && (
                                            <Button
                                              size="sm"
                                              variant="flat"
                                              color="warning"
                                              onPress={() => {
                                                setYearFilter(null);
                                                setWeekFilter(null);
                                                applyDateFilters("", "", null, null, null, null);
                                              }}
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
                                              value={yearFilter?.toString() || ""}
                                              onChange={(e) => {
                                                const year = e.target.value ? parseInt(e.target.value) : null;
                                                setYearFilter(year);
                                                applyDateFilters("", "", year, monthFilter, null, dayFilter);
                                              }}
                                              classNames={inputStyle}
                                              min="2000"
                                              max="2100"
                                            />
                                            <Input
                                              type="number"
                                              label="Month"
                                              placeholder="1-12"
                                              value={monthFilter?.toString() || ""}
                                              onChange={(e) => {
                                                const month = e.target.value ? parseInt(e.target.value) : null;
                                                setMonthFilter(month);
                                                applyDateFilters("", "", yearFilter, month, null, dayFilter);
                                              }}
                                              classNames={inputStyle}
                                              min="1"
                                              max="12"
                                            />
                                            <Input
                                              type="number"
                                              label="Day"
                                              placeholder="1-31"
                                              value={dayFilter?.toString() || ""}
                                              onChange={(e) => {
                                                const day = e.target.value ? parseInt(e.target.value) : null;
                                                setDayFilter(day);
                                                applyDateFilters("", "", yearFilter, monthFilter, null, day);
                                              }}
                                              classNames={inputStyle}
                                              min="1"
                                              max="31"
                                            />
                                          </div>
                                          {(yearFilter || monthFilter || dayFilter) && (
                                            <Button
                                              size="sm"
                                              variant="flat"
                                              color="warning"
                                              onPress={() => {
                                                setYearFilter(null);
                                                setMonthFilter(null);
                                                setDayFilter(null);
                                                applyDateFilters("", "", null, null, null, null);
                                              }}
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
                                  {(selectedWarehouse || statusFilter || dateFrom || dateTo || yearFilter || monthFilter || weekFilter || dayFilter) && (
                                    <Button
                                      variant="flat"
                                      color="danger"
                                      size="sm"
                                      onPress={() => {
                                        handleWarehouseChange(null);
                                        handleStatusFilterChange(null);
                                        clearDateFilters();
                                        setDateTabKey("range");
                                      }}
                                      startContent={<Icon icon="mdi:filter-remove" />}
                                    >
                                      Clear All Filters
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="flat"
                                    onPress={() => setIsSearchFilterOpen(false)}
                                  >
                                    Close
                                  </Button>
                                </div>
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
                                {warehouses.find(w => w.uuid === selectedWarehouse)?.name || 'Unknown Warehouse'}
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

                          {(dateFrom || dateTo) && (
                            <Chip
                              variant="flat"
                              color="secondary"
                              onClose={() => {
                                setDateFrom(null);
                                setDateTo(null);
                                applyDateFilters("", "", null, null, null, null);
                              }}
                              size="sm"
                              className="h-8 p-2"
                            >
                              <div className="flex items-center gap-1">
                                <Icon icon="mdi:calendar-range" className="text-xs" />
                                {dateFrom && dateTo ? `${format(new Date(dateFrom.year, dateFrom.month - 1, dateFrom.day), 'MMM d')} - ${format(new Date(dateTo.year, dateTo.month - 1, dateTo.day), 'MMM d')}` : 'Date Range'}
                              </div>
                            </Chip>
                          )}

                          {weekFilter && (
                            <Chip
                              variant="flat"
                              color="secondary"
                              onClose={() => {
                                setWeekFilter(null);
                                setYearFilter(null);
                                applyDateFilters("", "", null, null, null, null);
                              }}
                              size="sm"
                              className="h-8 p-2"
                            >
                              <div className="flex items-center gap-1">
                                <Icon icon="mdi:calendar-week" className="text-xs" />
                                Week {weekFilter}/{yearFilter || new Date().getFullYear()}
                              </div>
                            </Chip>
                          )}

                          {(yearFilter || monthFilter || dayFilter) && !weekFilter && (
                            <Chip
                              variant="flat"
                              color="secondary"
                              onClose={() => {
                                setYearFilter(null);
                                setMonthFilter(null);
                                setDayFilter(null);
                                applyDateFilters("", "", null, null, null, null);
                              }}
                              size="sm"
                              className="h-8 p-2"
                            >
                              <div className="flex items-center gap-1">
                                <Icon icon="mdi:calendar" className="text-xs" />
                                {yearFilter && monthFilter && dayFilter
                                  ? `${dayFilter}/${monthFilter}/${yearFilter}`
                                  : `Custom Date`}
                              </div>
                            </Chip>
                          )}

                          {(selectedWarehouse || statusFilter || dateFrom || dateTo || yearFilter || monthFilter || weekFilter || dayFilter) && (
                            <Button
                              size="sm"
                              variant="light"
                              className="rounded-lg"
                              onPress={() => {
                                handleWarehouseChange(null);
                                handleStatusFilterChange(null);
                                clearDateFilters();
                                setDateTabKey("range");
                              }}
                            >
                              Clear all
                            </Button>
                          )}
                        </div>
                      </ScrollShadow>
                    </div>
                  </div>
                </LoadingAnimation>
              </div>

              <div className="h-full absolute w-full">
                <CustomScrollbar
                  scrollShadow
                  scrollShadowTop={false}
                  scrollbarMarginTop="10.75rem"
                  scrollbarMarginBottom="0.5rem"
                  disabled={!user || isLoadingItems}
                  className="space-y-4 p-4 mt-1 pt-[11.5rem] h-full relative">
                  <ListLoadingAnimation
                    condition={!user || isLoadingItems}
                    containerClassName="space-y-4"
                    skeleton={[...Array(10)].map((_, i) => (
                      <Skeleton key={i} className="w-full min-h-[7.5rem] rounded-xl" />
                    ))}
                  >
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
                          {/* Header - icon and title */}
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
                  </ListLoadingAnimation>

                  {reorderPointLogs.length > 0 && (
                    <div className="flex flex-col items-center pt-2 pb-4 px-2">
                      <div className="text-sm text-default-500 mb-2">
                        Showing {(page - 1) * rowsPerPage + 1} to {Math.min(page * rowsPerPage, totalItems)} of {totalItems} {totalItems === 1 ? 'item' : 'items'}
                      </div>
                      <Pagination
                        total={totalPages}
                        initialPage={1}
                        page={page}
                        onChange={handlePageChange}
                        color="primary"
                        size="sm"
                        showControls
                      />
                    </div>
                  )}

                  {/* Empty state and loading animations */}
                  <AnimatePresence>
                    {(!user || isLoadingItems) && (
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center"
                        initial={{ opacity: 0, filter: "blur(8px)" }}
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        exit={{ opacity: 0, filter: "blur(8px)" }}
                        transition={{ duration: 0.3, delay: 0.3 }}
                      >
                        <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                        <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                          <Spinner />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* No items found state */}
                  <AnimatePresence>
                    {user && !isLoadingItems && reorderPointLogs.length === 0 && (
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center"
                        initial={{ opacity: 0, filter: "blur(8px)" }}
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        exit={{ opacity: 0, filter: "blur(8px)" }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="py-4 flex flex-col items-center justify-center absolute mt-16 ">
                          <Icon icon="fluent:box-dismiss-20-filled" className="text-5xl text-default-300" />
                          <p className="text-default-500 mt-2">No reorder point logs found.</p>
                          <Button
                            color="primary"
                            variant="light"
                            size="sm"
                            className="mt-4"
                            onPress={() => { handleRecalculateReorderPoints() }}
                          >
                            Calculate Reorder Points
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </CustomScrollbar>
              </div>
            </div>
          </div>

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
                        <h2 className="text-xl font-semibold mb-4 w-full text-center">Inventory Details</h2>
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

                  {user.is_admin &&
                    <div className="flex items-center justify-between h-full w-full">
                      <span>View inventory details</span>
                      <Button
                        variant="shadow"
                        color="primary"
                        onPress={handleViewInventory}
                        isDisabled={!formData.inventory_uuid || isLoading}
                        className="my-1">
                        <Icon icon="mdi:chevron-right" width={16} height={16} />
                      </Button>
                    </div>
                  }

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
                        isDisabled={isLoading || !formData.inventory_uuid || !formData.warehouse_uuid}
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
                        isDisabled={!formData.inventory_uuid || !formData.warehouse_uuid}
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
                    <Icon icon="mdi:chart-bell-curve" className="text-default-300" width={64} height={64} />
                    <h3 className="text-xl font-semibold text-default-800">No Item Selected</h3>
                    <p className="text-default-500 text-center mt-2 mb-6">
                      Select an item from the list on the left to view its details.
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