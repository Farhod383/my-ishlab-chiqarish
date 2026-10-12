import { useEffect } from "react";

const TEXT_FIELD = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=color]), textarea, [contenteditable="true"]';

function editable(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el || !(el as HTMLElement).matches?.(TEXT_FIELD)) return false;
  const f = el as HTMLInputElement;
  return !f.disabled && !f.readOnly;
}

/** Numeric inputs get a numeric phone keyboard unless the field chose its own. */
function applyInputMode(root: ParentNode) {
  root.querySelectorAll?.('input[type=number]:not([inputmode])').forEach((el) => {
    const step = el.getAttribute("step");
    el.setAttribute("inputmode", step && !step.includes(".") && step !== "any" ? "numeric" : "decimal");
  });
  root.querySelectorAll?.('input[type=tel]:not([inputmode])').forEach((el) => el.setAttribute("inputmode", "tel"));
}

/** Keep the focused field visible above the on-screen keyboard. */
function revealField(el: HTMLElement) {
  const vv = window.visualViewport;
  const r = el.getBoundingClientRect();
  const top = vv ? vv.offsetTop : 0;
  const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  if (r.top < top + 8 || r.bottom > bottom - 8) el.scrollIntoView({ block: "center", inline: "nearest" });
}

/**
 * App-wide phone fixes:
 * - a single tap on a text field always focuses it (some wrappers cancel the
 *   default pointer action, which forced users to long-press to type);
 * - numeric fields open a numeric keyboard;
 * - the focused field is scrolled into view when the keyboard opens.
 */
export function MobileInputFix() {
  useEffect(() => {
    applyInputMode(document);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) { applyInputMode(n as Element); if ((n as Element).matches?.("input[type=number],input[type=tel]")) applyInputMode(n.parentNode as ParentNode); } });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    let startX = 0, startY = 0, moved = false;
    const onTouchStart = (e: TouchEvent) => { const t = e.touches[0]; startX = t.clientX; startY = t.clientY; moved = false; };
    const onTouchMove = (e: TouchEvent) => { const t = e.touches[0]; if (Math.hypot(t.clientX - startX, t.clientY - startY) > 10) moved = true; };
    const onTouchEnd = (e: TouchEvent) => {
      if (moved) return;
      const target = e.target as Element | null;
      const field = target?.closest?.(TEXT_FIELD) ?? null;
      if (!editable(field) || document.activeElement === field) return;
      // Focus inside the user gesture so iOS/Android open the keyboard.
      field.focus({ preventScroll: true });
    };

    let revealTimer = 0;
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!editable(el) || !window.matchMedia("(pointer: coarse)").matches) return;
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(() => revealField(el), 320);
    };
    const onViewport = () => { const el = document.activeElement as HTMLElement | null; if (editable(el)) revealField(el); };

    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    document.addEventListener("focusin", onFocusIn, true);
    window.visualViewport?.addEventListener("resize", onViewport);
    return () => {
      mo.disconnect();
      window.clearTimeout(revealTimer);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.visualViewport?.removeEventListener("resize", onViewport);
    };
  }, []);
  return null;
}
