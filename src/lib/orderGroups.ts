export type OrderGroup = "KDM" | "KMU" | "SEL";

export const ORDER_GROUPS: { key: OrderGroup; label: string }[] = [
  { key: "KDM", label: "KDM" },
  { key: "KMU", label: "KMU" },
  { key: "SEL", label: "Sel'nometalika" },
];

/** Sort a SEL list: Jarayonda first, then Kutilmoqda, then Tugallangan; numeric suffix descending inside each status group. Source rows are not changed. */
export function sortSelOrdersDescending<T extends { order_number: string; status?: string }>(orders: readonly T[]): T[] {
  const numberOf = (order: T) => {
    const match = /^SEL(\d+)$/i.exec(order.order_number);
    return match ? Number(match[1]) : -1;
  };
  const statusRank = (order: T) => {
    switch (order.status) {
      case "in_progress": return 0;
      case "pending": return 1;
      case "completed": return 3;
      default: return 2;
    }
  };
  return [...orders].sort((a, b) => statusRank(a) - statusRank(b) || numberOf(b) - numberOf(a));
}

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

export type OrderPrefix = "KIS" | "ASM" | "ATZ" | "PRO" | "IZO" | "MUS" | "KDM" | "KMU" | "MIK" | "PARM" | "SEL";
/** Mirrors DB public.order_prefix(): used for new-number preview only; DB assigns the real number. */
export function orderPrefixOf(productName: string | null | undefined): OrderPrefix {
  const n = clean(productName ?? "");
  if (/selnometal|сельнометал/.test(n)) return "SEL";
  if (/parm|парм/.test(n)) return "PARM";
  if (/(^|[^\p{L}\p{N}])(kis|кис)([^\p{L}\p{N}]|$)|kislotovoz|кислотовоз/u.test(n)) return "KIS";
  if (/(^|[^\p{L}\p{N}])(asm|асм)([^\p{L}\p{N}]|$)|assenizator|asseniz|ассениз/u.test(n)) return "ASM";
  if (/(^|[^\p{L}\p{N}])(atz|атз)([^\p{L}\p{N}]|$)|avtotopliv|автотоплив/u.test(n)) return "ATZ";
  if (/(^|[^\p{L}\p{N}])(pro|про)([^\p{L}\p{N}]|$)|promtovar|промтовар/u.test(n)) return "PRO";
  if (/(^|[^\p{L}\p{N}])(izo|изо)([^\p{L}\p{N}]|$)|izoterm|изотерм/u.test(n)) return "IZO";
  if (/(^|[^\p{L}\p{N}])(mus|мус)([^\p{L}\p{N}]|$)|musravoz|musorovoz|мусоровоз/u.test(n)) return "MUS";
  if (/mikser|miksir|миксер/.test(n)) return "MIK";
  if (/kmu|кму|kran[\s-]*manipul|кран[\s-]*манипул/.test(n)) return "KMU";
  return "KDM";
}

export function orderNumberSearchText(order: {
  order_number: string;
  legacy_order_number?: string | null;
  order_number_history?: { old_number: string; new_number: string }[];
}): string {
  return [order.order_number, order.legacy_order_number,
    ...(order.order_number_history ?? []).flatMap(h => [h.old_number, h.new_number])]
    .filter(Boolean).join(" ");
}
