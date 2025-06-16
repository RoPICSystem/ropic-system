'use client';

import CardList from "@/components/card-list";
import CustomProperties from "@/components/custom-properties";
import LoadingAnimation from '@/components/loading-animation';
import { FilterOption, SearchListPanel } from "@/components/search-list-panel/search-list-panel";
import { getStatusColor, herouiColor } from "@/utils/colors";
import { motionTransition, popoverTransition } from "@/utils/anim";
import { getMeasurementUnitOptions, getPackagingUnitOptions, getUnitFullName, getUnitOptions, getDefaultStandardUnit, convertUnit } from "@/utils/measurements";
import { getUserFromCookies } from '@/utils/supabase/server/user';
import { copyToClipboard, formatDate, formatNumber, formatStatus, showErrorToast } from "@/utils/tools";
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
import CustomScrollbar from "@/components/custom-scrollbar";
import { generateItemDescription } from "@/utils/supabase/server/groq";


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
  const [expandedGroupDetails, setExpandedGroupDetails] = useState<Set<string>>(new Set());

  const defaultMeasurementUnit = "length";
  const defaultPackagingUnit = "roll";
  const defaultUnit = "m";

  // AI description generation
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [descriptionLength, setDescriptionLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [aiPopoverOpen, setAiPopoverOpen] = useState(false);

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
    const params = new URLSearchParams(searchParams.toString());
    params.set("itemId", itemId);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleGenerateDescription = async (length: 'short' | 'medium' | 'long' = 'medium') => {
    setIsGeneratingDescription(true);

    if (!inventoryForm.name.trim()) {
      setError("Please enter an item name first");
      return;
    }

    setError(null);
    setAiPopoverOpen(false);

    try {
      const result = await generateItemDescription({
        itemName: inventoryForm.name,
        measurementUnit: inventoryForm.measurement_unit,
        properties: inventoryForm.properties,
        existingDescription: inventoryForm.description,
        length: length
      });

      if (result.success && result.data) {
        setInventoryForm(prev => ({
          ...prev,
          description: result.data
        }));
      } else {
        setError(result.error || "Failed to generate description");
      }
    } catch (error) {
      setError("An error occurred while generating description");
      console.error(error);
    } finally {
      setIsGeneratingDescription(false);
    }
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
    if (itemId) {
      setSelectedItemId(itemId);
    } else {
      // When there's no itemId in URL, switch to new item mode
      setSelectedItemId(null);
    }
  }, [searchParams]);

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

  // error handling for loading states
  useEffect(() => {
    if (error) {
      showErrorToast("Error", error);
      setError(null);
    }
  }, [error]);

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
                      className="flex items-center gap-2 ">

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

                      {inventory.unit_values.available > 0 && (
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

                      {inventory.unit_values.warehouse > 0 && (
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
                        {/* UUID Field Skeleton - conditional */}
                        {selectedItemId && (
                          <Skeleton className="h-16 w-full rounded-xl" />
                        )}
                        {/* Item Name Skeleton */}
                        <Skeleton className="h-16 w-full rounded-xl" />
                        {/* Measurement Unit and Standard Unit Skeleton */}
                        <div className="flex items-start justify-between gap-4 md:flex-row flex-col">
                          <Skeleton className="h-16 w-full rounded-xl" />
                          <Skeleton className="h-16 w-full rounded-xl" />
                        </div>
                        {/* Description Skeleton */}
                        <Skeleton className="h-24 w-full rounded-xl" />
                        {/* Unit Values Grid Skeleton - only when editing */}
                        {selectedItemId && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-default-100/50 rounded-xl">
                            <div className="text-center space-y-2">
                              <Skeleton className="h-8 w-16 rounded-xl mx-auto" />
                              <Skeleton className="h-4 w-12 rounded-xl mx-auto" />
                            </div>
                            <div className="text-center space-y-2">
                              <Skeleton className="h-8 w-20 rounded-xl mx-auto" />
                              <Skeleton className="h-4 w-16 rounded-xl mx-auto" />
                            </div>
                            <div className="text-center space-y-2">
                              <Skeleton className="h-8 w-24 rounded-xl mx-auto" />
                              <Skeleton className="h-4 w-20 rounded-xl mx-auto" />
                            </div>
                          </div>
                        )}
                        {/* Custom Properties Skeleton */}
                        <div className="mt-6">
                          <div className="border-2 border-default-200 bg-default-50 rounded-xl">
                            <div className="flex justify-between items-center p-4">
                              <Skeleton className="h-6 w-32 rounded-xl" />
                              <Skeleton className="h-8 w-16 rounded-xl" />
                            </div>
                            <div className="py-8 text-center m-4 mt-0 border border-dashed border-default-300 rounded-lg h-48 flex flex-col items-center justify-center">
                              <Skeleton className="h-8 w-8 rounded-full mx-auto mb-2" />
                              <Skeleton className="h-4 w-40 rounded-xl mx-auto" />
                              <Skeleton className="h-6 w-32 rounded-xl mx-auto mt-2" />
                            </div>
                          </div>
                        </div>
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
                        isReadOnly={selectedItemId ? true : false}
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
                          isRequired={selectedItemId ? false : true}
                          isReadOnly={selectedItemId ? true : false}
                          isClearable={selectedItemId ? false : true}
                          inputProps={autoCompleteStyle}
                          popoverProps={{ className: selectedItemId ? "collapse" : "" }}
                          selectorButtonProps={{ className: selectedItemId ? "collapse" : "" }}
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
                          isRequired={selectedItemId ? false : true}
                          isReadOnly={selectedItemId ? true : false}
                          isClearable={selectedItemId ? false : true}
                          inputProps={autoCompleteStyle}
                          popoverProps={{ className: selectedItemId ? "collapse" : "" }}
                          selectorButtonProps={{ className: selectedItemId ? "collapse" : "" }}
                        >
                          {getUnitOptions(inventoryForm.measurement_unit).map((unit) => (
                            <AutocompleteItem key={unit}>{getUnitFullName(unit)}</AutocompleteItem>
                          ))}
                        </Autocomplete>
                      </div>

                      <Textarea
                        label="Description"
                        value={inventoryForm.description}
                        isReadOnly={selectedItemId ? true : false}
                        onChange={(e) => handleInventoryFormChange('description', e.target.value)}
                        placeholder="Enter item description (optional)"
                        classNames={{
                          inputWrapper: `${inputStyle.inputWrapper} pr-12`,
                        }}
                        startContent={<Icon icon="mdi:text-box" className="text-default-500 mt-[0.1rem]" />}
                        endContent={
                          <div className="flex flex-col gap-2 mt-1 absolute right-3 top-3">
                            <Popover
                              isOpen={aiPopoverOpen}
                              onOpenChange={setAiPopoverOpen}
                              classNames={{ content: "!backdrop-blur-lg bg-background/65" }}
                              motionProps={popoverTransition('right')}
                              placement="left"
                            >
                              <PopoverTrigger>
                                <Button
                                  variant="flat"
                                  color="primary"
                                  isIconOnly
                                  size="sm"
                                  isDisabled={!inventoryForm.name.trim() || isLoading}
                                  title="Generate description"
                                  isLoading={isGeneratingDescription}
                                >
                                  {!isGeneratingDescription &&
                                    <Icon icon="mingcute:ai-fill" className="text-primary-500 text-md" />
                                  }
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-0">
                                <div className="w-full">
                                  <div className="text-sm font-medium text-center p-4 pb-0">
                                    Generate Description
                                  </div>

                                  <div className="space-y-2 p-4">
                                    <div className="flex flex-col gap-2 w-full">
                                      <Button
                                        size="sm"
                                        variant={descriptionLength === 'short' ? 'solid' : 'flat'}
                                        color="primary"
                                        className="justify-start"
                                        onPress={() => {
                                          setDescriptionLength('short');
                                          handleGenerateDescription('short');
                                        }}
                                        isLoading={isGeneratingDescription && descriptionLength === 'short'}
                                        startContent={<Icon icon="mdi:text-short" width={16} />}
                                      >
                                        Short (1 sentence)
                                      </Button>

                                      <Button
                                        size="sm"
                                        variant={descriptionLength === 'medium' ? 'solid' : 'flat'}
                                        color="primary"
                                        className="justify-start"
                                        onPress={() => {
                                          setDescriptionLength('medium');
                                          handleGenerateDescription('medium');
                                        }}
                                        isLoading={isGeneratingDescription && descriptionLength === 'medium'}
                                        startContent={<Icon icon="mdi:text" width={16} />}
                                      >
                                        Medium (2-3 sentences)
                                      </Button>

                                      <Button
                                        size="sm"
                                        variant={descriptionLength === 'long' ? 'solid' : 'flat'}
                                        color="primary"
                                        className="justify-start"
                                        onPress={() => {
                                          setDescriptionLength('long');
                                          handleGenerateDescription('long');
                                        }}
                                        isLoading={isGeneratingDescription && descriptionLength === 'long'}
                                        startContent={<Icon icon="mdi:text-long" width={16} />}
                                      >
                                        Long (3-5 sentences)
                                      </Button>
                                    </div>
                                  </div>

                                  {inventoryForm.description && (
                                    <div className="p-4 border-t border-default-200">
                                      <Button
                                        size="sm"
                                        variant="flat"
                                        color="secondary"
                                        className="w-full justify-start"
                                        onPress={() => {
                                          handleGenerateDescription(descriptionLength);
                                        }}
                                        isLoading={isGeneratingDescription}
                                        startContent={<Icon icon="mdi:refresh" width={16} />}
                                      >
                                        Improve existing
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        }
                      />

                      {/* Display aggregated values if they exist */}
                      {inventoryForm.unit_values && inventoryForm.count && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2 bg-default-100/50 rounded-xl border-2 border-default-200">
                          <div className="text-center flex flex-col items-center gap-1 bg-default-200/50 rounded-md p-4">
                            <div className="text-sm text-default-600">
                              Total
                            </div>
                            <div className="text-default-600 flex flex-col items-center gap-1">
                              <span className="inline-flex items-end gap-1">
                                <span className="text-2xl font-bold">
                                  {formatNumber(inventoryForm.unit_values.total)}
                                </span>
                                <span className="text-md text-default-600/75 font-semibold">
                                  {inventoryForm.standard_unit}
                                </span>
                              </span>
                              {(() => {
                                const totalCost = inventoryItemsList.reduce((total, item) => total + (item.cost || 0), 0);

                                return totalCost > 0 ? (
                                  <span className="inline-flex text-default-600 items-center gap-1 bg-default-200 rounded-full px-2 py-[0.15rem] w-full justify-center">
                                    <span className="text-sm font-semibold">
                                      ₱ {formatNumber(totalCost)}
                                    </span>
                                  </span>
                                ) : null;
                              })()}
                              <span className="inline-flex text-default-100 items-center gap-1 bg-default-600 rounded-full px-2 py-[0.15rem] w-full justify-center">
                                <span className="text-sm font-bold">
                                  {formatNumber(inventoryForm.count.total)}
                                </span>
                                <span className="text-xs text-default-100/75 font-semibold">
                                  items
                                </span>
                              </span>
                            </div>
                          </div>
                          <div className="text-center flex flex-col items-center gap-1 bg-success-200/50 rounded-md p-4">
                            <div className="text-sm text-success-600">
                              Available
                            </div>
                            <div className="text-success-600 flex flex-col items-center gap-1">
                              <span className="inline-flex items-end gap-1">
                                <span className="text-2xl font-bold">
                                  {formatNumber(inventoryForm.unit_values.available)}
                                </span>
                                <span className="text-md text-success-600/75 font-semibold">
                                  {inventoryForm.standard_unit}
                                </span>
                              </span>
                              {(() => {
                                const availableCost = inventoryItemsList
                                  .filter(item => !item.status || item.status === 'AVAILABLE')
                                  .reduce((total, item) => total + (item.cost || 0), 0);

                                return availableCost > 0 ? (
                                  <span className="inline-flex text-success-600 items-center gap-1 bg-success-200 rounded-full px-2 py-[0.15rem] w-full justify-center">
                                    <span className="text-sm font-semibold">
                                      ₱ {formatNumber(availableCost)}
                                    </span>
                                  </span>
                                ) : null;
                              })()}
                              <span className="inline-flex text-success-100 items-center gap-1 bg-success-600 rounded-full px-2 py-[0.15rem] w-full justify-center">
                                <span className="text-sm font-bold">
                                  {formatNumber(inventoryForm.count.available)}
                                </span>
                                <span className="text-xs text-success-100/75 font-semibold">
                                  items
                                </span>
                              </span>
                            </div>
                          </div>
                          <div className="text-center flex flex-col items-center gap-1 bg-warning-200/50 rounded-md p-4">
                            <div className="text-sm text-warning-600">
                              In Warehouse
                            </div>
                            <div className="text-warning-600 flex flex-col items-center gap-1">
                              <span className="inline-flex items-end gap-1">
                                <span className="text-2xl font-bold">
                                  {formatNumber(inventoryForm.unit_values.warehouse)}
                                </span>
                                <span className="text-md text-warning-600/75 font-semibold">
                                  {inventoryForm.standard_unit}
                                </span>
                              </span>
                              {(() => {
                                const warehouseCost = inventoryItemsList
                                  .filter(item => item.status === 'IN_WAREHOUSE')
                                  .reduce((total, item) => total + (item.cost || 0), 0);

                                return warehouseCost > 0 ? (
                                  <span className="inline-flex text-warning-600 items-center gap-1 bg-warning-200 rounded-full px-2 py-[0.15rem] w-full justify-center">
                                    <span className="text-sm font-semibold">
                                      ₱ {formatNumber(warehouseCost)}
                                    </span>
                                  </span>
                                ) : null;
                              })()}
                              <span className="inline-flex text-warning-100 items-center gap-1 bg-warning-600 rounded-full px-2 py-[0.15rem] w-full justify-center">
                                <span className="text-sm font-bold">
                                  {formatNumber(inventoryForm.count.warehouse)}
                                </span>
                                <span className="text-xs text-warning-100/75 font-semibold">
                                  items
                                </span>
                              </span>
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
                        {/* Header with stats and buttons */}
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Skeleton className="h-6 w-16 rounded-full" />
                            <Skeleton className="h-6 w-20 rounded-full" />
                            <Skeleton className="h-6 w-18 rounded-full" />
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Skeleton className="h-8 w-20 rounded-xl" />
                            <Skeleton className="h-8 w-24 rounded-xl" />
                          </div>
                        </div>

                        {/* Accordion-style Inventory Items Skeleton */}
                        <div className="-m-4">
                          <div className="space-y-4 mx-4">
                            {[1, 2].map((i) => (
                              <div key={i} className="mt-4 p-0 bg-transparent rounded-xl overflow-hidden border-2 border-default-200">
                                {/* Accordion Header */}
                                <div className="p-4 bg-default-100/25">
                                  <div className="flex justify-between items-center w-full">
                                    <div className="flex items-center gap-2">
                                      <Skeleton className="h-6 w-16 rounded-xl" />
                                    </div>
                                    <div className="flex gap-2">
                                      <Skeleton className="h-6 w-20 rounded-full" />
                                      <Skeleton className="h-6 w-24 rounded-full" />
                                    </div>
                                  </div>
                                </div>

                                {/* Accordion Content */}
                                <div className="space-y-4">
                                  {/* Identifiers Section */}
                                  <div className="space-y-4 px-4 pt-4">
                                    <Skeleton className="h-16 w-full rounded-xl" />
                                  </div>

                                  {/* Item Code */}
                                  <div className="p-4 pb-0">
                                    <Skeleton className="h-16 w-full rounded-xl" />
                                  </div>

                                  {/* Unit Value and Unit */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 pb-0">
                                    <Skeleton className="h-16 w-full rounded-xl" />
                                    <Skeleton className="h-16 w-full rounded-xl" />
                                  </div>

                                  {/* Packaging Unit and Cost */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 pb-0">
                                    <Skeleton className="h-16 w-full rounded-xl" />
                                    <Skeleton className="h-16 w-full rounded-xl" />
                                  </div>

                                  {/* Custom Properties */}
                                  <div className="p-4">
                                    <div className="border-2 border-default-200 bg-default-50 rounded-xl">
                                      <div className="flex justify-between items-center p-4">
                                        <Skeleton className="h-6 w-32 rounded-xl" />
                                        <div className="flex gap-2">
                                          <Skeleton className="h-8 w-16 rounded-xl" />
                                          <Skeleton className="h-8 w-12 rounded-xl" />
                                        </div>
                                      </div>
                                      <div className="py-8 text-center m-4 mt-0 border border-dashed border-default-300 rounded-lg h-48 flex flex-col items-center justify-center">
                                        <Skeleton className="h-8 w-8 rounded-full mx-auto mb-2" />
                                        <Skeleton className="h-4 w-40 rounded-xl mx-auto" />
                                        <Skeleton className="h-6 w-32 rounded-xl mx-auto mt-2" />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="flex justify-end gap-2 bg-default-100/50 p-4 flex-wrap">
                                    <Skeleton className="h-8 w-28 rounded-xl" />
                                    <Skeleton className="h-8 w-32 rounded-xl" />
                                    <Skeleton className="h-8 w-24 rounded-xl" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  }>
                  <div>
                    <h2 className="text-xl font-semibold mb-4 w-full text-center">Inventory Items</h2>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {inventoryItemsList && inventoryItemsList.length > 0 && (
                            <>
                              {(() => {
                                const groupedItems = getGroupedItems();
                                const groupCount = Object.keys(groupedItems).length;
                                const ungroupedCount = groupedItems['ungrouped']?.length || 0;
                                const actualGroupCount = ungroupedCount > 0 ? groupCount - 1 : groupCount;

                                return (
                                  <>
                                    {actualGroupCount > 0 && (
                                      <Chip color="primary" variant="flat" size="sm" className="flex-shrink-0">
                                        {actualGroupCount} group{actualGroupCount !== 1 ? 's' : ''}
                                      </Chip>
                                    )}
                                    {ungroupedCount > 0 && (
                                      <Chip color="secondary" variant="flat" size="sm" className="flex-shrink-0">
                                        {ungroupedCount} ungrouped item{ungroupedCount !== 1 ? 's' : ''}
                                      </Chip>
                                    )}
                                  </>
                                );
                              })()}
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
                                          {/* Group/Item Title */}
                                          <div className="flex items-center gap-2">
                                            <span className="font-medium whitespace-nowrap">
                                              {viewMode === 'grouped' && groupInfo.isGroup ? `Group ${displayNumber}` : `Item ${viewMode === 'flat' ? item.id : displayNumber}`}
                                            </span>
                                          </div>
                                          <div className="flex gap-2 flex-wrap justify-end items-center">
                                            {/* Available Items Chip */}
                                            {(() => {
                                              if (viewMode === 'grouped' && groupInfo.isGroup) {
                                                const groupItems = inventoryItemsList.filter(groupItem =>
                                                  groupItem.group_id === groupInfo.groupId
                                                );
                                                const availableItems = groupItems.filter(groupItem =>
                                                  !groupItem.status || groupItem.status === 'AVAILABLE'
                                                );

                                                if (availableItems.length > 0) {
                                                  const totalAvailableValue = availableItems.reduce((total, groupItem) => {
                                                    if (groupItem.unit_value) {
                                                      return total + groupItem.unit_value;
                                                    }
                                                    return total;
                                                  }, 0);

                                                  if (totalAvailableValue > 0 && item.unit) {
                                                    const originalDisplay = `${formatNumber(totalAvailableValue)} ${item.unit}`;

                                                    if (inventoryForm.standard_unit && item.unit !== inventoryForm.standard_unit) {
                                                      const totalInStandardUnit = availableItems.reduce((total, groupItem) => {
                                                        if (groupItem.unit && groupItem.unit_value && inventoryForm.standard_unit) {
                                                          return total + convertUnit(groupItem.unit_value, groupItem.unit, inventoryForm.standard_unit);
                                                        }
                                                        return total;
                                                      }, 0);
                                                      return (
                                                        <Chip color="success" variant="flat" size="sm" className="whitespace-nowrap">
                                                          {`${originalDisplay} (${formatNumber(totalInStandardUnit)} ${inventoryForm.standard_unit}) available`}
                                                        </Chip>
                                                      );
                                                    }

                                                    return (
                                                      <Chip color="success" variant="flat" size="sm" className="whitespace-nowrap">
                                                        {`${originalDisplay} available`}
                                                      </Chip>
                                                    );
                                                  }
                                                }
                                              }
                                              return null;
                                            })()}

                                            {/* In Warehouse Items Chip */}
                                            {(() => {
                                              if (viewMode === 'grouped' && groupInfo.isGroup) {
                                                const groupItems = inventoryItemsList.filter(groupItem =>
                                                  groupItem.group_id === groupInfo.groupId
                                                );
                                                const warehouseItems = groupItems.filter(groupItem =>
                                                  groupItem.status === 'IN_WAREHOUSE'
                                                );

                                                if (warehouseItems.length > 0) {
                                                  const totalWarehouseValue = warehouseItems.reduce((total, groupItem) => {
                                                    if (groupItem.unit_value) {
                                                      return total + groupItem.unit_value;
                                                    }
                                                    return total;
                                                  }, 0);

                                                  if (totalWarehouseValue > 0 && item.unit) {
                                                    const originalDisplay = `${formatNumber(totalWarehouseValue)} ${item.unit}`;

                                                    if (inventoryForm.standard_unit && item.unit !== inventoryForm.standard_unit) {
                                                      const totalInStandardUnit = warehouseItems.reduce((total, groupItem) => {
                                                        if (groupItem.unit && groupItem.unit_value && inventoryForm.standard_unit) {
                                                          return total + convertUnit(groupItem.unit_value, groupItem.unit, inventoryForm.standard_unit);
                                                        }
                                                        return total;
                                                      }, 0);
                                                      return (
                                                        <Chip color="warning" variant="flat" size="sm" className="whitespace-nowrap">
                                                          {`${originalDisplay} (${formatNumber(totalInStandardUnit)} ${inventoryForm.standard_unit}) in warehouse`}
                                                        </Chip>
                                                      );
                                                    }

                                                    return (
                                                      <Chip color="warning" variant="flat" size="sm" className="whitespace-nowrap">
                                                        {`${originalDisplay} in warehouse`}
                                                      </Chip>
                                                    );
                                                  }
                                                }
                                              }
                                              return null;
                                            })()}

                                            {/* Used Items Chip */}
                                            {(() => {
                                              if (viewMode === 'grouped' && groupInfo.isGroup) {
                                                const groupItems = inventoryItemsList.filter(groupItem =>
                                                  groupItem.group_id === groupInfo.groupId
                                                );
                                                const usedItems = groupItems.filter(groupItem =>
                                                  groupItem.status === 'USED'
                                                );

                                                if (usedItems.length > 0) {
                                                  const totalUsedValue = usedItems.reduce((total, groupItem) => {
                                                    if (groupItem.unit_value) {
                                                      return total + groupItem.unit_value;
                                                    }
                                                    return total;
                                                  }, 0);

                                                  if (totalUsedValue > 0 && item.unit) {
                                                    const originalDisplay = `${formatNumber(totalUsedValue)} ${item.unit}`;

                                                    if (inventoryForm.standard_unit && item.unit !== inventoryForm.standard_unit) {
                                                      const totalInStandardUnit = usedItems.reduce((total, groupItem) => {
                                                        if (groupItem.unit && groupItem.unit_value && inventoryForm.standard_unit) {
                                                          return total + convertUnit(groupItem.unit_value, groupItem.unit, inventoryForm.standard_unit);
                                                        }
                                                        return total;
                                                      }, 0);
                                                      return (
                                                        <Chip color="danger" variant="flat" size="sm" className="whitespace-nowrap">
                                                          {`${originalDisplay} (${formatNumber(totalInStandardUnit)} ${inventoryForm.standard_unit}) used`}
                                                        </Chip>
                                                      );
                                                    }

                                                    return (
                                                      <Chip color="danger" variant="flat" size="sm" className="whitespace-nowrap">
                                                        {`${originalDisplay} used`}
                                                      </Chip>
                                                    );
                                                  }
                                                }
                                              }
                                              return null;
                                            })()}

                                            {!groupInfo.isGroup && item.unit && item.unit !== "" && item.unit_value && item.unit_value > 0 && (
                                              <Chip color="primary" variant="flat" size="sm" className="whitespace-nowrap">
                                                {(() => {
                                                  const unitValue = parseFloat(String(item.unit_value || 0));
                                                  const originalDisplay = `${formatNumber(unitValue)} ${item.unit}`;

                                                  // Show converted value if standard unit is different from item unit
                                                  if (inventoryForm.standard_unit && item.unit !== inventoryForm.standard_unit) {
                                                    const convertedValue = convertUnit(unitValue, item.unit, inventoryForm.standard_unit);
                                                    return `${originalDisplay} (${formatNumber(convertedValue)} ${inventoryForm.standard_unit})`;
                                                  }

                                                  return originalDisplay;
                                                })()}
                                              </Chip>
                                            )}

                                            {!groupInfo.isGroup && item.status && item.status !== "AVAILABLE" && (
                                              <Chip
                                                color={getStatusColor(item.status)}
                                                variant="flat"
                                                size="sm"
                                                className="whitespace-nowrap">
                                                {formatStatus(item.status)}
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

                                        {/* Group Items Details - only show for groups in grouped view */}
                                        {viewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId && selectedItemId && (
                                          <div className="px-2 pb-4">
                                            <Accordion
                                              selectionMode="multiple"
                                              variant="splitted"
                                              selectedKeys={expandedGroupDetails}
                                              onSelectionChange={(keys) => setExpandedGroupDetails(keys as Set<string>)}
                                              itemClasses={{
                                                base: "p-0 bg-default-50 rounded-xl overflow-hidden border-2 border-default-200",
                                                title: "font-normal text-lg font-semibold",
                                                trigger: "p-4 data-[hover=true]:bg-default-100 flex items-center transition-colors",
                                                indicator: "text-medium",
                                                content: "text-small p-0",
                                              }}
                                            >
                                              <AccordionItem
                                                key={`group-details-${groupInfo.groupId}`}
                                                title={
                                                  <div className="flex justify-between items-center w-full">
                                                    <span className="text-lg font-semibold">
                                                      Group Items
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                      <Chip color="primary" variant="flat" size="sm">
                                                        {groupInfo.groupSize} total items
                                                      </Chip>
                                                      {/* Total unit value */}
                                                      <Chip color="primary" variant="flat" size="sm">
                                                        {(() => {
                                                          const groupItems = inventoryItemsList.filter(groupItem => groupItem.group_id === groupInfo.groupId);
                                                          const totalInOriginalUnit = groupItems.reduce((total: number, groupItem: any) => {
                                                            const unitValue = parseFloat(String(groupItem.unit_value || 0));
                                                            return total + unitValue;
                                                          }, 0);

                                                          // Show converted value if standard unit is different from item unit
                                                          if (inventoryForm.standard_unit && item.unit && item.unit !== inventoryForm.standard_unit) {
                                                            const totalInStandardUnit = groupItems.reduce((total: number, groupItem: any) => {
                                                              if (groupItem.unit && groupItem.unit_value && inventoryForm.standard_unit) {
                                                                return total + convertUnit(groupItem.unit_value, groupItem.unit, inventoryForm.standard_unit);
                                                              }
                                                              return total;
                                                            }, 0);

                                                            return `${formatNumber(totalInOriginalUnit)} ${item.unit} (${formatNumber(totalInStandardUnit)} ${inventoryForm.standard_unit}) in total`;
                                                          } else {
                                                            return `${formatNumber(totalInOriginalUnit)} ${item.unit || "units"} in total`;
                                                          }
                                                        })()}
                                                      </Chip>
                                                    </div>
                                                  </div>
                                                }
                                              >
                                                <div className="space-y-4 p-4">
                                                  {inventoryItemsList
                                                    .filter(groupItem => groupItem.group_id === groupInfo.groupId)
                                                    .map((groupItem, index) => (
                                                      <div
                                                        key={groupItem.id}
                                                        className="p-4 bg-background/50 rounded-xl border-2 border-default-200"
                                                      >
                                                        <div className="flex items-center justify-between mb-4">
                                                          <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-default-800">
                                                              Item {index + 1}
                                                            </span>
                                                            {groupItem.status && groupItem.status !== "AVAILABLE" && (
                                                              <Chip
                                                                color={getStatusColor(groupItem.status)}
                                                                variant="flat"
                                                                size="sm"
                                                              >
                                                                {groupItem.status}
                                                              </Chip>
                                                            )}
                                                          </div>
                                                        </div>

                                                        {/* Item Identifier */}
                                                        {groupItem.uuid && (
                                                          <div>
                                                            <Input
                                                              label="Item Identifier"
                                                              value={groupItem.uuid}
                                                              isReadOnly
                                                              classNames={inputStyle}
                                                              startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                                                              endContent={
                                                                <Button
                                                                  variant="flat"
                                                                  color="default"
                                                                  isIconOnly
                                                                  onPress={() => copyToClipboard(groupItem.uuid || "")}
                                                                >
                                                                  <Icon icon="mdi:content-copy" className="text-default-500" />
                                                                </Button>
                                                              }
                                                            />
                                                          </div>
                                                        )}
                                                      </div>
                                                    ))}
                                                </div>
                                              </AccordionItem>
                                            </Accordion>
                                          </div>
                                        )}


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
    </motion.div >
  );
}