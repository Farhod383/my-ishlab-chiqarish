import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Users, Plus, Phone, MapPin, User as UserIcon, Loader2, Search } from "lucide-react";

interface ClientRow {
  id: string; name: string; phone: string | null; address: string | null;
  contact_person?: string | null; email?: string | null; note?: string | null;
}

export default function ClientsPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [counts, setCounts] = useState<Record<string, { total: number; active: number }>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", contact_person: "", address: "", email: "", note: "" });

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: os }] = await Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("orders").select("id, client_id, status"),
    ]);
    setClients((cs ?? []) as ClientRow[]);
    const map: Record<string, { total: number; active: number }> = {};
    (os ?? []).forEach((o: any) => {
      if (!o.client_id) return;
      map[o.client_id] ??= { total: 0, active: 0 };
      map[o.client_id].total++;
      if (o.status !== "completed" && o.status !== "cancelled") map[o.client_id].active++;
    });
    setCounts(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return clients;
    return clients.filter((c) =>
      [c.name, c.phone, c.contact_person, c.address].some((v) => (v ?? "").toLowerCase().includes(s)));
  }, [clients, q]);

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Klient nomi majburiy", variant: "destructive" }); return; }
    setSaving(true);
    const { data, error } = await supabase.from("clients").insert({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      note: form.note.trim() || null,
    }).select("id").single();
    setSaving(false);
    if (error) { toast({ title: "Xatolik", description: error.message, variant: "destructive" }); return; }
    await supabase.from("entity_audit").insert({
      entity: "client", entity_id: data!.id, action: "Klient yaratildi",
      new_value: form as any, actor_id: user?.id ?? null, actor_name: user?.email ?? null,
    });
    toast({ title: "Klient qo'shildi" });
    setOpen(false);
    setForm({ name: "", phone: "", contact_person: "", address: "", email: "", note: "" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Klientlar</h1>
          <p className="text-muted-foreground text-sm">Klientlar bazasi, aloqa tarixi va zakazlar</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish..." className="pl-8 w-64" />
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Yangi klient</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">Klientlar topilmadi</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const cnt = counts[c.id] ?? { total: 0, active: 0 };
            return (
              <Card key={c.id} onClick={() => nav(`/clients/${c.id}`)}
                className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50">
                <CardContent className="p-5 space-y-3">
                  <div className="text-xl font-bold leading-tight">{c.name}</div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {c.contact_person && <div className="flex items-center gap-2"><UserIcon className="h-4 w-4" />{c.contact_person}</div>}
                    {c.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4" />{c.phone}</div>}
                    {c.address && <div className="flex items-center gap-2"><MapPin className="h-4 w-4" />{c.address}</div>}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <span className="rounded-full border border-status-blue/30 bg-status-blue/10 text-status-blue px-2.5 py-0.5 text-xs font-medium">
                      Faol: {cnt.active}
                    </span>
                    <span className="rounded-full border border-border bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium">
                      Jami zakaz: {cnt.total}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Yangi klient</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Klient nomi *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Telefon</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Kontakt shaxs</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Manzil</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
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
