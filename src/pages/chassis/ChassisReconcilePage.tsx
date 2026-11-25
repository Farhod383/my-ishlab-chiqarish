import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChassisHeader } from "@/components/chassis/ChassisUI";
import { useActs } from "./ChassisActsPage";
import { useChassisText } from "@/i18n/chassis";
import { readXlsxRows } from "@/lib/xlsxRead";
import { parseDidox, reconcile, type DidoxEsf, type IssueKind } from "@/lib/chassisReconcile";
import { fmtSum } from "@/lib/chassis";
import { cn } from "@/lib/utils";

const KIND: Record<IssueKind, { label: string; cls: string }> = {
  esf_without_act: { label: "ESF bor, akt yo'q", cls: "bg-status-red/10 text-status-red border-status-red/30" },
  amount_mismatch: { label: "Summa mos emas", cls: "bg-status-yellow/15 text-status-yellow border-status-yellow/30" },
  act_esf_not_signed: { label: "Aktdagi ESF imzolanmagan", cls: "bg-status-yellow/15 text-status-yellow border-status-yellow/30" },
  shipped_without_esf: { label: "Jo'natilgan, ESF'siz", cls: "bg-status-red/10 text-status-red border-status-red/30" },
};

export default function ChassisReconcilePage() {
  const tr = useChassisText();
  const acts = useActs();
  const [from, setFrom] = useState(() => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 8) + "01");
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const parsed = useMemo(() => {
    if (!file) return null;
    try { return parseDidox(file.rows, from); } catch (e: any) { return { error: e.message as string }; }
  }, [file, from]);
  const result = useMemo(() => parsed && !("error" in parsed) ? reconcile(parsed.esfs as DidoxEsf[], (acts.data ?? []).map((a) => ({ ...a, client_name: a.client?.name ?? "" }))) : null, [parsed, acts.data]);
  const count = (k: IssueKind) => result?.issues.filter((i) => i.kind === k).length ?? 0;

  const load = async (f: File | undefined) => {
    if (!f) return;
    try { setFile({ name: f.name, rows: await readXlsxRows(f) }); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <ChassisHeader title="Didox bilan solishtirish" hint="Didox → «Отправленные документы» Excel'ini yuklang. Faqat «Исх», «Счет-фактура», «Подписан» qatorlari olinadi." />
      <Card><CardContent className="pt-5 grid gap-4 sm:grid-cols-[1fr_auto] items-end">
        <label htmlFor="didox-file" className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-6 text-sm text-muted-foreground cursor-pointer hover:bg-muted/50">
          <Upload className="h-5 w-5" />
          {file ? <><b className="text-foreground">{file.name}</b>{parsed && !("error" in parsed) && <span>{parsed.read} {tr("qator o'qildi")} · {parsed.esfs.length} {tr("ta imzolangan ESF")}</span>}</> : tr("Excel faylni tanlang (.xlsx)")}
          <input id="didox-file" type="file" accept=".xlsx" hidden onChange={(e) => load(e.target.files?.[0])} />
        </label>
        <div className="space-y-1.5"><Label htmlFor="didox-from">{tr("Shu sanadan")}</Label><Input id="didox-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      </CardContent></Card>

      {parsed && "error" in parsed && <p className="text-sm text-status-red">{parsed.error}</p>}
      {result && <>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat v={result.matched} k={tr("Mos keldi")} cls="text-status-green" />
          {(Object.keys(KIND) as IssueKind[]).map((k) => <Stat key={k} v={count(k)} k={tr(KIND[k].label)} cls={count(k) ? "text-status-red" : "text-muted-foreground"} />)}
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{tr("Muammo")}</TableHead><TableHead>{tr("Akt")}</TableHead><TableHead>ESF</TableHead><TableHead>{tr("Buyurtmachi")}</TableHead>
              <TableHead className="text-right">{tr("Aktda")}</TableHead><TableHead className="text-right">{tr("Didox'da")}</TableHead><TableHead className="text-right">{tr("Farq")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {result.issues.map((i, n) => <TableRow key={n}>
                <TableCell><span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", KIND[i.kind].cls)}>{tr(KIND[i.kind].label)}</span></TableCell>
                <TableCell>{i.act_id ? <Link className="text-primary underline" to={`/chassis/acts?act=${i.act_id}`}>{i.act_no}</Link> : "—"}</TableCell>
                <TableCell>{i.esf_number ?? "—"}</TableCell>
                <TableCell>{i.buyer}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtSum(i.act_amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtSum(i.didox_amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{i.act_amount != null && i.didox_amount != null ? fmtSum(i.didox_amount - i.act_amount) : "—"}</TableCell>
              </TableRow>)}
              {result.issues.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">{tr("Farq topilmadi")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {parsed && !("error" in parsed) && parsed.zeroSkipped > 0 && <p className="text-xs text-muted-foreground">{tr("Nol summali tuzatish ESF'lari hisobga olinmadi")}: {parsed.zeroSkipped}</p>}
      </>}
    </div>
  );
}

function Stat({ v, k, cls }: { v: number; k: string; cls: string }) {
  return <div className="rounded-lg border bg-card p-3"><div className={cn("text-2xl font-bold tabular-nums", cls)}>{v}</div><div className="text-xs text-muted-foreground">{k}</div></div>;
}
