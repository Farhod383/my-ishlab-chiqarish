import { useEffect, useState } from "react";
import SearchableSelect from "@/components/SearchableSelect";
import NumberInput from "@/components/NumberInput";
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
import { AlertOctagon, Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useI18n, useLocalize } from "@/i18n/context";
import { toast } from "sonner";

export default function DefectsPage() {
  const { user, hasRole } = useAuth();
  const { t } = useI18n();
  const localize = useLocalize();
  const d = (t as any).defects ?? {};
  const [defects, setDefects] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ order_id: "", product_id: "", quantity: 1, detected_by_id: "", reason: "", comment: "", resolution: "pending" as string, image: null as File | null });

  const load = async () => {
    const [{ data: def }, { data: ord }, { data: prod }, { data: emp }] = await Promise.all([
      supabase.from("defects").select("*, product:products(name, unit), detected_by:employees(full_name), order:orders(order_number)").order("created_at", { ascending: false }),
      supabase.from("orders").select("id, order_number, product_name").order("order_number", { ascending: false }),
      supabase.from("products").select("id, name, unit").order("name"),
      supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
    ]);
    setDefects(def ?? []);
    setOrders(ord ?? []);
    setProducts(prod ?? []);
    setEmployees(emp ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.product_id || !form.quantity) { toast.error(d.fillFields ?? "Maydonlarni to'ldiring"); return; }
    let image_url: string | null = null;
    if (form.image) {
      const path = `defects/${Date.now()}_${form.image.name}`;
      const up = await supabase.storage.from("product-images").upload(path, form.image);
      if (!up.error) image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    const emp = employees.find(e => e.id === form.detected_by_id);
    const { error } = await supabase.from("defects").insert({
      order_id: form.order_id || null,
      product_id: form.product_id,
      quantity: form.quantity,
      detected_by_id: form.detected_by_id || null,
      detected_by_name: emp?.full_name ?? null,
      reason: form.reason.trim() || null,
      comment: form.comment.trim() || null,
      resolution: form.resolution as any,
      image_url,
      created_by: user?.id,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success(d.saved ?? "Saqlandi");
    setForm({ order_id: "", product_id: "", quantity: 1, detected_by_id: "", reason: "", comment: "", resolution: "pending", image: null });
    setOpen(false);
    load();
  };

  const updateResolution = async (id: string, resolution: string) => {
    await supabase.from("defects").update({ resolution } as any).eq("id", id);
    load();
  };

  const resColor = (res: string) => res === "rework" ? "border-status-yellow text-status-yellow" : res === "write_off" ? "border-status-red text-status-red" : "border-muted-foreground text-muted-foreground";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><AlertOctagon className="h-6 w-6" />{d.title ?? "Brak"}</h1>
          <p className="text-sm text-muted-foreground">{d.subtitle ?? "Yaroqsiz mahsulotlar hisobi"}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{d.add ?? "Brak qo'shish"}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{d.add ?? "Brak qo'shish"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{d.order ?? "Zakaz"}</Label>
                <Select value={form.order_id} onValueChange={v => setForm({ ...form, order_id: v })}>
                  <SelectTrigger><SelectValue placeholder={d.selectOrder ?? "Tanlang (ixtiyoriy)"} /></SelectTrigger>
                  <SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>{o.order_number} — {o.product_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{d.product ?? "Mahsulot"}</Label>
                <Select value={form.product_id} onValueChange={v => setForm({ ...form, product_id: v })}>
                  <SelectTrigger><SelectValue placeholder={d.selectProduct ?? "Tanlang"} /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{d.qty ?? "Miqdor"}</Label><NumberInput min={0.1} step={0.1} value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
              <div><Label>{d.detectedBy ?? "Kim aniqladi"}</Label>
                <Select value={form.detected_by_id} onValueChange={v => setForm({ ...form, detected_by_id: v })}>
                  <SelectTrigger><SelectValue placeholder={d.selectEmployee ?? "Xodim"} /></SelectTrigger>
                  <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{localize(e.full_name)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{d.reason ?? "Sabab"}</Label><Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
              <div><Label>{d.resolution ?? "Qaror"}</Label>
                <Select value={form.resolution} onValueChange={v => setForm({ ...form, resolution: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{d.pending ?? "Kutilmoqda"}</SelectItem>
                    <SelectItem value="rework">{d.rework ?? "Qayta ishlash"}</SelectItem>
                    <SelectItem value="write_off">{d.writeOff ?? "Hisobdan chiqarish"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{d.comment ?? "Izoh"}</Label><Textarea value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} /></div>
              <div><Label>{d.image ?? "Rasm"}</Label><Input type="file" accept="image/*" onChange={e => setForm({ ...form, image: e.target.files?.[0] ?? null })} /></div>
              <Button className="w-full" onClick={save}>{t.common.save}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.date ?? "Sana"}</TableHead>
                  <TableHead>{d.order ?? "Zakaz"}</TableHead>
                  <TableHead>{d.product ?? "Mahsulot"}</TableHead>
                  <TableHead className="text-right">{d.qty ?? "Miqdor"}</TableHead>
                  <TableHead>{d.detectedBy ?? "Kim aniqladi"}</TableHead>
                  <TableHead>{d.reason ?? "Sabab"}</TableHead>
                  <TableHead>{d.resolution ?? "Qaror"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>}
                {!loading && defects.map(def => (
                  <TableRow key={def.id}>
                    <TableCell className="text-sm whitespace-nowrap">{new Date(def.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm font-mono">{def.order?.order_number ?? "—"}</TableCell>
                    <TableCell className="text-sm font-medium">{def.product?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{def.quantity} {def.product?.unit ?? ""}</TableCell>
                    <TableCell className="text-sm">{localize(def.detected_by?.full_name ?? def.detected_by_name) || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{def.reason ?? "—"}</TableCell>
                    <TableCell>
                      {hasRole(["admin", "warehouse"]) ? (
                        <Select value={def.resolution} onValueChange={v => updateResolution(def.id, v)}>
                          <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">{d.pending ?? "Kutilmoqda"}</SelectItem>
                            <SelectItem value="rework">{d.rework ?? "Qayta ishlash"}</SelectItem>
                            <SelectItem value="write_off">{d.writeOff ?? "Hisobdan chiqarish"}</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className={`text-xs ${resColor(def.resolution)}`}>
                          {def.resolution === "rework" ? (d.rework ?? "Qayta ishlash") : def.resolution === "write_off" ? (d.writeOff ?? "Hisobdan chiqarish") : (d.pending ?? "Kutilmoqda")}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && defects.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{d.empty ?? "Brak yo'q"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
