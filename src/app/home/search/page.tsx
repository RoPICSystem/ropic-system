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

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false); // Track if we've performed a search

  // Component data states
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [inventories, setInventories] = useState<any[]>([]);

  // Load user and initial data
  useEffect(() => {
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

        // Check for query parameter
        const query = searchParams.get("q");
        if (query) {
          setSearchQuery(query);
          await performSearch(query, userData);
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

  const performSearch = async (query: string, userData?: any) => {
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

        // If there's exactly one result, select it automatically
        // Otherwise, show the results list
        if (result.data.length === 1) {
          setSelectedResult(result.data[0]);
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

  const handleSearch = async () => {
    const currentQuery = searchParams.get("q");
    if (currentQuery === searchQuery.trim()) {
      return; // No change in search query
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSelectedResult(null);
      setHasSearched(false);
      setError(null);
      router.push('/home/search');
      return;
    }

    // Update URL with search query
    router.push(`/home/search?q=${encodeURIComponent(searchQuery.trim())}`);
    await performSearch(searchQuery.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleResultSelect = (result: any) => {
    setSelectedResult(result);
  };

  const renderSearchResults = () => {
    // Only show results list if we have multiple results and no result is selected
    if (!hasSearched || selectedResult || searchResults.length <= 1) return null;

    return (
      <motion.div key="search-results" {...motionTransition}>
        <Card className="bg-background">
          <CardHeader>
            <h3 className="text-lg font-semibold">Search Results ({searchResults.length})</h3>
          </CardHeader>
          <Divider />
          <CardBody className="max-h-96 overflow-auto">
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
                          "mdi:help-circle"
                        }
                        className="text-primary w-5 h-5"
                      />
                      <div>
                        <p className="font-medium">{result.entity_name}</p>
                        <p className="text-sm text-default-500 capitalize">
                          {result.entity_type.replace('_', ' ')} • Matched: {result.matched_property}
                        </p>
                      </div>
                    </div>
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

    switch (entity_type) {
      case 'delivery':
        return (
          <motion.div key="delivery-component" {...motionTransition}>
            <DeliveryComponent
              deliveryId={entity_uuid}
              user={user}
              warehouses={warehouses}
              operators={operators}
              inventories={inventories}
              readOnlyMode={true}
            />
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
            <InventoryItemComponent
              inventoryId={entity_uuid}
              user={user}
              readOnlyMode={true}
            />
          </motion.div>
        );

      case 'warehouse_inventory':
      case 'warehouse_inventory_item':
        return (
          <motion.div key="warehouse-inventory-component" {...motionTransition}>
            <WarehouseInventoryComponent
              inventoryId={entity_uuid}
              user={user}
              warehouses={warehouses}
              inventories={inventories}
              readOnlyMode={true} 
              handleViewWarehouse={null} 
              handleViewInventory={null}
            />
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

  const inputStyle = {
    inputWrapper: "bg-default-100 border-2 border-default-200 hover:border-default-300 focus-within:!border-primary-500 !cursor-text",
    input: "text-default-500",
    label: "text-default-600"
  };

  return (
    <div className="container mx-auto p-2 max-w-5xl">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <motion.div {...motionTransitionScale} className="flex flex-col gap-4">
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

          {/* Search Bar */}
          <CardList>
            <div className="flex gap-3 items-center w-full relative">
              <Input
                placeholder="Enter UUID, name, code, or any searchable term..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isSearching}
                onKeyPress={handleKeyPress}
                classNames={{
                  inputWrapper: "bg-default-100 border-2 border-default-200 hover:border-default-300 focus-within:!border-primary-500 !cursor-text rounded-lg pr-24",
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
                className="rounded-lg absolute right-2 -translate-y-1/2 top-1/2 z-10"
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
                <CardBody className="p-6">
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
                onPress={() => setSelectedResult(null)}
                startContent={<Icon icon="mdi:arrow-left" />}
              >
                Back to Search Results
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}