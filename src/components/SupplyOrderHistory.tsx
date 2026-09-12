import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSupplyHistory, type SupplyHistoryItem } from "@/lib/supplyHistory";
import { fmtDateTime24 } from "@/lib/format";
import { History, ArrowRight, Loader2 } from "lucide-react";

/** Per-order supply change timeline: what changed, from → to, by whom and when. */
export default function SupplyOrderHistory({ orderId, title = "O'zgarishlar tarixi" }: { orderId: string | null; title?: string }) {
  const [items, setItems] = useState<SupplyHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setItems(await fetchSupplyHistory(orderId));
    setLoading(false);
  };

  useEffect(() => { void load(); }, [orderId]);

  useEffect(() => {
    const ch = supabase
      .channel(`supply-history-${orderId ?? "general"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "entity_audit" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold mb-2">
        <History className="h-4 w-4" /> {title}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {!loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground">Hozircha o'zgarishlar yo'q</p>
      )}
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {items.map((h) => (
          <div key={h.id} className="rounded border bg-background px-2.5 py-1.5 text-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold">
                {h.product ? `${h.product} — ` : ""}{h.action}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{fmtDateTime24(h.at)}</span>
            </div>
            {h.changes.map((c, i) => (
              <div key={i} className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                <span className="text-muted-foreground">{c.label}:</span>
                <span className="font-mono line-through text-muted-foreground">{c.from}</span>
                <ArrowRight className="h-3 w-3 text-primary" />
                <span className="font-mono font-semibold text-primary">{c.to}</span>
              </div>
            ))}
            {h.detail && <div className="mt-0.5 text-[11px] text-muted-foreground">{h.detail}</div>}
            <div className="mt-0.5 text-[11px] text-muted-foreground">Kim: {h.actor}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
