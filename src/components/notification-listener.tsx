"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { addToast, Button, Chip } from '@heroui/react';
import { createClient } from '@/utils/supabase/client';
import { getUserFromCookies } from '@/utils/supabase/server/user';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { formatDistanceToNow } from "date-fns";
import { markNotificationAsRead } from "../app/home/notifications/actions";
import { formatStatus } from '@/utils/tools';

// Updated notification interface to match current schema
interface Notification {
  id: string;
  type: 'reorder_point_logs' | 'warehouses' | 'warehouse_inventory_items' | 'warehouse_inventory' | 'profiles' | 'inventory_items' | 'inventory' | 'delivery_items' | 'companies';
  action: 'create' | 'update' | 'delete' | 'status_change';
  entity_id: string;
  entity_name: string;
  details: Record<string, any>;
  read: boolean;
  created_at: string;
  company_uuid: string;
  user_uuid: string;
  user_name: string;
  is_admin_only: boolean;
  user_profile?: {
    full_name: string;
    email: string;
    name: any;
    profile_image?: string;
  };
  entity_data?: any;
}

interface AdminUser {
  uuid: string;
  company_uuid: string;
  is_admin: boolean;
  email: string;
  full_name: string;
}

interface GroupedNotification {
  key: string;
  type: string;
  action: string;
  user_name: string;
  is_admin_only: boolean;
  notifications: Notification[];
  count: number;
  firstNotification: Notification;
  lastNotification: Notification;
  entityNames: string[];
  changedProperties: Record<string, any[]>;
  inventoryInfo?: {
    count?: any;
    unit_values?: any;
  };
}

interface NotificationBuffer {
  [key: string]: {
    notifications: Notification[];
    timeoutId: NodeJS.Timeout;
  };
}

const DEBOUNCE_TIME = 2000; // 2 seconds

const getNotificationIcon = (type: string, action: string) => {
  switch (type) {
    case 'inventory':
    case 'inventory_items':
      return action === 'create' ? 'fluent:box-checkmark-24-filled' :
        action === 'update' ? 'fluent:box-24-filled' :
          'fluent:box-dismiss-24-filled';
    case 'warehouses':
    case 'warehouse_inventory':
    case 'warehouse_inventory_items':
      return action === 'create' ? 'material-symbols:warehouse-rounded' :
        action === 'update' ? 'material-symbols:warehouse-rounded' :
          'material-symbols:warehouse-rounded';
    case 'profiles':
      return action === 'create' ? 'fluent:person-add-24-filled' :
        action === 'update' ? 'fluent:person-24-filled' :
          'fluent:person-delete-24-filled';
    case 'companies':
      return action === 'create' ? 'fa6-solid:building-circle-check' :
        action === 'update' ? 'fa6-solid:building' :
          'fa6-solid:building-circle-xmark';
    case 'delivery_items':
      return action === 'create' ? 'mdi:truck-plus' :
        action === 'update' ? 'mdi:truck' :
          'mdi:truck-remove';
    case 'reorder_point_logs':
      return 'mdi:alert-circle';
    default:
      return 'mdi:bell';
  }
};

const getNotificationColor = (type: string, isAdminOnly: boolean) => {
  if (isAdminOnly) return 'warning';

  switch (type) {
    case 'inventory':
    case 'inventory_items':
      return 'primary';
    case 'warehouses':
    case 'warehouse_inventory':
    case 'warehouse_inventory_items':
      return 'success';
    case 'profiles':
      return 'secondary';
    case 'companies':
      return 'warning';
    case 'delivery_items':
      return 'danger';
    case 'reorder_point_logs':
      return 'danger';
    default:
      return 'default';
  }
};

const getActionVerb = (action: string, count: number = 1) => {
  const verb = action === 'create' ? 'created' :
    action === 'update' ? 'updated' :
      action === 'delete' ? 'deleted' :
        action === 'status_change' ? 'changed status of' : 'modified';
  
  return verb;
};

