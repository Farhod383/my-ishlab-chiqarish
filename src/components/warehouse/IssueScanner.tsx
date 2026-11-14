import { useWarehouseText, useWarehouseError } from "@/i18n/warehouseContext";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScanBarcode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLocalize } from "@/i18n/context";
import { registerScanHandler } from "@/lib/scanChannel";
import { createIssueScanHandler } from "@/lib/issueScan";
import { normalizeScan, classifyScan } from "@/lib/scanCode";
import { uniqueCatalogScanRows } from "@/lib/productSearch";
import { logScan } from "@/lib/scanHistory";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { canEditBarcode } from "@/lib/manualBarcode";
import SearchableSelect from "@/components/SearchableSelect";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Row = { id: string; name: string; kind?: string; product_type_id?: string | null; unit?: string | null };
type Props = { kind: "product" | "instrument"; onEmployee: (id: string) => void; onProduct: (row: Row, scanId: string | null) => void };
export default function IssueScanner({ kind, onEmployee, onProduct }: Props) {
  const wt = useWarehouseText();
  const we = useWarehouseError();
  const localize = useLocalize();
  const { roles } = useAuth();
  const [missing, setMissing] = useState("");
  const [bindOpen, setBindOpen] = useState(false);
  const [choices, setChoices] = useState<Row[]>([]);
  const [bindId, setBindId] = useState("");
  const [code, setCode] = useState("");
  const [matches, setMatches] = useState<Row[]>([]);
  const scanId = useRef<string | null>(null);
  const busy = useRef(false);
  const scan = useRef<(raw: string) => void>(() => {});
  scan.current = async raw => {
    const normalized = normalizeScan(raw);
    if (!normalized || busy.current) return;
    busy.current = true; setMatches([]); setCode(""); setMissing("");
    try {
      const type = classifyScan(normalized);
      if (type === "employee") {
        const { data: found, error } = await supabase.rpc("resolve_employee_badge", { _code: normalized });
        if (error) throw error;
        const data = found?.[0];
        await logScan({ code: normalized, raw, module: "Chiqim", action: "out", kind: "employee", productName: data?.full_name ?? null, result: data?.status === "active" ? "found" : "not_found" });
        if (!data || data.status !== "active") { toast.error(we(("" + wt("Kod topilmadi:") + " " + (normalized) + ""))); return; }
        onEmployee(data.id); toast.success(("" + wt("Xodim:") + " " + (localize(data.full_name)) + "")); return;
      }
      // MCT dan tashqari HAR QANDAY kod tovar/instrument sifatida qidiriladi.
      // Unified catalog resolver includes instruments and retained aliases.
      const { data, error } = await supabase.rpc("scan_catalog", { _code: normalized });
      if (error) throw error;
      const rows: Row[] = uniqueCatalogScanRows(((data as unknown as Row[]) ?? []).filter(r => r.kind === kind));
      scanId.current = await logScan({ code: normalized, raw, module: kind === "instrument" ? "Instrument berish" : "Chiqim", action: "out", productId: rows.length === 1 ? rows[0].id : null, productName: rows.length === 1 ? rows[0].name : null, productTypeId: rows.length === 1 ? rows[0].product_type_id : null, kind: rows.length ? kind : null, result: rows.length ? "found" : "not_found" });
      if (rows.length === 1) { onProduct(rows[0], scanId.current); toast.success(("" + wt("Tovar:") + " " + (rows[0].name) + "")); }
      else if (rows.length > 1) setMatches(rows);
      else { setMissing(normalized); toast.error(we(("" + wt("Kod topilmadi:") + " " + (normalized) + ""))); }
    } catch (error) { toast.error(we(error instanceof Error ? error.message : wt("Skanerlashda xatolik"))); }
    finally { busy.current = false; }
  };
  useEffect(() => registerScanHandler(createIssueScanHandler((_code, raw) => scan.current(raw))), []);
  const openBinding = async () => {
    const { data, error } = kind === "product"
      ? await supabase.from("products").select("id,name,unit,product_type_id").is("instrument_id", null).is("archived_at", null)
      : await supabase.from("instruments").select("id,name,product_type_id");
    if (error) { toast.error(we(error.message)); return; }
    setChoices((data ?? []) as Row[]); setBindId(""); setBindOpen(true);
  };
  const bind = async () => {
    if (!bindId || !missing || busy.current) return;
    busy.current = true;
    try {
      const { data, error } = await supabase.rpc("bind_barcode_alias", { _code: missing, _product_id: bindId });
      if (error) throw error;
      const row = data as unknown as Row;
      setBindOpen(false); setMissing(""); onProduct(row, scanId.current); toast.success(("" + wt("Tovar:") + " " + (row.name) + ""));
    } catch (error) { toast.error(we((error as { message?: string }).message ?? wt("Biriktirishda xatolik"))); }
    finally { busy.current = false; }
  };
  return <div className="space-y-2">
    <div className="flex gap-2">
      <Input aria-label={wt("Xodim yoki tovar kodi")} placeholder={wt("Xodim / tovar kodi (ixtiyoriy)")} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); scan.current(code); } }} />
      <Button type="button" variant="outline" aria-label={wt("Kodni skanerlash")} title={wt("Kodni skanerlash")} disabled={!code.trim()} onClick={() => scan.current(code)}><ScanBarcode className="h-4 w-4" /></Button>
    </div>
    {missing && canEditBarcode(roles) && <Button type="button" variant="outline" onClick={() => void openBinding()}>{wt("Shu kodni tovarga biriktirish")}</Button>}
    <Dialog open={bindOpen} onOpenChange={setBindOpen}><DialogContent><DialogHeader><DialogTitle>{wt("Kodni tovarga biriktirish")}</DialogTitle></DialogHeader><p className="font-mono break-all">{missing}</p><SearchableSelect options={choices.map(row => ({ value: row.id, label: row.name }))} value={bindId} onChange={setBindId} searchPlaceholder={wt("Tovarni qidirish...")} /><Button type="button" disabled={!bindId} onClick={() => void bind()}>{wt("Biriktirish")}</Button></DialogContent></Dialog>
    {matches.length > 1 && <div className="divide-y border rounded-md max-h-40 overflow-auto">{matches.map(row => <Button type="button" key={row.id} variant="ghost" className="w-full justify-start whitespace-normal h-auto text-left" onClick={() => { onProduct(row, scanId.current); setMatches([]); toast.success(("" + wt("Tovar:") + " " + (row.name) + "")); }}>{row.name} · {row.unit}</Button>)}</div>}
  </div>;
}