"use client"; 

import React, { useState } from "react";
import {
  Form, 
  Input, 
  Select, 
  SelectItem, 
  Checkbox, 
  Button,
  Card,
  CardBody,
  CardHeader,
  CardFooter,
  Divider,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Badge,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Avatar,
  Tabs,
  Tab
} from "@heroui/react";

export default function Dashboard() {
  const [selectedTab, setSelectedTab] = useState("overview");

  // Sample data
  const stats = [
    { title: "Total Users", value: "4,370", change: "+12%", icon: "👥" },
    { title: "Revenue", value: "$13,456", change: "+8.2%", icon: "💰" },
    { title: "Active Projects", value: "12", change: "+2", icon: "📊" },
    { title: "Completion Rate", value: "86%", change: "+4%", icon: "✅" }
  ];

  const recentActivity = [
    { id: 1, user: "Jane Cooper", action: "Created new project", time: "5 min ago", status: "success" },
    { id: 2, user: "Wade Warren", action: "Updated task status", time: "1 hour ago", status: "pending" },
    { id: 3, user: "Esther Howard", action: "Commented on task", time: "3 hours ago", status: "success" },
    { id: 4, user: "Cameron Williams", action: "Deleted file", time: "1 day ago", status: "error" },
    { id: 5, user: "Brooklyn Simmons", action: "Completed project", time: "2 days ago", status: "success" }
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header section */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-500">Welcome back! Here's an overview of your system.</p>
        </div>
        <div className="flex gap-4">
          <Button color="secondary" variant="flat">
            Export Data
          </Button>
          <Button color="primary">
            Create New Project
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index} className="p-2 bg-background shadow-xl shadow-primary/10">
            <CardBody>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500">{stat.title}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <Badge color={stat.change.includes('+') ? "success" : "danger"}>
                    {stat.change}
                  </Badge>
                </div>
                <div className="text-3xl">{stat.icon}</div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Main content area */}
      <Tabs onSelectionChange={(tab) => setSelectedTab(`${tab}`)}>
        <Tab key="overview" title="Overview">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            {/* Chart card */}
            <Card className="lg:col-span-2 bg-background shadow-xl shadow-primary/10">
              <CardHeader className="flex justify-between">
                <h3 className="text-lg font-semibold">Performance Overview</h3>
                <Select size="sm" className="w-40">
                  <SelectItem key="week">This Week</SelectItem>
                  <SelectItem key="month">This Month</SelectItem>
                  <SelectItem key="year">This Year</SelectItem>
                </Select>
              </CardHeader>
              <CardBody>
                <div className="h-64 w-full bg-gray-100 flex items-center justify-center">
                  {/* This is where you would integrate a chart library */}
                  <p className="text-gray-500">Chart visualization goes here</p>
                </div>
              </CardBody>
            </Card>

            {/* Activity card */}
            <Card className="bg-background shadow-xl shadow-primary/10">
              <CardHeader>
                <h3 className="text-lg font-semibold">Quick Actions</h3>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-3">
                  <Button color="primary" variant="flat" className="justify-start">
                    <span className="mr-2">📝</span> Create New Task
                  </Button>
                  <Button color="secondary" variant="flat" className="justify-start">
                    <span className="mr-2">👥</span> Manage Team
                  </Button>
                  <Button color="success" variant="flat" className="justify-start">
                    <span className="mr-2">📊</span> View Reports
                  </Button>
                  <Button color="warning" variant="flat" className="justify-start">
                    <span className="mr-2">⚙️</span> System Settings
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        </Tab>
        <Tab key="analytics" title="Analytics">
          <div className="p-4">
            <p>Analytics content would go here</p>
          </div>
        </Tab>
        <Tab key="projects" title="Projects">
          <div className="p-4">
            <p>Projects content would go here</p>
          </div>
        </Tab>
        <Tab key="settings" title="Settings">
          <div className="p-4">
            <p>Settings content would go here</p>
          </div>
        </Tab>
      </Tabs>

      {/* Recent Activity Table */}
      <Card className="bg-background shadow-xl shadow-primary/10">
        <CardHeader className="flex justify-between">
          <h3 className="text-lg font-semibold">Recent Activity</h3>
          <Button size="sm" variant="light">View All</Button>
        </CardHeader>
        <CardBody>
          <Table aria-label="Recent activity table">
            <TableHeader>
              <TableColumn>USER</TableColumn>
              <TableColumn>ACTION</TableColumn>
              <TableColumn>TIME</TableColumn>
              <TableColumn>STATUS</TableColumn>
            </TableHeader>
            <TableBody>
              {recentActivity.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar name={item.user.charAt(0)} />
                      <span>{item.user}</span>
                    </div>
                  </TableCell>
                  <TableCell>{item.action}</TableCell>
                  <TableCell>{item.time}</TableCell>
                  <TableCell>
                    <Badge color={
                      item.status === "success" ? "success" :
                      item.status === "error" ? "danger" : "warning"
                    }>
                      {item.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
        <CardFooter>
          <div className="flex justify-between w-full items-center">
            <p className="text-sm text-gray-500">Showing 5 of 25 entries</p>
            <div className="flex gap-2">
              <Button size="sm" variant="flat">Previous</Button>
              <Button size="sm" variant="flat">Next</Button>
            </div>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}