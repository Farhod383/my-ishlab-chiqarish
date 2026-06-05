import { supabase } from "@/integrations/supabase/client";

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
