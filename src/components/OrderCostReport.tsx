import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n/context";
import { FileText, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/format";

interface Props {
  orderId: string;
  orderNumber: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}

export function OrderCostReport({ orderId, orderNumber, trigger, open, onOpenChange }: Props) {
  const { t } = useI18n();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = (v: boolean) => { isControlled ? onOpenChange?.(v) : setInternalOpen(v); };

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("stock_movements")
        .select("*, product:products(name, last_price, unit)")
        .eq("order_id", orderId)
        .eq("direction", "out")
        .order("created_at");
      const mapped = (data ?? []).map((m: any) => {
        const price = Number(m.unit_price) > 0 ? Number(m.unit_price) : Number(m.product?.last_price ?? 0);
        return {
          id: m.id, name: m.product?.name ?? "—", unit: m.product?.unit ?? "",
          qty: Number(m.quantity), price, total: price * Number(m.quantity),
          date: m.created_at,
        };
      });
      setRows(mapped);
      setLoading(false);
    })();
  }, [isOpen, orderId]);

  const total = rows.reduce((s, r) => s + r.total, 0);
  const fmt = (n: number) => fmtNum(n);

  const exportDocx = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-order-docx`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${orderNumber}-hisobot.docx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(t.common.download);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />{t.report.title} — {orderNumber}</DialogTitle>
          <DialogDescription>{t.report.materials}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : (
          <>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.report.materials}</TableHead>
                      <TableHead className="text-right">{t.report.qty}</TableHead>
                      <TableHead className="text-right">{t.report.price}</TableHead>
                      <TableHead className="text-right">{t.report.total}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">{t.report.noMovements}</TableCell></TableRow>}
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right font-mono">{r.qty} {r.unit}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(r.price)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmt(r.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-md p-4">
              <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t.report.totalCost}</div>
              <div className="text-2xl font-bold font-mono text-primary">{fmt(total)} so'm</div>
            </div>

            <div className="flex justify-end">
              <Button onClick={exportDocx} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                {t.report.exportDocx}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
