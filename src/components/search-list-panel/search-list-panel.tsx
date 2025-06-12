"use client";

import CustomScrollbar from '@/components/custom-scrollbar';
import ListLoadingAnimation from '@/components/list-loading-animation';
import LoadingAnimation from '@/components/loading-animation';
import { motionTransitionScale, popoverTransition } from "@/utils/anim";
import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Chip,
  DateRangePicker,
  Input,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollShadow,
  Skeleton,
  Spinner,
  Tab, Tabs
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { ReactNode, useEffect, useState } from "react";
import { getFilteredItems } from "./actions";
import { createClient } from '@/utils/supabase/client';


export type DateFilterType = "dateRange" | "weekFilter" | "specificDate";

export interface FilterOption {
  name: string;
  valueName: string;
  color: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  filters: Record<string, string>;
}

export interface SearchListPanelProps {
  title: string;
  tableName: string;
  searchPlaceholder: string;
  searchLimit: number;
  filters?: Record<string, FilterOption>;
  dateFilters?: DateFilterType[];
  companyUuid: string;
  renderItem: (item: any) => ReactNode;
  renderSkeletonItem: (index: number) => ReactNode;
  renderEmptyCard?: ReactNode;
  onItemSelect: (item: any) => void;
  supabaseFunction: string;
  className?: string;
  isLoadingList?: (loading: boolean) => void;
}

