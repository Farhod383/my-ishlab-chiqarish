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
import DateInput from "@/components/DateInput";
import { fmtDate } from "@/lib/format";
import { supplyRequestDates } from "@/lib/supplyRequestDates";
import { useAuth } from "@/auth/AuthContext";
import { toast } from "sonner";
import { notify } from "@/lib/notify";
import { logAudit } from "@/types/erp";
import {
  normalizeSupplyStatus,
  supplyStatusLabel as statusLabel,
  supplyStatusCls as statusCls,
  supplyStatusTextCls as textCls,
} from "@/lib/supplyStatus";
import { useNotifications, notifOrderId } from "@/notifications/NotificationsContext";
import { resolveModule } from "@/lib/notifModules";
import SupplyOrderHistory from "@/components/SupplyOrderHistory";
import { logSupplyChange } from "@/lib/supplyHistory";
import { currentUserName } from "@/lib/userNames";

interface Props {
  orderId: string;
  orderNumber: string;
}

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

  // Shu zakazga tegishli ta'minot bildirishnomalari (umumiy mexanizmdan foydalanadi).
  const { items: notifItems, markRead } = useNotifications();
  const supplyNotifs = notifItems
    .filter((n) => notifOrderId(n) === orderId && resolveModule(n) === "supply")
    .slice(0, 20);
  const unreadNotifs = supplyNotifs.filter((n) => !n.read_at);

  // Zakaz ochilganda shu zakazning ta'minot bildirishnomalari o'qilgan deb belgilanadi.
  useEffect(() => {
    if (!unreadNotifs.length) return;
    const t = window.setTimeout(() => { unreadNotifs.forEach((n) => { void markRead(n); }); }, 1200);
    return () => window.clearTimeout(t);
  }, [unreadNotifs.map((n) => n.id).join(",")]);


  const load = async () => {
    const [{ data: reqs }, { data: prods }] = await Promise.all([
      supabase.from("order_supply_requests").select("*").eq("order_id", orderId).order("created_at"),
      supabase.from("products").select("id,name,unit").is("instrument_id", null).order("name"),
    ]);
    const sorted = (reqs ?? []).slice().sort((a: any, b: any) => {
      const sa = a.status === "fulfilled" ? 1 : 0;
      const sb = b.status === "fulfilled" ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });
    setItems(sorted);
    setProducts(prods ?? []);
  };
  useEffect(() => { load(); }, [orderId]);

  useEffect(() => {
    const ch = supabase
      .channel(`order-supply-${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_supply_requests", filter: `order_id=eq.${orderId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);

  const handlePid = (id: string) => {
    setPid(id);
    const p = products.find((x) => x.id === id);
    if (p) { setPname(p.name); if (!unit) setUnit(p.unit ?? ""); }
  };

  const reset = () => { setPid(""); setPname(""); setQty(0); setUnit(""); setDate(""); setComment(""); };

  const add = async () => {
    const name = pname.trim();
    if (!name || !qty) { toast.error("Mahsulot va miqdorni kiriting"); return; }
    const { data: _ins, error } = await supabase.from("order_supply_requests").insert({
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
    } as any).select("id").single();
    if (error) { toast.error(error.message); return; }
    await notify({
      type: "supply_request",
      title: `Yangi ta'minot so'rovi — ${orderNumber}`,
      body: `${name} · ${qty} ${unit ?? ""}${date ? ` · Muddat: ${fmtDate(date)}` : ""}`,
      link: `/orders/${orderId}`,
      entity: "supply_request", entity_id: (_ins as any)?.id,
      recipient_role: ["supply", "warehouse"],
      sender_id: user?.id,
      sender_name: currentUserName(user),
    });
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: currentUserName(user),
      action: "Ta'minot so'rovi qo'shildi", entity: "supply_request",
      order_id: orderId,
      details: `${name} · ${qty} ${unit ?? ""}`,
    });
    await logSupplyChange({
      requestId: crypto.randomUUID(),
      orderId,
      productName: name,
      action: "Yangi ta'minot so'rovi qo'shildi",
      before: { quantity: "—" },
      after: { quantity: `${qty} ${unit ?? ""}`.trim() },
      actorId: user?.id, actorName: currentUserName(user), role: primaryRole || null,
    });
    toast.success("Qo'shildi");

    reset();
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("O'chirilsinmi?")) return;
    const target = items.find((x) => x.id === id);
    const { error } = await supabase.from("order_supply_requests").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: currentUserName(user),
      action: "Ta'minot so'rovi o'chirildi", entity: "supply_request",
      order_id: orderId,
      details: `${target?.product_name ?? id} · ${target?.quantity ?? ""} ${target?.unit ?? ""}`,
    });
    await logSupplyChange({
      requestId: id,
      orderId,
      productName: target?.product_name ?? null,
      action: "Ta'minot so'rovi o'chirildi",
      before: { quantity: `${target?.quantity ?? ""} ${target?.unit ?? ""}`.trim() },
      after: { quantity: "—" },
      actorId: user?.id, actorName: currentUserName(user), role: primaryRole || null,
    });
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Package className="h-4 w-4" /> Kerakli mahsulotlar
          {unreadNotifs.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-status-red px-1.5 text-[11px] font-bold leading-none text-status-red-foreground">
              {unreadNotifs.length}
            </span>
          )}
        </CardTitle>
        {canAdd && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 px-2 text-xs"><Plus className="h-3.5 w-3.5 mr-1" /> Qo'shish</Button>
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
                  <Label>Muddat</Label>
                  <DateInput value={date} onChange={setDate} />
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
      <CardContent className="space-y-1.5 px-3 pb-3">
        {items.length === 0 && <p className="text-sm text-muted-foreground">So'rovlar yo'q</p>}
        {items.map((it) => {
          const st = normalizeSupplyStatus(it.status);
          const dates = supplyRequestDates({ ...it, status: st });
          const late = st === "pending" && !!it.required_date && new Date() > new Date(`${it.required_date}T23:59:59`);
          return (
          <div key={it.id} data-focus-id={it.id} data-focus-at={it.created_at} data-focus-entity="supply_request" className="flex items-center justify-between gap-3 p-4 rounded-md border bg-card">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-lg break-words">{it.product_name}</span>
                <Badge variant="outline" className={`px-3 py-1 text-base font-extrabold border-2 ${statusCls[st]}`}>{statusLabel[st]}</Badge>
              </div>
              <div className="text-base font-semibold leading-relaxed mt-1">
                <span className="font-mono font-bold">{it.quantity} {it.unit ?? ""}</span>
                {it.required_date && <> · Muddat: <span className={`font-mono font-bold ${late ? textCls.pending : ""}`}>{dates.deadline}</span></>}
                <div>Berilgan: <span className="font-mono font-bold">{dates.given}</span>{st === "fulfilled" && <> · <span className={textCls.fulfilled}>Ta'minlandi: <span className="font-mono font-bold">{dates.fulfilled}</span></span></>}</div>
              </div>
              {it.comment && <div className="text-sm break-words">"{it.comment}"</div>}
              {it.supply_comment && <div className="text-sm font-semibold break-words">Ta'minot: {it.supply_comment}</div>}
            </div>
            {canDelete && (
              <Button size="sm" variant="outline" className="h-9 w-9 p-0 text-destructive shrink-0" onClick={() => remove(it.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          );
        })}

        <div className="pt-2 mt-2 border-t">
          <SupplyOrderHistory orderId={orderId} title="Ta'minot o'zgarishlari tarixi" />
        </div>

      </CardContent>
    </Card>
  );
}
