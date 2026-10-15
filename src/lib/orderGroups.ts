export type OrderGroup = "KDM" | "KMU" | "SEL";

export const ORDER_GROUPS: { key: OrderGroup; label: string }[] = [
  { key: "KDM", label: "KDM" },
  { key: "KMU", label: "KMU" },
  { key: "SEL", label: "Sel'nometalika" },
];

const clean = (s: string) => String(s ?? "").replace(/[’'ʼ`]/g, "").toLowerCase();

/** Display-only grouping by product name; every order falls into exactly one group. */
export function orderGroupOf(productName: string | null | undefined): OrderGroup {
  const n = clean(productName ?? "");
  if (/selnometal|сельнометал/.test(n)) return "SEL";
  if (/kmu|кму|kran[\s-]*manipul|кран[\s-]*манипул/.test(n)) return "KMU";
  return "KDM";
}

/** Unique label per order so names never repeat and no order is skipped. */
export function orderPdfLabel(o: { order_number: string; product_name: string }): string {
  return `${o.order_number} — ${String(o.product_name ?? "").trim()}`;
}