const getTypeDisplayName = (type: string, count: number = 1) => {
  const typeMap: Record<string, { singular: string; plural: string }> = {
    'inventory': { singular: 'inventory item', plural: 'inventory items' },
    'inventory_items': { singular: 'inventory item', plural: 'inventory items' },
    'warehouses': { singular: 'warehouse', plural: 'warehouses' },
    'warehouse_inventory': { singular: 'warehouse inventory', plural: 'warehouse inventory items' },
    'warehouse_inventory_items': { singular: 'warehouse inventory item', plural: 'warehouse inventory items' },
    'profiles': { singular: 'user profile', plural: 'user profiles' },
    'companies': { singular: 'company', plural: 'companies' },
    'delivery_items': { singular: 'delivery item', plural: 'delivery items' },
    'reorder_point_logs': { singular: 'reorder alert', plural: 'reorder alerts' }
  };

  const typeInfo = typeMap[type] || { singular: type, plural: type + 's' };
  return count === 1 ? typeInfo.singular : typeInfo.plural;
};

const extractChangedProperties = (notifications: Notification[]): Record<string, any[]> => {
  const changedProperties: Record<string, any[]> = {};

  notifications.forEach(notification => {
    if (notification.details && typeof notification.details === 'object') {
      Object.entries(notification.details).forEach(([key, value]) => {
        if (!changedProperties[key]) {
          changedProperties[key] = [];
        }
        
        // For unit_values and count, only keep the last update
        if (key === 'unit_values' || key === 'count') {
          changedProperties[key] = [value]; // Replace with latest value
        } else {
          // For other properties, collect unique values
          if (!changedProperties[key].includes(value)) {
            changedProperties[key].push(value);
          }
        }
      });
    }
  });

  return changedProperties;
};

