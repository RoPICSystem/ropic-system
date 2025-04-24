"use client";

import { createClient } from "@/utils/supabase/client";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Spinner,
  Card,
  CardBody,
  Chip,
  Button,
  Tabs,
  Tab,
  Select,
  SelectItem,
  Pagination,
  Input,
  Divider,
} from "@heroui/react";
import { Icon } from "@iconify-icon/react";
import { motion } from "framer-motion";
import { checkAdminStatus } from "../inventory/actions";
import { getNotifications } from "./actions";

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
}

interface AdminUser {
  uuid: string;
  company_uuid: string;
  is_admin?: boolean;
  email?: string;
  full_name?: string;
}

export default function NotificationsPage() {
  // State for authentication and notifications
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([]);
  
  // Filter and pagination state
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  
  // Real-time updates
  useEffect(() => {
    const supabase = createClient();
    
    const initPage = async () => {
      try {
        // Check if user is admin and get their info
        const adminData = await checkAdminStatus();
        setAdmin(adminData);
        
        // Fetch initial notifications
        const result = await getNotifications({
          companyUuid: adminData.company_uuid,
          page: page,
          pageSize: itemsPerPage
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
    if (admin?.company_uuid) {
      const channel = supabase
        .channel('notifications-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `company_uuid=eq.${admin.company_uuid}`
          },
          async () => {
            // Refresh notifications when changes occur
            const refreshResult = await getNotifications({
              companyUuid: admin.company_uuid,
              page: page,
              pageSize: itemsPerPage
            });
            
            if (refreshResult.success) {
              setNotifications(refreshResult.data);
              applyFilters(refreshResult.data, selectedTab);
              setTotalPages(Math.ceil(refreshResult.total / itemsPerPage));
            }
          }
        )
        .subscribe();
      
      // Cleanup function
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [admin?.company_uuid, page, itemsPerPage]);
  
  // Apply filters when tab changes
  useEffect(() => {
    applyFilters(notifications, selectedTab);
  }, [selectedTab, searchQuery, notifications]);
  
  const applyFilters = (allNotifications: Notification[], tab: string) => {
    let filtered = [...allNotifications];
    
    // Apply type filter based on selected tab
    if (tab !== "all") {
      filtered = filtered.filter(notif => notif.type === tab);
    }
    
    // Apply search filter if there's a query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(notif => 
        notif.entity_name.toLowerCase().includes(query) || 
        notif.user_name.toLowerCase().includes(query)
      );
    }
    
    setFilteredNotifications(filtered);
  };
  
  const handleMarkAsRead = async (id: string) => {
    const supabase = createClient();
    
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);
        
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
    const supabase = createClient();
    
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('company_uuid', admin?.company_uuid)
        .in('id', filteredNotifications.filter(n => !n.read).map(n => n.id));
        
      // Update local state
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, read: true }))
      );
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  };
  
  const getNotificationIcon = (type: string, action: string) => {
    switch (type) {
      case 'inventory':
        return action === 'create' ? 'mdi:package-variant-plus' : 
               action === 'update' ? 'mdi:package-variant' : 
               'mdi:package-variant-remove';
      case 'warehouse':
        return action === 'create' ? 'mdi:warehouse-plus' : 
               action === 'update' ? 'mdi:warehouse' : 
               'mdi:warehouse-remove';
      case 'profile':
        return action === 'create' ? 'mdi:account-plus' : 
               action === 'update' ? 'mdi:account' : 
               'mdi:account-remove';
      case 'company':
        return action === 'create' ? 'mdi:domain-plus' : 
               action === 'update' ? 'mdi:domain' : 
               'mdi:domain-off';
      case 'delivery':
        return action === 'create' ? 'mdi:truck-plus' : 
               action === 'update' ? 'mdi:truck-delivery' : 
               'mdi:truck-remove';
      default:
        return 'mdi:bell';
    }
  };
  
  const getNotificationColor = (type: string) => {
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
    const { type, action, entity_name, details, user_name } = notification;
    const actionVerb = getActionVerb(action);
    
    // Base message
    let message = `${user_name} ${actionVerb} ${type} "${entity_name}"`;
    
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
  
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Spinner size="lg" />
        <p className="mt-4">Loading notifications...</p>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-default-500">Track changes across your system</p>
        </div>
        
        <Button
          color="primary"
          variant="light"
          onClick={handleMarkAllAsRead}
          isDisabled={!filteredNotifications.some(n => !n.read)}
        >
          <Icon icon="mdi:check-all" className="mr-2" />
          Mark all as read
        </Button>
      </div>
      
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
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
          
          <Input
            placeholder="Search notifications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            startContent={<Icon icon="mdi:magnify" />}
            isClearable
            onClear={() => setSearchQuery("")}
            className="max-w-xs"
          />
        </div>
        
        <Divider className="my-2" />
        
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Icon icon="mdi:bell-off" className="text-5xl text-default-300" />
            <p className="mt-4 text-default-500">No notifications found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredNotifications.map((notification) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Card 
                  className={`${notification.read ? 'bg-default-50' : 'bg-default-100'} overflow-hidden`}
                >
                  <CardBody>
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-full bg-${getNotificationColor(notification.type)}-100 text-${getNotificationColor(notification.type)}-500`}>
                        <Icon 
                          icon={getNotificationIcon(notification.type, notification.action)} 
                          width={24} 
                          height={24} 
                        />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center">
                          <div className="font-medium text-lg">
                            {notification.type.charAt(0).toUpperCase() + notification.type.slice(1)} {notification.action}
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
                              onClick={() => handleMarkAsRead(notification.id)}
                            >
                              Mark as read
                            </Button>
                          )}
                          
                          <Button
                            size="sm"
                            variant="light"
                            onClick={() => {
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
              </motion.div>
            ))}
            
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
          </div>
        )}
      </div>
    </div>
  );
}