import { supabase } from "@/integrations/supabase/client";

/** One change entry shown in the supply history timeline. */
export interface SupplyHistoryItem {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail?: string | null;
  product?: string | null;
  changes: { label: string; from: string; to: string }[];
}

const FIELD_LABELS: Record<string, string> = {
  quantity: "Miqdor",
  unit: "O'lchov",
  status: "Holat",
  supply_comment: "Ta'minot izohi",
  comment: "Izoh",
  required_date: "Kerak sana",
  product_name: "Mahsulot",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Kutilmoqda",
  fulfilled: "Ta'minlandi",
};

function pretty(field: string, v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (field === "status") return STATUS_LABELS[String(v)] ?? String(v);
  return String(v);
}

/** Record a structured supply change (old → new) into entity_audit. */
export async function logSupplyChange(params: {
  requestId: string;
  orderId?: string | null;
  productName?: string | null;
  action: string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  actorId?: string | null;
  actorName?: string | null;
  role?: string | null;
}) {
  try {
    await supabase.from("entity_audit").insert({
      entity: "supply_request",
      entity_id: params.requestId,
      action: params.action,
      old_value: { ...(params.before ?? {}), order_id: params.orderId ?? null, product_name: params.productName ?? null } as any,
      new_value: { ...(params.after ?? {}), order_id: params.orderId ?? null, product_name: params.productName ?? null } as any,
      actor_id: params.actorId ?? null,
      actor_name: params.actorName ?? null,
      role: params.role ?? null,
    } as any);
  } catch (e) {
    console.warn("logSupplyChange failed", e);
  }
}

/**
 * Full change history of supply requests for one order (or the general,
 * order-less requests when orderId is null). Merges the legacy audit_log
 * entries with the structured entity_audit rows so nothing is lost.
 */
export async function fetchSupplyHistory(orderId: string | null, limit = 100): Promise<SupplyHistoryItem[]> {
  const legacyQuery = supabase
    .from("audit_log")
    .select("id,action,details,actor_name,created_at,order_id")
    .eq("entity", "supply_request")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (orderId) legacyQuery.eq("order_id", orderId);
  else legacyQuery.is("order_id", null);

  const structuredQuery = supabase
    .from("entity_audit")
    .select("id,action,old_value,new_value,actor_name,role,created_at")
    .eq("entity", "supply_request")
    .order("created_at", { ascending: false })
    .limit(limit);

  const [{ data: legacy }, { data: structured }] = await Promise.all([legacyQuery, structuredQuery]);

  const items: SupplyHistoryItem[] = [];

  (legacy ?? []).forEach((r: any) => {
    items.push({
      id: `a-${r.id}`,
      at: r.created_at,
      actor: r.actor_name || "Tizim",
      action: r.action,
      detail: r.details,
      changes: [],
    });
  });

  (structured ?? []).forEach((r: any) => {
    const nv = (r.new_value ?? {}) as Record<string, any>;
    const ov = (r.old_value ?? {}) as Record<string, any>;
    const rowOrder = (nv.order_id ?? ov.order_id ?? null) as string | null;
    if (orderId ? rowOrder !== orderId : rowOrder !== null) return;
    const fields = Array.from(new Set([...Object.keys(ov), ...Object.keys(nv)])).filter(
      (k) => k !== "order_id" && k !== "product_name",
    );
    items.push({
      id: `e-${r.id}`,
      at: r.created_at,
      actor: r.actor_name || "Tizim",
      action: r.action,
      product: nv.product_name ?? ov.product_name ?? null,
      changes: fields
        .filter((f) => String(ov[f] ?? "") !== String(nv[f] ?? ""))
        .map((f) => ({
          label: FIELD_LABELS[f] ?? f,
          from: pretty(f, ov[f]),
          to: pretty(f, nv[f]),
        })),
    });
  });

  return items.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, limit);
}
