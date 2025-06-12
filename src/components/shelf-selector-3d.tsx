'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Key, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

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
  floor?: number;
  group?: number;
  row?: number;
  column?: number;
  depth?: number;
  code?: string;
  max_group?: number;
  max_row?: number;
  max_column?: number;
  max_depth?: number;
}

export interface FloorConfig {
  height: number;
  matrix: number[][];
}

export interface ShelfSelectorColorAssignment {
  floor: number;
  group: number;
  row: number;
  column: number;
  depth: number;
  colorType: 'primary' | 'secondary' | 'tertiary';
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

  shelfSelectorColors?: ShelfSelectorColors;
  shelfColorAssignments?: Array<ShelfSelectorColorAssignment>;
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

// Add geometry and material caches
const geometryCache = new Map<string, THREE.BufferGeometry>();
const materialCache = new Map<string, THREE.Material>();

// Helper function to get cached geometry
const getCachedGeometry = (type: string, args: number[]) => {
  const key = `${type}-${args.join('-')}`;
  if (!geometryCache.has(key)) {
    let geometry: THREE.BufferGeometry;
    switch (type) {
      case 'box':
        geometry = new THREE.BoxGeometry(...args);
        break;
      default:
        geometry = new THREE.BoxGeometry(...args);
    }
    geometryCache.set(key, geometry);
  }
  return geometryCache.get(key)!;
};

// Helper function to get cached material
const getCachedMaterial = (color: string, options: any = {}) => {
  const key = `${color}-${JSON.stringify(options)}`;
  if (!materialCache.has(key)) {
    const material = new THREE.MeshStandardMaterial({
      color,
      ...options
    });
    materialCache.set(key, material);
  }
  return materialCache.get(key)!.clone(); // Clone to allow per-instance modifications
};


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


// Optimized camera animator using singleton pattern
const processGroupsMatrix = (floorMatrix: number[][], floorIndex: number) => {
  const cacheKey = `floor-${floorIndex}-${JSON.stringify(floorMatrix)}`;

  if (matrixCache.has(cacheKey)) {
    return matrixCache.get(cacheKey);
  }

  const groups = [];
  const groupPositions = [];
  const visited = Array(floorMatrix.length).fill(0).map(() => Array(floorMatrix[0].length).fill(false));
  let groupId = 0;

  // First pass: Detect hollow rectangles (U-shaped or O-shaped layouts)
  const hollowPatterns = [];
  for (let i = 0; i < floorMatrix.length; i++) {
    for (let j = 0; j < floorMatrix[i].length; j++) {
      // Look for potential hollow rectangles: areas with shelves surrounding empty space
      if (floorMatrix[i][j] > 0 && !visited[i][j]) {
        const value = floorMatrix[i][j];

        // Check if this could be part of a hollow rectangle by looking for a large enough shape
        // with empty space inside
        const connectedCells = [];
        const tempVisited = Array(floorMatrix.length).fill(0).map(() => Array(floorMatrix[0].length).fill(false));
        const queue = [[i, j]];
        tempVisited[i][j] = true;

        let minI = i, maxI = i;
        let minJ = j, maxJ = j;

        // Find connected component
        while (queue.length > 0) {
          const [x, y] = queue.shift()!;
          connectedCells.push([x, y]);

          // Update bounding box
          minI = Math.min(minI, x);
          maxI = Math.max(maxI, x);
          minJ = Math.min(minJ, y);
          maxJ = Math.max(maxJ, y);

          // 4-way connectivity check
          const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
          for (const [dx, dy] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < floorMatrix.length &&
              ny >= 0 && ny < floorMatrix[0].length &&
              floorMatrix[nx][ny] === value &&
              !tempVisited[nx][ny]) {
              tempVisited[nx][ny] = true;
              queue.push([nx, ny]);
            }
          }
        }

        // Check if this is a hollow rectangle by analyzing the shape
        const width = maxJ - minJ + 1;
        const height = maxI - minI + 1;

        // For this to be a hollow rectangle:
        // 1. It needs to have a large enough area
        // 2. The number of connected cells should be much less than the total area
        // 3. There should be cells in the middle that are not part of the connected component
        if (width > 2 && height > 2) {
          let hasInnerEmpty = false;
          let perimeterCount = 0;

          // Count cells that are on the perimeter vs. all cells in the bounding box
          for (let x = minI; x <= maxI; x++) {
            for (let y = minJ; y <= maxJ; y++) {
              // Check if this is a perimeter cell
              if (x === minI || x === maxI || y === minJ || y === maxJ) {
                if (floorMatrix[x][y] === value) perimeterCount++;
              } else if (floorMatrix[x][y] === 0) {
                // Found empty cell inside the bounding box
                hasInnerEmpty = true;
              }
            }
          }

          // If we have a significant perimeter and empty space inside, this is a hollow rectangle
          if (hasInnerEmpty && perimeterCount > 0) {
            hollowPatterns.push({
              minI, maxI, minJ, maxJ, value
            });
          }
        }
      }
    }
  }

