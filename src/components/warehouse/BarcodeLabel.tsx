import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { createBarcodeLabels, LABEL_SIZE_MM } from "@/lib/barcodeLabels";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { toast } from "sonner";
import type { SearchProduct } from "@/lib/productSearch";

export { LABEL_SIZE_MM };
export default function BarcodeLabel({ product }: { product: SearchProduct }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => { if(ref.current && product.barcode) JsBarcode(ref.current, product.barcode, { format: "CODE128", width: 2, height: 55, margin: 12, displayValue: true, fontSize: 14 }); }, [product.barcode]);
  const pdf = async () => {
    if (!ref.current || !product.barcode) return;
    try {
      const doc = await createBarcodeLabels([product]);
      doc.save(`${product.barcode}_40x30.pdf`);
    } catch { toast.error("Yorliq yaratishda xatolik"); }
  };
  const print = () => {
    if(!ref.current) return;
    const win=window.open("", "_blank"); if(!win) { toast.error("Printer oynasini ochishga ruxsat bering"); return; }
    const doc=win.document; const style=doc.createElement("style"); style.textContent="@page{size:40mm 30mm;margin:0}body{margin:0;font:8pt Arial}main{box-sizing:border-box;width:40mm;height:30mm;padding:2mm;overflow:hidden}p{margin:0;max-height:9mm;overflow:hidden;font-size:7pt;font-weight:bold}svg{width:36mm;height:14mm}small{font-size:5pt}"; doc.head.append(style);
    const main=doc.createElement("main"), name=doc.createElement("p"); name.textContent=product.name; main.append(name,doc.importNode(ref.current,true));
    const mxik=doc.createElement("small"); mxik.textContent=product.mxik_code ? `MXIK: ${product.mxik_code}` : ""; main.append(mxik); doc.body.append(main); win.focus(); win.print();
  };
  if(!product.barcode) return null;
  return <div className="space-y-2 border rounded-md p-3"><p className="text-sm font-medium">Shtrix-kod · 40×30 mm</p><svg ref={ref} className="max-w-full h-24" aria-label={product.barcode} /><p className="text-xs text-muted-foreground">MXIK: {product.mxik_code ?? "Tekshiruvi kerak"}</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={print}><Printer className="mr-2 h-4 w-4" />Yorliq</Button><Button variant="outline" size="sm" onClick={pdf}><Download className="mr-2 h-4 w-4" />PDF</Button></div></div>;
}