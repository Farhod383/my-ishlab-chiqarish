export type IssueLine = { key: string; product_id: string; quantity: number; order_id: string; comment: string; cross_order_reason: string; scan_id: string | null };
export const newIssueLine = (): IssueLine => ({ key: crypto.randomUUID(), product_id: '', quantity: 1, order_id: '', comment: '', cross_order_reason: '', scan_id: null });
export function issueTotals(lines: IssueLine[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    if (!line.product_id || !Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error('Mahsulot va musbat miqdor talab qilinadi');
    totals.set(line.product_id, (totals.get(line.product_id) ?? 0) + line.quantity);
  }
  if (!lines.length) throw new Error('Mahsulotlar ro‘yxati bo‘sh');
  return totals;
}