export function SearchListPanel({
  title,
  tableName,
  searchPlaceholder,
  searchLimit,
  filters,
  dateFilters,
  companyUuid,
  renderItem,
  renderSkeletonItem,
  renderEmptyCard,
  onItemSelect,
  supabaseFunction,
  className = "",
  isLoadingList
}: SearchListPanelProps) {
  // States for search and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Call the isLoading function whenever the loading state changes
  useEffect(() => {
    if (isLoading && isLoadingList) {
      isLoadingList(isLoading); // Pass the current loading state to the parent
    }
  }, [isLoading, isLoadingList]);

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

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  const autoCompleteStyle = { classNames: inputStyle };

  // Function to handle search with filters
  const handleSearch = async (
    query: string = searchQuery,
    currentPage: number = page,
    currentFilters = activeFilters
  ) => {
    setIsLoading(true);

    setSearchQuery(query);
    try {
      // Calculate offset
      const offset = (currentPage - 1) * searchLimit;

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
        p_search: query,
        p_limit: searchLimit,
        p_offset: offset,
        ...Object.keys(currentFilters).reduce((acc, key) => ({
          ...acc,
          [`p_${key}`]: currentFilters[key],
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

      const result = await getFilteredItems(supabaseFunction, params);

      if (result.data) {
        setItems(result.data);
        setTotalPages(result.totalPages || 1);
        setTotalItems(result.totalCount || 0);
      }
    } catch (error) {
      console.error("Error searching items:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle filter changes
  const handleFilterChange = (filterKey: string, value: any) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      if (value === null || value === "") {
        delete newFilters[filterKey];
      } else {
        newFilters[filterKey] = value;
      }
      return newFilters;
    });
    setPage(1);
    handleSearch(searchQuery, 1, {
      ...activeFilters,
      [filterKey]: value
    });
  };

  // Handle page changes
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    handleSearch(searchQuery, newPage);
  };

  // Clear all filters
  const clearAllFilters = () => {
    setActiveFilters({});
    setDateFrom(null);
    setDateTo(null);
    setYearFilter(null);
    setMonthFilter(null);
    setWeekFilter(null);
    setDayFilter(null);
    setPage(1);
    handleSearch(searchQuery, 1, {});
  };

  // Effect to handle initial load and filter changes
  useEffect(() => {
    if (companyUuid) {
      handleSearch();
    }
  }, [companyUuid]);

  // Determine if date filters are present
  const hasDateFilters =
    dateFrom ||
    dateTo ||
    yearFilter ||
    monthFilter ||
    weekFilter ||
    dayFilter;


  // Handle real-time updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`${tableName}-changes`)
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
  }, [searchQuery, page, searchLimit, companyUuid, tableName]);

  return (
    <div className={className}>
      <div className="flex flex-col h-full">
        {/* Header with search and filters */}
        <div className="p-4 sticky top-0 z-20 bg-background/80 border-b border-default-200 backdrop-blur-lg shadow-sm">
          <LoadingAnimation
            condition={false}
            skeleton={
              <>
                <Skeleton className="h-[1.75rem] w-48 mx-auto mb-4 rounded-full" />
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full rounded-xl" />
                  <ScrollShadow
                    orientation="horizontal"
                    className="flex-1"
                    hideScrollBar
                  >
                    <div className="flex flex-row gap-2 items-center">
                      <Skeleton className="h-10 w-24 rounded-xl flex-none" />
                      <Skeleton className="h-8 w-32 rounded-full flex-none" />
                      <Skeleton className="h-8 w-36 rounded-full flex-none" />
                      <Skeleton className="h-8 w-24 rounded-full flex-none" />
                    </div>
                  </ScrollShadow>
                </div>
              </>
            }
          >
            <h2 className="text-xl font-semibold mb-4 w-full text-center">
              {title}
            </h2>
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              isClearable
              onClear={() => handleSearch("")}
              startContent={
                <Icon icon="mdi:magnify" className="text-default-500" />
              }
            />

            {/* Filter section */}
            {((filters && Object.keys(filters).length > 0) || (dateFilters && dateFilters.length > 0)) && (
              <div className="flex items-center gap-2 mt-4">
                <ScrollShadow
                  orientation="horizontal"
                  className="flex-1 overflow-x-auto"
                  hideScrollBar
                >
                  <div className="inline-flex items-center gap-2">
                    {/* Filter button */}
                    <Popover
                      isOpen={isFilterOpen}
                      onOpenChange={setIsFilterOpen}
                      classNames={{ content: "!backdrop-blur-lg bg-background/65" }}
                      motionProps={popoverTransition()}
                      placement="bottom-start"
                    >
                      <PopoverTrigger>
                        <Button
                          variant="flat"
                          color="default"
                          className="w-24 h-10 rounded-lg !outline-none rounded-xl"
                          startContent={
                            <Icon icon="heroicons:funnel" className="text-xs" />
                          }
                        >
                          Filters
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-96 p-0 overflow-hidden">
                        <div className='w-full'>
                          <div className="space-y-4 pt-4 w-full">
                            <h3 className="text-lg font-semibold items-center w-full text-center">
                              Filter Options
                            </h3>

                            <div className="space-y-4 px-4 w-full">


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
                                  )
                                )}

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
                                      setPage(1);
                                      handleSearch(searchQuery, 1, activeFilters);
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
                                              onChange={e =>
                                                setYearFilter(
                                                  parseInt(e.target.value)
                                                )
                                              }
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
                                              onChange={e =>
                                                setWeekFilter(
                                                  parseInt(e.target.value)
                                                )
                                              }
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
                                              onChange={e =>
                                                setYearFilter(
                                                  parseInt(e.target.value)
                                                )}
                                              classNames={inputStyle}
                                              min="2000"
                                              max="2100"
                                            />
                                            <Input
                                              type="number"
                                              label="Month"
                                              placeholder="1-12"
                                              value={monthFilter?.toString() || ""}
                                              onChange={e =>
                                                setMonthFilter(
                                                  parseInt(e.target.value)
                                                )
                                              }
                                              classNames={inputStyle}
                                              min="1"
                                              max="12"
                                            />
                                            <Input
                                              type="number"
                                              label="Day"
                                              placeholder="1-31"
                                              value={dayFilter?.toString() || ""}
                                              onChange={e =>
                                                setDayFilter(
                                                  parseInt(e.target.value)
                                                )
                                              }
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

                            <div className="p-4 border-t border-default-200 flex justify-end gap-2 bg-default-100/35">
                              {/* Clear All Filters Button */}
                              {(Object.keys(activeFilters).length > 0 ||
                                dateFrom || dateTo || yearFilter || weekFilter || monthFilter || dayFilter) && (
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
                          handleSearch();
                        }}
                        size="sm"
                        className="h-8 p-2"
                      >
                        Date Filters
                      </Chip>
                    )}

                    {/* Clear all filters button */}
                    {(Object.keys(activeFilters).length > 0 ||
                      hasDateFilters) && (
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
          </LoadingAnimation>
        </div>

        {/* Items list */}
        <div className="h-full absolute w-full">
          <CustomScrollbar
            scrollShadow={items.length <= searchLimit}
            scrollShadowTop={false}
            scrollbarMarginTop={(filters && Object.keys(filters).length > 0) || (dateFilters && dateFilters.length > 0) ? "10.75rem" : "7.25rem"}
            scrollbarMarginBottom={items.length > searchLimit ? "6.5rem" : "0.5rem"}
            disabled={isLoading}
            className={`space-y-4 p-4 mt-1 h-full relative ${items.length > searchLimit && "pb-28"} ${(filters && Object.keys(filters).length > 0) || (dateFilters && dateFilters.length > 0) ? "pt-[11.5rem]" : "pt-32"}`}>
            <ListLoadingAnimation
              condition={isLoading}
              containerClassName="space-y-4"
              skeleton={[...Array(10)].map((_, i) => renderSkeletonItem(i))}
            >
              {items.map(item => renderItem(item))}
            </ListLoadingAnimation>

            {/* Loading overlay */}
            <AnimatePresence>
              {isLoading && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  {...motionTransitionScale}
                >
                  <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                  <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Spinner />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pagination */}
            {items.length > searchLimit && (
              <div className="flex fixed h-24 flex-col items-center justify-center pt-2 pb-4 px-2 border-t border-default-200 bg-background/80 backdrop-blur-lg bottom-0 left-0 right-0">
                <div className="text-sm text-default-500 mb-2">
                  Showing {(page - 1) * searchLimit + 1} to{" "}
                  {Math.min(page * searchLimit, totalItems)} of {totalItems}{" "}
                  items
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
          </CustomScrollbar>

          {/* Empty state */}
          <AnimatePresence>
            {!isLoading && items.length === 0 && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                {...motionTransitionScale}
              >
                <div className="py-4 px-8 w-full flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                  {
                    renderEmptyCard || <>
                      <Icon
                        icon="fluent:box-dismiss-20-filled"
                        className="text-5xl text-default-300"
                      />
                      <p className="text-default-500 mt-2">No {title.toLowerCase()} found</p>
                    </>
                  }
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div >
    </div >
  );
}