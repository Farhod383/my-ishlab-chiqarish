import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Printer } from "lucide-react";
import { fmtDateTime24 } from "@/lib/format";

type Row = any;
const cur = (c: unknown) => (String(c ?? "UZS").toUpperCase() === "USD" ? "USD" : "UZS");

interface Props {
  reason: string | null;
  rows: Row[]; // this month's expenses with this reason
  month: string;
  onClose: () => void;
  ptLabel: (pt: unknown) => string;
  curLine: (m: Record<string, number>) => string;
  fmt: (n: number) => string;
}

export default function ReasonOpsDialog({ reason, rows, month, onClose, ptLabel, curLine, fmt }: Props) {
  const [detail, setDetail] = useState<Row | null>(null);
  const totals: Record<string, number> = {};
  for (const r of rows) totals[cur(r.currency)] = (totals[cur(r.currency)] || 0) + (Number(r.amount) || 0);
  const rate = (r: Row) => (cur(r.currency) === "USD" && Number(r.exchange_rate) > 1 ? fmt(Number(r.exchange_rate)) : "");

  const html = () => {
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(fmtDateTime24(r.expense_date))}</td><td>${esc(r.reason)}</td><td style="text-align:right">${esc(fmt(Number(r.amount) || 0))}</td><td>${cur(r.currency)}</td><td>${esc(rate(r))}</td><td>${esc(ptLabel(r.payment_type))}</td><td>${esc(r.comment)}</td></tr>`).join("");
    return `<html><head><meta charset="utf-8"><title>${esc(reason)} — ${esc(month)}</title><style>body{font-family:Arial,sans-serif;font-size:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px}th{background:#eee}@page{size:A4;margin:12mm}</style></head><body><h2>Kassa chiqimlari: ${esc(reason)}</h2><p>Oy: ${esc(month)} · Operatsiyalar: ${rows.length} ta · Jami: ${esc(curLine(totals))}</p><table><thead><tr><th>№</th><th>Sana va vaqt</th><th>Sabab</th><th>Summa</th><th>Valyuta</th><th>Kurs</th><th>To'lov turi</th><th>Izoh</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
  };
  const word = () => {
    const url = URL.createObjectURL(new Blob(["\ufeff" + html()], { type: "application/msword" }));
    const a = document.createElement("a"); a.href = url; a.download = `kassa-${reason}-${month}.doc`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const pdf = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(html()); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  return (
    <>
      <Dialog open={!!reason} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{reason} · {month}</DialogTitle></DialogHeader>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Operatsiyalar: <b>{rows.length} ta</b></span>
            <span>Jami: <b className="text-status-red font-mono">{curLine(totals)}</b></span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={pdf}><Printer className="h-4 w-4 mr-1" />PDF</Button>
              <Button variant="outline" size="sm" onClick={word}><FileText className="h-4 w-4 mr-1" />Word</Button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Sana va vaqt</TableHead><TableHead>Sabab</TableHead><TableHead className="text-right">Summa</TableHead>
                <TableHead>Valyuta</TableHead><TableHead>Kurs</TableHead><TableHead>To'lov turi</TableHead><TableHead>Izoh</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(r)}>
                    <TableCell className="whitespace-nowrap">{fmtDateTime24(r.expense_date)}</TableCell>
                    <TableCell>{r.reason}</TableCell>
                    <TableCell className="text-right font-mono text-status-red">{fmt(Number(r.amount) || 0)}</TableCell>
                    <TableCell>{cur(r.currency)}</TableCell>
                    <TableCell className="font-mono">{rate(r)}</TableCell>
                    <TableCell>{ptLabel(r.payment_type)}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{r.comment}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Chiqim tafsiloti</DialogTitle></DialogHeader>
          {detail && (
            <div className="grid grid-cols-[140px_1fr] gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Sana va vaqt:</span><span>{fmtDateTime24(detail.expense_date)}</span>
              <span className="text-muted-foreground">Sabab:</span><span>{detail.reason}</span>
              <span className="text-muted-foreground">Summa:</span><span className="font-mono">{fmt(Number(detail.amount) || 0)} {cur(detail.currency)}</span>
              {rate(detail) && <><span className="text-muted-foreground">Kurs:</span><span className="font-mono">{rate(detail)}</span></>}
              {Number(detail.total_uzs) > 0 && <><span className="text-muted-foreground">So'mdagi qiymati:</span><span className="font-mono">{fmt(Number(detail.total_uzs))} UZS</span></>}
              <span className="text-muted-foreground">To'lov turi:</span><span>{ptLabel(detail.payment_type)}</span>
              {(detail.recipient?.full_name || detail.recipient_name) && <><span className="text-muted-foreground">Oluvchi:</span><span>{detail.recipient?.full_name ?? detail.recipient_name}</span></>}
              {detail.comment && <><span className="text-muted-foreground">Izoh:</span><span>{detail.comment}</span></>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
