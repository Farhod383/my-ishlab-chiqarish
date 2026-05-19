import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, PriorityBadge, HealthDot } from "@/components/StatusBadge";
import { orderHealth, type OrderRow } from "@/types/erp";
import { ClipboardList, Activity, AlertTriangle, AlertOctagon, Package, History, Clock, Receipt } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderCostReport } from "@/components/OrderCostReport";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { fmtNum } from "@/lib/format";

interface DashStats {
  total: number; active: number; delayed: number; today: number; exception: number;
}

export default function Dashboard() {
  const { t } = useI18n();
  const [stats, setStats] = useState<DashStats>({ total: 0, active: 0, delayed: 0, today: 0, exception: 0 });
  const [recent, setRecent] = useState<OrderRow[]>([]);
  const [completed, setCompleted] = useState<OrderRow[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [recentLog, setRecentLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportFor, setReportFor] = useState<{ id: string; number: string } | null>(null);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: orders }, { data: products }, { data: log }] = await Promise.all([
        supabase.from("orders").select("*").order("queue_position"),
        supabase.from("products").select("*"),
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(8),
      ]);
      const all = orders ?? [];
      setStats({
        total: all.length,
        active: all.filter((o) => o.status === "in_progress" || o.status === "pending").length,
        delayed: all.filter((o) => o.status === "delayed" || (o.status !== "completed" && o.deadline < today)).length,
        today: all.filter((o) => o.deadline === today && o.status !== "completed").length,
        exception: all.filter((o) => o.priority === "exception" && o.status !== "completed").length,
      });
      setRecent(all.filter(o => o.status !== "completed").slice(0, 6));
      setCompleted(all.filter(o => o.status === "completed").slice(0, 6));
      setLowStock((products ?? []).filter((p) => Number(p.stock_qty) <= Number(p.min_limit)));
      setRecentLog(log ?? []);
      setLoading(false);
    })();
  }, []);

  const cards = [
    { label: t.dashboard.totalOrders, value: stats.total, icon: ClipboardList, accent: "text-primary bg-primary/10" },
    { label: t.dashboard.activeOrders, value: stats.active, icon: Activity, accent: "text-status-blue bg-status-blue/10" },
    { label: t.dashboard.delayed, value: stats.delayed, icon: AlertTriangle, accent: "text-status-red bg-status-red/10" },
    { label: t.dashboard.todayDeadline, value: stats.today, icon: Clock, accent: "text-status-yellow bg-status-yellow/15" },
    { label: t.dashboard.exception, value: stats.exception, icon: AlertOctagon, accent: "text-status-red bg-status-red/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.dashboard.title}</h1>
        <p className="text-sm text-muted-foreground">{t.dashboard.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</div>
                  <div className="text-2xl font-bold mt-1">{loading ? <Skeleton className="h-7 w-10" /> : c.value}</div>
                </div>
                <div className={`p-2 rounded-md ${c.accent}`}><c.icon className="h-4 w-4" /></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" /> {t.dashboard.recentOrders}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />) :
              recent.map((o) => (
                <Link to={`/orders/${o.id}`} key={o.id} className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <HealthDot color={orderHealth(o)} />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{o.order_number} · {o.product_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{t.dashboard.deadline}: {o.deadline}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <PriorityBadge priority={o.priority} />
                    <StatusBadge status={o.status as any} />
                  </div>
                </Link>
              ))}
            {!loading && recent.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">{t.dashboard.noOrders}</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-status-green" /> {t.dashboard.completedOrdersHint}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {completed.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t.dashboard.noCompleted}</p>}
            {completed.map((o) => (
              <button key={o.id} onClick={() => setReportFor({ id: o.id, number: o.order_number })} className="w-full flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <HealthDot color="green" />
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{o.order_number} · {o.product_name}</div>
                    <div className="text-xs text-muted-foreground">{t.dashboard.finished} · {o.deadline}</div>
                  </div>
                </div>
                <Button size="sm" variant="ghost"><Receipt className="h-3.5 w-3.5 mr-1" />{t.common.report}</Button>
              </button>
            ))}
            {reportFor && <OrderCostReport orderId={reportFor.id} orderNumber={reportFor.number} open={!!reportFor} onOpenChange={(o) => !o && setReportFor(null)} />}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-status-red" /> {t.dashboard.lowStock}</CardTitle>
              <CardDescription className="text-xs">{t.dashboard.lowStockHint}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {lowStock.length === 0 && <p className="text-sm text-muted-foreground">{t.dashboard.enough} ✓</p>}
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm p-2 rounded border border-status-red/30 bg-status-red/5">
                  <span className="truncate pr-2">{p.name}</span>
                  <span className="font-mono text-status-red shrink-0">{p.stock_qty} / {p.min_limit} {p.unit}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> {t.dashboard.recentActivity}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentLog.map((l) => (
                <div key={l.id} className="text-xs border-l-2 border-primary/30 pl-2 py-1">
                  <div className="font-medium">{l.action}</div>
                  <div className="text-muted-foreground truncate">{l.details}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString()}</div>
                </div>
              ))}
              {recentLog.length === 0 && <p className="text-sm text-muted-foreground">{t.common.noRecords}</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
