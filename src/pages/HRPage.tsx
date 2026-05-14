import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Edit2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { toast } from "sonner";

export default function HRPage() {
  const { hasRole } = useAuth();
  const { t } = useI18n();
  const hr = (t as any).hr ?? {};
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: "", position: "", department: "", phone: "", hire_date: new Date().toISOString().slice(0, 10), leave_date: "", status: "active" });

  const load = async () => {
    const { data } = await supabase.from("employees").select("*").order("full_name");
    setEmployees(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const canManage = hasRole(["hr", "admin", "cashier"]);

  const resetForm = () => setForm({ full_name: "", position: "", department: "", phone: "", hire_date: new Date().toISOString().slice(0, 10), leave_date: "", status: "active" });

  const save = async () => {
    if (!form.full_name.trim()) { toast.error(hr.fillFields ?? "Maydonlarni to'ldiring"); return; }
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
                  <div><Label>{hr.leaveDate ?? "Ketgan sana"}</Label><Input type="date" value={form.leave_date} onChange={e => setForm({ ...form, leave_date: e.target.value })} /></div>
                </div>
                <div>
                  <Label>{hr.status ?? "Holat"}</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{hr.active ?? "Faol"}</SelectItem>
                      <SelectItem value="inactive">{hr.inactive ?? "Nofaol"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={save}>{t.common.save}</Button>
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
                  <TableHead>{hr.fullName ?? "Ism"}</TableHead>
                  <TableHead>{hr.position ?? "Lavozim"}</TableHead>
                  <TableHead>{hr.department ?? "Bo'lim"}</TableHead>
                  <TableHead>{hr.phone ?? "Telefon"}</TableHead>
                  <TableHead>{hr.hireDate ?? "Ish boshlagan"}</TableHead>
                  <TableHead>{hr.status ?? "Holat"}</TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>}
                {!loading && employees.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.full_name}</TableCell>
                    <TableCell className="text-sm">{e.position}</TableCell>
                    <TableCell className="text-sm">{e.department}</TableCell>
                    <TableCell className="text-sm">{e.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm">{e.hire_date}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === "active" ? "default" : "secondary"}>
                        {e.status === "active" ? (hr.active ?? "Faol") : (hr.inactive ?? "Nofaol")}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(e)}><Edit2 className="h-3 w-3" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {!loading && employees.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{hr.empty ?? "Xodimlar yo'q"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
