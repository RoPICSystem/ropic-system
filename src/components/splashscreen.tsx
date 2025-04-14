"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Image } from "@heroui/react";
import Starfield from "react-starfield";

import { isChrome } from '@/utils/is-chrome';
import { useState, useEffect } from "react";
import { hslToRgb } from "@/utils/colors";

export default function SplashScreen({ children }: { children: React.ReactNode }) {
  const [browserChrome, setBrowserChrome] = useState(false);

  useEffect(() => {
    if (isChrome()) {
      setBrowserChrome(true);
    }
  }, []);

  if (typeof window !== "undefined") {
    const rootStyle = getComputedStyle(document.documentElement);
    const primaryValue = rootStyle.getPropertyValue('--heroui-default-900').trim();
    const defaultValue = rootStyle.getPropertyValue('--heroui-primary-100').trim();
    const backValue = rootStyle.getPropertyValue('--heroui-default-50').trim();

    // Parse HSL values - assuming format is "h s% l%"
    const [h1, s1, l1] = primaryValue.split(' ').map(val => {
      return parseFloat(val.replace('%', ''));
    });

    const [h2, s2, l2] = backValue.split(' ').map(val => {
      return parseFloat(val.replace('%', ''));
    });

    const [h3, s3, l3] = defaultValue.split(' ').map(val => {
      return parseFloat(val.replace('%', ''));
    });

    // Client-side code
    return <>
      <motion.div
        initial={{ opacity: 1, visibility: "visible" }}
        animate={{
          opacity: 0, visibility: "hidden",
          filter: "blur(8px)",
          scale: 1.05
        }}
        transition={{ duration: 1.5, delay: 2.5, ease: [0.87, 0, 0.13, 1] }}
        className="fixed inset-0 flex flex-col items-center justify-center z-50"
      >
        <div className="absolute inset-0 z-0">
          <Starfield
            starCount={500}
            starColor={hslToRgb(h1, s1, l1)}
            speedFactor={0.3}
            backgroundColor={`rgba(${hslToRgb(h2, s2, l2).join(',')}, 1)`}
          />
          <div className="absolute inset-0 bg-background opacity-50"
            style={{
              background: `radial-gradient(circle, rgba(${hslToRgb(h2, s2, l2).join(',')}, 0) 20%, rgba(${hslToRgb(h3, s3, l3).join(',')}, 1) 120%)`
            }}
          />
        </div>
        <motion.div
          initial={{ scale: 0.35, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="text-center" style={{ objectFit: "contain", filter: "drop-shadow(0 30px 100px hsl(var(--heroui-primary-200)))" }}>
            {/* Replace with your logo/image */}
            <motion.div
              className="w-48 h-48 md:w-64 md:h-64 mx-auto mb-6 relative"
              initial={{ scale: 0.35, opacity: 0, y: 500, filter: "blur(20px)" }}
              animate={{ scale: 1, opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <Image
                src="/logo.png"
                alt="Web Inventory Logo"
              />
            </motion.div>
            <motion.h1
              className="text-5xl font-bold"
              initial={{ opacity: 0, y: 200, filter: "blur(5px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              RoPIC
            </motion.h1>
            <motion.p
              className="mt-2 text-default-600"
              initial={{ opacity: 0, y: 90, filter: "blur(5px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1.5, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              Reorder Point Inventory Control System
            </motion.p>
          </div>
        </motion.div>
      </motion.div>
      <motion.div
        initial={{
          opacity: 0, 
          visibility: "hidden",
          filter: browserChrome ? "blur(8px)" : "blur(0)",
          scale: 0.95
        }}
        animate={{ opacity: 1, visibility: "visible", filter: "blur(0px)", scale: 1 }}
        transition={{ duration: 1.5, delay: 2.5, ease: [0.87, 0, 0.13, 1] }}
      >
        {children}
      </motion.div>
    </>

  } else {
    // Server-side code
    return <div className="bg-background h-full w-full z-50 fixed top-0 left-0" />;
  }
}