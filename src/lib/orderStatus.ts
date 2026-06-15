import { supabase } from "@/integrations/supabase/client";

const STATUS_RANK: Record<string, number> = {
  in_progress: 1,
  pending: 2,
  delayed: 4,
  completed: 5,
  cancelled: 6,
};

function isEffectiveOtk(order: any): boolean {
  if (order.status !== "in_progress") return false;
  const stages = order.order_stages ?? order.stages ?? [];
  if (!stages.length) return false;
  const allCompleted = stages.every((s: any) => s.status === "completed");
  const hasPendingQC = stages.some((s: any) => s.qc_required && !s.qc_passed);
  return allCompleted && hasPendingQC;
}

function orderStartDate(order: any): string | null {
  const stages = (order.order_stages ?? order.stages ?? []).slice().sort((a: any, b: any) => a.stage_order - b.stage_order);
  return stages[0]?.started_at ?? null;
}

export function orderStatusRank(order: any): number {
  if (isEffectiveOtk(order)) return 3;
  return STATUS_RANK[order.status] ?? 0;
}

export function sortOrdersByStatusAndDate(orders: any[]): any[] {
  return [...orders].sort((a, b) => {
    const rankA = orderStatusRank(a);
    const rankB = orderStatusRank(b);
    if (rankA !== rankB) return rankA - rankB;
    const startA = orderStartDate(a);
    const startB = orderStartDate(b);
    if (startA && startB) return startB.localeCompare(startA);
    if (startA) return -1;
    if (startB) return 1;
    return 0;
  });
}

/**
 * Check if all stages of an order are completed (and OTK-approved where required).
 * If so and order.status !== 'completed', auto-update.
 * Returns true if status was changed.
 */
export async function recalcOrderStatus(orderId: string, currentStatus?: string): Promise<boolean> {
  const { data: stages } = await supabase
    .from("order_stages")
    .select("status, qc_required, qc_passed")
    .eq("order_id", orderId);
  if (!stages || stages.length === 0) return false;
  const allDone = stages.every(
    (s: any) => s.status === "completed" && (!s.qc_required || s.qc_passed === true)
  );
  if (!allDone) return false;
  if (currentStatus === "completed") return false;
  const { error } = await supabase
    .from("orders")
    .update({ status: "completed" })
    .eq("id", orderId)
    .neq("status", "completed");
  return !error;
}

/**
 * Recalculate status for many orders. Each order row should include
 * order_stages: { status, qc_required, qc_passed }[] and id + status.
 * Returns set of order ids that were updated to completed.
 */
export async function recalcOrdersBatch(
  orders: Array<{ id: string; status?: string; order_stages?: any[] }>
): Promise<Set<string>> {
  const toComplete: string[] = [];
  for (const o of orders) {
    const stages = o.order_stages ?? [];
    if (!stages.length) continue;
    if (o.status === "completed") continue;
    const allDone = stages.every(
      (s: any) => s.status === "completed" && (!s.qc_required || s.qc_passed === true)
    );
    if (allDone) toComplete.push(o.id);
  }
  if (toComplete.length === 0) return new Set();
  await supabase.from("orders").update({ status: "completed" }).in("id", toComplete);
  return new Set(toComplete);
}
