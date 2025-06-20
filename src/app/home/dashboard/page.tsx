"use client";

import { format } from "date-fns";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getDashboardData, getUserDashboardData, getNotificationCount } from "./actions";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Progress,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from "@heroui/react";

import { Icon } from "@iconify-icon/react";

// Charts
import { formatNumber } from '@/utils/tools';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Legend,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis
} from "recharts";
import { getUserFromCookies } from "@/utils/supabase/server/user";
import { AnimatePresence, motion } from "framer-motion";
import { motionTransition, motionTransitionScale } from "@/utils/anim";
import LoadingAnimation from "@/components/loading-animation";
import { herouiColorOpacity, herouiColor } from "@/utils/colors";

// StatsCard component for displaying simple metrics - using inline definition
interface StatsCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: string;
  icon2?: string;
  color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
}

const StatsCard = ({ title, value, subtitle, icon, icon2, color = "primary" }: StatsCardProps) => (
  <Card className={`bg-${color}-50 border border-${color}-100 shadow-xl`}>
    <CardBody className="p-3 overflow-hidden relative">
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm text-${color}-600`}>{title}</p>
          <p className={`text-4xl font-bold text-${color}-800`}>{value}</p>
          {subtitle && <p className="text-small text-default-400">{subtitle}</p>}
        </div>
        <Icon icon={icon}
          className={`text-${color}-500 absolute ${icon2 ? 'top-3 right-6' : 'top-1/2 -translate-y-1/2 right-4'} blur-3xl`}
          width={85} height={85} />
        <Icon icon={icon}
          className={`text-${color}-500 absolute ${icon2 ? 'top-3 right-6' : 'top-1/2 -translate-y-1/2 right-4'}`}
          width={50} height={50} />

        {icon2 && (<>
          <Icon icon={icon2}
            className={`text-${color}-500 absolute right-3 bottom-3 blur-3xl`}
            width={50} height={50} />
          <Icon icon={icon2}
            className={`text-${color}-500 absolute right-3 bottom-3`}
            width={35} height={35} />
        </>
        )}
      </div>
    </CardBody>
  </Card>
);

interface DashboardData {
  deliveryCounts?: any;
  inventoryStats?: any;
  deliveryPerformance?: any;
  monthlyRevenue?: any;
  notifications?: any;
  reorderPointItems?: any;
  warehouseStats?: any;
  company?: any;
}

interface User {
  uuid: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  company_uuid: string;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const { theme } = useTheme();

  useEffect(() => {
    const fetchSubscriptionData = async () => {
      const userData = await getUserFromCookies();
      if (userData === null)
        setUser(null);
      else
        setUser(userData);
    }
    fetchSubscriptionData();
  }, []);

  const isDark = () => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return theme === "dark";
  }

  const renderInventoryStats = () => {
    if (!dashboardData?.inventoryStats) return null;

    const {
      total_items,
      active_groups,
      active_items,
      available_groups,
      available_items,
      reserved_groups,
      reserved_items,
      in_warehouse_groups,
      in_warehouse_items,
      top_items
    } = dashboardData.inventoryStats;

    return <Card className="col-span-12 bg-background mt-4">
      <LoadingAnimation
        condition={loading && user === null}
        skeleton={
          <>
            <CardHeader className="flex justify-between px-4">
              <div className="flex gap-2 items-center">
                <div>
                  <Skeleton className="h-6 w-32 rounded-full mb-1" />
                  <Skeleton className="h-4 w-48 rounded-full" />
                </div>
              </div>
            </CardHeader>
            <Divider />
            <CardBody className="p-4">
              {/* Skeleton for basic inventory stats */}
              <div className="grid gap-4 mb-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {[...Array(user?.is_admin ? 9 : 3)].map((_, index) => (
                  <Card key={index} className="bg-default-50 border border-default-100 shadow-xl">
                    <CardBody className="p-3 overflow-hidden relative">
                      <div className="flex items-center justify-between">
                        <div>
                          <Skeleton className="h-4 w-24 rounded-md mb-2" />
                          <Skeleton className="h-9 w-16 rounded-md" />
                        </div>
                        <Skeleton className="h-12 w-12 rounded-full" />
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>

              {/* Skeleton for top items table */}
              <div>
                <h3 className="text-lg font-medium mb-2">Top Inventory Groups</h3>
                <Table
                  classNames={{
                    wrapper: "bg-default-100",
                    th: "bg-primary-100 text-primary-600",
                  }}
                  aria-label="Top inventory groups loading">
                  <TableHeader>
                    <TableColumn>GROUP NAME</TableColumn>
                    <TableColumn>GROUPS</TableColumn>
                    <TableColumn>ITEMS</TableColumn>
                    <TableColumn>UNIT VALUE</TableColumn>
                    <TableColumn>STATUS</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {[...Array(5)].map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><Skeleton className="h-4 w-24 rounded-md" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12 rounded-md" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12 rounded-md" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20 rounded-md" /></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Skeleton className="h-5 w-16 rounded-md" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardBody>
          </>
        }>

        <CardHeader className="flex justify-between px-4">
          <div className="flex gap-2 items-center">
            <div>
              <h2 className="text-lg font-semibold">Inventory Overview</h2>
              <p className="text-xs text-default-500">Groups, items and units statistics</p>
            </div>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="p-4">
          {/* Basic inventory stats */}
          <div className="grid gap-4 mb-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            <StatsCard
              title="Total Items"
              value={total_items || 0}
              icon="fluent-emoji:clipboard"
              color="default"
            />

            {user?.is_admin && (
              <>
                <StatsCard
                  title="Inventory Groups"
                  value={active_groups || 0}
                  icon="fluent-emoji:package"
                  color="primary"
                />
                <StatsCard
                  title="Inventory Items"
                  value={active_items || 0}
                  icon="fluent-emoji:label"
                  color="secondary"
                />
                <StatsCard
                  title="Available Groups"
                  value={available_groups || 0}
                  icon="fluent-emoji:package"
                  icon2="fluent-color:checkmark-circle-16"
                  color="success"
                />
                <StatsCard
                  title="Available Items"
                  value={available_items || 0}
                  icon="fluent-emoji:label"
                  icon2="fluent-color:checkmark-circle-16"
                  color="success"
                />
                <StatsCard
                  title="Reserved Items"
                  value={reserved_items || 0}
                  icon="fluent-emoji:label"
                  icon2="fluent-color:clock-16"
                  color="warning"
                />
                <StatsCard
                  title="Available Groups"
                  value={available_groups || 0}
                  icon="fluent-emoji:package"
                  icon2="fluent-color:checkmark-circle-16"
                  color="success"
                />
                <StatsCard
                  title="Reserved Groups"
                  value={reserved_groups || 0}
                  icon="fluent-emoji:package"
                  icon2="fluent-color:clock-16"
                  color="warning"
                />
              </>
            )}

            <StatsCard
              title="In Warehouse Items"
              value={in_warehouse_items || 0}
              icon="fluent-emoji:label"
              {...(user?.is_admin ? { icon2: "fluent-emoji:office-building" } : {})}
              color={user?.is_admin ? "danger" : "warning"}
            />

            <StatsCard
              title="In Warehouse Groups"
              value={in_warehouse_groups || 0}
              icon="fluent-emoji:package"
              {...(user?.is_admin ? { icon2: "fluent-emoji:office-building" } : {})}
              color={user?.is_admin ? "danger" : "secondary"}
            />
          </div>

          {/* Top items table */}
          <div>
            <h3 className="text-lg font-medium mb-2">Top Inventory Groups</h3>
            <Table
              classNames={{
                wrapper: "bg-default-100",
                th: "bg-primary-100 text-primary-600",
              }}
              aria-label="Top inventory groups">
              <TableHeader>
                <TableColumn>GROUP NAME</TableColumn>
                <TableColumn>GROUPS</TableColumn>
                <TableColumn>ITEMS</TableColumn>
                <TableColumn>UNIT VALUE</TableColumn>
                <TableColumn>STATUS</TableColumn>
              </TableHeader>
              <TableBody>
                {top_items && top_items.map((item: {
                  uuid: string;
                  name: string;
                  unit: string;
                  group_count: number;
                  total_group_value: number;
                  available_count: number;
                  item_statuses: string;
                }) => (
                  <TableRow key={item.uuid}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>1</TableCell>
                    <TableCell>{item.group_count}</TableCell>
                    <TableCell>{formatNumber(item.total_group_value)} {item.unit}</TableCell>
                    <TableCell>
                      <Chip
                        size="sm"
                        variant="flat"
                        color={getStatusColor(item.item_statuses)}
                        className="mr-1"
                      >
                        {item.item_statuses}
                      </Chip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </LoadingAnimation>
    </Card>
  };

  // Helper function to determine chip color based on status
  const getStatusColor = (status: any) => {
    switch (status) {
      case "PENDING": return "primary";
      case "PROCESSING": return "warning";
      case "IN_TRANSIT": return "secondary";
      case "DELIVERED": return "success";
      case "CANCELLED": return "danger";

      case 'IN_WAREHOUSE': return 'primary';
      case 'AVAILABLE': return 'success';
      case 'IN_STOCK': return 'success';
      case 'ON_DELIVERY': return 'warning';
      case 'WARNING': return 'warning';
      case "IN_USE": return "warning";
      case 'RESERVED': return 'warning';
      case "USED": return "danger";
      case 'CRITICAL': return 'danger';
      case 'OUT_OF_STOCK': return 'danger';
      case 'LOW_STOCK': return 'warning';
      default: return 'default';
    }
  };

  // Extract loadDashboardData outside of useEffect so it can be reused
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const userData = await getUserFromCookies();
      if (!userData) {
        setError("User not found");
        return;
      }
      setUser(userData);

      // Get dashboard data based on user role
      const { data, error } = userData.is_admin
        ? await getDashboardData()
        : await getUserDashboardData(userData.uuid, userData.is_admin);

      if (error) {
        setError(error);
        return;
      }

      console.log("Dashboard data loaded:", data);
      setDashboardData(data);

      // Get notification count
      const { count, error: notifError } = await getNotificationCount(
        userData.uuid,
        userData.is_admin
      );

      if (!notifError) {
        setNotificationCount(count);
      }

    } catch (err) {
      console.error("Failed to load dashboard data:", err);
      setError("An error occurred while loading dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Prepare chart data
  const deliveryStatusData = !loading && dashboardData ? [
    { name: "Pending", value: dashboardData.deliveryCounts?.pending_deliveries || 0, color: "#f59e0b" },
    { name: "Processing", value: 0, color: "#3b82f6" }, // No processing status in new schema
    { name: "In Transit", value: dashboardData.deliveryCounts?.in_transit_deliveries || 0, color: "#8b5cf6" },
    { name: "Delivered", value: dashboardData.deliveryCounts?.delivered_deliveries || 0, color: "#10b981" },
    { name: "Cancelled", value: 0, color: "#ef4444" }, // No cancelled status returned by function
  ] : [];

  const performanceData = !loading && dashboardData ? [
    { name: "Daily", value: dashboardData.deliveryPerformance?.daily || 0, color: "#10b981" },
    { name: "Weekly", value: dashboardData.deliveryPerformance?.weekly || 0, color: "#3b82f6" },
    { name: "Monthly", value: dashboardData.deliveryPerformance?.monthly || 0, color: "#8b5cf6" },
  ] : [];

  // Prepare monthly revenue trend data
  const monthlyRevenueData = !loading && dashboardData ? [
    { name: "Previous", value: dashboardData?.monthlyRevenue?.previous_month_revenue || 0 },
    { name: "Current", value: dashboardData?.monthlyRevenue?.current_month_revenue || 0 }
  ] : [];

  // Prepare reorder point data - items that need reordering
  const lowStockItems = !loading && dashboardData?.reorderPointItems?.items || [];

  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
        {/* Header section */}
        <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
          <div className="flex flex-col w-full xl:text-left text-center">
            <h1 className="text-2xl font-bold">Dashboard</h1>
            {loading ? (
              <div className="text-default-500 flex xl:justify-start justify-center items-center">
                <p className='my-auto mr-1'>Loading dashboard data</p>
                <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
              </div>
            ) : (
              <p className="text-default-500">Welcome to RoPIC System!</p>
            )}
          </div>
          <div className="flex gap-4 xl:mt-0 mt-4 text-center items-center" >
            <div className="flex flex-0 items-center gap-2 text-default-500 w-32">
              <Icon icon="fluent:calendar-20-filled" width={20} height={20} />
              {format(new Date(), 'MMMM d, yyyy')}
            </div>
            <Button
              color="primary"
              variant="shadow"
              startContent={(!loading && <Icon icon="fluent:arrow-sync-16-filled" />)}
              onPress={() => loadDashboardData()}
              isLoading={loading}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <Card className="mb-6">
            <div className="flex items-center gap-2 text-danger p-4">
              <Icon icon="fluent:error-circle-20-filled" width={24} height={24} />
              <p>{error}</p>
            </div>
          </Card>
        )}

        <div>
          {/* Reorder Point Alert Section - New Addition */}
          <AnimatePresence>
            {!loading && lowStockItems.length > 0 && (
              <motion.div {...motionTransition}>
                <Card className="mb-6 bg-warning-50 border border-warning-200">
                  <CardHeader className="px-4 py-3">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <Icon icon="fluent:warning-24-filled" className="text-warning-600" width={20} height={20} />
                        <h2 className="text-lg font-semibold">Reorder Alert</h2>
                      </div>
                      <span>
                        {lowStockItems.length} Items
                      </span>
                    </div>
                  </CardHeader>
                  <Divider />
                  <CardBody className="p-4">
                    <Table aria-label="Items that need reordering">
                      <TableHeader>
                        <TableColumn>ITEM</TableColumn>
                        <TableColumn>WAREHOUSE</TableColumn>
                        <TableColumn>CURRENT STOCK</TableColumn>
                        <TableColumn>REORDER POINT</TableColumn>
                        <TableColumn>STATUS</TableColumn>
                      </TableHeader>
                      <TableBody>
                        {lowStockItems.slice(0, 3).map((item: any) => (
                          <TableRow key={item.uuid}>
                            <TableCell>{item.inventory_name}</TableCell>
                            <TableCell>{item.warehouse_name}</TableCell>
                            <TableCell>{item.current_stock} {item.unit}</TableCell>
                            <TableCell>{item.reorder_point} {item.unit}</TableCell>
                            <TableCell>
                              <Chip
                                color={getStatusColor(item.status)}
                                size="sm"
                              >
                                {item.status.replace(/_/g, ' ')}
                              </Chip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {lowStockItems.length > 3 && (
                      <div className="text-center text-xs text-warning-600 mt-2">
                        +{lowStockItems.length - 3} more items need reordering
                      </div>
                    )}

                    <Button
                      as={Link}
                      href="/home/reorder-points"
                      color="warning"
                      variant="flat"
                      className="w-full mt-4"
                      startContent={<Icon icon="fluent:arrow-sync-16-filled" />}
                    >
                      View All Reorder Points
                    </Button>
                  </CardBody>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Top Inventory Items Card */}
          {renderInventoryStats()}

          {/* Quick Actions Section */}
          <Card className="mt-4 bg-background">
            <LoadingAnimation
              condition={loading}
              skeleton={
                <>
                  <CardHeader className="flex justify-between px-4">
                    <div className="flex gap-2 items-center">
                      <div>
                        <Skeleton className="h-6 w-32 rounded-full mb-1" />
                      </div>
                    </div>
                  </CardHeader>
                  <Divider />
                  <CardBody className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:sm:grid-cols-4 gap-4">
                      <Skeleton className="h-16 rounded-xl" />
                      <Skeleton className="h-16 rounded-xl" />
                      <Skeleton className="h-16 rounded-xl" />
                      <Skeleton className="h-16 rounded-xl" />
                    </div>
                  </CardBody>
                </>
              }>
              <CardHeader className="px-4 py-3">
                <h2 className="text-lg font-semibold">Quick Actions</h2>
              </CardHeader>
              <Divider />
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:sm:grid-cols-4 gap-4">
                  <Button
                    color="secondary"
                    variant="flat"
                    className="h-16 text-left justify-start"
                    startContent={<Icon icon="fluent:vehicle-truck-24-filled" width={20} height={20} className="mr-2" />}
                    as={Link}
                    href="/home/delivery"
                  >
                    <div>
                      <p>
                        {user?.is_admin ? "Manage Deliveries" : "View Deliveries"}
                      </p>
                      <p className="text-xs opacity-70">
                        {user?.is_admin ? "Schedule a new delivery" : "Show all deliveries"}
                      </p>
                    </div>
                  </Button>

                  <Button
                    color="success"
                    variant="flat"
                    className="h-16 text-left justify-start"
                    startContent={<Icon icon="fluent:box-checkmark-20-filled" width={20} height={20} className="mr-2" />}
                    as={Link}
                    href={user?.is_admin ? "/home/inventory" : "/home/warehouse-items"}
                  >
                    <div>
                      <p>
                        {user?.is_admin ? "Manage Inventory" : "View Warehouse"}
                      </p>
                      <p className="text-xs opacity-70">
                        {user?.is_admin ? "Create new inventory group" : "Show items in warehouse"}
                      </p>
                    </div>
                  </Button>

                  {user?.is_admin ? (
                    <Button
                      color="danger"
                      variant="flat"
                      className="h-16 text-left justify-start"
                      startContent={<Icon icon="fluent:building-shop-24-filled" width={20} height={20} className="mr-2" />}
                      as={Link}
                      href="/home/warehouses"
                    >
                      <div>
                        <p>Manage Warehouses</p>
                        <p className="text-xs opacity-70">View or add warehouses</p>
                      </div>
                    </Button>
                  ) : (
                    <Button
                      color="danger"
                      variant="flat"
                      className="h-16 text-left justify-start"
                      startContent={
                        <Icon icon="heroicons:bell-alert-20-solid" width={20} height={20} className="mr-2" />}
                      as={Link}
                      href="/home/notifications"
                    >
                      <div>
                        <p>View Notifications</p>
                        <p className="text-xs opacity-70">Show all notifications</p>
                      </div>
                    </Button>
                  )}

                  <Button
                    color="warning"
                    variant="flat"
                    className="h-16 text-left justify-start"
                    startContent={<Icon icon="fluent:gauge-24-filled" width={20} height={20} className="mr-2" />}
                    as={Link}
                    href="/home/reorder-points"
                  >
                    <div>
                      <p>Reorder Point</p>
                      <p className="text-xs opacity-70">Monitor stock levels</p>
                    </div>
                  </Button>
                </div>
              </div>
            </LoadingAnimation>
          </Card>

          <div className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-6">
              {/* Delivery Status Distribution Chart */}
              <Card className="lg:col-span-3 bg-background">
                <LoadingAnimation
                  condition={loading}
                  skeleton={
                    <>
                      <CardHeader className="px-4 py-3 flex justify-between items-center">
                        <div>
                          <Skeleton className="h-6 w-48 rounded-md mb-1" />
                          <Skeleton className="h-4 w-64 rounded-md" />
                        </div>
                        <Skeleton className="h-6 w-20 rounded-md" />
                      </CardHeader>
                      <Divider />
                      <div>
                        <div className="h-[325px]">
                          <div className="h-full flex items-center justify-center">
                            <div className="w-full px-6 mx-10">
                              <div className="flex items-end justify-between h-[240px] mb-4">
                                {[...Array(5)].map((_, i) => (
                                  <Skeleton key={i} className={`w-12 rounded-t-md`} style={{ height: `${Math.max(20, Math.random() * 200)}px` }} />
                                ))}
                              </div>
                              <div className="flex justify-between">
                                {[...Array(5)].map((_, i) => (
                                  <Skeleton key={i} className="h-5 w-16 rounded-md" />
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  }>
                  <CardHeader className="px-4 py-3 flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-semibold">Delivery Status Distribution</h2>
                      <p className="text-xs text-default-500">Breakdown of current delivery statuses</p>
                    </div>
                    <Badge color="primary" variant="flat">
                      {dashboardData?.deliveryCounts?.total_deliveries || 0} Total
                    </Badge>
                  </CardHeader>
                  <Divider />
                  <div>
                    <div className="h-[325px]">
                      {deliveryStatusData.length > 0 && deliveryStatusData.some(d => d.value > 0) ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={deliveryStatusData}
                            margin={{ left: -60, right: 0, top: 30, bottom: 0 }}
                            barSize={48}
                            barGap={8}
                            className="delivery-status-chart"
                          >
                            <defs>
                              {deliveryStatusData.map((entry, index) => (
                                <linearGradient
                                  id={`colorGradient-${index}`}
                                  key={`gradient-${index}`}
                                  x1="0" y1="0" x2="0" y2="1"
                                >
                                  <stop offset="0%" stopColor={entry.color} stopOpacity={0.9} />
                                  <stop offset="95%" stopColor={entry.color} stopOpacity={0.6} />
                                </linearGradient>
                              ))}
                              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.1" />
                              </filter>
                            </defs>
                            <XAxis
                              dataKey="name"
                              angle={0}
                              textAnchor="middle"
                              height={60}
                              tick={{
                                fill: 'hsl(var(--heroui-default-500))',
                                fontSize: 12,
                                fontWeight: 500
                              }}
                              tickMargin={15}
                              axisLine={{ stroke: 'hsl(var(--heroui-default-200))', strokeWidth: 1 }}
                              tickLine={false}
                              padding={{ left: 40, right: 40 }}
                            />
                            <YAxis
                              hide={false}
                              axisLine={false}
                              tickLine={false}
                              tick={{
                                fill: 'hsl(var(--heroui-default-400))',
                                fontSize: 12
                              }}
                              tickFormatter={(val) => val > 0 ? val : ''}
                              orientation="left"
                              tickMargin={-25}
                            />
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="hsl(var(--heroui-default-200))"
                              opacity={0.5}
                            />
                            <RechartsTooltip
                              cursor={{ fill: 'hsl(var(--heroui-default-100))', opacity: 0.3 }}
                              contentStyle={{
                                backgroundColor: `${herouiColorOpacity('default-50', 0.9, 'hex')}`,
                                borderRadius: '12px',
                                border: 'none',
                                padding: '10px 14px',
                                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.15)',
                              }}
                              itemStyle={{
                                color: `${herouiColor('default-800', 'hex')}`,
                                padding: '4px 0',
                              }}
                            />
                            <Bar
                              dataKey="value"
                              radius={[4, 4, 0, 0]}
                              filter="url(#shadow)"
                              animationDuration={1500}
                              animationEasing="ease-in-out"
                            >
                              {deliveryStatusData.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={`url(#colorGradient-${index})`}
                                  stroke={entry.color}
                                  strokeWidth={1}
                                />
                              ))}
                              <LabelList
                                dataKey="value"
                                position="top"
                                formatter={(val: number) => val > 0 ? val.toString() : ''}
                                style={{
                                  fill: 'hsl(var(--heroui-default-600))',
                                  fontSize: 13,
                                  fontWeight: 600
                                }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-default-500">
                          <div className="text-center">
                            <Icon icon="fluent:box-dismiss-24-filled" className="mx-auto text-5xl text-default-300" />
                            <p className="mt-2">No delivery data available</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </LoadingAnimation>
              </Card>

              {/* Latest Notifications */}
              <Card className="lg:col-span-2 bg-background">
                <LoadingAnimation
                  condition={loading}
                  skeleton={
                    <>
                      <CardHeader className="px-4 py-3 flex justify-between items-center">
                        <Skeleton className="h-6 w-48 rounded-md" />
                      </CardHeader>
                      <Divider />
                      <div className="p-4">
                        <div className="space-y-3 max-h-[330px]">
                          {[...Array(4)].map((_, i) => (
                            <Card key={i} className="border-none shadow-sm">
                              <CardBody className="p-3">
                                <div className="flex items-start gap-3">
                                  <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                                  <div className="w-full">
                                    <div className="flex items-center justify-between">
                                      <Skeleton className="h-5 w-1/2 rounded-md" />
                                      <Skeleton className="h-5 w-12 rounded-md" />
                                    </div>
                                    <Skeleton className="h-4 w-3/4 mt-1 rounded-md" />
                                  </div>
                                </div>
                              </CardBody>
                            </Card>
                          ))}
                        </div>
                      </div>
                    </>
                  }>
                  <CardHeader className="px-4 py-3 flex justify-between items-center">
                    <h2 className="text-lg font-semibold">Latest Notifications</h2>
                  </CardHeader>
                  <Divider />
                  <div className="p-4">
                    {dashboardData?.notifications?.recent_notifications?.length > 0 ? (
                      <div className="space-y-3 overflow-hidden max-h-[330px]">
                        {dashboardData?.notifications?.recent_notifications?.map((notification: any) => (
                          <Card
                            key={notification.id}
                            className={`${notification.read ? 'bg-default-50' : 'bg-default-100'} border-none shadow-sm`}
                          >
                            <CardBody className="p-3">
                              <div className="flex items-start gap-3">
                                <div className={`rounded-full p-2 flex-shrink-0 h-10 w-10 mt-1 ${getNotificationIconBg(notification.type)}`}>
                                  <Icon icon={getNotificationIcon(notification.type, notification.action)} width={24} height={24} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 justify-between">
                                    <p className="font-medium text-sm">
                                      {formatNotificationAction(notification.action)} {notification.entity_name}
                                    </p>
                                    {!notification.read && (
                                      <Chip size="sm" color="primary" variant="flat">New</Chip>
                                    )}
                                  </div>
                                  <div className="text-xs text-default-500 mt-1">
                                    by {notification.user_name} • {formatNotificationTime(notification.created_at)}
                                  </div>
                                </div>
                              </div>
                            </CardBody>
                          </Card>
                        ))}

                        <Button as={Link} variant="flat" href="/home/notifications" className="w-full mt-4">
                          View all
                        </Button>
                      </div>
                    ) : (
                      <div className="py-10 text-center text-default-500">
                        <Icon icon="fluent:alert-24-regular" className="mx-auto text-4xl text-default-300" />
                        <p className="mt-2">No recent notifications</p>
                      </div>
                    )}
                  </div>
                </LoadingAnimation>
              </Card>
            </div>

            {/* Warehouse Items Distribution Card */}
            <Card className="mt-4 bg-background">
              <LoadingAnimation
                condition={loading}
                skeleton={
                  <>
                    <CardHeader className="px-4 py-3 flex justify-between items-center">
                      <div>
                        <Skeleton className="h-6 w-48 rounded-md mb-1" />
                        <Skeleton className="h-4 w-64 rounded-md" />
                      </div>
                      <Skeleton className="h-6 w-20 rounded-md" />
                    </CardHeader>
                    <Divider />
                    <CardBody className="p-4">
                      <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className="space-y-1">
                            <div className="flex justify-between items-center">
                              <Skeleton className="h-5 w-32 rounded-md" />
                              <Skeleton className="h-4 w-24 rounded-md" />
                            </div>
                            <Skeleton className="h-2 w-full rounded-md" />
                          </div>
                        ))}
                      </div>
                    </CardBody>
                  </>
                }>
                <CardHeader className="px-4 py-3 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold">Warehouse Items Distribution</h2>
                    <p className="text-xs text-default-500">Items stored across warehouses</p>
                  </div>
                  <Badge color="primary" variant="flat">
                    {dashboardData?.warehouseStats?.total_count || 0} Total
                  </Badge>
                </CardHeader>
                <Divider />
                <CardBody className="p-4">
                  {(dashboardData) && dashboardData?.warehouseStats?.by_warehouse?.length > 0 ? (
                    <div className="space-y-4">
                      {dashboardData.warehouseStats.by_warehouse.map((warehouse: any) => (
                        <div key={warehouse.warehouse_uuid} className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{warehouse.warehouse_name}</span>
                            <span className="text-sm text-default-500">
                              {warehouse.item_count} items ({((warehouse.item_count / dashboardData.warehouseStats.total_count) * 100).toFixed(1)}%)
                            </span>
                          </div>
                          <Progress
                            value={(warehouse.item_count / dashboardData.warehouseStats.total_count) * 100}
                            color="success"
                            showValueLabel={false}
                            size="sm"
                            className="h-2"
                            maxValue={100}
                          />
                        </div>
                      ))}

                      {user?.is_admin && (
                        <Button
                          as={Link}
                          href="/home/warehouse-items"
                          variant="flat"
                          color="success"
                          className="w-full mt-2"
                        >
                          View All Warehouse Items
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="py-6 text-center text-default-500">
                      <Icon icon="fluent:building-shop-24-regular" className="mx-auto text-4xl text-default-300" />
                      <p className="mt-2">No warehouse items found</p>
                    </div>
                  )}
                </CardBody>
              </LoadingAnimation>
            </Card>

            {/* Delivery Performance Chart */}
            <Card className="mt-4 bg-background">
              <LoadingAnimation
                condition={loading}
                skeleton={
                  <>
                    <CardHeader className="px-4 py-3 flex justify-between items-center">
                      <div>
                        <Skeleton className="h-6 w-48 rounded-md mb-1" />
                        <Skeleton className="h-4 w-64 rounded-md" />
                      </div>
                      <Skeleton className="h-6 w-20 rounded-md" />
                    </CardHeader>
                    <Divider />
                    <div className="p-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="h-72">
                          <div className="h-full flex items-center justify-center">
                            <div className="relative w-full h-full flex items-center justify-center">
                              <Skeleton className="h-[180px] w-[180px] rounded-full absolute" />
                              <Skeleton className="h-[120px] w-[120px] rounded-full absolute" />
                              {[...Array(3)].map((_, i) => (
                                <Skeleton key={i} className="absolute h-5 w-16 rounded-md" style={{ transform: `rotate(${i * 120}deg) translateX(100px)` }} />
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <Skeleton className="h-5 w-32 rounded-md" />
                              <Skeleton className="h-5 w-16 rounded-md" />
                            </div>
                            <Skeleton className="h-8 w-full rounded-md" />
                          </div>

                          <div className="mb-6">
                            <div className="flex justify-between items-center mb-2">
                              <Skeleton className="h-5 w-32 rounded-md" />
                              <Skeleton className="h-5 w-16 rounded-md" />
                            </div>
                            <Skeleton className="h-8 w-full rounded-md" />
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <Skeleton className="h-5 w-32 rounded-md" />
                              <Skeleton className="h-5 w-16 rounded-md" />
                            </div>
                            <Skeleton className="h-8 w-full rounded-md" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                }>
                <CardHeader className="px-4 py-3 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold">Delivery Performance Analysis</h2>
                    <p className="text-xs text-default-500">Daily, weekly, and monthly completion rates</p>
                  </div>
                  <Badge color="secondary" variant="flat">
                    Target: 95%
                  </Badge>
                </CardHeader>
                <Divider />
                <div className="p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="h-72">
                      {performanceData.length > 0 && performanceData.some(p => p.value > 0) ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <defs>
                              {performanceData.map((entry, index) => (
                                <radialGradient
                                  id={`pieGradient-${index}`}
                                  key={`pie-gradient-${index}`}
                                  cx="50%" cy="50%" r="50%" fx="50%" fy="50%"
                                >
                                  <stop offset="0%" stopColor={entry.color} stopOpacity={0.9} />
                                  <stop offset="75%" stopColor={entry.color} stopOpacity={0.7} />
                                  <stop offset="100%" stopColor={entry.color} stopOpacity={0.8} />
                                </radialGradient>
                              ))}
                              <filter id="pieDropShadow" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx="0" dy="3" stdDeviation="5" floodOpacity="0.12" />
                              </filter>
                              <linearGradient id="centerGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="hsl(var(--heroui-primary-50))" stopOpacity="0.7" />
                                <stop offset="100%" stopColor="hsl(var(--heroui-primary-50))" stopOpacity="0.2" />
                              </linearGradient>
                            </defs>
                            <Pie
                              data={performanceData}
                              cx="50%"
                              cy="50%"
                              innerRadius={68}
                              outerRadius={105}
                              paddingAngle={3}
                              dataKey="value"
                              stroke="rgba(255,255,255,0.6)"
                              strokeWidth={1.5}
                              animationDuration={2000}
                              filter="url(#pieDropShadow)"
                            >
                              {performanceData.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={`url(#pieGradient-${index})`}
                                />
                              ))}
                              <Label
                                content={({ viewBox }) => {
                                  const { cx, cy } = viewBox as { cx: number, cy: number };
                                  const averageValue = performanceData.reduce((sum, entry) => sum + entry.value, 0) / performanceData.length;

                                  return (
                                    <g>
                                      <circle
                                        cx={cx}
                                        cy={cy}
                                        r={60}
                                        fill="url(#centerGradient)"
                                        filter="url(#pieDropShadow)"
                                      />
                                      <text
                                        x={cx}
                                        y={cy - 8}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        className="text-2xl font-bold"
                                        fill="hsl(var(--heroui-default-700))"
                                      >
                                        {Math.round(averageValue)}%
                                      </text>
                                      <text
                                        x={cx}
                                        y={cy + 18}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        className="text-xs tracking-wide uppercase"
                                        fill="hsl(var(--heroui-default-500))"
                                      >
                                        Average Rate
                                      </text>
                                    </g>
                                  );
                                }}
                              />
                            </Pie>
                            <Legend
                              layout="horizontal"
                              verticalAlign="bottom"
                              align="center"
                              iconType="circle"
                              iconSize={8}
                              wrapperStyle={{
                                paddingTop: 15,
                              }}
                              formatter={(value) => (
                                <span style={{
                                  color: 'hsl(var(--heroui-default-700))',
                                  fontSize: '12px',
                                  padding: '0 6px',
                                  fontWeight: 500
                                }}>
                                  {value}
                                </span>
                              )}
                            />
                            <RechartsTooltip
                              formatter={(value: number) => [`${value}%`, 'Completion Rate']}
                              contentStyle={{
                                backgroundColor: `${herouiColorOpacity('default-50', 0.9, 'hex')}`,
                                borderRadius: '14px',
                                border: 'none',
                                padding: '12px 16px',
                                boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
                              }}
                              itemStyle={{
                                color: `${herouiColor('default-800', 'hex')}`,
                                padding: '6px 0',
                                fontSize: '13px'
                              }}
                              labelStyle={{
                                fontWeight: 600,
                                marginBottom: '8px'
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-default-500">
                          <div className="text-center">
                            <Icon icon="fluent:data-pie-24-regular" className="mx-auto text-5xl text-default-300" />
                            <p className="mt-2">No performance data available</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-6">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-sm font-medium">On-time Delivery</p>
                          <Badge color="success">
                            {dashboardData?.deliveryPerformance?.on_time_percentage || 0}%
                          </Badge>
                        </div>
                        <Progress
                          value={dashboardData?.deliveryPerformance?.on_time_percentage || 0}
                          color="success"
                          showValueLabel={true}
                          size="lg"
                        />
                      </div>

                      <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-sm font-medium">Average Delivery Time</p>
                          <Badge color="primary">
                            {dashboardData?.deliveryPerformance?.average_delivery_time_days || 0} days
                          </Badge>
                        </div>
                        <Progress
                          value={Math.min((dashboardData?.deliveryPerformance?.average_delivery_time_days || 0) / 7 * 100, 100)}
                          color="primary"
                          showValueLabel={false}
                          size="lg"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-sm font-medium">This Month Delivered</p>
                          <Badge color="secondary">
                            {dashboardData?.deliveryPerformance?.total_delivered_this_month || 0} items
                          </Badge>
                        </div>
                        <Progress
                          value={Math.min((dashboardData?.deliveryPerformance?.total_delivered_this_month || 0) / 10 * 100, 100)}
                          color="secondary"
                          showValueLabel={false}
                          size="lg"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </LoadingAnimation>
            </Card>

            {/* Revenue Comparison Card */}
            <Card className="mt-4 bg-background">
              <LoadingAnimation
                condition={loading}
                skeleton={
                  <>
                    <CardHeader className="px-4 py-3">
                      <div>
                        <Skeleton className="h-6 w-48 rounded-md mb-1" />
                        <Skeleton className="h-4 w-64 rounded-md" />
                      </div>
                    </CardHeader>
                    <Divider />
                    <div className="p-4">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 h-60">
                          <div className="h-full flex items-center justify-center">
                            <div className="w-full px-12">
                              <div className="flex items-end justify-around mb-4 h-[180px]">
                                {[...Array(2)].map((_, i) => (
                                  <Skeleton key={i} className="w-24 rounded-t-md" style={{ height: `${100 + (i * 50)}px` }} />
                                ))}
                              </div>
                              <div className="flex items-end justify-around ">
                                {[...Array(2)].map((_, i) => (
                                  <Skeleton key={i} className="h-5 w-20 rounded-md" />
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col justify-center">
                          <Card className="bg-default-50 mb-4">
                            <CardBody>
                              <Skeleton className="h-4 w-24 rounded-md mb-2" />
                              <Skeleton className="h-8 w-40 rounded-md" />
                            </CardBody>
                          </Card>

                          <Card className="bg-default-50">
                            <CardBody>
                              <Skeleton className="h-4 w-24 rounded-md mb-2" />
                              <Skeleton className="h-8 w-40 rounded-md" />
                            </CardBody>
                          </Card>
                        </div>
                      </div>
                    </div>
                  </>
                }>
                <CardHeader className="px-4 py-3">
                  <div>
                    <h2 className="text-lg font-semibold">Monthly Revenue Comparison</h2>
                    <p className="text-xs text-default-500">Current vs. previous month revenue</p>
                  </div>
                </CardHeader>
                <Divider />
                <div className="p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 h-60">
                      {monthlyRevenueData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyRevenueData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <XAxis dataKey="name" />
                            <YAxis />
                            <RechartsTooltip formatter={(value) => [`₱${value}`, 'Revenue']} />
                            <Legend />
                            <Bar dataKey="value" name="Revenue" fill="#f59e0b" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-default-500">
                          <div className="text-center">
                            <Icon icon="fluent:money-24-regular" className="mx-auto text-5xl text-default-300" />
                            <p className="mt-2">No revenue data available</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col justify-center">
                      <Card className="bg-default-50 mb-4">
                        <CardBody>
                          <p className="text-sm text-default-500">Current Month</p>
                          <p className="text-2xl font-bold">₱{parseFloat(dashboardData?.monthlyRevenue?.current_month_revenue || 0).toLocaleString()}</p>
                        </CardBody>
                      </Card>

                      <Card className="bg-default-50">
                        <CardBody>
                          <p className="text-sm text-default-500">Previous Month</p>
                          <p className="text-2xl font-bold">₱{parseFloat(dashboardData?.monthlyRevenue?.previous_month_revenue || 0).toLocaleString()}</p>
                        </CardBody>
                      </Card>
                    </div>
                  </div>
                </div>
              </LoadingAnimation>
            </Card>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Helper functions for notifications
const getNotificationIcon = (type: string, action: string) => {
  switch (type) {
    case 'delivery_items':
      return action === 'create' ? 'fluent:box-multiple-20-filled' : 'fluent:vehicle-truck-20-filled';
    case 'inventory':
    case 'inventory_items':
      return 'fluent:box-20-filled';
    case 'warehouses':
    case 'warehouse_inventory':
    case 'warehouse_inventory_items':
      return 'fluent:building-shop-20-filled';
    case 'reorder_point_logs':
      return 'fluent:warning-20-filled';
    default:
      return 'fluent:alert-20-filled';
  }
};

const getNotificationIconBg = (type: string) => {
  switch (type) {
    case 'delivery_items':
      return 'bg-secondary-100 text-secondary-500';
    case 'inventory':
    case 'inventory_items':
      return 'bg-success-100 text-success-500';
    case 'warehouses':
    case 'warehouse_inventory':
    case 'warehouse_inventory_items':
      return 'bg-danger-100 text-danger-500';
    case 'reorder_point_logs':
      return 'bg-warning-100 text-warning-500';
    default:
      return 'bg-default-100 text-default-500';
  }
};

const formatNotificationAction = (action: string) => {
  switch (action) {
    case 'create': return 'Created';
    case 'update': return 'Updated';
    case 'delete': return 'Deleted';
    case 'status_change': return 'Status changed for';
    default: return action;
  }
};


const formatNotificationTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else {
    return format(date, 'MMM d, yyyy');
  }
};