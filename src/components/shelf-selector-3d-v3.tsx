'use client';

import { useState, useRef, useEffect, useMemo, useCallback, memo, Key } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Instance, Instances } from '@react-three/drei';
import * as THREE from 'three';
import { Accordion, AccordionItem, Button, Card, CardBody, Switch } from '@heroui/react';

// Global types
declare global {
  interface Window {
    cameraAnimator?: {
      animateCamera: (position: THREE.Vector3, target: THREE.Vector3) => void;
      isAnimating: () => boolean;
    };
  }
}

// Update the ShelfLocation interface
export interface ShelfLocation {
  floor: number;
  cabinet_id: number;
  cabinet_row: number;
  cabinet_column: number;
  // Add these new properties
  max_cabinet_id?: number;
  max_row?: number;
  max_column?: number;
}

export interface FloorConfig {
  height: number;
  matrix: number[][];
}

export interface ShelfSelectorProps {
  floors: FloorConfig[];
  onSelect: (location: ShelfLocation) => void;
  className?: string;
  // Control props
  highlightedFloor?: number | null;
  onHighlightFloor?: (floorIndex: number) => void;
  isFloorChangeAnimate?: boolean;
  isShelfChangeAnimate?: boolean;
  isCabinetChangeAnimate?: boolean;
  onAnimationToggle?: (type: 'floor' | 'shelf' | 'cabinet', value: boolean) => void;
  // Add the external selection prop
  externalSelection?: ShelfLocation;
  // Add occupied locations prop
  occupiedLocations?: ShelfLocation[];
  // New prop to control if occupied locations can be selected
  canSelectOccupiedLocations?: boolean;
  // Camera center adjustment parameters
  cameraOffsetX?: number;
  cameraOffsetY?: number;
  // Color props
  backgroundColor?: string;
  floorColor?: string;
  floorHighlightedColor?: string;
  cabinetColor?: string;
  cabinetSelectedColor?: string;
  shelfColor?: string;
  shelfHoverColor?: string;
  shelfSelectedColor?: string;
  occupiedShelfColor?: string;
  textColor?: string;
}

// Add this new component to ensure continuous rendering during animations
function RenderTrigger({ duration = 3000 }) {
  const { invalidate } = useThree();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Force render every frame for the specified duration
    const startTime = Date.now();

    function triggerRenders() {
      const elapsed = Date.now() - startTime;
      if (elapsed < duration) {
        invalidate(); // Force a render
        timerRef.current = setTimeout(triggerRenders, 16); // ~60fps
      }
    }

    triggerRenders();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, invalidate]);

  return null;
}

// Cache for expensive matrix operations
const matrixCache = new Map<string, any>();

// Helper functions moved outside component for better performance
const findNearestCabinetRowAbove = (floorMatrix: number[][], rowIndex: number, columnStart: number) => {
  for (let i = rowIndex - 1; i >= 0; i--) {
    if (floorMatrix[i][columnStart] > 0) return i;
  }
  return -1;
};

const findNearestCabinetRowBelow = (floorMatrix: number[][], rowIndex: number, columnStart: number) => {
  for (let i = rowIndex + 1; i < floorMatrix.length; i++) {
    if (floorMatrix[i][columnStart] > 0) return i;
  }
  return -1;
};

const findNearestCabinetColumnToLeft = (floorMatrix: number[][], rowIndex: number, columnStart: number) => {
  for (let j = columnStart - 1; j >= 0; j--) {
    if (floorMatrix[rowIndex][j] > 0) return j;
  }
  return -1;
};

const findNearestCabinetColumnToRight = (floorMatrix: number[][], rowIndex: number, columnStart: number) => {
  for (let j = columnStart; j < floorMatrix[0].length; j++) {
    if (floorMatrix[rowIndex][j] > 0) return j;
  }
  return -1;
};

// Process matrix to find all cabinets - now with caching
const processCabinetsMatrix = (floorMatrix: number[][], floorIndex: number) => {
  const cacheKey = `floor-${floorIndex}-${JSON.stringify(floorMatrix)}`;

  if (matrixCache.has(cacheKey)) {
    return matrixCache.get(cacheKey);
  }

  const cabinets = [];
  const cabinetPositions = [];
  const visited = Array(floorMatrix.length).fill(0).map(() => Array(floorMatrix[0].length).fill(false));
  let cabinetId = 0;

  for (let i = 0; i < floorMatrix.length; i++) {
    for (let j = 0; j < floorMatrix[i].length; j++) {
      if (floorMatrix[i][j] > 0 && !visited[i][j]) {
        let minJ = j, maxJ = j;
        const rows = floorMatrix[i][j];

        // BFS to find cabinet extent
        const queue = [[i, j]];
        visited[i][j] = true;

        while (queue.length > 0) {
          const [x, y] = queue.shift()!;

          // Check horizontal connections
          if (y + 1 < floorMatrix[i].length && floorMatrix[x][y + 1] === rows && !visited[x][y + 1]) {
            visited[x][y + 1] = true;
            queue.push([x, y + 1]);
            maxJ = Math.max(maxJ, y + 1);
          }

          if (y - 1 >= 0 && floorMatrix[x][y - 1] === rows && !visited[x][y - 1]) {
            visited[x][y - 1] = true;
            queue.push([x, y - 1]);
            minJ = Math.min(minJ, y - 1);
          }
        }

        const width = maxJ - minJ + 1;
        cabinets.push({
          id: cabinetId,
          rows,
          width,
          position: [i, (minJ + maxJ) / 2],
          minJ,
          maxJ
        });

        cabinetPositions.push([i, minJ, cabinetId]);
        cabinetId++;
      }
    }
  }

  const result = { cabinets, cabinetPositions };
  matrixCache.set(cacheKey, result);
  return result;
};

// Optimized camera animator using singleton pattern
const createCameraAnimator = () => {
  if (window.cameraAnimator) return window.cameraAnimator;

  const animator = {
    _isAnimating: false,
    targetPosition: null as THREE.Vector3 | null,
    targetLookAt: null as THREE.Vector3 | null,

    animateCamera: (position: THREE.Vector3, target: THREE.Vector3) => {
      animator.targetPosition = position.clone();
      animator.targetLookAt = target.clone();
      animator._isAnimating = true;
    },

    isAnimating: () => animator._isAnimating
  };

  window.cameraAnimator = animator;
  return animator;
};

