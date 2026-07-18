import { useCallback, useRef } from "react";

/**
 * Enables drag-to-scroll (mouse + touch) on any scrollable element.
 * Attach the returned ref to the scrollable node. Wheel and native touch
 * scroll continue to work; this only adds pointer-drag panning.
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const state = useRef({ down: false, startY: 0, startTop: 0, moved: false, pointerId: 0 });

  const setRef = useCallback((node: T | null) => {
    const prev = ref.current;
    if (prev) {
      prev.onpointerdown = null;
      prev.onpointermove = null;
      prev.onpointerup = null;
      prev.onpointercancel = null;
    }
    ref.current = node;
    if (!node) return;

    node.style.touchAction = "pan-y";
    node.style.overscrollBehavior = "contain";
    (node.style as any).webkitOverflowScrolling = "touch";

    node.onpointerdown = (e: PointerEvent) => {
      // Ignore right-clicks
      if (e.button && e.button !== 0) return;
      state.current.down = true;
      state.current.moved = false;
      state.current.startY = e.clientY;
      state.current.startTop = node.scrollTop;
      state.current.pointerId = e.pointerId;
    };
    node.onpointermove = (e: PointerEvent) => {
      if (!state.current.down) return;
      const dy = e.clientY - state.current.startY;
      if (Math.abs(dy) > 6) {
        if (!state.current.moved) {
          state.current.moved = true;
          try { node.setPointerCapture(state.current.pointerId); } catch {}
        }
        node.scrollTop = state.current.startTop - dy;
        e.preventDefault();
      }
    };
    const end = (e: PointerEvent) => {
      if (state.current.moved) {
        try { node.releasePointerCapture(state.current.pointerId); } catch {}
        // Prevent the click that follows a drag from selecting an item
        const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
        node.addEventListener("click", stop, { capture: true, once: true });
      }
      state.current.down = false;
      state.current.moved = false;
    };
    node.onpointerup = end;
    node.onpointercancel = end;
  }, []);

  return setRef;
}
