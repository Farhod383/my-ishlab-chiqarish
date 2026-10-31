import { searchNorm } from "@/lib/translit";

export interface SearchProduct { id?: string; product_type_id?: string | null; name: string; old_names?: string[] | null; mxik_code?: string | null; barcode?: string | null; unit?: string | null }
export function productTypeKey(p: SearchProduct): string { return p.product_type_id ?? p.id ?? p.barcode ?? `${p.name}|${p.unit}`; }
export function uniqueProductTypes<T extends SearchProduct>(products: T[]): T[] {
  return Array.from(new Map(products.map(p => [productTypeKey(p), p])).values());
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
  const value = code.trim();
  return uniqueProductTypes(products.filter(p => p.barcode === value));
}