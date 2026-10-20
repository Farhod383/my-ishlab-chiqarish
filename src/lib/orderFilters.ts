import { orderGroupOf, type OrderGroup } from "@/lib/orderGroups";
import { matchesAcrossScripts } from "@/lib/translit";

export interface OrderFilters {
  number: string;
  product: string;
  client: string;
  group: OrderGroup | "ALL";
  status: "all" | "pending" | "in_progress" | "completed" | "delayed";
  stage: string;
  worker: string;
  priority: "all" | "normal" | "exception";
  orderFrom: string; orderTo: string;
  startFrom: string; startTo: string;
  deadlineFrom: string; deadlineTo: string;
  finishFrom: string; finishTo: string;
  progressMin: string; progressMax: string;
  stock: "all" | "low" | "ok";
}

export const EMPTY_FILTERS: OrderFilters = {
  number: "", product: "", client: "", group: "ALL", status: "all", stage: "", worker: "", priority: "all",
  orderFrom: "", orderTo: "", startFrom: "", startTo: "", deadlineFrom: "", deadlineTo: "",
  finishFrom: "", finishTo: "", progressMin: "", progressMax: "", stock: "all",
};

export const activeFilterCount = (f: OrderFilters) =>
  (Object.keys(EMPTY_FILTERS) as (keyof OrderFilters)[]).filter((k) => f[k] !== EMPTY_FILTERS[k]).length;

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("sv-SE") : null);

export function isDelayed(o: any, today: string) {
  return o.status === "delayed" || (o.status !== "completed" && o.deadline < today);
}

/** Effective status as shown in reports: overdue unfinished orders count as delayed. */
export function effectiveStatus(o: any, today: string) {
  if (o.status === "completed") return "completed";
  if (isDelayed(o, today)) return "delayed";
  return o.status;
}

export function orderStart(o: any): string | null {
  const st = (o.order_stages ?? []).slice().sort((a: any, b: any) => a.stage_order - b.stage_order);
  return st[0]?.started_at ?? null;
}

export function orderFinish(o: any): string | null {
  if (o.status !== "completed") return null;
  const f = (o.order_stages ?? []).map((s: any) => s.finished_at).filter(Boolean).sort();
  return f.length ? f[f.length - 1] : null;
}

export function orderProgress(o: any): number | null {
  const st = o.order_stages ?? [];
  if (!st.length) return null;
  return Math.round((st.filter((s: any) => s.status === "completed").length / st.length) * 100);
}

const inRange = (d: string | null, from: string, to: string) => {
  if (!from && !to) return true;
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};

export function matchOrderFilters(o: any, f: OrderFilters, today: string, lowStockIds: Set<string>) {
  if (f.number && !String(o.order_number ?? "").toLowerCase().includes(f.number.trim().toLowerCase())) return false;
  if (f.product && !matchesAcrossScripts(String(o.product_name ?? ""), f.product)) return false;
  if (f.client && !matchesAcrossScripts(String(o.client?.name ?? ""), f.client)) return false;
  if (f.group !== "ALL" && orderGroupOf(o.product_name) !== f.group) return false;
  if (f.status !== "all" && effectiveStatus(o, today) !== f.status) return false;
  const stages = o.order_stages ?? [];
  if (f.stage && !stages.some((s: any) => s.name === f.stage)) return false;
  if (f.worker && !stages.some((s: any) => s.worker_name === f.worker)) return false;
  if (f.priority !== "all" && o.priority !== f.priority) return false;
  if (!inRange(o.order_date ?? null, f.orderFrom, f.orderTo)) return false;
  if (!inRange(day(orderStart(o)), f.startFrom, f.startTo)) return false;
  if (!inRange(o.deadline ?? null, f.deadlineFrom, f.deadlineTo)) return false;
  if (!inRange(day(orderFinish(o)), f.finishFrom, f.finishTo)) return false;
  if (f.progressMin !== "" || f.progressMax !== "") {
    const p = orderProgress(o);
    if (p === null) return false;
    if (f.progressMin !== "" && p < Number(f.progressMin)) return false;
    if (f.progressMax !== "" && p > Number(f.progressMax)) return false;
  }
  if (f.stock !== "all") {
    const low = (o.order_parts ?? []).some((p: any) => p.product_id && lowStockIds.has(p.product_id));
    if (f.stock === "low" ? !low : low) return false;
  }
  return true;
}
