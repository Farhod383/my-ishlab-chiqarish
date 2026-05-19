// Global number formatting for the ERP.
// Uses dot as thousands separator (1.000.000) per project spec.
// Database keeps real numeric values; this is display-only.

export function fmtNum(n: number | string | null | undefined, opts?: { decimals?: number }): string {
  if (n === null || n === undefined || n === "") return "0";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "0";
  const decimals = opts?.decimals ?? 0;
  const fixed = decimals > 0 ? num.toFixed(decimals) : String(Math.round(num));
  const [intPart, decPart] = fixed.split(".");
  const sign = intPart.startsWith("-") ? "-" : "";
  const abs = sign ? intPart.slice(1) : intPart;
  const withDots = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart ? `${sign}${withDots},${decPart}` : `${sign}${withDots}`;
}

// Parse a user-typed string back to a number, tolerating dots/spaces/commas as separators.
export function parseNum(s: string): number {
  if (!s) return 0;
  const cleaned = String(s).replace(/[\s\u00A0.]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
