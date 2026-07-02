import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, AlertTriangle } from "lucide-react";
import { useI18n, useLocalize } from "@/i18n/context";
import { fmtNum } from "@/lib/format";

export default function LowStockPage() {
  const { t } = useI18n();
  const localize = useLocalize();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("products").select("*");
      setItems((data ?? []).filter((p: any) => Number(p.stock_qty) <= Number(p.min_limit)));
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-status-red" />
          {t.dashboard.lowStock}
        </h1>
        <p className="text-sm text-muted-foreground">{t.dashboard.lowStockHint}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-status-red" />
            {items.length} {t.common.pieces}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">№</TableHead>
                  <TableHead>{t.orders.cols.product}</TableHead>
                  <TableHead>Joylashuv</TableHead>
                  <TableHead className="text-right">Qoldiq</TableHead>
                  <TableHead className="text-right">Min. limit</TableHead>
                  <TableHead>Birlik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>
                )}
                {!loading && items.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t.dashboard.enough} ✓</TableCell></TableRow>
                )}
                {!loading && items.map((p, i) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => (window.location.href = `/warehouse?product=${p.id}`)}>
                    <TableCell className="text-right text-xs font-mono text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/warehouse?product=${p.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {localize(p.name)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.location || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-status-red font-semibold">{fmtNum(p.stock_qty)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtNum(p.min_limit)}</TableCell>
                    <TableCell className="text-xs">{p.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
