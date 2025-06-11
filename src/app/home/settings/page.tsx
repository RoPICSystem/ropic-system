"use client";

import CardList from "@/components/card-list";
import LoadingAnimation from "@/components/loading-animation"; // Add this import
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Icon } from "@iconify/react";
import {
  Button,
  Skeleton, // Add this import
  Switch,
  Tab,
  Tabs
} from "@heroui/react";
import { useRouter } from 'next/navigation';
import { motionTransition } from "@/utils/anim";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getUserProfile } from "@/utils/supabase/server/user";
import { Settings, updateSettings } from "./actions";

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);

  // add cookies to store the settings configurations
  const [config, setConfig] = useState<Settings>({
    fullScreen: false,
    defaultView: 'grouped',
    pageSize: 15
  });

  // get the setting configurations from cookies 
  useEffect(() => {
    async function fetchUserData() {
      setIsLoading(true);
      const { data, error } = await getUserProfile();

      if (error) {
        setIsLoading(false);
        return;
      }

      setUser(data);
      setConfig(data.settings);
      setIsLoading(false);
    }

    fetchUserData();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      async function setSettings(settings: Settings) {
        setIsSettingsLoading(true);
        await updateSettings(settings);
        setIsSettingsLoading(false);
      }
      setSettings(config);
    } else {
      setIsLoaded(true);
    }
  }, [config]);

  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto max-w-5xl p-2">
        <div className="space-y-4">
          {/* Header section */}
          <LoadingAnimation
            condition={isLoading}
            skeleton={
              <div className="flex justify-between items-center">
                <div>
                  <Skeleton className="h-8 w-48 rounded-xl mb-2" />
                  <Skeleton className="h-4 w-72 rounded-xl" />
                </div>
              </div>
            }>
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-default-500">Manage your account settings and preferences.</p>
              </div>
            </div>
          </LoadingAnimation>

          <CardList>
            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between h-full w-full space-y-2 sm:space-y-0">
                  <Skeleton className="h-6 w-24 rounded-xl mb-2 sm:mb-0" />
                  <Skeleton className="h-12 w-full sm:w-72 rounded-xl" />
                </div>
              }>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between h-full w-full space-y-2 sm:space-y-0">
                <span className="mb-2 sm:mb-0 mr-4">Theme style</span>
                <div className="w-full sm:w-auto">
                  <ThemeSwitcher className="rounded-xl bg-default-200 shadow-lg shadow-default-200/50 my-1 flex justify-center" />
                </div>
              </div>
            </LoadingAnimation>
          </CardList>

          <CardList>
            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Skeleton className="h-6 w-48 rounded-xl mb-2" />
                    <Skeleton className="h-4 w-72 rounded-xl" />
                  </div>
                  <Skeleton className="h-8 w-16 rounded-xl ml-4" />
                </div>
              }>
              <div className="flex flex-row items-center justify-between h-full w-full space-y-2">
                <div className="flex flex-col w-full gap-1">
                  <p className="text-medium">Enable full screen mode</p>
                  <p className="text-tiny text-default-600">
                    This will enable full screen mode for the web interface.
                  </p>
                </div>
                <Switch
                  isSelected={config.fullScreen}
                  isDisabled={isSettingsLoading}
                  onValueChange={(checked) => {
                    setConfig((prev) => ({ ...prev, fullScreen: checked }));
                  }}
                  classNames={{
                    wrapper: "shadow-lg group-data-[selected]:shadow-primary-400/50 shadow-default-200/50 transition-all",
                    base: "flex flex-row-reverse items-center justify-between h-full w-full max-w-full",
                  }}>

                </Switch>
              </div>
            </LoadingAnimation>

            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between h-full w-full space-y-2 sm:space-y-0">
                  <div className="flex-1">
                    <Skeleton className="h-6 w-48 rounded-xl mb-2" />
                    <Skeleton className="h-4 w-72 rounded-xl" />
                  </div>
                  <Skeleton className="h-12 w-full sm:w-72 rounded-xl" />
                </div>
              }>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between h-full w-full space-y-2 sm:space-y-0">
                <div className="flex me-4 flex-col gap-1">
                  <p className="text-medium">Default item view</p>
                  <p className="text-tiny text-default-600">
                    Choose the default view for inventory items.
                  </p>
                </div>
                <div className="w-full sm:w-auto">
                  <Tabs color="primary" variant="light"
                    className="w-full rounded-xl bg-default-200 shadow-lg shadow-default-200/50 my-1 flex justify-center"
                    isDisabled={isSettingsLoading}
                    selectedKey={config.defaultView}
                    onSelectionChange={(key) => {
                      setConfig((prev) => ({ ...prev, defaultView: key.toString() }));
                    }}>
                    <Tab key="grouped"
                      className=""
                      title={
                        <div className="flex items-center text-foreground gap-2">
                          <Icon icon="mdi:format-list-group" />
                          Grouped
                        </div>
                      } />
                    <Tab key="flat"
                      title={
                        <div className="flex items-center text-foreground gap-2">
                          <Icon icon="mdi:format-list-bulleted" />
                          Flat
                        </div>
                      } />
                  </Tabs>
                </div>
              </div>
            </LoadingAnimation>

            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between h-full w-full space-y-2 sm:space-y-0">
                  <div className="flex-1">
                    <Skeleton className="h-6 w-48 rounded-xl mb-2" />
                    <Skeleton className="h-4 w-72 rounded-xl" />
                  </div>
                  <Skeleton className="h-12 w-full sm:w-72 rounded-xl" />
                </div>
              }>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between h-full w-full space-y-2 sm:space-y-0">
                <div className="flex me-4 flex-col gap-1">
                  <p className="text-medium">Page size</p>
                  <p className="text-tiny text-default-600">
                    Set the number of items to display per page.
                  </p>
                </div>
                <div className="w-full sm:w-auto">
                  <Tabs color="primary" variant="light"
                    className="w-full rounded-xl bg-default-200 shadow-lg shadow-default-200/50 my-1 flex justify-center"
                    selectedKey={config.pageSize.toString()}
                    isDisabled={isSettingsLoading}
                    onSelectionChange={(key) => {
                      const size = parseInt(key.toString());
                      setConfig((prev) => ({ ...prev, pageSize: size }));
                    }}>
                    <Tab
                      key="10"
                      title={
                        <div className="text-foreground">
                          10
                        </div>
                      } />
                    <Tab
                      key="15"
                      title={
                        <div className="text-foreground">
                          15
                        </div>
                      } />
                    <Tab
                      key="20"
                      title={
                        <div className="text-foreground">
                          20
                        </div>
                      } />
                    <Tab
                      key="30"
                      title={
                        <div className="text-foreground">
                          30
                        </div>
                      } />
                    <Tab
                      key="50"
                      title={
                        <div className="text-foreground">
                          50
                        </div>
                      } />
                  </Tabs>
                </div>
              </div>
            </LoadingAnimation>
          </CardList>
          <CardList>

            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-48 rounded-xl" />
                  <Skeleton className="h-10 w-10 rounded-xl" />
                </div>
              }>
              <div className="flex items-center justify-between h-full w-full">
                <span>Show profile information</span>
                <Button
                  variant="shadow"
                  color="primary"
                  onPress={() => router.push('/home/profile')}
                  className="my-1">
                  <Icon icon="mdi:chevron-right" className="text-xl" />
                </Button>
              </div>
            </LoadingAnimation>
            
            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-48 rounded-xl" />
                  <Skeleton className="h-10 w-10 rounded-xl" />
                </div>
              }>
              <div className="flex items-center justify-between h-full w-full">
                <span>Show company information</span>
                <Button
                  variant="shadow"
                  color="primary"
                  onPress={() => router.push('/home/company')}
                  className="my-1">
                  <Icon icon="mdi:chevron-right" className="text-xl" />
                </Button>
              </div>
            </LoadingAnimation>

            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-48 rounded-xl" />
                  <Skeleton className="h-10 w-10 rounded-xl" />
                </div>
              }>
              <div className="flex items-center justify-between h-full w-full">
                <span>Change profile information</span>
                <Button
                  variant="shadow"
                  color="primary"
                  onPress={() => router.push('/home/profile/edit')}
                  className="my-1">
                  <Icon icon="mdi:chevron-right" className="text-xl" />
                </Button>
              </div>
            </LoadingAnimation>
          </CardList>

          <CardList>
            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div className="flex items-center justify-between">
                  <div>
                    <Skeleton className="h-6 w-24 rounded-xl mb-2" />
                    <Skeleton className="h-4 w-48 rounded-xl mb-1" />
                    <Skeleton className="h-4 w-32 rounded-xl" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-xl" />
                </div>
              }>
              <div className="flex items-center justify-between h-full w-full">
                <div className="flex flex-col">
                  <span>About</span>
                  <p className="text-tiny text-default-600">
                    Reorder Point Inventory Control System
                  </p>
                  <p className="text-tiny text-default-600">
                    Version 1.0.0
                  </p>
                </div>
                <Button variant="shadow" color="primary" className="my-1"
                  onPress={() => router.push('/home/settings/update-logs')}>
                  <Icon icon="mdi:chevron-right" className="text-xl" />
                </Button>
              </div>
            </LoadingAnimation>

            <LoadingAnimation
              condition={isLoading}
              skeleton={
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-32 rounded-xl" />
                  <Skeleton className="h-10 w-10 rounded-xl" />
                </div>
              }>
              <div className="flex items-center justify-between h-full w-full">
                <span>Developers</span>
                <Button variant="shadow" color="primary" className="my-1">
                  <Icon icon="mdi:chevron-right" className="text-xl" />
                </Button>
              </div>
            </LoadingAnimation>
          </CardList>
        </div>
      </div>
    </motion.div>
  );
}