// Add this function at the top level of your file, before the components
const ensureCameraAnimator = () => {
  if (!window.cameraAnimator) {
    window.cameraAnimator = {
      animateCamera: (position: THREE.Vector3, target: THREE.Vector3) => {
        console.log("Default animator used");
        // Default implementation if needed
      },
      isAnimating: () => false
    };
  }
  return window.cameraAnimator;
};


export function generateShelfOccupancyMatrix(
  inventoryItems: any[],
  floorConfigs: any[]
): number[][][] {
  // Initialize matrices for each floor with all shelves (value 5) as available (1)
  const occupancyMatrices = floorConfigs.map(config => {
    return config.matrix.map((row: any[]) =>
      row.map(cell => cell === 5 ? 1 : 0)
    );
  });

  // Mark occupied slots based on inventory items
  for (const item of inventoryItems) {
    if (!item.location) continue;

    const floorIndex = parseInt(item.location.floor) - 1;
    if (floorIndex < 0 || floorIndex >= occupancyMatrices.length) continue;

    // Get row and column indices - these need mapping to matrix positions
    const cabinetId = parseInt(item.location.cabinet) - 1;
    const cabinetRow = parseInt(item.location.row) - 1;
    const cabinetColumn = item.location.column.charCodeAt(0) - 65; // Convert A->0, B->1, etc.

    // Find position in matrix based on cabinet layout
    // This depends on how cabinets are arranged in your floor plan
    const matrixPosition = mapCabinetToMatrixPosition(
      floorIndex,
      cabinetId,
      cabinetRow,
      cabinetColumn,
      floorConfigs
    );

    if (matrixPosition) {
      // Mark as occupied (0)
      occupancyMatrices[floorIndex][matrixPosition.y][matrixPosition.x] = 0;
    }
  }

  return occupancyMatrices;
}

// Helper function to map cabinet coordinates to matrix positions
function mapCabinetToMatrixPosition(
  floorIndex: number,
  cabinetId: number,
  cabinetRow: number,
  cabinetColumn: number,
  floorConfigs: any[]
): { x: number, y: number } | null {
  // This mapping depends on your specific cabinet layout
  // Example implementation (needs customization):

  // Each cabinet might occupy a specific region of the matrix
  // For example, if cabinets are arranged in a grid:
  const cabinetsPerRow = 4; // Adjust based on your layout
  const cabinetWidth = 4;   // Width of each cabinet in matrix cells
  const cabinetHeight = 3;  // Height of each cabinet in matrix cells
  const cabinetSpacing = 2; // Spacing between cabinets

  // Calculate cabinet position in the matrix
  const cabinetBaseX = (cabinetId % cabinetsPerRow) * (cabinetWidth + cabinetSpacing) + 2;
  const cabinetBaseY = Math.floor(cabinetId / cabinetsPerRow) * (cabinetHeight + cabinetSpacing) + 2;

  // Calculate item position within cabinet
  const x = cabinetBaseX + cabinetColumn;
  const y = cabinetBaseY + cabinetRow;

  // Validate position is within matrix bounds
  if (y >= 0 && y < floorConfigs[floorIndex].matrix.length &&
    x >= 0 && x < floorConfigs[floorIndex].matrix[0].length) {
    return { x, y };
  }

  return null;
}


// Optimized Shelf component using instancing for better performance
const ShelfInstance = memo(({
  position,
  size,
  isHovered,
  isSelected,
  isOccupied,
  onClick,
  onPointerOver,
  onPointerOut,
  opacity,
  shelfColor,
  shelfHoverColor,
  shelfSelectedColor,
  occupiedShelfColor
}: {
  position: [number, number, number];
  size: [number, number, number];
  isHovered: boolean;
  isSelected: boolean;
  isOccupied: boolean;
  onClick: (e: THREE.Event) => void;
  onPointerOver: (e: THREE.Event) => void;
  onPointerOut: (e: THREE.Event) => void;
  opacity: number;
  shelfColor: string;
  shelfHoverColor: string;
  shelfSelectedColor: string;
  occupiedShelfColor: string;
}) => {
  // Determine the color based on state priority: occupied > selected > hovered > default
  const color = isOccupied ? occupiedShelfColor :
    isSelected ? shelfSelectedColor :
      isHovered ? shelfHoverColor :
        shelfColor;

  const emissiveColor = isSelected ? shelfSelectedColor : "#000000";
  const emissiveIntensity = isSelected ? 0.3 : 0;

  return (
    <mesh
      position={position}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      castShadow
      receiveShadow
    >
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        emissive={emissiveColor}
        emissiveIntensity={emissiveIntensity}
        transparent
        depthWrite={opacity > 0.5}
        opacity={opacity}
      />
    </mesh>
  );
});

