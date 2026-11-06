import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScanBarcode, Link2 } from "lucide-react";
import { toast } from "sonner";
import { resolveScan, type SearchProduct } from "@/lib/productSearch";
import { normalizeScanCode, classifyScan } from "@/lib/scanCode";
import { registerScanHandler } from "@/lib/scanChannel";
import { logScan, type ScanAction } from "@/lib/scanHistory";
import { useAuth } from "@/auth/AuthContext";
import { canEditBarcode } from "@/lib/manualBarcode";
import SearchableSelect from "@/components/SearchableSelect";

interface ScanRow { kind: "product" | "instrument"; id: string; product_type_id: string | null; name: string; unit: string | null; stock_qty: number | null; last_price: number | null; currency: string | null; mxik_code: string | null; barcode: string | null }
interface Props { products: SearchProduct[]; onSelect: (p: any, scanId?: string | null) => void; module: string; action?: ScanAction }

// Skaner klaviaturadan farqli ravishda belgilarni bir-biriga juda tez (≤50 ms) yozadi,
// oxirida Enter yoki Tab yuboradi; kodi kamida 4 belgi.
const RAPID_GAP_MS = 50;
const RESET_GAP_MS = 150;
const MIN_SCAN_LEN = 4;

export default function CatalogScanner({ products, onSelect, module, action = "search" }: Props) {
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
    const value = normalizeScanCode(raw);
    if (!value || busy) return;
    setBusy(true); setMissing(""); setMatches([]);
    scanIdRef.current = null;
    try {
      // Xodim bejigi (MCT...) bu oynalarda tovar emas — faqat ogohlantirish.
      if (classifyScan(value) === "employee") {
        await logScan({ code: value, module, action, result: "not_found" });
        toast.warning("Bu xodim bejigi — tovar kodini skanerlang");
        return;
      }
      let found: any[] = resolveScan(products, value);
      let instrumentHit: ScanRow | null = null;
      if (!found.length) {
        const { data, error } = await supabase.rpc("scan_catalog", { _code: value });
        if (error) throw error;
        const rows = (data as unknown as ScanRow[]) ?? [];
        const instruments = rows.filter(r => r.kind === "instrument");
        found = rows.filter(r => r.kind === "product");
        if (!found.length && instruments.length) {
          instrumentHit = instruments[0];
          toast.info(`Bu instrument: ${instruments[0].name}. Instrumentlar alohida bo'limda boshqariladi.`);
        }
      }
      // Har bir skanerlash tarixga yoziladi (topildi/topilmadi) — qoldiqga ta'sir qilmaydi.
      const single = found.length === 1 ? found[0] : null;
      const hit = single ?? instrumentHit;
      scanIdRef.current = await logScan({
        code: value, module, action,
        productId: hit?.id ?? null,
        productName: hit?.name ?? null,
        productTypeId: hit?.product_type_id ?? null,
        kind: hit ? (single ? "product" : "instrument") : null,
        result: hit || found.length > 1 ? "found" : "not_found",
      });
      if (found.length === 1) { onSelect(found[0], scanIdRef.current); toast.success(`Tovar: ${found[0].name}`); }
      else if (found.length > 1) setMatches(found);
      else { setMissing(value); toast.error(`Kod topilmadi: ${value}`); }
    } catch (e: any) { toast.error(e.message ?? "Skanerlashda xatolik"); }
    finally { setBusy(false); setCode(""); inputRef.current?.focus(); }
  };
  const bindAlias = async () => {
    if (!bindId || !missing) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("bind_barcode_alias", { _code: missing, _product_id: bindId });
      if (error) throw error;
      const row = data as any;
      toast.success(`Kod biriktirildi: ${missing} → ${row.name}`);
      setBindOpen(false); setMissing(""); setBindId("");
      onSelect({ id: row.product_id, product_type_id: row.product_type_id, name: row.name, unit: row.unit, barcode: row.barcode }, scanIdRef.current);
    } catch (e: any) { toast.error(e.message ?? "Kod biriktirishda xatolik"); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const ready = window.setTimeout(() => inputRef.current?.focus(), 100);
    let buffer = "", last = 0, rapid = false;
    let leakTarget: HTMLInputElement | HTMLTextAreaElement | null = null, leaked = 0;
    const stripLeaked = () => {
      if (!leakTarget || leaked <= 0) return;
      const el = leakTarget;
      const next = el.value.slice(0, Math.max(0, el.value.length - leaked));
      const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      const inScanBox = !!target?.closest?.("[data-catalog-scan]");
      const inField = !inScanBox && !!target?.closest?.("input, textarea, [contenteditable=true]");
      const now = performance.now();
      const gap = now - last; last = now;
      if (gap > RESET_GAP_MS) { buffer = ""; rapid = false; leakTarget = null; leaked = 0; }
      if (e.key === "Enter" || e.key === "Tab") {
        if (buffer.length >= MIN_SCAN_LEN && (rapid || !inField)) {
          e.preventDefault(); e.stopPropagation();
          const value = buffer; buffer = ""; rapid = false;
          stripLeaked(); leakTarget = null; leaked = 0;
          callback.current(value);
        }
        return;
      }
      if (e.key.length !== 1 || inScanBox) return;
      if (gap < RAPID_GAP_MS && buffer.length > 0) rapid = true;
      if (inField) {
        if (rapid) { e.preventDefault(); e.stopPropagation(); }
        else { if (leakTarget !== target) { leakTarget = target as HTMLInputElement; leaked = 0; } leaked++; }
      }
      buffer += e.key;
    };
    // Yagona kanal: faqat eng yuqori (oxirgi ochilgan) skaner hodisani qayta ishlaydi.
    const unregister = registerScanHandler(keydown);
    return () => { window.clearTimeout(ready); unregister(); };
  }, []);
  return <div className="space-y-2" data-catalog-scan>
    <div className="flex gap-2 items-center">
      <ScanBarcode className="h-5 w-5 text-muted-foreground shrink-0" />
      <Input ref={inputRef} aria-label="Shtrix-kod" placeholder="Shtrix-kod (ixtiyoriy)" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if(e.key === "Enter") { e.preventDefault(); callback.current(code); } }} />
      <Button type="button" variant="outline" disabled={busy || !code.trim()} onClick={() => callback.current(code)} aria-label="Skanerni qidirish"><ScanBarcode className="h-4 w-4" /></Button>
    </div>
    {matches.length > 1 && <div className="border rounded-md divide-y max-h-48 overflow-auto"><p className="p-2 text-sm font-medium">Mahsulot turini tanlang</p>{matches.map(p => <Button key={p.id} type="button" variant="ghost" className="w-full justify-start h-auto whitespace-normal text-left" onClick={() => { onSelect(p, scanIdRef.current); setMatches([]); }}>{p.name} · {p.unit}</Button>)}</div>}
    {missing && canEditBarcode(roles) && <Button type="button" variant="outline" onClick={() => setBindOpen(true)}><Link2 className="h-4 w-4 mr-2" />Shu kodni tovarga biriktirish</Button>}
    <Dialog open={bindOpen} onOpenChange={setBindOpen}><DialogContent><DialogHeader><DialogTitle>Kodni tovarga biriktirish</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">Kod: <span className="font-mono font-medium text-foreground">{missing}</span> — asosiy ERP kod o‘zgarmaydi, bu kod qo‘shimcha alias bo‘lib saqlanadi.</p>
      <Label>Tovar</Label>
      <SearchableSelect options={products.filter(p => p.id).map(p => ({ value: p.id as string, label: `${p.name}${p.unit ? ` · ${p.unit}` : ""}` }))} value={bindId} onChange={setBindId} searchPlaceholder="Tovarni qidirish..." />
      <Button type="button" disabled={busy || !bindId} onClick={bindAlias}>{busy ? "Saqlanmoqda…" : "Biriktirish"}</Button>
    </DialogContent></Dialog>
  </div>;
}
