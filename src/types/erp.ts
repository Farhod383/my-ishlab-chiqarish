import type { Database } from "@/integrations/supabase/types";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type OrderPriority = Database["public"]["Enums"]["order_priority"];
export type StageStatus = Database["public"]["Enums"]["stage_status"];
export type AppRole = Database["public"]["Enums"]["app_role"];
export type MovementDirection = Database["public"]["Enums"]["movement_direction"];

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type StageRow = Database["public"]["Tables"]["order_stages"]["Row"];
export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
export type OrderPartRow = Database["public"]["Tables"]["order_parts"]["Row"];
export type StockMovementRow = Database["public"]["Tables"]["stock_movements"]["Row"];
export type AuditLogRow = Database["public"]["Tables"]["audit_log"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type StageTemplateRow = Database["public"]["Tables"]["stage_templates"]["Row"];
export type TemplateStageRow = Database["public"]["Tables"]["template_stages"]["Row"];

// Compute health color based on deadline & status
export type HealthColor = "green" | "yellow" | "red";

export function orderHealth(o: { status: OrderStatus; deadline: string }): HealthColor {
  if (o.status === "completed") return "green";
  if (o.status === "delayed") return "red";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dl = new Date(o.deadline); dl.setHours(0, 0, 0, 0);
  const diff = Math.ceil((dl.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "red";
  if (diff <= 2) return "yellow";
  return "green";
}

export function logAudit(supabase: any, params: {
  actor_id?: string | null;
  actor_name?: string | null;
  action: string;
  entity?: string;
  order_id?: string | null;
  stage_id?: string | null;
  details?: string;
}) {
  return supabase.from("audit_log").insert({
    actor_id: params.actor_id ?? null,
    actor_name: params.actor_name ?? null,
    action: params.action,
    entity: params.entity ?? null,
    order_id: params.order_id ?? null,
    stage_id: params.stage_id ?? null,
    details: params.details ?? null,
  });
}
