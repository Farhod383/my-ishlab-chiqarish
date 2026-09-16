import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Image as ImageIcon, CheckCircle2, Clock, Search, Pencil, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/format";
import { fmtDateTime24 } from "@/lib/format";
import {
  INTAKE_STATUS_META, intakeCode, intakeDuration, itemsTotal,
  type IntakeItem, type IntakeSession,
} from "@/lib/intake";

const fmt = (n: number) => fmtNum(n);
const SUPPLIERS = ["Davronxo'ja", "Sanjar"];

export default function InvoicesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole(["admin", "warehouse"]);

  const [sessions, setSessions] = useState<IntakeSession[]>([]);
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // Tahrirlash
  const [editId, setEditId] = useState<string | null>(null);
  const [edSupplier, setEdSupplier] = useState<string>("");
  const [edImage, setEdImage] = useState<File | null>(null);
  const [edRows, setEdRows] = useState<Record<string, { quantity: string; unit_price: string; currency: string }>>({});
  const [busy, setBusy] = useState(false);

  // O'chirish
  const [delId, setDelId] = useState<string | null>(null);
  const [delItemId, setDelItemId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    // Ochiq (yig'ilayotgan) Nakladnoy + yakunlanganlar tarixi
    const { data: s } = await supabase
      .from("intake_sessions").select("*")
      .order("started_at", { ascending: false })
      .limit(300);
    const list = ((s as any[]) ?? []) as IntakeSession[];
    const ids = list.map((x) => x.id);
    let it: any[] = [];
    if (ids.length) {
      const { data } = await supabase.from("intake_items").select("*").in("session_id", ids).order("created_at", { ascending: true });
      it = (data as any[]) ?? [];
    }
    setSessions(list);
    setItems(it as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const itemsBySession = useMemo(() => {
    const m: Record<string, IntakeItem[]> = {};
    items.forEach((i) => { (m[i.session_id] ||= []).push(i); });
    return m;
  }, [items]);

  const active = useMemo(() => sessions.find((s) => s.status !== "finalized") ?? null, [sessions]);
  const activeItems = active ? (itemsBySession[active.id] ?? []) : [];

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return sessions.filter((s) => {
      if (s.status !== "finalized") return false;
      if (!term) return true;


      const list = itemsBySession[s.id] ?? [];
      return (
        intakeCode(s).toLowerCase().includes(term) ||
        (s.created_by_name ?? "").toLowerCase().includes(term) ||
        (s.supplier ?? "").toLowerCase().includes(term) ||
        list.some((i) => i.product_name.toLowerCase().includes(term))
      );
    });
  }, [sessions, q, itemsBySession]);

  const current = sessions.find((s) => s.id === openId) ?? null;
  const currentItems = openId ? (itemsBySession[openId] ?? []) : [];

  const editing = sessions.find((s) => s.id === editId) ?? null;
  const editingItems = editId ? (itemsBySession[editId] ?? []) : [];

  const startEdit = (s: IntakeSession) => {
    setEditId(s.id);
    setEdSupplier(s.supplier ?? "");
    setEdImage(null);
    const list = itemsBySession[s.id] ?? [];
    const map: Record<string, { quantity: string; unit_price: string; currency: string }> = {};
    list.forEach((i) => {
      map[i.id] = { quantity: String(i.quantity), unit_price: String(i.unit_price), currency: i.currency || "UZS" };
    });
    setEdRows(map);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      let imageUrl: string | null = null;
      if (edImage) {
        const ext = edImage.name.split(".").pop();
        const path = `nakladnoy/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("product-images").upload(path, edImage);
        if (up.error) throw up.error;
        imageUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      }
      if (imageUrl || (edSupplier && edSupplier !== (editing.supplier ?? ""))) {
        const { error } = await supabase.rpc("update_intake_invoice" as any, {
          _session_id: editing.id,
          _supplier: edSupplier || null,
          _image_url: imageUrl,
        });
        if (error) throw error;
      }
      for (const it of editingItems) {
        const r = edRows[it.id];
        if (!r) continue;
        const qty = Number(r.quantity);
        const price = Number(r.unit_price);
        if (Number.isNaN(qty) || qty < 0) throw new Error(`${it.product_name}: miqdor noto'g'ri`);
        const changed =
          qty !== Number(it.quantity) ||
          price !== Number(it.unit_price) ||
          (r.currency || "UZS") !== (it.currency || "UZS");
        if (!changed) continue;
        const { error } = await supabase.rpc("update_intake_invoice_item" as any, {
          _item_id: it.id,
          _quantity: qty,
          _unit_price: Number.isNaN(price) ? Number(it.unit_price) : price,
          _currency: r.currency || null,
        });
        if (error) throw error;
      }
      toast.success("Nakladnoy yangilandi — sklad qoldig'i qayta hisoblandi");
      setEditId(null);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Saqlashda xatolik");
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async () => {
    if (!delItemId) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_intake_invoice_item" as any, { _item_id: delItemId });
    setBusy(false);
    setDelItemId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Qator o'chirildi — qoldiq qaytarildi");
    await load();
  };

  const deleteSession = async () => {
    if (!delId) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_intake_invoice" as any, { _session_id: delId });
    setBusy(false);
    const removed = delId;
    setDelId(null);
    if (error) { toast.error(error.message); return; }
    if (openId === removed) setOpenId(null);
    if (editId === removed) setEditId(null);
    toast.success("Nakladnoy o'chirildi — sklad qoldig'i qayta hisoblandi");
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Nakladnoy</h1>
          <p className="text-sm text-muted-foreground">Yakunlangan Nakladnoylar tarixi ({sessions.length})</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Nakladnoy, mahsulot, xodim..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Nakladnoylar ro'yxati</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nakladnoy</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Mahsulot</TableHead>
                      <TableHead className="text-right">Jami summa</TableHead>
                      <TableHead>Boshlangan</TableHead>
                      <TableHead>Tugagan</TableHead>
                      <TableHead>Davomiyligi</TableHead>
                      <TableHead>Kim kiritgan</TableHead>
                      <TableHead>Yetkazib beruvchi</TableHead>
                      <TableHead>Rasm</TableHead>
                      {canEdit && <TableHead className="text-right">Amallar</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && <TableRow><TableCell colSpan={canEdit ? 11 : 10} className="text-center py-8 text-muted-foreground">Yuklanmoqda...</TableCell></TableRow>}
                    {!loading && rows.length === 0 && <TableRow><TableCell colSpan={canEdit ? 11 : 10} className="text-center py-8 text-muted-foreground">Nakladnoy yo'q</TableCell></TableRow>}
                    {rows.map((s) => {
                      const list = itemsBySession[s.id] ?? [];
                      const meta = INTAKE_STATUS_META[s.status];
                      return (
                        <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenId(s.id)}>
                          <TableCell className="font-mono font-semibold whitespace-nowrap">{intakeCode(s)}</TableCell>
                          <TableCell><Badge variant="outline" className={meta.cls}>{meta.label}</Badge></TableCell>
                          <TableCell className="text-right">{list.length}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(itemsTotal(list))}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{fmtDateTime24(s.started_at)}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{s.finished_at ? fmtDateTime24(s.finished_at) : "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{intakeDuration(s)}</TableCell>
                          <TableCell className="text-sm">{s.created_by_name ?? "—"}</TableCell>
                          <TableCell className="text-sm">{s.supplier ?? "—"}</TableCell>
                          <TableCell>{s.image_url ? <ImageIcon className="h-4 w-4 text-status-green" /> : <Clock className="h-4 w-4 text-muted-foreground" />}</TableCell>
                          {canEdit && (
                            <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" title="Tahrirlash" onClick={() => startEdit(s)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" title="O'chirish" className="text-destructive" onClick={() => setDelId(s.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
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
      </div>

      <Dialog open={!!openId} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent className="max-w-3xl p-0 gap-0">
          {current && (
            <>
              <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">Nakladnoy {intakeCode(current)}</span>
                  <Badge variant="outline" className={INTAKE_STATUS_META[current.status].cls}>{INTAKE_STATUS_META[current.status].label}</Badge>
                </DialogTitle>
                <DialogDescription>
                  Kim kiritgan: {current.created_by_name ?? "—"}
                  {current.supplier ? ` · Olib keldi: ${current.supplier}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 py-4 overflow-y-auto space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded border p-2"><div className="text-muted-foreground text-xs">Boshlangan</div><div className="font-medium">{fmtDateTime24(current.started_at)}</div></div>
                  <div className="rounded border p-2"><div className="text-muted-foreground text-xs">Tugagan</div><div className="font-medium">{current.finished_at ? fmtDateTime24(current.finished_at) : "—"}</div></div>
                  <div className="rounded border p-2"><div className="text-muted-foreground text-xs">Davomiyligi</div><div className="font-medium">{intakeDuration(current)}</div></div>
                </div>

                <div className="rounded border overflow-hidden">
                  <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>№</TableHead>
                          <TableHead>Mahsulot</TableHead>
                          <TableHead className="text-right">Miqdor</TableHead>
                          <TableHead className="text-right">Narx</TableHead>
                          <TableHead>Valyuta</TableHead>
                          <TableHead className="text-right">Jami</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentItems.map((i, idx) => (
                          <TableRow key={i.id}>
                            <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="font-medium">{i.product_name}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(Number(i.quantity))} {i.unit}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(Number(i.unit_price))}</TableCell>
                            <TableCell>{i.currency}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">{fmt(Number(i.quantity) * Number(i.unit_price))}</TableCell>
                          </TableRow>
                        ))}
                        {currentItems.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Mahsulot yo'q</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-between px-4 py-2 bg-muted/40 text-sm">
                    <span className="text-muted-foreground">Jami summa</span>
                    <span className="font-mono font-bold">{fmt(itemsTotal(currentItems))}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Nakladnoy rasmi</Label>
                  {current.image_url ? (
                    <a href={current.image_url} target="_blank" rel="noreferrer">
                      <img src={current.image_url} alt={`Nakladnoy ${intakeCode(current)}`} className="max-h-48 rounded border" />
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">Rasm yo'q</p>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t bg-background shrink-0 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-status-green text-sm"><CheckCircle2 className="h-4 w-4" /> Skladga kirim qilingan</div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setOpenId(null); startEdit(current); }}>
                      <Pencil className="h-4 w-4 mr-1" /> Tahrirlash
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setDelId(current.id)}>
                      <Trash2 className="h-4 w-4 mr-1" /> O'chirish
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Tahrirlash oynasi */}
      <Dialog open={!!editId} onOpenChange={(o) => { if (!o) setEditId(null); }}>
        <DialogContent className="max-w-3xl p-0 gap-0">
          {editing && (
            <>
              <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                <DialogTitle className="font-mono">Nakladnoy {intakeCode(editing)} — tahrirlash</DialogTitle>
                <DialogDescription>Miqdor yoki narx o'zgartirilsa, sklad qoldig'i avtomatik qayta hisoblanadi.</DialogDescription>
              </DialogHeader>

              <div className="px-6 py-4 overflow-y-auto space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Yetkazib beruvchi</Label>
                    <Select value={edSupplier} onValueChange={setEdSupplier}>
                      <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                      <SelectContent>
                        {SUPPLIERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Nakladnoy rasmi (almashtirish)</Label>
                    <Input type="file" accept="image/*" onChange={(e) => setEdImage(e.target.files?.[0] ?? null)} />
                  </div>
                </div>

                {editing.image_url && !edImage && (
                  <img src={editing.image_url} alt={`Nakladnoy ${intakeCode(editing)}`} className="max-h-32 rounded border" />
                )}

                <div className="rounded border overflow-hidden">
                  <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mahsulot</TableHead>
                          <TableHead className="w-28">Miqdor</TableHead>
                          <TableHead className="w-32">Narx</TableHead>
                          <TableHead className="w-28">Valyuta</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editingItems.map((i) => {
                          const r = edRows[i.id] ?? { quantity: String(i.quantity), unit_price: String(i.unit_price), currency: i.currency };
                          return (
                            <TableRow key={i.id}>
                              <TableCell className="font-medium">{i.product_name} <span className="text-xs text-muted-foreground">({i.unit})</span></TableCell>
                              <TableCell>
                                <Input value={r.quantity} inputMode="decimal"
                                  onChange={(e) => setEdRows((p) => ({ ...p, [i.id]: { ...r, quantity: e.target.value } }))} />
                              </TableCell>
                              <TableCell>
                                <Input value={r.unit_price} inputMode="decimal"
                                  onChange={(e) => setEdRows((p) => ({ ...p, [i.id]: { ...r, unit_price: e.target.value } }))} />
                              </TableCell>
                              <TableCell>
                                <Select value={r.currency} onValueChange={(v) => setEdRows((p) => ({ ...p, [i.id]: { ...r, currency: v } }))}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="UZS">UZS</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="text-destructive" title="Qatorni o'chirish"
                                  onClick={() => setDelItemId(i.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {editingItems.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Mahsulot yo'q</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t bg-background shrink-0 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditId(null)} disabled={busy}>Bekor qilish</Button>
                <Button onClick={saveEdit} disabled={busy}><Save className="h-4 w-4 mr-1" /> Saqlash</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Nakladnoyni o'chirishni tasdiqlash */}
      <AlertDialog open={!!delId} onOpenChange={(o) => { if (!o) setDelId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nakladnoy o'chirilsinmi?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu Nakladnoy va uning barcha mahsulotlari o'chiriladi. Skladga tushgan miqdorlar qoldiqdan qaytariladi. Amalni qaytarib bo'lmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSession} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">O'chirish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Qatorni o'chirishni tasdiqlash */}
      <AlertDialog open={!!delItemId} onOpenChange={(o) => { if (!o) setDelItemId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mahsulot qatori o'chirilsinmi?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu qator Nakladnoydan o'chiriladi va uning miqdori sklad qoldig'idan qaytariladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={deleteItem} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">O'chirish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
