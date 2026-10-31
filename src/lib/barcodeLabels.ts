import JsBarcode from "jsbarcode";
import { jsPDF } from "jspdf";
import { uniqueProductTypes, type SearchProduct } from "./productSearch";

export const LABEL_SIZE_MM = [40, 30] as const;
export async function createBarcodeLabels(products: SearchProduct[]): Promise<jsPDF> {
  const types = uniqueProductTypes(products).filter(p => p.barcode);
  if (!types.length) throw new Error("Shtrix-kodli mahsulot tanlanmagan");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [...LABEL_SIZE_MM] });
  for (const [index, product] of types.entries()) {
    if (!product.barcode) continue;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, product.barcode, { format: "CODE128", width: 2, height: 55, margin: 12, displayValue: true, fontSize: 14 });
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
    try {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Yorliq yaratilmadi");
      // Printed paper and ink are independent of application theme tokens.
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, 640, 480); ctx.fillStyle = "black";
      let fontSize = 24;
      let lines: string[] = [];
      do {
        ctx.font = `bold ${fontSize}px Arial`; lines = []; let line = "";
        for (const word of product.name.split(/\s+/)) {
          const next = line ? `${line} ${word}` : word;
          if (line && ctx.measureText(next).width > 590) { lines.push(line); line = word; } else line = next;
        }
        if (line) lines.push(line);
        if (lines.length <= 5 && lines.every(l => ctx.measureText(l).width <= 590)) break;
        fontSize -= 1;
      } while (fontSize > 6);
      lines.forEach((line, i) => ctx.fillText(line, 24, 30 + i * (fontSize + 3), 590));
      ctx.drawImage(image, 16, 185, 608, 210);
      ctx.font = "18px Arial";
      if (product.mxik_code) ctx.fillText(`MXIK: ${product.mxik_code}`, 24, 442);
      if (index) doc.addPage([...LABEL_SIZE_MM], "landscape");
      doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 40, 30);
    } finally { URL.revokeObjectURL(url); }
  }
  return doc;
}