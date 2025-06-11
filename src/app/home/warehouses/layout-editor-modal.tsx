'use client';

import { FloorConfig, ShelfSelector3D } from '@/components/shelf-selector-3d';
import { motionTransition, popoverTransition } from '@/utils/anim';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/solid';
import {
  Accordion,
  AccordionItem,
  Alert,
  Button,
  Kbd,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollShadow,
  Spinner,
  Tab,
  Tabs
} from "@heroui/react";
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { AnimatePresence, motion } from 'framer-motion';
import React, { Suspense, useEffect, useState } from 'react';
import CustomScrollbar from '@/components/custom-scrollbar';
import { herouiColor } from '@/utils/colors';


interface WarehouseLayoutEditorProps {
  isOpen: boolean;
  onClose: () => void;
  initialLayout: FloorConfig[];
  openedTab?: "editor" | "preview";
  onSave: (layout: FloorConfig[]) => void;
}

export default function WarehouseLayoutEditorModal({
  isOpen,
  onClose,
  initialLayout,
  openedTab,
  onSave
}: WarehouseLayoutEditorProps) {
  // Layout state
  const [warehouseLayout, setWarehouseLayout] = useState<FloorConfig[]>([]);
  const [currentFloor, setCurrentFloor] = useState(0);
  const [layoutRows, setLayoutRows] = useState(17);
  const [layoutColumns, setLayoutColumns] = useState(33);
  const [selectedCellValue, setSelectedCellValue] = useState(5);

  // Selection state
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ row: number, col: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ row: number, col: number } | null>(null);
  const [selectedCells, setSelectedCells] = useState<{ [key: string]: boolean }>({});
  const [dragMode, setDragMode] = useState<'add' | 'remove' | null>(null);

  // Status state
  const [error, setError] = useState<string | null>(null);

  // Tab state for switching between editor and 3D preview
  const [activeTab, setActiveTab] = useState<"editor" | "preview">(openedTab || "editor");
  const [showControls, setShowControls] = useState(false);

  // Handle tab change
  useEffect(() => {
    if (openedTab) {
      setActiveTab(openedTab);
    }
  }, [openedTab]);

  // Initialize layout from props
  useEffect(() => {
    if (initialLayout && initialLayout.length > 0) {
      setWarehouseLayout(JSON.parse(JSON.stringify(initialLayout)));

      // Set rows/columns based on the loaded data
      if (initialLayout[0]?.matrix?.length > 0) {
        setLayoutRows(initialLayout[0].matrix.length);
        setLayoutColumns(initialLayout[0].matrix[0].length);
      }
    } else {
      initializeNewLayout();
    }
  }, [initialLayout, isOpen]);

  // Layout management functions
  const initializeMatrix = (rows: number, cols: number) => {
    return Array(rows).fill(0).map(() => Array(cols).fill(0));
  };

  const initializeNewLayout = () => {
    const floors = 1;
    const newLayout: FloorConfig[] = Array(floors).fill(0).map(() => ({
      height: 5, // Default max shelf height
      matrix: initializeMatrix(layoutRows, layoutColumns)
    }));
    setWarehouseLayout(newLayout);
  };

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
  };

  const updateLayoutSize = () => {
    setWarehouseLayout(prev => prev.map(floor => ({
      height: floor.height,
      matrix: resizeMatrix(floor.matrix, layoutRows, layoutColumns)
    })));
  };

  // Automatically update grid size when rows or columns change
  useEffect(() => {
    if (warehouseLayout.length > 0) {
      updateLayoutSize();
    }
  }, [layoutRows, layoutColumns]);

  const addFloor = () => {
    setWarehouseLayout(prev => [
      ...prev,
      {
        height: 5, // Default max shelf height
        matrix: initializeMatrix(layoutRows, layoutColumns)
      }
    ]);
    setCurrentFloor(warehouseLayout.length);
  };

  const removeFloor = (floorIndex: number) => {
    if (warehouseLayout.length <= 1) {
      setError("Cannot remove the last floor. A minimum of 1 floor is required.");
      return;
    }

    setWarehouseLayout(prev => prev.filter((_, i) => i !== floorIndex));

    if (currentFloor >= warehouseLayout.length - 1) {
      setCurrentFloor(Math.max(0, warehouseLayout.length - 2));
    }
  };

  const setFloorHeight = (index: number, height: number) => {
    if (height < 1) return;

    setWarehouseLayout(prev => {
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
  };

  // Selection and cell manipulation functions
  const clearSelection = () => {
    setSelectedCells({});
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  const updateSelection = (startRow: number, startCol: number, endRow: number, endCol: number) => {
    // Calculate the actual start and end indices
    const [minRow, maxRow] = [Math.min(startRow, endRow), Math.max(startRow, endRow)];
    const [minCol, maxCol] = [Math.min(startCol, endCol), Math.max(startCol, endCol)];

    // Create a new selection object
    const newSelectedCells: { [key: string]: boolean } = {};

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        newSelectedCells[`${r}-${c}`] = true;
      }
    }

    setSelectedCells(newSelectedCells);
  };

  const applyValueToSelection = (value: number) => {
    if (Object.keys(selectedCells).length === 0) return;

    setWarehouseLayout(prev => {
      const newLayout = [...prev];
      // Create a deep copy of the current floor
      newLayout[currentFloor] = {
        ...newLayout[currentFloor],
        matrix: newLayout[currentFloor].matrix.map(row => [...row])
      };

      // Set value for all selected cells
      Object.keys(selectedCells).forEach(key => {
        const [rowIndex, colIndex] = key.split('-').map(Number);

        // Ensure the value doesn't exceed the floor's maximum height
        const safeValue = Math.min(value, newLayout[currentFloor].height);
        newLayout[currentFloor].matrix[rowIndex][colIndex] = safeValue;
      });

      return newLayout;
    });
  };

  const setShelvesForSelection = (value: number) => {
    if (Object.keys(selectedCells).length === 0) return;
    applyValueToSelection(value);
  };

  const setCellValue = (rowIndex: number, colIndex: number, value: number) => {
    setWarehouseLayout(prev => {
      const newLayout = [...prev];
      // Create a deep copy of the current floor
      newLayout[currentFloor] = {
        ...newLayout[currentFloor],
        matrix: newLayout[currentFloor].matrix.map(row => [...row])
      };

      newLayout[currentFloor].matrix[rowIndex][colIndex] = Math.min(value, newLayout[currentFloor].height);
      return newLayout;
    });
  };

  // Mouse and keyboard event handlers
  const handleCellClick = (rowIndex: number, colIndex: number, event: React.MouseEvent) => {
    // Prevent default browser behavior to stop text selection
    event.preventDefault();

    // If shift is pressed, start selection
    if (isShiftPressed) {
      setSelectionStart({ row: rowIndex, col: colIndex });
      setSelectionEnd({ row: rowIndex, col: colIndex });
      updateSelection(rowIndex, colIndex, rowIndex, colIndex);
      return;
    }

    // If ctrl is pressed, start a removal selection
    if (isCtrlPressed) {
      setSelectionStart({ row: rowIndex, col: colIndex });
      setSelectionEnd({ row: rowIndex, col: colIndex });
      updateSelection(rowIndex, colIndex, rowIndex, colIndex);
      // Immediately set selected cell to 0
      setWarehouseLayout(prev => {
        const newLayout = [...prev];
        newLayout[currentFloor] = {
          ...newLayout[currentFloor],
          matrix: newLayout[currentFloor].matrix.map(row => [...row])
        };
        newLayout[currentFloor].matrix[rowIndex][colIndex] = 0;
        return newLayout;
      });
      return;
    }

    // Determine the drag mode based on the current cell value
    const currentValue = warehouseLayout[currentFloor].matrix[rowIndex][colIndex];
    setDragMode(currentValue > 0 ? 'remove' : 'add');

    // Regular click behavior (toggle cell value)
    setWarehouseLayout(prev => {
      const newLayout = [...prev];
      // Create a deep copy of the current floor
      newLayout[currentFloor] = {
        ...newLayout[currentFloor],
        matrix: newLayout[currentFloor].matrix.map(row => [...row])
      };

      const currentValue = newLayout[currentFloor].matrix[rowIndex][colIndex];
      // Toggle value: 0 if it has a value, otherwise set to selected value
      newLayout[currentFloor].matrix[rowIndex][colIndex] =
        currentValue > 0 ? 0 : Math.min(selectedCellValue, newLayout[currentFloor].height);

      return newLayout;
    });

    // Clear any existing selection
    if (!isCtrlPressed) {
      clearSelection();
    }
  };

  const handleCellDrag = (rowIndex: number, colIndex: number, event: React.MouseEvent) => {
    // Prevent default browser behavior to stop text selection
    event.preventDefault();

    // Selection in progress with shift key
    if (isShiftPressed && selectionStart) {
      setSelectionEnd({ row: rowIndex, col: colIndex });
      updateSelection(selectionStart.row, selectionStart.col, rowIndex, colIndex);
      return;
    }

    // Selection in progress with ctrl key - immediately set cells to 0
    if (isCtrlPressed && selectionStart) {
      setSelectionEnd({ row: rowIndex, col: colIndex });
      updateSelection(selectionStart.row, selectionStart.col, rowIndex, colIndex);

      // Immediately set the cell to 0
      setWarehouseLayout(prev => {
        const newLayout = [...prev];
        newLayout[currentFloor] = {
          ...newLayout[currentFloor],
          matrix: newLayout[currentFloor].matrix.map(row => [...row])
        };
        newLayout[currentFloor].matrix[rowIndex][colIndex] = 0;
        return newLayout;
      });
      return;
    }

    // Regular drag behavior (set cells as you drag)
    if (event.buttons === 1 && !isCtrlPressed && !isShiftPressed) { // Left mouse button is pressed
      setWarehouseLayout(prev => {
        const newLayout = [...prev];
        newLayout[currentFloor] = {
          ...newLayout[currentFloor],
          matrix: newLayout[currentFloor].matrix.map(row => [...row])
        };

        // Apply value based on the drag mode
        if (dragMode === 'add') {
          // Add mode: set to selected value
          newLayout[currentFloor].matrix[rowIndex][colIndex] =
            Math.min(selectedCellValue, newLayout[currentFloor].height);
        } else if (dragMode === 'remove') {
          // Remove mode: set to 0
          newLayout[currentFloor].matrix[rowIndex][colIndex] = 0;
        }

        return newLayout;
      });
    }
  };



  const [occupiedLocations, setOccupiedLocations] = useState<any[]>([]);

  // 3D shelf selector states
  const [tempSelectedFloor, setTempSelectedFloor] = useState<number | null>(null);
  const [tempSelectedColumnCode, setTempSelectedColumnCode] = useState<string>("");
  const [tempSelectedColumn, setTempSelectedColumn] = useState<number | null>(null);
  const [tempSelectedRow, setTempSelectedRow] = useState<number | null>(null);
  const [tempSelectedGroup, setTempSelectedGroup] = useState<number | null>(null);
  const [tempSelectedCode, setTempSelectedCode] = useState("");
  const [tempSelectedDepth, setTempSelectedDepth] = useState<number | null>(null);


  // Shelf selector states
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(null);
  const [isSelectedLocationOccupied, setIsSelectedLocationOccupied] = useState(false);
  const [externalSelection, setExternalSelection] = useState<any | undefined>(undefined);

  // Add state for maximum values
  const [maxGroupId, setMaxGroupId] = useState(0);
  const [maxRow, setMaxRow] = useState(0);
  const [maxColumn, setMaxColumn] = useState(0);
  const [maxDepth, setMaxDepth] = useState(0);


  // Convert column to Excel style (AA = 0, AB = 1, etc.)
  const parseColumn = (column: number | null) => {
    if (column === null || column === undefined) return null;

    const firstChar = String.fromCharCode(65 + Math.floor(column / 26));
    const secondChar = String.fromCharCode(65 + (column % 26));
    const colStr = column !== undefined && column !== null ?
      firstChar + secondChar :
      null;
    return colStr;
  }


  const formatCode = (location: any | any) => {
    // Format the location code
    const { floor, group, row, column, depth = 0 } = location;
    const colStr = parseColumn(column);

    // Format with leading zeros: floor (2 digits), row (2 digits), depth (2 digits), group (2 digits)
    const floorStr = floor !== undefined && floor !== null ?
      floor.toString().padStart(2, '0') : "00";
    const rowStr = row !== undefined && row !== null ?
      row.toString().padStart(2, '0') : "??";
    const groupStr = group !== undefined && group !== null ?
      group.toString().padStart(2, '0') : "??";
    const depthStr = depth !== undefined && depth !== null ?
      depth.toString().padStart(2, '0') : "??";

    return `F${floorStr}${colStr}${rowStr}D${depthStr}C${groupStr}`;
  }


  const checkIfLocationOccupied = (location: any) => {
    return occupiedLocations.some(
      loc =>
        loc.floor === location.floor &&
        loc.group === location.group &&
        loc.row === location.row &&
        loc.column === location.column &&
        loc.depth === location.depth
    );
  };

  // Update the handle functions to check for occupation after selection and use formatCode
  const updateLocationOccupiedStatus = () => {
    if (highlightedFloor !== null && tempSelectedGroup !== null &&
      tempSelectedRow !== null && tempSelectedColumn !== null) {
      const location = {
        floor: highlightedFloor,
        group: tempSelectedGroup,
        row: tempSelectedRow,
        column: tempSelectedColumn,
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0
      };
      setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
    }
  };

  /* 3D Shelf Selector */

  const handleShelfSelection = (location: any) => {
    const floorNumber = location.floor || 0;
    const columnNumber = location.column || 0;
    const columnCode = String.fromCharCode(65 + (columnNumber || 0));
    const rowNumber = location.row || 0;
    const groupNumber = location.group || 0;
    const depthNumber = location.depth || 0;

    // Update temporary selections with numerical values
    setTempSelectedFloor(floorNumber);
    setTempSelectedColumn(columnNumber);
    setTempSelectedColumnCode(columnCode);
    setTempSelectedRow(rowNumber);
    setTempSelectedGroup(groupNumber);
    setTempSelectedDepth(depthNumber);

    // Use formatCode for consistent code formatting
    setTempSelectedCode(formatCode(location));

    // Set the highlighted floor
    setHighlightedFloor(location.floor || 0);

    // Update maximum values if available
    if (location.max_group !== undefined) setMaxGroupId(location.max_group);
    if (location.max_row !== undefined) setMaxRow(location.max_row);
    if (location.max_column !== undefined) setMaxColumn(location.max_column);
    if (location.max_depth !== undefined) setMaxDepth(location.max_depth);

    // Check if location is occupied
    setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
  };

  const handleFloorChange = (floorNum: number) => {
    const floorIndex = floorNum - 1;
    setTempSelectedFloor(floorIndex);
    setHighlightedFloor(floorIndex);

    if (tempSelectedGroup !== null) {
      const location = {
        floor: floorIndex,
        group: tempSelectedGroup,
        row: tempSelectedRow !== null ? tempSelectedRow : 0,
        column: tempSelectedColumn !== null ? tempSelectedColumn : 0,
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0
      };
      setExternalSelection(location);

      // Use formatCode for consistent formatting
      setTempSelectedCode(formatCode(location));

      // Check if new location is occupied
      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleGroupChange = (groupId: number) => {
    const adjustedId = groupId - 1;
    setTempSelectedGroup(adjustedId);

    if (tempSelectedFloor !== null && highlightedFloor !== null) {
      const location = {
        floor: highlightedFloor,
        group: adjustedId,
        row: tempSelectedRow !== null ? tempSelectedRow : 0,
        column: tempSelectedColumn !== null ? tempSelectedColumn : 0,
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0
      };
      setExternalSelection(location);

      setTempSelectedCode(formatCode(location));
      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleRowChange = (rowNum: number) => {
    const adjustedRow = rowNum - 1;
    setTempSelectedRow(adjustedRow);

    if (tempSelectedFloor !== null && highlightedFloor !== null && tempSelectedGroup !== null) {
      const location = {
        floor: highlightedFloor,
        group: tempSelectedGroup,
        row: adjustedRow,
        column: tempSelectedColumn !== null ? tempSelectedColumn : 0,
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0
      };
      setExternalSelection(location);

      setTempSelectedCode(formatCode(location));
      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleColumnChange = (colNum: number) => {
    const adjustedCol = colNum - 1;
    const colLetter = String.fromCharCode(64 + colNum);

    setTempSelectedColumn(adjustedCol);
    setTempSelectedColumnCode(colLetter);

    if (tempSelectedFloor !== null && highlightedFloor !== null && tempSelectedGroup !== null) {
      const location = {
        floor: highlightedFloor,
        group: tempSelectedGroup,
        row: tempSelectedRow !== null ? tempSelectedRow : 0,
        column: adjustedCol,
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0
      };
      setExternalSelection(location);

      setTempSelectedCode(formatCode(location));
      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleDepthChange = (depthNum: number) => {
    const adjustedDepth = depthNum - 1;
    setTempSelectedDepth(adjustedDepth);

    if (tempSelectedFloor !== null && highlightedFloor !== null && tempSelectedGroup !== null) {
      const location = {
        floor: highlightedFloor,
        group: tempSelectedGroup,
        row: tempSelectedRow !== null ? tempSelectedRow : 0,
        column: tempSelectedColumn !== null ? tempSelectedColumn : 0,
        depth: adjustedDepth
      };
      setExternalSelection(location);

      setTempSelectedCode(formatCode(location));
      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  // Track shift key press/release
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
      if (e.key === 'Control' || e.key === 'Meta') { // Also support Meta key (Cmd on Mac)
        setIsCtrlPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
        // Clear selection when shift is released
        if (!selectionEnd) {
          clearSelection();
        }
      }
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsCtrlPressed(false);
        // Clear selection when ctrl/meta is released
        if (!selectionEnd) {
          clearSelection();
        }
      }
    };

    // Clear selection when mouse is released anywhere
    const handleMouseUp = () => {
      if (selectionStart && selectionEnd) {
        // Apply selected value to all selected cells
        applyValueToSelection(isCtrlPressed ? 0 : selectedCellValue);
        // Keep the selection visible but reset the active selection process
        setSelectionStart(null);
        setSelectionEnd(null);
      }
      // Reset drag mode when mouse is released
      setDragMode(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectionStart, selectionEnd, selectedCellValue, isCtrlPressed]);

 

  const inputStyle = { inputWrapper: "border-2 border-default-200 hover:border-default-400 !transition-all duration-200" };
  const autoCompleteStyle = { classNames: inputStyle };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      classNames={{
        base: "h-[calc(100vh)] sm:h-[calc(100vh-64px)]",
        wrapper: "overflow-hidden",
        backdrop: "bg-background/50",
      }}
      backdrop="blur"
    >
      <ModalContent>
        <ModalHeader>
          <div className="flex flex-col">
            <h2 className="text-xl font-semibold">Edit Warehouse Layout</h2>
            <p className="text-xs text-default-500">
              Design the shelf layout for your warehouse
            </p>
          </div>
        </ModalHeader>

        <ModalBody className="flex flex-col gap-4">
          {error && (
            <Alert
              color="danger"
              variant="flat"
              className="mb-4"
              onClose={() => setError(null)}
            >
              {error}
            </Alert>
          )}

          {activeTab === "editor" ? (
            <div className="flex-1 flex flex-col gap-4">
              {warehouseLayout[currentFloor] && (
                <div className="border border-default-200 rounded-lg p-4 flex flex-1 flex-col">
                  { /* Layout editor header */}
                  <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h4 className="text-lg font-medium">Layout Editor</h4>
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
                      {warehouseLayout.length > 1 && (
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

                  {/* Layout controls */}
                  <div className="flex-shrink-0 w-full">
                    <CustomScrollbar direction='horizontal'
                      hideScrollbars
                      scrollShadow scrollShadowColor={herouiColor('content1', 'hex') as string}>
                      <div className="gap-2 mb-4 flex">
                        <NumberInput
                          label="Rows"
                          className="w-32 flex-shrink-0"
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
                          className="w-32 flex-shrink-0"
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
                          className="w-32 flex-shrink-0"
                          {...autoCompleteStyle}
                          minValue={1}
                          maxValue={20}
                          value={warehouseLayout[currentFloor]?.height || 10}
                          onValueChange={(value) => {
                            if (value !== undefined) {
                              setFloorHeight(currentFloor, value);
                            }
                          }}
                        />

                        <NumberInput
                          label="Shelf Count"
                          className="w-32 flex-shrink-0"
                          {...autoCompleteStyle}
                          minValue={1}
                          maxValue={warehouseLayout[currentFloor]?.height || 10}
                          value={selectedCellValue}
                          onValueChange={(value) => {
                            if (value !== undefined) {
                              setSelectedCellValue(value);
                              setShelvesForSelection(value);
                            }
                          }}
                        />
                      </div>
                    </CustomScrollbar>
                  </div>

                  {/* Layout grid */}
                  <div className="flex-1 overflow-auto border border-default-200 rounded-lg max-h-[calc(100vh-438px)] sm:max-h-[calc(100vh-442px)]">
                    <CustomScrollbar direction='both'
                      scrollShadow scrollShadowColor={herouiColor('content1', 'hex') as string}>
                      <div className="w-full h-full flex items-center justify-center min-w-fit min-h-fit">
                        <div className="inline-block">
                          {warehouseLayout[currentFloor]?.matrix.map((row, rowIndex) => (
                            <div key={rowIndex} className="flex gap-[2px] mb-[2px]">
                              {row.map((cell, colIndex) => {
                                const isSelected = selectedCells[`${rowIndex}-${colIndex}`] === true;

                                return (
                                  <div
                                    key={`${rowIndex}-${colIndex}`}
                                    data-row={rowIndex}
                                    data-col={colIndex}
                                    className={`
                            w-6 h-6 flex items-center justify-center text-xs flex-shrink-0
                            ${cell > 0 ? 'bg-primary-400 hover:bg-primary-300' : 'bg-default-200 hover:bg-default-300'}
                            ${isSelected ? 'ring-2 ring-primary-500 cell-selected bg-default-300' : ''}
                            cursor-pointer transition-all select-none
                            `}
                                    style={{
                                      userSelect: 'none',
                                      WebkitUserSelect: 'none',
                                      MozUserSelect: 'none',
                                      msUserSelect: 'none'
                                    }}
                                    onMouseDown={(e) => handleCellClick(rowIndex, colIndex, e)}
                                    onMouseEnter={(e) => handleCellDrag(rowIndex, colIndex, e)}
                                    title={`Row ${rowIndex + 1}, Column ${colIndex + 1}: ${cell > 0 ? `${cell} shelves` : 'Empty'}`}
                                  >
                                    {cell > 0 && cell}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </CustomScrollbar>
                  </div>

                  {/* Selection controls */}
                  <div className="flex justify-between items-center mt-4 flex-shrink-0">
                    <Popover
                      classNames={{ content: "!backdrop-blur-lg bg-background/65" }}
                      motionProps={popoverTransition(false)}
                      placement="top">
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
                        <div className="flex items-center gap-2 mb-2">
                          <Icon icon="heroicons:question-mark-circle" className="w-5 h-5 text-warning-500" />
                          <h3 className="font-semibold text-lg">Layout Help</h3>
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
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-default-200 rounded-full"></div>
                            <span className="text-sm">Indicates that the cell is empty</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-primary-400 rounded-full"></div>
                            <span className="text-sm">
                              Indicates that the cell contains a container
                            </span>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <div className="flex items-center gap-4">
                      <span className="text-sm">Current Floor</span>
                      <Pagination
                        classNames={{ item: "bg-default/25" }}
                        initialPage={1}
                        size="sm"
                        page={currentFloor + 1}
                        total={warehouseLayout.length}
                        onChange={(e) => setCurrentFloor(e - 1)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 border border-default-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-medium mt-1">3D Warehouse Preview</h4>
              </div>

              <div className="relative sm:h-[calc(100vh-370px)] h-[calc(100vh-366px)] w-full border border-default-200 rounded-lg overflow-hidden">
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full">
                    <Spinner size="lg" color="primary" />
                    <span className="ml-2">Loading 3D viewer...</span>
                  </div>
                }>
                  <ShelfSelector3D
                    floors={warehouseLayout}
                    onSelect={handleShelfSelection}
                    occupiedLocations={occupiedLocations}
                    canSelectOccupiedLocations={false}
                    className="w-full h-full"
                    highlightedFloor={highlightedFloor}
                    onHighlightFloor={setHighlightedFloor}
                    externalSelection={externalSelection}
                    cameraOffsetY={-0.25}
                  />
                </Suspense>



                {/* Shelf controls */}
                <AnimatePresence>
                  {tempSelectedCode && showControls &&
                    <motion.div {...motionTransition}
                      className="absolute overflow-hidden bottom-4 left-4 flex flex-col gap-2 bg-background/50 rounded-2xl backdrop-blur-lg w-auto">
                      <div className="grid md:grid-cols-2 grid-cols-1 gap-3 p-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-16">Floor</span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleFloorChange(Math.max(1, ((externalSelection?.floor || 0) + 1) - 1))}
                                isDisabled={(externalSelection?.floor || 0) <= 0}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-left" className="text-sm" />
                              </Button>
                              <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                                {(externalSelection?.floor || 0) + 1}
                              </div>
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleFloorChange(Math.min(warehouseLayout.length, ((externalSelection?.floor || 0) + 1) + 1))}
                                isDisabled={(externalSelection?.floor || 0) + 1 >= warehouseLayout.length}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-right" className="text-sm" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-16">Group</span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleGroupChange(Math.max(1, ((externalSelection?.group || 0) + 1) - 1))}
                                isDisabled={(externalSelection?.group || 0) <= 0}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-left" className="text-sm" />
                              </Button>
                              <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                                {(externalSelection?.group || 0) + 1}
                              </div>
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleGroupChange(Math.min(maxGroupId + 1, ((externalSelection?.group || 0) + 1) + 1))}
                                isDisabled={(externalSelection?.group || 0) + 1 > maxGroupId}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-right" className="text-sm" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 md:pl-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-16">Row</span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleRowChange(Math.max(1, ((externalSelection?.row || 0) + 1) - 1))}
                                isDisabled={(externalSelection?.row || 0) <= 0}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-left" className="text-sm" />
                              </Button>
                              <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                                {(externalSelection?.row || 0) + 1}
                              </div>
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleRowChange(Math.min(maxRow + 1, ((externalSelection?.row || 0) + 1) + 1))}
                                isDisabled={(externalSelection?.row || 0) + 1 > maxRow}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-right" className="text-sm" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-16">Column</span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleColumnChange(Math.max(1, ((externalSelection?.column || 0) + 1) - 1))}
                                isDisabled={(externalSelection?.column || 0) <= 0}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-left" className="text-sm" />
                              </Button>
                              <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                                {parseColumn((externalSelection?.column || 0) + 1) || ""}
                              </div>
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleColumnChange(Math.min(maxColumn + 1, ((externalSelection?.column || 0) + 1) + 1))}
                                isDisabled={(externalSelection?.column || 0) + 1 > maxColumn}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-right" className="text-sm" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 md:mb-0 mb-10">
                            <span className="text-sm font-semibold w-16">Depth</span>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleDepthChange(Math.max(1, ((externalSelection?.depth || 0) + 1) - 1))}
                                isDisabled={(externalSelection?.depth || 0) <= 0}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-left" className="text-sm" />
                              </Button>
                              <div className="bg-default-100 px-3 h-8 rounded-md flex items-center justify-center w-14">
                                {(externalSelection?.depth || 0) + 1}
                              </div>
                              <Button
                                size="sm"
                                isIconOnly
                                onPress={() => handleDepthChange(Math.min(maxDepth + 1, ((externalSelection?.depth || 0) + 1) + 1))}
                                isDisabled={(externalSelection?.depth || 0) + 1 > maxDepth}
                                className="min-w-8 h-8"
                              >
                                <Icon icon="mdi:chevron-right" className="text-sm" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  }
                </AnimatePresence>

                <AnimatePresence>
                  {(tempSelectedCode || showControls) &&
                    <motion.div {...motionTransition}
                      className={`absolute overflow-hidden ${showControls ? "bottom-8 left-8 h-8 shadow-sm" : "bottom-4 left-4 h-10 shadow-lg"} w-[12.6rem] bg-default-200/50 rounded-xl backdrop-blur-lg z-10 transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]`}>
                      <Button
                        onPress={() => setShowControls(!showControls)}
                        color="default"
                        className={`flex items-center p-4  bg-transparent w-full !scale-100 ${showControls ? "h-8" : "h-10"} !transition-all !duration-500 duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]`}
                      >
                        <Icon icon="ic:round-control-camera" className="w-4 h-4" />
                        <span className="text-sm font-semibold">
                          {showControls ? "Hide Controls" : "Show Controls"}
                        </span>
                      </Button>
                    </motion.div>
                  }
                </AnimatePresence>

              </div>

              <div className="mt-4">
                <div className="flex justify-between mt-4">
                  <div className="flex gap-4">
                    <Popover
                      classNames={{ content: "!backdrop-blur-lg bg-background/65" }}
                      motionProps={popoverTransition(false)}
                      offset={10} placement="bottom">
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
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.floorColor }}></div>
                              <span className="text-xs">Floor</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.floorHighlightedColor }}></div>
                              <span className="text-xs">Selected Floor</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.groupColor }}></div>
                              <span className="text-xs">Group</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.groupSelectedColor }}></div>
                              <span className="text-xs">Selected Group</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.shelfColor }}></div>
                              <span className="text-xs">Shelf</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.shelfHoverColor }}></div>
                              <span className="text-xs">Hovered Shelf</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.shelfSelectedColor }}></div>
                              <span className="text-xs">Selected Shelf</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: window.shelfSelectorColors!.occupiedShelfColor }}></div>
                              <span className="text-xs">Occupied Shelf</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 text-xs text-default-500">
                          Tip: Use WASD and arrow keys for easiest navigation through the warehouse.
                        </div>
                      </PopoverContent>
                    </Popover>

                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">CODE: <b>{tempSelectedCode}</b></span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </ModalBody>

        <ModalFooter className="flex justify-between items-center sm:flex-row flex-col gap-4">
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(key) => setActiveTab(key as "editor" | "preview")}
            variant="bordered"
            color="primary"
          >
            <Tab key="editor" title="Layout Editor" />
            <Tab key="preview" title="3D Warehouse Preview" />
          </Tabs>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="flat"
              color="default"
              onPress={onClose}
              className="mr-2"
            >
              Cancel
            </Button>
            <Button
              color="primary"
              onPress={() => onSave(warehouseLayout)}
            >
              Apply Layout
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}