import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { StatusBadge, PriorityBadge, HealthDot } from "@/components/StatusBadge";
import { orderHealth, logAudit, type OrderRow, type StageRow } from "@/types/erp";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { ArrowUp, GripVertical, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { OrderUnreadBadge } from "@/components/OrderUnreadBadge";
import { fetchStageGroups, groupStages, type StageGroup } from "@/lib/stageGroups";

interface OrderWithStages extends OrderRow { stages: StageRow[]; client?: any }

export default function ProductionBoard() {
  const { hasRole, user } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [orders, setOrders] = useState<OrderWithStages[]>([]);
  const [loading, setLoading] = useState(true);
  const [moveOrder, setMoveOrder] = useState<OrderWithStages | null>(null);
  const [movePos, setMovePos] = useState<string>("1");
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<StageGroup[]>([]);
  const [openGroup, setOpenGroup] = useState<Record<string, boolean>>({});

  const load = async () => {
    const { data } = await supabase
      .from("orders")
      .select("*, client:clients(name), stages:order_stages(*)")
      .neq("status", "completed")
      .neq("status", "cancelled")
      .order("queue_position");
    const sorted = ((data as any) ?? []).map((o: any) => ({
      ...o,
      stages: (o.stages ?? []).sort((a: any, b: any) => a.stage_order - b.stage_order),
    }));
    setOrders(sorted);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { fetchStageGroups().then(setGroups).catch(() => {}); }, []);

  const openMoveDialog = (o: OrderWithStages) => {
    if (!hasRole(["manager", "admin"])) { toast.error(t.production.onlyManager); return; }
    setMoveOrder(o);
    setMovePos("1");
  };

  const confirmMove = async () => {
    if (!moveOrder) return;
    const target = Math.max(1, Math.min(orders.length, Number(movePos) || 1));
    setSaving(true);
    // Build new ordering: remove moveOrder from current list (already sorted by queue_position), insert at target-1
    const rest = orders.filter((x) => x.id !== moveOrder.id);
    const newList = [...rest.slice(0, target - 1), moveOrder, ...rest.slice(target - 1)];
    // Reassign queue_position sequentially
    for (let i = 0; i < newList.length; i++) {
      const desired = i + 1;
      const row = newList[i];
      if ((row.queue_position ?? 0) !== desired) {
        await supabase.from("orders").update({ queue_position: desired }).eq("id", row.id);
      }
    }
    // Mark exception on moved order
    await supabase.from("orders").update({ priority: "exception", exception_approved_by: user?.id }).eq("id", moveOrder.id);
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Istisno tasdiqlandi", entity: "order", order_id: moveOrder.id,
      details: `${moveOrder.order_number} → tartib ${target}`,
    });
    toast.success(`${moveOrder.order_number}: ${target}-o'ringa qo'yildi`);
    setSaving(false);
    setMoveOrder(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.production.title}</h1>
        <p className="text-sm text-muted-foreground">{t.production.subtitle}</p>
      </div>

      {loading && <p className="text-muted-foreground">{t.common.loading}</p>}

      <div className="space-y-3">
        {orders.map((o, idx) => {
          const completed = o.stages.filter((s) => s.status === "completed").length;
          const total = o.stages.length || 1;
          const active = o.stages.find((s) => s.status === "in_progress" || s.status === "delayed") ?? o.stages.find((s) => s.status === "pending");
          return (
            <Card
              key={o.id}
              className={`cursor-pointer transition hover:border-primary/40 hover:shadow-md ${o.priority === "exception" ? "border-status-red/40 bg-status-red/[0.02]" : ""}`}
              onClick={() => nav(`/orders/${o.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <div className="text-2xl font-bold text-muted-foreground w-8 text-center">{idx + 1}</div>
                    <HealthDot color={orderHealth(o)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-lg sm:text-xl font-bold text-foreground leading-tight truncate" title={o.product_name}>
                          {o.product_name}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          <Link
                            to={`/orders/${o.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-mono font-medium text-muted-foreground hover:text-primary hover:underline"
                          >
                            #{o.order_number}
                          </Link>
                          <OrderUnreadBadge orderId={o.id} />
                          <PriorityBadge priority={o.priority} />
                          <StatusBadge status={o.status as any} />
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-md border-2 border-primary/40 bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary shrink-0">
                        {completed} / {total} {t.production.currentStage ? "bosqich" : "stage"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {o.client?.name ?? "—"} · {o.quantity} {t.common.pieces} · {t.dashboard.deadline}: {o.deadline}
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>{t.production.currentStage}: <strong>{active?.name ?? "—"}</strong></span>
                        <span className="text-muted-foreground">{t.production.progress.replace("{a}", String(completed)).replace("{b}", String(total))}</span>
                      </div>
                      <Progress value={(completed / total) * 100} className="h-2" />
                      <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                        {groupStages(o.stages as any, groups).map((g) => {
                          const key = `${o.id}:${g.key}`;
                          const expanded = !!openGroup[key];
                          const gDone = g.items.filter((s: any) => s.status === "completed").length;
                          const gActive = g.items.some((s: any) => s.status === "in_progress");
                          const gLate = g.items.some((s: any) => s.status === "delayed");
                          return (
                            <div key={g.key} className="rounded-md border bg-muted/20">
                              <button
                                type="button"
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/50 rounded-md transition"
                                onClick={() => setOpenGroup((o2) => ({ ...o2, [key]: !expanded }))}
                              >
                                {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                                <span className="text-xs font-bold uppercase tracking-wide truncate">{g.name}</span>
                                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-background px-1 text-[10px] font-bold border">{g.items.length}</span>
                                <span className={`ml-auto text-[11px] font-semibold shrink-0 ${
                                  gLate ? "text-status-red" : gDone === g.items.length ? "text-status-green" : gActive ? "text-status-blue" : "text-muted-foreground"
                                }`}>{gDone}/{g.items.length}</span>
                              </button>
                              {expanded && (
                                <div className="px-2 pb-2 grid sm:grid-cols-2 gap-x-3 gap-y-1">
                                  {g.items.map((s: any) => (
                                    <div key={s.id} className="flex items-center gap-1.5 min-w-0">
                                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                        s.status === "completed" ? "bg-status-green" :
                                        s.status === "in_progress" ? "bg-status-blue" :
                                        s.status === "delayed" ? "bg-status-red" :
                                        "bg-muted-foreground/40"
                                      }`} />
                                      <span className="text-[11px] text-muted-foreground truncate" title={s.name}>{s.name}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {o.priority !== "exception" && hasRole(["manager", "admin"]) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => { e.stopPropagation(); openMoveDialog(o); }}
                      className="shrink-0"
                    >
                      <ArrowUp className="h-3 w-3 mr-1" /> {t.production.moveFront}
                    </Button>
                  )}
                  {o.priority === "exception" && o.exception_approved_by && (
                    <div className="text-xs text-status-red shrink-0 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{t.production.confirmed}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!loading && orders.length === 0 && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">{t.production.noActive}</CardContent></Card>
        )}
      </div>

      <Dialog open={!!moveOrder} onOpenChange={(o) => !o && setMoveOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Istisno — tartibga qo'yish</DialogTitle>
            <DialogDescription>
              {moveOrder && <>#{moveOrder.order_number} — {moveOrder.product_name}</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Qaysi tartib raqamiga o'tkazilsin? (1–{orders.length})</Label>
              <Input
                type="number"
                min={1}
                max={orders.length}
                value={movePos}
                onChange={(e) => setMovePos(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Tanlangan tartibga qo'yiladi, qolganlar avtomatik qayta tartiblanadi.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMoveOrder(null)} disabled={saving}>
                {t.common.cancel ?? "Bekor qilish"}
              </Button>
              <Button onClick={confirmMove} disabled={saving}>
                {saving ? "Saqlanmoqda..." : "Tasdiqlash"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
