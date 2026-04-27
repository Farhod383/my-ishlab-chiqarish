import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge, HealthDot } from "@/components/StatusBadge";
import { orderHealth, logAudit, type OrderRow, type StageRow } from "@/types/erp";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { ArrowUp, GripVertical, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface OrderWithStages extends OrderRow { stages: StageRow[]; client?: any }

export default function ProductionBoard() {
  const { hasRole, user } = useAuth();
  const { t } = useI18n();
  const [orders, setOrders] = useState<OrderWithStages[]>([]);
  const [loading, setLoading] = useState(true);

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

  const moveToFront = async (o: OrderWithStages) => {
    if (!hasRole(["manager", "admin"])) { toast.error(t.production.onlyManager); return; }
    for (const x of orders) {
      if (x.id === o.id) continue;
      await supabase.from("orders").update({ queue_position: (x.queue_position ?? 0) + 1 }).eq("id", x.id);
    }
    await supabase.from("orders").update({ queue_position: 1, priority: "exception", exception_approved_by: user?.id }).eq("id", o.id);
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Istisno tasdiqlandi", entity: "order", order_id: o.id,
      details: `${o.order_number}`,
    });
    toast.success(t.production.movedFront);
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
        {orders.map((o) => {
          const completed = o.stages.filter((s) => s.status === "completed").length;
          const total = o.stages.length || 1;
          const active = o.stages.find((s) => s.status === "in_progress" || s.status === "delayed") ?? o.stages.find((s) => s.status === "pending");
          return (
            <Card key={o.id} className={o.priority === "exception" ? "border-status-red/40 bg-status-red/[0.02]" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <div className="text-2xl font-bold text-muted-foreground w-8 text-center">{o.queue_position}</div>
                    <HealthDot color={orderHealth(o)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/orders/${o.id}`} className="font-semibold hover:underline">{o.order_number}</Link>
                      <span className="text-sm text-muted-foreground">· {o.product_name}</span>
                      <PriorityBadge priority={o.priority} />
                      <StatusBadge status={o.status as any} />
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
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {o.stages.map((s) => (
                          <div key={s.id} title={s.name} className={`h-1.5 flex-1 min-w-[20px] rounded-full ${
                            s.status === "completed" ? "bg-status-green" :
                            s.status === "in_progress" ? "bg-status-blue" :
                            s.status === "delayed" ? "bg-status-red" :
                            "bg-muted"
                          }`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  {o.priority !== "exception" && hasRole(["manager", "admin"]) && (
                    <Button size="sm" variant="outline" onClick={() => moveToFront(o)} className="shrink-0">
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
    </div>
  );
}
