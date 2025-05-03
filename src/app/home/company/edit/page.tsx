'use client'

import CardList from '@/components/card-list';
import { motionTransition } from '@/utils/anim';
import { herouiColor } from "@/utils/colors";
import {
  getBarangays,
  getCityMunicipalities,
  getProvinces,
  getRegions
} from '@/utils/supabase/server/address';

import { getUserCompanyDetails } from '@/utils/supabase/server/companies';
import { getUserProfile } from '@/utils/supabase/server/user';
import { useRouter } from 'next/navigation';
import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
import { updateCompany } from './actions';

import {
  BuildingOfficeIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon
} from '@heroicons/react/24/solid';
import {
  Accordion,
  AccordionItem,
  Alert,
  Autocomplete,
  AutocompleteItem,
  Button,
  Form,
  Image,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollShadow,
  Skeleton,
  Spinner,
  useDisclosure,
  Kbd
} from "@heroui/react";
import { useTheme } from "next-themes";

import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { AnimatePresence, motion } from 'framer-motion';

// Import ShelfSelector3D component with lazy loading
const ShelfSelector3D = memo(lazy(() =>
  import("@/components/shelf-selector-3d-v4").then(mod => ({
    default: mod.ShelfSelector3D
  }))
));

// Types for layout data
interface Floor {
  height: number;
  matrix: number[][];
}

// Types for address data
interface Region {
  regCode: string;
  regDesc: string;
}

interface Province {
  provCode: string;
  provDesc: string;
}

interface CityMunicipality {
  citymunCode: string;
  citymunDesc: string;
}

interface Barangay {
  brgyCode: string;
  brgyDesc: string;
}