// Helper function to format JSONB values for display
const formatJSONBValue = (value: any): string => {
  if (typeof value === 'object' && value !== null) {
    // Handle JSONB objects like count and unit_values
    if (typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value);
      if (entries.length === 0) return '{}';
      return `{${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}}`;
    }
    // Handle arrays
    if (Array.isArray(value)) {
      return `[${value.join(', ')}]`;
    }
    // Try to stringify other objects
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

// Helper function to format inventory count/unit_values as readable text
const formatInventoryInfo = (countData: any, unitValuesData: any, entityName: string): string => {
  const parts: string[] = [];
  
  if (countData && typeof countData === 'object') {
    if (countData.available !== undefined) {
      parts.push(`${countData.available} available`);
    }
    if (countData.inventory !== undefined && countData.inventory !== countData.available) {
      parts.push(`${countData.inventory} in inventory`);
    }
    if (countData.warehouse !== undefined && countData.warehouse > 0) {
      parts.push(`${countData.warehouse} in warehouse`);
    }
    if (countData.total !== undefined) {
      parts.push(`${countData.total} total`);
    }
  }
  
  // Get unit information from unit_values if available
  let unitInfo = '';
  if (unitValuesData && typeof unitValuesData === 'object') {
    // Try to extract unit information - this might need adjustment based on your data structure
    const unitEntries = Object.entries(unitValuesData);
    if (unitEntries.length > 0) {
      // Look for the standard unit or first available unit
      const firstEntry = unitEntries[0];
      if (firstEntry[1] && typeof firstEntry[1] === 'number' && firstEntry[1] > 0) {
        // You might need to get the actual unit from the inventory record
        // For now, we'll try to infer it or use a default
        unitInfo = ' units'; // You might want to pass the actual unit here
      }
    }
  }
  
  if (parts.length > 0) {
    const countText = parts.join(', ');
    return `Current stock: ${countText}${unitInfo}`;
  }
  
  return '';
};

const formatChangedProperties = (changedProperties: Record<string, any[]>, type: string): string => {
  const propertyStrings = Object.entries(changedProperties)
    .filter(([key, values]) => {
      // Skip timestamp, count, and unit_values for inventory types as they're handled separately
      if (key === 'timestamp') return false;
      if ((type === 'inventory' || type === 'warehouse_inventory') && (key === 'count' || key === 'unit_values')) {
        return false;
      }
      return values.length > 0;
    })
    .map(([key, values]) => {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      // Handle other object types
      const formattedValues = values.map(value => {
        if (typeof value === 'object' && value !== null) {
          return formatJSONBValue(value);
        }
        return String(value);
      });
      
      if (formattedValues.length === 1) {
        return `${formattedKey}: ${formattedValues[0]}`;
      } else {
        return `${formattedKey}: ${formattedValues.join(', ')}`;
      }
    });

  return propertyStrings.length > 0 ? ` (${propertyStrings.join('; ')})` : '';
};

const getGroupedNotificationMessage = (grouped: GroupedNotification): string => {
  const { type, action, user_name, is_admin_only, count, entityNames } = grouped;
  const actionVerb = getActionVerb(action, count);
  const typeDisplay = getTypeDisplayName(type, count);

  let message = `${user_name} ${actionVerb} ${count} ${typeDisplay}`;

  if (is_admin_only) {
    message = `[ADMIN] ${message}`;
  }

  // Add entity names if there are few enough to display
  if (count <= 3) {
    message += `: ${entityNames.join(', ')}`;
  } else {
    message += ` including: ${entityNames.slice(0, 2).join(', ')} and ${count - 2} more`;
  }

  return message;
};

const getNotificationNavigationPath = (notification: Notification): string => {
  const entityId = notification.entity_id;
  switch (notification.type) {
    case 'inventory':
    case 'inventory_items':
      return `/home/inventory?itemId=${entityId}`;
    case 'delivery_items':
      return `/home/delivery?deliveryId=${entityId}`;
    case 'warehouses':
    case 'warehouse_inventory':
    case 'warehouse_inventory_items':
      return `/home/warehouses?warehouseId=${entityId}`;
    case 'profiles':
      return `/home/users?userId=${entityId}`;
    case 'companies':
      return `/home/companies?companyId=${entityId}`;
    case 'reorder_point_logs':
      return `/home/inventory?itemId=${entityId}`;
    default:
      return '/home';
  }
};

export default function NotificationListener() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<AdminUser | null>(null);
  const notificationBufferRef = useRef<NotificationBuffer>({});

  const handleMarkAsRead = async (notificationIds: string[]) => {
    if (!userProfile?.uuid) return;

    try {
      // Mark multiple notifications as read
      await Promise.all(
        notificationIds.map(id => markNotificationAsRead(id, userProfile.uuid))
      );
    } catch (error) {
      console.error("Error marking notifications as read:", error);
    }
  };

  const createGroupKey = (notification: Notification): string => {
    return `${notification.type}-${notification.action}-${notification.user_uuid}-${notification.is_admin_only}`;
  };

  const processGroupedNotifications = (notifications: Notification[]) => {
    if (notifications.length === 0) return;

    const changedProperties = extractChangedProperties(notifications);
    
    // Extract inventory info for inventory-related notifications
    let inventoryInfo: { count?: any; unit_values?: any } | undefined;
    if (notifications[0].type === 'inventory' || notifications[0].type === 'warehouse_inventory') {
      inventoryInfo = {
        count: changedProperties.count?.[0],
        unit_values: changedProperties.unit_values?.[0]
      };
    }

    // Group notifications by type, action, user, and admin status
    const grouped: GroupedNotification = {
      key: createGroupKey(notifications[0]),
      type: notifications[0].type,
      action: notifications[0].action,
      user_name: notifications[0].user_name,
      is_admin_only: notifications[0].is_admin_only,
      notifications,
      count: notifications.length,
      firstNotification: notifications[0],
      lastNotification: notifications[notifications.length - 1],
      entityNames: notifications.map(n => n.entity_name),
      changedProperties,
      inventoryInfo
    };

    // Display grouped toast notification
    addToast({
      title: (
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-full h-8 w-8 bg-${getNotificationColor(grouped.type, grouped.is_admin_only)}-100 text-${getNotificationColor(grouped.type, grouped.is_admin_only)}-500`}>
            <Icon
              icon={getNotificationIcon(grouped.type, grouped.action)}
              width={16}
              height={16}
            />
          </div>
          <div className="font-medium text-lg flex items-center gap-2">
            {grouped.count > 1 ? `${grouped.count} ` : ''}
            {formatStatus(grouped.type)} {grouped.action}
            {grouped.is_admin_only && (
              <Chip color="warning" variant="flat" size="sm">Admin Only</Chip>
            )}
          </div>
        </div>
      ),
      variant: "flat",
      classNames: {
        wrapper: "p-2",
        title: "m-0",
        description: "m-0",
        closeButton: "opacity-100 absolute right-4 top-4"
      },
      timeout: grouped.count > 1 ? 45000 : 30000, // Longer timeout for grouped notifications
      closeIcon: (
        <Icon icon="mdi:close" className="rounded-full bg-default-200 p-2 hover:bg-default-300 transition-all duration-200" width={16} height={16} />
      ),
      hideIcon: true,
      description: (
        <div className="flex flex-col gap-2 w-full mt-2">
          <p className="text-sm w-full">{getGroupedNotificationMessage(grouped)}</p>
          
          {/* Show inventory info as readable text for inventory updates */}
          {grouped.inventoryInfo && (grouped.inventoryInfo.count || grouped.inventoryInfo.unit_values) && (
            <div className="text-sm text-primary-600 bg-primary-50 p-2 rounded-md">
              {formatInventoryInfo(
                grouped.inventoryInfo.count, 
                grouped.inventoryInfo.unit_values, 
                grouped.entityNames[0]
              )}
            </div>
          )}
          
          {/* Show other changed properties */}
          {Object.keys(grouped.changedProperties).length > 0 && (
            (() => {
              const filteredProperties = formatChangedProperties(grouped.changedProperties, grouped.type);
              return filteredProperties ? (
                <div className="text-xs text-default-500 bg-default-100 p-2 rounded">
                  <div className="font-medium mb-1">Other changes:</div>
                  <div className="break-all">{filteredProperties.substring(2, filteredProperties.length - 1)}</div>
                </div>
              ) : null;
            })()
          )}

          <div className="flex gap-2 mt-1">
            {grouped.count === 1 ? (
              <Button
                size="sm"
                variant="light"
                onPress={() => router.push(getNotificationNavigationPath(grouped.firstNotification))}
                className="text-xs py-1 px-2 h-7"
              >
                View
              </Button>
            ) : (
              <Button
                size="sm"
                variant="light"
                onPress={() => {
                  // Navigate to the general page for grouped notifications
                  const basePath = grouped.type.includes('inventory') ? '/home/inventory' :
                    grouped.type.includes('warehouse') ? '/home/warehouses' :
                      grouped.type.includes('delivery') ? '/home/delivery' :
                        grouped.type.includes('profile') ? '/home/users' :
                          grouped.type.includes('compan') ? '/home/companies' : '/home';
                  router.push(basePath);
                }}
                className="text-xs py-1 px-2 h-7"
              >
                View All
              </Button>
            )}
            <Button
              size="sm"
              variant="light"
              onPress={() => handleMarkAsRead(grouped.notifications.map(n => n.id))}
              className="text-xs py-1 px-2 h-7"
            >
              Mark {grouped.count > 1 ? 'all ' : ''}read
            </Button>
          </div>
        </div>
      ),
      color: grouped.is_admin_only ? "warning" : "primary",
    });
  };

  const handleNewNotification = (notification: Notification) => {
    // Skip admin-only notifications if user is not an admin
    if (notification.is_admin_only && !userProfile?.is_admin) {
      return;
    }

    const groupKey = createGroupKey(notification);
    const buffer = notificationBufferRef.current;

    // Clear existing timeout for this group
    if (buffer[groupKey]?.timeoutId) {
      clearTimeout(buffer[groupKey].timeoutId);
    }

    // Add notification to buffer
    if (!buffer[groupKey]) {
      buffer[groupKey] = {
        notifications: [],
        timeoutId: setTimeout(() => {
          processGroupedNotifications(buffer[groupKey].notifications);
          delete buffer[groupKey];
        }, DEBOUNCE_TIME)
      };
    } else {
      // Update timeout
      buffer[groupKey].timeoutId = setTimeout(() => {
        processGroupedNotifications(buffer[groupKey].notifications);
        delete buffer[groupKey];
      }, DEBOUNCE_TIME);
    }

    buffer[groupKey].notifications.push(notification);
  };

  useEffect(() => {
    // Get user profile on mount
    const fetchUserProfile = async () => {
      try {
        const userData = await getUserFromCookies();
        if (!userData) {
          console.error("No user data found");
          return;
        }
        setUserProfile(userData);
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
    };

    fetchUserProfile();
  }, []);

  useEffect(() => {
    // Only set up subscription if we have user data
    if (!userProfile?.uuid || !userProfile?.company_uuid) return;

    const supabase = createClient();

    // Subscribe to new notifications for this company
    const channel = supabase
      .channel('notifications-new')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `company_uuid=eq.${userProfile.company_uuid}`
        },
        (payload) => {
          const notification = payload.new as Notification;
          handleNewNotification(notification);
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      // Clear all pending timeouts
      Object.values(notificationBufferRef.current).forEach(buffer => {
        if (buffer.timeoutId) {
          clearTimeout(buffer.timeoutId);
        }
      });
      notificationBufferRef.current = {};
      
      supabase.removeChannel(channel);
    };
  }, [userProfile, router]);

  // This component doesn't render anything
  return null;
}