// Optimized Cabinet component with instanced shelves
const Cabinet = memo(({
  position,
  size,
  rows,
  columns,
  cabinetId,
  floor,
  isSelected,
  onSelect,
  selectedLocation,
  occupiedLocations,
  canSelectOccupiedLocations,
  cabinetColor,
  cabinetSelectedColor,
  shelfColor,
  shelfHoverColor,
  shelfSelectedColor,
  occupiedShelfColor
}: {
  position: [number, number, number];
  size: [number, number, number];
  rows: number;
  columns: number;
  cabinetId: number;
  floor: number;
  isSelected: boolean;
  onSelect: (location: ShelfLocation) => void;
  selectedLocation: ShelfLocation | null;
  occupiedLocations?: ShelfLocation[];
  canSelectOccupiedLocations?: boolean;
  cabinetColor: string;
  cabinetSelectedColor: string;
  shelfColor: string;
  shelfHoverColor: string;
  shelfSelectedColor: string;
  occupiedShelfColor: string;
}) => {
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const cabinetRef = useRef<THREE.Group>(null);
  const [opacity, setOpacity] = useState(1);
  const [isInteractionDisabled, setIsInteractionDisabled] = useState(false);
  const { camera } = useThree();

  // Cache these calculations
  const cabinetWidth = size[0];
  const cabinetHeight = size[1];
  const cabinetDepth = size[2];
  const cellWidth = useMemo(() => cabinetWidth / columns, [cabinetWidth, columns]);
  const cellHeight = useMemo(() => cabinetHeight / rows, [cabinetHeight, rows]);

  // Function to check if a location is occupied
  const isLocationOccupied = useCallback((floorIndex: number, cabId: number, rowIndex: number, colIndex: number) => {
    if (!occupiedLocations || occupiedLocations.length === 0) return false;

    return occupiedLocations.some(loc =>
      loc.floor === floorIndex &&
      loc.cabinet_id === cabId &&
      loc.cabinet_row === rowIndex &&
      loc.cabinet_column === colIndex
    );
  }, [occupiedLocations]);

  // Distance thresholds
  const FADE_START_DISTANCE = 4.75;
  const FADE_END_DISTANCE = 4.5;
  const INTERACTION_DISABLE_DISTANCE = 2;

  // Only update opacity based on distance changes, not every frame
  useFrame(() => {
    if (cabinetRef.current) {
      const cabinetWorldPos = new THREE.Vector3();
      cabinetRef.current.getWorldPosition(cabinetWorldPos);
      const distanceToCamera = camera.position.distanceTo(cabinetWorldPos);

      // Only update state if there's a significant change
      let newOpacity = opacity;
      let newInteractionState = isInteractionDisabled;

      if (distanceToCamera < FADE_END_DISTANCE) {
        newOpacity = 0;
        newInteractionState = true;
      } else if (distanceToCamera < FADE_START_DISTANCE) {
        const t = (distanceToCamera - FADE_END_DISTANCE) / (FADE_START_DISTANCE - FADE_END_DISTANCE);
        newOpacity = t;
        newInteractionState = distanceToCamera < INTERACTION_DISABLE_DISTANCE;
      } else {
        newOpacity = 1;
        newInteractionState = false;
      }

      // Only update state if there's a meaningful change
      if (Math.abs(newOpacity - opacity) > 0.01) {
        setOpacity(newOpacity);
      }

      if (newInteractionState !== isInteractionDisabled) {
        setIsInteractionDisabled(newInteractionState);
      }
    }
  });

  // Memoize event handlers
  const handlePointerOver = useCallback((e: any, rowIndex: number, colIndex: number) => {
    if (!isInteractionDisabled &&
      (canSelectOccupiedLocations || !isLocationOccupied(floor, cabinetId, rowIndex, colIndex))) {
      e.stopPropagation();
      setHoverCell([rowIndex, colIndex]);
    }
  }, [isInteractionDisabled, isLocationOccupied, floor, cabinetId, canSelectOccupiedLocations]);


  const handlePointerOut = useCallback((e: any) => {
    if (!isInteractionDisabled) {
      e.stopPropagation();
      setHoverCell(null);
    }
  }, [isInteractionDisabled]);

  const handleClick = useCallback((e: any, rowIndex: number, colIndex: number) => {
    if (!isInteractionDisabled &&
      (canSelectOccupiedLocations || !isLocationOccupied(floor, cabinetId, rowIndex, colIndex))) {
      e.stopPropagation();
      onSelect({
        floor,
        cabinet_id: cabinetId,
        cabinet_row: rowIndex,
        cabinet_column: colIndex
      });
    }
  }, [isInteractionDisabled, onSelect, floor, cabinetId, isLocationOccupied, canSelectOccupiedLocations]);

  // Pre-calculate shelf positions and properties for better rendering
  const shelves = useMemo(() => {
    const items = [];

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      for (let colIndex = 0; colIndex < columns; colIndex++) {
        const isShelfSelected =
          selectedLocation?.floor === floor &&
          selectedLocation?.cabinet_id === cabinetId &&
          selectedLocation?.cabinet_row === rowIndex &&
          selectedLocation?.cabinet_column === colIndex;

        const isHovered = !!(hoverCell &&
          hoverCell[0] === rowIndex &&
          hoverCell[1] === colIndex);

        const isOccupied = isLocationOccupied(floor, cabinetId, rowIndex, colIndex);

        items.push({
          key: `${rowIndex}-${colIndex}`,
          position: [
            (colIndex - columns / 2 + 0.5) * cellWidth,
            (rowIndex - rows / 2 + 0.5) * cellHeight,
            0.1
          ] as [number, number, number],
          size: [cellWidth * 0.9, cellHeight * 0.9, cabinetDepth * 0.2] as [number, number, number],
          isHovered,
          isSelected: isShelfSelected,
          isOccupied,
          rowIndex,
          colIndex
        });
      }
    }

    return items;
  }, [rows, columns, cellWidth, cellHeight, cabinetDepth, selectedLocation, hoverCell, floor, cabinetId, isLocationOccupied]);

  return (
    <group position={position} ref={cabinetRef}>
      {/* Cabinet frame */}
      <mesh renderOrder={1} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={isSelected ? cabinetSelectedColor : cabinetColor}
          transparent
          opacity={opacity * 0.3}
          depthWrite={true}
        />
      </mesh>

      {/* Cabinet shelves - now more efficient */}
      {shelves.map(shelf => (
        <ShelfInstance
          key={shelf.key}
          position={shelf.position}
          size={shelf.size}
          isHovered={shelf.isHovered}
          isSelected={shelf.isSelected}
          isOccupied={shelf.isOccupied}
          onClick={(e) => handleClick(e, shelf.rowIndex, shelf.colIndex)}
          onPointerOver={(e) => handlePointerOver(e, shelf.rowIndex, shelf.colIndex)}
          onPointerOut={handlePointerOut}
          opacity={opacity}
          shelfColor={shelfColor}
          shelfHoverColor={shelfHoverColor}
          shelfSelectedColor={shelfSelectedColor}
          occupiedShelfColor={occupiedShelfColor}
        />
      ))}
    </group>
  );
});

