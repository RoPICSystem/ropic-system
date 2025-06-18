"use client";

import CustomScrollbar from '@/components/custom-scrollbar';
import ListLoadingAnimation from '@/components/list-loading-animation';
import LoadingAnimation from '@/components/loading-animation';
import { motionTransition, popoverTransition } from "@/utils/anim";
import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Checkbox,
  Chip,
  DateRangePicker,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollShadow,
  Select,
  SelectItem,
  Skeleton,
  Spinner,
  Switch,
  Tab,
  Tabs
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { ReactNode, useCallback, useEffect, useState, useMemo } from "react";
import { createClient } from '@/utils/supabase/client';

export type DateFilterType = "dateRange" | "weekFilter" | "specificDate";

export interface FilterOption {
  name: string;
  valueName: string;
  color: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  filters: Record<string, string>;
}

export interface ExportOption {
  key: string;
  label: string;
  description?: string;
  type: "switch" | "select" | "input";
  defaultValue?: any;
  options?: { key: string; label: string }[]; // For select type
  inputProps?: any; // For input type
}

export interface ExportPopoverProps {
  title: string;
  description?: string;
  tableName?: string;
  searchPlaceholder?: string;
  filters?: Record<string, FilterOption>;
  dateFilters?: DateFilterType[];
  exportOptions?: ExportOption[];
  children: ReactNode; // The trigger button
  companyUuid?: string;
  supabaseFunction?: string;
  onExport: (data: {
    selectedItems: string[];
    searchQuery: string;
    filters: Record<string, any>;
    dateFilters: Record<string, any>;
    exportOptions: Record<string, any>;
    allFilteredItems: any[];
  }) => Promise<void>;
  renderItem: (item: any) => ReactNode;
  renderSkeletonItem?: (index: number) => ReactNode;
  getItemId: (item: any) => string;
  getItemDisplayName: (item: any) => string;
  className?: string;
  isExporting?: boolean;
  maxHeight?: string;
  enableSelectAll?: boolean;
  defaultSelectedItems?: string[];
  filterItems?: (items: any[]) => any[]; // New prop to filter items
}

