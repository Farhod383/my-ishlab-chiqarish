import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberInput } from "@/components/NumberInput";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Plus, Wrench, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/types/erp";
import { notify } from "@/lib/notify";

type Status = "pending" | "in_progress" | "completed" | "cancelled";
const STATUS_LABEL: Record<Status, string> = {
  pending: "Kutilmoqda",
  in_progress: "Jarayonda",
  completed: "Tugatilgan",
  cancelled: "Bekor qilingan",
};
const STATUS_COLOR: Record<Status, string> = {
  pending: "bg-status-yellow/15 text-status-yellow border-status-yellow/30",
  in_progress: "bg-status-blue/15 text-status-blue border-status-blue/30",
  completed: "bg-status-green/15 text-status-green border-status-green/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

interface ServiceRow {
  id: string; client_name: string; client_phone: string | null;
  device_name: string; problem_description: string;
  received_at: string; deadline: string | null; status: Status;
  finished_at: string | null; materials_cost: number; notes: string | null;
  created_at: string;
}
interface Item { id: string; service_request_id: string; product_id: string | null; product_name: string; quantity: number; unit_price: number; total_price: number }

export default function ServicePage() {
  const { user, hasRole } = useAuth();
  const canManage = hasRole(["manager", "admin"]);
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [products, setProducts] = useState<{ id: string; name: string; unit: string; last_price: number | null }[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [addOpen, setAddOpen] = useState(false);

  // new form
  const [fClient, setFClient] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fDevice, setFDevice] = useState("");
  const [fProblem, setFProblem] = useState("");
  const [fReceived, setFReceived] = useState<string>(new Date().toISOString().slice(0, 10));
  const [fDeadline, setFDeadline] = useState<string>("");
  const [fNotes, setFNotes] = useState("");

  // detail
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = useMemo(() => rows.find(r => r.id === detailId) ?? null, [rows, detailId]);
  const detailItems = useMemo(() => (detailId ? items[detailId] ?? [] : []), [items, detailId]);

  // add-item form
  const [iProductId, setIProductId] = useState("");
  const [iName, setIName] = useState("");
  const [iQty, setIQty] = useState<number>(1);
  const [iPrice, setIPrice] = useState<number>(0);

  const load = async () => {
    const { data } = await supabase.from("service_requests" as any).select("*").order("created_at", { ascending: false });
    setRows(((data as any) ?? []) as ServiceRow[]);
    const { data: it } = await supabase.from("service_request_items" as any).select("*").order("created_at");
    const map: Record<string, Item[]> = {};
    ((it as any) ?? []).forEach((x: Item) => { (map[x.service_request_id] ??= []).push(x); });
    setItems(map);
    const { data: prods } = await supabase.from("products").select("id, name, unit, last_price").order("name");
    setProducts((prods as any) ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return r.client_name.toLowerCase().includes(s)
      || r.device_name.toLowerCase().includes(s)
      || (r.client_phone ?? "").toLowerCase().includes(s)
      || r.problem_description.toLowerCase().includes(s);
  });

  const counts = useMemo(() => {
    const c: Record<Status, number> = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
    rows.forEach(r => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  const createRequest = async () => {
    if (!fClient.trim() || !fDevice.trim() || !fProblem.trim()) { toast.error("Mijoz, qurilma va muammo majburiy"); return; }
    const { data, error } = await supabase.from("service_requests" as any).insert({
      client_name: fClient.trim(), client_phone: fPhone.trim() || null,
      device_name: fDevice.trim(), problem_description: fProblem.trim(),
      received_at: fReceived, deadline: fDeadline || null,
      notes: fNotes.trim() || null, created_by: user?.id ?? null,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Servis so'rovi yaratildi", entity: "service_request", details: `${fClient} — ${fDevice}` });
    await notify({ type: "service_request", title: `Yangi servis so'rovi — ${fDevice}`, body: `${fClient}`, link: "/service", entity: "service_request", entity_id: (data as any).id, sender_id: user?.id, sender_name: user?.email });
    setAddOpen(false); setFClient(""); setFPhone(""); setFDevice(""); setFProblem(""); setFDeadline(""); setFNotes("");
    toast.success("Yaratildi"); load();
  };

  const changeStatus = async (r: ServiceRow, s: Status) => {
    const patch: any = { status: s };
    if (s === "completed") patch.finished_at = new Date().toISOString();
    const { error } = await supabase.from("service_requests" as any).update(patch).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: `Servis statusi: ${STATUS_LABEL[s]}`, entity: "service_request", details: `${r.device_name}` });
    load();
  };

  const addItem = async () => {
    if (!detailId) return;
    const name = iName.trim(); if (!name || iQty <= 0) { toast.error("Nomi va miqdor kerak"); return; }
    const total = iQty * (iPrice || 0);
    const { error } = await supabase.from("service_request_items" as any).insert({
      service_request_id: detailId, product_id: iProductId || null, product_name: name,
      quantity: iQty, unit_price: iPrice || 0, total_price: total,
    });
    if (error) { toast.error(error.message); return; }
    // Bump materials_cost
    const current = (items[detailId] ?? []).reduce((s, x) => s + Number(x.total_price || 0), 0) + total;
    await supabase.from("service_requests" as any).update({ materials_cost: current }).eq("id", detailId);
    setIProductId(""); setIName(""); setIQty(1); setIPrice(0);
    load();
  };

  const removeItem = async (it: Item) => {
    await supabase.from("service_request_items" as any).delete().eq("id", it.id);
    const current = (items[it.service_request_id] ?? []).filter(x => x.id !== it.id).reduce((s, x) => s + Number(x.total_price || 0), 0);
    await supabase.from("service_requests" as any).update({ materials_cost: current }).eq("id", it.service_request_id);
    load();
  };

  const removeRequest = async (r: ServiceRow) => {
    if (!confirm(`"${r.device_name}" servisini o'chirish?`)) return;
    await supabase.from("service_requests" as any).delete().eq("id", r.id);
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Servis so'rovi o'chirildi", entity: "service_request", details: r.device_name });
    if (detailId === r.id) setDetailId(null);
    load();
  };

  const totalCost = rows.reduce((s, r) => s + Number(r.materials_cost || 0), 0);
  const money = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n));

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Wrench className="h-6 w-6" /> Remont (Servis)</h1>
          <p className="text-sm text-muted-foreground">Servisga kelgan texnikalar, muammolar va ishlatilgan mahsulotlar tarixi</p>
        </div>
        {canManage && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Yangi servis</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Yangi servis so'rovi</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Mijoz *</Label><Input value={fClient} onChange={e => setFClient(e.target.value)} /></div>
                <div><Label>Telefon</Label><Input value={fPhone} onChange={e => setFPhone(e.target.value)} placeholder="+998..." /></div>
                <div><Label>Qurilma / Mashina nomi *</Label><Input value={fDevice} onChange={e => setFDevice(e.target.value)} /></div>
                <div><Label>Muammo tavsifi *</Label><Textarea value={fProblem} onChange={e => setFProblem(e.target.value)} rows={3} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Qabul qilingan</Label><Input type="date" value={fReceived} onChange={e => setFReceived(e.target.value)} /></div>
                  <div><Label>Tugatish muddati</Label><Input type="date" value={fDeadline} onChange={e => setFDeadline(e.target.value)} /></div>
                </div>
                <div><Label>Izoh</Label><Textarea value={fNotes} onChange={e => setFNotes(e.target.value)} rows={2} /></div>
                <Button className="w-full" onClick={createRequest}>Saqlash</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(["pending", "in_progress", "completed", "cancelled"] as Status[]).map(s => (
          <Card key={s} className={`cursor-pointer transition ${statusFilter === s ? "ring-2 ring-primary" : ""}`} onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</div>
              <div className="text-2xl font-bold">{counts[s] ?? 0}</div>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Jami sarflangan</div>
            <div className="text-2xl font-bold font-mono">{money(totalCost)} so'm</div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Mijoz, qurilma, muammo..." className="pl-9" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Servis so'rovlari</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">№</TableHead>
                <TableHead>Mijoz</TableHead>
                <TableHead>Qurilma</TableHead>
                <TableHead>Muammo</TableHead>
                <TableHead>Qabul</TableHead>
                <TableHead>Muddat</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Xarajat</TableHead>
                {canManage && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, i) => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetailId(r.id)}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.client_name}{r.client_phone ? <div className="text-xs text-muted-foreground">{r.client_phone}</div> : null}</TableCell>
                  <TableCell>{r.device_name}</TableCell>
                  <TableCell className="max-w-[280px] truncate" title={r.problem_description}>{r.problem_description}</TableCell>
                  <TableCell>{r.received_at}</TableCell>
                  <TableCell>{r.deadline ?? "—"}</TableCell>
                  <TableCell>
                    {canManage ? (
                      <Select value={r.status} onValueChange={(v) => changeStatus(r, v as Status)}>
                        <SelectTrigger className={`h-8 w-36 ${STATUS_COLOR[r.status]}`} onClick={(e) => e.stopPropagation()}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as Status[]).map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">{money(Number(r.materials_cost || 0))}</TableCell>
                  {canManage && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => removeRequest(r)}><Trash2 className="h-4 w-4 text-status-red" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Yozuvlar yo'q</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detail?.device_name} — {detail?.client_name}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Telefon: </span>{detail.client_phone ?? "—"}</div>
                <div><span className="text-muted-foreground">Status: </span><Badge variant="outline" className={STATUS_COLOR[detail.status]}>{STATUS_LABEL[detail.status]}</Badge></div>
                <div><span className="text-muted-foreground">Qabul: </span>{detail.received_at}</div>
                <div><span className="text-muted-foreground">Muddat: </span>{detail.deadline ?? "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Muammo: </span>{detail.problem_description}</div>
                {detail.notes && <div className="col-span-2"><span className="text-muted-foreground">Izoh: </span>{detail.notes}</div>}
              </div>

              <div>
                <div className="font-semibold mb-2">Ishlatilgan mahsulotlar</div>
                <Table>
                  <TableHeader><TableRow><TableHead>Mahsulot</TableHead><TableHead className="text-right">Miqdor</TableHead><TableHead className="text-right">Narx</TableHead><TableHead className="text-right">Jami</TableHead>{canManage && <TableHead></TableHead>}</TableRow></TableHeader>
                  <TableBody>
                    {detailItems.map(it => (
                      <TableRow key={it.id}>
                        <TableCell>{it.product_name}</TableCell>
                        <TableCell className="text-right font-mono">{it.quantity}</TableCell>
                        <TableCell className="text-right font-mono">{money(Number(it.unit_price))}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{money(Number(it.total_price))}</TableCell>
                        {canManage && <TableCell><Button variant="ghost" size="icon" onClick={() => removeItem(it)}><Trash2 className="h-4 w-4 text-status-red" /></Button></TableCell>}
                      </TableRow>
                    ))}
                    {detailItems.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground text-sm">Hali qo'shilmagan</TableCell></TableRow>}
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-semibold">Jami:</TableCell>
                      <TableCell className="text-right font-mono font-bold">{money(Number(detail.materials_cost || 0))} so'm</TableCell>
                      {canManage && <TableCell />}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {canManage && (
                <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
                  <div className="font-medium text-sm">Mahsulot qo'shish</div>
                  <SearchableSelect
                    value={iProductId}
                    onChange={(v) => { setIProductId(v); const p = products.find(x => x.id === v); if (p) { setIName(p.name); setIPrice(Number(p.last_price ?? 0)); } }}
                    placeholder="Ombordan tanlash (ixtiyoriy)"
                    options={products.map(p => ({ value: p.id, label: p.name, hint: p.unit }))}
                  />
                  <Input placeholder="Yoki nomini yozing" value={iName} onChange={e => setIName(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Miqdor</Label><NumberInput min={0.1} step={0.1} value={iQty} onChange={e => setIQty(Number(e.target.value))} /></div>
                    <div><Label className="text-xs">Narx (birlik)</Label><NumberInput min={0} value={iPrice} onChange={e => setIPrice(Number(e.target.value))} /></div>
                  </div>
                  <Button className="w-full" onClick={addItem}><Plus className="h-4 w-4 mr-1" />Qo'shish</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
