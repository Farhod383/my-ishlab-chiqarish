import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { useI18n } from "@/i18n/context";
import { ClipboardList } from "lucide-react";

export default function NachalnikPage() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("orders")
      .select("*, client:clients(name), stages:order_stages(*)")
      .neq("status", "completed")
      .neq("status", "cancelled")
      .order("queue_position");
    setOrders(((data as any) ?? []).map((o: any) => ({
      ...o,
      stages: (o.stages ?? []).sort((a: any, b: any) => a.stage_order - b.stage_order),
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{(t as any).nachalnik?.title ?? "Nachalnik paneli"}</h1>
        <p className="text-sm text-muted-foreground">{(t as any).nachalnik?.subtitle ?? "Bosqichlarga ishchi tayinlash, muddat belgilash va smena topshirish"}</p>
      </div>

      {loading && <p className="text-muted-foreground">{t.common.loading}</p>}

      <div className="grid gap-3">
        {orders.map((o) => (
          <Card key={o.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link to={`/orders/${o.id}`} className="hover:underline">{o.order_number}</Link>
                <span className="text-sm text-muted-foreground">· {o.product_name}</span>
                <PriorityBadge priority={o.priority} />
                <StatusBadge status={o.status as any} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-3">
                {o.client?.name ?? "—"} · {o.quantity} {t.common.pieces} · {t.dashboard.deadline}: {o.deadline}
              </div>
              <div className="space-y-1.5">
                {o.stages.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 text-sm border rounded-md px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground w-5">#{s.stage_order}</span>
                      <span className="font-medium truncate">{s.name}</span>
                      {s.worker_name && <span className="text-xs text-muted-foreground">— {s.worker_name}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                      {s.planned_start && <span>{s.planned_start} → {s.planned_end ?? "?"}</span>}
                      <StatusBadge status={s.status as any} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs">
                <Link to={`/orders/${o.id}`} className="text-primary hover:underline">
                  {(t as any).nachalnik?.manage ?? "Boshqarish →"}
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && orders.length === 0 && (
          <Card><CardContent className="py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
            <ClipboardList className="h-8 w-8 opacity-40" />
            {(t as any).nachalnik?.empty ?? "Faol zakazlar yo'q"}
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
