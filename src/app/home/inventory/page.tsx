'use client';

import CardList from "@/components/card-list";
import LoadingAnimation from '@/components/loading-animation';
import { motionTransition } from "@/utils/anim";
import { createClient } from "@/utils/supabase/client";
import { getUserFromCookies } from '@/utils/supabase/server/user';
import {
  Accordion,
  AccordionItem,
  addToast,
  Alert,
  Autocomplete,
  AutocompleteItem,
  Button,
  Chip,
  Divider,
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
  Switch,
  Textarea,
  Tooltip,
  useDisclosure
} from "@heroui/react";
import { Icon, loadIcon } from "@iconify/react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from "react";
import {
  InventoryItem,
  InventoryItemBulk,
  InventoryItemUnit,
  createInventoryItem,
  deleteInventoryItem,
  deleteInventoryItemBulk,
  deleteInventoryItemUnit,
  getBulkUnitOptions,
  getInventoryItem,
  getInventoryItems,
  getUnitOptions,
  updateInventoryItem
} from './actions';
import { copyToClipboard, formatDate, formatNumber } from "@/utils/tools";
import ListLoadingAnimation from "@/components/list-loading-animation";


export default function InventoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [bulkUnitOptions, setBulkUnitOptions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Inventory list state
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Form state
  const [inventoryForm, setInventoryForm] = useState<{
    uuid?: string;
    name: string;
    description: string;
    unit: string;
    company_uuid: string;
  }>({
    name: "",
    description: "",
    unit: "",
    company_uuid: "",
  });

  // Bulk items state
  const [bulkItems, setBulkItems] = useState<(Partial<InventoryItemBulk> & { id: number, isNew?: boolean })[]>([]);
  const [nextBulkId, setNextBulkId] = useState(1);

  // Unit items state
  const [unitItems, setUnitItems] = useState<(Partial<InventoryItemUnit> & { id: number, bulkId: number, isNew?: boolean })[]>([]);
  const [nextUnitId, setNextUnitId] = useState(1);

  // Delete confirmation
  const deleteModal = useDisclosure();
  const [itemToDelete, setItemToDelete] = useState<{ type: 'item' | 'bulk' | 'unit', id: string | number }>();

  // Duplication state
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [duplicatePopoverOpen, setDuplicatePopoverOpen] = useState(false);
  const [itemToDuplicate, setItemToDuplicate] = useState<{ type: 'bulk' | 'unit', id: number }>();

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };
  const autoCompleteStyle = { classNames: inputStyle };

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

        const units = await getUnitOptions();
        setUnitOptions(units);

        const bulkUnits = await getBulkUnitOptions();
        setBulkUnitOptions(bulkUnits);

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
          table: 'inventory_items',
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
    const fetchItemDetails = async (itemId: string) => {
      setIsLoading(true);

      try {
        const result = await getInventoryItem(itemId);

        if (result.success && result.data) {
          const item = result.data;

          setInventoryForm({
            uuid: item.uuid,
            name: item.name,
            description: item.description || "",
            unit: item.unit || "",
            company_uuid: item.company_uuid,
          });

          const bulks = item.inventory_item_bulks || [];
          const newBulkItems = bulks.map((bulk: any, index: number) => ({
            ...bulk,
            id: index + 1,
          }));

          setBulkItems(newBulkItems);
          setNextBulkId(newBulkItems.length + 1);

          const newUnitItems: (Partial<InventoryItemUnit> & { id: number, bulkId: number, isNew?: boolean })[] = [];
          let unitId = 1;

          bulks.forEach((bulk: { inventory_item_units: never[]; }, bulkIndex: number) => {
            const units = bulk.inventory_item_units || [];

            units.forEach((unit: Partial<InventoryItemUnit> & { id: number; bulkId: number; isNew?: boolean; }) => {
              newUnitItems.push({
                ...unit,
                id: unitId++,
                bulkId: bulkIndex + 1,
              });
            });
          });

          setUnitItems(newUnitItems);
          setNextUnitId(unitId);

          // Set expanded states to first items
          if (newBulkItems.length > 0) {
            setExpandedBulks(new Set([`${newBulkItems[0].id}`]));
          }

          if (newUnitItems.length > 0) {
            setExpandedUnits(new Set([`${newUnitItems[0].id}`]));
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

    // Clear form when no item is selected
    if (!selectedItemId) {
      resetForm();
      return;
    }

    fetchItemDetails(selectedItemId);
  }, [selectedItemId]);

  // Check URL for itemId param on load
  useEffect(() => {
    const itemId = searchParams.get("itemId");
    if (itemId) setSelectedItemId(itemId);
  }, [searchParams]);

  const resetForm = () => {
    setInventoryForm({
      name: "",
      description: "",
      unit: "",
      company_uuid: user?.company_uuid || "",
    });
    setBulkItems([]);
    setUnitItems([]);
    setNextBulkId(1);
    setNextUnitId(1);
  };


  const isBulkEditable = (bulk: any) => {
    return !bulk.status || bulk.status === "AVAILABLE";
  };

  const calculateBulkTotalUnits = (bulkId: number) => {
    const units = unitItems.filter(unit => unit.bulkId === bulkId);
    return units.reduce((total, unit) => total + (unit.unit_value || 0), 0);
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

  // Add these state variables after other state declarations
  const [expandedBulks, setExpandedBulks] = useState<Set<string>>(new Set());
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());

  // Modify the handleAddBulk function
  const handleAddBulk = () => {
    const newBulk = {
      id: nextBulkId,
      company_uuid: user?.company_uuid || "",
      unit: inventoryForm.unit,
      unit_value: 0,
      bulk_unit: "",
      cost: 0,
      is_single_item: false,
      properties: {},
      isNew: true
    };

    // Add new bulk at the top of the list
    setBulkItems([newBulk, ...bulkItems]);
    setNextBulkId(nextBulkId + 1);

    // Set only the new bulk to be expanded
    setExpandedBulks(new Set([`${nextBulkId}`]));
  };

  const handleInventoryFormChange = (field: string, value: any) => {
    setInventoryForm(prev => ({ ...prev, [field]: value }));

    // If unit changed, update all bulks and units
    if (field === 'unit') {
      setBulkItems(prev => prev.map(bulk => ({ ...bulk, unit: value })));
      setUnitItems(prev => prev.map(unit => ({ ...unit, unit: value })));
    }
  };

  // Modify the handleAddUnit function
  const handleAddUnit = (bulkId: number) => {
    // Check if all existing units in this bulk have the same item name
    const bulkUnits = unitItems.filter(unit => unit.bulkId === bulkId);
    let inheritedItemName = "";

    if (bulkUnits.length > 0) {
      const uniqueNames = new Set(bulkUnits.map(u => u.name).filter(Boolean));
      if (uniqueNames.size === 1) {
        // All units have the same name, inherit it
        inheritedItemName = bulkUnits[0].name || "";
      }
    }

    // Get the parent bulk to inherit its unit
    const parentBulk = bulkItems.find(b => b.id === bulkId);
    if (!parentBulk) return;

    const newUnit = {
      id: nextUnitId,
      bulkId,
      company_uuid: user?.company_uuid || "",
      code: "",
      unit_value: 0,
      unit: parentBulk.unit || "", // Always inherit unit from parent bulk
      name: inheritedItemName, // Use the inherited name if available
      cost: 0,
      properties: {},
      isNew: true
    };

    // Add new unit at the top of the list filtered by bulkId
    setUnitItems(prevUnits => {
      const bulkUnits = prevUnits.filter(unit => unit.bulkId === bulkId);
      const otherUnits = prevUnits.filter(unit => unit.bulkId !== bulkId);
      const newUnits = [newUnit, ...bulkUnits, ...otherUnits];

      // Immediately update the bulk after adding the unit
      updateBulkFromUnits(bulkId, newUnits);

      return newUnits;
    });

    setNextUnitId(nextUnitId + 1);
    setExpandedUnits(new Set([`${nextUnitId}`]));
  };

  // Also update handleDuplicateBulk to add items at the top
  const handleDuplicateBulk = (bulkId: number, count: number) => {
    const bulkToDuplicate = bulkItems.find(b => b.id === bulkId);
    if (!bulkToDuplicate) return;

    const newBulks: typeof bulkItems = [];
    const newUnits: typeof unitItems = [];
    let firstNewBulkId = nextBulkId;

    // Create the specified number of duplicates
    for (let i = 0; i < count; i++) {
      const newBulkId = nextBulkId + i;

      // Duplicate the bulk
      newBulks.push({
        ...bulkToDuplicate,
        id: newBulkId,
        uuid: undefined,
        isNew: true
      });

      // Duplicate any units in this bulk - for both single and non-single items
      const unitsInBulk = unitItems.filter(u => u.bulkId === bulkId);

      unitsInBulk.forEach((unit, idx) => {
        newUnits.push({
          ...unit,
          id: nextUnitId + i * unitsInBulk.length + idx,
          bulkId: newBulkId,
          uuid: undefined,
          inventory_item_bulk_uuid: undefined,
          unit: bulkToDuplicate.unit || unit.unit, // Ensure it inherits parent bulk's unit
          isNew: true
        });
      });

      // If it's a single item but no unit exists yet, create one
      if (bulkToDuplicate.is_single_item && unitsInBulk.length === 0) {
        newUnits.push({
          id: nextUnitId + i,
          bulkId: newBulkId,
          company_uuid: user?.company_uuid || "",
          code: "",
          unit_value: bulkToDuplicate.unit_value || 0,
          unit: bulkToDuplicate.unit || "", // Always use bulk's unit
          name: "",
          cost: bulkToDuplicate.cost || 0,
          properties: {},
          isNew: true
        });
      }
    }

    // Add new bulks at the top
    setBulkItems([...newBulks, ...bulkItems]);
    setUnitItems([...newUnits, ...unitItems]);

    // Update next IDs
    setNextBulkId(nextBulkId + count);

    // Calculate total new units we added
    const totalNewUnits = newUnits.length;
    setNextUnitId(nextUnitId + totalNewUnits);

    // Expand only the first new bulk
    setExpandedBulks(new Set([`${firstNewBulkId}`]));
  };

  // Update handleDuplicateUnit similarly to add at the top
  const handleDuplicateUnit = (unitId: number, count: number) => {
    const unitToDuplicate = unitItems.find(u => u.id === unitId);
    if (!unitToDuplicate) return;

    const newUnits: typeof unitItems = [];
    let firstNewUnitId = nextUnitId;
    const bulkId = unitToDuplicate.bulkId;

    // Get the parent bulk to ensure we use its unit
    const parentBulk = bulkItems.find(b => b.id === bulkId);
    if (!parentBulk) return;

    // Create the specified number of duplicates
    for (let i = 0; i < count; i++) {
      newUnits.push({
        ...unitToDuplicate,
        id: nextUnitId + i,
        uuid: undefined,
        inventory_item_bulk_uuid: undefined,
        unit: parentBulk.unit || unitToDuplicate.unit, // Ensure it inherits parent bulk's unit
        isNew: true
      });
    }

    // Add new units at the top with functional state updates
    setUnitItems(prevUnits => {
      const updatedUnits = [...newUnits, ...prevUnits];

      // Immediately recalculate bulk cost with current values
      const allBulkUnits = [
        ...newUnits,
        ...prevUnits.filter(u => u.bulkId === bulkId)
      ];

      const totalCost = allBulkUnits.reduce((sum, u) => sum + (u.cost || 0), 0);

      // Update the bulk's cost
      setBulkItems(prevBulks => prevBulks.map(bulk =>
        bulk.id === bulkId ? { ...bulk, cost: totalCost } : bulk
      ));

      // Immediately update bulk's unit and value
      updateBulkFromUnits(bulkId, updatedUnits);

      return updatedUnits;
    });

    setNextUnitId(nextUnitId + count);
    setExpandedUnits(new Set([`${firstNewUnitId}`]));
  };

  const handleBulkChange = (bulkId: number, field: keyof InventoryItemBulk, value: any) => {
    setBulkItems(bulkItems.map(bulk =>
      bulk.id === bulkId ? { ...bulk, [field]: value } : bulk
    ));

    // When the unit changes, update all child units
    if (field === 'unit') {
      setUnitItems(prevUnits => prevUnits.map(unit =>
        unit.bulkId === bulkId ? { ...unit, unit: value } : unit
      ));
    }

    // When the bulk unit value changes, distribute it proportionally to all units
    if (field === 'unit_value' && typeof value === 'number') {
      setUnitItems(prevUnits => {
        // Get units belonging to this bulk
        const bulkUnits = prevUnits.filter(unit => unit.bulkId === bulkId);

        if (bulkUnits.length === 0) return prevUnits;

        // Calculate current total unit value
        const currentTotal = bulkUnits.reduce((sum, unit) => sum + (unit.unit_value || 0), 0);

        // Handle cases where current total is zero (avoid division by zero)
        if (currentTotal <= 0) {
          // Distribute evenly among all units
          const equalValue = value / bulkUnits.length;
          return prevUnits.map(unit =>
            unit.bulkId === bulkId ? { ...unit, unit_value: equalValue } : unit
          );
        }

        // Otherwise distribute proportionally
        const ratio = value / currentTotal;

        return prevUnits.map(unit => {
          if (unit.bulkId === bulkId) {
            // Apply the ratio to maintain proportional distribution
            return { ...unit, unit_value: (unit.unit_value || 0) * ratio };
          }
          return unit;
        });
      });
    }

    // Special handling for single item mode
    if (field === 'is_single_item') {
      if (value === true) {
        // When enabling single item mode, add a single unit if none exists
        const existingUnit = unitItems.find(u => u.bulkId === bulkId);
        const bulk = bulkItems.find(b => b.id === bulkId);

        if (!existingUnit && bulk) {
          const newUnit = {
            id: nextUnitId,
            bulkId: bulkId,
            company_uuid: user?.company_uuid || "",
            code: "",
            unit_value: bulk.unit_value || 0,
            unit: bulk.unit || "", // Always inherit unit from bulk
            name: "",
            cost: bulk.cost || 0,
            properties: {},
            isNew: true
          };
          setUnitItems([...unitItems, newUnit]);
          setNextUnitId(nextUnitId + 1);
        }
      } else {
        // When disabling single item mode, don't remove the unit
        // Just let the user manage units manually
      }
    }

    // If this is a single item, update the corresponding unit properties
    const bulk = bulkItems.find(b => b.id === bulkId);
    if (bulk?.is_single_item || (field === 'is_single_item' && value === true)) {
      const unit = unitItems.find(u => u.bulkId === bulkId);

      if (unit) {
        // Synchronize specific properties between bulk and unit
        switch (field) {
          case 'unit':
            handleUnitChange(unit.id, 'unit', value);
            break;
          case 'unit_value':
            handleUnitChange(unit.id, 'unit_value', value);
            break;
          case 'cost':
            handleUnitChange(unit.id, 'cost', value);
            break;
        }
      }
    } else if (field === 'cost') {
      // For non-single items, update all units in this bulk proportionally
      const bulkUnits = unitItems.filter(unit => unit.bulkId === bulkId);

      if (bulkUnits.length > 0) {
        const totalUnitValue = bulkUnits.reduce((sum, unit) => sum + (unit.unit_value || 0), 0);

        if (totalUnitValue > 0) {
          setUnitItems(unitItems.map(unit => {
            if (unit.bulkId === bulkId) {
              const unitRatio = (unit.unit_value || 0) / totalUnitValue;
              return {
                ...unit,
                cost: unitRatio * value
              };
            }
            return unit;
          }));
        }
      }
    }
  };

  // Add this helper function before handleUnitChange
  const updateSimilarUnitsInBulk = (bulkId: number, field: keyof InventoryItemUnit, value: any) => {
    if (field !== 'name') return;

    const bulkUnits = unitItems.filter(u => u.bulkId === bulkId);

    // Check if all units have same item name or empty name
    const existingNames = bulkUnits
      .map(u => u.name)
      .filter(name => name && name !== value);

    // If there are different non-empty names, don't perform auto-fill
    if (existingNames.length > 0) return;

    // Update all units in this bulk that have empty name
    setUnitItems(units => units.map(unit => {
      if (unit.bulkId === bulkId && (!unit.name || unit.name === '')) {
        return {
          ...unit,
          name: value
        };
      }
      return unit;
    }));
  };

  const calculateTotalInventoryUnits = () => {
    return bulkItems.reduce((total, bulk) => {
      const bulkUnits = unitItems.filter(unit => unit.bulkId === bulk.id);
      const bulkTotal = bulkUnits.reduce((sum, unit) => sum + (unit.unit_value || 0), 0);
      return total + bulkTotal;
    }, 0);
  };

  // Modify handleUnitChange to include the auto-fill logic
  const handleUnitChange = (unitId: number, field: keyof InventoryItemUnit, value: any) => {
    // Update unit immediately and get the new state
    setUnitItems(prevUnits => {
      const newUnits = prevUnits.map(unit =>
        unit.id === unitId ? { ...unit, [field]: value } : unit
      );

      // Find the modified unit to get its bulkId
      const unit = newUnits.find(u => u.id === unitId);

      if (unit) {
        // Only recalculate bulk cost when the cost field changes
        if (field === 'cost') {
          const bulkUnits = newUnits.filter(u => u.bulkId === unit.bulkId);
          const totalCost = bulkUnits.reduce((sum, u) => sum + (u.cost || 0), 0);

          setBulkItems(prev => prev.map(bulk =>
            bulk.id === unit.bulkId ? { ...bulk, cost: totalCost } : bulk
          ));
        }

        // If the unit type or value changed, update the bulk immediately
        if (field === 'unit' || field === 'unit_value') {
          // Run with the latest unit items state
          updateBulkFromUnits(unit.bulkId, newUnits);
        }

        // Auto-fill item name for all units in the bulk if they're the same
        if (field === 'name' && value) {
          updateSimilarUnitsInBulk(unit.bulkId, field, value);
        }
      }

      return newUnits;
    });
  };

  // Improved updateBulkFromUnits function
  const updateBulkFromUnits = (bulkId: number, latestUnitItems = unitItems) => {
    const bulkUnits = latestUnitItems.filter(unit => unit.bulkId === bulkId);

    setBulkItems(prevBulks => {
      const bulk = prevBulks.find(b => b.id === bulkId);
      if (!bulk) return prevBulks;

      // If it's a single-item bulk, units are managed separately
      if (bulk.is_single_item) return prevBulks;

      // Calculate total, default to current bulk value if no units
      const totalUnitValue = bulkUnits.length > 0
        ? bulkUnits.reduce((sum, unit) => sum + (unit.unit_value || 0), 0)
        : bulk.unit_value;

      return prevBulks.map(b => {
        if (b.id !== bulkId) return b;
        return { ...b, unit_value: totalUnitValue };
      });
    });
  };

  const handleDeleteBulk = (bulkId: number) => {
    const bulk = bulkItems.find(b => b.id === bulkId);
    if (!bulk) return;

    if (bulk.uuid) {
      // Existing bulk needs DB deletion
      setItemToDelete({ type: 'bulk', id: bulk.uuid });
      deleteModal.onOpen();
    } else {
      // New bulk, just remove from state
      setBulkItems(bulkItems.filter(b => b.id !== bulkId));
      setUnitItems(unitItems.filter(u => u.bulkId !== bulkId));
    }

    // set the expandedBulks to the first bulk in the list
    const firstBulk = bulkItems.find(b => b.id !== bulkId);
    if (firstBulk) {
      setExpandedBulks(new Set([`${firstBulk.id}`]));
    }
  };

  const handleDeleteUnit = (unitId: number) => {
    const unit = unitItems.find(u => u.id === unitId);
    if (!unit) return;

    if (unit.uuid) {
      // Existing unit needs DB deletion
      setItemToDelete({ type: 'unit', id: unit.uuid });
      deleteModal.onOpen();
    } else {
      // New unit, remove from state and update bulk immediately
      setUnitItems(prevUnits => {
        const newUnits = prevUnits.filter(u => u.id !== unitId);

        // Recalculate bulk cost
        const remainingUnits = newUnits.filter(u => u.bulkId === unit.bulkId);
        const totalCost = remainingUnits.reduce((sum, u) => sum + (u.cost || 0), 0);

        setBulkItems(prev => prev.map(bulk =>
          bulk.id === unit.bulkId ? { ...bulk, cost: totalCost } : bulk
        ));

        // Update bulk unit and value with fresh state
        updateBulkFromUnits(unit.bulkId, newUnits);

        return newUnits;
      });
    }

    // set the expandedUnits to the first unit in the list
    const firstUnit = unitItems.find(u => u.id !== unitId);
    if (firstUnit) {
      setExpandedUnits(new Set([`${firstUnit.id}`]));
    }
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

      switch (itemToDelete.type) {
        case 'item':
          result = await deleteInventoryItem(itemToDelete.id as string);
          if (result.success) {
            setSelectedItemId(null);
            const params = new URLSearchParams(searchParams.toString());
            params.delete("itemId");
            router.push(`?${params.toString()}`, { scroll: false });
            resetForm();
          }
          break;

        case 'bulk':
          result = await deleteInventoryItemBulk(itemToDelete.id as string);
          if (result.success) {
            setBulkItems(bulkItems.filter(b => b.uuid !== itemToDelete.id));
            setUnitItems(unitItems.filter(u => u.inventory_item_bulk_uuid !== itemToDelete.id));
          }
          break;

        case 'unit':
          result = await deleteInventoryItemUnit(itemToDelete.id as string);
          if (result.success) {
            const deletedUnit = unitItems.find(u => u.uuid === itemToDelete.id);

            // Use functional update to ensure we capture latest state
            setUnitItems(prevUnits => {
              const newUnits = prevUnits.filter(u => u.uuid !== itemToDelete.id);

              if (deletedUnit) {
                // Find all units with the same bulk
                const bulkId = deletedUnit.bulkId;
                const remainingBulkUnits = newUnits.filter(u => u.bulkId === bulkId);

                // Recalculate bulk cost
                const totalCost = remainingBulkUnits.reduce((sum, u) =>
                  sum + (u.cost || 0), 0);

                // Update the bulk cost and unit/value immediately
                setBulkItems(prevBulks => {
                  const updatedBulks = prevBulks.map(bulk =>
                    bulk.id === bulkId ? { ...bulk, cost: totalCost } : bulk
                  );

                  // Call updateBulkFromUnits with the new units
                  updateBulkFromUnits(bulkId, newUnits);

                  return updatedBulks;
                });
              }

              return newUnits;
            });
          }
          break;
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
      // Existing validation...

      // Ensure unit values match bulk value (with minimal rounding error)
      const bulkUnits = unitItems.filter(unit => unit.bulkId === bulk.id);
      const unitTotal = bulkUnits.reduce((sum, unit) => sum + (unit.unit_value || 0), 0);

      // Allow small rounding errors (0.001 or 0.1% difference)
      const discrepancy = Math.abs(unitTotal - (bulk.unit_value || 0));
      const discrepancyPercent = (bulk.unit_value || 0) > 0 ? (discrepancy / (bulk.unit_value || 0)) * 100 : 0;

      if (discrepancy > 0.001 && discrepancyPercent > 0.1) {
        setError(`Bulk "${bulk.bulk_unit}" total units (${unitTotal}) don't match bulk value (${bulk.unit_value})`);
        return false;
      }
    }

    for (const unit of unitItems) {
      // Remove unit check since it's inherited from the bulk
      if (!unit.code || !unit.name || typeof unit.unit_value !== 'number' || unit.unit_value <= 0 || typeof unit.cost !== 'number' || unit.cost <= 0) {
        setError("All units require item code, name, valid unit value, and cost");
        return false;
      }
    }

    return true;
  };


  const handleSubmit = async () => {
    if (!validateForm()) return;


    setIsLoading(true);
    setError(null);

    try {
      if (selectedItemId) {
        // Update existing item
        const itemUpdates = {
          name: inventoryForm.name,
          description: inventoryForm.description,
        };

        const bulkUpdates = bulkItems
          .filter(bulk => bulk.uuid)
          .map(bulk => ({
            uuid: bulk.uuid as string,
            unit: bulk.unit,
            unit_value: bulk.unit_value as number,
            bulk_unit: bulk.bulk_unit,
            cost: bulk.cost as number,
            is_single_item: bulk.is_single_item,
            properties: bulk.properties,
          }));

        const unitUpdates = unitItems
          .filter(unit => unit.uuid)
          .map(unit => ({
            uuid: unit.uuid as string,
            code: unit.code,
            unit_value: unit.unit_value as number,
            unit: unit.unit,
            name: unit.name,
            cost: unit.cost as number,
            properties: unit.properties,
          }));

        const newBulks = bulkItems
          .filter(bulk => !bulk.uuid)
          .map(bulk => ({
            company_uuid: user.company_uuid,
            unit: bulk.unit as string,
            unit_value: bulk.unit_value as number,
            bulk_unit: bulk.bulk_unit as string,
            cost: bulk.cost as number,
            is_single_item: bulk.is_single_item as boolean,
            properties: bulk.properties as Record<string, any>,
          }));

        // Create a mapping of bulkId to new bulk array index
        const bulkIdToIndexMap = new Map();
        bulkItems
          .filter(bulk => !bulk.uuid)
          .forEach((bulk, index) => {
            bulkIdToIndexMap.set(bulk.id, index);
          });

        const newUnits = unitItems
          .filter(unit => !unit.uuid)
          .map(unit => {
            // Use the mapping to get the correct index
            const bulkIndex = bulkIdToIndexMap.get(unit.bulkId);

            return {
              company_uuid: user.company_uuid,
              code: unit.code as string,
              unit_value: unit.unit_value as number,
              unit: unit.unit as string,
              name: unit.name as string,
              cost: unit.cost as number,
              properties: unit.properties as Record<string, any>,
              _bulkIndex: bulkIndex !== undefined ? bulkIndex : undefined,
            };
          });

        const result = await updateInventoryItem(
          selectedItemId,
          itemUpdates,
          bulkUpdates,
          unitUpdates,
          newBulks,
          newUnits
        );

        if (!result.success) {
          throw new Error(result.error || "Failed to update inventory item");
        }
      } else {
        // Create new item
        const newItem = {
          company_uuid: user.company_uuid,
          name: inventoryForm.name,
          unit: inventoryForm.unit,
          description: inventoryForm.description,
          admin_uuid: user.uuid,
        };

        const newBulks = bulkItems.map(bulk => ({
          company_uuid: user.company_uuid,
          unit: bulk.unit as string,
          unit_value: bulk.unit_value as number,
          bulk_unit: bulk.bulk_unit as string,
          cost: bulk.cost as number,
          is_single_item: bulk.is_single_item as boolean,
          properties: bulk.properties as Record<string, any>,
        }));

        // Create a mapping of bulkId to array index
        const bulkIdToIndexMap = new Map();
        bulkItems.forEach((bulk, index) => {
          bulkIdToIndexMap.set(bulk.id, index);
        });

        const newUnits = unitItems.map(unit => ({
          company_uuid: user.company_uuid,
          code: unit.code as string,
          unit_value: unit.unit_value as number,
          unit: unit.unit as string,
          name: unit.name as string,
          cost: unit.cost as number,
          properties: unit.properties as Record<string, any>,
          _bulkIndex: bulkIdToIndexMap.get(unit.bulkId),
        }));

        const result = await createInventoryItem(
          newItem,
          newBulks,
          newUnits
        );

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

  return (
    <div className="container mx-auto p-2 max-w-4xl">
      <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
        <div className="flex flex-col w-full xl:text-left text-center">
          <h1 className="text-2xl font-bold">Inventory Management</h1>
          {isLoadingItems ? (
            <div className="text-default-500 flex items-center">
              <p className='my-auto mr-1'>Loading inventory data</p>
              <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
            </div>
          ) : (
            <p className="text-default-500">Manage your inventory items efficiently.</p>
          )}
        </div>
        <div className="flex gap-4">
          <div className="mt-4 text-center">
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
              <div className={`space-y-4 p-4 mt-1 pt-32 h-full relative ${(user && !isLoadingItems) && "overflow-y-auto"}`}>
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
                      onPress={() => handleSelectItem(item.uuid)}
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
                              {item.inventory_item_bulks_length || 0} bulk(s)
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
              </div>

              {/* No items found state */}
              <AnimatePresence>
                {user && !isLoadingItems && inventoryItems.length === 0 && (
                  <motion.div
                    className="xl:h-full h-[42rem] absolute w-full"
                    initial={{ opacity: 0, filter: "blur(8px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, filter: "blur(8px)" }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="py-4 flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                      <Icon icon="mdi:package-variant" className="text-5xl text-default-300" />
                      <p className="text-default-500 mt-2">No inventory items found</p>
                      <Button
                        color="primary"
                        variant="light"
                        size="sm"
                        className="mt-4"
                        onPress={handleNewItem}
                        startContent={<Icon icon="mdi:plus" className="text-default-500" />}>
                        Create New Item
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Right side: Inventory Form */}
        <div className="xl:w-2/3">
          <Form id="inventoryForm" onSubmit={handleSubmit} className="items-stretch space-y-4">
            <CardList>
              <LoadingAnimation
                condition={isLoading}
                skeleton={
                  <div>
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

                    <div className="flex items-center justify-between gap-4">
                      <Input
                        label="Item Name"
                        value={inventoryForm.name}
                        onChange={(e) => setInventoryForm({ ...inventoryForm, name: e.target.value })}
                        isRequired
                        placeholder="Enter item name"
                        classNames={inputStyle}
                        startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                      />

                      <Autocomplete
                        label="Item Unit"
                        placeholder="Select unit"
                        selectedKey={inventoryForm.unit}
                        onSelectionChange={(key) => handleInventoryFormChange('unit', key)}
                        startContent={<Icon icon="mdi:ruler" className="text-default-500 mb-[0.1rem]" />}
                        isRequired
                        inputProps={autoCompleteStyle}
                      >
                        {unitOptions.map((unit) => (
                          <AutocompleteItem key={unit}>{unit}</AutocompleteItem>
                        ))}
                      </Autocomplete>
                    </div>

                    <Textarea
                      label="Description"
                      value={inventoryForm.description}
                      onChange={(e) => setInventoryForm({ ...inventoryForm, description: e.target.value })}
                      placeholder="Enter item description (optional)"
                      classNames={inputStyle}
                      startContent={<Icon icon="mdi:text-box" className="text-default-500 mt-[0.1rem]" />}
                    />
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
                          <Skeleton className="h-16 w-full rounded-xl" />
                          <Skeleton className="h-16 w-full rounded-xl" />
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
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Bulk Items</h2>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        {bulkItems.length > 0 && (
                          <Chip color="default" variant="flat" size="sm">
                            {bulkItems.length} bulk{bulkItems.length > 1 ? "s" : ""}
                          </Chip>
                        )}
                        {unitItems.length > 0 && (
                          <Chip color="default" variant="flat" size="sm">
                            {unitItems.length} unit{unitItems.length > 1 ? "s" : ""}
                          </Chip>
                        )}
                        {calculateTotalInventoryUnits() > 0 && (
                          <Chip color="default" variant="flat" size="sm">
                            {formatNumber(calculateTotalInventoryUnits())} {inventoryForm.unit}
                          </Chip>
                        )}
                      </div>

                      <Button
                        color="primary"
                        variant="shadow"
                        size="sm"
                        onPress={handleAddBulk}
                        startContent={<Icon icon="mdi:plus" />}
                      >
                        Add Bulk
                      </Button>
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
                                trigger: "p-4 data-[hover=true]:bg-default-100 h-14 flex items-center transition-colors",
                                indicator: "text-medium",
                                content: "text-small p-0",
                              }}>
                              {bulkItems.map((bulk, index) => (
                                <AccordionItem
                                  key={bulk.id}
                                  aria-label={`Bulk ${bulk.id}`}
                                  className={`${index === 0 ? 'mt-4' : ''} mx-2`}
                                  title={
                                    <div className="flex justify-between items-center w-full">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">Bulk {bulk.id}</span>
                                      </div>
                                      <div className="flex gap-2">
                                        {bulk.unit && bulk.unit !== "" && bulk.unit_value! > 0 && (
                                          <Chip color="primary" variant="flat" size="sm">
                                            {formatNumber(bulk.unit_value || 0)} {bulk.unit}
                                          </Chip>
                                        )}
                                        {bulk.bulk_unit && (
                                          <Chip color="secondary" variant="flat" size="sm">
                                            {bulk.bulk_unit}
                                          </Chip>
                                        )}
                                        {bulk.status && bulk.status !== "AVAILABLE" && (
                                          <Chip color="warning" variant="flat" size="sm">
                                            {bulk.status}
                                          </Chip>
                                        )}
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

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 pb-0">
                                      <NumberInput
                                        label="Unit Value"
                                        placeholder="0"
                                        value={bulk.unit_value || 0}
                                        onValueChange={(value) => handleBulkChange(bulk.id, 'unit_value', value)}
                                        isRequired
                                        isDisabled={!isBulkEditable(bulk)}
                                        minValue={0}
                                        classNames={inputStyle}
                                        endContent={
                                          <div className="absolute right-10 bottom-2">
                                            {inventoryForm.unit && (
                                              <Chip
                                                color="primary"
                                                variant="flat"
                                                size="sm"
                                              >
                                                {inventoryForm.unit}
                                              </Chip>
                                            )}
                                          </div>

                                        }
                                        startContent={<Icon icon="mdi:numeric" className="text-default-500 mb-[0.1rem]" width={16} />}
                                      />

                                      <NumberInput
                                        label="Total Cost"
                                        placeholder="0.00"
                                        value={bulk.cost || 0}
                                        onValueChange={(value) => handleBulkChange(bulk.id, 'cost', value)}
                                        isRequired
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

                                    <Autocomplete
                                      label="Bulk Unit"
                                      placeholder="Select bulk unit"
                                      selectedKey={bulk.bulk_unit || ""}
                                      onSelectionChange={(key) => handleBulkChange(bulk.id, 'bulk_unit', key)}
                                      isRequired
                                      isDisabled={!isBulkEditable(bulk)}
                                      inputProps={autoCompleteStyle}
                                      classNames={{ base: "p-4 pb-0" }}
                                      startContent={<Icon icon="mdi:cube-outline"
                                        className="text-default-500 -mb-[0.1rem]" width={24} />}
                                    >
                                      {bulkUnitOptions.map((unit) => (
                                        <AutocompleteItem key={unit}>{unit}</AutocompleteItem>
                                      ))}
                                    </Autocomplete>


                                    <div className="flex items-center">
                                      <Switch
                                        isSelected={bulk.is_single_item}
                                        onValueChange={(value) => handleBulkChange(bulk.id, 'is_single_item', value)}
                                        color="primary"
                                        isDisabled={!isBulkEditable(bulk)}
                                        className="p-4"
                                      />
                                      <span className="ml-2">This is a single large item (e.g., mother roll)</span>
                                    </div>

                                    <div className="overflow-hidden px-4 pb-4">
                                      <AnimatePresence>
                                        {bulk.is_single_item && (
                                          <motion.div
                                            {...motionTransition}
                                          >
                                            <div className="border-2 border-default-200 rounded-xl p-4">
                                              <div className="flex justify-between items-center">
                                                <h3 className="text-lg font-semibold">Single Item Details</h3>
                                                <Tooltip
                                                  content="For single items, these details will be used for the automatically generated unit">
                                                  <span>
                                                    <Icon icon="mdi:information-outline" className="text-default-500" width={16} height={16} />
                                                  </span>
                                                </Tooltip>
                                              </div>

                                              {unitItems.find(u => u.bulkId === bulk.id)?.uuid && (
                                                <Input
                                                  label="Item Unit Identifier"
                                                  value={unitItems.find(u => u.bulkId === bulk.id)?.uuid || ""}
                                                  isReadOnly
                                                  className="mt-4"
                                                  classNames={{ inputWrapper: inputStyle.inputWrapper }}
                                                  startContent={<Icon icon="mdi:cube-outline" className="text-default-500 mb-[0.2rem]" />}
                                                  endContent={
                                                    <Button
                                                      variant="flat"
                                                      color="default"
                                                      isIconOnly
                                                      onPress={() => copyToClipboard(unitItems.find(u => u.bulkId === bulk.id)?.uuid || "")}
                                                    >
                                                      <Icon icon="mdi:content-copy" className="text-default-500" />
                                                    </Button>
                                                  }
                                                />
                                              )}

                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                                <Input
                                                  label="Item Code"
                                                  placeholder="Enter code"
                                                  value={
                                                    unitItems.find(u => u.bulkId === bulk.id)?.code || ""
                                                  }
                                                  onChange={(e) => {
                                                    // Find existing unit or create one
                                                    let unit = unitItems.find(u => u.bulkId === bulk.id);
                                                    if (unit) {
                                                      handleUnitChange(unit.id, 'code', e.target.value);
                                                    } else {
                                                      // Create a single unit for this bulk with inherited unit
                                                      const newUnit = {
                                                        id: nextUnitId,
                                                        bulkId: bulk.id,
                                                        company_uuid: user.company_uuid,
                                                        code: e.target.value,
                                                        unit_value: bulk.unit_value || 0,
                                                        unit: bulk.unit || "", // Always inherit from bulk
                                                        name: "",
                                                        cost: bulk.cost || 0,
                                                        properties: {},
                                                        isNew: true
                                                      };
                                                      setUnitItems([...unitItems, newUnit]);
                                                      setNextUnitId(nextUnitId + 1);
                                                    }
                                                  }}
                                                  isDisabled={!isBulkEditable(bulk)}
                                                  isRequired
                                                  classNames={inputStyle}
                                                  startContent={<Icon icon="mdi:barcode" className="text-default-500 mb-[0.2rem]" />}
                                                />

                                                <Input
                                                  label="Item Name"
                                                  placeholder="Enter name"
                                                  value={
                                                    unitItems.find(u => u.bulkId === bulk.id)?.name || inventoryForm.name
                                                  }
                                                  onChange={(e) => {
                                                    // Find existing unit or create one
                                                    let unit = unitItems.find(u => u.bulkId === bulk.id);
                                                    if (unit) {
                                                      handleUnitChange(unit.id, 'name', e.target.value);
                                                    } else {
                                                      // Create a single unit for this bulk
                                                      const newUnit = {
                                                        id: nextUnitId,
                                                        bulkId: bulk.id,
                                                        company_uuid: user.company_uuid,
                                                        code: "",
                                                        unit_value: bulk.unit_value || 0,
                                                        unit: bulk.unit || "", // Always inherit from bulk
                                                        name: e.target.value,
                                                        cost: bulk.cost || 0,
                                                        properties: {},
                                                        isNew: true
                                                      };
                                                      setUnitItems([...unitItems, newUnit]);
                                                      setNextUnitId(nextUnitId + 1);
                                                    }
                                                  }}
                                                  isDisabled={!isBulkEditable(bulk)}
                                                  isRequired
                                                  classNames={inputStyle}
                                                  startContent={<Icon icon="mdi:tag" className="text-default-500 mb-[0.2rem]" />}
                                                />
                                              </div>
                                            </div>
                                          </motion.div>
                                        )}

                                      </AnimatePresence>
                                      <AnimatePresence>

                                        {!bulk.is_single_item && (
                                          <motion.div
                                            {...motionTransition}
                                          >
                                            <div className="border-2 border-default-200 rounded-xl">
                                              <div className="flex justify-between items-center p-4 pb-0">
                                                <h3 className="text-lg font-semibold">Units in this Bulk</h3>
                                                <Button
                                                  color="primary"
                                                  variant="flat"
                                                  size="sm"
                                                  onPress={() => handleAddUnit(bulk.id)}
                                                  startContent={<Icon icon="mdi:plus" />}
                                                  isDisabled={!isBulkEditable(bulk)}
                                                >
                                                  Add Unit
                                                </Button>
                                              </div>

                                              <AnimatePresence>
                                                {unitItems.filter(unit => unit.bulkId === bulk.id).length === 0 && (
                                                  <motion.div
                                                    {...motionTransition}
                                                  >
                                                    <div className="py-4 m-4 h-48 text-center text-default-500 border border-dashed border-default-200 rounded-lg justify-center flex flex-col items-center">
                                                      <Icon icon="ant-design:product-filled" className="mx-auto mb-2 opacity-50" width={40} height={40} />
                                                      <p className="text-sm">No units added to this bulk yet</p>
                                                      <Button
                                                        color="primary"
                                                        variant="light"
                                                        size="sm"
                                                        className="mt-2"
                                                        onPress={() => handleAddUnit(bulk.id)}
                                                      >
                                                        Add your first unit
                                                      </Button>
                                                    </div>
                                                  </motion.div>
                                                )}
                                              </AnimatePresence>
                                              <AnimatePresence>
                                                {unitItems.filter(unit => unit.bulkId === bulk.id).length > 0 && (
                                                  <motion.div
                                                    {...motionTransition}
                                                  >
                                                    <Accordion
                                                      selectionMode="multiple"
                                                      variant="splitted"
                                                      selectedKeys={expandedUnits}
                                                      onSelectionChange={(keys) => setExpandedUnits(keys as Set<string>)}
                                                      itemClasses={
                                                        {
                                                          base: "p-0 w-full bg-transparent rounded-xl overflow-hidden border-2 border-default-200",
                                                          title: "font-normal text-lg font-semibold",
                                                          trigger: "p-4 data-[hover=true]:bg-default-100 h-14 flex items-center transition-colors",
                                                          indicator: "text-medium",
                                                          content: "text-small p-0",
                                                        }
                                                      }
                                                      className="p-4 overflow-hidden"
                                                    >
                                                      {unitItems
                                                        .filter(unit => unit.bulkId === bulk.id)
                                                        .map((unit) => (
                                                          <AccordionItem
                                                            key={unit.id}
                                                            title={
                                                              <div className="flex justify-between items-center w-full">
                                                                <div className="flex items-center gap-2">
                                                                  <span>
                                                                    {unit.name ?
                                                                      `${unit.name}` :
                                                                      `Unit ${unit.id}`}
                                                                  </span>
                                                                </div>
                                                                {unit.unit_value! > 0 && unit.unit && unit.unit !== "" &&
                                                                  <Chip size="sm" color="primary" variant="flat">
                                                                    {formatNumber(unit.unit_value || 0)} {unit.unit}
                                                                  </Chip>
                                                                }
                                                              </div>
                                                            }
                                                          >
                                                            <div className="">
                                                              {unit.uuid && (
                                                                <Input
                                                                  label="Item Unit Identifier"
                                                                  value={unit.uuid}
                                                                  isReadOnly
                                                                  classNames={{ inputWrapper: inputStyle.inputWrapper, base: "p-4 pb-0" }}
                                                                  startContent={<Icon icon="mdi:package-variant" className="text-default-500 mb-[0.2rem]" />}
                                                                  endContent={
                                                                    <Button
                                                                      variant="flat"
                                                                      color="default"
                                                                      isIconOnly
                                                                      onPress={() => copyToClipboard(unit.uuid || "")}
                                                                    >
                                                                      <Icon icon="mdi:content-copy" className="text-default-500" />
                                                                    </Button>
                                                                  }
                                                                />
                                                              )}

                                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 my-4 py-0">
                                                                <Input
                                                                  label="Item Code"
                                                                  placeholder="Enter code"
                                                                  value={unit.code || ""}
                                                                  onChange={(e) => handleUnitChange(unit.id, 'code', e.target.value)}
                                                                  isRequired
                                                                  classNames={inputStyle}
                                                                  startContent={<Icon icon="mdi:barcode" className="text-default-500 mb-[0.2rem]" />}
                                                                />

                                                                <Input
                                                                  label="Item Name"
                                                                  placeholder="Enter name"
                                                                  value={unit.name || inventoryForm.name}
                                                                  onChange={(e) => handleUnitChange(unit.id, 'name', e.target.value)}
                                                                  isRequired
                                                                  classNames={inputStyle}
                                                                  startContent={<Icon icon="mdi:tag" className="text-default-500 mb-[0.2rem]" />}
                                                                />

                                                                <NumberInput
                                                                  label="Unit Value"
                                                                  placeholder="0"
                                                                  value={unit.unit_value || 0}
                                                                  onValueChange={(value) => handleUnitChange(unit.id, 'unit_value', value)}
                                                                  isRequired
                                                                  minValue={0}
                                                                  classNames={inputStyle}
                                                                  endContent={
                                                                    <div className="absolute right-10 bottom-2">
                                                                      {unit.unit && unit.unit !== "" &&
                                                                        <Chip
                                                                          color="primary"
                                                                          variant="flat"
                                                                          size="sm"
                                                                        >
                                                                          {unit.unit}
                                                                        </Chip>
                                                                      }
                                                                    </div>
                                                                  }
                                                                  startContent={<Icon icon="mdi:numeric" className="text-default-500 mb-[0.2rem] w-6" />}
                                                                />

                                                                <NumberInput
                                                                  label="Cost"
                                                                  placeholder="0.00"
                                                                  value={unit.cost || 0}
                                                                  onValueChange={(value) => handleUnitChange(unit.id, 'cost', value)}
                                                                  isRequired
                                                                  minValue={0}
                                                                  classNames={{
                                                                    inputWrapper: `${inputStyle.inputWrapper} md:col-span-2`
                                                                  }}
                                                                  startContent={
                                                                    <div className="flex items-center">
                                                                      <Icon icon="mdi:currency-php" className="text-default-500 mb-[0.2rem]" />
                                                                    </div>
                                                                  }
                                                                />
                                                              </div>

                                                              <div className="flex justify-end gap-2 bg-default-100/50 p-4">
                                                                <Popover
                                                                  isOpen={duplicatePopoverOpen && itemToDuplicate?.type === 'unit' && itemToDuplicate.id === unit.id}
                                                                  onOpenChange={(open) => {
                                                                    setDuplicatePopoverOpen(open);
                                                                    if (open) {
                                                                      setItemToDuplicate({ type: 'unit', id: unit.id });
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
                                                                      {...(isBulkEditable(bulk) ? {
                                                                        onPress: () => {
                                                                          setDuplicatePopoverOpen(true);
                                                                          setItemToDuplicate({ type: 'bulk', id: bulk.id });
                                                                          setDuplicateCount(1);
                                                                        }
                                                                      } : {})}
                                                                    >
                                                                      <Icon icon="ion:duplicate" width={14} height={14} />
                                                                      Duplicate
                                                                    </Button>
                                                                  </PopoverTrigger>
                                                                  <PopoverContent className="w-56">
                                                                    <div className="p-2 space-y-3">
                                                                      <div className="text-sm font-medium">Duplicate Unit</div>
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
                                                                            handleDuplicateUnit(unit.id, duplicateCount);
                                                                            setDuplicatePopoverOpen(false);
                                                                          }}
                                                                        >
                                                                          Duplicate
                                                                        </Button>
                                                                      </div>
                                                                    </div>
                                                                  </PopoverContent>
                                                                </Popover>

                                                                <Button
                                                                  color="danger"
                                                                  variant="flat"
                                                                  size="sm"
                                                                  onPress={() => handleDeleteUnit(unit.id)}
                                                                  startContent={<Icon icon="mdi:delete" width={16} height={16} />}
                                                                  isDisabled={!isBulkEditable(bulk)}
                                                                >
                                                                  Remove
                                                                </Button>
                                                              </div>
                                                            </div>
                                                          </AccordionItem>
                                                        ))}
                                                    </Accordion>
                                                  </motion.div>
                                                )}
                                              </AnimatePresence>

                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
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
                                            <div className="text-sm font-medium">Duplicate Bulk</div>
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

                                      <Button
                                        color="danger"
                                        variant="flat"
                                        size="sm"
                                        onPress={() => handleDeleteBulk(bulk.id)}
                                        startContent={<Icon icon="mdi:delete" width={16} height={16} />}
                                        isDisabled={!isBulkEditable(bulk)}
                                      >
                                        Remove
                                      </Button>
                                    </div>

                                  </div>
                                </AccordionItem>
                              ))}
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
                        isDisabled={!inventoryForm.name || !inventoryForm.unit}
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
    </div>
  );
}