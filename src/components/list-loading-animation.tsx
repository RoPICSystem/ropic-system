import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ListLoadingAnimationProps {
  children: React.ReactNode[];
  condition: boolean;
  skeleton: React.ReactNode[];
  staggerDelay?: number;
  containerClassName?: string;
  itemClassName?: string;
  delayContentReveal?: number;
}

const ListLoadingAnimation: React.FC<ListLoadingAnimationProps> = ({
  children,
  condition,
  skeleton,
  staggerDelay = 0.1,
  containerClassName = "",
  itemClassName = "",
  delayContentReveal = 0
}) => {
  const [height, setHeight] = useState<number | "auto">("auto");
  const [effectiveCondition, setEffectiveCondition] = useState(condition);

  useEffect(() => {
    if (condition === false && effectiveCondition === true && delayContentReveal > 0) {
      const timer = setTimeout(() => {
        setEffectiveCondition(false);
      }, delayContentReveal);
      return () => clearTimeout(timer);
    } else {
      setEffectiveCondition(condition);
    }
  }, [condition, delayContentReveal]);

  const measuredRef = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) {
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          setHeight(entry.contentRect.height);
        }
      });

      resizeObserver.observe(node);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.1
      }
    },
    exit: {
      opacity: 0,
      transition: {
        staggerChildren: staggerDelay / 2,
        staggerDirection: -1
      }
    }
  };

  const itemVariants = {
    hidden: { 
      opacity: 0, 
      filter: "blur(8px)", 
      scale: 0.95,
      y: 20,
      rotateX: 0 // Add for hardware acceleration
    },
    visible: { 
      opacity: 1, 
      filter: "blur(0px)", 
      scale: 1,
      y: 0,
      rotateX: 0, // Add for hardware acceleration
      transition: {
        duration: 0.3,
        ease: "easeOut",
        type: "spring",
        stiffness: 150,
        damping: 15,
        mass: 1.2
      }
    },
    exit: { 
      opacity: 0, 
      filter: "blur(8px)", 
      scale: 0.95,
      y: -20,
      rotateX: 0, // Add for hardware acceleration
      transition: {
        duration: 0.2,
        ease: "easeIn"
      }
    }
  };

  return (
    <motion.div
      className="relative"
      style={{ 
        willChange: 'height',
        transform: 'translateZ(0)' // Force hardware acceleration
      }}
      animate={{ height }}
      transition={{
        duration: 0.4,
        ease: "easeOut",
        type: "spring",
        stiffness: 120,
        damping: 20,
        mass: 1.5
      }}
    >
      <div 
        ref={measuredRef} 
        className="w-full"
        style={{ 
          transform: 'translateZ(0)' // Force hardware acceleration
        }}
      >
        <AnimatePresence mode="popLayout">
          {effectiveCondition ? (
            <motion.div
              key="skeleton-list"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={`w-full ${containerClassName}`}
              style={{ 
                willChange: 'opacity, transform',
                transform: 'translateZ(0)' // Force hardware acceleration
              }}
            >
              {skeleton.map((skeletonItem, index) => (
                <motion.div
                  key={`skeleton-${index}`}
                  variants={itemVariants}
                  className={`w-full ${itemClassName}`}
                  style={{ 
                    willChange: 'opacity, transform, filter',
                    transform: 'translateZ(0)' // Force hardware acceleration
                  }}
                >
                  {skeletonItem}
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="content-list"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={`w-full ${containerClassName}`}
              style={{ 
                willChange: 'opacity, transform',
                transform: 'translateZ(0)' // Force hardware acceleration
              }}
            >
              {children.map((child, index) => (
                <motion.div
                  key={`content-${index}`}
                  variants={itemVariants}
                  className={`w-full ${itemClassName}`}
                  style={{ 
                    willChange: 'opacity, transform, filter',
                    transform: 'translateZ(0)' // Force hardware acceleration
                  }}
                >
                  {child}
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ListLoadingAnimation;