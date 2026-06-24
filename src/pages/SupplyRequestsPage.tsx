import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, Search, ExternalLink, ChevronLeft, Save, Loader2, Package, MessageSquare, Check } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { toast } from "sonner";

type Status = "pending" | "fulfilled";
type Filter = "all" | Status;

const statusLabel: Record<Status, string> = {
  pending: "Kutilmoqda",
  fulfilled: "Ta'minlandi",
};
const statusCls: Record<Status, string> = {
  pending: "text-status-red border-status-red/30 bg-status-red/10",
  fulfilled: "text-status-green border-status-green/30 bg-status-green/10",
};
const dotCls: Record<Status, string> = {
  pending: "bg-status-red",
  fulfilled: "bg-status-green",
};

const normalizeStatus = (s: string): Status => (s === "fulfilled" ? "fulfilled" : "pending");

export default function SupplyRequestsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole(["supply", "admin", "warehouse"]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { status: Status; supply_comment: string; dirty: boolean }>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
      map[r.id] = { status: normalizeStatus(r.status), supply_comment: r.supply_comment ?? "", dirty: false };
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
        items: [], counts: { pending: 0, fulfilled: 0 }, worst: "fulfilled",
      });
      const e = map.get(k)!;
      e.items.push(r);
      e.counts[normalizeStatus(r.status)]++;
    });
    map.forEach((e) => {
      e.worst = e.counts.pending > 0 ? "pending" : "fulfilled";
      e.items.sort((a, b) => (a.required_date ?? "").localeCompare(b.required_date ?? ""));
    });
    return Array.from(map.values());
  }, [rows]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { pending: 0, fulfilled: 0 };
    rows.forEach((r) => { c[normalizeStatus(r.status)]++; });
    return c;
  }, [rows]);

  const visible = orders.filter((o) => {
    if (filter !== "all" && o.worst !== filter) return false;
    if (q && !(`${o.order.order_number ?? ""} ${o.order.product_name ?? ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  const save = async (item: any) => {
    const e = edit[item.id];
    const patch: any = { status: e.status, supply_comment: e.supply_comment || null };
    if (e.status === "fulfilled") patch.fulfilled_at = new Date().toISOString();
    const { error } = await supabase.from("order_supply_requests").update(patch).eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success(e.status === "fulfilled" ? "Ta'minlandi — omborga kirim qilindi" : "Saqlandi");
    load();
  };

  const requesterName = (uid?: string | null) => {
    if (!uid) return "—";
    const p = profiles[uid];
    return p?.full_name || p?.email || "—";
  };

  const openedOrder = openOrderId ? orders.find((o) => o.key === openOrderId) : null;
  const isGeneralOpen = openedOrder?.key === GENERAL_KEY;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Truck className="h-6 w-6" /> Ta'minot — Kerakli mahsulotlar</h1>
        <p className="text-sm text-muted-foreground">Ta'minot so'rovlari ro'yxati</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(["pending", "fulfilled"] as const).map((s) => (
          <Card key={s} className={`cursor-pointer ${filter === s ? "ring-2 ring-primary" : ""}`} onClick={() => setFilter(filter === s ? "all" : s)}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <div className={`text-xs uppercase tracking-wide font-semibold ${s === "pending" ? "text-status-red" : "text-status-green"}`}>
                  {statusLabel[s]}
                </div>
                <div className="text-xl font-bold mt-0.5 leading-none">{counts[s]} <span className="text-xs text-muted-foreground font-normal">ta so'rov</span></div>
              </div>
              <div className={`h-8 w-8 rounded-full ${dotCls[s]}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {!openedOrder && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <TabsList>
                  <TabsTrigger value="all">Hammasi</TabsTrigger>
                  <TabsTrigger value="pending">🔴 Kutilmoqda</TabsTrigger>
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
                key={o.key}
                className="cursor-pointer hover:bg-muted/30 border-l-4"
                style={{ borderLeftColor: o.worst === "pending" ? "hsl(var(--status-red))" : "hsl(var(--status-green))" }}
                onClick={() => setOpenOrderId(o.key)}
              >
                <CardContent className="p-2.5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotCls[o.worst]}`} />
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-primary text-xs">{o.order.order_number}</div>
                      <div className="text-sm font-medium truncate">{o.order.product_name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {o.counts.pending > 0 && <Badge variant="outline" className={statusCls.pending}>🔴 {o.counts.pending}</Badge>}
                    {o.counts.fulfilled > 0 && <Badge variant="outline" className={statusCls.fulfilled}>🟢 {o.counts.fulfilled}</Badge>}
                    <span className="text-muted-foreground">{o.items.length} ta</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

      {openedOrder && (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <Button variant="ghost" size="sm" onClick={() => setOpenOrderId(null)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Ro'yxatga qaytish
              </Button>
              {isGeneralOpen ? (
                <span className="text-sm text-muted-foreground font-medium">Umumiy so'rovlar (zakazsiz)</span>
              ) : (
                <Link to={`/orders/${openedOrder.order.id}`} className="text-sm text-primary hover:underline flex items-center gap-1 font-mono">
                  {openedOrder.order.order_number} · {openedOrder.order.product_name} <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {openedOrder.items.map((item: any) => {
              const e = edit[item.id] ?? { status: normalizeStatus(item.status), supply_comment: "", dirty: false };
              const color = e.status;
              const isExpanded = !!expanded[item.id] || !!item.supply_comment || e.supply_comment.length > 0;
              return (
                <Card key={item.id} className="border-l-4" style={{ borderLeftColor: color === "pending" ? "hsl(var(--status-red))" : "hsl(var(--status-green))" }}>
                  <CardContent className="p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Package className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{item.product_name}</div>
                          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                            <span className="font-mono">{item.quantity} {item.unit ?? ""}</span>
                            {item.required_date && <span>· {item.required_date}</span>}
                            <span>· {requesterName(item.created_by)}</span>
                            {item.department && <span className="uppercase">· {item.department}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {canEdit ? (
                          (["pending", "fulfilled"] as Status[]).map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              className="h-7 px-2 text-xs"
                              variant={e.status === s ? "default" : "outline"}
                              onClick={() => setEdit({ ...edit, [item.id]: { ...e, status: s, dirty: true } })}
                            >
                              {s === "fulfilled" && <Check className="h-3 w-3 mr-1" />}
                              {statusLabel[s]}
                            </Button>
                          ))
                        ) : (
                          <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusCls[color]}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${dotCls[color]}`} />
                            {statusLabel[color]}
                          </div>
                        )}
                      </div>
                    </div>
                    {item.comment && (
                      <div className="text-[11px] text-muted-foreground border-l-2 border-primary/40 pl-2 italic">
                        Nachalnik: {item.comment}
                      </div>
                    )}
                    {canEdit && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {!isExpanded && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[11px] text-muted-foreground"
                            onClick={() => setExpanded({ ...expanded, [item.id]: true })}
                          >
                            <MessageSquare className="h-3 w-3 mr-1" /> Izoh
                          </Button>
                        )}
                        {isExpanded && (
                          <Textarea
                            rows={2}
                            className="text-xs flex-1"
                            placeholder="Ta'minot izohi..."
                            value={e.supply_comment}
                            onChange={(ev) => setEdit({ ...edit, [item.id]: { ...e, supply_comment: ev.target.value, dirty: true } })}
                          />
                        )}
                        {e.dirty && (
                          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => save(item)}>
                            <Save className="h-3 w-3 mr-1" /> Saqlash
                          </Button>
                        )}
                      </div>
                    )}
                    {!canEdit && item.supply_comment && (
                      <div className="text-[11px] text-muted-foreground">Ta'minot: {item.supply_comment}</div>
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
