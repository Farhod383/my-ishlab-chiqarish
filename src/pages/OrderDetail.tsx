import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { useAuth } from "@/auth/AuthContext";
import { logAudit, type OrderRow, type StageRow, type OrderPartRow, type AuditLogRow } from "@/types/erp";
import { ArrowLeft, CheckCircle2, Play, FileText, Image as ImageIcon, AlertTriangle, ShieldCheck, Loader2, ClipboardList } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, hasRole } = useAuth();
  const [order, setOrder] = useState<(OrderRow & { client?: any }) | null>(null);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [parts, setParts] = useState<OrderPartRow[]>([]);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    const [o, s, p, l, mv, w] = await Promise.all([
      supabase.from("orders").select("*, client:clients(*)").eq("id", id).single(),
      supabase.from("order_stages").select("*").eq("order_id", id).order("stage_order"),
      supabase.from("order_parts").select("*").eq("order_id", id),
      supabase.from("audit_log").select("*").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("stock_movements").select("*, product:products(name, unit)").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, department"),
    ]);
    setOrder(o.data as any);
    setStages(s.data ?? []);
    setParts(p.data ?? []);
    setLogs(l.data ?? []);
    setMovements(mv.data ?? []);
    setWorkers(w.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const startStage = async (stage: StageRow) => {
    // Only allow if previous stages completed
    const prev = stages.find((x) => x.stage_order === stage.stage_order - 1);
    if (prev && prev.status !== "completed") { toast.error("Avval oldingi bosqichni tugating"); return; }
    await supabase.from("order_stages").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", stage.id);
    if (order?.status === "pending") await supabase.from("orders").update({ status: "in_progress" }).eq("id", order.id);
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Bosqich boshlandi", entity: "stage", order_id: order!.id, stage_id: stage.id, details: stage.name });
    load();
  };

  const finishStage = async (stage: StageRow) => {
    if (stage.qc_required && !stage.qc_passed) { toast.error("Avval QC tasdiqlang"); return; }
    await supabase.from("order_stages").update({ status: "completed", finished_at: new Date().toISOString() }).eq("id", stage.id);
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Bosqich tugatildi", entity: "stage", order_id: order!.id, stage_id: stage.id, details: stage.name });
    // Check if all completed
    const others = stages.filter((x) => x.id !== stage.id);
    if (others.every((x) => x.status === "completed")) {
      await supabase.from("orders").update({ status: "completed" }).eq("id", order!.id);
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Zakaz tugatildi", entity: "order", order_id: order!.id, details: order!.order_number });
    }
    load();
  };

  const setQC = async (stage: StageRow, val: boolean) => {
    await supabase.from("order_stages").update({ qc_passed: val }).eq("id", stage.id);
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: val ? "QC o'tdi" : "QC bekor", entity: "stage", order_id: order!.id, stage_id: stage.id, details: stage.name });
    load();
  };

  const assignWorker = async (stage: StageRow, workerId: string) => {
    const oldWorker = workers.find((w) => w.id === stage.worker_id);
    const newWorker = workers.find((w) => w.id === workerId);
    const comment = stage.worker_id && stage.worker_id !== workerId
      ? `Ishchi almashtirildi: ${oldWorker?.full_name ?? "—"} → ${newWorker?.full_name ?? "—"}` : null;
    await supabase.from("order_stages").update({ worker_id: workerId, worker_changed_comment: comment ?? stage.worker_changed_comment }).eq("id", stage.id);
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: comment ? "Ishchi almashtirildi" : "Ishchi biriktirildi", entity: "stage", order_id: order!.id, stage_id: stage.id, details: `${stage.name}: ${newWorker?.full_name}` });
    load();
  };

  if (loading || !order) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const today = new Date(); today.setHours(0,0,0,0);
  const dl = new Date(order.deadline); dl.setHours(0,0,0,0);
  const daysLeft = Math.ceil((dl.getTime() - today.getTime()) / 86400000);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> Orqaga</Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{order.order_number}</h1>
              <PriorityBadge priority={order.priority} />
              <StatusBadge status={order.status as any} />
            </div>
            <p className="text-sm text-muted-foreground">{order.product_name} · {order.quantity} {order.client?.unit ?? "dona"} · Klient: {order.client?.name ?? "—"}</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Yaratilgan</div><div className="font-semibold">{order.order_date}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Muddat</div><div className="font-semibold">{order.deadline}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Qolgan kun</div><div className={`font-bold text-lg ${daysLeft < 0 ? "text-status-red" : daysLeft <= 2 ? "text-status-yellow" : "text-status-green"}`}>{daysLeft < 0 ? `${Math.abs(daysLeft)} kun kechikkan` : `${daysLeft} kun`}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Bosqichlar</div><div className="font-semibold">{stages.filter(s => s.status === "completed").length} / {stages.length}</div></CardContent></Card>
      </div>

      {(order.tz_file_url || order.product_image_url) && (
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-4">
            {order.product_image_url && (
              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Mahsulot rasmi</div>
                <img src={order.product_image_url} alt={order.product_name} className="h-28 w-28 object-cover rounded border" />
              </div>
            )}
            {order.tz_file_url && (
              <a href={order.tz_file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline self-start mt-5">
                <FileText className="h-4 w-4" /> TZ faylni ochish
              </a>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Bosqichlar (timeline)</TabsTrigger>
          <TabsTrigger value="warehouse">Sklad</TabsTrigger>
          <TabsTrigger value="movements">Sklad harakati</TabsTrigger>
          <TabsTrigger value="log">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-3 mt-4">
          {stages.map((s, idx) => {
            const prev = stages[idx - 1];
            const canStart = !prev || prev.status === "completed";
            const worker = workers.find((w) => w.id === s.worker_id);
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
                            <Badge variant="outline" className="border-primary/30 text-primary"><ShieldCheck className="h-3 w-3 mr-1" />QC</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">Norma: {s.norm_days} kun · Ishchi: {worker?.full_name ?? "—"} {worker?.department && `(${worker.department})`}</div>
                        {s.worker_changed_comment && <div className="text-xs text-status-yellow mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{s.worker_changed_comment}</div>}
                        {s.started_at && <div className="text-xs text-muted-foreground mt-1">Boshlandi: {new Date(s.started_at).toLocaleString("uz-UZ")}</div>}
                        {s.finished_at && <div className="text-xs text-muted-foreground">Tugadi: {new Date(s.finished_at).toLocaleString("uz-UZ")}</div>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0 min-w-[200px]">
                      {hasRole(["worker", "manager", "marketing", "admin"]) && (
                        <Select value={s.worker_id ?? ""} onValueChange={(v) => assignWorker(s, v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Ishchi tanlash" /></SelectTrigger>
                          <SelectContent>{workers.map((w) => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                      {s.qc_required && s.status !== "pending" && (
                        <label className="flex items-center gap-2 text-xs"><Checkbox checked={!!s.qc_passed} onCheckedChange={(v) => setQC(s, !!v)} /> QC o'tdi</label>
                      )}
                      <div className="flex gap-2">
                        {s.status === "pending" && canStart && hasRole(["worker", "manager", "admin"]) && (
                          <Button size="sm" variant="outline" onClick={() => startStage(s)}><Play className="h-3 w-3 mr-1" />Boshlash</Button>
                        )}
                        {s.status === "in_progress" && hasRole(["worker", "manager", "admin"]) && (
                          <Button size="sm" onClick={() => finishStage(s)}><CheckCircle2 className="h-3 w-3 mr-1" />Tugatish</Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="warehouse" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Detallar normasi va sarfi</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {parts.length === 0 && <p className="text-sm text-muted-foreground">Bu zakaz uchun detal kiritilmagan</p>}
              {parts.map((p) => {
                const diff = Number(p.actual_qty) - Number(p.norm_qty);
                const over = diff > 0;
                return (
                  <div key={p.id} className={`flex items-center justify-between p-3 rounded border ${over ? "bg-status-red/5 border-status-red/30" : ""}`}>
                    <div>
                      <div className="font-medium text-sm">{p.part_name}</div>
                      <div className="text-xs text-muted-foreground">Norma: {p.norm_qty} {p.unit}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold">{p.actual_qty} {p.unit}</div>
                      <div className={`text-xs ${over ? "text-status-red font-semibold" : "text-muted-foreground"}`}>
                        {over && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                        Farq: {diff > 0 ? "+" : ""}{diff.toFixed(1)}
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
            <CardHeader><CardTitle className="text-base">Sklad chiqimlari/kirimlari</CardTitle><CardDescription>Kim oldi, qancha, qachon</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {movements.length === 0 && <p className="text-sm text-muted-foreground">Harakatlar yo'q</p>}
              {movements.map((m) => (
                <div key={m.id} className="text-sm border-l-2 border-primary/40 pl-3 py-1">
                  <div><span className="font-medium">{m.product?.name}</span> — <span className="font-mono">{m.direction === "out" ? "-" : "+"}{m.quantity} {m.product?.unit}</span></div>
                  <div className="text-xs text-muted-foreground">Qabul qildi: {m.recipient_name ?? "—"} · {new Date(m.created_at).toLocaleString("uz-UZ")}</div>
                  {m.comment && <div className="text-xs text-muted-foreground italic">"{m.comment}"</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Audit log</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {logs.map((l) => (
                <div key={l.id} className="text-sm border-l-2 border-border pl-3 py-1">
                  <div><span className="font-semibold">{l.action}</span> — <span className="text-muted-foreground">{l.actor_name ?? "Tizim"}</span></div>
                  {l.details && <div className="text-xs text-muted-foreground">{l.details}</div>}
                  <div className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString("uz-UZ")}</div>
                </div>
              ))}
              {logs.length === 0 && <p className="text-sm text-muted-foreground">Yozuvlar yo'q</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
