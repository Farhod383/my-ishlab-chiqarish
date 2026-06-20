import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, Search, ExternalLink, ChevronLeft, Save, Loader2, Package } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { toast } from "sonner";

type Status = "pending" | "in_progress" | "fulfilled";
type Filter = "all" | Status;

const statusLabel: Record<Status, string> = {
  pending: "Kutilmoqda",
  in_progress: "Jarayonda",
  fulfilled: "Ta'minlandi",
};
const statusCls: Record<Status, string> = {
  pending: "text-status-red border-status-red/30 bg-status-red/10",
  in_progress: "text-status-yellow border-status-yellow/30 bg-status-yellow/10",
  fulfilled: "text-status-green border-status-green/30 bg-status-green/10",
};
const dotCls: Record<Status, string> = {
  pending: "bg-status-red",
  in_progress: "bg-status-yellow",
  fulfilled: "bg-status-green",
};

export default function SupplyRequestsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole(["supply", "admin", "warehouse"]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { status: Status; supply_comment: string; dirty: boolean }>>({});

  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; email: string | null }>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("order_supply_requests")
      .select("*, order:orders(id, order_number, product_name, status, deadline)")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
    const map: any = {};
    (data ?? []).forEach((r: any) => {
      map[r.id] = { status: r.status as Status, supply_comment: r.supply_comment ?? "", dirty: false };
    });
    setEdit(map);
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.created_by).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids as string[]);
      const pm: any = {};
      (profs ?? []).forEach((p: any) => { pm[p.id] = { full_name: p.full_name, email: p.email }; });
      setProfiles(pm);
    } else {
      setProfiles({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Realtime updates so additions appear instantly
  useEffect(() => {
    const ch = supabase
      .channel("supply-requests-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_supply_requests" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const GENERAL_KEY = "__general__";

  const orders = useMemo(() => {
    const map = new Map<string, { order: any; key: string; items: any[]; counts: Record<Status, number>; worst: Status }>();
    rows.forEach((r) => {
      const k = r.order?.id ?? GENERAL_KEY;
      if (!map.has(k)) map.set(k, {
        order: r.order ?? { id: GENERAL_KEY, order_number: "—", product_name: "Umumiy so'rovlar (zakazsiz)" },
        key: k,
        items: [], counts: { pending: 0, in_progress: 0, fulfilled: 0 }, worst: "fulfilled",
      });
      const e = map.get(k)!;
      e.items.push(r);
      e.counts[r.status as Status]++;
    });
    map.forEach((e) => {
      if (e.counts.pending > 0) e.worst = "pending";
      else if (e.counts.in_progress > 0) e.worst = "in_progress";
      else e.worst = "fulfilled";
      e.items.sort((a, b) => (a.required_date ?? "").localeCompare(b.required_date ?? ""));
    });
    return Array.from(map.values());
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { pending: 0, in_progress: 0, fulfilled: 0 };
    rows.forEach((r) => { c[r.status as Status]++; });
    return c;
  }, [rows]);

  const visible = orders.filter((o) => {
    if (filter !== "all" && o.worst !== filter) return false;
    if (q && !(`${o.order.order_number} ${o.order.product_name}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  const save = async (item: any) => {
    const e = edit[item.id];
    const patch: any = { status: e.status, supply_comment: e.supply_comment || null };
    if (e.status === "fulfilled") patch.fulfilled_at = new Date().toISOString();
    const { error } = await supabase.from("order_supply_requests").update(patch).eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saqlandi");
    load();
  };

  const openedOrder = openOrderId ? orders.find((o) => o.order.id === openOrderId) : null;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Truck className="h-6 w-6" /> Ta'minot — Kerakli mahsulotlar</h1>
        <p className="text-sm text-muted-foreground">Nachalnik tomonidan kiritilgan ta'minot so'rovlari</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(["pending", "in_progress", "fulfilled"] as const).map((s) => (
          <Card key={s} className={`cursor-pointer ${filter === s ? "ring-2 ring-primary" : ""}`} onClick={() => setFilter(filter === s ? "all" : s)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className={`text-xs uppercase tracking-wide font-semibold ${s === "pending" ? "text-status-red" : s === "in_progress" ? "text-status-yellow" : "text-status-green"}`}>
                  {statusLabel[s]}
                </div>
                <div className="text-2xl font-bold mt-1 leading-none">{counts[s]} <span className="text-xs text-muted-foreground font-normal">ta so'rov</span></div>
              </div>
              <div className={`h-10 w-10 rounded-full ${dotCls[s]}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {!openedOrder && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <TabsList>
                  <TabsTrigger value="all">Hammasi</TabsTrigger>
                  <TabsTrigger value="pending">🔴 Kutilmoqda</TabsTrigger>
                  <TabsTrigger value="in_progress">🟡 Jarayonda</TabsTrigger>
                  <TabsTrigger value="fulfilled">🟢 Ta'minlandi</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 w-64" placeholder="Qidiruv..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {visible.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">So'rovlar mavjud emas</p>}
            {visible.map((o) => (
              <Card
                key={o.order.id}
                className="cursor-pointer hover:bg-muted/30 border-l-4"
                style={{ borderLeftColor: o.worst === "pending" ? "hsl(var(--status-red))" : o.worst === "in_progress" ? "hsl(var(--status-yellow))" : "hsl(var(--status-green))" }}
                onClick={() => setOpenOrderId(o.order.id)}
              >
                <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`h-3 w-3 rounded-full shrink-0 ${dotCls[o.worst]}`} />
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-primary text-sm">{o.order.order_number}</div>
                      <div className="text-sm font-medium truncate">{o.order.product_name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {o.counts.pending > 0 && <Badge variant="outline" className={statusCls.pending}>🔴 {o.counts.pending}</Badge>}
                    {o.counts.in_progress > 0 && <Badge variant="outline" className={statusCls.in_progress}>🟡 {o.counts.in_progress}</Badge>}
                    {o.counts.fulfilled > 0 && <Badge variant="outline" className={statusCls.fulfilled}>🟢 {o.counts.fulfilled}</Badge>}
                    <span className="text-muted-foreground">{o.items.length} ta mahsulot</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

      {openedOrder && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <Button variant="ghost" size="sm" onClick={() => setOpenOrderId(null)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Ro'yxatga qaytish
              </Button>
              <Link to={`/orders/${openedOrder.order.id}`} className="text-sm text-primary hover:underline flex items-center gap-1 font-mono">
                {openedOrder.order.order_number} · {openedOrder.order.product_name} <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {openedOrder.items.map((item: any) => {
              const e = edit[item.id] ?? { status: item.status as Status, supply_comment: "", dirty: false };
              const color = e.status;
              return (
                <Card key={item.id} className="border-l-4" style={{ borderLeftColor: color === "pending" ? "hsl(var(--status-red))" : color === "in_progress" ? "hsl(var(--status-yellow))" : "hsl(var(--status-green))" }}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        <div>
                          <div className="font-semibold">{item.product_name}</div>
                          <div className="text-xs text-muted-foreground">
                            Miqdor: <span className="font-mono">{item.quantity} {item.unit ?? ""}</span>
                            {item.required_date && <> · Kerak: <span className="font-mono">{item.required_date}</span></>}
                          </div>
                        </div>
                      </div>
                      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusCls[color]}`}>
                        <span className={`h-2 w-2 rounded-full ${dotCls[color]}`} />
                        {statusLabel[color]}
                      </div>
                    </div>
                    {item.comment && (
                      <div className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-2 italic">
                        Nachalnik izohi: {item.comment}
                      </div>
                    )}
                    {canEdit ? (
                      <>
                        <div className="flex gap-2 flex-wrap">
                          {(["pending", "in_progress", "fulfilled"] as Status[]).map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              variant={e.status === s ? "default" : "outline"}
                              onClick={() => setEdit({ ...edit, [item.id]: { ...e, status: s, dirty: true } })}
                            >
                              {statusLabel[s]}
                            </Button>
                          ))}
                        </div>
                        <Textarea
                          rows={2}
                          placeholder="Ta'minot izohi..."
                          value={e.supply_comment}
                          onChange={(ev) => setEdit({ ...edit, [item.id]: { ...e, supply_comment: ev.target.value, dirty: true } })}
                        />
                        <Button size="sm" disabled={!e.dirty} onClick={() => save(item)}>
                          <Save className="h-3.5 w-3.5 mr-1" /> Saqlash
                        </Button>
                      </>
                    ) : (
                      item.supply_comment && (
                        <div className="text-xs text-muted-foreground">Ta'minot izohi: {item.supply_comment}</div>
                      )
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
