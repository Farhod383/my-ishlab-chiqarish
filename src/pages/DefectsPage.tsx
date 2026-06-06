import { useEffect, useMemo, useState } from "react";
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
import { AlertOctagon, Plus, Search } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useI18n, useLocalize } from "@/i18n/context";
import { toast } from "sonner";
import { matchesAcrossScripts } from "@/lib/translit";

type ItemType = "product" | "instrument";

export default function DefectsPage() {
  const { user, hasRole } = useAuth();
  const { t } = useI18n();
  const localize = useLocalize();
  const d = (t as any).defects ?? {};
  const [defects, setDefects] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [instruments, setInstruments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    item_type: "product" as ItemType,
    order_id: "",
    product_id: "",
    instrument_id: "",
    quantity: 1,
    detected_by_id: "",
    reason: "",
    comment: "",
    resolution: "pending" as string,
    image: null as File | null,
  });

  const load = async () => {
    const [{ data: def }, { data: ord }, { data: prod }, { data: instr }, { data: emp }] = await Promise.all([
      supabase.from("defects").select("*, product:products(name, unit), detected_by:employees(full_name), order:orders(order_number, product_name)").order("created_at", { ascending: false }),
      supabase.from("orders").select("id, order_number, product_name").order("order_number", { ascending: false }),
      supabase.from("products").select("id, name, unit").order("name"),
      supabase.from("instruments").select("id, name, quantity").order("name"),
      supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
    ]);
    setDefects(def ?? []);
    setOrders(ord ?? []);
    setProducts(prod ?? []);
    setInstruments(instr ?? []);
    setEmployees(emp ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // resolve instrument name for any defect of type 'instrument'
  const instrNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of instruments) m.set(i.id, i.name);
    return m;
  }, [instruments]);

  const itemName = (def: any) =>
    def.item_type === "instrument"
      ? (instrNameById.get(def.instrument_id) ?? "—")
      : (def.product?.name ?? "—");

  const filteredDefects = useMemo(() => {
    const q = search.trim();
    if (!q) return defects;
    return defects.filter((def: any) => {
      const hay = [
        itemName(def),
        def.order?.order_number,
        def.order?.product_name,
        def.reason,
        def.comment,
        def.detected_by?.full_name,
        def.detected_by_name,
      ].filter(Boolean).join(" ");
      return matchesAcrossScripts(hay, q);
    });
  }, [defects, search, instrNameById]);

  const save = async () => {
    if (form.item_type === "product" && !form.product_id) { toast.error(d.fillFields ?? "Maydonlarni to'ldiring"); return; }
    if (form.item_type === "instrument" && !form.instrument_id) { toast.error(d.fillFields ?? "Maydonlarni to'ldiring"); return; }
    if (!form.quantity || form.quantity <= 0) { toast.error(d.fillFields ?? "Maydonlarni to'ldiring"); return; }

    let image_url: string | null = null;
    if (form.image) {
      const path = `defects/${Date.now()}_${form.image.name}`;
      const up = await supabase.storage.from("product-images").upload(path, form.image);
      if (!up.error) image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    const emp = employees.find(e => e.id === form.detected_by_id);
    const payload: any = {
      item_type: form.item_type,
      order_id: form.item_type === "product" ? (form.order_id || null) : null,
      product_id: form.item_type === "product" ? form.product_id : null,
      instrument_id: form.item_type === "instrument" ? form.instrument_id : null,
      quantity: form.quantity,
      detected_by_id: form.detected_by_id || null,
      detected_by_name: emp?.full_name ?? null,
      reason: form.reason.trim() || null,
      comment: form.comment.trim() || null,
      resolution: form.resolution,
      image_url,
      created_by: user?.id,
    };
    const { error } = await supabase.from("defects").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(d.saved ?? "Saqlandi");
    setForm({ item_type: "product", order_id: "", product_id: "", instrument_id: "", quantity: 1, detected_by_id: "", reason: "", comment: "", resolution: "pending", image: null });
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
              <div>
                <Label>{d.type ?? "Brak turi"}</Label>
                <Select value={form.item_type} onValueChange={v => setForm({ ...form, item_type: v as ItemType, product_id: "", instrument_id: "", order_id: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">{d.product ?? "Mahsulot"}</SelectItem>
                    <SelectItem value="instrument">{d.instrument ?? "Instrument"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.item_type === "product" && (
                <>
                  <div><Label>{d.order ?? "Zakaz"}</Label>
                    <SearchableSelect
                      value={form.order_id}
                      onChange={v => setForm({ ...form, order_id: v })}
                      placeholder={d.selectOrder ?? "Tanlang (ixtiyoriy)"}
                      options={orders.map(o => ({ value: o.id, label: o.product_name, hint: o.order_number }))}
                    />
                  </div>
                  <div><Label>{d.product ?? "Mahsulot"}</Label>
                    <SearchableSelect
                      value={form.product_id}
                      onChange={v => setForm({ ...form, product_id: v })}
                      placeholder={d.selectProduct ?? "Tanlang"}
                      options={products.map(p => ({ value: p.id, label: p.name, hint: p.unit ?? "" }))}
                    />
                  </div>
                </>
              )}

              {form.item_type === "instrument" && (
                <div><Label>{d.instrument ?? "Instrument"}</Label>
                  <SearchableSelect
                    value={form.instrument_id}
                    onChange={v => setForm({ ...form, instrument_id: v })}
                    placeholder={d.selectInstrument ?? "Instrument tanlang"}
                    options={instruments.map(i => ({ value: i.id, label: i.name, hint: `${i.quantity} dona` }))}
                  />
                </div>
              )}

              <div><Label>{d.qty ?? "Miqdor"}</Label><NumberInput min={0.1} step={0.1} value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
              <div><Label>{d.detectedBy ?? "Kim aniqladi"}</Label>
                <SearchableSelect
                  value={form.detected_by_id}
                  onChange={v => setForm({ ...form, detected_by_id: v })}
                  placeholder={d.selectEmployee ?? "Xodim"}
                  options={employees.map(e => ({ value: e.id, label: localize(e.full_name) }))}
                />
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

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={d.searchPlaceholder ?? "Qidirish (mahsulot, instrument, zakaz...)"}
          className="pl-9 text-foreground"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{d.date ?? "Sana"}</TableHead>
                  <TableHead>{d.type ?? "Turi"}</TableHead>
                  <TableHead>{d.order ?? "Zakaz"}</TableHead>
                  <TableHead>{d.product ?? "Mahsulot"} / {d.instrument ?? "Instrument"}</TableHead>
                  <TableHead className="text-right">{d.qty ?? "Miqdor"}</TableHead>
                  <TableHead>{d.detectedBy ?? "Kim aniqladi"}</TableHead>
                  <TableHead>{d.reason ?? "Sabab"}</TableHead>
                  <TableHead>{d.resolution ?? "Qaror"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>}
                {!loading && filteredDefects.map(def => (
                  <TableRow key={def.id}>
                    <TableCell className="text-sm whitespace-nowrap">{new Date(def.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {def.item_type === "instrument" ? (d.instrument ?? "Instrument") : (d.product ?? "Mahsulot")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-mono">{def.order?.order_number ?? "—"}</TableCell>
                    <TableCell className="text-sm font-medium">{itemName(def)}</TableCell>
                    <TableCell className="text-right font-mono">{def.quantity} {def.item_type === "instrument" ? "dona" : (def.product?.unit ?? "")}</TableCell>
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
                {!loading && filteredDefects.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{d.empty ?? "Brak yo'q"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
