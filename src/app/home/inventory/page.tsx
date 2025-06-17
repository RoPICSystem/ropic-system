'use client';

import { FilterOption, SearchListPanel } from "@/components/search-list-panel/search-list-panel";
import { motionTransition } from "@/utils/anim";
import { getUserFromCookies } from '@/utils/supabase/server/user';
import { showErrorToast } from "@/utils/tools";
import { Button, Skeleton } from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from "react";

import { formatDate, formatNumber } from "@/utils/tools";
import CustomScrollbar from "@/components/custom-scrollbar";
import { Chip } from "@heroui/react";
import { InventoryComponent } from "./inventory-component";

export default function InventoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const handleNewItem = () => {
    setSelectedItemId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("itemId");
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleSelectItem = (itemId: string) => {
    setSelectedItemId(itemId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("itemId", itemId);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleInventoryUpdate = (inventoryId: string) => {
    if (inventoryId) {
      setSelectedItemId(inventoryId);
      const params = new URLSearchParams(searchParams.toString());
      params.set("itemId", inventoryId);
      router.push(`?${params.toString()}`, { scroll: false });
    } else {
      // Reset to new item mode
      setSelectedItemId(null);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("itemId");
      router.push(`?${params.toString()}`, { scroll: false });
    }
  };


  const handleErrors = (errors: Record<string, string>) => {
    // Handle errors from the component
    const errorMessages = Object.values(errors);
    if (errorMessages.length > 0) {
      showErrorToast("Validation Error", errorMessages[0]);
    }
  };

  // Initialize page data
  useEffect(() => {
    const initPage = async () => {
      try {
        const userData = await getUserFromCookies();
        if (userData === null) {
          setError('User not found');
          return;
        }
        setUser(userData);
      } catch (error) {
        console.error("Error initializing page:", error);
        setError("Failed to load inventory data");
      }
    };

    initPage();
  }, []);

  // Check URL for itemId param on load
  useEffect(() => {
    const itemId = searchParams.get("itemId");
    if (itemId) {
      setSelectedItemId(itemId);
    } else {
      setSelectedItemId(null);
    }
  }, [searchParams]);

  // Error handling for loading states
  useEffect(() => {
    if (error) {
      showErrorToast("Error", error);
      setError(null);
    }
  }, [error]);

  const inventoryFilters: Record<string, FilterOption> = {
    status_filter: {
      name: "Status",
      valueName: "status",
      color: "primary",
      filters: {
        "": "All Statuses",
        AVAILABLE: "Available",
        WARNING: "Warning",
        CRITICAL: "In Transit",
        OUT_OF_STOCK: "Out of Stock"
      }
    }
  };


  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Inventory Management</h1>
            <p className="text-default-500">Manage your inventory items efficiently.</p>
          </div>
          <div className="flex gap-4 xl:mt-0 mt-4 text-center">
            <Button
              color="primary"
              variant="shadow"
              isDisabled={!user}
              startContent={<Icon icon="mdi:plus" />}
              onPress={handleNewItem}
            >
              New Item
            </Button>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-4">
          {/* Left side: Item List */}
          <SearchListPanel
            title="Inventory Items"
            tableName="inventory"
            searchPlaceholder="Search inventory..."
            searchLimit={10}
            dateFilters={["weekFilter", "specificDate"]}
            companyUuid={user?.company_uuid}
            filters={inventoryFilters}
            renderItem={(inventory) => (
              <Button
                key={inventory.uuid}
                onPress={() => handleSelectItem(inventory.uuid || "")}
                variant="shadow"
                className={`w-full !transition-all duration-300 rounded-2xl p-0 group overflow-hidden
                  ${inventory.description ? 'min-h-[9.5rem]' : 'min-h-[7rem]'}
                  ${selectedItemId === inventory.uuid ?
                    '!bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500 !shadow-xl hover:!shadow-2xl !shadow-primary-300/50 border-2 border-primary-300/30' :
                    '!bg-gradient-to-br from-background to-default-50 hover:from-default-50 hover:to-default-100 !shadow-lg hover:!shadow-xl !shadow-default-300/30 border-2 border-default-200/50 hover:border-default-300/50'}`}
              >
                <div className="w-full flex flex-col h-full relative">
                  {/* Background pattern */}
                  <div className={`absolute inset-0 opacity-5 ${selectedItemId === inventory.uuid ? 'bg-white' : 'bg-primary-500'}`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,_var(--tw-gradient-stops))] from-current via-transparent to-transparent"></div>
                  </div>

                  {/* Item details */}
                  <div className="flex-grow flex flex-col justify-center px-4 relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 text-left">
                        <span className={`font-bold text-lg leading-tight block truncate text-left
                                ${selectedItemId === inventory.uuid ? 'text-primary-50' : 'text-default-800'}`}>
                          {inventory.name}
                        </span>
                        {inventory.description && (
                          <div className={`w-full mt-2 text-sm leading-relaxed text-left break-words whitespace-normal
                            ${selectedItemId === inventory.uuid ? 'text-primary-100' : 'text-default-600'}`}
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              lineHeight: '1.3'
                            }}>
                            {inventory.description}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 self-start">
                        <Chip
                          color={selectedItemId === inventory.uuid ? "default" : "primary"}
                          variant="shadow"
                          size="sm"
                          className={`font-semibold ${selectedItemId === inventory.uuid ? 'bg-primary-50 text-primary-600' : ''}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:package-variant" width={14} height={14} />
                            {inventory.count?.total || 0} item{(inventory.count?.total || 0) !== 1 ? 's' : ''}
                          </div>
                        </Chip>
                      </div>
                    </div>
                  </div>

                  {/* Item metadata */}
                  <div className={`flex items-center gap-2 backdrop-blur-sm rounded-b-2xl border-t relative z-10 justify-start
                  ${selectedItemId === inventory.uuid ?
                      'border-primary-300/30 bg-primary-700/20' :
                      'border-default-200/50 bg-default-100/50'} p-4`}>
                    <CustomScrollbar
                      direction="horizontal"
                      hideScrollbars
                      gradualOpacity
                      className="flex items-center gap-2">

                      <Chip
                        color={selectedItemId === inventory.uuid ? "default" : "secondary"}
                        variant="flat"
                        size="sm"
                        className={`font-medium ${selectedItemId === inventory.uuid ? 'bg-primary-100/80 text-primary-700 border-primary-200/60' : 'bg-secondary-100/80'}`}
                      >
                        <div className="flex items-center gap-1">
                          <Icon icon="mdi:calendar" width={12} height={12} />
                          {formatDate(inventory.created_at.toString())}
                        </div>
                      </Chip>

                      {inventory.unit_values?.available > 0 && (
                        <Chip
                          color="success"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedItemId === inventory.uuid ? 'bg-success-100/80 text-success-700 border-success-200/60' : 'bg-success-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:check-circle" width={12} height={12} />
                            {formatNumber(inventory.unit_values.available)} {inventory.standard_unit} available
                          </div>
                        </Chip>
                      )}

                      {inventory.unit_values?.warehouse > 0 && (
                        <Chip
                          color="warning"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedItemId === inventory.uuid ? 'bg-warning-100/80 text-warning-700 border-warning-200/60' : 'bg-warning-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:warehouse" width={12} height={12} />
                            {formatNumber(inventory.unit_values.warehouse)} {inventory.standard_unit} in warehouse
                          </div>
                        </Chip>
                      )}

                      {inventory.count?.available > 0 && (
                        <Chip
                          color="primary"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedItemId === inventory.uuid ? 'bg-primary-100/80 text-primary-700 border-primary-200/60' : 'bg-primary-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:package" width={12} height={12} />
                            {formatNumber(inventory.count.available)} {inventory.count.available === 1 ? 'item' : 'items'} available
                          </div>
                        </Chip>
                      )}
                    </CustomScrollbar>
                  </div>

                  {/* Hover effect overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                </div>
              </Button>
            )}
            renderSkeletonItem={(i) => (
              <Skeleton key={i} className="w-full min-h-[8.5rem] rounded-xl" />
            )}
            renderEmptyCard={(
              <>
                <Icon icon="mdi:package-variant" className="text-5xl text-default-300" />
                <p className="text-default-500 mt-2 mx-8 text-center">
                  No inventory items found
                </p>
                <Button
                  color="primary"
                  variant="flat"
                  size="sm"
                  className="mt-4"
                  onPress={handleNewItem}
                  startContent={<Icon icon="mdi:plus" className="text-default-500" />}>
                  Create Inventory
                </Button>
              </>
            )}
            onItemSelect={handleSelectItem}
            supabaseFunction="get_inventory_filtered"
            className={`xl:w-1/3 shadow-xl shadow-primary/10 
                      xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
                      xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
                      border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
          />

          {/* Right side: Inventory Component */}
          <div className="xl:w-2/3 overflow-hidden">
            <InventoryComponent
              inventoryId={selectedItemId}
              user={user}
              onInventoryUpdate={handleInventoryUpdate}
              onErrors={handleErrors}
              allowStatusUpdates={true}
              readOnlyMode={false}
              initialFormData={{}}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}