import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Plus, Edit2, UserCheck, ExternalLink, FileText } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { logAudit } from "@/types/erp";
import { toast } from "sonner";
import { refreshEmployees } from "@/hooks/useEmployees";

type VacancyStatus = "new" | "invited" | "interviewed" | "hired" | "rejected" | "reserve";

const STATUS_LABEL: Record<VacancyStatus, string> = {
  new: "Yangi",
  invited: "Suhbatga chaqirilgan",
  interviewed: "Suhbatdan o'tgan",
  hired: "Ishga qabul qilingan",
  rejected: "Rad etilgan",
  reserve: "Zaxirada",
};
const STATUS_TONE: Record<VacancyStatus, string> = {
  new: "bg-status-blue/15 text-status-blue border-status-blue/30",
  invited: "bg-status-yellow/15 text-status-yellow border-status-yellow/30",
  interviewed: "bg-primary/15 text-primary border-primary/30",
  hired: "bg-status-green/15 text-status-green border-status-green/30",
  rejected: "bg-status-red/15 text-status-red border-status-red/30",
  reserve: "bg-muted text-muted-foreground border-border",
};

const emptyForm = () => ({
  first_name: "", last_name: "", phone: "",
  neighborhood: "", birth_date: "",
  position: "", department: "",
  address: "", passport: "", note: "",
  resume_url: "", experience: "",
  expected_salary: "" as string,
  status: "new" as VacancyStatus,
});