export default function CompanyEditPage() {
  const [companyData, setCompanyData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [originalCompanyData, setOriginalCompanyData] = useState<any>(null)

  // Router
  const router = useRouter()

  // Company layout state
  const [companyLayout, setCompanyLayout] = useState<Floor[]>([])
  const [currentFloor, setCurrentFloor] = useState(0)
  const [layoutRows, setLayoutRows] = useState(18)
  const [layoutColumns, setLayoutColumns] = useState(32)
  const [selectedCellValue, setSelectedCellValue] = useState(5)

  // Add selection tracking state
  const [isShiftPressed, setIsShiftPressed] = useState(false)
  const [isCtrlPressed, setIsCtrlPressed] = useState(false)
  const [selectionStart, setSelectionStart] = useState<{ row: number, col: number } | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<{ row: number, col: number } | null>(null)
  const [selectedCells, setSelectedCells] = useState<{ [key: string]: boolean }>({})
  const [dragMode, setDragMode] = useState<'add' | 'remove' | null>(null)

  // Address form state
  const [regions, setRegions] = useState<Region[]>([])
  const [provinces, setProvinces] = useState<Province[]>([])
  const [cityMunicipalities, setCityMunicipalities] = useState<CityMunicipality[]>([])
  const [barangays, setBarangays] = useState<Barangay[]>([])

  const [selectedRegion, setSelectedRegion] = useState<string>('')
  const [selectedProvince, setSelectedProvince] = useState<string>('')
  const [selectedCityMunicipality, setSelectedCityMunicipality] = useState<string>('')
  const [selectedBarangay, setSelectedBarangay] = useState<string>('')
  const [inputStreetAddress, setInputStreetAddress] = useState<string>('')
  const [inputPostalCode, setInputPostalCode] = useState<number | undefined>()
  const [fullAddress, setFullAddress] = useState<string>('')

  const [tabSelection, setTabSelection] = useState<string>("basic")

  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" }
  const autoCompleteStyle = { classNames: inputStyle }

  // Add state for 3D preview modal
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Add state for colors and 3D controls 
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(0);
  const [isFloorChangeAnimate, setIsFloorChangeAnimate] = useState(true);
  const [isShelfChangeAnimate, setIsShelfChangeAnimate] = useState(true);
  const [isGroupChangeAnimate, setIsGroupChangeAnimate] = useState(false);


  // Inside the InventoryPage component, add custom colors
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


  const { theme } = useTheme()

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
        occupiedHoverShelfColor: herouiColor('danger-400', 'hex') as string, // Add danger-400 for hover
        textColor: herouiColor('text', 'hex') as string,
      });
    }, 100);
  };

  // Function to compare values
  const compare = (a: any, b: any) => {
    return `${a}` === `${b}`
  }

  // Initialize regions
  const fetchRegions = async () => {
    const regionsData = await getRegions()
    setRegions(regionsData)
  }

  // Handle logo change
  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      // Check file size (2MB limit)
      if (file.size > 2 * 1024 * 1024) {
        setError('Logo image must be less than 2MB')
        return
      }

      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // Handle region selection change
  function handleRegionChange(value: string) {
    setSelectedRegion(value)
    setSelectedProvince('')
    setSelectedCityMunicipality('')
    setSelectedBarangay('')
  }

  // Handle province selection change
  function handleProvinceChange(value: string) {
    setSelectedProvince(value)
    setSelectedCityMunicipality('')
    setSelectedBarangay('')
  }

  // Handle city/municipality selection change
  function handleCityMunicipalityChange(value: string) {
    setSelectedCityMunicipality(value)
    setSelectedBarangay('')
  }

  // Layout management functions
  const initializeMatrix = (rows: number, cols: number) => {
    return Array(rows).fill(0).map(() => Array(cols).fill(0));
  }

  const initializeNewLayout = () => {
    const floors = companyLayout.length === 0 ? 2 : companyLayout.length;
    const newLayout: Floor[] = Array(floors).fill(0).map(() => ({
      height: 5, // Default max shelf height
      matrix: initializeMatrix(layoutRows, layoutColumns)
    }));
    setCompanyLayout(newLayout);
  }

  const updateLayoutSize = () => {
    setCompanyLayout(prev => prev.map(floor => ({
      height: floor.height,
      matrix: resizeMatrix(floor.matrix, layoutRows, layoutColumns)
    })));
  }

  const resizeMatrix = (matrix: number[][], newRows: number, newCols: number) => {
    // Create a new matrix with the desired size
    const newMatrix = Array(newRows).fill(0).map(() => Array(newCols).fill(0));

    // Copy values from the old matrix to the new one
    const minRows = Math.min(matrix.length, newRows);
    const minCols = Math.min(matrix[0]?.length || 0, newCols);

    for (let r = 0; r < minRows; r++) {
      for (let c = 0; c < minCols; c++) {
        newMatrix[r][c] = matrix[r][c];
      }
    }

    return newMatrix;
  }

  const addFloor = () => {
    setCompanyLayout(prev => [
      ...prev,
      {
        height: 5, // Default max shelf height
        matrix: initializeMatrix(layoutRows, layoutColumns)
      }
    ]);
    setCurrentFloor(companyLayout.length);
  }

  const removeFloor = (floorIndex: number) => {
    if (companyLayout.length <= 1) {
      setError("Cannot remove the last floor. A minimum of 1 floor is required.");
      return;
    }

    setCompanyLayout(prev => prev.filter((_, i) => i !== floorIndex));

    if (currentFloor >= companyLayout.length - 1) {
      setCurrentFloor(Math.max(0, companyLayout.length - 2));
    }
  }

  const handleCellClick = (rowIndex: number, colIndex: number, event: React.MouseEvent) => {
    // Prevent default browser behavior to stop text selection
    event.preventDefault();

    // If shift is pressed, start selection
    if (isShiftPressed) {
      setSelectionStart({ row: rowIndex, col: colIndex })
      setSelectionEnd({ row: rowIndex, col: colIndex })
      updateSelection(rowIndex, colIndex, rowIndex, colIndex)
      return
    }

    // If ctrl is pressed, start a removal selection
    if (isCtrlPressed) {
      setSelectionStart({ row: rowIndex, col: colIndex })
      setSelectionEnd({ row: rowIndex, col: colIndex })
      updateSelection(rowIndex, colIndex, rowIndex, colIndex)
      // Immediately set selected cell to 0
      setCompanyLayout(prev => {
        const newLayout = [...prev]
        newLayout[currentFloor] = {
          ...newLayout[currentFloor],
          matrix: newLayout[currentFloor].matrix.map(row => [...row])
        }
        newLayout[currentFloor].matrix[rowIndex][colIndex] = 0
        return newLayout
      })
      return
    }

    // Determine the drag mode based on the current cell value
    const currentValue = companyLayout[currentFloor].matrix[rowIndex][colIndex]
    setDragMode(currentValue > 0 ? 'remove' : 'add')

    // Regular click behavior (toggle cell value)
    setCompanyLayout(prev => {
      const newLayout = [...prev]
      // Create a deep copy of the current floor
      newLayout[currentFloor] = {
        ...newLayout[currentFloor],
        matrix: newLayout[currentFloor].matrix.map(row => [...row])
      }

      const currentValue = newLayout[currentFloor].matrix[rowIndex][colIndex]
      // Toggle value: 0 if it has a value, otherwise set to selected value
      newLayout[currentFloor].matrix[rowIndex][colIndex] =
        currentValue > 0 ? 0 : Math.min(selectedCellValue, newLayout[currentFloor].height)

      return newLayout
    })

    // Clear any existing selection
    if (!isCtrlPressed) {
      clearSelection()
    }
  }

  const handleCellDrag = (rowIndex: number, colIndex: number, event: React.MouseEvent) => {
    // Prevent default browser behavior to stop text selection
    event.preventDefault();

    // Selection in progress with shift key
    if (isShiftPressed && selectionStart) {
      setSelectionEnd({ row: rowIndex, col: colIndex })
      updateSelection(selectionStart.row, selectionStart.col, rowIndex, colIndex)
      return
    }

    // Selection in progress with ctrl key - immediately set cells to 0
    if (isCtrlPressed && selectionStart) {
      setSelectionEnd({ row: rowIndex, col: colIndex })
      updateSelection(selectionStart.row, selectionStart.col, rowIndex, colIndex)

      // Immediately set the cell to 0
      setCompanyLayout(prev => {
        const newLayout = [...prev]
        newLayout[currentFloor] = {
          ...newLayout[currentFloor],
          matrix: newLayout[currentFloor].matrix.map(row => [...row])
        }
        newLayout[currentFloor].matrix[rowIndex][colIndex] = 0
        return newLayout
      })
      return
    }

    // Regular drag behavior (set cells as you drag)
    if (event.buttons === 1 && !isCtrlPressed && !isShiftPressed) { // Left mouse button is pressed
      setCompanyLayout(prev => {
        const newLayout = [...prev]
        newLayout[currentFloor] = {
          ...newLayout[currentFloor],
          matrix: newLayout[currentFloor].matrix.map(row => [...row])
        }

        // Apply value based on the drag mode
        if (dragMode === 'add') {
          // Add mode: set to selected value
          newLayout[currentFloor].matrix[rowIndex][colIndex] =
            Math.min(selectedCellValue, newLayout[currentFloor].height)
        } else if (dragMode === 'remove') {
          // Remove mode: set to 0
          newLayout[currentFloor].matrix[rowIndex][colIndex] = 0
        }

        return newLayout
      })
    }
  }

  const setCellValue = (rowIndex: number, colIndex: number, value: number) => {
    setCompanyLayout(prev => {
      const newLayout = [...prev];
      // Create a deep copy of the current floor
      newLayout[currentFloor] = {
        ...newLayout[currentFloor],
        matrix: newLayout[currentFloor].matrix.map(row => [...row])
      };

      // Ensure the value doesn't exceed the floor's maximum height
      const safeValue = Math.min(value, newLayout[currentFloor].height);
      newLayout[currentFloor].matrix[rowIndex][colIndex] = safeValue;

      return newLayout;
    });
  }

  const setShelvesForSelection = (value: number) => {
    if (Object.keys(selectedCells).length > 0) {
      // Apply to currently selected cells
      applyValueToSelection(value)
    } else {
      // Previous implementation for backward compatibility
      const selectionElements = document.querySelectorAll('.cell-selected')
      selectionElements.forEach(elem => {
        const rowIndex = parseInt(elem.getAttribute('data-row') || '0', 10)
        const colIndex = parseInt(elem.getAttribute('data-col') || '0', 10)
        setCellValue(rowIndex, colIndex, value)
      })
    }
  }

  const setFloorHeight = (index: number, height: number) => {
    if (height < 1) return;

    setCompanyLayout(prev => {
      const newLayout = [...prev];
      newLayout[index] = {
        ...newLayout[index],
        height: height,
        // Clamp all values in the matrix to the new height
        matrix: newLayout[index].matrix.map(row =>
          row.map(cell => Math.min(cell, height))
        )
      };
      return newLayout;
    });
  }

  // Track shift key press/release
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true)
      }
      if (e.key === 'Control' || e.key === 'Meta') { // Also support Meta key (Cmd on Mac)
        setIsCtrlPressed(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false)
        // Clear selection when shift is released
        if (!selectionEnd) {
          clearSelection()
        }
      }
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlPressed(false)
        // Clear selection when ctrl/meta is released
        if (!selectionEnd) {
          clearSelection()
        }
      }
    }

    // Clear selection when mouse is released anywhere
    const handleMouseUp = () => {
      if (selectionStart && selectionEnd) {
        // Apply selected value to all selected cells
        applyValueToSelection(isCtrlPressed ? 0 : selectedCellValue)
        // Keep the selection visible but reset the active selection process
        setSelectionStart(null)
        setSelectionEnd(null)
      }
      // Reset drag mode when mouse is released
      setDragMode(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [selectionStart, selectionEnd, selectedCellValue, isCtrlPressed])

  // Function to clear the current selection
  const clearSelection = () => {
    setSelectionStart(null)
    setSelectionEnd(null)
    setSelectedCells({})
  }

  // Function to update the selection based on start and end points
  const updateSelection = (startRow: number, startCol: number, endRow: number, endCol: number) => {
    const minRow = Math.min(startRow, endRow)
    const maxRow = Math.max(startRow, endRow)
    const minCol = Math.min(startCol, endCol)
    const maxCol = Math.max(startCol, endCol)

    const newSelectedCells: { [key: string]: boolean } = {}

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        newSelectedCells[`${r}-${c}`] = true
      }
    }

    setSelectedCells(newSelectedCells)
  }

  // Apply the given value to all selected cells
  const applyValueToSelection = (value: number) => {
    if (Object.keys(selectedCells).length === 0) return

    setCompanyLayout(prev => {
      const newLayout = [...prev]
      // Create a deep copy of the current floor
      newLayout[currentFloor] = {
        ...newLayout[currentFloor],
        matrix: newLayout[currentFloor].matrix.map(row => [...row])
      }

      // Set value for all selected cells
      Object.keys(selectedCells).forEach(key => {
        const [rowIndex, colIndex] = key.split('-').map(Number)

        // Ensure the value doesn't exceed the floor's maximum height
        const safeValue = Math.min(value, newLayout[currentFloor].height)
        newLayout[currentFloor].matrix[rowIndex][colIndex] = safeValue
      })

      return newLayout
    })
  }

  // Form submission
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)

    const formData = new FormData(event.currentTarget)

    formData.append('address.country.code', '1')
    formData.append('address.region.code', selectedRegion)
    formData.append('address.province.code', selectedProvince)
    formData.append('address.municipality.code', selectedCityMunicipality)
    formData.append('address.barangay.code', selectedBarangay)

    // Add company layout data
    formData.append('company_layout', JSON.stringify(companyLayout))

    const { error, success } = await updateCompany(formData)

    if (error) {
      console.error('Error updating company:', error)
      setError(error)
    }
    else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      // Update original data with the new saved data
      const { data, error } = await getUserProfile()
      const { data: companyData, error: companyError } = await getUserCompanyDetails(data?.uuid)

      if (error) {
        setError(error)
        return
      }

      if (!data?.is_admin) {
        router.back()
        return
      }

      if (companyError) {
        setError(`${companyError}`)
        return
      }

      setCompanyData(companyData)
      setOriginalCompanyData(JSON.parse(JSON.stringify(companyData)))
      router.back()
    }

    setIsSaving(false)
  }

  // Function to discard changes and reset to original data
  function handleDiscardChanges() {
    router.back()
  }

  useEffect(() => {
    updateHeroUITheme();
  }, [theme])

  useEffect(() => {
    updateHeroUITheme();
  }, []);

  // Load company data on initial render
  useEffect(() => {
    async function fetchCompanyData() {
      try {
        setIsLoading(true)
        const { data, error } = await getUserProfile()
        const { data: companyData, error: companyError } = await getUserCompanyDetails(data?.uuid)

        if (error) {
          setError(error)
          return
        }

        if (!data?.is_admin) {
          router.back()
          return
        }

        if (companyError) {
          setError(`${companyError}`)
          return
        }



        setCompanyData(companyData)
        setOriginalCompanyData(JSON.parse(JSON.stringify(companyData)))

        // Initialize logo preview
        if (companyData?.logo_url && !companyData.logo_url.error) {
          setLogoPreview(companyData.logo_url)
        }
      } catch (err) {
        console.error('Error fetching company profile:', err)
        setError('Failed to load company data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchCompanyData()
  }, [])

  // Fetch address data on initial render
  useEffect(() => {
    fetchRegions()
  }, [])

  // Set form values when companyData is loaded
  useEffect(() => {
    async function initializeCompanyData() {
      if (companyData && regions.length) {
        // Handle company address
        if (companyData.address?.region?.code) {
          const region = regions.find(r => compare(r.regCode, companyData.address.region.code))
          if (region) {
            setSelectedRegion(region.regCode)
          }
        }

        // Set street address and postal code
        setInputStreetAddress(companyData.address?.streetAddress || '')
        setInputPostalCode(companyData.address?.postalCode ? Number(companyData.address.postalCode) : undefined)

        // Set full address
        setFullAddress(companyData.address?.fullAddress || '')
      }
    }

    initializeCompanyData()
  }, [companyData, regions])

  // Initialize layout from company data or create default
  useEffect(() => {
    if (!isLoading && companyData) {
      if (companyData?.company_layout && Array.isArray(companyData.company_layout)) {
        // Check if the data structure matches our expected format

        if (companyData.company_layout.length > 0 &&
          'height' in companyData.company_layout[0] &&
          'matrix' in companyData.company_layout[0]) {
          setCompanyLayout(companyData.company_layout);

          console.log('Company layout:', companyData.company_layout.height, companyData.company_layout.matrix)


          // Set rows/columns based on the loaded data
          if (companyData.company_layout[0].matrix.length > 0) {
            setLayoutRows(companyData.company_layout[0].matrix.length);
            setLayoutColumns(companyData.company_layout[0].matrix[0].length);
          }
        } else {
          // Legacy format - convert to new format
          const convertedLayout: Floor[] = companyData.company_layout.map((floor: number[][]) => ({
            height: 5, // Default max height
            matrix: floor
          }));
          setCompanyLayout(convertedLayout);

          // Set rows/columns based on the loaded data
          if (convertedLayout[0].matrix.length > 0) {
            setLayoutRows(convertedLayout[0].matrix.length);
            setLayoutColumns(convertedLayout[0].matrix[0].length);
          }
        }
      } else {
        initializeNewLayout();
      }
    }
  }, [isLoading, companyData]);

  // Automatically update grid size when rows or columns change
  useEffect(() => {
    // Only update if there's a valid layout initialized
    if (companyLayout.length > 0) {
      updateLayoutSize();
    }
  }, [layoutRows, layoutColumns]);

  // Fetch provinces when region changes
  const fetchProvinces = async () => {
    if (selectedRegion) {
      const provincesData = await getProvinces(selectedRegion)
      setProvinces(provincesData)

      // If companyData has province code, set it
      if (companyData?.address?.province?.code) {
        const province = provincesData.find(p => compare(p.provCode, companyData.address.province.code))
        if (province) {
          setSelectedProvince(province.provCode)
        }
      } else {
        setSelectedProvince('')
      }
      setCityMunicipalities([])
      setBarangays([])
    }
  }

  // Fetch municipalities when province changes
  const fetchCityMunicipalities = async () => {
    if (selectedProvince) {
      const cityMunData = await getCityMunicipalities(selectedProvince)
      setCityMunicipalities(cityMunData)

      // If companyData has municipality code, set it
      if (companyData?.address?.municipality?.code) {
        const cityMun = cityMunData.find(c => compare(c.citymunCode, companyData.address.municipality.code))
        if (cityMun) {
          setSelectedCityMunicipality(cityMun.citymunCode)
        }
      } else {
        setSelectedCityMunicipality('')
      }
      setBarangays([])
    }
  }

  // Fetch barangays when municipality changes
  const fetchBarangays = async () => {
    if (selectedCityMunicipality) {
      const barangaysData = await getBarangays(selectedCityMunicipality)
      setBarangays(barangaysData)

      // If companyData has barangay code, set it
      if (companyData?.address?.barangay?.code) {
        const barangay = barangaysData.find(b => compare(b.brgyCode, companyData.address.barangay.code))
        if (barangay) {
          setSelectedBarangay(barangay.brgyCode)
        }
      } else {
        setSelectedBarangay('')
      }
    }
  }

  // Handle province loading when region changes
  useEffect(() => {
    if (selectedRegion && companyData?.address?.province?.code) {
      fetchProvinces()
    }
  }, [selectedRegion, companyData])

  // Handle city/municipality loading when province changes
  useEffect(() => {
    if (selectedProvince && companyData?.address?.municipality?.code) {
      fetchCityMunicipalities()
    }
  }, [selectedProvince, companyData])

  // Handle barangay loading when city/municipality changes
  useEffect(() => {
    if (selectedCityMunicipality && companyData?.address?.barangay?.code) {
      fetchBarangays()
    }
  }, [selectedCityMunicipality, companyData])

  // Update the full address when components change
  useEffect(() => {
    if (!regions.length) return

    const regionName = regions.find(r => r.regCode === selectedRegion)?.regDesc || '';
    const provinceName = provinces.find(p => p.provCode === selectedProvince)?.provDesc || '';
    const cityMunName = cityMunicipalities.find(c => c.citymunCode === selectedCityMunicipality)?.citymunDesc || '';
    const barangayName = barangays.find(b => b.brgyCode === selectedBarangay)?.brgyDesc || '';

    const addressParts = [
      inputStreetAddress,
      barangayName,
      cityMunName,
      provinceName,
      regionName,
      'PHILIPPINES',
      inputPostalCode?.toString()
    ].filter(Boolean);

    setFullAddress(addressParts.join(', '));

  }, [selectedRegion, selectedProvince, selectedCityMunicipality,
    selectedBarangay, inputStreetAddress, inputPostalCode,
    regions, provinces, cityMunicipalities, barangays]);

  // Convert the floor plan data to the format ShelfSelector3D expects
  const getFloorConfigs = () => {
    return companyLayout.map((floor) => ({
      height: floor.height,
      matrix: floor.matrix
    }));
  };

  // Show loading state
  if (isLoading && !companyData) {
    return (
      <div className="container mx-auto max-w-4xl p-2">
        <div className='space-y-4'>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Edit Company</h1>
              <p className="text-default-500">Loading company information...</p>
            </div>
          </div>

          {/* Loading Skeletons */}
          <CardList>
            <div className="flex justify-center">
              <Skeleton className="h-10 w-64 rounded-lg" />
            </div>
          </CardList>

          {/* Company Logo Skeleton */}
          <CardList>
            <div className="flex flex-col items-center justify-center w-full mb-1">
              <Skeleton className="h-6 w-48 mx-auto rounded-lg mb-4" />
              <div className="flex flex-col items-center justify-center p-4 bg-default-100 mt-1 border border-default-200 rounded-xl w-full">
                <Skeleton className="rounded-xl w-48 h-48 mb-4" />
                <Skeleton className="h-4 w-52 rounded-lg mb-1 mt-2" />
                <Skeleton className="h-3 w-32 rounded-lg" />
              </div>
            </div>
          </CardList>

          {/* Other Skeletons */}
          <CardList>
            <div>
              <Skeleton className="h-6 w-48 mx-auto rounded-lg mb-4" />
              <div className="space-y-4">
                <Skeleton className="h-14 rounded-lg" />
                <Skeleton className="h-14 rounded-lg" />
              </div>
            </div>
          </CardList>

          <CardList>
            <div className="flex justify-center gap-4">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </CardList>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl p-2">
      <Form className="space-y-4 items-center w-full" onSubmit={handleSubmit}
        onInvalid={(error) => {
          setError("Please fill out all required fields.")
          setIsSaving(false)
        }}>
        <div className="space-y-4 w-full">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Edit Company</h1>
              <p className="text-default-500">Update your company information.</p>
            </div>
          </div>

          <CardList>
            <div>
              <div className="flex flex-col items-center justify-center w-full">
                <h3 className="text-xl font-semibold mb-4">Company Logo</h3>
                <Button
                  variant='faded'
                  className={`flex border-default-200 hover:border-default-400 flex-col space-y-2 items-center justify-center p-2 cursor-pointer w-full h-full p-4
                                  ${logoPreview ? 'bg-default-100 hover:bg-default-200' : 'bg-danger-50'}
                                  `}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoPreview ? (
                    <Image isBlurred src={logoPreview} alt="Logo preview" className="w-48 h-48 object-cover" />
                  ) : (
                    <BuildingOfficeIcon className="h-16 w-16 text-default-500" />
                  )}
                  <div className="text-center">
                    <p>Click to upload company logo</p>
                    <p className="text-default-500 text-xs">Max size: 2MB</p>
                  </div>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                  name="logoImage"
                />
              </div>

              <div className="space-y-4 mt-4">
                <Input
                  id="name"
                  name="name"
                  label="Company Name"
                  type="text"
                  classNames={inputStyle}
                  defaultValue={companyData?.name || ''}
                  isRequired
                />

                <Input
                  id="description"
                  name="description"
                  label="Company Description"
                  type="text"
                  classNames={inputStyle}
                  defaultValue={companyData?.description || ''}
                />
              </div>
            </div>
          </CardList>
          <CardList>
            <div>
              <h3 className="text-xl font-semibold mb-4 w-full text-center">Company Address</h3>
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    id="address.country.desc"
                    name="address.country.desc"
                    label="Country"
                    defaultValue="PHILIPPINES"
                    classNames={inputStyle}
                    isRequired
                    isReadOnly
                    isDisabled={isLoading}
                  />
                  <Autocomplete
                    id="address.region.desc"
                    name="address.region.desc"
                    label="Region"
                    isRequired
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    onSelectionChange={(e) => handleRegionChange(`${e}`)}
                    defaultSelectedKey={companyData?.address?.region?.code || ''}
                    isDisabled={isLoading}
                  >
                    {regions.map(region => (
                      <AutocompleteItem key={region.regCode}>
                        {region.regDesc}
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Autocomplete
                    id="address.province.desc"
                    name="address.province.desc"
                    label="Province"
                    isRequired
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    onSelectionChange={(e) => handleProvinceChange(`${e}`)}
                    defaultSelectedKey={companyData?.address?.province?.code || ''}
                    isDisabled={!selectedRegion || isLoading}
                  >
                    {provinces.map(province => (
                      <AutocompleteItem key={province.provCode}>
                        {province.provDesc}
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                  <Autocomplete
                    id="address.municipality.desc"
                    name="address.municipality.desc"
                    label="Municipality/City"
                    isRequired
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    onSelectionChange={(e) => handleCityMunicipalityChange(`${e}`)}
                    defaultSelectedKey={companyData?.address?.municipality?.code || ''}
                    isDisabled={!selectedProvince || isLoading}
                  >
                    {cityMunicipalities.map(city => (
                      <AutocompleteItem key={city.citymunCode}>
                        {city.citymunDesc}
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Autocomplete
                    id="address.barangay.desc"
                    name="address.barangay.desc"
                    label="Barangay"
                    isRequired
                    inputProps={autoCompleteStyle}
                    classNames={{ clearButton: "text-default-800" }}
                    onSelectionChange={(e) => setSelectedBarangay(`${e}`)}
                    defaultSelectedKey={companyData?.address?.barangay?.code || ''}
                    isDisabled={!selectedCityMunicipality || isLoading}
                  >
                    {barangays.map(barangay => (
                      <AutocompleteItem key={barangay.brgyCode}>
                        {barangay.brgyDesc}
                      </AutocompleteItem>
                    ))}
                  </Autocomplete>
                  <Input
                    id="address.streetAddress"
                    name="address.streetAddress"
                    label="Street Address"
                    type="text"
                    classNames={inputStyle}
                    value={inputStreetAddress}
                    onValueChange={setInputStreetAddress}
                    isRequired
                    isDisabled={isLoading}
                  />
                </div>

                <div className="flex sm:flex-row flex-col gap-4">
                  <NumberInput
                    id="address.postalCode"
                    name="address.postalCode"
                    label="Postal Code"
                    className="md:w-[10rem]"
                    minValue={0}
                    classNames={inputStyle}
                    value={inputPostalCode}
                    onValueChange={setInputPostalCode}
                    formatOptions={{ useGrouping: false }}
                    hideStepper
                    isRequired
                    isDisabled={isLoading}
                  />
                  <Input
                    id="address.fullAddress"
                    name="address.fullAddress"
                    label="Full Address"
                    type="text"
                    value={fullAddress}
                    classNames={inputStyle}
                    isReadOnly
                    isRequired
                    isDisabled={isLoading}
                  />
                </div>
              </div>
            </div>
          </CardList>
          <CardList>
            <div>
              <div className="flex flex-col space-y-4">
                <h3 className="text-xl font-semibold mb-4 w-full text-center">Warehouse Layout</h3>
                <div className="flex justify-between items-center sm:flex-row flex-col gap-4 flex-col-reverse">
                  <ScrollShadow className="w-full" orientation="horizontal">
                    <div className="flex gap-4 pb-2 max-w-full">
                      {companyLayout.map((_, floorIndex) => (
                        <Button
                          key={floorIndex}
                          variant={currentFloor === floorIndex ? "shadow" : "flat"}
                          color={currentFloor === floorIndex ? "primary" : "default"}
                          onPress={() => setCurrentFloor(floorIndex)}
                          className="flex-shrink-0"
                        >
                          Floor {floorIndex + 1}
                        </Button>
                      ))}
                    </div>
                  </ScrollShadow>
                  <div className="flex gap-2">
                    <Button
                      color="primary"
                      size="sm"
                      variant="flat"
                      onPress={addFloor}
                      startContent={<PlusIcon className="w-4 h-4" />}
                    >
                      Add Floor
                    </Button>
                    {companyLayout.length > 1 && (
                      <Button
                        color="danger"
                        size="sm"
                        variant="flat"
                        onPress={() => removeFloor(currentFloor)}
                        startContent={<TrashIcon className="w-4 h-4" />}
                      >
                        Remove Floor
                      </Button>
                    )}
                  </div>
                </div>

                {companyLayout[currentFloor] && (
                  <div className="border border-default-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-lg font-medium">Floor {currentFloor + 1} Layout</h4>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <div className="w-4 h-4 bg-default-200"></div>
                          <span className="text-sm">Empty</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-4 h-4 bg-primary-400"></div>
                          <span className="text-sm">Container</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 items-center mb-4">
                      <div className="flex flex-wrap gap-2 mt-2">
                        <NumberInput
                          label="Rows"
                          className="w-32"
                          {...autoCompleteStyle}
                          minValue={1}
                          maxValue={100}
                          value={layoutRows}
                          onValueChange={(value) => {
                            if (value !== undefined) {
                              setLayoutRows(value);
                            }
                          }}
                        />
                        <NumberInput
                          label="Columns"
                          className="w-32"
                          {...autoCompleteStyle}
                          minValue={1}
                          maxValue={100}
                          value={layoutColumns}
                          onValueChange={(value) => {
                            if (value !== undefined) {
                              setLayoutColumns(value);
                            }
                          }}
                        />

                        <NumberInput
                          label="Max Height"
                          className="w-32"
                          {...autoCompleteStyle}
                          minValue={1}
                          maxValue={20}
                          value={companyLayout[currentFloor]?.height || 10}
                          onValueChange={(value) => {
                            if (value !== undefined) {
                              setFloorHeight(currentFloor, value);
                            }
                          }}
                        />

                        <NumberInput
                          label="Shelf Count"
                          className="w-32"
                          {...autoCompleteStyle}
                          minValue={1}
                          maxValue={companyLayout[currentFloor]?.height || 10}
                          value={selectedCellValue}
                          onValueChange={(value) => {
                            if (value !== undefined) {
                              setSelectedCellValue(value);
                              setShelvesForSelection(value);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="overflow-auto max-h-[400px] border border-default-200 rounded-lg">
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${layoutColumns}, 1fr)`,
                          gap: '1px',
                          userSelect: 'none', // Add this to prevent text selection
                          WebkitUserSelect: 'none', // For Safari compatibility
                          MozUserSelect: 'none', // For Firefox compatibility
                          msUserSelect: 'none' // For IE compatibility
                        }}
                        className="select-none" // Adding Tailwind's select-none class for double safety
                      >
                        {companyLayout[currentFloor]?.matrix.map((row, rowIndex) => (
                          row.map((cell, colIndex) => {
                            const isSelected = selectedCells[`${rowIndex}-${colIndex}`] === true

                            return (
                              <div
                                key={`${rowIndex}-${colIndex}`}
                                data-row={rowIndex}
                                data-col={colIndex}
                                className={`
                                  w-6 h-6 flex items-center justify-center text-xs
                                  ${cell > 0 ? 'bg-primary-400 hover:bg-primary-300' : 'bg-default-200 hover:bg-default-300'}
                                  ${isSelected ? 'ring-2 ring-primary-500 cell-selected bg-default-300' : ''}
                                  cursor-pointer transition-all
                                `}
                                onMouseDown={(e) => handleCellClick(rowIndex, colIndex, e)}
                                onMouseEnter={(e) => handleCellDrag(rowIndex, colIndex, e)}
                                title={`Row ${rowIndex + 1}, Column ${colIndex + 1}: ${cell > 0 ? `${cell} shelves` : 'Empty'}`}
                              >
                                {cell > 0 && cell}
                              </div>
                            )
                          })
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-4">
                      <Popover showArrow offset={10} placement="bottom">
                        <PopoverTrigger>
                          <Button className="capitalize" color="warning" variant="flat">
                            <Icon
                              icon="heroicons:question-mark-circle-solid"
                              className="w-4 h-4 mr-1"
                            />
                            Help
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-4 max-w-xs">
                          <div className="flex items-center gap-2 mb-4">
                            <Icon
                              icon="heroicons:question-mark-circle-solid"
                              className="w-5 h-5"
                              width={20}
                            />
                            <h3 className="font-semibold text-lg">Warehouse Layout Help</h3>
                          </div>

                          <div className="space-y-2 text-sm">
                            <div className="flex items-start gap-2">
                              <Icon icon="heroicons:cursor-arrow-rays" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                              <p>Click or drag to toggle between container and empty space</p>
                            </div>

                            <div className="flex items-start gap-2">
                              <Icon icon="heroicons:arrow-top-right-on-square" className="w-4 h-4 mt-0.5 flex-shrink-0 text-success-600" />
                              <p>Hold <strong>Shift</strong> and drag to select multiple cells for adding shelves</p>
                            </div>

                            <div className="flex items-start gap-2">
                              <Icon icon="heroicons:trash" className="w-4 h-4 mt-0.5 flex-shrink-0 text-danger-600" />
                              <p>Hold <strong>Ctrl</strong> and drag to select and clear multiple cells</p>
                            </div>

                            <div className="flex items-start gap-2">
                              <Icon icon="heroicons:building-office" className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
                              <p>Each floor has a maximum shelf height that applies to all containers on that floor</p>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Button
                        color="secondary"
                        variant="flat"
                        onPress={onOpen}
                        startContent={<Icon icon="mdi:eye" className="w-4 h-4" />}
                        isDisabled={companyLayout.length === 0}
                      >
                        Preview 3D Floorplan
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardList>

          {/* Update Options */}
          <CardList>
            <div>
              <h2 className="text-xl font-semibold mb-4 w-full text-center">Company Update Options</h2>

              <AnimatePresence>
                {error && (
                  <motion.div
                    {...motionTransition}>
                    <Alert color="danger" variant="solid" title="Error"
                      endContent={
                        <Button
                          aria-label="close error alert"
                          className="focus:outline-none my-[-0.25rem] mr-[-0.4rem]"
                          type="button"
                          color="danger"
                          radius='full'
                          isIconOnly
                          onPress={() => setError(null)}>
                          <XMarkIcon className="h-4 w-4" />
                        </Button>
                      }>
                      {error}
                    </Alert>
                    <div className='h-4' />
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {success && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)", height: 0 }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)", height: "auto" }}
                    exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)", height: 0 }}
                    transition={{
                      duration: 0.3,
                      type: "spring",
                      stiffness: 300,
                      damping: 20,
                    }}
                    className="mb-4 p-1">
                    <Alert color="success" variant="solid" title="Success" onClose={() => setSuccess(false)}>
                      Company information has been updated successfully.
                    </Alert>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-center gap-4">
                <Button
                  type="button"
                  color="danger"
                  variant="shadow"
                  size="lg"
                  className="w-full"
                  onPress={handleDiscardChanges}
                  disabled={isSaving}
                >
                  Discard Changes
                </Button>
                <Button
                  type="submit"
                  color="primary"
                  variant="shadow"
                  size="lg"
                  className="w-full"
                  isLoading={isSaving}
                  disabled={isSaving}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </CardList>
        </div>
      </Form>

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
          <ModalHeader>Interactive Warehouse Floorplan Preview</ModalHeader>
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
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.shelfSelectedColor }}></div>
                      <span className="text-xs">Selected Shelf</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.occupiedShelfColor }}></div>
                      <span className="text-xs">Occupied Shelf</span>
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