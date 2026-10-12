import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

/**
 * Opened from a notification: finds the exact record on the page by ID
 * (data-focus-id) — or, for legacy notifications without an ID, by the
 * closest event time (data-focus-at + data-focus-entity) — scrolls to it and
 * highlights it. If nothing is found, shows a safe message instead of a blank page.
 */
const MAX_LEGACY_GAP_MS = 3 * 60 * 1000;

function visible(el: Element) {
  return (el as HTMLElement).offsetParent !== null;
}

function findTarget(focus: string | null, focusAt: string | null, entity: string | null): HTMLElement | null {
  if (focus) {
    const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-focus-id="${CSS.escape(focus)}"]`));
    return all.find(visible) ?? null;
  }
  if (focusAt) {
    const t = new Date(focusAt).getTime();
    let best: HTMLElement | null = null;
    let gap = Infinity;
    document.querySelectorAll<HTMLElement>("[data-focus-at]").forEach((el) => {
      if (!visible(el)) return;
      if (entity && el.dataset.focusEntity && el.dataset.focusEntity !== entity) return;
      const d = Math.abs(new Date(el.dataset.focusAt!).getTime() - t);
      if (d < gap) { gap = d; best = el; }
    });
    return gap <= MAX_LEGACY_GAP_MS ? best : null;
  }
  return null;
}

export function FocusHighlighter() {
  const loc = useLocation();
  useEffect(() => {
    const q = new URLSearchParams(loc.search);
    const focus = q.get("focus");
    const focusAt = q.get("focus_at");
    const entity = q.get("entity");
    if (!focus && !focusAt) return;
    let tries = 0;
    let done = false;
    const timer = window.setInterval(() => {
      tries++;
      const el = findTarget(focus, focusAt, entity);
      if (el) {
        done = true;
        window.clearInterval(timer);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("notif-focus");
        window.setTimeout(() => el.classList.remove("notif-focus"), 5000);
      } else if (tries >= 40) {
        window.clearInterval(timer);
        if (!done) toast.warning("Bildirishnomadagi yozuv topilmadi: u o‘chirilgan, arxivlangan yoki sizda uni ko‘rish huquqi yo‘q.");
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [loc.pathname, loc.search]);
  return null;
}

/** The `entity` of the record a notification asked to open (re-evaluated on every navigation). */
export function useFocusEntity(): string | null {
  const loc = useLocation();
  const q = new URLSearchParams(loc.search);
  return q.get("focus") || q.get("focus_at") ? q.get("entity") : null;
}
