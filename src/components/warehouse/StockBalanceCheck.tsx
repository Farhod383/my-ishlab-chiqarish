import { useWarehouseText } from "@/i18n/warehouseContext";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck } from "lucide-react";
import { fmtNum } from "@/lib/format";

interface DiffRow { product_id: string; name: string; unit: string | null; stock_qty: number; history_qty: number; diff: number }

/** Qoldiqni harakatlar tarixi (kirim − chiqim ± sverka) bilan solishtiradi. Faqat o'qiydi, hech narsani o'zgartirmaydi. */
export default function StockBalanceCheck() {
  const wt = useWarehouseText();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<DiffRow[] | null>(null);

  const run = async () => {
    setOpen(true); setBusy(true); setRows(null);
    const { data, error } = await supabase.rpc("stock_balance_check");
    setRows(error ? [] : ((data as unknown as DiffRow[]) ?? []));
    setBusy(false);
  };

  return (
    <>
      <Button variant="outline" onClick={run}><ShieldCheck className="h-4 w-4 mr-2" />{wt("Tarix bo'yicha tekshirish")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{wt("Qoldiq ↔ harakatlar tarixi tekshiruvi")}</DialogTitle></DialogHeader>
          {busy && <p className="text-sm text-muted-foreground py-6 text-center">{wt("Tekshirilmoqda...")}</p>}
          {!busy && rows !== null && rows.length === 0 && (
            <p className="text-sm py-6 text-center text-status-green font-medium">{wt("Barcha qoldiqlar harakatlar tarixi bilan mos. Farq topilmadi.")}</p>
          )}
          {!busy && rows !== null && rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{rows.length} ta mahsulotda qoldiq tarix yig'indisidan farq qiladi (boshlang'ich qoldiq tarixsiz kiritilgan bo'lishi mumkin):</p>
              <div className="border rounded-md max-h-[50vh] overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{wt("Mahsulot")}</TableHead>
                    <TableHead className="text-right">{wt("Joriy qoldiq")}</TableHead>
                    <TableHead className="text-right">{wt("Tarix yig'indisi")}</TableHead>
                    <TableHead className="text-right">{wt("Farq")}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {rows.map(r => (
                      <TableRow key={r.product_id}>
                        <TableCell className="max-w-[240px] truncate" title={r.name}>{r.name}{r.unit ? ` (${r.unit})` : ""}</TableCell>
                        <TableCell className="text-right font-mono">{fmtNum(r.stock_qty)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtNum(r.history_qty)}</TableCell>
                        <TableCell className={`text-right font-mono font-semibold ${r.diff > 0 ? "text-status-green" : "text-status-red"}`}>{r.diff > 0 ? "+" : ""}{fmtNum(r.diff)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
