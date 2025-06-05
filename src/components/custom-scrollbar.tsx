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
  scrollbarMarginLeft?: string | number;
  scrollbarMarginRight?: string | number;
  disabled?: boolean;
  scrollShadow?: boolean;
  scrollShadowTop?: boolean;
  scrollShadowBottom?: boolean;
  scrollShadowLeft?: boolean;
  scrollShadowRight?: boolean;
  scrollShadowColor?: string;
  scrollShadowSize?: number;
  scrollShadowOpacity?: number;
  direction?: 'vertical' | 'horizontal' | 'both';
  hideScrollbars?: boolean;
  hideVerticalScrollbar?: boolean;
  hideHorizontalScrollbar?: boolean;
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
  scrollbarMarginLeft = 0,
  scrollbarMarginRight = 0,
  disabled = false,
  scrollShadow = false,
  scrollShadowTop = true,
  scrollShadowBottom = true,
  scrollShadowLeft = true,
  scrollShadowRight = true,
  scrollShadowColor = herouiColor('background', 'hex') as string,
  scrollShadowSize = 40,
  scrollShadowOpacity = 1,
  direction = 'vertical',
  hideScrollbars = false,
  hideVerticalScrollbar = false,
  hideHorizontalScrollbar = false,
}) => {

  // Vertical scrollbar states
  const [scrollOpacityV, setScrollOpacityV] = useState(hideByDefault ? 0 : 1);
  const [scrollPercentageV, setScrollPercentageV] = useState(0);
  const [thumbHeightV, setThumbHeightV] = useState(0);
  const [isDraggingV, setIsDraggingV] = useState(false);
  const [dragStartYV, setDragStartYV] = useState(0);
  const [dragStartScrollTopV, setDragStartScrollTopV] = useState(0);
  const [isScrollbarHoveringV, setIsScrollbarHoveringV] = useState(false);
  const [isThumbHoveringV, setIsThumbHoveringV] = useState(false);

  // Horizontal scrollbar states
  const [scrollOpacityH, setScrollOpacityH] = useState(hideByDefault ? 0 : 1);
  const [scrollPercentageH, setScrollPercentageH] = useState(0);
  const [thumbWidthH, setThumbWidthH] = useState(0);
  const [isDraggingH, setIsDraggingH] = useState(false);
  const [dragStartXH, setDragStartXH] = useState(0);
  const [dragStartScrollLeftH, setDragStartScrollLeftH] = useState(0);
  const [isScrollbarHoveringH, setIsScrollbarHoveringH] = useState(false);
  const [isThumbHoveringH, setIsThumbHoveringH] = useState(false);

  // Shared states
  const [isContentHovering, setIsContentHovering] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [showTopShadow, setShowTopShadow] = useState(false);
  const [showBottomShadow, setShowBottomShadow] = useState(false);
  const [showLeftShadow, setShowLeftShadow] = useState(false);
  const [showRightShadow, setShowRightShadow] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollbarVRef = useRef<HTMLDivElement>(null);
  const thumbVRef = useRef<HTMLDivElement>(null);
  const scrollbarHRef = useRef<HTMLDivElement>(null);
  const thumbHRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Combined states
  const showVertical = direction === 'vertical' || direction === 'both';
  const showHorizontal = direction === 'horizontal' || direction === 'both';
  const isDragging = isDraggingV || isDraggingH;
  const isScrollbarHovering = isScrollbarHoveringV || isScrollbarHoveringH;
  const isThumbHovering = isThumbHoveringV || isThumbHoveringH;
  const isHovering = isContentHovering || isScrollbarHovering || isThumbHovering;

  // Determine if scrollbars should be hidden
  const shouldHideVerticalScrollbar = hideScrollbars || hideVerticalScrollbar;
  const shouldHideHorizontalScrollbar = hideScrollbars || hideHorizontalScrollbar;

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

  // Update scroll shadows
  const updateScrollShadows = () => {
    if (!scrollShadow || disabled) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth } = container;
    const scrollThreshold = 5;

    if (showVertical) {
      setShowTopShadow(scrollShadowTop && scrollTop > scrollThreshold);
      setShowBottomShadow(scrollShadowBottom && scrollTop < scrollHeight - clientHeight - scrollThreshold);
    }

    if (showHorizontal) {
      setShowLeftShadow(scrollShadowLeft && scrollLeft > scrollThreshold);
      setShowRightShadow(scrollShadowRight && scrollLeft < scrollWidth - clientWidth - scrollThreshold);
    }
  };

  // Calculate vertical scrollbar dimensions
  const updateVerticalScrollbar = () => {
    if (disabled || !showVertical) return;

    const container = scrollContainerRef.current;
    const scrollbar = scrollbarVRef.current;
    if (!container || !scrollbar) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const scrollableHeight = scrollHeight - clientHeight;

    if (scrollableHeight <= 0) {
      setScrollOpacityV(0);
      return;
    }

    const percentage = scrollTop / scrollableHeight;
    const marginTopPx = getPixelValue(scrollbarMarginTop, container);
    const marginBottomPx = getPixelValue(scrollbarMarginBottom, container);
    const scrollbarTotalHeight = container.clientHeight - marginTopPx - marginBottomPx - (scrollbarOffset * 2);
    const thumbHeightRatio = clientHeight / scrollHeight;
    const minThumbHeight = 30;
    const maxThumbHeight = scrollbarTotalHeight - 4;
    const calculatedThumbHeight = Math.max(minThumbHeight, Math.min(maxThumbHeight, scrollbarTotalHeight * thumbHeightRatio));

    setScrollPercentageV(percentage);
    setThumbHeightV(calculatedThumbHeight);
    
    // Only show if we have scrollable content and either not hiding by default or currently hovering/scrolling
    if (!hideByDefault || isHovering || isDragging || isScrolling) {
      setScrollOpacityV(1);
    }
  };

  // Calculate horizontal scrollbar dimensions
  const updateHorizontalScrollbar = () => {
    if (disabled || !showHorizontal) return;

    const container = scrollContainerRef.current;
    const scrollbar = scrollbarHRef.current;
    if (!container || !scrollbar) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    const scrollableWidth = scrollWidth - clientWidth;

    if (scrollableWidth <= 0) {
      setScrollOpacityH(0);
      return;
    }

    const percentage = scrollLeft / scrollableWidth;
    const marginLeftPx = getPixelValue(scrollbarMarginLeft, container);
    const marginRightPx = getPixelValue(scrollbarMarginRight, container);
    const scrollbarTotalWidth = container.clientWidth - marginLeftPx - marginRightPx - (scrollbarOffset * 2);
    const thumbWidthRatio = clientWidth / scrollWidth;
    const minThumbWidth = 30;
    const maxThumbWidth = scrollbarTotalWidth - 4;
    const calculatedThumbWidth = Math.max(minThumbWidth, Math.min(maxThumbWidth, scrollbarTotalWidth * thumbWidthRatio));

    setScrollPercentageH(percentage);
    setThumbWidthH(calculatedThumbWidth);
    
    // Only show if we have scrollable content and either not hiding by default or currently hovering/scrolling
    if (!hideByDefault || isHovering || isDragging || isScrolling) {
      setScrollOpacityH(1);
    }
  };
  // Combined scrollbar update
  const updateScrollbar = () => {
    updateVerticalScrollbar();
    updateHorizontalScrollbar();
    updateScrollShadows();
  };

  const clearAllTimeouts = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
  };

  const showScrollbars = () => {
    if (disabled) return;
    if (showVertical) setScrollOpacityV(1);
    if (showHorizontal) setScrollOpacityH(1);
    clearAllTimeouts();
  };

  const scheduleHide = () => {
    if (disabled || !hideByDefault) return;
    
    clearAllTimeouts();
    timeoutRef.current = setTimeout(() => {
      if (!isContentHovering && !isScrollbarHovering && !isThumbHovering && !isDragging && !isScrolling) {
        if (showVertical) setScrollOpacityV(0);
        if (showHorizontal) setScrollOpacityH(0);
      }
    }, hideDelay);
  };

  // Handle vertical thumb drag
  const handleThumbMouseDownV = (e: React.MouseEvent) => {
    if (disabled || !showVertical) return;

    e.preventDefault();
    e.stopPropagation();

    const container = scrollContainerRef.current;
    if (!container) return;

    setIsDraggingV(true);
    setDragStartYV(e.clientY);
    setDragStartScrollTopV(container.scrollTop);

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  };

  // Handle horizontal thumb drag
  const handleThumbMouseDownH = (e: React.MouseEvent) => {
    if (disabled || !showHorizontal) return;

    e.preventDefault();
    e.stopPropagation();

    const container = scrollContainerRef.current;
    if (!container) return;

    setIsDraggingH(true);
    setDragStartXH(e.clientX);
    setDragStartScrollLeftH(container.scrollLeft);

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: MouseEvent) => {
    const container = scrollContainerRef.current;
    if (!container || disabled) return;

    if (isDraggingV && showVertical) {
      const scrollbar = scrollbarVRef.current;
      if (!scrollbar) return;

      const deltaY = e.clientY - dragStartYV;
      const scrollbarActualHeight = scrollbar.offsetHeight;
      const availableThumbSpace = scrollbarActualHeight - thumbHeightV;
      const scrollableHeight = container.scrollHeight - container.clientHeight;
      const scrollRatio = availableThumbSpace > 0 ? deltaY / availableThumbSpace : 0;
      const newScrollTop = dragStartScrollTopV + (scrollRatio * scrollableHeight);

      container.scrollTop = Math.max(0, Math.min(scrollableHeight, newScrollTop));
    }

    if (isDraggingH && showHorizontal) {
      const scrollbar = scrollbarHRef.current;
      if (!scrollbar) return;

      const deltaX = e.clientX - dragStartXH;
      const scrollbarActualWidth = scrollbar.offsetWidth;
      const availableThumbSpace = scrollbarActualWidth - thumbWidthH;
      const scrollableWidth = container.scrollWidth - container.clientWidth;
      const scrollRatio = availableThumbSpace > 0 ? deltaX / availableThumbSpace : 0;
      const newScrollLeft = dragStartScrollLeftH + (scrollRatio * scrollableWidth);

      container.scrollLeft = Math.max(0, Math.min(scrollableWidth, newScrollLeft));
    }
  };

  const handleMouseUp = () => {
    if (!isDragging) return;

    setIsDraggingV(false);
    setIsDraggingH(false);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';

    // Reset hover states
    const scrollbarVElement = scrollbarVRef.current;
    const scrollbarHElement = scrollbarHRef.current;

    if (scrollbarVElement && !scrollbarVElement.matches(':hover')) {
      setIsScrollbarHoveringV(false);
      setIsThumbHoveringV(false);
    }

    if (scrollbarHElement && !scrollbarHElement.matches(':hover')) {
      setIsScrollbarHoveringH(false);
      setIsThumbHoveringH(false);
    }

    setTimeout(scheduleHide, 100);
  };

  // Handle vertical scrollbar track click
  const handleScrollbarClickV = (e: React.MouseEvent) => {
    if (disabled || !showVertical || e.target === thumbVRef.current) return;

    const container = scrollContainerRef.current;
    const scrollbar = scrollbarVRef.current;
    if (!container || !scrollbar) return;

    const rect = scrollbar.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const targetPercentage = Math.max(0, Math.min(1, clickY / rect.height));
    const scrollableHeight = container.scrollHeight - container.clientHeight;

    container.scrollTop = targetPercentage * scrollableHeight;
  };

  // Handle horizontal scrollbar track click
  const handleScrollbarClickH = (e: React.MouseEvent) => {
    if (disabled || !showHorizontal || e.target === thumbHRef.current) return;

    const container = scrollContainerRef.current;
    const scrollbar = scrollbarHRef.current;
    if (!container || !scrollbar) return;

    const rect = scrollbar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const targetPercentage = Math.max(0, Math.min(1, clickX / rect.width));
    const scrollableWidth = container.scrollWidth - container.clientWidth;

    container.scrollLeft = targetPercentage * scrollableWidth;
  };

  // Set up ResizeObserver
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || disabled) return;

    updateScrollbar();

    resizeObserverRef.current = new ResizeObserver((entries) => {
      requestAnimationFrame(() => {
        updateScrollbar();

        if (hideByDefault && !isHovering && !isDragging && !isScrolling) {
          const hasVerticalScroll = showVertical && container.scrollHeight > container.clientHeight;
          const hasHorizontalScroll = showHorizontal && container.scrollWidth > container.clientWidth;

          if (hasVerticalScroll || hasHorizontalScroll) {
            showScrollbars();
            scheduleHide();
          }
        }
      });
    });

    resizeObserverRef.current.observe(container);
    const children = Array.from(container.children);
    children.forEach(child => {
      if (child instanceof HTMLElement) {
        resizeObserverRef.current?.observe(child);
      }
    });

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [disabled, hideByDefault, isHovering, isDragging, isScrolling, showVertical, showHorizontal]);

  // Scroll and hover event handlers
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let lastScrollTop = container.scrollTop;
    let lastScrollLeft = container.scrollLeft;

    const handleScroll = () => {
      if (disabled) return;

      const currentScrollTop = container.scrollTop;
      const currentScrollLeft = container.scrollLeft;
      
      // Determine scroll direction
      const isScrollingVertically = Math.abs(currentScrollTop - lastScrollTop) > 0;
      const isScrollingHorizontally = Math.abs(currentScrollLeft - lastScrollLeft) > 0;

      setIsScrolling(true);
      updateScrollbar();

      // Show only the relevant scrollbar based on scroll direction
      if (isScrollingVertically && showVertical) {
        setScrollOpacityV(1);
      }
      if (isScrollingHorizontally && showHorizontal) {
        setScrollOpacityH(1);
      }

      // Update last scroll positions
      lastScrollTop = currentScrollTop;
      lastScrollLeft = currentScrollLeft;

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
        scheduleHide();
      }, 150);
    };

    const handleContentMouseEnter = () => {
      if (disabled) return;
      setIsContentHovering(true);
      showScrollbars();
    };

    const handleContentMouseLeave = () => {
      if (disabled) return;
      setIsContentHovering(false);
      scheduleHide();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    if (!disabled) {
      container.addEventListener('mouseenter', handleContentMouseEnter);
      container.addEventListener('mouseleave', handleContentMouseLeave);
    }

    const handleResize = () => {
      updateScrollbar();
      if (!disabled && hideByDefault && !isHovering && !isDragging && !isScrolling) {
        showScrollbars();
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
  }, [hideDelay, isHovering, isDragging, isScrolling, hideByDefault, disabled, showVertical, showHorizontal]);

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
  }, [isDragging, dragStartYV, dragStartScrollTopV, dragStartXH, dragStartScrollLeftH, thumbHeightV, thumbWidthH, disabled]);

  // Auto-hide scheduling effect
  useEffect(() => {
    if (!isHovering && !isDragging && !isScrolling) {
      scheduleHide();
    }
  }, [isHovering, isDragging, isScrolling, disabled]);

  // Initial setup
  useEffect(() => {
    if (disabled) {
      setScrollOpacityV(0);
      setScrollOpacityH(0);
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;

    if (hideByDefault) {
      const hasVerticalScroll = showVertical && container.scrollHeight > container.clientHeight;
      const hasHorizontalScroll = showHorizontal && container.scrollWidth > container.clientWidth;

      if (hasVerticalScroll || hasHorizontalScroll) {
        showScrollbars();
        scheduleHide();
      }
    }
  }, [disabled, hideByDefault, showVertical, showHorizontal]);

  // Helper functions for styles
  const getVerticalThumbPosition = () => {
    const scrollbar = scrollbarVRef.current;
    if (!scrollbar) return '0px';

    const scrollbarActualHeight = scrollbar.offsetHeight;
    const availableThumbSpace = scrollbarActualHeight - thumbHeightV;

    return `${Math.max(0, Math.min(availableThumbSpace, scrollPercentageV * availableThumbSpace))}px`;
  };

  const getHorizontalThumbPosition = () => {
    const scrollbar = scrollbarHRef.current;
    if (!scrollbar) return '0px';

    const scrollbarActualWidth = scrollbar.offsetWidth;
    const availableThumbSpace = scrollbarActualWidth - thumbWidthH;

    return `${Math.max(0, Math.min(availableThumbSpace, scrollPercentageH * availableThumbSpace))}px`;
  };

  // Dynamic styles
  const shouldShowVerticalScrollbar = !disabled && showVertical && scrollOpacityV > 0 && !shouldHideVerticalScrollbar;
  const shouldShowHorizontalScrollbar = !disabled && showHorizontal && scrollOpacityH > 0 && !shouldHideHorizontalScrollbar;
  
  const isVerticalTrackHovering = isScrollbarHoveringV || isThumbHoveringV || isScrolling || isDraggingV;
  const isHorizontalTrackHovering = isScrollbarHoveringH || isThumbHoveringH || isScrolling || isDraggingH;
  
  const isVerticalScrollbarPartHovering = isScrollbarHoveringV || isThumbHoveringV || isDraggingV;
  const isHorizontalScrollbarPartHovering = isScrollbarHoveringH || isThumbHoveringH || isDraggingH;

  const currentVerticalScrollbarWidth = isVerticalScrollbarPartHovering ? scrollbarHoverWidth : scrollbarWidth;
  const currentHorizontalScrollbarWidth = isHorizontalScrollbarPartHovering ? scrollbarHoverWidth : scrollbarWidth;

  const marginTopValue = typeof scrollbarMarginTop === 'number' ? `${scrollbarMarginTop}px` : scrollbarMarginTop;
  const marginBottomValue = typeof scrollbarMarginBottom === 'number' ? `${scrollbarMarginBottom}px` : scrollbarMarginBottom;
  const marginLeftValue = typeof scrollbarMarginLeft === 'number' ? `${scrollbarMarginLeft}px` : scrollbarMarginLeft;
  const marginRightValue = typeof scrollbarMarginRight === 'number' ? `${scrollbarMarginRight}px` : scrollbarMarginRight;

  // Vertical scrollbar styles
  const verticalScrollbarStyle: React.CSSProperties = {
    top: `calc(${scrollbarOffset}px + ${marginTopValue})`,
    right: scrollbarOffset,
    bottom: `calc(${scrollbarOffset}px + ${marginBottomValue} + ${showHorizontal ? currentHorizontalScrollbarWidth + scrollbarOffset : 0}px)`,
    width: currentVerticalScrollbarWidth,
    opacity: shouldShowVerticalScrollbar ? 1 : 0,
    pointerEvents: shouldShowVerticalScrollbar ? 'auto' : 'none',
    backgroundColor: isVerticalTrackHovering ? trackHoverColor : trackColor,
    borderRadius: currentVerticalScrollbarWidth / 2,
    transition: 'opacity 200ms ease-out, background-color 200ms ease-in-out, width 200ms ease-in-out',
  };

  // Horizontal scrollbar styles
  const horizontalScrollbarStyle: React.CSSProperties = {
    left: `calc(${scrollbarOffset}px + ${marginLeftValue})`,
    right: `calc(${scrollbarOffset}px + ${marginRightValue} + ${showVertical ? currentVerticalScrollbarWidth + scrollbarOffset : 0}px)`,
    bottom: scrollbarOffset,
    height: currentHorizontalScrollbarWidth,
    opacity: shouldShowHorizontalScrollbar ? 1 : 0,
    pointerEvents: shouldShowHorizontalScrollbar ? 'auto' : 'none',
    backgroundColor: isHorizontalTrackHovering ? trackHoverColor : trackColor,
    borderRadius: currentHorizontalScrollbarWidth / 2,
    transition: 'opacity 200ms ease-out, background-color 200ms ease-in-out, height 200ms ease-in-out',
  };

  // Thumb styles
  const verticalThumbStyle: React.CSSProperties = {
    backgroundColor: (isThumbHoveringV || isDraggingV) ? thumbHoverColor : thumbColor,
    borderRadius: currentVerticalScrollbarWidth / 2,
    height: thumbHeightV,
    top: getVerticalThumbPosition(),
    cursor: disabled ? 'default' : (isDraggingV ? 'grabbing' : 'grab'),
    transition: 'background-color 200ms ease-in-out',
  };

  const horizontalThumbStyle: React.CSSProperties = {
    backgroundColor: (isThumbHoveringH || isDraggingH) ? thumbHoverColor : thumbColor,
    borderRadius: currentHorizontalScrollbarWidth / 2,
    width: thumbWidthH,
    left: getHorizontalThumbPosition(),
    cursor: disabled ? 'default' : (isDraggingH ? 'grabbing' : 'grab'),
    transition: 'background-color 200ms ease-in-out',
  };

  // Scroll shadow styles
  const shadowStyle = (side: 'top' | 'bottom' | 'left' | 'right'): React.CSSProperties => {
    const isVerticalShadow = side === 'top' || side === 'bottom';
    const isTopOrLeft = side === 'top' || side === 'left';
    
    let showShadow = false;
    if (side === 'top') showShadow = showTopShadow;
    else if (side === 'bottom') showShadow = showBottomShadow;
    else if (side === 'left') showShadow = showLeftShadow;
    else if (side === 'right') showShadow = showRightShadow;

    return {
      position: 'absolute',
      ...(isVerticalShadow ? { left: 0, right: 0, height: scrollShadowSize } : { top: 0, bottom: 0, width: scrollShadowSize }),
      pointerEvents: 'none',
      zIndex: 999,
      background: `linear-gradient(${
        isVerticalShadow 
          ? (isTopOrLeft ? 'to bottom' : 'to top')
          : (isTopOrLeft ? 'to right' : 'to left')
      }, ${scrollShadowColor}${Math.round(scrollShadowOpacity * 255).toString(16).padStart(2, '0')}, transparent)`,
      opacity: showShadow ? 1 : 0,
      transition: 'opacity 200ms ease-in-out',
      ...(side === 'top' && { top: 0 }),
      ...(side === 'bottom' && { bottom: 0 }),
      ...(side === 'left' && { left: 0 }),
      ...(side === 'right' && { right: 0 }),
    };
  };

  // Determine overflow classes
  let overflowClass = 'scrollbar-hide';
  if (disabled) {
    overflowClass = 'overflow-hidden';
  } else {
    if (showVertical && showHorizontal) {
      overflowClass += ' overflow-auto';
    } else if (showVertical) {
      overflowClass += ' overflow-y-auto overflow-x-hidden';
    } else if (showHorizontal) {
      overflowClass += ' overflow-x-auto overflow-y-hidden';
    }
  }

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

      {/* Scroll shadows */}
      {scrollShadow && !disabled && (
        <>
          {scrollShadowTop && showVertical && <div style={shadowStyle('top')} />}
          {scrollShadowBottom && showVertical && <div style={shadowStyle('bottom')} />}
          {scrollShadowLeft && showHorizontal && <div style={shadowStyle('left')} />}
          {scrollShadowRight && showHorizontal && <div style={shadowStyle('right')} />}
        </>
      )}

      {/* Vertical scrollbar */}
      {!disabled && showVertical && !shouldHideVerticalScrollbar && (
        <div
          ref={scrollbarVRef}
          className="absolute z-[1000] cursor-pointer"
          style={verticalScrollbarStyle}
          onClick={handleScrollbarClickV}
          onMouseEnter={() => {
            setIsScrollbarHoveringV(true);
            showScrollbars();
          }}
          onMouseLeave={() => {
            setIsScrollbarHoveringV(false);
            scheduleHide();
          }}
        >
          <div
            ref={thumbVRef}
            className="absolute w-full"
            style={verticalThumbStyle}
            onMouseDown={handleThumbMouseDownV}
            onMouseEnter={() => {
              setIsThumbHoveringV(true);
              showScrollbars();
            }}
            onMouseLeave={() => {
              setIsThumbHoveringV(false);
              scheduleHide();
            }}
          />
        </div>
      )}

      {/* Horizontal scrollbar */}
      {!disabled && showHorizontal && !shouldHideHorizontalScrollbar && (
        <div
          ref={scrollbarHRef}
          className="absolute z-[1000] cursor-pointer"
          style={horizontalScrollbarStyle}
          onClick={handleScrollbarClickH}
          onMouseEnter={() => {
            setIsScrollbarHoveringH(true);
            showScrollbars();
          }}
          onMouseLeave={() => {
            setIsScrollbarHoveringH(false);
            scheduleHide();
          }}
        >
          <div
            ref={thumbHRef}
            className="absolute h-full"
            style={horizontalThumbStyle}
            onMouseDown={handleThumbMouseDownH}
            onMouseEnter={() => {
              setIsThumbHoveringH(true);
              showScrollbars();
            }}
            onMouseLeave={() => {
              setIsThumbHoveringH(false);
              scheduleHide();
            }}
          />
        </div>
      )}
    </div>
  );
};

export default CustomScrollbar;