import { useEffect, useMemo, useState } from "react";
import { uzAction, uzText, uzField, uzLabel } from "@/lib/uzLabels";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileBarChart, Search, ExternalLink, ClipboardList, CircleCheck, Clock, TriangleAlert } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { sortOrdersByStatusAndDate } from "@/lib/orderStatus";
import { fmtDate } from "@/lib/format";
import { matchesReportStatus, matchesReportSearch, reportDay, type OrderReportFilter } from "@/lib/orderReportFilters";

type Filter = OrderReportFilter;

export default function ReportsPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    (async () => {
      const allOrders: any[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("orders")
          .select("*, client:clients(name), order_stages(stage_order, status, worker_name, started_at, finished_at, qc_required, qc_passed)")
          .order("created_at", { ascending: false }).order("id")
          .range(offset, offset + 999);
        if (error) return;
        allOrders.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      setOrders(allOrders);
    })();
  }, []);

  const today = reportDay();

  // search + date filters applied first (tab counts respect them)
  const base = useMemo(() => orders.filter((o) => matchesReportSearch(o, q, from, to)), [orders, q, from, to]);

  const filteredRaw = useMemo(() => base.filter((o) => matchesReportStatus(o, filter, today)), [base, filter, today]);
  const filtered = useMemo(
    () => (filter === "all" ? sortOrdersByStatusAndDate(filteredRaw) : filteredRaw),
    [filteredRaw, filter]
  );

  const totals = useMemo(() => ({
    total: base.length,
    completed: base.filter(o => matchesReportStatus(o, "completed", today)).length,
    in_progress: base.filter(o => matchesReportStatus(o, "in_progress", today)).length,
    delayed: base.filter(o => matchesReportStatus(o, "delayed", today)).length,
  }), [base, today]);


  const fmtDur = (start?: string | null, end?: string | null) => {
    if (!start || !end) return "—";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}s ${m}d`;
  };

  const r = (t as any).reports ?? {};
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileBarChart className="h-6 w-6 text-primary" /> {r.title}</h1>
        <p className="text-sm text-muted-foreground">{r.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { value: "all", label: r.total, count: totals.total, icon: ClipboardList, tone: "total" },
          { value: "completed", label: r.completed, count: totals.completed, icon: CircleCheck, tone: "completed" },
          { value: "in_progress", label: r.inProgress, count: totals.in_progress, icon: Clock, tone: "progress" },
          { value: "delayed", label: r.delayed, count: totals.delayed, icon: TriangleAlert, tone: "delayed" },
        ] as const).map(({ value, label, count, icon: Icon, tone }) => (
          <Button key={value} variant="outline" aria-pressed={filter === value} onClick={() => setFilter(value)}
            data-tone={tone} className="order-report-stat h-auto min-h-28 w-full justify-between whitespace-normal rounded-lg p-4 text-left">
            <span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="mt-2 block text-3xl font-bold tabular-nums">{count}</span></span>
            <Icon className="!h-6 !w-6" aria-hidden="true" />
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t.common.all} ({totals.total})</TabsTrigger>
                <TabsTrigger value="in_progress" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{r.inProgress} ({totals.in_progress})</TabsTrigger>
                <TabsTrigger value="completed" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{r.completed} ({totals.completed})</TabsTrigger>
                <TabsTrigger value="delayed" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{r.delayed} ({totals.delayed})</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 w-56" placeholder={t.common.search} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{r.number}</TableHead>
                  <TableHead>{r.product}</TableHead>
                  <TableHead>{r.client}</TableHead>
                  <TableHead>{r.stages}</TableHead>
                  <TableHead>{r.state}</TableHead>
                  <TableHead>{r.received}</TableHead>
                  <TableHead>{r.deadline}</TableHead>
                  <TableHead>{r.duration}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => {
                  const stages = (o.order_stages ?? []).slice().sort((a:any,b:any)=>a.stage_order-b.stage_order);
                  const done = stages.filter((s:any) => s.status === "completed").length;
                  const firstStart = stages.find((s:any) => s.started_at)?.started_at;
                  const lastFin = stages.filter((s:any) => s.finished_at).slice(-1)[0]?.finished_at;
                  return (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => nav(`/orders/${o.id}/report`)}>
                      <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
                      <TableCell className="text-sm">{o.product_name}</TableCell>
                      <TableCell className="text-sm">{o.client?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{done}/{stages.length}</TableCell>
                      <TableCell><Badge variant={o.status === "completed" ? "default" : o.status === "delayed" ? "destructive" : "secondary"}>{(t.status as any)[o.status] ?? uzLabel(o.status)}</Badge></TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(o.order_date)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(o.deadline)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDur(firstStart, lastFin)}</TableCell>
                      <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Button asChild size="sm" variant="ghost"><Link to={`/orders/${o.id}/report`}><ExternalLink className="h-3 w-3 mr-1" />{r.open}</Link></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">{t.common.noRecords}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
