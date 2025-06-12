import { v4 as uuidv4 } from 'uuid';

interface InventoryItem {
  uuid?: string;
  company_uuid: string;
  item_code?: string;
  unit?: string;
  unit_value?: number;
  packaging_unit?: string;
  cost?: number;
  group_id?: string;
  properties?: Record<string, any>;
  id?: number;
  is_new?: boolean;
  status?: string;
}

interface GroupedItems {
  [group_id: string]: InventoryItem[];
}

interface GroupInfo {
  isGroup: boolean;
  groupSize: number;
  isFirstInGroup: boolean;
  groupId: string | null;
  groupIdentifier?: string;
}

/**
 * Groups items by their group_id. Items without group_id are treated as individual items.
 */
export function groupInventoryItems(items: InventoryItem[]): GroupedItems {
  const groups: GroupedItems = {};
  
  items.forEach(item => {
    if (item.group_id && item.group_id.trim() !== '') {
      if (!groups[item.group_id]) {
        groups[item.group_id] = [];
      }
      groups[item.group_id].push(item);
    } else {
      // Create individual group for items without group_id
      const individualGroupId = `individual-${item.uuid || item.id || uuidv4()}`;
      groups[individualGroupId] = [item];
    }
  });

  return groups;
}

/**
 * Gets group information for an item
 */
export function getGroupInfo(item: InventoryItem, groupedItems: GroupedItems): GroupInfo {
  if (!item.group_id || item.group_id.trim() === '') {
    return { 
      isGroup: false, 
      groupSize: 1, 
      isFirstInGroup: true, 
      groupId: null 
    };
  }

  const groupItems = groupedItems[item.group_id] || [];
  const isFirstInGroup = groupItems[0]?.id === item.id;
  
  return {
    isGroup: groupItems.length > 1,
    groupSize: groupItems.length,
    isFirstInGroup,
    groupId: item.group_id,
    groupIdentifier: item.group_id
  };
}

/**
 * Gets display number for an item (counts only first items in groups)
 */
export function getItemDisplayNumber(item: InventoryItem, allItems: InventoryItem[], groupedItems: GroupedItems): number {
  const displayItems = allItems.filter(invItem => {
    const groupInfo = getGroupInfo(invItem, groupedItems);
    return !groupInfo.isGroup || groupInfo.isFirstInGroup;
  });

  return displayItems.findIndex(invItem => invItem.id === item.id) + 1;
}

/**
 * Creates a new group ID
 */
export function createGroupId(): string {
  return uuidv4();
}

/**
 * Duplicates a group with new group_id and new IDs
 */
export function duplicateInventoryGroup(groupItems: InventoryItem[], newGroupId: string, startingId: number): InventoryItem[] {
  return groupItems.map((item, index) => ({
    ...item,
    id: startingId + index,
    uuid: undefined,
    group_id: newGroupId,
    is_new: true
  }));
}

/**
 * Creates a new group from an existing item
 */
export function createGroupFromItem(item: InventoryItem, groupSize: number, startingId: number): InventoryItem[] {
  const newGroupId = createGroupId();
  const groupItems: InventoryItem[] = [];

  for (let i = 0; i < groupSize; i++) {
    groupItems.push({
      ...item,
      id: startingId + i,
      uuid: i === 0 ? item.uuid : undefined, // Keep original UUID for first item
      group_id: newGroupId,
      is_new: i > 0 ? true : item.is_new
    });
  }

  return groupItems;
}

/**
 * Adjusts group size by adding or removing items
 */
export function adjustGroupSize(
  groupId: string, 
  newCount: number, 
  currentItems: InventoryItem[], 
  nextItemId: number
): { updatedItems: InventoryItem[], newNextItemId: number } {
  const groupItems = currentItems.filter(item => item.group_id === groupId);
  const otherItems = currentItems.filter(item => item.group_id !== groupId);
  const currentCount = groupItems.length;

  if (newCount <= 0) {
    return {
      updatedItems: otherItems,
      newNextItemId: nextItemId
    };
  }

  if (newCount > currentCount) {
    // Add more items to the group
    const itemTemplate = groupItems[0];
    const newItems: InventoryItem[] = [];

    for (let i = 0; i < (newCount - currentCount); i++) {
      newItems.push({
        ...itemTemplate,
        id: nextItemId + i,
        uuid: undefined,
        is_new: true,
        group_id: groupId
      });
    }

    // Find position to insert new items (after the last item of this group)
    const lastGroupItemIndex = currentItems.findLastIndex(item => item.group_id === groupId);
    const updatedItems = [...currentItems];
    updatedItems.splice(lastGroupItemIndex + 1, 0, ...newItems);

    return {
      updatedItems,
      newNextItemId: nextItemId + (newCount - currentCount)
    };
  } else if (newCount < currentCount) {
    // Remove items from the group (keep the first ones)
    const itemsToKeep = groupItems.slice(0, newCount);
    const itemIdsToKeep = new Set(itemsToKeep.map(item => item.id));

    const updatedItems = currentItems.filter(item => {
      if (item.group_id === groupId) {
        return itemIdsToKeep.has(item.id!);
      }
      return true;
    });

    return {
      updatedItems,
      newNextItemId: nextItemId
    };
  }

  return {
    updatedItems: currentItems,
    newNextItemId: nextItemId
  };
}

/**
 * Removes entire group
 */
export function removeGroup(groupId: string, currentItems: InventoryItem[]): InventoryItem[] {
  return currentItems.filter(item => item.group_id !== groupId);
}

/**
 * Ungroups items (removes group_id from all items in the group)
 */
export function ungroupItems(groupId: string, currentItems: InventoryItem[]): InventoryItem[] {
  return currentItems.map(item => {
    if (item.group_id === groupId) {
      return { ...item, group_id: '' };
    }
    return item;
  });
}

/**
 * Gets items that should be displayed (only first item of each group)
 */
export function getDisplayItems(items: InventoryItem[]): InventoryItem[] {
  const groupedItems = groupInventoryItems(items);
  return items.filter(item => {
    const groupInfo = getGroupInfo(item, groupedItems);
    return !groupInfo.isGroup || groupInfo.isFirstInGroup;
  });
}