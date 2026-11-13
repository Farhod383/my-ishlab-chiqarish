import { useWarehouseText } from "@/i18n/warehouseContext";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw } from "lucide-react";
import { fmtDateTime24, fmtNum } from "@/lib/format";
import { EMPTY_SCAN_FILTERS, matchesScanFilters, scanActionLabel, scanResultLabel, SCAN_MODULES, type ScanFilters, type ScanHistoryRow } from "@/lib/scanHistory";

const PAGE = 200;

export default function ScanHistoryTab() {
  const wt = useWarehouseText();
  const [rows, setRows] = useState<ScanHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState<ScanFilters>(EMPTY_SCAN_FILTERS);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("scan_history")
      .select("*")
      .order("scanned_at", { ascending: false })
      .limit(1000);
    if (!error) setRows((data as unknown as ScanHistoryRow[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const users = useMemo(() => Array.from(new Set(rows.map(r => r.scanned_by_name).filter(Boolean) as string[])).sort(), [rows]);
  const modules = useMemo(() => Array.from(new Set([...SCAN_MODULES, ...rows.map(r => r.module)])).sort(), [rows]);
  const filtered = useMemo(() => rows.filter(r => matchesScanFilters(r, f)), [rows, f]);
  const shown = filtered.slice(0, PAGE);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" aria-label={wt("Dan")} value={f.from} onChange={e => setF({ ...f, from: e.target.value })} className="w-[150px]" />
          <Input type="date" aria-label={wt("Gacha")} value={f.to} onChange={e => setF({ ...f, to: e.target.value })} className="w-[150px]" />
          <Input placeholder={wt("Mahsulot nomi")} value={f.product} onChange={e => setF({ ...f, product: e.target.value })} className="w-[180px]" />
          <Input placeholder={wt("Shtrix-kod")} value={f.code} onChange={e => setF({ ...f, code: e.target.value })} className="w-[160px]" />
          <Select value={f.user} onValueChange={v => setF({ ...f, user: v })}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder={wt("Foydalanuvchi")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{wt("Barcha foydalanuvchilar")}</SelectItem>
              {users.map(u => <SelectItem key={u} value={u}>{wt(u)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={f.module} onValueChange={v => setF({ ...f, module: v })}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder={wt("Modul")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{wt("Barcha modullar")}</SelectItem>
              {modules.map(m => <SelectItem key={m} value={m}>{wt(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={f.action} onValueChange={v => setF({ ...f, action: v })}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder={wt("Amal turi")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{wt("Barcha amallar")}</SelectItem>
              <SelectItem value="in">{wt("Kirim")}</SelectItem>
              <SelectItem value="out">{wt("Chiqim")}</SelectItem>
              <SelectItem value="search">{wt("Faqat qidirish")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={f.result} onValueChange={v => setF({ ...f, result: v })}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder={wt("Natija")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{wt("Barcha natijalar")}</SelectItem>
              <SelectItem value="found">{wt("Topildi")}</SelectItem>
              <SelectItem value="not_found">{wt("Topilmadi")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label={wt("Yangilash")}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{filtered.length} ta skanerlash{filtered.length > PAGE ? ` (birinchilari ${PAGE} ta ko'rsatildi)` : ""}</p>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{wt("Sana va vaqt")}</TableHead>
              <TableHead>{wt("Mahsulot")}</TableHead>
              <TableHead>{wt("Xom kod (raw)")}</TableHead>
              <TableHead>{wt("Tozalangan kod")}</TableHead>
              <TableHead>{wt("Modul")}</TableHead>
              <TableHead>{wt("Amal")}</TableHead>
              <TableHead>{wt("Natija")}</TableHead>
              <TableHead className="text-right">{wt("Miqdor")}</TableHead>
              <TableHead className="text-right">{wt("Qoldiq")}</TableHead>
              <TableHead>{wt("Foydalanuvchi")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {shown.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-8 text-sm text-muted-foreground">{wt("Skanerlashlar topilmadi")}</TableCell></TableRow>}
              {shown.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{fmtDateTime24(r.scanned_at)}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={r.product_name ?? ""}>{r.product_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs whitespace-pre-wrap">{r.raw_code ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell>{wt(r.module)}</TableCell>
                  <TableCell>{wt(scanActionLabel(r.action))}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.result === "found" ? "bg-status-green/15 text-status-green" : "bg-status-red/15 text-status-red"}`}>
                      {wt(scanResultLabel(r.result))}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.quantity != null ? fmtNum(r.quantity) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.stock_after != null ? fmtNum(r.stock_after) : "—"}</TableCell>
                  <TableCell>{r.scanned_by_name ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
