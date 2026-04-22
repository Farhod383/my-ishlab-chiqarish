import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Truck, AlertTriangle, Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { logAudit } from "@/types/erp";
import { toast } from "sonner";

export default function SupplyPage() {
  const { user, hasRole } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [pid, setPid] = useState(""); const [qty, setQty] = useState<number>(0); const [supplier, setSupplier] = useState("");

  const load = async () => {
    const { data } = await supabase.from("products").select("*").order("name");
    setProducts(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const receive = async () => {
    if (!pid || !qty || !supplier) { toast.error("Maydonlarni to'ldiring"); return; }
    const { error } = await supabase.from("stock_movements").insert({
      product_id: pid, direction: "in", quantity: qty, recipient_name: supplier, created_by: user?.id, comment: `Ta'minot: ${supplier}`,
    });
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, { actor_id: user?.id, actor_name: user?.email, action: "Mahsulot keltirildi", entity: "stock_movement", details: `${products.find(p=>p.id===pid)?.name}: +${qty}` });
    toast.success("Kirim qayd etildi");
    setPid(""); setQty(0); setSupplier("");
    load();
  };

  const lowStock = products.filter(p => Number(p.stock_qty) <= Number(p.min_limit));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ta'minot</h1>
          <p className="text-sm text-muted-foreground">Limit ostidagi mahsulotlar va kirim qayd etish</p>
        </div>
        {hasRole(["supply", "admin", "warehouse"]) && (
          <Dialog>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Kirim qilish</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Mahsulot kirimi</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Mahsulot</Label><Select value={pid} onValueChange={setPid}><SelectTrigger><SelectValue placeholder="Tanlang" /></SelectTrigger><SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Miqdor</Label><Input type="number" min={0.1} step={0.1} value={qty} onChange={e => setQty(Number(e.target.value))} /></div>
                <div><Label>Kim olib keldi</Label><Input value={supplier} onChange={e => setSupplier(e.target.value)} /></div>
                <Button className="w-full" onClick={receive}>Kirimni qayd etish</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="border-status-red/30 bg-status-red/5">
        <CardHeader><CardTitle className="text-base flex items-center gap-2 text-status-red"><AlertTriangle className="h-4 w-4" />Qayta zakaz berish kerak</CardTitle><CardDescription>Quyidagi mahsulotlar minimal limitdan tushgan</CardDescription></CardHeader>
        <CardContent>
          {lowStock.length === 0 ? <p className="text-sm text-muted-foreground">Hozircha hammasi yetarli ✓</p> : (
            <div className="grid sm:grid-cols-2 gap-2">
              {lowStock.map(p => (
                <div key={p.id} className="p-3 bg-background rounded border flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">Min: {p.min_limit} {p.unit}</div>
                  </div>
                  <div className="font-mono font-bold text-status-red">{p.stock_qty} {p.unit}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />Barcha mahsulotlar</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="border-t">
          <Table>
            <TableHeader><TableRow><TableHead>Mahsulot</TableHead><TableHead className="text-right">Qoldiq</TableHead><TableHead className="text-right">Min limit</TableHead><TableHead className="text-right">Yetishmaydi</TableHead></TableRow></TableHeader>
            <TableBody>
              {products.map(p => {
                const need = Math.max(0, Number(p.min_limit) - Number(p.stock_qty));
                return <TableRow key={p.id}><TableCell className="font-medium">{p.name}</TableCell><TableCell className="text-right font-mono">{p.stock_qty} {p.unit}</TableCell><TableCell className="text-right text-sm text-muted-foreground">{p.min_limit} {p.unit}</TableCell><TableCell className="text-right">{need > 0 ? <span className="text-status-red font-mono font-semibold">+{need} {p.unit}</span> : <span className="text-status-green text-xs">OK</span>}</TableCell></TableRow>;
              })}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
