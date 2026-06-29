import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Edit2, Wrench, AlertTriangle, UserX, UserCheck } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useI18n, useLocalize } from "@/i18n/context";
import { logAudit } from "@/types/erp";
import { toast } from "sonner";

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
  const [form, setForm] = useState({ full_name: "", position: "", department: "", phone: "", hire_date: new Date().toISOString().slice(0, 10), leave_date: "", status: "active" });

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
  // Only Admin and Cashier may deactivate / soft-delete employees.
  const canDeactivate = hasRole(["admin", "cashier"]);
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const filteredEmployees = useMemo(
    () => statusFilter === "all" ? employees : employees.filter(e => (e.status ?? "active") === statusFilter),
    [employees, statusFilter]
  );

  const resetForm = () => setForm({ full_name: "", position: "", department: "", phone: "", hire_date: new Date().toISOString().slice(0, 10), leave_date: "", status: "active" });

  const save = async () => {
    if (!form.full_name.trim()) { toast.error(hr.fillFields ?? "Maydonlarni to'ldiring"); return; }

    // Termination guard: block status->inactive or setting leave_date if employee holds instruments
    if (editId) {
      const wasActive = employees.find(x => x.id === editId)?.status === "active";
      const willBeTerminated = (form.status === "inactive" || !!form.leave_date) && wasActive;
      if (willBeTerminated) {
        const held = heldMap[editId] ?? [];
        if (held.length > 0) {
          const list = held.map(h => `• ${h.name} ×${h.quantity}`).join("\n");
          toast.error("Xodimda topshirilmagan instrumentlar mavjud:\n" + list, { duration: 8000 });
          await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Bo'shatish bloklandi", entity: "employee", details: `${form.full_name}: ${held.map(h => `${h.name} ×${h.quantity}`).join(", ")}` });
          return;
        }
      }
    }

    const payload: any = {
      full_name: form.full_name.trim(),
      position: form.position.trim(),
      department: form.department.trim(),
      phone: form.phone.trim() || null,
      hire_date: form.hire_date,
      leave_date: form.leave_date || null,
      status: form.status,
    };
    if (editId) {
      const { error } = await supabase.from("employees").update(payload).eq("id", editId);
      if (error) { toast.error(error.message); return; }
      if (payload.status === "inactive" || payload.leave_date) {
        await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Xodim bo'shatildi", entity: "employee", details: payload.full_name });
      }
    } else {
      const { error } = await supabase.from("employees").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success(hr.saved ?? "Saqlandi");
    setAddOpen(false); setEditId(null); resetForm(); load();
  };

  const openEdit = (emp: any) => {
    setForm({
      full_name: emp.full_name, position: emp.position, department: emp.department,
      phone: emp.phone ?? "", hire_date: emp.hire_date, leave_date: emp.leave_date ?? "", status: emp.status,
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
        {canManage && (
          <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setEditId(null); resetForm(); } }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{hr.add ?? "Xodim qo'shish"}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editId ? (hr.edit ?? "Tahrirlash") : (hr.add ?? "Xodim qo'shish")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>{hr.fullName ?? "To'liq ism"}</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{hr.position ?? "Lavozim"}</Label><Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} /></div>
                  <div><Label>{hr.department ?? "Bo'lim"}</Label><Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
                </div>
                <div><Label>{hr.phone ?? "Telefon"}</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+998..." /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{hr.hireDate ?? "Ish boshlagan sana"}</Label><Input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} /></div>
                  {canDeactivate && <div><Label>{hr.leaveDate ?? "Ketgan sana"}</Label><Input type="date" value={form.leave_date} onChange={e => setForm({ ...form, leave_date: e.target.value })} /></div>}
                </div>
                {canDeactivate && (
                  <div>
                    <Label>{hr.status ?? "Holat"}</Label>
                    <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{hr.active ?? "Faol"}</SelectItem>
                        <SelectItem value="inactive">{hr.inactive ?? "Ishdan bo'shagan"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button className="w-full" onClick={save}>{t.common.save}</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-3 border-b">
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <TabsList>
                <TabsTrigger value="active">{hr.active ?? "Faol"}</TabsTrigger>
                <TabsTrigger value="inactive">{hr.inactive ?? "Nofaol"}</TabsTrigger>
                <TabsTrigger value="all">{hr.all ?? "Hammasi"}</TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-xs text-muted-foreground">{filteredEmployees.length} / {employees.length}</span>
          </div>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">№</TableHead>
                  <TableHead>{hr.fullName ?? "Ism"}</TableHead>
                  <TableHead>{hr.position ?? "Lavozim"}</TableHead>
                  <TableHead>{hr.department ?? "Bo'lim"}</TableHead>
                  <TableHead>{hr.phone ?? "Telefon"}</TableHead>
                  <TableHead>{hr.hireDate ?? "Ish boshlagan"}</TableHead>
                  <TableHead>{hr.status ?? "Holat"}</TableHead>
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
                    <TableCell className="text-sm">{e.hire_date}</TableCell>
                    <TableCell>
                      <Badge variant={isActive ? "default" : "secondary"}>
                        {isActive ? (hr.active ?? "Faol") : (hr.inactive ?? "Ishdan bo'shagan")}
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
                                <span className="text-muted-foreground">({new Date(h.issued_at).toLocaleDateString()})</span>
                              </div>
                            ))}
                          </div>
                        )
                      }
                    </TableCell>
                    {canManage && (
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(e)} title={hr.edit ?? "Tahrirlash"}>
                            <Edit2 className="h-3 w-3" />
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
                {!loading && filteredEmployees.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">{hr.empty ?? "Xodimlar yo'q"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

