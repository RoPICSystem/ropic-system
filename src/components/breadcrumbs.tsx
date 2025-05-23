"use client";

import {
  getUserProfile
} from '@/utils/supabase/server/user';
import {
  BreadcrumbItem,
  Breadcrumbs,
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from '@heroui/react';
import { Icon } from "@iconify-icon/react";
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';


export default function NavigationBread() {
  const pathname = usePathname();
  const pathSegments = pathname.split('/').filter(Boolean);
  const displaySegments = pathSegments.filter(segment => segment !== 'home');
  const [navigation, setNavigation] = useState<{ name: string; href: string; icon: any }[]>([]);
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchUserData() {
      try {
        setIsLoading(true)
        const { data, error } = await getUserProfile()

        if (error) {
          console.error('Error fetching user profile:', error)
          return
        }


        // if user is admin add Inventory to navigation next to dashboard
        if (data?.is_admin) {
          setNavigation([
            { name: 'Dashboard', href: '/home/dashboard', icon: "heroicons:home-solid" },
            { name: 'Warehouses', href: '/home/warehouses', icon: 'material-symbols:warehouse-rounded' },
            { name: 'Inventory', href: '/home/inventory', icon: "fluent:box-20-filled" },
            { name: 'Delivery', href: '/home/delivery', icon: "heroicons:truck-20-solid" },
            { name: 'Warehouse Items', href: '/home/warehouse-items', icon: "fluent:box-20-filled" },
            { name: 'Reorder Point', href: '/home/reorder-point', icon: "heroicons:chart-bar-20-solid" },
            { name: 'Notifications', href: '/home/notifications', icon: "heroicons:bell-alert-20-solid" },
            { name: 'Settings', href: '/home/settings', icon: "heroicons:cog-8-tooth-20-solid" },
            { name: 'Profile', href: '/home/profile', icon: "heroicons:user-20-solid" },
            { name: 'Company Profile', href: '/home/company', icon: "heroicons:user-20-solid" },
          ])
        } else {
          setNavigation([
            { name: 'Dashboard', href: '/home/dashboard', icon: "heroicons:home-solid" },
            { name: 'Warehouse Items', href: '/home/warehouse-items', icon: "fluent:box-20-filled" },
            { name: 'Delivery', href: '/home/delivery', icon: "heroicons:truck-20-solid" },
            { name: 'Reorder Point', href: '/home/reorder-point', icon: "heroicons:chart-bar-20-solid" },
            { name: 'Notifications', href: '/home/notifications', icon: "heroicons:bell-alert-20-solid" },
            { name: 'Settings', href: '/home/settings', icon: "heroicons:cog-8-tooth-20-solid" },
            { name: 'Profile', href: '/home/profile', icon: "heroicons:user-20-solid" },
            { name: 'Company Profile', href: '/home/company', icon: "heroicons:user-20-solid" },
          ])
        }

      } catch (err) {
        console.error('Error fetching user profile:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserData()
  }, [])

  // Group navigation items by their path depth
  const getDropdownItems = (currentPath: string) => {
    const currentPathParts = currentPath.split('/').filter(Boolean);
    const currentDepth = currentPathParts.length;

    // Find siblings or children based on the current path
    return navigation.filter(item => {
      const itemParts = item.href.split('/').filter(Boolean);

      // For top-level items (after /home/), show main navigation items
      if (currentDepth === 1 && itemParts.length === 2 && itemParts[0] === 'home') {
        return true;
      }

      // For deeper levels, show siblings that share the same parent path
      if (currentDepth > 1) {
        // Get parent path without the current segment
        const parentPath = '/' + currentPathParts.slice(0, currentDepth - 1).join('/');
        return item.href.startsWith(parentPath) &&
          item.href !== currentPath &&
          item.href.split('/').length === currentPath.split('/').length;
      }

      return false;
    });
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.3 }}
      >
        <Breadcrumbs size='lg'>
          {displaySegments.map((segment, index) => {
            const fullPath = index === 0
              ? `/home/${segment}`
              : `/home/${displaySegments.slice(0, index + 1).join('/')}`;

            const isLast = index === displaySegments.length - 1;
            const navItem = navigation.find(item => item.href === fullPath);
            const displayName = navItem?.name || segment.charAt(0).toUpperCase() + segment.slice(1);
            const dropdownItems = getDropdownItems(fullPath);

            return (
              <BreadcrumbItem key={fullPath}>
                {isLast ? (
                  <Dropdown>
                    <DropdownTrigger>
                      <Button variant="light" color='primary' className='p-4 text-lg font-medium text-primary-800 min-w-0'>
                        {displayName}
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label="Navigation">
                      {dropdownItems.map((item) => (
                        <DropdownItem key={item.href} as={Link} href={item.href}>
                          <div className="flex items-center gap-2">
                            <Icon icon={item.icon} width={20} className="h-5 w-5" />
                            {item.name}
                          </div>
                        </DropdownItem>
                      ))}
                    </DropdownMenu>
                  </Dropdown>
                ) : (
                  <Link href={fullPath} className="p-4">
                    {displayName}
                  </Link>
                )}
              </BreadcrumbItem>
            );
          })}
        </Breadcrumbs>
      </motion.div>
    </AnimatePresence>
  );
}
