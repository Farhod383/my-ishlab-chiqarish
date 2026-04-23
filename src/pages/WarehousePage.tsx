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
import { AlertTriangle, Package, ArrowDownToLine, ArrowDownCircle, ArrowUpCircle, History } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { logAudit } from "@/types/erp";
import { toast } from "sonner";

export default function WarehousePage() {
  const { user, hasRole } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  const [outProduct, setOutProduct] = useState("");
  const [outOrder, setOutOrder] = useState("");
  const [outQty, setOutQty] = useState<number>(1);
  const [outRecipient, setOutRecipient] = useState("");
  const [outComment, setOutComment] = useState("");

  const load = async () => {
    const [p, o, m] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("orders").select("id, order_number, product_name").neq("status", "completed"),
      supabase.from("stock_movements").select("*, product:products(name, unit), order:orders(order_number, product_name)").order("created_at", { ascending: false }).limit(100),
    ]);
    setProducts(p.data ?? []); setOrders(o.data ?? []); setMovements(m.data ?? []);
  };
  useEffect(() => { load(); }, []);

  const release = async () => {
    if (!outProduct || !outQty || !outRecipient) { toast.error("Maydonlarni to'ldiring"); return; }
    const { error } = await supabase.from("stock_movements").insert({
      product_id: outProduct, order_id: outOrder || null, direction: "out",
      quantity: outQty, recipient_name: outRecipient, comment: outComment, created_by: user?.id, taken_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email, action: "Sklad chiqimi",
      entity: "stock_movement", order_id: outOrder || null,
      details: `${products.find(p=>p.id===outProduct)?.name} — ${outQty} dona, qabul qildi: ${outRecipient}`,
    });
    toast.success("Chiqim qayd etildi");
    setOutProduct(""); setOutOrder(""); setOutQty(1); setOutRecipient(""); setOutComment("");
    load();
  };

  const productMovements = useMemo(
    () => selectedProduct ? movements.filter(m => m.product_id === selectedProduct.id) : [],
    [movements, selectedProduct]
  );

  const fmtDateTime = (s: string) => new Date(s).toLocaleString("uz-UZ", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sklad</h1>
          <p className="text-sm text-muted-foreground">Umumiy qoldiq, chiqim/kirim, tarix</p>
        </div>
        {hasRole(["warehouse", "admin"]) && (
          <Dialog>
            <DialogTrigger asChild><Button><ArrowDownToLine className="h-4 w-4 mr-2" />Chiqim qilish</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Sklad chiqimi</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Mahsulot</Label>
                  <Select value={outProduct} onValueChange={setOutProduct}>
                    <SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} (qoldiq: {p.stock_qty} {p.unit})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Qaysi zakaz uchun (ixtiyoriy)</Label>
                  <Select value={outOrder} onValueChange={setOutOrder}>
                    <SelectTrigger><SelectValue placeholder="Zakaz" /></SelectTrigger>
                    <SelectContent>{orders.map(o => <SelectItem key={o.id} value={o.id}>{o.order_number} — {o.product_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Miqdor</Label><Input type="number" min={0.1} step={0.1} value={outQty} onChange={e => setOutQty(Number(e.target.value))} /></div>
                <div><Label>Kim oldi (ishchi ismi)</Label><Input value={outRecipient} onChange={e => setOutRecipient(e.target.value)} placeholder="Masalan: Ahmad Karimov" /></div>
                <div><Label>Izoh (ixtiyoriy)</Label><Textarea value={outComment} onChange={e => setOutComment(e.target.value)} /></div>
                <Button className="w-full" onClick={release}>Chiqimni qayd etish</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Umumiy qoldiq</TabsTrigger>
          <TabsTrigger value="history">Harakatlar tarixi</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <Card><CardContent className="p-0">
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Mahsulot</TableHead>
                  <TableHead className="text-right">Qoldiq</TableHead>
                  <TableHead className="text-right">Min limit</TableHead>
                  <TableHead>Holat</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {products.map(p => {
                    const low = Number(p.stock_qty) <= Number(p.min_limit);
                    return (
                      <TableRow key={p.id} className={`cursor-pointer hover:bg-muted/40 ${low ? "bg-status-red/5" : ""}`} onClick={() => setSelectedProduct(p)}>
                        <TableCell className="font-medium flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" />{p.name}</TableCell>
                        <TableCell className="text-right font-mono">{p.stock_qty} {p.unit}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{p.min_limit} {p.unit}</TableCell>
                        <TableCell>{low ? <span className="text-status-red text-xs font-semibold flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Kam qoldi</span> : <span className="text-status-green text-xs">Yetarli</span>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
          <p className="text-xs text-muted-foreground mt-2">Mahsulot ustiga bosing — to'liq tarix ochiladi</p>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sklad harakati (oxirgi 100)</CardTitle>
              <CardDescription>Kim, qachon, qaysi zakaz uchun, qaysi mahsulot va qancha</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-t overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sana / vaqt</TableHead>
                      <TableHead>Yo'nalish</TableHead>
                      <TableHead>Mahsulot</TableHead>
                      <TableHead className="text-right">Miqdor</TableHead>
                      <TableHead>Kim oldi / keltirdi</TableHead>
                      <TableHead>Zakaz</TableHead>
                      <TableHead>Izoh</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(m.created_at)}</TableCell>
                        <TableCell>
                          {m.direction === "out"
                            ? <span className="inline-flex items-center gap-1 text-status-red text-xs font-semibold"><ArrowDownCircle className="h-3.5 w-3.5" />Chiqim</span>
                            : <span className="inline-flex items-center gap-1 text-status-green text-xs font-semibold"><ArrowUpCircle className="h-3.5 w-3.5" />Kirim</span>}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{m.product?.name ?? "—"}</TableCell>
                        <TableCell className={`text-right font-mono font-semibold ${m.direction==="out" ? "text-status-red" : "text-status-green"}`}>
                          {m.direction==="out"?"-":"+"}{m.quantity} {m.product?.unit}
                        </TableCell>
                        <TableCell className="text-sm">{m.recipient_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-sm font-mono">{m.order?.order_number ?? <span className="text-muted-foreground">Umumiy</span>}</TableCell>
                        <TableCell className="text-xs italic text-muted-foreground max-w-[200px] truncate">{m.comment ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {movements.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Harakatlar yo'q</TableCell></TableRow>}
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
                <DialogDescription>Mahsulot bo'yicha to'liq ma'lumot va harakatlar tarixi</DialogDescription>
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
                    <div className="text-xs text-muted-foreground">Umumiy qoldiq</div>
                    <div className="text-2xl font-bold font-mono mt-1">{selectedProduct.stock_qty} <span className="text-sm font-normal text-muted-foreground">{selectedProduct.unit}</span></div>
                  </div>
                  <div className="border rounded-md p-3">
                    <div className="text-xs text-muted-foreground">Minimal limit</div>
                    <div className="text-2xl font-bold font-mono mt-1">{selectedProduct.min_limit} <span className="text-sm font-normal text-muted-foreground">{selectedProduct.unit}</span></div>
                  </div>
                  <div className="col-span-2">
                    {Number(selectedProduct.stock_qty) <= Number(selectedProduct.min_limit) ? (
                      <div className="flex items-center gap-2 text-status-red text-sm font-semibold border border-status-red/30 bg-status-red/5 rounded-md p-2">
                        <AlertTriangle className="h-4 w-4" />Diqqat: qoldiq minimal limitdan past
                      </div>
                    ) : (
                      <div className="text-status-green text-sm font-medium">Qoldiq yetarli</div>
                    )}
                  </div>
                </div>
              </div>

              <Tabs defaultValue="in" className="mt-2">
                <TabsList>
                  <TabsTrigger value="in"><ArrowUpCircle className="h-3.5 w-3.5 mr-1" />Prixod tarixi</TabsTrigger>
                  <TabsTrigger value="out"><ArrowDownCircle className="h-3.5 w-3.5 mr-1" />Chiqim tarixi</TabsTrigger>
                  <TabsTrigger value="all"><History className="h-3.5 w-3.5 mr-1" />Audit log</TabsTrigger>
                </TabsList>

                <TabsContent value="in" className="mt-3">
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Sana / vaqt</TableHead>
                        <TableHead>Kim olib keldi</TableHead>
                        <TableHead className="text-right">Miqdor</TableHead>
                        <TableHead>Izoh</TableHead>
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
                          <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4 text-sm">Prixodlar yo'q</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="out" className="mt-3">
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Sana / vaqt</TableHead>
                        <TableHead>Kimga berilgan</TableHead>
                        <TableHead>Qaysi zakaz</TableHead>
                        <TableHead className="text-right">Miqdor</TableHead>
                        <TableHead>Izoh</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {productMovements.filter(m => m.direction === "out").map(m => (
                          <TableRow key={m.id}>
                            <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(m.created_at)}</TableCell>
                            <TableCell className="text-sm">{m.recipient_name ?? "—"}</TableCell>
                            <TableCell className="text-sm font-mono">{m.order?.order_number ?? <span className="text-muted-foreground">Umumiy</span>}</TableCell>
                            <TableCell className="text-right font-mono text-status-red font-semibold">-{m.quantity} {selectedProduct.unit}</TableCell>
                            <TableCell className="text-xs italic text-muted-foreground">{m.comment ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                        {productMovements.filter(m => m.direction === "out").length === 0 && (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-sm">Chiqimlar yo'q</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="all" className="mt-3">
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {productMovements.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Harakatlar yo'q</p>}
                    {productMovements.map(m => (
                      <div key={m.id} className={`text-sm border-l-2 pl-3 py-1.5 ${m.direction === "out" ? "border-status-red/60" : "border-status-green/60"}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium flex items-center gap-1.5">
                            {m.direction === "out" ? <ArrowDownCircle className="h-3.5 w-3.5 text-status-red" /> : <ArrowUpCircle className="h-3.5 w-3.5 text-status-green" />}
                            {m.direction === "out" ? "Chiqim" : "Prixod"}
                          </span>
                          <span className={`font-mono font-semibold ${m.direction==="out" ? "text-status-red" : "text-status-green"}`}>
                            {m.direction==="out"?"-":"+"}{m.quantity} {selectedProduct.unit}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDateTime(m.created_at)} · {m.direction==="out" ? "Oldi" : "Keltirdi"}: {m.recipient_name ?? "—"}
                          {m.order?.order_number && <> · Zakaz: <span className="font-mono">{m.order.order_number}</span></>}
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
