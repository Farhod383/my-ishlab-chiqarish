import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Edit2, Wrench, UserX, UserCheck, Briefcase, CalendarDays, FileDown, FileText } from "lucide-react";
import { exportEmployeesPDF, exportEmployeesDocx } from "@/lib/hrExport";

import VacanciesTab from "@/components/hr/VacanciesTab";
import AttendanceCalendarDialog from "@/components/hr/AttendanceCalendarDialog";
import { useAuth } from "@/auth/AuthContext";
import { useI18n, useLocalize } from "@/i18n/context";
import { logAudit } from "@/types/erp";
import { toast } from "sonner";

// Uzbek phone format validator: +998 XX XXX XX XX  or XX XXX XX XX  (spaces optional)
const PHONE_RE = /^(\+?998)?\s*\d{2}\s*\d{3}\s*\d{2}\s*\d{2}$/;
const isValidPhone = (s: string) => !s.trim() || PHONE_RE.test(s.replace(/[-()]/g, ""));

const emptyForm = () => ({
  full_name: "", first_name: "", last_name: "",
  position: "", department: "", phone: "",
  hire_date: new Date().toISOString().slice(0, 10),
  leave_date: "", status: "active",
  neighborhood: "", login: "", password: "",
  birth_date: "", passport: "", address: "", note: "",
});

