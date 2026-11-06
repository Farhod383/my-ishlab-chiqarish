import { normalizeScan } from "./scanCode";

/** Capture rapid scanner bursts and restore the exact pre-scan field value/selection. */
export const SCAN_MODIFIERS = new Set(["Shift", "CapsLock", "Control", "Alt", "AltGraph", "Meta", "NumLock", "Dead"]);
export function createIssueScanHandler(onScan: (code: string, raw: string) => void, clock = () => performance.now()) {
  let buffer = "", last = -Infinity;
  let rapid = true;
  let field: HTMLInputElement | HTMLTextAreaElement | null = null;
  let value = "", start: number | null = null, end: number | null = null;
  const restore = () => {
    if (!field) return;
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    if (start !== null && end !== null) { try { field.setSelectionRange(start, end); } catch { /* numeric input */ } }
  };
  return (e: KeyboardEvent) => {
    if (SCAN_MODIFIERS.has(e.key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const now = clock(), gap = now - last;
    if (e.key === "Enter" || e.key === "Tab") {
      if (gap <= 50 && rapid && buffer.length >= 4) {
        e.preventDefault(); e.stopPropagation(); restore(); onScan(normalizeScan(buffer), buffer);
      }
      buffer = ""; last = -Infinity; field = null; return;
    }
    if (e.key.length !== 1) return;
    if (gap > 150) {
      buffer = "";
      rapid = true;
      field = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ? e.target : null;
      value = field?.value ?? ""; start = field?.selectionStart ?? null; end = field?.selectionEnd ?? null;
      // Number controls erase their value on the very first alphabetic key.
      // Suppress that invalid key before React can commit an empty/zero value.
      if (field instanceof HTMLInputElement && field.type === "number" && /[A-Za-zА-Яа-я]/.test(e.key)) {
        e.preventDefault(); e.stopPropagation();
      }
    } else if (buffer.length && gap <= 50 && rapid) {
      e.preventDefault(); e.stopPropagation(); restore();
    }
    if (buffer.length && gap > 50) rapid = false;
    buffer += e.key; last = now;
  };
}