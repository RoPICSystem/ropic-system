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

export interface ShelfLocation {
  floor: number;
  group_id: number;
  group_row: number;
  group_column: number;
  group_depth?: number; // Add depth property
  max_group_id?: number;
  max_row?: number;
  max_column?: number;
  max_depth?: number; // Add max depth
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
  isGroupChangeAnimate?: boolean;
  onAnimationToggle?: (type: 'floor' | 'shelf' | 'group', value: boolean) => void;
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
  groupColor?: string;
  groupSelectedColor?: string;
  shelfColor?: string;
  shelfHoverColor?: string;
  shelfSelectedColor?: string;
  occupiedShelfColor?: string;
  occupiedHoverShelfColor?: string; // Add new prop for hover color of occupied shelves
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
const findNearestGroupRowAbove = (floorMatrix: number[][], rowIndex: number, columnStart: number) => {
  for (let i = rowIndex - 1; i >= 0; i--) {
    if (floorMatrix[i][columnStart] > 0) return i;
  }
  return -1;
};

const findNearestGroupRowBelow = (floorMatrix: number[][], rowIndex: number, columnStart: number) => {
  for (let i = rowIndex + 1; i < floorMatrix.length; i++) {
    if (floorMatrix[i][columnStart] > 0) return i;
  }
  return -1;
};

const findNearestGroupColumnToLeft = (floorMatrix: number[][], rowIndex: number, columnStart: number) => {
  for (let j = columnStart - 1; j >= 0; j--) {
    if (floorMatrix[rowIndex][j] > 0) return j;
  }
  return -1;
};

const findNearestGroupColumnToRight = (floorMatrix: number[][], rowIndex: number, columnStart: number) => {
  for (let j = columnStart; j < floorMatrix[0].length; j++) {
    if (floorMatrix[rowIndex][j] > 0) return j;
  }
  return -1;
};

// Process matrix to find all groups with proper depth handling
const processGroupsMatrix = (floorMatrix: number[][], floorIndex: number) => {
  const cacheKey = `floor-${floorIndex}-${JSON.stringify(floorMatrix)}`;

  if (matrixCache.has(cacheKey)) {
    return matrixCache.get(cacheKey);
  }

  const groups = [];
  const groupPositions = [];
  const visited = Array(floorMatrix.length).fill(0).map(() => Array(floorMatrix[0].length).fill(false));
  let groupId = 0;

  for (let i = 0; i < floorMatrix.length; i++) {
    for (let j = 0; j < floorMatrix[i].length; j++) {
      if (floorMatrix[i][j] > 0 && !visited[i][j]) {
        const value = floorMatrix[i][j]; // The shelf type (e.g., 5 or 4)
        let minI = i, maxI = i;
        let minJ = j, maxJ = j;

        // BFS to find group extent in both directions
        const queue = [[i, j]];
        visited[i][j] = true;

        while (queue.length > 0) {
          const [x, y] = queue.shift()!;

          // Check horizontal connections (width)
          if (y + 1 < floorMatrix[x].length && floorMatrix[x][y + 1] === value && !visited[x][y + 1]) {
            visited[x][y + 1] = true;
            queue.push([x, y + 1]);
            maxJ = Math.max(maxJ, y + 1);
          }

          if (y - 1 >= 0 && floorMatrix[x][y - 1] === value && !visited[x][y - 1]) {
            visited[x][y - 1] = true;
            queue.push([x, y - 1]);
            minJ = Math.min(minJ, y - 1);
          }

          // Check vertical connections (depth)
          if (x + 1 < floorMatrix.length && floorMatrix[x + 1][y] === value && !visited[x + 1][y]) {
            visited[x + 1][y] = true;
            queue.push([x + 1, y]);
            maxI = Math.max(maxI, x + 1);
          }

          if (x - 1 >= 0 && floorMatrix[x - 1][y] === value && !visited[x - 1][y]) {
            visited[x - 1][y] = true;
            queue.push([x - 1, y]);
            minI = Math.min(minI, x - 1);
          }
        }

        const width = maxJ - minJ + 1; // Width (columns)
        const depth = maxI - minI + 1; // Depth (rows in z-direction)

        groups.push({
          id: groupId,
          rows: value, // Number of shelves based on the value
          width,      // Width in columns
          depth,      // Depth in rows
          position: [minI, minJ], // Store starting position
          minI,
          maxI,
          minJ,
          maxJ
        });

        groupPositions.push([minI, minJ, groupId]);
        groupId++;
      }
    }
  }

  const result = { groups, groupPositions };
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
    const groupId = parseInt(item.location.group) - 1;
    const groupRow = parseInt(item.location.row) - 1;
    const groupColumn = item.location.column.charCodeAt(0) - 65; // Convert A->0, B->1, etc.

    // Find position in matrix based on group layout
    // This depends on how groups are arranged in your floor plan
    const matrixPosition = mapGroupToMatrixPosition(
      floorIndex,
      groupId,
      groupRow,
      groupColumn,
      floorConfigs
    );

    if (matrixPosition) {
      // Mark as occupied (0)
      occupancyMatrices[floorIndex][matrixPosition.y][matrixPosition.x] = 0;
    }
  }

