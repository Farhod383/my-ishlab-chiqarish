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
  const [savingStatus, setSavingStatus] = useState<Record<string, boolean>>({});

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
  const ALL_ORDERS_KEY = "__all_orders__";

  const requesterName = (uid?: string | null) => {
    if (!uid) return "—";
    const p = profiles[uid];
    return p?.full_name || p?.email || "—";
  };

  const sortByStatus = (a: any, b: any) => {
    const sa = normalizeStatus(a.status) === "pending" ? 0 : 1;
    const sb = normalizeStatus(b.status) === "pending" ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return (a.required_date ?? "").localeCompare(b.required_date ?? "");
  };

  const matchesQuery = (r: any) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return (
      (r.product_name ?? "").toLowerCase().includes(t) ||
      (r.order?.order_number ?? "").toLowerCase().includes(t) ||
      (r.order?.product_name ?? "").toLowerCase().includes(t) ||
      (r.comment ?? "").toLowerCase().includes(t) ||
      (r.supply_comment ?? "").toLowerCase().includes(t) ||
      requesterName(r.created_by).toLowerCase().includes(t)
    );
  };

  const groups = useMemo(() => {
    const filtered = rows.filter(matchesQuery).filter((r) => filter === "all" || normalizeStatus(r.status) === filter);

    const general: any[] = [];
    const allOrders: any[] = [];
    const perOrder = new Map<string, { order: any; items: any[] }>();

    filtered.forEach((r) => {
      if (!r.order?.id) {
        general.push(r);
      } else {
        allOrders.push(r);
        const k = r.order.id;
        if (!perOrder.has(k)) perOrder.set(k, { order: r.order, items: [] });
        perOrder.get(k)!.items.push(r);
      }
    });

    const mk = (key: string, order: any, items: any[], pinned: boolean) => {
      const counts: Record<Status, number> = { pending: 0, fulfilled: 0 };
      items.forEach((r) => counts[normalizeStatus(r.status)]++);
      items.sort(sortByStatus);
      return { key, order, items, counts, worst: counts.pending > 0 ? "pending" as Status : "fulfilled" as Status, pinned };
    };

    const result: ReturnType<typeof mk>[] = [];
    result.push(mk(GENERAL_KEY, { id: GENERAL_KEY, order_number: "📌", product_name: "Zavod uchun umumiy" }, general, true));
    result.push(mk(ALL_ORDERS_KEY, { id: ALL_ORDERS_KEY, order_number: "📌", product_name: "Zakazlar uchun umumiy" }, allOrders, true));

    const ordered = Array.from(perOrder.values()).sort((a, b) => (b.order.order_number ?? "").localeCompare(a.order.order_number ?? ""));
    ordered.forEach((g) => result.push(mk(g.order.id, g.order, g.items, false)));

    return result;
  }, [rows, q, filter, profiles]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = { pending: 0, fulfilled: 0 };
    rows.forEach((r) => { c[normalizeStatus(r.status)]++; });
    return c;
  }, [rows]);

  const visible = groups;

  const saveComment = async (item: any) => {
    const e = edit[item.id];
    const { error } = await supabase
      .from("order_supply_requests")
      .update({ supply_comment: e.supply_comment || null })
      .eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Izoh saqlandi");
    load();
  };

  const markStatus = async (item: any, status: Status) => {
    const current = normalizeStatus(item.status);
    if (current === status || savingStatus[item.id]) return;

    setSavingStatus((prev) => ({ ...prev, [item.id]: true }));
    const patch: any = { status };
    if (status === "fulfilled") patch.fulfilled_at = new Date().toISOString();

    const { error } = await supabase.from("order_supply_requests").update(patch).eq("id", item.id);
    setSavingStatus((prev) => ({ ...prev, [item.id]: false }));

    if (error) { toast.error(error.message); return; }

    setRows((prev) => prev.map((r) => r.id === item.id ? { ...r, ...patch } : r));
    setEdit((prev) => ({
      ...prev,
      [item.id]: { ...(prev[item.id] ?? { supply_comment: item.supply_comment ?? "", dirty: false }), status, dirty: false },
    }));
    toast.success(status === "fulfilled" ? "Ta'minlandi — omborga kirim qilindi" : "Kutilmoqda holatiga qaytarildi");
    load();
  };

  const openedOrder = openOrderId ? groups.find((o) => o.key === openOrderId) : null;
  const isGeneralOpen = openedOrder?.key === GENERAL_KEY;
  const isAllOrdersOpen = openedOrder?.key === ALL_ORDERS_KEY;
  const hideOrderNumber = isGeneralOpen || isAllOrdersOpen;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-2.5">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><Truck className="h-5 w-5" /> Ta'minot — Kerakli mahsulotlar</h1>
        <p className="text-xs text-muted-foreground">Ta'minot so'rovlari ro'yxati</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["pending", "fulfilled"] as const).map((s) => (
          <Card key={s} className={`cursor-pointer ${filter === s ? "ring-2 ring-primary" : ""}`} onClick={() => setFilter(filter === s ? "all" : s)}>
            <CardContent className="p-2 flex items-center justify-between">
              <div>
                <div className={`text-[10px] uppercase tracking-wide font-semibold ${s === "pending" ? "text-status-red" : "text-status-green"}`}>
                  {statusLabel[s]}
                </div>
                <div className="text-lg font-bold leading-none">{counts[s]} <span className="text-[10px] text-muted-foreground font-normal">ta so'rov</span></div>
              </div>
              <div className={`h-5 w-5 rounded-full ${dotCls[s]}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {!openedOrder && (
        <Card>
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <TabsList className="h-8">
                  <TabsTrigger className="h-7 text-xs" value="all">Hammasi</TabsTrigger>
                  <TabsTrigger className="h-7 text-xs" value="pending">🔴 Kutilmoqda</TabsTrigger>
                  <TabsTrigger className="h-7 text-xs" value="fulfilled">🟢 Ta'minlandi</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-7 h-8 w-56 text-xs" placeholder="Qidiruv..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 px-3 pb-3">
            {visible.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">So'rovlar mavjud emas</p>}
            {visible.map((o) => (
              <Card
                key={o.key}
                className={`cursor-pointer hover:bg-muted/30 border-l-4 ${o.pinned ? "bg-primary/5 border-primary/40" : ""}`}
                style={{ borderLeftColor: o.pinned ? "hsl(var(--primary))" : (o.worst === "pending" ? "hsl(var(--status-red))" : "hsl(var(--status-green))") }}
                onClick={() => setOpenOrderId(o.key)}
              >
                <CardContent className="p-1.5 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {o.pinned ? <span className="text-xs">📌</span> : <span className={`h-2 w-2 rounded-full shrink-0 ${dotCls[o.worst]}`} />}
                    <div className="min-w-0">
                      {!o.pinned && <div className="font-mono font-semibold text-primary text-[11px] leading-tight">{o.order.order_number}</div>}
                      <div className={`text-xs truncate leading-tight ${o.pinned ? "font-semibold" : "font-medium"}`}>{o.order.product_name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    {o.counts.pending > 0 && <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${statusCls.pending}`}>🔴 {o.counts.pending}</Badge>}
                    {o.counts.fulfilled > 0 && <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${statusCls.fulfilled}`}>🟢 {o.counts.fulfilled}</Badge>}
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
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpenOrderId(null)}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Ro'yxatga qaytish
              </Button>
              {hideOrderNumber ? (
                <span className="text-xs text-muted-foreground font-medium">📌 {openedOrder.order.product_name}</span>
              ) : (
                <Link to={`/orders/${openedOrder.order.id}`} className="text-xs text-primary hover:underline flex items-center gap-1 font-mono">
                  {openedOrder.order.order_number} · {openedOrder.order.product_name} <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 px-3 pb-3">
            {openedOrder.items.map((item: any) => {
              const e = edit[item.id] ?? { status: normalizeStatus(item.status), supply_comment: "", dirty: false };
              const color = normalizeStatus(item.status);
              const isExpanded = !!expanded[item.id];
              return (
                <Card key={item.id} className="border-l-4" style={{ borderLeftColor: color === "pending" ? "hsl(var(--status-red))" : "hsl(var(--status-green))" }}>
                  <CardContent className="p-1.5 space-y-1">
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs truncate leading-tight">{item.product_name}</div>
                          <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-1.5 leading-tight">
                            <span className="font-mono">{item.quantity} {item.unit ?? ""}</span>
                            {item.required_date && <span>· {item.required_date}</span>}
                            <span>· {requesterName(item.created_by)}</span>
                            {item.department && <span className="uppercase">· {item.department}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {canEdit ? (
                          (["pending", "fulfilled"] as Status[]).map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              className="h-6 px-1.5 text-[11px]"
                              variant={color === s ? "default" : "outline"}
                              disabled={!!savingStatus[item.id]}
                              onClick={() => markStatus(item, s)}
                            >
                              {savingStatus[item.id] && color !== s ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : s === "fulfilled" && <Check className="h-3 w-3 mr-1" />}
                              {statusLabel[s]}
                            </Button>
                          ))
                        ) : (
                          <div className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-semibold ${statusCls[color]}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${dotCls[color]}`} />
                            {statusLabel[color]}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1.5 text-[10px] text-muted-foreground"
                        onClick={() => setExpanded({ ...expanded, [item.id]: !isExpanded })}
                      >
                        <MessageSquare className="h-3 w-3 mr-1" /> {isExpanded ? "Yopish" : "Izoh / Batafsil"}
                      </Button>
                      {!isExpanded && item.supply_comment && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-sm">Ta'minot: {item.supply_comment}</span>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="space-y-1">
                        {item.comment && (
                          <div className="text-[10px] text-muted-foreground border-l-2 border-primary/40 pl-1.5 italic">
                            So'rov izohi: {item.comment}
                          </div>
                        )}
                        {canEdit ? (
                          <div className="flex items-center gap-1.5">
                            <Textarea
                              rows={1}
                              className="min-h-7 text-xs flex-1 py-1"
                              placeholder="Ta'minot izohi..."
                              value={e.supply_comment}
                              onChange={(ev) => setEdit({ ...edit, [item.id]: { ...e, supply_comment: ev.target.value, dirty: true } })}
                            />
                            {e.dirty && (
                              <Button size="sm" className="h-7 px-2 text-xs" onClick={() => saveComment(item)}>
                                <Save className="h-3 w-3 mr-1" /> Saqlash
                              </Button>
                            )}
                          </div>
                        ) : item.supply_comment ? (
                          <div className="text-[10px] text-muted-foreground">Ta'minot: {item.supply_comment}</div>
                        ) : null}
                      </div>
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