  // Second pass: Process groups, handling hollow rectangles specially
  for (let i = 0; i < floorMatrix.length; i++) {
    for (let j = 0; j < floorMatrix[i].length; j++) {
      if (floorMatrix[i][j] > 0 && !visited[i][j]) {
        const value = floorMatrix[i][j]; // The shelf type (e.g., 5 or 4)

        // Check if this cell is part of a hollow pattern
        const hollowPattern = hollowPatterns.find(p =>
          p.value === value &&
          i >= p.minI && i <= p.maxI &&
          j >= p.minJ && j <= p.maxJ);

        if (hollowPattern) {
          // For hollow rectangles, we process each side separately
          // Top edge
          if (i === hollowPattern.minI) {
            let edgeMinJ = j;
            let edgeMaxJ = j;

            // Find the extent of this top edge
            while (edgeMaxJ + 1 <= hollowPattern.maxJ &&
              floorMatrix[i][edgeMaxJ + 1] === value &&
              !visited[i][edgeMaxJ + 1]) {
              edgeMaxJ++;
            }

            // Mark as visited
            for (let col = edgeMinJ; col <= edgeMaxJ; col++) {
              visited[i][col] = true;
            }

            // Calculate depth - how far this edge extends vertically
            let depth = 1;
            let row = i + 1;
            while (row <= hollowPattern.maxI) {
              // Check if this row is part of the edge (not a corner or another edge)
              let isPartOfEdge = true;
              for (let col = edgeMinJ; col <= edgeMaxJ; col++) {
                if (floorMatrix[row][col] !== value) {
                  isPartOfEdge = false;
                  break;
                }
              }

              if (!isPartOfEdge) break;

              // Mark as visited
              for (let col = edgeMinJ; col <= edgeMaxJ; col++) {
                visited[row][col] = true;
              }

              depth++;
              row++;
            }

            groups.push({
              id: groupId,
              rows: value, // Number of shelves based on the value
              width: edgeMaxJ - edgeMinJ + 1,
              depth,
              position: [i, edgeMinJ], // Store starting position
              minI: i,
              maxI: i + depth - 1,
              minJ: edgeMinJ,
              maxJ: edgeMaxJ
            });

            groupPositions.push([i, edgeMinJ, groupId]);
            groupId++;
          }
          // Bottom edge
          else if (i === hollowPattern.maxI) {
            // Similar processing for bottom edge
            let edgeMinJ = j;
            let edgeMaxJ = j;

            while (edgeMaxJ + 1 <= hollowPattern.maxJ &&
              floorMatrix[i][edgeMaxJ + 1] === value &&
              !visited[i][edgeMaxJ + 1]) {
              edgeMaxJ++;
            }

            for (let col = edgeMinJ; col <= edgeMaxJ; col++) {
              visited[i][col] = true;
            }

            let depth = 1;
            let row = i - 1;
            while (row >= hollowPattern.minI) {
              let isPartOfEdge = true;
              for (let col = edgeMinJ; col <= edgeMaxJ; col++) {
                if (floorMatrix[row][col] !== value || visited[row][col]) {
                  isPartOfEdge = false;
                  break;
                }
              }

              if (!isPartOfEdge) break;

              for (let col = edgeMinJ; col <= edgeMaxJ; col++) {
                visited[row][col] = true;
              }

              depth++;
              row--;
            }

            groups.push({
              id: groupId,
              rows: value,
              width: edgeMaxJ - edgeMinJ + 1,
              depth,
              position: [i - depth + 1, edgeMinJ],
              minI: i - depth + 1,
              maxI: i,
              minJ: edgeMinJ,
              maxJ: edgeMaxJ
            });

            groupPositions.push([i - depth + 1, edgeMinJ, groupId]);
            groupId++;
          }
          // Left edge
          else if (j === hollowPattern.minJ) {
            // Process left edge
            let edgeMinI = i;
            let edgeMaxI = i;

            while (edgeMaxI + 1 <= hollowPattern.maxI &&
              floorMatrix[edgeMaxI + 1][j] === value &&
              !visited[edgeMaxI + 1][j]) {
              edgeMaxI++;
            }

            for (let row = edgeMinI; row <= edgeMaxI; row++) {
              visited[row][j] = true;
            }

            let width = 1;
            let col = j + 1;
            while (col <= hollowPattern.maxJ) {
              let isPartOfEdge = true;
              for (let row = edgeMinI; row <= edgeMaxI; row++) {
                if (floorMatrix[row][col] !== value || visited[row][col]) {
                  isPartOfEdge = false;
                  break;
                }
              }

              if (!isPartOfEdge) break;

              for (let row = edgeMinI; row <= edgeMaxI; row++) {
                visited[row][col] = true;
              }

              width++;
              col++;
            }

            groups.push({
              id: groupId,
              rows: value,
              width,
              depth: edgeMaxI - edgeMinI + 1,
              position: [edgeMinI, j],
              minI: edgeMinI,
              maxI: edgeMaxI,
              minJ: j,
              maxJ: j + width - 1
            });

            groupPositions.push([edgeMinI, j, groupId]);
            groupId++;
          }
          // Right edge
          else if (j === hollowPattern.maxJ) {
            // Process right edge
            let edgeMinI = i;
            let edgeMaxI = i;

            while (edgeMaxI + 1 <= hollowPattern.maxI &&
              floorMatrix[edgeMaxI + 1][j] === value &&
              !visited[edgeMaxI + 1][j]) {
              edgeMaxI++;
            }

            for (let row = edgeMinI; row <= edgeMaxI; row++) {
              visited[row][j] = true;
            }

            let width = 1;
            let col = j - 1;
            while (col >= hollowPattern.minJ) {
              let isPartOfEdge = true;
              for (let row = edgeMinI; row <= edgeMaxI; row++) {
                if (floorMatrix[row][col] !== value || visited[row][col]) {
                  isPartOfEdge = false;
                  break;
                }
              }

              if (!isPartOfEdge) break;

              for (let row = edgeMinI; row <= edgeMaxI; row++) {
                visited[row][col] = true;
              }

              width++;
              col--;
            }

            groups.push({
              id: groupId,
              rows: value,
              width,
              depth: edgeMaxI - edgeMinI + 1,
              position: [edgeMinI, j - width + 1],
              minI: edgeMinI,
              maxI: edgeMaxI,
              minJ: j - width + 1,
              maxJ: j
            });

            groupPositions.push([edgeMinI, j - width + 1, groupId]);
            groupId++;
          }
        } else {
          // Standard BFS for non-hollow patterns (existing logic)
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
  }

  const result = { groups, groupPositions };
  matrixCache.set(cacheKey, result);
  return result;
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
  occupiedHoverShelfColor,
  shelfType = 'primary',
  secondaryShelfColor,
  secondaryShelfHoverColor,
  tertiaryShelfColor,
  tertiaryShelfHoverColor
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
  shelfType?: 'primary' | 'secondary' | 'tertiary';
  secondaryShelfColor?: string;
  secondaryShelfHoverColor?: string;
  tertiaryShelfColor?: string;
  tertiaryShelfHoverColor?: string;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const [shelfOpacity, setShelfOpacity] = useState(1);
  const [isVisible, setIsVisible] = useState(true);

  // Shelf-specific distance thresholds
  const SHELF_FADE_START = 5.75;
  const SHELF_FADE_END = 5.5;
  const VISIBILITY_THRESHOLD = 0.4;

  // Cache the geometry based on size
  const geometry = useMemo(() => getCachedGeometry('box', size), [size]);

  // Update shelf opacity based on distance (optimized with frame skipping)
  const frameCounter = useRef(0);
  useFrame(() => {
    // Skip every other frame for better performance
    if (frameCounter.current++ % 2 !== 0) return;

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

      if (Math.abs(newOpacity - shelfOpacity) > 0.01) {
        setShelfOpacity(newOpacity);
        setIsVisible(newOpacity * groupOpacity > VISIBILITY_THRESHOLD);
      }
    }
  });

  // Determine colors based on shelf type
  let baseColor = shelfColor;
  let hoverColor = shelfHoverColor;

  if (shelfType === 'secondary' && secondaryShelfColor) {
    baseColor = secondaryShelfColor;
    hoverColor = secondaryShelfHoverColor || secondaryShelfColor;
  } else if (shelfType === 'tertiary' && tertiaryShelfColor) {
    baseColor = tertiaryShelfColor;
    hoverColor = tertiaryShelfHoverColor || tertiaryShelfColor;
  }

  const color = isOccupied
    ? (isHovered ? occupiedHoverShelfColor : occupiedShelfColor)
    : isSelected
      ? shelfSelectedColor
      : isHovered
        ? hoverColor
        : baseColor;

  const emissiveColor = isSelected ? shelfSelectedColor : "#000000";
  const emissiveIntensity = isSelected ? 0.3 : 0;
  const finalOpacity = groupOpacity * shelfOpacity;

  // Cache material with current state
  const material = useMemo(() => {
    return getCachedMaterial(color, {
      emissive: emissiveColor,
      emissiveIntensity,
      transparent: true,
      depthWrite: finalOpacity > 0.5,
      opacity: finalOpacity
    });
  }, [color, emissiveColor, emissiveIntensity, finalOpacity]);

  const handlePointerOver = isVisible ? onPointerOver : undefined;
  const handlePointerOut = isVisible ? onPointerOut : undefined;
  const handleClick = isVisible ? onClick : undefined;

  return (
    <mesh
      ref={meshRef}
      position={position}
      geometry={geometry}
      material={material}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
      castShadow
      receiveShadow
    />
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
  occupiedHoverShelfColor,
  secondaryShelfColor,
  secondaryShelfHoverColor,
  tertiaryShelfColor,
  tertiaryShelfHoverColor,
  shelfColorAssignments,
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
  secondaryShelfColor?: string;
  secondaryShelfHoverColor?: string;
  tertiaryShelfColor?: string;
  tertiaryShelfHoverColor?: string;
  shelfColorAssignments?: Array<{
    floor: number;
    group: number;
    row: number;
    column: number;
    depth?: number;
    colorType: 'primary' | 'secondary' | 'tertiary';
  }>;
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
      (loc.floor === floorIndex || loc.floor === undefined) &&
      (loc.group === cabId || loc.group === undefined) &&
      (loc.row === rowIndex || loc.row === undefined) &&
      (loc.column === colIndex || loc.column === undefined) &&
      (loc.depth === depthIndex || loc.depth === undefined)
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

  // Function to determine shelf type based on location
  const getShelfType = useCallback((floorIndex: number, groupId: number, rowIndex: number, colIndex: number, depthIndex: number): 'primary' | 'secondary' | 'tertiary' => {
    if (!shelfColorAssignments || shelfColorAssignments.length === 0) return 'primary';

    const assignment = shelfColorAssignments.find(a =>
      a.floor === floorIndex && a.group === groupId &&
      a.row === rowIndex && a.column === colIndex &&
      (a.depth === undefined || a.depth === depthIndex)
    );

    return assignment?.colorType || 'primary';
  }, [shelfColorAssignments]);

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
        group: groupId,
        row: rowIndex,
        column: colIndex,
        depth: depthIndex
      });
    }
  }, [isInteractionDisabled, onSelect, floor, groupId, isLocationOccupied, canSelectOccupiedLocations]);

  // Pre-calculate shelf positions and properties for better rendering
  const shelves = useMemo(() => {
    const items = [];
    const shelfGeometry = getCachedGeometry('box', [cellWidth * 0.9, cellHeight * 0.9, cellDepth * 0.9]);

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
      for (let colIndex = 0; colIndex < columns; colIndex++) {
        for (let depthIndex = 0; depthIndex < depth; depthIndex++) {
          const isShelfSelected =
            selectedLocation?.floor === floor &&
            selectedLocation?.group === groupId &&
            selectedLocation?.row === rowIndex &&
            selectedLocation?.column === colIndex &&
            (selectedLocation?.depth === depthIndex || selectedLocation?.depth === undefined);

          const isHovered = !!(hoverCell &&
            hoverCell[0] === rowIndex &&
            hoverCell[1] === colIndex &&
            hoverCell[2] === depthIndex);

          const isOccupied = isLocationOccupied(floor, groupId, rowIndex, colIndex, depthIndex);
          const shelfType = getShelfType(floor, groupId, rowIndex, colIndex, depthIndex);

          items.push({
            key: `${rowIndex}-${colIndex}-${depthIndex}`,
            position: [
              (colIndex - columns / 2 + 0.5) * cellWidth,
              (rowIndex - rows / 2 + 0.5) * cellHeight,
              (depthIndex - depth / 2 + 0.5) * cellDepth
            ],
            size: [cellWidth * 0.9, cellHeight * 0.9, cellDepth * 0.9],
            geometry: shelfGeometry, // Reuse cached geometry
            isHovered,
            isSelected: isShelfSelected,
            isOccupied,
            rowIndex,
            colIndex,
            depthIndex,
            shelfType
          });
        }
      }
    }

    return items;
  }, [rows, columns, depth, cellWidth, cellHeight, cellDepth, selectedLocation, hoverCell, floor, groupId, isLocationOccupied, getShelfType]);

  // Cache group geometry
  const groupGeometry = useMemo(() => getCachedGeometry('box', size), [size]);

  return (
    <group position={position} ref={groupRef}>
      {/* Group frame - use cached geometry */}
      <mesh
        renderOrder={1}
        castShadow
        receiveShadow
        geometry={groupGeometry}
        material={getCachedMaterial(isSelected ? groupSelectedColor : groupColor, {
          transparent: true,
          opacity: opacity * 0.3,
          depthWrite: true
        })}
      />

      {/* Shelves with cached geometries */}
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
          shelfType={shelf.shelfType}
          shelfColor={shelfColor}
          shelfHoverColor={shelfHoverColor}
          shelfSelectedColor={shelfSelectedColor}
          occupiedShelfColor={occupiedShelfColor}
          occupiedHoverShelfColor={occupiedHoverShelfColor}
          secondaryShelfColor={secondaryShelfColor}
          secondaryShelfHoverColor={secondaryShelfHoverColor}
          tertiaryShelfColor={tertiaryShelfColor}
          tertiaryShelfHoverColor={tertiaryShelfHoverColor}
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
  secondaryShelfColor,
  secondaryShelfHoverColor,
  tertiaryShelfColor,
  tertiaryShelfHoverColor,
  shelfColorAssignments,
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
  secondaryShelfColor?: string;
  secondaryShelfHoverColor?: string;
  tertiaryShelfColor?: string;
  tertiaryShelfHoverColor?: string;
  shelfColorAssignments?: Array<{
    floor: number;
    group: number;
    row: number;
    column: number;
    depth?: number;
    colorType: 'primary' | 'secondary' | 'tertiary';
  }>;
  textColor: string;
}) => {
  const { matrix, height } = floorConfig;
  const floorWidth = matrix[0].length;
  const floorDepth = matrix.length;
  const gridSize = 1;

  // Cache floor geometry
  const floorGeometry = useMemo(() =>
    getCachedGeometry('box', [floorWidth * gridSize, 0.1, floorDepth * gridSize]),
    [floorWidth, floorDepth, gridSize]
  );

  // Use cached group data with depth info
  const { groups } = useMemo(() =>
    processGroupsMatrix(matrix, floorIndex),
    [matrix, floorIndex]
  );

  return (
    <group position={[0, yPosition, 0]}>
      {/* Floor base with cached geometry */}
      <mesh
        position={[0, -0.1, 0]}
        castShadow
        receiveShadow
        geometry={floorGeometry}
        material={getCachedMaterial(isHighlighted ? floorHighlightedColor : floorColor)}
      />

      {/* Groups with depth */}
      {groups.map((group: { id: Key | null | undefined; minI: any; minJ: any; width: number; depth: number; rows: number; }) => {
        const isSelected = selectedLocation?.floor === floorIndex &&
          selectedLocation?.group === group.id;

        // Calculate correct position with depth
        const rowPos = group.minI; // Starting row index
        const colPos = group.minJ; // Starting column index

        return (
          <Group
            key={group.id}
            position={[
              (colPos - floorWidth / 2 + group.width / 2) * gridSize,
              height / 2,
              (rowPos - floorDepth / 2 + group.depth / 2) * gridSize
            ]}
            size={[
              group.width * gridSize,
              height,
              group.depth * gridSize
            ]}
            rows={group.rows}
            columns={group.width}
            depth={group.depth}
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
            secondaryShelfColor={secondaryShelfColor}
            secondaryShelfHoverColor={secondaryShelfHoverColor}
            tertiaryShelfColor={tertiaryShelfColor}
            tertiaryShelfHoverColor={tertiaryShelfHoverColor}
            shelfColorAssignments={shelfColorAssignments}
          />
        );
      })}
    </group>
  );
});

