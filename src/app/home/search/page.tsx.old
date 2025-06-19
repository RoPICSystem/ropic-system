"use client";

import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Snippet,
  Spinner
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useRef, useState } from 'react';

import {
  handleAcceptNewWarehouseInventory
} from './actions';

// Components
import { createClient } from "@/utils/supabase/client";

// Import the existing components
import { DeliveryComponent } from "@/app/home/delivery/delivery-component";
import { InventoryComponent as InventoryItemComponent } from "@/app/home/inventory/inventory-component";
import { InventoryComponent as WarehouseInventoryComponent } from "@/app/home/warehouse-items/warehouse-inventory-component";
import { motionTransition, motionTransitionScale } from '@/utils/anim';
import { getUserFromCookies } from '@/utils/supabase/server/user';
import { markWarehouseGroupAsUsed, markWarehouseItemAsUsed, markWarehouseItemsBulkUsed } from '../warehouse-items/actions';
import { getDeliveryDetails } from "../delivery/actions";

// Enhanced search function with warehouse inventory fallback
async function generalSearch(
  searchQuery: string,
  entityType?: string,
  companyUuid?: string,
  limit: number = 50,
  offset: number = 0
) {
  const supabase = createClient();

  // Try the general search first
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

  // If no results found and searchQuery looks like a UUID, try warehouse inventory fallback
  if ((!data || data.length === 0) && isValidUUID(searchQuery)) {
    console.log('No results from general search, trying warehouse inventory fallback...');
    
    try {
      // Try to get warehouse inventory details directly
      const { data: warehouseData, error: warehouseError } = await supabase
        .from('warehouse_inventory')
        .select(`
          uuid,
          name,
          description,
          warehouse_uuid,
          inventory_uuid,
          status,
          warehouses(name, address),
          inventory(name, description)
        `)
        .eq('uuid', searchQuery)
        .eq('company_uuid', companyUuid)
        .single();

      if (!warehouseError && warehouseData) {
        // Create a search result in the expected format
        const warehouse = Array.isArray(warehouseData.warehouses) ? warehouseData.warehouses[0] : warehouseData.warehouses;
        const inventory = Array.isArray(warehouseData.inventory) ? warehouseData.inventory[0] : warehouseData.inventory;
        
        const fallbackResult = {
          entity_type: 'warehouse_inventory',
          entity_uuid: warehouseData.uuid,
          entity_title: warehouseData.name || inventory?.name || 'Warehouse Inventory',
          entity_description: warehouseData.description || inventory?.description,
          entity_status: warehouseData.status,
          entity_data: {
            warehouse_name: warehouse?.name,
            warehouse_address: warehouse?.address,
            inventory_name: inventory?.name,
            inventory_description: inventory?.description
          }
        };
        
        console.log('Found warehouse inventory fallback result:', fallbackResult);
        return { success: true, data: [fallbackResult] };
      }

      // If still no warehouse inventory found, try inventory fallback
      const { data: inventoryData, error: inventoryError } = await supabase
        .from('inventory')
        .select(`
          uuid,
          name,
          description,
          status,
          measurement_unit,
          standard_unit
        `)
        .eq('uuid', searchQuery)
        .eq('company_uuid', companyUuid)
        .single();

      if (!inventoryError && inventoryData) {
        const inventoryFallbackResult = {
          entity_type: 'inventory',
          entity_uuid: inventoryData.uuid,
          entity_title: inventoryData.name,
          entity_description: inventoryData.description,
          entity_status: inventoryData.status,
          entity_data: {
            measurement_unit: inventoryData.measurement_unit,
            standard_unit: inventoryData.standard_unit
          }
        };
        
        console.log('Found inventory fallback result:', inventoryFallbackResult);
        return { success: true, data: [inventoryFallbackResult] };
      }

    } catch (fallbackError) {
      console.error('Fallback search error:', fallbackError);
    }
  }

  return { success: true, data: data || [] };
}

