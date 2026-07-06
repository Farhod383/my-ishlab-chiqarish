import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { StatusBadge, PriorityBadge, HealthDot } from "@/components/StatusBadge";
import { orderHealth, type OrderRow } from "@/types/erp";
import { ClipboardList, Activity, AlertTriangle, AlertOctagon, Package, History, Clock, CheckCircle2, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n, useLocalize } from "@/i18n/context";
import { fmtNum } from "@/lib/format";
import { sortOrdersByStatusAndDate, recalcOrdersBatch } from "@/lib/orderStatus";
import { matchesAcrossScripts } from "@/lib/translit";
import { useInfiniteList } from "@/hooks/useInfiniteList";

type FilterKey = "all" | "active" | "delayed" | "today" | "exception" | "completed";

interface DashStats {
  total: number; active: number; delayed: number; today: number; exception: number; completed: number;
}



export default function Dashboard() {
  const { t } = useI18n();
  const localize = useLocalize();
  const nav = useNavigate();
  const [stats, setStats] = useState<DashStats>({ total: 0, active: 0, delayed: 0, today: 0, exception: 0, completed: 0 });
  const [orders, setOrders] = useState<(OrderRow & { client?: any; order_stages?: any[] })[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [recentLog, setRecentLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: orderRows }, { data: products }, { data: log }] = await Promise.all([
        supabase
          .from("orders")
          .select("*, client:clients(name), order_stages(stage_order, started_at, status)")
          .order("priority", { ascending: false })
          .order("queue_position"),
        supabase.from("products").select("*"),
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(8),
      ]);
      const all = (orderRows as any[]) ?? [];
      setOrders(all);
      setStats({
        total: all.length,
        active: all.filter((o) => o.status === "in_progress" || o.status === "pending").length,
        delayed: all.filter((o) => o.status === "delayed" || (o.status !== "completed" && o.deadline < today)).length,
        today: all.filter((o) => o.deadline === today && o.status !== "completed").length,
        exception: all.filter((o) => o.priority === "exception" && o.status !== "completed").length,
        completed: all.filter((o) => o.status === "completed").length,
      });
      setLowStock((products ?? []).filter((p) => Number(p.stock_qty) <= Number(p.min_limit)));
      setRecentLog(log ?? []);
      setLoading(false);
    })();
  }, []);

  

  const today = new Date().toISOString().slice(0, 10);

  const filteredRaw = useMemo(() => orders.filter((o) => {
    if (filter === "active") { if (!(o.status === "in_progress" || o.status === "pending")) return false; }
    else if (filter === "delayed") { if (!(o.status === "delayed" || (o.status !== "completed" && o.deadline < today))) return false; }
    else if (filter === "today") { if (!(o.deadline === today && o.status !== "completed")) return false; }
    else if (filter === "exception") { if (!(o.priority === "exception" && o.status !== "completed")) return false; }
    else if (filter === "completed") { if (o.status !== "completed") return false; }
    if (!q) return true;
    const hay = [o.order_number, o.product_name, (o as any).client?.name].filter(Boolean).join(" ");
    return matchesAcrossScripts(hay, q);
  }), [orders, filter, q, today]);
  const filtered = filter === "all" ? sortOrdersByStatusAndDate(filteredRaw) : filteredRaw;

  const { visible: pageRows, sentinelRef, hasMore } = useInfiniteList(filtered, 50);

  const cards: { key: FilterKey | "lowstock"; label: string; value: number; icon: any; accent: string; to?: string }[] = [
    { key: "all",       label: t.dashboard.totalOrders,     value: stats.total,     icon: ClipboardList, accent: "text-primary bg-primary/10" },
    { key: "active",    label: t.dashboard.activeOrders,    value: stats.active,    icon: Activity,      accent: "text-status-blue bg-status-blue/10" },
    { key: "delayed",   label: t.dashboard.delayed,         value: stats.delayed,   icon: AlertTriangle, accent: "text-status-red bg-status-red/10" },
    { key: "today",     label: t.dashboard.todayDeadline,   value: stats.today,     icon: Clock,         accent: "text-status-yellow bg-status-yellow/15" },
    { key: "exception", label: t.dashboard.exception,       value: stats.exception, icon: AlertOctagon,  accent: "text-status-red bg-status-red/10" },
    { key: "completed", label: t.dashboard.completedOrders, value: stats.completed, icon: CheckCircle2,  accent: "text-status-green bg-status-green/10" },
    { key: "lowstock",  label: t.dashboard.lowStock,        value: lowStock.length, icon: AlertTriangle, accent: "text-status-red bg-status-red/10", to: "/low-stock" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.dashboard.title}</h1>
        <p className="text-sm text-muted-foreground">{t.dashboard.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map((c) => (
          <Link
            key={c.key}
            to={c.to ?? `/orders?filter=${c.key}`}
            className="block transition-transform hover:-translate-y-0.5"
          >
            <Card className="hover:border-primary/40 hover:shadow-md transition cursor-pointer h-full">
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
          </Link>
        ))}
      </div>

      <div className="w-full">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" /> {t.dashboard.allOrders}</CardTitle>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 w-56" placeholder={t.common.search} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)} className="mt-2">
              <TabsList>
                <TabsTrigger value="all">{t.orders.tabs.all}</TabsTrigger>
                <TabsTrigger value="active">{t.orders.tabs.active}</TabsTrigger>
                <TabsTrigger value="delayed">{t.orders.tabs.delayed}</TabsTrigger>
                <TabsTrigger value="today">{t.dashboard.todayDeadline}</TabsTrigger>
                <TabsTrigger value="exception">{t.orders.tabs.exception}</TabsTrigger>
                <TabsTrigger value="completed">{t.orders.tabs.completed}</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-right">№</TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>{t.orders.cols.number}</TableHead>
                    <TableHead>{t.orders.cols.product}</TableHead>
                    <TableHead>{t.orders.cols.client}</TableHead>
                    <TableHead>{t.orders.cols.status}</TableHead>
                    <TableHead>{t.orders.cols.priority}</TableHead>
                    <TableHead>{t.orders.cols.started}</TableHead>
                    <TableHead>{t.orders.cols.deadline}</TableHead>
                    <TableHead>{t.orders.cols.left}</TableHead>
                    <TableHead className="w-[120px]">{t.dashboard.progress}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>}
                  {!loading && pageRows.map((o, idx) => {
                    const stages = ((o as any).order_stages ?? []).slice().sort((a:any,b:any)=>a.stage_order-b.stage_order);
                    const startedAt = stages[0]?.started_at;
                    const startStr = startedAt ? new Date(startedAt).toISOString().slice(0,10) : "—";
                    const totalSt = stages.length || 0;
                    const doneSt = stages.filter((s:any)=> s.status === "completed").length;
                    const progress = o.status === "completed" ? 100 : totalSt ? Math.round((doneSt / totalSt) * 100) : 0;
                    const today0 = new Date(); today0.setHours(0,0,0,0);
                    const dl = new Date(o.deadline); dl.setHours(0,0,0,0);
                    const diffDays = Math.ceil((dl.getTime() - today0.getTime()) / 86400000);
                    const isDone = o.status === "completed";
                    return (
                      <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => nav(`/orders/${o.id}`)}>
                        <TableCell className="text-right text-xs font-mono text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell><HealthDot color={orderHealth(o as any)} /></TableCell>
                        <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
                        <TableCell className="text-sm font-medium">{localize(o.product_name)}</TableCell>
                        <TableCell className="text-sm">{localize((o as any).client?.name) || "—"}</TableCell>
                        <TableCell><StatusBadge status={o.status as any} /></TableCell>
                        <TableCell><PriorityBadge priority={o.priority} /></TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{startStr}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{o.deadline}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {isDone ? <span className="text-status-green font-medium">{t.orders.finished}</span>
                            : diffDays < 0 ? <span className="text-status-red font-semibold">{Math.abs(diffDays)} {t.orders.daysLate}</span>
                            : diffDays === 0 ? <span className="text-status-yellow font-semibold">{t.common.today}</span>
                            : <span className={diffDays <= 2 ? "text-status-yellow font-semibold" : "text-status-green font-medium"}>{diffDays} {t.orders.daysLeft}</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={progress} className="h-1.5 w-16" />
                            <span className="text-xs font-mono text-muted-foreground">{progress}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!loading && pageRows.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">{t.dashboard.noOrders}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>

            <div ref={sentinelRef} className="h-6" />
            {hasMore && (
              <div className="text-center text-xs text-muted-foreground py-2">Yuklanmoqda…</div>
            )}
            {filtered.length > 0 && (
              <div className="text-right text-xs text-muted-foreground mt-2">
                {pageRows.length} / {filtered.length}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> {t.dashboard.recentActivity}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentLog.map((l) => (
            <div key={l.id} className="text-xs border-l-2 border-primary/30 pl-2 py-1">
              <div className="font-medium">{localize(l.action)}</div>
              <div className="text-muted-foreground truncate">{localize(l.details)}</div>
              <div className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString()}</div>
            </div>
          ))}
          {recentLog.length === 0 && <p className="text-sm text-muted-foreground">{t.common.noRecords}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
