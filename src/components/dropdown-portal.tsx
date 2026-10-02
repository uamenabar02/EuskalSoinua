"use client";

import { useEffect, useState, useRef, useCallback, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clsx } from "@/lib/utils";

interface DropdownPortalProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  width?: number;
  className?: string;
}

const emptySubscribe = () => () => {};

export function DropdownPortal({
  isOpen,
  onClose,
  anchorRef,
  children,
  width = 240,
  className,
}: DropdownPortalProps) {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();

    if (rect.width === 0 && rect.height === 0) {
      onClose();
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const menuWidth = Math.min(width, viewportWidth - 20);
    let left = rect.right - menuWidth;
    if (left + menuWidth > viewportWidth - 10) {
      left = viewportWidth - menuWidth - 10;
    }
    if (left < 10) {
      left = 10;
    }

    const spaceBelow = viewportHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;

    let top: number;
    let maxHeight: number;

    if (spaceBelow >= 260 || spaceBelow >= spaceAbove) {
      top = rect.bottom + 6;
      maxHeight = Math.min(spaceBelow, 440);
    } else {
      maxHeight = Math.min(spaceAbove, 440);
      top = Math.max(10, rect.top - maxHeight - 6);
    }

    setCoords({ top, left, maxHeight });
  }, [anchorRef, onClose, width]);

  useEffect(() => {
    if (!isOpen) return;

    const rafId = requestAnimationFrame(() => {
      updatePosition();
    });

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };

    window.addEventListener("resize", handleScrollOrResize, { passive: true });
    window.addEventListener("scroll", handleScrollOrResize, { passive: true, capture: true });
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("touchstart", handleTouchStart, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, { capture: true });
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("touchstart", handleTouchStart);
    };
  }, [isOpen, onClose, updatePosition, anchorRef]);

  if (!isClient || !isOpen || !coords) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        width: `${Math.min(width, window.innerWidth - 20)}px`,
        maxHeight: `${coords.maxHeight}px`,
        zIndex: 99999,
      }}
      className={clsx(
        "overflow-y-auto overscroll-contain rounded-xl bg-elevated/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-1.5 text-sm animate-fade-up no-scrollbar",
        className
      )}
    >
      {children}
    </div>,
    document.body
  );
}
