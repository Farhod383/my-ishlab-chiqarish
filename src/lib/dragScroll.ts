import { useCallback, useEffect, useRef } from "react";

type DragScrollOptions = {
  axis?: "y" | "x" | "both";
  threshold?: number;
};

/**
 * Enables component-level drag-to-scroll on any scrollable element.
 *
 * Root cause fixed here: cmdk/Radix items listen to pointer movement for hover
 * selection, so a drag over list items can be consumed before the scrollable
 * list pans. This hook listens in capture phase, takes pointer capture after a
 * small movement threshold, and scrolls the list itself for pointer, touch
 * fallback, and wheel input.
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>(options: DragScrollOptions = {}) {
  const ref = useRef<T | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef<Required<DragScrollOptions>>({ axis: "y", threshold: 5 });
  const state = useRef({
    down: false,
    dragging: false,
    source: "" as "" | "pointer" | "mouse" | "touch",
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    pointerId: -1,
    touchId: -1,
    lastPointerScrollAt: 0,
  });

  useEffect(() => {
    optionsRef.current = {
      axis: options.axis ?? "y",
      threshold: options.threshold ?? 5,
    };
  }, [options.axis, options.threshold]);

  const stopEvent = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
  };

  const canScroll = (node: HTMLElement) =>
    node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;

  const applyScroll = (node: HTMLElement, dx: number, dy: number) => {
    const { axis } = optionsRef.current;
    if (axis === "y" || axis === "both") node.scrollTop = state.current.startTop - dy;
    if (axis === "x" || axis === "both") node.scrollLeft = state.current.startLeft - dx;
  };

  const suppressNextClick = (node: HTMLElement) => {
    const stop = (event: Event) => stopEvent(event);
    node.addEventListener("click", stop, { capture: true, once: true });
  };

  const setRef = useCallback((node: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    ref.current = node;
    if (!node) return;

    const previous = {
      touchAction: node.style.touchAction,
      overscrollBehavior: node.style.overscrollBehavior,
      webkitOverflowScrolling: (node.style as any).webkitOverflowScrolling,
    };

    node.style.touchAction = "none";
    node.style.overscrollBehavior = "contain";
    (node.style as any).webkitOverflowScrolling = "touch";

    const begin = (clientX: number, clientY: number, source: typeof state.current.source, pointerId = -1, touchId = -1) => {
      state.current.down = true;
      state.current.dragging = false;
      state.current.source = source;
      state.current.startX = clientX;
      state.current.startY = clientY;
      state.current.startLeft = node.scrollLeft;
      state.current.startTop = node.scrollTop;
      state.current.pointerId = pointerId;
      state.current.touchId = touchId;
    };

    const move = (clientX: number, clientY: number, source: typeof state.current.source) => {
      if (!state.current.down) return false;
      if (source === "touch" && state.current.source !== "touch") return false;
      if (source !== "touch" && state.current.source === "touch") return false;
      const dx = clientX - state.current.startX;
      const dy = clientY - state.current.startY;
      const { axis, threshold } = optionsRef.current;
      const distance = axis === "x" ? Math.abs(dx) : axis === "both" ? Math.hypot(dx, dy) : Math.abs(dy);
      if (!state.current.dragging && distance > threshold && canScroll(node)) {
        state.current.dragging = true;
      }
      if (state.current.dragging) {
        applyScroll(node, dx, dy);
        return true;
      }
      return false;
    };

    const end = () => {
      if (state.current.dragging) suppressNextClick(node);
      state.current.down = false;
      state.current.dragging = false;
      state.current.source = "";
      state.current.pointerId = -1;
      state.current.touchId = -1;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== undefined && event.button !== 0) return;
      begin(event.clientX, event.clientY, "pointer", event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!state.current.down || state.current.pointerId !== event.pointerId) return;
      const didScroll = move(event.clientX, event.clientY, "pointer");
      if (state.current.dragging) {
        if (didScroll) state.current.lastPointerScrollAt = Date.now();
        try { node.setPointerCapture(event.pointerId); } catch {}
        stopEvent(event);
      }
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (state.current.pointerId !== event.pointerId) return;
      try { node.releasePointerCapture(event.pointerId); } catch {}
      end();
    };

    const onMouseDown = (event: MouseEvent) => {
      if (state.current.down) return;
      if (event.button !== 0) return;
      begin(event.clientX, event.clientY, "mouse");
    };

    const onMouseMove = (event: MouseEvent) => {
      if (Date.now() - state.current.lastPointerScrollAt < 80) return;
      if (move(event.clientX, event.clientY, "mouse")) stopEvent(event);
    };

    const onMouseEnd = () => {
      if (state.current.source === "mouse") end();
    };

    const findTouch = (event: TouchEvent) => {
      const touches = Array.from(event.changedTouches);
      return touches.find((touch) => touch.identifier === state.current.touchId) ?? touches[0];
    };

    const onTouchStart = (event: TouchEvent) => {
      if (state.current.down) return;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      begin(touch.clientX, touch.clientY, "touch", -1, touch.identifier);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!state.current.down || state.current.source !== "touch") return;
      const touch = findTouch(event);
      if (!touch) return;
      if (move(touch.clientX, touch.clientY, "touch")) stopEvent(event);
    };

    const onWheel = (event: WheelEvent) => {
      if (!canScroll(node) || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const maxTop = node.scrollHeight - node.clientHeight;
      const nextTop = Math.max(0, Math.min(maxTop, node.scrollTop + event.deltaY));
      if (nextTop === node.scrollTop) return;
      node.scrollTop = nextTop;
      stopEvent(event);
    };

    node.addEventListener("pointerdown", onPointerDown, { capture: true });
    node.addEventListener("pointermove", onPointerMove, { capture: true, passive: false });
    node.addEventListener("pointerup", onPointerEnd, { capture: true });
    node.addEventListener("pointercancel", onPointerEnd, { capture: true });
    node.addEventListener("mousedown", onMouseDown, { capture: true });
    node.addEventListener("mousemove", onMouseMove, { capture: true, passive: false });
    node.addEventListener("mouseup", onMouseEnd, { capture: true });
    node.addEventListener("mouseleave", onMouseEnd, { capture: true });
    node.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    node.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    node.addEventListener("touchend", end, { capture: true });
    node.addEventListener("touchcancel", end, { capture: true });
    node.addEventListener("wheel", onWheel, { capture: true, passive: false });

    cleanupRef.current = () => {
      node.removeEventListener("pointerdown", onPointerDown, { capture: true });
      node.removeEventListener("pointermove", onPointerMove, { capture: true } as any);
      node.removeEventListener("pointerup", onPointerEnd, { capture: true });
      node.removeEventListener("pointercancel", onPointerEnd, { capture: true });
      node.removeEventListener("mousedown", onMouseDown, { capture: true });
      node.removeEventListener("mousemove", onMouseMove, { capture: true } as any);
      node.removeEventListener("mouseup", onMouseEnd, { capture: true });
      node.removeEventListener("mouseleave", onMouseEnd, { capture: true });
      node.removeEventListener("touchstart", onTouchStart, { capture: true });
      node.removeEventListener("touchmove", onTouchMove, { capture: true } as any);
      node.removeEventListener("touchend", end, { capture: true });
      node.removeEventListener("touchcancel", end, { capture: true });
      node.removeEventListener("wheel", onWheel, { capture: true } as any);
      node.style.touchAction = previous.touchAction;
      node.style.overscrollBehavior = previous.overscrollBehavior;
      (node.style as any).webkitOverflowScrolling = previous.webkitOverflowScrolling;
      state.current.down = false;
      state.current.dragging = false;
      state.current.source = "";
    };
  }, []);

  return setRef;
}
