'use client';

import CardList from '@/components/card-list';
import { FloorConfig } from '@/components/shelf-selector-3d';
import { motionTransition } from '@/utils/anim';
import {
  Barangay,
  CityMunicipality,
  getAddressDropdownData,
  Province,
  Region
} from '@/utils/supabase/server/address';
import {
  Autocomplete, AutocompleteItem,
  Button,
  Card, CardBody,
  Chip,
  Form,
  Input, Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  Skeleton,
  Spinner,
  Textarea,
  useDisclosure
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createWarehouse, deleteWarehouse, getWarehouseByUuid, getWarehouseLayout, getWarehouses, updateWarehouse, Warehouse } from './actions';

import WarehouseLayoutEditorModal from './layout-editor-modal';
import LoadingAnimation from '@/components/loading-animation';
import ListLoadingAnimation from '@/components/list-loading-animation';
import { getUserFromCookies } from '@/utils/supabase/server/user';

function generateFullAddress(
  street: string,
  barangay: string,
  cityMun: string,
  province: string,
  region: string,
  country: string,
  postalCode: string
): string {
  const parts = [
    street,
    barangay,
    cityMun,
    province,
    region,
    country,
    postalCode
  ].filter(Boolean);

  return parts.join(', ');
}

// Helper function to compare values
const compare = (a: any, b: any) => {
  return `${a}` === `${b}`;
};

