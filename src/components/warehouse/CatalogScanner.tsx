import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { resolveScan, type SearchProduct } from "@/lib/productSearch";

interface Props { products: SearchProduct[]; onSelect: (p: any) => void; onCreate?: (code: string) => void }
export default function CatalogScanner({ products, onSelect, onCreate }: Props) {
  const [code, setCode] = useState("");
  const [matches, setMatches] = useState<any[]>([]);
  const [missing, setMissing] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const callback = useRef<(value: string) => void>(() => {});
  callback.current = async (value) => {
    if (!value.trim() || busy) return;
    setBusy(true); setMissing(""); setMatches([]);
    try {
      let found: any[] = resolveScan(products, value);
      if (!found.length) {
        const { data, error } = await supabase.rpc("resolve_catalog_scan", { _code: value });
        if (error) throw error;
        found = data ?? [];
      }
      if (found.length === 1) { onSelect(found[0]); toast.success(found[0].name); }
      else if (found.length > 1) setMatches(found);
      else { setMissing(value); toast.error("Mahsulot topilmadi"); }
    } catch (e: any) { toast.error(e.message ?? "Skanerlashda xatolik"); }
    finally { setBusy(false); setCode(""); inputRef.current?.focus(); }
  };
  useEffect(() => {
    const ready = window.setTimeout(() => inputRef.current?.focus(), 100);
    let buffer = "", last = 0;
    const keydown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.target instanceof HTMLElement && e.target.closest('[data-catalog-scan], input, textarea, [contenteditable=true]')) return;
      const now = performance.now();
      if (now - last > 80) buffer = "";
      last = now;
      if (e.key === "Enter" && buffer.length >= 6) { e.preventDefault(); e.stopPropagation(); const value=buffer; buffer=""; callback.current(value); }
      else if (e.key.length === 1) buffer += e.key;
    };
    window.addEventListener("keydown", keydown, true);
    return () => { window.clearTimeout(ready); window.removeEventListener("keydown", keydown, true); };
  }, []);
  return <div className="space-y-2" data-catalog-scan>
    <div className="flex gap-2 items-center">
      <ScanBarcode className="h-5 w-5 text-muted-foreground shrink-0" />
      <Input ref={inputRef} aria-label="Shtrix-kod" placeholder="Shtrix-kod (ixtiyoriy)" value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => { if(e.key === "Enter") { e.preventDefault(); callback.current(code); } }} />
      <Button type="button" variant="outline" disabled={busy || !code.trim()} onClick={() => callback.current(code)} aria-label="Skanerni qidirish"><ScanBarcode className="h-4 w-4" /></Button>
    </div>
    {matches.length > 1 && <div className="border rounded-md divide-y max-h-48 overflow-auto"><p className="p-2 text-sm font-medium">Mahsulot turini tanlang</p>{matches.map(p => <Button key={p.id} type="button" variant="ghost" className="w-full justify-start h-auto whitespace-normal text-left" onClick={() => { onSelect(p); setMatches([]); }}>{p.name} · {p.unit}</Button>)}</div>}
    {missing && onCreate && <Button type="button" variant="outline" onClick={() => onCreate(missing)}>Yangi mahsulot yaratish</Button>}
  </div>;
}