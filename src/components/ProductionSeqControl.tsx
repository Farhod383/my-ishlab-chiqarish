// Zakazni ishlab chiqarishga qo'yish tartibi (orders.production_seq, 0097). Marketing va admin qo'yadi.
import { useState } from "react";
import { toast } from "sonner";
import { ListOrdered } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { logAudit } from "@/types/erp";
import { currentUserName } from "@/lib/userNames";

export function ProductionSeqBadge({ seq, className = "" }: { seq: number | null | undefined; className?: string }) {
  if (!seq) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary tabular-nums ${className}`}
      title="Ishlab chiqarish tartibi">
      <ListOrdered className="h-3 w-3" />{seq}
    </span>
  );
}

export default function ProductionSeqControl({ order, onChanged }: {
  order: { id: string; order_number: string; status: string; production_seq?: number | null };
  onChanged: () => void;
}) {
  const { hasRole, user } = useAuth();
  const can = hasRole(["marketing", "admin"]) && order.status !== "completed" && order.status !== "cancelled";
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(String(order.production_seq ?? ""));
  const [busy, setBusy] = useState(false);
  const seq = order.production_seq ?? null;

  const save = async (next: number | null) => {
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("set_production_seq", { _order_id: order.id, _seq: next });
      if (error) throw new Error(error.message.replace(/^.*?ERROR:\s*/i, ""));
      await logAudit(supabase, {
        actor_id: user?.id, actor_name: currentUserName(user), action: "Ishlab chiqarish tartibi", entity: "order", order_id: order.id,
        details: `${order.order_number}: ${seq ?? "—"} → ${data ?? "—"}`,
      });
      toast.success(data ? `Ishlab chiqarish tartibi: ${data}` : "Tartibdan olib tashlandi");
      setOpen(false);
      onChanged();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  if (!can) {
    return seq ? <ProductionSeqBadge seq={seq} className="text-sm px-2 py-1" /> : null;
  }
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(String(seq ?? "")); }}>
      <PopoverTrigger asChild>
        <Button variant={seq ? "default" : "outline"}>
          <ListOrdered className="h-4 w-4 mr-2" />{seq ? `Tartib № ${seq}` : "Tartibga qo'yish"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <div>
          <div className="text-sm font-semibold">Ishlab chiqarish tartibi</div>
          <p className="text-xs text-muted-foreground">Raqam takrorlanmaydi: band raqam berilsa, o'sha va keyingi zakazlar bittaga suriladi. Zakaz tugasa — tartibdan o'zi chiqadi.</p>
        </div>
        <div className="flex gap-2">
          <Input id="production-seq" inputMode="numeric" autoFocus value={val} placeholder="1"
            onChange={(e) => setVal(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter" && Number(val) > 0) save(Number(val)); }} />
          <Button disabled={busy || !(Number(val) > 0)} onClick={() => save(Number(val))}>Saqlash</Button>
        </div>
        {seq && <Button variant="ghost" size="sm" className="w-full text-status-red" disabled={busy} onClick={() => save(null)}>Tartibdan olib tashlash</Button>}
      </PopoverContent>
    </Popover>
  );
}
