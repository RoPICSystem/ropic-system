'use client';

import { useState, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { Button, Card, CardBody, Switch } from '@heroui/react';

// Types
interface ShelfLocation {
  floor: number;
  cabinet_id: number;
  cabinet_row: number;
  cabinet_column: number;
}

interface FloorConfig {
  height: number;
  matrix: number[][];
}

interface ShelfSelectorProps {
  floors: FloorConfig[];
  onSelect: (location: ShelfLocation) => void;
}

const Cabinet = ({
  position,
  size,
  rows,
  columns,
  cabinetId,
  floor,
  isSelected,
  onSelect,
  selectedLocation
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
}) => {
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const cabinetWidth = size[0];
  const cabinetHeight = size[1];
  const cabinetDepth = size[2];

  const cellWidth = cabinetWidth / columns;
  const cellHeight = cabinetHeight / rows;

  return (
    <group position={position}>
      {/* Cabinet frame */}
      <mesh>
        <boxGeometry args={size} />
        <meshStandardMaterial color={isSelected ? "#4a80f5" : "#aaaaaa"} transparent opacity={0.3} />
      </mesh>

      {/* Cabinet cells (shelves) */}
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
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoverCell([rowIndex, colIndex]);
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                setHoverCell(null);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect({
                  floor,
                  cabinet_id: cabinetId,
                  cabinet_row: rowIndex,
                  cabinet_column: colIndex
                });
              }}
            >
              <boxGeometry args={[cellWidth * 0.9, cellHeight * 0.9, cabinetDepth * 0.2]} />
              <meshStandardMaterial
                color={isShelfSelected ? "#ff5555" : isHovered ? "#ff9900" : "#dddddd"}
                emissive={isShelfSelected ? "#ff0000" : "#000000"}
                emissiveIntensity={isShelfSelected ? 0.3 : 0}
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
  onSelect
}: {
  floorConfig: FloorConfig;
  floorIndex: number;
  yPosition: number;
  isHighlighted: boolean;
  selectedLocation: ShelfLocation | null;
  onSelect: (location: ShelfLocation) => void;
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
      {/* Floor base */}
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[floorWidth * gridSize, 0.1, floorDepth * gridSize]} />
        <meshStandardMaterial color={isHighlighted ? "#d4e6ff" : "#e0e0e0"} />
      </mesh>

      {/* Floor number */}
      <Text
        position={[-floorWidth * gridSize / 2 - 0.5, 0, -floorDepth * gridSize / 2 - 0.5]}
        fontSize={0.5}
        color="#000000"
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
          />
        );
      })}
    </group>
  );
};


function WASDControls({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  useFrame(() => {}); // Needed to keep the hook active

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!controlsRef.current) return;
      const camera = controlsRef.current.object;
      const target = controlsRef.current.target;
      const moveSpeed = 0.5;

      // Calculate forward and right vectors based on camera orientation
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      direction.y = 0;
      direction.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(direction, camera.up).normalize();

      // If Shift is held, W/S move along Y axis
      if (e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'w':
            camera.position.y += moveSpeed;
            target.y += moveSpeed;
            break;
          case 's':
            camera.position.y -= moveSpeed;
            target.y -= moveSpeed;
            break;
          default:
            break;
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'w':
          camera.position.addScaledVector(direction, moveSpeed);
          target.addScaledVector(direction, moveSpeed);
          break;
        case 's':
          camera.position.addScaledVector(direction, -moveSpeed);
          target.addScaledVector(direction, -moveSpeed);
          break;
        case 'a':
          camera.position.addScaledVector(right, -moveSpeed);
          target.addScaledVector(right, -moveSpeed);
          break;
        case 'd':
          camera.position.addScaledVector(right, moveSpeed);
          target.addScaledVector(right, moveSpeed);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [controlsRef]);

  return null;
}



