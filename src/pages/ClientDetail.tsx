import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "@/hooks/use-toast";
import { useEmployees } from "@/hooks/useEmployees";
import { CLIENT_TYPES } from "@/pages/ClientsPage";
import {
  ArrowLeft, Phone, MapPin, Mail, User as UserIcon, Loader2, Plus, MessageSquare,
  FileText, History, Pencil, Upload, ExternalLink, Briefcase, CalendarDays,
} from "lucide-react";

const KINDS: Record<string, string> = { phone: "Telefon", telegram: "Telegram", meeting: "Uchrashuv", other: "Boshqa" };
const DOC_STATUS: Record<string, { label: string; cls: string }> = {
  issued: { label: "Berilgan", cls: "bg-status-green/10 text-status-green border-status-green/30" },
  pending: { label: "Kutilmoqda", cls: "bg-status-yellow/15 text-status-yellow border-status-yellow/30" },
  missing: { label: "Berilmagan", cls: "bg-status-red/10 text-status-red border-status-red/30" },
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("uz-UZ", { dateStyle: "short", timeStyle: "short" }) : "—");
const fmtD = (d?: string | null) => (d ? new Date(d).toLocaleDateString("uz-UZ") : "—");

export default function ClientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const { employees } = useEmployees({ activeOnly: true });
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<any>({});
  const [intOpen, setIntOpen] = useState(false);
  const [intForm, setIntForm] = useState({ kind: "phone", content: "", next_contact_date: "", comment: "" });
  const [docOpen, setDocOpen] = useState(false);
  const [docForm, setDocForm] = useState({ name: "", doc_type: "", status: "pending", issued_at: "", comment: "" });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: c } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
    const { data: os } = await supabase
      .from("orders")
      .select("*, order_stages(id, name, stage_order, status, qc_required, qc_passed, started_at)")
      .eq("client_id", id)
      .order("created_at", { ascending: false });
    const { data: ints } = await supabase.from("client_interactions").select("*").eq("client_id", id).order("occurred_at", { ascending: false });
    const { data: dcs } = await supabase.from("client_documents").select("*").eq("client_id", id).order("created_at", { ascending: false });
    const { data: ea } = await supabase.from("entity_audit").select("*").eq("entity", "client").eq("entity_id", id).order("created_at", { ascending: false });
    const orderIds = (os ?? []).map((o: any) => o.id);
    let oa: any[] = [];
    if (orderIds.length) {
      const { data } = await supabase.from("audit_log").select("*").in("order_id", orderIds).order("created_at", { ascending: false }).limit(300);
      oa = data ?? [];
    }
    setClient(c);
    setOrders(os ?? []);
    setInteractions(ints ?? []);
    setDocs(dcs ?? []);
    setAudit([
      ...(ea ?? []).map((r: any) => ({ at: r.created_at, who: r.actor_name, action: r.action, details: auditDetails(r) })),
      ...oa.map((r: any) => ({ at: r.created_at, who: r.actor_name, action: r.action, details: r.details ?? "" })),
      ...(ints ?? []).map((r: any) => ({ at: r.occurred_at, who: r.actor_name, action: `Aloqa: ${KINDS[r.kind] ?? r.kind}`, details: r.content })),
    ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const progressOf = (o: any) => {
    const st = o.order_stages ?? [];
    if (o.status === "completed") return 100;
    if (!st.length) return 0;
    const done = st.filter((s: any) => s.status === "completed" && (!s.qc_required || s.qc_passed)).length;
    return Math.round((done / st.length) * 100);
  };
  const currentStage = (o: any) => {
    const st = [...(o.order_stages ?? [])].sort((a: any, b: any) => a.stage_order - b.stage_order);
    if (o.status === "completed") return "Tugallangan";
    return st.find((s: any) => s.status === "in_progress")?.name ?? st.find((s: any) => s.status !== "completed")?.name ?? "—";
  };
  const startedAt = (o: any) => {
    const st = [...(o.order_stages ?? [])].sort((a: any, b: any) => a.stage_order - b.stage_order);
    return st.find((s: any) => s.started_at)?.started_at ?? null;
  };

  const stats = useMemo(() => ({
    total: orders.length,
    active: orders.filter((o) => o.status !== "completed" && o.status !== "cancelled").length,
    inProgress: orders.filter((o) => o.status === "in_progress").length,
    completed: orders.filter((o) => o.status === "completed").length,
    delayed: orders.filter((o) => o.status === "delayed").length,
  }), [orders]);

  const lastContact = interactions[0] ?? null;
  const nextContact = useMemo(() => {
    const dates = interactions.map((i) => i.next_contact_date).filter(Boolean).sort();
    const today = new Date().toISOString().slice(0, 10);
    return dates.find((d: string) => d >= today) ?? dates[dates.length - 1] ?? null;
  }, [interactions]);

  const openEdit = () => { setEdit({ ...client }); setEditOpen(true); };

  const saveClient = async () => {
    const nm = (edit.name ?? "").trim();
    if (!nm) { toast({ title: "Klient nomi majburiy", variant: "destructive" }); return; }
    setSaving(true);
    const patch: any = {
      name: nm,
      phone: edit.phone || null, phone2: edit.phone2 || null, address: edit.address || null,
      contact_person: edit.contact_person || null, email: edit.email || null, note: edit.note || null,
      client_type: edit.client_type || null, status: edit.status || "active",
      partnership_start: edit.partnership_start || null,
      responsible_employee_id: edit.responsible_employee_id || null,
    };
    const { error } = await supabase.from("clients").update(patch).eq("id", id!);
    setSaving(false);
    if (error) { toast({ title: "Xatolik", description: error.message, variant: "destructive" }); return; }
    const changed = Object.keys(patch).filter((k) => (client as any)[k] !== (patch as any)[k]);
    await supabase.from("entity_audit").insert({
      entity: "client", entity_id: id!, action: `Klient ma'lumotlari o'zgartirildi: ${changed.join(", ") || "—"}`,
      old_value: client as any, new_value: patch as any,
      actor_id: user?.id ?? null, actor_name: user?.email ?? null,
    });
    toast({ title: "Saqlandi" });
    setEditOpen(false);
    load();
  };

  const saveInteraction = async () => {
    if (!intForm.content.trim()) { toast({ title: "Suhbat mazmunini kiriting", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await supabase.from("client_interactions").insert({
      client_id: id!, kind: intForm.kind, content: intForm.content.trim(),
      next_contact_date: intForm.next_contact_date || null, comment: intForm.comment || null,
      actor_id: user?.id ?? null, actor_name: user?.email ?? null,
    });
    setSaving(false);
    if (error) { toast({ title: "Xatolik", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Aloqa qo'shildi" });
    setIntOpen(false);
    setIntForm({ kind: "phone", content: "", next_contact_date: "", comment: "" });
    load();
  };

  const saveDoc = async () => {
    if (!docForm.name.trim()) { toast({ title: "Hujjat nomi majburiy", variant: "destructive" }); return; }
    setSaving(true);
    let fileUrl: string | null = null;
    if (file) {
      const path = `clients/${id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("order-files").upload(path, file);
      if (upErr) { setSaving(false); toast({ title: "Fayl yuklanmadi", description: upErr.message, variant: "destructive" }); return; }
      fileUrl = supabase.storage.from("order-files").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("client_documents").insert({
      client_id: id!, name: docForm.name.trim(), doc_type: docForm.doc_type || null,
      status: docForm.status, issued_at: docForm.issued_at || null, comment: docForm.comment || null,
      file_url: fileUrl, created_by: user?.id ?? null, created_by_name: user?.email ?? null,
    });
    setSaving(false);
    if (error) { toast({ title: "Xatolik", description: error.message, variant: "destructive" }); return; }
    await supabase.from("entity_audit").insert({
      entity: "client", entity_id: id!, action: `Hujjat qo'shildi: ${docForm.name}`,
      actor_id: user?.id ?? null, actor_name: user?.email ?? null,
    });
    toast({ title: "Hujjat qo'shildi" });
    setDocOpen(false);
    setDocForm({ name: "", doc_type: "", status: "pending", issued_at: "", comment: "" });
    setFile(null);
    load();
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!client) return <div className="p-8 text-center text-muted-foreground">Klient topilmadi</div>;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => nav("/clients")}><ArrowLeft className="h-4 w-4 mr-1" /> Klientlar</Button>

      <Card>
        <CardContent className="p-6 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">{client.name}</h1>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              {client.contact_person && <span className="flex items-center gap-1.5"><UserIcon className="h-4 w-4" />{client.contact_person}</span>}
              {client.phone && <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" />{client.phone}</span>}
              {client.email && <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" />{client.email}</span>}
              {client.address && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{client.address}</span>}
            </div>
          </div>
          <Button variant="outline" onClick={openEdit}><Pencil className="h-4 w-4 mr-1" /> Tahrirlash</Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Umumiy</TabsTrigger>
          <TabsTrigger value="contacts">Aloqa tarixi</TabsTrigger>
          <TabsTrigger value="orders">Zakazlar</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="docs">Hujjatlar</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { l: "Jami zakaz", v: stats.total, c: "text-foreground" },
              { l: "Faol zakazlar", v: stats.active, c: "text-status-blue" },
              { l: "Jarayonda", v: stats.inProgress, c: "text-status-blue" },
              { l: "Kechikkan", v: stats.delayed, c: "text-status-red" },
              { l: "Tugallangan", v: stats.completed, c: "text-status-green" },
            ].map((s) => (
              <Card key={s.l}><CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{s.l}</div>
                <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
              </CardContent></Card>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Klient ma'lumotlari</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <div><span className="text-muted-foreground">Nomi: </span>{client.name}</div>
                <div><span className="text-muted-foreground">Kontakt shaxs: </span>{client.contact_person || "—"}</div>
                <div><span className="text-muted-foreground">Telefon: </span>{client.phone || "—"}</div>
                <div><span className="text-muted-foreground">Email: </span>{client.email || "—"}</div>
                <div><span className="text-muted-foreground">Manzil: </span>{client.address || "—"}</div>
                <div><span className="text-muted-foreground">Izoh: </span>{client.note || "—"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Aloqa holati</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <div><span className="text-muted-foreground">Oxirgi aloqa: </span>{lastContact ? `${fmt(lastContact.occurred_at)} — ${KINDS[lastContact.kind] ?? lastContact.kind}` : "—"}</div>
                <div><span className="text-muted-foreground">Kim: </span>{lastContact?.actor_name || "—"}</div>
                <div><span className="text-muted-foreground">Keyingi aloqa: </span>{fmtD(nextContact)}</div>
                <div className="pt-2"><Button size="sm" onClick={() => setIntOpen(true)}><Plus className="h-4 w-4 mr-1" /> Aloqa qo'shish</Button></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Button onClick={() => setIntOpen(true)}><Plus className="h-4 w-4 mr-1" /> Aloqa qo'shish</Button>
          </div>
          {interactions.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">Aloqa yozuvlari yo'q</div>
          ) : (
            <div className="space-y-3">
              {interactions.map((i) => (
                <Card key={i.id}><CardContent className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{fmt(i.occurred_at)}</span>
                    <span className="text-muted-foreground">— {i.actor_name || "—"}</span>
                    <span className="rounded-full border border-primary/30 bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">{KINDS[i.kind] ?? i.kind}</span>
                    {i.next_contact_date && <span className="rounded-full border border-status-yellow/30 bg-status-yellow/15 text-status-yellow px-2 py-0.5 text-xs">Keyingi: {fmtD(i.next_contact_date)}</span>}
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{i.content}</div>
                  {i.comment && <div className="text-xs text-muted-foreground">Izoh: {i.comment}</div>}
                </CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="pt-4">
          {orders.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">Zakazlar yo'q</div>
          ) : (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>№</TableHead><TableHead>Zakaz</TableHead><TableHead>Texnika</TableHead>
                  <TableHead>Soni</TableHead><TableHead>Boshlangan</TableHead><TableHead>Muddat</TableHead>
                  <TableHead>Bosqich</TableHead><TableHead>Progress</TableHead><TableHead>Holat</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {orders.map((o, idx) => {
                    const p = progressOf(o);
                    return (
                      <TableRow key={o.id} className="cursor-pointer hover:bg-muted/60" onClick={() => nav(`/orders/${o.id}`)}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell className="font-medium">#{o.order_number}</TableCell>
                        <TableCell className="font-semibold">{o.product_name}</TableCell>
                        <TableCell>{o.quantity}</TableCell>
                        <TableCell>{fmtD(startedAt(o))}</TableCell>
                        <TableCell>{fmtD(o.deadline)}</TableCell>
                        <TableCell>{currentStage(o)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full ${p === 100 ? "bg-status-green" : "bg-status-blue"}`} style={{ width: `${p}%` }} />
                            </div>
                            <span className="text-xs font-medium">{p}%</span>
                          </div>
                        </TableCell>
                        <TableCell><StatusBadge status={o.status} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          {audit.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">Yozuvlar yo'q</div>
          ) : (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>№</TableHead><TableHead>Sana / vaqt</TableHead><TableHead>Foydalanuvchi</TableHead>
                  <TableHead>Harakat</TableHead><TableHead>Tafsilot</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {audit.map((a, i) => (
                    <TableRow key={i}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmt(a.at)}</TableCell>
                      <TableCell>{a.who || "—"}</TableCell>
                      <TableCell className="font-medium"><span className="inline-flex items-center gap-1.5"><History className="h-3.5 w-3.5 text-muted-foreground" />{a.action}</span></TableCell>
                      <TableCell className="max-w-[420px] truncate text-muted-foreground">{a.details}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="docs" className="space-y-4 pt-4">
          <div className="flex justify-end"><Button onClick={() => setDocOpen(true)}><Plus className="h-4 w-4 mr-1" /> Hujjat qo'shish</Button></div>
          {docs.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">Hujjatlar yo'q</div>
          ) : (
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>№</TableHead><TableHead>Nomi</TableHead><TableHead>Turi</TableHead><TableHead>Holati</TableHead>
                  <TableHead>Berilgan sana</TableHead><TableHead>Kim qo'shdi</TableHead><TableHead>Fayl</TableHead><TableHead>Izoh</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {docs.map((d, i) => {
                    const st = DOC_STATUS[d.status] ?? DOC_STATUS.pending;
                    return (
                      <TableRow key={d.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell className="font-medium">{d.name}</TableCell>
                        <TableCell>{d.doc_type || "—"}</TableCell>
                        <TableCell><span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span></TableCell>
                        <TableCell>{fmtD(d.issued_at)}</TableCell>
                        <TableCell>{d.created_by_name || "—"}</TableCell>
                        <TableCell>
                          {d.file_url ? (
                            <a href={d.file_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                              <FileText className="h-4 w-4" /> Ochish <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{d.comment || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit client */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Klientni tahrirlash</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Klient nomi *</Label><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><Label>Telefon</Label><Input value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
            <div><Label>Kontakt shaxs</Label><Input value={edit.contact_person ?? ""} onChange={(e) => setEdit({ ...edit, contact_person: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            <div><Label>Manzil</Label><Input value={edit.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Izoh</Label><Textarea value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Bekor qilish</Button>
            <Button onClick={saveClient} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Saqlash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add interaction */}
      <Dialog open={intOpen} onOpenChange={setIntOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Aloqa qo'shish</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">Sana va xodim avtomatik yoziladi: {new Date().toLocaleString("uz-UZ")} — {user?.email}</div>
            <div><Label>Aloqa turi</Label>
              <Select value={intForm.kind} onValueChange={(v) => setIntForm({ ...intForm, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(KINDS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Nima deyildi / suhbat mazmuni *</Label><Textarea rows={5} value={intForm.content} onChange={(e) => setIntForm({ ...intForm, content: e.target.value })} /></div>
            <div><Label>Keyingi aloqa sanasi</Label><Input type="date" value={intForm.next_contact_date} onChange={(e) => setIntForm({ ...intForm, next_contact_date: e.target.value })} /></div>
            <div><Label>Izoh</Label><Input value={intForm.comment} onChange={(e) => setIntForm({ ...intForm, comment: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIntOpen(false)}>Bekor qilish</Button>
            <Button onClick={saveInteraction} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Saqlash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add document */}
      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Hujjat qo'shish</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Hujjat nomi *</Label><Input value={docForm.name} onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} /></div>
            <div><Label>Hujjat turi</Label><Input value={docForm.doc_type} onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })} placeholder="Shartnoma, Hisob-faktura..." /></div>
            <div><Label>Holati</Label>
              <Select value={docForm.status} onValueChange={(v) => setDocForm({ ...docForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="issued">Berilgan</SelectItem>
                  <SelectItem value="pending">Kutilmoqda</SelectItem>
                  <SelectItem value="missing">Berilmagan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Berilgan sana</Label><Input type="date" value={docForm.issued_at} onChange={(e) => setDocForm({ ...docForm, issued_at: e.target.value })} /></div>
            <div><Label>Fayl</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            <div className="sm:col-span-2"><Label>Izoh</Label><Textarea value={docForm.comment} onChange={(e) => setDocForm({ ...docForm, comment: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocOpen(false)}>Bekor qilish</Button>
            <Button onClick={saveDoc} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}Saqlash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