// Add cleanup function at the end of the file (around line 1200)
// Cleanup function to clear caches when needed
export const clearShelfSelectorCaches = () => {
  geometryCache.forEach(geometry => geometry.dispose());
  materialCache.forEach(material => material.dispose());
  geometryCache.clear();
  materialCache.clear();
  matrixCache.clear();
};

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



// Convert column to Excel style (AA = 0, AB = 1, etc.)
export const parseColumn = (column: number | null) => {
  if (column === null || column === undefined) return null;

  const firstChar = String.fromCharCode(65 + Math.floor(column / 26));
  const secondChar = String.fromCharCode(65 + (column % 26));
  const colStr = column !== undefined && column !== null ?
    firstChar + secondChar :
    null;
  return colStr;
}

export const formatCode = (location: any | any) => {
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

export interface ShelfSelectorColors {
  backgroundColor?: string;
  floorColor?: string;
  floorHighlightedColor?: string;
  groupColor?: string;
  groupSelectedColor?: string;
  shelfColor?: string;
  shelfHoverColor?: string;
  shelfSelectedColor?: string;
  occupiedShelfColor?: string;
  occupiedHoverShelfColor?: string;
  secondaryShelfColor?: string;
  secondaryShelfHoverColor?: string;
  tertiaryShelfColor?: string;
  tertiaryShelfHoverColor?: string;
  shelfColorAssignments?: Array<{
    floor: number;
    group: number;
    row: number;
    column: number;
    depth?: number;
    colorType: 'primary' | 'secondary' | 'tertiary';
  }>;
  textColor?: string;
}

/**
 * Default colors for the ShelfSelector3D component
 */
export const defaultShelfSelectorColors: ShelfSelectorColors = {
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
  secondaryShelfColor: "#a5d6a7", // Secondary shelf - light green
  secondaryShelfHoverColor: "#81c784", // Secondary hover - medium green
  tertiaryShelfColor: "#90caf9", // Tertiary shelf - light blue
  tertiaryShelfHoverColor: "#64b5f6", // Tertiary hover - medium blue
  shelfColorAssignments: [], // Default empty array
  textColor: "#2c3e50",       // Dark blue text
};

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
  shelfColorAssignments = [],

  shelfSelectorColors = {}, // New prop for custom colors
}: ShelfSelectorProps) => {
  const [sceneGL, setSceneGL] = useState<THREE.WebGLRenderer | null>(null);
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
      loc.group === location.group &&
      loc.row === location.row &&
      loc.column === location.column
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

      const { floor = 0, group = 0, row = 0, column = 0, depth = 0 } = location;
      const floorMatrix = floors[floor].matrix;

      // Use cached data
      const { groups } = processGroupsMatrix(floorMatrix, floor);
      const currentGroup = groups.find((g: { id: number; }) => g.id === group);

      if (currentGroup) {
        const floorWidth = floorMatrix[0].length;
        const floorDepth = floorMatrix.length;
        const gridSize = 1;

        // Calculate proper world coordinates for x (column position)
        const x = (currentGroup.minJ - floorWidth / 2 + column + 0.5) * gridSize;

        // Calculate the exact center height of the shelf
        const shelfHeight = floors[floor].height / currentGroup.rows;
        const shelfCenterY = floorPositions[floor] + (shelfHeight * (row + 0.5));

        // Improved depth calculation to correctly position based on depth
        // Each depth unit should be a full grid unit, not scaled down
        const depthStep = gridSize;  // Each depth position is a full grid unit
        const baseZ = (currentGroup.minI - floorDepth / 2) * gridSize; // Starting position of group

        // Calculate the center position of the selected depth shelf
        const z = baseZ + (depth + 0.5) * depthStep;

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
      const { floor = 0, group = 0 } = location;
      const floorMatrix = floors[floor].matrix;

      // Use cached data
      const { groups } = processGroupsMatrix(floorMatrix, floor);
      const currentGroup = groups.find((c: { id: number; }) => c.id === group);

      if (currentGroup) {
        const floorWidth = floorMatrix[0].length;
        const floorDepth = floorMatrix.length;
        const gridSize = 1;

        // Calculate center of group
        const centerColumn = currentGroup.minJ + currentGroup.width / 2;
        const x = (centerColumn - floorWidth / 2) * gridSize;

        // Get exact center of the group vertically
        const groupCenterY = floorPositions[floor] + (floors[floor].height / 2);

        const z = (currentGroup.position[0] - floorDepth / 2 + 0.5) * gridSize;

        const newTarget = new THREE.Vector3(x, groupCenterY, z);
        const zDistance = currentGroup.width * 0.75 + 2;

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
    const floorMatrix = floors[location.floor || 0].matrix;
    const { groups } = processGroupsMatrix(floorMatrix, location.floor || 0);

    // Find current group
    const currentGroup = groups.find((g: any) => g.id === location.group);

    // Calculate maximums
    const max_group = groups.length > 0 ? Math.max(...groups.map((g: any) => g.id)) : 0;
    const max_row = currentGroup ? currentGroup.rows - 1 : 0;
    const max_column = currentGroup ? currentGroup.width - 1 : 0;
    const max_depth = currentGroup ? currentGroup.depth - 1 : 0;  // Add max depth from current group

    // Create enhanced location with max values
    const enhancedLocation: ShelfLocation = {
      ...location,
      max_group,
      max_row,
      max_column,
      max_depth,
      code: formatCode(location),
      depth: location.depth !== undefined ? location.depth : 0 // Default to 0 if not specified
    };

    setSelectedLocation(enhancedLocation);

    const groupChanged = !selectedLocation ||
      selectedLocation.floor !== location.floor ||
      selectedLocation.group !== location.group;

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
    if (selectedLocation && selectedLocation.floor !== undefined) {
      if (onHighlightFloor) {
        onHighlightFloor(selectedLocation.floor);
      } else {
        setInternalHighlightedFloor(selectedLocation.floor);
      }
    }
  }, [selectedLocation, onHighlightFloor]);

  // Update the external selection effect to respect user interactions and validate bounds
  useEffect(() => {
    if (externalSelection && externalSelection.floor !== undefined && floors[externalSelection.floor] && !userInteractionInProgress.current) {
      // Validate and clamp the external selection to valid bounds
      const validatedSelection = { ...externalSelection };

      // Validate floor index
      validatedSelection.floor = Math.max(0, Math.min(validatedSelection.floor || 0, floors.length - 1));

      // Get the floor matrix for group calculations
      const floorMatrix = floors[validatedSelection.floor].matrix;
      const { groups } = processGroupsMatrix(floorMatrix, validatedSelection.floor);

      // Validate group
      const maxGroupId = groups.length > 0 ? groups.length - 1 : 0;
      validatedSelection.group = Math.max(0, Math.min(validatedSelection.group || 0, maxGroupId));

      // Find current group
      const currentGroup = groups.find((g: any) => g.id === validatedSelection.group);

      if (currentGroup) {
        // Validate row
        validatedSelection.row = Math.max(0, Math.min(validatedSelection.row || 0, currentGroup.rows - 1));

        // Validate column
        validatedSelection.column = Math.max(0, Math.min(validatedSelection.column || 0, currentGroup.width - 1));

        // Validate depth
        validatedSelection.depth = Math.max(0, Math.min(validatedSelection.depth || 0, currentGroup.depth - 1));
      }

      validatedSelection.code = formatCode(validatedSelection);

      // Only update if it's different from the current selection
      if (!selectedLocation ||
        selectedLocation.floor !== validatedSelection.floor ||
        selectedLocation.group !== validatedSelection.group ||
        selectedLocation.row !== validatedSelection.row ||
        selectedLocation.column !== validatedSelection.column ||
        selectedLocation.depth !== validatedSelection.depth) {

        // Call handleSelect with source='external' and validated selection
        handleSelect(validatedSelection, 'external');
      }
    }
  }, [externalSelection, floors, handleSelect, selectedLocation]);


  // Update handleArrowNavigation function
  const handleArrowNavigation = useCallback((e: KeyboardEvent) => {
    if (!selectedLocation) return;

    const { key, shiftKey, ctrlKey } = e;
    const { floor = 0, group = 0, row = 0, column = 0, depth = 0 } = selectedLocation;
    const floorMatrix = floors[floor].matrix;

    // Use cached data
    const { groups, groupPositions } = processGroupsMatrix(floorMatrix, floor);
    const currentGroup = groups.find((g: { id: number; }) => g.id === group);
    if (!currentGroup) return;

    let nextLocation: ShelfLocation | null = null;

    // Find group position
    const groupPosition = groupPositions.find(([_row, _col, id]: [number, number, number]) => id === group);
    if (!groupPosition) return;

    const [rowStart, columnStart] = groupPosition;
    if (ctrlKey) {
      switch (key) {
        case 'ArrowUp':
          if (depth !== undefined && depth > 0) {
            nextLocation = {
              floor,
              group,
              row,
              column,
              depth: depth - 1
            };
          } else {
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
                  group: closestGroup.id,
                  row,
                  column: Math.min(column, closestGroup.width - 1),
                  depth: closestGroup.depth - 1
                };
              }
            }
          }
          break;
        case 'ArrowDown':
          if (depth !== undefined && depth < (currentGroup.depth - 1)) {
            nextLocation = {
              floor,
              group,
              row,
              column,
              depth: depth + 1
            };
          } else {
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
                  group: closestGroup.id,
                  row,
                  column: Math.min(column, closestGroup.width - 1),
                  depth: 0
                };
              }
            }
          }
          break;
      }
    }
    // Handle group navigation with Shift
    else if (shiftKey) {
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
                group: closestGroup.id,
                row,
                column: Math.min(column, closestGroup.width - 1),
                depth: closestGroup.depth - 1
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
                group: closestGroup.id,
                row,
                column: Math.min(column, closestGroup.width - 1),
                depth: closestGroup.depth - 1
              };
            }
          }
          break;
        }
        // Left and Right group navigation remains the same but add depth
        case 'ArrowLeft': {
          const leftColumnStart = findNearestGroupColumnToLeft(floorMatrix, rowStart, columnStart);
          if (leftColumnStart !== -1) {
            const leftGroup = groups.find((g: { position: any[]; minJ: number; maxJ: number; }) =>
              g.position[0] === rowStart && g.minJ <= leftColumnStart && g.maxJ >= leftColumnStart);
            if (leftGroup) {
              nextLocation = {
                floor,
                group: leftGroup.id,
                row,
                column: Math.min(column, leftGroup.width - 1),
                depth: Math.min(depth, leftGroup.depth - 1) // Reset depth when changing groups
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
                group: rightGroup.id,
                row,
                column: Math.min(column, rightGroup.width - 1),
                depth: Math.min(depth, rightGroup.depth - 1) // Reset depth when changing groups
              };
            }
          }
          break;
        }
      }
    } else {
      // Regular shelf navigation within a group
      const { rows, width } = currentGroup;

      switch (key) {
        case 'ArrowUp':
          if (row < rows - 1) {
            nextLocation = {
              floor,
              group,
              row: row + 1,
              column,
              depth
            };
          }
          break;
        case 'ArrowDown':
          if (row > 0) {
            nextLocation = {
              floor,
              group,
              row: row - 1,
              column,
              depth
            };
          }
          break;
        case 'ArrowLeft':
          if (column > 0) {
            nextLocation = {
              floor,
              group,
              row,
              column: column - 1,
              depth
            };
          } else {
            const leftGroupColumn = findNearestGroupColumnToLeft(floorMatrix, rowStart, columnStart);
            if (leftGroupColumn !== -1) {
              const leftGroup = groups.find((g: { position: any[]; minJ: number; maxJ: number; }) =>
                g.position[0] === rowStart && g.minJ <= leftGroupColumn && g.maxJ >= leftGroupColumn);
              if (leftGroup) {
                nextLocation = {
                  floor,
                  group: leftGroup.id,
                  row: Math.min(row, leftGroup.rows - 1),
                  column: leftGroup.width - 1,
                  depth: Math.min(depth, leftGroup.depth - 1) // Reset depth when changing groups
                };
              }
            }
          }
          break;
        case 'ArrowRight':
          if (column < width - 1) {
            nextLocation = {
              floor,
              group,
              row,
              column: column + 1,
              depth
            };
          } else {
            const rightGroupColumn = findNearestGroupColumnToRight(floorMatrix, rowStart, columnStart + width);
            if (rightGroupColumn !== -1) {
              const rightGroup = groups.find((g: { position: any[]; minJ: number; maxJ: number; }) =>
                g.position[0] === rowStart && g.minJ <= rightGroupColumn && g.maxJ >= rightGroupColumn);
              if (rightGroup) {
                nextLocation = {
                  floor,
                  group: rightGroup.id,
                  row: Math.min(row, rightGroup.rows - 1),
                  column: 0,
                  depth: Math.min(depth, rightGroup.depth - 1) // Reset depth when changing groups
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
        // Check if there's already a selected location
        if (selectedLocation) {
          // Focus on the selected shelf
          focusOnShelf(selectedLocation);
          initialAnimationTriggered.current = true;
        }
        // If no selection exists, but an external selection is provided
        else if (externalSelection && externalSelection.floor !== undefined) {
          // Create a validated version of the external selection
          const validatedSelection = { ...externalSelection };

          // Validate floor index
          validatedSelection.floor = Math.max(0, Math.min(validatedSelection.floor || 0, floors.length - 1));

          // Get the floor matrix for further validation
          const floorMatrix = floors[validatedSelection.floor].matrix;
          const { groups } = processGroupsMatrix(floorMatrix, validatedSelection.floor);

          // Validate group
          const maxGroupId = groups.length > 0 ? Math.max(...groups.map((g: { id: any; }) => g.id)) : 0;
          validatedSelection.group = Math.max(0, Math.min(validatedSelection.group || 0, maxGroupId));

          // Focus on the validated external selection
          focusOnShelf(validatedSelection);
          initialAnimationTriggered.current = true;
        }
        // Default: focus on center of floorplan if no selection exists
        else {
          // Calculate better camera position based on scene size
          const maxWidth = Math.max(...floors.map(floor => floor.matrix[0].length));
          const targetPosition = new THREE.Vector3(
            cameraOffsetX,
            buildingCenterPosition[1],
            maxWidth * 1.5
          );
          const targetLookAt = new THREE.Vector3(...buildingCenterPosition);

          console.log("Starting initial camera animation to center view");
          animator.animateCamera(targetPosition, targetLookAt);
          initialAnimationTriggered.current = true;

          // Set the controls target to match
          controlsRef.current.target.copy(targetLookAt);
        }
      } else if (attemptsLeft > 0) {
        setTimeout(() => tryAnimation(attemptsLeft - 1), 200);
      }
    };

    // First attempt after a short delay to ensure component is fully rendered
    const timer = setTimeout(() => tryAnimation(), 800);

    return () => clearTimeout(timer);
  }, [buildingCenterPosition, floors, focusOnShelf, cameraOffsetX, controlsRef, selectedLocation, externalSelection]);

  // on change of background color
  useEffect(() => {
    sceneGL?.setClearColor(shelfSelectorColors.backgroundColor || window.shelfSelectorColors!.backgroundColor!);
  }, [window.shelfSelectorColors]);

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
          stencil: false, // Disable stencil buffer
          depth: true,
          logarithmicDepthBuffer: false, // Disable for better performance
        }}
        performance={{
          min: 0.5,
          max: 1.0,
          debounce: 200 
        }}
        frameloop="demand"
        onCreated={({ gl, scene: onLoadScene }) => {
          gl.setClearColor(shelfSelectorColors.backgroundColor || window.shelfSelectorColors!.backgroundColor!);
          setSceneGL(gl);
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
              floorColor={shelfSelectorColors.floorColor || window.shelfSelectorColors!.floorColor!}
              floorHighlightedColor={shelfSelectorColors.floorHighlightedColor || window.shelfSelectorColors!.floorHighlightedColor!}
              groupColor={shelfSelectorColors.groupColor || window.shelfSelectorColors!.groupColor!}
              groupSelectedColor={shelfSelectorColors.groupSelectedColor || window.shelfSelectorColors!.groupSelectedColor!}
              shelfColor={shelfSelectorColors.shelfColor || window.shelfSelectorColors!.shelfColor!}
              shelfHoverColor={shelfSelectorColors.shelfHoverColor || window.shelfSelectorColors!.shelfHoverColor!}
              shelfSelectedColor={shelfSelectorColors.shelfSelectedColor || window.shelfSelectorColors!.shelfSelectedColor!}
              occupiedShelfColor={shelfSelectorColors.occupiedShelfColor || window.shelfSelectorColors!.occupiedShelfColor!}
              occupiedHoverShelfColor={shelfSelectorColors.occupiedHoverShelfColor || window.shelfSelectorColors!.occupiedHoverShelfColor!}
              secondaryShelfColor={shelfSelectorColors.secondaryShelfColor || window.shelfSelectorColors!.secondaryShelfColor!}
              secondaryShelfHoverColor={shelfSelectorColors.secondaryShelfHoverColor || window.shelfSelectorColors!.secondaryShelfHoverColor!}
              tertiaryShelfColor={shelfSelectorColors.tertiaryShelfColor || window.shelfSelectorColors!.tertiaryShelfColor!}
              tertiaryShelfHoverColor={shelfSelectorColors.tertiaryShelfHoverColor || window.shelfSelectorColors!.tertiaryShelfHoverColor!}
              textColor={shelfSelectorColors.textColor || window.shelfSelectorColors!.textColor!}
              shelfColorAssignments={shelfColorAssignments}
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
