import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">№</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead>{t.orders.cols.product}</TableHead>
                  <TableHead>Joylashuv</TableHead>
                  <TableHead className="text-right">Qoldiq</TableHead>
                  <TableHead className="text-right">Min. limit</TableHead>
                  <TableHead>Birlik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t.dashboard.enough} ✓</TableCell></TableRow>
                )}
                {!loading && filtered.map((p, i) => {
                  const status = getStockStatus(p.stock_qty, p.min_limit);
                  const meta = stockStatusMeta[status];
                  return (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => (window.location.href = `/warehouse?product=${p.id}`)}>
                      <TableCell className="text-right text-xs font-mono text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.bg} ${meta.border} ${meta.text}`}>
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <StockDot status={status} />
                          <Link to={`/warehouse?product=${p.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                            {localize(p.name)}
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.location || "—"}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${meta.text}`}>{fmtNum(p.stock_qty)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum(p.min_limit)}</TableCell>
                      <TableCell className="text-xs">{p.unit}</TableCell>
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
