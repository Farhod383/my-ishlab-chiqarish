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
import { Plus, Pencil, Trash2, Wrench, ArrowRightLeft, Undo2, Package, History } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useLocalize } from "@/i18n/context";
import { logAudit } from "@/types/erp";
import { toast } from "sonner";
import NumberInput from "@/components/NumberInput";
import SearchableSelect from "@/components/SearchableSelect";
import SmartAutocomplete, { rememberFormValue } from "@/components/SmartAutocomplete";
import { ensureOnline } from "@/components/OnlineGuard";

type Instrument = {
  id: string;
  name: string;
  category: string;
  inventory_number: string | null;
  quantity: number;
  status: string;
  comment: string | null;
  price: number;
  currency: string;
  created_at?: string;
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

type Group = {
  key: string;             // normalized name
  name: string;            // display
  category: string;
  batches: Instrument[];
  totalQty: number;        // sum of stock
  totalIssued: number;     // currently held
  statusMix: string[];
};

const STATUSES = [
  { v: "active", l: "Faol" },
  { v: "repair", l: "Ta'mirda" },
  { v: "written_off", l: "Hisobdan chiqarilgan" },
];

const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleDateString() : "—";
const daysBetween = (a: string, b?: string | null) => {
  const end = b ? new Date(b).getTime() : Date.now();
  return Math.max(0, Math.floor((end - new Date(a).getTime()) / 86400000));
};

export default function InstrumentsTab() {
  const { user, hasRole } = useAuth();
  const localize = useLocalize();
  const canManage = hasRole(["warehouse", "admin", "cashier", "hr"]);

  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  // add/edit single batch
  const [iOpen, setIOpen] = useState(false);
  const [iEditId, setIEditId] = useState<string | null>(null);
  const [iForm, setIForm] = useState({ name: "", category: "", inventory_number: "", quantity: "1", status: "active", comment: "", price: "0", currency: "UZS" });

  // group detail
  const [detailKey, setDetailKey] = useState<string | null>(null);

  // issue: name-based; backend resolves to batch
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({ employee_id: "", group_key: "", quantity: "1", issued_at: new Date().toISOString().slice(0, 10), comment: "" });

  // return
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnEmp, setReturnEmp] = useState("");
  const [returnAssignment, setReturnAssignment] = useState("");
  const [returnComment, setReturnComment] = useState("");

  const load = async () => {
    const [inst, asg, emp] = await Promise.all([
      supabase.from("instruments").select("*").order("name").order("created_at"),
      supabase
        .from("instrument_assignments")
        .select("*, instrument:instruments(name, inventory_number), employee:employees(full_name)")
        .order("issued_at", { ascending: false })
        .limit(2000),
      supabase.from("employees").select("id, full_name, department").eq("status", "active").order("full_name"),
    ]);
    setInstruments((inst.data as any) ?? []);
    setAssignments((asg.data as any) ?? []);
    setEmployees(emp.data ?? []);
    ((inst.data as any[]) ?? []).forEach(i => {
      const cat = (i.category ?? "").trim();
      if (cat) rememberFormValue("instrument_category", cat);
      const name = (i.name ?? "").trim();
      if (name) rememberFormValue("instrument_name", name);
    });
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
    assignments.filter(a => !a.returned_at).forEach(a => { (m[a.employee_id] ||= []).push(a); });
    return m;
  }, [assignments]);

  // Group by normalized name
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    instruments.forEach(it => {
      const key = (it.name ?? "").trim().toLowerCase();
      if (!map.has(key)) map.set(key, {
        key, name: it.name, category: it.category ?? "",
        batches: [], totalQty: 0, totalIssued: 0, statusMix: [],
      });
      const g = map.get(key)!;
      g.batches.push(it);
      g.totalQty += Number(it.quantity) || 0;
      if (it.category && !g.category) g.category = it.category;
      if (!g.statusMix.includes(it.status)) g.statusMix.push(it.status);
    });
    // currently held per group
    const heldByInstr = new Map<string, number>();
    assignments.filter(a => !a.returned_at).forEach(a => {
      heldByInstr.set(a.instrument_id, (heldByInstr.get(a.instrument_id) ?? 0) + Number(a.quantity));
    });
    map.forEach(g => {
      g.totalIssued = g.batches.reduce((s, b) => s + (heldByInstr.get(b.id) ?? 0), 0);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [instruments, assignments]);

  const q = search.trim().toLowerCase();
  const filteredGroups = q
    ? groups.filter(g => [g.name, g.category, ...g.batches.map(b => b.inventory_number ?? "")].some(v => (v ?? "").toLowerCase().includes(q)))
    : groups;

  const detailGroup = detailKey ? groups.find(g => g.key === detailKey) ?? null : null;
  const detailHistory = useMemo(() => {
    if (!detailGroup) return [];
    const ids = new Set(detailGroup.batches.map(b => b.id));
    return assignments
      .filter(a => ids.has(a.instrument_id))
      .sort((a, b) => (b.issued_at ?? "").localeCompare(a.issued_at ?? ""));
  }, [detailGroup, assignments]);

  // -------- CRUD --------
  const resetIForm = () => setIForm({ name: "", category: "", inventory_number: "", quantity: "1", status: "active", comment: "", price: "0", currency: "UZS" });

  const openAdd = (prefName?: string) => {
    setIEditId(null);
    resetIForm();
    if (prefName) setIForm(f => ({ ...f, name: prefName }));
    setIOpen(true);
  };
  const openEdit = (it: Instrument) => {
    setIEditId(it.id);
    setIForm({
      name: it.name, category: it.category ?? "", inventory_number: it.inventory_number ?? "",
      quantity: String(it.quantity), status: it.status, comment: it.comment ?? "",
      price: String(it.price ?? 0), currency: it.currency ?? "UZS",
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
      price: Number(iForm.price) || 0,
      currency: iForm.currency || "UZS",
    };
    if (iEditId) {
      const { error } = await supabase.from("instruments").update(payload).eq("id", iEditId);
      if (error) { toast.error(error.message); return; }
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Instrument tahrirlandi", entity: "instrument", details: `${payload.name}` });
    } else {
      payload.created_by = user?.id;
      const { error } = await supabase.from("instruments").insert(payload);
      if (error) { toast.error(error.message); return; }
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Instrument kirimi (batch)", entity: "instrument", details: `${payload.name} ×${payload.quantity}` });
    }
    if (payload.category) await rememberFormValue("instrument_category", payload.category, user?.id);
    if (payload.name) await rememberFormValue("instrument_name", payload.name, user?.id);
    toast.success("Saqlandi");
    setIOpen(false); resetIForm(); setIEditId(null);
  };

  const deleteInstrument = async (it: Instrument) => {
    const held = assignments.some(a => a.instrument_id === it.id && !a.returned_at);
    if (held) { toast.error("Bu batch xodimlarda mavjud. Avval qaytarib oling."); return; }
    if (!window.confirm(`Batchni o'chirish: ${it.name} (${it.quantity} dona)?`)) return;
    const { error } = await supabase.from("instruments").delete().eq("id", it.id);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Instrument batch o'chirildi", entity: "instrument", details: it.name });
    toast.success("O'chirildi");
  };

  // -------- Issue (FIFO across batches) --------
  const doIssue = async () => {
    const qty = Number(issueForm.quantity);
    const g = groups.find(x => x.key === issueForm.group_key);
    if (!issueForm.employee_id || !g || !qty) { toast.error("Maydonlarni to'ldiring"); return; }
    if (!ensureOnline((m) => toast.error(m))) return;
    if (qty > g.totalQty) {
      await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Instrument berish BLOKLANDI", entity: "instrument_assignment", details: `${g.name}: so'ralgan ${qty}, mavjud ${g.totalQty}` });
      toast.error(`Skladda yetarli emas (${g.totalQty})`); return;
    }
    // FIFO: oldest active batches first
    const usable = [...g.batches]
      .filter(b => b.status === "active" && Number(b.quantity) > 0)
      .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    let remaining = qty;
    const emp = employees.find(e => e.id === issueForm.employee_id);
    for (const b of usable) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(b.quantity));
      const { error } = await supabase.from("instrument_assignments").insert({
        instrument_id: b.id,
        employee_id: issueForm.employee_id,
        quantity: take,
        issued_at: new Date(issueForm.issued_at).toISOString(),
        issue_comment: issueForm.comment.trim() || null,
        issued_by: user?.id,
      });
      if (error) { toast.error(error.message); return; }
      remaining -= take;
    }
    if (remaining > 0) { toast.error("Faol batchlarda yetarli emas"); return; }
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Instrument berildi", entity: "instrument_assignment", details: `${g.name} ×${qty} → ${emp?.full_name}` });
    toast.success("Berildi");
    setIssueForm({ employee_id: "", group_key: "", quantity: "1", issued_at: new Date().toISOString().slice(0, 10), comment: "" });
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
                    <SearchableSelect
                      value={issueForm.employee_id}
                      onChange={v => setIssueForm({ ...issueForm, employee_id: v })}
                      placeholder="Xodim tanlang"
                      options={employees.map(e => ({ value: e.id, label: localize(e.full_name), hint: e.department }))}
                    />
                  </div>
                  <div><Label>Instrument *</Label>
                    <SearchableSelect
                      value={issueForm.group_key}
                      onChange={v => setIssueForm({ ...issueForm, group_key: v })}
                      placeholder="Instrument tanlang"
                      options={groups.filter(g => g.totalQty > 0).map(g => ({ value: g.key, label: g.name, hint: `jami: ${g.totalQty}` }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Miqdor *</Label><NumberInput min={1} value={issueForm.quantity} onChange={e => setIssueForm({ ...issueForm, quantity: e.target.value })} /></div>
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
                    <SearchableSelect
                      value={returnEmp}
                      onChange={(v) => { setReturnEmp(v); setReturnAssignment(""); }}
                      placeholder="Xodim tanlang"
                      options={Object.keys(heldByEmp).map(empId => {
                        const e = employees.find(x => x.id === empId) || assignments.find(a => a.employee_id === empId)?.employee;
                        const name = (e as any)?.full_name ?? "?";
                        return { value: empId, label: localize(name), hint: `${heldByEmp[empId].length} ta` };
                      })}
                    />
                  </div>
                  <div><Label>Instrument *</Label>
                    <SearchableSelect
                      value={returnAssignment}
                      onChange={setReturnAssignment}
                      disabled={!returnEmp}
                      placeholder={returnEmp ? "Tanlang" : "Avval xodimni tanlang"}
                      options={empHeld.map(a => ({ value: a.id, label: `${a.instrument?.name} ×${a.quantity}`, hint: new Date(a.issued_at).toLocaleDateString() }))}
                    />
                  </div>
                  <div><Label>Izoh</Label><Textarea value={returnComment} onChange={e => setReturnComment(e.target.value)} /></div>
                  <Button className="w-full" onClick={doReturn}>Saqlash</Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="outline" onClick={() => openAdd()}><Plus className="h-4 w-4 mr-2" />Instrument qo'shish</Button>
          </div>
        )}
      </div>

      {/* Grouped list */}
      <Card>
        <CardContent className="p-0">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">№</TableHead>
                  <TableHead>Nomi</TableHead>
                  <TableHead>Kategoriya</TableHead>
                  <TableHead className="text-right">Jami (sklad)</TableHead>
                  <TableHead className="text-right">Berilgan</TableHead>
                  <TableHead className="text-right">Batchlar</TableHead>
                  <TableHead>Holat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.map((g, idx) => (
                  <TableRow
                    key={g.key}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setDetailKey(g.key)}
                  >
                    <TableCell className="text-right text-xs font-mono text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium flex items-center gap-2"><Wrench className="h-4 w-4 text-muted-foreground" />{g.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{g.category || "—"}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{g.totalQty}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{g.totalIssued || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{g.batches.length}</TableCell>
                    <TableCell>
                      {g.statusMix.includes("active")
                        ? <Badge variant="default">Faol</Badge>
                        : <Badge variant="secondary">{STATUSES.find(s => s.v === g.statusMix[0])?.l ?? g.statusMix[0]}</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredGroups.length === 0 && (
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
                  <TableHead className="w-12 text-right">№</TableHead>
                  <TableHead>Xodim</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead className="text-right">Miqdor</TableHead>
                  <TableHead>Berilgan sana</TableHead>
                  <TableHead>Izoh</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.filter(a => !a.returned_at).map((a, idx) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-right text-xs font-mono text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium">{localize(a.employee?.full_name) || "—"}</TableCell>
                    <TableCell>{a.instrument?.name ?? "—"}{a.instrument?.inventory_number && <span className="text-xs text-muted-foreground ml-1">№{a.instrument.inventory_number}</span>}</TableCell>
                    <TableCell className="text-right font-mono">{a.quantity}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(a.issued_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs italic text-muted-foreground">{a.issue_comment ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {assignments.filter(a => !a.returned_at).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">Hozircha topshirilmagan instrumentlar yo'q</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ------- Group detail dialog ------- */}
      <Dialog open={!!detailKey} onOpenChange={(o) => { if (!o) setDetailKey(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detailGroup && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" /> {detailGroup.name}
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Jami sklad</div>
                  <div className="text-lg font-bold font-mono">{detailGroup.totalQty}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Hozir xodimlarda</div>
                  <div className="text-lg font-bold font-mono text-status-yellow">{detailGroup.totalIssued}</div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">Batchlar</div>
                  <div className="text-lg font-bold font-mono">{detailGroup.batches.length}</div>
                </div>
              </div>

              {/* Batches */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5"><Package className="h-4 w-4" /> Batchlar (kirimlar)</h4>
                  {canManage && (
                    <Button size="sm" variant="outline" onClick={() => { setDetailKey(null); openAdd(detailGroup.name); }}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Yangi batch
                    </Button>
                  )}
                </div>
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Inventar №</TableHead>
                        <TableHead>Kirim sanasi</TableHead>
                        <TableHead className="text-right">Miqdor</TableHead>
                        <TableHead className="text-right">Narx</TableHead>
                        <TableHead>Holat</TableHead>
                        {canManage && <TableHead></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailGroup.batches.map((b, idx) => {
                        const st = STATUSES.find(s => s.v === b.status);
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="font-mono text-xs">#{idx + 1}</TableCell>
                            <TableCell className="font-mono text-xs">{b.inventory_number || "—"}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{fmtDate(b.created_at)}</TableCell>
                            <TableCell className="text-right font-mono">{b.quantity}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{Number(b.price) > 0 ? `${Number(b.price).toLocaleString("ru-RU")} ${b.currency}` : "—"}</TableCell>
                            <TableCell><Badge variant={b.status === "active" ? "default" : "secondary"}>{st?.l ?? b.status}</Badge></TableCell>
                            {canManage && (
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => { setDetailKey(null); openEdit(b); }}><Pencil className="h-3.5 w-3.5" /></Button>
                                  <Button size="sm" variant="ghost" onClick={() => deleteInstrument(b)}><Trash2 className="h-3.5 w-3.5 text-status-red" /></Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Full history timeline */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-1.5"><History className="h-4 w-4" /> To'liq foydalanish tarixi</h4>
                {detailHistory.length === 0 && (
                  <div className="text-sm text-muted-foreground italic text-center py-4">Hech kimga berilmagan</div>
                )}
                <div className="space-y-2">
                  {detailHistory.map(a => {
                    const active = !a.returned_at;
                    return (
                      <div key={a.id} className={`border-l-4 rounded-md border p-2.5 ${active ? "border-l-status-green bg-status-green/5" : "border-l-muted-foreground/30"}`}>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="font-medium text-sm">{localize(a.employee?.full_name) || "—"}</div>
                          {active
                            ? <Badge className="bg-status-green text-white">🟢 Hozir shu xodimda</Badge>
                            : <Badge variant="outline">Qaytarilgan</Badge>}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5 text-xs">
                          <div>
                            <div className="text-muted-foreground">Berildi</div>
                            <div className="font-mono">{fmtDate(a.issued_at)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Qaytarildi</div>
                            <div className="font-mono">{a.returned_at ? fmtDate(a.returned_at) : "—"}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Kun</div>
                            <div className="font-mono">{daysBetween(a.issued_at, a.returned_at)} kun{active ? " (davom etmoqda)" : ""}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Miqdor</div>
                            <div className="font-mono">{a.quantity}</div>
                          </div>
                        </div>
                        {(a.issue_comment || a.return_comment) && (
                          <div className="mt-1.5 text-xs text-muted-foreground italic space-y-0.5">
                            {a.issue_comment && <div>📝 Berishda: {a.issue_comment}</div>}
                            {a.return_comment && <div>↩️ Qaytarishda: {a.return_comment}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/edit single batch */}
      <Dialog open={iOpen} onOpenChange={(o) => { setIOpen(o); if (!o) { setIEditId(null); resetIForm(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{iEditId ? "Batchni tahrirlash" : "Yangi batch (kirim)"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nomi *</Label><SmartAutocomplete fieldKey="instrument_name" value={iForm.name} onChange={v => setIForm({ ...iForm, name: v })} placeholder="Masalan: Bolgarka 125 mm" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Kategoriya</Label><SmartAutocomplete fieldKey="instrument_category" value={iForm.category} onChange={v => setIForm({ ...iForm, category: v })} placeholder="Elektr / Qo'l asbobi / Payvandlash" /></div>
              <div><Label>Inventar №</Label><Input value={iForm.inventory_number} onChange={e => setIForm({ ...iForm, inventory_number: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Miqdor *</Label><NumberInput min={0} value={iForm.quantity} onChange={e => setIForm({ ...iForm, quantity: e.target.value })} disabled={!!iEditId} /></div>
              <div><Label>Holat</Label>
                <Select value={iForm.status} onValueChange={v => setIForm({ ...iForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {iEditId && <p className="text-xs text-muted-foreground">Miqdorni tahrirlash uchun berish/qaytarib olishdan foydalaning.</p>}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Narx</Label><NumberInput min={0} value={iForm.price} onChange={e => setIForm({ ...iForm, price: e.target.value })} /></div>
              <div><Label>Valyuta</Label>
                <Select value={iForm.currency} onValueChange={v => setIForm({ ...iForm, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UZS">UZS (so'm)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Izoh</Label><Textarea value={iForm.comment} onChange={e => setIForm({ ...iForm, comment: e.target.value })} /></div>
            <Button className="w-full" onClick={saveInstrument}>Saqlash</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
