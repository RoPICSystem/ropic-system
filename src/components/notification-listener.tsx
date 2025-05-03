"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addToast, Button, Chip } from '@heroui/react';
import { createClient } from '@/utils/supabase/client';
import { getUserProfile } from '@/utils/supabase/server/user';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { formatDistanceToNow } from "date-fns";
import { markNotificationAsRead } from "../app/home/notifications/actions";

const getNotificationIcon = (type: string, action: string) => {
  switch (type) {
    case 'inventory':
      return action === 'create' ? 'fluent:box-checkmark-24-filled' :
        action === 'update' ? 'fluent:box-24-filled' :
          'fluent:box-dismiss-24-filled';
    case 'warehouse':
      return action === 'create' ? 'material-symbols:warehouse-rounded' :
        action === 'update' ? 'material-symbols:warehouse-rounded' :
          'material-symbols:warehouse-rounded';
    case 'profile':
      return action === 'create' ? 'fluent:person-add-24-filled' :
        action === 'update' ? 'fluent:person-24-filled' :
          'fluent:person-delete-24-filled';
    case 'company':
      return action === 'create' ? 'fa6-solid:building-circle-check' :
        action === 'update' ? 'fa6-solid:building' :
          'fa6-solid:building-circle-xmark';
    case 'delivery':
      return action === 'create' ? 'mdi:truck-plus' :
        action === 'update' ? 'mdi:truck' :
          'mdi:truck-remove';
    default:
      return 'mdi:bell';
  }
};

// Define notification types based on our database schema
interface Notification {
  id: string;
  type: 'inventory' | 'warehouse' | 'profile' | 'company' | 'delivery';
  action: 'create' | 'update' | 'delete';
  entity_id: string;
  entity_name: string;
  details: Record<string, any>;
  read: boolean;
  created_at: string;
  company_uuid: string;
  user_uuid: string; // The user who performed the action
  user_name: string;
  is_admin_only: boolean;
}

const getNotificationDetails = (notification: Notification) => {
  const { type, action, entity_name, details, user_name, is_admin_only } = notification;
  const actionVerb = getActionVerb(action);

  // Base message
  let message = `${user_name} ${actionVerb} ${type} "${entity_name}"`;

  if (is_admin_only) {
    message = `[ADMIN] ${message}`;
  }

  // Additional details based on type
  if (details) {
    switch (type) {
      case 'inventory':
        if (details.quantity) {
          message += ` (${details.quantity} ${details.unit || 'units'})`;
        }
        if (details.location_code) {
          message += ` at location ${details.location_code}`;
        }
        if (details.status) {
          message += ` - Status: ${details.status}`;
        }
        break;
      case 'delivery':
        if (details.status) {
          message += ` - Status: ${details.status}`;
        }
        if (details.quantity) {
          message += ` (${details.quantity} units)`;
        }
        if (details.delivery_date) {
          message += ` for ${new Date(details.delivery_date).toLocaleDateString()}`;
        }
        if (details.recipient_name) {
          message += ` to ${details.recipient_name}`;
        }
        break;
      case 'warehouse':
        if (details.address?.city) {
          message += ` in ${details.address.city}`;
        }
        break;
      case 'profile':
        if (details.is_admin !== undefined) {
          message += details.is_admin ? ` (Admin)` : ` (User)`;
        }
        if (details.email) {
          message += ` - ${details.email}`;
        }
        break;
      case 'company':
        if (details.address?.city) {
          message += ` in ${details.address.city}`;
        }
        break;
    }
  }

  return message;
};

const getNotificationColor = (type: string, isAdminOnly: boolean) => {
  if (isAdminOnly) return 'warning';

  switch (type) {
    case 'inventory': return 'primary';
    case 'warehouse': return 'success';
    case 'profile': return 'secondary';
    case 'company': return 'warning';
    case 'delivery': return 'danger';
    default: return 'default';
  }
};

const getActionVerb = (action: string) => {
  switch (action) {
    case 'create': return 'created';
    case 'update': return 'updated';
    case 'delete': return 'deleted';
    default: return 'modified';
  }
};

export default function NotificationListener() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<{ uuid: string, company_uuid: string, is_admin: boolean } | null>(null);


  const handleMarkAsRead = async (id: string) => {
    if (!userProfile?.uuid) return;

    try {
      await markNotificationAsRead(id, userProfile.uuid);
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  useEffect(() => {
    // Get user profile on mount
    const fetchUserProfile = async () => {
      try {
        const { data, error } = await getUserProfile();
        if (error || !data) {
          console.error("Error fetching user profile:", error);
          return;
        }
        setUserProfile(data);
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

          // Skip admin-only notifications if user is not an admin
          if (notification.is_admin_only && !userProfile.is_admin) {
            return;
          }

          // Display toast notification
          addToast({
            title: (
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-full h-8 w-8 bg-${getNotificationColor(notification.type, notification.is_admin_only)}-100 text-${getNotificationColor(notification.type, notification.is_admin_only)}-500`}>
                  <Icon
                    icon={getNotificationIcon(notification.type, notification.action)}
                    width={16}
                    height={16}
                  />
                </div>
                <div className="font-medium text-lg flex items-center gap-2">
                  {notification.type.charAt(0).toUpperCase() + notification.type.slice(1)} {notification.action}
                  {notification.is_admin_only && (
                    <Chip color="warning" variant="flat">Admin Only</Chip>
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
            timeout: 30000,
            closeIcon: (
              <Icon icon="mdi:close" className="rounded-full bg-default-200 p-2 hover:bg-default-300 transition-all duration-200" width={16} height={16} />
            ),
            hideIcon: true,
            description: (
              <div className="flex flex-col gap-1 w-full mt-2">
                <p className="text-sm w-full">{getNotificationDetails(notification)}</p>
                <div className="flex gap-2 mt-1">
                  <Button
                    size="sm"
                    variant="light"
                    onPress={() => {
                      // Navigate to the relevant page based on notification type
                      const entityId = notification.entity_id;
                      switch (notification.type) {
                        case 'inventory':
                          router.push(`/home/inventory?itemId=${entityId}`);
                          break;
                        case 'delivery':
                          router.push(`/home/delivery?deliveryId=${entityId}`);
                          break;
                        case 'warehouse':
                          router.push(`/home/warehouses?warehouseId=${entityId}`);
                          break;
                        case 'company':
                          router.push(`/home/company`);
                          break;
                      }
                    }}
                    className="text-xs py-1 px-2 h-7"
                  >
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="light"
                    onPress={() => handleMarkAsRead(notification.id)}
                    className="text-xs py-1 px-2 h-7"
                  >
                    Mark read
                  </Button>
                </div>
              </div>
            ),
            color: notification.is_admin_only ? "warning" : "primary",
          });
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile, router]);

  // This component doesn't render anything
  return null;
}