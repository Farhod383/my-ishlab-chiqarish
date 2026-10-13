import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import NewSupplyRequestDialog from "@/components/supply/NewSupplyRequestDialog";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Truck, Search, ExternalLink, ChevronLeft, Save, Loader2, Package, MessageSquare, Check, AlertTriangle, CalendarDays, Clock } from "lucide-react";
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
import { useNotifications, notifOrderId } from "@/notifications/NotificationsContext";
import { resolveModule } from "@/lib/notifModules";
import SupplyOrderHistory from "@/components/SupplyOrderHistory";
import { logSupplyChange } from "@/lib/supplyHistory";
import NumberInput from "@/components/NumberInput";
import { currentUserName } from "@/lib/userNames";
import { fmtDate, fmtDateTime24 as fmtDT } from "@/lib/format";
import { supplyRequestDates } from "@/lib/supplyRequestDates";

type Filter = "all" | Status;

const normalizeStatus = normalizeSupplyStatus;

export default function SupplyRequestsPage() {
  const { hasRole, user } = useAuth();
  const canEdit = hasRole(["supply", "admin", "warehouse"]);
  const isAdmin = hasRole(["admin"]);
  // Supply staff can't order to themselves (also enforced in the database).
  const canCreate = !!user && (isAdmin || !hasRole(["supply"]));
  const [searchParams, setSearchParams] = useSearchParams();
  const newMode = searchParams.get("new");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { status: Status; supply_comment: string; dirty: boolean }>>({});
  const [savingStatus, setSavingStatus] = useState<Record<string, boolean>>({});

  const [lateItem, setLateItem] = useState<any | null>(null);
  const [lateReason, setLateReason] = useState("");

  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; email: string | null }>>({});
  const [qtyEdit, setQtyEdit] = useState<Record<string, string>>({});
  const { roles } = useAuth() as any;
  const myRole = (Array.isArray(roles) && roles[0]) || null;

  // Ta'minot bildirishnomalari — har bir zakaz uchun alohida o'qilmagan soni.
  const { items: notifItems, markRead } = useNotifications();
  const supplyUnreadByOrder = useMemo(() => {
    const m: Record<string, number> = {};
    notifItems.forEach((n) => {
      if (n.read_at) return;
      if (resolveModule(n) !== "supply") return;
      const oid = notifOrderId(n);
      if (oid) m[oid] = (m[oid] ?? 0) + 1;
    });
    return m;
  }, [notifItems]);

  // Zakaz ochilganda shu zakazning ta'minot bildirishnomalari o'qilgan bo'ladi.
  // Bildirishnomalar entity="supply_request" + entity_id=buyurtma id bilan keladi,
  // shuning uchun guruh ochilganda uning ichidagi buyurtmalarga tegishli bildirishnomalar ham o'qiladi.
  useEffect(() => {
    if (!openOrderId) return;
    const reqIds = new Set<string>();
    rows.forEach((r: any) => {
      const inGroup =
        openOrderId === "__general__" ? !r.order?.id :
        openOrderId === "__all_orders__" ? !!r.order?.id :
        r.order?.id === openOrderId;
      if (inGroup) reqIds.add(r.id);
    });
    const unread = notifItems.filter(
      (n) => !n.read_at && resolveModule(n) === "supply" && (
        notifOrderId(n) === openOrderId ||
        (n.entity === "supply_request" && !!n.entity_id && reqIds.has(n.entity_id))
      ),
    );
    if (!unread.length) return;
    const t = window.setTimeout(() => { unread.forEach((n) => { void markRead(n); }); }, 800);
    return () => window.clearTimeout(t);
  }, [openOrderId, notifItems, rows]);


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
    // Pending: newest created first. Fulfilled: newest fulfilled first (fallback updated/created).
    const da = sa === 0 ? a.created_at : (a.fulfilled_at ?? a.updated_at ?? a.created_at);
    const db = sb === 0 ? b.created_at : (b.fulfilled_at ?? b.updated_at ?? b.created_at);
    return (db ?? "").localeCompare(da ?? "");
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
    result.push(mk(GENERAL_KEY, { id: GENERAL_KEY, order_number: "📌", product_name: "Zavod uchun umumiy buyurtma" }, general, true));
    result.push(mk(ALL_ORDERS_KEY, { id: ALL_ORDERS_KEY, order_number: "📌", product_name: "Zakazlar uchun umumiy buyurtma" }, allOrders, true));

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
      actor_id: user?.id, actor_name: currentUserName(user),
      action: "Ta'minot izohi saqlandi", entity: "supply_request",
      order_id: item.order_id ?? null,
      details: `${item.product_name}: ${e.supply_comment || "—"}`,
    });
    await logSupplyChange({
      requestId: item.id, orderId: item.order_id ?? null, productName: item.product_name,
      action: "Ta'minot izohi o'zgartirildi",
      before: { supply_comment: item.supply_comment ?? "" },
      after: { supply_comment: e.supply_comment || "" },
      actorId: user?.id, actorName: currentUserName(user), role: myRole,
    });
    toast.success("Izoh saqlandi");
    load();
  };

  const saveQty = async (item: any) => {
    const next = Number(qtyEdit[item.id]);
    if (!next || next === Number(item.quantity)) { setQtyEdit((p) => ({ ...p, [item.id]: "" })); return; }
    const { error } = await supabase.from("order_supply_requests").update({ quantity: next }).eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    await logSupplyChange({
      requestId: item.id, orderId: item.order_id ?? null, productName: item.product_name,
      action: "Miqdor o'zgartirildi",
      before: { quantity: `${item.quantity} ${item.unit ?? ""}`.trim() },
      after: { quantity: `${next} ${item.unit ?? ""}`.trim() },
      actorId: user?.id, actorName: currentUserName(user), role: myRole,
    });
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: currentUserName(user),
      action: "Ta'minot miqdori o'zgartirildi", entity: "supply_request",
      order_id: item.order_id ?? null,
      details: `${item.product_name}: ${item.quantity} → ${next} ${item.unit ?? ""}`,
    });
    await notify({
      type: "supply_request",
      title: `Miqdor o'zgardi — ${item.product_name}`,
      body: `${item.quantity} → ${next} ${item.unit ?? ""}`,
      link: item.order_id ? `/orders/${item.order_id}` : "/supply",
      entity: "supply_request",
      entity_id: item.id,
      recipient_role: ["supply", "warehouse", "manager"],
      sender_id: user?.id,
      sender_name: currentUserName(user),
    });
    setQtyEdit((p) => ({ ...p, [item.id]: "" }));
    toast.success("Miqdor yangilandi");
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
      actor_id: user?.id, actor_name: currentUserName(user),
      action: status === "fulfilled" ? "Ta'minot bajarildi" : "Ta'minot kutilmoqdaga qaytarildi",
      entity: "supply_request",
      order_id: item.order_id ?? null,
      details: `${item.product_name} · ${item.quantity} ${item.unit ?? ""}${late_reason ? ` · Kechikish sababi: ${late_reason}` : ""}`,
    });
    await logSupplyChange({
      requestId: item.id, orderId: item.order_id ?? null, productName: item.product_name,
      action: status === "fulfilled" ? "Mahsulot ta'minlandi" : "Holat qaytarildi",
      before: { status: normalizeStatus(item.status) },
      after: { status },
      actorId: user?.id, actorName: currentUserName(user), role: myRole,
    });
    await notify({
      type: status === "fulfilled" ? "supply_fulfilled" : "supply_request",
      title: status === "fulfilled" ? `Ta'minlandi — ${item.product_name}` : `Ta'minot qayta ochildi — ${item.product_name}`,
      body: `${item.quantity} ${item.unit ?? ""}${item.order?.order_number ? ` · ${item.order.order_number}` : ""}`,
      link: item.order_id ? `/orders/${item.order_id}` : "/supply",
      entity: "supply_request",
      entity_id: item.id,
      recipient_role: ["warehouse", "manager", "supply"],
      sender_id: user?.id,
      sender_name: currentUserName(user),
    });
    if (item.created_by && item.created_by !== user?.id) {
      await notify({
        type: status === "fulfilled" ? "supply_fulfilled" : "supply_request",
        title: status === "fulfilled" ? `So'rovingiz ta'minlandi — ${item.product_name}` : `So'rovingiz qayta ochildi — ${item.product_name}`,
        body: `${item.quantity} ${item.unit ?? ""}`,
        link: item.order_id ? `/orders/${item.order_id}` : "/supply",
        entity: "supply_request",
        entity_id: item.id,
        recipient_id: item.created_by,
        sender_id: user?.id,
        sender_name: currentUserName(user),
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

  const openedOrder = openOrderId ? groups.find((o) => o.key === openOrderId) : null;
  // Opened from a notification: open the group that holds the exact request.
  const focusId = searchParams.get("focus");
  const focusAt = searchParams.get("focus_at");
  useEffect(() => {
    if ((!focusId && !focusAt) || groups.length === 0) return;
    const t = focusAt ? new Date(focusAt).getTime() : 0;
    let hit: any = null; let gap = Infinity;
    for (const g of groups) for (const it of g.items as any[]) {
      if (focusId && it.id === focusId) { hit = g; gap = 0; }
      else if (!focusId && focusAt) { const d = Math.abs(new Date(it.created_at).getTime() - t); if (d < gap) { gap = d; hit = g; } }
    }
    if (hit && gap <= 3 * 60 * 1000) { setFilter("all"); setOpenOrderId(hit.key); }
  }, [focusId, focusAt, groups.length]);
  const isGeneralOpen = openedOrder?.key === GENERAL_KEY;
  const isAllOrdersOpen = openedOrder?.key === ALL_ORDERS_KEY;
  const hideOrderNumber = isGeneralOpen || isAllOrdersOpen;

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Truck className="h-6 w-6" /> Ta'minot — Kerakli mahsulotlar</h1>
          <p className="text-sm text-muted-foreground">Ta'minot so'rovlari ro'yxati</p>
        </div>
        {canCreate && (
          <Button size="lg" className="h-12 w-full sm:w-auto text-base font-bold" onClick={() => setSearchParams({ new: "factory" })}><Plus className="h-5 w-5 mr-2" />Buyurtma berish</Button>
        )}
      </div>
      {canCreate && (
        <NewSupplyRequestDialog
          open={!!newMode}
          onOpenChange={(v) => { if (!v) setSearchParams({}); }}
          initialMode={newMode === "order" ? "order" : "factory"}
          initialProductId={searchParams.get("product")}
          source="supply"
          onCreated={load}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(["pending", "fulfilled"] as const).map((s) => (
          <Button key={s} variant="outline" data-tone={s} aria-pressed={filter === s} className="supply-tone supply-selectable h-auto min-h-28 w-full justify-between whitespace-normal p-5 text-left" onClick={() => setFilter(filter === s ? "all" : s)}>
              <div>
                <div className="text-base font-bold">
                  {statusLabel[s]}
                </div>
                <div className="text-3xl font-bold leading-tight mt-1">{counts[s]} <span className="text-base font-semibold">ta so'rov</span></div>
              </div>
              {s === "pending" ? <Clock className="h-7 w-7" /> : <Check className="h-7 w-7" />}
          </Button>
        ))}
      </div>

      {!openedOrder && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <TabsList className="supply-tabs h-12">
                  <TabsTrigger className="min-h-10 text-sm font-bold px-3" value="all">Hammasi</TabsTrigger>
                  <TabsTrigger data-tone="pending" className="min-h-10 text-sm font-bold px-3" value="pending">Kutilmoqda</TabsTrigger>
                  <TabsTrigger data-tone="fulfilled" className="min-h-10 text-sm font-bold px-3" value="fulfilled">Ta'minlandi</TabsTrigger>
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
            {visible.filter((o) => o.pinned).map((o) => (
              <Button
                key={o.key}
                variant="outline"
                className="h-auto min-h-12 w-full justify-between gap-3 whitespace-normal text-left px-4 py-3"
                onClick={() => setOpenOrderId(o.key)}
              >
                <span className="font-bold">{o.order.product_name}</span>
                <span className="shrink-0">{o.items.length} ta</span>
              </Button>
            ))}
            {visible.filter((o) => o.pinned).flatMap((o) => o.items).sort(sortByStatus).map((item: any) => {
              const status = normalizeStatus(item.status);
              const dates = supplyRequestDates({ ...item, status });
              return (
              <Card
                key={item.id}
                data-focus-id={item.id}
                data-focus-at={item.created_at}
                data-focus-entity="supply_request"
                className="supply-tone"
                data-tone={status}
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Package className="h-5 w-5 shrink-0 mt-1" />
                      <div className="min-w-0 space-y-1">
                        <div className="text-lg font-bold break-words">{item.product_name}</div>
                        <div className="text-sm font-bold">{item.quantity} {item.unit ?? ""}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-sm font-bold px-3 py-1 ${statusCls[status]}`}>{statusLabel[status]}</Badge>
                  </div>
                  <div className="text-sm font-semibold break-words">
                    {item.order ? <>Zakaz: {item.order.order_number} · {item.order.product_name}</> : "Zavod uchun umumiy buyurtma"}
                  </div>
                  <div className="supply-dates grid grid-cols-1 xl:grid-cols-3 gap-3 rounded-md p-3 text-sm font-semibold">
                    <div className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 shrink-0" /><span>Berilgan:</span><span className="font-mono">{dates.given}</span></div>
                    <div className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 shrink-0" /><span>Muddat:</span><span className="font-mono">{dates.deadline}</span></div>
                    <div className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 shrink-0" /><span>Ta'minlandi:</span><span className="font-mono">{dates.fulfilled}</span></div>
                  </div>
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <span className="text-sm font-semibold">{requesterName(item.created_by)}</span>
                    <Button variant="outline" size="sm" onClick={() => setOpenOrderId(item.order?.id ?? GENERAL_KEY)}>
                      <ExternalLink className="h-4 w-4 mr-2" />Ko'rish
                      {item.order?.id && (supplyUnreadByOrder[item.order.id] ?? 0) > 0 && <span className="ml-2">({supplyUnreadByOrder[item.order.id]})</span>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              );
            })}
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
              const cardTone = item.order?.status === "completed" ? "fulfilled" : color;
              return (
                <Card key={item.id} data-focus-id={item.id} data-focus-at={item.created_at} data-focus-entity="supply_request" data-tone={cardTone} className="supply-tone">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Package className="h-6 w-6 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-lg leading-snug">{item.product_name}</div>
                          <div className="text-sm font-semibold flex flex-wrap gap-x-3 leading-tight mt-1">
                            <span className="font-mono font-bold">{item.quantity} {item.unit ?? ""}</span>
                            <span>· {requesterName(item.created_by)}</span>
                            {item.department && <span className="uppercase">· {item.department}</span>}
                          </div>
                          {canEdit && (
                            <div className="mt-2 flex items-center gap-1.5">
                              <span className="text-sm font-semibold">Miqdorni o'zgartirish:</span>
                              <NumberInput
                                className="h-10 w-24 text-sm text-foreground"
                                min={0.01}
                                step={0.01}
                                value={qtyEdit[item.id] ?? ""}
                                placeholder={String(item.quantity)}
                                onChange={(ev) => setQtyEdit((p) => ({ ...p, [item.id]: ev.target.value }))}
                                onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); void saveQty(item); } }}
                              />
                              {!!qtyEdit[item.id] && (
                                <Button size="sm" className="h-8 px-2 text-xs" onClick={() => saveQty(item)}>
                                  <Save className="h-3 w-3 mr-1" /> Saqlash
                                </Button>
                              )}
                            </div>
                          )}
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
                                aria-pressed={selected}
                                className={`h-11 px-4 text-sm font-bold border-2 ${selected ? activeBtnCls[s] : outlineBtnCls[s]} ${selected ? "shadow-md" : "border-dashed"}`}
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

                    <div className="supply-dates grid grid-cols-1 xl:grid-cols-3 gap-3 text-sm font-semibold rounded-md px-3 py-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        <span>Berilgan:</span>
                        <span className="font-mono font-bold">{fmtDT(item.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        <span>Muddat:</span>
                        <span className="font-mono font-bold">{fmtDate(item.required_date)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CalendarDays className="h-4 w-4 shrink-0" />
                        <span>Ta'minlandi:</span>
                        <span className="font-mono font-bold">{color === "fulfilled" ? fmtDT(item.fulfilled_at) : "—"}</span>
                      </div>
                    </div>

                    {isAdmin && item.late_reason && (
                      <div className="text-sm flex items-start gap-2 border rounded px-3 py-2 font-semibold">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span><b>Kechikish sababi (faqat Admin):</b> {item.late_reason}</span>
                      </div>
                    )}

                    {item.comment && (
                      <div className="text-sm font-semibold border-l-2 pl-2">
                        So'rov izohi: {item.comment}
                      </div>
                    )}

                    {canEdit ? (
                      <div className="flex items-start gap-1.5">
                        <MessageSquare className="h-4 w-4 mt-2 shrink-0" />
                        <Textarea
                          rows={1}
                          className="min-h-10 text-sm text-foreground flex-1 py-2"
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
                      <div className="text-sm font-semibold flex items-start gap-2">
                        <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>Ta'minot: {item.supply_comment}</span>
                      </div>
                    ) : null}

                  </CardContent>
                </Card>
              );
            })}

            {!isAllOrdersOpen && (
              <SupplyOrderHistory
                orderId={isGeneralOpen ? null : openedOrder.order.id}
                title={isGeneralOpen ? "Umumiy o'zgarishlar tarixi" : `${openedOrder.order.order_number} — o'zgarishlar tarixi`}
              />
            )}
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
              <div>Muddat: <span className="font-mono">{fmtDate(lateItem.required_date)}</span> · Hozir: <span className="font-mono">{fmtDT(new Date().toISOString())}</span></div>
            </div>
          )}
          <Textarea
            rows={4}
            data-required
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
