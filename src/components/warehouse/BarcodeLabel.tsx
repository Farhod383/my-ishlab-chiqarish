import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { toast } from "sonner";
import type { SearchProduct } from "@/lib/productSearch";

export const LABEL_SIZE_MM = [40, 30] as const;
export default function BarcodeLabel({ product }: { product: SearchProduct }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => { if(ref.current && product.barcode) JsBarcode(ref.current, product.barcode, { format: "CODE128", width: 2, height: 55, margin: 12, displayValue: true, fontSize: 14 }); }, [product.barcode]);
  const pdf = async () => {
    if (!ref.current || !product.barcode) return;
    try {
      const svg = new XMLSerializer().serializeToString(ref.current);
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const image = new Image();
      try { image.src = url; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width=640; canvas.height=480;
        const ctx=canvas.getContext("2d"); if(!ctx) return;
        // Printer paper is white regardless of the app theme.
        ctx.fillStyle="white"; ctx.fillRect(0,0,640,480); ctx.fillStyle="black"; ctx.font="bold 22px Arial";
        let line="", y=40;
        for(const word of product.name.split(/\s+/)) { const next=line ? `${line} ${word}` : word; if(ctx.measureText(next).width>590 && line) { ctx.fillText(line,24,y); y+=27; line=word; } else line=next; if(y>=148) break; }
        ctx.fillText(line,24,y);
        ctx.drawImage(image,16,185,608,210);
        if(product.mxik_code) { ctx.font="18px Arial"; ctx.fillText(`MXIK: ${product.mxik_code}`,24,442); }
        const doc=new jsPDF({ orientation:"landscape", unit:"mm", format:[...LABEL_SIZE_MM] });
        doc.addImage(canvas.toDataURL("image/png"),"PNG",0,0,40,30); doc.save(`${product.barcode}_40x30.pdf`);
      } finally { URL.revokeObjectURL(url); }
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