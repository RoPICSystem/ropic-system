import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { motionTransition } from '@/utils/anim';

interface LoadingAnimationProps {
  children: React.ReactNode;
  condition: boolean;
  skeleton: React.ReactNode;
  className?: string;
  delayContentReveal?: number;
}

const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  children,
  condition,
  skeleton,
  className = "",
  delayContentReveal = 0,
}) => {
  const [height, setHeight] = useState<number | "auto">("auto");
  const [isAnimating, setIsAnimating] = useState(false);
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
  }, [condition, delayContentReveal, effectiveCondition]);

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

  useEffect(() => {
    if (isAnimating) {
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isAnimating]);

  const animationConfig = {
    initial: { opacity: 0, transform: 'scale3d(0.95, 0.95, 1) translateZ(0)', filter: "blur(8px)" },
    animate: { opacity: 1, transform: 'scale3d(1, 1, 1) translateZ(0)', filter: "blur(0px)" },
    exit: { opacity: 0, transform: 'scale3d(0.95, 0.95, 1) translateZ(0)', filter: "blur(8px)" },
    transition: {
      duration: 0.3,
      ease: "easeOut",
      type: "spring",
      stiffness: 150,
      damping: 15,
      mass: 1.2,
    }
  };

  return (
    <motion.div
      className="relative"
      animate={{ height }}
      style={{
        willChange: 'transform, height',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        perspective: 1000
      }}
      transition={{
        duration: isAnimating ? 0.3 : 0,
        ease: "easeOut",
        type: "spring",
        stiffness: 150,
        damping: 15,
        mass: 1.2,
      }}
      layout={isAnimating}
    >
      <div ref={measuredRef} className={`w-full ${className}`}>
        <AnimatePresence mode="popLayout">
          {effectiveCondition ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0, filter: "blur(8px)", transform: 'scale3d(0.95, 0.95, 1) translateZ(0)' }}
              animate={{ opacity: 1, filter: "blur(0px)", transform: 'scale3d(1, 1, 1) translateZ(0)' }}
              exit={{ opacity: 0, filter: "blur(8px)", transform: 'scale3d(0.95, 0.95, 1) translateZ(0)' }}
              onAnimationStart={() => setIsAnimating(true)}
              transition={{
                duration: 0.3,
                ease: "easeOut",
                type: "spring",
                stiffness: 150,
                damping: 15,
                mass: 1.2
              }}
              style={{
                willChange: 'transform, opacity, filter',
                backfaceVisibility: 'hidden',
                transform: 'translateZ(0)'
              }}
              className="w-full"
            >
              {skeleton}
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0, filter: "blur(8px)", transform: 'scale3d(0.95, 0.95, 1) translateZ(0)' }}
              animate={{ opacity: 1, filter: "blur(0px)", transform: 'scale3d(1, 1, 1) translateZ(0)' }}
              exit={{ opacity: 0, filter: "blur(8px)", transform: 'scale3d(0.95, 0.95, 1) translateZ(0)' }}
              onAnimationStart={() => setIsAnimating(true)}
              transition={{
                duration: 0.3,
                ease: "easeOut",
                type: "spring",
                stiffness: 150,
                damping: 15,
                mass: 1.2
              }}
              style={{
                willChange: 'transform, opacity, filter',
                backfaceVisibility: 'hidden',
                transform: 'translateZ(0)'
              }}
              className="w-full"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default LoadingAnimation;