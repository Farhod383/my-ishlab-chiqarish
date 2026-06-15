import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileBarChart, Search, ExternalLink, Download } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { sortOrdersByStatusAndDate } from "@/lib/orderStatus";

type Filter = "all" | "completed" | "in_progress" | "delayed";

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
      const { data } = await supabase
        .from("orders")
        .select("*, client:clients(name), order_stages(stage_order, status, worker_name, started_at, finished_at, qc_required, qc_passed)")
        .order("created_at", { ascending: false });
      setOrders(data ?? []);
    })();
  }, []);

  const filteredRaw = useMemo(() => orders.filter((o) => {
    if (filter !== "all" && o.status !== filter) return false;
    if (q && !`${o.order_number} ${o.product_name} ${o.client?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (from && new Date(o.order_date) < new Date(from)) return false;
    if (to && new Date(o.order_date) > new Date(to)) return false;
    return true;
  }), [orders, filter, q, from, to]);
  const filtered = filter === "all" ? sortOrdersByStatusAndDate(filteredRaw) : filteredRaw;

  const totals = useMemo(() => ({
    total: orders.length,
    completed: orders.filter(o => o.status === "completed").length,
    in_progress: orders.filter(o => o.status === "in_progress").length,
    delayed: orders.filter(o => o.status === "delayed").length,
  }), [orders]);

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
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{r.total}</div><div className="text-2xl font-bold mt-1">{totals.total}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{r.completed}</div><div className="text-2xl font-bold mt-1 text-status-green">{totals.completed}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{r.inProgress}</div><div className="text-2xl font-bold mt-1 text-status-blue">{totals.in_progress}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{r.delayed}</div><div className="text-2xl font-bold mt-1 text-status-red">{totals.delayed}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                <TabsTrigger value="all">{t.common.all}</TabsTrigger>
                <TabsTrigger value="in_progress">{r.inProgress}</TabsTrigger>
                <TabsTrigger value="completed">{r.completed}</TabsTrigger>
                <TabsTrigger value="delayed">{r.delayed}</TabsTrigger>
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
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
                      <TableCell className="text-sm">{o.product_name}</TableCell>
                      <TableCell className="text-sm">{o.client?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{done}/{stages.length}</TableCell>
                      <TableCell><Badge variant={o.status === "completed" ? "default" : o.status === "delayed" ? "destructive" : "secondary"}>{(t.status as any)[o.status] ?? o.status}</Badge></TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{o.order_date}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{o.deadline}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDur(firstStart, lastFin)}</TableCell>
                      <TableCell className="whitespace-nowrap">
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
