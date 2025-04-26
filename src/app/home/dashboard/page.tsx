"use client";

import { motionTransition } from '@/utils/anim';
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getDashboardData, getUser } from "./actions";
import { useTheme } from "next-themes";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Progress,
  Skeleton
} from "@heroui/react";

import { Icon } from "@iconify-icon/react";

// Charts
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const { theme } = useTheme()

  const isDark = () => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return theme === "dark";
  }

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
        // Get user data
        const { data: userData, error: userError } = await getUser();
        if (userError) {
          setError(userError.toString());
          return;
        }

        setUser(userData);

        const { data, error } = await getDashboardData();

        if (error) {
          setError(error);
          return;
        }

        setDashboardData(data);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        setError("An error occurred while loading dashboard data");
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  // Prepare chart data
  const deliveryStatusData = !loading && dashboardData ? [
    { name: "Pending", value: dashboardData.deliveryCounts.PENDING, color: "#f59e0b" },
    { name: "Processing", value: dashboardData.deliveryCounts.PROCESSING, color: "#3b82f6" },
    { name: "In Transit", value: dashboardData.deliveryCounts.IN_TRANSIT, color: "#8b5cf6" },
    { name: "Delivered", value: dashboardData.deliveryCounts.DELIVERED, color: "#10b981" },
    { name: "Confirmed", value: dashboardData.deliveryCounts.CONFIRMED, color: "#059669" },
    { name: "Cancelled", value: dashboardData.deliveryCounts.CANCELLED, color: "#ef4444" },
  ] : [];

  const performanceData = !loading && dashboardData ? [
    { name: "Daily", value: dashboardData.deliveryPerformance.daily, color: "#10b981" },
    { name: "Weekly", value: dashboardData.deliveryPerformance.weekly, color: "#3b82f6" },
    { name: "Monthly", value: dashboardData.deliveryPerformance.monthly, color: "#8b5cf6" },
  ] : [];

  // Prepare monthly revenue trend data
  const monthlyRevenueData = !loading && dashboardData ? [
    { name: "Previous", value: dashboardData?.monthlyRevenue?.previous_month || 0 },
    { name: "Current", value: dashboardData?.monthlyRevenue?.current_month || 0 }
  ] : [];

  return (
    <div className="container mx-auto p-2 max-w-4xl">
      {/* Header section */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-default-500">Welcome to RoPIC System inventory and delivery operations</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 text-default-500">
            <Icon icon="fluent:calendar-20-filled" width={20} height={20} />
            {format(new Date(), 'MMMM d, yyyy')}
          </div>
          <Button
            color="primary"
            variant="shadow"
            startContent={<Icon icon="fluent:arrow-sync-16-filled" />}
            onPress={() => window.location.reload()}
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
        {/* Key metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Delivery counts card */}
          <Card className='bg-secondary-50 shadow-secondary-500/30 shadow-xl border-secondary-100 border'>
            <CardBody className="p-4">
              <div className="flex justify-between items-center mb-3 gap-4">
                <div className="text-lg font-medium text-secondary-800">
                  Deliveries
                </div>
                <Icon icon="fluent-emoji:delivery-truck"
                  className="absolute right-4 top-0 text-secondary-500 blur-3xl"
                  width={110} height={110} />
                <Icon icon="fluent-emoji:delivery-truck"
                  className="absolute right-4 top-0 text-secondary-500"
                  width={110} height={110} />
              </div>

              {loading ? (
                <Skeleton className="h-8 w-24 mb-3 rounded-lg" />
              ) : (
                <div className="text-4xl font-bold mb-3 text-secondary-900">
                  {dashboardData?.deliveryCounts?.total || 0}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                {loading ? (
                  <>
                    <Skeleton className="h-5 w-24 rounded-md" />
                    <Skeleton className="h-5 w-24 rounded-md" />
                    <Skeleton className="h-5 w-24 rounded-md" />
                    <Skeleton className="h-5 w-24 rounded-md" />
                  </>
                ) : (
                  <>
                    <div className="flex items-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-1.5"></span>
                      <span className="text-secondary-600">
                        {dashboardData?.deliveryCounts?.PENDING || 0} pending
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-1.5"></span>
                      <span className="text-secondary-600">
                        {dashboardData?.deliveryCounts?.PROCESSING || 0} processing
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500 mr-1.5"></span>
                      <span className="text-secondary-600">
                        {dashboardData?.deliveryCounts?.IN_TRANSIT || 0} in transit
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 mr-1.5"></span>
                      <span className="text-secondary-600">
                        {(dashboardData?.deliveryCounts?.DELIVERED || 0) +
                          (dashboardData?.deliveryCounts?.CONFIRMED || 0)} delivered
                      </span>
                    </div>
                  </>
                )}
              </div>

              {loading ? (
                <Skeleton className="h-10 w-full rounded-xl" />
              ) : (
                <Button
                  as={Link}
                  variant="shadow"
                  color="secondary"
                  href="/home/delivery"
                >
                  View all deliveries <Icon icon="fluent:arrow-right-16-filled" className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              )}
            </CardBody>
          </Card>

          {/* Inventory stats card */}
          <Card className="bg-success-50 shadow-success-500/30 shadow-xl border-success-100 border">
            <CardBody className="p-4">
              <div className="flex justify-between items-end mb-3 gap-4">
                <div className="text-lg font-medium text-success-800">
                  {user?.is_admin ? "Inventory" : "Warehouse Items"}
                </div>
                <Icon icon="fluent-emoji:package"
                  className="absolute right-2 top-4 text-secondary-500 blur-3xl"
                  width={90} height={90} />
                <Icon icon="fluent-emoji:package"
                  className="absolute right-2 top-4 text-secondary-500"
                  width={90} height={90} />
              </div>

              {loading ? (
                <Skeleton className="h-8 w-24 mb-3 rounded-lg" />
              ) : (
                <div className="text-4xl font-bold mb-3 text-success-900">
                  {user?.is_admin ?
                    (dashboardData?.inventoryStats?.total || 0) :
                    (dashboardData?.inventoryStats?.in_warehouse || 0)
                  }
                </div>
              )}

              <div className="mb-4">
                {loading ? (
                  <>
                    <Skeleton className="h-5 w-full mb-2 rounded-md" />
                    <Skeleton className="h-3 w-full rounded-md" />
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-xs text-success-600 mb-2">
                      <span>
                        {user?.is_admin ?
                          `Available (${(dashboardData?.inventoryStats?.available || 0)})` :
                          `Items in Warehouse (${(dashboardData?.inventoryStats?.in_warehouse || 0)})`}
                      </span>
                      <span>
                        {user?.is_admin ?
                          `Reserved (${(dashboardData?.inventoryStats?.reserved || 0)})` :
                          `Undelivered (${(dashboardData?.inventoryStats?.total || 0) - (dashboardData?.inventoryStats?.in_warehouse || 0)})`}
                      </span>
                    </div>
                    <Progress
                      value={dashboardData?.inventoryStats?.total > 0
                        ? (dashboardData?.inventoryStats?.available / dashboardData?.inventoryStats?.total) * 100
                        : 0}
                      color="success"
                      size="md"
                      className="h-3"
                    />
                  </>
                )}
              </div>

              {loading ? (
                <Skeleton className="h-10 w-full rounded-xl" />
              ) : (
                <Button
                  as={Link}
                  variant="shadow"
                  color="success"
                  href={user?.is_admin ? "/home/inventory" : "/home/warehouse-items"}
                >
                  {user?.is_admin ?
                    "Manage inventory" :
                    "View warehouse items"
                  }

                  <Icon icon="fluent:arrow-right-16-filled" className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              )}
            </CardBody>
          </Card>

          {/* Delivery performance card */}
          <Card className="bg-warning-50 shadow-warning-500/30 shadow-xl border-warning-100 border">
            <CardBody className="p-4">
              <div className="flex justify-between items-end mb-3 gap-4">
                <div className="text-lg font-medium text-warning-800">
                  Performance
                </div>
                <Icon icon="fluent-color:data-area-24"
                  className="absolute right-2 top-2 text-secondary-500 blur-3xl"
                  width={90} height={90} />
                <Icon icon="fluent-color:data-area-24"
                  className="absolute right-2 top-2 text-secondary-500"
                  width={90} height={90} />
              </div>

              {loading ? (
                <Skeleton className="h-10 w-24 mb-3 rounded-lg" />
              ) : (
                <div className="text-4xl font-bold mb-3 text-warning-900">
                  {dashboardData?.deliveryPerformance?.monthly || 0}%
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 text-xs text-warning-600 mb-4">
                {loading ? (
                  <>
                    <Skeleton className="h-[3.25rem] rounded-md" />
                    <Skeleton className="h-[3.25rem] rounded-md" />
                    <Skeleton className="h-[3.25rem] rounded-md" />
                  </>
                ) : (
                  <>
                    <div className="text-center py-2 bg-warning-100 rounded-md">
                      <div className="font-medium text-sm">{dashboardData?.deliveryPerformance?.daily || 0}%</div>
                      <div>Today</div>
                    </div>
                    <div className="text-center py-2 bg-warning-100 rounded-md">
                      <div className="font-medium text-sm">{dashboardData?.deliveryPerformance?.weekly || 0}%</div>
                      <div>Week</div>
                    </div>
                    <div className="text-center py-2 bg-warning-100 rounded-md">
                      <div className="font-medium text-sm">{dashboardData?.deliveryPerformance?.monthly || 0}%</div>
                      <div>Month</div>
                    </div>
                  </>
                )}
              </div>

              <div className="text-xs text-warning-600">
                Complete/total delivery rates
              </div>
            </CardBody>
          </Card>

          {/* Monthly revenue card */}
          <Card className="bg-danger-50 shadow-danger-500/30 shadow-xl border-danger-100 border">
            <CardBody className="p-4">
              <div className="flex justify-between items-end mb-3 gap-4">
                <div className="text-lg font-medium text-danger-800">
                  Monthly Revenue
                </div>
                <Icon icon="fluent-emoji:money-bag"
                  className="absolute right-2 top-4 text-secondary-500 blur-3xl"
                  width={90} height={90} />
                <Icon icon="fluent-emoji:money-bag"
                  className="absolute right-2 top-4 text-secondary-500"
                  width={90} height={90} />
              </div>

              {loading ? (
                <Skeleton className="h-8 w-36 mb-3 rounded-lg" />
              ) : (
                <div className="text-4xl font-bold mb-3 text-danger-900">
                  ₱{parseFloat(dashboardData?.monthlyRevenue?.current_month || 0).toLocaleString()}
                </div>
              )}

              {loading ? (
                <Skeleton className="h-5 w-44 mb-4 rounded-md" />
              ) : dashboardData?.monthlyRevenue?.percent_change !== null ? (
                <div className={`flex items-center text-xs mb-4 ${parseFloat(dashboardData?.monthlyRevenue?.percent_change) >= 0
                  ? 'text-success'
                  : 'text-danger'
                  }`}>
                  {parseFloat(dashboardData?.monthlyRevenue?.percent_change) >= 0 ? (
                    <Icon icon="fluent:arrow-trending-24-filled" className="h-4.5 w-4.5 mr-1.5" />
                  ) : (
                    <Icon icon="fluent:arrow-trending-down-24-filled" className="h-4.5 w-4.5 mr-1.5" />
                  )}
                  <span>{Math.abs(parseFloat(dashboardData?.monthlyRevenue?.percent_change) || 0)}% vs last month</span>
                </div>
              ) : (
                <div className="text-xs text-danger-600 mb-4">No previous data</div>
              )}

              <div className="text-xs text-danger-600">
                Value of delivered items
              </div>
            </CardBody>
          </Card>
        </div>


        {/* Quick Actions Section */}
        <Card className="mt-4 bg-background">
          <CardHeader className="px-4 py-3">
            <h2 className="text-lg font-semibold">Quick Actions</h2>
          </CardHeader>
          <Divider />
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:sm:grid-cols-4 gap-4">

              {loading ? (
                <>
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </>
              ) : (
                <>
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
                    href="/home/inventory"
                  >
                    <div>
                      <p>
                        {user?.is_admin ? "Manage Inventory" : "View Warehouse"}
                      </p>
                      <p className="text-xs opacity-70">
                        {user?.is_admin ? "Create new inventory" : "Show items in warehouse"}
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
                      href="/home/warehouse-items"
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
                    startContent={<Icon icon="fluent:settings-24-filled" width={20} height={20} className="mr-2" />}
                    as={Link}
                    href="/home/settings"
                  >
                    <div>
                      <p>Settings</p>
                      <p className="text-xs opacity-70">Configure your account</p>
                    </div>
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>

        <div className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-6">
            {/* Delivery Status Distribution Chart */}
            <Card className="lg:col-span-3 bg-background">
              <CardHeader className="px-4 py-3 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold">Delivery Status Distribution</h2>
                  <p className="text-xs text-default-500">Breakdown of current delivery statuses</p>
                </div>
                {loading ? (
                  <Skeleton className="h-6 w-20 rounded-md" />
                ) : (
                  <Badge color="primary" variant="flat">
                    {dashboardData?.deliveryCounts?.total || 0} Total
                  </Badge>
                )}
              </CardHeader>
              <Divider />
              <div>
                <div className="h-[325px]">
                  {loading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="w-full px-6">
                        <div className="flex justify-between mb-4">
                          {[...Array(6)].map((_, i) => (
                            <Skeleton key={i} className="h-5 w-16 rounded-md" />
                          ))}
                        </div>
                        <div className="flex items-end justify-between h-[240px]">
                          {[...Array(6)].map((_, i) => (
                            <Skeleton key={i} className={`w-12 rounded-t-md`} style={{ height: `${Math.max(20, Math.random() * 200)}px` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : deliveryStatusData.length > 0 && deliveryStatusData.some(d => d.value > 0) ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={deliveryStatusData}
                        margin={{ left: 0, right: 0, top: 30 }}
                        barSize={36}
                      >
                        {/* use theme primary.DEFAULT for gradient fill, default.DEFAULT for stroke */}
                        <defs>
                          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#d7ac82" stopOpacity={0.9} />
                            <stop offset="95%" stopColor="#d7ac82" stopOpacity={0.6} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="name"
                          angle={-35}
                          textAnchor="end"
                          height={60}
                          tick={{
                            fill: 'hsl(var(--heroui-primary-500))',
                            fontSize: 12, fontWeight: 500
                          }}
                          tickMargin={10}
                          padding={{ left: 30, right: 30 }}
                        />
                        <Tooltip
                          formatter={(value) => [`${value} items`, 'Count']}
                          contentStyle={{
                            borderRadius: 8,
                            padding: '10px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            border: '1px solid #f0f0f0'
                          }}
                          cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                        />
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke='hsl(var(--heroui-primary-100))'
                        />
                        <Bar
                          dataKey="value"
                          name="Count"
                          radius={[4, 4, 0, 0]}
                          fill="url(#barGradient)"
                          stroke="#c7b098"
                          strokeWidth={1}
                        >
                          {/* show value on top of each bar */}
                          <LabelList
                            dataKey="value"
                            position="top"
                            formatter={(val: number) => val.toString()}
                            style={{
                              fill: 'hsl(var(--heroui-primary-500))',
                              fontSize: 12, fontWeight: 500
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
            </Card>

            {/* Latest Notifications */}
            <Card className="lg:col-span-2 bg-background">
              <CardHeader className="px-4 py-3 flex justify-between items-center">
                <h2 className="text-lg font-semibold">Latest Notifications</h2>
              </CardHeader>
              <Divider />
              <div className="p-4">
                {loading ? (
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
                ) : dashboardData?.notifications?.length > 0 ? (
                  <div className="space-y-3 overflow-hidden max-h-[330px]">
                    {dashboardData.notifications.map((notification: any) => (
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
            </Card>
          </div>

          {/* Delivery Performance Chart */}
          <Card className="mt-4 bg-background">
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
                  {loading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="relative w-full h-full flex items-center justify-center">
                        <Skeleton className="h-[180px] w-[180px] rounded-full absolute" />
                        <Skeleton className="h-[120px] w-[120px] rounded-full absolute" />
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-5 w-24 absolute bottom-4" style={{ left: `${25 + i * 30}%` }} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={performanceData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}%`}
                        >
                          {performanceData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value}%`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div>
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm font-medium">Daily Performance</p>
                      {loading ? (
                        <Skeleton className="h-5 w-16 rounded-md" />
                      ) : (
                        <Badge color={dashboardData?.deliveryPerformance?.daily >= 90 ? "success" : "warning"}>
                          {dashboardData?.deliveryPerformance?.daily_completed || 0} / {dashboardData?.deliveryPerformance?.daily_total || 0}
                        </Badge>
                      )}
                    </div>
                    {loading ? (
                      <Skeleton className="h-8 w-full rounded-md" />
                    ) : (
                      <Progress
                        value={dashboardData?.deliveryPerformance?.daily || 0}
                        color={dashboardData?.deliveryPerformance?.daily >= 90 ? "success" : "warning"}
                        showValueLabel={true}
                        size="lg"
                      />
                    )}
                  </div>

                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm font-medium">Weekly Performance</p>
                      {loading ? (
                        <Skeleton className="h-5 w-16 rounded-md" />
                      ) : (
                        <Badge color={dashboardData?.deliveryPerformance?.weekly >= 90 ? "success" : "warning"}>
                          {dashboardData?.deliveryPerformance?.weekly_completed || 0} / {dashboardData?.deliveryPerformance?.weekly_total || 0}
                        </Badge>
                      )}
                    </div>
                    {loading ? (
                      <Skeleton className="h-8 w-full rounded-md" />
                    ) : (
                      <Progress
                        value={dashboardData?.deliveryPerformance?.weekly || 0}
                        color={dashboardData?.deliveryPerformance?.weekly >= 90 ? "success" : "warning"}
                        showValueLabel={true}
                        size="lg"
                      />
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm font-medium">Monthly Performance</p>
                      {loading ? (
                        <Skeleton className="h-5 w-16 rounded-md" />
                      ) : (
                        <Badge color={dashboardData?.deliveryPerformance?.monthly >= 90 ? "success" : "warning"}>
                          {dashboardData?.deliveryPerformance?.monthly_completed || 0} / {dashboardData?.deliveryPerformance?.monthly_total || 0}
                        </Badge>
                      )}
                    </div>
                    {loading ? (
                      <Skeleton className="h-8 w-full rounded-md" />
                    ) : (
                      <Progress
                        value={dashboardData?.deliveryPerformance?.monthly || 0}
                        color={dashboardData?.deliveryPerformance?.monthly >= 90 ? "success" : "warning"}
                        showValueLabel={true}
                        size="lg"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Revenue Comparison Card */}
          <Card className="mt-4 bg-background">
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
                  {loading ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="w-full px-12">
                        <div className="flex justify-between mb-4">
                          {[...Array(2)].map((_, i) => (
                            <Skeleton key={i} className="h-5 w-20 rounded-md" />
                          ))}
                        </div>
                        <div className="flex items-end justify-around h-[180px]">
                          {[...Array(2)].map((_, i) => (
                            <Skeleton key={i} className="w-24 rounded-t-md" style={{ height: `${100 + (i * 50)}px` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : monthlyRevenueData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyRevenueData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value) => [`₱${value}`, 'Revenue']} />
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
                      {loading ? (
                        <Skeleton className="h-8 w-40 mt-1 rounded-md" />
                      ) : (
                        <p className="text-2xl font-bold">₱{parseFloat(dashboardData?.monthlyRevenue?.current_month || 0).toLocaleString()}</p>
                      )}
                    </CardBody>
                  </Card>

                  <Card className="bg-default-50">
                    <CardBody>
                      <p className="text-sm text-default-500">Previous Month</p>
                      {loading ? (
                        <Skeleton className="h-8 w-40 mt-1 rounded-md" />
                      ) : (
                        <p className="text-2xl font-bold">₱{parseFloat(dashboardData?.monthlyRevenue?.previous_month || 0).toLocaleString()}</p>
                      )}
                    </CardBody>
                  </Card>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Helper functions for notifications
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

function getNotificationIconBg(type: string) {
  switch (type) {
    case "inventory":
      return "bg-blue-100 text-blue-600";
    case "delivery":
      return "bg-green-100 text-green-600";
    case "warehouse":
      return "bg-amber-100 text-amber-600";
    case "profile":
      return "bg-purple-100 text-purple-600";
    case "company":
      return "bg-indigo-100 text-indigo-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function formatNotificationAction(action: string) {
  switch (action) {
    case "create":
      return "Created";
    case "update":
      return "Updated";
    case "delete":
      return "Deleted";
    default:
      return action.charAt(0).toUpperCase() + action.slice(1);
  }
}

function formatNotificationTime(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 60) {
    return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  }

  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }

  return format(date, 'MMM d, yyyy');
}