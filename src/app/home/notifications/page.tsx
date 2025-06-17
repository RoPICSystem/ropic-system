"use client";

import CardList from "@/components/card-list";
import { motionTransition } from '@/utils/anim';
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
import { 
  getNotifications, 
  markAllNotificationsAsRead, 
  markNotificationAsRead,
  countUnreadNotifications,
  getNotificationStats,
  deleteOldNotifications
} from "./actions";
import { getUserFromCookies } from "@/utils/supabase/server/user";

// Define notification types based on our updated database schema
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

export default function NotificationsPage() {
  // State for authentication and notifications
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>({});
  const [unreadCount, setUnreadCount] = useState(0);

  // Filter and pagination state
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [showAdminOnly, setShowAdminOnly] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  // Type mappings for the new schema
  const typeIcons = {
    reorder_point_logs: "mdi:alert-circle",
    warehouses: "mdi:warehouse",
    warehouse_inventory_items: "mdi:package-variant",
    warehouse_inventory: "mdi:archive",
    profiles: "mdi:account",
    inventory_items: "mdi:package",
    inventory: "mdi:archive-outline",
    delivery_items: "mdi:truck",
    companies: "mdi:domain"
  };

  const typeLabels = {
    reorder_point_logs: "Reorder Alerts",
    warehouses: "Warehouses", 
    warehouse_inventory_items: "Warehouse Items",
    warehouse_inventory: "Warehouse Groups",
    profiles: "User Profiles",
    inventory_items: "Inventory Items", 
    inventory: "Inventory Groups",
    delivery_items: "Deliveries",
    companies: "Company"
  };

  const actionLabels = {
    create: "Created",
    update: "Updated",
    delete: "Deleted", 
    status_change: "Status Changed"
  };

  // Tab mapping to notification types
  const getTabTypes = (tab: string) => {
    switch (tab) {
      case "inventory":
        return ['inventory', 'inventory_items'];
      case "warehouse":
        return ['warehouses', 'warehouse_inventory', 'warehouse_inventory_items', 'reorder_point_logs'];
      case "delivery":
        return ['delivery_items'];
      case "profile":
        return ['profiles'];
      case "company":
        return ['companies'];
      default:
        return undefined;
    }
  };

  // Real-time updates and initialization
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
        await Promise.all([
          fetchNotifications(userData),
          fetchStats(userData),
          fetchUnreadCount(userData)
        ]);
      } catch (error) {
        console.error("Error initializing notifications page:", error);
        setError("Failed to load notifications");
      } finally {
        setLoading(false);
      }
    };

    initPage();

    // Set up real-time subscription for new notifications
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public', 
          table: 'notifications'
        },
        async (payload) => {
          if (user) {
            await Promise.all([
              fetchNotifications(user),
              fetchStats(user),
              fetchUnreadCount(user)
            ]);
          }
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch functions
  const fetchNotifications = async (userData: AdminUser) => {
    try {
      const tabTypes = getTabTypes(selectedTab);
      const result = await getNotifications({
        companyUuid: userData.company_uuid,
        type: tabTypes ? tabTypes[0] as any : undefined, // For now, use first type
        read: showUnreadOnly ? false : undefined,
        search: searchQuery || undefined,
        limit: itemsPerPage,
        offset: (page - 1) * itemsPerPage
      });

      if (result.error) {
        setError(result.error);
      } else {
        setNotifications(result.data || []);
        applyFilters(result.data || []);
        // Note: You'll need to add total count to the getNotifications response
        setTotalPages(Math.ceil((result.data?.length || 0) / itemsPerPage));
      }
    } catch (err) {
      setError("Failed to fetch notifications");
      console.error(err);
    }
  };

  const fetchStats = async (userData: AdminUser) => {
    try {
      const result = await getNotificationStats(userData.company_uuid, userData.is_admin);
      if (result.data) {
        setStats(result.data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  };

  const fetchUnreadCount = async (userData: AdminUser) => {
    try {
      const result = await countUnreadNotifications(
        userData.company_uuid,
        userData.uuid,
        userData.is_admin
      );
      if (result.count !== undefined) {
        setUnreadCount(result.count);
      }
    } catch (err) {
      console.error("Failed to fetch unread count:", err);
    }
  };

  // Reload when tab, page, or filters change
  useEffect(() => {
    if (user) {
      setLoading(true);
      fetchNotifications(user);
    }
  }, [selectedTab, page, showUnreadOnly]);

  // Apply filters when search changes
  useEffect(() => {
    applyFilters(notifications);
  }, [searchQuery, showAdminOnly, notifications]);

  const applyFilters = (allNotifications: Notification[]) => {
    let filtered = [...allNotifications];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(notif =>
        notif.entity_name.toLowerCase().includes(query) ||
        notif.user_name.toLowerCase().includes(query) ||
        notif.type.toLowerCase().includes(query) ||
        notif.action.toLowerCase().includes(query) ||
        JSON.stringify(notif.details).toLowerCase().includes(query)
      );
    }

    // Filter admin-only notifications based on user role and toggle
    if (showAdminOnly && user?.is_admin) {
      filtered = filtered.filter(notif => notif.is_admin_only);
    } else if (!user?.is_admin) {
      filtered = filtered.filter(notif => !notif.is_admin_only);
    }

    // Filter by tab type
    if (selectedTab !== "all") {
      const tabTypes = getTabTypes(selectedTab);
      if (tabTypes) {
        filtered = filtered.filter(notif => tabTypes.includes(notif.type));
      }
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
      
      // Update unread count
      if (user) {
        fetchUnreadCount(user);
      }
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

      // Update unread count
      fetchUnreadCount(user);
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  };

  const handleCleanupOld = async () => {
    if (!user?.company_uuid) return;

    try {
      await deleteOldNotifications(user.company_uuid, 30);
      if (user) {
        await Promise.all([
          fetchNotifications(user),
          fetchStats(user)
        ]);
      }
    } catch (error) {
      console.error("Error cleaning up old notifications:", error);
    }
  };

  const getNotificationIcon = (notification: Notification) => {
    const iconName = typeIcons[notification.type] || "mdi:bell";
    
    let className = "text-lg ";
    if (notification.action === 'status_change') {
      if (notification.details?.status === 'CRITICAL' || notification.details?.new_status === 'CRITICAL') {
        className += "text-danger";
      } else if (notification.details?.status === 'WARNING' || notification.details?.new_status === 'WARNING') {
        className += "text-warning";
      } else {
        className += "text-primary";
      }
    } else if (notification.action === 'create') {
      className += "text-success";
    } else if (notification.action === 'delete') {
      className += "text-danger";
    } else {
      className += "text-primary";
    }
    
    return <Icon icon={iconName} className={className} />;
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

  const getNotificationMessage = (notification: Notification) => {
    const action = actionLabels[notification.action];
    const type = typeLabels[notification.type];
    
    if (notification.action === 'status_change') {
      const oldStatus = notification.details?.old_status;
      const newStatus = notification.details?.new_status || notification.details?.status;
      return `${notification.entity_name} status changed${oldStatus ? ` from ${oldStatus}` : ''} to ${newStatus}`;
    }
    
    return `${action} ${type.toLowerCase()}: ${notification.entity_name}`;
  };

  const getAdditionalDetails = (notification: Notification) => {
    const { details, type } = notification;
    if (!details) return null;

    switch (type) {
      case 'reorder_point_logs':
        return (
          <div className="text-sm text-default-500 mt-1">
            Current stock: {details.current_stock} | Reorder point: {details.reorder_point}
          </div>
        );
      case 'inventory_items':
      case 'warehouse_inventory_items':
        return (
          <div className="text-sm text-default-500 mt-1">
            {details.unit_value && `Value: ${details.unit_value} ${details.unit}`}
            {details.cost && ` | Cost: $${details.cost}`}
          </div>
        );
      case 'delivery_items':
        return (
          <div className="text-sm text-default-500 mt-1">
            {details.delivery_address && `To: ${details.delivery_address}`}
            {details.delivery_date && ` | Date: ${new Date(details.delivery_date).toLocaleDateString()}`}
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <motion.div {...motionTransition}>
        <div className="container mx-auto p-2 max-w-5xl">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="w-full h-24 rounded-xl" />
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Notifications</h1>
            <div className="flex items-center gap-4 text-default-500">
              <p>Track changes across your system</p>
              {unreadCount > 0 && (
                <Chip color="danger" size="sm">
                  {unreadCount} unread
                </Chip>
              )}
            </div>
          </div>
          
          <div className="flex gap-4 xl:mt-0 mt-4">
            {user?.is_admin && (
              <Button
                color="secondary"
                variant="flat"
                onPress={() => setShowAdminOnly(!showAdminOnly)}
              >
                <Icon icon={showAdminOnly ? "mdi:eye" : "mdi:shield-account"} />
                {showAdminOnly ? "Show All" : "Admin Only"}
              </Button>
            )}
            
            <Button
              color="primary"
              variant="flat"
              onPress={() => setShowUnreadOnly(!showUnreadOnly)}
            >
              <Icon icon={showUnreadOnly ? "mdi:email-open" : "mdi:email"} />
              {showUnreadOnly ? "Show All" : "Unread Only"}
            </Button>

            <Button
              color="primary"
              variant="shadow"
              onPress={handleMarkAllAsRead}
              isDisabled={!filteredNotifications.some(n => !n.read)}
            >
              <Icon icon="mdi:check-all" />
              Mark All Read
            </Button>

            {user?.is_admin && (
              <Button
                color="danger"
                variant="flat"
                onPress={handleCleanupOld}
              >
                <Icon icon="mdi:delete-sweep" />
                Cleanup Old
              </Button>
            )}
          </div>
        </div>

        {/* Stats Overview */}
        {Object.keys(stats).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            {Object.entries(stats).map(([type, data]: [string, any]) => (
              <Card key={type} className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Icon icon={typeIcons[type as keyof typeof typeIcons] || "mdi:bell"} className="text-lg" />
                  <span className="text-sm font-medium">
                    {typeLabels[type as keyof typeof typeLabels]}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">{data.total}</span>
                  {data.unread > 0 && (
                    <Chip color="danger" size="sm">{data.unread}</Chip>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

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
              <div className="p-4">
                <AnimatePresence>
                  {loading && (
                    <motion.div {...motionTransition}>
                      <div className="space-y-4">
                        {[...Array(10)].map((_, i) => (
                          <Skeleton key={i} className="w-full h-24 rounded-xl" />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {!loading && filteredNotifications.length === 0 && (
                    <motion.div {...motionTransition}>
                      <div className="flex flex-col items-center justify-center h-[300px]">
                        <Icon icon="mdi:bell-off" className="text-5xl text-default-300" />
                        <p className="mt-4 text-default-500">No notifications found</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {!loading && filteredNotifications.length > 0 && (
                    <motion.div {...motionTransition}>
                      <div className="space-y-4">
                        {filteredNotifications.map((notification) => (
                          <Card
                            key={notification.id}
                            className={`${notification.read ? 'bg-default-50' : 'bg-default-100'} overflow-hidden ${notification.is_admin_only ? 'border-2 border-warning' : ''}`}
                          >
                            <CardBody>
                              <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-full flex-shrink-0 bg-${getNotificationColor(notification.type, notification.is_admin_only)}-100`}>
                                  {getNotificationIcon(notification)}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-lg">
                                          {typeLabels[notification.type]}
                                        </span>
                                        <Chip
                                          color={getNotificationColor(notification.type, notification.is_admin_only)}
                                          size="sm"
                                          variant="flat"
                                        >
                                          {actionLabels[notification.action]}
                                        </Chip>
                                        {notification.is_admin_only && (
                                          <Chip color="warning" size="sm" variant="flat">
                                            Admin Only
                                          </Chip>
                                        )}
                                        {!notification.read && (
                                          <Chip color="primary" size="sm" variant="dot">
                                            New
                                          </Chip>
                                        )}
                                      </div>

                                      <p className="text-default-600">
                                        {getNotificationMessage(notification)}
                                      </p>

                                      {getAdditionalDetails(notification)}

                                      <div className="flex items-center gap-4 mt-2 text-sm text-default-500">
                                        <span>By {notification.user_name || 'System'}</span>
                                        <span>{formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 mt-2 sm:mt-0">
                                      {!notification.read && (
                                        <Button
                                          size="sm"
                                          variant="flat"
                                          color="primary"
                                          onPress={() => handleMarkAsRead(notification.id)}
                                        >
                                          <Icon icon="mdi:check" />
                                          Mark Read
                                        </Button>
                                      )}
                                    </div>
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