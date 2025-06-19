'use client';

import CardList from "@/components/card-list";
import CustomScrollbar from "@/components/custom-scrollbar";
import LoadingAnimation from '@/components/loading-animation';
import { SearchListPanel } from "@/components/search-list-panel/search-list-panel";
import { motionTransition } from "@/utils/anim";
import { createClient } from "@/utils/supabase/client";
import { getUserFromCookies } from '@/utils/supabase/server/user';
import { formatDate, formatNumber } from "@/utils/tools";
import {
  Button,
  Chip,
  Skeleton,
  Spinner
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { getWarehouseItemByInventory } from "./actions";
import { WarehouseInventoryComponent } from "./warehouse-inventory-component";
import { getWarehouses } from "../warehouses/actions";

export default function WarehouseItemsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [inventories, setInventories] = useState<any[]>([]);

  // Handle select item
  const handleSelectItem = (itemId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("warehouseItemId", itemId);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle view inventory details
  const handleViewInventory = () => {
    if (selectedItemId) {
      router.push(`/home/inventory?itemId=${selectedItemId}`);
    }
  };

  const handleViewWarehouse = () => {
    if (selectedItemId) {
      router.push(`/home/warehouses?warehouseId=${selectedItemId}`);
    }
  };

  // Handle URL params
  useEffect(() => {
    const warehouseItemId = searchParams.get("warehouseItemId");
    const inventoryItemId = searchParams.get("itemId");

    if (warehouseItemId) {
      setSelectedItemId(warehouseItemId);
    } else if (inventoryItemId) {
      // Handle navigation from inventory page
      const fetchFromInventory = async () => {
        const result = await getWarehouseItemByInventory(inventoryItemId);
        if (result.success && result.data) {
          setSelectedItemId(result.data.uuid);

          // Update URL
          const params = new URLSearchParams(searchParams.toString());
          params.delete("itemId");
          params.set("warehouseItemId", result.data.uuid);
          router.push(`?${params.toString()}`, { scroll: false });
        }
      };
      fetchFromInventory();
    } else {
      setSelectedItemId(null);
    }
  }, [searchParams, router]);

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

        // Load warehouses
        const warehousesResult = await getWarehouses(userData.company_uuid);
        if (warehousesResult.success) {
          setWarehouses(warehousesResult.data || []);
        }

        // For now, inventories can be empty array since it's not used in the component
        setInventories([]);

      } catch (error) {
        console.error("Error initializing page:", error);
      }
    };

    initPage();
  }, []);

  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Warehouse Inventory</h1>
            <p className="text-default-500">View and manage items stored in your warehouses.</p>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-4">
          {/* Left side: Warehouse Inventory List */}
          <SearchListPanel
            title="Warehouse Inventory"
            tableName="warehouse_inventory"
            searchPlaceholder="Search warehouse inventory..."
            searchLimit={10}
            dateFilters={["weekFilter", "specificDate"]}
            companyUuid={user?.company_uuid}
            renderItem={(warehouseItem) => (
              <Button
                key={warehouseItem.uuid}
                onPress={() => handleSelectItem(warehouseItem.uuid || "")}
                variant="shadow"
                className={`w-full !transition-all duration-300 rounded-2xl p-0 group overflow-hidden
                  ${warehouseItem.description ? 'min-h-[9.5rem]' : 'min-h-[7rem]'}
                  ${selectedItemId === warehouseItem.uuid ?
                    '!bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500 !shadow-xl hover:!shadow-2xl !shadow-primary-300/50 border-2 border-primary-300/30' :
                    '!bg-gradient-to-br from-background to-default-50 hover:from-default-50 hover:to-default-100 !shadow-lg hover:!shadow-xl !shadow-default-300/30 border-2 border-default-200/50 hover:border-default-300/50'}`}
              >
                <div className="w-full flex flex-col h-full relative">
                  {/* Background pattern */}
                  <div className={`absolute inset-0 opacity-5 ${selectedItemId === warehouseItem.uuid ? 'bg-white' : 'bg-primary-500'}`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,_var(--tw-gradient-stops))] from-current via-transparent to-transparent"></div>
                  </div>

                  {/* Item details */}
                  <div className="flex-grow flex flex-col justify-center px-4 relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 text-left">
                        <span className={`font-bold text-lg leading-tight block truncate text-left
                                ${selectedItemId === warehouseItem.uuid ? 'text-primary-50' : 'text-default-800'}`}>
                          {warehouseItem.name}
                        </span>
                        {warehouseItem.description && (
                          <div className={`w-full mt-2 text-sm leading-relaxed text-left break-words whitespace-normal
                            ${selectedItemId === warehouseItem.uuid ? 'text-primary-100' : 'text-default-600'}`}
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              lineHeight: '1.3'
                            }}>
                            {warehouseItem.description}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 self-start">
                        <Chip
                          color={selectedItemId === warehouseItem.uuid ? "default" : "primary"}
                          variant="shadow"
                          size="sm"
                          className={`font-semibold ${selectedItemId === warehouseItem.uuid ? 'bg-primary-50 text-primary-600' : ''}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:package-variant" width={14} height={14} />
                            {warehouseItem.count?.total || 0} item{(warehouseItem.count?.total || 0) !== 1 ? 's' : ''}
                          </div>
                        </Chip>
                      </div>
                    </div>
                  </div>

                  {/* Item metadata */}
                  <div className={`flex items-center gap-2 backdrop-blur-sm rounded-b-2xl border-t relative z-10 justify-start
                  ${selectedItemId === warehouseItem.uuid ?
                      'border-primary-300/30 bg-primary-700/20' :
                      'border-default-200/50 bg-default-100/50'} p-4`}>
                    <CustomScrollbar
                      direction="horizontal"
                      hideScrollbars
                      gradualOpacity
                      className="flex items-center gap-2">

                      <Chip
                        color={selectedItemId === warehouseItem.uuid ? "default" : "secondary"}
                        variant="flat"
                        size="sm"
                        className={`font-medium ${selectedItemId === warehouseItem.uuid ? 'bg-primary-100/80 text-primary-700 border-primary-200/60' : 'bg-secondary-100/80'}`}
                      >
                        <div className="flex items-center gap-1">
                          <Icon icon="mdi:calendar" width={12} height={12} />
                          {formatDate(warehouseItem.created_at.toString())}
                        </div>
                      </Chip>

                      {warehouseItem.warehouse_name && (
                        <Chip
                          color="warning"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedItemId === warehouseItem.uuid ? 'bg-warning-100/80 text-warning-700 border-warning-200/60' : 'bg-warning-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:warehouse" width={12} height={12} />
                            {warehouseItem.warehouse_name}
                          </div>
                        </Chip>
                      )}

                      {warehouseItem.unit_values?.available > 0 && (
                        <Chip
                          color="success"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedItemId === warehouseItem.uuid ? 'bg-success-100/80 text-success-700 border-success-200/60' : 'bg-success-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:check-circle" width={12} height={12} />
                            {formatNumber(warehouseItem.unit_values.available)} {warehouseItem.standard_unit} available
                          </div>
                        </Chip>
                      )}

                      {warehouseItem.count?.total > 0 && (
                        <Chip
                          color="primary"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedItemId === warehouseItem.uuid ? 'bg-primary-100/80 text-primary-700 border-primary-200/60' : 'bg-primary-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:package-variant" width={12} height={12} />
                            {warehouseItem.count.total} {warehouseItem.count.total === 1 ? 'item' : 'items'}
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
                  No warehouse inventory items found
                </p>
              </>
            )}
            onItemSelect={handleSelectItem}
            supabaseFunction="get_warehouse_inventory_filtered"
            className={`xl:w-1/3 shadow-xl shadow-primary/10 
                      xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
                      xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
                      border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
          />

          {/* Right side: Warehouse Inventory Component */}
          <div className="xl:w-2/3 overflow-hidden">
            <LoadingAnimation
              condition={selectedItemId === null}
              skeleton={
                <div className="flex flex-col h-full shadow-xl shadow-primary/10 bg-background p-12 py-24 rounded-2xl rounded-2xl p-6 items-center justify-center gap-4">
                  <Icon icon="mdi:package-variant" className="mx-auto mb-4 opacity-50" width={64} height={64} />
                  <p className="text-lg">Select a warehouse item to view details</p>
                </div>
              }
            >
              <WarehouseInventoryComponent
                inventoryId={selectedItemId}
                user={user}
                warehouses={warehouses}
                inventories={inventories}
                handleViewWarehouse={handleViewWarehouse}
                handleViewInventory={handleViewInventory}
                readOnlyMode={false}
              />
            </LoadingAnimation>
          </div>
        </div>
      </div>
    </motion.div>
  );
}