// Helper function to validate UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
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

  // Add new states for marking items as used
  const [isMarkingItemAsUsed, setIsMarkingItemAsUsed] = useState(false);
  const [markItemAsUsedError, setMarkItemAsUsedError] = useState<string | null>(null);
  const [markItemAsUsedSuccess, setMarkItemAsUsedSuccess] = useState(false);
  const [pendingMarkItemAsUsed, setPendingMarkItemAsUsed] = useState<any>(null);

  // New warehouse inventory acceptance states
  const [isAcceptingNewWarehouseInventory, setIsAcceptingNewWarehouseInventory] = useState(false);
  const [acceptNewWarehouseInventoryError, setAcceptNewWarehouseInventoryError] = useState<string | null>(null);
  const [acceptNewWarehouseInventorySuccess, setAcceptNewWarehouseInventorySuccess] = useState(false);

  // Modal states
  const [showAcceptStatusModal, setShowAcceptStatusModal] = useState(false);
  const [showAcceptDeliveryLoadingModal, setShowAcceptDeliveryLoadingModal] = useState(false);

  // Auto-accept timer states (now for new_warehouse_inventory)
  const [autoProgress, setAutoProgress] = useState(0);
  const [autoTimeRemaining, setAutoTimeRemaining] = useState(5);
  const [pendingNewWarehouseInventoryAccept, setPendingNewWarehouseInventoryAccept] = useState<any>(null);
  const autoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
        const isAuto = searchParams.get("auto") === "true";
        const showOptions = searchParams.get("showOptions") === "true";

        // NEW: Handle warehouse inventory URL parameters
        const warehouseInventoryParam = searchParams.get("warehouseInventory");
        const deliveryParam = searchParams.get("delivery");
        const itemParam = searchParams.get("item");
        const groupParam = searchParams.get("group");

        // If warehouse inventory parameter is provided, use it as the search query
        const finalQuery = warehouseInventoryParam || query;

        if (finalQuery) {
          setSearchQuery(finalQuery);
          setLastSearchQuery(finalQuery);
          await performSearch(finalQuery, userData, viewMode, isAuto, showOptions, deliveryParam);
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
    const isAuto = searchParams.get("auto") === "true";
    const showOptions = searchParams.get("showOptions") === "true";

    // NEW: Handle warehouse inventory URL parameters
    const warehouseInventoryParam = searchParams.get("warehouseInventory");
    const deliveryParam = searchParams.get("delivery");
    const finalQuery = warehouseInventoryParam || query;

    // Only perform search if query is different from what we last searched
    if (finalQuery && finalQuery !== lastSearchQuery) {
      setSearchQuery(finalQuery);
      setLastSearchQuery(finalQuery);
      performSearch(finalQuery, user, viewMode, isAuto, showOptions, deliveryParam);
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
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
      }
      if (autoIntervalRef.current) {
        clearInterval(autoIntervalRef.current);
      }
    };
  }, []);

  const performSearch = async (
    query: string,
    userData?: any,
    autoView: boolean = false,
    auto: boolean = false,
    showOptions: boolean = false,
    deliveryUuid?: string | null
  ) => {
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

        // Auto-select based on conditions
        if (autoView || result.data.length === 1) {
          const selectedItem = result.data[0];
          setSelectedResult(selectedItem);

          // NEW: Enhanced delivery handling logic
          if (deliveryUuid && selectedItem?.entity_type === 'warehouse_inventory') {
            // Check if this is a new warehouse inventory (delivery not yet accepted)
            const deliveryResult = await getDeliveryDetails(deliveryUuid, userToUse?.company_uuid);

            if (deliveryResult.success && deliveryResult.data?.status === 'IN_TRANSIT') {
              // This is a new warehouse inventory scenario - override entity type
              setSelectedResult({
                ...selectedItem,
                entity_type: 'new_warehouse_inventory',
                entity_uuid: deliveryUuid, // Use delivery UUID for acceptance
                entity_data: {
                  ...selectedItem.entity_data,
                  delivery_uuid: deliveryUuid,
                  matched_warehouse_inventory_uuids: [selectedItem.entity_uuid]
                }
              });

              // Handle auto-accept for new_warehouse_inventory with delivery override
              if ((auto || showOptions) && userToUse && !userToUse.is_admin) {
                const autoKey = `new_warehouse_inventory-${deliveryUuid}-auto`;
                if (!processedAutoActions.current.has(autoKey)) {
                  processedAutoActions.current.add(autoKey);
                  setPendingAutoIntent({
                    resultItem: {
                      ...selectedItem,
                      entity_type: 'new_warehouse_inventory',
                      entity_uuid: deliveryUuid
                    },
                    userToUse,
                    shouldStartTimer: true
                  });
                }
              }
            } else {
              // Handle existing warehouse inventory marking as used
              if (showOptions && userToUse && !userToUse.is_admin) {
                const itemParam = searchParams.get("item");
                const groupParam = searchParams.get("group");

                const markUsedKey = `${selectedItem?.entity_type}-${query}-markUsed`;
                if (!processedAutoActions.current.has(markUsedKey)) {
                  processedAutoActions.current.add(markUsedKey);
                  setPendingMarkItemAsUsedIntent({
                    resultItem: selectedItem,
                    userToUse,
                    shouldStartTimer: true,
                    inventoryItemUuid: itemParam || groupParam || null,
                    isGroup: !!groupParam
                  });
                }
              }
            }
          } else {
            // Original logic for non-delivery scenarios
            if ((auto || showOptions) &&
              selectedItem?.entity_type === 'new_warehouse_inventory' &&
              userToUse && !userToUse.is_admin) {
              const autoKey = `${selectedItem?.entity_type}-${query}-auto`;
              if (!processedAutoActions.current.has(autoKey)) {
                processedAutoActions.current.add(autoKey);
                setPendingAutoIntent({
                  resultItem: selectedItem,
                  userToUse,
                  shouldStartTimer: true
                });
              }
            }

            // Handle mark item as used for existing warehouse inventory
            if (showOptions && selectedItem?.entity_type === 'warehouse_inventory' && userToUse && !userToUse.is_admin) {
              const itemParam = searchParams.get("item");
              const groupParam = searchParams.get("group");

              const markUsedKey = `${selectedItem?.entity_type}-${query}-markUsed`;
              if (!processedAutoActions.current.has(markUsedKey)) {
                processedAutoActions.current.add(markUsedKey);
                setPendingMarkItemAsUsedIntent({
                  resultItem: selectedItem,
                  userToUse,
                  shouldStartTimer: true,
                  inventoryItemUuid: itemParam || groupParam || null,
                  isGroup: !!groupParam
                });
              }
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

  // Add state to track pending mark item as used intent
  const [pendingMarkItemAsUsedIntent, setPendingMarkItemAsUsedIntent] = useState<{
    resultItem: any;
    userToUse: any;
    shouldStartTimer: boolean;
    inventoryItemUuid: string | null;
    isGroup: boolean;
  } | null>(null);

  // Add effect to handle mark item as used when component loading is complete
  useEffect(() => {
    if (pendingMarkItemAsUsedIntent &&
      pendingMarkItemAsUsedIntent.shouldStartTimer &&
      !isDeliveryComponentLoading &&
      !isSearching &&
      selectedResult?.entity_uuid === pendingMarkItemAsUsedIntent.resultItem.entity_uuid) {

      console.log("Starting mark item as used timer now that component is loaded");
      startMarkItemAsUsedTimer(
        pendingMarkItemAsUsedIntent.resultItem,
        pendingMarkItemAsUsedIntent.userToUse,
        pendingMarkItemAsUsedIntent.inventoryItemUuid,
        pendingMarkItemAsUsedIntent.isGroup
      );

      // Clear the intent
      setPendingMarkItemAsUsedIntent(null);
    }
  }, [pendingMarkItemAsUsedIntent, isDeliveryComponentLoading, isSearching, selectedResult]);


  // Start mark item as used timer
  const startMarkItemAsUsedTimer = (resultItem: any, userToUse: any, inventoryItemUuid: string | null, isGroup: boolean, timerDuration: number = 10000) => {
    // Only start timer for warehouse_inventory entity type
    if (resultItem.entity_type !== 'warehouse_inventory') return;

    setPendingMarkItemAsUsed({
      resultItem,
      userToUse,
      inventoryItemUuid,
      isGroup
    });
    setAutoProgress(0);
    setAutoTimeRemaining(timerDuration / 1000);

    // Clear any existing timers
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
    }
    if (autoIntervalRef.current) {
      clearInterval(autoIntervalRef.current);
    }

    // Progress interval (update every 100ms for smooth animation)
    autoIntervalRef.current = setInterval(() => {
      setAutoProgress(prev => {
        const newProgress = prev + (100 / timerDuration) * 100; // 100ms steps
        if (newProgress >= 100) {
          setAutoTimeRemaining(0);
          return 100;
        }
        setAutoTimeRemaining(Math.ceil((timerDuration - (newProgress / 100 * timerDuration)) / 1000));
        return newProgress;
      });
    }, 100);

    // Auto-mark timer
    autoTimerRef.current = setTimeout(() => {
      if (autoIntervalRef.current) {
        clearInterval(autoIntervalRef.current);
      }
      handleMarkItemAsUsedAction(resultItem, userToUse, inventoryItemUuid, isGroup);
    }, timerDuration);
  };

  // Cancel mark item as used timer
  const cancelMarkItemAsUsed = () => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
    }
    if (autoIntervalRef.current) {
      clearInterval(autoIntervalRef.current);
    }
    setPendingMarkItemAsUsed(null);
    setAutoProgress(0);
    setAutoTimeRemaining(5);
  };


  // Handle mark item as used action
  const handleMarkItemAsUsedAction = async (resultItem: any, customUser?: any, inventoryItemUuid?: string | null, isGroup?: boolean) => {
    // Only handle warehouse_inventory entity type
    if (!resultItem || resultItem.entity_type !== 'warehouse_inventory') return;

    const warehouseInventoryUuid = resultItem.entity_uuid;

    console.log("Marking item as used:", warehouseInventoryUuid, "inventory item:", inventoryItemUuid, "isGroup:", isGroup);

    // Clear timer states when starting marking
    setPendingMarkItemAsUsed(null);
    setAutoProgress(0);
    setAutoTimeRemaining(5);

    setIsMarkingItemAsUsed(true);
    setMarkItemAsUsedError(null);
    setMarkItemAsUsedSuccess(false);

    try {
      const userDetails = customUser || user;
      let result;

      // Determine which action to use based on the parameters
      if (inventoryItemUuid) {
        if (isGroup) {
          // Mark entire group as used
          console.log("Marking group as used:", inventoryItemUuid);
          result = await markWarehouseGroupAsUsed(inventoryItemUuid);
        } else {
          // Mark specific item as used
          console.log("Marking specific item as used:", inventoryItemUuid);
          result = await markWarehouseItemAsUsed(inventoryItemUuid);
        }
      } else {
        // Mark one item from the warehouse inventory as used (bulk with count 1)
        console.log("Marking one item from warehouse inventory as used:", warehouseInventoryUuid);
        result = await markWarehouseItemsBulkUsed(warehouseInventoryUuid, 1);
      }

      if (result.success) {
        setMarkItemAsUsedSuccess(true);
        setMarkItemAsUsedError(null);

        // Remove showOptions from URL after successful marking
        const currentParams = new URLSearchParams(searchParams.toString());
        currentParams.delete('showOptions');
        currentParams.delete('item');
        currentParams.delete('group');

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
        setMarkItemAsUsedError(result.error || "Failed to mark item as used");
      }

    } catch (error) {
      console.error("Error marking item as used:", error);
      setMarkItemAsUsedError(`Failed to mark item as used: ${(error as Error).message}`);
    } finally {
      setIsMarkingItemAsUsed(false);
    }
  };

  // Add state to track pending auto-accept intent
  const [pendingAutoIntent, setPendingAutoIntent] = useState<{
    resultItem: any;
    userToUse: any;
    shouldStartTimer: boolean;
  } | null>(null);

  // Add effect to handle auto-accept when component loading is complete
  useEffect(() => {
    if (pendingAutoIntent &&
      pendingAutoIntent.shouldStartTimer &&
      !isDeliveryComponentLoading &&
      !isSearching &&
      selectedResult?.entity_uuid === pendingAutoIntent.resultItem.entity_uuid) {

      console.log("Starting auto-accept timer now that component is loaded");
      startAutoTimer(pendingAutoIntent.resultItem, pendingAutoIntent.userToUse);

      // Clear the intent
      setPendingAutoIntent(null);
    }
  }, [pendingAutoIntent, isDeliveryComponentLoading, isSearching, selectedResult]);

  // Add callback for delivery component loading state
  const handleDeliveryComponentLoadingChange = (isLoading: boolean) => {
    setIsDeliveryComponentLoading(isLoading);
  };

  // Start auto-accept timer (now for new_warehouse_inventory)
  const startAutoTimer = (resultItem: any, userToUse: any, timerDuration: number = 10000) => {
    // Only start timer for new_warehouse_inventory entity type
    if (resultItem.entity_type !== 'new_warehouse_inventory') return;

    setPendingNewWarehouseInventoryAccept({ resultItem, userToUse });
    setAutoProgress(0);
    setAutoTimeRemaining(timerDuration / 1000);

    // Clear any existing timers
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
    }
    if (autoIntervalRef.current) {
      clearInterval(autoIntervalRef.current);
    }

    // Progress interval (update every 100ms for smooth animation)
    autoIntervalRef.current = setInterval(() => {
      setAutoProgress(prev => {
        const newProgress = prev + (100 / timerDuration) * 100; // 100ms steps
        if (newProgress >= 100) {
          setAutoTimeRemaining(0);
          return 100;
        }
        setAutoTimeRemaining(Math.ceil((timerDuration - (newProgress / 100 * timerDuration)) / 1000));
        return newProgress;
      });
    }, 100);

    // Auto-accept timer
    autoTimerRef.current = setTimeout(() => {
      if (autoIntervalRef.current) {
        clearInterval(autoIntervalRef.current);
      }
      handleAcceptNewWarehouseInventoryAction(resultItem, userToUse);
    }, timerDuration);
  };

  // Cancel auto-accept
  const cancelAuto = () => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
    }
    if (autoIntervalRef.current) {
      clearInterval(autoIntervalRef.current);
    }
    setPendingNewWarehouseInventoryAccept(null);
    setAutoProgress(0);
    setAutoTimeRemaining(5);
  };

  // Handle new warehouse inventory acceptance
  // Handle new warehouse inventory acceptance
  const handleAcceptNewWarehouseInventoryAction = async (resultItem: any, customUser?: any) => {
    // Handle both new_warehouse_inventory and warehouse_inventory with delivery
    let deliveryUuid: string;
    let warehouseInventoryUuids: string[] = [];

    if (resultItem.entity_type === 'new_warehouse_inventory') {
      deliveryUuid = resultItem.entity_uuid;
      warehouseInventoryUuids = resultItem.entity_data?.matched_warehouse_inventory_uuids || [];
    } else if (resultItem.entity_type === 'warehouse_inventory') {
      // NEW: Handle warehouse_inventory with delivery parameter
      const deliveryParam = searchParams.get("delivery");
      if (!deliveryParam) {
        setAcceptNewWarehouseInventoryError("No delivery specified for warehouse inventory acceptance");
        return;
      }
      deliveryUuid = deliveryParam;
      warehouseInventoryUuids = [resultItem.entity_uuid];
    } else {
      setAcceptNewWarehouseInventoryError("Invalid entity type for delivery acceptance");
      return;
    }

    console.log("Accepting delivery:", deliveryUuid, "Warehouse inventory UUIDs:", warehouseInventoryUuids);

    // Clear timer states when starting acceptance
    setPendingNewWarehouseInventoryAccept(null);
    setAutoProgress(0);
    setAutoTimeRemaining(5);

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

        // Remove URL parameters after successful acceptance
        const currentParams = new URLSearchParams(searchParams.toString());
        currentParams.delete('showOptions');
        currentParams.delete('auto');
        currentParams.delete('delivery');
        currentParams.delete('warehouseInventory');

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

        // Update URL without parameters
        router.push(newUrl);

        // Refresh the search to show updated status after a short delay
        setTimeout(() => {
          if (lastSearchQuery) {
            performSearch(lastSearchQuery, user, true);
          }
        }, 2000);
      } else {
        setAcceptNewWarehouseInventoryError(result.error || "Failed to accept delivery");
      }

    } catch (error) {
      console.error("Error accepting delivery:", error);
      setAcceptNewWarehouseInventoryError(`Failed to accept delivery: ${(error as Error).message}`);
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


  // Update the renderSelectedComponent function
  const renderSelectedComponent = () => {
    if (!selectedResult) return null;

    const { entity_type, entity_uuid } = selectedResult;
    const isCurrentNewWarehouseInventoryAccepting = pendingNewWarehouseInventoryAccept?.resultItem?.entity_uuid === entity_uuid;
    const isCurrentNewWarehouseInventoryProcessing = isAcceptingNewWarehouseInventory && selectedResult?.entity_uuid === entity_uuid;

    // NEW: Check for mark item as used states
    const isCurrentMarkItemAsUsedPending = pendingMarkItemAsUsed?.resultItem?.entity_uuid === entity_uuid;
    const isCurrentMarkItemAsUsedProcessing = isMarkingItemAsUsed && selectedResult?.entity_uuid === entity_uuid;

    // Only disable for non-admin users who are in accepting/processing states
    const isDisabled = !user?.is_admin && (
      isCurrentNewWarehouseInventoryAccepting ||
      isCurrentNewWarehouseInventoryProcessing ||
      isCurrentMarkItemAsUsedPending ||
      isCurrentMarkItemAsUsedProcessing
    );

    // Check for showOptions URL parameter
    const showOptions = searchParams.get("showOptions") === "true";
    const itemParam = searchParams.get("item");
    const groupParam = searchParams.get("group");

    // Show accept button for new_warehouse_inventory
    const shouldShowAcceptButton = entity_type === 'new_warehouse_inventory' &&
      selectedResult.entity_status === 'IN_TRANSIT' &&
      user && !user.is_admin &&
      (showOptions || isCurrentNewWarehouseInventoryAccepting || isCurrentNewWarehouseInventoryProcessing || acceptNewWarehouseInventorySuccess || acceptNewWarehouseInventoryError);

    // NEW: Show mark as used button for existing warehouse_inventory
    const shouldShowMarkAsUsedButton = entity_type === 'warehouse_inventory' &&
      user && !user.is_admin &&
      (showOptions || isCurrentMarkItemAsUsedPending || isCurrentMarkItemAsUsedProcessing || markItemAsUsedSuccess || markItemAsUsedError);

    // Enhanced new warehouse inventory accept button (existing code)
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
                          isCurrentNewWarehouseInventoryAccepting ? `Auto-accepting in ${autoTimeRemaining} seconds` :
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
                      onPress={cancelAuto}
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
                        cancelAuto();
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
                    style={{ width: `${autoProgress}%` }}
                  />
                  <div
                    className="absolute top-0 h-3 w-8 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full transition-all duration-100 ease-linear"
                    style={{
                      left: `${Math.max(0, autoProgress - 8)}%`,
                      opacity: autoProgress > 0 && autoProgress < 100 ? 1 : 0
                    }}
                  />
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    ) : null;

    // NEW: Enhanced mark item as used button
    const markItemAsUsedButton = shouldShowMarkAsUsedButton ? (
      <div className="mb-4 sticky top-20 z-10">
        <Card className={`border shadow-2xl shadow-default-300 dark:shadow-background
        ${markItemAsUsedSuccess ? 'bg-success-50 border-success-200' :
            markItemAsUsedError ? 'bg-danger-50 border-danger-200' :
              isCurrentMarkItemAsUsedPending ? 'bg-warning-50 border-warning-200' :
                isCurrentMarkItemAsUsedProcessing ? 'bg-primary-50 border-primary-200' :
                  'bg-warning-50 border-warning-200'
          }`}>
          <CardBody className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Icon
                  icon={
                    markItemAsUsedSuccess ? "mdi:check-circle" :
                      markItemAsUsedError ? "mdi:alert-circle" :
                        isCurrentMarkItemAsUsedProcessing ? "mdi:loading" :
                          isCurrentMarkItemAsUsedPending ? "mdi:timer" :
                            "mdi:package-minus"
                  }
                  className={`w-6 h-6 ${markItemAsUsedSuccess ? 'text-success' :
                    markItemAsUsedError ? 'text-danger' :
                      isCurrentMarkItemAsUsedProcessing ? 'text-primary animate-spin' :
                        isCurrentMarkItemAsUsedPending ? 'text-warning' :
                          'text-warning'
                    }`}
                />
                <div>
                  <h4 className={`font-semibold ${markItemAsUsedSuccess ? 'text-success-900' :
                    markItemAsUsedError ? 'text-danger-900' :
                      isCurrentMarkItemAsUsedProcessing ? 'text-primary-900' :
                        isCurrentMarkItemAsUsedPending ? 'text-warning-900' :
                          'text-warning-900'
                    }`}>
                    {markItemAsUsedSuccess ? 'Item Successfully Marked as Used' :
                      markItemAsUsedError ? 'Mark Item as Used Error' :
                        isCurrentMarkItemAsUsedProcessing ? 'Processing Mark as Used' :
                          isCurrentMarkItemAsUsedPending ? 'Auto-Mark Timer' :
                            'Quick Actions'}
                  </h4>
                  <p className={`text-sm ${markItemAsUsedSuccess ? 'text-success-700' :
                    markItemAsUsedError ? 'text-danger-700' :
                      isCurrentMarkItemAsUsedProcessing ? 'text-primary-700' :
                        isCurrentMarkItemAsUsedPending ? 'text-warning-700' :
                          'text-warning-700'
                    }`}>
                    {markItemAsUsedSuccess ? 'The inventory item has been marked as used and the warehouse inventory has been updated.' :
                      markItemAsUsedError ? markItemAsUsedError :
                        isCurrentMarkItemAsUsedProcessing ? 'Please wait while we mark the item as used...' :
                          isCurrentMarkItemAsUsedPending ? `Auto-marking in ${autoTimeRemaining} seconds` :
                            `Mark ${itemParam ? 'specific item' : groupParam ? 'item from group' : 'an item'} as used from warehouse inventory`
                    }
                  </p>


                  {/* Show what will be marked */}
                  {!markItemAsUsedSuccess && !markItemAsUsedError && (itemParam || groupParam) && (
                    <p className="text-xs text-default-500 mt-1">
                      Target: {itemParam ? `Item ${itemParam}` : `Group ${groupParam}`}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Success Actions */}
                {markItemAsUsedSuccess && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-success-100 rounded-full">
                      <Icon icon="mdi:check" className="text-success w-6 h-6" />
                    </div>
                    <Button
                      color="success"
                      variant="flat"
                      startContent={<Icon icon="mdi:refresh" />}
                      onPress={() => {
                        setMarkItemAsUsedSuccess(false);
                        setMarkItemAsUsedError(null);
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
                {markItemAsUsedError && !isCurrentMarkItemAsUsedProcessing && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-danger-100 rounded-full">
                      <Icon icon="mdi:close" className="text-danger w-6 h-6" />
                    </div>
                    <Button
                      color="danger"
                      variant="flat"
                      startContent={<Icon icon="mdi:close" />}
                      onPress={() => {
                        setMarkItemAsUsedError(null);
                        setMarkItemAsUsedSuccess(false);
                      }}
                      size="sm"
                    >
                      Dismiss
                    </Button>
                  </div>
                )}

                {/* Timer Progress Indicator */}
                {isCurrentMarkItemAsUsedPending && (
                  <div className="flex items-center gap-3 flex-wrap justify-end">
                    <Button
                      color="danger"
                      variant="shadow"
                      startContent={<Icon icon="mdi:close" />}
                      onPress={cancelMarkItemAsUsed}
                      size="sm"
                    >
                      Cancel
                    </Button>

                    <Button
                      color="warning"
                      variant="shadow"
                      startContent={<Icon icon="mdi:check" />}
                      onPress={() => {
                        cancelMarkItemAsUsed();
                        if (pendingMarkItemAsUsed) {
                          handleMarkItemAsUsedAction(
                            pendingMarkItemAsUsed.resultItem,
                            pendingMarkItemAsUsed.userToUse,
                            pendingMarkItemAsUsed.inventoryItemUuid,
                            pendingMarkItemAsUsed.isGroup
                          );
                        }
                      }}
                      size="sm"
                    >
                      Mark Now
                    </Button>
                  </div>
                )}

                {/* Processing Spinner */}
                {isCurrentMarkItemAsUsedProcessing && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-12 h-12 bg-primary-100 rounded-full">
                      <Spinner size="md" color="primary" />
                    </div>
                    <span className="text-sm text-primary-700">Processing...</span>
                  </div>
                )}

                {/* Normal Mark as Used Button */}
                {!isCurrentMarkItemAsUsedPending && !isCurrentMarkItemAsUsedProcessing && !markItemAsUsedSuccess && !markItemAsUsedError && (
                  <Button
                    color="warning"
                    variant="shadow"
                    startContent={<Icon icon="mdi:package-minus" />}
                    onPress={() => handleMarkItemAsUsedAction(selectedResult, undefined, itemParam || groupParam || null, !!groupParam)}
                  >
                    {itemParam ? 'Mark Item as Used' : groupParam ? 'Mark Group as Used' : 'Mark as Used'}
                  </Button>
                )}
              </div>
            </div>

            {/* Enhanced Progress Bar for Timer */}
            {isCurrentMarkItemAsUsedPending && (
              <div className="mt-4 space-y-2">
                <div className="relative w-full bg-warning-200 rounded-full h-3 overflow-hidden shadow-inner">
                  <div
                    className="bg-gradient-to-r from-warning-400 to-warning-600 h-3 rounded-full transition-all duration-100 ease-linear shadow-sm"
                    style={{ width: `${autoProgress}%` }}
                  />
                  <div
                    className="absolute top-0 h-3 w-8 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full transition-all duration-100 ease-linear"
                    style={{
                      left: `${Math.max(0, autoProgress - 8)}%`,
                      opacity: autoProgress > 0 && autoProgress < 100 ? 1 : 0
                    }}
                  />
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    ) : null;

    console.log("Rendering component for entity type:", entity_type, "UUID:", entity_uuid);
    // Render the appropriate component based on entity type

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
              />
            </div>
          </motion.div>
        );

      // Enhanced new_warehouse_inventory case with delivery parameter support
      case 'new_warehouse_inventory':
        return (
          <motion.div key="new-warehouse-inventory-component" {...motionTransition}>
            {newWarehouseInventoryAcceptButton}
            <div className={`${isDisabled ? 'opacity-50 pointer-events-none blur-sm scale-95 origin-top' : ''} transition-all duration-200`}>
              <div className="space-y-4">
                <Card className="bg-gradient-to-br from-warning-50 to-warning-50 border border-warning-200 shadow-lg shadow-warning-200/30">
                  <CardBody className="p-4">
                    <div className="flex items-center gap-3">
                      <Icon icon="mdi:truck-delivery" className="text-warning-600 w-6 h-6" />
                      <div>
                        <h4 className="font-semibold text-warning-900">New Warehouse Inventory</h4>
                        <p className="text-sm text-warning-700">
                          This delivery contains new inventory items ready to be accepted into the warehouse.
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                {/* Use delivery UUID from entity_data or URL parameter */}
                {(selectedResult.entity_data?.delivery_uuid || selectedResult.entity_uuid) && (
                  <DeliveryComponent
                    deliveryId={selectedResult.entity_data?.delivery_uuid || selectedResult.entity_uuid}
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
            {markItemAsUsedButton}
            <div className={`${isDisabled ? 'opacity-50 pointer-events-none blur-sm scale-95 origin-top' : ''} transition-all duration-200`}>
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