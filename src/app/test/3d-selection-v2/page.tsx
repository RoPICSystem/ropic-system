"use client";

import { FloorConfig, ShelfLocation, ShelfSelector3D } from "@/components/shelf-selector-3d";
import { Card, CardBody } from "@heroui/react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { herouiColor } from "@/utils/colors";

export default function ShelfSelectorPage() {
  // Example floor configuration
  const floorConfigs: FloorConfig[] = [
    {
      height: 3,
      matrix: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ]
    },
    {
      height: 3,
      matrix: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      ]
    }
  ];

  // Inside the InventoryPage component, add custom colors
  const [customColors, setCustomColors] = useState({
    backgroundColor: "#f0f7ff", // Light blue background
    floorColor: "#e0e0e0",      // Light gray floor
    floorHighlightedColor: "#c7dcff", // Highlighted floor
    cabinetColor: "#aaaaaa",    // Cabinet color
    cabinetSelectedColor: "#4a80f5", // Selected cabinet
    shelfColor: "#dddddd",      // Default shelf
    shelfHoverColor: "#ffb74d", // Hover orange
    shelfSelectedColor: "#ff5252", // Selected red
    textColor: "#2c3e50",       // Dark blue text
  });

  const { theme } = useTheme()

  const updateHeroUITheme = () => {
    setTimeout(() => {
      setCustomColors({
        backgroundColor: herouiColor('default-50', 'hex') as string,
        floorColor: herouiColor('primary-200', 'hex')as string,
        floorHighlightedColor: herouiColor('primary-500', 'hex') as string,
        cabinetColor: theme === 'light' ? "#cfcfcf" : "#aaaaaa", // Cabinet color
        cabinetSelectedColor: herouiColor('primary-700', 'hex') as string,
        shelfColor: theme === 'light' ? "#ffffff" : "#8b8b8b", // Default shelf
        shelfHoverColor: herouiColor('primary-400', 'hex') as string,
        shelfSelectedColor: herouiColor('primary', 'hex') as string,
        textColor: herouiColor('text', 'hex') as string,
      });
    }, 100);
  };

  useEffect(() => {
    updateHeroUITheme();
  }, [theme])

  useEffect(() => {
    updateHeroUITheme();
  }, []);

  const handleSelection = (location: ShelfLocation) => {
    console.log("Selected:", location);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* 3D Viewer taking full viewport */}
      <ShelfSelector3D
        floors={floorConfigs}
        onSelect={handleSelection}
        className='w-full h-full'

        // Add color customization
        backgroundColor={customColors.backgroundColor}
        floorColor={customColors.floorColor}
        floorHighlightedColor={customColors.floorHighlightedColor}
        cabinetColor={customColors.cabinetColor}
        cabinetSelectedColor={customColors.cabinetSelectedColor}
        shelfColor={customColors.shelfColor}
        shelfHoverColor={customColors.shelfHoverColor}
        shelfSelectedColor={customColors.shelfSelectedColor}
        textColor={customColors.textColor}
      />

      <Card isBlurred className="absolute top-4 right-4">
        <CardBody className='bg-background/50 p-2 w-72'>
          <h3 className="font-bold">Keyboard Controls:</h3>
          <div className="text-sm mt-1">
            <p>WASD: Camera movement</p>
            <p>Arrow keys: Navigate shelves</p>
            <p>Shift + Up/Down: Navigate between cabinets</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}