export function ExportPopover({
  title,
  description,
  tableName,
  searchPlaceholder = "Search items...",
  filters = {},
  dateFilters = [],
  exportOptions = [],
  children,
  companyUuid,
  supabaseFunction,
  onExport,
  renderItem,
  renderSkeletonItem,
  getItemId,
  getItemDisplayName,
  className = "",
  isExporting = false,
  maxHeight = "max-h-64",
  enableSelectAll = true,
  defaultSelectedItems = [],
  filterItems
}: ExportPopoverProps) {
  // States for popover and search
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>(defaultSelectedItems);

  // Filter states
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Date filter states
  const [dateTabKey, setDateTabKey] = useState<string>("range");
  const [dateFrom, setDateFrom] = useState<any>(null);
  const [dateTo, setDateTo] = useState<any>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [monthFilter, setMonthFilter] = useState<number | null>(null);
  const [weekFilter, setWeekFilter] = useState<number | null>(null);
  const [dayFilter, setDayFilter] = useState<number | null>(null);

  // Export options state
  const [exportOptionValues, setExportOptionValues] = useState<Record<string, any>>(() => {
    const initialValues: Record<string, any> = {};
    exportOptions.forEach(option => {
      initialValues[option.key] = option.defaultValue;
    });
    return initialValues;
  });

  // Collapsible states
  const [isExportOptionsOpen, setIsExportOptionsOpen] = useState(false);

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  const autoCompleteStyle = { classNames: inputStyle };

  // Memoize selectable items to prevent unnecessary recalculations
  const selectableItems = useMemo(() => {
    return filterItems ? filterItems(items) : items;
  }, [items, filterItems]);

  const selectableItemIds = useMemo(() => {
    return selectableItems.map(item => getItemId(item));
  }, [selectableItems, getItemId]);

  // Function to handle search with filters - removed from useCallback dependencies to prevent infinite loops
  const handleSearch = useCallback(async (
    query?: string,
    currentFilters?: Record<string, any>
  ) => {
    if (!supabaseFunction || !companyUuid) {
      setItems([]);
      return;
    }

    setIsLoading(true);

    try {
      // Use current state if parameters not provided
      const searchText = query !== undefined ? query : searchQuery;
      const filters = currentFilters !== undefined ? currentFilters : activeFilters;

      // Convert date objects to strings if they exist
      const dateFromString = dateFrom
        ? new Date(dateFrom.year, dateFrom.month - 1, dateFrom.day)
          .toISOString()
          .split("T")[0]
        : null;
      const dateToString = dateTo
        ? new Date(dateTo.year, dateTo.month - 1, dateTo.day)
          .toISOString()
          .split("T")[0]
        : null;

      // Prepare parameters for the supabase function
      const params: Record<string, any> = {
        p_company_uuid: companyUuid,
        p_search: searchText,
        p_limit: 1000, // Get more items for export
        p_offset: 0,
        ...Object.keys(filters).reduce((acc, key) => ({
          ...acc,
          [`p_${key}`]: filters[key],
        }), {}),
        ...(dateFilters?.includes("dateRange") && {
          p_date_from: dateFromString,
          p_date_to: dateToString,
        }),
        ...(dateFilters?.includes("weekFilter") && {
          p_year: yearFilter,
          p_week: weekFilter,
        }),
        ...(dateFilters?.includes("specificDate") && {
          p_year: yearFilter,
          p_month: monthFilter,
          p_day: dayFilter,
        }),
      };

      // Import the action function dynamically or use a passed function
      const { getFilteredItems } = await import('@/components/search-list-panel/actions');
      const result = await getFilteredItems(supabaseFunction, params);

      if (result.success && result.data) {
        setItems(result.data);
      } else {
        console.error("Failed to fetch items:", result.error);
        setItems([]);
      }
    } catch (error) {
      console.error("Error searching items:", error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [supabaseFunction, companyUuid, dateFilters]); // Removed state dependencies to prevent infinite loops

  // Handle filter changes
  const handleFilterChange = useCallback((filterKey: string, value: any) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      if (value === null || value === "") {
        delete newFilters[filterKey];
      } else {
        newFilters[filterKey] = value;
      }
      
      // Call search with the new filters
      handleSearch(searchQuery, newFilters);
      return newFilters;
    });
  }, [searchQuery, handleSearch]);

  // Handle export option changes
  const handleExportOptionChange = useCallback((optionKey: string, value: any) => {
    setExportOptionValues(prev => ({
      ...prev,
      [optionKey]: value
    }));
  }, []);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setActiveFilters({});
    setDateFrom(null);
    setDateTo(null);
    setYearFilter(null);
    setMonthFilter(null);
    setWeekFilter(null);
    setDayFilter(null);
    handleSearch(searchQuery, {});
  }, [searchQuery, handleSearch]);

  // Determine if date filters are present
  const hasDateFilters = useMemo(() => {
    return dateFrom ||
      dateTo ||
      yearFilter ||
      monthFilter ||
      weekFilter ||
      dayFilter;
  }, [dateFrom, dateTo, yearFilter, monthFilter, weekFilter, dayFilter]);

  // Handle item selection toggle
  const handleItemSelectionToggle = useCallback((itemId: string) => {
    // Only allow selection if item is in selectable items
    if (!selectableItemIds.includes(itemId)) return;

    setSelectedItems(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  }, [selectableItemIds]);

  // Handle select all toggle
  const handleSelectAllToggle = useCallback((selected: boolean) => {
    if (selected) {
      setSelectedItems(selectableItemIds);
    } else {
      setSelectedItems([]);
    }
  }, [selectableItemIds]);

  // Handle export
  const handleExportClick = useCallback(async () => {
    try {
      await onExport({
        selectedItems,
        searchQuery,
        filters: activeFilters,
        dateFilters: {
          dateFrom,
          dateTo,
          yearFilter,
          monthFilter,
          weekFilter,
          dayFilter,
          dateTabKey
        },
        exportOptions: exportOptionValues,
        allFilteredItems: items
      });
      setIsOpen(false);
    } catch (error) {
      console.error("Export failed:", error);
    }
  }, [onExport, selectedItems, searchQuery, activeFilters, dateFrom, dateTo, yearFilter, monthFilter, weekFilter, dayFilter, dateTabKey, exportOptionValues, items]);

  // Handle real-time updates
  useEffect(() => {
    if (!tableName || !companyUuid) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`${tableName}-export-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: `company_uuid=eq.${companyUuid}`
        },
        async () => {
          console.log("Real-time change detected, reloading items...");
          await handleSearch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName, companyUuid]); // Removed handleSearch from dependencies

  // Initial load when popover opens
  useEffect(() => {
    if (isOpen && companyUuid && supabaseFunction) {
      handleSearch();
    }
  }, [isOpen, companyUuid, supabaseFunction]); // Removed handleSearch from dependencies

  // Update selected items when selectableItems change - with protection against infinite loops
  useEffect(() => {
    setSelectedItems(prev => {
      const filtered = prev.filter(id => selectableItemIds.includes(id));
      // Only update if there's actually a change
      if (filtered.length !== prev.length || !filtered.every(id => prev.includes(id))) {
        return filtered;
      }
      return prev;
    });
  }, [selectableItemIds]);

  // Reset selected items when opening with defaults - only run when popover opens
  useEffect(() => {
    if (isOpen) {
      const filteredDefaults = defaultSelectedItems.filter(id => 
        selectableItemIds.includes(id)
      );
      setSelectedItems(filteredDefaults);
    }
  }, [isOpen]); // Removed selectableItemIds and defaultSelectedItems to prevent infinite loops

  // Handle date filter changes - separate effect to avoid circular dependencies
  useEffect(() => {
    if (isOpen) {
      handleSearch();
    }
  }, [dateFrom, dateTo, yearFilter, monthFilter, weekFilter, dayFilter]); // Only depend on date values

  // Default skeleton renderer
  const defaultSkeletonRenderer = useCallback((index: number) => (
    <div key={index} className="flex items-center gap-4 p-2 rounded-md">
      <Skeleton className="w-5 h-5 bg-default-200 rounded-md animate-pulse" />
      <div className="flex items-center justify-between gap-2 w-full">
        <div className="flex-1 min-w-0 space-y-1">
          <Skeleton className="h-4 w-32 bg-default-200 rounded-xl animate-pulse" />
          <Skeleton className="h-3 w-48 bg-default-200 rounded-xl animate-pulse" />
        </div>
        <Skeleton className="h-5 w-16 bg-default-200 rounded-xl animate-pulse" />
      </div>
    </div>
  ), []);

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          // Reset states when closing
          setSearchQuery("");
          setActiveFilters({});
          setDateFrom(null);
          setDateTo(null);
          setYearFilter(null);
          setMonthFilter(null);
          setWeekFilter(null);
          setDayFilter(null);
          setIsFilterOpen(false);
          setIsExportOptionsOpen(false);
        }
      }}
      motionProps={popoverTransition()}
      classNames={{ content: "backdrop-blur-lg bg-background/65" }}
      placement="bottom-end"
      className={className}
    >
      <PopoverTrigger>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0 overflow-hidden">
        <div className="w-full">
          {/* Header */}
          <div className="px-4 pt-4 text-center">
            <h3 className="text-lg font-semibold">{title}</h3>
            {description && (
              <p className="text-sm text-default-500">{description}</p>
            )}
          </div>

          {/* Search and Filters */}
          <div className="p-4 border-b border-default-200 space-y-3">
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => {
                const newQuery = e.target.value;
                setSearchQuery(newQuery);
                handleSearch(newQuery);
              }}
              isClearable
              onClear={() => {
                setSearchQuery("");
                handleSearch("");
              }}
              startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
            />

            {/* Filter section */}
            {((filters && Object.keys(filters).length > 0) || (dateFilters && dateFilters.length > 0)) && (
              <div className="flex items-center gap-2 mt-2">
                <ScrollShadow orientation="horizontal" className="flex-1 overflow-x-auto" hideScrollBar>
                  <div className="inline-flex items-center gap-2">
                    <Popover
                      isOpen={isFilterOpen}
                      onOpenChange={setIsFilterOpen}
                      classNames={{ content: "!backdrop-blur-lg bg-background/65" }}
                      motionProps={popoverTransition()}
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

                            {/* Standard filters */}
                            {(filters && Object.keys(filters).length > 0) &&
                              Object.entries(filters).map(
                                ([key, filterOption]) => (
                                  <Autocomplete
                                    key={key}
                                    label={filterOption.name}
                                    placeholder="All Items"
                                    selectedKey={activeFilters[filterOption.valueName] || ""}
                                    onSelectionChange={(key) =>
                                      handleFilterChange(
                                        filterOption.valueName,
                                        key as string || null
                                      )
                                    }
                                    inputProps={autoCompleteStyle}
                                  >
                                    {Object.entries(filterOption.filters).map(
                                      ([value, label]) => (
                                        <AutocompleteItem key={value}>
                                          {label}
                                        </AutocompleteItem>
                                      ))}
                                  </Autocomplete>
                                ))}

                            {/* Date filters */}
                            {dateFilters && dateFilters.length > 0 && (
                              <div className="space-y-3 border-2 border-default-200 rounded-xl p-4 bg-default-100/25">
                                <div className="flex items-center gap-2">
                                  <Icon icon="mdi:calendar-range" className="text-default-500" />
                                  <span className="text-sm font-medium">Date Filters</span>
                                </div>

                                <Tabs
                                  selectedKey={dateTabKey}
                                  onSelectionChange={key => {
                                    setDateTabKey(key as string);
                                    setDateFrom(null);
                                    setDateTo(null);
                                    setYearFilter(null);
                                    setMonthFilter(null);
                                    setWeekFilter(null);
                                    setDayFilter(null);
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
                                  {dateFilters.includes("dateRange") && (
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
                                          } else {
                                            setDateFrom(null);
                                            setDateTo(null);
                                          }
                                        }}
                                        classNames={inputStyle}
                                      />
                                    </Tab>
                                  )}

                                  {dateFilters.includes("weekFilter") && (
                                    <Tab key="week" title="By Week">
                                      <div className="space-y-3">
                                        <div className="flex gap-2">
                                          <Input
                                            type="number"
                                            label="Year"
                                            placeholder="2024"
                                            value={yearFilter?.toString() || ""}
                                            onChange={e => {
                                              setYearFilter(parseInt(e.target.value) || null);
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
                                            onChange={e => {
                                              setWeekFilter(parseInt(e.target.value) || null);
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
                                            }}
                                            className="w-full"
                                            startContent={<Icon icon="mdi:close" />}
                                          >
                                            Clear Week Filter
                                          </Button>
                                        )}
                                      </div>
                                    </Tab>
                                  )}

                                  {dateFilters.includes("specificDate") && (
                                    <Tab key="specific" title="Specific Date">
                                      <div className="space-y-3">
                                        <div className="grid grid-cols-3 gap-2">
                                          <Input
                                            type="number"
                                            label="Year"
                                            placeholder="2024"
                                            value={yearFilter?.toString() || ""}
                                            onChange={e => {
                                              setYearFilter(parseInt(e.target.value) || null);
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
                                            onChange={e => {
                                              setMonthFilter(parseInt(e.target.value) || null);
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
                                            onChange={e => {
                                              setDayFilter(parseInt(e.target.value) || null);
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
                                            }}
                                            className="w-full"
                                            startContent={<Icon icon="mdi:close" />}
                                          >
                                            Clear Specific Date Filter
                                          </Button>
                                        )}
                                      </div>
                                    </Tab>
                                  )}
                                </Tabs>
                              </div>
                            )}
                          </div>

                          <div className="p-4 border-t border-default-200 flex justify-end gap-2 bg-default-100/50">
                            {/* Clear All Filters Button */}
                            {(Object.keys(activeFilters).length > 0 || hasDateFilters) && (
                              <Button
                                variant="flat"
                                color="danger"
                                size="sm"
                                onPress={clearAllFilters}
                                startContent={<Icon icon="mdi:filter-remove" />}
                              >
                                Clear All Filters
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="flat"
                              onPress={() => setIsFilterOpen(false)}
                            >
                              Close
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    {/* Active filter chips */}
                    {(filters && Object.keys(filters).length > 0) &&
                      Object.entries(activeFilters).map(([key, value]) => {
                        const filterOption = Object.values(filters).find(
                          f => f.valueName === key
                        );
                        if (!filterOption) return null;

                        return (
                          <Chip
                            key={key}
                            variant="flat"
                            color={filterOption.color}
                            onClose={() => handleFilterChange(key, null)}
                            size="sm"
                            className="h-8 p-2"
                          >
                            {filterOption.filters[value] || value}
                          </Chip>
                        );
                      })}

                    {/* Date filter chips */}
                    {hasDateFilters && (
                      <Chip
                        variant="flat"
                        color="secondary"
                        onClose={() => {
                          setDateFrom(null);
                          setDateTo(null);
                          setYearFilter(null);
                          setMonthFilter(null);
                          setWeekFilter(null);
                          setDayFilter(null);
                        }}
                        size="sm"
                        className="h-8 p-2"
                      >
                        Date Filters
                      </Chip>
                    )}

                    {/* Clear all filters button */}
                    {(Object.keys(activeFilters).length > 0 || hasDateFilters) && (
                      <Button
                        size="sm"
                        variant="light"
                        className="rounded-lg"
                        onPress={clearAllFilters}
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                </ScrollShadow>
              </div>
            )}
          </div>

          {/* Items List */}
          <CustomScrollbar
            disabled={isLoading || items.length === 0}
            className={maxHeight}>
            <div className="p-2">
              <ListLoadingAnimation
                condition={isLoading}
                containerClassName="space-y-2"
                skeleton={[
                  /* Select All skeleton */
                  enableSelectAll && (
                    <div key="select-all" className="flex items-center justify-between p-2 pb-0">
                      <div className="flex items-center gap-4">
                        <Skeleton className="w-5 h-5 rounded-md" />
                        <Skeleton className="h-4 w-20 rounded-xl" />
                      </div>
                      <Skeleton className="h-4 w-16 rounded-xl" />
                    </div>
                  ),
                  /* Items skeleton */
                  ...[...Array(5)].map((_, i) =>
                    renderSkeletonItem ? renderSkeletonItem(i) : defaultSkeletonRenderer(i)
                  )
                ].filter(Boolean)}
              >
                {items.length === 0 ? (
                  [<div key="no-items" className="p-4 text-center text-default-500 h-64 flex items-center justify-center flex-col">
                    <Icon icon="mdi:alert-circle-outline" className="text-4xl mb-2" />
                    No items match the selected filters
                  </div>]
                ) : (
                  [
                    enableSelectAll && (
                      <div key="select-all" className="flex items-center justify-between p-2 pb-0">
                        <Checkbox
                          isSelected={selectedItems.length === selectableItems.length && selectableItems.length > 0}
                          isIndeterminate={selectedItems.length > 0 && selectedItems.length < selectableItems.length}
                          onValueChange={handleSelectAllToggle}
                        >
                          <span className="text-small font-medium pl-2">Select All</span>
                        </Checkbox>
                        <span className="text-small text-default-400">
                          {selectedItems.length} of {selectableItems.length} selected
                        </span>
                      </div>
                    ),
                    ...items.map((item) => {
                      const itemId = getItemId(item);
                      const isSelectable = selectableItemIds.includes(itemId);
                      const isSelected = selectedItems.includes(itemId);

                      return (
                        <div
                          key={itemId}
                          className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all duration-200 ${
                            isSelectable 
                              ? "hover:bg-default-100" 
                              : "opacity-50 cursor-not-allowed bg-default-50"
                          }`}
                          onClick={() => handleItemSelectionToggle(itemId)}
                        >
                          <Checkbox
                            isSelected={isSelected}
                            isDisabled={!isSelectable}
                            onValueChange={() => handleItemSelectionToggle(itemId)}
                          />
                          <div className="flex-1 min-w-0">
                            {renderItem(item)}
                          </div>
                        </div>
                      );
                    })
                  ].filter(Boolean)
                )}
              </ListLoadingAnimation>
            </div>
          </CustomScrollbar>

          {/* Export Options and Footer */}
          <div className="border-t border-default-200 flex justify-between items-center bg-default-100/50 flex-col w-full">
            {exportOptions.length > 0 && (
              <div className="w-full">
                {/* Collapsible Export Options Header */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-default-100 transition-colors duration-200"
                  onClick={() => setIsExportOptionsOpen(!isExportOptionsOpen)}
                >
                  <h4 className="text-sm font-medium text-default-700">Export Options</h4>
                  <Icon
                    icon={isExportOptionsOpen ? "mdi:chevron-up" : "mdi:chevron-down"}
                    className="text-default-500 transition-transform duration-200"
                  />
                </div>

                {/* Collapsible Export Options Content */}
                <AnimatePresence>
                  {isExportOptionsOpen && (
                    <motion.div
                      {...motionTransition}
                      className="overflow-hidden"
                    >
                      <div className="space-y-3 px-4 pb-4 pt-2">
                        {exportOptions.map((option) => (
                          <div key={option.key} className="space-y-2">

                            {option.type === "switch" && (
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium text-default-700">{option.label}</span>
                                  {option.description && (
                                    <span className="text-xs text-default-500">{option.description}</span>
                                  )}
                                </div>
                                <Switch
                                  size="sm"
                                  isSelected={exportOptionValues[option.key] || false}
                                  onValueChange={(checked) =>
                                    handleExportOptionChange(option.key, checked)
                                  }
                                />
                              </div>
                            )}

                            {option.type === "select" && option.options && (
                              <div className="flex flex-col">
                                <label className="text-xs font-medium text-default-700 mb-1">
                                  {option.label}
                                </label>
                                <span className="text-xs text-default-500 mb-1">
                                  {option.description}
                                </span>
                                <Select
                                  size="sm"
                                  selectedKeys={[exportOptionValues[option.key] || ""]}
                                  onSelectionChange={(keys) => handleExportOptionChange(option.key, Array.from(keys)[0] || "")}
                                  classNames={{
                                    trigger: "h-8",
                                    value: "text-xs"
                                  }}
                                >
                                  {option.options.map((opt) => (
                                    <SelectItem key={opt.key}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </Select>
                              </div>
                            )}

                            {option.type === "input" && (
                              <div className="flex flex-col">
                                <label className="text-xs font-medium text-default-700 mb-1">
                                  {option.label}
                                </label>
                                <span className="text-xs text-default-500 mb-1">
                                  {option.description}
                                </span>
                                <input
                                  type="text"
                                  value={exportOptionValues[option.key] || ""}
                                  onChange={(e) => handleExportOptionChange(option.key, e.target.value)}
                                  className="w-full h-8 px-2 border border-default-200 rounded text-xs"
                                  {...(option.inputProps || {})}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="flex justify-end gap-2 w-full border-t border-default-200 p-4">
              <Button
                size="sm"
                variant="flat"
                onPress={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                color="primary"
                isDisabled={selectedItems.length === 0}
                isLoading={isExporting}
                onPress={handleExportClick}
              >
                Export
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}