  return occupancyMatrices;
}

// Helper function to map group coordinates to matrix positions
function mapGroupToMatrixPosition(
  floorIndex: number,
  groupId: number,
  groupRow: number,
  groupColumn: number,
  floorConfigs: any[]
): { x: number, y: number } | null {
  // This mapping depends on your specific group layout
  // Example implementation (needs customization):

  // Each group might occupy a specific region of the matrix
  // For example, if groups are arranged in a grid:
  const groupsPerRow = 4; // Adjust based on your layout
  const groupWidth = 4;   // Width of each group in matrix cells
  const groupHeight = 3;  // Height of each group in matrix cells
  const groupSpacing = 2; // Spacing between groups

  // Calculate group position in the matrix
  const groupBaseX = (groupId % groupsPerRow) * (groupWidth + groupSpacing) + 2;
  const groupBaseY = Math.floor(groupId / groupsPerRow) * (groupHeight + groupSpacing) + 2;

  // Calculate item position within group
  const x = groupBaseX + groupColumn;
  const y = groupBaseY + groupRow;

  // Validate position is within matrix bounds
  if (y >= 0 && y < floorConfigs[floorIndex].matrix.length &&
    x >= 0 && x < floorConfigs[floorIndex].matrix[0].length) {
    return { x, y };
  }

  return null;
}


