'use client';

import { useState, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Accordion, AccordionItem, Button, Card, CardBody, Switch } from '@heroui/react';

// Add this near the top of your file
declare global {
  interface Window {
    cameraAnimator?: {
      animateCamera: (position: THREE.Vector3, target: THREE.Vector3) => void;
      isAnimating: () => boolean;
    };
  }
}


// Types
export interface ShelfLocation {
  floor: number;
  cabinet_id: number;
  cabinet_row: number;
  cabinet_column: number;
}

export interface FloorConfig {
  height: number;
  matrix: number[][];
}

export interface ShelfSelectorProps {
  floors: FloorConfig[];
  onSelect: (location: ShelfLocation) => void;
  className?: string;
  // New props for external control
  highlightedFloor?: number | null;
  onHighlightFloor?: (floorIndex: number) => void;
  isFloorChangeAnimate?: boolean;
  isShelfChangeAnimate?: boolean;
  isCabinetChangeAnimate?: boolean;
  onAnimationToggle?: (type: 'floor' | 'shelf' | 'cabinet', value: boolean) => void;
  // New color customization props
  backgroundColor?: string;
  floorColor?: string;
  floorHighlightedColor?: string;
  cabinetColor?: string;
  cabinetSelectedColor?: string;
  shelfColor?: string;
  shelfHoverColor?: string;
  shelfSelectedColor?: string;
  textColor?: string;
}

// Add this inside the Cabinet component
const Cabinet = ({
  position,
  size,
  rows,
  columns,
  cabinetId,
  floor,
  isSelected,
  onSelect,
  selectedLocation,
  // Add color props
  cabinetColor,
  cabinetSelectedColor,
  shelfColor,
  shelfHoverColor,
  shelfSelectedColor
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
  cabinetColor: string;
  cabinetSelectedColor: string;
  shelfColor: string;
  shelfHoverColor: string;
  shelfSelectedColor: string;
}) => {
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const cabinetWidth = size[0];
  const cabinetHeight = size[1];
  const cabinetDepth = size[2];
  const cellWidth = cabinetWidth / columns;
  const cellHeight = cabinetHeight / rows;

  // Get camera for distance calculation
  const { camera } = useThree();
  const cabinetRef = useRef<THREE.Group>(null);
  const [opacity, setOpacity] = useState(1);
  const [isInteractionDisabled, setIsInteractionDisabled] = useState(false);

  // Distance thresholds
  const FADE_START_DISTANCE = 4.75;  // Begin fading at this distance
  const FADE_END_DISTANCE = 4.5;  // Fully transparent at this distance
  const INTERACTION_DISABLE_DISTANCE = 2; // Disable interaction below this distance

  // Update opacity based on camera distance
  useFrame(() => {
    if (cabinetRef.current) {
      // Get cabinet world position
      const cabinetWorldPos = new THREE.Vector3();
      cabinetRef.current.getWorldPosition(cabinetWorldPos);

      // Calculate distance to camera
      const distanceToCamera = camera.position.distanceTo(cabinetWorldPos);

      // Calculate opacity based on distance (smooth transition)
      if (distanceToCamera < FADE_END_DISTANCE) {
        setOpacity(0); // Minimum opacity
        setIsInteractionDisabled(true);
      } else if (distanceToCamera < FADE_START_DISTANCE) {
        // Linear interpolation between min opacity and full opacity
        const t = (distanceToCamera - FADE_END_DISTANCE) / (FADE_START_DISTANCE - FADE_END_DISTANCE);
        setOpacity(t); // Interpolate between 0.1 and 1.0
        setIsInteractionDisabled(distanceToCamera < INTERACTION_DISABLE_DISTANCE);
      } else {
        setOpacity(1);
        setIsInteractionDisabled(false);
      }
    }
  });

  // Event handlers that respect the disabled state
  const handlePointerOver = (e: any, rowIndex: number, colIndex: number) => {
    if (!isInteractionDisabled) {
      e.stopPropagation();
      setHoverCell([rowIndex, colIndex]);
    }
  };

  const handlePointerOut = (e: any) => {
    if (!isInteractionDisabled) {
      e.stopPropagation();
      setHoverCell(null);
    }
  };

  const handleClick = (e: any, rowIndex: number, colIndex: number) => {
    if (!isInteractionDisabled) {
      e.stopPropagation();
      onSelect({
        floor,
        cabinet_id: cabinetId,
        cabinet_row: rowIndex,
        cabinet_column: colIndex
      });
    }
  };

  return (
    <group position={position} ref={cabinetRef}>
      {/* Cabinet frame with custom color */}
      <mesh renderOrder={1}>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={isSelected ? cabinetSelectedColor : cabinetColor}
          transparent
          opacity={opacity * 0.3}
          depthWrite={false}
        />
      </mesh>

      {/* Cabinet cells (shelves) with custom colors */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        Array.from({ length: columns }).map((_, colIndex) => {
          const isHovered = hoverCell && hoverCell[0] === rowIndex && hoverCell[1] === colIndex;
          const isShelfSelected =
            selectedLocation?.floor === floor &&
            selectedLocation?.cabinet_id === cabinetId &&
            selectedLocation?.cabinet_row === rowIndex &&
            selectedLocation?.cabinet_column === colIndex;

          return (
            <mesh
              key={`${rowIndex}-${colIndex}`}
              position={[
                (colIndex - columns / 2 + 0.5) * cellWidth,
                (rowIndex - rows / 2 + 0.5) * cellHeight,
                0.1
              ]}
              onPointerOver={(e) => handlePointerOver(e, rowIndex, colIndex)}
              onPointerOut={(e) => handlePointerOut(e)}
              onClick={(e) => handleClick(e, rowIndex, colIndex)}
            >
              <boxGeometry args={[cellWidth * 0.9, cellHeight * 0.9, cabinetDepth * 0.2]} />
              <meshStandardMaterial
                color={isShelfSelected ? shelfSelectedColor : isHovered ? shelfHoverColor : shelfColor}
                emissive={isShelfSelected ? shelfSelectedColor : "#000000"}
                emissiveIntensity={isShelfSelected ? 0.3 : 0}
                transparent
                depthWrite={opacity > 0.5}
                opacity={opacity}
              />
            </mesh>
          );
        })
      ))}
    </group>
  );
};

