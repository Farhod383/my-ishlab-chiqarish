/** Translate system prefixes only; preserve the product/name payload and stored record. */
export function warehouseNotificationTitle(n: { title: string; entity?: string | null; type?: string }): string {
  if (!["product", "stock_movement", "instrument"].includes(n.entity ?? "") && !["low_stock", "instrument_overdue"].includes(n.type ?? "")) return n.title;
  const prefixes: [string, string][] = [
    ["Sklad chiqimi", "Расход склада"], ["Sklad kirimi", "Поступление на склад"],
    ["Kam qoldiq", "Низкий остаток"], ["Qoldiq kam", "Низкий остаток"],
    ["Instrument qaytarildi", "Инструмент возвращён"], ["Instrument berildi", "Инструмент выдан"],
  ];
  const found = prefixes.find(([source]) => n.title.startsWith(source));
  return found ? found[1] + n.title.slice(found[0].length) : n.title;
}