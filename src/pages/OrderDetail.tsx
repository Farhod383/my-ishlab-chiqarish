import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { logAudit, type OrderRow, type StageRow, type OrderPartRow, type AuditLogRow } from "@/types/erp";
import { ArrowLeft, CheckCircle2, Play, FileText, Image as ImageIcon, AlertTriangle, ShieldCheck, Loader2, ClipboardList, Receipt, UserCog, MessageCircle, Download, Trash2, Upload, Pencil } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { OrderCostReport } from "@/components/OrderCostReport";
import MultiEmployeeSelect, { parseWorkerNames, joinWorkerNames } from "@/components/MultiEmployeeSelect";
import { useLocalize } from "@/i18n/context";
import { notify } from "@/lib/notify";
import { recalcOrderStatus } from "@/lib/orderStatus";
import OrderSupplyRequests from "@/components/OrderSupplyRequests";
import { useNotifications, notifOrderId, notifStageId } from "@/notifications/NotificationsContext";


export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, hasRole } = useAuth();
  const { t } = useI18n();
  const localize = useLocalize();
  const [order, setOrder] = useState<(OrderRow & { client?: any }) | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [parts, setParts] = useState<OrderPartRow[]>([]);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [orderFiles, setOrderFiles] = useState<any[]>([]);
  const [supplyRows, setSupplyRows] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [otkEdit, setOtkEdit] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("timeline");
  const [openStageId, setOpenStageId] = useState<string | null>(null);
  const { items: notifItems, markStageRead, unreadByStage } = useNotifications();

  // Notifications tied to this order (any department) — used only as a general history.
  const orderNotifs = useMemo(
    () => notifItems.filter(n => notifOrderId(n) === id),
    [notifItems, id],
  );

  // Per-stage notification history, keyed by stage id.
  const notifsByStage = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const n of notifItems) {
      const sid = notifStageId(n);
      if (!sid) continue;
      (map[sid] ??= []).push(n);
    }
    return map;
  }, [notifItems]);

  // Total unread across this order's stages (tab indicator).
  const stagesUnread = useMemo(
    () => stages.reduce((sum, st: any) => sum + (unreadByStage[st.id] ?? 0), 0),
    [stages, unreadByStage],
  );

  // Opening a stage marks only that stage's updates as read.
  useEffect(() => {
    if (openStageId) void markStageRead(openStageId);
  }, [openStageId]);

  const load = async () => {
    if (!id) { setLoading(false); return; }
    const [o, s, p, l, mv, of, sr] = await Promise.all([
      supabase.from("orders").select("*, client:clients(*)").eq("id", id).maybeSingle(),
      supabase.from("order_stages").select("*").eq("order_id", id).order("stage_order"),
      supabase.from("order_parts").select("*").eq("order_id", id),
      supabase.from("audit_log").select("*").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("stock_movements").select("*, product:products(name, unit)").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("order_files").select("*").eq("order_id", id).order("created_at"),
      supabase.from("order_supply_requests").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    ]);
    setOrder(o.data as any);
    setStages(s.data ?? []);
    setParts(p.data ?? []);
    setLogs(l.data ?? []);
    setMovements(mv.data ?? []);
    setOrderFiles(of.data ?? []);
    setSupplyRows(sr.data ?? []);

    const map: Record<string, string> = {};
    (s.data ?? []).forEach((st: any) => { map[st.id] = st.otk_comment ?? ""; });
    setOtkEdit(map);
    setLoading(false);
    // Auto-fix order status if all stages already completed (incl. required OTK).
    if (o.data && (o.data as any).status !== "completed") {
      const changed = await recalcOrderStatus(id, (o.data as any).status);
      if (changed) {
        const { data: o2 } = await supabase.from("orders").select("*, client:clients(*)").eq("id", id).maybeSingle();
        if (o2) setOrder(o2 as any);
      }
    }
  };

  useEffect(() => { load(); }, [id]);

  // Realtime: keep Admin / Nachalnik in sync when either side changes a stage.
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`order-stages-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_stages", filter: `order_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  const startStage = async (stage: StageRow, workers: string[], startedAtIso: string) => {
    // Parallel stages allowed: previous stage no longer required to be completed.
    if (workers.length === 0) {
      toast.error("Bosqichni boshlash uchun kamida 1 ta ishchi tayinlanishi kerak");
      return false;
    }
    const workerStr = joinWorkerNames(workers);
    await supabase.from("order_stages").update({
      worker_name: workerStr,
      status: "in_progress",
      started_at: startedAtIso,
    } as any).eq("id", stage.id);
    if (order?.status === "pending") await supabase.from("orders").update({ status: "in_progress" }).eq("id", order.id);
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Bosqich boshlandi", entity: "stage",
      order_id: order!.id, stage_id: stage.id,
      details: `${stage.name} · Ishchilar: ${workerStr} · ${new Date(startedAtIso).toLocaleString()}`,
    });
    await notify({
      type: "stage_started",
      title: `Bosqich boshlandi — ${order?.order_number}`,
      body: `${stage.name} · ${workerStr}`,
      link: `/orders/${order!.id}`,
      entity: "stage", entity_id: stage.id,
      sender_id: user?.id, sender_name: user?.email,
    });
    load();
    return true;
  };

  const finishStage = async (stage: StageRow) => {
    if (stage.qc_required && !stage.qc_passed) { toast.error("Sifat nazorati tasdiqlamagan"); return; }
    const startedTs = stage.started_at ? new Date(stage.started_at).getTime() : null;
    const finishedTs = Date.now();
    const durationMin = startedTs ? Math.round((finishedTs - startedTs) / 60000) : 0;
    await supabase.from("order_stages").update({ status: "completed", finished_at: new Date(finishedTs).toISOString() }).eq("id", stage.id);
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Bosqich tugatildi", entity: "stage", order_id: order!.id, stage_id: stage.id, details: `${stage.name} · ishchi: ${(stage as any).worker_name ?? "—"} · davomiyligi: ${durationMin} daq.` });
    await notify({
      type: "stage_finished",
      title: `Bosqich tugatildi — ${order?.order_number}`,
      body: `${stage.name} · ${durationMin} daq.`,
      link: `/orders/${order!.id}`,
      entity: "stage", entity_id: stage.id,
      sender_id: user?.id, sender_name: user?.email,
    });
    // Re-fetch fresh stage state, then evaluate completion (all completed + OTK approved where required).
    const { data: fresh } = await supabase.from("order_stages").select("status, qc_required, qc_passed").eq("order_id", order!.id);
    const allDone = (fresh ?? []).length > 0 && (fresh ?? []).every((x: any) => x.status === "completed" && (!x.qc_required || x.qc_passed === true));
    if (allDone) {
      await supabase.from("orders").update({ status: "completed" }).eq("id", order!.id).neq("status", "completed");
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Zakaz tugatildi", entity: "order", order_id: order!.id, details: order!.order_number });
      await notify({
        type: "order_completed",
        title: `Zakaz tugatildi — ${order?.order_number}`,
        body: order?.product_name ?? "",
        link: `/orders/${order!.id}`,
        entity: "order", entity_id: order!.id,
        sender_id: user?.id, sender_name: user?.email,
      });
    }
    load();
  };

  const setOtkPassed = async (stage: StageRow, val: boolean) => {
    await supabase.from("order_stages").update({
      qc_passed: val,
      otk_checked_at: val ? new Date().toISOString() : null,
    }).eq("id", stage.id);
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: val ? "OTK o'tdi" : "OTK bekor", entity: "stage", order_id: order!.id, stage_id: stage.id, details: stage.name });
    load();
  };

  const saveOtkComment = async (stage: StageRow) => {
    const c = otkEdit[stage.id] ?? "";
    await supabase.from("order_stages").update({ otk_comment: c || null }).eq("id", stage.id);
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "OTK izoh", entity: "stage", order_id: order!.id, stage_id: stage.id, details: `${stage.name}: ${c}` });
    toast.success(t.otk.save);
    load();
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!order) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <AlertTriangle className="h-10 w-10 text-status-red" />
      <h2 className="text-lg font-semibold">Zakaz topilmadi</h2>
      <Button variant="outline" onClick={() => nav("/orders")}><ArrowLeft className="h-4 w-4 mr-1" /> Zakazlar ro'yxati</Button>
    </div>
  );

  const today = new Date(); today.setHours(0,0,0,0);
  const dl = new Date(order.deadline); dl.setHours(0,0,0,0);
  const daysLeft = Math.ceil((dl.getTime() - today.getTime()) / 86400000);
  const startedAt = stages[0]?.started_at;

  const otkColor = (s: any): "red" | "yellow" | "green" => {
    if (s.qc_passed) return "green";
    if (s.otk_comment && s.otk_comment.trim()) return "yellow";
    return "red";
  };

  // Merged change history from every department that touched this order.
  const changeTimeline = [
    ...logs.map((l: any) => ({
      key: `a-${l.id}`,
      at: l.created_at,
      actor: l.actor_name as string | null,
      action: l.action as string,
      details: l.details as string | null,
      dept: l.entity === "stage" ? "Ishlab chiqarish"
        : l.entity === "supply_request" ? "Ta'minot"
        : l.entity === "stock_movement" ? "Sklad"
        : l.entity === "order" ? "Zakaz" : "Tizim",
    })),
    ...movements.map((m: any) => ({
      key: `m-${m.id}`,
      at: m.created_at,
      actor: (m.recipient_name as string | null) ?? null,
      action: m.direction === "in" ? "Skladga kirim" : "Skladdan chiqim",
      details: `${m.product?.name ?? "—"} · ${m.quantity} ${m.product?.unit ?? ""}${m.comment ? ` · ${m.comment}` : ""}`,
      dept: "Sklad",
    })),
    ...supplyRows.map((s: any) => ({
      key: `s-${s.id}`,
      at: s.fulfilled_at ?? s.updated_at ?? s.created_at,
      actor: null as string | null,
      action: s.status === "fulfilled" ? "Ta'minot bajarildi" : "Ta'minot so'rovi",
      details: `${s.product_name} · ${s.quantity} ${s.unit ?? ""}${s.supply_comment ? ` · ${s.supply_comment}` : ""}`,
      dept: "Ta'minot",
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Real progress from the database stages.
  const totalStages = stages.length;
  const doneStages = stages.filter(s => s.status === "completed").length;
  const currentStage = stages.find(s => s.status === "in_progress")
    ?? stages.find(s => s.status === "delayed")
    ?? stages.find(s => s.status === "pending")
    ?? null;
  const progressPct = totalStages ? Math.round((doneStages / totalStages) * 100) : 0;
  const stageEvents = (name: string) =>
    changeTimeline.filter(ev => (ev.details ?? "").includes(name) || (ev.action ?? "").includes(name));





  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> {t.orderDetail.backToList}</Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{order.product_name}</h1>
              <PriorityBadge priority={order.priority} />
              <StatusBadge status={order.status as any} />
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">#{order.order_number}</span> · {order.quantity} {t.common.pieces} · {t.orderDetail.client}: {order.client?.name ?? "—"}
            </p>
          </div>

        </div>
        <div className="flex gap-2 flex-wrap">
          {hasRole(["admin", "marketing"]) && (
            <Button variant="outline" asChild>
              <Link to={`/orders/${order.id}/edit`}>
                <Pencil className="h-4 w-4 mr-2" /> {t.common.edit}
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to={`/orders/${order.id}/report`}>
              <Receipt className="h-4 w-4 mr-2" /> {t.common.report}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t.orderDetail.received}</div><div className="font-semibold">{order.order_date}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t.orderDetail.started}</div><div className="font-semibold">{startedAt ? new Date(startedAt).toISOString().slice(0,10) : "—"}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t.orderDetail.deadline}</div><div className="font-semibold">{order.deadline}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{t.orderDetail.left}</div><div className={`font-bold text-lg ${daysLeft < 0 ? "text-status-red" : daysLeft <= 2 ? "text-status-yellow" : "text-status-green"}`}>{order.status === "completed" ? t.orderDetail.finished : daysLeft < 0 ? `${Math.abs(daysLeft)} ${t.orderDetail.daysLate}` : `${daysLeft} ${t.common.days}`}</div></CardContent></Card>
      </div>

      {(order.product_image_url || orderFiles.length > 0 || hasRole(["admin", "marketing"])) && (
        <Card>
          <CardContent className="p-4 space-y-3">
            {order.product_image_url && (
              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><ImageIcon className="h-3 w-3" /> {t.orderDetail.productImage}</div>
                <img src={order.product_image_url} alt={order.product_name} className="h-28 w-28 object-cover rounded border" />
              </div>
            )}
            {orderFiles.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><FileText className="h-3 w-3" /> {t.orderDetail.openTz} ({orderFiles.length})</div>
                <div className="space-y-1">
                  {orderFiles.map((f: any) => (
                    <div key={f.id} className="flex items-center gap-2 text-sm border rounded p-2">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <a href={f.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex-1 truncate">{f.file_name || "Fayl"}</a>
                      <a href={f.file_url} download className="text-muted-foreground hover:text-primary"><Download className="h-4 w-4" /></a>
                      {hasRole(["admin", "marketing"]) && (
                        <button onClick={async () => {
                          await supabase.from("order_files").delete().eq("id", f.id);
                          toast.success("Fayl o'chirildi");
                          load();
                        }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {hasRole(["admin", "marketing"]) && (
              <div>
                <Input type="file" multiple onChange={async (e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;
                  try {
                    for (const file of Array.from(files)) {
                      const ext = file.name.split(".").pop();
                      const path = `${crypto.randomUUID()}.${ext}`;
                      const { error } = await supabase.storage.from("order-files").upload(path, file);
                      if (error) throw error;
                      const { data } = supabase.storage.from("order-files").getPublicUrl(path);
                      await supabase.from("order_files").insert({ order_id: order.id, file_url: data.publicUrl, file_name: file.name, uploaded_by: user?.id ?? null } as any);
                    }
                    toast.success("Fayllar yuklandi");
                    load();
                  } catch (err: any) { toast.error(err.message); }
                  e.target.value = "";
                }} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(order as any).comment && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 flex gap-2 items-start">
            <MessageCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-sm whitespace-pre-wrap">{(order as any).comment}</p>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="timeline">
            {t.orderDetail.tabs.stages}
            {stagesUnread > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-status-red px-1.5 text-[11px] font-bold text-status-red-foreground">
                {stagesUnread > 99 ? "99+" : stagesUnread}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="warehouse">{t.orderDetail.tabs.warehouse}</TabsTrigger>
          <TabsTrigger value="movements">{t.orderDetail.tabs.movements}</TabsTrigger>
          <TabsTrigger value="changes">O'zgarishlar tarixi</TabsTrigger>
          <TabsTrigger value="log">{t.orderDetail.tabs.log}</TabsTrigger>

        </TabsList>

        <TabsContent value="timeline" className="space-y-3 mt-4">
          {/* Live progress of this order */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground">Bajarilgan bosqichlar</div>
                  <div className="text-2xl font-bold tracking-tight">{doneStages} / {totalStages} bosqich</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Hozirgi bosqich</div>
                  <div className="text-lg font-bold uppercase">{currentStage ? currentStage.name : "Barcha bosqichlar tugadi"}</div>
                  <div className="mt-1 flex justify-end">
                    {currentStage ? <StatusBadge status={currentStage.status as any} /> : <StatusBadge status={"completed" as any} />}
                  </div>
                </div>
              </div>
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-status-green transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">{progressPct}% bajarildi</div>
            </CardContent>
          </Card>

          {stages.map((s) => {

            // Parallel execution: any pending stage may be started independently of the others.
            const color = otkColor(s);
            const expanded = openStageId === s.id;
            const evs = stageEvents(s.name);
            const actualMs = s.started_at ? (new Date(s.finished_at ?? Date.now()).getTime() - new Date(s.started_at).getTime()) : 0;
            const actualTxt = s.started_at
              ? `${Math.floor(actualMs / 86400000)} kun ${Math.floor((actualMs % 86400000) / 3600000)} soat`
              : "—";
            return (
              <Card key={s.id} className={s.status === "delayed" ? "border-status-red/50" : s.status === "in_progress" ? "border-status-blue/50" : ""}>
                <CardContent className="p-4">
                  <div
                    className="flex items-start justify-between gap-4 flex-wrap cursor-pointer"
                    onClick={() => setOpenStageId(expanded ? null : s.id)}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">

                      <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        s.status === "completed" ? "bg-status-green text-status-green-foreground" :
                        s.status === "in_progress" ? "bg-status-blue text-status-blue-foreground" :
                        s.status === "delayed" ? "bg-status-red text-status-red-foreground" :
                        "bg-muted text-muted-foreground"
                      }`}>{s.stage_order}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{s.name}</span>
                          <StatusBadge status={s.status as any} />
                          {(unreadByStage[s.id] ?? 0) > 0 && (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-status-red px-1.5 text-[11px] font-bold text-status-red-foreground">
                              {unreadByStage[s.id] > 99 ? "99+" : unreadByStage[s.id]}
                            </span>
                          )}
                          {s.qc_required && (
                            <Badge variant="outline" className={`border ${
                              color === "green" ? "border-status-green/40 text-status-green bg-status-green/10" :
                              color === "yellow" ? "border-status-yellow/40 text-status-yellow bg-status-yellow/10" :
                              "border-status-red/40 text-status-red bg-status-red/10"
                            }`}><ShieldCheck className="h-3 w-3 mr-1" />OTK</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{t.orderDetail.norm}: {s.norm_days} {t.common.days}</div>
                        {s.started_at && <div className="text-xs text-muted-foreground mt-1">{t.orderDetail.started2}: {new Date(s.started_at).toLocaleString()}</div>}
                        {s.finished_at && <div className="text-xs text-muted-foreground">{t.orderDetail.finished2}: {new Date(s.finished_at).toLocaleString()}</div>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0 min-w-[220px]" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2 flex-wrap">
                        {s.status === "pending" && hasRole(["manager", "admin"]) && (
                          <StageStartDialog stage={s} onStart={(workers, startedAtIso) => startStage(s, workers, startedAtIso)} />
                        )}
                        {s.status === "in_progress" && hasRole(["manager", "admin"]) && (
                          <Button size="sm" onClick={() => finishStage(s)}><CheckCircle2 className="h-3 w-3 mr-1" />{t.orderDetail.complete}</Button>
                        )}
                        {s.status !== "pending" && hasRole(["manager", "admin"]) && (
                          <StageAssignDialog stage={s} onSaved={load} />
                        )}
                      </div>
                      <StageWorkersDisplay stage={s} />
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-4 pt-3 border-t space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div><div className="text-muted-foreground">Holati</div><div className="mt-0.5"><StatusBadge status={s.status as any} /></div></div>
                        <div><div className="text-muted-foreground">Boshlangan</div><div className="font-medium">{s.started_at ? new Date(s.started_at).toLocaleString() : "—"}</div></div>
                        <div><div className="text-muted-foreground">Tugagan</div><div className="font-medium">{s.finished_at ? new Date(s.finished_at).toLocaleString() : "—"}</div></div>
                        <div><div className="text-muted-foreground">Norma</div><div className="font-medium">{s.norm_days} {t.common.days}</div></div>
                        <div><div className="text-muted-foreground">Haqiqiy vaqt</div><div className="font-medium">{actualTxt}</div></div>
                        <div className="col-span-2"><div className="text-muted-foreground">Xodimlar</div><div className="font-medium">{(s as any).worker_name || "—"}</div></div>
                        {s.qc_required && (
                          <div><div className="text-muted-foreground">OTK</div><div className="font-medium">{s.qc_passed ? "Tasdiqlangan" : "Kutilmoqda"}{(s as any).otk_checked_at ? ` · ${new Date((s as any).otk_checked_at).toLocaleString()}` : ""}</div></div>
                        )}
                      </div>
                      {(notifsByStage[s.id]?.length ?? 0) > 0 && (
                        <div>
                          <div className="text-xs font-semibold mb-1">{s.name} bo'yicha bildirishnomalar ({notifsByStage[s.id].length})</div>
                          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                            {notifsByStage[s.id].map((n: any) => (
                              <div key={n.id} className="rounded-md border bg-background p-2">
                                <div className="text-xs font-medium">{n.title}</div>
                                {n.body && <div className="text-[11px] text-muted-foreground whitespace-pre-wrap">{n.body}</div>}
                                <div className="mt-0.5 text-[11px] text-muted-foreground">
                                  {n.sender_name ?? "Tizim"} · {new Date(n.created_at).toLocaleString("uz-UZ")}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-semibold mb-1">Shu bosqich bo'yicha o'zgarishlar ({evs.length})</div>
                        {evs.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t.common.noRecords}</p>
                        ) : (
                          <div className="space-y-1.5">
                            {evs.slice(0, 10).map(ev => (
                              <div key={ev.key} className="text-xs border-l-2 border-primary/30 pl-2">
                                <span className="text-muted-foreground">{new Date(ev.at).toLocaleString()}</span>
                                {" — "}
                                <span className="font-medium">{ev.dept}</span>
                                {" · "}
                                <span>{ev.action}</span>
                                {ev.actor && <span className="text-muted-foreground"> · {localize(ev.actor)}</span>}
                                {ev.details && <div className="text-muted-foreground">{ev.details}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>

              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="warehouse" className="mt-4 space-y-4">
          <OrderSupplyRequests orderId={order.id} orderNumber={order.order_number} />
          <Card>
            <CardHeader><CardTitle className="text-base">{t.orderDetail.partsTitle}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {parts.length === 0 && <p className="text-sm text-muted-foreground">{t.orderDetail.noParts}</p>}
              {parts.map((p) => {
                const diff = Number(p.actual_qty) - Number(p.norm_qty);
                const over = diff > 0;
                return (
                  <div key={p.id} className={`flex items-center justify-between p-3 rounded border ${over ? "bg-status-red/5 border-status-red/30" : ""}`}>
                    <div>
                      <div className="font-medium text-sm">{p.part_name}</div>
                      <div className="text-xs text-muted-foreground">{t.orderDetail.norm}: {p.norm_qty} {p.unit}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold">{p.actual_qty} {p.unit}</div>
                      <div className={`text-xs ${over ? "text-status-red font-semibold" : "text-muted-foreground"}`}>
                        {over && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                        {t.orderDetail.diff}: {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t.orderDetail.movementsTitle}</CardTitle><p className="text-sm text-muted-foreground">{t.orderDetail.movementsDesc}</p></CardHeader>
            <CardContent className="space-y-2">
              {movements.length === 0 && <p className="text-sm text-muted-foreground">{t.orderDetail.noMovements}</p>}
              {movements.map((m) => (
                <div key={m.id} className="text-sm border-l-2 border-primary/40 pl-3 py-1">
                  <div><span className="font-medium">{m.product?.name}</span> — <span className="font-mono">{m.direction === "out" ? "-" : "+"}{m.quantity} {m.product?.unit}</span></div>
                  <div className="text-xs text-muted-foreground">{t.orderDetail.receivedBy}: {localize(m.recipient_name) || "—"} · {new Date(m.created_at).toLocaleString()}</div>
                  {m.comment && <div className="text-xs text-muted-foreground italic">"{m.comment}"</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="changes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> O'zgarishlar tarixi ({changeTimeline.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {changeTimeline.length === 0 && <p className="text-sm text-muted-foreground">{t.common.noRecords}</p>}
              {changeTimeline.map((ev) => (
                <div key={ev.key} className="flex gap-3 border-l-2 pl-3 py-2 border-primary/30">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{ev.dept}</Badge>
                      <span className="font-semibold text-sm">{ev.action}</span>
                    </div>
                    {ev.details && <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{ev.details}</div>}
                    <div className="text-[11px] text-muted-foreground/80 mt-1">
                      {new Date(ev.at).toLocaleString()} · {ev.actor ? localize(ev.actor) : t.common.system}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="log" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" /> {t.orderDetail.tabs.log}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {logs.map((l) => (
                <div key={l.id} className="text-sm border-l-2 border-border pl-3 py-1">
                  <div><span className="font-semibold">{l.action}</span> — <span className="text-muted-foreground">{l.actor_name ? localize(l.actor_name) : t.common.system}</span></div>
                  {l.details && <div className="text-xs text-muted-foreground">{l.details}</div>}
                  <div className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString()}</div>
                </div>
              ))}
              {logs.length === 0 && <p className="text-sm text-muted-foreground">{t.common.noRecords}</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


function StageAssignDialog({ stage, onSaved }: { stage: any; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const oldWorkers = parseWorkerNames(stage.worker_name);
  const [workers, setWorkers] = useState<string[]>(oldWorkers);
  const [start, setStart] = useState(stage.planned_start ?? "");
  const [end, setEnd] = useState(stage.planned_end ?? "");
  const [handover, setHandover] = useState(stage.handover_comment ?? "");
  const { t } = useI18n();
  const { user } = useAuth();
  const save = async () => {
    if (workers.length === 0) {
      toast.error("Kamida 1 ta ishchi tanlanishi kerak");
      return;
    }
    const prev = parseWorkerNames(stage.worker_name);
    const workerStr = joinWorkerNames(workers);
    const { error } = await supabase.from("order_stages").update({
      worker_name: workerStr || null,
      planned_start: start || null,
      planned_end: end || null,
      handover_comment: handover.trim() || null,
    } as any).eq("id", stage.id);
    if (error) { toast.error(error.message); return; }
    const changed = prev.join(",") !== workers.join(",");
    const added = workers.filter((w) => !prev.includes(w));
    const removed = prev.filter((w) => !workers.includes(w));
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: changed ? "Ishchilar o'zgartirildi" : "Bosqich tayinlandi", entity: "stage",
      order_id: stage.order_id, stage_id: stage.id,
      details: `${stage.name} · Eski: ${prev.join(", ") || "—"} · Yangi: ${workers.join(", ") || "—"}${added.length ? ` · +${added.join(", ")}` : ""}${removed.length ? ` · -${removed.join(", ")}` : ""}${handover ? ` · ${handover}` : ""}`,
    });
    toast.success("Ishchilar yangilandi");
    setOpen(false);
    onSaved();
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setWorkers(parseWorkerNames(stage.worker_name)); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs"><UserCog className="h-3 w-3 mr-1" />Ishchilarni o'zgartirish</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Ishchilarni tahrirlash — {stage.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {oldWorkers.length > 0 && (
            <div className="text-xs text-muted-foreground border rounded p-2 bg-muted/30">
              <strong>Hozirgi ishchilar:</strong> {oldWorkers.join(", ")}
            </div>
          )}
          <div>
            <Label>Ishchilar (kamida 1 ta)</Label>
            <MultiEmployeeSelect value={workers} onChange={setWorkers} placeholder="🔍 Ishchi qidirish..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t.orderDetail.plannedStart}</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label>{t.orderDetail.plannedEnd}</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div><Label>{t.orderDetail.handover}</Label><Textarea rows={3} value={handover} onChange={(e) => setHandover(e.target.value)} placeholder={t.orderDetail.handoverPh} /></div>
          <Button onClick={save} disabled={workers.length === 0} className="w-full">Saqlash</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StageStartDialog({ stage, onStart }: { stage: any; onStart: (workers: string[], startedAtIso: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [workers, setWorkers] = useState<string[]>(parseWorkerNames(stage.worker_name));
  const [startedAt, setStartedAt] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16); // yyyy-MM-ddTHH:mm for datetime-local
  });
  const [saving, setSaving] = useState(false);
  const handleStart = async () => {
    if (workers.length === 0) {
      toast.error("Bosqichni boshlash uchun kamida 1 ta ishchi tayinlanishi kerak");
      return;
    }
    setSaving(true);
    const iso = startedAt ? new Date(startedAt).toISOString() : new Date().toISOString();
    const ok = await onStart(workers, iso);
    setSaving(false);
    if (ok) setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setWorkers(parseWorkerNames(stage.worker_name)); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Play className="h-3 w-3 mr-1" />Boshlash</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Ishchi tayinlash — {stage.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Ishchilar (kamida 1 ta)</Label>
            <MultiEmployeeSelect value={workers} onChange={setWorkers} placeholder="🔍 Ishchi qidirish..." />
          </div>
          <div>
            <Label>Boshlanish sanasi</Label>
            <Input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
          </div>
          <Button onClick={handleStart} disabled={saving || workers.length === 0} className="w-full">
            <Play className="h-4 w-4 mr-2" />Saqlash va boshlash
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StageWorkersDisplay({ stage }: { stage: any }) {
  const localize = useLocalize();
  const workers = parseWorkerNames(stage.worker_name);
  const hasMeta = workers.length > 0 || stage.planned_start || stage.planned_end || stage.handover_comment;
  if (!hasMeta) return null;
  return (
    <div className="text-xs text-muted-foreground border rounded p-2 bg-muted/20 space-y-1">
      {workers.length > 0 && (
        <div>
          <strong className="block text-foreground/80 mb-0.5">Ishchilar:</strong>
          <ul className="list-disc list-inside space-y-0.5">
            {workers.map((w, i) => <li key={i}>{localize(w)}</li>)}
          </ul>
        </div>
      )}
      {(stage.planned_start || stage.planned_end) && (
        <div>{stage.planned_start ?? "—"} → {stage.planned_end ?? "—"}</div>
      )}
      {stage.handover_comment && <div className="italic">"{stage.handover_comment}"</div>}
    </div>
  );
}
