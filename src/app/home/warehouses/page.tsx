'use client';

import CardList from '@/components/card-list';
import { FloorConfig } from '@/components/shelf-selector-3d';
import { motionTransition, motionTransitionScale } from '@/utils/anim';
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
import { createWarehouse, deleteWarehouse, getWarehouseByUuid, updateWarehouse, Warehouse } from './actions';

import { copyToClipboard, showErrorToast } from '@/utils/tools';
import WarehouseLayoutEditorModal from './layout-editor-modal';
import LoadingAnimation from '@/components/loading-animation';
import ListLoadingAnimation from '@/components/list-loading-animation';
import { getUserFromCookies } from '@/utils/supabase/server/user';
import CustomScrollbar from '@/components/custom-scrollbar';
import { createClient } from "@/utils/supabase/client";
import { SearchListPanel } from '@/components/search-list-panel/search-list-panel';

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
  const [warehouses, setWarehouses] = useState<(Partial<Warehouse> & { floors_count: number, rows_count: number, columns_count: number })[]>([])
  const [warehouseToDelete, setWarehouseToDelete] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);

  // Separate state for the selected warehouse details
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [isAddressLoading, setIsAddressLoading] = useState<boolean>(false); // Separate loading state for address
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
  const [layoutRows, setLayoutRows] = useState<number>(17);
  const [layoutColumns, setLayoutColumns] = useState<number>(33);

  // Layout editor state
  const [isLayoutEditorOpen, setIsLayoutEditorOpen] = useState(false);

  // Warehouse Layout Editor Modal Tab
  const [selectedTab, setSelectedTab] = useState<'editor' | 'preview'>('editor');
  const [user, setUser] = useState<any>(null);

  const inputStyle = {
    inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200 h-16",
  };

  const autoCompleteStyle = { classNames: inputStyle };

  // Optimized function to load address data efficiently
  const loadAddressData = async (options?: {
    reg_code?: string
    prov_code?: string
    citymun_code?: string
  }) => {
    try {
      const addressData = await getAddressDropdownData(options)

      setRegions(addressData.regions)

      if (options?.reg_code) {
        setProvinces(addressData.provinces)
      }

      if (options?.prov_code) {
        setCityMunicipalities(addressData.cities)
      }

      if (options?.citymun_code) {
        setBarangays(addressData.barangays)
      }

      return addressData
    } catch (error) {
      showErrorToast('Error loading address data', (error instanceof Error ? error.message : 'Unknown error'));
      return { regions: [], provinces: [], cities: [], barangays: [] }
    }
  }

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
    const reg_code = address.region?.code
    const prov_code = address.province?.code
    const citymun_code = address.municipality?.code

    if (reg_code && prov_code && citymun_code) {
      // Load all levels at once
      await loadAddressData({ reg_code, prov_code, citymun_code })
    } else if (reg_code && prov_code) {
      // Load up to cities
      await loadAddressData({ reg_code, prov_code })
    } else if (reg_code) {
      // Load up to provinces
      await loadAddressData({ reg_code })
    } else {
      // Load only regions
      await loadAddressData()
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




  const fetchWarehouse = async (warehouseId: string) => {
    setIsAddressLoading(true);
    setDetailLoading(true);

    if (!warehouseId) {
      setSelectedWarehouseId(null);
      setWarehouseLayout([]);
      setCurrentWarehouse({});
      resetAddressFields();

      setIsAddressLoading(false);
      setDetailLoading(false);
      return;
    }

    const { data, success } = await getWarehouseByUuid(warehouseId);

    if (success && data) {
      setCurrentWarehouse(data);
      setWarehouseLayout(data.layout || []);
      setDetailLoading(false);
      await initializeAddressFields(data);
    }

    setIsAddressLoading(false);
  }

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
    loadAddressData({ reg_code: value })
  };

  // Handle province selection change
  const handleProvinceChange = (value: string) => {
    setSelectedProvince(value);
    setSelectedCityMunicipality('');
    setSelectedBarangay('');

    // Load cities for the selected province
    loadAddressData({ prov_code: value })
  };

  // Handle city/municipality selection change
  const handleCityMunicipalityChange = (value: string) => {
    setSelectedCityMunicipality(value);
    setSelectedBarangay('');

    // Load barangays for the selected city/municipality
    loadAddressData({ citymun_code: value })
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

    const regionName = regions.find(r => compare(r.reg_code, selectedRegion))?.reg_desc || '';
    const provinceName = provinces.find(p => compare(p.prov_code, selectedProvince))?.prov_desc || '';
    const cityMunName = cityMunicipalities.find(c => compare(c.citymun_code, selectedCityMunicipality))?.citymun_desc || '';
    const barangayName = barangays.find(b => compare(b.brgy_code, selectedBarangay))?.brgy_desc || '';

    const warehouseData = {
      name: currentWarehouse.name,
      address: {
        country: { code: "PH", desc: "PHILIPPINES" },
        region: { code: selectedRegion, desc: regionName },
        province: { code: selectedProvince, desc: provinceName },
        municipality: { code: selectedCityMunicipality, desc: cityMunName },
        barangay: { code: selectedBarangay, desc: barangayName },
        street: inputStreetAddress,
        postalCode: inputPostalCode,
        fullAddress: manualFullAddress
      },
      layout: warehouseLayout
    };

    let result;
    if (currentWarehouse.uuid) {
      result = await updateWarehouse(currentWarehouse.uuid, warehouseData);
    } else {
      result = await createWarehouse({ company_uuid: user.company_uuid, ...warehouseData });
    }

    if (!result.error) {

      // If creating a new warehouse, update the URL with the new ID
      if (!currentWarehouse.uuid && result.data?.uuid) {
        const newWarehouseId = result.data.uuid;
        const params = new URLSearchParams(searchParams.toString());
        params.set("warehouseId", newWarehouseId);
        router.push(`?${params.toString()}`, { scroll: false });
      }
    } else {
      showErrorToast(`Error ${currentWarehouse.uuid ? 'updating' : 'creating'} warehouse`, result.error);
    }

    setIsSubmitting(false);
  };

  // Handle page change
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    // The useEffect will trigger fetchWarehouses with the new page
  };

  // Handle searchQuery with pagination reset
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setPage(1); // Reset to first page when searching
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  useEffect(() => {
    const fetchWarehousesAsync = async () => {
      setListLoading(true);
      const userData = await getUserFromCookies();
      if (userData === null) {
        setUser(null);
        return
      } else {
        setUser(userData);
        setRowsPerPage(userData.settings.pageSize);
      }

      await loadAddressData();
      setListLoading(false);
    }
    fetchWarehousesAsync();

  }, []);

  // Effect to fetch warehouses when dependencies change
  useEffect(() => {
    const fetchWarehousesAsync = async () => {
      if (!user?.company_uuid) return;
    }
    fetchWarehousesAsync();
  }, [page, rowsPerPage, searchQuery, user]);

  // Update the full address when components change
  useEffect(() => {
    if (!regions.length) return

    const regionName = regions.find(r => compare(r.reg_code, selectedRegion))?.reg_desc || '';
    const provinceName = provinces.find(p => compare(p.prov_code, selectedProvince))?.prov_desc || '';
    const cityMunName = cityMunicipalities.find(c => compare(c.citymun_code, selectedCityMunicipality))?.citymun_desc || '';
    const barangayName = barangays.find(b => compare(b.brgy_code, selectedBarangay))?.brgy_desc || '';

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

  // Watch for URL searchQuery params to select warehouse
  useEffect(() => {
    const warehouseId = searchParams.get("warehouseId");

    if (warehouseId !== selectedWarehouseId) {
      setSelectedWarehouseId(warehouseId);
      fetchWarehouse(warehouseId!);
    }

  }, [searchParams]);

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

  const openLayoutEditor = (mode: 'editor' | 'preview') => {
    setSelectedTab(mode);
    setIsLayoutEditorOpen(true);
  };

  const handleLayoutSaved = (newLayout: FloorConfig[]) => {
    setWarehouseLayout(newLayout);
    console.log("SAVE")
    setIsLayoutEditorOpen(false);
  };

  const handleLayoutClose = () => {
    setIsLayoutEditorOpen(false);
  };

  return (
    <motion.div {...motionTransition}>
      <div className="container mx-auto p-2 max-w-5xl">
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
          <div className="flex gap-4 xl:mt-0 mt-4 text-center">
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


        <div className="flex flex-col xl:flex-row gap-4">
          {/* Left side: Warehouse List */}
          <SearchListPanel
            title="Warehouses"
            tableName="warehouses"
            searchPlaceholder="Search warehouses..."
            searchLimit={10}
            dateFilters={["weekFilter", "specificDate"]}
            companyUuid={user?.company_uuid}
            renderItem={(warehouse) => (
              <Button
                key={warehouse.uuid}
                onPress={() => { if (warehouse.uuid) handleSelectWarehouse(warehouse.uuid) }}
                variant="shadow"
                className={`w-full !transition-all duration-300 rounded-2xl p-0 group overflow-hidden
                  ${warehouse.address?.fullAddress ? 'min-h-[9.5rem]' : 'min-h-[7rem]'}
                  ${selectedWarehouseId === warehouse.uuid ?
                    '!bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-400 hover:to-primary-500 !shadow-xl hover:!shadow-2xl !shadow-primary-300/50 border-2 border-primary-300/30' :
                    '!bg-gradient-to-br from-background to-default-50 hover:from-default-50 hover:to-default-100 !shadow-lg hover:!shadow-xl !shadow-default-300/30 border-2 border-default-200/50 hover:border-default-300/50'}`}
              >
                <div className="w-full flex flex-col h-full relative">
                  {/* Background pattern */}
                  <div className={`absolute inset-0 opacity-5 ${selectedWarehouseId === warehouse.uuid ? 'bg-white' : 'bg-primary-500'}`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,_var(--tw-gradient-stops))] from-current via-transparent to-transparent"></div>
                  </div>

                  {/* Warehouse details */}
                  <div className="flex-grow flex flex-col justify-center px-4 relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 text-left">
                        <span className={`font-bold text-lg leading-tight block truncate text-left
                                          ${selectedWarehouseId === warehouse.uuid ? 'text-primary-50' : 'text-default-800'}`}>
                          {warehouse.name}
                        </span>
                        {warehouse.address?.fullAddress && (
                          <div className={`w-full mt-2 text-sm leading-relaxed text-left break-words whitespace-normal
                                          ${selectedWarehouseId === warehouse.uuid ? 'text-primary-100' : 'text-default-600'}`}
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              lineHeight: '1.3'
                            }}>
                            {warehouse.address.street}, {warehouse.address.barangay.desc}, {warehouse.address.municipality.desc}, {warehouse.address.province.desc}
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0 self-start">
                        <Chip
                          color={selectedWarehouseId === warehouse.uuid ? "default" : "primary"}
                          variant="shadow"
                          size="sm"
                          className={`font-semibold ${selectedWarehouseId === warehouse.uuid ? 'bg-primary-50 text-primary-600' : ''}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="material-symbols:warehouse-rounded" width={14} height={14} />
                            {warehouse.floors_count || 0} floor{(warehouse.floors_count || 0) !== 1 ? 's' : ''}
                          </div>
                        </Chip>
                      </div>
                    </div>
                  </div>

                  {/* Warehouse metadata */}
                  <div className={`flex items-center gap-2 backdrop-blur-sm rounded-b-2xl border-t relative z-10 justify-start
                                  ${selectedWarehouseId === warehouse.uuid ?
                      'border-primary-300/30 bg-primary-700/20' :
                      'border-default-200/50 bg-default-100/50'} p-4`}>
                    <CustomScrollbar
                      direction="horizontal"
                      hideScrollbars
                      gradualOpacity
                      className="flex items-center gap-2">

                      <Chip
                        color={selectedWarehouseId === warehouse.uuid ? "default" : "secondary"}
                        variant="flat"
                        size="sm"
                        className={`font-medium ${selectedWarehouseId === warehouse.uuid ? 'bg-primary-100/80 text-primary-700 border-primary-200/60' : 'bg-secondary-100/80'}`}
                      >
                        <div className="flex items-center gap-1">
                          <Icon icon="mdi:calendar" width={12} height={12} />
                          {formatDate(warehouse.created_at.toString())}
                        </div>
                      </Chip>

                      {warehouse.floors_count > 0 && (
                        <Chip
                          color="success"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedWarehouseId === warehouse.uuid ? 'bg-success-100/80 text-success-700 border-success-200/60' : 'bg-success-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="tabler:layout-2-filled" width={12} height={12} />
                            {warehouse.rows_count} × {warehouse.columns_count}
                          </div>
                        </Chip>
                      )}

                      {warehouse.address?.municipality && (
                        <Chip
                          color="warning"
                          variant="flat"
                          size="sm"
                          className={`font-medium ${selectedWarehouseId === warehouse.uuid ? 'bg-warning-100/80 text-warning-700 border-warning-200/60' : 'bg-warning-100/80'}`}
                        >
                          <div className="flex items-center gap-1">
                            <Icon icon="mdi:map-marker" width={12} height={12} />
                            {warehouse.address.municipality.desc}
                          </div>
                        </Chip>
                      )}
                    </CustomScrollbar>
                  </div>

                  {/* Hover effect overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                </div>
              </Button>
            )}
            renderSkeletonItem={(i) => (
              <Skeleton key={i} className="w-full min-h-[7.5rem] rounded-xl" />
            )}
            renderEmptyCard={(
              <>
                <Icon icon="material-symbols:warehouse-rounded" className="text-5xl text-default-300" />
                <p className="text-default-500 mt-2 mx-8 text-center">
                  No warehouses found
                </p>
                <Button
                  color="primary"
                  variant="flat"
                  size="sm"
                  className="mt-4"
                  onPress={handleAddWarehouse}
                  startContent={<Icon icon="mdi:plus" className="text-default-500" />}>
                  Add Warehouse
                </Button>
              </>
            )}
            onItemSelect={handleSelectWarehouse}
            supabaseFunction="get_warehouses_filtered"
            className={`xl:w-1/3 shadow-xl shadow-primary/10 
                      xl:min-h-[calc(100vh-6.5rem)] 2xl:min-h-[calc(100vh-9rem)] min-h-[42rem] 
                      xl:min-w-[350px] w-full rounded-2xl overflow-hidden bg-background border 
                      border-default-200 backdrop-blur-lg xl:sticky top-0 self-start max-h-[calc(100vh-2rem)]`}
          />



          {/* Right side: Warehouse Form */}
          <div className="xl:w-2/3 overflow-hidden">
            <Form id="warehouseForm" onSubmit={handleSubmitWarehouse} className="items-stretch space-y-4">
              <CardList>

                <LoadingAnimation
                  condition={detailLoading}
                  skeleton={
                    <div>
                      <Skeleton className="h-6 w-48 rounded-xl mb-4 mx-auto" /> {/* Section Title */}
                      <div className="space-y-4">
                        <Skeleton className="h-16 w-full rounded-xl" />
                        <Skeleton className="h-16 w-full rounded-xl" />
                      </div>
                    </div>}>
                  <div>
                    <h2 className="text-xl font-semibold mb-4 w-full text-center">Warehouse Information</h2>
                    <div className="space-y-4"><AnimatePresence>
                      {currentWarehouse?.uuid && (
                        <motion.div {...motionTransition}>
                          <Input
                            label="Warehouse Identifier"
                            value={currentWarehouse?.uuid || ""}
                            isReadOnly
                            classNames={inputStyle}
                            startContent={<Icon icon="mdi:warehouse" className="text-default-500 mb-[0.2rem]" />}
                            endContent={
                              currentWarehouse?.uuid ? (
                                <Button
                                  variant="flat"
                                  color="default"
                                  isIconOnly
                                  onPress={() => copyToClipboard(currentWarehouse.uuid || "")}
                                >
                                  <Icon icon="mdi:content-copy" className="text-default-500" />
                                </Button>
                              ) : undefined
                            }
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
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
                          <AutocompleteItem key={region.reg_code}>
                            {region.reg_desc}
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
                          <AutocompleteItem key={province.prov_code}>
                            {province.prov_desc}
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
                          <AutocompleteItem key={city.citymun_code}>
                            {city.citymun_desc}
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
                          <AutocompleteItem key={barangay.brgy_code}>
                            {barangay.brgy_desc}
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
                          onPress={() => openLayoutEditor('editor')}
                          startContent={<Icon icon="mdi:edit" className="w-4 h-4" />}
                        >
                          {warehouseLayout.length > 0 ? 'Edit Layout' : 'Add Layout'}
                        </Button>
                        {warehouseLayout.length > 0 && (
                          <Button
                            color="secondary"
                            variant="flat"
                            onPress={() => openLayoutEditor('preview')}
                            startContent={<Icon icon="mdi:eye" className="w-4 h-4" />}
                          >
                            View 3D Layout
                          </Button>
                        )}
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
          onClose={handleLayoutClose}
          initialLayout={warehouseLayout}
          openedTab={selectedTab}
          onSave={handleLayoutSaved}
        />
      </div>
    </motion.div>
  );
}