const Floor = ({
  floorConfig,
  floorIndex,
  yPosition,
  isHighlighted,
  selectedLocation,
  onSelect,
  // Add color props
  floorColor,
  floorHighlightedColor,
  cabinetColor,
  cabinetSelectedColor,
  shelfColor,
  shelfHoverColor,
  shelfSelectedColor,
  textColor
}: {
  floorConfig: FloorConfig;
  floorIndex: number;
  yPosition: number;
  isHighlighted: boolean;
  selectedLocation: ShelfLocation | null;
  onSelect: (location: ShelfLocation) => void;
  floorColor: string;
  floorHighlightedColor: string;
  cabinetColor: string;
  cabinetSelectedColor: string;
  shelfColor: string;
  shelfHoverColor: string;
  shelfSelectedColor: string;
  textColor: string;
}) => {
  const { matrix, height } = floorConfig;

  // Process matrix to identify cabinets (connected non-zero numbers)
  const cabinets: {
    id: number;
    rows: number;
    position: [number, number];
    width: number;
    height: number;
  }[] = [];

  const visited = Array(matrix.length).fill(0).map(() => Array(matrix[0].length).fill(false));
  let cabinetId = 0;

  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      if (matrix[i][j] > 0 && !visited[i][j]) {
        // Found a new cabinet, perform BFS to find its extent
        let minJ = j, maxJ = j;
        const rows = matrix[i][j];

        // Find all connected cells with the same value
        const queue = [[i, j]];
        visited[i][j] = true;

        while (queue.length > 0) {
          const [x, y] = queue.shift()!;

          // Check adjacent cells (only horizontal connections for cabinets)
          if (y + 1 < matrix[i].length && matrix[x][y + 1] === rows && !visited[x][y + 1]) {
            visited[x][y + 1] = true;
            queue.push([x, y + 1]);
            maxJ = Math.max(maxJ, y + 1);
          }

          if (y - 1 >= 0 && matrix[x][y - 1] === rows && !visited[x][y - 1]) {
            visited[x][y - 1] = true;
            queue.push([x, y - 1]);
            minJ = Math.min(minJ, y - 1);
          }
        }

        cabinets.push({
          id: cabinetId++,
          rows: rows,
          position: [i, (minJ + maxJ) / 2],
          width: maxJ - minJ + 1,
          height: rows
        });
      }
    }
  }

  const floorWidth = matrix[0].length;
  const floorDepth = matrix.length;
  const gridSize = 1;

  return (
    <group position={[0, yPosition, 0]}>
      {/* Floor base with custom color */}
      <mesh position={[1.5, -0.1, 0]}>
        <boxGeometry args={[floorWidth * gridSize, 0.1, floorDepth * gridSize]} />
        <meshStandardMaterial color={isHighlighted ? floorHighlightedColor : floorColor} />
      </mesh>

      {/* Floor number with custom color */}
      <Text
        position={[-floorWidth * gridSize / 2 - 0.5, 0, -floorDepth * gridSize / 2 - 0.5]}
        fontSize={0.5}
        color={textColor}
      >
        {`Floor ${floorIndex + 1}`}
      </Text>

      {/* Cabinets */}
      {cabinets.map((cabinet) => {
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
            cabinetId={cabinet.id}
            floor={floorIndex}
            isSelected={isSelected}
            onSelect={onSelect}
            selectedLocation={selectedLocation}
            // Pass color props
            cabinetColor={cabinetColor}
            cabinetSelectedColor={cabinetSelectedColor}
            shelfColor={shelfColor}
            shelfHoverColor={shelfHoverColor}
            shelfSelectedColor={shelfSelectedColor}
          />
        );
      })}
    </group>
  );
};


