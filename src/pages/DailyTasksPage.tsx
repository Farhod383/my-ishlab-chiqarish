import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { useLocalize } from "@/i18n/context";
import { useEmployees } from "@/hooks/useEmployees";
import SearchableSelect from "@/components/SearchableSelect";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus, Lock, RotateCcw, Ban, Search, Trophy } from "lucide-react";
import { toast } from "sonner";
import { matchesAcrossScripts } from "@/lib/translit";
import DailyTasksRating from "@/components/DailyTasksRating";

type Status = "in_progress" | "closed" | "cancelled";
interface Task {
  id: string; task_date: string; employee_id: string; order_id: string;
  assigned_by: string | null; assigned_by_name: string | null;
  task_title: string; description: string | null; progress: number;
  status: Status; created_at: string; closed_at: string | null;
}
interface Order { id: string; order_number: string; product_name: string; status: string }

const STATUS_LABEL: Record<Status, string> = { in_progress: "Jarayonda", closed: "Yopilgan", cancelled: "Bekor qilingan" };
const STATUS_CLS: Record<Status, string> = {
  in_progress: "bg-status-yellow/20 text-foreground border-status-yellow/50",
  closed: "bg-status-green/20 text-status-green-ink border-status-green/50",
  cancelled: "bg-muted text-muted-foreground",
};

const todayTashkent = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const shiftDate = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const fmtDate = (d: string) => d.split("-").reverse().join(".");
const fmtDT = (s: string) => new Date(s).toLocaleString("ru-RU", { hour12: false, timeZone: "Asia/Tashkent" });

