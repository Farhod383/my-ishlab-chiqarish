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

// Currency symbol map (single source of truth across the app).
export const CURRENCY_SYMBOL: Record<string, string> = {
  UZS: "so'm", USD: "$", EUR: "€", RUB: "₽", CNY: "¥",
  KZT: "₸", TRY: "₺", GBP: "£", AED: "د.إ", INR: "₹",
  JPY: "¥", KRW: "₩", CHF: "Fr", CAD: "C$", AUD: "A$",
};

/**
 * Format a money value with the proper currency symbol — never multiplies or
 * adds zeros. 5900 USD → "5.900 $"; 4600000 UZS → "4.600.000 so'm".
 */
export function fmtMoney(amount: number | string | null | undefined, currency?: string | null): string {
  const code = String(currency ?? "UZS").trim().toUpperCase() || "UZS";
  const sym = CURRENCY_SYMBOL[code] ?? code;
  return `${fmtNum(amount)} ${sym}`;
}

/**
 * Display-only formatter for Kassa amounts. Legacy USD cash records are stored
 * in thousandths, so only their rendered value is divided by 1,000. Database
 * values and all calculations remain unchanged.
 */
export function fmtKassaAmount(
  amount: number | string | null | undefined,
  currency?: string | null,
): string {
  const code = String(currency ?? "UZS").trim().toUpperCase() || "UZS";
  const numericAmount = typeof amount === "string" ? Number(amount) : amount;
  const displayAmount = code === "USD" && Number.isFinite(numericAmount)
    ? Number(numericAmount) / 1_000
    : numericAmount;
  return fmtNum(displayAmount);
}
