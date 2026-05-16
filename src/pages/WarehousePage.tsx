import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertTriangle, Package, ArrowDownToLine, ArrowDownCircle, ArrowUpCircle, History, Plus, PackageMinus, Pencil, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { logAudit } from "@/types/erp";
import { toast } from "sonner";

const UNITS = ["dona", "kg", "metr", "litr", "rulon", "komplekt"] as const;

export default function WarehousePage() {
  const { user, hasRole } = useAuth();
  const { t } = useI18n();
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [search, setSearch] = useState("");

  // Output states
  const [outProduct, setOutProduct] = useState("");
  const [outOrder, setOutOrder] = useState("");
  const [outQty, setOutQty] = useState<number>(1);
  const [outRecipient, setOutRecipient] = useState("");
  const [outComment, setOutComment] = useState("");

  // Add product
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState<string>("");
  const [newUnit, setNewUnit] = useState<string>("dona");
  const [newPrice, setNewPrice] = useState<string>("");
  const [newMin, setNewMin] = useState<string>("");
  const [newPhone, setNewPhone] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [newImage, setNewImage] = useState<File | null>(null);

  // Other output (no order)
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherProduct, setOtherProduct] = useState("");
  const [otherQty, setOtherQty] = useState<number>(1);
  const [otherRecipient, setOtherRecipient] = useState("");
  const [otherReason, setOtherReason] = useState("");

  // Import (from supply)
  const [importOpen, setImportOpen] = useState(false);
  const [impProductId, setImpProductId] = useState<string>("");
  const [impProductName, setImpProductName] = useState("");
  const [impPickerOpen, setImpPickerOpen] = useState(false);
  const [impQty, setImpQty] = useState<string>("");
  const [impUnit, setImpUnit] = useState<string>("dona");
  const [impPrice, setImpPrice] = useState<string>("");
  const [impSupplier, setImpSupplier] = useState("");
  const [impPhone, setImpPhone] = useState("");
  const [impSource, setImpSource] = useState("");
  const [impImage, setImpImage] = useState<File | null>(null);

  // Edit product
  const [editProdOpen, setEditProdOpen] = useState(false);
  const [editProd, setEditProd] = useState<any | null>(null);
  const [epName, setEpName] = useState(""); const [epUnit, setEpUnit] = useState("dona");
  const [epPrice, setEpPrice] = useState(""); const [epMin, setEpMin] = useState("");
  const [epPhone, setEpPhone] = useState(""); const [epSource, setEpSource] = useState("");

  // Edit movement
  const [editMovOpen, setEditMovOpen] = useState(false);
  const [editMov, setEditMov] = useState<any | null>(null);
  const [emQty, setEmQty] = useState(""); const [emRecipient, setEmRecipient] = useState("");
  const [emComment, setEmComment] = useState(""); const [emSource, setEmSource] = useState("");

  const load = async () => {
    const [p, o, m, e] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("orders").select("id, order_number, product_name").neq("status", "completed"),
      supabase.from("stock_movements").select("*, product:products(name, unit), order:orders(order_number, product_name)").order("created_at", { ascending: false }).limit(200),
      supabase.from("employees").select("id, full_name, department").eq("status", "active").order("full_name"),
    ]);
    setProducts(p.data ?? []); setOrders(o.data ?? []); setMovements(m.data ?? []); setEmployees(e.data ?? []);
    const ids = Array.from(new Set((m.data ?? []).map((x: any) => x.created_by).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((pr: any) => { map[pr.id] = pr.full_name || pr.email || ""; });
      setProfiles(map);
    }
  };
  useEffect(() => { load(); }, []);

  const canManage = hasRole(["warehouse", "admin"]);
  const canImport = hasRole(["warehouse", "supply", "admin"]);
  const fmt = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n));

  const release = async () => {
    if (!outProduct || !outQty || !outRecipient) { toast.error(t.warehouse.fillFields); return; }
    const { error } = await supabase.from("stock_movements").insert({
      product_id: outProduct, order_id: outOrder || null, direction: "out",
      quantity: outQty, recipient_name: outRecipient, comment: outComment, created_by: user?.id, taken_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email, action: "Sklad chiqimi",
      entity: "stock_movement", order_id: outOrder || null,
      details: `${products.find(p=>p.id===outProduct)?.name} — ${outQty}, ${outRecipient}`,
    });
    toast.success(t.warehouse.outRecorded);
    setOutProduct(""); setOutOrder(""); setOutQty(1); setOutRecipient(""); setOutComment("");
    load();
  };

  const addProduct = async () => {
    if (!newName.trim()) { toast.error(t.warehouse.fillFields); return; }
    const qtyN = Number(newQty) || 0;
    if (qtyN < 0) { toast.error(t.warehouse.fillFields); return; }
    let image_url: string | null = null;
    if (newImage) {
      const path = `${Date.now()}_${newImage.name}`;
      const up = await supabase.storage.from("product-images").upload(path, newImage);
      if (up.error) { toast.error(up.error.message); return; }
      image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    const priceN = Number(newPrice) || 0;
    const minN = newMin === "" ? 0 : Number(newMin);
    const { data: created, error } = await supabase.from("products").insert({
      name: newName.trim(), unit: newUnit || "dona", last_price: priceN,
      min_limit: minN, phone: newPhone || null, image_url,
      source: newSource.trim() || null,
    } as any).select("id").single();
    if (error || !created) { toast.error(error?.message || "Error"); return; }
    if (qtyN > 0) {
      await supabase.from("stock_movements").insert({
        product_id: created.id, direction: "in", quantity: qtyN,
        unit_price: priceN,
        recipient_name: newSupplier.trim() || null,
        source: newSource.trim() || null,
        phone: newPhone || null, image_url,
        created_by: user?.id,
        comment: `${t.warehouse.addProduct}: ${newName.trim()}`,
      } as any);
    } else if (newSupplier.trim()) {
      await supabase.from("stock_movements").insert({
        product_id: null, direction: "in", quantity: 0,
        recipient_name: newSupplier.trim(), source: newSource.trim() || null,
        created_by: user?.id, comment: `${t.warehouse.addProduct}: ${newName.trim()}`,
      } as any);
    }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Mahsulot qo'shildi", entity: "product",
      details: `${newName.trim()}${qtyN > 0 ? `: +${qtyN} ${newUnit}` : ""}`,
    });
    toast.success(t.warehouse.productAdded);
    setNewName(""); setNewQty(""); setNewUnit("dona"); setNewPrice(""); setNewMin(""); setNewPhone(""); setNewSource(""); setNewSupplier(""); setNewImage(null);
    setAddOpen(false);
    load();
  };

  const otherOut = async () => {
    if (!otherProduct || !otherQty || !otherRecipient || !otherReason.trim()) { toast.error(t.warehouse.fillFields); return; }
    const { error } = await supabase.from("stock_movements").insert({
      product_id: otherProduct, order_id: null, direction: "out",
      quantity: otherQty, recipient_name: otherRecipient, reason: otherReason,
      comment: otherReason, created_by: user?.id, taken_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email, action: "Sklad chiqimi (boshqa)",
      entity: "stock_movement",
      details: `${products.find(p=>p.id===otherProduct)?.name} — ${otherQty}, sabab: ${otherReason}`,
    });
    toast.success(t.warehouse.outRecorded);
    setOtherProduct(""); setOtherQty(1); setOtherRecipient(""); setOtherReason("");
    setOtherOpen(false);
    load();
  };

  const doImport = async () => {
    const qtyN = Number(impQty);
    const priceN = Number(impPrice) || 0;
    if (!impProductName.trim() || !qtyN) { toast.error(t.warehouse.fillFields); return; }
    let imgUrl: string | null = null;
    if (impImage) {
      const ext = impImage.name.split(".").pop();
      const path = `${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("product-images").upload(path, impImage);
      if (!up.error) imgUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    const trimmedName = impProductName.trim();

    const { data: existingProducts } = await supabase
      .from("products")
      .select("id, name")
      .ilike("name", trimmedName)
      .limit(1);

    let productId: string;

    if (existingProducts && existingProducts.length > 0) {
      productId = existingProducts[0].id;
      const patch: any = {};
      if (priceN > 0) patch.last_price = priceN;
      if (impPhone) patch.phone = impPhone;
      if (imgUrl) patch.image_url = imgUrl;
      if (impSource.trim()) patch.source = impSource.trim();
      if (impUnit) patch.unit = impUnit;
      if (Object.keys(patch).length > 0) {
        await supabase.from("products").update(patch).eq("id", productId);
      }
    } else {
      const { data: newProduct, error: createError } = await supabase
        .from("products")
        .insert({
          name: trimmedName,
          unit: impUnit || "dona",
          last_price: priceN,
          min_limit: 0,
          stock_qty: 0,
          phone: impPhone || null,
          image_url: imgUrl,
          source: impSource.trim() || null,
        } as any)
        .select("id")
        .single();
      if (createError || !newProduct) {
        toast.error(createError?.message || "Mahsulot yaratishda xatolik");
        return;
      }
      productId = newProduct.id;
    }

    const { error } = await supabase.from("stock_movements").insert({
      product_id: productId, direction: "in", quantity: qtyN,
      unit_price: priceN,
      recipient_name: impSupplier || null, created_by: user?.id,
      phone: impPhone || null, image_url: imgUrl,
      source: impSource.trim() || null,
      comment: `${t.supply.title}${impSupplier ? `: ${impSupplier}` : ""}${priceN ? ` · ${fmt(priceN)} ${t.common.sum}/${t.common.pieces}` : ""}`,
    } as any);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Mahsulot keltirildi", entity: "stock_movement",
      details: `${trimmedName}: +${qtyN} ${impUnit} × ${fmt(priceN)} = ${fmt(qtyN * priceN)} ${t.common.sum}`,
    });
    toast.success(t.warehouse.inRecorded);
    setImpProductName(""); setImpQty(""); setImpUnit("dona"); setImpPrice(""); setImpSupplier(""); setImpPhone(""); setImpSource(""); setImpImage(null); setImportOpen(false);
    load();
  };

  const productMovements = useMemo(
    () => selectedProduct ? movements.filter(m => m.product_id === selectedProduct.id) : [],
    [movements, selectedProduct]
  );

  const fmtDateTime = (s: string) => new Date(s).toLocaleString();
  const lowStock = products.filter(p => Number(p.stock_qty) <= Number(p.min_limit));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.warehouse.title}</h1>
          <p className="text-sm text-muted-foreground">{t.warehouse.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild><Button variant="outline"><Plus className="h-4 w-4 mr-2" />{t.warehouse.addProduct}</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t.warehouse.addProduct}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>{t.warehouse.productName} *</Label><Input value={newName} onChange={e => setNewName(e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>{t.warehouse.qty} *</Label><Input type="number" inputMode="numeric" min={0} step="any" value={newQty} onChange={e => setNewQty(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" /></div>
                      <div><Label>{t.warehouse.unit} *</Label>
                        <Select value={newUnit} onValueChange={setNewUnit}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>{t.warehouse.minLimitField}</Label><Input type="number" min={0} value={newMin} onChange={e => setNewMin(e.target.value)} placeholder={(t.warehouse as any).minLimitPh} /></div>
                      <div><Label>{t.warehouse.price}</Label><Input type="number" min={0} value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="0" /></div>
                    </div>
                    <div><Label>{t.warehouse.phone}</Label><Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+998..." /></div>
                    <div><Label>{(t.warehouse as any).source}</Label><Input value={newSource} onChange={e => setNewSource(e.target.value)} placeholder={(t.warehouse as any).sourcePh} /></div>
                    <div><Label>{(t.warehouse.cols as any).supplier}</Label><Input value={newSupplier} onChange={e => setNewSupplier(e.target.value)} placeholder={t.supply.bringerPh} /></div>
                    <div><Label>{t.warehouse.image}</Label><Input type="file" accept="image/*" onChange={e => setNewImage(e.target.files?.[0] ?? null)} /></div>
                    <Button className="w-full" onClick={addProduct}>{t.common.save}</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={otherOpen} onOpenChange={setOtherOpen}>
                <DialogTrigger asChild><Button variant="outline"><PackageMinus className="h-4 w-4 mr-2" />{t.warehouse.otherOut}</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t.warehouse.otherOutTitle}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>{t.warehouse.cols.product}</Label>
                      <Select value={otherProduct} onValueChange={setOtherProduct}>
                        <SelectTrigger><SelectValue placeholder={t.supply.select} /></SelectTrigger>
                        <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.stock_qty} {p.unit})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>{t.warehouse.qty}</Label><Input type="number" min={0.1} step={0.1} value={otherQty} onChange={e => setOtherQty(Number(e.target.value))} /></div>
                    <div><Label>{t.warehouse.takenBy}</Label>
                      <Select value={otherRecipient} onValueChange={setOtherRecipient}>
                        <SelectTrigger><SelectValue placeholder={t.warehouse.takenByPh} /></SelectTrigger>
                        <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.full_name}>{e.full_name} {e.department && `(${e.department})`}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>{t.warehouse.reason} *</Label><Textarea value={otherReason} onChange={e => setOtherReason(e.target.value)} placeholder={t.warehouse.reasonPh} /></div>
                    <Button className="w-full" onClick={otherOut}>{t.warehouse.saveOut}</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild><Button><ArrowDownToLine className="h-4 w-4 mr-2" />{t.warehouse.release}</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t.warehouse.releaseTitle}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>{t.warehouse.cols.product}</Label>
                      <Select value={outProduct} onValueChange={setOutProduct}>
                        <SelectTrigger><SelectValue placeholder={t.supply.select} /></SelectTrigger>
                        <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({t.warehouse.cols.stock}: {p.stock_qty} {p.unit})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>{t.warehouse.forOrder}</Label>
                      <Select value={outOrder} onValueChange={setOutOrder}>
                        <SelectTrigger><SelectValue placeholder={t.warehouse.orderPh} /></SelectTrigger>
                        <SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>{o.order_number} — {o.product_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>{t.warehouse.qty}</Label><Input type="number" min={0.1} step={0.1} value={outQty} onChange={e => setOutQty(Number(e.target.value))} /></div>
                    <div><Label>{t.warehouse.takenBy}</Label>
                      <Select value={outRecipient} onValueChange={setOutRecipient}>
                        <SelectTrigger><SelectValue placeholder={t.warehouse.takenByPh} /></SelectTrigger>
                        <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.full_name}>{e.full_name} {e.department && `(${e.department})`}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>{t.warehouse.commentOpt}</Label><Textarea value={outComment} onChange={e => setOutComment(e.target.value)} /></div>
                    <Button className="w-full" onClick={release}>{t.warehouse.saveOut}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
          {canImport && (
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild><Button variant="secondary"><ArrowUpCircle className="h-4 w-4 mr-2" />{t.supply.receive}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t.supply.receiveTitle}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>{t.supply.productName || t.warehouse.productName}</Label>
                    <Input value={impProductName} onChange={e => setImpProductName(e.target.value)} placeholder={t.warehouse.productName} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2"><Label>{t.supply.qty} *</Label><Input type="number" min={0.1} step={0.1} value={impQty} onChange={e => setImpQty(e.target.value)} placeholder={(t.warehouse as any).qtyPh} /></div>
                    <div><Label>{t.warehouse.unit}</Label>
                      <Select value={impUnit} onValueChange={setImpUnit}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>{t.supply.price}</Label><Input type="number" min={0} step={1} value={impPrice} onChange={e => setImpPrice(e.target.value)} placeholder="0" /></div>
                  {Number(impQty) > 0 && Number(impPrice) > 0 && (
                    <div className="text-sm bg-primary/5 border border-primary/20 rounded p-2 flex justify-between">
                      <span className="text-muted-foreground">{t.supply.totalValue}:</span>
                      <span className="font-mono font-bold text-primary">{fmt(Number(impQty) * Number(impPrice))} {t.common.sum}</span>
                    </div>
                  )}
                  <div><Label>{(t.warehouse as any).source}</Label><Input value={impSource} onChange={e => setImpSource(e.target.value)} placeholder={(t.warehouse as any).sourcePh} /></div>
                  <div><Label>{t.supply.bringer}</Label><Input value={impSupplier} onChange={e => setImpSupplier(e.target.value)} placeholder={t.supply.bringerPh} /></div>
                  <div><Label>{t.supply.phone}</Label><Input value={impPhone} onChange={e => setImpPhone(e.target.value)} placeholder={t.supply.phonePh} /></div>
                  <div><Label>{t.supply.image}</Label><Input type="file" accept="image/*" onChange={e => setImpImage(e.target.files?.[0] ?? null)} /></div>
                  <Button className="w-full" onClick={doImport}>{t.supply.saveIn}</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <Card className="border-status-red/30 bg-status-red/5">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2 text-status-red"><AlertTriangle className="h-4 w-4" />{t.supply.reorderTitle}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid sm:grid-cols-3 gap-2">
              {lowStock.map(p => (
                <div key={p.id} className="p-2 bg-background rounded border flex items-center justify-between text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="font-mono text-status-red font-semibold">{p.stock_qty}/{p.min_limit} {p.unit}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">{t.warehouse.tabs.stock}</TabsTrigger>
          <TabsTrigger value="history">{t.warehouse.tabs.history}</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4 space-y-3">
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={(t.warehouse as any).search} className="max-w-md" />
          <Card><CardContent className="p-0">
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t.warehouse.cols.product}</TableHead>
                  <TableHead className="text-right">{t.warehouse.cols.stock}</TableHead>
                  <TableHead className="text-right">{t.warehouse.cols.min}</TableHead>
                  <TableHead className="text-right">{t.warehouse.price}</TableHead>
                  <TableHead>{(t.warehouse.cols as any).source}</TableHead>
                  <TableHead>{t.warehouse.cols.state}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(() => {
                    const q = search.trim().toLowerCase();
                    const filtered = q ? products.filter(p =>
                      [p.name, p.unit, p.source, p.phone].some((v: any) => (v ?? "").toString().toLowerCase().includes(q))
                    ) : products;
                    if (filtered.length === 0) return <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{q ? (t.warehouse as any).noResults : t.common.noRecords}</TableCell></TableRow>;
                    return filtered.map(p => {
                      const low = Number(p.stock_qty) <= Number(p.min_limit);
                      return (
                        <TableRow key={p.id} className={`cursor-pointer hover:bg-muted/40 ${low ? "bg-status-red/5" : ""}`} onClick={() => setSelectedProduct(p)}>
                          <TableCell className="font-medium flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" />{p.name}</TableCell>
                          <TableCell className="text-right font-mono">{p.stock_qty} {p.unit}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{p.min_limit} {p.unit}</TableCell>
                          <TableCell className="text-right text-sm font-mono">{fmt(Number(p.last_price ?? 0))}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.source ?? "—"}</TableCell>
                          <TableCell>{low ? <span className="text-status-red text-xs font-semibold flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{t.warehouse.low}</span> : <span className="text-status-green text-xs">{t.warehouse.enough}</span>}</TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
          <p className="text-xs text-muted-foreground mt-2">{t.warehouse.clickRow}</p>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.warehouse.historyTitle}</CardTitle>
              <CardDescription>{t.warehouse.historyDesc}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-t overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.warehouse.cols.datetime}</TableHead>
                      <TableHead>{t.warehouse.cols.direction}</TableHead>
                      <TableHead>{t.warehouse.cols.product}</TableHead>
                      <TableHead className="text-right">{t.warehouse.cols.qty}</TableHead>
                      <TableHead>{t.warehouse.cols.whoTook}</TableHead>
                      <TableHead>{(t.warehouse.cols as any).source}</TableHead>
                      <TableHead>{(t.warehouse.cols as any).addedBy}</TableHead>
                      <TableHead>{t.warehouse.cols.order}</TableHead>
                      <TableHead>{t.warehouse.cols.comment}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(m.created_at)}</TableCell>
                        <TableCell>
                          {m.direction === "out"
                            ? <span className="inline-flex items-center gap-1 text-status-red text-xs font-semibold"><ArrowDownCircle className="h-3.5 w-3.5" />{t.warehouse.out}</span>
                            : <span className="inline-flex items-center gap-1 text-status-green text-xs font-semibold"><ArrowUpCircle className="h-3.5 w-3.5" />{t.warehouse.in}</span>}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{m.product?.name ?? "—"}</TableCell>
                        <TableCell className={`text-right font-mono font-semibold ${m.direction==="out" ? "text-status-red" : "text-status-green"}`}>
                          {m.direction==="out"?"-":"+"}{m.quantity} {m.product?.unit}
                        </TableCell>
                        <TableCell className="text-sm">{m.recipient_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.source ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{profiles[m.created_by] ?? "—"}</TableCell>
                        <TableCell className="text-sm font-mono">{m.order?.order_number ?? <span className="text-muted-foreground">{t.warehouse.common}</span>}</TableCell>
                        <TableCell className="text-xs italic text-muted-foreground max-w-[200px] truncate">{m.comment ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {movements.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">{t.warehouse.noMov}</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Product Detail Modal */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5" />{selectedProduct.name}</DialogTitle>
                <DialogDescription>{t.warehouse.detailDesc}</DialogDescription>
              </DialogHeader>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  {selectedProduct.image_url ? (
                    <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full aspect-square object-cover rounded-md border" />
                  ) : (
                    <div className="w-full aspect-square rounded-md border bg-muted flex items-center justify-center">
                      <Package className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                  <div className="border rounded-md p-3">
                    <div className="text-xs text-muted-foreground">{t.warehouse.totalQty}</div>
                    <div className="text-2xl font-bold font-mono mt-1">{selectedProduct.stock_qty} <span className="text-sm font-normal text-muted-foreground">{selectedProduct.unit}</span></div>
                  </div>
                  <div className="border rounded-md p-3">
                    <div className="text-xs text-muted-foreground">{t.warehouse.minLimit}</div>
                    <div className="text-2xl font-bold font-mono mt-1">{selectedProduct.min_limit} <span className="text-sm font-normal text-muted-foreground">{selectedProduct.unit}</span></div>
                  </div>
                  <div className="border rounded-md p-3">
                    <div className="text-xs text-muted-foreground">{t.warehouse.price}</div>
                    <div className="text-xl font-bold font-mono mt-1">{fmt(Number(selectedProduct.last_price ?? 0))} <span className="text-sm font-normal text-muted-foreground">{t.common.sum}</span></div>
                  </div>
                  <div className="border rounded-md p-3">
                    <div className="text-xs text-muted-foreground">{t.warehouse.phone}</div>
                    <div className="text-sm font-medium mt-1">{selectedProduct.phone ?? "—"}</div>
                  </div>
                  <div className="col-span-2">
                    {Number(selectedProduct.stock_qty) <= Number(selectedProduct.min_limit) ? (
                      <div className="flex items-center gap-2 text-status-red text-sm font-semibold border border-status-red/30 bg-status-red/5 rounded-md p-2">
                        <AlertTriangle className="h-4 w-4" />{t.warehouse.lowAlert}
                      </div>
                    ) : (
                      <div className="text-status-green text-sm font-medium">{t.warehouse.enoughOk}</div>
                    )}
                  </div>
                </div>
              </div>

              <Tabs defaultValue="in" className="mt-2">
                <TabsList>
                  <TabsTrigger value="in"><ArrowUpCircle className="h-3.5 w-3.5 mr-1" />{t.warehouse.inHistory}</TabsTrigger>
                  <TabsTrigger value="out"><ArrowDownCircle className="h-3.5 w-3.5 mr-1" />{t.warehouse.outHistory}</TabsTrigger>
                  <TabsTrigger value="all"><History className="h-3.5 w-3.5 mr-1" />{t.warehouse.auditLog}</TabsTrigger>
                </TabsList>

                <TabsContent value="in" className="mt-3">
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>{t.warehouse.cols.datetime}</TableHead>
                        <TableHead>{t.warehouse.cols.whoBrought}</TableHead>
                        <TableHead className="text-right">{t.warehouse.cols.qty}</TableHead>
                        <TableHead>{t.warehouse.cols.comment}</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {productMovements.filter(m => m.direction === "in").map(m => (
                          <TableRow key={m.id}>
                            <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(m.created_at)}</TableCell>
                            <TableCell className="text-sm">{m.recipient_name ?? "—"}</TableCell>
                            <TableCell className="text-right font-mono text-status-green font-semibold">+{m.quantity} {selectedProduct.unit}</TableCell>
                            <TableCell className="text-xs italic text-muted-foreground">{m.comment ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                        {productMovements.filter(m => m.direction === "in").length === 0 && (
                          <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4 text-sm">{t.warehouse.noIn}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="out" className="mt-3">
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>{t.warehouse.cols.datetime}</TableHead>
                        <TableHead>{t.warehouse.cols.whoGot}</TableHead>
                        <TableHead>{t.warehouse.cols.whichOrder}</TableHead>
                        <TableHead className="text-right">{t.warehouse.cols.qty}</TableHead>
                        <TableHead>{t.warehouse.cols.comment}</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {productMovements.filter(m => m.direction === "out").map(m => (
                          <TableRow key={m.id}>
                            <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(m.created_at)}</TableCell>
                            <TableCell className="text-sm">{m.recipient_name ?? "—"}</TableCell>
                            <TableCell className="text-sm font-mono">{m.order?.order_number ?? <span className="text-muted-foreground">{t.warehouse.common}</span>}</TableCell>
                            <TableCell className="text-right font-mono text-status-red font-semibold">-{m.quantity} {selectedProduct.unit}</TableCell>
                            <TableCell className="text-xs italic text-muted-foreground">{m.comment ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                        {productMovements.filter(m => m.direction === "out").length === 0 && (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-sm">{t.warehouse.noOut}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="all" className="mt-3">
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {productMovements.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t.warehouse.noMov}</p>}
                    {productMovements.map(m => (
                      <div key={m.id} className={`text-sm border-l-2 pl-3 py-1.5 ${m.direction === "out" ? "border-status-red/60" : "border-status-green/60"}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium flex items-center gap-1.5">
                            {m.direction === "out" ? <ArrowDownCircle className="h-3.5 w-3.5 text-status-red" /> : <ArrowUpCircle className="h-3.5 w-3.5 text-status-green" />}
                            {m.direction === "out" ? t.warehouse.out : t.warehouse.movIn}
                          </span>
                          <span className={`font-mono font-semibold ${m.direction==="out" ? "text-status-red" : "text-status-green"}`}>
                            {m.direction==="out"?"-":"+"}{m.quantity} {selectedProduct.unit}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDateTime(m.created_at)} · {m.direction==="out" ? t.warehouse.got : t.warehouse.brought}: {m.recipient_name ?? "—"}
                          {m.order?.order_number && <> · {t.warehouse.cols.order}: <span className="font-mono">{m.order.order_number}</span></>}
                        </div>
                        {m.comment && <div className="text-xs italic text-muted-foreground mt-0.5">"{m.comment}"</div>}
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
