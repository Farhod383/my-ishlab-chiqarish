import { supabase } from "@/integrations/supabase/client";

export type OrderTemplate = {
  id: string;
  name: string;
  product_name: string;
  default_quantity: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TemplateStage = {
  id?: string;
  template_id?: string;
  stage_order: number;
  name: string;
  norm_days: number;
  qc_required: boolean;
};

export type TemplatePart = {
  id?: string;
  template_id?: string;
  product_id: string | null;
  part_name: string;
  unit: string;
  qty_per_unit: number;
};

export async function listTemplates() {
  const { data, error } = await supabase
    .from("order_templates" as any)
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as OrderTemplate[];
}

export async function loadTemplate(id: string) {
  const [tpl, stages, parts] = await Promise.all([
    supabase.from("order_templates" as any).select("*").eq("id", id).maybeSingle(),
    supabase.from("order_template_stages" as any).select("*").eq("template_id", id).order("stage_order"),
    supabase.from("order_template_parts" as any).select("*").eq("template_id", id),
  ]);
  return {
    template: (tpl.data as any) as OrderTemplate | null,
    stages: ((stages.data as any) ?? []) as TemplateStage[],
    parts: ((parts.data as any) ?? []) as TemplatePart[],
  };
}

/** Snapshot an existing order's stages + parts into a new reusable template. */
export async function saveOrderAsTemplate(orderId: string, name: string, userId: string | undefined) {
  const { data: order, error: oErr } = await supabase
    .from("orders").select("product_name, quantity").eq("id", orderId).maybeSingle();
  if (oErr || !order) throw oErr ?? new Error("Order topilmadi");

  const [{ data: stages }, { data: parts }] = await Promise.all([
    supabase.from("order_stages").select("name, stage_order, norm_days, qc_required").eq("order_id", orderId).order("stage_order"),
    supabase.from("order_parts").select("product_id, part_name, unit, norm_qty").eq("order_id", orderId),
  ]);

  const { data: tpl, error: tErr } = await (supabase.from as any)("order_templates")
    .insert({
      name: name.trim(),
      product_name: order.product_name,
      default_quantity: order.quantity ?? 1,
      created_by: userId ?? null,
    })
    .select().single();
  if (tErr) throw tErr;

  const qty = Number(order.quantity || 1) || 1;
  if (stages && stages.length) {
    await (supabase.from as any)("order_template_stages").insert(
      stages.map((s: any, i: number) => ({
        template_id: tpl.id,
        stage_order: s.stage_order ?? i + 1,
        name: s.name,
        norm_days: s.norm_days ?? 1,
        qc_required: !!s.qc_required,
      })),
    );
  }
  if (parts && parts.length) {
    await (supabase.from as any)("order_template_parts").insert(
      parts.map((p: any) => ({
        template_id: tpl.id,
        product_id: p.product_id,
        part_name: p.part_name ?? "",
        unit: p.unit ?? "dona",
        // store per-unit quantity (independent of the source order's quantity)
        qty_per_unit: qty > 0 ? Number(p.norm_qty || 0) / qty : Number(p.norm_qty || 0),
      })),
    );
  }
  return tpl.id as string;
}

export async function deleteTemplate(id: string) {
  const { error } = await (supabase.from as any)("order_templates").delete().eq("id", id);
  if (error) throw error;
}
