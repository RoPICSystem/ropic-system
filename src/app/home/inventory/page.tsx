'use client';

import CardList from "@/components/card-list";
import CustomProperties from "@/components/custom-properties";
import LoadingAnimation from '@/components/loading-animation';
import { SearchListPanel } from "@/components/search-list-panel/search-list-panel";
import { getStatusColor } from "@/utils/colors";
import { motionTransition } from "@/utils/anim";
import { getMeasurementUnitOptions, getPackagingUnitOptions, getUnitFullName, getUnitOptions, getDefaultStandardUnit, convertUnit } from "@/utils/measurements";
import { getUserFromCookies } from '@/utils/supabase/server/user';
import { copyToClipboard, formatDate, formatNumber } from "@/utils/tools";
import {
  groupInventoryItems,
  getGroupInfo,
  getItemDisplayNumber,
  createGroupFromItem,
  duplicateInventoryGroup,
  adjustGroupSize,
  removeGroup,
  ungroupItems,
  createGroupId
} from "@/utils/inventory-group";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
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

  // Inventory list state
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Inventory items state
  const [inventoryItemsList, setInventoryItemsList] = useState<(Partial<InventoryItem> & { company_uuid: string, id: number, is_new?: boolean })[]>([]);
  const [nextItemId, setNextItemId] = useState(1);

  // View mode state
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');

  // Delete confirmation
  const deleteModal = useDisclosure();
  const [itemToDelete, setItemToDelete] = useState<{ type: 'item' | 'inventoryItem' | 'group', id: string | number, groupId?: string }>();

  const [originalInventoryItems, setOriginalInventoryItems] = useState<(Partial<InventoryItem> & { id: number })[]>([]);

  // Duplication state
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [duplicatePopoverOpen, setDuplicatePopoverOpen] = useState(false);

  // Grouping state
  const [groupSize, setGroupSize] = useState(2);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);

  // Expanded items state
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const defaultMeasurementUnit = "length";
  const defaultPackagingUnit = "roll";
  const defaultUnit = "m";

  // Form state
  const [inventoryForm, setInventoryForm] = useState<{
    uuid?: string;
    name: string;
    description: string;
    measurement_unit: string;
    standard_unit: string;
    company_uuid: string;
    properties?: Record<string, any>;
    unit_values?: {
      inventory: number;
      warehouse: number;
      available: number;
      total: number;
    };
    count?: {
      inventory: number;
      warehouse: number;
      available: number;
      total: number;
    };
  }>({
    name: "",
    description: "",
    measurement_unit: defaultMeasurementUnit,
    standard_unit: defaultUnit,
    company_uuid: "",
    properties: {}
  });

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  const autoCompleteStyle = { classNames: inputStyle };

  // Helper functions
  const getGroupedItems = () => groupInventoryItems(inventoryItemsList);

  const getDisplayItemsList = () => {
    if (viewMode === 'flat') {
      return inventoryItemsList;
    }

    const groupedItems = getGroupedItems();
    return inventoryItemsList.filter(item => {
      const groupInfo = getGroupInfo(item, groupedItems);
      return !groupInfo.isGroup || groupInfo.isFirstInGroup;
    });
  };

  // Calculate total units in standard unit
  const getTotalStandardUnits = () => {
    return inventoryItemsList.reduce((total, item) => {
      if (item.unit && item.unit_value && inventoryForm.standard_unit) {
        const convertedValue = convertUnit(item.unit_value, item.unit, inventoryForm.standard_unit);
        return total + convertedValue;
      }
      return total;
    }, 0);
  };

  // Calculate total cost
  const getTotalCost = () => {
    return inventoryItemsList.reduce((total, item) => total + (item.cost || 0), 0);
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
          standard_unit: item.standard_unit || getDefaultStandardUnit(item.measurement_unit || ""),
          company_uuid: item.company_uuid,
          properties: item.properties || {},
          unit_values: item.unit_values,
          count: item.count
        });

        const inventoryItems = item.inventory_items || [];
        const newInventoryItems = inventoryItems.map((invItem: any, index: number) => ({
          ...invItem,
          id: index + 1,
        }));

        setInventoryItemsList(newInventoryItems);
        setNextItemId(newInventoryItems.length + 1);
        setOriginalInventoryItems(newInventoryItems.map((invItem: { id: any; }) => ({
          ...invItem,
          id: invItem.id
        })));

        // Set expanded states to first items
        if (newInventoryItems.length > 0) {
          setExpandedItems(new Set([`${newInventoryItems[0].id}`]));
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

  const isItemEditable = (item: any) => {
    return !item.status || item.status === "AVAILABLE";
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

  const handleInventoryPropertiesChange = (properties: Record<string, any>) => {
    setInventoryForm(prev => ({ ...prev, properties }));
  };

  const handleInventoryItemPropertiesChange = (itemId: number, properties: Record<string, any>) => {
    setInventoryItemsList(prev => prev.map(item =>
      item.id === itemId ? { ...item, properties } : item
    ));
  };

  const handleInheritItemProperties = (itemId: number) => {
    const properties = inventoryForm.properties || {};
    handleInventoryItemPropertiesChange(itemId, properties);
  };

  const resetForm = () => {
    setInventoryForm({
      name: "",
      description: "",
      measurement_unit: defaultMeasurementUnit,
      standard_unit: defaultUnit,
      company_uuid: user?.company_uuid || "",
      properties: {}
    });
    setUnitOptions(getUnitOptions(defaultMeasurementUnit));
    setInventoryItemsList([]);
    setOriginalInventoryItems([]);
    setNextItemId(1);
  };

  const handleAddInventoryItem = () => {
    const newItem = {
      id: nextItemId,
      company_uuid: user?.company_uuid || "",
      unit: defaultUnit,
      unit_value: 0,
      packaging_unit: defaultPackagingUnit,
      cost: 0,
      properties: {},
      is_new: true,
      group_id: ''
    };

    setInventoryItemsList([newItem, ...inventoryItemsList]);
    setNextItemId(nextItemId + 1);
    setExpandedItems(new Set([`${nextItemId}`]));
  };

  const handleInventoryFormChange = (field: string, value: any) => {
    if (field === 'measurement_unit') {
      const newStandardUnit = getDefaultStandardUnit(value);
      setUnitOptions(getUnitOptions(value));
      setInventoryForm(prev => ({
        ...prev,
        [field]: value,
        standard_unit: newStandardUnit
      }));
      setInventoryItemsList(prev => prev.map(item => ({
        ...item,
        unit_value: 0,
        unit: undefined,
      })));
    } else {
      setInventoryForm(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleCreateGroup = (itemId: number, count: number) => {
    const itemToGroup = inventoryItemsList.find(item => item.id === itemId);
    if (!itemToGroup) return;

    const groupItems = createGroupFromItem(itemToGroup, count, nextItemId);
    const otherItems = inventoryItemsList.filter(item => item.id !== itemId);

    // Find the position of the original item and replace it with the group
    const originalIndex = inventoryItemsList.findIndex(item => item.id === itemId);
    const newItems = [...otherItems];
    newItems.splice(originalIndex, 0, ...groupItems as (Partial<InventoryItem> & { company_uuid: string, id: number, is_new?: boolean })[]);

    setInventoryItemsList(newItems);
    setNextItemId(nextItemId + count);
    setExpandedItems(new Set([`${groupItems[0].id}`]));
  };

  const handleDuplicateItem = (itemId: number, count: number) => {
    const groupedItems = getGroupedItems();
    const itemToDuplicate = inventoryItemsList.find(item => item.id === itemId);
    if (!itemToDuplicate) return;

    const groupInfo = getGroupInfo(itemToDuplicate, groupedItems);

    if (groupInfo.isGroup) {
      // Duplicate entire group
      const groupItems = inventoryItemsList.filter(item => item.group_id === groupInfo.groupId);
      let newItems: typeof inventoryItemsList = [];
      let currentNextId = nextItemId;

      for (let i = 0; i < count; i++) {
        const newGroupId = createGroupId();
        const duplicatedGroup = duplicateInventoryGroup(groupItems, newGroupId, currentNextId) as (Partial<InventoryItem> & { company_uuid: string, id: number, is_new?: boolean })[];
        newItems.push(...duplicatedGroup);
        currentNextId += duplicatedGroup.length;
      }

      setInventoryItemsList([...newItems, ...inventoryItemsList]);
      setNextItemId(currentNextId);
      setExpandedItems(new Set([`${newItems[0].id}`]));
    } else {
      // Duplicate single item
      let newItems: typeof inventoryItemsList = [];

      for (let i = 0; i < count; i++) {
        newItems.push({
          ...itemToDuplicate,
          id: nextItemId + i,
          uuid: undefined,
          is_new: true,
          group_id: ''
        });
      }

      setInventoryItemsList([...newItems, ...inventoryItemsList]);
      setNextItemId(nextItemId + newItems.length);
      setExpandedItems(new Set([`${newItems[0].id}`]));
    }
  };

  const handleInventoryItemChange = (itemId: number, field: keyof InventoryItem, value: any) => {
    setInventoryItemsList(prev => {
      const itemToUpdate = prev.find(item => item.id === itemId);
      if (!itemToUpdate) return prev;

      // Check if the item is part of a group
      const groupedItems = groupInventoryItems(prev);
      const groupInfo = getGroupInfo(itemToUpdate, groupedItems);

      if (groupInfo.isGroup && groupInfo.groupId) {
        // Update all items in the same group
        return prev.map(item => {
          if (item.group_id === groupInfo.groupId) {
            return { ...item, [field]: value };
          }
          return item;
        });
      } else {
        // Update only the single item
        return prev.map(item =>
          item.id === itemId ? { ...item, [field]: value } : item
        );
      }
    });
  };

  const handleGroupSizeChange = (groupId: string, newSize: number) => {
    const result = adjustGroupSize(groupId, newSize, inventoryItemsList, nextItemId);
    setInventoryItemsList(result.updatedItems as (Partial<InventoryItem> & { company_uuid: string, id: number, is_new?: boolean })[]);
    setNextItemId(result.newNextItemId);
  };

  const handleDeleteInventoryItem = (itemId: number) => {
    const groupedItems = getGroupedItems();
    const itemToDelete = inventoryItemsList.find(item => item.id === itemId);
    if (!itemToDelete) return;

    const groupInfo = getGroupInfo(itemToDelete, groupedItems);

    if (groupInfo.isGroup && viewMode === 'grouped') {
      setItemToDelete({ type: 'group', id: itemId, groupId: groupInfo.groupId! });
      deleteModal.onOpen();
    } else {
      // Delete single item directly
      setInventoryItemsList(inventoryItemsList.filter(item => item.id !== itemId));

      const firstItem = inventoryItemsList.find(item => item.id !== itemId);
      if (firstItem) {
        setExpandedItems(new Set([`${firstItem.id}`]));
      }
    }
  };

  const handleUngroupItems = (groupId: string) => {
    const updatedItems = ungroupItems(groupId, inventoryItemsList);
    setInventoryItemsList(updatedItems as (Partial<InventoryItem> & { company_uuid: string, id: number, is_new?: boolean })[]);
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

      if (itemToDelete.type === 'item') {
        result = await deleteInventoryItem(itemToDelete.id as string);
        if (result.success) {
          setSelectedItemId(null);
          const params = new URLSearchParams(searchParams.toString());
          params.delete("itemId");
          router.push(`?${params.toString()}`, { scroll: false });
          resetForm();
        }
      } else if (itemToDelete.type === 'group' && itemToDelete.groupId) {
        // Remove entire group
        const updatedItems = removeGroup(itemToDelete.groupId, inventoryItemsList);
        setInventoryItemsList(updatedItems as (Partial<InventoryItem> & { company_uuid: string, id: number, is_new?: boolean })[]);

        const firstItem = updatedItems[0];
        if (firstItem) {
          setExpandedItems(new Set([`${firstItem.id}`]));
        }
        deleteModal.onClose();
        setIsLoading(false);
        return;
      }

      if (!result?.success && itemToDelete.type === 'item') {
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

    if (inventoryItemsList.length === 0) {
      setError("At least one inventory item is required");
      return false;
    }

    console.log("Validating inventory items:", inventoryItemsList);

    for (const item of inventoryItemsList) {
      if (!item.unit_value && item.unit_value !== 0) {
        setError("Unit value is required for all items");
        return false;
      }

      if (!item.unit) {
        setError("Metric Unit is required for all items");
        return false;
      }

      if (!item.item_code) {
        setError("Item code is required for all items");
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setError(null);

    try {
      if (selectedItemId) {
        // Update existing item
        const itemUpdates = {
          name: inventoryForm.name,
          description: inventoryForm.description,
          properties: inventoryForm.properties,
        };

        const itemUpdates_list = inventoryItemsList
          .filter(item => item.uuid)
          .map(item => ({
            uuid: item.uuid as string,
            item_code: item.item_code as string,
            unit: item.unit as string,
            unit_value: item.unit_value as number,
            packaging_unit: item.packaging_unit as string,
            cost: item.cost as number,
            group_id: item.group_id || '',
            properties: item.properties as Record<string, any>,
          }));

        const newItems = inventoryItemsList
          .filter(item => !item.uuid)
          .map(item => ({
            company_uuid: user.company_uuid,
            item_code: item.item_code as string,
            unit: item.unit as string,
            unit_value: item.unit_value as number,
            packaging_unit: item.packaging_unit as string,
            cost: item.cost as number,
            group_id: item.group_id || '',
            properties: item.properties as Record<string, any>,
          }));

        const currentItemUuids = new Set(inventoryItemsList.map(item => item.uuid).filter(Boolean));
        const deletedItems = originalInventoryItems
          .filter(item => item.uuid && !currentItemUuids.has(item.uuid))
          .map(item => item.uuid as string);

        const result = await updateInventoryItem(
          selectedItemId,
          itemUpdates,
          itemUpdates_list,
          newItems,
          deletedItems
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
          standard_unit: inventoryForm.standard_unit,
          description: inventoryForm.description,
          admin_uuid: user.uuid,
          properties: inventoryForm.properties || {},
        };

        const newItems = inventoryItemsList.map(item => ({
          company_uuid: user.company_uuid,
          item_code: item.item_code as string,
          unit: item.unit as string,
          unit_value: item.unit_value as number,
          packaging_unit: item.packaging_unit as string,
          cost: item.cost as number,
          group_id: item.group_id || '',
          properties: item.properties as Record<string, any>,
        }));

        const result = await createInventoryItem(newItem, newItems);

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
        setViewMode(userData.settings?.defaultView || 'grouped');
        setInventoryForm(prev => ({ ...prev, company_uuid: userData.company_uuid }));
        setMeasurementUnitOptions(await getMeasurementUnitOptions());
        setPackagingUnitOptions(await getPackagingUnitOptions());
        setUnitOptions(getUnitOptions(defaultMeasurementUnit));

      } catch (error) {
        console.error("Error initializing page:", error);
        setError("Failed to load inventory data");
      }
    };

    initPage();
  }, []);

  // Load selected item details
  useEffect(() => {
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
            title="Inventory"
            tableName="inventory"
            searchPlaceholder="Search inventory..."
            searchLimit={10}
            dateFilters={["weekFilter", "specificDate"]}
            companyUuid={user?.company_uuid}
            renderItem={(inventory) => (
              <Button
                key={inventory.uuid}
                onPress={() => handleSelectItem(inventory.uuid || "")}
                variant="shadow"
                className={`w-full min-h-[7.5rem] !transition-all duration-200 rounded-xl p-0 ${selectedItemId === inventory.uuid ?
                  '!bg-primary hover:!bg-primary-400 !shadow-lg hover:!shadow-md hover:!shadow-primary-200 !shadow-primary-200' :
                  '!bg-default-100/50 shadow-none hover:!bg-default-200 !shadow-2xs hover:!shadow-md hover:!shadow-default-200 !shadow-default-200'}`}
              >
                <div className="w-full flex flex-col h-full">
                  <div className="flex-grow flex flex-col justify-center px-3 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{inventory.name}</span>
                      <Chip color="default" variant={selectedItemId === inventory.uuid ? "shadow" : "flat"} size="sm">
                        {inventory.count?.total || 0} item{(inventory.count?.total || 0) !== 1 ? 's' : ''}
                      </Chip>
                    </div>
                    {inventory.description && (
                      <div className={`w-full mt-1 text-sm ${selectedItemId === inventory.uuid ? 'text-default-800 ' : 'text-default-600'} text-start text-ellipsis overflow-hidden whitespace-nowrap`}>
                        {inventory.description}
                      </div>
                    )}
                  </div>

                  <div className={`flex items-center gap-2 border-t ${selectedItemId === inventory.uuid ? 'border-primary-300' : 'border-default-100'} p-3`}>
                    <Chip color={selectedItemId === inventory.uuid ? "default" : "primary"} variant={selectedItemId === inventory.uuid ? "shadow" : "flat"} size="sm">
                      {formatDate(inventory.created_at.toString())}
                    </Chip>
                    {inventory.unit_values.available > 0 && (
                      <Chip
                        color="success"
                        variant={selectedItemId === inventory.uuid ? "shadow" : "flat"}
                        size="sm"
                      >
                        {formatNumber(inventory.unit_values.available)} available
                      </Chip>
                    )}
                    {inventory.unit_values.warehouse > 0 && (
                      <Chip
                        color="warning"
                        variant={selectedItemId === inventory.uuid ? "shadow" : "flat"}
                        size="sm"
                      >
                        {formatNumber(inventory.unit_values.warehouse)} in warehouse
                      </Chip>
                    )}
                  </div>
                </div>
              </Button>
            )}
            renderSkeletonItem={(i) => (
              <Skeleton key={i} className="w-full min-h-[9rem] rounded-xl" />
            )}
            renderEmptyCard={(
              <>
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
              </>
            )}
            onItemSelect={handleSelectItem}
            supabaseFunction="get_inventory_filtered"
            className={`xl:w-1/3 shadow-xl shadow-primary/10 
                      xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
                      xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
                      border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
          />

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

                      <Input
                        label="Item Name"
                        value={inventoryForm.name}
                        onChange={(e) => handleInventoryFormChange('name', e.target.value)}
                        isRequired
                        placeholder="Enter item name"
                        classNames={inputStyle}
                        startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                      />

                      <div className="flex items-start justify-between gap-4 md:flex-row flex-col">
                        <Autocomplete
                          label="Measurement Unit"
                          placeholder="Select metric unit"
                          selectedKey={inventoryForm.measurement_unit}
                          onSelectionChange={(key) => handleInventoryFormChange('measurement_unit', key)}
                          startContent={<Icon icon="mdi:ruler" className="text-default-500 mb-[0.1rem]" />}
                          isRequired={!selectedItemId}
                          isReadOnly={!selectedItemId}
                          isClearable={!selectedItemId}
                          inputProps={autoCompleteStyle}

                          popoverProps={{ className: !!selectedItemId ? "collapse" : "" }}
                          selectorButtonProps={{ className: !!selectedItemId ? "collapse" : "" }}
                        >
                          {measurementUnitOptions.map((measurement_unit) => (
                            <AutocompleteItem key={measurement_unit}>{measurement_unit.charAt(0).toUpperCase() + measurement_unit.slice(1)}</AutocompleteItem>
                          ))}
                        </Autocomplete>

                        {/* Standard Unit Selection */}
                        <Autocomplete
                          label="Standard Unit"
                          placeholder="Select standard unit for conversions"
                          selectedKey={inventoryForm.standard_unit}
                          onSelectionChange={(key) => handleInventoryFormChange('standard_unit', key)}
                          startContent={<Icon icon="mdi:scale-balance" className="text-default-500 mb-[0.1rem]" />}
                          isRequired={!selectedItemId}
                          isReadOnly={!selectedItemId}
                          isClearable={!selectedItemId}
                          inputProps={autoCompleteStyle}
                          popoverProps={{ className: !!selectedItemId ? "collapse" : "" }}
                          selectorButtonProps={{ className: !!selectedItemId ? "collapse" : "" }}
                        >
                          {getUnitOptions(inventoryForm.measurement_unit).map((unit) => (
                            <AutocompleteItem key={unit}>{getUnitFullName(unit)}</AutocompleteItem>
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

                      {/* Display aggregated values if they exist */}
                      {inventoryForm.unit_values && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-default-100/50 rounded-xl">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-primary">
                              {formatNumber(inventoryForm.unit_values.total)}
                            </div>
                            <div className="text-sm text-default-600">
                              Total {inventoryForm.standard_unit}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-success">
                              {formatNumber(inventoryForm.unit_values.available)}
                            </div>
                            <div className="text-sm text-default-600">
                              Available {inventoryForm.standard_unit}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-warning">
                              {formatNumber(inventoryForm.unit_values.warehouse)}
                            </div>
                            <div className="text-sm text-default-600">
                              In Warehouse {inventoryForm.standard_unit}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-default-700">
                              {formatNumber(inventoryForm.unit_values.inventory)}
                            </div>
                            <div className="text-sm text-default-600">
                              Inventory {inventoryForm.standard_unit}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-6">
                        <CustomProperties
                          properties={inventoryForm.properties || {}}
                          onPropertiesChange={handleInventoryPropertiesChange}
                          isDisabled={!user}
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
                        </div>
                      </div>
                    </div>
                  }>
                  <div>
                    <h2 className="text-xl font-semibold mb-4 w-full text-center">Inventory Items</h2>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {inventoryItemsList.length > 0 && (
                            <>
                              <Chip color="default" variant="flat" size="sm">
                                {inventoryItemsList.length} item{inventoryItemsList.length > 1 ? "s" : ""}
                              </Chip>
                              {inventoryForm.standard_unit && (
                                <Chip color="primary" variant="flat" size="sm">
                                  {formatNumber(getTotalStandardUnits())} {inventoryForm.standard_unit}
                                </Chip>
                              )}
                              <Chip color="success" variant="flat" size="sm">
                                ₱ {formatNumber(getTotalCost())}
                              </Chip>
                            </>
                          )}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            color={viewMode === 'grouped' ? "primary" : "default"}
                            variant={viewMode === 'grouped' ? "shadow" : "flat"}
                            size="sm"
                            onPress={() => setViewMode(viewMode === 'grouped' ? 'flat' : 'grouped')}
                            startContent={<Icon icon={viewMode === 'grouped' ? "mdi:format-list-group" : "mdi:format-list-bulleted"} />}
                          >
                            {viewMode === 'grouped' ? 'Grouped' : 'Flat'}
                          </Button>
                          <Button
                            color="primary"
                            variant="shadow"
                            size="sm"
                            onPress={handleAddInventoryItem}
                            startContent={<Icon icon="mdi:plus" />}
                          >
                            Add Item
                          </Button>
                        </div>
                      </div>


                      {/* Inventory items content */}
                      <div>
                        <AnimatePresence>
                          {inventoryItemsList.length === 0 ? (
                            <motion.div {...motionTransition}>
                              <div className="py-8 h-48 text-center text-default-500 border border-dashed border-default-300 rounded-lg justify-center flex flex-col items-center">
                                <Icon icon="mdi:package-variant-closed" className="mx-auto mb-2 opacity-50" width={40} height={40} />
                                <p>No inventory items added yet</p>
                                <Button
                                  color="primary"
                                  variant="light"
                                  size="sm"
                                  className="mt-3"
                                  onPress={handleAddInventoryItem}
                                >
                                  Add your first inventory item
                                </Button>
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>

                        <AnimatePresence>
                          {!isLoading && inventoryItemsList.length > 0 && (
                            <motion.div {...motionTransition} className="-m-4">
                              <Accordion
                                selectionMode="multiple"
                                variant="splitted"
                                selectedKeys={expandedItems}
                                onSelectionChange={(keys) => setExpandedItems(keys as Set<string>)}
                                itemClasses={{
                                  base: "p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
                                  title: "font-normal text-lg font-semibold",
                                  trigger: "p-4 data-[hover=true]:bg-default-100 flex items-center transition-colors",
                                  indicator: "text-medium",
                                  content: "text-small p-0",
                                }}>
                                {getDisplayItemsList().map((item) => {
                                  const groupedItems = getGroupedItems();
                                  const groupInfo = getGroupInfo(item, groupedItems);
                                  const displayNumber = getItemDisplayNumber(item, inventoryItemsList, groupedItems);

                                  return (
                                    <AccordionItem
                                      key={item.id}
                                      aria-label={`Item ${item.id}`}
                                      className={`${displayNumber === 1 ? 'mt-4' : ''} mx-2`}
                                      title={
                                        <div className="flex justify-between items-center w-full">
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium">
                                              {viewMode === 'grouped' && groupInfo.isGroup ? `Group ${displayNumber}` : `Item ${viewMode === 'flat' ? item.id : displayNumber}`}
                                            </span>
                                          </div>
                                          <div className="flex gap-2">
                                            {viewMode === 'grouped' && groupInfo.isGroup && (
                                              <Chip color="secondary" variant="flat" size="sm">
                                                {groupInfo.groupSize} items
                                              </Chip>
                                            )}
                                            {item.unit && item.unit !== "" && item.unit_value! > 0 && (
                                              <Chip color="primary" variant="flat" size="sm">
                                                {(() => {
                                                  if (viewMode === 'grouped' && groupInfo.isGroup) {
                                                    // Calculate total for the group in standard unit
                                                    const groupItems = inventoryItemsList.filter(groupItem =>
                                                      groupItem.group_id === groupInfo.groupId
                                                    );
                                                    const totalInStandardUnit = groupItems.reduce((total, groupItem) => {
                                                      if (groupItem.unit && groupItem.unit_value && inventoryForm.standard_unit) {
                                                        return total + convertUnit(groupItem.unit_value, groupItem.unit, inventoryForm.standard_unit);
                                                      }
                                                      return total;
                                                    }, 0);

                                                    // Show both original unit total and converted total
                                                    const totalInOriginalUnit = groupItems.reduce((total, groupItem) => {
                                                      if (groupItem.unit === item.unit && groupItem.unit_value) {
                                                        return total + groupItem.unit_value;
                                                      }
                                                      return total;
                                                    }, 0);

                                                    if (inventoryForm.standard_unit && item.unit !== inventoryForm.standard_unit) {
                                                      return `${formatNumber(totalInOriginalUnit)} ${item.unit} (${formatNumber(totalInStandardUnit)} ${inventoryForm.standard_unit})`;
                                                    } else {
                                                      return `${formatNumber(totalInOriginalUnit)} ${item.unit}`;
                                                    }
                                                  } else {
                                                    // Individual item - show conversion if different from standard unit
                                                    if (inventoryForm.standard_unit && item.unit !== inventoryForm.standard_unit) {
                                                      const convertedValue = convertUnit(item.unit_value || 0, item.unit, inventoryForm.standard_unit);
                                                      return `${formatNumber(item.unit_value || 0)} ${item.unit} (${formatNumber(convertedValue)} ${inventoryForm.standard_unit})`;
                                                    } else {
                                                      return `${formatNumber(item.unit_value || 0)} ${item.unit}`;
                                                    }
                                                  }
                                                })()}
                                              </Chip>
                                            )}
                                            {item.status && item.status !== "AVAILABLE" && (
                                              <Chip color="warning" variant="flat" size="sm">
                                                {item.status}
                                              </Chip>
                                            )}
                                          </div>
                                        </div>
                                      }
                                    >
                                      <div>
                                        {/* Identifiers Section */}
                                        {(groupInfo.isGroup && groupInfo.groupId || item.uuid && !groupInfo.isGroup) && (
                                          <div className="space-y-4 px-4 pt-4">
                                            {/* Group Identifier - show when item is part of a group */}
                                            {groupInfo.isGroup && groupInfo.groupId && (
                                              <Input
                                                label="Group Identifier"
                                                value={groupInfo.groupId}
                                                isReadOnly
                                                classNames={{ inputWrapper: inputStyle.inputWrapper }}
                                                startContent={<Icon icon="mdi:group" className="text-default-500 mb-[0.2rem]" />}
                                                endContent={
                                                  <Button
                                                    variant="flat"
                                                    color="default"
                                                    isIconOnly
                                                    onPress={() => copyToClipboard(groupInfo.groupId!)}
                                                  >
                                                    <Icon icon="mdi:content-copy" className="text-default-500" />
                                                  </Button>
                                                }
                                              />
                                            )}

                                            {/* Item Identifier - show when item has UUID */}
                                            {item.uuid && !groupInfo.isGroup && (
                                              <Input
                                                label="Item Identifier"
                                                value={item.uuid}
                                                isReadOnly
                                                classNames={{ inputWrapper: inputStyle.inputWrapper }}
                                                startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                                                endContent={
                                                  <Button
                                                    variant="flat"
                                                    color="default"
                                                    isIconOnly
                                                    onPress={() => copyToClipboard(item.uuid || "")}
                                                  >
                                                    <Icon icon="mdi:content-copy" className="text-default-500" />
                                                  </Button>
                                                }
                                              />
                                            )}
                                          </div>
                                        )}

                                        {/* Group Size Control */}
                                        {viewMode === 'grouped' && groupInfo.isGroup && (
                                          <div className="p-4 pb-0">
                                            <NumberInput
                                              label="Group Size"
                                              placeholder="2"
                                              value={groupInfo.groupSize}
                                              onValueChange={(value) => handleGroupSizeChange(groupInfo.groupId!, value)}
                                              minValue={1}
                                              maxValue={50}
                                              isDisabled={!isItemEditable(item)}
                                              classNames={inputStyle}
                                              startContent={<Icon icon="mdi:group" className="text-default-500 mb-[0.2rem]" />}
                                            />
                                          </div>
                                        )}

                                        <Input
                                          label="Item Code"
                                          placeholder="Enter item code"
                                          value={item.item_code || ""}
                                          onChange={(e) => handleInventoryItemChange(item.id!, 'item_code', e.target.value)}
                                          isRequired
                                          isDisabled={!isItemEditable(item)}
                                          classNames={{ inputWrapper: inputStyle.inputWrapper, base: "p-4 pb-0" }}
                                          startContent={<Icon icon="mdi:barcode" className="text-default-500 mb-[0.2rem]" />}
                                          endContent={
                                            <Button
                                              variant="flat"
                                              color="default"
                                              isIconOnly
                                              onPress={() => copyToClipboard(item.item_code || "")}
                                            >
                                              <Icon icon="mdi:content-copy" className="text-default-500" />
                                            </Button>
                                          }
                                        />

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 pb-0">
                                          <NumberInput
                                            label={`${inventoryForm.measurement_unit ? inventoryForm.measurement_unit.charAt(0).toUpperCase() + inventoryForm.measurement_unit.slice(1) : "Item"} Value`}
                                            placeholder="0"
                                            value={item.unit_value || 0}
                                            onValueChange={(value) => handleInventoryItemChange(item.id!, 'unit_value', value)}
                                            isRequired
                                            isDisabled={!isItemEditable(item)}
                                            minValue={0}
                                            classNames={inputStyle}
                                            endContent={
                                              <div className="absolute right-10 bottom-2">
                                                {item.unit && (
                                                  <Chip
                                                    color="primary"
                                                    variant="flat"
                                                    size="sm"
                                                  >
                                                    {item.unit}
                                                  </Chip>
                                                )}
                                              </div>
                                            }
                                            startContent={<Icon icon="mdi:numeric" className="text-default-500 mb-[0.1rem]" width={16} />}
                                          />

                                          <Autocomplete
                                            label={`${inventoryForm.measurement_unit ? inventoryForm.measurement_unit.charAt(0).toUpperCase() + inventoryForm.measurement_unit.slice(1) : "Item"} Unit`}
                                            placeholder={`Select ${inventoryForm.measurement_unit ? inventoryForm.measurement_unit.charAt(0).toUpperCase() + inventoryForm.measurement_unit.slice(1) : "Item"} unit`}
                                            selectedKey={item.unit || ""}
                                            onSelectionChange={(key) => { handleInventoryItemChange(item.id!, 'unit', key) }}
                                            isRequired
                                            isDisabled={!isItemEditable(item)}
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
                                            selectedKey={item.packaging_unit || ""}
                                            onSelectionChange={(key) => handleInventoryItemChange(item.id!, 'packaging_unit', key)}
                                            isRequired
                                            isDisabled={!isItemEditable(item)}
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
                                            value={item.cost || 0}
                                            onValueChange={(value) => handleInventoryItemChange(item.id!, 'cost', value)}
                                            isDisabled={!isItemEditable(item)}
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
                                            properties={item.properties || {}}
                                            onPropertiesChange={(properties) => handleInventoryItemPropertiesChange(item.id!, properties)}
                                            onInheritFrom={() => handleInheritItemProperties(item.id!)}
                                            showInheritButton={true}
                                            isDisabled={!isItemEditable(item)}
                                          />
                                        </div>

                                        <div className="flex justify-end gap-2 bg-default-100/50 p-4 flex-wrap">
                                          {/* Group Controls - only show in grouped view for non-grouped items */}
                                          {viewMode === 'grouped' && !groupInfo.isGroup && (
                                            <Popover
                                              isOpen={groupPopoverOpen}
                                              onOpenChange={(open) => {
                                                setGroupPopoverOpen(open);
                                                if (open) setGroupSize(2);
                                              }}
                                            >
                                              <PopoverTrigger>
                                                <Button
                                                  color="primary"
                                                  variant="flat"
                                                  size="sm"
                                                  isDisabled={!isItemEditable(item)}
                                                >
                                                  <Icon icon="mdi:group" width={14} height={14} />
                                                  Create group
                                                </Button>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-56">
                                                <div className="p-2 space-y-3">
                                                  <div className="text-sm font-medium">Create Group</div>
                                                  <NumberInput
                                                    label="Group size"
                                                    value={groupSize}
                                                    onValueChange={setGroupSize}
                                                    minValue={2}
                                                    maxValue={50}
                                                    classNames={{
                                                      inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200"
                                                    }}
                                                  />
                                                  <div className="flex justify-end gap-2 mt-2">
                                                    <Button
                                                      size="sm"
                                                      variant="flat"
                                                      onPress={() => setGroupPopoverOpen(false)}
                                                    >
                                                      Cancel
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      color="primary"
                                                      variant="shadow"
                                                      onPress={() => {
                                                        handleCreateGroup(item.id!, groupSize);
                                                        setGroupPopoverOpen(false);
                                                      }}
                                                    >
                                                      Create Group
                                                    </Button>
                                                  </div>
                                                </div>
                                              </PopoverContent>
                                            </Popover>
                                          )}

                                          {/* Ungroup button - only show for grouped items in grouped view */}
                                          {viewMode === 'grouped' && groupInfo.isGroup && (
                                            <Button
                                              color="warning"
                                              variant="flat"
                                              size="sm"
                                              onPress={() => handleUngroupItems(groupInfo.groupId!)}
                                              isDisabled={!isItemEditable(item)}
                                            >
                                              <Icon icon="mdi:ungroup" width={14} height={14} />
                                              Ungroup
                                            </Button>
                                          )}

                                          {/* Duplicate Button */}
                                          <Popover
                                            isOpen={duplicatePopoverOpen}
                                            onOpenChange={(open) => {
                                              setDuplicatePopoverOpen(open);
                                              if (open) setDuplicateCount(1);
                                            }}
                                          >
                                            <PopoverTrigger>
                                              <Button
                                                color="secondary"
                                                variant="flat"
                                                size="sm"
                                                isDisabled={!isItemEditable(item)}
                                              >
                                                <Icon icon="ion:duplicate" width={14} height={14} />
                                                Duplicate {viewMode === 'grouped' && groupInfo.isGroup ? 'Group' : 'Item'}
                                              </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-56">
                                              <div className="p-2 space-y-3">
                                                <div className="text-sm font-medium">
                                                  Duplicate {viewMode === 'grouped' && groupInfo.isGroup ? 'Group' : 'Item'}
                                                </div>
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
                                                      handleDuplicateItem(item.id!, duplicateCount);
                                                      setDuplicatePopoverOpen(false);
                                                    }}
                                                  >
                                                    Duplicate
                                                  </Button>
                                                </div>
                                              </div>
                                            </PopoverContent>
                                          </Popover>

                                          {/* Delete Button */}
                                          <Button
                                            color="danger"
                                            variant="flat"
                                            size="sm"
                                            onPress={() => handleDeleteInventoryItem(item.id!)}
                                            startContent={<Icon icon="mdi:delete" width={16} height={16} />}
                                            isDisabled={!isItemEditable(item)}
                                          >
                                            Remove {viewMode === 'grouped' && groupInfo.isGroup ? 'Group' : 'Item'}
                                          </Button>
                                        </div>
                                      </div>
                                    </AccordionItem>
                                  );
                                })}
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
                            Delete Inventory
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
              Are you sure you want to delete this {itemToDelete?.type === 'group' ? 'group and all its items?' : `${itemToDelete?.type}? This action cannot be undone.`}
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

      </div>
    </motion.div>
  );
}