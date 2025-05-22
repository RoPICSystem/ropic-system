"use client";

import CardList from "@/components/card-list";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Icon } from "@iconify/react";
import {
  Button,
  Switch
} from "@heroui/react";
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter()


  return (
    <div className="container mx-auto max-w-4xl p-2">
      <div className="space-y-4">
        {/* Header section */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-default-500">Manage your account settings and preferences.</p>
          </div>
          <div className="flex gap-4">

          </div>
        </div>

        <CardList>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between h-full w-full space-y-2 sm:space-y-0">
            <span className="mb-2 sm:mb-0 mr-4">Theme style</span>
            <div className="w-full sm:w-auto">
              <ThemeSwitcher className="rounded-xl bg-default-200 shadow-lg shadow-default-200/50 my-1 flex justify-center" />
            </div>
          </div>

        </CardList>
        <CardList>
          <Switch
            classNames={{
              wrapper: " shadow-lg group-data-[selected]:shadow-primary-400/50 shadow-default-200/50 transition-all",
              base: "flex flex-row-reverse items-center justify-between h-full w-full max-w-full",
            }}>
            <div className="flex -ms-2 me-4 flex-col gap-1">
              <p className="text-medium">Enable full screen mode</p>
              <p className="text-tiny text-default-600">
                This will enable full screen mode for the web interface.
              </p>
            </div>
          </Switch>
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
          <div className="flex items-center justify-between h-full w-full">
            <span>Change password</span>
            <Button variant="shadow" color="primary" className="my-1">
              <Icon icon="mdi:chevron-right" className="text-xl" />
            </Button>
          </div>
        </CardList>
        {/* <CardList>
          <div className="flex items-center justify-between h-full w-full">
            <span>Language</span>
            <Button className="my-1">
              English
            </Button>
          </div>
          <div className="flex items-center justify-between h-full w-full">
            <span>Time zone</span>
            <Button className="my-1">
              UTC (GMT+0)
            </Button>
          </div>
        </CardList> */}

        <CardList>
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
            <Button variant="shadow" color="primary" className="my-1">
              <Icon icon="mdi:chevron-right" className="text-xl" />
            </Button>
          </div>
          <div className="flex items-center justify-between h-full w-full">
            <span>Developers</span>
            <Button variant="shadow" color="primary" className="my-1">
              <Icon icon="mdi:chevron-right" className="text-xl" />
            </Button>
          </div>
        </CardList>
      </div>
    </div>
  );
}
