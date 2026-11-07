import { searchNorm } from "@/lib/translit";
import { normalizeScanCode, scanCodeVariants, stripLeadingZeros } from "@/lib/scanCode";

export interface SearchProduct { id?: string; product_type_id?: string | null; name: string; old_names?: string[] | null; mxik_code?: string | null; barcode?: string | null; unit?: string | null }
export function productTypeKey(p: SearchProduct): string { return p.product_type_id ?? p.id ?? p.barcode ?? `${p.name}|${p.unit}`; }
export function uniqueProductTypes<T extends SearchProduct>(products: T[]): T[] {
  return Array.from(new Map(products.map(p => [productTypeKey(p), p])).values());
}
/** Keep different catalog types/kinds visible; batches of one type are one choice. */
export function uniqueCatalogScanRows<T extends SearchProduct & { kind?: string }>(rows: T[]): T[] {
  return Array.from(new Map(rows.map(row => [`${row.kind ?? "product"}:${productTypeKey(row)}`, row])).values());
}
export function catalogNorm(value: string): string {
  return searchNorm(value.normalize("NFKC")).replace(/yo/g, "e").replace(/[^a-z0-9]+/g, " ").trim();
}
export function productSearchText(p: SearchProduct): string {
  return [p.name, ...(p.old_names ?? []), p.mxik_code, p.barcode, p.unit].filter(Boolean).join(" ");
}
export function matchesProductText(hay: string, query: string): boolean {
  const text = catalogNorm(hay);
  return catalogNorm(query).split(/\s+/).filter(Boolean).every(word => text.includes(word));
}
export function matchesProduct(p: SearchProduct, query: string): boolean { return matchesProductText(productSearchText(p), query); }
export function scannedQuantity(unit: string | null | undefined, same: boolean, current: number): number | null {
  if (!["dona", "шт", "шт.", "sht", "piece", "pcs"].includes((unit ?? "").trim().toLowerCase())) return null;
  return same ? Math.max(0, current || 0) + 1 : 1;
}
export function resolveScan<T extends SearchProduct>(products: T[], code: string): T[] {
  const variants = scanCodeVariants(code);
  if (!variants.length) return [];
  const exact = variants.map(v => v.toUpperCase());
  const numeric = variants.map(stripLeadingZeros).filter(v => /^\d+$/.test(v));
  return uniqueProductTypes(products.filter(p => {
    if (!p.barcode) return false;
    const bar = normalizeScanCode(p.barcode);
    if (exact.includes(bar)) return true;
    // Bosh nollarsiz solishtirish: 000123 = 123 (faqat sof raqamli kodlar uchun).
    return numeric.length > 0 && /^\d+$/.test(bar) && numeric.includes(stripLeadingZeros(bar));
  }));
}