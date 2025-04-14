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
  PlusIcon
} from '@heroicons/react/24/solid';

const navigation = [
  { name: 'Dashboard', href: '/home/dashboard', icon: HomeIcon },
  { name: 'New', href: '/home/dashboard/new', icon: PlusIcon },
  { name: 'Inventory', href: '/home/inventory', icon: ShoppingCartIcon },
  { name: 'Deliveries', href: '/home/deliveries', icon: TruckIcon },
  { name: 'Notifications', href: '/home/notifications', icon: BellAlertIcon },
  { name: 'Reports', href: '/home/reports', icon: ChartBarIcon },
  { name: 'Settings', href: '/home/settings', icon: CogIcon },
];

export default function NavigationBread() {
  const pathname = usePathname();
  const pathSegments = pathname.split('/').filter(Boolean);

  // Filter out "home" from display but keep it for path construction
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

  // Create breadcrumb items from filtered segments
  const breadcrumbItems = displaySegments.map((segment, index) => {
    // Reconstruct full path including 'home'
    const fullPath = index === 0 
      ? `/home/${segment}` 
      : `/home/${displaySegments.slice(0, index + 1).join('/')}`;
    
    const isLast = index === displaySegments.length - 1;

    // Find matching navigation item to get proper name
    const navItem = navigation.find(item => item.href === fullPath);
    const displayName = navItem?.name || segment.charAt(0).toUpperCase() + segment.slice(1);
    
    // Get relevant dropdown items for this breadcrumb level
    const dropdownItems = getDropdownItems(fullPath);

    return (
      <BreadcrumbItem key={fullPath}>
        {isLast ? (
          <Dropdown>
            <DropdownTrigger>
              <Button variant="light" color='primary' className='p-2 text-lg font-medium text-primary-800'>
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
          <Link href={fullPath} className="p-2">
            {displayName}
          </Link>
        )}
      </BreadcrumbItem>
    );
  });

  return (
    <>
      <Breadcrumbs size='lg'>
        {breadcrumbItems}
      </Breadcrumbs>
    </>
  );
}