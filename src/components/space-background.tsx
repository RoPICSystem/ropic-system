"use client";
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, Canvas, useThree } from '@react-three/fiber';
import { useMousePosition } from '../hooks/useMousePosition';

// Star vertex shader
const starVertexShader = `
  attribute float size;
  attribute float randomness;
  varying vec3 vColor;
  varying float vRandomness;
  
  void main() {
    vColor = color;
    vRandomness = randomness;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Star fragment shader for twinkling effect
const starFragmentShader = `
  uniform float time;
  varying vec3 vColor;
  varying float vRandomness;
  
  void main() {
    float distanceToCenter = length(gl_PointCoord - vec2(0.5));
    if (distanceToCenter > 0.5) discard;
    float twinkle = sin(time * vRandomness) * 0.5 + 0.75;
    float strength = 1.0 - (distanceToCenter * 2.0);
    strength = pow(strength, 3.0);
    gl_FragColor = vec4(vColor, strength * twinkle);
  }
`;

interface StarFieldProps {
  count?: number;
  depth?: number;
  speed?: number;
  starColor?: string;
  mouseSensitivity?: number;
  starSize?: number;
}

interface SpaceBackgroundProps extends StarFieldProps {
  backgroundColor?: string;
  fogDensity?: number;
  grainStrength?: number;
  noiseStrength?: number;
}

export const SpaceBackground: React.FC<SpaceBackgroundProps> = ({
  count = 5000,
  depth = 400,
  speed = 0.5,
  starColor = '#ffffff',
  backgroundColor = '#181818',
  mouseSensitivity = 0.1,
  starSize = 1.0,
  grainStrength = 0.1,
  noiseStrength = 0.05,
}) => {
  return (
    <div 
      style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%',
        overflow: 'hidden'
      }}
    >
      <Canvas camera={{ position: [0, 0, 50], fov: 60 }}>
        <BackgroundLayer 
          backgroundColor={backgroundColor} 
          grainStrength={grainStrength}
          noiseStrength={noiseStrength}
          speed={speed}
        />
        <StarField 
          count={count}
          depth={depth}
          speed={speed}
          starColor={starColor}
          mouseSensitivity={mouseSensitivity}
          starSize={starSize}
        />
      </Canvas>
    </div>
  );
};

// Background component with gradient + water-wave shader, fog and grain.
const BackgroundLayer: React.FC<{
  backgroundColor: string;
  grainStrength: number;
  noiseStrength: number;
  speed: number;
}> = ({ backgroundColor, grainStrength, noiseStrength, speed }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size } = useThree();

  // Create uniforms once so that the same object persists across renders.
  const uniforms = useRef({
    time: { value: 0 },
    bgColor: { value: new THREE.Color(backgroundColor) },
    secondColor: { value: new THREE.Color(backgroundColor).multiplyScalar(0.15) },
    zoom: { value: 0 },
    grainStrength: { value: grainStrength },
    noiseStrength: { value: noiseStrength },
    resolution: { value: new THREE.Vector2(size.width, size.height) },
  });

  // On every frame, update time, zoom and also update values from props so they change dynamically.
  useFrame((state, delta) => {
    uniforms.current.time.value += delta;
    uniforms.current.zoom.value = speed * Math.abs(Math.sin(uniforms.current.time.value * 0.1));

    // Update dynamic uniforms based on current props.
    uniforms.current.bgColor.value.set(backgroundColor);
    uniforms.current.secondColor.value.set(backgroundColor).multiplyScalar(0.15);
    uniforms.current.grainStrength.value = grainStrength;
    uniforms.current.noiseStrength.value = noiseStrength;
    // In case the canvas resizes
    uniforms.current.resolution.value.set(size.width, size.height);
  });

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float time;
    uniform vec3 bgColor;
    uniform vec3 secondColor;
    uniform float zoom;
    uniform float grainStrength;
    uniform float noiseStrength;
    uniform vec2 resolution;
    varying vec2 vUv;
    
    // Simple random function
    float random(vec2 st) {
      return fract(sin(dot(st, vec2(12.9898,78.233))) * 43758.5453123);
    }
    
    void main() {
      vec2 uv = vUv;
      
      // create circular gradient bgColor to secondColor
      vec3 color = mix(bgColor, secondColor, length(uv - vec2(0.5)) * 2.0);
      
      // Grain effect overlay 
      float grain = (random(uv * (time + 1.0)) - 0.5) * grainStrength;
      color += grain;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  return (
    <mesh ref={meshRef} position={[0, 0, -100]} renderOrder={-1}>
      <planeGeometry args={[size.width, size.height, 1, 1]} />
      <shaderMaterial
        uniforms={uniforms.current}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
};

// Star field component
const StarField: React.FC<{
  count: number;
  depth: number;
  speed: number;
  starColor: string;
  mouseSensitivity: number;
  starSize: number;
}> = ({ count, depth, speed, starColor, mouseSensitivity, starSize }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const shaderMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const mousePosition = useMousePosition();
  
  // Initialize star geometry and attributes
  useEffect(() => {
    if (!pointsRef.current) return;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const randomness = new Float32Array(count);
    const color = new THREE.Color(starColor);
    
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 200;
      const y = (Math.random() - 0.5) * 200; 
      const z = Math.random() * -depth;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const starBrightness = 0.5 + Math.random() * 0.5;
      colors[i * 3] = color.r * starBrightness;
      colors[i * 3 + 1] = color.g * starBrightness;
      colors[i * 3 + 2] = color.b * starBrightness;
      sizes[i] = (Math.random() * 2 + 0.5) * starSize;
      randomness[i] = Math.random() * 10;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('randomness', new THREE.BufferAttribute(randomness, 1));
    pointsRef.current.geometry = geometry;
  }, [count, depth, starColor, starSize]);
  
  // Update animation for stars
  useFrame((state, delta) => {
    if (!pointsRef.current || !shaderMaterialRef.current) return;
    const time = state.clock.getElapsedTime();
    shaderMaterialRef.current.uniforms.time.value = time;
    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3 + 2] += speed * delta * 60;
      if (positions[i3 + 2] > 50) {
        positions[i3 + 2] = -depth;
        positions[i3] = (Math.random() - 0.5) * 200;
        positions[i3 + 1] = (Math.random() - 0.5) * 200;
      }
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    
    if (mousePosition.x !== null && mousePosition.y !== null) {
      const targetX = (mousePosition.x / window.innerWidth - 0.5) * mouseSensitivity;
      const targetY = (mousePosition.y / window.innerHeight - 0.5) * mouseSensitivity;
      pointsRef.current.rotation.y += (targetX - pointsRef.current.rotation.y) * 0.05;
      pointsRef.current.rotation.x += (targetY - pointsRef.current.rotation.x) * 0.05;
    }
  });
  
  return (
    <points ref={pointsRef}>
      <shaderMaterial
        ref={shaderMaterialRef}
        attach="material"
        args={[{
          uniforms: {
            time: { value: 0 }
          },
          vertexShader: starVertexShader,
          fragmentShader: starFragmentShader,
          transparent: true,
          vertexColors: true,
          blending: THREE.AdditiveBlending,
        }]}
      />
    </points>
  );
};

export default SpaceBackground;