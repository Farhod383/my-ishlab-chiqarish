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
import DateInput from "@/components/DateInput";
import DailyTasksRating from "@/components/DailyTasksRating";
import { fmtDate as fmtDateG, fmtDateTime24 } from "@/lib/format";
import { currentUserName, displayUser } from "@/lib/userNames";
import { isDailyTaskEligible, isDailyTaskOrderVisible } from "@/lib/dailyTaskEligibility";
import { matchesEmployee, groupEmployees, SHIFTS, shiftLabel, type ShiftFilter } from "@/lib/dailyTaskShifts";
import { createReloader } from "@/lib/realtimeReload";

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
const fmtDT = (s: string) => fmtDateTime24(s);

export default function DailyTasksPage() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin" as any);
  const localize = useLocalize();
  const { employees, allEmployees } = useEmployees({ activeOnly: true });
  const [date, setDate] = useState(todayTashkent());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ employee_ids: [] as string[], order_id: "", task_title: "", description: "", progress: 0 });
  const [detail, setDetail] = useState<Task | null>(null);
  const [prog, setProg] = useState(0);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"tasks" | "rating" | "shifts">("tasks");
  const [aliasIds, setAliasIds] = useState<Set<string>>(new Set());
  const [shift, setShift] = useState<ShiftFilter>("all");
  const [dep, setDep] = useState("");
  const [pos, setPos] = useState("");
  const [badgeIds, setBadgeIds] = useState<Set<string>>(new Set());
  const [fDep, setFDep] = useState(""); const [fPos, setFPos] = useState(""); const [fShift, setFShift] = useState<ShiftFilter>("all"); const [fQ, setFQ] = useState("");
  const [fBadge, setFBadge] = useState<Set<string>>(new Set());
  const [shiftOverride, setShiftOverride] = useState<Record<string, number | null>>({});

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
    supabase.from("daily_task_employee_aliases" as any).select("alias_id").then(({ data }) =>
      setAliasIds(new Set(((data as any) ?? []).map((r: any) => r.alias_id))));
  }, []);
  useEffect(() => {
    const reload = createReloader(() => load(), 700); // bir nechta o'zgarish — bitta yangilash
    const ch = supabase.channel("daily-tasks-" + date).on("postgres_changes", { event: "*", schema: "public", table: "daily_tasks" }, reload.schedule).subscribe();
    return () => { reload.cancel(); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => { resolveBadge(q, setBadgeIds); }, [q]);
  useEffect(() => { resolveBadge(fQ, setFBadge); }, [fQ]);
  const shiftOf = (e: any) => (e && e.id in shiftOverride ? shiftOverride[e.id] : e?.work_shift ?? null);
  const empMap = useMemo(() => Object.fromEntries(allEmployees.map((e) => [e.id, e])), [allEmployees]);
  const orderMap = useMemo(() => Object.fromEntries(orders.map((o) => [o.id, o])), [orders]);
  const openByEmp = useMemo(() => Object.fromEntries(openTasks.map((t) => [t.employee_id, t])), [openTasks]);

  const filtered = tasks.filter((t) => {
    if (!isDailyTaskEligible(empMap[t.employee_id])) return false;
    const te = empMap[t.employee_id];
    if (te && (shift !== "all" || dep || pos) && !matchesEmployee({ ...te, work_shift: shiftOf(te) }, { shift, department: dep, position: pos, q: "" })) return false;
    if (q.trim() && badgeIds.has(t.employee_id)) return true;
    if (orderMap[t.order_id] && !isDailyTaskOrderVisible(orderMap[t.order_id])) return false;
    if (!q.trim()) return true;
    const o = orderMap[t.order_id];
    const hay = [empMap[t.employee_id]?.full_name, localize(empMap[t.employee_id]?.full_name), o?.order_number, o?.product_name, t.task_title, STATUS_LABEL[t.status]].filter(Boolean).join(" ");
    return matchesAcrossScripts(hay, q);
  });

  const st = filtered;
  const stats = {
    total: st.length,
    closed: st.filter((t) => t.status === "closed").length,
    prog: st.filter((t) => t.status === "in_progress").length,
    cancelled: st.filter((t) => t.status === "cancelled").length,
    avg: st.length ? Math.round(st.reduce((s, t) => s + t.progress, 0) / st.length) : 0,
  };

  const blockerOf = (id: string) => openByEmp[id];
  const isHardBlocked = (id: string) => { const b = openByEmp[id]; return !!b && b.task_date >= todayTashkent(); };

  const create = async () => {
    if (!form.employee_ids.length || !form.order_id || !form.task_title.trim()) { toast.error("Xodim, zakaz va topshiriqni to'ldiring"); return; }
    if (date > todayTashkent()) { toast.error("Kelajak sanaga topshiriq berib bo'lmaydi."); return; }
    const ids = form.employee_ids.filter((id) => !isHardBlocked(id));
    if (!ids.length) { toast.error("Tanlangan xodimlarning joriy topshirig'i hali yopilmagan."); return; }
    setSaving(true);
    const o = orderMap[form.order_id];
    let ok = 0; let last: any = null;
    for (const id of ids) {
      const stale = blockerOf(id);
      if (stale) {
        const { error: cErr } = await supabase.from("daily_tasks").update({ status: "closed" } as any).eq("id", stale.id);
        if (cErr) { toast.error(`${localize(empMap[id]?.full_name)}: ${cErr.message}`); continue; }
      }
      const { data, error } = await supabase.from("daily_tasks").insert({
        task_date: date, employee_id: id, order_id: form.order_id,
        task_title: form.task_title.trim(), description: form.description.trim() || null,
        progress: Math.max(0, Math.min(100, Math.round(form.progress))),
        assigned_by_name: user ? profiles[user.id] ?? currentUserName(user) : null,
      } as any).select().single();
      if (error) { toast.error(`${localize(empMap[id]?.full_name)}: ` + (error.message.includes("daily_tasks_one_open") ? "joriy topshiriq hali yopilmagan" : error.message)); continue; }
      ok++; last = data;
      await supabase.from("audit_log").insert({ actor_id: user?.id, actor_name: profiles[user?.id ?? ""] ?? currentUserName(user), action: "daily_task.create", entity: "daily_task", order_id: form.order_id, details: `${empMap[id]?.full_name} — ${form.task_title}` } as any);
    }
    setSaving(false);
    if (ok) {
      toast.success(`${ok} ta xodimga topshiriq berildi${o ? ` (#${o.order_number})` : ""}`);
      setNewOpen(false); setForm({ employee_ids: [], order_id: "", task_title: "", description: "", progress: 0 });
      if (ok === 1 && last) { setDetail(last); setProg(last.progress); }
    }
    load();
  };

  const changeShift = async (id: string, v: string) => {
    const val = v ? Number(v) : null;
    const { error } = await supabase.rpc("set_employee_work_shift" as any, { _employee_id: id, _shift: val } as any);
    if (error) { toast.error(error.message); return; }
    setShiftOverride((m) => ({ ...m, [id]: val }));
    toast.success(`${localize(empMap[id]?.full_name)} — ${shiftLabel(val)}`);
  };

  const update = async (patch: Partial<Task>, msg: string) => {
    if (!detail) return;
    setSaving(true);
    const { data, error } = await supabase.from("daily_tasks").update(patch as any).eq("id", detail.id).select().single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setDetail(data as any); toast.success(msg); load();
  };

  const orderOptions = orders.filter(isDailyTaskOrderVisible).map((o) => ({ value: o.id, label: `#${o.order_number} — ${o.product_name}` }));
  const eligible = employees.filter((e) => isDailyTaskEligible(e) && !aliasIds.has(e.id)).map((e: any) => ({ ...e, work_shift: shiftOf(e) }));
  const departments = [...new Set(eligible.map((e) => e.department).filter(Boolean))].sort() as string[];
  const positionsFor = (d: string) => [...new Set(eligible.filter((e) => !d || e.department === d).map((e) => e.position).filter(Boolean))].sort() as string[];
  const formCandidates = eligible.filter((e) => matchesEmployee(e, { shift: fShift, department: fDep, position: fPos, q: fQ, badgeIds: fBadge }, localize));
  const shiftGroups = groupEmployees(eligible.filter((e) => matchesEmployee(e, { shift, department: dep, position: pos, q, badgeIds }, localize)));
  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Kunlik topshiriqlar</h1>
        <div className="flex gap-2">
          <Button variant={view === "shifts" ? "default" : "outline"} onClick={() => setView(view === "shifts" ? "tasks" : "shifts")}>{view === "shifts" ? "Topshiriqlar" : "Xodimlar va smenalar"}</Button>
          <Button variant={view === "rating" ? "default" : "outline"} onClick={() => setView(view === "rating" ? "tasks" : "rating")}><Trophy className="h-4 w-4 mr-1" />{view === "rating" ? "Topshiriqlar" : "Reyting"}</Button>
          <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1" />Yangi topshiriq</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border overflow-hidden">
          {(["all", ...SHIFTS] as ShiftFilter[]).map((s) => (
            <button key={String(s)} type="button" onClick={() => setShift(s)} className={`px-3 h-9 text-sm ${shift === s ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{s === "all" ? "Barcha smenalar" : shiftLabel(s)}</button>
          ))}
        </div>
        <select aria-label="Bo'lim" className={sel} value={dep} onChange={(e) => { setDep(e.target.value); setPos(""); }}><option value="">Barcha bo'limlar</option>{departments.map((d) => <option key={d}>{d}</option>)}</select>
        <select aria-label="Lavozim" className={sel} value={pos} onChange={(e) => setPos(e.target.value)}><option value="">Barcha lavozimlar</option>{positionsFor(dep).map((d) => <option key={d}>{d}</option>)}</select>
      </div>

      {view === "rating" ? <DailyTasksRating empMap={empMap} orderMap={orderMap} /> : view === "shifts" ? (
        <div className="space-y-3">
          <div className="relative w-full sm:w-80"><Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" /><Input className="pl-8" placeholder="Ism, familiya yoki MCT kodi" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {!isAdmin && <p className="text-sm text-muted-foreground">Smenani faqat Admin o'zgartira oladi.</p>}
          {shiftGroups.length === 0 && <Card><CardContent className="p-6 text-center text-muted-foreground">Xodim topilmadi</CardContent></Card>}
          {shiftGroups.map((g) => (
            <Card key={g.department}><CardContent className="p-3 space-y-3">
              <div className="font-semibold">{g.department} <span className="text-muted-foreground font-normal">({g.count})</span></div>
              {g.positions.map((p) => (
                <div key={p.position} className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">{p.position} ({p.employees.length})</div>
                  {p.employees.map((e) => (
                    <div key={e.id} className="flex flex-wrap items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted/40">
                      <span className="flex-1 min-w-[160px]">{localize(e.full_name)}{openByEmp[e.id] ? " 🔒" : ""}</span>
                      {isAdmin ? (
                        <select aria-label={`Smena: ${e.full_name}`} className={sel} value={e.work_shift ?? ""} onChange={(ev) => changeShift(e.id, ev.target.value)}>
                          <option value="">Smenasiz</option>{SHIFTS.map((s) => <option key={s} value={s}>{shiftLabel(s)}</option>)}
                        </select>
                      ) : <Badge variant="outline">{shiftLabel(e.work_shift)}</Badge>}
                    </div>
                  ))}
                </div>
              ))}
            </CardContent></Card>
          ))}
        </div>
      ) : <>


      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setDate(shiftDate(date, -1))} aria-label="Oldingi kun"><ChevronLeft className="h-4 w-4" /></Button>
        <DateInput value={date} onChange={setDate} className="w-44" />
        <Button variant="outline" size="icon" onClick={() => setDate(shiftDate(date, 1))} aria-label="Keyingi kun"><ChevronRight className="h-4 w-4" /></Button>
        {date !== todayTashkent() && <Button variant="ghost" onClick={() => setDate(todayTashkent())}>Bugun</Button>}
        <span className="font-semibold ml-2">{fmtDateG(date)}</span>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Ishchi, MCT kodi, zakaz, topshiriq..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {[["Jami", stats.total], ["Yopilgan", stats.closed], ["Jarayonda", stats.prog], ["Bekor qilingan", stats.cancelled], ["O'rtacha progress", stats.avg + "%"]].map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="text-xl font-bold">{v}</div></CardContent></Card>
        ))}
      </div>

      {openTasks.length > 0 && (
        <Card className="border-status-yellow/50">
          <CardContent className="p-3 space-y-2">
            <div className="font-semibold">Ochiq qolgan topshiriqlar ({openTasks.length})</div>
            <div className="space-y-1">
              {openTasks.map((t) => {
                const e = empMap[t.employee_id]; const o = orderMap[t.order_id];
                return (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-2 py-1" onClick={() => { setDetail(t); setProg(t.progress); }}>
                    <span className="text-muted-foreground">{fmtDateG(t.task_date)}</span>
                    <span className="font-medium">{localize(e?.full_name) || "—"}</span>
                    <span className="text-muted-foreground">{o ? `#${o.order_number}` : "—"}</span>
                    <span className="flex-1 min-w-[120px]">{t.task_title}</span>
                    <span className="text-muted-foreground">{t.progress}%</span>
                    <Badge variant="outline" className={STATUS_CLS.in_progress}>{STATUS_LABEL.in_progress}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
            <div><Label>Sana</Label><DateInput value={date} onChange={setDate} className="w-44" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div><Label>Bo'lim (ixtiyoriy)</Label><select className={sel + " w-full"} value={fDep} onChange={(e) => { setFDep(e.target.value); setFPos(""); }}><option value="">Barchasi</option>{departments.map((d) => <option key={d}>{d}</option>)}</select></div>
              <div><Label>Lavozim (ixtiyoriy)</Label><select className={sel + " w-full"} value={fPos} onChange={(e) => setFPos(e.target.value)}><option value="">Barchasi</option>{positionsFor(fDep).map((d) => <option key={d}>{d}</option>)}</select></div>
              <div><Label>Smena (ixtiyoriy)</Label><select className={sel + " w-full"} value={String(fShift)} onChange={(e) => setFShift(e.target.value === "all" ? "all" : (Number(e.target.value) as ShiftFilter))}><option value="all">Barcha smenalar</option>{SHIFTS.map((s) => <option key={s} value={s}>{shiftLabel(s)}</option>)}</select></div>
            </div>
            <div data-required>
              <div className="flex items-center justify-between"><Label>Xodimlar * ({form.employee_ids.length} tanlandi)</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, employee_ids: formCandidates.filter((e) => !isHardBlocked(e.id)).map((e) => e.id) })}>Barchasini tanlash</Button></div>
              <Input placeholder="Qidiruv: ism yoki MCT kodi" value={fQ} onChange={(e) => setFQ(e.target.value)} />
              <div className="max-h-56 overflow-y-auto border rounded-md mt-1 divide-y">
                {formCandidates.length === 0 && <div className="p-3 text-sm text-muted-foreground">Xodim topilmadi</div>}
                {formCandidates.map((e) => {
                  const blocked = isHardBlocked(e.id); const checked = form.employee_ids.includes(e.id); const stale = !blocked && blockerOf(e.id);
                  return (
                    <label key={e.id} className={`flex items-start gap-2 p-2 text-sm ${blocked ? "opacity-50" : "cursor-pointer hover:bg-muted/40"}`}>
                      <input type="checkbox" className="mt-1" disabled={blocked} checked={checked} onChange={() => setForm({ ...form, employee_ids: checked ? form.employee_ids.filter((x) => x !== e.id) : [...form.employee_ids, e.id] })} />
                      <span className="flex-1"><span className="font-medium">{localize(e.full_name)}</span>
                        <span className="block text-xs text-muted-foreground">{[e.position, e.department, shiftLabel(e.work_shift), blocked ? "ochiq topshiriq bor 🔒" : stale ? "eski topshiriq joriy foizi bilan yopiladi" : null].filter(Boolean).join(" · ")}</span></span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div><Label>Zakaz *</Label><SearchableSelect value={form.order_id} onChange={(v) => setForm({ ...form, order_id: v })} placeholder="Zakazni tanlang" options={orderOptions} /></div>
            <div><Label>Ish / topshiriq *</Label><Input value={form.task_title} onChange={(e) => setForm({ ...form, task_title: e.target.value })} placeholder="Masalan: Chizma chizish" /></div>
            <div><Label>Izoh</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Boshlang'ich foiz</Label><Input type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} /></div>
            {date > todayTashkent() && <p className="text-sm text-destructive">Kelajak sanaga topshiriq berib bo'lmaydi.</p>}
            <Button className="w-full" disabled={saving || date > todayTashkent() || !form.employee_ids.length} onClick={create}>Topshiriq berish</Button>
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
                  <span className="text-muted-foreground">Sana:</span><span>{fmtDateG(detail.task_date)}</span>
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

async function resolveBadge(q: string, set: (s: Set<string>) => void) {
  const t = q.trim();
  if (!/^mct\s*\d{2,}$/i.test(t)) { set(new Set()); return; }
  const { data } = await supabase.rpc("resolve_employee_badge", { _code: t.replace(/\s+/g, "").toUpperCase() } as any);
  set(new Set(((data as any[]) ?? []).map((r) => r.id)));
}
