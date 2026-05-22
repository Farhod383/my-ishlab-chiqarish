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
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Wrench, ArrowRightLeft, Undo2 } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { logAudit } from "@/types/erp";
import { toast } from "sonner";

type Instrument = {
  id: string;
  name: string;
  category: string;
  inventory_number: string | null;
  quantity: number;
  status: string;
  comment: string | null;
};

type Assignment = {
  id: string;
  instrument_id: string;
  employee_id: string;
  quantity: number;
  issued_at: string;
  returned_at: string | null;
  issue_comment: string | null;
  return_comment: string | null;
  instrument?: { name: string; inventory_number: string | null } | null;
  employee?: { full_name: string } | null;
};

const STATUSES = [
  { v: "active", l: "Faol" },
  { v: "repair", l: "Ta'mirda" },
  { v: "written_off", l: "Hisobdan chiqarilgan" },
];

export default function InstrumentsTab() {
  const { user, hasRole } = useAuth();
  const canManage = hasRole(["warehouse", "admin", "cashier", "hr"]);

  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  // add/edit instrument
  const [iOpen, setIOpen] = useState(false);
  const [iEditId, setIEditId] = useState<string | null>(null);
  const [iForm, setIForm] = useState({ name: "", category: "", inventory_number: "", quantity: "1", status: "active", comment: "" });

  // issue
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({ employee_id: "", instrument_id: "", quantity: "1", issued_at: new Date().toISOString().slice(0, 10), comment: "" });

  // return
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnEmp, setReturnEmp] = useState("");
  const [returnAssignment, setReturnAssignment] = useState("");
  const [returnComment, setReturnComment] = useState("");

  const load = async () => {
    const [inst, asg, emp] = await Promise.all([
      supabase.from("instruments").select("*").order("name"),
      supabase
        .from("instrument_assignments")
        .select("*, instrument:instruments(name, inventory_number), employee:employees(full_name)")
        .order("issued_at", { ascending: false })
        .limit(500),
      supabase.from("employees").select("id, full_name, department").eq("status", "active").order("full_name"),
    ]);
    setInstruments((inst.data as any) ?? []);
    setAssignments((asg.data as any) ?? []);
    setEmployees(emp.data ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("instruments-tab")
      .on("postgres_changes", { event: "*", schema: "public", table: "instruments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "instrument_assignments" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const heldByEmp = useMemo(() => {
    const m: Record<string, Assignment[]> = {};
    assignments.filter(a => !a.returned_at).forEach(a => {
      (m[a.employee_id] ||= []).push(a);
    });
    return m;
  }, [assignments]);

  const resetIForm = () => setIForm({ name: "", category: "", inventory_number: "", quantity: "1", status: "active", comment: "" });

  const openAdd = () => { setIEditId(null); resetIForm(); setIOpen(true); };
  const openEdit = (it: Instrument) => {
    setIEditId(it.id);
    setIForm({
      name: it.name, category: it.category ?? "", inventory_number: it.inventory_number ?? "",
      quantity: String(it.quantity), status: it.status, comment: it.comment ?? "",
    });
    setIOpen(true);
  };

  const saveInstrument = async () => {
    if (!iForm.name.trim()) { toast.error("Nomini kiriting"); return; }
    const payload: any = {
      name: iForm.name.trim(),
      category: iForm.category.trim(),
      inventory_number: iForm.inventory_number.trim() || null,
      quantity: Number(iForm.quantity) || 0,
      status: iForm.status,
      comment: iForm.comment.trim() || null,
    };
    if (iEditId) {
      const { error } = await supabase.from("instruments").update(payload).eq("id", iEditId);
      if (error) { toast.error(error.message); return; }
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Instrument tahrirlandi", entity: "instrument", details: `${payload.name}` });
    } else {
      payload.created_by = user?.id;
      const { error } = await supabase.from("instruments").insert(payload);
      if (error) { toast.error(error.message); return; }
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Instrument qo'shildi", entity: "instrument", details: `${payload.name} ×${payload.quantity}` });
    }
    toast.success("Saqlandi");
    setIOpen(false); resetIForm(); setIEditId(null);
  };

  const deleteInstrument = async (it: Instrument) => {
    const held = assignments.some(a => a.instrument_id === it.id && !a.returned_at);
    if (held) { toast.error("Bu instrument xodimlarda mavjud. Avval qaytarib oling."); return; }
    if (!window.confirm(`O'chirish: ${it.name}?`)) return;
    const { error } = await supabase.from("instruments").delete().eq("id", it.id);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Instrument o'chirildi", entity: "instrument", details: it.name });
    toast.success("O'chirildi");
  };

  const doIssue = async () => {
    const qty = Number(issueForm.quantity);
    if (!issueForm.employee_id || !issueForm.instrument_id || !qty) { toast.error("Maydonlarni to'ldiring"); return; }
    const inst = instruments.find(i => i.id === issueForm.instrument_id);
    if (!inst) return;
    if (qty > Number(inst.quantity)) { toast.error(`Skladda yetarli emas (${inst.quantity})`); return; }
    const emp = employees.find(e => e.id === issueForm.employee_id);
    const { error } = await supabase.from("instrument_assignments").insert({
      instrument_id: issueForm.instrument_id,
      employee_id: issueForm.employee_id,
      quantity: qty,
      issued_at: new Date(issueForm.issued_at).toISOString(),
      issue_comment: issueForm.comment.trim() || null,
      issued_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Instrument berildi", entity: "instrument_assignment", details: `${inst.name} ×${qty} → ${emp?.full_name}` });
    toast.success("Berildi");
    setIssueForm({ employee_id: "", instrument_id: "", quantity: "1", issued_at: new Date().toISOString().slice(0, 10), comment: "" });
    setIssueOpen(false);
  };

  const empHeld = returnEmp ? (heldByEmp[returnEmp] ?? []) : [];
  const doReturn = async () => {
    if (!returnEmp || !returnAssignment) { toast.error("Tanlang"); return; }
    const a = assignments.find(x => x.id === returnAssignment);
    if (!a) return;
    const { error } = await supabase.from("instrument_assignments").update({
      returned_at: new Date().toISOString(),
      return_comment: returnComment.trim() || null,
      returned_by: user?.id,
    }).eq("id", returnAssignment);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Instrument qaytarildi", entity: "instrument_assignment", details: `${a.instrument?.name} ×${a.quantity} ← ${a.employee?.full_name}` });
    toast.success("Qaytarildi");
    setReturnEmp(""); setReturnAssignment(""); setReturnComment("");
    setReturnOpen(false);
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? instruments.filter(i =>
        [i.name, i.category, i.inventory_number, i.comment].some((v: any) => (v ?? "").toString().toLowerCase().includes(q))
      )
    : instruments;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Qidirish..." className="max-w-md" />
        {canManage && (
          <div className="flex gap-2 flex-wrap">
            <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
              <DialogTrigger asChild><Button variant="default"><ArrowRightLeft className="h-4 w-4 mr-2" />Berish</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Instrument berish</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Xodim *</Label>
                    <Select value={issueForm.employee_id} onValueChange={v => setIssueForm({ ...issueForm, employee_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                      <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name} {e.department && `(${e.department})`}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Instrument *</Label>
                    <Select value={issueForm.instrument_id} onValueChange={v => setIssueForm({ ...issueForm, instrument_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                      <SelectContent>{instruments.filter(i => Number(i.quantity) > 0 && i.status === "active").map(i => <SelectItem key={i.id} value={i.id}>{i.name} (qoldiq: {i.quantity})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Miqdor *</Label><Input type="number" min={1} value={issueForm.quantity} onChange={e => setIssueForm({ ...issueForm, quantity: e.target.value })} /></div>
                    <div><Label>Sana</Label><Input type="date" value={issueForm.issued_at} onChange={e => setIssueForm({ ...issueForm, issued_at: e.target.value })} /></div>
                  </div>
                  <div><Label>Izoh</Label><Textarea value={issueForm.comment} onChange={e => setIssueForm({ ...issueForm, comment: e.target.value })} /></div>
                  <Button className="w-full" onClick={doIssue}>Saqlash</Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={returnOpen} onOpenChange={(o) => { setReturnOpen(o); if (!o) { setReturnEmp(""); setReturnAssignment(""); setReturnComment(""); } }}>
              <DialogTrigger asChild><Button variant="secondary"><Undo2 className="h-4 w-4 mr-2" />Qaytarib olish</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Instrument qaytarib olish</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Xodim *</Label>
                    <Select value={returnEmp} onValueChange={(v) => { setReturnEmp(v); setReturnAssignment(""); }}>
                      <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(heldByEmp).map(empId => {
                          const e = employees.find(x => x.id === empId) || assignments.find(a => a.employee_id === empId)?.employee;
                          const name = (e as any)?.full_name ?? "?";
                          return <SelectItem key={empId} value={empId}>{name} ({heldByEmp[empId].length})</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Instrument *</Label>
                    <Select value={returnAssignment} onValueChange={setReturnAssignment} disabled={!returnEmp}>
                      <SelectTrigger><SelectValue placeholder={returnEmp ? "Tanlang" : "Avval xodimni tanlang"} /></SelectTrigger>
                      <SelectContent>{empHeld.map(a => <SelectItem key={a.id} value={a.id}>{a.instrument?.name} ×{a.quantity} · {new Date(a.issued_at).toLocaleDateString()}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Izoh</Label><Textarea value={returnComment} onChange={e => setReturnComment(e.target.value)} /></div>
                  <Button className="w-full" onClick={doReturn}>Saqlash</Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={iOpen} onOpenChange={(o) => { setIOpen(o); if (!o) { setIEditId(null); resetIForm(); } }}>
              <DialogTrigger asChild><Button variant="outline" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Instrument qo'shish</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{iEditId ? "Tahrirlash" : "Yangi instrument"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Nomi *</Label><Input value={iForm.name} onChange={e => setIForm({ ...iForm, name: e.target.value })} placeholder="Masalan: Perforator" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Kategoriya</Label><Input value={iForm.category} onChange={e => setIForm({ ...iForm, category: e.target.value })} placeholder="Elektr / Qo'l asbobi" /></div>
                    <div><Label>Inventar №</Label><Input value={iForm.inventory_number} onChange={e => setIForm({ ...iForm, inventory_number: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Miqdor *</Label><Input type="number" min={0} value={iForm.quantity} onChange={e => setIForm({ ...iForm, quantity: e.target.value })} disabled={!!iEditId} /></div>
                    <div><Label>Holat</Label>
                      <Select value={iForm.status} onValueChange={v => setIForm({ ...iForm, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUSES.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  {iEditId && <p className="text-xs text-muted-foreground">Miqdorni tahrirlash uchun berish/qaytarib olishdan foydalaning.</p>}
                  <div><Label>Izoh</Label><Textarea value={iForm.comment} onChange={e => setIForm({ ...iForm, comment: e.target.value })} /></div>
                  <Button className="w-full" onClick={saveInstrument}>Saqlash</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomi</TableHead>
                  <TableHead>Kategoriya</TableHead>
                  <TableHead>Inventar №</TableHead>
                  <TableHead className="text-right">Skladdagi qoldiq</TableHead>
                  <TableHead className="text-right">Berilgan</TableHead>
                  <TableHead>Holat</TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(it => {
                  const issued = assignments.filter(a => a.instrument_id === it.id && !a.returned_at)
                    .reduce((s, a) => s + Number(a.quantity), 0);
                  const st = STATUSES.find(s => s.v === it.status);
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium flex items-center gap-2"><Wrench className="h-4 w-4 text-muted-foreground" />{it.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{it.category || "—"}</TableCell>
                      <TableCell className="text-sm font-mono">{it.inventory_number || "—"}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{it.quantity}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{issued || "—"}</TableCell>
                      <TableCell><Badge variant={it.status === "active" ? "default" : "secondary"}>{st?.l ?? it.status}</Badge></TableCell>
                      {canManage && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(it)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteInstrument(it)}><Trash2 className="h-3.5 w-3.5 text-status-red" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Instrumentlar yo'q</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Active assignments */}
      <Card>
        <CardContent className="p-0">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Xodim</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead className="text-right">Miqdor</TableHead>
                  <TableHead>Berilgan sana</TableHead>
                  <TableHead>Izoh</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.filter(a => !a.returned_at).map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.employee?.full_name ?? "—"}</TableCell>
                    <TableCell>{a.instrument?.name ?? "—"}{a.instrument?.inventory_number && <span className="text-xs text-muted-foreground ml-1">№{a.instrument.inventory_number}</span>}</TableCell>
                    <TableCell className="text-right font-mono">{a.quantity}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(a.issued_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs italic text-muted-foreground">{a.issue_comment ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {assignments.filter(a => !a.returned_at).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">Hozircha topshirilmagan instrumentlar yo'q</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
