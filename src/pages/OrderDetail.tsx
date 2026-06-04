import { useEffect, useState } from "react";
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

export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, hasRole } = useAuth();
  const { t } = useI18n();
  const [order, setOrder] = useState<(OrderRow & { client?: any }) | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [parts, setParts] = useState<OrderPartRow[]>([]);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [orderFiles, setOrderFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [otkEdit, setOtkEdit] = useState<Record<string, string>>({});

  const load = async () => {
    if (!id) { setLoading(false); return; }
    const [o, s, p, l, mv, of] = await Promise.all([
      supabase.from("orders").select("*, client:clients(*)").eq("id", id).maybeSingle(),
      supabase.from("order_stages").select("*").eq("order_id", id).order("stage_order"),
      supabase.from("order_parts").select("*").eq("order_id", id),
      supabase.from("audit_log").select("*").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("stock_movements").select("*, product:products(name, unit)").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("order_files").select("*").eq("order_id", id).order("created_at"),
    ]);
    setOrder(o.data as any);
    setStages(s.data ?? []);
    setParts(p.data ?? []);
    setLogs(l.data ?? []);
    setMovements(mv.data ?? []);
    setOrderFiles(of.data ?? []);
    const map: Record<string, string> = {};
    (s.data ?? []).forEach((st: any) => { map[st.id] = st.otk_comment ?? ""; });
    setOtkEdit(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const startStage = async (stage: StageRow, workers: string[]) => {
    // Parallel stages allowed: previous stage no longer required to be completed.
    if (workers.length === 0) {
      toast.error("Bosqichni boshlash uchun kamida 1 ta ishchi tayinlanishi kerak");
      return false;
    }
    const workerStr = joinWorkerNames(workers);
    await supabase.from("order_stages").update({
      worker_name: workerStr,
      status: "in_progress",
      started_at: new Date().toISOString(),
    } as any).eq("id", stage.id);
    if (order?.status === "pending") await supabase.from("orders").update({ status: "in_progress" }).eq("id", order.id);
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Bosqich boshlandi", entity: "stage",
      order_id: order!.id, stage_id: stage.id,
      details: `${stage.name} · Ishchilar: ${workerStr}`,
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
    const others = stages.filter((x) => x.id !== stage.id);
    if (others.every((x) => x.status === "completed")) {
      await supabase.from("orders").update({ status: "completed" }).eq("id", order!.id);
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Zakaz tugatildi", entity: "order", order_id: order!.id, details: order!.order_number });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> {t.orderDetail.backToList}</Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{order.order_number}</h1>
              <PriorityBadge priority={order.priority} />
              <StatusBadge status={order.status as any} />
            </div>
            <p className="text-sm text-muted-foreground">{order.product_name} · {order.quantity} {t.common.pieces} · {t.orderDetail.client}: {order.client?.name ?? "—"}</p>
          </div>
        </div>
        <div className="flex gap-2">
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

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">{t.orderDetail.tabs.stages}</TabsTrigger>
          <TabsTrigger value="warehouse">{t.orderDetail.tabs.warehouse}</TabsTrigger>
          <TabsTrigger value="movements">{t.orderDetail.tabs.movements}</TabsTrigger>
          <TabsTrigger value="log">{t.orderDetail.tabs.log}</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-3 mt-4">
          {stages.map((s, idx) => {
            const prev = stages[idx - 1];
            const canStart = !prev || prev.status === "completed";
            const color = otkColor(s);
            return (
              <Card key={s.id} className={s.status === "delayed" ? "border-status-red/50" : s.status === "in_progress" ? "border-status-blue/50" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
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
                    <div className="flex flex-col gap-2 shrink-0 min-w-[220px]">
                      <div className="flex gap-2 flex-wrap">
                        {s.status === "pending" && canStart && hasRole(["manager", "admin", "marketing"]) && (
                          <StageStartDialog stage={s} onStart={(workers) => startStage(s, workers)} />
                        )}
                        {s.status === "in_progress" && hasRole(["manager", "admin", "marketing"]) && (
                          <Button size="sm" onClick={() => finishStage(s)}><CheckCircle2 className="h-3 w-3 mr-1" />{t.orderDetail.complete}</Button>
                        )}
                        {hasRole(["manager", "admin"]) && (
                          <StageAssignDialog stage={s} onSaved={load} />
                        )}
                      </div>
                      <StageWorkersDisplay stage={s} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="warehouse" className="mt-4">
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
                  <div className="text-xs text-muted-foreground">{t.orderDetail.receivedBy}: {m.recipient_name ?? "—"} · {new Date(m.created_at).toLocaleString()}</div>
                  {m.comment && <div className="text-xs text-muted-foreground italic">"{m.comment}"</div>}
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
                  <div><span className="font-semibold">{l.action}</span> — <span className="text-muted-foreground">{l.actor_name ?? t.common.system}</span></div>
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
  const [worker, setWorker] = useState(stage.worker_name ?? "");
  const [start, setStart] = useState(stage.planned_start ?? "");
  const [end, setEnd] = useState(stage.planned_end ?? "");
  const [handover, setHandover] = useState(stage.handover_comment ?? "");
  const { t } = useI18n();
  const { user } = useAuth();
  const save = async () => {
    const { error } = await supabase.from("order_stages").update({
      worker_name: worker.trim() || null,
      planned_start: start || null,
      planned_end: end || null,
      handover_comment: handover.trim() || null,
    } as any).eq("id", stage.id);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Bosqich tayinlandi", entity: "stage",
      order_id: stage.order_id, stage_id: stage.id,
      details: `${stage.name}${worker ? ` → ${worker}` : ""}${handover ? ` · ${handover}` : ""}`,
    });
    toast.success(t.orderDetail.saveAssign);
    setOpen(false);
    onSaved();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs"><UserCog className="h-3 w-3 mr-1" />{t.orderDetail.assignWorker}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{stage.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{t.orderDetail.workerName}</Label><Input value={worker} onChange={(e) => setWorker(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t.orderDetail.plannedStart}</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label>{t.orderDetail.plannedEnd}</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div><Label>{t.orderDetail.handover}</Label><Textarea rows={3} value={handover} onChange={(e) => setHandover(e.target.value)} placeholder={t.orderDetail.handoverPh} /></div>
          <Button onClick={save} className="w-full">{t.orderDetail.saveAssign}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
