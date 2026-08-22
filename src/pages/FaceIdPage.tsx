import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScanFace, RefreshCw, Wifi, WifiOff, HelpCircle, Users, UserCheck, UserX, LogIn, LogOut, Clock, Factory, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { FaceEmployeeDialog, type FaceEmployee } from "@/components/faceid/FaceEmployeeDialog";
import { buildDays, fmtHours, hhmm, SITE_LABEL, startOfWeek, ymd, type FaceEvent, type Shift } from "@/lib/faceid";

type Device = {
  id: string; name: string; site: string; ip_address: string | null;
  status: string; last_sync_at: string | null; last_event_at: string | null; last_error: string | null;
};

export default function FaceIdPage() {
  const { hasRole } = useAuth();
  const canSync = hasRole(["admin", "hr"]);
  const [employees, setEmployees] = useState<FaceEmployee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<FaceEvent[]>([]);
  const [siteFilter, setSiteFilter] = useState<"all" | "zavod" | "office">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<FaceEmployee | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const from = ymd(startOfWeek());
    const [emp, sh, dev, ev] = await Promise.all([
      supabase.from("employees")
        .select("id, full_name, position, department, photo_url, hikvision_person_id, work_site, shift_id")
        .eq("status", "active").order("full_name"),
      supabase.from("face_shifts").select("*").order("start_time"),
      supabase.from("face_devices").select("*").order("site"),
      supabase.from("face_events")
        .select("id, site, person_code, employee_id, direction, event_time, work_date")
        .gte("work_date", from).order("event_time"),
    ]);
    setEmployees((emp.data ?? []) as FaceEmployee[]);
    setShifts((sh.data ?? []) as Shift[]);
    setDevices((dev.data ?? []) as Device[]);
    setEvents((ev.data ?? []) as FaceEvent[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = ymd(new Date());

  const perEmployee = useMemo(() => {
    const byEmp = new Map<string, FaceEvent[]>();
    for (const e of events) {
      if (!e.employee_id) continue;
      const arr = byEmp.get(e.employee_id) ?? [];
      arr.push(e);
      byEmp.set(e.employee_id, arr);
    }
    const out = new Map<string, { firstIn: string | null; firstOut: string | null; hours: number; late: boolean }>();
    for (const emp of employees) {
      const shift = shifts.find((s) => s.id === emp.shift_id) ?? null;
      const day = buildDays(byEmp.get(emp.id) ?? [], shift).get(today);
      out.set(emp.id, { firstIn: day?.firstIn ?? null, firstOut: day?.firstOut ?? null, hours: day?.hours ?? 0, late: day?.late ?? false });
    }
    return out;
  }, [events, employees, shifts, today]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return employees.filter((e) => {
      if (siteFilter !== "all" && (e.work_site ?? "") !== siteFilter) return false;
      if (!needle) return true;
      return [e.full_name, e.position, e.department, e.hikvision_person_id ?? ""]
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [employees, siteFilter, q]);

  const stats = useMemo(() => {
    const scope = employees.filter((e) => siteFilter === "all" || (e.work_site ?? "") === siteFilter);
    let inCount = 0, outCount = 0, late = 0, atWork = 0;
    for (const e of scope) {
      const d = perEmployee.get(e.id);
      if (d?.firstIn) inCount++;
      if (d?.firstOut) outCount++;
      if (d?.late) late++;
      if (d?.firstIn && !d?.firstOut) atWork++;
    }
    return {
      atWork, absent: scope.length - inCount, inCount, outCount, late,
      zavod: employees.filter((e) => e.work_site === "zavod").length,
      office: employees.filter((e) => e.work_site === "office").length,
    };
  }, [employees, perEmployee, siteFilter]);

  const sync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("faceid-sync", { body: { hoursBack: 24 } });
    setSyncing(false);
    if (error) { toast.error("Sinxronizatsiya xatosi: " + error.message); await load(); return; }
    const results = (data as any)?.results ?? [];
    const okCount = results.filter((r: any) => r.ok).length;
    const stored = results.reduce((s: number, r: any) => s + (r.stored ?? 0), 0);
    if (okCount === 0) toast.error("Qurilmalarga ulanib bo'lmadi — qurilma holatini tekshiring");
    else toast.success(`${okCount} qurilma sinxronlandi, ${stored} yangi event`);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ScanFace className="h-6 w-6 text-primary" /> Face_id</h1>
          <p className="text-sm text-muted-foreground">Hikvision terminallaridan real davomat va ish vaqti hisobi</p>
        </div>
        {canSync && (
          <Button onClick={sync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sinxronlanmoqda..." : "Qurilmadan yangilash"}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <StatCard label="Bugun ishda" value={stats.atWork} icon={UserCheck} tone="text-emerald-600" />
        <StatCard label="Bugun kelmagan" value={stats.absent} icon={UserX} tone="text-rose-600" />
        <StatCard label="Kelgan" value={stats.inCount} icon={LogIn} tone="text-sky-600" />
        <StatCard label="Ketgan" value={stats.outCount} icon={LogOut} tone="text-slate-600" />
        <StatCard label="Kech qolgan" value={stats.late} icon={Clock} tone="text-amber-600" />
        <StatCard label="Zavod xodimlari" value={stats.zavod} icon={Factory} tone="text-primary" />
        <StatCard label="Office xodimlari" value={stats.office} icon={Building2} tone="text-primary" />
      </div>

      {/* Devices */}
      <div className="grid gap-3 md:grid-cols-2">
        {devices.map((d) => {
          const Icon = d.status === "online" ? Wifi : d.status === "offline" ? WifiOff : HelpCircle;
          const tone = d.status === "online" ? "text-emerald-600" : d.status === "offline" ? "text-rose-600" : "text-muted-foreground";
          return (
            <Card key={d.id}>
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    {SITE_LABEL[d.site] ?? d.site}
                    <Badge variant="outline">{d.ip_address ?? "—"}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Oxirgi sinxronizatsiya: {d.last_sync_at ? new Date(d.last_sync_at).toLocaleString("uz-UZ") : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Oxirgi event: {d.last_event_at ? new Date(d.last_event_at).toLocaleString("uz-UZ") : "—"}
                  </div>
                  {d.last_error && <div className="text-xs text-rose-600 mt-1 truncate">{d.last_error}</div>}
                </div>
                <div className={`flex items-center gap-1.5 text-sm font-medium ${tone}`}>
                  <Icon className="h-4 w-4" />
                  {d.status === "online" ? "Ulangan" : d.status === "offline" ? "Ulanmagan" : "Noma'lum"}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Employees */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <Tabs value={siteFilter} onValueChange={(v) => setSiteFilter(v as any)}>
              <TabsList>
                <TabsTrigger value="all">Hammasi</TabsTrigger>
                <TabsTrigger value="zavod">Zavod</TabsTrigger>
                <TabsTrigger value="office">Office</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Xodim, lavozim yoki Hikvision ID..." className="max-w-xs" />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">№</TableHead>
                <TableHead>Xodim</TableHead>
                <TableHead>Lavozim / Bo'lim</TableHead>
                <TableHead>Ish joyi</TableHead>
                <TableHead>Hikvision ID</TableHead>
                <TableHead>Keldim</TableHead>
                <TableHead>Ketdim</TableHead>
                <TableHead>Bugungi vaqt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e, i) => {
                const d = perEmployee.get(e.id);
                return (
                  <TableRow key={e.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(e)}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-semibold">{e.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.position} · {e.department}</TableCell>
                    <TableCell>{e.work_site ? <Badge variant="outline">{SITE_LABEL[e.work_site]}</Badge> : <span className="text-muted-foreground text-sm">—</span>}</TableCell>
                    <TableCell>{e.hikvision_person_id ?? <span className="text-amber-600 text-xs">Bog'lanmagan</span>}</TableCell>
                    <TableCell className={d?.late ? "text-amber-600 font-medium" : ""}>{hhmm(d?.firstIn ?? null)}</TableCell>
                    <TableCell>{hhmm(d?.firstOut ?? null)}</TableCell>
                    <TableCell className="font-medium">{fmtHours(d?.hours ?? 0)}</TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  <Users className="h-5 w-5 mx-auto mb-2" />Xodim topilmadi
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <FaceEmployeeDialog
        employee={selected}
        shifts={shifts}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        onSaved={() => { setSelected(null); load(); }}
      />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className={`h-4 w-4 ${tone}`} />{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
