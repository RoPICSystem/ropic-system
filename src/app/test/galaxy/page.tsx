"use client";
import React, { useState } from 'react';
import SpaceBackground from '@/components/space-background';

const SpaceDemoPage = () => {
  const [settings, setSettings] = useState({
    count: 6000,
    depth: 700,
    speed: 3,
    starColor: '#ffffff',
    backgroundColor: '#a80000',
    mouseSensitivity: 0.5,
    starSize: 2.0,
    grainStrength: 0.2,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setSettings({
      ...settings,
      [name]: type === 'number' ? parseFloat(value) : value
    });
  };

  return (
    <main className="relative min-h-screen">
      <SpaceBackground
        count={settings.count}
        depth={settings.depth}
        speed={settings.speed}
        starColor={settings.starColor}
        backgroundColor={settings.backgroundColor}
        mouseSensitivity={settings.mouseSensitivity}
        starSize={settings.starSize}
        grainStrength={settings.grainStrength}
      />
      
      <div className="absolute top-4 left-4 p-4 bg-black/70 rounded text-white z-10 max-h-[90vh] overflow-y-auto">
        <h1 className="text-xl font-bold mb-4">Space Background Demo</h1>
        <div className="space-y-2">
          <div>
            <label className="block text-sm">
              Star Count: {settings.count}
              <input
                type="range"
                name="count"
                min="1000"
                max="10000"
                step="100"
                value={settings.count}
                onChange={handleChange}
                className="w-full"
              />
            </label>
          </div>
          <div>
            <label className="block text-sm">
              Depth: {settings.depth}
              <input
                type="range"
                name="depth"
                min="100"
                max="1000"
                step="10"
                value={settings.depth}
                onChange={handleChange}
                className="w-full"
              />
            </label>
          </div>
          <div>
            <label className="block text-sm">
              Speed: {settings.speed}
              <input
                type="range"
                name="speed"
                min="0.1"
                max="3"
                step="0.1"
                value={settings.speed}
                onChange={handleChange}
                className="w-full"
              />
            </label>
          </div>
          <div>
            <label className="block text-sm">
              Star Size: {settings.starSize}
              <input
                type="range"
                name="starSize"
                min="0.2"
                max="3"
                step="0.1"
                value={settings.starSize}
                onChange={handleChange}
                className="w-full"
              />
            </label>
          </div>
          <div>
            <label className="block text-sm">
              Mouse Sensitivity: {settings.mouseSensitivity}
              <input
                type="range"
                name="mouseSensitivity"
                min="0"
                max="0.5"
                step="0.01"
                value={settings.mouseSensitivity}
                onChange={handleChange}
                className="w-full"
              />
            </label>
          </div>
          <div>
            <label className="block text-sm">
              Grain Strength: {settings.grainStrength}
              <input
                type="range"
                name="grainStrength"
                min="0"
                max="1"
                step="0.01"
                value={settings.grainStrength}
                onChange={handleChange}
                className="w-full"
              />
            </label>
          </div>
          <div>
            <label className="block text-sm">
              Star Color:
              <input
                type="color"
                name="starColor"
                value={settings.starColor}
                onChange={handleChange}
                className="w-full"
              />
            </label>
          </div>
          <div>
            <label className="block text-sm">
              Background Color:
              <input
                type="color"
                name="backgroundColor"
                value={settings.backgroundColor}
                onChange={handleChange}
                className="w-full"
              />
            </label>
          </div>
        </div>
        <div className="mt-4 text-xs opacity-70">
          <p>Move your mouse to change the perspective</p>
        </div>
      </div>
    </main>
  );
};

export default SpaceDemoPage;