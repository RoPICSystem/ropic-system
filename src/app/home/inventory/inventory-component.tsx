import { motionTransition, popoverTransition } from '@/utils/anim';
import {
  Accordion, AccordionItem, Alert, Autocomplete, AutocompleteItem, Button,
  Chip, Form, Input, Modal, ModalBody, ModalContent, ModalFooter,
  ModalHeader, NumberInput, Popover, PopoverContent, PopoverTrigger,
  Skeleton, Textarea, useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from "react";

import CardList from '@/components/card-list';
import CustomProperties from "@/components/custom-properties";
import LoadingAnimation from '@/components/loading-animation';
import { getStatusColor } from '@/utils/colors';
import { getMeasurementUnitOptions, getPackagingUnitOptions, getUnitFullName, getUnitOptions, getDefaultStandardUnit, convertUnit } from '@/utils/measurements';
import { copyToClipboard, formatNumber, formatStatus } from '@/utils/tools';
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
import { generateItemDescription } from "@/utils/supabase/server/groq";
import { createClient } from "@/utils/supabase/client";

import {
  createInventoryItem,
  deleteInventoryItem,
  getInventoryItem,
  InventoryItem,
  updateInventoryItem,
  Inventory
} from './actions';

interface InventoryComponentProps {
  // Core identifiers
  inventoryId: string | null;

  // User and permissions
  user: any;

  // Callbacks for external actions
  onInventoryUpdate?: (inventoryId: string) => void;
  onErrors?: (errors: Record<string, string>) => void;

  // Optional overrides for specific behaviors
  allowStatusUpdates?: boolean;
  readOnlyMode?: boolean;

  // Optional initial data
  initialFormData?: Partial<Inventory>;
}

export function InventoryComponent({
  inventoryId,
  user,
  onInventoryUpdate,
  onErrors,
  allowStatusUpdates = true,
  readOnlyMode = false,
  initialFormData = {}
}: InventoryComponentProps) {

  // ===== STATE MANAGEMENT =====
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isTransitioningToNew, setIsTransitioningToNew] = useState(false);

  // Modal states
  const deleteModal = useDisclosure();

  // Error and validation states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Options state
  const [measurementUnitOptions, setMeasurementUnitOptions] = useState<string[]>([]);
  const [packagingUnitOptions, setPackagingUnitOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);

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
    measurement_unit: "length",
    standard_unit: "m",
    company_uuid: user?.company_uuid || "",
    properties: {},
    ...initialFormData
  });

  // Inventory items state
  const [inventoryItemsList, setInventoryItemsList] = useState<(Partial<InventoryItem> & { company_uuid: string, id: number, is_new?: boolean })[]>([]);
  const [nextItemId, setNextItemId] = useState(1);
  const [originalInventoryItems, setOriginalInventoryItems] = useState<(Partial<InventoryItem> & { id: number })[]>([]);

  // View mode state
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');

  // Delete confirmation
  const [itemToDelete, setItemToDelete] = useState<{ type: 'item' | 'inventoryItem' | 'group', id: string | number, groupId?: string }>();

  // Duplication state
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [duplicatePopoverOpen, setDuplicatePopoverOpen] = useState(false);

  // Grouping state
  const [groupSize, setGroupSize] = useState(2);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);

  // Expanded items state
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedGroupDetails, setExpandedGroupDetails] = useState<Set<string>>(new Set());

  // AI description generation
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [descriptionLength, setDescriptionLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [aiPopoverOpen, setAiPopoverOpen] = useState(false);

  const defaultMeasurementUnit = "length";
  const defaultPackagingUnit = "roll";
  const defaultUnit = "m";

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  const autoCompleteStyle = { classNames: inputStyle };

  // ===== HELPER FUNCTIONS =====
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

  const getTotalStandardUnits = () => {
    return inventoryItemsList.reduce((total, item) => {
      if (item.unit && item.unit_value && inventoryForm.standard_unit) {
        const convertedValue = convertUnit(item.unit_value, item.unit, inventoryForm.standard_unit);
        return total + convertedValue;
      }
      return total;
    }, 0);
  };

  const getTotalCost = () => {
    return inventoryItemsList.reduce((total, item) => total + (item.cost || 0), 0);
  };

  const isItemEditable = (item: any) => {
    return !readOnlyMode && (!item.status || item.status === "AVAILABLE");
  };

  const canEditLimited = (): boolean => {
    return !readOnlyMode && (user?.is_admin === true || inventoryId === null);
  };

  const canEditAllFields = (): boolean => {
    return !readOnlyMode && (user?.is_admin === true || inventoryId === null);
  };

  // ===== CORE FUNCTIONS =====
  const loadInventoryDetails = async (inventoryId: string) => {
    try {
      const result = await getInventoryItem(inventoryId);
      setIsLoading(false);

      if (result.success && result.data) {
        const inventoryData = result.data;

        setInventoryForm({
          uuid: inventoryData.uuid,
          name: inventoryData.name,
          description: inventoryData.description || "",
          measurement_unit: inventoryData.measurement_unit || "",
          standard_unit: inventoryData.standard_unit || getDefaultStandardUnit(inventoryData.measurement_unit || ""),
          company_uuid: inventoryData.company_uuid,
          properties: inventoryData.properties || {},
          unit_values: inventoryData.unit_values,
          count: inventoryData.count
        });

        const inventoryItems = inventoryData.inventory_items || [];
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

        if (newInventoryItems.length > 0) {
          setExpandedItems(new Set([`${newInventoryItems[0].id}`]));
        }

        return inventoryData;
      } else {
        console.error("Failed to load inventory details:", result.error);
        return null;
      }
    } catch (error) {
      console.error("Error loading inventory details:", error);
      return null;
    }
  };

  const resetForm = () => {
    setInventoryForm({
      name: "",
      description: "",
      measurement_unit: defaultMeasurementUnit,
      standard_unit: defaultUnit,
      company_uuid: user?.company_uuid || "",
      properties: {},
      ...initialFormData
    });
    setUnitOptions(getUnitOptions(defaultMeasurementUnit));
    setInventoryItemsList([]);
    setOriginalInventoryItems([]);
    setNextItemId(1);
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

      const groupedItems = groupInventoryItems(prev);
      const groupInfo = getGroupInfo(itemToUpdate, groupedItems);

      if (groupInfo.isGroup && groupInfo.groupId) {
        return prev.map(item => {
          if (item.group_id === groupInfo.groupId) {
            return { ...item, [field]: value };
          }
          return item;
        });
      } else {
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
    if (!inventoryId) return;
    setItemToDelete({ type: 'item', id: inventoryId });
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
          // Handle successful deletion
          if (onInventoryUpdate) {
            onInventoryUpdate('');
          }
          resetForm();
        }
      } else if (itemToDelete.type === 'group' && itemToDelete.groupId) {
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
        setErrors(prev => ({ ...prev, general: `Failed to delete ${itemToDelete.type}` }));
      }
    } catch (err) {
      setErrors(prev => ({ ...prev, general: `An error occurred while deleting ${itemToDelete.type}` }));
      console.error(err);
    } finally {
      setIsLoading(false);
      deleteModal.onClose();
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!inventoryForm.name) {
      newErrors.name = "Item name is required";
    }

    if (inventoryItemsList.length === 0) {
      newErrors.inventoryItems = "At least one inventory item is required";
    }

    for (const item of inventoryItemsList) {
      if (!item.unit_value && item.unit_value !== 0) {
        newErrors.unitValue = "Unit value is required for all items";
        break;
      }

      if (!item.unit) {
        newErrors.unit = "Metric Unit is required for all items";
        break;
      }

      if (!item.item_code) {
        newErrors.itemCode = "Item code is required for all items";
        break;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setError(null);

    try {
      if (inventoryId) {
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
          inventoryId,
          itemUpdates,
          itemUpdates_list,
          newItems,
          deletedItems
        );

        if (!result.success) {
          throw new Error(result.error || "Failed to update inventory item");
        }

        await loadInventoryDetails(inventoryId);
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

        if (result.data && onInventoryUpdate) {
          onInventoryUpdate(result.data.uuid);
        }
      }
    } catch (err) {
      setError((err as Error).message || "An error occurred");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // ===== EFFECTS =====
  useEffect(() => {
    const initComponent = async () => {
      try {
        setMeasurementUnitOptions(await getMeasurementUnitOptions());
        setPackagingUnitOptions(await getPackagingUnitOptions());
        setUnitOptions(getUnitOptions(defaultMeasurementUnit));
      } catch (error) {
        console.error("Error initializing component:", error);
        setError("Failed to load component data");
      }
    };

    initComponent();
  }, []);

  // Load inventory when inventoryId changes
  useEffect(() => {
    const loadInventory = async () => {
      setIsLoading(true);

      if (!inventoryId || !user?.company_uuid) {
        if (inventoryId === null) {
          setIsTransitioningToNew(true);
          setTimeout(() => {
            setIsTransitioningToNew(false);
          }, 300);
        }

        resetForm();
        setIsLoading(false);
        return;
      }

      try {
        await loadInventoryDetails(inventoryId);
      } catch (error) {
        console.error("Error loading inventory:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInventory();
  }, [inventoryId, user?.company_uuid]);

  useEffect(() => {
    if (Object.keys(errors).length > 0 && onErrors) {
      onErrors(errors);
    }
  }, [errors, onErrors]);

  // Set up real-time updates
  useEffect(() => {
    if (!user?.company_uuid || !inventoryId) return;

    const supabase = createClient();

    const inventoryChannel = supabase
      .channel('inventory-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_items',
          filter: `company_uuid=eq.${user.company_uuid}`,
        },
        async (payload) => {
          console.log('Real-time update received:', payload);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const updatedItem = payload.new;
            setInventoryItemsList(prev => {
              const existingIndex = prev.findIndex(item => item.uuid === updatedItem.uuid);
              if (existingIndex >= 0) {
                const updatedItems = [...prev];
                updatedItems[existingIndex] = { ...updatedItems[existingIndex], ...updatedItem };
                return updatedItems;
              } else {
                return [...prev, { 
                  ...updatedItem, 
                  id: Math.max(...prev.map(item => item.id), 0) + 1,
                  company_uuid: updatedItem.company_uuid,
                  is_new: false 
                }];
              }
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedItem = payload.old as InventoryItem;
            setInventoryItemsList(prev => prev.filter(item => item.uuid !== deletedItem.uuid));
          }
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up real-time subscriptions for inventory');
      supabase.removeChannel(inventoryChannel);
    };
  }, [user?.company_uuid]);


  return (
    <div>
      <Form id="inventoryForm" onSubmit={handleSubmit} className="items-stretch space-y-4">
        <CardList>
          <LoadingAnimation
            condition={!user || isLoading || isTransitioningToNew}
            skeleton={
              <div className="space-y-4">
                <Skeleton className="h-6 w-48 rounded-xl mb-4 mx-auto" />
                <div className="space-y-4">
                  {/* UUID Field Skeleton - conditional */}
                  {inventoryId && (
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
                  
                  {inventoryId && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-2 bg-default-100/50 rounded-xl border-2 border-default-200">
                      <div className="text-center flex flex-col items-center gap-1 bg-default-200/50 rounded-md p-4">
                        <Skeleton className="h-4 w-12 rounded-xl" />
                        <div className="flex flex-col items-center gap-1">
                          <Skeleton className="h-8 w-20 rounded-xl" />
                          <Skeleton className="h-6 w-16 rounded-full" />
                          <Skeleton className="h-6 w-20 rounded-full" />
                        </div>
                      </div>
                      <div className="text-center flex flex-col items-center gap-1 bg-success-200/50 rounded-md p-4">
                        <Skeleton className="h-4 w-16 rounded-xl" />
                        <div className="flex flex-col items-center gap-1">
                          <Skeleton className="h-8 w-24 rounded-xl" />
                          <Skeleton className="h-6 w-16 rounded-full" />
                          <Skeleton className="h-6 w-20 rounded-full" />
                        </div>
                      </div>
                      <div className="text-center flex flex-col items-center gap-1 bg-warning-200/50 rounded-md p-4">
                        <Skeleton className="h-4 w-20 rounded-xl" />
                        <div className="flex flex-col items-center gap-1">
                          <Skeleton className="h-8 w-28 rounded-xl" />
                          <Skeleton className="h-6 w-20 rounded-full" />
                          <Skeleton className="h-6 w-24 rounded-full" />
                        </div>
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
            <div className="space-y-4">
              <h2 className="text-xl font-semibold w-full text-center">
                {inventoryId ? "Edit Inventory Item" : "Create Inventory Item"}
              </h2>

              <AnimatePresence>
                {inventoryForm.uuid && (
                  <motion.div {...motionTransition}>
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
                  </motion.div>
                )}
              </AnimatePresence>

              <Input
                label="Item Name"
                value={inventoryForm.name}
                onChange={(e) => handleInventoryFormChange('name', e.target.value)}
                isReadOnly={readOnlyMode || (inventoryId ? true : false)}
                placeholder="Enter item name"
                classNames={inputStyle}
                startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                isInvalid={!!errors.name}
                errorMessage={errors.name}
              />

              <div className="flex items-start justify-between gap-4 md:flex-row flex-col">
                <Autocomplete
                  label="Measurement Unit"
                  placeholder="Select metric unit"
                  selectedKey={inventoryForm.measurement_unit}
                  onSelectionChange={(key) => handleInventoryFormChange('measurement_unit', key)}
                  startContent={<Icon icon="mdi:ruler" className="text-default-500 mb-[0.1rem]" />}
                  isRequired={!inventoryId}
                  isReadOnly={readOnlyMode || (inventoryId ? true : false)}
                  isClearable={!inventoryId}
                  inputProps={autoCompleteStyle}
                  popoverProps={{ className: inventoryId ? "collapse" : "" }}
                  selectorButtonProps={{ className: inventoryId ? "collapse" : "" }}
                >
                  {measurementUnitOptions.map((measurement_unit) => (
                    <AutocompleteItem key={measurement_unit}>
                      {measurement_unit.charAt(0).toUpperCase() + measurement_unit.slice(1)}
                    </AutocompleteItem>
                  ))}
                </Autocomplete>

                <Autocomplete
                  label="Standard Unit"
                  placeholder="Select standard unit for conversions"
                  selectedKey={inventoryForm.standard_unit}
                  onSelectionChange={(key) => handleInventoryFormChange('standard_unit', key)}
                  startContent={<Icon icon="mdi:scale-balance" className="text-default-500 mb-[0.1rem]" />}
                  isRequired={!inventoryId}
                  isReadOnly={readOnlyMode || (inventoryId ? true : false)}
                  isClearable={!inventoryId}
                  inputProps={autoCompleteStyle}
                  popoverProps={{ className: inventoryId ? "collapse" : "" }}
                  selectorButtonProps={{ className: inventoryId ? "collapse" : "" }}
                >
                  {getUnitOptions(inventoryForm.measurement_unit).map((unit) => (
                    <AutocompleteItem key={unit}>{getUnitFullName(unit)}</AutocompleteItem>
                  ))}
                </Autocomplete>
              </div>

              <Textarea
                label="Description"
                value={inventoryForm.description}
                isReadOnly={readOnlyMode || (inventoryId ? true : false)}
                onChange={(e) => handleInventoryFormChange('description', e.target.value)}
                placeholder="Enter item description (optional)"
                classNames={{
                  inputWrapper: `${inputStyle.inputWrapper} pr-12`,
                }}
                startContent={<Icon icon="mdi:text-box" className="text-default-500 mt-[0.1rem]" />}
                endContent={
                  !readOnlyMode && !inventoryId && (
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
                  )
                }
              />

              <AnimatePresence>
                {/* Display aggregated values if they exist */}
                {inventoryForm.unit_values && inventoryForm.count && inventoryId && (
                  <motion.div {...motionTransition}>
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
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Custom Properties Section */}
              <div className="mt-6">
                <CustomProperties
                  properties={inventoryForm.properties || {}}
                  onPropertiesChange={handleInventoryPropertiesChange}
                  isDisabled={!user || readOnlyMode}
                />
              </div>
            </div>
          </LoadingAnimation>



          <LoadingAnimation
            condition={!user || isLoading || isTransitioningToNew}
            skeleton={
              <div className="space-y-4">
                <Skeleton className="h-[1.75rem] w-48 rounded-xl mx-auto" />
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Skeleton className="h-8 w-20 rounded-xl" />
                    <Skeleton className="h-8 w-24 rounded-xl" />
                  </div>
                </div>
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="border-2 border-default-200 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-6 w-24 rounded-xl" />
                        <div className="flex gap-2">
                          <Skeleton className="h-6 w-20 rounded-full" />
                          <Skeleton className="h-6 w-24 rounded-full" />
                        </div>
                      </div>
                      <div className="mt-4 space-y-4">
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Skeleton className="h-16 w-full rounded-xl" />
                          <Skeleton className="h-16 w-full rounded-xl" />
                        </div>
                      </div>
                    </div>
                  ))}
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
                    {!readOnlyMode && (
                      <Button
                        color="primary"
                        variant="shadow"
                        size="sm"
                        onPress={handleAddInventoryItem}
                        startContent={<Icon icon="mdi:plus" />}
                      >
                        Add Item
                      </Button>
                    )}
                  </div>
                </div>

                {/* Error display */}
                {errors.inventoryItems && (
                  <Alert color="danger" variant="flat">
                    {errors.inventoryItems}
                  </Alert>
                )}

                {/* Inventory items content */}
                <div>
                  <AnimatePresence>
                    {inventoryItemsList.length === 0 ? (
                      <motion.div {...motionTransition}>
                        <div className="py-8 h-48 text-center text-default-500 border border-dashed border-default-300 rounded-lg justify-center flex flex-col items-center">
                          <Icon icon="mdi:package-variant-closed" className="mx-auto mb-2 opacity-50" width={40} height={40} />
                          <p>No inventory items added yet</p>
                          {!readOnlyMode && (
                            <Button
                              color="primary"
                              variant="light"
                              size="sm"
                              className="mt-3"
                              onPress={handleAddInventoryItem}
                            >
                              Add your first inventory item
                            </Button>
                          )}
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

                                      {!groupInfo.isGroup && item.unit && item.unit !== "" && item.unit_value && item.unit_value > 0 && (
                                        <Chip color="primary" variant="flat" size="sm" className="whitespace-nowrap">
                                          {(() => {
                                            const unitValue = parseFloat(String(item.unit_value || 0));
                                            const originalDisplay = `${formatNumber(unitValue)} ${item.unit}`;

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
                                    isInvalid={!!errors.itemCode}
                                    errorMessage={errors.itemCode}
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
                                      isInvalid={!!errors.unitValue}
                                      errorMessage={errors.unitValue}
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
                                      isInvalid={!!errors.unit}
                                      errorMessage={errors.unit}
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

                                  {/* Group Items Details */}
                                  {viewMode === 'grouped' && groupInfo.isGroup && groupInfo.groupId && inventoryId && (
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
                  {inventoryId && (
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
                    {inventoryId ? "Update Item" : "Save Item"}
                  </Button>
                </div>
              </LoadingAnimation>
            </div>
          </motion.div>
        </CardList>
      </Form>

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
  );
};