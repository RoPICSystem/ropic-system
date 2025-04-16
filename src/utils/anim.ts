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