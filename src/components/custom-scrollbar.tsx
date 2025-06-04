'use client';

import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { herouiColor } from '@/utils/colors';

interface CustomScrollbarProps {
  children: ReactNode;
  className?: string;
  thumbColor?: string;
  thumbHoverColor?: string;
  trackColor?: string;
  trackHoverColor?: string;
  hideDelay?: number;
  scrollbarWidth?: number;
  scrollbarHoverWidth?: number;
  scrollbarOffset?: number;
  hideByDefault?: boolean;
  scrollbarMarginTop?: string | number;
  scrollbarMarginBottom?: string | number;
  disabled?: boolean;
}

const CustomScrollbar: React.FC<CustomScrollbarProps> = ({
  children,
  className = '',
  thumbColor = herouiColor('default-400', 'hex') as string,
  thumbHoverColor = herouiColor('default-500', 'hex') as string,
  trackColor = 'transparent',
  trackHoverColor = herouiColor('default-200', 'hex') as string,
  hideDelay = 1500,
  scrollbarWidth = 4,
  scrollbarHoverWidth = 8,
  scrollbarOffset = 4,
  hideByDefault = true,
  scrollbarMarginTop = 0,
  scrollbarMarginBottom = 0,
  disabled = false,
}) => {
  const [scrollOpacity, setScrollOpacity] = useState(hideByDefault ? 0 : 1);
  const [scrollPercentage, setScrollPercentage] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(0);
  const [isContentHovering, setIsContentHovering] = useState(false);
  const [isScrollbarHovering, setIsScrollbarHovering] = useState(false);
  const [isThumbHovering, setIsThumbHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartScrollTop, setDragStartScrollTop] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Combined hover state for any part of the scrollbar or content
  const isHovering = isContentHovering || isScrollbarHovering || isThumbHovering;

  // Determine if scrollbar/thumb is being hovered for width expansion
  const isScrollbarPartHovering = isScrollbarHovering || isThumbHovering || isDragging;

  // Helper function to convert margin values to pixels
  const getPixelValue = (value: string | number, element: HTMLElement): number => {
    if (typeof value === 'number') return value;

    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.height = value;
    element.appendChild(tempDiv);
    const pixels = tempDiv.offsetHeight;
    element.removeChild(tempDiv);
    return pixels;
  };

  // Calculate scrollbar dimensions
  const updateScrollbar = () => {
    if (disabled) return;

    const container = scrollContainerRef.current;
    const scrollbar = scrollbarRef.current;
    if (!container || !scrollbar) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const scrollableHeight = scrollHeight - clientHeight;

    if (scrollableHeight <= 0) {
      if (hideByDefault) setScrollOpacity(0);
      return;
    }

    const percentage = scrollTop / scrollableHeight;

    // Get actual pixel values for margins
    const marginTopPx = getPixelValue(scrollbarMarginTop, container);
    const marginBottomPx = getPixelValue(scrollbarMarginBottom, container);

    // Calculate available height for the scrollbar track (accounting for margins)
    const scrollbarTotalHeight = container.clientHeight - marginTopPx - marginBottomPx - (scrollbarOffset * 2);
    const thumbHeightRatio = clientHeight / scrollHeight;

    // Ensure minimum thumb height and don't exceed available space
    const minThumbHeight = 30;
    const maxThumbHeight = scrollbarTotalHeight - 4; // Leave some padding
    const calculatedThumbHeight = Math.max(minThumbHeight, Math.min(maxThumbHeight, scrollbarTotalHeight * thumbHeightRatio));

    setScrollPercentage(percentage);
    setThumbHeight(calculatedThumbHeight);
  };

  const clearAllTimeouts = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
  };

  const showScrollbar = () => {
    if (disabled) return;
    setScrollOpacity(1);
    clearAllTimeouts();
  };

  const scheduleHide = () => {
    if (disabled || (hideByDefault && !isHovering && !isDragging && !isScrolling)) {
      clearAllTimeouts();
      timeoutRef.current = setTimeout(() => {
        if (disabled || (!isContentHovering && !isScrollbarHovering && !isThumbHovering && !isDragging && !isScrolling)) {
          setScrollOpacity(0);
        }
      }, hideDelay);
    }
  };

  // Handle thumb drag
  const handleThumbMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;

    e.preventDefault();
    e.stopPropagation();

    const container = scrollContainerRef.current;
    if (!container) return;

    setIsDragging(true);
    setDragStartY(e.clientY);
    setDragStartScrollTop(container.scrollTop);

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || disabled) return;

    const container = scrollContainerRef.current;
    const scrollbar = scrollbarRef.current;
    if (!container || !scrollbar) return;

    const deltaY = e.clientY - dragStartY;

    // Get the actual scrollbar height (accounting for margins)
    const scrollbarActualHeight = scrollbar.offsetHeight;
    const availableThumbSpace = scrollbarActualHeight - thumbHeight;
    const scrollableHeight = container.scrollHeight - container.clientHeight;

    // Calculate scroll ratio based on available space for thumb movement
    const scrollRatio = availableThumbSpace > 0 ? deltaY / availableThumbSpace : 0;
    const newScrollTop = dragStartScrollTop + (scrollRatio * scrollableHeight);

    container.scrollTop = Math.max(0, Math.min(scrollableHeight, newScrollTop));
  };

  const handleMouseUp = () => {
    if (!isDragging) return;

    setIsDragging(false);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    // Force update of hover states to reset track color immediately
    const scrollbarElement = scrollbarRef.current;
    if (scrollbarElement) {
      const isMouseOverScrollbar = scrollbarElement.matches(':hover');
      if (!isMouseOverScrollbar) {
        setIsScrollbarHovering(false);
        setIsThumbHovering(false);
      }
    }

    setTimeout(scheduleHide, 100);
  };

  // Handle scrollbar track click
  const handleScrollbarClick = (e: React.MouseEvent) => {
    if (disabled || e.target === thumbRef.current) return;

    const container = scrollContainerRef.current;
    const scrollbar = scrollbarRef.current;
    if (!container || !scrollbar) return;

    const rect = scrollbar.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const targetPercentage = Math.max(0, Math.min(1, clickY / rect.height));

    const scrollableHeight = container.scrollHeight - container.clientHeight;
    container.scrollTop = targetPercentage * scrollableHeight;
  };

  // Set up ResizeObserver to watch for content and container size changes
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || disabled) return;

    // Initial calculation
    updateScrollbar();

    // Create ResizeObserver to watch for size changes
    resizeObserverRef.current = new ResizeObserver((entries) => {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        updateScrollbar();

        // Show scrollbar briefly when content changes if hideByDefault is true
        if (hideByDefault && !isHovering && !isDragging && !isScrolling) {
          const hasScrollableContent = container.scrollHeight > container.clientHeight;
          if (hasScrollableContent) {
            showScrollbar();
            scheduleHide();
          }
        }
      });
    });

    // Observe both the container and its content
    resizeObserverRef.current.observe(container);

    // Also observe all direct children for content changes
    const children = Array.from(container.children);
    children.forEach(child => {
      if (child instanceof HTMLElement) {
        resizeObserverRef.current?.observe(child);
      }
    });

    // Set up initial auto-hide timer if hideByDefault is true
    if (hideByDefault && scrollOpacity === 0) {
      const hasScrollableContent = container.scrollHeight > container.clientHeight;
      if (hasScrollableContent) {
        showScrollbar();
        scheduleHide();
      }
    }

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [disabled, hideByDefault, isHovering, isDragging, isScrolling, scrollOpacity]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (disabled) return;

      setIsScrolling(true);
      updateScrollbar();
      showScrollbar();

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
        setTimeout(scheduleHide, 100);
      }, 150);
    };

    const handleContentMouseEnter = () => {
      if (disabled) return;

      setIsContentHovering(true);
      showScrollbar();
    };

    const handleContentMouseLeave = () => {
      if (disabled) return;

      setIsContentHovering(false);
      setTimeout(scheduleHide, 100);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    if (!disabled) {
      container.addEventListener('mouseenter', handleContentMouseEnter);
      container.addEventListener('mouseleave', handleContentMouseLeave);
    }

    // Handle window resize
    const handleResize = () => {
      updateScrollbar();
      if (!disabled && hideByDefault && !isHovering && !isDragging && !isScrolling) {
        showScrollbar();
        scheduleHide();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('mouseenter', handleContentMouseEnter);
      container.removeEventListener('mouseleave', handleContentMouseLeave);
      window.removeEventListener('resize', handleResize);
      clearAllTimeouts();
    };
  }, [hideDelay, isHovering, isDragging, isScrolling, hideByDefault, scrollOpacity, disabled]);

  // Mouse events for dragging
  useEffect(() => {
    if (isDragging && !disabled) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStartY, dragStartScrollTop, thumbHeight, disabled]);

  // Auto-hide scheduling effect
  useEffect(() => {
    scheduleHide();
  }, [isHovering, isDragging, isScrolling, disabled]);

  // Hide scrollbar immediately if disabled
  useEffect(() => {
    if (disabled) {
      setScrollOpacity(0);
    }
  }, [disabled]);

  // Dynamic styles that can't be handled by Tailwind
  const shouldShowScrollbar = !disabled && scrollOpacity > 0;
  const isTrackHovering = isScrollbarHovering || isThumbHovering || isScrolling || isDragging;

  const currentScrollbarWidth = isScrollbarPartHovering ? scrollbarHoverWidth : scrollbarWidth;

  const marginTopValue = typeof scrollbarMarginTop === 'number' ? `${scrollbarMarginTop}px` : scrollbarMarginTop;
  const marginBottomValue = typeof scrollbarMarginBottom === 'number' ? `${scrollbarMarginBottom}px` : scrollbarMarginBottom;

  const scrollbarStyle: React.CSSProperties = {
    top: `calc(${scrollbarOffset}px + ${marginTopValue})`,
    right: scrollbarOffset,
    bottom: `calc(${scrollbarOffset}px + ${marginBottomValue})`,
    width: currentScrollbarWidth,
    opacity: shouldShowScrollbar ? 1 : 0,
    pointerEvents: shouldShowScrollbar ? 'auto' : 'none',
    backgroundColor: isTrackHovering ? trackHoverColor : trackColor,
    borderRadius: currentScrollbarWidth / 2,
    transition: 'opacity 200ms ease-out, background-color 200ms ease-in-out, width 200ms ease-in-out',
  };

  const getThumbPosition = () => {
    const scrollbar = scrollbarRef.current;
    if (!scrollbar) return '0px';

    const scrollbarActualHeight = scrollbar.offsetHeight;
    const availableThumbSpace = scrollbarActualHeight - thumbHeight;

    return `${Math.max(0, Math.min(availableThumbSpace, scrollPercentage * availableThumbSpace))}px`;
  };

  const thumbStyle: React.CSSProperties = {
    backgroundColor: (isThumbHovering || isDragging) ? thumbHoverColor : thumbColor,
    borderRadius: currentScrollbarWidth / 2,
    height: thumbHeight,
    top: getThumbPosition(),
    cursor: disabled ? 'default' : (isDragging ? 'grabbing' : 'grab'),
    transition: 'background-color 200ms ease-in-out',
  };

  const overflowClass = disabled ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden scrollbar-hide';

  return (
    <div className="relative h-full w-full">
      <style jsx>{`
          .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
        `}</style>

      <div
        ref={scrollContainerRef}
        className={`h-full w-full ${overflowClass} ${className}`}
      >
        {children}
      </div>

      {!disabled && (
        <div
          ref={scrollbarRef}
          className="absolute z-[1000] cursor-pointer"
          style={scrollbarStyle}
          onClick={handleScrollbarClick}
          onMouseEnter={() => {
            setIsScrollbarHovering(true);
            showScrollbar();
          }}
          onMouseLeave={() => {
            setIsScrollbarHovering(false);
            setTimeout(scheduleHide, 100);
          }}
        >
          <div
            ref={thumbRef}
            className="absolute w-full"
            style={thumbStyle}
            onMouseDown={handleThumbMouseDown}
            onMouseEnter={() => {
              setIsThumbHovering(true);
              showScrollbar();
            }}
            onMouseLeave={() => {
              setIsThumbHovering(false);
              setTimeout(scheduleHide, 100);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default CustomScrollbar;