const ShelfSelector3D = ({ floors, onSelect }: ShelfSelectorProps) => {
  const [selectedLocation, setSelectedLocation] = useState<ShelfLocation | null>(null);
  const [highlightedFloor, setHighlightedFloor] = useState<number | null>(null);
  const [isFloorChangeAnimate, setIsFloorChangeAnimate] = useState<boolean>(true);
  const [isShelfChangeAnimate, setIsShelfChangeAnimate] = useState<boolean>(true);
  const [isCabinetChangeAnimate, setIsCabinetChangeAnimate] = useState<boolean>(true);
  const controlsRef = useRef<any>(null);
  
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
      
      // Set target to center of the floor
      controlsRef.current.target.set(0, floorY, 0);
      
      // Update camera position to match floor height
      const camera = controlsRef.current.object;
      
      // Calculate camera position in XZ plane (maintain current angle)
      const currentXZ = new THREE.Vector3(
        camera.position.x, 
        0, 
        camera.position.z
      ).normalize();
      
      // Distance from center and height offset for better viewing angle
      const distance = 20;
      const heightOffset = 3; // Keep camera slightly above floor level
      
      // Set new camera position
      camera.position.set(
        currentXZ.x * distance,
        floorY + heightOffset, // Position camera at floor height plus offset
        currentXZ.z * distance
      );
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
        // Focus on the specific shelf
        controlsRef.current.target.set(...cabinetPosition);
        
        // Position camera to look at the shelf from a good angle
        const dist = 5; // Closer zoom for shelf view
        const camera = controlsRef.current.object;
        const offset = new THREE.Vector3(cabinetPosition[0], cabinetPosition[1], cabinetPosition[2] + dist);
        camera.position.copy(offset);
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
        // Focus on the cabinet
        controlsRef.current.target.set(...cabinetPosition);
        
        // Position camera to look at the cabinet from a medium distance
        const dist = 8; // Medium zoom for cabinet view
        const camera = controlsRef.current.object;
        const offset = new THREE.Vector3(cabinetPosition[0], cabinetPosition[1], cabinetPosition[2] + dist);
        camera.position.copy(offset);
      }
    }
  };
  
  const handleHighlightFloor = (index: number) => {
    setHighlightedFloor(index);
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
    } else {
      focusOnShelf(location);
    }
    
    if (onSelect) onSelect(location);
  };


  return (
    <div className="w-full h-[1000px] relative">
      <Canvas
        camera={{
          position: [0, currentY / 2, 20],
          fov: 50,
          up: [0, 1, 0]
        }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <directionalLight position={[-5, 5, -5]} intensity={0.5} />


        {/* WASD Controls */}
        <WASDControls controlsRef={controlsRef} />

        {/* Position first floor at y=0 instead of centering */}
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
            />
          ))}
        </group>

        <OrbitControls
          ref={controlsRef}
          target={[0, currentY / 2, 0]}
          enableDamping 
        />
      </Canvas>

      <Card isBlurred className="absolute bottom-4 left-4">
        <CardBody className='bg-background/50 p-6'>
          <h3 className="font-bold mb-2">Floor Controls</h3>
          <div className="flex gap-2">
            {floors.map((_, index) => (
              <Button
                key={index}
                variant={highlightedFloor === index ? "shadow" : "flat"}
                color={highlightedFloor === index ? "primary" : "default"}
                onPress={() => handleHighlightFloor(index)}
              >
                Floor {index + 1}
              </Button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span>Focus on floor change</span>
              <Switch 
                isSelected={isFloorChangeAnimate} 
                onValueChange={setIsFloorChangeAnimate}
                size="sm"
              />
            </div>
            <div className="flex items-center justify-between">
              <span>Focus on cabinet change</span>
              <Switch 
                isSelected={isCabinetChangeAnimate} 
                onValueChange={setIsCabinetChangeAnimate}
                size="sm"
              />
            </div>
            <div className="flex items-center justify-between">
              <span>Focus on shelf selection</span>
              <Switch 
                isSelected={isShelfChangeAnimate} 
                onValueChange={setIsShelfChangeAnimate}
                size="sm"
              />
            </div>
          </div>

          {selectedLocation && (
            <div className="mt-4">
              <h3 className="font-bold">Selected Location:</h3>
              <div>Floor: {selectedLocation.floor + 1}</div>
              <div>Cabinet: {selectedLocation.cabinet_id + 1}</div>
              <div>Row: {selectedLocation.cabinet_row + 1}</div>
              <div>Column: {selectedLocation.cabinet_column + 1}</div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function ShelfSelectorPage() {
  // Example floor configuration
  const floorConfigs: FloorConfig[] = [
    {
      height: 3,
      matrix: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ]
    },
    {
      height: 3,
      matrix: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ]
    },
    {
      height: 3,
      matrix: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ]
    },
  ];

  const handleSelection = (location: ShelfLocation) => {
    console.log("Selected:", location);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">3D Shelf Selector</h1>
      <p className="mb-4">
        Select a shelf location by clicking on the cabinets. Use the floor controls to highlight different floors.
      </p>

      <ShelfSelector3D
        floors={floorConfigs}
        onSelect={handleSelection}
      />
    </div>
  );
}