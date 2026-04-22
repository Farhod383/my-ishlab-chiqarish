import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle, Package, Plus, ArrowDownToLine } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { logAudit } from "@/types/erp";
import { toast } from "sonner";

export default function WarehousePage() {
  const { user, hasRole } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);

  const [outProduct, setOutProduct] = useState("");
  const [outOrder, setOutOrder] = useState("");
  const [outQty, setOutQty] = useState<number>(1);
  const [outRecipient, setOutRecipient] = useState("");
  const [outComment, setOutComment] = useState("");

  const load = async () => {
    const [p, o, m] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("orders").select("id, order_number, product_name").neq("status", "completed"),
      supabase.from("stock_movements").select("*, product:products(name, unit), order:orders(order_number)").order("created_at", { ascending: false }).limit(50),
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
                <div><Label>Kim oldi (ism)</Label><Input value={outRecipient} onChange={e => setOutRecipient(e.target.value)} /></div>
                <div><Label>Izoh</Label><Textarea value={outComment} onChange={e => setOutComment(e.target.value)} /></div>
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
                    <TableRow key={p.id} className={low ? "bg-status-red/5" : ""}>
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
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <Card><CardHeader><CardTitle className="text-base">Sklad harakati (oxirgi 50)</CardTitle><CardDescription>Kim oldi/keltirdi, qachon, qaysi zakaz</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {movements.map(m => (
                <div key={m.id} className="text-sm border-l-2 border-primary/40 pl-3 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{m.product?.name ?? "—"}</span>
                    <span className={`font-mono font-semibold ${m.direction==="out" ? "text-status-red" : "text-status-green"}`}>{m.direction==="out"?"-":"+"}{m.quantity} {m.product?.unit}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{m.direction==="out" ? "Oldi" : "Keltirdi"}: {m.recipient_name ?? "—"} · {m.order?.order_number ? `Zakaz: ${m.order.order_number}` : "Umumiy"} · {new Date(m.created_at).toLocaleString("uz-UZ")}</div>
                  {m.comment && <div className="text-xs italic text-muted-foreground">"{m.comment}"</div>}
                </div>
              ))}
              {movements.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Harakatlar yo'q</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
