import { supabase } from "@/integrations/supabase/client";

/**
 * Every existing order can be used as a template — no separate template records.
 * These helpers expose past orders as "templates" and copy their stages/parts
 * into a new order draft. Source orders remain unchanged.
 */

export type OrderTemplate = {
  id: string;                 // source order id
  name: string;               // display name (order_number — product_name)
  order_number: string;
  product_name: string;
  default_quantity: number;
  created_at: string;
};

export type TemplateStage = {
  stage_order: number;
  name: string;
  norm_days: number;
  qc_required: boolean;
  group_id: string | null;
};

export type TemplatePart = {
  product_id: string | null;
  part_name: string;
  unit: string;
  qty_per_unit: number; // normalised against source order quantity
};

/** Recent orders usable as templates. */
export async function listTemplates(limit = 200): Promise<OrderTemplate[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, product_name, quantity, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((o: any) => ({
    id: o.id,
    name: `${o.order_number} — ${o.product_name}`,
    order_number: o.order_number,
    product_name: o.product_name,
    default_quantity: Number(o.quantity) || 1,
    created_at: o.created_at,
  }));
}

/** Load a source order's stages + parts to copy into a new order. */
export async function loadTemplate(orderId: string) {
  const [o, stages, parts] = await Promise.all([
    supabase.from("orders").select("id, order_number, product_name, quantity, created_at").eq("id", orderId).maybeSingle(),
    supabase.from("order_stages").select("name, stage_order, norm_days, qc_required, group_id").eq("order_id", orderId).order("stage_order"),
    supabase.from("order_parts").select("product_id, part_name, unit, norm_qty").eq("order_id", orderId),
  ]);
  const src = o.data as any;
  const template: OrderTemplate | null = src ? {
    id: src.id,
    name: `${src.order_number} — ${src.product_name}`,
    order_number: src.order_number,
    product_name: src.product_name,
    default_quantity: Number(src.quantity) || 1,
    created_at: src.created_at,
  } : null;
  const srcQty = Number(src?.quantity || 1) || 1;
  const tStages: TemplateStage[] = (stages.data ?? []).map((s: any, i: number) => ({
    stage_order: s.stage_order ?? i + 1,
    name: s.name,
    norm_days: Number(s.norm_days) || 1,
    qc_required: !!s.qc_required,
    group_id: s.group_id ?? null,
  }));
  const tParts: TemplatePart[] = (parts.data ?? []).map((p: any) => ({
    product_id: p.product_id,
    part_name: p.part_name ?? "",
    unit: p.unit ?? "dona",
    qty_per_unit: srcQty > 0 ? Number(p.norm_qty || 0) / srcQty : Number(p.norm_qty || 0),
  }));
  return { template, stages: tStages, parts: tParts };
}
