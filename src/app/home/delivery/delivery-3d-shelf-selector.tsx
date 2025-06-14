"use client";

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Spinner } from "@heroui/react";
import { Icon } from "@iconify/react";
import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense, useEffect, useState } from "react";

import { ShelfLocation, ShelfSelectorColorAssignment } from '@/components/shelf-selector-3d';
import { parseColumn } from '@/utils/floorplan';
import { motionTransition } from '@/utils/anim';
import { Popover3dNavigationHelp } from '@/components/popover-3dnavigation-help';

// Lazy load 3D component
const ShelfSelector3D = lazy(() =>
  import("@/components/shelf-selector-3d").then(mod => ({
    default: mod.ShelfSelector3D
  }))
);

interface Delivery3DShelfSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  floorConfigs: any[];
  occupiedLocations: any[];
  shelfColorAssignments: ShelfSelectorColorAssignment[];
  selectedLocation?: ShelfLocation;
  onLocationSelect: (location: ShelfLocation) => void;
  onLocationConfirm: (location: ShelfLocation) => void;
  isDeliveryProcessing: boolean;
  isAdmin: boolean;
}

export function Delivery3DShelfSelector({
  isOpen,
  onClose,
  floorConfigs,
  occupiedLocations,
  shelfColorAssignments,
  selectedLocation,
  onLocationSelect,
  onLocationConfirm,
  isDeliveryProcessing,
  isAdmin
}: Delivery3DShelfSelectorProps) {
  // 3D shelf selector states
  const [tempSelectedFloor, setTempSelectedFloor] = useState<number | null>(null);
  const [tempSelectedColumnCode, setTempSelectedColumnCode] = useState<string>("");
  const [tempSelectedColumn, setTempSelectedColumn] = useState<number | null>(null);
  const [tempSelectedRow, setTempSelectedRow] = useState<number | null>(null);
  const [tempSelectedGroup, setTempSelectedGroup] = useState<number | null>(null);
  const [tempSelectedDepth, setTempSelectedDepth] = useState<number | null>(null);
  const [tempSelectedCode, setTempSelectedCode] = useState<string>("");

  // Shelf selector states
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(null);
  const [isSelectedLocationOccupied, setIsSelectedLocationOccupied] = useState(false);
  const [externalSelection, setExternalSelection] = useState<ShelfLocation | undefined>(undefined);
  const [showControls, setShowControls] = useState(false);


  // Add state for maximum values
  const [maxGroupId, setMaxGroupId] = useState(0);
  const [maxRow, setMaxRow] = useState(0);
  const [maxColumn, setMaxColumn] = useState(0);
  const [maxDepth, setMaxDepth] = useState(0);

  // Initialize temporary selections when modal opens
  useEffect(() => {
    if (isOpen && selectedLocation) {
      setTempSelectedFloor(selectedLocation.floor ?? null);
      setTempSelectedColumn(selectedLocation.column ?? null);
      setTempSelectedColumnCode(parseColumn(selectedLocation.column ?? null) || "");
      setTempSelectedRow(selectedLocation.row ?? null);
      setTempSelectedDepth(selectedLocation.depth ?? null);
      setTempSelectedGroup(selectedLocation.group ?? null);
      setTempSelectedCode(selectedLocation.code || "");
      setExternalSelection(selectedLocation);

      if (selectedLocation.floor !== null && selectedLocation.floor !== undefined) {
        setHighlightedFloor(selectedLocation.floor);
      }
    }
  }, [isOpen, selectedLocation]);

  const checkIfLocationOccupied = (location: any) => {
    // Check if location is in occupied locations
    const isOccupied = occupiedLocations.some(
      loc =>
        loc.floor === location.floor &&
        loc.group === location.group &&
        loc.row === location.row &&
        loc.column === location.column &&
        loc.depth === location.depth
    );

    // Check if location is in shelf color assignments (selected for delivery)
    const isAssigned = shelfColorAssignments.some(
      assignment =>
        assignment.floor === location.floor &&
        assignment.group === location.group &&
        assignment.row === location.row &&
        assignment.column === location.column &&
        assignment.depth === location.depth
    );

    return isOccupied || isAssigned;
  };

  const updateLocationOccupiedStatus = () => {
    if (highlightedFloor !== null && tempSelectedGroup !== null &&
      tempSelectedRow !== null && tempSelectedColumn !== null) {
      const location = {
        floor: highlightedFloor,
        group: tempSelectedGroup,
        row: tempSelectedRow,
        column: tempSelectedColumn,
        depth: tempSelectedDepth,
        code: tempSelectedCode
      };
      setIsSelectedLocationOccupied(checkIfLocationOccupied(location));
    }
  };

  const handleShelfSelection = (location: ShelfLocation) => {
    if (location.max_group !== undefined) setMaxGroupId(location.max_group);
    if (location.max_row !== undefined) setMaxRow(location.max_row);
    if (location.max_column !== undefined) setMaxColumn(location.max_column);
    if (location.max_depth !== undefined) setMaxDepth(location.max_depth);

    const floorNumber = location.floor || 0;
    const columnNumber = location.column || 0;
    const columnCode = String.fromCharCode(65 + columnNumber);
    const rowNumber = location.row || 0;
    const groupNumber = location.group || 0;
    const depthNumber = location.depth || 0;
    const code = location.code || "";

    // Update temporary selections with numerical values
    setTempSelectedFloor(floorNumber);
    setTempSelectedColumn(columnNumber);
    setTempSelectedColumnCode(columnCode);
    setTempSelectedRow(rowNumber);
    setTempSelectedGroup(groupNumber);
    setTempSelectedDepth(depthNumber);
    setTempSelectedCode(code);

    // Set the highlighted floor
    setHighlightedFloor(location.floor || 0);

    // Check if location is occupied
    setIsSelectedLocationOccupied(checkIfLocationOccupied(location));

    setExternalSelection(location);
    onLocationSelect(location);
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
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0,
        code: tempSelectedCode
      };
      setExternalSelection(location);
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
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0,
        code: tempSelectedCode
      };
      setExternalSelection(location);
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
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0,
        code: tempSelectedCode
      };
      setExternalSelection(location);
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
        depth: tempSelectedDepth !== null ? tempSelectedDepth : 0,
        code: tempSelectedCode
      };
      setExternalSelection(location);
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
        depth: adjustedDepth,
        code: tempSelectedCode
      };
      setExternalSelection(location);
      setTimeout(updateLocationOccupiedStatus, 0);
    }
  };

  const handleConfirmLocation = () => {
    const location: ShelfLocation = {
      floor: tempSelectedFloor ?? undefined,
      column: tempSelectedColumn ?? undefined,
      row: tempSelectedRow ?? undefined,
      group: tempSelectedGroup ?? undefined,
      depth: tempSelectedDepth ?? undefined,
      code: tempSelectedCode
    };

    onLocationConfirm(location);
    onClose();
  };

  const handleCancelLocation = () => {
    // Reset to original selection
    if (selectedLocation) {
      setTempSelectedFloor(selectedLocation.floor ?? null);
      setTempSelectedColumn(selectedLocation.column ?? null);
      setTempSelectedColumnCode(parseColumn(selectedLocation.column ?? null) || "");
      setTempSelectedRow(selectedLocation.row ?? null);
      setTempSelectedDepth(selectedLocation.depth ?? null);
      setTempSelectedGroup(selectedLocation.group ?? null);
      setTempSelectedCode(selectedLocation.code || "");
    }
    onClose();
  };

  // Filter occupied locations to exclude current assignments
  const filteredOccupiedLocations = occupiedLocations.filter(loc =>
    !shelfColorAssignments.some(
      assignment =>
        assignment.floor === loc.floor &&
        assignment.group === loc.group &&
        assignment.row === loc.row &&
        assignment.column === loc.column &&
        assignment.depth === loc.depth
    )
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancelLocation}
      placement='auto'
      classNames={{ backdrop: "bg-background/50", wrapper: 'overflow-hidden' }}
      backdrop="blur"
      size="5xl"
    >
      <ModalContent>
        <ModalHeader>Interactive Warehouse Floorplan</ModalHeader>
        <ModalBody className='p-0'>
          <div className="h-[80vh] bg-primary-50 rounded-md overflow-hidden relative">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <Spinner size="lg" color="primary" />
                <span className="ml-2">Loading 3D viewer...</span>
              </div>
            }>
              <ShelfSelector3D
                floors={floorConfigs}
                onSelect={handleShelfSelection}
                occupiedLocations={filteredOccupiedLocations}
                canSelectOccupiedLocations={false}
                className="w-full h-full"
                highlightedFloor={highlightedFloor}
                onHighlightFloor={setHighlightedFloor}
                externalSelection={externalSelection}
                cameraOffsetY={-0.25}
                shelfColorAssignments={shelfColorAssignments}
              />
            </Suspense>

            {/* Shelf controls */}
            <AnimatePresence>
              {externalSelection && showControls && (
                <motion.div
                  {...motionTransition}
                  className="absolute overflow-hidden bottom-4 left-4 flex flex-col gap-2 bg-background/50 rounded-2xl backdrop-blur-lg w-auto"
                >
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
                            onPress={() => handleFloorChange(Math.min(floorConfigs.length, ((externalSelection?.floor || 0) + 1) + 1))}
                            isDisabled={(externalSelection?.floor || 0) + 1 >= floorConfigs.length}
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
              )}
            </AnimatePresence>

            <AnimatePresence>
              {(externalSelection || showControls) && (
                <motion.div
                  {...motionTransition}
                  className={`absolute overflow-hidden ${showControls ? "bottom-8 left-8 h-8 shadow-sm" : "bottom-4 left-4 h-10 shadow-lg"} w-[12.6rem] bg-default-200/50 rounded-xl backdrop-blur-lg z-10 transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]`}
                >
                  <Button
                    onPress={() => setShowControls(!showControls)}
                    color="default"
                    className={`flex items-center p-4 text-default-800 bg-transparent w-full !scale-100 ${showControls ? "h-8" : "h-10"} !transition-all !duration-500 duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]`}
                  >
                    <Icon icon="ic:round-control-camera" className="w-4 h-4" />
                    <span className="text-sm font-semibold">
                      {showControls ? "Hide Controls" : "Show Controls"}
                    </span>
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {externalSelection && (
                <motion.div
                  {...motionTransition}
                  className="absolute top-4 right-4 flex items-center gap-2 bg-background/50 rounded-2xl backdrop-blur-lg"
                >
                  <span className="text-sm font-semibold p-4">CODE: <b>{externalSelection?.code}</b></span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ModalBody>
        <ModalFooter className="flex justify-between gap-4 p-4">
          <Popover3dNavigationHelp />

          <div className="flex items-center gap-2">
            <Button color="danger" variant="shadow" onPress={handleCancelLocation}>
              {isDeliveryProcessing && isAdmin ? "Cancel" : "Close"}
            </Button>
            {isDeliveryProcessing && isAdmin && (
              <Button
                color="primary"
                variant="shadow"
                onPress={handleConfirmLocation}
                isDisabled={isSelectedLocationOccupied}
              >
                {isSelectedLocationOccupied ? "Location Occupied" : "Confirm Location"}
              </Button>
            )}
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}