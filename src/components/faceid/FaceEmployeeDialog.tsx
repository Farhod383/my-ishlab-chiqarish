import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, LogIn, LogOut, Clock, CalendarDays, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import {
  buildDays, daysInRange, fmtHours, hhmm, startOfMonth, startOfWeek, startOfYear, sumHours,
  ymd, SITE_LABEL, type DayAttendance, type FaceEvent, type Shift,
} from "@/lib/faceid";

const MONTHS_UZ = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
const DOW_UZ = ["Du","Se","Ch","Pa","Ju","Sh","Ya"];

export interface FaceEmployee {
  id: string;
  full_name: string;
  position: string;
  department: string;
  photo_url: string | null;
  hikvision_person_id: string | null;
  work_site: string | null;
  shift_id: string | null;
}

export function FaceEmployeeDialog({
  employee, shifts, open, onOpenChange, onSaved,
}: {
  employee: FaceEmployee | null;
  shifts: Shift[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { hasRole } = useAuth();
  const canEdit = hasRole(["admin", "hr"]);
  const [events, setEvents] = useState<FaceEvent[]>([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string[]>([]);
  const [detailDay, setDetailDay] = useState<string | null>(null);
  const [personId, setPersonId] = useState("");
  const [site, setSite] = useState<string>("");
  const [shiftId, setShiftId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const shift = useMemo(() => shifts.find((s) => s.id === (shiftId || employee?.shift_id)) ?? null, [shifts, shiftId, employee]);

  useEffect(() => {
    if (!employee || !open) return;
    setPersonId(employee.hikvision_person_id ?? "");
    setSite(employee.work_site ?? "");
    setShiftId(employee.shift_id ?? "");
    setSelected([]);
    setDetailDay(null);
    (async () => {
      const from = ymd(startOfYear(new Date()));
      const { data } = await supabase
        .from("face_events")
        .select("id, site, person_code, employee_id, direction, event_time, work_date")
        .eq("employee_id", employee.id)
        .gte("work_date", from)
        .order("event_time", { ascending: true });
      setEvents((data ?? []) as FaceEvent[]);
    })();
  }, [employee, open]);

  const days = useMemo(() => buildDays(events, shift), [events, shift]);

  const stats = useMemo(() => {
    const today = ymd(new Date());
    const y = new Date(); y.setDate(y.getDate() - 1);
    const all = [...days.values()];
    return {
      today: days.get(today) ?? null,
      yesterday: days.get(ymd(y))?.hours ?? 0,
      week: sumHours(daysInRange(days, startOfWeek(), new Date())),
      month: sumHours(daysInRange(days, startOfMonth(), new Date())),
      year: sumHours(all),
      present: all.filter((d) => d.firstIn).length,
      late: all.filter((d) => d.late).length,
      early: all.filter((d) => d.early).length,
    };
  }, [days]);

  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const lead = (first.getDay() + 6) % 7;
    const cells: (Date | null)[] = Array(lead).fill(null);
    for (let i = 1; i <= last.getDate(); i++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), i));
    return cells;
  }, [cursor]);

  const toggleDay = (key: string) => {
    setDetailDay(key);
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const quickSelect = (n: number) => {
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      keys.push(ymd(d));
    }
    setSelected(keys);
    setCursor(new Date());
  };

  const selectedDays: DayAttendance[] = selected.map((k) => days.get(k)).filter(Boolean) as DayAttendance[];
  const selectedTotal = sumHours(selectedDays);

  const save = async () => {
    if (!employee) return;
    setSaving(true);
    const { error } = await supabase.from("employees").update({
      hikvision_person_id: personId.trim() || null,
      work_site: site || null,
      shift_id: shiftId || null,
    }).eq("id", employee.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    // Attach any previously unmatched events for this Hikvision ID.
    if (personId.trim()) {
      await supabase.from("face_events").update({ employee_id: employee.id })
        .is("employee_id", null).eq("person_code", personId.trim());
    }
    toast.success("Saqlandi");
    onSaved();
  };

  if (!employee) return null;
  const detail = detailDay ? days.get(detailDay) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {employee.photo_url
              ? <img src={employee.photo_url} alt={employee.full_name} className="h-10 w-10 rounded-full object-cover" />
              : <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">{employee.full_name.slice(0, 2)}</div>}
            <div className="min-w-0">
              <div className="truncate">{employee.full_name}</div>
              <div className="text-xs font-normal text-muted-foreground truncate">
                {employee.position} · {employee.department} · {SITE_LABEL[site] ?? "Ish joyi belgilanmagan"}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Linking */}
        <Card>
          <CardContent className="p-4 grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Hikvision Employee ID</Label>
              <Input value={personId} onChange={(e) => setPersonId(e.target.value)} disabled={!canEdit} placeholder="masalan: 1024" />
            </div>
            <div className="space-y-1">
              <Label>Ish joyi</Label>
              <Select value={site} onValueChange={setSite} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zavod">Zavod</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Smena</Label>
              <Select value={shiftId} onValueChange={setShiftId} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                <SelectContent>
                  {shifts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0,5)}–{s.end_time.slice(0,5)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canEdit && (
              <div className="sm:col-span-3">
                <Button size="sm" onClick={save} disabled={saving}>
                  <Save className="h-4 w-4 mr-1" /> {saving ? "Saqlanmoqda..." : "Bog'lashni saqlash"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Bugungi kirish" value={hhmm(stats.today?.firstIn ?? null)} icon={LogIn} />
          <Stat label="Bugungi chiqish" value={hhmm(stats.today?.firstOut ?? null)} icon={LogOut} />
          <Stat label="Bugun ishlagan" value={fmtHours(stats.today?.hours ?? 0)} icon={Clock} />
          <Stat label="Kecha ishlagan" value={fmtHours(stats.yesterday)} icon={Clock} />
          <Stat label="Haftalik jami" value={fmtHours(stats.week)} icon={CalendarDays} />
          <Stat label="Oylik jami" value={fmtHours(stats.month)} icon={CalendarDays} />
          <Stat label="Yillik jami" value={fmtHours(stats.year)} icon={CalendarDays} />
          <Stat label="Kelgan kunlar" value={String(stats.present)} icon={CalendarDays} />
          <Stat label="Kech qolgan" value={String(stats.late)} icon={Clock} />
          <Stat label="Erta ketgan" value={String(stats.early)} icon={Clock} />
        </div>

        {/* Calendar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <div className="font-semibold">{MONTHS_UZ[cursor.getMonth()]} {cursor.getFullYear()}</div>
              <Button variant="ghost" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground mb-1">
              {DOW_UZ.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((d, i) => {
                if (!d) return <div key={`e${i}`} />;
                const key = ymd(d);
                const rec = days.get(key);
                const isSel = selected.includes(key);
                const tone = !rec?.firstIn ? "bg-muted/40 text-muted-foreground"
                  : rec.late ? "bg-amber-500/15 text-amber-600"
                  : "bg-emerald-500/15 text-emerald-600";
                return (
                  <button
                    key={key}
                    onClick={() => toggleDay(key)}
                    className={`rounded-md p-1.5 text-xs border transition ${tone} ${isSel ? "ring-2 ring-primary border-primary" : "border-transparent hover:border-border"}`}
                  >
                    <div className="font-semibold">{d.getDate()}</div>
                    <div className="text-[10px] leading-tight">{rec?.hours ? fmtHours(rec.hours) : "—"}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {[3, 4, 7, 14, 30].map((n) => (
                <Button key={n} size="sm" variant="outline" onClick={() => quickSelect(n)}>Oxirgi {n} kun</Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Tozalash</Button>
            </div>

            {selected.length > 0 && (
              <div className="mt-3 rounded-lg border p-3 flex flex-wrap gap-6">
                <div><div className="text-xs text-muted-foreground">Tanlangan kunlar</div><div className="text-lg font-bold">{selected.length}</div></div>
                <div><div className="text-xs text-muted-foreground">Jami ishlagan vaqt</div><div className="text-lg font-bold">{fmtHours(selectedTotal)}</div></div>
                <div><div className="text-xs text-muted-foreground">O'rtacha</div><div className="text-lg font-bold">{fmtHours(selectedTotal / selected.length)}</div></div>
              </div>
            )}

            {detailDay && (
              <div className="mt-3 rounded-lg border p-3">
                <div className="font-semibold mb-2 text-sm">{detailDay}</div>
                <div className="flex flex-wrap gap-6 text-sm">
                  <div><div className="text-xs text-muted-foreground">Keldim</div><div className="font-semibold">{hhmm(detail?.firstIn ?? null)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Ketdim</div><div className="font-semibold">{hhmm(detail?.firstOut ?? null)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Ishlagan vaqt</div><div className="font-semibold">{fmtHours(detail?.hours ?? 0)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Smena</div><div className="font-semibold">{shift?.name ?? "—"}</div></div>
                  {detail?.late && <Badge variant="outline" className="text-amber-600 border-amber-600">Kech qolgan</Badge>}
                  {detail?.early && <Badge variant="outline" className="text-rose-600 border-rose-600">Erta ketgan</Badge>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </div>
  );
}
