import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Package, AlertTriangle } from "lucide-react";
import { useI18n, useLocalize } from "@/i18n/context";
import { fmtNum } from "@/lib/format";
import { getStockStatus, stockStatusMeta, StockDot, type StockStatus } from "@/lib/stockStatus";

export default function LowStockPage() {
  const { t } = useI18n();
  const localize = useLocalize();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | StockStatus>("all");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("products").select("*");
      // Only include yellow + red (not enough)
      setItems((data ?? []).filter((p: any) => getStockStatus(p.stock_qty, p.min_limit) !== "green"));
      setLoading(false);
    })();
  }, []);

  const counts = useMemo(() => ({
    yellow: items.filter(p => getStockStatus(p.stock_qty, p.min_limit) === "yellow").length,
    red: items.filter(p => getStockStatus(p.stock_qty, p.min_limit) === "red").length,
  }), [items]);

  const filtered = filter === "all" ? items : items.filter(p => getStockStatus(p.stock_qty, p.min_limit) === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-status-red" />
          {t.dashboard.lowStock}
        </h1>
        <p className="text-sm text-muted-foreground">{t.dashboard.lowStockHint}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(["yellow", "red"] as StockStatus[]).map(s => {
          const meta = stockStatusMeta[s];
          const active = filter === s;
          return (
            <button key={s} type="button" onClick={() => setFilter(active ? "all" : s)}
              className={`text-left rounded-lg border p-4 transition-all hover:shadow-md ${meta.border} ${meta.bg} ${active ? "ring-2 ring-offset-1 " + meta.ring : ""}`}>
              <div className="flex items-center gap-2">
                <span className={`inline-block h-3 w-3 rounded-full ${meta.dot}`} />
                <div className="text-sm font-medium">{s === "yellow" ? "Kam qolgan" : "Tugagan"}</div>
              </div>
              <div className={`text-3xl font-bold font-mono mt-2 ${meta.text}`}>{s === "yellow" ? counts.yellow : counts.red}</div>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-status-red" />
            {filtered.length} {t.common.pieces}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-muted-foreground py-6 text-center">{t.common.loading}</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-6 text-center">{t.dashboard.enough} ✓</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {!loading && filtered.map((p) => {
              const status = getStockStatus(p.stock_qty, p.min_limit);
              const meta = stockStatusMeta[status];
              const need = Math.max(Number(p.min_limit) - Number(p.stock_qty), 1);
              return (
                <Link
                  key={p.id}
                  to={`/warehouse?product=${p.id}`}
                  className={`rounded-xl border-2 bg-background p-3 space-y-2 transition-all hover:shadow-md hover:-translate-y-0.5 ${meta.border}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-sm flex items-center gap-2 min-w-0">
                      <StockDot status={status} />
                      <span className="truncate">{localize(p.name)}</span>
                    </span>
                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.bg} ${meta.border} ${meta.text}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <div className="text-muted-foreground">Qoldiq</div>
                      <div className={`font-mono font-bold text-sm ${meta.text}`}>{fmtNum(p.stock_qty)} {p.unit}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Min. limit</div>
                      <div className="font-mono font-semibold text-sm">{fmtNum(p.min_limit)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Kerak</div>
                      <div className="font-mono font-bold text-sm text-primary">{fmtNum(need)} {p.unit}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
