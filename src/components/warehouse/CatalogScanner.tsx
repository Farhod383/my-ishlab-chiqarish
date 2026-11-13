import { useWarehouseText } from "@/i18n/warehouseContext";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScanBarcode, Link2 } from "lucide-react";
import { toast } from "sonner";
import { uniqueCatalogScanRows, type SearchProduct } from "@/lib/productSearch";
import { normalizeScan, classifyScan } from "@/lib/scanCode";
import { createIssueScanHandler } from "@/lib/issueScan";
import { registerScanHandler } from "@/lib/scanChannel";
import { logScan, type ScanAction } from "@/lib/scanHistory";
import { useAuth } from "@/auth/AuthContext";
import { canEditBarcode } from "@/lib/manualBarcode";
import SearchableSelect from "@/components/SearchableSelect";

interface ScanRow { kind: "product" | "instrument"; id: string; product_type_id: string | null; name: string; unit: string | null; stock_qty: number | null; last_price: number | null; currency: string | null; mxik_code: string | null; barcode: string | null }
interface Props { products: SearchProduct[]; onSelect: (p: any, scanId?: string | null) => void; module: string; action?: ScanAction }

// Skaner klaviaturadan farqli ravishda belgilarni bir-biriga juda tez (≤50 ms) yozadi,
// oxirida Enter yoki Tab yuboradi; kodi kamida 4 belgi.

export default function CatalogScanner({ products, onSelect, module, action = "search" }: Props) {
  const wt = useWarehouseText();
  const { roles } = useAuth();
  const [code, setCode] = useState("");
  const [matches, setMatches] = useState<any[]>([]);
  const [missing, setMissing] = useState("");
  const [bindOpen, setBindOpen] = useState(false);
  const [bindId, setBindId] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanIdRef = useRef<string | null>(null);
  const callback = useRef<(value: string) => void>(() => {});
  callback.current = async (raw) => {
    const value = normalizeScan(raw);
    if (!value || busy) return;
    setBusy(true); setMissing(""); setMatches([]);
    scanIdRef.current = null;
    try {
      // Xodim bejigi (MCT...) bu oynalarda tovar emas — faqat ogohlantirish.
      if (classifyScan(value) === "employee") {
        await logScan({ code: value, raw, module, action, result: "not_found" });
        toast.warning(wt("Bu xodim bejigi — tovar kodini skanerlang"));
        return;
      }
      // Always search every server catalog source: a local hit must not hide aliases or ambiguity.
      const { data, error } = await supabase.rpc("scan_catalog", { _code: value });
      if (error) throw error;
      const found = uniqueCatalogScanRows((data as unknown as ScanRow[]) ?? []);
      // Har bir skanerlash tarixga yoziladi (topildi/topilmadi) — qoldiqga ta'sir qilmaydi.
      const single = found.length === 1 ? found[0] : null;
      const hit = single;
      scanIdRef.current = await logScan({
        code: value, raw, module, action,
        productId: hit?.id ?? null,
        productName: hit?.name ?? null,
        productTypeId: hit?.product_type_id ?? null,
        kind: hit?.kind ?? null,
        result: hit || found.length > 1 ? "found" : "not_found",
      });
      if (single) {
        if (single.kind === "instrument") toast.info(("" + wt("Bu instrument:") + " " + (single.name) + wt(". Instrumentlar alohida bo'limda boshqariladi.")));
        else { onSelect(single, scanIdRef.current); toast.success(("" + wt("Tovar:") + " " + (single.name) + "")); }
      }
      else if (found.length > 1) setMatches(found);
      else { setMissing(value); toast.error(("" + wt("Kod topilmadi:") + " " + (value) + "")); }
    } catch (e: any) { toast.error(e.message ?? wt("Skanerlashda xatolik")); }
    finally { setBusy(false); setCode(""); inputRef.current?.focus(); }
  };
  const bindAlias = async () => {
    if (!bindId || !missing) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("bind_barcode_alias", { _code: missing, _product_id: bindId });
      if (error) throw error;
      const row = data as any;
      toast.success(("" + wt("Kod biriktirildi:") + " " + (missing) + " → " + (row.name) + ""));
      setBindOpen(false); setMissing(""); setBindId("");
      onSelect(products.find(p => p.id === row.product_id) ?? { id: row.product_id, product_type_id: row.product_type_id, name: row.name, unit: row.unit, barcode: row.barcode }, scanIdRef.current);
    } catch (e: any) { toast.error(e.message ?? wt("Kod biriktirishda xatolik")); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const ready = window.setTimeout(() => inputRef.current?.focus(), 100);
    // Yagona kanal: faqat eng yuqori (oxirgi ochilgan) skaner hodisani qayta ishlaydi.
    const unregister = registerScanHandler(createIssueScanHandler((_code, raw) => callback.current(raw)));
    return () => { window.clearTimeout(ready); unregister(); };
  }, []);
  return <div className="space-y-2" data-catalog-scan>
    <div className="flex gap-2 items-center">
      <ScanBarcode className="h-5 w-5 text-muted-foreground shrink-0" />
      <Input ref={inputRef} aria-label={wt("Shtrix-kod")} placeholder={wt("Shtrix-kod (ixtiyoriy)")} value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if(e.key === "Enter") { e.preventDefault(); callback.current(code); } }} />
      <Button type="button" variant="outline" disabled={busy || !code.trim()} onClick={() => callback.current(code)} aria-label={wt("Skanerni qidirish")}><ScanBarcode className="h-4 w-4" /></Button>
    </div>
    {matches.length > 1 && <div className="border rounded-md divide-y max-h-48 overflow-auto"><p className="p-2 text-sm font-medium">{wt("Mahsulot turini tanlang")}</p>{matches.map(p => <Button key={`${p.kind}:${p.id}`} type="button" variant="ghost" className="w-full justify-start h-auto whitespace-normal text-left" onClick={() => { if (p.kind === "instrument") toast.info(("" + wt("Bu instrument:") + " " + (p.name) + wt(". Instrumentlar alohida bo'limda boshqariladi."))); else onSelect(p, scanIdRef.current); setMatches([]); }}>{p.name} · {p.kind === "instrument" ? wt("Instrument") : p.unit}</Button>)}</div>}
    {missing && canEditBarcode(roles) && <Button type="button" variant="outline" onClick={() => setBindOpen(true)}><Link2 className="h-4 w-4 mr-2" />{wt("Shu kodni tovarga biriktirish")}</Button>}
    <Dialog open={bindOpen} onOpenChange={setBindOpen}><DialogContent><DialogHeader><DialogTitle>{wt("Kodni tovarga biriktirish")}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">{wt("Kod:")}<span className="font-mono font-medium text-foreground">{missing}</span> — asosiy ERP kod o‘zgarmaydi, bu kod qo‘shimcha alias bo‘lib saqlanadi.</p>
      <Label>{wt("Tovar")}</Label>
      <SearchableSelect options={products.filter(p => p.id).map(p => ({ value: p.id as string, label: `${p.name}${p.unit ? ` · ${p.unit}` : ""}` }))} value={bindId} onChange={setBindId} searchPlaceholder={wt("Tovarni qidirish...")} />
      <Button type="button" disabled={busy || !bindId} onClick={bindAlias}>{busy ? wt("Saqlanmoqda…") : wt("Biriktirish")}</Button>
    </DialogContent></Dialog>
  </div>;
}
