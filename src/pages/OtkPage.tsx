import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Search, ExternalLink, Save, ChevronLeft, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { logAudit } from "@/types/erp";
import { toast } from "sonner";
import { notify } from "@/lib/notify";

type Filter = "all" | "red" | "yellow" | "green";
type Color = "red" | "yellow" | "green" | "none";

function otkColor(s: any): "red" | "yellow" | "green" {
  if (s.qc_passed) return "green";
  if (s.otk_comment && s.otk_comment.trim()) return "yellow";
  return "red";
}

const dotCls: Record<Color, string> = { red: "bg-status-red", yellow: "bg-status-yellow", green: "bg-status-green", none: "bg-muted-foreground/40" };
const labelCls = {
  red: "text-status-red border-status-red/30 bg-status-red/10",
  yellow: "text-status-yellow border-status-yellow/30 bg-status-yellow/10",
  green: "text-status-green border-status-green/30 bg-status-green/10",
};

export default function OtkPage() {
  const { user, hasRole } = useAuth();
  const { t } = useI18n();
  const [stages, setStages] = useState<any[]>([]);
  const [ordersRaw, setOrdersRaw] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { comment: string; passed: boolean; dirty: boolean }>>({});

  const load = async () => {
    // Same data source as other modules: all active orders with their stages
    const { data } = await supabase
      .from("orders")
      .select("id, order_number, product_name, status, priority, deadline, queue_position, order_stages(*)")
      .neq("status", "cancelled")
      .order("queue_position");
    const rows = (data as any[]) ?? [];
    const flat: any[] = [];
    rows.forEach((o: any) => {
      (o.order_stages ?? []).forEach((s: any) => {
        flat.push({ ...s, order: { id: o.id, order_number: o.order_number, product_name: o.product_name, status: o.status, priority: o.priority, deadline: o.deadline } });
      });
    });
    setOrdersRaw(rows);
    setStages(flat);
    const map: any = {};
    flat.forEach((s: any) => { map[s.id] = { comment: s.otk_comment ?? "", passed: !!s.qc_passed, dirty: false }; });
    setEdit(map);
  };
  useEffect(() => { load(); }, []);

  // Group stages by order — every active order is listed, even without QC stages
  const orders = useMemo(() => {
    const byOrder = new Map<string, any[]>();
    stages.forEach((s) => { if (s.order) { const a = byOrder.get(s.order.id) ?? []; a.push(s); byOrder.set(s.order.id, a); } });
    return ordersRaw.map((o: any) => {
      const list = (byOrder.get(o.id) ?? []).slice().sort((a: any, b: any) => a.stage_order - b.stage_order);
      const counts = { red: 0, yellow: 0, green: 0 };
      list.filter((s: any) => s.qc_required).forEach((s: any) => { counts[otkColor(s)]++; });
      const hasQc = counts.red + counts.yellow + counts.green > 0;
      const worstColor: any = !hasQc ? "none" : counts.red > 0 ? "red" : counts.yellow > 0 ? "yellow" : "green";
      return { order: { id: o.id, order_number: o.order_number, product_name: o.product_name, status: o.status, priority: o.priority, deadline: o.deadline }, stages: list, worstColor, counts };
    });
  }, [stages, ordersRaw]);

  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    stages.filter((s) => s.qc_required).forEach((s) => { c[otkColor(s)]++; });
    return c;
  }, [stages]);

  const ordersCounts = useMemo(() => {
    const sets = { red: new Set<string>(), yellow: new Set<string>(), green: new Set<string>() };
    stages.forEach((s) => { if (s.qc_required && s.order?.id) sets[otkColor(s)].add(s.order.id); });
    return { red: sets.red.size, yellow: sets.yellow.size, green: sets.green.size };
  }, [stages]);

  const visibleOrders = orders.filter((o) => {
    if (filter !== "all" && o.worstColor !== filter) return false;
    if (q && !(`${o.order.order_number} ${o.order.product_name}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });


  const save = async (s: any) => {
    const e = edit[s.id];
    const patch: any = { otk_comment: e.comment || null, qc_passed: e.passed };
    if (e.passed) patch.otk_checked_at = new Date().toISOString();
    const { error } = await supabase.from("order_stages").update(patch).eq("id", s.id);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: e.passed ? "OTK o'tdi" : (e.comment ? "OTK izoh" : "OTK saqlandi"),
      entity: "stage", order_id: s.order_id, stage_id: s.id,
      details: `${s.order?.order_number} → ${s.name}: ${e.comment || (e.passed ? "o'tdi" : "")}`,
    });
    // In-app + browser notification
    await notify({
      type: e.passed ? "otk_approved" : "otk_rejected",
      title: e.passed ? `OTK tasdiqladi — ${s.order?.order_number}` : `OTK qaytarildi — ${s.order?.order_number}`,
      body: `${s.name}${e.comment ? ` · ${e.comment}` : ""}`,
      link: `/orders/${s.order_id}`,
      entity: "stage", entity_id: s.id,
      sender_id: user?.id, sender_name: user?.email,
    });
    toast.success(t.otk.save);
    load();
  };

  const canEdit = hasRole(["admin", "otk"]);
  const openedOrder = openOrderId ? orders.find((o) => o.order.id === openOrderId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6" /> {t.otk.title}</h1>
        <p className="text-sm text-muted-foreground">{t.otk.subtitle}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(["red", "yellow", "green"] as const).map((c) => (
          <Card key={c} className={`cursor-pointer ${filter === c ? "ring-2 ring-primary" : ""}`} onClick={() => setFilter(filter === c ? "all" : c)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className={`text-xs uppercase tracking-wide font-semibold ${c === "red" ? "text-status-red" : c === "yellow" ? "text-status-yellow" : "text-status-green"}`}>
                  {c === "red" ? t.otk.notChecked : c === "yellow" ? t.otk.commentOnly : t.otk.passed}
                </div>
                <div className="text-2xl font-bold mt-1 leading-none">{counts[c]} <span className="text-xs text-muted-foreground font-normal">ta tekshiruv</span></div>
                <div className="text-sm text-muted-foreground mt-1">{ordersCounts[c]} ta zakaz</div>
              </div>
              <div className={`h-10 w-10 rounded-full ${dotCls[c]}`} />
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
                  <TabsTrigger value="all">{t.common.all}</TabsTrigger>
                  <TabsTrigger value="red">🔴</TabsTrigger>
                  <TabsTrigger value="yellow">🟡</TabsTrigger>
                  <TabsTrigger value="green">🟢</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 w-64" placeholder={t.common.search} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {visibleOrders.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">—</p>}
            {visibleOrders.map((o) => (
              <Card
                key={o.order.id}
                className="cursor-pointer hover:bg-muted/30 border-l-4"
                style={{ borderLeftColor: o.worstColor === "red" ? "hsl(var(--status-red))" : o.worstColor === "yellow" ? "hsl(var(--status-yellow))" : o.worstColor === "green" ? "hsl(var(--status-green))" : "hsl(var(--border))" }}
                onClick={() => setOpenOrderId(o.order.id)}
              >
                <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`h-3 w-3 rounded-full shrink-0 ${dotCls[o.worstColor]}`} />
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-primary text-sm">{o.order.order_number}</div>
                      <div className="text-sm font-medium truncate">{o.order.product_name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {o.counts.red > 0 && <Badge className={labelCls.red} variant="outline">🔴 {o.counts.red}</Badge>}
                    {o.counts.yellow > 0 && <Badge className={labelCls.yellow} variant="outline">🟡 {o.counts.yellow}</Badge>}
                    {o.counts.green > 0 && <Badge className={labelCls.green} variant="outline">🟢 {o.counts.green}</Badge>}
                    {o.worstColor === "none" && <Badge variant="outline" className="text-muted-foreground">OTK bosqichi yo'q</Badge>}
                    <span className="text-muted-foreground">{o.stages.length} {t.otk.stage}</span>
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
                <ChevronLeft className="h-4 w-4 mr-1" /> {t.orderDetail.backToList}
              </Button>
              <Link to={`/orders/${openedOrder.order.id}`} className="text-sm text-primary hover:underline flex items-center gap-1 font-mono">
                {openedOrder.order.order_number} · {openedOrder.order.product_name} <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {/* vertical timeline */}
            <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-[10px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
              {openedOrder.stages.map((s) => {
                const color = s.qc_required ? otkColor(s) : ("none" as const);
                const e = edit[s.id] ?? { comment: "", passed: false, dirty: false };
                const Icon = color === "green" ? CheckCircle2 : color === "yellow" ? AlertCircle : Circle;
                const iconCls = color === "green" ? "text-status-green" : color === "yellow" ? "text-status-yellow" : color === "red" ? "text-status-red" : "text-muted-foreground";
                const stageEditable = canEdit && s.qc_required;
                return (
                  <div key={s.id} className="relative">
                    <Icon className={`h-5 w-5 absolute -left-6 top-3 bg-background ${iconCls}`} />
                    <Card className="border-l-4" style={{ borderLeftColor: color === "red" ? "hsl(var(--status-red))" : color === "yellow" ? "hsl(var(--status-yellow))" : color === "green" ? "hsl(var(--status-green))" : "hsl(var(--border))" }}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div>
                            <div className="text-xs text-muted-foreground">Bosqich {s.stage_order}</div>
                            <div className="font-semibold">{s.name}</div>
                          </div>
                          <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${color === "none" ? "text-muted-foreground" : labelCls[color]}`}>
                            <span className={`h-2 w-2 rounded-full ${dotCls[color]}`} />
                            {color === "red" ? t.otk.notChecked : color === "yellow" ? t.otk.commentOnly : color === "green" ? t.otk.passed : "OTK talab qilinmaydi"}
                          </div>
                        </div>
                        <div>
                          <CardDescription className="text-xs mb-1">{t.otk.comment}</CardDescription>
                          <Textarea
                            rows={2} disabled={!stageEditable} value={e.comment}
                            onChange={(ev) => setEdit({ ...edit, [s.id]: { ...e, comment: ev.target.value, dirty: true } })}
                            placeholder={t.otk.placeholder}
                          />
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox disabled={!stageEditable} checked={e.passed}
                              onCheckedChange={(v) => setEdit({ ...edit, [s.id]: { ...e, passed: !!v, dirty: true } })} />
                            <span>{t.otk.checkPassed}</span>
                          </label>
                          {stageEditable && (
                            <Button size="sm" disabled={!e.dirty} onClick={() => save(s)}>
                              <Save className="h-3.5 w-3.5 mr-1" /> {t.otk.save}
                            </Button>
                          )}
                        </div>
                        {s.otk_checked_at && (
                          <div className="text-[11px] text-muted-foreground">{t.otk.lastApprove}: {new Date(s.otk_checked_at).toLocaleString()}</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
