"use client";

import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Input,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Chip,
  Spinner,
  Alert,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Accordion,
  AccordionItem,
  Avatar,
  CardFooter,
  Snippet,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Checkbox,
  Tooltip
} from "@heroui/react";
import { Icon } from "@iconify/react";

import {
  getItemDetailsByUuid,
  GoPageDeliveryDetails,
  GoPageInventoryDetails,
  GoPageWarehouseDetails,
  GoPageNewWarehouseInventoryDetails,
  getBulkUnitsDetails,
  getWarehouseItemsByDelivery,
  markWarehouseItemsAsUsed,
  handleAcceptNewWarehouseInventory
} from './actions';

// Components
import { createClient } from "@/utils/supabase/client";

// Import the existing components
import { DeliveryComponent } from "@/app/home/delivery/delivery-component";
import { InventoryComponent as InventoryItemComponent } from "@/app/home/inventory/inventory-component";
import { InventoryComponent as WarehouseInventoryComponent } from "@/app/home/warehouse-items/warehouse-inventory-component";
import CardList from '@/components/card-list';
import { motionTransition, motionTransitionScale } from '@/utils/anim';
import { getUserFromCookies } from '@/utils/supabase/server/user';

// Search function
async function generalSearch(
  searchQuery: string,
  entityType?: string,
  companyUuid?: string,
  limit: number = 50,
  offset: number = 0
) {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('general_search', {
    p_search_query: searchQuery,
    p_entity_type: entityType || null,
    p_company_uuid: companyUuid || null,
    p_limit: limit,
    p_offset: offset
  });

  if (error) {
    console.error('Search error:', error);
    return { success: false, error: error.message };
  }

  return { success: true, data: data || [] };
}

