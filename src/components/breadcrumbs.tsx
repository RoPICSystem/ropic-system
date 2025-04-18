"use client";

import { ReactNode } from 'react';
import Link from 'next/link';
import {
  Breadcrumbs,
  BreadcrumbItem,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Button,
} from '@heroui/react';
import { usePathname } from 'next/navigation';
import {
  HomeIcon,
  ShoppingCartIcon,
  TruckIcon,
  BellAlertIcon,
  ChartBarIcon,
  CogIcon,
  PlusIcon,
  UserIcon,
} from '@heroicons/react/24/solid';
import { motion, AnimatePresence } from 'framer-motion';

const navigation = [
  { name: 'Dashboard', href: '/home/dashboard', icon: HomeIcon },
  { name: 'New', href: '/home/dashboard/new', icon: PlusIcon },
  { name: 'Inventory', href: '/home/inventory', icon: ShoppingCartIcon },
  { name: 'Deliveries', href: '/home/deliveries', icon: TruckIcon },
  { name: 'Notifications', href: '/home/notifications', icon: BellAlertIcon },
  { name: 'Reports', href: '/home/reports', icon: ChartBarIcon },
  { name: 'Settings', href: '/home/settings', icon: CogIcon },
  { name: 'Profile', href: '/home/profile', icon:  UserIcon },
];

export default function NavigationBread() {
  const pathname = usePathname();
  const pathSegments = pathname.split('/').filter(Boolean);
  const displaySegments = pathSegments.filter(segment => segment !== 'home');

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
                            <item.icon className="w-4 h-4" />
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
