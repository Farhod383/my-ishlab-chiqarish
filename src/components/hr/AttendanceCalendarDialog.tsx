import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, LogIn, LogOut, Clock, CalendarDays, CheckCircle2, AlertTriangle, XCircle, Plane } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { toast } from "sonner";
import { logAudit } from "@/types/erp";

type AttRow = {
  id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: "present" | "late" | "absent" | "leave" | string;
  shift_start: string;
  shift_end: string;
  note: string | null;
};

const STATUS_META: Record<string, { label: string; color: string; ring: string; icon: any }> = {
  present: { label: "Kelgan",     color: "bg-emerald-500", ring: "ring-emerald-500/30", icon: CheckCircle2 },
  late:    { label: "Kech qolgan", color: "bg-amber-500",  ring: "ring-amber-500/30",   icon: AlertTriangle },
  absent:  { label: "Kelmagan",    color: "bg-rose-500",   ring: "ring-rose-500/30",    icon: XCircle },
  leave:   { label: "Ta'tilda",    color: "bg-sky-500",    ring: "ring-sky-500/30",     icon: Plane },
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS_UZ = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
const DOW_UZ = ["Du","Se","Ch","Pa","Ju","Sh","Ya"];

function toLocalTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hoursBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3600000);
}

function isLate(check_in: string | null, shift_start: string): boolean {
  if (!check_in) return false;
  const d = new Date(check_in);
  const [h, m] = shift_start.split(":").map(Number);
  const start = new Date(d); start.setHours(h, m, 0, 0);
  // 10 min grace
  return d.getTime() > start.getTime() + 10 * 60000;
}

function isEarly(check_out: string | null, shift_end: string): boolean {
  if (!check_out) return false;
  const d = new Date(check_out);
  const [h, m] = shift_end.split(":").map(Number);
  const end = new Date(d); end.setHours(h, m, 0, 0);
  return d.getTime() < end.getTime() - 10 * 60000;
}

interface Props {
  employee: { id: string; full_name: string } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export default function AttendanceCalendarDialog({ employee, open, onOpenChange }: Props) {
  const { user, hasRole } = useAuth();
  const canEdit = hasRole(["admin", "hr"]);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [rows, setRows] = useState<AttRow[]>([]);
  const [allRows, setAllRows] = useState<Record<string, AttRow>>({});
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() => ymd(new Date()));
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<AttRow>>({});