export default function VacanciesTab() {
  const { hasRole, user } = useAuth();
  const canManage = hasRole(["hr", "admin", "cashier"]);
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | VacancyStatus>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [hireId, setHireId] = useState<string | null>(null);
  const [hireForm, setHireForm] = useState({ login: "", password: "", hire_date: new Date().toISOString().slice(0, 10) });

  const load = async () => {
    const { data } = await (supabase as any).from("vacancies").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q.trim()) return true;
      const t = q.trim().toLowerCase();
      return [r.first_name, r.last_name, r.phone, r.position, r.department, r.neighborhood, r.note]
        .some((v) => (v ?? "").toString().toLowerCase().includes(t));
    });
  }, [rows, q, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    (Object.keys(STATUS_LABEL) as VacancyStatus[]).forEach((s) => { c[s] = rows.filter((r) => r.status === s).length; });
    return c;
  }, [rows]);

  const resetForm = () => { setForm(emptyForm()); setEditId(null); };

  const save = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) { toast.error("Ism va familiyani kiriting"); return; }
    if (!form.phone.trim()) { toast.error("Telefon raqami majburiy"); return; }
    const payload: any = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      phone: form.phone.trim(),
      neighborhood: form.neighborhood.trim() || null,
      birth_date: form.birth_date || null,
      position: form.position.trim() || null,
      department: form.department.trim() || null,
      address: form.address.trim() || null,
      passport: form.passport.trim() || null,
      note: form.note.trim() || null,
      resume_url: form.resume_url.trim() || null,
      experience: form.experience.trim() || null,
      expected_salary: form.expected_salary ? Number(form.expected_salary) : null,
      status: form.status,
    };
    if (editId) {
      const { error } = await (supabase as any).from("vacancies").update(payload).eq("id", editId);
      if (error) { toast.error(error.message); return; }
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Vakansiya tahrirlandi", entity: "vacancy", details: `${payload.last_name} ${payload.first_name}` });
    } else {
      payload.created_by = user?.id;
      const { error } = await (supabase as any).from("vacancies").insert(payload);
      if (error) { toast.error(error.message); return; }
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Vakansiya qo'shildi", entity: "vacancy", details: `${payload.last_name} ${payload.first_name}` });
    }
    toast.success("Saqlandi");
    setAddOpen(false); resetForm(); load();
  };

  const openEdit = (v: any) => {
    setEditId(v.id);
    setForm({
      first_name: v.first_name ?? "", last_name: v.last_name ?? "", phone: v.phone ?? "",
      neighborhood: v.neighborhood ?? "", birth_date: v.birth_date ?? "",
      position: v.position ?? "", department: v.department ?? "",
      address: v.address ?? "", passport: v.passport ?? "", note: v.note ?? "",
      resume_url: v.resume_url ?? "", experience: v.experience ?? "",
      expected_salary: v.expected_salary != null ? String(v.expected_salary) : "",
      status: (v.status ?? "new") as VacancyStatus,
    });
    setAddOpen(true);
  };

  const openHire = (v: any) => {
    setHireId(v.id);
    setHireForm({ login: (v.phone ?? "").replace(/\D/g, "").slice(-9), password: "", hire_date: new Date().toISOString().slice(0, 10) });
  };

  const confirmHire = async () => {
    const v = rows.find((r) => r.id === hireId);
    if (!v) return;
    if (!hireForm.login.trim() || !hireForm.password.trim()) { toast.error("Login va parol majburiy"); return; }
    if (!v.position || !v.department) { toast.error("Vakansiyada lavozim va bo'lim bo'lishi kerak"); return; }

    const empPayload: any = {
      full_name: `${v.last_name} ${v.first_name}`.trim(),
      position: v.position,
      department: v.department,
      phone: v.phone,
      hire_date: hireForm.hire_date,
      status: "active",
      neighborhood: v.neighborhood,
      login: hireForm.login.trim(),
      password: hireForm.password.trim(),
      birth_date: v.birth_date,
      passport: v.passport,
      address: v.address,
      note: v.note,
    };
    const { data: emp, error } = await supabase.from("employees").insert(empPayload).select("id").single();
    if (error) { toast.error(error.message); return; }
    refreshEmployees();

    await (supabase as any).from("vacancies").update({
      status: "hired",
      hired_employee_id: emp!.id,
    }).eq("id", v.id);

    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Nomzod ishga qabul qilindi",
      entity: "vacancy", details: `${v.last_name} ${v.first_name} → xodimlar`,
    });
    const { notify } = await import("@/lib/notify");
    await notify({
      type: "info", title: `Nomzod ishga qabul qilindi — ${v.last_name} ${v.first_name}`,
      body: v.position ?? undefined, link: "/hr", entity: "vacancy",
      recipient_role: ["hr", "manager", "cashier"],
      sender_id: user?.id, sender_name: user?.email,
    });
    toast.success("Nomzod ishga qabul qilindi va Xodimlar ro'yxatiga ko'chirildi");
    setHireId(null);
    load();
  };

  const fmtSalary = (n: any) => n == null ? "—" : new Intl.NumberFormat("uz-UZ").format(Number(n));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Hammasi ({counts.all})</SelectItem>
              {(Object.keys(STATUS_LABEL) as VacancyStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]} ({counts[s] ?? 0})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input className="w-64" placeholder="Qidiruv (ism, telefon, lavozim...)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {canManage && (
          <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Nomzod qo'shish</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editId ? "Nomzodni tahrirlash" : "Yangi nomzod"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Familiya *</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
                  <div><Label>Ism *</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Telefon *</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+998 90 123 45 67" /></div>
                  <div><Label>Mahalla</Label><Input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tug'ilgan sana</Label><Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></div>
                  <div><Label>Pasport / JSHSHIR</Label><Input value={form.passport} onChange={(e) => setForm({ ...form, passport: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Lavozim</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
                  <div><Label>Bo'lim</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
                </div>
                <div><Label>Manzil</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Tajriba</Label><Input value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="Masalan: 3 yil" /></div>
                  <div><Label>Kutilayotgan oylik (so'm)</Label><Input type="number" min={0} value={form.expected_salary} onChange={(e) => setForm({ ...form, expected_salary: e.target.value })} /></div>
                </div>
                <div><Label>Rezyume URL (PDF/Word havolasi)</Label><Input value={form.resume_url} onChange={(e) => setForm({ ...form, resume_url: e.target.value })} placeholder="https://..." /></div>
                <div><Label>Izoh</Label><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
                <div>
                  <Label>Holat</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as VacancyStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABEL) as VacancyStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={save}>Saqlash</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">№</TableHead>
                  <TableHead>Nomzod</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Lavozim / Bo'lim</TableHead>
                  <TableHead>Tajriba</TableHead>
                  <TableHead className="text-right">Kutilgan oylik</TableHead>
                  <TableHead>Rezyume</TableHead>
                  <TableHead>Holat</TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Nomzodlar mavjud emas
                  </TableCell></TableRow>
                )}
                {filtered.map((v, idx) => {
                  const s = (v.status ?? "new") as VacancyStatus;
                  const canHire = canManage && s !== "hired";
                  return (
                    <TableRow
                      key={v.id}
                      className={canManage ? "cursor-pointer hover:bg-muted/40" : undefined}
                      onClick={canManage ? () => openEdit(v) : undefined}
                    >
                      <TableCell className="text-right text-xs font-mono text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="font-medium">{v.last_name} {v.first_name}</div>
                        {v.neighborhood && <div className="text-xs text-muted-foreground">{v.neighborhood}</div>}
                      </TableCell>
                      <TableCell className="text-sm font-mono">{v.phone}</TableCell>
                      <TableCell className="text-sm">
                        <div>{v.position ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{v.department ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-sm">{v.experience ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{fmtSalary(v.expected_salary)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {v.resume_url
                          ? <a href={v.resume_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-sm"><FileText className="h-3.5 w-3.5" />Ochish<ExternalLink className="h-3 w-3" /></a>
                          : <span className="text-muted-foreground text-sm">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" title="Tahrirlash" onClick={() => openEdit(v)}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            {canHire && (
                              <Button size="sm" variant="ghost" className="text-status-green hover:text-status-green" title="Ishga qabul qilish" onClick={() => openHire(v)}>
                                <UserCheck className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!hireId} onOpenChange={(o) => { if (!o) setHireId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5 text-status-green" /> Ishga qabul qilish</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Nomzodning barcha ma'lumotlari Xodimlar ro'yxatiga ko'chiriladi. Vakansiya tarixi saqlanib qoladi.
          </p>
          <div className="space-y-3">
            <div><Label>Ishga qabul sanasi</Label><Input type="date" value={hireForm.hire_date} onChange={(e) => setHireForm({ ...hireForm, hire_date: e.target.value })} /></div>
            <div><Label>Login *</Label><Input value={hireForm.login} onChange={(e) => setHireForm({ ...hireForm, login: e.target.value })} autoComplete="off" /></div>
            <div><Label>Parol *</Label><Input type="text" value={hireForm.password} onChange={(e) => setHireForm({ ...hireForm, password: e.target.value })} autoComplete="new-password" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHireId(null)}>Bekor qilish</Button>
            <Button onClick={confirmHire}><UserCheck className="h-4 w-4 mr-1" />Ishga qabul qilish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
