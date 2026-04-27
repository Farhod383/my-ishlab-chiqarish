import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Truck, AlertTriangle, Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { logAudit } from "@/types/erp";
import { toast } from "sonner";

export default function SupplyPage() {
  const { user, hasRole } = useAuth();
  const { t } = useI18n();
  const [products, setProducts] = useState<any[]>([]);
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);
  const [supplier, setSupplier] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("products").select("*").order("name");
    setProducts(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const fmt = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n));

  const receive = async () => {
    if (!pid || !qty || !supplier) { toast.error(t.warehouse.fillFields); return; }
    const { error } = await supabase.from("stock_movements").insert({
      product_id: pid, direction: "in", quantity: qty,
      unit_price: price || 0,
      recipient_name: supplier, created_by: user?.id,
      comment: `${t.supply.title}: ${supplier}${price ? ` · ${fmt(price)} ${t.common.sum}/${t.common.pieces}` : ""}`,
    });
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Mahsulot keltirildi", entity: "stock_movement",
      details: `${products.find(p=>p.id===pid)?.name}: +${qty} × ${fmt(price)} = ${fmt(qty * price)} ${t.common.sum}`,
    });
    toast.success(t.warehouse.inRecorded);
    setPid(""); setQty(0); setPrice(0); setSupplier(""); setOpen(false);
    load();
  };

  const lowStock = products.filter(p => Number(p.stock_qty) <= Number(p.min_limit));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.supply.title}</h1>
          <p className="text-sm text-muted-foreground">{t.supply.subtitle}</p>
        </div>
        {hasRole(["supply", "admin"]) && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t.supply.receive}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t.supply.receiveTitle}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>{t.supply.cols.product}</Label>
                  <Select value={pid} onValueChange={setPid}>
                    <SelectTrigger><SelectValue placeholder={t.supply.select} /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t.supply.qty}</Label><Input type="number" min={0.1} step={0.1} value={qty || ""} onChange={e => setQty(Number(e.target.value))} /></div>
                  <div><Label>{t.supply.price}</Label><Input type="number" min={0} step={1} value={price || ""} onChange={e => setPrice(Number(e.target.value))} placeholder="0" /></div>
                </div>
                {qty > 0 && price > 0 && (
                  <div className="text-sm bg-primary/5 border border-primary/20 rounded p-2 flex justify-between">
                    <span className="text-muted-foreground">{t.supply.totalValue}:</span>
                    <span className="font-mono font-bold text-primary">{fmt(qty * price)} {t.common.sum}</span>
                  </div>
                )}
                <div><Label>{t.supply.bringer}</Label><Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder={t.supply.bringerPh} /></div>
                <Button className="w-full" onClick={receive}>{t.supply.saveIn}</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="border-status-red/30 bg-status-red/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-status-red">
            <AlertTriangle className="h-4 w-4" />{t.supply.reorderTitle}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t.supply.reorderDesc}</p>
        </CardHeader>
        <CardContent>
          {lowStock.length === 0 ? <p className="text-sm text-muted-foreground">{t.supply.allEnough}</p> : (
            <div className="grid sm:grid-cols-2 gap-2">
              {lowStock.map(p => (
                <div key={p.id} className="p-3 bg-background rounded border flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{t.supply.cols.min}: {p.min_limit} {p.unit}</div>
                  </div>
                  <div className="font-mono font-bold text-status-red">{p.stock_qty} {p.unit}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />{t.supply.allProducts}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="border-t overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t.supply.cols.product}</TableHead>
                <TableHead className="text-right">{t.supply.cols.stock}</TableHead>
                <TableHead className="text-right">{t.supply.cols.min}</TableHead>
                <TableHead className="text-right">{t.supply.cols.lastPrice}</TableHead>
                <TableHead className="text-right">{t.supply.cols.missing}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {products.map(p => {
                  const need = Math.max(0, Number(p.min_limit) - Number(p.stock_qty));
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right font-mono">{p.stock_qty} {p.unit}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{p.min_limit} {p.unit}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(Number(p.last_price ?? 0))}</TableCell>
                      <TableCell className="text-right">{need > 0 ? <span className="text-status-red font-mono font-semibold">+{need} {p.unit}</span> : <span className="text-status-green text-xs">OK</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
