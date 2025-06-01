"use client";

import CardList from "@/components/card-list";
import { motionTransition, motionTransitionScale } from '@/utils/anim';
import { createClient } from "@/utils/supabase/client";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Pagination,
  Skeleton,
  Spinner,
  Tab,
  Tabs
} from "@heroui/react";
import { Icon } from "@iconify-icon/react";
import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getNotifications, markAllNotificationsAsRead, markNotificationAsRead } from "./actions";
import { getUserFromCookies } from "@/utils/supabase/server/user";

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

interface AdminUser {
  uuid: string;
  company_uuid: string;
  is_admin: boolean;
  email: string;
  full_name: string;
}

export default function NotificationsPage() {
  // State for authentication and notifications
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Filter and pagination state
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [showAdminOnly, setShowAdminOnly] = useState(false);

  // Real-time updates
  useEffect(() => {
    const supabase = createClient();

    const initPage = async () => {
      try {
        const userData = await getUserFromCookies();
        if (userData === null) {
          setError('User not found');
          return;
        }

        setUser(userData);

        // Fetch initial notifications
        const result = await getNotifications({
          companyUuid: userData.company_uuid,
          userUuid: userData.uuid,
          isAdmin: userData.is_admin,
          page: page,
          pageSize: itemsPerPage,
          type: selectedTab === "all" ? undefined : selectedTab,
        });

        if (result.success) {
          setNotifications(result.data);
          setFilteredNotifications(result.data);
          setTotalPages(Math.ceil(result.total / itemsPerPage));
        }
      } catch (error) {
        console.error("Error initializing notifications page:", error);
      } finally {
        setLoading(false);
      }
    };

    initPage();

    // Set up real-time subscription for new notifications
    if (user?.company_uuid) {
      const channel = supabase
        .channel('notifications-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `company_uuid=eq.${user.company_uuid}`
          },
          async () => {
            // Refresh notifications when changes occur
            const refreshResult = await getNotifications({
              companyUuid: user.company_uuid,
              userUuid: user.uuid,
              isAdmin: user.is_admin,
              page: page,
              pageSize: itemsPerPage,
              type: selectedTab === "all" ? undefined : selectedTab,
            });

            if (refreshResult.success) {
              setNotifications(refreshResult.data);
              applyFilters(refreshResult.data);
              setTotalPages(Math.ceil(refreshResult.total / itemsPerPage));
            }
          }
        )
        .subscribe();

      // Also subscribe to notification_reads changes
      const readsChannel = supabase
        .channel('notification-reads-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notification_reads',
            filter: `user_uuid=eq.${user.uuid}`
          },
          async () => {
            // Refresh notifications when changes occur
            const refreshResult = await getNotifications({
              companyUuid: user.company_uuid,
              userUuid: user.uuid,
              isAdmin: user.is_admin,
              page: page,
              pageSize: itemsPerPage,
              type: selectedTab === "all" ? undefined : selectedTab,
            });

            if (refreshResult.success) {
              setNotifications(refreshResult.data);
              applyFilters(refreshResult.data);
              setTotalPages(Math.ceil(refreshResult.total / itemsPerPage));
            }
          }
        )
        .subscribe();

      // Cleanup function
      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(readsChannel);
      };
    }
  }, [user?.company_uuid, page, itemsPerPage, selectedTab]);

  // Reload when tab changes
  useEffect(() => {
    if (user) {
      const fetchNotifications = async () => {
        setLoading(true);
        const result = await getNotifications({
          companyUuid: user.company_uuid,
          userUuid: user.uuid,
          isAdmin: user.is_admin,
          page: 1, // Reset to first page when changing tabs
          pageSize: itemsPerPage,
          type: selectedTab === "all" ? undefined : selectedTab,
        });

        if (result.success) {
          setNotifications(result.data);
          applyFilters(result.data);
          setTotalPages(Math.ceil(result.total / itemsPerPage));
          setPage(1); // Reset page number
        }
        setLoading(false);
      };

      fetchNotifications();
    }
  }, [selectedTab]);

  // Apply filters when search changes
  useEffect(() => {
    applyFilters(notifications);
  }, [searchQuery, showAdminOnly, notifications]);

  const applyFilters = (allNotifications: Notification[]) => {
    let filtered = [...allNotifications];

    // Apply search filter if there's a query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(notif =>
        notif.entity_name.toLowerCase().includes(query) ||
        notif.user_name.toLowerCase().includes(query) ||
        notif.type.toLowerCase().includes(query) ||
        notif.action.toLowerCase().includes(query) ||
        notif.details?.status?.toLowerCase().includes(query) ||
        notif.details?.location_code?.toLowerCase().includes(query) ||
        notif.details?.recipient_name?.toLowerCase().includes(query) ||
        notif.details?.item_code?.toLowerCase().includes(query)
      );
    }

    // Filter user-only notifications if option is selected
    if (showAdminOnly && user?.is_admin) {
      filtered = filtered.filter(notif => notif.is_admin_only);
    }

    setFilteredNotifications(filtered);
  };

  const handleMarkAsRead = async (id: string) => {
    if (!user?.uuid) return;

    try {
      await markNotificationAsRead(id, user.uuid);

      // Update local state
      setNotifications(prev =>
        prev.map(notif =>
          notif.id === id ? { ...notif, read: true } : notif
        )
      );
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user?.uuid || !user?.company_uuid) return;

    try {
      const unreadIds = filteredNotifications
        .filter(n => !n.read)
        .map(n => n.id);

      if (unreadIds.length === 0) return;

      await markAllNotificationsAsRead(user.company_uuid, user.uuid, unreadIds);

      // Update local state
      setNotifications(prev =>
        prev.map(notif =>
          unreadIds.includes(notif.id) ? { ...notif, read: true } : notif
        )
      );
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  };

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


  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Notifications</h1>
            {loading ? (
              <div className="text-default-500 flex xl:justify-start justify-center items-center">
                <p className='my-auto mr-1'>Loading notification data</p>
                <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
              </div>
            ) : (
              <p className="text-default-500">Track changes across your system</p>
            )}
          </div>
          <div className="flex gap-4 xl:mt-0 mt-4 text-center">
            {user?.is_admin && (
              <Button
                color="danger"
                variant="shadow"
                onPress={() => setShowAdminOnly(!showAdminOnly)}
              >
                <div className="w-32">
                  <AnimatePresence>
                    {showAdminOnly ? (
                      <motion.div
                        {...motionTransition}
                        key="show-user-only"
                      >
                        <div className="w-32 flex items-center gap-2 justify-center">
                          Show all
                          <Icon icon={showAdminOnly ? "mdi:eye" : "mdi:eye-off"} width={18} />
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        {...motionTransition}
                        key="hide-user-only"
                      >
                        <div className="w-32 flex items-center gap-2 justify-center">
                          Admin only
                          <Icon icon={showAdminOnly ? "mdi:eye" : "mdi:eye-off"} width={18} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Button>
            )}

            <Button
              color="primary"
              variant="shadow"
              onPress={handleMarkAllAsRead}
              isDisabled={!filteredNotifications.some(n => !n.read)}
            >
              <Icon icon="mdi:check-all" className="mr-2" />
              Mark all as read
            </Button>
          </div>
        </div>

        <CardList className="bg-background flex flex-col">
          <div>
            {/* Fixed header */}
            <div className="sticky -top-4 z-20 w-full bg-background/80 border-b border-default-200 backdrop-blur-lg shadow-sm rounded-t-2xl p-4">
              <div className="flex flex-col xl:flex-row justify-between gap-4">
                <Input
                  placeholder="Search notifications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  startContent={<Icon icon="mdi:magnify" />}
                  isClearable
                  onClear={() => setSearchQuery("")}
                  className="xl:max-w-xs"
                />

                <Tabs
                  selectedKey={selectedTab}
                  onSelectionChange={key => setSelectedTab(key as string)}
                  color="primary"
                  variant="underlined"
                  classNames={{
                    tabList: "gap-4",
                    cursor: "bg-primary",
                  }}
                >
                  <Tab key="all" title="All" />
                  <Tab key="inventory" title="Inventory" />
                  <Tab key="warehouse" title="Warehouses" />
                  <Tab key="delivery" title="Deliveries" />
                  <Tab key="profile" title="Users" />
                  <Tab key="company" title="Companies" />
                </Tabs>

              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 overflow-hidden">

                <AnimatePresence>
                  {loading && (
                    <motion.div
                      {...motionTransition}>
                      <div className="space-y-4 h-full relative">
                        {[...Array(10)].map((_, i) => (
                          <Skeleton key={i} className="w-full min-h-28 rounded-xl" />
                        ))}
                        <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                        <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                          <Spinner />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {!loading && filteredNotifications.length === 0 && (
                    <motion.div
                      {...motionTransition}
                    >
                      <div className="flex flex-col items-center justify-center h-[300px] p-32">
                        <Icon icon="mdi:bell-off" className="text-5xl text-default-300" />
                        <p className="mt-4 text-default-500">No notifications found</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {!loading && filteredNotifications.length > 0 && (
                    <motion.div
                      {...motionTransition}>
                      <div className="space-y-4">
                        {filteredNotifications.map((notification) => (

                          <Card
                            className={`${notification.read ? 'bg-default-50' : 'bg-default-100'} overflow-hidden ${notification.is_admin_only ? 'border border-warning' : ''}`}
                          >
                            <CardBody>
                              <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-full h-12 w-12 bg-${getNotificationColor(notification.type, notification.is_admin_only)}-100 text-${getNotificationColor(notification.type, notification.is_admin_only)}-500`}>
                                  <Icon
                                    icon={getNotificationIcon(notification.type, notification.action)}
                                    width={24}
                                    height={24}
                                  />
                                </div>

                                <div className="flex-1">
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
                                    <div className="font-medium text-lg flex items-center gap-2">
                                      {notification.type.charAt(0).toUpperCase() + notification.type.slice(1)} {notification.action}

                                      {notification.is_admin_only && (
                                        <Chip color="warning" variant="flat">Admin Only</Chip>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 text-sm text-default-500">
                                      <span>{formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}</span>

                                      {!notification.read && (
                                        <Chip
                                          color="primary"
                                          size="sm"
                                          variant="flat"
                                        >
                                          New
                                        </Chip>
                                      )}
                                    </div>
                                  </div>

                                  <p className="mt-1">
                                    {getNotificationDetails(notification)}
                                  </p>

                                  <div className="flex justify-end mt-2">
                                    {!notification.read && (
                                      <Button
                                        size="sm"
                                        variant="light"
                                        color="primary"
                                        onPress={() => handleMarkAsRead(notification.id)}
                                      >
                                        Mark as read
                                      </Button>
                                    )}

                                    <Button
                                      size="sm"
                                      variant="light"
                                      onPress={() => {
                                        // Navigate to the relevant page based on notification type
                                        const entityId = notification.entity_id;
                                        switch (notification.type) {
                                          case 'inventory':
                                            window.location.href = `/home/inventory?itemId=${entityId}`;
                                            break;
                                          case 'delivery':
                                            window.location.href = `/home/delivery?deliveryId=${entityId}`;
                                            break;
                                          case 'warehouse':
                                            window.location.href = `/home/warehouses?warehouseId=${entityId}`;
                                            break;
                                          case 'profile':
                                            window.location.href = `/home/users?userId=${entityId}`;
                                            break;
                                          case 'company':
                                            window.location.href = `/home/companies?companyId=${entityId}`;
                                            break;
                                        }
                                      }}
                                    >
                                      View details
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardBody>
                          </Card>
                        ))}

                        {totalPages > 1 && (
                          <div className="flex justify-center mt-6">
                            <Pagination
                              total={totalPages}
                              initialPage={1}
                              page={page}
                              onChange={setPage}
                              classNames={{
                                cursor: "bg-primary",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </div>
          </div>

        </CardList>
      </div>
    </motion.div>
  );
}