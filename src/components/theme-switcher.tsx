'use client'; // uncomment this line if you're using Next.js App Directory Setup

import { Tab, Tabs } from "@heroui/react";
import {useTheme} from "next-themes";
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/solid';
import { useEffect, useState } from "react";

export const ThemeSwitcher = ({ className }: { className?: string }) => {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])
  
  return (
    <> 
      <Tabs color="primary"  variant="light"
        className={`w-full ${className}`}
        selectedKey={theme} 
        onSelectionChange={(key) => {setTheme(`${key.toString()}`)}}>
          <Tab key="light" 
          className=""
          title={
            <div className="flex items-center text-foreground">
              <SunIcon className="h-5 w-5 mr-2" />
              Light
            </div>
          } />
          <Tab key="dark" title={
            <div className="flex items-center text-foreground">
              <MoonIcon className="h-5 w-5 mr-2" />
              Dark
            </div>
          } />
          <Tab key="system" title={
            <div className="flex items-center text-foreground">
              <ComputerDesktopIcon className="h-5 w-5 mr-2" />
              System
            </div>
          } />
        </Tabs>
    </>
  )
};