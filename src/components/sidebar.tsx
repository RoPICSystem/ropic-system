"use client";

import {
  getUserProfile,
  signOut
} from '@/utils/supabase/server/user';
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Image,
  Link,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ScrollShadow,
  Skeleton,
  useDisclosure,
  User,
} from '@heroui/react';
import { Icon } from "@iconify-icon/react";
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';


export default function SideBar({ children }: { children: React.ReactNode }) {
  const [userData, setUserData] = useState<any>(null)
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true)
  const [isSignOutLoading, setIsSignOutLoading] = useState(false)
  const [userProfile, setUserProfile] = useState<any>(null);
  const [imageIcon, setImageIcon] = useState<string | null>(null);
  const { isOpen: isSignOut, onOpen: onSignOut, onOpenChange: onSignOutChange } = useDisclosure();
  const [navigation, setNavigation] = useState<{ name: string; href: string; icon: any }[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    async function fetchUserData() {
      try {
        setIsLoading(true)
        const { data, error } = await getUserProfile()

        if (error) {
          console.error('Error fetching user profile:', error)
          return
        }

        setUserData(data)

        // if user is admin add Inventory to navigation next to dashboard
        if (data?.is_admin) {
          setNavigation([
            { name: 'Dashboard', href: '/home/dashboard', icon: "heroicons:home-solid" },
            { name: 'Inventory', href: '/home/inventory', icon: "fluent:box-20-filled" },
            { name: 'Delivery', href: '/home/delivery', icon: "heroicons:truck-20-solid" },
            { name: 'Warehouses', href: '/home/warehouses', icon: 'material-symbols:warehouse-rounded' },
            { name: 'Notifications', href: '/home/notifications', icon: "heroicons:bell-alert-20-solid" },
            // { name: 'Reports', href: '/home/reports', icon: "heroicons:chart-bar-20-solid" },
            { name: 'Settings', href: '/home/settings', icon: "heroicons:cog-8-tooth-20-solid" },
          ])
        } else {
          setNavigation([
            { name: 'Dashboard', href: '/home/dashboard', icon: "heroicons:home-solid" },
            { name: 'Warehouse Items', href: '/home/warehouse-items', icon: "fluent:box-20-filled" },
            { name: 'Delivery', href: '/home/delivery', icon: "heroicons:truck-20-solid" },
            { name: 'Notifications', href: '/home/notifications', icon: "heroicons:bell-alert-20-solid" },
            // { name: 'Reports', href: '/home/reports', icon: "heroicons:chart-bar-20-solid" },
            { name: 'Settings', href: '/home/settings', icon: "heroicons:cog-8-tooth-20-solid" },
          ])
        }

        // Set image icon directly from the profile_image_url
        if (data?.profile_image_url) {
          setImageIcon(data.profile_image_url)
        }
      } catch (err) {
        console.error('Error fetching user profile:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserData()
  }, [])

  // Handle window resize
  useEffect(() => {
    const checkSize = () => {
      const isMobileView = window.innerWidth < 768;

      // Only change state when crossing the mobile/desktop threshold
      if (isMobileView !== isMobile) {
        setIsMobile(isMobileView);
        setIsOpen(!isMobileView);
      }
    };

    // Initial check
    checkSize();

    // Add event listener
    window.addEventListener('resize', checkSize);

    // Cleanup
    return () => window.removeEventListener('resize', checkSize);
  }, [isMobile]);


  return (
    <>
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        <motion.aside
          initial={{ width: isMobile ? 0 : "21rem", visibility: isMobile ? "hidden" : "visible" }}
          animate={{ width: isOpen ? "21rem" : 0, visibility: isOpen ? "visible" : "hidden" }}
          exit={{ width: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 40 }}
          style={{ visibility: isMobile ? "hidden" : "visible" }}
          className={`fixed bg-background inset-y-0 left-0 z-20 w-64 shadow-2xl shadow-primary/30 border-r border-default-200 md:static md:flex-shrink-0 flex flex-col h-full 2xl:overflow-hidden`}
        >
          <motion.aside
            initial={{ x: isMobile ? "-100%" : 0 }}
            animate={{ x: isOpen ? 0 : "-100%" }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 40 }}
            className={`w-[21rem] flex flex-col h-full`}>
            {/* Logo area - fixed at top */}
            <div className="flex h-[4.5rem] items-center justify-between p-4 border-b border-default-200 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <Image
                  width={40}
                  height={40}
                  src="/icon.png"
                  alt="Web Inventory Logo"
                />
                <div className="text-xl font-bold text-primary-600"><span className="font-serif">RoPIC</span><p className="text-tiny text-default-600">
                  Reorder Point Inventory Control
                </p></div>


              </div>
              <Button
                variant="light"
                className="md:hidden min-w-10 h-10 p-2 focus:outline-none text-default-600"
                onPress={() => setIsOpen(false)}
              >
                <Icon icon="heroicons:x-mark-solid" width={20} className="w-6 h-6" />
              </Button>
            </div>

            {/* Navigation - scrollable and centered */}
            <div className="flex-grow flex flex-col overflow-hidden">
              <ScrollShadow className="flex-1 overflow-y-auto py-4">
                <nav className="px-4 space-y-1 flex flex-col">
                  {isLoading ? (
                    // Skeleton loaders while loading
                    <div className="space-y-2 mt-1 h-full relative">
                      {Array(10).fill(0).map((_, index) => (
                        <Skeleton key={index} className="h-10 rounded-xl w-full" />
                      ))}
                      <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                    </div>
                  ) : (
                    // Actual navigation items
                    navigation.map((item) => {
                      const isActive = pathname === item.href;
                      return (
                        <Button
                          as={Link}
                          key={item.name}
                          href={item.href}
                          color={isActive ? 'primary' : 'default'}
                          variant={isActive ? 'shadow' : 'light'}
                          startContent={
                            <Icon
                              icon={item.icon}
                              width={20}
                              className=" mx-2"
                              aria-hidden="true"
                            />
                          }
                          className="flex items-center justify-start w-full p-2 text-sm my-1 font-medium"
                          aria-current={isActive ? 'page' : undefined}
                          onPress={() => isMobile && setIsOpen(false)} // Close on navigation only on mobile
                        >
                          {item.name}
                        </Button>
                      );
                    })
                  )}
                </nav>
              </ScrollShadow>
            </div>



            {/* User profile section - fixed at bottom */}
            <div className="border-t border-default-200 p-4 flex-shrink-0 ">
              <Dropdown>
                <DropdownTrigger>
                  <Button
                    variant="light"
                    color='primary'
                    endContent={
                      <Icon icon="heroicons:chevron-up-solid" width={16} className="w-4 h-4" />
                    }
                    className='flex w-full h-14 p-2 items-center'>
                    {
                      isLoading ?


                        <div className="max-w-[300px] w-full flex items-center gap-3">
                          <div>
                            <Skeleton className="flex rounded-full w-10 h-10" />
                          </div>
                          <div className="w-full flex flex-col gap-2">
                            <Skeleton className="h-3 w-4/5 rounded-lg" />
                            <Skeleton className="h-3 w-3/5 rounded-lg" />
                          </div>
                        </div> :
                        <User
                          avatarProps={{ src: imageIcon || undefined }}
                          description={userData?.is_admin ? 'Administrator' : 'Operator'}
                          classNames={{
                            base: 'flex items-start gap-4 justify-start w-full',
                            name: 'text-sm font-semibold text-default-600',
                          }}
                          name={userData?.full_name || 'User'}
                        />

                    }

                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label="Navigation"
                  itemClasses={{
                    base: 'text-default-800',
                  }}>
                  <DropdownItem key="logout" as={Link} onPress={onSignOut}>
                    <div className="flex items-center gap-2">
                      <Icon icon="heroicons:arrow-left-on-rectangle-solid" width={16} className="w-4 h-4" />
                      Sign out
                    </div>
                  </DropdownItem>
                  <DropdownItem key="profile" as={Link} href="/home/profile">
                    <div className="flex items-center gap-2">
                      <Icon icon="heroicons:user-solid" width={16} className="w-4 h-4" />
                      View Profile
                    </div>
                  </DropdownItem>
                  <DropdownItem key="company" as={Link} href="/home/company">
                    <div className="flex items-center gap-2">
                      <Icon icon="heroicons:building-office-20-solid" width={16} className="w-4 h-4" />
                      View Company Profile
                    </div>
                  </DropdownItem>

                </DropdownMenu>
              </Dropdown>
            </div>
          </motion.aside>
        </motion.aside>
      </AnimatePresence>

      {/* Overlay for mobile */}
      <AnimatePresence mode="wait">
        {isOpen && isMobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={`md:hidden fixed inset-0 z-10 bg-background/50 ${isOpen && isMobile ? 'firefox:backdrop-blur-md' : ''}`}
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>
      {/* Main content */}
      <div
        className={`flex-1 w-full h-full ${isOpen && isMobile ? 'scale-[0.95] chrome:blur-md' : 'scale-[1] blur-none'} transition-all duration-300 2xl:overflow-hidden 2xl:rounded-tr-lg`}>
        {/* Mobile menu button */}
        <div className="md:hidden fixed top-4 left-4 z-50">
          <Button
            variant="light"
            className='min-w-10 h-10 p-2 focus:outline-none text-default-600'
            onPress={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
          >
            <Icon icon="heroicons:bars-3-solid" width={20} className="w-6 h-6" />
          </Button>
        </div>
        {children}
      </div>

      <Modal
        isOpen={isSignOut}
        placement='auto'
        backdrop='blur'
        classNames={{
          backdrop: "bg-background/50",
          closeButton: 'hidden'
        }}
        onOpenChange={onSignOutChange}
        isDismissable>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-2">Sign out</ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-2">
                  <p className="text-medium">Are you sure you want to sign out?</p>
                  <p className="text-tiny text-default-600">
                    You will be redirected to the sign-in page.
                  </p>
                </div>
              </ModalBody>
              <ModalFooter className="flex justify-end gap-4 p-4">
                <Button
                  color="primary"
                  variant="shadow"
                  onPress={onClose}
                  isDisabled={isSignOutLoading}>
                  Cancel
                </Button>
                <Button
                  color="danger"
                  variant="shadow"
                  isLoading={isSignOutLoading}
                  onPress={async (e) => {
                    setIsSignOutLoading(true)
                    const { error } = await signOut()
                    setIsSignOutLoading(false)
                    if (error) {
                      console.error('Error signing out:', error)
                      return
                    }
                    window.location.href = '/account/signin'
                    onClose()
                  }}>
                  Sign out
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
