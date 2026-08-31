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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useI18n, useLocalize } from "@/i18n/context";
import { toast } from "sonner";
import ProductPicker from "@/components/ProductPicker";
import { logAudit } from "@/types/erp";
import { notify } from "@/lib/notify";
import { useEmployees } from "@/hooks/useEmployees";

export default function ReturnsPage() {
  const { user, hasRole } = useAuth();
  const { t } = useI18n();
  const localize = useLocalize();
  const r = (t as any).returns ?? {};
  const [returns, setReturns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", quantity: 1, returned_by_id: "", return_type: "worker_to_warehouse" as string, reason: "", comment: "", image: null as File | null, order_id: "" });

  const { employees } = useEmployees({ activeOnly: true });

  const load = async () => {
    const [{ data: ret }, { data: prod }, { data: ord }] = await Promise.all([
      supabase.from("returns").select("*, product:products(name, unit), returned_by:employees(full_name), order:orders(order_number)").order("created_at", { ascending: false }),
      supabase.from("products").select("id, name, unit, stock_qty").order("name"),
      supabase.from("orders").select("id, order_number, product_name").order("created_at", { ascending: false }).limit(200),
    ]);
    setReturns(ret ?? []);
    setProducts(prod ?? []);
    setOrders(ord ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const canManage = hasRole(["warehouse", "admin"]);

  const save = async () => {
    if (!form.product_id || !form.quantity || !form.returned_by_id) { toast.error(r.fillFields ?? "Maydonlarni to'ldiring"); return; }
    let image_url: string | null = null;
    if (form.image) {
      const path = `returns/${Date.now()}_${form.image.name}`;
      const up = await supabase.storage.from("product-images").upload(path, form.image);
      if (!up.error) image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    const emp = employees.find(e => e.id === form.returned_by_id);
    const { error } = await supabase.from("returns").insert({
      product_id: form.product_id,
      quantity: form.quantity,
      returned_by_id: form.returned_by_id,
      returned_by_name: emp?.full_name ?? null,
      return_type: form.return_type,
      reason: form.reason.trim() || null,
      comment: form.comment.trim() || null,
      image_url,
      created_by: user?.id,
      order_id: form.order_id || null,
    } as any);
    if (error) { toast.error(error.message); return; }
    const pname = products.find((p: any) => p.id === form.product_id)?.name ?? "—";
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Vozvrat qayd etildi", entity: "return",
      order_id: form.order_id || null,
      details: `${pname} · ${form.quantity} · ${emp?.full_name ?? "—"}`,
    });
    await notify({
      type: "info",
      title: `Vozvrat — ${pname}`,
      body: `${form.quantity} dona · ${emp?.full_name ?? "—"}`,
      link: "/returns",
      entity: "return",
      recipient_role: ["warehouse", "manager", "otk"],
      sender_id: user?.id, sender_name: user?.email,
    });
    toast.success(r.saved ?? "Saqlandi");
    setForm({ product_id: "", quantity: 1, returned_by_id: "", return_type: "worker_to_warehouse", reason: "", comment: "", image: null, order_id: "" });
    setOpen(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><RotateCcw className="h-6 w-6" />{r.title ?? "Vozvrat"}</h1>
          <p className="text-sm text-muted-foreground">{r.subtitle ?? "Qaytarilgan mahsulotlar"}</p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{r.add ?? "Vozvrat qo'shish"}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{r.add ?? "Vozvrat qo'shish"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>{r.product ?? "Mahsulot"}</Label>
                  <ProductPicker
                    products={products}
                    value={form.product_id}
                    onChange={v => setForm({ ...form, product_id: v })}
                    placeholder={r.selectProduct ?? "Tanlang"}
                  />
                </div>
                <div><Label>Zakaz (ixtiyoriy)</Label>
                  <SearchableSelect
                    value={form.order_id}
                    onChange={v => setForm({ ...form, order_id: v })}
                    placeholder="— Yo'q —"
                    clearLabel="— Yo'q —"
                    searchPlaceholder="Zakaz raqami yoki nomi..."
                    options={orders.map(o => ({ value: o.id, label: o.product_name, hint: o.order_number }))}
                  />

                </div>
                <div><Label>{r.qty ?? "Miqdor"}</Label><NumberInput min={0.1} step={0.1} value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
                <div><Label>{r.returnedBy ?? "Kim qaytardi"}</Label>
                  <Select value={form.returned_by_id} onValueChange={v => setForm({ ...form, returned_by_id: v })}>
                    <SelectTrigger><SelectValue placeholder={r.selectEmployee ?? "Xodimni tanlang"} /></SelectTrigger>
                    <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{localize(e.full_name)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>{r.type ?? "Tur"}</Label>
                  <Select value={form.return_type} onValueChange={v => setForm({ ...form, return_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="worker_to_warehouse">{r.workerToWarehouse ?? "Ishchi → Sklad"}</SelectItem>
                      <SelectItem value="warehouse_to_shop">{r.warehouseToShop ?? "Sklad → Do'kon"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>{r.reason ?? "Sabab"}</Label><Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
                <div><Label>{r.comment ?? "Izoh"}</Label><Textarea value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} /></div>
                <div><Label>{r.image ?? "Rasm"}</Label><Input type="file" accept="image/*" onChange={e => setForm({ ...form, image: e.target.files?.[0] ?? null })} /></div>
              </div>
              <DialogFooter>
                <Button className="w-full sm:w-auto" onClick={save}>{t.common.save}</Button>
              </DialogFooter>
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
                  <TableHead>{r.date ?? "Sana"}</TableHead>
                  <TableHead>{r.product ?? "Mahsulot"}</TableHead>
                  <TableHead className="text-right">{r.qty ?? "Miqdor"}</TableHead>
                  <TableHead>{r.returnedBy ?? "Kim qaytardi"}</TableHead>
                  <TableHead>{r.type ?? "Tur"}</TableHead>
                  <TableHead>Zakaz</TableHead>
                  <TableHead>{r.reason ?? "Sabab"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>}
                {!loading && returns.map(ret => (
                  <TableRow key={ret.id}>
                    <TableCell className="text-sm whitespace-nowrap">{new Date(ret.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-sm font-medium">{ret.product?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{ret.quantity} {ret.product?.unit ?? ""}</TableCell>
                    <TableCell className="text-sm">{localize(ret.returned_by?.full_name ?? ret.returned_by_name) || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {ret.return_type === "worker_to_warehouse" ? (r.workerToWarehouse ?? "Ishchi→Sklad") : (r.warehouseToShop ?? "Sklad→Do'kon")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-mono">{ret.order?.order_number ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ret.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {!loading && returns.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{r.empty ?? "Vozvratlar yo'q"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