const ShelfInstance = memo(({
  position,
  size,
  isHovered,
  isSelected,
  isOccupied,
  onClick,
  onPointerOver,
  onPointerOut,
  opacity: groupOpacity,
  shelfColor,
  shelfHoverColor,
  shelfSelectedColor,
  occupiedShelfColor,
  occupiedHoverShelfColor
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
  occupiedHoverShelfColor: string;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const [shelfOpacity, setShelfOpacity] = useState(1);

  // Shelf-specific distance thresholds - closer than group thresholds
  const SHELF_FADE_START = 5.75;  // Start fading shelves at this distance
  const SHELF_FADE_END = 5.5;    // Completely transparent at this distance

  // Update shelf opacity based on distance
  useFrame(() => {
    if (meshRef.current) {
      const shelfWorldPos = new THREE.Vector3();
      meshRef.current.getWorldPosition(shelfWorldPos);
      const distanceToCamera = camera.position.distanceTo(shelfWorldPos);

      let newOpacity = 1;

      if (distanceToCamera < SHELF_FADE_END) {
        newOpacity = 0;
      } else if (distanceToCamera < SHELF_FADE_START) {
        const t = (distanceToCamera - SHELF_FADE_END) / (SHELF_FADE_START - SHELF_FADE_END);
        newOpacity = t;
      }

      // Only update if significant change
      if (Math.abs(newOpacity - shelfOpacity) > 0.01) {
        setShelfOpacity(newOpacity);
      }
    }
  });

  // Update color determination to use occupiedHoverShelfColor when a shelf is both occupied and hovered
  const color = isOccupied
    ? (isHovered ? occupiedHoverShelfColor : occupiedShelfColor)
    : isSelected
      ? shelfSelectedColor
      : isHovered
        ? shelfHoverColor
        : shelfColor;

  const emissiveColor = isSelected ? shelfSelectedColor : "#000000";
  const emissiveIntensity = isSelected ? 0.3 : 0;

  // Final opacity is the product of group opacity and shelf opacity
  const finalOpacity = groupOpacity * shelfOpacity;

  return (
    <mesh
      ref={meshRef}
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
        depthWrite={finalOpacity > 0.5}
        opacity={finalOpacity}
      />
    </mesh>
  );
});

// Optimized Group component with instanced shelves
const Group = memo(({
  position,
  size,
  rows,
  columns,
  depth, // New parameter for depth
  groupId,
  floor,
  isSelected,
  onSelect,
  selectedLocation,
  occupiedLocations,
  canSelectOccupiedLocations,
  groupColor,
  groupSelectedColor,
  shelfColor,
  shelfHoverColor,
  shelfSelectedColor,
  occupiedShelfColor,
  occupiedHoverShelfColor
}: {
  position: [number, number, number];
  size: [number, number, number];
  rows: number;
  columns: number;
  depth: number; // Add depth parameter
  groupId: number;
  floor: number;
  isSelected: boolean;
  onSelect: (location: ShelfLocation) => void;
  selectedLocation: ShelfLocation | null;
  occupiedLocations?: ShelfLocation[];
  canSelectOccupiedLocations?: boolean;
  groupColor: string;
  groupSelectedColor: string;
  shelfColor: string;
  shelfHoverColor: string;
  shelfSelectedColor: string;
  occupiedShelfColor: string;
  occupiedHoverShelfColor: string;
}) => {
  const [hoverCell, setHoverCell] = useState<[number, number, number] | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [opacity, setOpacity] = useState(1);
  const [isInteractionDisabled, setIsInteractionDisabled] = useState(false);
  const { camera } = useThree();

  // Cache these calculations
  const groupWidth = size[0];
  const groupHeight = size[1];
  const groupDepth = size[2];
  const cellWidth = useMemo(() => groupWidth / columns, [groupWidth, columns]);
  const cellHeight = useMemo(() => groupHeight / rows, [groupHeight, rows]);
  const cellDepth = useMemo(() => groupDepth / depth, [groupDepth, depth]);

  const isLocationOccupied = useCallback((floorIndex: number, cabId: number, rowIndex: number, colIndex: number, depthIndex: number) => {
    if (!occupiedLocations || occupiedLocations.length === 0) return false;

    return occupiedLocations.some(loc =>
      loc.floor === floorIndex &&
      loc.group_id === cabId &&
      loc.group_row === rowIndex &&
      loc.group_column === colIndex &&
      (loc.group_depth === depthIndex || loc.group_depth === undefined)
    );
  }, [occupiedLocations]);

  // Distance thresholds
  const FADE_START_DISTANCE = 6.5;  // Start fading earlier
  const FADE_END_DISTANCE = 5.5;     // Complete fade slightly later
  const INTERACTION_DISABLE_DISTANCE = 2;

  // Only update opacity based on distance changes, not every frame
  useFrame(() => {
    if (groupRef.current) {
      const groupWorldPos = new THREE.Vector3();
      groupRef.current.getWorldPosition(groupWorldPos);

      // Create a box3 representing the group's bounding box in world space
      const halfWidth = size[0] / 2;
      const halfHeight = size[1] / 2;
      const halfDepth = size[2] / 2;

      // Get min and max points of the box in world space
      const minPoint = new THREE.Vector3(
        groupWorldPos.x - halfWidth,
        groupWorldPos.y - halfHeight,
        groupWorldPos.z - halfDepth
      );

      const maxPoint = new THREE.Vector3(
        groupWorldPos.x + halfWidth,
        groupWorldPos.y + halfHeight,
        groupWorldPos.z + halfDepth
      );

      const boundingBox = new THREE.Box3(minPoint, maxPoint);

      // Find the closest point on the box surface to the camera
      const closestPoint = new THREE.Vector3();
      boundingBox.clampPoint(camera.position, closestPoint);

      // Calculate distance from camera to closest point on box surface
      const distanceToSurface = camera.position.distanceTo(closestPoint);

      // Fading thresholds specifically for proximity to surface
      const SURFACE_FADE_START = 3.0; // Start fading when 3 units from surface
      const SURFACE_FADE_END = 1.5;   // Completely faded when 1.5 units from surface

      let newOpacity = 1;
      let newInteractionState = isInteractionDisabled;

      if (distanceToSurface < SURFACE_FADE_END) {
        newOpacity = 0;
        newInteractionState = true;
      } else if (distanceToSurface < SURFACE_FADE_START) {
        const t = (distanceToSurface - SURFACE_FADE_END) / (SURFACE_FADE_START - SURFACE_FADE_END);
        newOpacity = t;
        newInteractionState = distanceToSurface < INTERACTION_DISABLE_DISTANCE;
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
  const handlePointerOver = useCallback((e: any, rowIndex: number, colIndex: number, depthIndex: number) => {
    if (!isInteractionDisabled &&
      (canSelectOccupiedLocations || !isLocationOccupied(floor, groupId, rowIndex, colIndex, depthIndex))) {
      e.stopPropagation();
      setHoverCell([rowIndex, colIndex, depthIndex]);
    }
  }, [isInteractionDisabled, isLocationOccupied, floor, groupId, canSelectOccupiedLocations]);


  const handlePointerOut = useCallback((e: any) => {
    if (!isInteractionDisabled) {
      e.stopPropagation();
      setHoverCell(null);
    }
  }, [isInteractionDisabled]);

  const handleClick = useCallback((e: any, rowIndex: number, colIndex: number, depthIndex: number) => {
    if (!isInteractionDisabled &&
      (canSelectOccupiedLocations || !isLocationOccupied(floor, groupId, rowIndex, colIndex, depthIndex))) {
      e.stopPropagation();
      onSelect({
        floor,
        group_id: groupId,
        group_row: rowIndex,
        group_column: colIndex,
        group_depth: depthIndex
      });
    }
  }, [isInteractionDisabled, onSelect, floor, groupId, isLocationOccupied, canSelectOccupiedLocations]);

  // Pre-calculate shelf positions and properties for better rendering
  const shelves = useMemo(() => {
    const items = [];

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      for (let colIndex = 0; colIndex < columns; colIndex++) {
        for (let depthIndex = 0; depthIndex < depth; depthIndex++) {
          const isShelfSelected =
            selectedLocation?.floor === floor &&
            selectedLocation?.group_id === groupId &&
            selectedLocation?.group_row === rowIndex &&
            selectedLocation?.group_column === colIndex &&
            (selectedLocation?.group_depth === depthIndex || selectedLocation?.group_depth === undefined);

          const isHovered = !!(hoverCell &&
            hoverCell[0] === rowIndex &&
            hoverCell[1] === colIndex &&
            hoverCell[2] === depthIndex);

          const isOccupied = isLocationOccupied(floor, groupId, rowIndex, colIndex, depthIndex);

          items.push({
            key: `${rowIndex}-${colIndex}-${depthIndex}`,
            position: [
              (colIndex - columns / 2 + 0.5) * cellWidth,
              (rowIndex - rows / 2 + 0.5) * cellHeight,
              (depthIndex - depth / 2 + 0.5) * cellDepth // Position along Z axis
            ],
            size: [cellWidth * 0.9, cellHeight * 0.9, cellDepth * 0.9],
            isHovered,
            isSelected: isShelfSelected,
            isOccupied,
            rowIndex,
            colIndex,
            depthIndex
          });
        }
      }
    }

    return items;
  }, [rows, columns, depth, cellWidth, cellHeight, cellDepth, selectedLocation, hoverCell, floor, groupId, isLocationOccupied]);

  return (
    <group position={position} ref={groupRef}>
      {/* Group frame */}
      <mesh renderOrder={1} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={isSelected ? groupSelectedColor : groupColor}
          transparent
          opacity={opacity * 0.3}
          depthWrite={true}
        />
      </mesh>

      {/* Shelves with depth */}
      {shelves.map(shelf => (
        <ShelfInstance
          key={shelf.key}
          position={shelf.position as [number, number, number]}
          size={shelf.size as [number, number, number]}
          isHovered={shelf.isHovered}
          isSelected={shelf.isSelected}
          isOccupied={shelf.isOccupied}
          onClick={(e) => handleClick(e, shelf.rowIndex, shelf.colIndex, shelf.depthIndex)}
          onPointerOver={(e) => handlePointerOver(e, shelf.rowIndex, shelf.colIndex, shelf.depthIndex)}
          onPointerOut={handlePointerOut}
          opacity={1}
          shelfColor={shelfColor}
          shelfHoverColor={shelfHoverColor}
          shelfSelectedColor={shelfSelectedColor}
          occupiedShelfColor={occupiedShelfColor}
          occupiedHoverShelfColor={occupiedHoverShelfColor}
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
  groupColor,
  groupSelectedColor,
  shelfColor,
  shelfHoverColor,
  shelfSelectedColor,
  occupiedShelfColor,
  occupiedHoverShelfColor,
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
  groupColor: string;
  groupSelectedColor: string;
  shelfColor: string;
  shelfHoverColor: string;
  shelfSelectedColor: string;
  occupiedShelfColor: string;
  occupiedHoverShelfColor: string;
  textColor: string;
}) => {
  const { matrix, height } = floorConfig;
  const floorWidth = matrix[0].length;
  const floorDepth = matrix.length;
  const gridSize = 1;

  // Use cached group data with depth info
  const { groups } = useMemo(() =>
    processGroupsMatrix(matrix, floorIndex),
    [matrix, floorIndex]
  );

  return (
    <group position={[0, yPosition, 0]}>
      {/* Floor base */}
      <mesh position={[0, -0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[floorWidth * gridSize, 0.1, floorDepth * gridSize]} />
        <meshStandardMaterial color={isHighlighted ? floorHighlightedColor : floorColor} />
      </mesh>

      {/* Groups with depth */}
      {groups.map((group: { id: Key | null | undefined; minI: any; minJ: any; width: number; depth: number; rows: number; }) => {
        const isSelected = selectedLocation?.floor === floorIndex &&
          selectedLocation?.group_id === group.id;

        // Calculate correct position with depth
        const rowPos = group.minI; // Starting row index
        const colPos = group.minJ; // Starting column index

        return (
          <Group
            key={group.id}
            position={[
              (colPos - floorWidth / 2 + group.width / 2) * gridSize, // Center X
              height / 2, // Center Y
              (rowPos - floorDepth / 2 + group.depth / 2) * gridSize // Center Z with depth
            ]}
            size={[
              group.width * gridSize,  // Width (X)
              height,                  // Height (Y)
              group.depth * gridSize   // Depth (Z)
            ]}
            rows={group.rows}          // Number of shelves
            columns={group.width}      // Width in columns
            depth={group.depth}        // Add depth parameter
            groupId={parseInt(group.id as string)}
            floor={floorIndex}
            isSelected={isSelected}
            onSelect={onSelect}
            selectedLocation={selectedLocation}
            occupiedLocations={occupiedLocations}
            canSelectOccupiedLocations={canSelectOccupiedLocations}
            groupColor={groupColor}
            groupSelectedColor={groupSelectedColor}
            shelfColor={shelfColor}
            shelfHoverColor={shelfHoverColor}
            shelfSelectedColor={shelfSelectedColor}
            occupiedShelfColor={occupiedShelfColor}
            occupiedHoverShelfColor={occupiedHoverShelfColor}
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
  isGroupChangeAnimate: externalIsGroupChangeAnimate,
  onAnimationToggle,
  externalSelection,
  occupiedLocations = [], // Add default empty array
  canSelectOccupiedLocations = true,
  cameraOffsetX = 0,
  cameraOffsetY = 0,
  backgroundColor = "#f5f5f5",
  floorColor = "#e0e0e0",
  floorHighlightedColor = "#d4e6ff",
  groupColor = "#aaaaaa",
  groupSelectedColor = "#4a80f5",
  shelfColor = "#dddddd",
  shelfHoverColor = "#ff9900",
  shelfSelectedColor = "#ff5555",
  occupiedShelfColor = "#8B0000", // Dark red for occupied shelves
  occupiedHoverShelfColor = "#BB0000", // Slightly brighter red for hover on occupied shelves
  textColor = "#000000"
}: ShelfSelectorProps) => {
  const [scene, setScene] = useState<THREE.Scene | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<ShelfLocation | null>(null);
  const [internalHighlightedFloor, setInternalHighlightedFloor] = useState<number | null>(null);
  const [internalIsFloorChangeAnimate, setInternalIsFloorChangeAnimate] = useState<boolean>(true);
  const [internalIsShelfChangeAnimate, setInternalIsShelfChangeAnimate] = useState<boolean>(true);
  const [internalIsGroupChangeAnimate, setInternalIsGroupChangeAnimate] = useState<boolean>(false);

  // Add a new state to track the selection source
  const [selectionSource, setSelectionSource] = useState<'internal' | 'external'>('internal');
  const userInteractionInProgress = useRef(false);

  // Use external or internal state
  const highlightedFloor = externalHighlightedFloor !== undefined ? externalHighlightedFloor : internalHighlightedFloor;
  const isFloorChangeAnimate = externalIsFloorChangeAnimate !== undefined ? externalIsFloorChangeAnimate : internalIsFloorChangeAnimate;
  const isShelfChangeAnimate = externalIsShelfChangeAnimate !== undefined ? externalIsShelfChangeAnimate : internalIsShelfChangeAnimate;
  const isGroupChangeAnimate = externalIsGroupChangeAnimate !== undefined ? externalIsGroupChangeAnimate : internalIsGroupChangeAnimate;

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
      loc.group_id === location.group_id &&
      loc.group_row === location.group_row &&
      loc.group_column === location.group_column
    );
  }, [occupiedLocations]);

  const focusOnFloor = useCallback((floorIndex: number) => {
    if (controlsRef.current && isFloorChangeAnimate) {
      // Calculate exact center height of the floor
      const floorCenterY = floorPositions[floorIndex] + (floors[floorIndex].height / 2);
      const floorMatrix = floors[floorIndex].matrix;
      const floorWidth = floorMatrix[0].length;
      const floorDepth = floorMatrix.length;

      // Target the center of the floor
      const newTarget = new THREE.Vector3(0, floorCenterY, 0);

      // Position camera directly in front of floor center at the same height
      const zDistance = Math.max(floorWidth, floorDepth) * 0.75;
      const newPosition = new THREE.Vector3(
        0 + cameraOffsetX,
        floorCenterY, // Exactly at floor center height (no offset to maintain center view)
        zDistance
      );

      if (window.cameraAnimator) {
        window.cameraAnimator.animateCamera(newPosition, newTarget);
      }
    }
  }, [floors, floorPositions, isFloorChangeAnimate, cameraOffsetX]);

  // Update the focusOnShelf function to properly center on depth changes
  const focusOnShelf = useCallback((location: ShelfLocation) => {
    if (controlsRef.current && isShelfChangeAnimate) {
      const { floor, group_id, group_row, group_column, group_depth = 0 } = location;
      const floorMatrix = floors[floor].matrix;

      // Use cached data
      const { groups } = processGroupsMatrix(floorMatrix, floor);
      const group = groups.find((g: { id: number; }) => g.id === group_id);

      if (group) {
        const floorWidth = floorMatrix[0].length;
        const floorDepth = floorMatrix.length;
        const gridSize = 1;

        // Calculate proper world coordinates for x (column position)
        const x = (group.minJ - floorWidth / 2 + group_column + 0.5) * gridSize;

        // Calculate the exact center height of the shelf
        const shelfHeight = floors[floor].height / group.rows;
        const shelfCenterY = floorPositions[floor] + (shelfHeight * (group_row + 0.5));

        // Improved depth calculation to correctly position based on depth
        // Each depth unit should be a full grid unit, not scaled down
        const depthStep = gridSize;  // Each depth position is a full grid unit
        const baseZ = (group.minI - floorDepth / 2) * gridSize; // Starting position of group

        // Calculate the center position of the selected depth shelf
        const z = baseZ + (group_depth + 0.5) * depthStep;

        const newTarget = new THREE.Vector3(x, shelfCenterY, z);
        const zDistance = 6; // Distance from shelf

        // Position camera to look at the shelf from the correct depth position
        const newPosition = new THREE.Vector3(
          x,          // Same x as target
          shelfCenterY, // Same y as target
          z + zDistance // Positioned back from the shelf's depth
        );

        if (window.cameraAnimator) {
          window.cameraAnimator.animateCamera(newPosition, newTarget);
        }
      }
    }
  }, [floors, floorPositions, isShelfChangeAnimate]);

  const focusOnGroup = useCallback((location: ShelfLocation) => {
    if (controlsRef.current && isGroupChangeAnimate) {
      const { floor, group_id } = location;
      const floorMatrix = floors[floor].matrix;

      // Use cached data
      const { groups } = processGroupsMatrix(floorMatrix, floor);
      const group = groups.find((c: { id: number; }) => c.id === group_id);

      if (group) {
        const floorWidth = floorMatrix[0].length;
        const floorDepth = floorMatrix.length;
        const gridSize = 1;

        // Calculate center of group
        const centerColumn = group.minJ + group.width / 2;
        const x = (centerColumn - floorWidth / 2) * gridSize;

        // Get exact center of the group vertically
        const groupCenterY = floorPositions[floor] + (floors[floor].height / 2);

        const z = (group.position[0] - floorDepth / 2 + 0.5) * gridSize;

        const newTarget = new THREE.Vector3(x, groupCenterY, z);
        const zDistance = group.width * 0.75 + 2;

        // Position camera at exact same height as group center
        const newPosition = new THREE.Vector3(
          x,
          groupCenterY, // Exactly match group center height
          z + zDistance
        );

        if (window.cameraAnimator) {
          window.cameraAnimator.animateCamera(newPosition, newTarget);
        }
      }
    }
  }, [floors, floorPositions, isGroupChangeAnimate]);

  // Update the handleSelect function to include depth

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
    const { groups } = processGroupsMatrix(floorMatrix, location.floor);

    // Find current group
    const currentGroup = groups.find((g: any) => g.id === location.group_id);

    // Calculate maximums
    const max_group_id = groups.length > 0 ? Math.max(...groups.map((g: any) => g.id)) : 0;
    const max_row = currentGroup ? currentGroup.rows - 1 : 0;
    const max_column = currentGroup ? currentGroup.width - 1 : 0;
    const max_depth = currentGroup ? currentGroup.depth - 1 : 0;  // Add max depth from current group

    // Create enhanced location with max values
    const enhancedLocation: ShelfLocation = {
      ...location,
      max_group_id,
      max_row,
      max_column,
      max_depth,
      group_depth: location.group_depth !== undefined ? location.group_depth : 0 // Default to 0 if not specified
    };

    setSelectedLocation(enhancedLocation);

    const groupChanged = !selectedLocation ||
      selectedLocation.floor !== location.floor ||
      selectedLocation.group_id !== location.group_id;

    // Only trigger animations for internal selections or when explicitly needed
    const shouldAnimateGroup = source === 'internal' ? internalIsGroupChangeAnimate : isGroupChangeAnimate;
    const shouldAnimateShelf = source === 'internal' ? internalIsShelfChangeAnimate : isShelfChangeAnimate;

    if (groupChanged && shouldAnimateGroup) {
      focusOnGroup(enhancedLocation);
    } else if (shouldAnimateShelf) {
      focusOnShelf(enhancedLocation);
    }

    if (onSelect) onSelect(enhancedLocation);
  }, [onSelect, focusOnGroup, focusOnShelf, isGroupChangeAnimate, isShelfChangeAnimate,
    internalIsGroupChangeAnimate, internalIsShelfChangeAnimate, selectedLocation, floors]);


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
        selectedLocation.group_id !== externalSelection.group_id ||
        selectedLocation.group_row !== externalSelection.group_row ||
        selectedLocation.group_column !== externalSelection.group_column ||
        selectedLocation.group_depth !== externalSelection.group_depth) {

        // Call handleSelect with source='external'
        handleSelect(externalSelection, 'external');
      }
    }
  }, [externalSelection, floors, handleSelect, selectedLocation]);


  // Update handleArrowNavigation function
  const handleArrowNavigation = useCallback((e: KeyboardEvent) => {
    if (!selectedLocation) return;

    const { key, shiftKey, ctrlKey } = e;
    const { floor, group_id, group_row, group_column, group_depth = 0 } = selectedLocation;
    const floorMatrix = floors[floor].matrix;

    // Use cached data
    const { groups, groupPositions } = processGroupsMatrix(floorMatrix, floor);
    const currentGroup = groups.find((g: { id: number; }) => g.id === group_id);
    if (!currentGroup) return;

    let nextLocation: ShelfLocation | null = null;

    // Find group position
    const groupPosition = groupPositions.find(([_row, _col, id]: [number, number, number]) => id === group_id);
    if (!groupPosition) return;

    const shiftKeyPressed = (key: string) => {
      switch (key) {
        case 'ArrowUp': {
          // Find groups that are positioned above the current group
          const aboveGroups = groups.filter((g: any) =>
            g.maxI < rowStart && // Group is above current group
            g.minJ <= columnStart + currentGroup.width - 1 && // Groups overlap horizontally
            g.maxJ >= columnStart
          );

          if (aboveGroups.length > 0) {
            // Find the closest group above (the one with highest maxI)
            const closestGroup = aboveGroups.reduce((closest: any, group: any) =>
              !closest || group.maxI > closest.maxI ? group : closest, null);

            if (closestGroup) {
              nextLocation = {
                floor,
                group_id: closestGroup.id,
                group_row,
                group_column: Math.min(group_column, closestGroup.width - 1),
                group_depth: closestGroup.depth - 1
              };
            }
          }
          break;
        }
        case 'ArrowDown': {
          // Find groups that are positioned below the current group
          const belowGroups = groups.filter((g: any) =>
            g.minI > rowStart + currentGroup.depth && // Group is below current group
            g.minJ <= columnStart + currentGroup.width - 1 && // Groups overlap horizontally
            g.maxJ >= columnStart
          );

          if (belowGroups.length > 0) {
            // Find the closest group below (the one with lowest minI)
            const closestGroup = belowGroups.reduce((closest: any, group: any) =>
              !closest || group.minI < closest.minI ? group : closest, null);

            if (closestGroup) {
              nextLocation = {
                floor,
                group_id: closestGroup.id,
                group_row,
                group_column: Math.min(group_column, closestGroup.width - 1),
                group_depth: closestGroup.depth - 1
              };
            }
          }
          break;
        }
        // Left and Right group navigation remains the same but add group_depth
        case 'ArrowLeft': {
          const leftColumnStart = findNearestGroupColumnToLeft(floorMatrix, rowStart, columnStart);
          if (leftColumnStart !== -1) {
            const leftGroup = groups.find((g: { position: any[]; minJ: number; maxJ: number; }) =>
              g.position[0] === rowStart && g.minJ <= leftColumnStart && g.maxJ >= leftColumnStart);
            if (leftGroup) {
              nextLocation = {
                floor,
                group_id: leftGroup.id,
                group_row,
                group_column: Math.min(group_column, leftGroup.width - 1),
                group_depth: Math.min(group_depth, leftGroup.depth - 1) // Reset depth when changing groups
              };
            }
          }
          break;
        }
        case 'ArrowRight': {
          const rightColumnStart = findNearestGroupColumnToRight(floorMatrix, rowStart, columnStart + currentGroup.width);
          if (rightColumnStart !== -1) {
            const rightGroup = groups.find((g: { position: any[]; minJ: number; maxJ: number; }) =>
              g.position[0] === rowStart && g.minJ <= rightColumnStart && g.maxJ >= rightColumnStart);
            if (rightGroup) {
              nextLocation = {
                floor,
                group_id: rightGroup.id,
                group_row,
                group_column: Math.min(group_column, rightGroup.width - 1),
                group_depth: Math.min(group_depth, rightGroup.depth - 1) // Reset depth when changing groups
              };
            }
          }
          break;
        }
      }
    }

    const [rowStart, columnStart] = groupPosition;
    if (ctrlKey) {
      switch (key) {
        case 'ArrowUp':
          if (group_depth !== undefined && group_depth > 0) {
            nextLocation = {
              floor,
              group_id,
              group_row,
              group_column,
              group_depth: group_depth - 1
            };
          } else {
            shiftKeyPressed(key);
          }
          break;
        case 'ArrowDown':
          if (group_depth !== undefined && group_depth < (currentGroup.depth - 1)) {
            nextLocation = {
              floor,
              group_id,
              group_row,
              group_column,
              group_depth: group_depth + 1
            };
          } else {
            shiftKeyPressed(key);
          }
          break;
      }
    }
    // Handle group navigation with Shift
    else if (shiftKey) {
      shiftKeyPressed(key);
    } else {
      // Regular shelf navigation within a group
      const { rows, width } = currentGroup;

      switch (key) {
        case 'ArrowUp':
          if (group_row < rows - 1) {
            nextLocation = {
              floor,
              group_id,
              group_row: group_row + 1,
              group_column,
              group_depth
            };
          }
          break;
        case 'ArrowDown':
          if (group_row > 0) {
            nextLocation = {
              floor,
              group_id,
              group_row: group_row - 1,
              group_column,
              group_depth
            };
          }
          break;
        case 'ArrowLeft':
          if (group_column > 0) {
            nextLocation = {
              floor,
              group_id,
              group_row,
              group_column: group_column - 1,
              group_depth
            };
          } else {
            const leftGroupColumn = findNearestGroupColumnToLeft(floorMatrix, rowStart, columnStart);
            if (leftGroupColumn !== -1) {
              const leftGroup = groups.find((g: { position: any[]; minJ: number; maxJ: number; }) =>
                g.position[0] === rowStart && g.minJ <= leftGroupColumn && g.maxJ >= leftGroupColumn);
              if (leftGroup) {
                nextLocation = {
                  floor,
                  group_id: leftGroup.id,
                  group_row: Math.min(group_row, leftGroup.rows - 1),
                  group_column: leftGroup.width - 1,
                  group_depth: Math.min(group_depth, leftGroup.depth - 1) // Reset depth when changing groups
                };
              }
            }
          }
          break;
        case 'ArrowRight':
          if (group_column < width - 1) {
            nextLocation = {
              floor,
              group_id,
              group_row,
              group_column: group_column + 1,
              group_depth
            };
          } else {
            const rightGroupColumn = findNearestGroupColumnToRight(floorMatrix, rowStart, columnStart + width);
            if (rightGroupColumn !== -1) {
              const rightGroup = groups.find((g: { position: any[]; minJ: number; maxJ: number; }) =>
                g.position[0] === rowStart && g.minJ <= rightGroupColumn && g.maxJ >= rightGroupColumn);
              if (rightGroup) {
                nextLocation = {
                  floor,
                  group_id: rightGroup.id,
                  group_row: Math.min(group_row, rightGroup.rows - 1),
                  group_column: 0,
                  group_depth: Math.min(group_depth, rightGroup.depth - 1) // Reset depth when changing groups
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
    const maxWidth = Math.max(...floors.map(floor => floor.matrix[0].length));

    // Use reasonable values based on scene size
    return [
      maxWidth * 1.5 + cameraOffsetX,
      totalHeight + cameraOffsetY,
      maxWidth + 5
    ] as [number, number, number];
  }, [floors, floorPositions, cameraOffsetX, cameraOffsetY]);

  useEffect(() => {
    // First, ensure the scene is ready
    setIsInitialized(true);

    const tryAnimation = (attemptsLeft = 5) => {
      if (initialAnimationTriggered.current) return;

      const animator = ensureCameraAnimator();

      if (animator && controlsRef.current) {
        // Calculate better camera position based on scene size
        const maxWidth = Math.max(...floors.map(floor => floor.matrix[0].length));
        const targetPosition = new THREE.Vector3(
          cameraOffsetX,
          buildingCenterPosition[1],
          maxWidth * 0.6
        );
        const targetLookAt = new THREE.Vector3(...buildingCenterPosition);

        console.log("Starting initial camera animation");
        animator.animateCamera(targetPosition, targetLookAt);
        initialAnimationTriggered.current = true;

        // Set the controls target to match
        controlsRef.current.target.copy(targetLookAt);
      } else if (attemptsLeft > 0) {
        setTimeout(() => tryAnimation(attemptsLeft - 1), 200);
      }
    };

    // First attempt after a short delay
    const timer = setTimeout(() => tryAnimation(), 800);

    return () => clearTimeout(timer);
  }, [buildingCenterPosition, floors, cameraOffsetX, controlsRef]);

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
          near: 0.01,
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
              groupColor={groupColor}
              groupSelectedColor={groupSelectedColor}
              shelfColor={shelfColor}
              shelfHoverColor={shelfHoverColor}
              shelfSelectedColor={shelfSelectedColor}
              occupiedShelfColor={occupiedShelfColor}
              occupiedHoverShelfColor={occupiedHoverShelfColor}
              textColor={textColor}
            />
          ))}
        </group>
        <OrbitControls
          ref={controlsRef}
          target={buildingCenterPosition}
          enableDamping
          dampingFactor={0.1}
        // minDistance={1}
        // maxDistance={100}
        // maxPolarAngle={Math.PI / 1.5}
        // enablePan={true}
        // enabled={!window.cameraAnimator?.isAnimating()}
        />
      </Canvas>
    </div>
  );
});
