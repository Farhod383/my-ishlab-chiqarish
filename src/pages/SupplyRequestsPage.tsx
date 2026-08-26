import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Truck, Search, ExternalLink, ChevronLeft, Save, Loader2, Package, MessageSquare, Check, AlertTriangle, CalendarDays } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { toast } from "sonner";
import { logAudit } from "@/types/erp";
import { notify } from "@/lib/notify";
import {
  type SupplyStatus as Status,
  normalizeSupplyStatus,
  supplyStatusLabel as statusLabel,
  supplyStatusCls as statusCls,
  supplyStatusDotCls as dotCls,
  supplyStatusActiveBtnCls as activeBtnCls,
  supplyStatusOutlineBtnCls as outlineBtnCls,
} from "@/lib/supplyStatus";

type Filter = "all" | Status;

const normalizeStatus = normalizeSupplyStatus;

export default function SupplyRequestsPage() {
  const { hasRole, user } = useAuth();
  const canEdit = hasRole(["supply", "admin", "warehouse"]);
  const isAdmin = hasRole(["admin"]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { status: Status; supply_comment: string; dirty: boolean }>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [savingStatus, setSavingStatus] = useState<Record<string, boolean>>({});

  const [lateItem, setLateItem] = useState<any | null>(null);
  const [lateReason, setLateReason] = useState("");

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
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Ta'minot izohi saqlandi", entity: "supply_request",
      order_id: item.order_id ?? null,
      details: `${item.product_name}: ${e.supply_comment || "—"}`,
    });
    toast.success("Izoh saqlandi");
    load();
  };

  const isLate = (item: any) => {
    if (!item?.required_date) return false;
    const req = new Date(item.required_date + "T23:59:59");
    return new Date() > req;
  };

  const applyStatus = async (item: any, status: Status, late_reason?: string | null) => {
    setSavingStatus((prev) => ({ ...prev, [item.id]: true }));
    const patch: any = { status };
    if (status === "fulfilled") {
      patch.fulfilled_at = new Date().toISOString();
      if (late_reason !== undefined) patch.late_reason = late_reason;
    } else {
      patch.late_reason = null;
    }

    const { error } = await supabase.from("order_supply_requests").update(patch).eq("id", item.id);
    setSavingStatus((prev) => ({ ...prev, [item.id]: false }));
    if (error) { toast.error(error.message); return false; }

    setRows((prev) => prev.map((r) => r.id === item.id ? { ...r, ...patch } : r));
    setEdit((prev) => ({
      ...prev,
      [item.id]: { ...(prev[item.id] ?? { supply_comment: item.supply_comment ?? "", dirty: false }), status, dirty: false },
    }));
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: status === "fulfilled" ? "Ta'minot bajarildi" : "Ta'minot kutilmoqdaga qaytarildi",
      entity: "supply_request",
      order_id: item.order_id ?? null,
      details: `${item.product_name} · ${item.quantity} ${item.unit ?? ""}${late_reason ? ` · Kechikish sababi: ${late_reason}` : ""}`,
    });
    await notify({
      type: status === "fulfilled" ? "supply_fulfilled" : "supply_request",
      title: status === "fulfilled" ? `Ta'minlandi — ${item.product_name}` : `Ta'minot qayta ochildi — ${item.product_name}`,
      body: `${item.quantity} ${item.unit ?? ""}${item.order?.order_number ? ` · ${item.order.order_number}` : ""}`,
      link: "/supply",
      entity: "supply_request",
      entity_id: item.id,
      recipient_role: ["warehouse", "manager", "supply"],
      sender_id: user?.id,
      sender_name: user?.email,
    });
    if (item.created_by && item.created_by !== user?.id) {
      await notify({
        type: status === "fulfilled" ? "supply_fulfilled" : "supply_request",
        title: status === "fulfilled" ? `So'rovingiz ta'minlandi — ${item.product_name}` : `So'rovingiz qayta ochildi — ${item.product_name}`,
        body: `${item.quantity} ${item.unit ?? ""}`,
        link: "/supply",
        entity: "supply_request",
        entity_id: item.id,
        recipient_id: item.created_by,
        sender_id: user?.id,
        sender_name: user?.email,
      });
    }
    toast.success(status === "fulfilled" ? "Ta'minlandi — omborga kirim qilindi" : "Kutilmoqda holatiga qaytarildi");
    load();
    return true;
  };

  const markStatus = async (item: any, status: Status) => {
    const current = normalizeStatus(item.status);
    if (current === status || savingStatus[item.id]) return;
    if (status === "fulfilled" && isLate(item)) {
      setLateReason("");
      setLateItem(item);
      return;
    }
    await applyStatus(item, status, status === "fulfilled" ? null : undefined);
  };

  const confirmLate = async () => {
    if (!lateItem || lateReason.trim().length < 10) return;
    const ok = await applyStatus(lateItem, "fulfilled", lateReason.trim());
    if (ok) { setLateItem(null); setLateReason(""); }
  };

  const fmtDT = (v?: string | null) => {
    if (!v) return "—";
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const fmtDate = (v?: string | null) => v ?? "—";

  const openedOrder = openOrderId ? groups.find((o) => o.key === openOrderId) : null;
  const isGeneralOpen = openedOrder?.key === GENERAL_KEY;
  const isAllOrdersOpen = openedOrder?.key === ALL_ORDERS_KEY;
  const hideOrderNumber = isGeneralOpen || isAllOrdersOpen;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Truck className="h-6 w-6" /> Ta'minot — Kerakli mahsulotlar</h1>
        <p className="text-sm text-muted-foreground">Ta'minot so'rovlari ro'yxati</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(["pending", "fulfilled"] as const).map((s) => (
          <Card key={s} className={`cursor-pointer transition-all hover:shadow-md ${filter === s ? "ring-2 ring-primary" : ""}`} onClick={() => setFilter(filter === s ? "all" : s)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className={`text-xs uppercase tracking-wide font-semibold ${s === "pending" ? "text-status-red" : "text-status-green"}`}>
                  {statusLabel[s]}
                </div>
                <div className="text-3xl font-bold leading-tight mt-1">{counts[s]} <span className="text-sm text-muted-foreground font-normal">ta so'rov</span></div>
              </div>
              <div className={`h-8 w-8 rounded-full ${dotCls[s]}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {!openedOrder && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <TabsList className="h-10">
                  <TabsTrigger className="h-9 text-sm px-3" value="all">Hammasi</TabsTrigger>
                  <TabsTrigger className="h-9 text-sm px-3" value="pending">🔴 Kutilmoqda</TabsTrigger>
                  <TabsTrigger className="h-9 text-sm px-3" value="fulfilled">🟢 Ta'minlandi</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-10 w-full sm:w-64 text-sm" placeholder="Qidiruv..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 px-4 pb-4">
            {visible.length === 0 && <p className="text-base text-muted-foreground text-center py-10">So'rovlar mavjud emas</p>}
            {visible.map((o) => (
              <Card
                key={o.key}
                className="cursor-pointer hover:bg-muted/40 hover:shadow-sm transition-all border-l-4"
                style={{ borderLeftColor: o.worst === "pending" ? "hsl(var(--status-red))" : "hsl(var(--status-green))" }}
                onClick={() => setOpenOrderId(o.key)}
              >
                <CardContent className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {o.pinned ? <span className="text-2xl shrink-0">📌</span> : <span className={`h-3 w-3 rounded-full shrink-0 ${dotCls[o.worst]}`} />}
                    <div className="min-w-0">
                      {!o.pinned && <div className="font-mono font-semibold text-primary text-sm leading-tight">{o.order.order_number}</div>}
                      <div className="text-base sm:text-lg truncate leading-snug font-semibold">{o.order.product_name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {o.counts.pending > 0 && <Badge variant="outline" className={`px-2.5 py-1 text-sm font-semibold ${statusCls.pending}`}>🔴 {o.counts.pending}</Badge>}
                    {o.counts.fulfilled > 0 && <Badge variant="outline" className={`px-2.5 py-1 text-sm font-semibold ${statusCls.fulfilled}`}>🟢 {o.counts.fulfilled}</Badge>}
                    <span className="text-sm text-muted-foreground font-medium">{o.items.length} ta</span>
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
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Package className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-lg leading-snug">{item.product_name}</div>
                          <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 leading-tight mt-1">
                            <span className="font-mono font-semibold text-foreground">{item.quantity} {item.unit ?? ""}</span>
                            <span>· {requesterName(item.created_by)}</span>
                            {item.department && <span className="uppercase">· {item.department}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {canEdit ? (
                          (["pending", "fulfilled"] as Status[]).map((s) => {
                            const selected = color === s;
                            return (
                              <Button
                                key={s}
                                size="sm"
                                className={`h-9 px-3 text-sm border ${selected ? activeBtnCls[s] : outlineBtnCls[s]}`}
                                variant="outline"
                                disabled={!!savingStatus[item.id]}
                                onClick={() => markStatus(item, s)}
                              >
                                {savingStatus[item.id] && !selected ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : s === "fulfilled" && <Check className="h-3.5 w-3.5 mr-1" />}
                                {statusLabel[s]}
                              </Button>
                            );
                          })
                        ) : (
                          <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${statusCls[color]}`}>
                            <span className={`h-2 w-2 rounded-full ${dotCls[color]}`} />
                            {statusLabel[color]}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm bg-muted/40 rounded-md px-3 py-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Berilgan:</span>
                        <span className="font-mono font-medium truncate">{fmtDT(item.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Kerak:</span>
                        <span className={`font-mono font-medium truncate ${color === "pending" && isLate(item) ? "text-status-red font-bold" : ""}`}>{fmtDate(item.required_date)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Ta'minlandi:</span>
                        <span className="font-mono font-medium truncate">{color === "fulfilled" ? fmtDT(item.fulfilled_at) : "—"}</span>
                      </div>
                    </div>

                    {isAdmin && item.late_reason && (
                      <div className="text-[11px] flex items-start gap-1 border border-status-red/30 bg-status-red/5 text-status-red rounded px-2 py-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span><b>Kechikish sababi (faqat Admin):</b> {item.late_reason}</span>
                      </div>
                    )}

                    {item.comment && (
                      <div className="text-[11px] text-muted-foreground border-l-2 border-primary/40 pl-1.5 italic">
                        So'rov izohi: {item.comment}
                      </div>
                    )}

                    {canEdit ? (
                      <div className="flex items-start gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 mt-2 shrink-0 text-muted-foreground" />
                        <Textarea
                          rows={1}
                          className="min-h-8 text-xs flex-1 py-1.5"
                          placeholder="Ta'minot izohi — yozing va Enter bosing..."
                          value={e.supply_comment}
                          onChange={(ev) => setEdit({ ...edit, [item.id]: { ...e, supply_comment: ev.target.value, dirty: true } })}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" && !ev.shiftKey) {
                              ev.preventDefault();
                              if (e.dirty) saveComment(item);
                            }
                          }}
                          onBlur={() => { if (e.dirty) saveComment(item); }}
                        />
                        {e.dirty && (
                          <Button size="sm" className="h-8 px-2 text-xs shrink-0" onClick={() => saveComment(item)}>
                            <Save className="h-3 w-3 mr-1" /> Saqlash
                          </Button>
                        )}
                      </div>
                    ) : item.supply_comment ? (
                      <div className="text-[11px] text-muted-foreground flex items-start gap-1">
                        <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>Ta'minot: {item.supply_comment}</span>
                      </div>
                    ) : null}

                  </CardContent>
                </Card>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!lateItem} onOpenChange={(o) => { if (!o) { setLateItem(null); setLateReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-status-red">
              <AlertTriangle className="h-5 w-5" /> Kechikish sababi
            </DialogTitle>
            <DialogDescription>
              Ushbu mahsulot belgilangan muddatdan kech ta'minlanmoqda. Iltimos, kechikish sababini yozing.
            </DialogDescription>
          </DialogHeader>
          {lateItem && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div><b className="text-foreground">{lateItem.product_name}</b> · {lateItem.quantity} {lateItem.unit ?? ""}</div>
              <div>Kerak sana: <span className="font-mono">{fmtDate(lateItem.required_date)}</span> · Hozir: <span className="font-mono">{fmtDT(new Date().toISOString())}</span></div>
            </div>
          )}
          <Textarea
            rows={4}
            placeholder="Kechikish sababini kamida 10 ta belgi bilan yozing..."
            value={lateReason}
            onChange={(e) => setLateReason(e.target.value)}
          />
          <div className="text-[11px] text-muted-foreground">
            {lateReason.trim().length}/10 belgi {lateReason.trim().length < 10 && "— tasdiqlash uchun yetarli emas"}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLateItem(null); setLateReason(""); }}>Bekor qilish</Button>
            <Button
              onClick={confirmLate}
              disabled={lateReason.trim().length < 10 || (lateItem && !!savingStatus[lateItem.id])}
            >
              {lateItem && savingStatus[lateItem.id] ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Tasdiqlash va Ta'minlandi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
