import { normalizeScan } from "./scanCode";

/** Capture rapid scanner bursts and restore the exact pre-scan field value/selection. */
export function createIssueScanHandler(onScan: (code: string) => void, clock = () => performance.now()) {
  let buffer = "", last = -Infinity;
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
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const now = clock(), gap = now - last;
    if (e.key === "Enter" || e.key === "Tab") {
      if (gap <= 50 && buffer.length >= 4) {
        e.preventDefault(); e.stopPropagation(); restore(); onScan(normalizeScan(buffer));
      }
      buffer = ""; last = -Infinity; field = null; return;
    }
    if (e.key.length !== 1) { buffer = ""; field = null; return; }
    if (gap > 50) {
      buffer = "";
      field = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ? e.target : null;
      value = field?.value ?? ""; start = field?.selectionStart ?? null; end = field?.selectionEnd ?? null;
      // Number controls erase their value on the very first alphabetic key.
      // Suppress that invalid key before React can commit an empty/zero value.
      if (field instanceof HTMLInputElement && field.type === "number" && /[A-Za-zА-Яа-я]/.test(e.key)) {
        e.preventDefault(); e.stopPropagation();
      }
    } else if (buffer.length) {
      e.preventDefault(); e.stopPropagation(); restore();
    }
    buffer += e.key; last = now;
  };
}