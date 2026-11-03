import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download } from "lucide-react";
import { toast } from "sonner";
import { createBarcodeLabels } from "@/lib/barcodeLabels";
import type { SearchProduct } from "@/lib/productSearch";

/** Tanlangan mahsulotning doimiy shtrix-kodini ko'rsatadi: nusxalash + 40×30 mm PDF yorliq. */
export default function BarcodeChip({ product }: { product: SearchProduct | null | undefined }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!product?.barcode) return null;
  const copy = async () => {
    try {
      if (!product.barcode) return;
      await navigator.clipboard.writeText(product.barcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Nusxalash imkoni bo'lmadi"); }
  };
  const pdf = async () => {
    setBusy(true);
    try {
      const doc = await createBarcodeLabels([product]);
      doc.save(`${product.barcode}_40x30.pdf`);
    } catch { toast.error("Yorliq yaratishda xatolik"); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5">
      <span className="text-xs text-muted-foreground">Shtrix-kod:</span>
      <span className="font-mono text-sm font-semibold select-all">{product.barcode}</span>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={copy} aria-label="Kodni nusxalash">
        {copied ? <Check className="h-3.5 w-3.5 text-status-green" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" disabled={busy} onClick={pdf}>
        <Download className="h-3.5 w-3.5 mr-1" />40×30 yorliq
      </Button>
    </div>
  );
}
