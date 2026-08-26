import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Search, Edit2, UserCheck, UserX } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { toast } from "sonner";

interface ManagedUser {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  position: string;
  department: string;
  roles: string[];
  active: boolean;
  created_at: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  cashier: "Kassir",
  chief_accountant: "Glavniy buxgalter",
  marketing: "Marketing",
  manager: "Nachalnik",
  warehouse: "Skladchi",
  supply: "Ta'minotchi",
  otk: "OTK",
  hr: "HR",
  engineer: "Konstruktor",
  worker: "Ishchi",
};

const emptyForm = {
  full_name: "", phone: "", login: "", password: "",
  position: "", department: "Kassa", role: "cashier",
};

export default function UsersTab() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const assignableRoles = isAdmin
    ? ["cashier", "chief_accountant", "hr", "warehouse", "supply", "otk", "manager", "marketing", "engineer", "admin"]
    : ["cashier"];

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);

  const call = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-users", { body: payload });
    if (error) {
      let msg = error.message;
      try { const ctx: any = (error as any).context; const j = ctx && await ctx.json?.(); if (j?.error) msg = j.error; } catch { /* ignore */ }
      throw new Error(msg);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const load = async () => {
    setLoading(true);
    try {
      const d = await call({ action: "list" });
      setUsers(d.users ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Yuklashda xatolik");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) =>
      [u.full_name, u.email, u.phone, u.position, u.department, ...u.roles]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(s)));
  }, [users, q]);

  const openCreate = () => { setEditId(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (u: ManagedUser) => {
    setEditId(u.id);
    setForm({
      full_name: u.full_name, phone: u.phone, login: u.email, password: "",
      position: u.position, department: u.department || "Kassa",
      role: u.roles[0] ?? "cashier",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.full_name.trim()) { toast.error("F.I.Sh. majburiy"); return; }
    if (!editId && (!form.login.trim() || form.password.length < 6)) {
      toast.error("Login va parol (kamida 6 belgi) majburiy"); return;
    }
    if (editId && form.password && form.password.length < 6) {
      toast.error("Parol kamida 6 belgi bo'lishi kerak"); return;
    }
    setBusy(true);
    try {
      if (editId) {
        await call({ action: "update", id: editId, ...form });
        toast.success("Foydalanuvchi yangilandi");
      } else {
        await call({ action: "create", ...form });
        toast.success("Yangi foydalanuvchi yaratildi");
      }
      setOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Xatolik");
    }
    setBusy(false);
  };

  const toggleActive = async (u: ManagedUser) => {
    try {
      await call({ action: "set_active", id: u.id, active: !u.active });
      toast.success(u.active ? "Deaktivlashtirildi" : "Aktivlashtirildi");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Xatolik");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Yangi foydalanuvchi</Button>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="F.I.Sh., login, telefon, lavozim..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">№</TableHead>
                <TableHead>F.I.Sh.</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Lavozim</TableHead>
                <TableHead>Bo'lim</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead className="text-right">Amallar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Yuklanmoqda...</TableCell></TableRow>}
              {!loading && filtered.map((u, i) => (
                <TableRow key={u.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(u)}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>{u.phone || "—"}</TableCell>
                  <TableCell>{u.position || "—"}</TableCell>
                  <TableCell>{u.department || "—"}</TableCell>
                  <TableCell className="space-x-1">
                    {u.roles.map((r) => <Badge key={r} variant="secondary">{ROLE_LABELS[r] ?? r}</Badge>)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={u.active
                      ? "bg-status-green/10 text-status-green border-status-green/30"
                      : "bg-status-red/10 text-status-red border-status-red/30"}>
                      {u.active ? "Aktiv" : "Deaktiv"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(u); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toggleActive(u); }}>
                      {u.active ? <UserX className="h-3.5 w-3.5 text-status-red" /> : <UserCheck className="h-3.5 w-3.5 text-status-green" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Foydalanuvchilar yo'q</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Foydalanuvchini tahrirlash" : "Yangi foydalanuvchi"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><Label>F.I.Sh.</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>Telefon</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Login (email)</Label><Input value={form.login} disabled={!!editId} onChange={(e) => setForm({ ...form, login: e.target.value })} /></div>
            <div><Label>{editId ? "Yangi parol (ixtiyoriy)" : "Parol"}</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div><Label>Lavozim</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
            <div><Label>Bo'lim</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
            <div>
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Bekor qilish</Button>
            <Button onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saqlash"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