function WASDControls({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  // Add velocity state for smooth movement
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const velocityY = useRef(0);
  const targetVelocity = useRef(new THREE.Vector3(0, 0, 0));
  const targetVelocityY = useRef(0);
  const keysPressed = useRef<Set<string>>(new Set());

  useFrame(() => {
    if (!controlsRef.current) return;

    const camera = controlsRef.current.object;
    const target = controlsRef.current.target;
    const moveSpeed = 0.1;
    const dampingFactor = 0.9; // Damping factor (0 = no damping, 1 = full stop)

    // Calculate forward and right vectors
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

    // Handle Y-axis movement if shift is pressed
    if (keysPressed.current.has('shift+w')) {
      targetVelocityY.current = moveSpeed;
    }
    if (keysPressed.current.has('shift+s')) {
      targetVelocityY.current = -moveSpeed;
    }

    // Apply damping
    velocity.current.lerp(targetVelocity.current, 1 - dampingFactor);
    velocityY.current = velocityY.current * dampingFactor + targetVelocityY.current * (1 - dampingFactor);

    // Apply movement if significant velocity
    if (velocity.current.lengthSq() > 0.00001) {
      camera.position.add(velocity.current);
      target.add(velocity.current);
    }

    if (Math.abs(velocityY.current) > 0.00001) {
      camera.position.y += velocityY.current;
      target.y += velocityY.current;
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
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        keysPressed.current.delete(key);
        keysPressed.current.delete(`shift+${key}`);
      }
      if (key === 'shift') {
        // Clear all shift combinations
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
  }, [controlsRef]);

  return null;
}

function CameraAnimation({
  controlsRef,
  dampingFactor = 0.05
}: {
  controlsRef: React.RefObject<any>,
  dampingFactor?: number
}) {
  // Track animation targets
  const targetCameraPosition = useRef<THREE.Vector3 | null>(null);
  const targetControlsTarget = useRef<THREE.Vector3 | null>(null);
  const isAnimating = useRef(false);

  // Expose animation methods
  const animateCamera = (newPosition: THREE.Vector3, newTarget: THREE.Vector3) => {
    targetCameraPosition.current = newPosition.clone();
    targetControlsTarget.current = newTarget.clone();
    isAnimating.current = true;
  };

  // Make animation methods globally available
  useEffect(() => {
    if (!window.cameraAnimator) {
      window.cameraAnimator = {
        animateCamera,
        isAnimating: () => isAnimating.current
      };
    }

    return () => {
      window.cameraAnimator = undefined;
    };
  }, []);

  useFrame(() => {
    if (!controlsRef.current || !isAnimating.current) return;

    const controls = controlsRef.current;
    const camera = controls.object;

    // Only animate if we have targets
    if (targetCameraPosition.current && targetControlsTarget.current) {
      // Interpolate camera position with damping
      camera.position.lerp(targetCameraPosition.current, dampingFactor);

      // Interpolate controls target with damping
      controls.target.lerp(targetControlsTarget.current, dampingFactor);

      // Force controls to update
      controls.update();

      // Check if we're close enough to end animation
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


export const ShelfSelector3D = ({
  floors,
  onSelect,
  className,
  // Optional props with defaults
  highlightedFloor: externalHighlightedFloor = null,
  onHighlightFloor,
  isFloorChangeAnimate: externalIsFloorChangeAnimate,
  isShelfChangeAnimate: externalIsShelfChangeAnimate,
  isCabinetChangeAnimate: externalIsCabinetChangeAnimate,
  onAnimationToggle,
  // Color customization props with defaults
  backgroundColor = "#f5f5f5",
  floorColor = "#e0e0e0",
  floorHighlightedColor = "#d4e6ff",
  cabinetColor = "#aaaaaa",
  cabinetSelectedColor = "#4a80f5",
  shelfColor = "#dddddd",
  shelfHoverColor = "#ff9900",
  shelfSelectedColor = "#ff5555",
  textColor = "#000000"
}: ShelfSelectorProps) => {
  const [selectedLocation, setSelectedLocation] = useState<ShelfLocation | null>(null);

  // Internal state acts as fallback when external props aren't provided
  const [internalHighlightedFloor, setInternalHighlightedFloor] = useState<number | null>(null);
  const [internalIsFloorChangeAnimate, setInternalIsFloorChangeAnimate] = useState<boolean>(true);
  const [internalIsShelfChangeAnimate, setInternalIsShelfChangeAnimate] = useState<boolean>(true);
  const [internalIsCabinetChangeAnimate, setInternalIsCabinetChangeAnimate] = useState<boolean>(false);

  // Use external or internal state
  const highlightedFloor = externalHighlightedFloor !== undefined ? externalHighlightedFloor : internalHighlightedFloor;
  const isFloorChangeAnimate = externalIsFloorChangeAnimate !== undefined ? externalIsFloorChangeAnimate : internalIsFloorChangeAnimate;
  const isShelfChangeAnimate = externalIsShelfChangeAnimate !== undefined ? externalIsShelfChangeAnimate : internalIsShelfChangeAnimate;
  const isCabinetChangeAnimate = externalIsCabinetChangeAnimate !== undefined ? externalIsCabinetChangeAnimate : internalIsCabinetChangeAnimate;

  const controlsRef = useRef<any>(null);
  const previousHighlightedFloor = useRef<number | null>(null);

  // Calculate Y positions for floors
  const floorPositions: number[] = [];
  let currentY = 0;

  floors.forEach((floor, index) => {
    floorPositions.push(currentY);
    currentY += floor.height + 0.5; // Add gap between floors
  });

  const focusOnFloor = (floorIndex: number) => {
    if (controlsRef.current && isFloorChangeAnimate) {
      const floorY = floorPositions[floorIndex] + floors[floorIndex].height / 2;

      // Calculate camera position in XZ plane (maintain current angle)
      const camera = controlsRef.current.object;
      const currentXZ = new THREE.Vector3(
        camera.position.x,
        0,
        camera.position.z
      ).normalize();

      // Distance from center and height offset for better viewing angle
      const distance = 20;
      const heightOffset = 3; // Keep camera slightly above floor level

      // Create target position and look-at point
      const newTarget = new THREE.Vector3(0, floorY, 0);
      const newPosition = new THREE.Vector3(
        currentXZ.x * distance,
        floorY + heightOffset,
        currentXZ.z * distance
      );

      // Animate to new position
      if (window.cameraAnimator) {
        window.cameraAnimator.animateCamera(newPosition, newTarget);
      }
    }
  };

  const focusOnShelf = (location: ShelfLocation) => {
    if (controlsRef.current && isShelfChangeAnimate) {
      // Find the corresponding cabinet
      const { floor, cabinet_id } = location;
      const floorMatrix = floors[floor].matrix;
      const floorWidth = floorMatrix[0].length;
      const floorDepth = floorMatrix.length;

      // Process matrix to find cabinet position
      const visited = Array(floorMatrix.length).fill(0).map(() => Array(floorMatrix[0].length).fill(false));
      let currentCabinetId = 0;
      let cabinetPosition: [number, number, number] | null = null;

      for (let i = 0; i < floorMatrix.length && !cabinetPosition; i++) {
        for (let j = 0; j < floorMatrix[i].length && !cabinetPosition; j++) {
          if (floorMatrix[i][j] > 0 && !visited[i][j]) {
            let minJ = j, maxJ = j;
            const rows = floorMatrix[i][j];

            // BFS to find cabinet extent
            const queue = [[i, j]];
            visited[i][j] = true;

            while (queue.length > 0) {
              const [x, y] = queue.shift()!;

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

            if (currentCabinetId === cabinet_id) {
              const width = maxJ - minJ + 1;
              const x = ((minJ + maxJ) / 2 - floorWidth / 2 + width / 2);
              const y = floorPositions[floor] + floors[floor].height / 2;
              const z = (i - floorDepth / 2 + 0.5);

              // Calculate position of specific shelf
              const cellWidth = width / width;
              const cellHeight = floors[floor].height / rows;

              const shelfX = x + (location.cabinet_column - width / 2 + 0.5) * cellWidth;
              const shelfY = y + (location.cabinet_row - rows / 2 + 0.5) * cellHeight;

              cabinetPosition = [shelfX, shelfY, z];
            }

            currentCabinetId++;
          }
        }
      }


      if (cabinetPosition) {
        // Create target position and look-at point
        const newTarget = new THREE.Vector3(...cabinetPosition);
        const dist = 5; // Closer zoom for shelf view
        const newPosition = new THREE.Vector3(
          cabinetPosition[0],
          cabinetPosition[1],
          cabinetPosition[2] + dist
        );

        // Animate to new position
        if (window.cameraAnimator) {
          window.cameraAnimator.animateCamera(newPosition, newTarget);
        }
      }
    }
  };

  const focusOnCabinet = (location: ShelfLocation) => {
    if (controlsRef.current && isCabinetChangeAnimate) {
      // Find the corresponding cabinet
      const { floor, cabinet_id } = location;
      const floorMatrix = floors[floor].matrix;
      const floorWidth = floorMatrix[0].length;
      const floorDepth = floorMatrix.length;

      // Process matrix to find cabinet position
      const visited = Array(floorMatrix.length).fill(0).map(() => Array(floorMatrix[0].length).fill(false));
      let currentCabinetId = 0;
      let cabinetPosition: [number, number, number] | null = null;

      for (let i = 0; i < floorMatrix.length && !cabinetPosition; i++) {
        for (let j = 0; j < floorMatrix[i].length && !cabinetPosition; j++) {
          if (floorMatrix[i][j] > 0 && !visited[i][j]) {
            let minJ = j, maxJ = j;
            const rows = floorMatrix[i][j];

            // BFS to find cabinet extent
            const queue = [[i, j]];
            visited[i][j] = true;

            while (queue.length > 0) {
              const [x, y] = queue.shift()!;

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

            if (currentCabinetId === cabinet_id) {
              const width = maxJ - minJ + 1;
              const x = ((minJ + maxJ) / 2 - floorWidth / 2 + width / 2);
              const y = floorPositions[floor] + floors[floor].height / 2;
              const z = (i - floorDepth / 2 + 0.5);

              cabinetPosition = [x, y, z];
            }

            currentCabinetId++;
          }
        }
      }

      if (cabinetPosition) {
        // Create target position and look-at point
        const newTarget = new THREE.Vector3(...cabinetPosition);
        const dist = 8; // Medium zoom for cabinet view
        const newPosition = new THREE.Vector3(
          cabinetPosition[0],
          cabinetPosition[1],
          cabinetPosition[2] + dist
        );

        // Animate to new position
        if (window.cameraAnimator) {
          window.cameraAnimator.animateCamera(newPosition, newTarget);
        }
      }
    }
  };

  const handleHighlightFloor = (index: number) => {
    if (onHighlightFloor) {
      onHighlightFloor(index);
    } else {
      setInternalHighlightedFloor(index);
    }
    focusOnFloor(index);
  };

  const handleSelect = (location: ShelfLocation) => {
    const prevLocation = selectedLocation;
    setSelectedLocation(location);

    // Check if cabinet changed
    const cabinetChanged = !prevLocation ||
      prevLocation.floor !== location.floor ||
      prevLocation.cabinet_id !== location.cabinet_id;

    if (cabinetChanged && isCabinetChangeAnimate) {
      focusOnCabinet(location);
    } else if (isShelfChangeAnimate) {
      focusOnShelf(location);
    }

    if (onSelect) onSelect(location);
  };


  const handleArrowNavigation = (e: KeyboardEvent) => {
    if (!selectedLocation) return;

    const { key, shiftKey } = e;
    const { floor, cabinet_id, cabinet_row, cabinet_column } = selectedLocation;
    let nextLocation: ShelfLocation | null = null;

    // Get current floor matrix and cabinet info
    const floorMatrix = floors[floor].matrix;
    const currentCabinet = findCabinetById(floor, cabinet_id);

    if (!currentCabinet) return;

    const { rows, width } = currentCabinet;

    // Handle cabinet navigation with Shift key
    if (shiftKey) {
      // Get the cabinet's position
      const cabinetPosition = findCabinetPosition(floor, cabinet_id);

      if (cabinetPosition) {
        const [rowIndex, columnStart] = cabinetPosition;

        switch (key) {
          case 'ArrowUp':
            // Find cabinet above
            const targetRowAbove = findNearestCabinetRowAbove(floor, rowIndex, columnStart);
            if (targetRowAbove !== -1) {
              const aboveCabinetId = findCabinetAtPosition(floor, targetRowAbove, columnStart);
              if (aboveCabinetId !== null) {
                const aboveCabinet = findCabinetById(floor, aboveCabinetId);
                if (aboveCabinet) {
                  // Create location targeting the same column in the cabinet above
                  nextLocation = {
                    floor,
                    cabinet_id: aboveCabinetId,
                    cabinet_row: Math.floor(aboveCabinet.rows / 2),
                    cabinet_column: Math.min(cabinet_column, aboveCabinet.width - 1)
                  };
                }
              }
            }
            break;

          case 'ArrowDown':
            // Find cabinet below
            const targetRowBelow = findNearestCabinetRowBelow(floor, rowIndex, columnStart);
            if (targetRowBelow !== -1) {
              const belowCabinetId = findCabinetAtPosition(floor, targetRowBelow, columnStart);
              if (belowCabinetId !== null) {
                const belowCabinet = findCabinetById(floor, belowCabinetId);
                if (belowCabinet) {
                  // Create location targeting the same column in the cabinet below
                  nextLocation = {
                    floor,
                    cabinet_id: belowCabinetId,
                    cabinet_row: Math.floor(belowCabinet.rows / 2),
                    cabinet_column: Math.min(cabinet_column, belowCabinet.width - 1)
                  };
                }
              }
            }
            break;

          case 'ArrowLeft':
            // Find cabinet to the left
            const leftColumnStart = findNearestCabinetColumnToLeft(floor, rowIndex, columnStart);
            if (leftColumnStart !== -1) {
              const leftCabinetId = findCabinetAtPosition(floor, rowIndex, leftColumnStart);
              if (leftCabinetId !== null) {
                const leftCabinet = findCabinetById(floor, leftCabinetId);
                if (leftCabinet) {
                  nextLocation = {
                    floor,
                    cabinet_id: leftCabinetId,
                    cabinet_row: Math.min(cabinet_row, leftCabinet.rows - 1),
                    cabinet_column: Math.floor(leftCabinet.width / 2)
                  };
                }
              }
            }
            break;

          case 'ArrowRight':
            // Find cabinet to the right
            const rightColumnStart = findNearestCabinetColumnToRight(floor, rowIndex, columnStart + width);
            if (rightColumnStart !== -1) {
              const rightCabinetId = findCabinetAtPosition(floor, rowIndex, rightColumnStart);
              if (rightCabinetId !== null) {
                const rightCabinet = findCabinetById(floor, rightCabinetId);
                if (rightCabinet) {
                  nextLocation = {
                    floor,
                    cabinet_id: rightCabinetId,
                    cabinet_row: Math.min(cabinet_row, rightCabinet.rows - 1),
                    cabinet_column: Math.floor(rightCabinet.width / 2)
                  };
                }
              }
            }
            break;
        }
      }
    }
    // Handle standard arrow keys for shelf navigation within cabinet
    else {
      switch (key) {
        case 'ArrowUp':
          // Move to the shelf above if possible
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
          // Move to the shelf below if possible
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
          // Move to the shelf to the left if possible
          if (cabinet_column > 0) {
            nextLocation = {
              floor,
              cabinet_id,
              cabinet_row,
              cabinet_column: cabinet_column - 1
            };
          }
          // If at the left edge, try to navigate to the adjacent cabinet
          else {
            const cabinetPosition = findCabinetPosition(floor, cabinet_id);
            if (cabinetPosition) {
              const [rowIndex, columnStart] = cabinetPosition;
              const leftCabinetColumn = findNearestCabinetColumnToLeft(floor, rowIndex, columnStart);

              if (leftCabinetColumn !== -1) {
                const leftCabinetId = findCabinetAtPosition(floor, rowIndex, leftCabinetColumn);
                if (leftCabinetId !== null) {
                  const leftCabinet = findCabinetById(floor, leftCabinetId);
                  if (leftCabinet) {
                    // Navigate to the rightmost shelf of the left cabinet
                    nextLocation = {
                      floor,
                      cabinet_id: leftCabinetId,
                      cabinet_row: cabinet_row < leftCabinet.rows ? cabinet_row : leftCabinet.rows - 1,
                      cabinet_column: leftCabinet.width - 1
                    };
                  }
                }
              }
            }
          }
          break;

        case 'ArrowRight':
          // Move to the shelf to the right if possible
          if (cabinet_column < width - 1) {
            nextLocation = {
              floor,
              cabinet_id,
              cabinet_row,
              cabinet_column: cabinet_column + 1
            };
          }
          // If at the right edge, try to navigate to the adjacent cabinet
          else {
            const cabinetPosition = findCabinetPosition(floor, cabinet_id);
            if (cabinetPosition) {
              const [rowIndex, columnStart] = cabinetPosition;
              const rightCabinetColumn = findNearestCabinetColumnToRight(floor, rowIndex, columnStart + width);

              if (rightCabinetColumn !== -1) {
                const rightCabinetId = findCabinetAtPosition(floor, rowIndex, rightCabinetColumn);
                if (rightCabinetId !== null) {
                  const rightCabinet = findCabinetById(floor, rightCabinetId);
                  if (rightCabinet) {
                    // Navigate to the leftmost shelf of the right cabinet
                    nextLocation = {
                      floor,
                      cabinet_id: rightCabinetId,
                      cabinet_row: cabinet_row < rightCabinet.rows ? cabinet_row : rightCabinet.rows - 1,
                      cabinet_column: 0
                    };
                  }
                }
              }
            }
          }
          break;
      }
    }

    // Apply the navigation if a valid next location was found
    if (nextLocation) {
      handleSelect(nextLocation);
      e.preventDefault(); // Prevent browser from scrolling
    }
  };

  // Helper function to find nearest cabinet row above
  const findNearestCabinetRowAbove = (floorIndex: number, rowIndex: number, columnStart: number) => {
    const floorMatrix = floors[floorIndex].matrix;

    // Start from rowIndex - 1 and move up
    for (let i = rowIndex - 1; i >= 0; i--) {
      if (floorMatrix[i][columnStart] > 0) {
        return i;
      }
    }

    return -1; // No cabinet found above
  };

  // Helper function to find nearest cabinet row below
  const findNearestCabinetRowBelow = (floorIndex: number, rowIndex: number, columnStart: number) => {
    const floorMatrix = floors[floorIndex].matrix;

    // Start from rowIndex + 1 and move down
    for (let i = rowIndex + 1; i < floorMatrix.length; i++) {
      if (floorMatrix[i][columnStart] > 0) {
        return i;
      }
    }

    return -1; // No cabinet found below
  };

  // Helper function to find nearest cabinet column to the left
  const findNearestCabinetColumnToLeft = (floorIndex: number, rowIndex: number, columnStart: number) => {
    const floorMatrix = floors[floorIndex].matrix;

    // Start from columnStart - 1 and move left
    for (let j = columnStart - 1; j >= 0; j--) {
      if (floorMatrix[rowIndex][j] > 0) {
        return j;
      }
    }

    return -1; // No cabinet found to the left
  };

  // Helper function to find nearest cabinet column to the right
  const findNearestCabinetColumnToRight = (floorIndex: number, rowIndex: number, columnStart: number) => {
    const floorMatrix = floors[floorIndex].matrix;

    // Start from columnStart + 1 and move right
    for (let j = columnStart; j < floorMatrix[0].length; j++) {
      if (floorMatrix[rowIndex][j] > 0) {
        return j;
      }
    }

    return -1; // No cabinet found to the right
  };

  // Helper function to find cabinet by ID
  const findCabinetById = (floorIndex: number, cabinetId: number) => {
    const floorMatrix = floors[floorIndex].matrix;
    const visited = Array(floorMatrix.length).fill(0).map(() => Array(floorMatrix[0].length).fill(false));
    let currentCabinetId = 0;

    for (let i = 0; i < floorMatrix.length; i++) {
      for (let j = 0; j < floorMatrix[i].length; j++) {
        if (floorMatrix[i][j] > 0 && !visited[i][j]) {
          let minJ = j, maxJ = j;
          const rows = floorMatrix[i][j];

          // Find all connected cells
          const queue = [[i, j]];
          visited[i][j] = true;

          while (queue.length > 0) {
            const [x, y] = queue.shift()!;

            // Check adjacent cells (horizontal)
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

          if (currentCabinetId === cabinetId) {
            return {
              id: cabinetId,
              rows: rows,
              width: maxJ - minJ + 1,
              position: [i, (minJ + maxJ) / 2]
            };
          }

          currentCabinetId++;
        }
      }
    }

    return null;
  };

  // Helper function to find cabinet position in the matrix
  const findCabinetPosition = (floorIndex: number, cabinetId: number) => {
    const floorMatrix = floors[floorIndex].matrix;
    const visited = Array(floorMatrix.length).fill(0).map(() => Array(floorMatrix[0].length).fill(false));
    let currentCabinetId = 0;

    for (let i = 0; i < floorMatrix.length; i++) {
      for (let j = 0; j < floorMatrix[i].length; j++) {
        if (floorMatrix[i][j] > 0 && !visited[i][j]) {
          let minJ = j, maxJ = j;
          const rows = floorMatrix[i][j];

          // Find all connected cells
          const queue = [[i, j]];
          visited[i][j] = true;

          while (queue.length > 0) {
            const [x, y] = queue.shift()!;

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

          if (currentCabinetId === cabinetId) {
            return [i, minJ];
          }

          currentCabinetId++;
        }
      }
    }

    return null;
  };

  // Helper function to find a cabinet at a specific position
  const findCabinetAtPosition = (floorIndex: number, rowIndex: number, columnStart: number) => {
    const floorMatrix = floors[floorIndex].matrix;
    const visited = Array(floorMatrix.length).fill(0).map(() => Array(floorMatrix[0].length).fill(false));
    let currentCabinetId = 0;

    for (let i = 0; i < floorMatrix.length; i++) {
      for (let j = 0; j < floorMatrix[i].length; j++) {
        if (floorMatrix[i][j] > 0 && !visited[i][j]) {
          let minJ = j, maxJ = j;
          const rows = floorMatrix[i][j];

          // Find all connected cells
          const queue = [[i, j]];
          visited[i][j] = true;

          while (queue.length > 0) {
            const [x, y] = queue.shift()!;

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

          // Check if this cabinet is at the target row and overlaps with the column range
          if (i === rowIndex && columnStart >= minJ && columnStart <= maxJ) {
            return currentCabinetId;
          }

          currentCabinetId++;
        }
      }
    }

    return null;
  };

  // Add this inside ShelfSelector3D component's useEffect
  useEffect(() => {
    // Register arrow key handler
    window.addEventListener('keydown', handleArrowNavigation);

    return () => {
      window.removeEventListener('keydown', handleArrowNavigation);
    };
  }, [selectedLocation, floors]); // Add dependencies

  // Add this effect to watch for changes to highlightedFloor
  useEffect(() => {
    // Only animate if the floor has actually changed and is not null
    if (highlightedFloor !== null &&
      highlightedFloor !== previousHighlightedFloor.current) {
      focusOnFloor(highlightedFloor);
      previousHighlightedFloor.current = highlightedFloor;
    }
  }, [highlightedFloor]);

  return (
    <div className={className}>
      <Canvas
        camera={{
          position: [0, currentY / 2, 20],
          fov: 50,
          up: [0, 1, 0],
        }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          powerPreference: 'high-performance'
        }}
        // Set the background color
        style={{ background: backgroundColor }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <directionalLight position={[-5, 5, -5]} intensity={0.5} />

        <CameraAnimation controlsRef={controlsRef} dampingFactor={0.05} />
        <WASDControls controlsRef={controlsRef} />

        <group>
          {floors.map((floor, index) => (
            <Floor
              key={index}
              floorConfig={floor}
              floorIndex={index}
              yPosition={floorPositions[index]}
              isHighlighted={highlightedFloor === index}
              selectedLocation={selectedLocation}
              onSelect={handleSelect}
              // Pass color props
              floorColor={floorColor}
              floorHighlightedColor={floorHighlightedColor}
              cabinetColor={cabinetColor}
              cabinetSelectedColor={cabinetSelectedColor}
              shelfColor={shelfColor}
              shelfHoverColor={shelfHoverColor}
              shelfSelectedColor={shelfSelectedColor}
              textColor={textColor}
            />
          ))}
        </group>

        <OrbitControls
          ref={controlsRef}
          target={[0, currentY / 2, 0]}
          enableDamping
          dampingFactor={0.1}
        />
      </Canvas>
    </div>
  );
}