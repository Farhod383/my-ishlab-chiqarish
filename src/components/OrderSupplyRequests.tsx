import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Package, Trash2 } from "lucide-react";
import ProductPicker from "@/components/ProductPicker";
import NumberInput from "@/components/NumberInput";
import { useAuth } from "@/auth/AuthContext";
import { toast } from "sonner";
import { notify } from "@/lib/notify";

interface Props {
  orderId: string;
  orderNumber: string;
}

const statusLabel: Record<string, string> = {
  pending: "Kutilmoqda",
  in_progress: "Jarayonda",
  fulfilled: "Ta'minlandi",
};
const statusCls: Record<string, string> = {
  pending: "text-status-red border-status-red/30 bg-status-red/10",
  in_progress: "text-status-yellow border-status-yellow/30 bg-status-yellow/10",
  fulfilled: "text-status-green border-status-green/30 bg-status-green/10",
};

export default function OrderSupplyRequests({ orderId, orderNumber }: Props) {
  const { roles } = useAuth() as any;
  const primaryRole = (Array.isArray(roles) && roles[0]) || "";
  const { user, hasRole } = useAuth();
  const canAdd = !!user; // any authenticated user can create a purchase request
  const canDelete = hasRole(["supply", "admin", "warehouse"]);
  const [items, setItems] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState("");
  const [pname, setPname] = useState("");
  const [qty, setQty] = useState<number>(0);
  const [unit, setUnit] = useState("");
  const [date, setDate] = useState("");
  const [comment, setComment] = useState("");

  const load = async () => {
    const [{ data: reqs }, { data: prods }] = await Promise.all([
      supabase.from("order_supply_requests").select("*").eq("order_id", orderId).order("created_at"),
      supabase.from("products").select("id,name,unit").order("name"),
    ]);
    setItems(reqs ?? []);
    setProducts(prods ?? []);
  };
  useEffect(() => { load(); }, [orderId]);

  const handlePid = (id: string) => {
    setPid(id);
    const p = products.find((x) => x.id === id);
    if (p) { setPname(p.name); if (!unit) setUnit(p.unit ?? ""); }
  };

  const reset = () => { setPid(""); setPname(""); setQty(0); setUnit(""); setDate(""); setComment(""); };

  const add = async () => {
    const name = pname.trim();
    if (!name || !qty) { toast.error("Mahsulot va miqdorni kiriting"); return; }
    const { error } = await supabase.from("order_supply_requests").insert({
      order_id: orderId,
      product_id: pid || null,
      product_name: name,
      quantity: qty,
      unit: unit || null,
      required_date: date || null,
      comment: comment || null,
      created_by: user?.id ?? null,
      department: primaryRole || null,
      source: "order",
    } as any);
    if (error) { toast.error(error.message); return; }
    await notify({
      type: "info" as any,
      title: `Yangi ta'minot so'rovi — ${orderNumber}`,
      body: `${name} · ${qty} ${unit ?? ""}${date ? ` · kerak: ${date}` : ""}`,
      link: `/supply`,
      entity: "supply_request",
      sender_id: user?.id,
      sender_name: user?.email,
    });
    toast.success("Qo'shildi");
    reset();
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("O'chirilsinmi?")) return;
    const { error } = await supabase.from("order_supply_requests").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Kerakli mahsulotlar</CardTitle>
        {canAdd && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Qo'shish</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Ta'minot so'rovi qo'shish</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Mahsulot (omborda bor)</Label>
                  <ProductPicker products={products} value={pid} onChange={handlePid} placeholder="Tanlang yoki pastda yozing" />
                </div>
                <div>
                  <Label>Yoki mahsulot nomini yozing</Label>
                  <Input value={pname} onChange={(e) => setPname(e.target.value)} placeholder="Masalan: Kraska 201" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Miqdor</Label><NumberInput min={0.01} step={0.01} value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} /></div>
                  <div><Label>O'lchov</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, dona..." /></div>
                </div>
                <div>
                  <Label>Kerak bo'ladigan sana</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <Label>Izoh</Label>
                  <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
                </div>
                <Button className="w-full" onClick={add}><Plus className="h-4 w-4 mr-2" /> Qo'shish</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">So'rovlar yo'q</p>}
        {items.map((it) => (
          <div key={it.id} className="flex items-start justify-between gap-2 p-3 rounded border">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{it.product_name}</span>
                <Badge variant="outline" className={statusCls[it.status] ?? ""}>{statusLabel[it.status] ?? it.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                <span className="font-mono">{it.quantity} {it.unit ?? ""}</span>
                {it.required_date && <> · kerak: <span className="font-mono">{it.required_date}</span></>}
              </div>
              {it.comment && <div className="text-xs text-muted-foreground italic mt-1">"{it.comment}"</div>}
              {it.supply_comment && <div className="text-xs text-primary mt-1">Ta'minot: {it.supply_comment}</div>}
            </div>
            {canDelete && (
              <Button size="sm" variant="ghost" onClick={() => remove(it.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
