import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, ScanBarcode } from "lucide-react";
import { matchesProduct, productTypeKey, uniqueProductTypes, type SearchProduct } from "@/lib/productSearch";
import { createBarcodeLabels } from "@/lib/barcodeLabels";
import { toast } from "sonner";

export default function BulkBarcodeLabels({ products }: { products: SearchProduct[] }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set()), [busy, setBusy] = useState(false);
  const types = useMemo(() => uniqueProductTypes(products).filter(p => p.barcode), [products]);
  const visible = types.filter(p => matchesProduct(p, query));
  const download = async () => {
    setBusy(true);
    try { const doc = await createBarcodeLabels(types.filter(p => selected.has(productTypeKey(p)))); doc.save("Mahsulot_turlari_40x30.pdf"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Yorliq yaratishda xatolik"); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}><ScanBarcode className="mr-2 h-4 w-4" />Yorliqlar PDF</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Mahsulot turi yorliqlari · 40×30 mm</DialogTitle></DialogHeader>
      <Input aria-label="Yorliq mahsulotlarini qidirish" placeholder="Qidirish..." value={query} onChange={e => setQuery(e.target.value)} />
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSelected(prev => new Set([...prev, ...visible.map(productTypeKey)]))}>Barchasini tanlash ({visible.length})</Button><Button variant="ghost" onClick={() => setSelected(new Set())}>Tanlovni tozalash</Button></div>
      <div className="max-h-[50dvh] overflow-auto divide-y">{visible.map(p => <label key={productTypeKey(p)} className="flex items-center gap-3 py-3 cursor-pointer"><Checkbox checked={selected.has(productTypeKey(p))} onCheckedChange={checked => setSelected(prev => { const next = new Set(prev); if (checked) next.add(productTypeKey(p)); else next.delete(productTypeKey(p)); return next; })} /><span className="min-w-0 flex-1 break-words">{p.name} · {p.unit}</span><span className="text-xs text-muted-foreground">{p.barcode}</span></label>)}</div>
      <Button disabled={busy || !selected.size} onClick={download}><Download className="mr-2 h-4 w-4" />{busy ? "Tayyorlanmoqda..." : `PDF yuklab olish (${selected.size})`}</Button>
    </DialogContent></Dialog>
  </>;
}