export default function WarehousePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const deleteModal = useDisclosure();

  // Warehouse list state
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseToDelete, setWarehouseToDelete] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);

  // Separate state for the selected warehouse details
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [isAddressLoading, setIsAddressLoading] = useState<boolean>(true); // Separate loading state for address
  const [currentWarehouse, setCurrentWarehouse] = useState<Partial<Warehouse> | null>(null);

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(15);
  const [totalWarehouses, setTotalWarehouses] = useState<number>(0);

  // Address state
  const [regions, setRegions] = useState<Region[]>([]);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [cityMunicipalities, setCityMunicipalities] = useState<CityMunicipality[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);

  // Selected values state
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedProvince, setSelectedProvince] = useState<string>('');
  const [selectedCityMunicipality, setSelectedCityMunicipality] = useState<string>('');
  const [selectedBarangay, setSelectedBarangay] = useState<string>('');
  const [inputStreetAddress, setInputStreetAddress] = useState<string>('');
  const [inputPostalCode, setInputPostalCode] = useState<string>('');
  const [fullAddress, setFullAddress] = useState<string>('');
  const [manualFullAddress, setManualFullAddress] = useState<string>('');

  // Warehouse layout state
  const [warehouseLayout, setWarehouseLayout] = useState<FloorConfig[]>([]);
  const [layoutRows, setLayoutRows] = useState<number>(10);
  const [layoutColumns, setLayoutColumns] = useState<number>(10);

  // Layout editor state
  const [isLayoutEditorOpen, setIsLayoutEditorOpen] = useState(false);

  // Warehouse Layout Editor Modal Tab
  const [selectedTab, setSelectedTab] = useState<'editor' | 'preview'>('editor');
  const [user, setUser] = useState<any>(null);

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200"
  };

  const autoCompleteStyle = { classNames: inputStyle };

  // Optimized function to load address data efficiently
  const loadAddressData = async (options?: {
    regCode?: string
    provCode?: string
    citymunCode?: string
  }) => {
    try {
      const addressData = await getAddressDropdownData(options)

      setRegions(addressData.regions)

      if (options?.regCode) {
        setProvinces(addressData.provinces)
      }

      if (options?.provCode) {
        setCityMunicipalities(addressData.cities)
      }

      if (options?.citymunCode) {
        setBarangays(addressData.barangays)
      }

      return addressData
    } catch (error) {
      console.error('Error loading address data:', error)
      return { regions: [], provinces: [], cities: [], barangays: [] }
    }
  }

  // Watch for URL search params to select warehouse
  useEffect(() => {
    setIsAddressLoading(true);
    setDetailLoading(true);
    const warehouseId = searchParams.get("warehouseId");

    if (!warehouseId) {
      const resetDetails = async () => {
        await setSelectedWarehouseId(null);
        await setWarehouseLayout([]);
        await setCurrentWarehouse({});
        await resetAddressFields();

        setIsAddressLoading(false);
        setDetailLoading(false);
      }
      resetDetails();
      return;
    }


    if (warehouseId !== selectedWarehouseId) {
      setSelectedWarehouseId(warehouseId);
      fetchWarehouseAddress(warehouseId);
      fetchWarehouseLayout(warehouseId);
    }

  }, [searchParams]);

  useEffect(() => {
    const fetchWarehousesAsync = async () => {
      setListLoading(true);
      const userData = await getUserFromCookies();
      if (userData === null) {
        setUser(null);
        return
      } else
        setUser(userData);

      await fetchWarehouses(userData.company_uuid);
      setListLoading(false);
    }
    fetchWarehousesAsync();
  }, []);

  const fetchWarehouseAddress = async (warehouseId: string) => {
    const { data, success } = await getWarehouseByUuid(warehouseId);

    if (success && data) {
      setCurrentWarehouse(data);
      await initializeAddressFields(data);
    }

    setIsAddressLoading(false);
  }

  // Fetch warehouse layout
  const fetchWarehouseLayout = async (warehouseId: string) => {
    if (!warehouseId) return;

    const { success, data, error } = await getWarehouseLayout(warehouseId);

    if (success && data) {
      setWarehouseLayout(data);
      // Set rows/columns based on the loaded data
      if (data[0]?.matrix?.length > 0) {
        setLayoutRows(data[0].matrix.length);
        setLayoutColumns(data[0].matrix[0].length);
      }
    } else {
      console.error("Error loading warehouse layout:", error);
      // Initialize with default layout if none exists
      setWarehouseLayout([{
        height: 5,
        matrix: Array(layoutRows).fill(0).map(() => Array(layoutColumns).fill(0))
      }]);
    }
    setDetailLoading(false);
  };

  // Fetch warehouses with pagination
  const fetchWarehouses = async (companyUuid: string) => {
    if (!companyUuid) return;

    try {
      // Calculate offset based on current page and rows per page
      const offset = (page - 1) * rowsPerPage;

      const result = await getWarehouses(
        companyUuid,
        search,
        null, // year
        null, // month
        null, // week
        null, // day
        rowsPerPage,
        offset
      );

      if (result.success) {
        setWarehouses(result.data);
        setTotalWarehouses(result.totalCount);
        setTotalPages(result.totalPages || 1);
      }
    } catch (error) {
      console.error("Error fetching warehouses:", error);
    }
  };

  // Effect to fetch warehouses when dependencies change
  useEffect(() => {
    const fetchWarehousesAsync = async () => {
      if (!user?.company_uuid) return;
      setListLoading(true);
      await fetchWarehouses(user?.company_uuid || '');
      setListLoading(false);
    }
    fetchWarehousesAsync();
  }, [page, rowsPerPage, search, user]);

  // Update the full address when components change
  useEffect(() => {
    if (!regions.length) return

    const regionName = regions.find(r => compare(r.regCode, selectedRegion))?.regDesc || '';
    const provinceName = provinces.find(p => compare(p.provCode, selectedProvince))?.provDesc || '';
    const cityMunName = cityMunicipalities.find(c => compare(c.citymunCode, selectedCityMunicipality))?.citymunDesc || '';
    const barangayName = barangays.find(b => compare(b.brgyCode, selectedBarangay))?.brgyDesc || '';

    const generatedAddress = generateFullAddress(
      inputStreetAddress,
      barangayName,
      cityMunName,
      provinceName,
      regionName,
      'PHILIPPINES',
      inputPostalCode
    );

    setFullAddress(generatedAddress);

    // Update manual full address if it was empty or if we now have a complete address
    if (!manualFullAddress || generatedAddress.includes(barangayName) && generatedAddress.includes(cityMunName)) {
      setManualFullAddress(generatedAddress);
    }
  }, [selectedRegion, selectedProvince, selectedCityMunicipality, selectedBarangay, inputStreetAddress, inputPostalCode, regions, provinces, cityMunicipalities, barangays]);

  const resetAddressFields = () => {
    setSelectedRegion('');
    setSelectedProvince('');
    setSelectedCityMunicipality('');
    setSelectedBarangay('');
    setInputStreetAddress('');
    setInputPostalCode('');
    setProvinces([]);
    setCityMunicipalities([]);
    setBarangays([]);
    setFullAddress('');
    setManualFullAddress('');
  };

  const initializeAddressFields = async (warehouse: Warehouse) => {
    if (!warehouse?.address) return;

    const address = warehouse.address;

    // Set street and postal code
    setInputStreetAddress(address.street || '');
    setInputPostalCode(address.postalCode || '');

    // Load address data based on warehouse data efficiently
    const regCode = address.region?.code
    const provCode = address.province?.code
    const citymunCode = address.municipality?.code

    let addressData;
    if (regCode && provCode && citymunCode) {
      // Load all levels at once
      addressData = await loadAddressData({ regCode, provCode, citymunCode })
    } else if (regCode && provCode) {
      // Load up to cities
      addressData = await loadAddressData({ regCode, provCode })
    } else if (regCode) {
      // Load up to provinces
      addressData = await loadAddressData({ regCode })
    } else {
      // Load only regions
      addressData = await loadAddressData()
    }

    // Set selected values after data is loaded
    if (address.region?.code) {
      setSelectedRegion(address.region.code);
    }
    if (address.province?.code) {
      setSelectedProvince(address.province.code);
    }
    if (address.municipality?.code) {
      setSelectedCityMunicipality(address.municipality.code);
    }
    if (address.barangay?.code) {
      setSelectedBarangay(address.barangay.code);
    }
  };

  const handleAddWarehouse = () => {
    // Clear the URL parameter
    const params = new URLSearchParams(searchParams.toString());
    params.delete("warehouseId");
    router.push(`?`, { scroll: false });
  };

  const handleSelectWarehouse = async (warehouseId: string) => {
    // Update the URL with the selected warehouse ID
    const params = new URLSearchParams(searchParams.toString());
    params.set("warehouseId", warehouseId);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Handle region selection change
  const handleRegionChange = (value: string) => {
    setSelectedRegion(value);
    setSelectedProvince('');
    setSelectedCityMunicipality('');
    setSelectedBarangay('');

    // Load provinces for the selected region
    loadAddressData({ regCode: value })
  };

  // Handle province selection change
  const handleProvinceChange = (value: string) => {
    setSelectedProvince(value);
    setSelectedCityMunicipality('');
    setSelectedBarangay('');

    // Load cities for the selected province
    loadAddressData({ provCode: value })
  };

  // Handle city/municipality selection change
  const handleCityMunicipalityChange = (value: string) => {
    setSelectedCityMunicipality(value);
    setSelectedBarangay('');

    // Load barangays for the selected city/municipality
    loadAddressData({ citymunCode: value })
  };

  const handleDeleteWarehouseClick = () => {
    if (!selectedWarehouseId) return;
    setWarehouseToDelete(selectedWarehouseId);
    deleteModal.onOpen();
  };

  const handleDeleteWarehouse = async () => {
    if (!warehouseToDelete) return;

    setIsSubmitting(true);
    const { success } = await deleteWarehouse(warehouseToDelete);
    setIsSubmitting(false);

    if (success) {
      deleteModal.onClose();
      setWarehouseToDelete(null);

      // Refresh warehouse list
      fetchWarehouses(user?.company_uuid || '');

      setTimeout(() => {
        // Redirect to blank form after deletion
        const params = new URLSearchParams(searchParams.toString());
        params.delete("warehouseId");
        router.push(`?${params.toString()}`, { scroll: false });
      }, 500);
    }
  };

  const handleSubmitWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentWarehouse?.name || !manualFullAddress) return;

    setIsSubmitting(true);

    const regionName = regions.find(r => compare(r.regCode, selectedRegion))?.regDesc || '';
    const provinceName = provinces.find(p => compare(p.provCode, selectedProvince))?.provDesc || '';
    const cityMunName = cityMunicipalities.find(c => compare(c.citymunCode, selectedCityMunicipality))?.citymunDesc || '';
    const barangayName = barangays.find(b => compare(b.brgyCode, selectedBarangay))?.brgyDesc || '';

    const warehouseData = {
      uuid: currentWarehouse.uuid!,
      company_uuid: currentWarehouse.company_uuid!,
      name: currentWarehouse.name,
      address: {
        country: { code: "PH", desc: "PHILIPPINES" },
        region: { code: selectedRegion, desc: regionName },
        province: { code: selectedProvince, desc: provinceName },
        municipality: { code: selectedCityMunicipality, desc: cityMunName },
        barangay: { code: selectedBarangay, desc: barangayName },
        street: inputStreetAddress,
        postalCode: inputPostalCode,
        fullAddress: manualFullAddress // Use manual full address instead
      }
    };

    let result;
    if (currentWarehouse.uuid) {
      result = await updateWarehouse(warehouseData);
    } else {
      result = await createWarehouse(warehouseData);
    }

    setIsSubmitting(false);

    if (!result.error) {
      // Refresh warehouse list
      fetchWarehouses(user?.company_uuid || '');

      // If creating a new warehouse, update the URL with the new ID
      if (!currentWarehouse.uuid && result.data[0]?.uuid) {
        const newWarehouseId = result.data[0].uuid;
        const params = new URLSearchParams(searchParams.toString());
        params.set("warehouseId", newWarehouseId);
        router.push(`?${params.toString()}`, { scroll: false });
      }
    }
  };

  // Handle page change
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    // The useEffect will trigger fetchWarehouses with the new page
  };

  // Handle search with pagination reset
  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1); // Reset to first page when searching
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const renderLayoutPreview = () => {
    if (!warehouseLayout || !Array.isArray(warehouseLayout) || warehouseLayout.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-4 text-default-500">
          <Icon icon="material-symbols:warehouse-rounded" className="text-3xl mb-2" />
          <p className="text-center">No warehouse layout configured</p>
        </div>
      )
    }

    // Create a simplified visual representation of the layout
    return (
      <div>
        <div className="grid grid-cols-1 gap-4">
          {warehouseLayout.map((floor: FloorConfig, floorIndex: number) => {
            if (!floor?.matrix || !Array.isArray(floor.matrix)) {
              return (
                <Card key={floorIndex} className="p-2">
                  <CardBody>
                    <h4 className="text-sm font-medium mb-2 text-center">
                      Floor {floorIndex + 1} (Invalid Format)
                    </h4>
                  </CardBody>
                </Card>
              );
            }

            return (
              <Card key={floorIndex} className="p-2">
                <CardBody>
                  <h4 className="text-sm font-medium mb-2 text-center">
                    Floor {floorIndex + 1} ({floor.matrix.length} × {floor.matrix[0].length})
                  </h4>

                  <div className="grid gap-0.5" style={{
                    gridTemplateColumns: `repeat(${floor.matrix[0].length}, 1fr)`
                  }}>
                    {floor.matrix.map((row, rowIndex) => (
                      row.map((cell, cellIndex) => (
                        <div
                          key={`${rowIndex}-${cellIndex}`}
                          className={`aspect-square rounded-sm ${cell > 0 ? 'bg-primary-500' : 'bg-default-200'
                            }`}
                          style={{ minWidth: '8px', minHeight: '8px' }}
                          title={`Floor ${floorIndex + 1}, Row ${rowIndex + 1}, Column ${cellIndex + 1}: ${cell > 0 ? `${cell} shelves` : 'No container'}`}
                        />
                      ))
                    ))}
                  </div>

                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  const openLayoutEditor = (warehouseId: string, mode: 'editor' | 'preview') => {
    setSelectedTab(mode);
    setSelectedWarehouseId(warehouseId);
    fetchWarehouseLayout(warehouseId).then(() => {
      setIsLayoutEditorOpen(true);
    });
  };

  const handleLayoutSaved = (newLayout: FloorConfig[]) => {
    setWarehouseLayout(newLayout);
    // You might want to refresh warehouse data here
  };

  return (
    <div className="container mx-auto p-2 max-w-4xl">
      <div className="flex justify-between items-center mb-6 flex-col xl:flex-row w-full">
        <div className="flex flex-col w-full xl:text-left text-center">
          <h1 className="text-2xl font-bold">Warehouse Management</h1>
          {(isAddressLoading || detailLoading || listLoading) ? (
            <div className="text-default-500 flex items-center justify-center xl:justify-start">
              <p className='my-auto mr-1'>Loading warehouses data</p>
              <Spinner className="inline-block scale-75 translate-y-[0.125rem]" size="sm" variant="dots" color="default" />
            </div>
          ) : (
            <p className="text-default-500">Manage your warehouses efficiently.</p>
          )}
        </div>
        <div className="flex gap-4">
          <div className="mt-4 text-center">
            <Button
              color="primary"
              variant="shadow"
              onPress={handleAddWarehouse}
              startContent={<Icon icon="mdi:plus" width={20} height={20} />}
              isDisabled={isAddressLoading || detailLoading || listLoading}>
              New Warehouse
            </Button>
          </div>
        </div>
      </div>


      <div className="flex flex-col xl:flex-row gap-4">
        {/* Left side: Warehouse List */}
        <div className={`xl:w-1/3 shadow-xl shadow-primary/10 
          xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
          xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
          border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
        >
          <div className="flex flex-col h-full">
            <div className="p-4 sticky top-0 z-20 bg-background/80 border-b border-default-200 backdrop-blur-lg shadow-sm">
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Warehouses</h2>
              <Input
                placeholder="Search warehouses..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                isClearable
                onClear={() => handleSearch("")}
                startContent={<Icon icon="mdi:magnify" className="text-default-500" />}
              />

            </div>
            <div className="h-full absolute w-full">
              <div className={`space-y-4 p-4 mt-1 pt-32 h-full relative ${!listLoading && "overflow-y-auto"}`}>
                <ListLoadingAnimation
                  condition={listLoading}
                  containerClassName="space-y-4"
                  skeleton={[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="w-full min-h-28 rounded-xl" />
                  ))}
                >
                  {warehouses.map((warehouse) => (
                    <Button
                      key={warehouse.uuid}
                      onPress={() => { if (warehouse.uuid) handleSelectWarehouse(warehouse.uuid) }}
                      variant="shadow"
                      className={`w-full min-h-28 !transition-all duration-200 rounded-xl px-0 py-4 ${selectedWarehouseId === warehouse.uuid ?
                        '!bg-primary hover:!bg-primary-400 !shadow-lg hover:!shadow-md hover:!shadow-primary-200 !shadow-primary-200' :
                        '!bg-default-100/50 shadow-none hover:!bg-default-200 !shadow-2xs hover:!shadow-md hover:!shadow-default-200 !shadow-default-200'}`}
                    >
                      <div className="w-full flex justify-between items-start px-0">
                        <div className="flex-1">
                          <div className="flex items-center justify-between px-4">
                            <span className="font-semibold">{warehouse.name}</span>
                          </div>
                          {warehouse.address?.fullAddress && (
                            <div className={`text-sm mx-4 ${selectedWarehouseId === warehouse.uuid ? 'text-default-800 ' : 'text-default-600'} line-clamp-2 text-start overflow-hidden`}>
                              {(() => {
                                const cleanText = (text: string) => text.replace(/\s*\([^)]*\)/g, '');
                                const addressText = `${cleanText(warehouse.address.municipality.desc)}, ${cleanText(warehouse.address.barangay.desc)}, ${cleanText(warehouse.address.street)}`;
                                return addressText.length > 40 ? `${addressText.substring(0, 37)}...` : addressText;
                              })()}
                            </div>
                          )}
                          <div className={`flex items-center gap-2 mt-3 border-t ${selectedWarehouseId === warehouse.uuid ? 'border-primary-300' : 'border-default-100'
                            } px-4 pt-4`}>
                            {(warehouse.warehouse_layout && warehouse.warehouse_layout.length > 0) ? (
                              <>
                                <Chip color="secondary" variant={selectedWarehouseId === warehouse.uuid ? "shadow" : "flat"} size="sm">
                                  <div className="flex items-center">
                                    <Icon icon="material-symbols:warehouse-rounded" className="mr-1" />
                                    {warehouse.warehouse_layout?.length ?? 0} floor{(warehouse.warehouse_layout?.length ?? 0) > 1 ? 's' : ''}
                                  </div>
                                </Chip>
                                <Chip color="warning" variant={selectedWarehouseId === warehouse.uuid ? "shadow" : "flat"} size="sm">
                                  <div className="flex items-center">
                                    <Icon icon="tabler:layout-2-filled" className="mr-1" />
                                    {warehouse.warehouse_layout?.[0]?.matrix.length ?? 0} × {warehouse.warehouse_layout?.[0]?.matrix[0].length ?? 0}
                                  </div>
                                </Chip>
                              </>
                            ) : (
                              <Chip color="danger" variant={selectedWarehouseId === warehouse.uuid ? "shadow" : "flat"} size="sm">
                                <div className="flex items-center">
                                  <Icon icon="material-symbols:warehouse-rounded" className="mr-1" />
                                  No layout
                                </div>
                              </Chip>
                            )}
                          </div>
                        </div>
                      </div>
                    </Button>
                  ))}
                </ListLoadingAnimation>
                <AnimatePresence>
                  {listLoading && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0, filter: "blur(8px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(8px)" }}
                      transition={{ duration: 0.3, delay: 0.3 }}
                    >
                      <div className="absolute bottom-0 left-0 right-0 h-full bg-gradient-to-t from-background to-transparent pointer-events-none" />
                      <div className="py-4 flex absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                        <Spinner />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>


                {/* Add pagination */}
                {warehouses.length > 0 && (
                  <div className="flex flex-col items-center pt-2 pb-4 px-2">
                    <div className="text-sm text-default-500 mb-2">
                      Showing {(page - 1) * rowsPerPage + 1} to {Math.min(page * rowsPerPage, totalWarehouses)} of {totalWarehouses} {totalWarehouses === 1 ? 'warehouse' : 'warehousess'}
                    </div>
                    <Pagination
                      total={totalPages}
                      initialPage={1}
                      page={page}
                      onChange={handlePageChange}
                      color="primary" 
                      size="sm"
                      showControls
                    />
                  </div>
                )}

              <AnimatePresence>
                {!listLoading && warehouses.length === 0 && (
                  <motion.div
                    className="xl:h-full h-[42rem] absolute w-full"
                    initial={{ opacity: 0, filter: "blur(8px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, filter: "blur(8px)" }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="py-4 flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                      <Icon icon="material-symbols:warehouse-rounded" className="text-5xl text-default-300" />
                      <p className="text-default-500 mt-2">No warehouses found.</p>
                      <Button
                        color="primary"
                        variant="light"
                        size="sm"
                        className="mt-4"
                        onPress={handleAddWarehouse}
                        startContent={<Icon icon="mdi:plus" width={20} height={20} />}
                      >
                        Add Warehouse
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!listLoading && warehouses.length === 0 && (
                <div className="xl:h-full h-[42rem] absolute w-full">
                  <div className="py-4 flex flex-col items-center justify-center absolute mt-16 left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">
                    <Icon icon="material-symbols:warehouse-rounded" className="text-5xl text-default-300" />
                    <p className="text-default-500 mt-2">No warehouses found.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>


        {/* Right side: Warehouse Form */}
        <div className="xl:w-2/3">
          <Form id="warehouseForm" onSubmit={handleSubmitWarehouse} className="items-stretch space-y-4">
            <CardList>
              <LoadingAnimation
                condition={detailLoading}
                skeleton={
                  <div>
                    <Skeleton className="h-6 w-48 rounded-xl mb-4 mx-auto" /> {/* Section Title */}
                    <div className="space-y-4">
                      <Skeleton className="h-16 w-full rounded-xl" />
                    </div>
                  </div>}>
                <div>
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Warehouse Information</h2>
                  <div className="space-y-4">
                    <Input
                      name="name"
                      label="Warehouse Name"
                      classNames={inputStyle}
                      placeholder="Enter warehouse name"
                      value={currentWarehouse?.name || ""}
                      onChange={(e) => setCurrentWarehouse(prev => ({ ...prev, name: e.target.value }))}
                      isRequired
                    />
                  </div>
                </div>
              </LoadingAnimation>


              {/* Location Details */}
              <LoadingAnimation
                condition={isAddressLoading}
                skeleton={
                  <div>
                    <Skeleton className="h-6 w-36 rounded-xl mb-4 mx-auto" /> {/* "Location Details" title */}
                    <div className="space-y-4">
                      <Skeleton className="h-16 w-full rounded-xl" />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </div>

                      <Skeleton className="h-16 w-full rounded-xl" />
                    </div>
                  </div>}>
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold mb-4 w-full text-center">Location Details</h2>
                  <Input
                    label="Country"
                    defaultValue="PHILIPPINES"
                    isReadOnly
                    isRequired
                    classNames={inputStyle}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Autocomplete
                      label="Region"
                      isRequired
                      inputProps={autoCompleteStyle}
                      classNames={{ clearButton: "text-default-800" }}
                      selectedKey={selectedRegion}
                      onSelectionChange={(e) => handleRegionChange(`${e}`)}
                    >
                      {regions.map(region => (
                        <AutocompleteItem key={region.regCode}>
                          {region.regDesc}
                        </AutocompleteItem>
                      ))}
                    </Autocomplete>

                    <Autocomplete
                      label="Province"
                      isRequired
                      inputProps={autoCompleteStyle}
                      classNames={{ clearButton: "text-default-800" }}
                      selectedKey={selectedProvince}
                      onSelectionChange={(e) => handleProvinceChange(`${e}`)}
                      isDisabled={!selectedRegion}
                    >
                      {provinces.map(province => (
                        <AutocompleteItem key={province.provCode}>
                          {province.provDesc}
                        </AutocompleteItem>
                      ))}
                    </Autocomplete>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Autocomplete
                      label="Municipality/City"
                      isRequired
                      inputProps={autoCompleteStyle}
                      classNames={{ clearButton: "text-default-800" }}
                      selectedKey={selectedCityMunicipality}
                      onSelectionChange={(e) => handleCityMunicipalityChange(`${e}`)}
                      isDisabled={!selectedProvince}
                    >
                      {cityMunicipalities.map(city => (
                        <AutocompleteItem key={city.citymunCode}>
                          {city.citymunDesc}
                        </AutocompleteItem>
                      ))}
                    </Autocomplete>

                    <Autocomplete
                      label="Barangay"
                      isRequired
                      inputProps={autoCompleteStyle}
                      classNames={{ clearButton: "text-default-800" }}
                      selectedKey={selectedBarangay}
                      onSelectionChange={(e) => setSelectedBarangay(`${e}`)}
                      isDisabled={!selectedCityMunicipality}
                    >
                      {barangays.map(barangay => (
                        <AutocompleteItem key={barangay.brgyCode}>
                          {barangay.brgyDesc}
                        </AutocompleteItem>
                      ))}
                    </Autocomplete>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Street Address"
                      placeholder="Enter street name, building number, etc."
                      value={inputStreetAddress}
                      onChange={(e) => setInputStreetAddress(e.target.value)}
                      isRequired
                      classNames={inputStyle}
                    />

                    <Input
                      label="Postal Code"
                      placeholder="Enter postal code"
                      value={inputPostalCode}
                      onChange={(e) => setInputPostalCode(e.target.value)}
                      isRequired
                      classNames={inputStyle}
                    />
                  </div>

                  <Textarea
                    label="Full Address"
                    placeholder="Complete address"
                    value={manualFullAddress}
                    onChange={(e) => setManualFullAddress(e.target.value)}
                    isRequired
                    maxRows={5}
                    minRows={1}
                    classNames={inputStyle}
                    isReadOnly
                    startContent={<Icon icon="mdi:map-marker" className="text-default-500 pb-[0.1rem]" />}
                  />
                </div>
              </LoadingAnimation>

              {/* Warehouse Layout */}
              <div>
                <LoadingAnimation
                  condition={detailLoading}
                  skeleton={
                    <div>
                      <Skeleton className="h-6 w-48 rounded-xl mb-4 mx-auto" /> {/* Section Title */}
                      <div className="space-y-4">
                        <Skeleton className="h-32 w-full rounded-xl" /> {/* Layout Preview */}
                        <div className="flex justify-end items-center gap-2">
                          <Skeleton className="h-10 w-24 rounded-xl" />
                          <Skeleton className="h-10 w-32 rounded-xl" />
                        </div>
                      </div>
                    </div>
                  }>
                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold mb-4 w-full text-center">Warehouse Layout</h2>
                    <div className="mb-4">
                      {renderLayoutPreview()}
                    </div>
                    <div className="flex justify-end items-center gap-2">
                      <Button
                        color="primary"
                        variant="flat"
                        onPress={() => openLayoutEditor(selectedWarehouseId || '', 'editor')}
                        startContent={<Icon icon="mdi:edit" className="w-4 h-4" />}
                        isDisabled={!selectedWarehouseId}
                      >
                        Edit Layout
                      </Button>
                      <Button
                        color="secondary"
                        variant="flat"
                        onPress={() => openLayoutEditor(selectedWarehouseId || '', 'preview')}
                        startContent={<Icon icon="mdi:eye" className="w-4 h-4" />}
                        isDisabled={!selectedWarehouseId}
                      >
                        View 3D Layout
                      </Button>
                    </div>
                  </div>
                </LoadingAnimation>
              </div>

              {/* Additional Information (only when warehouse is selected) */}
              <div {...(selectedWarehouseId && currentWarehouse?.created_at ? {} : { className: '!min-h-0 !p-0 !h-0 collapse border-none z-0' })}>

                <LoadingAnimation
                  condition={detailLoading}
                  skeleton={
                    <div>
                      <Skeleton className="h-6 w-48 rounded-xl mb-4 mx-auto" /> {/* Section Title */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </div>
                    </div>
                  }>
                  <AnimatePresence>
                    {selectedWarehouseId && currentWarehouse?.created_at && (
                      <motion.div
                        {...motionTransition}>
                        <div className="">
                          <h2 className="text-xl font-semibold mb-4 w-full text-center">Additional Information</h2>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Input
                              label="Created"
                              value={formatDate(currentWarehouse.created_at)}
                              isReadOnly
                              classNames={inputStyle}
                              startContent={<Icon icon="mdi:calendar" className="text-default-500 pb-[0.1rem]" />}
                            />

                            <Input
                              label="Last Updated"
                              value={formatDate(currentWarehouse.updated_at || new Date().toISOString())}
                              isReadOnly
                              classNames={inputStyle}
                              startContent={<Icon icon="mdi:calendar-clock" className="text-default-500 pb-[0.1rem]" />}
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </LoadingAnimation>
              </div>

              {/* Action Buttons */}
              <div>
                <LoadingAnimation
                  condition={detailLoading}
                  skeleton={
                    <div className="flex justify-center items-center gap-4">
                      <Skeleton className="h-10 w-full rounded-xl" />
                      <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                  }>
                  <div className="flex justify-center items-center gap-4">
                    {selectedWarehouseId && (
                      <Button
                        color="danger"
                        variant="flat"
                        className="w-full"
                        onPress={handleDeleteWarehouseClick}
                        isDisabled={isSubmitting}
                      >
                        <Icon icon="mdi:delete" className="mr-1" />
                        Delete Warehouse
                      </Button>
                    )}
                    <Button
                      type="submit"
                      color="primary"
                      variant="shadow"
                      className="w-full"
                      isLoading={isSubmitting}
                      isDisabled={!currentWarehouse?.name || !manualFullAddress || isSubmitting}
                    >
                      <Icon icon="mdi:content-save" className="mr-1" />
                      {selectedWarehouseId ? "Update Warehouse" : "Save Warehouse"}
                    </Button>
                  </div>
                </LoadingAnimation>
              </div>




            </CardList>
          </Form>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModal.isOpen}
        onClose={deleteModal.onClose}
        size="sm"
        backdrop="blur"
        classNames={{
          backdrop: "bg-background/50"
        }}>
        <ModalContent>
          <ModalHeader>Confirm Deletion</ModalHeader>
          <ModalBody>
            <p>Are you sure you want to delete this warehouse? This action cannot be undone.</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={deleteModal.onClose} isDisabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              color="danger"
              variant="shadow"
              onPress={handleDeleteWarehouse}
              isLoading={isSubmitting}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Layout Editor Modal */}
      <WarehouseLayoutEditorModal
        isOpen={isLayoutEditorOpen}
        onClose={() => setIsLayoutEditorOpen(false)}
        warehouseId={selectedWarehouseId || ''}
        initialLayout={warehouseLayout}
        openedTab={selectedTab}
        onSave={handleLayoutSaved}
      />
    </div>
  );
}