import { herouiColor } from "./colors"

export const motionTransition = {
  variants: {
    initial: {
      opacity: 0, scale: 0.95, height: 0, filter: "blur(8px)",
      transition: {
        duration: 0.3,
        ease: [0.25, 0.1, 0.25, 1], // cubic-bezier for smoother easing
        staggerChildren: 0.05
      }
    },
    animate: {
      opacity: 1, scale: 1, height: 'auto', filter: "blur(0px)",
      transition: {
        duration: 0.4,
        type: "spring",
        stiffness: 150, // lower stiffness for smoother movement
        damping: 15,    // adjusted damping
        mass: 1.2       // added mass for more natural physics
      }
    },
    exit: {
      opacity: 0, scale: 0.95, height: 0, filter: "blur(8px)",
      transition: {
        duration: 0.3,
        ease: [0.25, 0.1, 0.25, 1], // matching initial easing
        staggerChildren: 0.05
      }
    }
  },
  initial: "initial",
  animate: "animate",
  exit: "exit"
}


export const popoverTransition = (isUp = true) => {
  return {
    variants: {
      initial: {
        opacity: 0,
        borderRadius: "1rem",
        backgroundColor: `${herouiColor("background", "hex")}`,
        scale: (window as any).chrome ? 1 : 0,
        y: (window as any).chrome ? isUp ?'-5rem' : '5rem' : 0,
        transition: {
          duration: 0.3,
          ease: [0.25, 0.1, 0.25, 1], // cubic-bezier for smoother easing
          staggerChildren: 0.05
        }
      },
      enter: {
        opacity: 1,
        backgroundColor: "#00000000",
        y: 0,
        scale: 1,
        transition: {
          scale: {
            duration: 0.4,
            type: "spring",
            stiffness: 150, // lower stiffness for smoother movement
            damping: 15,    // adjusted damping
            mass: 1.2,       // added mass for more natural physics
          },
          y: {
            duration: 0.4,
            type: "spring",
            stiffness: 150, // lower stiffness for smoother movement
            damping: 15,    // adjusted damping
            mass: 1.2,       // added mass for more natural physics
          },
          opacity: {
            delay: 0.1,
            duration: 0.15,
            ease: [0.25, 0.1, 0.25, 1], // matching initial easing
            staggerChildren: 0.05
          },
          filter: {
            duration: 1,
            ease: [0.25, 0.1, 0.25, 1], // matching initial easing

          },
          backgroundColor: {
            duration: (window as any).chrome ? 0.8 : 0.5,
            ease: [0.25, 0.1, 0.25, 1], // matching initial easing
          }
        }
      },
      exit: {
        opacity: 0,
        filter: (window as any).chrome ?  "blur(8px)" : '',
        scale: (window as any).chrome ? 1 : 0,
        y: (window as any).chrome ? isUp ? '-2.5rem' : '2.5rem' : 0,
        transition: {
          scale: {
            duration: 0.3,
            ease: [0.25, 0.1, 0.25, 1], // matching initial easing
            staggerChildren: 0.05,
          },
          y: {
            duration: 0.3,
            ease: [0.25, 0.1, 0.25, 1], // matching initial easing
            staggerChildren: 0.05,
          },
          opacity: {
            duration: 0.15,
            ease: [0.25, 0.1, 0.25, 1], // matching initial easing
            staggerChildren: 0.05
          }
        }
      }
    }
  }
}

