import { supabase } from "@/integrations/supabase/client";

export type ScanAction = "in" | "out" | "search";
export type ScanResult = "found" | "not_found";

export const SCAN_MODULES = ["Sklad", "Kirim", "Chiqim", "Nakladnoy", "Sverka"] as const;

export const scanActionLabel = (a: string | null | undefined): string =>
  a === "in" ? "Kirim" : a === "out" ? "Chiqim" : "Faqat qidirish";

export const scanResultLabel = (r: string | null | undefined): string =>
  r === "found" ? "Topildi" : "Topilmadi";

export interface LogScanArgs {
  code: string;
  module: string;
  action: ScanAction;
  productId?: string | null;
  productName?: string | null;
  productTypeId?: string | null;
  kind?: string | null;
  result: ScanResult;
}

/** Skanerlashni tarixga yozadi. Xato bo'lsa ham skaner oqimini to'xtatmaydi — null qaytaradi. */
export async function logScan(a: LogScanArgs): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("log_scan", {
      _code: a.code,
      _module: a.module,
      _action: a.action,
      _product_id: a.productId ?? null,
      _product_name: a.productName ?? null,
      _product_type_id: a.productTypeId ?? null,
      _kind: a.kind ?? null,
      _result: a.result,
    });
    if (error) return null;
    return (data as string) ?? null;
  } catch {
    return null;
  }
}

/** Operatsiya tasdiqlanganda miqdor va yakuniy qoldiqni skaner yozuviga bog'laydi. */
export async function finalizeScan(id: string | null | undefined, action: ScanAction, quantity: number, stockAfter: number | null): Promise<void> {
  if (!id) return;
  try {
    await supabase.rpc("finalize_scan", { _id: id, _action: action, _quantity: quantity, _stock_after: stockAfter });
  } catch { /* tarix yangilanmasa ham operatsiya saqlangan */ }
}

export interface ScanHistoryRow {
  id: string;
  scanned_at: string;
  code: string;
  product_id: string | null;
  product_name: string | null;
  product_type_id: string | null;
  kind: string | null;
  module: string;
  action: string;
  result: string;
  quantity: number | null;
  stock_after: number | null;
  scanned_by: string | null;
  scanned_by_name: string | null;
}

export interface ScanFilters {
  from: string; // YYYY-MM-DD yoki ""
  to: string;
  product: string;
  code: string;
  user: string; // "" = barchasi
  module: string;
  action: string;
  result: string;
}

export const EMPTY_SCAN_FILTERS: ScanFilters = { from: "", to: "", product: "", code: "", user: "", module: "all", action: "all", result: "all" };

export function matchesScanFilters(row: ScanHistoryRow, f: ScanFilters): boolean {
  if (f.from && row.scanned_at.slice(0, 10) < f.from) return false;
  if (f.to && row.scanned_at.slice(0, 10) > f.to) return false;
  if (f.product.trim() && !(row.product_name ?? "").toLowerCase().includes(f.product.trim().toLowerCase())) return false;
  if (f.code.trim() && !row.code.toLowerCase().includes(f.code.trim().toLowerCase())) return false;
  if (f.user && f.user !== "all" && (row.scanned_by_name ?? "") !== f.user) return false;
  if (f.module !== "all" && row.module !== f.module) return false;
  if (f.action !== "all" && row.action !== f.action) return false;
  if (f.result !== "all" && row.result !== f.result) return false;
  return true;
}
