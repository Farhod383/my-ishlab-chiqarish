import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { useI18n, useLocalize } from "@/i18n/context";
import { sortOrdersByStatusAndDate } from "@/lib/orderStatus";
import { ClipboardList, Search } from "lucide-react";
import { searchNorm } from "@/lib/translit";

type Filter = "all" | "in_progress" | "pending" | "delayed";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Barchasi" },
  { key: "in_progress", label: "Jarayonda" },
  { key: "pending", label: "Kutmoqda" },
  { key: "delayed", label: "Kechikkan" },
];

export default function NachalnikPage() {
  const { t } = useI18n();
  const localize = useLocalize();
  const nav = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("orders")
      .select("*, client:clients(name), stages:order_stages(*)")
      .neq("status", "completed")
      .neq("status", "cancelled")
      .order("queue_position");
    const raw = ((data as any) ?? []).map((o: any) => ({
      ...o,
      stages: (o.stages ?? []).sort((a: any, b: any) => a.stage_order - b.stage_order),
    }));
    setOrders(sortOrdersByStatusAndDate(raw));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Realtime: any stage change (Admin or Nachalnik) refreshes the panel.
  useEffect(() => {
    const ch = supabase
      .channel("nachalnik-stages")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_stages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const currentStage = (o: any) =>
    o.stages?.find((s: any) => s.status === "in_progress")
    ?? o.stages?.find((s: any) => s.status === "delayed")
    ?? o.stages?.find((s: any) => s.status === "pending")
    ?? o.stages?.[o.stages.length - 1];

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length, in_progress: 0, pending: 0, delayed: 0 };
    orders.forEach((o) => { if (c[o.status] !== undefined) c[o.status]++; });
    return c;
  }, [orders]);

  const visible = useMemo(() => orders.filter((o) => {
    if (filter !== "all" && o.status !== filter) return false;
    if (!q) return true;
    const hay = `${o.product_name} ${o.order_number} ${o.client?.name ?? ""} ${currentStage(o)?.name ?? ""}`;
    return searchNorm(hay).includes(searchNorm(q));
  }), [orders, filter, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{(t as any).nachalnik?.title ?? "Nachalnik paneli"}</h1>
        <p className="text-sm text-muted-foreground">{(t as any).nachalnik?.subtitle ?? "Bosqichlarga ishchi tayinlash, muddat belgilash va smena topshirish"}</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key}>
                {f.label} <span className="ml-1.5 text-xs opacity-70">{counts[f.key] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={t.common.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {loading && <p className="text-muted-foreground">{t.common.loading}</p>}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-right">№</TableHead>
                <TableHead>Zakaz</TableHead>
                <TableHead>Mijoz</TableHead>
                <TableHead>Joriy bosqich</TableHead>
                <TableHead>Ishchi</TableHead>
                <TableHead>Muddat</TableHead>
                <TableHead>Holat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((o, idx) => {
                const st = currentStage(o);
                return (
                  <TableRow
                    key={o.id}
                    onClick={() => nav(`/orders/${o.id}`)}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell className="text-right text-xs font-mono text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="font-semibold">{o.product_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">#{o.order_number} · {o.quantity} {t.common.pieces}</div>
                    </TableCell>
                    <TableCell className="text-sm">{o.client?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {st ? <>#{st.stage_order} {st.name}</> : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {st?.worker_name
                        ? String(st.worker_name).split(",").map((n: string) => localize(n.trim())).join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono whitespace-nowrap">{o.deadline}</TableCell>
                    <TableCell>
                      <div
                        className="flex items-center gap-1.5"
                        onClick={(e) => { e.stopPropagation(); setFilter(o.status as Filter); }}
                        role="button"
                        title="Shu holatdagilarni ko'rish"
                      >
                        <PriorityBadge priority={o.priority} />
                        <StatusBadge status={o.status as any} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <ClipboardList className="h-8 w-8 opacity-40" />
                      {(t as any).nachalnik?.empty ?? "Faol zakazlar yo'q"}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
