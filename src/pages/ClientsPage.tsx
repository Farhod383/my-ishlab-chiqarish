import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { useEmployees } from "@/hooks/useEmployees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Users, Plus, Loader2, Search, X } from "lucide-react";

export const CLIENT_TYPES = ["Mijoz", "Diler"];

interface ClientRow {
  id: string; name: string; phone: string | null; phone2?: string | null; address: string | null;
  contact_person?: string | null; email?: string | null; note?: string | null;
  client_type?: string | null; status?: string | null; partnership_start?: string | null;
  responsible_employee_id?: string | null; created_at?: string;
}

const emptyForm = {
  name: "", phone: "", phone2: "", contact_person: "", address: "", email: "", note: "",
  client_type: "Mijoz", status: "active", partnership_start: "", responsible_employee_id: "",
};

const today = () => new Date().toISOString().slice(0, 10);
const fmtD = (d?: string | null) => (d ? new Date(d).toLocaleDateString("uz-UZ") : "—");

export default function ClientsPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { employees } = useEmployees({ activeOnly: true });
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [lastContact, setLastContact] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  // filters
  const [fResp, setFResp] = useState("all");
  const [fType, setFType] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [fHasOrders, setFHasOrders] = useState("all");
  const [fOrderStatus, setFOrderStatus] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fContactFrom, setFContactFrom] = useState("");
  const [fDelayed, setFDelayed] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: os }, { data: ints }] = await Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("orders").select("id, order_number, client_id, status, deadline, created_at"),
      supabase.from("client_interactions").select("client_id, occurred_at").order("occurred_at", { ascending: false }),
    ]);
    setClients((cs ?? []) as ClientRow[]);
    setOrders(os ?? []);
    const lc: Record<string, string> = {};
    (ints ?? []).forEach((i: any) => { if (i.client_id && !lc[i.client_id]) lc[i.client_id] = i.occurred_at; });
    setLastContact(lc);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const isDelayed = (o: any) =>
    o.status === "delayed" || (o.status !== "completed" && o.status !== "cancelled" && o.deadline && o.deadline < today());

  const byClient = useMemo(() => {
    const map: Record<string, { total: number; active: number; completed: number; delayed: number; statuses: Set<string>; numbers: string[] }> = {};
    orders.forEach((o) => {
      if (!o.client_id) return;
      map[o.client_id] ??= { total: 0, active: 0, completed: 0, delayed: 0, statuses: new Set(), numbers: [] };
      const m = map[o.client_id];
      m.total++;
      m.numbers.push(String(o.order_number ?? ""));
      m.statuses.add(o.status);
      if (o.status === "completed") m.completed++;
      else if (o.status !== "cancelled") m.active++;
      if (isDelayed(o)) m.delayed++;
    });
    return map;
  }, [orders]);

  const stats = useMemo(() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const ms = monthStart.toISOString();
    const top = [...clients]
      .map((c) => ({ name: c.name, total: byClient[c.id]?.total ?? 0 }))
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
    return {
      total: clients.length,
      active: clients.filter((c) => (c.status ?? "active") === "active").length,
      activeOrders: orders.filter((o) => o.status !== "completed" && o.status !== "cancelled").length,
      newClients: clients.filter((c) => (c.created_at ?? "") >= ms).length,
      newOrders: orders.filter((o) => (o.created_at ?? "") >= ms).length,
      delayed: orders.filter(isDelayed).length,
      top,
    };
  }, [clients, orders, byClient]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return clients.filter((c) => {
      const m = byClient[c.id];
      if (s) {
        const hay = [c.name, c.phone, c.phone2, c.contact_person, c.address, ...(m?.numbers ?? [])];
        if (!hay.some((v) => (v ?? "").toLowerCase().includes(s))) return false;
      }
      if (fResp !== "all" && (c.responsible_employee_id ?? "") !== fResp) return false;
      if (fType !== "all" && (c.client_type ?? "") !== fType) return false;
      if (fStatus !== "all" && (c.status ?? "active") !== fStatus) return false;
      if (fHasOrders === "yes" && !(m?.total)) return false;
      if (fHasOrders === "no" && (m?.total ?? 0) > 0) return false;
      if (fOrderStatus !== "all" && !(m?.statuses.has(fOrderStatus))) return false;
      if (fDelayed && !(m?.delayed)) return false;
      if (fFrom || fTo) {
        const has = orders.some((o) =>
          o.client_id === c.id &&
          (!fFrom || (o.created_at ?? "").slice(0, 10) >= fFrom) &&
          (!fTo || (o.created_at ?? "").slice(0, 10) <= fTo));
        if (!has) return false;
      }
      if (fContactFrom) {
        const lc = lastContact[c.id];
        if (!lc || lc.slice(0, 10) < fContactFrom) return false;
      }
      return true;
    }).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "uz", { sensitivity: "base", numeric: true }));
  }, [clients, q, byClient, fResp, fType, fStatus, fHasOrders, fOrderStatus, fFrom, fTo, fContactFrom, fDelayed, orders, lastContact]);

  const resetFilters = () => {
    setFResp("all"); setFType("all"); setFStatus("all"); setFHasOrders("all");
    setFOrderStatus("all"); setFFrom(""); setFTo(""); setFContactFrom(""); setFDelayed(false); setQ("");
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) { toast({ title: "Klient nomi majburiy", variant: "destructive" }); return; }
    if (!form.client_type) { toast({ title: "Klient turi majburiy", variant: "destructive" }); return; }
    const dup = clients.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    if (dup) { toast({ title: "Bunday klient allaqachon mavjud", description: dup.name, variant: "destructive" }); nav(`/clients/${dup.id}`); return; }
    setSaving(true);
    const payload: any = {
      name,
      phone: form.phone.trim() || null,
      phone2: form.phone2.trim() || null,
      address: form.address.trim() || null,
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      note: form.note.trim() || null,
      client_type: form.client_type || null,
      status: form.status || "active",
      partnership_start: form.partnership_start || null,
      responsible_employee_id: form.responsible_employee_id || null,
      created_by: user?.id ?? null,
    };
    const { data, error } = await supabase.from("clients").insert(payload).select("id").single();
    setSaving(false);
    if (error) {
      toast({ title: "Xatolik", description: error.message.includes("clients_name_unique") ? "Bunday nomli klient mavjud" : error.message, variant: "destructive" });
      return;
    }
    await supabase.from("entity_audit").insert({
      entity: "client", entity_id: data!.id, action: "Klient yaratildi",
      new_value: payload, actor_id: user?.id ?? null, actor_name: user?.email ?? null,
    });
    toast({ title: "Klient qo'shildi" });
    setOpen(false);
    setForm({ ...emptyForm });
    load();
  };

  const empName = (id?: string | null) => employees.find((e) => e.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Klientlar (CRM)</h1>
          <p className="text-muted-foreground text-sm">Klientlar bazasi, aloqa tarixi va zakazlar</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nomi, telefon, kontakt, zakaz №..." className="pl-8 w-72" />
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Yangi klient</Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {[
          { l: "Jami klientlar", v: stats.total, c: "text-foreground" },
          { l: "Faol klientlar", v: stats.active, c: "text-status-green" },
          { l: "Faol zakazlar", v: stats.activeOrders, c: "text-status-blue" },
          { l: "Shu oy yangi klient", v: stats.newClients, c: "text-primary" },
          { l: "Shu oy yangi zakaz", v: stats.newOrders, c: "text-primary" },
          { l: "Kechikkan zakazlar", v: stats.delayed, c: "text-status-red" },
        ].map((s) => (
          <Card key={s.l}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{s.l}</div>
            <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
          </CardContent></Card>
        ))}
      </div>

      {stats.top.length > 0 && (
        <Card><CardContent className="p-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Eng ko'p zakaz qilgan klientlar:</span>
          {stats.top.map((t, i) => (
            <span key={t.name} className="rounded-full border border-primary/30 bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              {i + 1}. {t.name} — {t.total}
            </span>
          ))}
        </CardContent></Card>
      )}

      <Card><CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <div>
          <Label className="text-xs">Mas'ul xodim</Label>
          <Select value={fResp} onValueChange={setFResp}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Hammasi</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Klient turi</Label>
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Hammasi</SelectItem>
              {CLIENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Holati</Label>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Hammasi</SelectItem>
              <SelectItem value="active">Faol</SelectItem>
              <SelectItem value="inactive">Bo'shagan</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Zakaz bor/yo'q</Label>
          <Select value={fHasOrders} onValueChange={setFHasOrders}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Hammasi</SelectItem>
              <SelectItem value="yes">Zakazi bor</SelectItem>
              <SelectItem value="no">Zakazi yo'q</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Zakaz holati</Label>
          <Select value={fOrderStatus} onValueChange={setFOrderStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Hammasi</SelectItem>
              <SelectItem value="pending">Kutmoqda</SelectItem>
              <SelectItem value="in_progress">Jarayonda</SelectItem>
              <SelectItem value="completed">Tugallangan</SelectItem>
              <SelectItem value="delayed">Kechikkan</SelectItem>
              <SelectItem value="cancelled">Bekor qilingan</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Zakaz sanasi (dan)</Label><Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} /></div>
        <div><Label className="text-xs">Zakaz sanasi (gacha)</Label><Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} /></div>
        <div><Label className="text-xs">Oxirgi aloqa (dan)</Label><Input type="date" value={fContactFrom} onChange={(e) => setFContactFrom(e.target.value)} /></div>
        <div className="flex items-end gap-2">
          <Button variant={fDelayed ? "default" : "outline"} className="flex-1" onClick={() => setFDelayed((v) => !v)}>Kechikkan zakazlar</Button>
          <Button variant="ghost" size="icon" onClick={resetFilters} title="Filterlarni tozalash"><X className="h-4 w-4" /></Button>
        </div>
      </CardContent></Card>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">Klientlar topilmadi</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="gap-3 bg-muted/60 px-4 py-3 text-sm font-semibold text-muted-foreground border-b border-border" style={{ gridTemplateColumns: "48px 1fr 140px 150px 130px 110px 110px 90px 90px 90px", display: "grid" }}>
                <div className="text-center">№</div>
                <div>Klient nomi</div>
                <div>Telefon</div>
                <div>Mas'ul xodim</div>
                <div>Turi / holati</div>
                <div>Hamkorlik</div>
                <div>Oxirgi aloqa</div>
                <div className="text-center">Faol</div>
                <div className="text-center">Kechikkan</div>
                <div className="text-center">Jami</div>
              </div>
              <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
                {filtered.map((c, i) => {
                  const m = byClient[c.id];
                  const inactive = (c.status ?? "active") !== "active";
                  return (
                    <div
                      key={c.id}
                      onClick={() => nav(`/clients/${c.id}`)}
                      className="gap-3 px-4 py-3 items-center text-sm cursor-pointer transition-colors hover:bg-accent/50 hover:text-accent-foreground"
                      style={{ display: "grid", gridTemplateColumns: "48px 1fr 140px 150px 130px 110px 110px 90px 90px 90px" }}
                    >
                      <div className="text-center font-semibold text-muted-foreground">{i + 1}</div>
                      <div className="font-medium truncate flex items-center gap-2">
                        <span className="truncate">{c.name}</span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${(c.client_type ?? "Mijoz") === "Diler" ? "border-status-blue/30 bg-status-blue/10 text-status-blue" : "border-primary/30 bg-primary/10 text-primary"}`}>{c.client_type || "Mijoz"}</span>
                      </div>
                      <div className="truncate text-muted-foreground">{c.phone || "—"}</div>
                      <div className="truncate text-muted-foreground">{empName(c.responsible_employee_id)}</div>
                      <div className="flex flex-wrap gap-1">
                        {c.client_type && <span className="rounded-full border border-primary/30 bg-primary/10 text-primary px-2 py-0.5 text-xs">{c.client_type}</span>}
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${inactive ? "border-status-red/30 bg-status-red/10 text-status-red" : "border-status-green/30 bg-status-green/10 text-status-green"}`}>
                          {inactive ? "Bo'shagan" : "Faol"}
                        </span>
                      </div>
                      <div className="text-muted-foreground">{fmtD(c.partnership_start)}</div>
                      <div className="text-muted-foreground">{fmtD(lastContact[c.id])}</div>
                      <div className="text-center">
                        <span className="inline-flex min-w-[2rem] items-center justify-center rounded-md bg-status-blue/10 px-2 py-0.5 text-xs font-medium text-status-blue border border-status-blue/20">{m?.active ?? 0}</span>
                      </div>
                      <div className="text-center">
                        <span className="inline-flex min-w-[2rem] items-center justify-center rounded-md bg-status-red/10 px-2 py-0.5 text-xs font-medium text-status-red border border-status-red/20">{m?.delayed ?? 0}</span>
                      </div>
                      <div className="text-center">
                        <span className="inline-flex min-w-[2rem] items-center justify-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground border border-border">{m?.total ?? 0}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Yangi klient</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Klient nomi *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Telefon</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Qo'shimcha telefon</Label><Input value={form.phone2} onChange={(e) => setForm({ ...form, phone2: e.target.value })} /></div>
            <div><Label>Kontakt shaxs</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Manzil</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div>
              <Label>Mas'ul xodim</Label>
              <Select value={form.responsible_employee_id} onValueChange={(v) => setForm({ ...form, responsible_employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Klient turi *</Label>
              <Select value={form.client_type} onValueChange={(v) => setForm({ ...form, client_type: v })}>
                <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                <SelectContent>{CLIENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Holati</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Faol</SelectItem>
                  <SelectItem value="inactive">Bo'shagan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Hamkorlik boshlangan sana</Label><Input type="date" value={form.partnership_start} onChange={(e) => setForm({ ...form, partnership_start: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Izoh</Label><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Bekor qilish</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Saqlash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
