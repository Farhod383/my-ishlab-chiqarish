import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrderUnreadBadge } from "@/components/OrderUnreadBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, PriorityBadge, HealthDot } from "@/components/StatusBadge";
import { orderHealth, type OrderRow } from "@/types/erp";
import { useAuth } from "@/auth/AuthContext";
import { useI18n, useLocalize } from "@/i18n/context";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { matchesAcrossScripts } from "@/lib/translit";
import { recalcOrdersBatch, sortOrdersByStatusAndDate } from "@/lib/orderStatus";

type FilterKey = "all" | "active" | "exception" | "delayed" | "completed" | "today";

export default function Orders() {
  const { hasRole } = useAuth();
  const { t } = useI18n();
  const localize = useLocalize();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<(OrderRow & { client?: any })[]>([]);
  const initial = (params.get("filter") as FilterKey) || "all";
  const [filter, setFilter] = useState<FilterKey>(initial);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const f = (params.get("filter") as FilterKey) || "all";
    setFilter(f);
  }, [params]);

  const onFilterChange = (v: string) => {
    setFilter(v as FilterKey);
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("filter"); else next.set("filter", v);
    setParams(next, { replace: true });
  };


  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, client:clients(name, client_type), order_stages(stage_order, started_at, status, qc_required, qc_passed), order_parts(part_name)")
        .order("priority", { ascending: false })
        .order("queue_position");
      const list = (data as any[]) ?? [];
      // Auto-fix any orders whose stages are all completed (with OTK where required) but status != completed.
      const fixed = await recalcOrdersBatch(list);
      if (fixed.size > 0) {
        for (const r of list) if (fixed.has(r.id)) r.status = "completed";
      }
      setRows(list as any);
      setLoading(false);
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const filteredRaw = rows.filter((o) => {
    if (q) {
      const parts = ((o as any).order_parts ?? []).map((p: any) => p.part_name).join(" ");
      const hay = [o.order_number, o.product_name, (o as any).client?.name, parts].filter(Boolean).join(" ");
      if (!matchesAcrossScripts(hay, q)) return false;
    }

    if (filter === "active") return o.status === "in_progress" || o.status === "pending";
    if (filter === "exception") return o.priority === "exception" && o.status !== "completed";
    if (filter === "delayed") return o.status === "delayed" || (o.status !== "completed" && o.deadline < today);
    if (filter === "today") return o.deadline === today && o.status !== "completed";
    if (filter === "completed") return o.status === "completed";
    return true;
  });
  const filtered = filter === "all" ? sortOrdersByStatusAndDate(filteredRaw) : filteredRaw;


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.orders.title}</h1>
          <p className="text-sm text-muted-foreground">{t.orders.subtitle}</p>
        </div>
        {hasRole(["marketing", "admin"]) && (
          <Button asChild><Link to="/orders/new"><Plus className="h-4 w-4 mr-2" />{t.orders.new}</Link></Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Tabs value={filter} onValueChange={onFilterChange}>
              <TabsList>
                <TabsTrigger value="all">{t.orders.tabs.all}</TabsTrigger>
                <TabsTrigger value="active">{t.orders.tabs.active}</TabsTrigger>
                <TabsTrigger value="today">{t.dashboard.todayDeadline}</TabsTrigger>
                <TabsTrigger value="exception">{t.orders.tabs.exception}</TabsTrigger>
                <TabsTrigger value="delayed">{t.orders.tabs.delayed}</TabsTrigger>
                <TabsTrigger value="completed">{t.orders.tabs.completed}</TabsTrigger>
              </TabsList>
            </Tabs>
            <PartSearchBox rows={rows} value={q} onChange={setQ} placeholder={t.common.search} />
          </div>
        </CardHeader>

        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">№</TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>{t.orders.cols.number}</TableHead>
                  <TableHead>{t.orders.cols.client}</TableHead>
                  <TableHead>{t.orders.cols.product}</TableHead>
                  <TableHead className="text-right">{t.orders.cols.qty}</TableHead>
                  <TableHead>{t.orders.cols.priority}</TableHead>
                  <TableHead>{t.orders.cols.status}</TableHead>
                  <TableHead>{t.orders.cols.received}</TableHead>
                  <TableHead>{t.orders.cols.started}</TableHead>
                  <TableHead>{t.orders.cols.deadline}</TableHead>
                  <TableHead>{t.orders.cols.left}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>}
                {!loading && filtered.map((o, idx) => {
                  const today0 = new Date(); today0.setHours(0,0,0,0);
                  const dl = new Date(o.deadline); dl.setHours(0,0,0,0);
                  const diffDays = Math.ceil((dl.getTime() - today0.getTime()) / 86400000);
                  const isDone = o.status === "completed";
                  const stages = ((o as any).order_stages ?? []).slice().sort((a:any,b:any)=>a.stage_order-b.stage_order);
                  const startedAt = stages[0]?.started_at;
                  const startStr = startedAt ? new Date(startedAt).toISOString().slice(0,10) : "—";
                  return (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => nav(`/orders/${o.id}`)}>
                      <TableCell className="text-right text-xs font-mono text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell><HealthDot color={orderHealth(o)} /></TableCell>
                      <TableCell className="font-mono text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          {o.order_number}
                          <OrderUnreadBadge orderId={o.id} />
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {localize((o as any).client?.name) || "—"}
                        {(o as any).client && (
                          <span className={`ml-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] ${((o as any).client.client_type ?? "Mijoz") === "Diler" ? "border-status-blue/30 bg-status-blue/10 text-status-blue" : "border-primary/30 bg-primary/10 text-primary"}`}>{(o as any).client.client_type || "Mijoz"}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        <div>{localize(o.product_name)}</div>
                        {(o as any).comment && <div className="text-xs text-muted-foreground italic truncate max-w-[180px]">"{localize((o as any).comment)}"</div>}
                      </TableCell>
                      <TableCell className="text-right text-sm">{o.quantity}</TableCell>
                      <TableCell><PriorityBadge priority={o.priority} /></TableCell>
                      <TableCell><StatusBadge status={o.status as any} /></TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{o.order_date}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{startStr}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{o.deadline}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {isDone ? <span className="text-status-green font-medium">{t.orders.finished}</span>
                          : diffDays < 0 ? <span className="text-status-red font-semibold">{Math.abs(diffDays)} {t.orders.daysLate}</span>
                          : diffDays === 0 ? <span className="text-status-yellow font-semibold">{t.common.today}</span>
                          : <span className={diffDays <= 2 ? "text-status-yellow font-semibold" : "text-status-green font-medium"}>{diffDays} {t.orders.daysLeft}</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">{t.orders.none}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PartSearchBox({ rows, value, onChange, placeholder }: {
  rows: any[]; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const allParts = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(o => {
      (o.order_parts ?? []).forEach((p: any) => {
        const n = (p.part_name ?? "").trim();
        if (n) set.add(n);
      });
      if (o.product_name) set.add(String(o.product_name).trim());
    });
    return Array.from(set);
  }, [rows]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = value.trim().toLowerCase();
  const suggestions = q
    ? allParts.filter(n => matchesAcrossScripts(n, q)).slice(0, 8)
    : [];

  return (
    <div ref={ref} className="relative">
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
      <Input
        className="pl-8 w-72"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-64 overflow-auto">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

