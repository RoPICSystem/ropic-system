"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { motionTransition } from '@/utils/anim';
import { motion, AnimatePresence } from "framer-motion";
import { getDashboardData } from "./actions";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardFooter,
  Badge,
  Progress,
  Skeleton,
  Spinner,
  Tab,
  Tabs,
  Chip,
  Divider
} from "@heroui/react";

import { Icon } from "@iconify-icon/react";

// Charts
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from "recharts";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);
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
            variant="light"
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

      <AnimatePresence>
        {loading ? (
          <motion.div {...motionTransition}>
            {/* Loading skeleton for key metrics cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[...Array(4)].map((_, i) => (
                <Card key={`metric-${i}`} className={`shadow-xl bg-${['secondary', 'success', 'warning', 'danger'][i]}-50`}>
                  <CardBody className="p-4">
                    <div className="flex justify-between items-center mb-3 gap-4">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-12 w-12 rounded-full" />
                    </div>
                    <Skeleton className="h-8 w-24 mb-4" />
                    {i === 0 && (
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {[...Array(4)].map((_, j) => (
                          <Skeleton key={`metric-detail-${j}`} className="h-4 w-full" />
                        ))}
                      </div>
                    )}
                    {i === 1 && (
                      <div className="mb-4">
                        <div className="flex justify-between mb-2">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                        <Skeleton className="h-3 w-full rounded-full" />
                      </div>
                    )}
                    {i === 2 && (
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {[...Array(3)].map((_, j) => (
                          <div key={`perf-${j}`} className="text-center py-2 bg-warning-100 rounded-md">
                            <Skeleton className="h-5 w-12 mx-auto mb-1" />
                            <Skeleton className="h-3 w-8 mx-auto" />
                          </div>
                        ))}
                      </div>
                    )}
                    {i === 3 && (
                      <>
                        <Skeleton className="h-5 w-32 mb-4" />
                        <Skeleton className="h-4 w-full" />
                      </>
                    )}
                    <Skeleton className={`h-9 w-${i === 0 || i === 1 ? 'full' : '32'} mt-2`} />
                  </CardBody>
                </Card>
              ))}
            </div>

            {/* Skeleton for charts section */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-6">
              {/* Delivery Status Chart Skeleton */}
              <Card className="lg:col-span-3">
                <CardHeader className="px-4 py-3 flex justify-between items-center">
                  <div>
                    <Skeleton className="h-6 w-48 mb-2" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                  <Skeleton className="h-6 w-24" />
                </CardHeader>
                <Divider />
                <div className="p-4">
                  <Skeleton className="h-72 w-full rounded-lg" />
                </div>
              </Card>

              {/* Notifications Skeleton */}
              <Card className="lg:col-span-2">
                <CardHeader className="px-4 py-3 flex justify-between items-center">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-8 w-20 rounded-lg" />
                </CardHeader>
                <Divider />
                <div className="p-4">
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <Card key={`notification-${i}`} className="bg-default-50 border-none shadow-sm">
                        <CardBody className="p-3">
                          <div className="flex items-start gap-3">
                            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                            <div className="w-full">
                              <div className="flex items-center gap-2 mb-1">
                                <Skeleton className="h-5 w-4/5" />
                                {i === 0 && <Skeleton className="h-5 w-12 rounded-full" />}
                              </div>
                              <Skeleton className="h-3.5 w-3/5" />
                            </div>
                          </div>
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* Delivery Performance Skeleton */}
            <Card className="mt-4">
              <CardHeader className="px-4 py-3 flex justify-between items-center">
                <div>
                  <Skeleton className="h-6 w-56 mb-2" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <Skeleton className="h-6 w-24 rounded-lg" />
              </CardHeader>
              <Divider />
              <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Skeleton className="h-72 w-full rounded-lg" />
                  <div>
                    {[...Array(3)].map((_, i) => (
                      <div key={`perf-bar-${i}`} className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                          <Skeleton className="h-5 w-36" />
                          <Skeleton className="h-5 w-24" />
                        </div>
                        <Skeleton className="h-8 w-full rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Revenue Comparison Skeleton */}
            <Card className="mt-4">
              <CardHeader className="px-4 py-3">
                <div>
                  <Skeleton className="h-6 w-48 mb-2" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </CardHeader>
              <Divider />
              <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <Skeleton className="h-60 w-full rounded-lg" />
                  </div>
                  <div className="flex flex-col justify-center gap-4">
                    <Card className="bg-default-50">
                      <CardBody>
                        <Skeleton className="h-4 w-28 mb-2" />
                        <Skeleton className="h-7 w-36" />
                      </CardBody>
                    </Card>
                    <Card className="bg-default-50">
                      <CardBody>
                        <Skeleton className="h-4 w-28 mb-2" />
                        <Skeleton className="h-7 w-36" />
                      </CardBody>
                    </Card>
                  </div>
                </div>
              </div>
            </Card>

            {/* Quick Actions Skeleton */}
            <Card className="mt-6">
              <CardHeader className="px-4 py-3">
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <Divider />
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:sm:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={`action-${i}`} className="h-16 rounded-lg" />
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div {...motionTransition}>
            {/* Key metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* Delivery counts card */}
              <Card className="bg-secondary-50 shadow-secondary-50/50 shadow-xl">
                <CardBody className="p-4">
                  <div className="flex justify-between items-center mb-3 gap-4">
                    <div className="text-sm font-medium text-secondary-800">
                      Deliveries
                    </div>
                    <Icon icon="fluent-emoji:delivery-truck"
                      width={48} height={48} />
                  </div>

                  <div className="text-3xl font-bold mb-3">
                    {dashboardData?.deliveryCounts?.total || 0}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                    <div className="flex items-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-1.5"></span>
                      <span className="text-secondary-500">
                        {dashboardData?.deliveryCounts?.PENDING || 0} pending
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-1.5"></span>
                      <span className="text-secondary-500">
                        {dashboardData?.deliveryCounts?.PROCESSING || 0} processing
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500 mr-1.5"></span>
                      <span className="text-secondary-500">
                        {dashboardData?.deliveryCounts?.IN_TRANSIT || 0} in transit
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 mr-1.5"></span>
                      <span className="text-secondary-500">
                        {(dashboardData?.deliveryCounts?.DELIVERED || 0) +
                          (dashboardData?.deliveryCounts?.CONFIRMED || 0)} delivered
                      </span>
                    </div>
                  </div>

                  <Button
                    as={Link}
                    variant="shadow"
                    color="secondary"
                    href="/home/delivery"
                  >
                    View all deliveries <Icon icon="fluent:arrow-right-16-filled" className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </CardBody>
              </Card>

              {/* Inventory stats card */}
              <Card className="bg-success-50 shadow-success-50/50 shadow-xl">
                <CardBody className="p-4">
                  <div className="flex justify-between items-center mb-3 gap-4">
                    <div className="text-sm font-medium text-success-800">
                      Inventory
                    </div>
                    <Icon icon="fluent-emoji:package"
                      width={48} height={48} />
                  </div>

                  <div className="text-3xl font-bold mb-3">
                    {dashboardData?.inventoryStats?.total || 0}
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-success-500 mb-2">
                      <span>Available ({dashboardData?.inventoryStats?.available || 0})</span>
                      <span>Reserved ({dashboardData?.inventoryStats?.reserved || 0})</span>
                    </div>
                    <Progress
                      value={dashboardData?.inventoryStats?.total > 0
                        ? (dashboardData?.inventoryStats?.available / dashboardData?.inventoryStats?.total) * 100
                        : 0}
                      color="success"
                      size="md"
                      className="h-3"
                    />
                  </div>

                  <Button
                    as={Link}
                    variant="shadow"
                    color="success"
                    href="/home/inventory"
                  >
                    Manage inventory <Icon icon="fluent:arrow-right-16-filled" className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </CardBody>
              </Card>

              {/* Delivery performance card */}
              <Card className="bg-warning-50 shadow-warning-50/50 shadow-xl">
                <CardBody className="p-4">
                  <div className="flex justify-between items-center mb-3 gap-4">
                    <div className="text-sm font-medium text-warning-800">
                      Performance
                    </div>
                    <Icon icon="fluent-color:data-area-24" width={48} height={48} />
                  </div>

                  <div className="text-3xl font-bold mb-3">
                    {dashboardData?.deliveryPerformance?.monthly || 0}%
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs text-warning-500 mb-4">
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
                  </div>

                  <div className="text-xs text-warning-500">
                    Complete/total delivery rates
                  </div>
                </CardBody>
              </Card>

              {/* Monthly revenue card */}
              <Card className="bg-danger-50 shadow-danger-50/50 shadow-xl">
                <CardBody className="p-4">
                  <div className="flex justify-between items-center mb-3 gap-4">
                    <div className="text-sm font-medium text-danger-800">
                      Monthly Revenue
                    </div>
                    <Icon icon="fluent-emoji:money-bag"
                      width={48} height={48} />
                  </div>

                  <div className="text-3xl font-bold mb-3">
                    ₱{parseFloat(dashboardData?.monthlyRevenue?.current_month || 0).toLocaleString()}
                  </div>

                  {dashboardData?.monthlyRevenue?.percent_change !== null ? (
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
                    <div className="text-xs text-danger-500 mb-4">No previous data</div>
                  )}

                  <div className="text-xs text-danger-500">
                    Value of delivered items
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Tab section */}
            <div className="mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-6">
                {/* Delivery Status Distribution Chart */}
                <Card className="lg:col-span-3 bg-background">
                  <CardHeader className="px-4 py-3 flex justify-between items-center">
                    <div>
                      <h2 className="text-lg font-semibold">Delivery Status Distribution</h2>
                      <p className="text-xs text-default-500">Breakdown of current delivery statuses</p>
                    </div>
                    <Badge color="primary" variant="flat">
                      {dashboardData?.deliveryCounts?.total || 0} Total
                    </Badge>
                  </CardHeader>
                  <Divider />
                  <div className="p-4">
                    <div className="h-72">
                      {deliveryStatusData.length > 0 && deliveryStatusData.some(d => d.value > 0) ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={deliveryStatusData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                            <XAxis dataKey="name" angle={-45} textAnchor="end" height={50} />
                            <YAxis />
                            <Tooltip formatter={(value) => [`${value} items`, 'Count']} />
                            <Legend />
                            <Bar dataKey="value" name="Count">
                              {deliveryStatusData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
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
                    <Button as={Link} variant="flat" href="/home/notifications">
                      View all
                    </Button>
                  </CardHeader>
                  <Divider />
                  <div className="p-4">
                    {dashboardData?.notifications?.length > 0 ? (
                      <div className="space-y-3 overflow-y-auto max-h-[300px] pr-1">
                        {dashboardData.notifications.map((notification: any) => (
                          <Card
                            key={notification.id}
                            className={`${notification.read ? 'bg-default-50' : 'bg-default-100'} border-none shadow-sm`}
                          >
                            <CardBody className="p-3">
                              <div className="flex items-start gap-3 ">
                                <div className={`rounded-full p-2 flex-shrink-0 h-10 w-10 mt-1 ${getNotificationIconBg(notification.type)}`}>
                                  <Icon icon={getNotificationIcon(notification.type, notification.action)} width={24} height={24} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
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
                    </div>

                    <div>
                      <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-sm font-medium">Daily Performance</p>
                          <Badge color={dashboardData?.deliveryPerformance?.daily >= 90 ? "success" : "warning"}>
                            {dashboardData?.deliveryPerformance?.daily_completed || 0} / {dashboardData?.deliveryPerformance?.daily_total || 0}
                          </Badge>
                        </div>
                        <Progress
                          value={dashboardData?.deliveryPerformance?.daily || 0}
                          color={dashboardData?.deliveryPerformance?.daily >= 90 ? "success" : "warning"}
                          showValueLabel={true}
                          size="lg"
                        />
                      </div>

                      <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-sm font-medium">Weekly Performance</p>
                          <Badge color={dashboardData?.deliveryPerformance?.weekly >= 90 ? "success" : "warning"}>
                            {dashboardData?.deliveryPerformance?.weekly_completed || 0} / {dashboardData?.deliveryPerformance?.weekly_total || 0}
                          </Badge>
                        </div>
                        <Progress
                          value={dashboardData?.deliveryPerformance?.weekly || 0}
                          color={dashboardData?.deliveryPerformance?.weekly >= 90 ? "success" : "warning"}
                          showValueLabel={true}
                          size="lg"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-sm font-medium">Monthly Performance</p>
                          <Badge color={dashboardData?.deliveryPerformance?.monthly >= 90 ? "success" : "warning"}>
                            {dashboardData?.deliveryPerformance?.monthly_completed || 0} / {dashboardData?.deliveryPerformance?.monthly_total || 0}
                          </Badge>
                        </div>
                        <Progress
                          value={dashboardData?.deliveryPerformance?.monthly || 0}
                          color={dashboardData?.deliveryPerformance?.monthly >= 90 ? "success" : "warning"}
                          showValueLabel={true}
                          size="lg"
                        />
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
                      {monthlyRevenueData.length > 0 ? (
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
                          <p className="text-2xl font-bold">₱{parseFloat(dashboardData?.monthlyRevenue?.current_month || 0).toLocaleString()}</p>
                        </CardBody>
                      </Card>

                      <Card className="bg-default-50">
                        <CardBody>
                          <p className="text-sm text-default-500">Previous Month</p>
                          <p className="text-2xl font-bold">₱{parseFloat(dashboardData?.monthlyRevenue?.previous_month || 0).toLocaleString()}</p>
                        </CardBody>
                      </Card>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Quick Actions Section */}
            <Card className="mt-6 bg-background">
              <CardHeader className="px-4 py-3">
                <h2 className="text-lg font-semibold">Quick Actions</h2>
              </CardHeader>
              <Divider />
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:sm:grid-cols-4 gap-4">
                  <Button
                    color="primary"
                    variant="flat"
                    className="h-16 text-left justify-start"
                    startContent={<Icon icon="fluent:box-checkmark-20-filled" width={20} height={20} className="mr-2" />}
                    as={Link}
                    href="/home/inventory"
                  >
                    <div>
                      <p>Add Inventory</p>
                      <p className="text-xs opacity-70">Create new inventory</p>
                    </div>
                  </Button>

                  <Button
                    color="secondary"
                    variant="flat"
                    className="h-16 text-left justify-start"
                    startContent={<Icon icon="fluent:vehicle-truck-24-filled" width={20} height={20} className="mr-2" />}
                    as={Link}
                    href="/home/delivery"
                  >
                    <div>
                      <p>Create Delivery</p>
                      <p className="text-xs opacity-70">Schedule a new delivery</p>
                    </div>
                  </Button>

                  <Button
                    color="success"
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
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
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