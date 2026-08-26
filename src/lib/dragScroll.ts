import { useCallback, useEffect, useRef } from "react";

type DragScrollOptions = {
  axis?: "y" | "x" | "both";
  threshold?: number;
};

/**
 * Touch drag-to-scroll for lists rendered inside cmdk / Radix popovers.
 *
 * Only touch input is intercepted. Mouse wheel, mouse drag, text selection and
 * every keyboard interaction (arrows, Enter, Esc, Tab, typing) are left fully
 * native so dropdowns stay keyboard accessible.
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>(options: DragScrollOptions = {}) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef<Required<DragScrollOptions>>({ axis: "y", threshold: 5 });
  const state = useRef({
    down: false,
    dragging: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    touchId: -1,
  });

  useEffect(() => {
    optionsRef.current = {
      axis: options.axis ?? "y",
      threshold: options.threshold ?? 5,
    };
  }, [options.axis, options.threshold]);

  const setRef = useCallback((node: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) return;

    const previousOverscroll = node.style.overscrollBehavior;
    node.style.overscrollBehavior = "contain";
    (node.style as any).webkitOverflowScrolling = "touch";

    const canScroll = () => node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      state.current = {
        down: true,
        dragging: false,
        startX: touch.clientX,
        startY: touch.clientY,
        startLeft: node.scrollLeft,
        startTop: node.scrollTop,
        touchId: touch.identifier,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!state.current.down) return;
      const touch = Array.from(event.touches).find((x) => x.identifier === state.current.touchId);
      if (!touch) return;
      const dx = touch.clientX - state.current.startX;
      const dy = touch.clientY - state.current.startY;
      const { axis, threshold } = optionsRef.current;
      const distance = axis === "x" ? Math.abs(dx) : axis === "both" ? Math.hypot(dx, dy) : Math.abs(dy);
      if (!state.current.dragging && distance > threshold && canScroll()) state.current.dragging = true;
      if (!state.current.dragging) return;
      if (axis === "y" || axis === "both") node.scrollTop = state.current.startTop - dy;
      if (axis === "x" || axis === "both") node.scrollLeft = state.current.startLeft - dx;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };

    const onTouchEnd = () => {
      if (state.current.dragging) {
        const stop = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
        node.addEventListener("click", stop, { capture: true, once: true });
      }
      state.current.down = false;
      state.current.dragging = false;
      state.current.touchId = -1;
    };

    node.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    node.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    node.addEventListener("touchend", onTouchEnd, { capture: true });
    node.addEventListener("touchcancel", onTouchEnd, { capture: true });

    cleanupRef.current = () => {
      node.removeEventListener("touchstart", onTouchStart, { capture: true } as any);
      node.removeEventListener("touchmove", onTouchMove, { capture: true } as any);
      node.removeEventListener("touchend", onTouchEnd, { capture: true } as any);
      node.removeEventListener("touchcancel", onTouchEnd, { capture: true } as any);
      node.style.overscrollBehavior = previousOverscroll;
      state.current.down = false;
      state.current.dragging = false;
    };
  }, []);

  return setRef;
}
