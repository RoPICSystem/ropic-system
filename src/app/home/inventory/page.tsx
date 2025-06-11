'use client';

import CardList from "@/components/card-list";
import CustomProperties from "@/components/custom-properties";
import CustomScrollbar from "@/components/custom-scrollbar";
import ListLoadingAnimation from "@/components/list-loading-animation";
import LoadingAnimation from '@/components/loading-animation';
import { motionTransition, motionTransitionScale } from "@/utils/anim";
import { getMeasurementUnitOptions, getPackagingUnitOptions, getUnitFullName, getUnitOptions } from "@/utils/measurements";
import { createClient } from "@/utils/supabase/client";
import { getUserFromCookies } from '@/utils/supabase/server/user';
import { copyToClipboard, formatDate, formatNumber } from "@/utils/tools";
import {
  Accordion,
  AccordionItem,
  Alert,
  Autocomplete,
  AutocompleteItem,
  Button,
  Chip,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Spinner,
  Textarea,
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from "react";
import {
  createInventoryItem,
  deleteInventoryItem,
  getInventoryItem,
  getInventoryItems,
  Inventory,
  InventoryItem,
  updateInventoryItem
} from './actions';


export default function InventoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [measurementUnitOptions, setMeasurementUnitOptions] = useState<string[]>([]);
  const [packagingUnitOptions, setPackagingUnitOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Inventory list state
  const [inventoryItems, setInventoryItems] = useState<(Partial<Inventory> & { inventory_items_length: number })[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  // Bulk items state
  const [bulkItems, setBulkItems] = useState<(Partial<InventoryItem> & { id: number, isNew?: boolean, groupId?: string })[]>([]);
  const [nextBulkId, setNextBulkId] = useState(1);

  // Delete confirmation
  const deleteModal = useDisclosure();
  const [itemToDelete, setItemToDelete] = useState<{ type: 'item' | 'bulk', id: string | number }>();

  const [originalBulkItems, setOriginalBulkItems] = useState<(Partial<InventoryItem> & { id: number })[]>([]);

  // Duplication state
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [duplicatePopoverOpen, setDuplicatePopoverOpen] = useState(false);
  const [itemToDuplicate, setItemToDuplicate] = useState<{ type: 'bulk', id: number }>();

  // Add these state variables after other state declarations
  const [expandedBulks, setExpandedBulks] = useState<Set<string>>(new Set());

  // Add these new state variables after other state declarationsconst [groupView, setGroupView] = useState(true); // 3. Toggle for group/flat view
  const [groupView, setGroupView] = useState(true); // 3. Toggle for group/flat view
  const [groupIdCounter, setGroupIdCounter] = useState(1);
  const [duplicatedGroups, setDuplicatedGroups] = useState<Set<string>>(new Set()); // 4. Track duplicated group IDs

  const [adjustGroupPopoverOpen, setAdjustGroupPopoverOpen] = useState(false);
  const [groupToAdjust, setGroupToAdjust] = useState<{ groupKey: string, currentCount: number }>();
  const [newGroupCount, setNewGroupCount] = useState(1);

  const defaultMeasurementUnit = "length";
  const defaultPackagingUnit = "roll";
  const defaultUnit = "m";
  const [showMergeWarning, setShowMergeWarning] = useState(false);

  // Form state
  const [inventoryForm, setInventoryForm] = useState<{
    uuid?: string;
    name: string;
    description: string;
    measurement_unit: string;
    company_uuid: string;
    properties?: Record<string, any>;
  }>({
    name: "",
    description: "",
    measurement_unit: defaultMeasurementUnit,
    company_uuid: "",
    properties: {}
  });

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  const autoCompleteStyle = { classNames: inputStyle };

  const generateGroupId = () => `group-${Date.now()}-${groupIdCounter}`;

  // Helper function to generate group key based on bulk item properties
  const generateGroupKey = (bulk: Partial<InventoryItem> & { id: number, groupId?: string }) => {
    if (groupView && bulk.groupId) return bulk.groupId;
    return `${bulk.item_code || ''}-${bulk.unit || ''}-${bulk.unit_value || 0}-${bulk.packaging_unit || ''}-${bulk.cost || 0}-${JSON.stringify(bulk.properties || {})}`;
  };

  // Helper function to check if items belong to the same group
  const getGroupInfo = (bulk: Partial<InventoryItem> & { id: number, groupId?: string }) => {
    const groupKey = generateGroupKey(bulk);
    const sameGroupItems = bulkItems.filter(item =>
      generateGroupKey(item) === groupKey && item.isNew
    );

    if (groupView && sameGroupItems.length > 1) {
      const groupIndex = sameGroupItems.findIndex(item => item.id === bulk.id);
      // Get all unique group keys up to this point to determine group number
      const uniqueGroupKeys = new Set();
      let currentGroupNumber = 1;

      for (const item of bulkItems) {
        const itemGroupKey = generateGroupKey(item);
        if (!uniqueGroupKeys.has(itemGroupKey) &&
          bulkItems.filter(b => generateGroupKey(b) === itemGroupKey && b.isNew).length > 1) {
          if (itemGroupKey === groupKey) {
            break;
          }
          currentGroupNumber++;
          uniqueGroupKeys.add(itemGroupKey);
        }
      }

      return {
        isGroup: true,
        groupKey,
        groupSize: sameGroupItems.length,
        isFirstInGroup: groupIndex === 0,
        groupNumber: currentGroupNumber,
        groupId: bulk.groupId
      };
    }

    return { isGroup: false, groupKey, groupSize: 1, isFirstInGroup: true, groupId: bulk.groupId };
  };

  const getItemDisplayNumber = (bulk: Partial<InventoryItem> & { id: number }) => {
    const nonGroupItems = bulkItems.filter(item => {
      const itemGroupInfo = getGroupInfo(item);
      return !itemGroupInfo.isGroup || (itemGroupInfo.isGroup && itemGroupInfo.isFirstInGroup);
    });

    return nonGroupItems.findIndex(item => item.id === bulk.id) + 1;
  };


  const fetchItemDetails = async (itemId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getInventoryItem(itemId);

      if (result.success && result.data) {
        const item = result.data;

        setInventoryForm({
          uuid: item.uuid,
          name: item.name,
          description: item.description || "",
          measurement_unit: item.measurement_unit || "",
          company_uuid: item.company_uuid,
          properties: item.properties || {}
        });

        const bulks = item.inventory_item_bulks || [];
        const newBulkItems = bulks.map((bulk: any, index: number) => ({
          ...bulk,
          id: index + 1,
        }));

        setBulkItems(newBulkItems);
        setNextBulkId(newBulkItems.length + 1);

        // Store original bulk items for deletion tracking
        setOriginalBulkItems(newBulkItems.map((bulk: { id: any; }) => ({
          ...bulk,
          id: bulk.id // Keep the same ID structure
        })));

        // Set expanded states to first items
        if (newBulkItems.length > 0) {
          setExpandedBulks(new Set([`${newBulkItems[0].id}`]));
        }

      } else {
        setError("Failed to load item details");
      }
    } catch (err) {
      setError("An error occurred while loading item details");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const isBulkEditable = (bulk: any) => {
    return !bulk.status || bulk.status === "AVAILABLE";
  };

  const handleNewItem = () => {
    setSelectedItemId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("itemId");
    router.push(`?${params.toString()}`, { scroll: false });
    resetForm();
  };

  const handleSelectItem = (itemId: string) => {
    setSelectedItemId(itemId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("itemId", itemId);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle search with pagination
  const handleSearch = async (query: string, currentPage: number = page) => {
    setSearchQuery(query);
    setIsLoadingItems(true);

    try {
      if (user?.company_uuid) {
        // Calculate offset based on current page and rows per page
        const offset = (currentPage - 1) * rowsPerPage;

        const result = await getInventoryItems(
          user.company_uuid,
          query,
          null, // status
          null, // year
          null, // month
          null, // week
          null, // day
          rowsPerPage, // limit
          offset // offset
        );

        setInventoryItems(result.data || []);
        setTotalPages(result.totalPages || 1);
        setTotalItems(result.totalCount || 0);
      }
    } catch (error) {
      console.error("Error searching inventory items:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Function to handle page changes
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    handleSearch(searchQuery, newPage);
  };

  // Add handler for inventory form properties
  const handleInventoryPropertiesChange = (properties: Record<string, any>) => {
    setInventoryForm(prev => ({ ...prev, properties }));
  };

  // Add handler for bulk properties
  const handleBulkPropertiesChange = (bulkId: number, properties: Record<string, any>) => {
    setBulkItems(prev => prev.map(bulk =>
      bulk.id === bulkId ? { ...bulk, properties } : bulk
    ));
  };

  // Add inherit functions
  const handleInheritBulkProperties = (bulkId: number) => {
    const properties = inventoryForm.properties || {};
    handleBulkPropertiesChange(bulkId, properties);
  };

  // Update resetForm to include properties
  const resetForm = () => {
    setInventoryForm({
      name: "",
      description: "",
      measurement_unit: defaultMeasurementUnit,
      company_uuid: user?.company_uuid || "",
      properties: {}
    });
    setUnitOptions(getUnitOptions(defaultMeasurementUnit));
    setBulkItems([]);
    setOriginalBulkItems([]);
    setNextBulkId(1);
  };


  // Modify the handleAddBulk function
  const handleAddBulk = () => {
    const newBulk = {
      id: nextBulkId,
      company_uuid: user?.company_uuid || "",
      unit: defaultUnit,
      unit_value: 0,
      packaging_unit: defaultPackagingUnit,
      cost: 0,
      properties: {},
      isNew: true
    };

    setBulkItems([newBulk, ...bulkItems]);
    setNextBulkId(nextBulkId + 1);
    setExpandedBulks(new Set([`${nextBulkId}`]));
  };

  const handleInventoryFormChange = (field: string, value: any) => {
    if (field === 'measurement_unit') {
      setUnitOptions(getUnitOptions(value));

      // Reset bulk.unit_value when measurement unit changes
      setBulkItems(prev => prev.map(bulk => ({
        ...bulk,
        unit_value: 0, // Reset unit_value for all bulks
        unit: undefined, // Reset unit for all bulks
      })));
    }

    setInventoryForm(prev => {
      return { ...prev, [field]: value };
    });
  };

  // Also update handleDuplicateBulk to add items at the top
  const handleDuplicateBulk = (bulkId: number, count: number) => {
    const bulkToDuplicate = bulkItems.find(b => b.id === bulkId);
    if (!bulkToDuplicate) return;

    const groupInfo = getGroupInfo(bulkToDuplicate);

    let newBulks: typeof bulkItems = [];
    let firstNewBulkId = nextBulkId;

    if (groupView && groupInfo.isGroup && groupInfo.isFirstInGroup) {
      // Duplicate the whole group
      const groupItems = bulkItems.filter(item =>
        generateGroupKey(item) === groupInfo.groupKey && item.isNew
      );
      for (let c = 0; c < count; c++) {
        const newGroupId = generateGroupId();
        for (let i = 0; i < groupItems.length; i++) {
          newBulks.push({
            ...groupItems[i],
            id: nextBulkId + newBulks.length,
            uuid: undefined,
            isNew: true,
            groupId: newGroupId,
          });
        }
        setGroupIdCounter(g => g + 1);
        setDuplicatedGroups(prev => new Set(prev).add(newGroupId));
      }
    } else {
      // Duplicate single item
      for (let i = 0; i < count; i++) {
        newBulks.push({
          ...bulkToDuplicate,
          id: nextBulkId + i,
          uuid: undefined,
          isNew: true
        });
      }
    }

    setBulkItems([...newBulks, ...bulkItems]);
    setNextBulkId(nextBulkId + newBulks.length);
    setExpandedBulks(new Set([`${firstNewBulkId}`]));
  };

  // New function to handle group adjustment
  const handleAdjustGroup = (groupKey: string, newCount: number) => {
    const groupItems = bulkItems.filter(item =>
      generateGroupKey(item) === groupKey && item.isNew
    );

    const currentCount = groupItems.length;

    if (newCount > currentCount) {
      // Add more items to the group
      const itemTemplate = groupItems[0];
      const newBulks: typeof bulkItems = [];

      for (let i = 0; i < (newCount - currentCount); i++) {
        const newBulkId = nextBulkId + i;
        newBulks.push({
          ...itemTemplate,
          id: newBulkId,
          uuid: undefined,
          isNew: true
        });
      }

      // Insert new items after the last item in the group
      const lastGroupItemIndex = bulkItems.findLastIndex(item =>
        generateGroupKey(item) === groupKey && item.isNew
      );

      const updatedBulkItems = [...bulkItems];
      updatedBulkItems.splice(lastGroupItemIndex + 1, 0, ...newBulks);

      setBulkItems(updatedBulkItems);
      setNextBulkId(nextBulkId + (newCount - currentCount));

    } else if (newCount < currentCount) {
      // Remove items from the group (keep the first one, remove others)
      const itemsToKeep = groupItems.slice(0, newCount);
      const itemIdsToKeep = new Set(itemsToKeep.map(item => item.id));

      setBulkItems(bulkItems.filter(item => {
        const itemGroupKey = generateGroupKey(item);
        if (itemGroupKey === groupKey && item.isNew) {
          return itemIdsToKeep.has(item.id);
        }
        return true;
      }));
    }
  };

  const handleBulkChange = (bulkId: number, field: keyof InventoryItem, value: any) => {
    setBulkItems(prev => {
      const changedBulk = prev.find(b => b.id === bulkId);
      if (!changedBulk) return prev;

      const groupInfo = getGroupInfo(changedBulk);

      // 2. If groupView and this is the first in group, update all in group
      if (groupView && groupInfo.isGroup && groupInfo.isFirstInGroup) {
        return prev.map(bulk =>
          generateGroupKey(bulk) === groupInfo.groupKey && bulk.isNew
            ? { ...bulk, [field]: value }
            : bulk
        );
      }

      // Otherwise, only update the single item
      return prev.map(bulk =>
        bulk.id === bulkId ? { ...bulk, [field]: value } : bulk
      );
    });
  };


  const handleDeleteBulk = (bulkId: number) => {
    // Simply remove from state without confirmation
    setBulkItems(bulkItems.filter(b => b.id !== bulkId));

    // Set the expandedBulks to the first bulk in the list
    const firstBulk = bulkItems.find(b => b.id !== bulkId);
    if (firstBulk) {
      setExpandedBulks(new Set([`${firstBulk.id}`]));
    }

    console.log(`List of bulk items after change:`, bulkItems);
  };

  const handleDeleteItem = () => {
    if (!selectedItemId) return;

    setItemToDelete({ type: 'item', id: selectedItemId });
    deleteModal.onOpen();
  };

  const executeDelete = async () => {
    if (!itemToDelete) return;

    setIsLoading(true);

    try {
      let result;

      // Only handle item deletion here, bulk and unit deletions are handled during update
      if (itemToDelete.type === 'item') {
        result = await deleteInventoryItem(itemToDelete.id as string);
        if (result.success) {
          setSelectedItemId(null);
          const params = new URLSearchParams(searchParams.toString());
          params.delete("itemId");
          router.push(`?${params.toString()}`, { scroll: false });
          resetForm();
        }
      }

      if (!result?.success) {
        setError(`Failed to delete ${itemToDelete.type}`);
      }
    } catch (err) {
      setError(`An error occurred while deleting ${itemToDelete.type}`);
      console.error(err);
    } finally {
      setIsLoading(false);
      deleteModal.onClose();
    }
  };

  const validateForm = () => {
    if (!inventoryForm.name) {
      setError("Item name is required");
      return false;
    }

    if (bulkItems.length === 0) {
      setError("At least one bulk item is required");
      return false;
    }


    // Add this in the validateForm function
    for (const bulk of bulkItems) {
      if (!bulk.unit_value && bulk.unit_value !== 0) {
        setError("Unit value is required for all bulks");
        return false;
      }

      if (!bulk.unit) {
        setError("Metric Unit is required for all bulks");
        return false;
      }

      if (!bulk.item_code) {
        setError("Item code is required for all bulks");
        return false;
      }
    }

    return true;
  };

  // Modified handleSubmit function - expand groups before submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setError(null);

    if (duplicatedGroups.size > 0) {
      const unchangedGroups = Array.from(duplicatedGroups).filter(groupId => {
        // Find all items with this groupId
        const groupItems = bulkItems.filter(b => b.groupId === groupId);
        // Compare with other groups: if another group has the same details, warn
        return bulkItems.some(b =>
          b.groupId !== groupId &&
          JSON.stringify(
            groupItems.map(({ item_code, unit, unit_value, packaging_unit, cost, properties }) =>
              ({ item_code, unit, unit_value, packaging_unit, cost, properties })
            )
          ) ===
          JSON.stringify(
            bulkItems.filter(x => x.groupId === b.groupId).map(({ item_code, unit, unit_value, packaging_unit, cost, properties }) =>
              ({ item_code, unit, unit_value, packaging_unit, cost, properties })
            )
          )
        );
      });
      if (unchangedGroups.length > 0) {
        setShowMergeWarning(true);
        return;
      }
    }

    try {
      // Expand groups into individual items for database submission
      const expandedBulkItems = bulkItems.flatMap(bulk => {
        const groupInfo = getGroupInfo(bulk);
        if (groupInfo.isGroup && groupInfo.isFirstInGroup) {
          // For groups, create individual database entries
          const groupItems = bulkItems.filter(item =>
            generateGroupKey(item) === groupInfo.groupKey && item.isNew
          );
          return groupItems.map(item => ({
            ...item,
            // Remove group-specific properties if any
          }));
        } else if (!groupInfo.isGroup) {
          return [bulk];
        }
        return []; // Skip non-first group items as they're already included
      });

      if (selectedItemId) {
        // Update existing item
        const itemUpdates = {
          name: inventoryForm.name,
          description: inventoryForm.description,
          properties: inventoryForm.properties,
        };

        const bulkUpdates = expandedBulkItems
          .filter(bulk => bulk.uuid)
          .map(bulk => ({
            uuid: bulk.uuid as string,
            item_code: bulk.item_code as string,
            unit: bulk.unit as string,
            unit_value: bulk.unit_value as number,
            packaging_unit: bulk.packaging_unit as string,
            cost: bulk.cost as number,
            properties: bulk.properties as Record<string, any>,
          }));

        const newBulks = expandedBulkItems
          .filter(bulk => !bulk.uuid)
          .map(bulk => ({
            company_uuid: user.company_uuid,
            item_code: bulk.item_code as string,
            unit: bulk.unit as string,
            unit_value: bulk.unit_value as number,
            packaging_unit: bulk.packaging_unit as string,
            cost: bulk.cost as number,
            properties: bulk.properties as Record<string, any>,
          }));

        const currentBulkUuids = new Set(expandedBulkItems.map(bulk => bulk.uuid).filter(Boolean));
        const deletedBulks = originalBulkItems
          .filter(bulk => bulk.uuid && !currentBulkUuids.has(bulk.uuid))
          .map(bulk => bulk.uuid as string);

        const result = await updateInventoryItem(
          selectedItemId,
          itemUpdates,
          bulkUpdates,
          newBulks,
          deletedBulks
        );

        if (!result.success) {
          throw new Error(result.error || "Failed to update inventory item");
        }

        await fetchItemDetails(selectedItemId);
      } else {
        // Create new item
        const newItem = {
          company_uuid: user.company_uuid,
          name: inventoryForm.name,
          measurement_unit: inventoryForm.measurement_unit,
          description: inventoryForm.description,
          admin_uuid: user.uuid,
          properties: inventoryForm.properties,
        };

        const newBulks = expandedBulkItems.map(bulk => ({
          company_uuid: user.company_uuid,
          item_code: bulk.item_code as string,
          unit: bulk.unit as string,
          unit_value: bulk.unit_value as number,
          packaging_unit: bulk.packaging_unit as string,
          cost: bulk.cost as number,
          properties: bulk.properties as Record<string, any>,
        }));

        const result = await createInventoryItem(newItem, newBulks);

        if (!result.success) {
          throw new Error(result.error || "Failed to create inventory item");
        }

        if (result.data) {
          setSelectedItemId(result.data.uuid);
          const params = new URLSearchParams(searchParams.toString());
          params.set("itemId", result.data.uuid);
          router.push(`?${params.toString()}`, { scroll: false });
        }
      }
    } catch (err) {
      setError((err as Error).message || "An error occurred");
      console.error(err);
    } finally {
      setIsLoading(false);
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

        setInventoryForm(prev => ({
          ...prev,
          company_uuid: userData.company_uuid
        }));

        setMeasurementUnitOptions(await getMeasurementUnitOptions());
        setPackagingUnitOptions(await getPackagingUnitOptions());

        if (userData.company_uuid) {
          // Use pagination parameters
          const result = await getInventoryItems(
            userData.company_uuid,
            searchQuery,
            null, // status
            null, // year
            null, // month
            null, // week
            null, // day
            rowsPerPage, // limit
            0 // offset for first page
          );

          setInventoryItems(result.data || []);
          setTotalPages(result.totalPages || 1);
          setTotalItems(result.totalCount || 0);
          setIsLoadingItems(false);
        }
      } catch (error) {
        console.error("Error initializing page:", error);
        setError("Failed to load inventory data");
      }
    };

    initPage();

    const defaultView = localStorage.getItem('defaultItemView') || 'grouped';
    setGroupView(defaultView === 'grouped');
  }, []);


  // Initialize page data
  useEffect(() => {

    const handleUserData = async () => {
      setIsLoadingItems(true);

      if (user.company_uuid) {
        const result = await getInventoryItems(user.company_uuid, searchQuery);
        setInventoryItems(result.data || []);
        setIsLoadingItems(false);
      }

      setIsLoadingItems(false);
    }

    if (user) {
      handleUserData();
    }

  }, [user, searchQuery]);

  // Handle real-time updates
  useEffect(() => {
    if (!user?.company_uuid) return;

    const supabase = createClient();

    const channel = supabase
      .channel('inventory-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory',
          filter: `company_uuid=eq.${user.company_uuid}`
        },
        async () => {
          // Use current page and search query when refreshing
          const offset = (page - 1) * rowsPerPage;
          const refreshedItems = await getInventoryItems(
            user.company_uuid,
            searchQuery,
            null, // status
            null, // year
            null, // month
            null, // week
            null, // day
            rowsPerPage,
            offset
          );

          setInventoryItems(refreshedItems.data || []);
          setTotalPages(refreshedItems.totalPages || 1);
          setTotalItems(refreshedItems.totalCount || 0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.company_uuid, searchQuery, page, rowsPerPage]);

  // Load selected item details
  useEffect(() => {
    // Clear form when no item is selected
    if (!selectedItemId) {
      resetForm();
      setIsLoading(false);
      return;
    }

    fetchItemDetails(selectedItemId);
  }, [selectedItemId]);

  // Check URL for itemId param on load
  useEffect(() => {
    const itemId = searchParams.get("itemId");
    if (itemId) setSelectedItemId(itemId);
  }, [searchParams]);


  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Inventory Management</h1>
            {isLoadingItems ? (
              <div className="text-default-500 flex xl:justify-start justify-center items-center">
                <p className='my-auto mr-1'>Loading inventory data</p>
                <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
              </div>
            ) : (
              <p className="text-default-500">Manage your inventory items efficiently.</p>
            )}
          </div>
          <div className="flex gap-4 xl:mt-0 mt-4 text-center">
            <Button
              color="primary"
              variant="shadow"
              isDisabled={!user || isLoadingItems}
              startContent={<Icon icon="mdi:plus" />}
              onPress={handleNewItem}
            >
              New Item
            </Button>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-4">
          {/* Left side: Item List */}
          <div className={`xl:w-1/3 shadow-xl shadow-primary/10
          xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
          xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
          border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
          >
            <div className="flex flex-col h-full">
              <div className="p-4 sticky top-0 z-20 bg-background/80 border-b border-default-200 backdrop-blur-lg shadow-sm">

                <h2 className="text-xl font-semibold mb-4 w-full text-center">Inventory Items</h2>
                <Input
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value, 1)}
                  isClearable
                  onClear={() => handleSearch("", 1)}
                  startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
                />
              </div>
              <div className="h-full absolute w-full">
                <CustomScrollbar
                  scrollShadow
                  scrollShadowTop={false}
                  scrollbarMarginTop="7.25rem"
                  scrollbarMarginBottom="0.5rem"
                  disabled={!user || isLoadingItems}
                  className="space-y-4 p-4 mt-1 pt-32 h-full relative">
                  <ListLoadingAnimation
                    condition={!user || isLoadingItems}
                    containerClassName="space-y-4"
                    skeleton={[...Array(10)].map((_, i) => (
                      <Skeleton key={i} className="w-full min-h-[7.5rem] rounded-xl" />
                    ))}
                  >
                    {inventoryItems.map((item) => (
                      <Button
                        key={item.uuid}
                        onPress={() => handleSelectItem(item.uuid || "")}
                        variant="shadow"
                        className={`w-full min-h-[7.5rem] !transition-all duration-200 rounded-xl p-0 ${selectedItemId === item.uuid ?
                          '!bg-primary hover:!bg-primary-400 !shadow-lg hover:!shadow-md hover:!shadow-primary-200 !shadow-primary-200' :
                          '!bg-default-100/50 shadow-none hover:!bg-default-200 !shadow-2xs hover:!shadow-md hover:!shadow-default-200 !shadow-default-200'}`}
                      >
                        <div className="w-full flex flex-col h-full">
                          <div className="flex-grow flex flex-col justify-center px-3">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">
                                {item.name}
                              </span>
                              <Chip color="default" variant={selectedItemId === item.uuid ? "shadow" : "flat"} size="sm">
                                {item.inventory_items_length || 0} item{item.inventory_items_length !== 1 ? 's' : ''}
                              </Chip>
                            </div>
                            {item.description && (
                              <div className={`w-full mt-1 text-sm ${selectedItemId === item.uuid ? 'text-default-800 ' : 'text-default-600'} text-start text-ellipsis overflow-hidden whitespace-nowrap`}>
                                {item.description}
                              </div>
                            )}
                          </div>

                          {/* Footer - always at the bottom */}
                          <div className={`flex items-center gap-2 border-t ${selectedItemId === item.uuid ? 'border-primary-300' : 'border-default-100'} p-3`}>
                            <Chip
                              color={selectedItemId === item.uuid ? "default" : "primary"}
                              variant={selectedItemId === item.uuid ? "shadow" : "flat"}
                              size="sm"
                            >
                              {formatDate(item.created_at.toString())}
                            </Chip>
                          </div>
                        </div>
                      </Button>
                    ))}
                  </ListLoadingAnimation>
                  {/* Add pagination */}
                  {inventoryItems.length > 0 && (
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
                </CustomScrollbar>

                {/* No items found state */}
                <AnimatePresence>
                  {!isLoadingItems && inventoryItems.length === 0 && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center"
                      {...motionTransitionScale}
                    >
                      <div className="py-4 px-8 w-full flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                        <Icon icon="mdi:package-variant" className="text-5xl text-default-300" />
                        <p className="text-default-500 mt-2">No inventory items found</p>
                        <Button
                          color="primary"
                          variant="flat"
                          size="sm"
                          className="mt-4"
                          onPress={handleNewItem}
                          startContent={<Icon icon="mdi:plus" className="text-default-500" />}>
                          Create Inventory
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>


              </div>
            </div>
          </div>

          {/* Right side: Inventory Form */}
          <div className="xl:w-2/3 overflow-hidden">
            <Form id="inventoryForm" onSubmit={handleSubmit} className="items-stretch space-y-4">
              <CardList>
                <LoadingAnimation
                  condition={isLoading}
                  skeleton={
                    <div className="space-y-4">
                      <Skeleton className="h-6 w-48 rounded-xl mb-4 mx-auto" />
                      <div className="space-y-4">
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <div className="flex items-center justify-between gap-4">
                          <Skeleton className="h-16 w-1/2 rounded-xl" />
                          <Skeleton className="h-16 w-1/2 rounded-xl" />
                        </div>
                        <Skeleton className="h-28 w-full rounded-xl" />
                      </div>

                      <div className="p-4 border-2 border-default-200 rounded-xl bg-default-50">
                        <div className="flex justify-between items-center mb-4">
                          <Skeleton className="h-6 w-32 rounded-full" />
                          <Skeleton className="h-8 w-16 rounded-lg" />
                        </div>
                        <Skeleton className="h-48 w-full rounded-xl bg-transparent" />
                      </div>
                    </div>
                  }>
                  <div>
                    <h2 className="text-xl font-semibold mb-4 w-full text-center">
                      {selectedItemId ? "Edit Inventory Item" : "Create Inventory Item"}
                    </h2>

                    <div className="space-y-4">
                      {inventoryForm.uuid && (
                        <Input
                          label="Inventory Identifier"
                          value={inventoryForm.uuid}
                          isReadOnly
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                          endContent={
                            <Button
                              variant="flat"
                              color="default"
                              isIconOnly
                              onPress={() => copyToClipboard(inventoryForm.uuid || "")}
                            >
                              <Icon icon="mdi:content-copy" className="text-default-500" />
                            </Button>
                          }
                        />
                      )}

                      <div className="flex items-center justify-between gap-4">
                        <Input
                          label="Item Name"
                          value={inventoryForm.name}
                          onChange={(e) => handleInventoryFormChange('name', e.target.value)}
                          isRequired
                          placeholder="Enter item name"
                          classNames={inputStyle}
                          startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                        />

                        <Autocomplete
                          label="Measurement Unit"
                          placeholder="Select metric unit"
                          selectedKey={inventoryForm.measurement_unit}
                          onSelectionChange={(key) => handleInventoryFormChange('measurement_unit', key)}
                          startContent={<Icon icon="mdi:ruler" className="text-default-500 mb-[0.1rem]" />}
                          isRequired
                          inputProps={autoCompleteStyle}
                        >
                          {measurementUnitOptions.map((measurement_unit) => (
                            <AutocompleteItem key={measurement_unit}>{measurement_unit.charAt(0).toUpperCase() + measurement_unit.slice(1)}</AutocompleteItem>
                          ))}
                        </Autocomplete>
                      </div>

                      <Textarea
                        label="Description"
                        value={inventoryForm.description}
                        onChange={(e) => handleInventoryFormChange('description', e.target.value)}
                        placeholder="Enter item description (optional)"
                        classNames={inputStyle}
                        startContent={<Icon icon="mdi:text-box" className="text-default-500 mt-[0.1rem]" />}
                      />

                      <div className="mt-6">
                        <CustomProperties
                          properties={inventoryForm.properties || {}}
                          onPropertiesChange={handleInventoryPropertiesChange}
                          isDisabled={!user || isLoadingItems}
                        />
                      </div>
                    </div>
                  </div>
                </LoadingAnimation>

                <LoadingAnimation
                  condition={isLoading}
                  skeleton={

                    <div>
                      <Skeleton className="h-6 w-48 rounded-xl mb-4 mx-auto" />
                      <div className="space-y-4">
                        <div className="flex justify-between items-center mb-4">
                          <Skeleton className="h-6 w-20 rounded-xl" />
                          <Skeleton className="h-8 w-28 rounded-xl" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="p-4 border-2 border-default-200 rounded-xl space-y-4">
                          <div className="flex justify-between items-center mb-8">
                            <Skeleton className="h-6 w-40 rounded-full" />
                            <div className="flex items-center gap-4">
                              <Skeleton className="h-5 w-16 rounded-full" />
                              <Skeleton className="h-5 w-5 rounded-full" />
                            </div>
                          </div>
                          <Skeleton className="h-16 w-full rounded-xl" />

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Skeleton className="h-16 w-full rounded-xl" />
                            <Skeleton className="h-16 w-full rounded-xl" />
                          </div>

                          <Skeleton className="h-16 w-full rounded-xl" />


                          <div className="p-4 border-2 border-default-200 rounded-xl bg-default-50">
                            <div className="flex justify-between items-center mb-4">
                              <Skeleton className="h-6 w-32 rounded-full" />
                              <Skeleton className="h-8 w-16 rounded-lg" />
                            </div>
                            <Skeleton className="h-48 w-full rounded-xl bg-transparent" />
                          </div>

                          <div className="p-4 border-2 border-default-200 rounded-xl space-y-2">
                            <div className="flex justify-between items-center mb-4">
                              <Skeleton className="h-6 w-40 rounded-full" />
                              <Skeleton className="h-5 w-5 rounded-full" />
                            </div>
                            <div className="p-4 border-2 border-default-200 rounded-xl space-y-4">
                              <div className="flex justify-between items-center mb-8">
                                <Skeleton className="h-6 w-32 rounded-full" />
                                <div className="flex items-center gap-4">
                                  <Skeleton className="h-5 w-16 rounded-full" />
                                  <Skeleton className="h-5 w-5 rounded-full" />
                                </div>
                              </div>
                              <Skeleton className="h-16 w-full rounded-xl" />

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Skeleton className="h-16 w-full rounded-xl" />
                                <Skeleton className="h-16 w-full rounded-xl" />
                                <Skeleton className="h-16 w-full rounded-xl" />
                                <Skeleton className="h-16 w-full rounded-xl" />
                              </div>


                              <div className="p-4 border-2 border-default-200 rounded-xl bg-default-50">
                                <div className="flex justify-between items-center mb-4">
                                  <Skeleton className="h-6 w-32 rounded-full" />
                                  <Skeleton className="h-8 w-16 rounded-lg" />
                                </div>
                                <Skeleton className="h-48 w-full rounded-xl bg-transparent" />
                              </div>
                            </div>

                            <div className="p-4 border-2 border-default-200 rounded-xl flex justify-between">
                              <Skeleton className="h-6 w-40 rounded-full" />
                              <div className="flex items-center gap-4">
                                <Skeleton className="h-5 w-16 rounded-full" />
                                <Skeleton className="h-5 w-5 rounded-full" />
                              </div>
                            </div>

                            <div className="p-4 border-2 border-default-200 rounded-xl flex justify-between">
                              <Skeleton className="h-6 w-40 rounded-full" />
                              <div className="flex items-center gap-4">
                                <Skeleton className="h-5 w-16 rounded-full" />
                                <Skeleton className="h-5 w-5 rounded-full" />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 border-2 border-default-200 rounded-xl flex justify-between">
                          <Skeleton className="h-6 w-40 rounded-full" />
                          <div className="flex items-center gap-4">
                            <Skeleton className="h-5 w-16 rounded-full" />
                            <Skeleton className="h-5 w-5 rounded-full" />
                          </div>
                        </div>

                        <div className="p-4 border-2 border-default-200 rounded-xl flex justify-between">
                          <Skeleton className="h-6 w-40 rounded-full" />
                          <div className="flex items-center gap-4">
                            <Skeleton className="h-5 w-16 rounded-full" />
                            <Skeleton className="h-5 w-5 rounded-full" />
                          </div>
                        </div>
                      </div>
                    </div>

                  }>
                  <div>
                    <h2 className="text-xl font-semibold mb-4 w-full text-center">Items</h2>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                          {bulkItems.length > 0 && (
                            <>
                              <Chip color="default" variant="flat" size="sm">
                                {bulkItems.length} item{bulkItems.length > 1 ? "s" : ""}
                              </Chip>
                              <Chip color="primary" variant="flat" size="sm">
                                {formatNumber(bulkItems.reduce((total, bulk) => total + (bulk.unit_value || 0), 0))} {bulkItems[0]?.unit || 'units'}
                              </Chip>
                              <Chip color="success" variant="flat" size="sm">
                                ₱ {formatNumber(bulkItems.reduce((total, bulk) => total + (bulk.cost || 0), 0))}
                              </Chip>
                            </>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            color={groupView ? "primary" : "default"}
                            variant={groupView ? "shadow" : "flat"}
                            size="sm"
                            onPress={() => setGroupView(!groupView)}
                            startContent={<Icon icon={groupView ? "mdi:format-list-group" : "mdi:format-list-bulleted"} />}
                          >
                            {groupView ? "Grouped" : "Flat"}
                          </Button>
                          <Button
                            color="primary"
                            variant="shadow"
                            size="sm"
                            onPress={handleAddBulk}
                            startContent={<Icon icon="mdi:plus" />}
                          >
                            Add Item
                          </Button>
                        </div>
                      </div>

                      {/* Bulk items content */}
                      <div>
                        <AnimatePresence>
                          {bulkItems.length === 0 ? (
                            <motion.div {...motionTransition}>
                              <div className="py-8 h-48 text-center text-default-500 border border-dashed border-default-300 rounded-lg justify-center flex flex-col items-center">
                                <Icon icon="mdi:package-variant-closed" className="mx-auto mb-2 opacity-50" width={40} height={40} />
                                <p>No bulk items added yet</p>
                                <Button
                                  color="primary"
                                  variant="light"
                                  size="sm"
                                  className="mt-3"
                                  onPress={handleAddBulk}
                                >
                                  Add your first bulk item
                                </Button>
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>

                        <AnimatePresence>
                          {!isLoading && bulkItems.length > 0 && (
                            <motion.div {...motionTransition} className="-m-4">
                              <Accordion
                                selectionMode="multiple"
                                variant="splitted"
                                selectedKeys={expandedBulks}
                                onSelectionChange={(keys) => setExpandedBulks(keys as Set<string>)}
                                itemClasses={{
                                  base: "p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
                                  title: "font-normal text-lg font-semibold",
                                  trigger: "p-4 data-[hover=true]:bg-default-100 flex items-center transition-colors",
                                  indicator: "text-medium",
                                  content: "text-small p-0",
                                }}>
                                {bulkItems.map((bulk, index) => {
                                  const groupInfo = getGroupInfo(bulk);

                                  // Only render if it's the first item in a group or not a group at all
                                  if (groupView && groupInfo.isGroup && !groupInfo.isFirstInGroup) {
                                    return null;
                                  }

                                  return (
                                    <AccordionItem
                                      key={bulk.id}
                                      aria-label={`Item ${bulk.id}`}
                                      className={`${index === 0 ? 'mt-4' : ''} mx-2`}
                                      title={
                                        <div className="flex justify-between items-center w-full">
                                          <div className="flex items-center gap-2">
                                            {groupInfo.isGroup ? (
                                              <span className="flex font-medium">
                                                Group {groupInfo.groupNumber}
                                              </span>
                                            ) : (
                                              <span className="font-medium">
                                                Item {getItemDisplayNumber(bulk)}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex gap-2">
                                            {bulk.unit && bulk.unit !== "" && bulk.unit_value! > 0 && (
                                              <Chip color="primary" variant="flat" size="sm">
                                                {groupInfo.isGroup
                                                  ? `${formatNumber((bulk.unit_value || 0) * groupInfo.groupSize)} ${bulk.unit}`
                                                  : `${formatNumber(bulk.unit_value || 0)} ${bulk.unit}`
                                                }
                                              </Chip>
                                            )}
                                            {bulk.status && bulk.status !== "AVAILABLE" && (
                                              <Chip color="warning" variant="flat" size="sm">
                                                {bulk.status}
                                              </Chip>
                                            )}
                                            <Chip color="secondary" variant="flat" size="sm" className="flex">
                                              {groupInfo.groupSize} items
                                            </Chip>
                                          </div>
                                        </div>
                                      }
                                    >
                                      <div>
                                        {bulk.uuid && (
                                          <Input
                                            label="Bulk Identifier"
                                            value={bulk.uuid}
                                            isReadOnly
                                            classNames={{ inputWrapper: inputStyle.inputWrapper, base: "p-4 pb-0" }}
                                            startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                                            endContent={
                                              <Button
                                                variant="flat"
                                                color="default"
                                                isIconOnly
                                                onPress={() => copyToClipboard(bulk.uuid || "")}
                                              >
                                                <Icon icon="mdi:content-copy" className="text-default-500" />
                                              </Button>
                                            }
                                          />
                                        )}

                                        <Input
                                          label="Item Code"
                                          placeholder="Enter item code"
                                          value={bulk.item_code || ""}
                                          onChange={(e) => handleBulkChange(bulk.id, 'item_code', e.target.value)}
                                          isRequired
                                          isDisabled={!isBulkEditable(bulk)}
                                          classNames={{ inputWrapper: inputStyle.inputWrapper, base: "p-4 pb-0" }}
                                          startContent={<Icon icon="mdi:barcode" className="text-default-500 mb-[0.2rem]" />}
                                          endContent={
                                            <Button
                                              variant="flat"
                                              color="default"
                                              isIconOnly
                                              onPress={() => copyToClipboard(bulk.uuid || "")}
                                            >
                                              <Icon icon="mdi:content-copy" className="text-default-500" />
                                            </Button>
                                          }
                                        />

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 pb-0">
                                          <NumberInput
                                            label={`${inventoryForm.measurement_unit ? inventoryForm.measurement_unit.charAt(0).toUpperCase() + inventoryForm.measurement_unit.slice(1) : "Item"} Value`}
                                            placeholder="0"
                                            value={bulk.unit_value || 0}
                                            onValueChange={(value) => handleBulkChange(bulk.id, 'unit_value', value)}
                                            isRequired
                                            isDisabled={!isBulkEditable(bulk)}
                                            minValue={0}
                                            classNames={inputStyle}
                                            endContent={
                                              <div className="absolute right-10 bottom-2">
                                                {bulk.unit && (
                                                  <Chip
                                                    color="primary"
                                                    variant="flat"
                                                    size="sm"
                                                  >
                                                    {bulk.unit}
                                                  </Chip>
                                                )}
                                              </div>

                                            }
                                            startContent={<Icon icon="mdi:numeric" className="text-default-500 mb-[0.1rem]" width={16} />}
                                          />

                                          <Autocomplete
                                            label={`${inventoryForm.measurement_unit ? inventoryForm.measurement_unit.charAt(0).toUpperCase() + inventoryForm.measurement_unit.slice(1) : "Item"} Unit`}
                                            placeholder={`Select ${inventoryForm.measurement_unit ? inventoryForm.measurement_unit.charAt(0).toUpperCase() + inventoryForm.measurement_unit.slice(1) : "Item"} unit`}
                                            selectedKey={bulk.unit || ""}
                                            onSelectionChange={(key) => { handleBulkChange(bulk.id, 'unit', key) }}
                                            isRequired
                                            isDisabled={!isBulkEditable(bulk)}
                                            inputProps={autoCompleteStyle}
                                            startContent={<Icon icon="mdi:cube-outline"
                                              className="text-default-500 -mb-[0.1rem]" width={24} />}
                                          >
                                            {unitOptions.map((unit) => (
                                              <AutocompleteItem key={unit}>{getUnitFullName(unit)}</AutocompleteItem>
                                            ))}
                                          </Autocomplete>

                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 pb-0">
                                          <Autocomplete
                                            label="Packaging Unit"
                                            placeholder="Select packaging unit"
                                            selectedKey={bulk.packaging_unit || ""}
                                            onSelectionChange={(key) => handleBulkChange(bulk.id, 'packaging_unit', key)}
                                            isRequired
                                            isDisabled={!isBulkEditable(bulk)}
                                            inputProps={autoCompleteStyle}
                                            startContent={<Icon icon="mdi:cube-outline"
                                              className="text-default-500 -mb-[0.1rem]" width={24} />}
                                          >
                                            {packagingUnitOptions.map((packaging_unit) => (
                                              <AutocompleteItem key={packaging_unit}>{packaging_unit.charAt(0).toUpperCase() + packaging_unit.slice(1)}</AutocompleteItem>
                                            ))}
                                          </Autocomplete>

                                          <NumberInput
                                            label="Cost"
                                            placeholder="0.00"
                                            value={bulk.cost || 0}
                                            onValueChange={(value) => handleBulkChange(bulk.id, 'cost', value)}
                                            isDisabled={!isBulkEditable(bulk)}
                                            minValue={0}
                                            classNames={inputStyle}
                                            startContent={
                                              <div className="flex items-center">
                                                <Icon icon="mdi:currency-php" className="text-default-500 mb-[0.2rem]" />
                                              </div>
                                            }
                                          />

                                        </div>
                                        <div className="p-4">
                                          <CustomProperties
                                            properties={bulk.properties || {}}
                                            onPropertiesChange={(properties) => handleBulkPropertiesChange(bulk.id, properties)}
                                            onInheritFrom={() => handleInheritBulkProperties(bulk.id)}
                                            showInheritButton={true}
                                            isDisabled={!isBulkEditable(bulk)}
                                          />
                                        </div>

                                        <div className="flex justify-end gap-2 bg-default-100/50 p-4">
                                          <Popover
                                            isOpen={duplicatePopoverOpen && itemToDuplicate?.type === 'bulk' && itemToDuplicate.id === bulk.id}
                                            onOpenChange={(open) => {
                                              setDuplicatePopoverOpen(open);
                                              if (open) {
                                                setItemToDuplicate({ type: 'bulk', id: bulk.id });
                                                setDuplicateCount(1);
                                              }
                                            }}
                                          >
                                            <PopoverTrigger>
                                              <Button
                                                color="secondary"
                                                variant="flat"
                                                size="sm"
                                                isDisabled={!isBulkEditable(bulk)}
                                              >
                                                <Icon icon="ion:duplicate" width={14} height={14} />
                                                Duplicate
                                              </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-56">
                                              <div className="p-2 space-y-3">
                                                <div className="text-sm font-medium">Duplicate {groupInfo.isGroup ? "Group" : "Item"}</div>
                                                <NumberInput
                                                  label="Number of copies"
                                                  value={duplicateCount}
                                                  onValueChange={setDuplicateCount}
                                                  minValue={1}
                                                  maxValue={10}
                                                  classNames={{
                                                    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200"
                                                  }}
                                                />
                                                <div className="flex justify-end gap-2 mt-2">
                                                  <Button
                                                    size="sm"
                                                    variant="flat"
                                                    onPress={() => setDuplicatePopoverOpen(false)}
                                                  >
                                                    Cancel
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    color="primary"
                                                    variant="shadow"
                                                    onPress={() => {
                                                      handleDuplicateBulk(bulk.id, duplicateCount);
                                                      setDuplicatePopoverOpen(false);
                                                    }}
                                                  >
                                                    Duplicate
                                                  </Button>
                                                </div>
                                              </div>
                                            </PopoverContent>
                                          </Popover>

                                          {/* New Adjust Group button - only show for groups */}
                                          {groupInfo.isGroup && (
                                            <Popover
                                              isOpen={adjustGroupPopoverOpen && groupToAdjust?.groupKey === groupInfo.groupKey}
                                              onOpenChange={(open) => {
                                                setAdjustGroupPopoverOpen(open);
                                                if (open) {
                                                  setGroupToAdjust({
                                                    groupKey: groupInfo.groupKey,
                                                    currentCount: groupInfo.groupSize
                                                  });
                                                  setNewGroupCount(groupInfo.groupSize);
                                                }
                                              }}
                                            >
                                              <PopoverTrigger>
                                                <Button
                                                  color="warning"
                                                  variant="flat"
                                                  size="sm"
                                                  isDisabled={!isBulkEditable(bulk)}
                                                >
                                                  <Icon icon="mdi:tune" width={14} height={14} />
                                                  Adjust
                                                </Button>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-56">
                                                <div className="p-2 space-y-3">
                                                  <div className="text-sm font-medium">Adjust Group Size</div>
                                                  <div className="text-xs text-default-500">
                                                    Current: {groupInfo.groupSize} items
                                                  </div>
                                                  <NumberInput
                                                    label="New group size"
                                                    value={newGroupCount}
                                                    onValueChange={setNewGroupCount}
                                                    minValue={1}
                                                    maxValue={20}
                                                    classNames={{
                                                      inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200"
                                                    }}
                                                  />
                                                  <div className="flex justify-end gap-2 mt-2">
                                                    <Button
                                                      size="sm"
                                                      variant="flat"
                                                      onPress={() => setAdjustGroupPopoverOpen(false)}
                                                    >
                                                      Cancel
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      color="warning"
                                                      variant="shadow"
                                                      onPress={() => {
                                                        if (groupToAdjust) {
                                                          handleAdjustGroup(groupToAdjust.groupKey, newGroupCount);
                                                        }
                                                        setAdjustGroupPopoverOpen(false);
                                                      }}
                                                    >
                                                      Adjust
                                                    </Button>
                                                  </div>
                                                </div>
                                              </PopoverContent>
                                            </Popover>
                                          )}

                                          <Button
                                            color="danger"
                                            variant="flat"
                                            size="sm"
                                            onPress={() => {
                                              if (groupInfo.isGroup) {
                                                // Remove entire group
                                                const groupKey = groupInfo.groupKey;
                                                setBulkItems(bulkItems.filter(item =>
                                                  !(generateGroupKey(item) === groupKey && item.isNew)
                                                ));
                                              } else {
                                                handleDeleteBulk(bulk.id);
                                              }
                                            }}
                                            startContent={<Icon icon="mdi:delete" width={16} height={16} />}
                                            isDisabled={!isBulkEditable(bulk)}
                                          >
                                            Remove
                                          </Button>
                                        </div>
                                      </div>
                                    </AccordionItem>
                                  );
                                }).filter(Boolean)}
                              </Accordion>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </LoadingAnimation>

                {/* Action buttons section */}
                <motion.div {...motionTransition}>
                  <div className="flex flex-col gap-4">
                    <AnimatePresence>
                      {error && (
                        <motion.div {...motionTransition}>
                          <Alert color="danger" variant="flat" onClose={() => setError(null)}>
                            {error}
                          </Alert>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <LoadingAnimation
                      condition={!user || isLoading}
                      skeleton={
                        <div className="flex flex-col md:flex-row justify-center items-center gap-4">
                          <Skeleton className="h-10 w-full rounded-xl" />
                          <Skeleton className="h-10 w-full rounded-xl" />
                        </div>
                      }>
                      <div className="flex flex-col md:flex-row justify-center items-center gap-4">
                        {selectedItemId && (
                          <Button
                            color="danger"
                            variant="flat"
                            className="w-full"
                            onPress={handleDeleteItem}
                            isDisabled={isLoading}
                          >
                            <Icon icon="mdi:delete" className="mr-1" />
                            Delete Item
                          </Button>
                        )}
                        <Button
                          type="submit"
                          color="primary"
                          variant="shadow"
                          className="w-full"
                          isLoading={isLoading}
                          isDisabled={!inventoryForm.name || !inventoryForm.measurement_unit}
                        >
                          <Icon icon="mdi:content-save" className="mr-1" />
                          {selectedItemId ? "Update Item" : "Save Item"}
                        </Button>
                      </div>
                    </LoadingAnimation>
                  </div>
                </motion.div>
              </CardList>
            </Form>
          </div>
        </div>

        <Modal
          isOpen={deleteModal.isOpen}
          onClose={deleteModal.onClose}
          backdrop="blur"
          classNames={{
            backdrop: "bg-background/50"
          }}
        >
          <ModalContent>
            <ModalHeader>Confirm Deletion</ModalHeader>
            <ModalBody>
              Are you sure you want to delete this {itemToDelete?.type}? This action cannot be undone.
            </ModalBody>
            <ModalFooter className="flex justify-end p-4 gap-4">
              <Button variant="flat" onPress={deleteModal.onClose} isDisabled={isLoading}>
                Cancel
              </Button>
              <Button color="danger" variant="shadow" onPress={executeDelete} isLoading={isLoading}>
                <Icon icon="mdi:delete" className="mr-1" />
                Delete
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
        <Modal
          isOpen={showMergeWarning}
          onClose={() => setShowMergeWarning(false)}
          backdrop="blur"
        >
          <ModalContent>
            <ModalHeader>Duplicate Group Detected</ModalHeader>
            <ModalBody>
              You have duplicated a group but did not change its details. If you save, these groups will be merged. Please modify the details of the duplicated group(s) to keep them separate.
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" onPress={() => setShowMergeWarning(false)}>
                OK
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

      </div>
    </motion.div>
  );
}