export default function DailyTasksPage() {
  const { user } = useAuth();
  const localize = useLocalize();
  const { employees, allEmployees } = useEmployees({ activeOnly: true });
  const [date, setDate] = useState(todayTashkent());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ employee_id: "", order_id: "", task_title: "", description: "", progress: 0 });
  const [detail, setDetail] = useState<Task | null>(null);
  const [prog, setProg] = useState(0);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"tasks" | "rating">("tasks");

  const load = async () => {
    const [{ data: t }, { data: o }] = await Promise.all([
      supabase.from("daily_tasks").select("*").eq("task_date", date).order("created_at"),
      supabase.from("daily_tasks").select("*").eq("status", "in_progress"),
    ]);
    setTasks((t as any) ?? []); setOpenTasks((o as any) ?? []);
  };
  useEffect(() => { load(); }, [date]);
  useEffect(() => {
    supabase.from("orders").select("id,order_number,product_name,status").order("created_at", { ascending: false })
      .then(({ data }) => setOrders((data as any) ?? []));
    supabase.from("profiles").select("id,full_name").then(({ data }) =>
      setProfiles(Object.fromEntries(((data as any) ?? []).map((p: any) => [p.id, p.full_name]))));
  }, []);
  useEffect(() => {
    const ch = supabase.channel("daily-tasks-" + date).on("postgres_changes", { event: "*", schema: "public", table: "daily_tasks" }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const empMap = useMemo(() => Object.fromEntries(allEmployees.map((e) => [e.id, e])), [allEmployees]);
  const orderMap = useMemo(() => Object.fromEntries(orders.map((o) => [o.id, o])), [orders]);
  const openByEmp = useMemo(() => Object.fromEntries(openTasks.map((t) => [t.employee_id, t])), [openTasks]);

  const filtered = tasks.filter((t) => {
    if (!q.trim()) return true;
    const o = orderMap[t.order_id];
    const hay = [empMap[t.employee_id]?.full_name, localize(empMap[t.employee_id]?.full_name), o?.order_number, o?.product_name, t.task_title, STATUS_LABEL[t.status]].filter(Boolean).join(" ");
    return matchesAcrossScripts(hay, q);
  });

  const stats = {
    total: tasks.length,
    closed: tasks.filter((t) => t.status === "closed").length,
    prog: tasks.filter((t) => t.status === "in_progress").length,
    cancelled: tasks.filter((t) => t.status === "cancelled").length,
    avg: tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0,
  };

  const blockedFor = form.employee_id ? openByEmp[form.employee_id] : undefined;

  const create = async () => {
    if (!form.employee_id || !form.order_id || !form.task_title.trim()) { toast.error("Ishchi, zakaz va topshiriqni to'ldiring"); return; }
    if (blockedFor) { toast.error("Bu xodimning joriy topshirig'i hali yopilmagan. Avval mavjud topshiriqni yakunlang."); return; }
    setSaving(true);
    const { data, error } = await supabase.from("daily_tasks").insert({
      task_date: date, employee_id: form.employee_id, order_id: form.order_id,
      task_title: form.task_title.trim(), description: form.description.trim() || null,
      progress: Math.max(0, Math.min(100, Math.round(form.progress))),
      assigned_by_name: user ? profiles[user.id] ?? user.email : null,
    } as any).select().single();
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("daily_tasks_one_open") ? "Bu xodimning joriy topshirig'i hali yopilmagan. Avval mavjud topshiriqni yakunlang." : error.message);
      return;
    }
    const o = orderMap[form.order_id];
    await supabase.from("audit_log").insert({ actor_id: user?.id, actor_name: profiles[user?.id ?? ""] ?? user?.email, action: "daily_task.create", entity: "daily_task", order_id: form.order_id, details: `${empMap[form.employee_id]?.full_name} — ${form.task_title}` } as any);
    toast.success(`Topshiriq berildi${o ? ` (#${o.order_number})` : ""}`);
    setNewOpen(false); setForm({ employee_id: "", order_id: "", task_title: "", description: "", progress: 0 });
    setDetail(data as any); setProg((data as any).progress);
    load();
  };

  const update = async (patch: Partial<Task>, msg: string) => {
    if (!detail) return;
    setSaving(true);
    const { data, error } = await supabase.from("daily_tasks").update(patch as any).eq("id", detail.id).select().single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setDetail(data as any); toast.success(msg); load();
  };

  const orderOptions = orders.filter((o) => o.status !== "cancelled").map((o) => ({ value: o.id, label: `#${o.order_number} — ${o.product_name}` }));
  const empOptions = employees.map((e) => ({
    value: e.id, label: localize(e.full_name) + (openByEmp[e.id] ? " 🔒" : ""),
    hint: [e.position, e.department, openByEmp[e.id] ? "ochiq topshiriq bor" : null].filter(Boolean).join(" · "),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Kunlik topshiriqlar</h1>
        <div className="flex gap-2">
          <Button variant={view === "rating" ? "default" : "outline"} onClick={() => setView(view === "rating" ? "tasks" : "rating")}><Trophy className="h-4 w-4 mr-1" />{view === "rating" ? "Topshiriqlar" : "Reyting"}</Button>
          <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1" />Yangi topshiriq</Button>
        </div>
      </div>

      {view === "rating" ? <DailyTasksRating empMap={empMap} orderMap={orderMap} /> : <>


      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setDate(shiftDate(date, -1))} aria-label="Oldingi kun"><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-44" />
        <Button variant="outline" size="icon" onClick={() => setDate(shiftDate(date, 1))} aria-label="Keyingi kun"><ChevronRight className="h-4 w-4" /></Button>
        {date !== todayTashkent() && <Button variant="ghost" onClick={() => setDate(todayTashkent())}>Bugun</Button>}
        <span className="font-semibold ml-2">{fmtDate(date)}</span>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Ishchi, zakaz, topshiriq, status..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[["Jami", stats.total], ["Yopilgan", stats.closed], ["Jarayonda", stats.prog], ["Bekor qilingan", stats.cancelled], ["O'rtacha progress", stats.avg + "%"]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="text-xl font-bold">{v}</div></CardContent></Card>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <Card><CardContent className="p-6 text-center text-muted-foreground">Bu kun uchun topshiriq yo'q</CardContent></Card>}
        {filtered.map((t, i) => {
          const e = empMap[t.employee_id]; const o = orderMap[t.order_id];
          return (
            <Card key={t.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { setDetail(t); setProg(t.progress); }}>
              <CardContent className="p-3 flex flex-wrap items-center gap-3">
                <span className="text-muted-foreground w-6">{i + 1}.</span>
                <div className="min-w-[180px] flex-1">
                  <div className="font-semibold">{localize(e?.full_name) || "—"}</div>
                  <div className="text-xs text-muted-foreground">{o ? `#${o.order_number} · ${o.product_name}` : "—"}</div>
                </div>
                <div className="flex-1 min-w-[160px]">{t.task_title}</div>
                <div className="w-40">
                  <div className="text-xs text-muted-foreground">Bajarilish: {t.progress}%</div>
                  <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${t.progress}%` }} /></div>
                </div>
                <Badge variant="outline" className={STATUS_CLS[t.status]}>{STATUS_LABEL[t.status]}</Badge>
              </CardContent>
            </Card>
          );
        })}
      </div>
      </>}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Yangi topshiriq</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Sana</Label><Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
            <div><Label>Ishchi *</Label>
              <SearchableSelect value={form.employee_id} onChange={(v) => setForm({ ...form, employee_id: v })} placeholder="Xodimni tanlang" options={empOptions} />
              {blockedFor && <p className="text-sm text-destructive mt-1">Bu xodimning joriy topshirig'i hali yopilmagan ({fmtDate(blockedFor.task_date)}: {blockedFor.task_title}, {blockedFor.progress}%). Avval mavjud topshiriqni yakunlang.</p>}
            </div>
            <div><Label>Zakaz *</Label><SearchableSelect value={form.order_id} onChange={(v) => setForm({ ...form, order_id: v })} placeholder="Zakazni tanlang" options={orderOptions} /></div>
            <div><Label>Ish / topshiriq *</Label><Input value={form.task_title} onChange={(e) => setForm({ ...form, task_title: e.target.value })} placeholder="Masalan: Chizma chizish" /></div>
            <div><Label>Izoh</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Boshlang'ich foiz</Label><Input type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} /></div>
            <Button className="w-full" disabled={saving || !!blockedFor} onClick={create}>Topshiriq berish</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent>
          {detail && (() => {
            const e = empMap[detail.employee_id]; const o = orderMap[detail.order_id];
            return (
              <>
                <DialogHeader><DialogTitle>Topshiriq</DialogTitle></DialogHeader>
                <div className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
                  <span className="text-muted-foreground">Ishchi:</span><span className="font-semibold">{localize(e?.full_name)}</span>
                  <span className="text-muted-foreground">Zakaz:</span><span>{o ? `#${o.order_number}` : "—"}</span>
                  <span className="text-muted-foreground">Mahsulot:</span><span>{o?.product_name ?? "—"}</span>
                  <span className="text-muted-foreground">Bajarishi kerak:</span><span className="font-semibold">{detail.task_title}</span>
                  {detail.description && <><span className="text-muted-foreground">Izoh:</span><span>{detail.description}</span></>}
                  <span className="text-muted-foreground">Sana:</span><span>{fmtDate(detail.task_date)}</span>
                  <span className="text-muted-foreground">Bergan:</span><span>{detail.assigned_by_name ?? (detail.assigned_by ? profiles[detail.assigned_by] : "—")}</span>
                  <span className="text-muted-foreground">Status:</span><span><Badge variant="outline" className={STATUS_CLS[detail.status]}>{STATUS_LABEL[detail.status]}</Badge></span>
                  {detail.closed_at && <><span className="text-muted-foreground">Yopilgan:</span><span>{fmtDT(detail.closed_at)}</span></>}
                </div>
                <div className="space-y-2 pt-2">
                  <Label>Progress: {prog}%</Label>
                  <input type="range" min={0} max={100} value={prog} onChange={(ev) => setProg(Number(ev.target.value))} className="w-full accent-primary" />
                  <div className="flex gap-2">
                    <Input type="number" min={0} max={100} value={prog} onChange={(ev) => setProg(Math.max(0, Math.min(100, Number(ev.target.value))))} className="w-24" />
                    <Button variant="outline" disabled={saving || prog === detail.progress} onClick={() => update({ progress: prog }, "Progress saqlandi")}>Progressni saqlash</Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {detail.status === "in_progress" ? (
                    <>
                      <Button className="bg-status-green-ink text-primary-foreground hover:bg-status-green-ink/90" disabled={saving}
                        onClick={() => update({ status: "closed", ...(prog !== detail.progress ? { progress: prog } : {}) }, "Topshiriq yopildi")}>
                        <Lock className="h-4 w-4 mr-1" />Topshiriqni yopish
                      </Button>
                      <Button variant="outline" disabled={saving} onClick={() => confirm("Topshiriqni bekor qilasizmi?") && update({ status: "cancelled" }, "Bekor qilindi")}>
                        <Ban className="h-4 w-4 mr-1" />Bekor qilish
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" disabled={saving} onClick={() => update({ status: "in_progress" }, "Qayta ochildi")}>
                      <RotateCcw className="h-4 w-4 mr-1" />Qayta ochish
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
