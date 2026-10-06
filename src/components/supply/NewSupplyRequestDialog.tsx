import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SearchableSelect from "@/components/SearchableSelect";
import NumberInput from "@/components/NumberInput";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { logAudit } from "@/types/erp";
import { notify } from "@/lib/notify";

const UNITS = ["dona", "kg", "tonna", "metr", "litr", "rulon", "komplekt"];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialProductId?: string | null;
  initialMode?: "order" | "factory";
  source?: string;
  onCreated?: () => void;
};

/** The single place where supply (procurement) requests are created. */
export default function NewSupplyRequestDialog({ open, onOpenChange, initialProductId, initialMode = "factory", source = "supply", onCreated }: Props) {
  const { user, roles } = useAuth() as any;
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [mode, setMode] = useState<"order" | "factory">(initialMode);
  const [pid, setPid] = useState("");
  const [pname, setPname] = useState("");
  const [qty, setQty] = useState(0);
  const [unit, setUnit] = useState("dona");
  const [date, setDate] = useState("");
  const [comment, setComment] = useState("");
  const [orderId, setOrderId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode); setQty(0); setDate(""); setComment(""); setOrderId("");
    (async () => {
      const [p, o] = await Promise.all([
        supabase.from("products").select("id,name,unit,stock_qty").order("name"),
        supabase.from("orders").select("id,order_number,product_name").in("status", ["pending", "in_progress", "delayed"]).order("created_at", { ascending: false }),
      ]);
      const list = p.data ?? [];
      setProducts(list); setOrders(o.data ?? []);
      const pre = initialProductId ? list.find((x: any) => x.id === initialProductId) : null;
      setPid(pre?.id ?? ""); setPname(pre?.name ?? ""); setUnit(pre?.unit ?? "dona");
    })();
  }, [open, initialProductId, initialMode]);

  const selected = products.find((x) => x.id === pid);

  const submit = async () => {
    const name = pname.trim();
    if (!name || !qty) { toast.error("Mahsulot va miqdorni kiriting"); return; }
    if (mode === "order" && !orderId) { toast.error("Zakazni tanlang"); return; }
    setSaving(true);
    const { error } = await supabase.from("order_supply_requests").insert({
      order_id: mode === "order" ? orderId : null,
      product_id: pid || null,
      product_name: name,
      quantity: qty,
      unit: selected?.unit || unit || null,
      required_date: date || null,
      comment: comment || null,
      created_by: user?.id ?? null,
      department: ((roles as string[]) ?? [])[0] || null,
      source,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const u = selected?.unit || unit;
    await notify({
      type: "supply_request",
      title: `Yangi ta'minot so'rovi${mode === "order" ? "" : " (zavod uchun)"}`,
      body: `${name} · ${qty} ${u}${date ? ` · kerak: ${date}` : ""}`,
      link: mode === "order" ? `/orders/${orderId}` : `/supply`,
      entity: "supply_request",
      recipient_role: ["supply", "warehouse"],
      sender_id: user?.id, sender_name: user?.email,
    });
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: mode === "order" ? "Zakaz uchun buyurtma berildi" : "Zavod uchun buyurtma berildi",
      entity: "supply_request", order_id: mode === "order" ? orderId : null,
      details: `${name} · ${qty} ${u}`,
    });
    toast.success("Buyurtma Ta'minotga yuborildi");
    onOpenChange(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yangi buyurtma</DialogTitle>
          <DialogDescription>Ta'minot buyurtmasi</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={mode === "factory" ? "default" : "outline"} onClick={() => setMode("factory")}>Zavod uchun</Button>
            <Button type="button" variant={mode === "order" ? "default" : "outline"} onClick={() => setMode("order")}>Zakaz uchun</Button>
          </div>
          <div>
            <Label>Mahsulot</Label>
            <SearchableSelect
              value={pid}
              onChange={(v) => { setPid(v); const p = products.find((x) => x.id === v); if (p) { setPname(p.name); if (p.unit) setUnit(p.unit); } }}
              placeholder="Tanlang yoki pastda yozing"
              options={products.map((p) => ({ value: p.id, label: p.name, hint: `${p.stock_qty} ${p.unit}` }))}
            />
          </div>
          {!pid && (
            <div>
              <Label>Yoki yangi mahsulot nomi *</Label>
              <Input value={pname} onChange={(e) => setPname(e.target.value)} placeholder="Masalan: Kraska 201" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Miqdor *</Label><NumberInput min={0.01} step={0.01} value={qty || ""} onChange={(e) => setQty(Number(e.target.value))} /></div>
            <div>
              <Label>O'lchov {selected?.unit && <span className="text-xs text-muted-foreground">(mahsulot profilidan)</span>}</Label>
              <Select value={selected?.unit || unit} onValueChange={setUnit} disabled={!!selected?.unit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from(new Set([...UNITS, selected?.unit || unit])).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Kerak bo'ladigan sana</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          {mode === "order" && (
            <div>
              <Label>Zakaz *</Label>
              <SearchableSelect value={orderId} onChange={setOrderId} placeholder="Zakaz tanlang..."
                options={orders.map((o) => ({ value: o.id, label: o.product_name, hint: o.order_number }))} />
            </div>
          )}
          <div><Label>Izoh</Label><Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
          <Button className="w-full" onClick={submit} disabled={saving}><Plus className="h-4 w-4 mr-2" />Yuborish</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