// Helper function to get status color
function getStatusColor(status: string): "default" | "primary" | "secondary" | "success" | "warning" | "danger" {
  switch (status?.toUpperCase()) {
    case "PENDING": return "primary";
    case "PROCESSING": return "warning";
    case "IN_TRANSIT": return "secondary";
    case "DELIVERED": return "success";
    case "CANCELLED": return "danger";
    case "AVAILABLE": return "success";
    case "IN_WAREHOUSE": return "primary";
    case "USED": return "secondary";
    default: return "default";
  }
}

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false); // Track initialization
  const [isDeliveryComponentLoading, setIsDeliveryComponentLoading] = useState(false);
  const hasInitialized = useRef(false); // Prevent duplicate initialization

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState(""); // Track last searched query

  // Component data states
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [inventories, setInventories] = useState<any[]>([]);

  // New warehouse inventory acceptance states
  const [isAcceptingNewWarehouseInventory, setIsAcceptingNewWarehouseInventory] = useState(false);
  const [acceptNewWarehouseInventoryError, setAcceptNewWarehouseInventoryError] = useState<string | null>(null);
  const [acceptNewWarehouseInventorySuccess, setAcceptNewWarehouseInventorySuccess] = useState(false);

  // Modal states
  const [showAcceptStatusModal, setShowAcceptStatusModal] = useState(false);
  const [showAcceptDeliveryLoadingModal, setShowAcceptDeliveryLoadingModal] = useState(false);

  // Auto-accept timer states (now for new_warehouse_inventory)
  const [autoAcceptProgress, setAutoAcceptProgress] = useState(0);
  const [autoAcceptTimeRemaining, setAutoAcceptTimeRemaining] = useState(5);
  const [pendingNewWarehouseInventoryAccept, setPendingNewWarehouseInventoryAccept] = useState<any>(null);
  const autoAcceptTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoAcceptIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Add ref to track processed auto-actions
  const processedAutoActions = useRef<Set<string>>(new Set());

  // Initial page load effect - runs only once
  useEffect(() => {
    // Prevent duplicate initialization
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const initPage = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const userData = await getUserFromCookies();
        if (!userData) {
          router.push('/auth/login');
          return;
        }

        setUser(userData);

        // Load necessary data for components
        const supabase = createClient();

        // Load warehouses
        const { data: warehousesData } = await supabase
          .from('warehouses')
          .select('uuid, name, address, layout')
          .eq('company_uuid', userData.company_uuid);

        setWarehouses(warehousesData || []);

        // Load operators (profiles with is_admin = false)
        const { data: operatorsData } = await supabase
          .from('profiles')
          .select('uuid, full_name, email, phone_number, profile_image')
          .eq('company_uuid', userData.company_uuid)
          .eq('is_admin', false);

        setOperators(operatorsData || []);

        // Load inventories
        const { data: inventoriesData } = await supabase
          .from('inventory')
          .select('uuid, name, description, measurement_unit, standard_unit')
          .eq('company_uuid', userData.company_uuid);

        setInventories(inventoriesData || []);

        setIsInitialized(true);

        // Check for initial query parameter
        const query = searchParams.get("q");
        const viewMode = searchParams.get("view") === "true";
        const isDeliveryAutoAccept = searchParams.get("deliveryAutoAccept") === "true";
        const showOptions = searchParams.get("showOptions") === "true";

        if (query) {
          setSearchQuery(query);
          setLastSearchQuery(query);
          await performSearch(query, userData, viewMode, isDeliveryAutoAccept, showOptions);
        }

      } catch (error) {
        console.error("Error initializing page:", error);
        setError("Failed to initialize page");
      } finally {
        setIsLoading(false);
      }
    };

    initPage();
  }, []); // Empty dependency array

  // Handle URL parameter changes - runs after initialization
  useEffect(() => {
    if (!isInitialized || !user) return;

    const query = searchParams.get("q");
    const viewMode = searchParams.get("view") === "true";
    const isDeliveryAutoAccept = searchParams.get("deliveryAutoAccept") === "true";
    const showOptions = searchParams.get("showOptions") === "true";

    // Only perform search if query is different from what we last searched
    if (query && query !== lastSearchQuery) {
      setSearchQuery(query);
      setLastSearchQuery(query);
      performSearch(query, user, viewMode, isDeliveryAutoAccept, showOptions);
    } else if (!query && hasSearched) {
      // Clear search if no query parameter
      setSearchQuery("");
      setLastSearchQuery("");
      setSearchResults([]);
      setSelectedResult(null);
      setHasSearched(false);
    } else if (query === lastSearchQuery && viewMode) {
      // Handle view mode change for the same query
      if (searchResults.length > 0 && !selectedResult) {
        setSelectedResult(searchResults[0]);
      }
    } else if (query === lastSearchQuery && !viewMode) {
      // Handle removal of view mode
      if (selectedResult && searchResults.length > 1) {
        setSelectedResult(null);
      }
    }
  }, [searchParams, isInitialized, user]); // Only depend on URL params and initialization

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autoAcceptTimerRef.current) {
        clearTimeout(autoAcceptTimerRef.current);
      }
      if (autoAcceptIntervalRef.current) {
        clearInterval(autoAcceptIntervalRef.current);
      }
    };
  }, []);

  const performSearch = async (query: string, userData?: any, autoView: boolean = false, autoAccept: boolean = false, showOptions: boolean = false) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSelectedResult(null);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setError(null);
    setHasSearched(true);

    try {
      const userToUse = userData || user;
      const result = await generalSearch(query.trim(), undefined, userToUse?.company_uuid);

      if (result.success) {
        setSearchResults(result.data);

        // Auto-select based on conditions:
        // 1. If autoView=true (from URL param view=true)
        // 2. If there's exactly one result
        if (autoView || result.data.length === 1) {
          setSelectedResult(result.data[0]);

          // Handle auto-accept for new_warehouse_inventory ONLY - UPDATED to exclude admins
          // UPDATED: Store the auto-accept intent but don't start timer yet
          if ((autoAccept || showOptions) &&
            result.data[0]?.entity_type === 'new_warehouse_inventory' &&
            userToUse && !userToUse.is_admin) {
            const autoAcceptKey = `${result.data[0]?.entity_type}-${query}-autoAccept`;
            if (!processedAutoActions.current.has(autoAcceptKey)) {
              processedAutoActions.current.add(autoAcceptKey);
              // Store the intent to auto-accept, but wait for component to load
              setPendingAutoAcceptIntent({
                resultItem: result.data[0],
                userToUse,
                shouldStartTimer: true
              });
            }
          }
        } else {
          setSelectedResult(null);
        }
      } else {
        setError(result.error || "Search failed");
        setSearchResults([]);
        setSelectedResult(null);
      }
    } catch (error: any) {
      console.error("Search error:", error);
      setError("An error occurred while searching");
      setSearchResults([]);
      setSelectedResult(null);
    } finally {
      setIsSearching(false);
    }
  };

  // Add state to track pending auto-accept intent
  const [pendingAutoAcceptIntent, setPendingAutoAcceptIntent] = useState<{
    resultItem: any;
    userToUse: any;
    shouldStartTimer: boolean;
  } | null>(null);

  // Add effect to handle auto-accept when component loading is complete
  useEffect(() => {
    if (pendingAutoAcceptIntent && 
        pendingAutoAcceptIntent.shouldStartTimer && 
        !isDeliveryComponentLoading && 
        !isSearching &&
        selectedResult?.entity_uuid === pendingAutoAcceptIntent.resultItem.entity_uuid) {
      
      console.log("Starting auto-accept timer now that component is loaded");
      startAutoAcceptTimer(pendingAutoAcceptIntent.resultItem, pendingAutoAcceptIntent.userToUse);
      
      // Clear the intent
      setPendingAutoAcceptIntent(null);
    }
  }, [pendingAutoAcceptIntent, isDeliveryComponentLoading, isSearching, selectedResult]);

  // Add callback for delivery component loading state
  const handleDeliveryComponentLoadingChange = (isLoading: boolean) => {
    setIsDeliveryComponentLoading(isLoading);
  };

  // Start auto-accept timer (now for new_warehouse_inventory)
  const startAutoAcceptTimer = (resultItem: any, userToUse: any, timerDuration: number = 10000) => {
    // Only start timer for new_warehouse_inventory entity type
    if (resultItem.entity_type !== 'new_warehouse_inventory') return;

    setPendingNewWarehouseInventoryAccept({ resultItem, userToUse });
    setAutoAcceptProgress(0);
    setAutoAcceptTimeRemaining(timerDuration / 1000);

    // Clear any existing timers
    if (autoAcceptTimerRef.current) {
      clearTimeout(autoAcceptTimerRef.current);
    }
    if (autoAcceptIntervalRef.current) {
      clearInterval(autoAcceptIntervalRef.current);
    }

    // Progress interval (update every 100ms for smooth animation)
    autoAcceptIntervalRef.current = setInterval(() => {
      setAutoAcceptProgress(prev => {
        const newProgress = prev + (100 / timerDuration) * 100; // 100ms steps
        if (newProgress >= 100) {
          setAutoAcceptTimeRemaining(0);
          return 100;
        }
        setAutoAcceptTimeRemaining(Math.ceil((timerDuration - (newProgress / 100 * timerDuration)) / 1000));
        return newProgress;
      });
    }, 100);

    // Auto-accept timer
    autoAcceptTimerRef.current = setTimeout(() => {
      if (autoAcceptIntervalRef.current) {
        clearInterval(autoAcceptIntervalRef.current);
      }
      handleAcceptNewWarehouseInventoryAction(resultItem, userToUse);
    }, timerDuration);
  };

  // Cancel auto-accept
  const cancelAutoAccept = () => {
    if (autoAcceptTimerRef.current) {
      clearTimeout(autoAcceptTimerRef.current);
    }
    if (autoAcceptIntervalRef.current) {
      clearInterval(autoAcceptIntervalRef.current);
    }
    setPendingNewWarehouseInventoryAccept(null);
    setAutoAcceptProgress(0);
    setAutoAcceptTimeRemaining(5);
  };

  // Handle new warehouse inventory acceptance
  const handleAcceptNewWarehouseInventoryAction = async (resultItem: any, customUser?: any) => {
    // Only handle new_warehouse_inventory entity type
    if (!resultItem || resultItem.entity_type !== 'new_warehouse_inventory') return;

    const deliveryUuid = resultItem.entity_uuid;
    const warehouseInventoryUuids = resultItem.entity_data?.matched_warehouse_inventory_uuids || [];

    console.log("Accepting new warehouse inventory:", deliveryUuid, "UUIDs:", warehouseInventoryUuids);

    // Clear timer states when starting acceptance
    setPendingNewWarehouseInventoryAccept(null);
    setAutoAcceptProgress(0);
    setAutoAcceptTimeRemaining(5);

    setIsAcceptingNewWarehouseInventory(true);
    setAcceptNewWarehouseInventoryError(null);
    setAcceptNewWarehouseInventorySuccess(false);

    try {
      const userDetails = customUser || user;

      const result = await handleAcceptNewWarehouseInventory(
        deliveryUuid,
        warehouseInventoryUuids,
        userDetails
      );

      if (result.success) {
        setAcceptNewWarehouseInventorySuccess(true);
        setAcceptNewWarehouseInventoryError(null);

        // Remove showOptions from URL after successful acceptance
        const currentParams = new URLSearchParams(searchParams.toString());
        currentParams.delete('showOptions');
        currentParams.delete('deliveryAutoAccept'); // Also remove this if present

        // Build new URL with cleaned parameters
        const currentQuery = searchParams.get("q");
        const viewMode = searchParams.get("view");
        let newUrl = '/home/search';

        if (currentQuery) {
          newUrl += `?q=${encodeURIComponent(currentQuery)}`;
          if (viewMode === "true") {
            newUrl += '&view=true';
          }
        }

        // Update URL without showOptions
        router.push(newUrl);

        // Refresh the search to show updated status after a short delay
        setTimeout(() => {
          if (lastSearchQuery) {
            performSearch(lastSearchQuery, user, true);
          }
        }, 2000);
      } else {
        setAcceptNewWarehouseInventoryError(result.error || "Failed to accept new warehouse inventory");
      }

    } catch (error) {
      console.error("Error accepting new warehouse inventory:", error);
      setAcceptNewWarehouseInventoryError(`Failed to accept new warehouse inventory: ${(error as Error).message}`);
    } finally {
      setIsAcceptingNewWarehouseInventory(false);
    }
  };

  const handleSearch = async () => {
    const trimmedQuery = searchQuery.trim();

    // Don't search if it's the same as the last searched query
    if (trimmedQuery === lastSearchQuery) {
      return;
    }

    if (!trimmedQuery) {
      setSearchResults([]);
      setSelectedResult(null);
      setHasSearched(false);
      setError(null);
      setLastSearchQuery("");
      router.push('/home/search');
      return;
    }

    // Update URL with search query (without view=true for manual searches)
    router.push(`/home/search?q=${encodeURIComponent(trimmedQuery)}`);
    setLastSearchQuery(trimmedQuery);
    await performSearch(trimmedQuery);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleResultSelect = (result: any) => {
    setSelectedResult(result);

    // Update URL to include view=true when selecting a result
    const currentQuery = searchParams.get("q");
    if (currentQuery) {
      router.push(`/home/search?q=${encodeURIComponent(currentQuery)}&view=true`);
    }
  };

  const handleBackToResults = () => {
    setSelectedResult(null);

    // Remove view=true from URL when going back to results
    const currentQuery = searchParams.get("q");
    if (currentQuery) {
      router.push(`/home/search?q=${encodeURIComponent(currentQuery)}`);
    }
  };

  const renderSearchResults = () => {
    // Only show results list if we have multiple results and no result is selected
    if (!hasSearched || selectedResult || searchResults.length <= 1) return null;

    return (
      <motion.div key="search-results" {...motionTransition}>
        <Card className="bg-background">
          <CardHeader className="p-4">
            <h3 className="text-lg font-semibold">Search Results ({searchResults.length})</h3>
          </CardHeader>
          <Divider />
          <CardBody className="p-4">
            <div className="space-y-3">
              {searchResults.map((result, index) => (
                <div
                  key={`${result.entity_type}-${result.entity_uuid}-${index}`}
                  className="p-3 border border-default-200 rounded-lg cursor-pointer hover:bg-default-50 transition-colors"
                  onClick={() => handleResultSelect(result)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon
                        icon={
                          result.entity_type === 'delivery' ? "mdi:truck-delivery" :
                            result.entity_type === 'inventory' ? "mdi:package-variant" :
                              result.entity_type === 'warehouse' ? "mdi:warehouse" :
                                result.entity_type === 'warehouse_inventory' ? "mdi:cube-outline" :
                                  result.entity_type === 'inventory_item' ? "mdi:package-variant-closed" :
                                    result.entity_type === 'warehouse_inventory_item' ? "mdi:package" :
                                      result.entity_type === 'new_warehouse_inventory' ? "mdi:warehouse-plus" :
                                        "mdi:help-circle"
                        }
                        className="text-primary w-5 h-5"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{result.entity_name}</p>
                          {/* Show count badge for new_warehouse_inventory */}
                          {result.entity_type === 'new_warehouse_inventory' && result.entity_data?.total_matched_items > 1 && (
                            <Chip
                              color="warning"
                              size="sm"
                              variant="flat"
                              className="text-xs"
                            >
                              {result.entity_data.total_matched_items} items
                            </Chip>
                          )}
                        </div>
                        <p className="text-sm text-default-500 capitalize">
                          {result.entity_type === 'new_warehouse_inventory'
                            ? `Delivery with ${result.entity_data?.total_matched_items || 1} new warehouse item${(result.entity_data?.total_matched_items || 1) > 1 ? 's' : ''}`
                            : `${result.entity_type.replace('_', ' ')} • Matched: ${result.matched_property}`
                          }
                        </p>
                        {/* Show matched warehouse inventory UUIDs for new_warehouse_inventory */}
                        {result.entity_type === 'new_warehouse_inventory' && result.entity_data?.matched_warehouse_inventory_uuids && (
                          <div className="mt-1">
                            <p className="text-xs text-default-400">
                              Matched UUIDs: {result.entity_data.matched_warehouse_inventory_uuids.slice(0, 2).map((uuid: string) => (
                                <code key={uuid} className="bg-default-100 px-1 rounded mx-1">
                                  {uuid}
                                </code>
                              ))}
                              {result.entity_data.matched_warehouse_inventory_uuids.length > 2 && (
                                <span className="text-default-400">
                                  +{result.entity_data.matched_warehouse_inventory_uuids.length - 2} more
                                </span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Entity Status Chip and Actions */}
                    <div className="flex items-center gap-2">
                      {result.entity_status && (
                        <Chip
                          color={getStatusColor(result.entity_status)}
                          size="sm"
                          variant="flat"
                        >
                          {result.entity_status}
                        </Chip>
                      )}
                      {/* Quick Accept Button - ONLY for new_warehouse_inventory now */}
                      {result.entity_type === 'new_warehouse_inventory' &&
                        result.entity_status === 'IN_TRANSIT' &&
                        user && !user.is_admin && (
                          <Button
                            color="success"
                            size="sm"
                            variant="flat"
                            startContent={<Icon icon="mdi:check" />}
                            onPress={(e) => {
                              handleAcceptNewWarehouseInventoryAction(result);
                            }}
                            isLoading={isAcceptingNewWarehouseInventory}
                          >
                            Accept
                          </Button>
                        )}
                    </div>
                  </div>

                  {result.entity_description && (
                    <p className="text-sm text-default-600 mt-2 line-clamp-2">
                      {result.entity_description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </motion.div>
    );
  };

  const renderSelectedComponent = () => {
    if (!selectedResult) return null;

    const { entity_type, entity_uuid } = selectedResult;
    const isCurrentNewWarehouseInventoryAccepting = pendingNewWarehouseInventoryAccept?.resultItem?.entity_uuid === entity_uuid;
    const isCurrentNewWarehouseInventoryProcessing = isAcceptingNewWarehouseInventory && selectedResult?.entity_uuid === entity_uuid;

    // Only disable for non-admin users who are in accepting/processing states
    const isDisabled = !user?.is_admin && (isCurrentNewWarehouseInventoryAccepting || isCurrentNewWarehouseInventoryProcessing);

    // Check for showOptions URL parameter
    const showOptions = searchParams.get("showOptions") === "true";

    // Only show accept button for new_warehouse_inventory for non-admin users
    const shouldShowAcceptButton = entity_type === 'new_warehouse_inventory' &&
      selectedResult.entity_status === 'IN_TRANSIT' &&
      user && !user.is_admin &&
      (showOptions || isCurrentNewWarehouseInventoryAccepting || isCurrentNewWarehouseInventoryProcessing || acceptNewWarehouseInventorySuccess || acceptNewWarehouseInventoryError);

    // Enhanced new warehouse inventory accept button with timer/loading/success/error states
    const newWarehouseInventoryAcceptButton = shouldShowAcceptButton ? (
      <div className="mb-4 sticky top-20 z-10">
        <Card className={`border shadow-2xl shadow-default-300 dark:shadow-background
        ${acceptNewWarehouseInventorySuccess ? 'bg-success-50 border-success-200' :
            acceptNewWarehouseInventoryError ? 'bg-danger-50 border-danger-200' :
              isCurrentNewWarehouseInventoryAccepting ? 'bg-warning-50 border-warning-200' :
                isCurrentNewWarehouseInventoryProcessing ? 'bg-primary-50 border-primary-200' :
                  'bg-success-50 border-success-200'
          }`}>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Icon
                  icon={
                    acceptNewWarehouseInventorySuccess ? "mdi:check-circle" :
                      acceptNewWarehouseInventoryError ? "mdi:alert-circle" :
                        isCurrentNewWarehouseInventoryProcessing ? "mdi:loading" :
                          isCurrentNewWarehouseInventoryAccepting ? "mdi:timer" :
                            "mdi:warehouse-plus"
                  }
                  className={`w-6 h-6 ${acceptNewWarehouseInventorySuccess ? 'text-success' :
                    acceptNewWarehouseInventoryError ? 'text-danger' :
                      isCurrentNewWarehouseInventoryProcessing ? 'text-primary animate-spin' :
                        isCurrentNewWarehouseInventoryAccepting ? 'text-warning' :
                          'text-success'
                    }`}
                />
                <div>
                  <h4 className={`font-semibold ${acceptNewWarehouseInventorySuccess ? 'text-success-900' :
                    acceptNewWarehouseInventoryError ? 'text-danger-900' :
                      isCurrentNewWarehouseInventoryProcessing ? 'text-primary-900' :
                        isCurrentNewWarehouseInventoryAccepting ? 'text-warning-900' :
                          'text-success-900'
                    }`}>
                    {acceptNewWarehouseInventorySuccess ? 'New Warehouse Inventory Successfully Accepted' :
                      acceptNewWarehouseInventoryError ? 'New Warehouse Inventory Error' :
                        isCurrentNewWarehouseInventoryProcessing ? 'Processing New Warehouse Inventory' :
                          isCurrentNewWarehouseInventoryAccepting ? 'Auto-Accept Timer' :
                            'Quick Actions'}
                  </h4>
                  <p className={`text-sm ${acceptNewWarehouseInventorySuccess ? 'text-success-700' :
                    acceptNewWarehouseInventoryError ? 'text-danger-700' :
                      isCurrentNewWarehouseInventoryProcessing ? 'text-primary-700' :
                        isCurrentNewWarehouseInventoryAccepting ? 'text-warning-700' :
                          'text-success-700'
                    }`}>
                    {acceptNewWarehouseInventorySuccess ? 'The new warehouse inventory items have been accepted and warehouse inventory has been updated.' :
                      acceptNewWarehouseInventoryError ? acceptNewWarehouseInventoryError :
                        isCurrentNewWarehouseInventoryProcessing ? 'Please wait while we process the new warehouse inventory acceptance and update warehouse inventory...' :
                          isCurrentNewWarehouseInventoryAccepting ? `Auto-accepting in ${autoAcceptTimeRemaining} seconds` :
                            `Accept these ${selectedResult.entity_data?.total_matched_items || 1} new warehouse inventory item${(selectedResult.entity_data?.total_matched_items || 1) > 1 ? 's' : ''}`
                    }
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Success Actions */}
                {acceptNewWarehouseInventorySuccess && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-success-100 rounded-full">
                      <Icon icon="mdi:check" className="text-success w-6 h-6" />
                    </div>
                    <Button
                      color="success"
                      variant="flat"
                      startContent={<Icon icon="mdi:refresh" />}
                      onPress={() => {
                        setAcceptNewWarehouseInventorySuccess(false);
                        setAcceptNewWarehouseInventoryError(null);
                        if (lastSearchQuery) {
                          performSearch(lastSearchQuery, user, true);
                        }
                      }}
                      size="sm"
                    >
                      Refresh
                    </Button>
                  </div>
                )}

                {/* Error Actions */}
                {acceptNewWarehouseInventoryError && !isCurrentNewWarehouseInventoryProcessing && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-danger-100 rounded-full">
                      <Icon icon="mdi:close" className="text-danger w-6 h-6" />
                    </div>
                    <Button
                      color="danger"
                      variant="flat"
                      startContent={<Icon icon="mdi:close" />}
                      onPress={() => {
                        setAcceptNewWarehouseInventoryError(null);
                        setAcceptNewWarehouseInventorySuccess(false);
                      }}
                      size="sm"
                    >
                      Dismiss
                    </Button>
                  </div>
                )}

                {/* Timer Progress Indicator */}
                {isCurrentNewWarehouseInventoryAccepting && (
                  <div className="flex items-center gap-3 flex-wrap justify-end">
                    {/* Cancel button */}
                    <Button
                      color="danger"
                      variant="shadow"
                      startContent={<Icon icon="mdi:close" />}
                      onPress={cancelAutoAccept}
                      size="sm"
                    >
                      Cancel
                    </Button>

                    {/* Accept Now button */}
                    <Button
                      color="warning"
                      variant="shadow"
                      startContent={<Icon icon="mdi:check" />}
                      onPress={() => {
                        cancelAutoAccept();
                        if (pendingNewWarehouseInventoryAccept) {
                          handleAcceptNewWarehouseInventoryAction(pendingNewWarehouseInventoryAccept.resultItem, pendingNewWarehouseInventoryAccept.userToUse);
                        }
                      }}
                      size="sm"
                    >
                      Accept Now
                    </Button>
                  </div>
                )}

                {/* Processing Spinner */}
                {isCurrentNewWarehouseInventoryProcessing && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-primary-100 rounded-full">
                      <Spinner size="md" color="primary" />
                    </div>
                    <span className="text-sm text-primary-700">Processing...</span>
                  </div>
                )}

                {/* Normal Accept Button */}
                {!isCurrentNewWarehouseInventoryAccepting && !isCurrentNewWarehouseInventoryProcessing && !acceptNewWarehouseInventorySuccess && !acceptNewWarehouseInventoryError && (
                  <Button
                    color="success"
                    variant="shadow"
                    startContent={<Icon icon="mdi:check" />}
                    onPress={() => handleAcceptNewWarehouseInventoryAction(selectedResult)}
                  >
                    Accept Delivery
                  </Button>
                )}
              </div>
            </div>

            {/* Enhanced Progress Bar for Timer */}
            {isCurrentNewWarehouseInventoryAccepting && (
              <div className="mt-4 space-y-2">
                <div className="relative w-full bg-warning-200 rounded-full h-3 overflow-hidden shadow-inner">
                  <div
                    className="bg-gradient-to-r from-warning-400 to-warning-600 h-3 rounded-full transition-all duration-100 ease-linear shadow-sm"
                    style={{ width: `${autoAcceptProgress}%` }}
                  />
                  <div
                    className="absolute top-0 h-3 w-8 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full transition-all duration-100 ease-linear"
                    style={{
                      left: `${Math.max(0, autoAcceptProgress - 8)}%`,
                      opacity: autoAcceptProgress > 0 && autoAcceptProgress < 100 ? 1 : 0
                    }}
                  />
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    ) : null;

    switch (entity_type) {
      case 'delivery':
        return (
          <motion.div key="delivery-component" {...motionTransition}>
            <div className={`${isDisabled ? 'opacity-50 pointer-events-none blur-sm scale-95 origin-top' : ''} transition-all duration-200`}>
              <DeliveryComponent
                deliveryId={entity_uuid}
                user={user}
                warehouses={warehouses}
                operators={operators}
                inventories={inventories}
                readOnlyMode={true}
                onLoadingChange={handleDeliveryComponentLoadingChange}
              />
            </div>
          </motion.div>
        );

      case 'new_warehouse_inventory':
        return (
          <motion.div key="new-warehouse-inventory-component" {...motionTransition}>
            {newWarehouseInventoryAcceptButton}
            <div className={`${isDisabled ? 'opacity-50 pointer-events-none blur-sm scale-95 origin-top' : ''} transition-all duration-200`}>
              <div className="space-y-4">
                <Card className="bg-warning-50 border border-warning-200">
                  <CardBody className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Icon icon="mdi:warehouse-plus" className="text-warning w-6 h-6" />
                      <div className="flex-1">
                        <h4 className="font-semibold text-warning-900">
                          New Warehouse Inventory Items ({selectedResult.entity_data?.total_matched_items || 1})
                        </h4>
                        <p className="text-sm text-warning-700">
                          {selectedResult.entity_data?.total_matched_items > 1
                            ? `These ${selectedResult.entity_data.total_matched_items} warehouse inventory items will be created when the delivery is accepted.`
                            : 'This warehouse inventory item will be created when the delivery is accepted.'
                          }
                        </p>
                      </div>
                    </div>

                    {/* Show matched warehouse inventory UUIDs */}
                    {selectedResult.entity_data?.matched_warehouse_inventory_uuids && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-warning-800">Warehouse Inventory UUIDs:</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {selectedResult.entity_data.matched_warehouse_inventory_uuids.map((uuid: string, index: number) => (
                            <div key={uuid} className="flex items-center gap-2 p-2 bg-warning-100/50 rounded">
                              <span className="text-xs text-warning-600">#{index + 1}</span>
                              <code className="text-xs bg-warning-200 px-1 rounded font-mono flex-1 truncate">
                                {uuid}
                              </code>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Show matched inventory items details if available */}
                    {selectedResult.entity_data?.matched_inventory_items && selectedResult.entity_data.matched_inventory_items.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-medium text-warning-800">Related Inventory Items:</p>
                        <div className="space-y-1">
                          {selectedResult.entity_data.matched_inventory_items.map((item: any, index: number) => (
                            <div key={item.warehouse_inventory_uuid} className="flex items-center gap-2 p-2 bg-warning-100/30 rounded text-xs">
                              <Icon icon="mdi:package-variant" className="text-warning-600 w-4 h-4" />
                              <span className="font-medium text-warning-800">{item.name}</span>
                              <span className="text-warning-600">({item.unit})</span>
                              {item.description && (
                                <span className="text-warning-500 truncate">{item.description}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardBody>
                </Card>

                {/* Show the delivery component */}
                {selectedResult.entity_uuid && (
                  <DeliveryComponent
                    deliveryId={selectedResult.entity_uuid}
                    user={user}
                    warehouses={warehouses}
                    operators={operators}
                    inventories={inventories}
                    readOnlyMode={true}
                    onLoadingChange={handleDeliveryComponentLoadingChange}
                  />
                )}
              </div>
            </div>
          </motion.div>
        );
      case 'inventory':
        if (user && !user.is_admin) {
          return (
            <motion.div key="inventory-access-denied" {...motionTransition}>
              <Alert
                color="warning"
                variant="flat"
                icon={<Icon icon="mdi:shield-alert" />}
              >
                Access denied: Only administrators can view inventory item details
              </Alert>
            </motion.div>
          );
        }
        return (
          <motion.div key="inventory-component" {...motionTransition}>
            <div className={isDisabled ? 'opacity-50 pointer-events-none' : ''}>
              <InventoryItemComponent
                inventoryId={entity_uuid}
                user={user}
                readOnlyMode={true}
              />
            </div>
          </motion.div>
        );

      case 'warehouse_inventory':
      case 'warehouse_inventory_item':
        return (
          <motion.div key="warehouse-inventory-component" {...motionTransition}>
            <div className={isDisabled ? 'opacity-50 pointer-events-none' : ''}>
              <WarehouseInventoryComponent
                inventoryId={entity_uuid}
                user={user}
                warehouses={warehouses}
                inventories={inventories}
                readOnlyMode={true}
                handleViewWarehouse={null}
                handleViewInventory={null}
              />
            </div>
          </motion.div>
        );

      default:
        return (
          <motion.div key="unsupported-entity" {...motionTransition}>
            <Card className="bg-background">
              <CardBody className="text-center py-12">
                <Icon icon="mdi:information-outline" className="text-default-400 mx-auto mb-4" width={48} />
                <h3 className="text-lg font-semibold mb-2">Entity Type Not Supported</h3>
                <p className="text-default-600">
                  The entity type "{entity_type}" is not yet supported for detailed view.
                </p>

                {/* Show raw data for unsupported types */}
                <div className="mt-6 p-4 bg-default-50 rounded-lg text-left">
                  <h4 className="font-medium mb-2">Raw Data:</h4>
                  <pre className="text-sm text-default-600 overflow-auto">
                    {JSON.stringify(selectedResult.entity_data, null, 2)}
                  </pre>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        );
    }
  };

  return (
    <div>
      {/* Sticky Header Section */}
      <div className="container p-2 max-w-5xl mx-auto">
        <motion.div
          {...motionTransitionScale}
          className="flex flex-col gap-4"
        >
          {/* Header text */}
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Search System</h1>
            {isLoading ? (
              <div className="text-default-500 flex xl:justify-start justify-center items-center">
                <p className='my-auto mr-1'>Loading search system</p>
                <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
              </div>
            ) : (
              <p className="text-default-500">
                Search across deliveries, inventory, warehouses, and more using any identifier or keyword.
              </p>
            )}
          </div>
        </motion.div>
      </div>

      <div className="absolute sticky z-10 top-0 max-w-5xl mx-auto w-full px-2">
        {/* Search Bar */}
        <div className="absolute sticky z-10 flex gap-3 items-center w-full relative rounded-2xl overflow-hidden shadow-2xl shadow-default-300 dark:shadow-background backdrop-blur-xl border border-default-200">
          <Input
            placeholder="Enter UUID, name, code, or any searchable term..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isSearching}
            onKeyPress={handleKeyPress}
            classNames={{
              inputWrapper: "bg-background/50 !cursor-text py-8 px-4 m-0 rounded-none hover:!bg-default-50/50 focus-within:!bg-default-50/50",
              input: "text-default-500 placeholder-default-400",
              label: "text-default-600"
            }}
            size="lg"
            className="flex-1"
          />
          <Button
            color="primary"
            variant="shadow"
            onPress={handleSearch}
            className="rounded-lg absolute right-4 -translate-y-1/2 top-1/2 z-10"
            size="sm"
            isLoading={isSearching}
            startContent={!isSearching && <Icon icon="mdi:magnify" />}
            disabled={isSearching || !searchQuery.trim()}
          >
            Search
          </Button>
        </div>
      </div>

      {/* Content Section */}
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex flex-col gap-6 pt-6">
          <AnimatePresence mode="wait">
            {/* Error Message */}
            {error && (
              <motion.div key="error" {...motionTransition}>
                <Alert
                  color="danger"
                  variant="solid"
                  className="shadow-danger-500/30 shadow-xl"
                  icon={<Icon icon="mdi:alert-circle" width={24} />}
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
                  title="Search Error"
                  description={error}
                />
              </motion.div>
            )}

            {/* Loading State */}
            {isSearching && !error && (
              <motion.div key="loading" {...motionTransition}>
                <Card className="bg-background">
                  <CardBody className="p-6 h-32 flex items-center justify-center">
                    <div className="flex items-center justify-center gap-3">
                      <Spinner size="lg" color="primary" />
                      <span className="text-lg">Searching...</span>
                    </div>
                  </CardBody>
                </Card>
              </motion.div>
            )}

            {/* Search Results List (multiple results) */}
            {renderSearchResults()}

            {/* Selected Component (single result or user selection) */}
            {renderSelectedComponent()}

            {/* Instructions (no search performed) */}
            {!hasSearched && !error && !isSearching && (
              <motion.div key="instructions" {...motionTransition}>
                <Card className="bg-background">
                  <CardBody className="text-center py-12">
                    <Icon icon="mdi:magnify" className="text-default-400 mx-auto mb-4" width={48} />
                    <h3 className="text-lg font-semibold mb-2">Universal Search</h3>
                    <p className="text-default-600 mb-6">
                      Enter any identifier, name, or keyword to search across all system entities.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-2xl mx-auto">
                      <div className="p-3 bg-default-50 rounded-lg">
                        <Icon icon="mdi:truck-delivery" className="text-warning mx-auto mb-2" width={24} />
                        <p className="text-sm font-medium">Deliveries</p>
                      </div>
                      <div className="p-3 bg-default-50 rounded-lg">
                        <Icon icon="mdi:package-variant" className="text-secondary mx-auto mb-2" width={24} />
                        <p className="text-sm font-medium">Inventory</p>
                      </div>
                      <div className="p-3 bg-default-50 rounded-lg">
                        <Icon icon="mdi:warehouse" className="text-success mx-auto mb-2" width={24} />
                        <p className="text-sm font-medium">Warehouses</p>
                      </div>
                      <div className="p-3 bg-default-50 rounded-lg">
                        <Icon icon="mdi:cube-outline" className="text-primary mx-auto mb-2" width={24} />
                        <p className="text-sm font-medium">Warehouse Items</p>
                      </div>
                      <div className="p-3 bg-default-50 rounded-lg">
                        <Icon icon="mdi:package" className="text-danger mx-auto mb-2" width={24} />
                        <p className="text-sm font-medium">Inventory Items</p>
                      </div>
                      <div className="p-3 bg-default-50 rounded-lg">
                        <Icon icon="mdi:chart-line" className="text-default-600 mx-auto mb-2" width={24} />
                        <p className="text-sm font-medium">Reorder Points</p>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </motion.div>
            )}

            {/* No Results */}
            {hasSearched && searchResults.length === 0 && !isSearching && !error && (
              <motion.div key="no-results" {...motionTransition}>
                <Card className="bg-background">
                  <CardBody className="text-center py-12">
                    <Icon icon="mdi:magnify-close" className="text-default-400 mx-auto mb-4" width={48} />
                    <h3 className="text-lg font-semibold mb-2">No Results Found</h3>
                    <p className="text-default-600">
                      No entities found matching "{searchQuery}". Try different keywords or check your spelling.
                    </p>
                  </CardBody>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Back to Results Button (only show when viewing a selected result from multiple results) */}
          {selectedResult && searchResults.length > 1 && (
            <motion.div {...motionTransition}>
              <div className="flex justify-center">
                <Button
                  color="primary"
                  variant="flat"
                  onPress={handleBackToResults}
                  startContent={<Icon icon="mdi:arrow-left" />}
                >
                  Back to Search Results
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}