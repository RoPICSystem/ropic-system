'use client'

import { useState, useEffect, lazy, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getUserProfile } from '@/utils/supabase/server/user'
import { getUserCompanyDetails } from '@/utils/supabase/server/companies'
import CardList from '@/components/card-list'
import {
  Button,
  Input,
  Skeleton,
  Image,
  Card,
  CardBody,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Spinner,
  Accordion,
  AccordionItem,
  Kbd
} from "@heroui/react"
import {
  ChevronRightIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/solid'
import { herouiColor } from "@/utils/colors"
import { Icon } from '@iconify-icon/react/dist/iconify.mjs'
import { useTheme } from "next-themes"

// Import ShelfSelector3D component with lazy loading
const ShelfSelector3D = lazy(() =>
  import("@/components/shelf-selector-3d-v4").then(mod => ({
    default: mod.ShelfSelector3D
  }))
);

export default function CompanyPage() {
  const router = useRouter()
  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" }

  const [companyData, setCompanyData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  // Add state for 3D preview modal
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(0);
  const [isFloorChangeAnimate, setIsFloorChangeAnimate] = useState(true);
  const [isShelfChangeAnimate, setIsShelfChangeAnimate] = useState(true);
  const [isGroupChangeAnimate, setIsGroupChangeAnimate] = useState(false);
  const { theme } = useTheme();

  // Add custom colors for 3D preview
  const [customColors, setCustomColors] = useState({
    backgroundColor: "#f0f7ff", // Light blue background
    floorColor: "#e0e0e0",      // Light gray floor
    floorHighlightedColor: "#c7dcff", // Highlighted floor
    groupColor: "#aaaaaa",    // Group color
    groupSelectedColor: "#4a80f5", // Selected group
    shelfColor: "#dddddd",      // Default shelf
    shelfHoverColor: "#ffb74d", // Hover orange
    shelfSelectedColor: "#ff5252", // Selected red
    occupiedShelfColor: "#8B0000", // Occupied red
    occupiedHoverShelfColor: "#BB3333", // New occupied hover color - lighter red
    textColor: "#2c3e50",       // Dark blue text
  });

  const updateHeroUITheme = () => {
    setTimeout(() => {
      setCustomColors({
        backgroundColor: herouiColor('primary-50', 'hex') as string,
        floorColor: herouiColor('primary-200', 'hex') as string,
        floorHighlightedColor: herouiColor('primary-300', 'hex') as string,
        groupColor: herouiColor('default', 'hex') as string,
        groupSelectedColor: herouiColor('primary', 'hex') as string,
        shelfColor: herouiColor('default-600', 'hex') as string,
        shelfHoverColor: herouiColor('primary-400', 'hex') as string,
        shelfSelectedColor: herouiColor('primary', 'hex') as string,
        occupiedShelfColor: herouiColor('danger', 'hex') as string,
        occupiedHoverShelfColor: herouiColor('danger-400', 'hex') as string,
        textColor: herouiColor('text', 'hex') as string,
      });
    }, 100);
  };

  // Load company data on initial render
  useEffect(() => {
    async function fetchCompanyData() {
      try {
        setIsLoading(true)
        // Get current user's company details
        const { data, error } = await getUserProfile()
        const { data: companyData, error: companyError } = await getUserCompanyDetails(data?.uuid)

        if (error) {
          setError(`${error}`)
          return
        }
        if (companyError) {
          setError(`${companyError}`)
          return
        }

        setIsAdmin(data?.is_admin)
        setCompanyData(companyData)

        if (companyData?.logo_url && !companyData?.logo_url.error) {
          setImagePreview(companyData.logo_url)
        }
      } catch (err: any) {
        console.error('Error fetching company profile:', err)
        setError(err.message || 'An unexpected error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchCompanyData()
  }, [])

  // Update colors when theme changes
  useEffect(() => {
    updateHeroUITheme();
  }, [theme])

  useEffect(() => {
    updateHeroUITheme();
  }, []);

  // Convert the floor plan data to the format ShelfSelector3D expects
  const getFloorConfigs = () => {
    if (!companyData?.company_layout || !Array.isArray(companyData.company_layout)) {
      return [];
    }

    // Check if we have the new format with height property
    if (companyData.company_layout.length > 0 && 
        'height' in companyData.company_layout[0] &&
        'matrix' in companyData.company_layout[0]) {
      return companyData.company_layout;
    }

    // Legacy format - convert to new format
    return companyData.company_layout.map((floor: number[][]) => ({
      height: 5, // Default max height
      matrix: floor
    }));
  };

  // Helper function to render a preview of the warehouse layout
  const renderLayoutPreview = () => {
    if (!companyData?.company_layout || !Array.isArray(companyData.company_layout) || companyData.company_layout.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-4 text-default-500">
          <BuildingOfficeIcon className="h-8 w-8 mb-2" />
          <p className="text-center">No warehouse layout configured</p>
        </div>
      )
    }

    // Create a simplified visual representation of the layout
    return (
      <div>
        <div className="grid grid-cols-1 gap-4">
          {getFloorConfigs().map((floor: any, floorIndex: number) => {
            if (!floor?.matrix || !Array.isArray(floor.matrix)) {
              return (
                <Card key={floorIndex} className="p-2">
                  <CardBody>
                    <h4 className="text-sm font-medium mb-2 text-center">
                      Floor {floorIndex + 1}
                    </h4>
                    <p className="text-center text-default-500">Invalid floor data</p>
                  </CardBody>
                </Card>
              );
            }

            return (
              <Card key={floorIndex} className="p-2">
                <CardBody>
                  <h4 className="text-sm font-medium mb-4 text-center">
                    Floor {floorIndex + 1}
                  </h4>
                  <div className={`flex flex-col items-center justify-center overflow-auto`}>
                    {floor.matrix.map((row: any[], rowIndex: number) => (
                      <div key={`${floorIndex}-${rowIndex}`} className="flex">
                        {row.map((cell: number, cellIndex: number) => (
                          <div
                            key={`${floorIndex}-${rowIndex}-${cellIndex}`}
                            className={`w-3 h-3 m-[1px] ${cell > 0 ? 'bg-primary-500' : 'bg-default-200'}`}
                            title={`Floor ${floorIndex + 1}, Row ${rowIndex + 1}, Column ${cellIndex + 1}: ${cell > 0 ? `${cell} shelves` : 'No container'}`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl p-2">
        <div className='space-y-4'>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Company Profile</h1>
              <p className="text-default-500">Loading company information...</p>
            </div>
          </div>

          {/* Basic Information Skeleton */}
          <CardList>
            <div>
              <Skeleton className="h-6 w-48 mx-auto rounded-xl mb-4" />
              <div className="flex flex-col items-center justify-center pb-4">
                <Skeleton className="flex rounded-xl w-48 h-48 m-1" /> {/* Company Logo */}
              </div>
              <div className="space-y-4 mt-3">
                <Skeleton className="h-14 rounded-xl" /> {/* Company Name */}
                <Skeleton className="h-14 rounded-xl" /> {/* Company Description */}
              </div>
            </div>
          </CardList>

          {/* Address Information Skeleton */}
          <CardList>
            <div>
              <Skeleton className="h-6 w-52 mx-auto rounded-xl mb-6" />
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton className="h-14 rounded-xl" /> {/* Country */}
                  <Skeleton className="h-14 rounded-xl" /> {/* Region */}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton className="h-14 rounded-xl" /> {/* Province */}
                  <Skeleton className="h-14 rounded-xl" /> {/* Municipality/City */}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Skeleton className="h-14 rounded-xl" /> {/* Barangay */}
                  <Skeleton className="h-14 rounded-xl" /> {/* Street Address */}
                </div>
                <div className="flex sm:flex-row flex-col gap-4">
                  <Skeleton className="h-14 sm:w-[10rem] w-full rounded-xl" /> {/* Postal Code */}
                  <Skeleton className="h-14 w-full rounded-xl" /> {/* Full Address */}
                </div>
              </div>
            </div>
          </CardList>

          {/* Warehouse Layout Skeleton */}
          <CardList>
            <div>
              <Skeleton className="h-6 w-52 mx-auto rounded-xl mb-6" /> {/* Warehouse Layout title */}
              <Skeleton className="h-40 rounded-xl" /> {/* Warehouse Layout preview */}
            </div>
          </CardList>

          {/* Action Items Skeleton */}
          {isAdmin && (
            <CardList>
              <div className="flex items-center justify-between h-full w-full">
                <Skeleton className="h-5 w-[60%] rounded-xl" /> {/* Manage company users */}
                <Skeleton className="h-10 w-10 rounded-xl" /> {/* Button */}
              </div>
            </CardList>
          )}

        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl p-2">
      <div className="space-y-4 items-center w-full">
        <div className="space-y-4 w-full">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Company Profile</h1>
              <p className="text-default-500">Listed below is your company information.</p>
            </div>
          </div>

          {/* Basic Company Information */}
          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Basic Information</h2>
              <div className="space-y-4">
                <div className="relative w-full flex items-center justify-center pb-4">
                  {imagePreview ? (
                    <Image
                      isBlurred
                      src={imagePreview}
                      alt="Company logo"
                      className="w-48 h-48 object-cover bg-default-200"
                    />
                  ) : (
                    <div className="w-48 h-48 bg-default-300/70 rounded-xl flex items-center justify-center">
                      <BuildingOfficeIcon className="h-16 w-16 text-default-500" />
                    </div>
                  )}
                </div>

                <Input
                  label="Company Name"
                  type="text"
                  classNames={inputStyle}
                  value={companyData?.name || ''}
                  isReadOnly
                />

                <Input
                  label="Company Description"
                  type="text"
                  classNames={inputStyle}
                  value={companyData?.description || ''}
                  isReadOnly
                />
              </div>
            </div>
          </CardList>

          {/* Address Information */}
          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Company Address</h2>
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Country"
                    type="text"
                    classNames={inputStyle}
                    value="PHILIPPINES"
                    isReadOnly
                  />
                  <Input
                    label="Region"
                    type="text"
                    classNames={inputStyle}
                    value={companyData?.address?.region?.desc || ''}
                    isReadOnly
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Province"
                    type="text"
                    classNames={inputStyle}
                    value={companyData?.address?.province?.desc || ''}
                    isReadOnly
                  />
                  <Input
                    label="Municipality/City"
                    type="text"
                    classNames={inputStyle}
                    value={companyData?.address?.municipality?.desc || ''}
                    isReadOnly
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Barangay"
                    type="text"
                    classNames={inputStyle}
                    value={companyData?.address?.barangay?.desc || ''}
                    isReadOnly
                  />
                  <Input
                    label="Street Address"
                    type="text"
                    classNames={inputStyle}
                    value={companyData?.address?.streetAddress || ''}
                    isReadOnly
                  />
                </div>

                <div className="flex sm:flex-row flex-col gap-4">
                  <Input
                    label="Postal Code"
                    type="text"
                    classNames={inputStyle}
                    className="md:w-[10rem]"
                    value={companyData?.address?.postalCode || ''}
                    isReadOnly
                  />
                  <Input
                    label="Full Address"
                    type="text"
                    classNames={inputStyle}
                    value={companyData?.address?.fullAddress || ''}
                    isReadOnly
                  />
                </div>
              </div>
            </div>
          </CardList>

          {/* Warehouse Layout Section */}
          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Warehouse Layout</h2>
              {renderLayoutPreview()}
              
              {/* Add 3D Preview button if layout exists */}
              {companyData?.company_layout && Array.isArray(companyData.company_layout) && companyData.company_layout.length > 0 && (
                <div className="flex justify-end mt-4">
                  <Button
                    color="secondary"
                    variant="flat"
                    onPress={onOpen}
                    startContent={<Icon icon="mdi:eye" className="w-4 h-4" />}
                  >
                    View 3D Floorplan
                  </Button>
                </div>
              )}
            </div>
          </CardList>

          {/* Actions */}
          {isAdmin && (
            <CardList>
              <div className="flex items-center justify-between h-full w-full">
                <span>Edit company information</span>
                <Button
                  variant="shadow"
                  color="primary"
                  onPress={() => router.push('/home/company/edit')}
                  className="my-1">
                  <ChevronRightIcon className="w-4 h-4" />
                </Button>
              </div>
            </CardList>
          )}
        </div>
      </div>

      {/* Add the modal for 3D preview */}
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        placement='auto'
        classNames={{
          backdrop: "bg-background/50",
          wrapper: 'overflow-hidden',
        }}
        backdrop="blur"
        size="5xl">
        <ModalContent>
          <ModalHeader>Warehouse Floorplan</ModalHeader>
          <ModalBody className='p-0'>
            <div className="h-[80vh] bg-primary-50 rounded-md overflow-hidden relative">
              <Suspense fallback={
                <div className="flex items-center justify-center h-full">
                  <Spinner size="lg" color="primary" />
                  <span className="ml-2">Loading 3D preview...</span>
                </div>
              }>
                <ShelfSelector3D
                  floors={getFloorConfigs()}
                  className="w-full h-full"
                  highlightedFloor={highlightedFloor}
                  onHighlightFloor={setHighlightedFloor}
                  onSelect={() => { }}
                  isFloorChangeAnimate={isFloorChangeAnimate}
                  isShelfChangeAnimate={isShelfChangeAnimate}
                  isGroupChangeAnimate={isGroupChangeAnimate}
                  backgroundColor={customColors.backgroundColor}
                  floorColor={customColors.floorColor}
                  floorHighlightedColor={customColors.floorHighlightedColor}
                  groupColor={customColors.groupColor}
                  groupSelectedColor={customColors.groupSelectedColor}
                  shelfColor={customColors.shelfColor}
                  shelfHoverColor={customColors.shelfHoverColor}
                  shelfSelectedColor={customColors.shelfSelectedColor}
                  occupiedShelfColor={customColors.occupiedShelfColor}
                  occupiedHoverShelfColor={customColors.occupiedHoverShelfColor}
                  textColor={customColors.textColor}
                  cameraOffsetY={-0.25}
                />
              </Suspense>
            </div>
          </ModalBody>
          <ModalFooter className="flex gap-4 p-4 justify-between">
            <Popover showArrow offset={10} placement="bottom-end">
              <PopoverTrigger>
                <Button className="capitalize" color="warning" variant="flat">
                  <Icon
                    icon="heroicons:question-mark-circle-solid"
                    className="w-4 h-4 mr-1"
                  />
                  Help
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-4 max-w-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Icon icon="heroicons:lifebuoy" className="w-5 h-5 text-warning-500" width={20} />
                  <h3 className="font-semibold text-lg">3D Navigation Controls</h3>
                </div>

                <Accordion variant="splitted">
                  <AccordionItem key="mouse" aria-label="Mouse Controls" title="Mouse Controls" className="text-sm overflow-hidden bg-primary-50">
                    <div className="space-y-2 pb-2">
                      <div className="flex items-start gap-2">
                        <Icon icon="heroicons:cursor-arrow-ripple" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                        <p><strong>Left Click</strong>: Select a shelf</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Icon icon="heroicons:hand-raised" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                        <p><strong>Click + Drag</strong>: Rotate camera around scene</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Icon icon="heroicons:cursor-arrow-rays" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                        <p><strong>Right Click + Drag</strong>: Pan camera</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Icon icon="heroicons:view-columns" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                        <p><strong>Mouse Wheel</strong>: Zoom in/out</p>
                      </div>
                    </div>
                  </AccordionItem>

                  <AccordionItem key="keyboard" aria-label="Keyboard Controls" title="Keyboard Controls" className="text-sm overflow-hidden bg-primary-50">
                    <div className="space-y-2 pb-2">
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300">W</Kbd>
                        <p className="my-auto">Move camera forward</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300">S</Kbd>
                        <p className="my-auto">Move camera backward</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300">A</Kbd>
                        <p className="my-auto">Move camera left</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300">D</Kbd>
                        <p className="my-auto">Move camera right</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['shift']}>W</Kbd>
                        <p className="my-auto">Move camera up</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['shift']}>S</Kbd>
                        <p className="my-auto">Move camera down</p>
                      </div>
                    </div>
                  </AccordionItem>

                  <AccordionItem key="shelf-navigation" aria-label="Shelf Navigation" title="Shelf Navigation" className="text-sm overflow-hidden bg-primary-50">
                    <div className="space-y-2 pb-2">
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['left']}></Kbd>
                        <p>Move to previous shelf or group</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['right']}></Kbd>
                        <p>Move to next shelf or group</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['up']}></Kbd>
                        <p>Move to shelf above</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Kbd className="border border-default-300" keys={['down']}></Kbd>
                        <p>Move to shelf below</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex">
                          <Kbd className="border border-default-300" keys={['shift']}></Kbd>
                          <span className="mx-1">+</span>
                          <Kbd className="border border-default-300" keys={['up', 'down', 'left', 'right']}></Kbd>
                        </div>
                        <p>Navigate between shelf groups</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="flex">
                          <Kbd className="border border-default-300" keys={['ctrl']}></Kbd>
                          <span className="mx-1">+</span>
                          <Kbd className="border border-default-300" keys={['up', 'down']}></Kbd>
                        </div>
                        <p>Navigate shelf depth (front/back)</p>
                      </div>
                    </div>
                  </AccordionItem>
                </Accordion>

                <div className="mt-4 border-t pt-3 border-default-200 w-full px-4">
                  <h4 className="font-medium mb-2">Color Legend:</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.floorColor }}></div>
                      <span className="text-xs">Floor</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.floorHighlightedColor }}></div>
                      <span className="text-xs">Selected Floor</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.groupColor }}></div>
                      <span className="text-xs">Group</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.groupSelectedColor }}></div>
                      <span className="text-xs">Selected Group</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.shelfColor }}></div>
                      <span className="text-xs">Shelf</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.shelfHoverColor }}></div>
                      <span className="text-xs">Hovered Shelf</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-default-500">
                  Tip: Use WASD and arrow keys for easiest navigation through the warehouse.
                </div>
              </PopoverContent>
            </Popover>
            <Button color="primary" variant="shadow" onPress={onClose}>
              Close Preview
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}