  const monthStart = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1), [cursor]);
  const monthEnd = useMemo(() => new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), [cursor]);
  const daysInMonth = monthEnd.getDate();
  // Monday=0..Sunday=6
  const firstDow = (monthStart.getDay() + 6) % 7;

  const load = async () => {
    if (!employee) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("attendance")
      .select("*")
      .eq("employee_id", employee.id)
      .gte("date", ymd(monthStart))
      .lte("date", ymd(monthEnd));
    if (error) { toast.error(error.message); setLoading(false); return; }
    setRows((data ?? []) as AttRow[]);
    setLoading(false);
  };

  useEffect(() => { if (open && employee) load(); /* eslint-disable-next-line */ }, [open, employee?.id, cursor]);

  const byDate = useMemo(() => {
    const m: Record<string, AttRow> = {};
    rows.forEach(r => { m[r.date] = r; });
    return m;
  }, [rows]);

  const today = ymd(new Date());
  const todayRow = byDate[today];

  // Monthly stats
  const stats = useMemo(() => {
    let present = 0, late = 0, absent = 0, leave = 0, hours = 0;
    rows.forEach(r => {
      if (r.status === "present") present++;
      else if (r.status === "late") late++;
      else if (r.status === "absent") absent++;
      else if (r.status === "leave") leave++;
      hours += hoursBetween(r.check_in, r.check_out);
    });
    return { present, late, absent, leave, hours };
  }, [rows]);

  const selectedRow = byDate[selectedDate];
  const selectedIsFuture = selectedDate > today;

  const openEdit = (dateStr: string) => {
    if (!canEdit) return;
    const existing = byDate[dateStr];
    setEditForm(existing ? { ...existing } : {
      date: dateStr,
      status: "present",
      shift_start: "09:00",
      shift_end: "18:00",
      check_in: null, check_out: null, note: "",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!employee || !editForm.date) return;
    // auto-derive status from times if not manually set to leave/absent
    let status = editForm.status ?? "present";
    if (status !== "leave" && status !== "absent") {
      status = editForm.check_in && isLate(editForm.check_in as string, editForm.shift_start as string) ? "late" : "present";
    }
    const payload = {
      employee_id: employee.id,
      date: editForm.date,
      check_in: editForm.check_in || null,
      check_out: editForm.check_out || null,
      status,
      shift_start: editForm.shift_start || "09:00",
      shift_end: editForm.shift_end || "18:00",
      note: (editForm.note as string)?.trim() || null,
      created_by: user?.id,
    };
    const { error } = await supabase.from("attendance").upsert(payload, { onConflict: "employee_id,date" });
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Davomat yangilandi", entity: "attendance",
      details: `${employee.full_name} — ${editForm.date} (${STATUS_META[status]?.label ?? status})`,
    });
    toast.success("Saqlandi");
    setEditOpen(false);
    load();
  };

  const quickCheckIn = async () => {
    if (!employee) return;
    const now = new Date().toISOString();
    const payload = {
      employee_id: employee.id,
      date: today,
      check_in: now,
      status: isLate(now, "09:00") ? "late" : "present",
      shift_start: "09:00", shift_end: "18:00",
      created_by: user?.id,
    };
    const { error } = await supabase.from("attendance").upsert(payload, { onConflict: "employee_id,date" });
    if (error) { toast.error(error.message); return; }
    toast.success("Kirish qayd etildi");
    load();
  };
  const quickCheckOut = async () => {
    if (!employee || !todayRow) { toast.error("Avval kirishni qayd eting"); return; }
    const { error } = await supabase.from("attendance")
      .update({ check_out: new Date().toISOString() })
      .eq("id", todayRow.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Chiqish qayd etildi");
    load();
  };

  // Local time input helpers (datetime-local format)
  const toLocalInput = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const fromLocalInput = (s: string) => s ? new Date(s).toISOString() : null;

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0">
        <div className="p-5 border-b bg-gradient-to-br from-primary/5 to-transparent">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5 text-primary" />
              Davomat — {employee.full_name}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-5">
          {/* Month nav */}
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-lg font-semibold">{MONTHS_UZ[cursor.getMonth()]} {cursor.getFullYear()}</div>
            <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {Object.entries(STATUS_META).map(([k, m]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${m.color}`} />
                <span className="text-muted-foreground">{m.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-muted border" />
              <span className="text-muted-foreground">Kelajak</span>
            </div>
          </div>

          {/* Calendar grid */}
          <div className="rounded-xl border bg-card p-3">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-1">
              {DOW_UZ.map(d => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${cursor.getFullYear()}-${pad(cursor.getMonth()+1)}-${pad(day)}`;
                const r = byDate[dateStr];
                const isFuture = dateStr > today;
                const isToday = dateStr === today;
                const meta = r ? STATUS_META[r.status] : null;
                const isSelected = selectedDate === dateStr;
                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    onDoubleClick={() => openEdit(dateStr)}
                    className={`
                      relative aspect-square rounded-lg text-sm font-medium
                      transition-all flex flex-col items-center justify-center
                      ${isSelected ? "ring-2 ring-primary" : ""}
                      ${isFuture && !r ? "bg-muted/40 text-muted-foreground" : ""}
                      ${meta ? `${meta.color} text-white shadow-sm hover:opacity-90` : "bg-background hover:bg-muted border"}
                      ${isToday ? "outline outline-2 outline-offset-1 outline-primary" : ""}
                    `}
                    title={r ? `${meta?.label} • ${toLocalTime(r.check_in)}—${toLocalTime(r.check_out)}` : (isFuture ? "Kelajak" : "Ma'lumot yo'q")}
                  >
                    <span>{day}</span>
                    {r?.check_in && (
                      <span className="text-[9px] opacity-90 leading-none mt-0.5">{toLocalTime(r.check_in)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected day details */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">
                  {selectedDate} {selectedIsFuture && <Badge variant="outline" className="ml-2">Kelajak</Badge>}
                </div>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => openEdit(selectedDate)}>
                    {selectedRow ? "Tahrirlash" : "Qo'shish"}
                  </Button>
                )}
              </div>
              {selectedRow ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <Stat label="Holat" value={<Badge className={`${STATUS_META[selectedRow.status]?.color} text-white border-0`}>{STATUS_META[selectedRow.status]?.label ?? selectedRow.status}</Badge>} />
                  <Stat label="Smena" value={`${selectedRow.shift_start.slice(0,5)} — ${selectedRow.shift_end.slice(0,5)}`} />
                  <Stat label="Kirgan" value={toLocalTime(selectedRow.check_in)} />
                  <Stat label="Chiqgan" value={toLocalTime(selectedRow.check_out)} />
                  <Stat label="Jami soat" value={`${hoursBetween(selectedRow.check_in, selectedRow.check_out).toFixed(2)} soat`} />
                  <Stat label="Belgi" value={
                    <div className="flex gap-1 flex-wrap">
                      {isLate(selectedRow.check_in, selectedRow.shift_start) && <Badge variant="outline" className="text-amber-600 border-amber-500/40">Kech qolgan</Badge>}
                      {isEarly(selectedRow.check_out, selectedRow.shift_end) && <Badge variant="outline" className="text-rose-600 border-rose-500/40">Erta ketgan</Badge>}
                      {!isLate(selectedRow.check_in, selectedRow.shift_start) && !isEarly(selectedRow.check_out, selectedRow.shift_end) && <span className="text-muted-foreground">—</span>}
                    </div>
                  } />
                  {selectedRow.note && <div className="col-span-full text-xs text-muted-foreground">Izoh: {selectedRow.note}</div>}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-4 text-center">Bu kun uchun yozuv yo'q</div>
              )}
            </CardContent>
          </Card>

          {/* Today panel (sticky-ish, always visible at bottom) */}
          <Card className="border-primary/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="font-semibold">Bugun</span>
                  </div>
                  <div><span className="text-muted-foreground">Kirish:</span> <b>{toLocalTime(todayRow?.check_in ?? null)}</b></div>
                  <div><span className="text-muted-foreground">Chiqish:</span> <b>{toLocalTime(todayRow?.check_out ?? null)}</b></div>
                  <div><span className="text-muted-foreground">Jami:</span> <b>{hoursBetween(todayRow?.check_in ?? null, todayRow?.check_out ?? null).toFixed(2)} soat</b></div>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={quickCheckIn} disabled={!!todayRow?.check_in}>
                      <LogIn className="h-4 w-4 mr-1" />Kirish
                    </Button>
                    <Button size="sm" variant="outline" onClick={quickCheckOut} disabled={!todayRow?.check_in || !!todayRow?.check_out}>
                      <LogOut className="h-4 w-4 mr-1" />Chiqish
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Monthly stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <StatCard color="emerald" label="Ishlangan" value={stats.present + stats.late} />
            <StatCard color="amber" label="Kech qolingan" value={stats.late} />
            <StatCard color="rose" label="Kelmagan" value={stats.absent} />
            <StatCard color="sky" label="Ta'til" value={stats.leave} />
            <StatCard color="primary" label="Jami soat" value={stats.hours.toFixed(1)} />
          </div>
        </div>

        {/* Edit sub-dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Davomat — {editForm.date}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Holat</Label>
                <Select value={editForm.status as string} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Kelgan</SelectItem>
                    <SelectItem value="late">Kech qolgan</SelectItem>
                    <SelectItem value="absent">Kelmagan</SelectItem>
                    <SelectItem value="leave">Ta'tilda</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Smena boshi</Label>
                  <Input type="time" value={(editForm.shift_start as string)?.slice(0,5) ?? "09:00"} onChange={e => setEditForm({ ...editForm, shift_start: e.target.value })} />
                </div>
                <div>
                  <Label>Smena oxiri</Label>
                  <Input type="time" value={(editForm.shift_end as string)?.slice(0,5) ?? "18:00"} onChange={e => setEditForm({ ...editForm, shift_end: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Kirgan vaqti</Label>
                  <Input type="datetime-local" value={toLocalInput(editForm.check_in as string)} onChange={e => setEditForm({ ...editForm, check_in: fromLocalInput(e.target.value) })} />
                </div>
                <div>
                  <Label>Chiqgan vaqti</Label>
                  <Input type="datetime-local" value={toLocalInput(editForm.check_out as string)} onChange={e => setEditForm({ ...editForm, check_out: fromLocalInput(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label>Izoh</Label>
                <Textarea rows={2} value={(editForm.note as string) ?? ""} onChange={e => setEditForm({ ...editForm, note: e.target.value })} />
              </div>
              <Button className="w-full" onClick={saveEdit}>Saqlash</Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

function StatCard({ color, label, value }: { color: "emerald"|"amber"|"rose"|"sky"|"primary"; label: string; value: string | number }) {
  const map: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    amber:   "bg-amber-500/10 text-amber-600 border-amber-500/30",
    rose:    "bg-rose-500/10 text-rose-600 border-rose-500/30",
    sky:     "bg-sky-500/10 text-sky-600 border-sky-500/30",
    primary: "bg-primary/10 text-primary border-primary/30",
  };
  return (
    <div className={`rounded-lg border p-3 ${map[color]}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