export default function HRPage() {
  const { hasRole, user } = useAuth();
  const { t } = useI18n();
  const localize = useLocalize();
  const hr = (t as any).hr ?? {};
  const [employees, setEmployees] = useState<any[]>([]);
  const [heldMap, setHeldMap] = useState<Record<string, { id: string; name: string; quantity: number; issued_at: string }[]>>({});
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [attEmp, setAttEmp] = useState<{ id: string; full_name: string } | null>(null);

  const load = async () => {
    const [eRes, aRes] = await Promise.all([
      supabase.from("employees").select("*").order("full_name"),
      supabase.from("instrument_assignments")
        .select("id, employee_id, quantity, issued_at, instrument:instruments(name)")
        .is("returned_at", null),
    ]);
    setEmployees(eRes.data ?? []);
    const m: Record<string, any[]> = {};
    (aRes.data ?? []).forEach((a: any) => {
      (m[a.employee_id] ||= []).push({ id: a.id, name: a.instrument?.name ?? "?", quantity: a.quantity, issued_at: a.issued_at });
    });
    setHeldMap(m);
    setLoading(false);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("hr-instruments")
      .on("postgres_changes", { event: "*", schema: "public", table: "instrument_assignments" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const canManage = hasRole(["hr", "admin", "cashier"]);
  const canDeactivate = hasRole(["admin", "cashier"]);
  const canExport = hasRole(["hr"]); // admin ham avtomatik kiradi
  const [exporting, setExporting] = useState<null | "pdf" | "docx">(null);

  const runExport = async (kind: "pdf" | "docx") => {
    setExporting(kind);
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("full_name, position, phone, status")
        .order("position")
        .order("full_name");
      if (error) throw error;
      const rows = (data ?? []).filter((e: any) => (e.status ?? "active") === "active");
      if (rows.length === 0) { toast.error("Eksport uchun xodimlar topilmadi"); return; }
      const actor = user?.email ?? "—";
      if (kind === "pdf") await exportEmployeesPDF(rows as any, actor);
      else await exportEmployeesDocx(rows as any, actor);
      toast.success("Eksport tayyor");
    } catch (e: any) {
      toast.error(e?.message ?? "Eksportda xatolik");
    } finally {
      setExporting(null);
    }
  };

  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all" | "vacancy">("active");
  const filteredEmployees = useMemo(
    () => statusFilter === "all" || statusFilter === "vacancy"
      ? employees
      : employees.filter(e => (e.status ?? "active") === statusFilter),
    [employees, statusFilter]
  );

  const resetForm = () => setForm(emptyForm());

  const save = async () => {
    // Required fields
    const first = form.first_name.trim();
    const last = form.last_name.trim();
    const composedName = form.full_name.trim() || `${last} ${first}`.trim();
    if (!composedName) { toast.error("Ism va familiyani kiriting"); return; }
    if (!form.phone.trim()) { toast.error("Telefon raqami majburiy"); return; }
    if (!isValidPhone(form.phone)) { toast.error("Telefon formati: +998 XX XXX XX XX"); return; }
    if (!form.position.trim()) { toast.error("Lavozim majburiy"); return; }
    if (!form.department.trim()) { toast.error("Bo'lim majburiy"); return; }

    // Termination guard
    if (editId) {
      const wasActive = employees.find(x => x.id === editId)?.status === "active";
      const willBeTerminated = (form.status === "inactive" || !!form.leave_date) && wasActive;
      if (willBeTerminated) {
        const held = heldMap[editId] ?? [];
        if (held.length > 0) {
          const list = held.map(h => `• ${h.name} ×${h.quantity}`).join("\n");
          toast.error("Xodimda topshirilmagan instrumentlar mavjud:\n" + list, { duration: 8000 });
          await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Bo'shatish bloklandi", entity: "employee", details: `${composedName}: ${held.map(h => `${h.name} ×${h.quantity}`).join(", ")}` });
          return;
        }
      }
    }

    const payload: any = {
      full_name: composedName,
      position: form.position.trim(),
      department: form.department.trim(),
      phone: form.phone.trim() || null,
      hire_date: form.hire_date,
      leave_date: form.leave_date || null,
      status: form.status,
      neighborhood: form.neighborhood.trim() || null,
      login: form.login.trim() || null,
      password: form.password.trim() || null,
      birth_date: form.birth_date || null,
      passport: form.passport.trim() || null,
      address: form.address.trim() || null,
      note: form.note.trim() || null,
    };

    if (editId) {
      const { error } = await supabase.from("employees").update(payload).eq("id", editId);
      if (error) { toast.error(error.message); return; }
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Xodim tahrirlandi", entity: "employee", details: composedName });
      if (payload.status === "inactive" || payload.leave_date) {
        await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Xodim bo'shatildi", entity: "employee", details: composedName });
      }
    } else {
      const { error } = await supabase.from("employees").insert(payload);
      if (error) { toast.error(error.message); return; }
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Xodim qo'shildi", entity: "employee", details: composedName });
    }
    toast.success(hr.saved ?? "Saqlandi");
    setAddOpen(false); setEditId(null); resetForm(); load();
  };

  const openEdit = (emp: any) => {
    const parts = String(emp.full_name ?? "").trim().split(/\s+/);
    const last = parts.shift() ?? "";
    const first = parts.join(" ");
    setForm({
      full_name: emp.full_name ?? "",
      first_name: first, last_name: last,
      position: emp.position ?? "", department: emp.department ?? "",
      phone: emp.phone ?? "",
      hire_date: emp.hire_date, leave_date: emp.leave_date ?? "", status: emp.status ?? "active",
      neighborhood: emp.neighborhood ?? "",
      login: emp.login ?? "", password: emp.password ?? "",
      birth_date: emp.birth_date ?? "", passport: emp.passport ?? "",
      address: emp.address ?? "", note: emp.note ?? "",
    });
    setEditId(emp.id);
    setAddOpen(true);
  };

  const toggleActive = async (emp: any) => {
    if (!canDeactivate) { toast.error("Faqat Admin yoki Kassir bo'shata oladi"); return; }
    const goingInactive = (emp.status ?? "active") === "active";
    if (goingInactive) {
      const held = heldMap[emp.id] ?? [];
      if (held.length > 0) {
        toast.error("Xodimda topshirilmagan instrumentlar mavjud:\n" + held.map(h => `• ${h.name} ×${h.quantity}`).join("\n"), { duration: 8000 });
        return;
      }
      if (!confirm(`${emp.full_name} — ishdan bo'shatilsinmi? Tarix saqlanadi.`)) return;
    } else {
      if (!confirm(`${emp.full_name} — qaytadan faollashtirilsinmi?`)) return;
    }
    const { error } = await supabase.from("employees").update({
      status: goingInactive ? "inactive" : "active",
      leave_date: goingInactive ? new Date().toISOString().slice(0, 10) : null,
    }).eq("id", emp.id);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: goingInactive ? "Xodim bo'shatildi" : "Xodim qayta faollashtirildi",
      entity: "employee", details: emp.full_name,
    });
    toast.success(goingInactive ? "Xodim bo'shatildi" : "Xodim faollashtirildi");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="h-6 w-6" />{hr.title ?? "Xodimlar"}</h1>
          <p className="text-sm text-muted-foreground">{hr.subtitle ?? "Xodimlar ro'yxati va boshqaruvi"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        {canExport && statusFilter !== "vacancy" && (
          <>
            <Button variant="outline" disabled={!!exporting} onClick={() => runExport("pdf")}>
              <FileDown className="h-4 w-4 mr-2" />{exporting === "pdf" ? "Tayyorlanmoqda..." : "PDF eksport"}
            </Button>
            <Button variant="outline" disabled={!!exporting} onClick={() => runExport("docx")}>
              <FileText className="h-4 w-4 mr-2" />{exporting === "docx" ? "Tayyorlanmoqda..." : "Word eksport"}
            </Button>
          </>
        )}
        {canManage && statusFilter !== "vacancy" && (

          <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setEditId(null); resetForm(); } }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{hr.add ?? "Xodim qo'shish"}</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editId ? "Tahrirlash" : "Yangi xodim"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Familiya *</Label><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></div>
                  <div><Label>Ism *</Label><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Telefon * (+998 XX XXX XX XX)</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+998 90 123 45 67" /></div>
                  <div><Label>Lavozim *</Label><Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Bo'lim *</Label><Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
                  <div><Label>Pasport / JSHSHIR</Label><Input value={form.passport} onChange={e => setForm({ ...form, passport: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Ish boshlagan sana</Label><Input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} /></div>
                  <div><Label>Tug'ilgan sana</Label><Input type="date" value={form.birth_date} onChange={e => setForm({ ...form, birth_date: e.target.value })} /></div>
                </div>
                <div><Label>Manzil</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                <div><Label>Izoh</Label><Textarea rows={2} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
                {canDeactivate && editId && (
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Ketgan sana</Label><Input type="date" value={form.leave_date} onChange={e => setForm({ ...form, leave_date: e.target.value })} /></div>
                    <div>
                      <Label>Holat</Label>
                      <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Faol</SelectItem>
                          <SelectItem value="inactive">Bo'shagan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                <Button className="w-full" onClick={save}>{t.common.save}</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>


      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-3 border-b flex-wrap gap-2">
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <TabsList>
                <TabsTrigger value="active">Faol</TabsTrigger>
                <TabsTrigger value="inactive">Bo'shagan</TabsTrigger>
                <TabsTrigger value="all">Hammasi</TabsTrigger>
                <TabsTrigger value="vacancy" className="gap-1"><Briefcase className="h-3.5 w-3.5" />Vakansiya</TabsTrigger>
              </TabsList>
            </Tabs>
            {statusFilter !== "vacancy" && (
              <span className="text-xs text-muted-foreground">{filteredEmployees.length} / {employees.length}</span>
            )}
          </div>
          {statusFilter === "vacancy" ? (
            <div className="p-3"><VacanciesTab /></div>
          ) : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">№</TableHead>
                  <TableHead>Ism</TableHead>
                  <TableHead>Lavozim</TableHead>
                  <TableHead>Bo'lim</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Mahalla</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead><span className="inline-flex items-center gap-1"><Wrench className="h-3.5 w-3.5" />Instrumentlar</span></TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>}
                {!loading && filteredEmployees.map((e, idx) => {
                  const held = heldMap[e.id] ?? [];
                  const isActive = (e.status ?? "active") === "active";
                  return (
                  <TableRow
                    key={e.id}
                    className={canManage ? "cursor-pointer hover:bg-muted/40" : undefined}
                    onClick={canManage ? () => openEdit(e) : undefined}
                  >
                    <TableCell className="text-right text-xs font-mono text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{localize(e.full_name)}</TableCell>
                    <TableCell className="text-sm">{e.position}</TableCell>
                    <TableCell className="text-sm">{e.department}</TableCell>
                    <TableCell className="text-sm">{e.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.neighborhood ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={isActive ? "default" : "secondary"}>
                        {isActive ? "Faol" : "Bo'shagan"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {held.length === 0
                        ? <span className="text-muted-foreground">—</span>
                        : (
                          <div className="space-y-0.5">
                            {held.map(h => (
                              <div key={h.id} className="flex items-center gap-1">
                                <Wrench className="h-3 w-3 text-primary" />
                                <span>{h.name} ×{h.quantity}</span>
                              </div>
                            ))}
                          </div>
                        )
                      }
                    </TableCell>
                    {canManage && (
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setAttEmp({ id: e.id, full_name: e.full_name })} title="Davomat kalendari">
                            <CalendarDays className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(e)} title="Tahrirlash">
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          {canDeactivate && (
                            isActive ? (
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => toggleActive(e)} title="Ishdan bo'shatish">
                                <UserX className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700" onClick={() => toggleActive(e)} title="Qayta faollashtirish">
                                <UserCheck className="h-3.5 w-3.5" />
                              </Button>
                            )
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })}
                {!loading && filteredEmployees.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Xodimlar yo'q</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      <AttendanceCalendarDialog
        employee={attEmp}
        open={!!attEmp}
        onOpenChange={(o) => { if (!o) setAttEmp(null); }}
      />
    </div>
  );
}
