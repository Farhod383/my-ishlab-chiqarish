// Global number formatting for the ERP.
// Uses dot as thousands separator (1.000.000) per project spec.
// Database keeps real numeric values; this is display-only.

/** 24-hour date+time, e.g. 12.09.2026 15:40 */
export function fmtDateTime24(v: string | number | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 24-hour time only, e.g. 09:05 */
export function fmtTime24(v: string | number | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Date only, e.g. 12.09.2026 */
export function fmtDate(v: string | number | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Duration in minutes → "2 soat 35 daqiqa" */
export function fmtDuration(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(Number(minutes ?? 0)));
  if (!m) return "0 daqiqa";
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} kun`);
  if (hours) parts.push(`${hours} soat`);
  if (mins) parts.push(`${mins} daqiqa`);
  return parts.join(" ");
}

/**
 * Display-only: rewrites legacy raw-minute strings like "2541 daq." or
 * "90 daqiqa" inside stored notification/audit text to the readable
 * "1 kun 18 soat 21 daqiqa" form. Stored values are never changed.
 */
export function fmtLegacyDurations(text: string | null | undefined): string {
  if (!text) return "";
  return String(text).replace(/(\d[\d\s.,]*)\s*daq\.?/gi, (_, raw) => {
    const n = Number(String(raw).replace(/[\s.,]/g, ""));
    return Number.isFinite(n) ? fmtDuration(n) : raw;
  });
}


export function fmtNum(n: number | string | null | undefined, opts?: { decimals?: number }): string {
  if (n === null || n === undefined || n === "") return "0";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "0";
  const decimals = opts?.decimals;
  // Kasr qiymatlar (masalan 6.940 tonna) yo'qolmasin: butun bo'lmasa 3 xonagacha ko'rsatiladi.
  const fixed =
    decimals !== undefined
      ? decimals > 0
        ? num.toFixed(decimals)
        : String(Math.round(num))
      : Number.isInteger(num)
        ? String(num)
        : String(Number(num.toFixed(3)));
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
