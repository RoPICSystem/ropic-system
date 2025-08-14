"use client";

import { motion } from "framer-motion";
import { motionTransition } from "@/utils/anim";
import { Card, CardBody, Chip, Button, Skeleton, Progress, Tabs, Tab, CardFooter } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useState, useEffect } from "react";
import LoadingAnimation from "@/components/loading-animation";
import CardList from "@/components/card-list";

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'error'
  timestamp: string
  uptime: number
  services: {
    database: {
      status: string
      latency: string
      provider: string
    }
    api: {
      status: string
      endpoint: string
    }
    keepalive: {
      status: string
      schedule: string
      endpoint: string
    }
  }
  environment: {
    nodeEnv: string
    region: string
    deployment: string
  }
}

interface ServiceStatus {
  name: string
  status: 'online' | 'degraded' | 'offline' | 'unknown'
  latency?: number
  lastCheck: Date
  endpoint?: string
  icon: string
  description: string
}

interface KeepaliveStatus {
  lastPing?: string
  status: 'active' | 'inactive' | 'error' | 'unknown'
  message?: string
  nextPing?: string
  hasData?: boolean
  responseTime?: number
}

export default function MonitoringPage() {
  const [healthData, setHealthData] = useState<SystemHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  
  // Keepalive state
  const [keepaliveStatus, setKeepaliveStatus] = useState<KeepaliveStatus>({ status: 'unknown' })
  const [isKeepaliveLoading, setIsKeepaliveLoading] = useState(false)
  const [isTestingAlt, setIsTestingAlt] = useState(false)
  const [lastKeepaliveRefresh, setLastKeepaliveRefresh] = useState<Date | null>(null)
  
  const [services, setServices] = useState<ServiceStatus[]>([
    {
      name: 'Supabase Database',
      status: 'unknown',
      lastCheck: new Date(),
      endpoint: '/api/keepalive',
      icon: 'simple-icons:supabase',
      description: 'PostgreSQL database connection and query performance'
    },
    {
      name: 'Vercel Functions',
      status: 'unknown',
      lastCheck: new Date(),
      endpoint: '/api/health',
      icon: 'simple-icons:vercel',
      description: 'Serverless function execution and response times'
    },
    // {
    //   name: 'Authentication',
    //   status: 'unknown',
    //   lastCheck: new Date(),
    //   icon: 'mdi:shield-check',
    //   description: 'Supabase Auth service availability'
    // },
    // {
    //   name: 'Real-time',
    //   status: 'unknown',
    //   lastCheck: new Date(),
    //   icon: 'mdi:lightning-bolt',
    //   description: 'WebSocket connections and live updates'
    // }
  ])

  const fetchHealthData = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/health')
      if (response.ok) {
        const data = await response.json()
        setHealthData(data)
        setLastUpdated(new Date())

        // Update services status based on health data
        setServices(prev => prev.map(service => {
          if (service.name === 'Vercel Functions') {
            return {
              ...service,
              status: data.status === 'healthy' ? 'online' : 'degraded',
              latency: parseInt(data.services?.api?.latency?.replace('ms', '') || '0'),
              lastCheck: new Date()
            }
          }
          if (service.name === 'Supabase Database') {
            return {
              ...service,
              status: data.services?.database?.status === 'healthy' ? 'online' : 'degraded',
              latency: parseInt(data.services?.database?.latency?.replace('ms', '') || '0'),
              lastCheck: new Date()
            }
          }
          return service
        }))
      } else {
        console.error('Failed to fetch health data:', response.statusText)
        // Mark services as offline on error
        setServices(prev => prev.map(service => ({
          ...service,
          status: 'offline' as const,
          lastCheck: new Date()
        })))
      }
    } catch (error) {
      console.error('Error fetching health data:', error)
      setServices(prev => prev.map(service => ({
        ...service,
        status: 'offline' as const,
        lastCheck: new Date()
      })))
    } finally {
      setIsLoading(false)
    }
  }

  const testService = async (service: ServiceStatus) => {
    if (!service.endpoint) return

    try {
      const startTime = Date.now()
      const response = await fetch(service.endpoint)
      const latency = Date.now() - startTime

      setServices(prev => prev.map(s =>
        s.name === service.name
          ? {
            ...s,
            status: response.ok ? 'online' : 'degraded',
            latency,
            lastCheck: new Date()
          }
          : s
      ))
    } catch (error) {
      setServices(prev => prev.map(s =>
        s.name === service.name
          ? {
            ...s,
            status: 'offline',
            lastCheck: new Date()
          }
          : s
      ))
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'online': return 'success'
      case 'degraded': return 'warning'
      case 'error':
      case 'offline': return 'danger'
      default: return 'default'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'online': return 'mdi:check-circle'
      case 'degraded': return 'mdi:alert-circle'
      case 'error':
      case 'offline': return 'mdi:close-circle'
      default: return 'mdi:help-circle'
    }
  }

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  const getOverallStatus = () => {
    const onlineServices = services.filter(s => s.status === 'online').length
    const totalServices = services.length

    if (onlineServices === totalServices) return 'online'
    if (onlineServices > totalServices / 2) return 'degraded'
    return 'offline'
  }

  const getStatusPercentage = () => {
    const onlineServices = services.filter(s => s.status === 'online').length
    return Math.round((onlineServices / services.length) * 100)
  }

  // Keepalive functions
  const checkKeepaliveStatus = async (useAlt: boolean = false) => {
    const endpoint = useAlt ? '/api/keepalive-alt' : '/api/keepalive'
    const setLoadingState = useAlt ? setIsTestingAlt : setIsKeepaliveLoading
    
    setLoadingState(true)
    const startTime = Date.now()
    
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const responseTime = Date.now() - startTime

      if (response.ok) {
        const data = await response.json()
        setKeepaliveStatus({
          status: 'active',
          lastPing: data.timestamp,
          message: data.message,
          nextPing: calculateNextPing(),
          hasData: data.hasData,
          responseTime
        })
        setLastKeepaliveRefresh(new Date())
      } else {
        setKeepaliveStatus({
          status: 'error',
          message: `HTTP ${response.status}: ${response.statusText}`,
          responseTime
        })
      }
    } catch (error) {
      setKeepaliveStatus({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime
      })
    } finally {
      setLoadingState(false)
    }
  }

  const calculateNextPing = () => {
    const now = new Date()
    const minutes = now.getMinutes()
    const nextInterval = Math.ceil(minutes / 10) * 10
    const nextPing = new Date(now)
    
    if (nextInterval >= 60) {
      nextPing.setHours(nextPing.getHours() + 1)
      nextPing.setMinutes(0)
    } else {
      nextPing.setMinutes(nextInterval)
    }
    
    nextPing.setSeconds(0)
    nextPing.setMilliseconds(0)
    
    return nextPing.toLocaleTimeString()
  }

  const getKeepaliveStatusColor = (status: KeepaliveStatus['status']) => {
    switch (status) {
      case 'active': return 'success'
      case 'error': return 'danger'
      case 'inactive': return 'warning'
      default: return 'default'
    }
  }

  const getKeepaliveStatusText = (status: KeepaliveStatus['status']) => {
    switch (status) {
      case 'active': return 'Database Active'
      case 'error': return 'Error'
      case 'inactive': return 'Inactive'
      default: return 'Unknown'
    }
  }

  const getKeepaliveStatusIcon = (status: KeepaliveStatus['status']) => {
    switch (status) {
      case 'active': return 'mdi:check-circle'
      case 'error': return 'mdi:alert-circle'
      case 'inactive': return 'mdi:pause-circle'
      default: return 'mdi:help-circle'
    }
  }

  const getResponseTimeColor = (responseTime?: number) => {
    if (!responseTime) return 'default'
    if (responseTime < 200) return 'success'
    if (responseTime < 500) return 'warning'
    return 'danger'
  }

  useEffect(() => {
    fetchHealthData()
    checkKeepaliveStatus()

    // Auto-refresh every 30 seconds for health data
    const healthInterval = setInterval(fetchHealthData, 30 * 1000)
    
    // Auto-refresh every 2 minutes for keepalive
    const keepaliveInterval = setInterval(() => checkKeepaliveStatus(), 2 * 60 * 1000)

    return () => {
      clearInterval(healthInterval)
      clearInterval(keepaliveInterval)
    }
  }, [])

  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto max-w-5xl p-2">
        <div className="space-y-6">
          {/* Header section */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
                System Monitoring
              </h1>
              <p className="text-default-500 mt-1">Monitor backend and frontend system health in real-time</p>
            </div>
            <div className="flex items-center gap-3">
              <Chip
                color={getStatusColor(getOverallStatus())}
                variant="flat"
                size="lg"
                startContent={<Icon icon={getStatusIcon(getOverallStatus())} className="text-lg" />}
                className="px-4 py-2"
              >
                {getStatusPercentage()}% Operational
              </Chip>
              <Button
                variant="bordered"
                size="sm"
                onPress={fetchHealthData}
                isLoading={isLoading}
                {...!isLoading && {startContent: <Icon icon="mdi:refresh" />}}
                className="min-w-24"
              >
                Refresh
              </Button>
            </div>
          </div>

          {/* System Status Overview */}
          <Card className="bg-gradient-to-br from-default-50 to-default-100 border-0 shadow-lg">
            <CardBody className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">System Status Overview</h2>
                {lastUpdated && (
                  <span className="text-sm text-default-500">
                    Last updated: {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </div>

              <Progress
                value={getStatusPercentage()}
                color={getStatusColor(getOverallStatus())}
                size="lg"
                className="mb-4"
                formatOptions={{ style: "percent" }}
                showValueLabel
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {services.map((service, index) => (
                  <Card key={service.name} className="bg-default-200/50 hover:bg-default-200/80 transition-colors">
                    <CardBody className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Icon icon={service.icon} className="text-2xl text-primary-600" />
                          <div>
                            <h4 className="font-medium text-sm">{service.name}</h4>
                          </div>
                        </div>
                        <Chip
                          color={getStatusColor(service.status)}
                          variant="flat"
                          size="sm"
                          className="text-xs"
                        >
                          {service.status}
                        </Chip>
                      </div>

                      <p className="text-xs text-default-500 mb-3">{service.description}</p>

                      <div className="space-y-2 text-xs">
                        {(service.latency != undefined) && (
                          <div className="flex justify-between">
                            <span>Response time:</span>
                            <span className={`font-medium ${service.latency < 200 ? 'text-success' :
                                service.latency < 500 ? 'text-warning' : 'text-danger'
                              }`}>
                              {service.latency}ms
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Last check:</span>
                          <span>{service.lastCheck.toLocaleTimeString()}</span>
                        </div>
                      </div>
                    </CardBody>
                    {service.endpoint && (
                      <CardFooter>
                        <Button
                          size="sm"
                          variant="solid"
                          onPress={() => testService(service)}
                          className="w-full h-7 text-xs"
                          startContent={<Icon icon="mdi:play" className="text-sm" />}
                        >
                          Test
                        </Button>
                      </CardFooter>
                    )}

                  </Card>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Detailed Monitoring Tabs */}
          <Card className="shadow-lg">
            <CardBody className="p-0">
              <Tabs
                selectedKey={activeTab}
                onSelectionChange={(key) => setActiveTab(key.toString())}
                className="w-full"
                color="primary"
                variant="underlined"
              >
                <Tab
                  key="overview"
                  title={
                    <div className="flex items-center gap-2">
                      <Icon icon="mdi:view-dashboard" />
                      Overview
                    </div>
                  }
                >
                  <div className="p-6 space-y-6">
                    {/* Environment Information */}
                    {healthData && (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Environment Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <Card className="bg-gradient-to-br from-default-50 to-default-100">
                            <CardBody className="p-4 text-center">
                              <Icon icon="mdi:application-cog" className="text-3xl text-default-600 mx-auto mb-2" />
                              <p className="text-sm font-medium text-default-700">Node Environment</p>
                              <p className="text-lg font-bold text-default-900">{healthData.environment.nodeEnv}</p>
                            </CardBody>
                          </Card>
                          <Card className="bg-gradient-to-br from-success-50 to-success-100">
                            <CardBody className="p-4 text-center">
                              <Icon icon="mdi:earth" className="text-3xl text-success-600 mx-auto mb-2" />
                              <p className="text-sm font-medium text-success-700">Region</p>
                              <p className="text-lg font-bold text-success-900">{healthData.environment.region}</p>
                            </CardBody>
                          </Card>
                          <Card className="bg-gradient-to-br from-warning-50 to-warning-100">
                            <CardBody className="p-4 text-center">
                              <Icon icon="mdi:source-commit" className="text-3xl text-warning-600 mx-auto mb-2" />
                              <p className="text-sm font-medium text-warning-700">Deployment</p>
                              <p className="text-lg font-bold text-warning-900">{healthData.environment.deployment}</p>
                            </CardBody>
                          </Card>
                          <Card className="bg-gradient-to-br from-danger-50 to-danger-100">
                            <CardBody className="p-4 text-center">
                              <Icon icon="mdi:timer" className="text-3xl text-danger-600 mx-auto mb-2" />
                              <p className="text-sm font-medium text-danger-700">Uptime</p>
                              <p className="text-lg font-bold text-danger-900">{formatUptime(healthData.uptime)}</p>
                            </CardBody>
                          </Card>
                        </div>
                      </div>
                    )}

                    {/* System Information */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">System Information</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="bg-gradient-to-br from-default-50 to-default-100">
                          <CardBody className="p-4">
                            <h4 className="font-semibold mb-3 text-default-700">Platform Stack</h4>
                            <div className="space-y-3 text-sm">
                              <div className="flex justify-between">
                                <span className="font-medium">Frontend:</span>
                                <span className="text-default-600">Next.js 15 (Vercel)</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-medium">Backend:</span>
                                <span className="text-default-600">Supabase (PostgreSQL)</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-medium">Authentication:</span>
                                <span className="text-default-600">Supabase Auth</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-medium">Real-time:</span>
                                <span className="text-default-600">Supabase Realtime</span>
                              </div>
                            </div>
                          </CardBody>
                        </Card>

                        <Card className="bg-gradient-to-br from-default-50 to-default-100">
                          <CardBody className="p-4">
                            <h4 className="font-semibold mb-3 text-default-700">Monitoring</h4>
                            <div className="space-y-3 text-sm">
                              <div className="flex justify-between">
                                <span className="font-medium">Keepalive:</span>
                                <span className="text-default-600">10-minute intervals</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-medium">Health checks:</span>
                                <span className="text-default-600">30-second refresh</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-medium">Cron jobs:</span>
                                <span className="text-default-600">Vercel Functions</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-medium">Status page:</span>
                                <span className="text-default-600">Real-time updates</span>
                              </div>
                            </div>
                          </CardBody>
                        </Card>
                      </div>
                    </div>
                  </div>
                </Tab>

                <Tab
                  key="keepalive"
                  title={
                    <div className="flex items-center gap-2">
                      <Icon icon="mdi:heart-pulse" />
                      Database Keepalive
                    </div>
                  }
                >
                  <div className="p-6 space-y-6">
                    {/* Keepalive Status Header */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Icon 
                          icon={getKeepaliveStatusIcon(keepaliveStatus.status)} 
                          className={`text-3xl ${
                            keepaliveStatus.status === 'active' ? 'text-success' : 
                            keepaliveStatus.status === 'error' ? 'text-danger' : 
                            keepaliveStatus.status === 'inactive' ? 'text-warning' : 
                            'text-default-400'
                          }`}
                        />
                        <div>
                          <h3 className="text-lg font-semibold">Database Keepalive Status</h3>
                          <p className="text-default-500">Supabase connection monitoring and auto-ping system</p>
                        </div>
                      </div>
                    </div>

                    {/* Status Information Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <Card className="bg-gradient-to-br from-default-50 to-default-100">
                        <CardBody className="p-4 text-center">
                          <Icon icon={getKeepaliveStatusIcon(keepaliveStatus.status)} className="text-3xl text-default-600 mx-auto mb-2" />
                          <p className="text-sm font-medium text-default-700">Status</p>
                          <p className="text-lg font-bold text-default-900">
                            {getKeepaliveStatusText(keepaliveStatus.status)}
                          </p>
                        </CardBody>
                      </Card>

                      {keepaliveStatus.responseTime && (
                        <Card className="bg-gradient-to-br from-warning-50 to-warning-100">
                          <CardBody className="p-4 text-center">
                            <Icon icon="mdi:speedometer" className="text-3xl text-warning-600 mx-auto mb-2" />
                            <p className="text-sm font-medium text-warning-700">Response Time</p>
                            <p className="text-lg font-bold text-warning-900">
                              {keepaliveStatus.responseTime}ms
                            </p>
                          </CardBody>
                        </Card>
                      )}

                      {keepaliveStatus.lastPing && (
                        <Card className="bg-gradient-to-br from-success-50 to-success-100">
                          <CardBody className="p-4 text-center">
                            <Icon icon="mdi:clock-check" className="text-3xl text-success-600 mx-auto mb-2" />
                            <p className="text-sm font-medium text-success-700">Last Ping</p>
                            <p className="text-lg font-bold text-success-900">
                              {new Date(keepaliveStatus.lastPing).toLocaleTimeString()}
                            </p>
                          </CardBody>
                        </Card>
                      )}

                      {keepaliveStatus.nextPing && (
                        <Card className="bg-gradient-to-br from-danger-50 to-danger-100">
                          <CardBody className="p-4 text-center">
                            <Icon icon="mdi:clock-outline" className="text-3xl text-danger-600 mx-auto mb-2" />
                            <p className="text-sm font-medium text-danger-700">Next Ping</p>
                            <p className="text-lg font-bold text-danger-900">
                              {keepaliveStatus.nextPing}
                            </p>
                          </CardBody>
                        </Card>
                      )}
                    </div>

                    {/* Progress indicator for next ping */}
                    {keepaliveStatus.status === 'active' && (
                      <div className="space-y-4">
                        <h4 className="font-semibold">Next Automatic Ping</h4>
                        <Card className="bg-gradient-to-br from-default-50 to-default-100">
                          <CardBody className="p-4">
                            <div className="space-y-3">
                              <div className="flex justify-between text-sm">
                                <span>Time until next ping</span>
                                <span className="font-medium">{Math.floor((600 - (Date.now() % 600000)) / 1000)}s</span>
                              </div>
                              <Progress 
                                value={(Date.now() % 600000) / 6000} 
                                color="primary" 
                                size="lg"
                                className="max-w-full"
                                formatOptions={{ style: "percent" }}
                                showValueLabel
                              />
                            </div>
                          </CardBody>
                        </Card>
                      </div>
                    )}

                    {/* Status Message */}
                    {keepaliveStatus.message && (
                      <div className="space-y-4">
                        <h4 className="font-semibold">Status Message</h4>
                        <Card className="bg-gradient-to-br from-default-50 to-default-100">
                          <CardBody className="p-4">
                            <p className="text-sm text-default-600">{keepaliveStatus.message}</p>
                          </CardBody>
                        </Card>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="space-y-4">
                      <h4 className="font-semibold">Manual Testing</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Button
                          size="lg"
                          variant="bordered"
                          onPress={() => checkKeepaliveStatus(false)}
                          isLoading={isKeepaliveLoading}
                          className="h-auto p-6 justify-start"
                          startContent={<Icon icon="mdi:refresh" className="text-xl" />}
                        >
                          <div className="text-left">
                            <div className="font-medium">Test Primary Endpoint</div>
                            <div className="text-sm text-default-500">/api/keepalive - Main database ping</div>
                          </div>
                        </Button>

                        <Button
                          size="lg"
                          variant="bordered"
                          color="secondary"
                          onPress={() => checkKeepaliveStatus(true)}
                          isLoading={isTestingAlt}
                          className="h-auto p-6 justify-start"
                          startContent={<Icon icon="mdi:backup-restore" className="text-xl" />}
                        >
                          <div className="text-left">
                            <div className="font-medium">Test Alternative Endpoint</div>
                            <div className="text-sm text-default-500">/api/keepalive-alt - Fallback method</div>
                          </div>
                        </Button>
                      </div>
                    </div>

                    {/* Information Panel */}
                    <div className="space-y-4">
                      <h4 className="font-semibold">System Information</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="bg-gradient-to-br from-default-50 to-default-100">
                          <CardBody className="p-4">
                            <h5 className="font-semibold mb-3 text-default-700">Keepalive Configuration</h5>
                            <div className="space-y-3 text-sm">
                              <div className="flex justify-between">
                                <span className="font-medium">Frequency:</span>
                                <span className="text-default-600">Every 10 minutes</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-medium">Method:</span>
                                <span className="text-default-600">Lightweight queries</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-medium">Scheduler:</span>
                                <span className="text-default-600">Vercel Cron</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="font-medium">Target:</span>
                                <span className="text-default-600">Supabase Free Tier</span>
                              </div>
                            </div>
                          </CardBody>
                        </Card>

                        <Card className="bg-gradient-to-br from-default-50 to-default-100">
                          <CardBody className="p-4">
                            <h5 className="font-semibold mb-3 text-default-700">Benefits</h5>
                            <div className="space-y-2 text-sm text-default-600">
                              <div className="flex items-center gap-2">
                                <Icon icon="mdi:check-circle" className="text-success" />
                                <span>Prevents database auto-pause</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Icon icon="mdi:check-circle" className="text-success" />
                                <span>Maintains connection pool</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Icon icon="mdi:check-circle" className="text-success" />
                                <span>Free tier compatible</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Icon icon="mdi:check-circle" className="text-success" />
                                <span>Minimal resource usage</span>
                              </div>
                            </div>
                          </CardBody>
                        </Card>
                      </div>
                    </div>

                    {lastKeepaliveRefresh && (
                      <div className="text-sm text-default-400 text-center border-t pt-4">
                        Last refreshed: {lastKeepaliveRefresh.toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                </Tab>

                <Tab
                  key="actions"
                  title={
                    <div className="flex items-center gap-2">
                      <Icon icon="mdi:wrench" />
                      Actions
                    </div>
                  }
                >
                  <div className="p-6 space-y-4">
                    <h3 className="text-lg font-semibold">Monitoring Actions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <Button
                        variant="bordered"
                        startContent={<Icon icon="mdi:database-check" />}
                        onPress={() => window.open('/api/health', '_blank')}
                        className="justify-start h-auto p-6"
                      >
                        <div className="text-left">
                          <div className="font-medium">View Health API</div>
                          <div className="text-sm text-default-500">Check raw health endpoint response</div>
                        </div>
                      </Button>

                      <Button
                        variant="bordered"
                        startContent={<Icon icon="mdi:heart-pulse" />}
                        onPress={() => window.open('/api/keepalive', '_blank')}
                        className="justify-start h-auto p-6"
                      >
                        <div className="text-left">
                          <div className="font-medium">Test Keepalive</div>
                          <div className="text-sm text-default-500">Manually trigger keepalive endpoint</div>
                        </div>
                      </Button>

                      <Button
                        variant="bordered"
                        startContent={<Icon icon="mdi:backup-restore" />}
                        onPress={() => window.open('/api/keepalive-alt', '_blank')}
                        className="justify-start h-auto p-6"
                      >
                        <div className="text-left">
                          <div className="font-medium">Test Alternative</div>
                          <div className="text-sm text-default-500">Test fallback keepalive method</div>
                        </div>
                      </Button>

                      <Button
                        variant="bordered"
                        startContent={<Icon icon="mdi:refresh" />}
                        onPress={() => {
                          fetchHealthData()
                          checkKeepaliveStatus()
                        }}
                        className="justify-start h-auto p-6"
                      >
                        <div className="text-left">
                          <div className="font-medium">Refresh All</div>
                          <div className="text-sm text-default-500">Update all service status</div>
                        </div>
                      </Button>

                      <Button
                        variant="bordered"
                        startContent={<Icon icon="mdi:download" />}
                        onPress={() => {
                          const data = JSON.stringify({ 
                            healthData, 
                            services, 
                            keepaliveStatus, 
                            timestamp: new Date() 
                          }, null, 2)
                          const blob = new Blob([data], { type: 'application/json' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `system-status-${Date.now()}.json`
                          a.click()
                        }}
                        className="justify-start h-auto p-6"
                      >
                        <div className="text-left">
                          <div className="font-medium">Export Report</div>
                          <div className="text-sm text-default-500">Download system status as JSON</div>
                        </div>
                      </Button>

                      <Button
                        variant="bordered"
                        startContent={<Icon icon="mdi:information" />}
                        onPress={() => alert('System monitoring helps prevent Supabase database auto-pause and monitors overall system health.')}
                        className="justify-start h-auto p-6"
                      >
                        <div className="text-left">
                          <div className="font-medium">About Monitoring</div>
                          <div className="text-sm text-default-500">Learn about system monitoring</div>
                        </div>
                      </Button>
                    </div>
                  </div>
                </Tab>
              </Tabs>
            </CardBody>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