// Optimized Floor component
const Floor = memo(({
  floorConfig,
  floorIndex,
  yPosition,
  isHighlighted,
  selectedLocation,
  occupiedLocations,
  canSelectOccupiedLocations,
  onSelect,
  floorColor,
  floorHighlightedColor,
  cabinetColor,
  cabinetSelectedColor,
  shelfColor,
  shelfHoverColor,
  shelfSelectedColor,
  occupiedShelfColor,
  textColor
}: {
  floorConfig: FloorConfig;
  floorIndex: number;
  yPosition: number;
  isHighlighted: boolean;
  selectedLocation: ShelfLocation | null;
  occupiedLocations?: ShelfLocation[];
  canSelectOccupiedLocations?: boolean;
  onSelect: (location: ShelfLocation) => void;
  floorColor: string;
  floorHighlightedColor: string;
  cabinetColor: string;
  cabinetSelectedColor: string;
  shelfColor: string;
  shelfHoverColor: string;
  shelfSelectedColor: string;
  occupiedShelfColor: string;
  textColor: string;
}) => {
  const { matrix, height } = floorConfig;
  const floorWidth = matrix[0].length;
  const floorDepth = matrix.length;
  const gridSize = 1;

  // Use cached cabinet data
  const { cabinets } = useMemo(() =>
    processCabinetsMatrix(matrix, floorIndex),
    [matrix, floorIndex]
  );

  return (
    <group position={[0, yPosition, 0]}>
      {/* Floor base */}
      <mesh position={[1.5, -0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[floorWidth * gridSize, 0.1, floorDepth * gridSize]} />
        <meshStandardMaterial color={isHighlighted ? floorHighlightedColor : floorColor} />
      </mesh>

      {/* Cabinets */}
      {cabinets.map((cabinet: { id: Key | null | undefined; position: number[]; width: number; rows: number; }) => {
        const isSelected = selectedLocation?.floor === floorIndex &&
          selectedLocation?.cabinet_id === cabinet.id;

        return (
          <Cabinet
            key={cabinet.id}
            position={[
              (cabinet.position[1] - floorWidth / 2 + cabinet.width / 2) * gridSize,
              height / 2,
              (cabinet.position[0] - floorDepth / 2 + 0.5) * gridSize
            ]}
            size={[cabinet.width * gridSize, height, gridSize]}
            rows={cabinet.rows}
            columns={cabinet.width}
            cabinetId={cabinet.id as number}
            floor={floorIndex}
            isSelected={isSelected}
            onSelect={onSelect}
            selectedLocation={selectedLocation}
            occupiedLocations={occupiedLocations}
            canSelectOccupiedLocations={canSelectOccupiedLocations}
            cabinetColor={cabinetColor}
            cabinetSelectedColor={cabinetSelectedColor}
            shelfColor={shelfColor}
            shelfHoverColor={shelfHoverColor}
            shelfSelectedColor={shelfSelectedColor}
            occupiedShelfColor={occupiedShelfColor}
          />
        );
      })}
    </group>
  );
});


function WASDControls({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const velocityY = useRef(0);
  const targetVelocity = useRef(new THREE.Vector3(0, 0, 0));
  const targetVelocityY = useRef(0);
  const keysPressed = useRef<Set<string>>(new Set());
  const { invalidate } = useThree(); // Get the invalidate function

  useFrame(() => {
    if (!controlsRef.current) return;

    const camera = controlsRef.current.object;
    const target = controlsRef.current.target;
    const moveSpeed = 0.1;
    const dampingFactor = 0.9;

    // Direction vectors
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(direction, camera.up).normalize();

    // Reset target velocity
    targetVelocity.current.set(0, 0, 0);
    targetVelocityY.current = 0;

    // Set target velocity based on keys
    if (keysPressed.current.has('w')) {
      targetVelocity.current.add(direction.clone().multiplyScalar(moveSpeed));
    }
    if (keysPressed.current.has('s')) {
      targetVelocity.current.add(direction.clone().multiplyScalar(-moveSpeed));
    }
    if (keysPressed.current.has('a')) {
      targetVelocity.current.add(right.clone().multiplyScalar(-moveSpeed));
    }
    if (keysPressed.current.has('d')) {
      targetVelocity.current.add(right.clone().multiplyScalar(moveSpeed));
    }

    // Y-axis movement
    if (keysPressed.current.has('shift+w')) {
      targetVelocityY.current = moveSpeed;
    }
    if (keysPressed.current.has('shift+s')) {
      targetVelocityY.current = -moveSpeed;
    }

    // Apply damping
    velocity.current.lerp(targetVelocity.current, 1 - dampingFactor);
    velocityY.current = velocityY.current * dampingFactor + targetVelocityY.current * (1 - dampingFactor);

    // Apply movement if significant
    if (velocity.current.lengthSq() > 0.00001 || Math.abs(velocityY.current) > 0.00001) {
      camera.position.add(velocity.current);
      target.add(velocity.current);

      if (Math.abs(velocityY.current) > 0.00001) {
        camera.position.y += velocityY.current;
        target.y += velocityY.current;
      }

      // Request continuous rendering while moving
      if (keysPressed.current.size > 0) {
        invalidate();
      }
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        if (e.shiftKey) {
          keysPressed.current.add(`shift+${key}`);
        } else {
          keysPressed.current.add(key);
        }
        invalidate(); // Force a render when key is pressed
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        keysPressed.current.delete(key);
        keysPressed.current.delete(`shift+${key}`);
      }
      if (key === 'shift') {
        for (const k of Array.from(keysPressed.current)) {
          if (k.startsWith('shift+')) {
            keysPressed.current.delete(k);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [invalidate]);

  return null;
}

// Also update the CameraAnimation component:
function CameraAnimation({
  controlsRef,
  dampingFactor = 0.05,
  cameraOffset = [0, 0]
}: {
  controlsRef: React.RefObject<any>,
  dampingFactor?: number,
  cameraOffset?: [number, number]
}) {
  const targetCameraPosition = useRef<THREE.Vector3 | null>(null);
  const targetControlsTarget = useRef<THREE.Vector3 | null>(null);
  const isAnimating = useRef(false);
  const frameSkip = useRef(0);
  const { invalidate } = useThree();

  const animateCamera = useCallback((newPosition: THREE.Vector3, newTarget: THREE.Vector3) => {
    // Apply offsets to the position and target
    const offsetPosition = newPosition.clone();
    offsetPosition.x += cameraOffset[0];
    offsetPosition.y += cameraOffset[1];

    const offsetTarget = newTarget.clone();
    offsetTarget.x += cameraOffset[0];
    offsetTarget.y += cameraOffset[1];

    targetCameraPosition.current = offsetPosition;
    targetControlsTarget.current = offsetTarget;
    isAnimating.current = true;
    invalidate(); // Force immediate render when animation starts
  }, [invalidate, cameraOffset]);

  // Initialize earlier and more robustly
  useEffect(() => {
    // Always update the camera animator with the current instance
    window.cameraAnimator = {
      animateCamera,
      isAnimating: () => isAnimating.current
    };

    return () => {
      // Only clear if it's still our instance
      if (window.cameraAnimator && window.cameraAnimator.animateCamera === animateCamera) {
        window.cameraAnimator = undefined;
      }
    };
  }, [animateCamera]);

  useFrame(() => {
    // Skip frames for better performance
    if (frameSkip.current > 0) {
      frameSkip.current--;
      return;
    }
    frameSkip.current = 0; // Process every other frame

    if (!controlsRef.current || !isAnimating.current) return;

    const controls = controlsRef.current;
    const camera = controls.object;

    if (targetCameraPosition.current && targetControlsTarget.current) {
      camera.position.lerp(targetCameraPosition.current, dampingFactor);
      controls.target.lerp(targetControlsTarget.current, dampingFactor);
      controls.update();
      invalidate(); // Force render during animation

      const positionDistanceSquared = camera.position.distanceToSquared(targetCameraPosition.current);
      const targetDistanceSquared = controls.target.distanceToSquared(targetControlsTarget.current);

      if (positionDistanceSquared < 0.01 && targetDistanceSquared < 0.01) {
        isAnimating.current = false;
        targetCameraPosition.current = null;
        targetControlsTarget.current = null;
      }
    }
  });

  return null;
}


// Optimized camera spotlight
const CameraSpotlight = memo(function CameraSpotlight() {
  const spotlightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const { camera } = useThree();
  const frameSkip = useRef(0);

  useFrame(() => {
    // Skip frames for performance
    if (frameSkip.current > 0) {
      frameSkip.current--;
      return;
    }
    frameSkip.current = 1;

    if (spotlightRef.current && targetRef.current) {
      spotlightRef.current.position.copy(camera.position);

      const target = new THREE.Vector3(0, 0, -1);
      target.applyQuaternion(camera.quaternion);
      target.add(camera.position);

      targetRef.current.position.copy(target);
      targetRef.current.updateMatrixWorld();
    }
  });

  return (
    <>
      <spotLight
        ref={spotlightRef}
        intensity={7.5}
        angle={Math.PI / 4}
        penumbra={0.5}
        distance={100}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0001}
        target={targetRef.current}
      />
      <primitive object={targetRef.current} />
    </>
  );
});

// Main component
export const ShelfSelector3D = memo(({
  floors,
  onSelect,
  className,
  highlightedFloor: externalHighlightedFloor = null,
  onHighlightFloor,
  isFloorChangeAnimate: externalIsFloorChangeAnimate,
  isShelfChangeAnimate: externalIsShelfChangeAnimate,
  isCabinetChangeAnimate: externalIsCabinetChangeAnimate,
  onAnimationToggle,
  externalSelection,
  occupiedLocations = [], // Add default empty array
  canSelectOccupiedLocations = true,
  cameraOffsetX = 0,
  cameraOffsetY = 0,
  backgroundColor = "#f5f5f5",
  floorColor = "#e0e0e0",
  floorHighlightedColor = "#d4e6ff",
  cabinetColor = "#aaaaaa",
  cabinetSelectedColor = "#4a80f5",
  shelfColor = "#dddddd",
  shelfHoverColor = "#ff9900",
  shelfSelectedColor = "#ff5555",
  occupiedShelfColor = "#8B0000", // Dark red for occupied shelves
  textColor = "#000000"
}: ShelfSelectorProps) => {
  const [scene, setScene] = useState<THREE.Scene | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<ShelfLocation | null>(null);
  const [internalHighlightedFloor, setInternalHighlightedFloor] = useState<number | null>(null);
  const [internalIsFloorChangeAnimate, setInternalIsFloorChangeAnimate] = useState<boolean>(true);
  const [internalIsShelfChangeAnimate, setInternalIsShelfChangeAnimate] = useState<boolean>(true);
  const [internalIsCabinetChangeAnimate, setInternalIsCabinetChangeAnimate] = useState<boolean>(false);

  // Add a new state to track the selection source
  const [selectionSource, setSelectionSource] = useState<'internal' | 'external'>('internal');
  const userInteractionInProgress = useRef(false);

  // Use external or internal state
  const highlightedFloor = externalHighlightedFloor !== undefined ? externalHighlightedFloor : internalHighlightedFloor;
  const isFloorChangeAnimate = externalIsFloorChangeAnimate !== undefined ? externalIsFloorChangeAnimate : internalIsFloorChangeAnimate;
  const isShelfChangeAnimate = externalIsShelfChangeAnimate !== undefined ? externalIsShelfChangeAnimate : internalIsShelfChangeAnimate;
  const isCabinetChangeAnimate = externalIsCabinetChangeAnimate !== undefined ? externalIsCabinetChangeAnimate : internalIsCabinetChangeAnimate;

  const controlsRef = useRef<any>(null);
  const previousHighlightedFloor = useRef<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const initialAnimationTriggered = useRef(false);

  // Calculate floor positions once
  const floorPositions = useMemo(() => {
    const positions: number[] = [];
    let currentY = 0;

    floors.forEach((floor) => {
      positions.push(currentY);
      currentY += floor.height + 0.5;
    });

    return positions;
  }, [floors]);

  // Add a helper function to check if a location is occupied
  const isLocationOccupied = useCallback((location: ShelfLocation): boolean => {
    if (!occupiedLocations || occupiedLocations.length === 0) return false;

    return occupiedLocations.some(loc =>
      loc.floor === location.floor &&
      loc.cabinet_id === location.cabinet_id &&
      loc.cabinet_row === location.cabinet_row &&
      loc.cabinet_column === location.cabinet_column
    );
  }, [occupiedLocations]);

  // Memoize focus functions for better performance
  const focusOnFloor = useCallback((floorIndex: number) => {
    if (controlsRef.current && isFloorChangeAnimate) {
      const floorY = floorPositions[floorIndex] + floors[floorIndex].height / 2;
      const camera = controlsRef.current.object;
      const currentXZ = new THREE.Vector3(camera.position.x, 0, camera.position.z).normalize();
      const distance = 20;
      const heightOffset = 3;

      const newTarget = new THREE.Vector3(0, floorY, 0);
      const newPosition = new THREE.Vector3(
        currentXZ.x * distance,
        floorY + heightOffset,
        currentXZ.z * distance
      );

      if (window.cameraAnimator) {
        window.cameraAnimator.animateCamera(newPosition, newTarget);
      }
    }
  }, [floors, floorPositions, isFloorChangeAnimate]);

  const focusOnShelf = useCallback((location: ShelfLocation) => {
    if (controlsRef.current && isShelfChangeAnimate) {
      const { floor, cabinet_id, cabinet_row, cabinet_column } = location;
      const floorMatrix = floors[floor].matrix;

      // Use cached data
      const { cabinets } = processCabinetsMatrix(floorMatrix, floor);
      const cabinet = cabinets.find((c: { id: number; }) => c.id === cabinet_id);

      if (cabinet) {
        const floorWidth = floorMatrix[0].length;
        const floorDepth = floorMatrix.length;
        const width = cabinet.width;
        const rows = cabinet.rows;

        const x = ((cabinet.minJ + cabinet.maxJ) / 2 - floorWidth / 2 + width / 2);
        const y = floorPositions[floor] + floors[floor].height / 2;
        const z = (cabinet.position[0] - floorDepth / 2 + 0.5);

        const cellWidth = width / width;
        const cellHeight = floors[floor].height / rows;

        const shelfX = x + (cabinet_column - width / 2 + 0.5) * cellWidth;
        const shelfY = y + (cabinet_row - rows / 2 + 0.5) * cellHeight;

        const newTarget = new THREE.Vector3(shelfX, shelfY, z);
        const dist = 5;
        const newPosition = new THREE.Vector3(shelfX, shelfY, z + dist);

        if (window.cameraAnimator) {
          window.cameraAnimator.animateCamera(newPosition, newTarget);
        }
      }
    }
  }, [floors, floorPositions, isShelfChangeAnimate]);

  const focusOnCabinet = useCallback((location: ShelfLocation) => {
    if (controlsRef.current && isCabinetChangeAnimate) {
      const { floor, cabinet_id } = location;
      const floorMatrix = floors[floor].matrix;

      // Use cached data
      const { cabinets } = processCabinetsMatrix(floorMatrix, floor);
      const cabinet = cabinets.find((c: { id: number; }) => c.id === cabinet_id);

      if (cabinet) {
        const floorWidth = floorMatrix[0].length;
        const floorDepth = floorMatrix.length;

        const x = ((cabinet.minJ + cabinet.maxJ) / 2 - floorWidth / 2 + cabinet.width / 2);
        const y = floorPositions[floor] + floors[floor].height / 2;
        const z = (cabinet.position[0] - floorDepth / 2 + 0.5);

        const newTarget = new THREE.Vector3(x, y, z);
        const dist = 8;
        const newPosition = new THREE.Vector3(x, y, z + dist);

        if (window.cameraAnimator) {
          window.cameraAnimator.animateCamera(newPosition, newTarget);
        }
      }
    }
  }, [floors, floorPositions, isCabinetChangeAnimate]);

  // Modify the handleSelect function to track internal selections
  const handleSelect = useCallback((location: ShelfLocation, source: 'internal' | 'external' = 'internal') => {
    // Set the source of this selection
    setSelectionSource(source);

    // Mark user interactions
    if (source === 'internal') {
      userInteractionInProgress.current = true;

      // Clear the flag after a delay to allow the animation to complete
      setTimeout(() => {
        userInteractionInProgress.current = false;
      }, 1000);
    }

    // Calculate max values
    const floorMatrix = floors[location.floor].matrix;
    const { cabinets } = processCabinetsMatrix(floorMatrix, location.floor);

    // Find current cabinet
    const currentCabinet = cabinets.find((c: any) => c.id === location.cabinet_id);

    // Calculate maximums
    const max_cabinet_id = cabinets.length > 0 ? Math.max(...cabinets.map((c: any) => c.id)) : 0;
    const max_row = currentCabinet ? currentCabinet.rows - 1 : 0;
    const max_column = currentCabinet ? currentCabinet.width - 1 : 0;

    // Create enhanced location with max values
    const enhancedLocation: ShelfLocation = {
      ...location,
      max_cabinet_id,
      max_row,
      max_column
    };

    setSelectedLocation(enhancedLocation);

    const cabinetChanged = !selectedLocation ||
      selectedLocation.floor !== location.floor ||
      selectedLocation.cabinet_id !== location.cabinet_id;

    // Only trigger animations for internal selections or when explicitly needed
    const shouldAnimateCabinet = source === 'internal' ? internalIsCabinetChangeAnimate : isCabinetChangeAnimate;
    const shouldAnimateShelf = source === 'internal' ? internalIsShelfChangeAnimate : isShelfChangeAnimate;

    if (cabinetChanged && shouldAnimateCabinet) {
      focusOnCabinet(enhancedLocation);
    } else if (shouldAnimateShelf) {
      focusOnShelf(enhancedLocation);
    }

    if (onSelect) onSelect(enhancedLocation);
  }, [onSelect, focusOnCabinet, focusOnShelf, isCabinetChangeAnimate, isShelfChangeAnimate,
    internalIsCabinetChangeAnimate, internalIsShelfChangeAnimate, selectedLocation, floors]);


  // Handle floor highlighting separately with useEffect
  useEffect(() => {
    if (selectedLocation) {
      if (onHighlightFloor) {
        onHighlightFloor(selectedLocation.floor);
      } else {
        setInternalHighlightedFloor(selectedLocation.floor);
      }
    }
  }, [selectedLocation, onHighlightFloor]);

  // Update the external selection effect to respect user interactions
  useEffect(() => {
    if (externalSelection && floors[externalSelection.floor] && !userInteractionInProgress.current) {
      // Only update if it's different from the current selection
      if (!selectedLocation ||
        selectedLocation.floor !== externalSelection.floor ||
        selectedLocation.cabinet_id !== externalSelection.cabinet_id ||
        selectedLocation.cabinet_row !== externalSelection.cabinet_row ||
        selectedLocation.cabinet_column !== externalSelection.cabinet_column) {

        // Call handleSelect with source='external'
        handleSelect(externalSelection, 'external');
      }
    }
  }, [externalSelection, floors, handleSelect, selectedLocation]);


  const handleArrowNavigation = useCallback((e: KeyboardEvent) => {
    if (!selectedLocation) return;

    const { key, shiftKey } = e;
    const { floor, cabinet_id, cabinet_row, cabinet_column } = selectedLocation;
    const floorMatrix = floors[floor].matrix;

    // Use cached data
    const { cabinets, cabinetPositions } = processCabinetsMatrix(floorMatrix, floor);
    const currentCabinet = cabinets.find((c: { id: number; }) => c.id === cabinet_id);
    if (!currentCabinet) return;

    let nextLocation: ShelfLocation | null = null;

    // Find cabinet position
    const cabinetPosition = cabinetPositions.find(([_row, _col, id]: [number, number, number]) => id === cabinet_id);
    if (!cabinetPosition) return;

    const [rowIndex, columnStart] = cabinetPosition;

    if (shiftKey) {
      // Cabinet navigation
      switch (key) {
        case 'ArrowUp': {
          const targetRowAbove = findNearestCabinetRowAbove(floorMatrix, rowIndex, columnStart);
          if (targetRowAbove !== -1) {
            const aboveCabinet = cabinets.find((c: { position: number[]; minJ: number; maxJ: number; }) =>
              c.position[0] === targetRowAbove && c.minJ <= columnStart && c.maxJ >= columnStart);
            if (aboveCabinet) {
              nextLocation = {
                floor,
                cabinet_id: aboveCabinet.id,
                cabinet_row: Math.floor(aboveCabinet.rows / 2),
                cabinet_column: Math.min(cabinet_column, aboveCabinet.width - 1)
              };
            }
          }
          break;
        }
        case 'ArrowDown': {
          const targetRowBelow = findNearestCabinetRowBelow(floorMatrix, rowIndex, columnStart);
          if (targetRowBelow !== -1) {
            const belowCabinet = cabinets.find((c: { position: number[]; minJ: number; maxJ: number; }) =>
              c.position[0] === targetRowBelow && c.minJ <= columnStart && c.maxJ >= columnStart);
            if (belowCabinet) {
              nextLocation = {
                floor,
                cabinet_id: belowCabinet.id,
                cabinet_row: Math.floor(belowCabinet.rows / 2),
                cabinet_column: Math.min(cabinet_column, belowCabinet.width - 1)
              };
            }
          }
          break;
        }
        case 'ArrowLeft': {
          const leftColumnStart = findNearestCabinetColumnToLeft(floorMatrix, rowIndex, columnStart);
          if (leftColumnStart !== -1) {
            const leftCabinet = cabinets.find((c: { position: any[]; minJ: number; maxJ: number; }) =>
              c.position[0] === rowIndex && c.minJ <= leftColumnStart && c.maxJ >= leftColumnStart);
            if (leftCabinet) {
              nextLocation = {
                floor,
                cabinet_id: leftCabinet.id,
                cabinet_row: Math.min(cabinet_row, leftCabinet.rows - 1),
                cabinet_column: Math.floor(leftCabinet.width / 2)
              };
            }
          }
          break;
        }
        case 'ArrowRight': {
          const rightColumnStart = findNearestCabinetColumnToRight(floorMatrix, rowIndex, columnStart + currentCabinet.width);
          if (rightColumnStart !== -1) {
            const rightCabinet = cabinets.find((c: { position: any[]; minJ: number; maxJ: number; }) =>
              c.position[0] === rowIndex && c.minJ <= rightColumnStart && c.maxJ >= rightColumnStart);
            if (rightCabinet) {
              nextLocation = {
                floor,
                cabinet_id: rightCabinet.id,
                cabinet_row: Math.min(cabinet_row, rightCabinet.rows - 1),
                cabinet_column: Math.floor(rightCabinet.width / 2)
              };
            }
          }
          break;
        }
      }
    } else {
      // Shelf navigation
      const { rows, width } = currentCabinet;

      switch (key) {
        case 'ArrowUp':
          if (cabinet_row < rows - 1) {
            nextLocation = {
              floor,
              cabinet_id,
              cabinet_row: cabinet_row + 1,
              cabinet_column
            };
          }
          break;
        case 'ArrowDown':
          if (cabinet_row > 0) {
            nextLocation = {
              floor,
              cabinet_id,
              cabinet_row: cabinet_row - 1,
              cabinet_column
            };
          }
          break;
        case 'ArrowLeft':
          if (cabinet_column > 0) {
            nextLocation = {
              floor,
              cabinet_id,
              cabinet_row,
              cabinet_column: cabinet_column - 1
            };
          } else {
            const leftCabinetColumn = findNearestCabinetColumnToLeft(floorMatrix, rowIndex, columnStart);
            if (leftCabinetColumn !== -1) {
              const leftCabinet = cabinets.find((c: { position: any[]; minJ: number; maxJ: number; }) =>
                c.position[0] === rowIndex && c.minJ <= leftCabinetColumn && c.maxJ >= leftCabinetColumn);
              if (leftCabinet) {
                nextLocation = {
                  floor,
                  cabinet_id: leftCabinet.id,
                  cabinet_row: cabinet_row < leftCabinet.rows ? cabinet_row : leftCabinet.rows - 1,
                  cabinet_column: leftCabinet.width - 1
                };
              }
            }
          }
          break;
        case 'ArrowRight':
          if (cabinet_column < width - 1) {
            nextLocation = {
              floor,
              cabinet_id,
              cabinet_row,
              cabinet_column: cabinet_column + 1
            };
          } else {
            const rightCabinetColumn = findNearestCabinetColumnToRight(floorMatrix, rowIndex, columnStart + width);
            if (rightCabinetColumn !== -1) {
              const rightCabinet = cabinets.find((c: { position: any[]; minJ: number; maxJ: number; }) =>
                c.position[0] === rowIndex && c.minJ <= rightCabinetColumn && c.maxJ >= rightCabinetColumn);
              if (rightCabinet) {
                nextLocation = {
                  floor,
                  cabinet_id: rightCabinet.id,
                  cabinet_row: cabinet_row < rightCabinet.rows ? cabinet_row : rightCabinet.rows - 1,
                  cabinet_column: 0
                };
              }
            }
          }
          break;
      }
    }

    // Before applying the next location, check if it's occupied
    if (nextLocation && (!isLocationOccupied(nextLocation) || canSelectOccupiedLocations)) {
      handleSelect(nextLocation);
      e.preventDefault();
    } else if (nextLocation) {
      // If the location is occupied and we can't select it, try to find next available location in the same direction
      // This is optional behavior and may need more complex logic
      console.log("Cannot select occupied location");
    }
  }, [selectedLocation, floors, handleSelect, isLocationOccupied, canSelectOccupiedLocations]);

  // Register keyboard handlers
  useEffect(() => {
    window.addEventListener('keydown', handleArrowNavigation);
    return () => {
      window.removeEventListener('keydown', handleArrowNavigation);
    };
  }, [handleArrowNavigation]);

  // Focus on highlighted floor
  useEffect(() => {
    if (highlightedFloor !== null &&
      highlightedFloor !== previousHighlightedFloor.current) {
      focusOnFloor(highlightedFloor);
      previousHighlightedFloor.current = highlightedFloor;
    }
  }, [highlightedFloor, focusOnFloor]);

  // Update building center position with offsets
  const buildingCenterPosition = useMemo((): [number, number, number] => {
    const totalHeight = floorPositions[floorPositions.length - 1] +
      floors[floors.length - 1].height;
    const centerY = totalHeight / 2;
    return [1 + cameraOffsetX, centerY + cameraOffsetY, 0];
  }, [floors, floorPositions, cameraOffsetX, cameraOffsetY]);

  // Update initial camera position
  const initialCameraPosition = useMemo(() => {
    const totalHeight = floorPositions[floorPositions.length - 1] +
      floors[floors.length - 1].height + 0.5;
    return [700 + cameraOffsetX, totalHeight * 1.5 + cameraOffsetY, 35] as [number, number, number];
  }, [floors, floorPositions, cameraOffsetX, cameraOffsetY]);

  // Replace the current initial animation effect with this one:
  useEffect(() => {
    // First, ensure the scene is ready
    setIsInitialized(true);

    // Use a more robust approach with multiple attempts
    const tryAnimation = (attemptsLeft = 5) => {
      if (initialAnimationTriggered.current) return;

      const animator = ensureCameraAnimator();

      if (animator) {
        // Define the camera end position
        const targetPosition = new THREE.Vector3(0, buildingCenterPosition[1], 20);
        const targetLookAt = new THREE.Vector3(...buildingCenterPosition);

        console.log("Starting initial camera animation");
        animator.animateCamera(targetPosition, targetLookAt);
        initialAnimationTriggered.current = true;
      } else if (attemptsLeft > 0) {
        // If animator not ready yet, try again after a delay
        setTimeout(() => tryAnimation(attemptsLeft - 1), 200);
      }
    };

    // First attempt after a short delay
    const timer = setTimeout(() => tryAnimation(), 800);

    return () => clearTimeout(timer);
  }, [buildingCenterPosition]);


  // on change of background color
  useEffect(() => {
    if (scene) {
      const renderer = scene.userData.renderer;
      if (renderer) {
        renderer.setClearColor(backgroundColor);
      }
    }
  }, [backgroundColor, scene]);


  return (
    <div className={className}>
      <Canvas
        camera={{
          position: initialCameraPosition,
          fov: 50,
          up: [0, 1, 0],
          near: 0.1,
          far: 1000,
        }}
        dpr={[0.5, 1]}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false,
          precision: 'lowp',
        }}
        performance={{
          min: 0.3,
          max: 0.8,
          debounce: 200
        }}
        frameloop="demand"
        onCreated={({ gl, scene: onLoadScene }) => {
          gl.setClearColor(backgroundColor);
          setScene(onLoadScene);
        }}
      >

        {/* Scene */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[0, 5, 5]} intensity={0.5} />
        <CameraSpotlight />
        <CameraAnimation
          controlsRef={controlsRef}
          dampingFactor={0.05}
          cameraOffset={[cameraOffsetX, cameraOffsetY]}
        />
        <WASDControls controlsRef={controlsRef} />

        {/* Add this to ensure renders during initial animation */}
        {isInitialized && <RenderTrigger duration={5000} />}

        {/* Floors */}
        <group>
          {floors.map((floor, index) => (
            <Floor
              key={index}
              floorConfig={floor}
              floorIndex={index}
              yPosition={floorPositions[index]}
              isHighlighted={highlightedFloor === index}
              selectedLocation={selectedLocation}
              occupiedLocations={occupiedLocations}
              canSelectOccupiedLocations={canSelectOccupiedLocations}
              onSelect={handleSelect}
              floorColor={floorColor}
              floorHighlightedColor={floorHighlightedColor}
              cabinetColor={cabinetColor}
              cabinetSelectedColor={cabinetSelectedColor}
              shelfColor={shelfColor}
              shelfHoverColor={shelfHoverColor}
              shelfSelectedColor={shelfSelectedColor}
              occupiedShelfColor={occupiedShelfColor}
              textColor={textColor}
            />
          ))}
        </group>
        <OrbitControls
          ref={controlsRef}
          target={buildingCenterPosition}
          enableDamping
          dampingFactor={0.1}
        />
      </Canvas>
    </div>
  );
});