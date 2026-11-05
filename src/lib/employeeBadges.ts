import { jsPDF } from "jspdf";
import JsBarcode from "jsbarcode";
import logo from "@/assets/logo.png";
import { fmtDate } from "./format";
import { todayFile } from "./pdfExport";

export type BadgeEmployee = { id: string; full_name: string; position: string | null; department: string | null; hire_date?: string | null; photo_url?: string | null; badge_code: string };
export type BadgeSheetSize = 4 | 6 | 8;
export function badgePosition(index: number, perPage: BadgeSheetSize) {
  return { page: Math.floor(index / perPage), x: 5 + (index % 2) * 100, y: (297 - (perPage / 2) * 70) / 2 + Math.floor((index % perPage) / 2) * 70 };
}
async function fontData(url: string) {
  const response = await fetch(url); if (!response.ok) throw new Error("Bejik shrifti yuklanmadi");
  const bytes = new Uint8Array(await response.arrayBuffer()); let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
async function imageData(url: string, cover = false): Promise<string | null> {
  try {
    const image = new Image(); image.crossOrigin = "anonymous"; image.src = url; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = cover ? 300 : image.naturalWidth; canvas.height = cover ? 400 : image.naturalHeight;
    const ctx = canvas.getContext("2d"); if (!ctx) return null;
    if (cover) { const scale = Math.max(300 / image.width, 400 / image.height); const w = image.width * scale, h = image.height * scale; ctx.drawImage(image, (300 - w) / 2, (400 - h) / 2, w, h); }
    else ctx.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } catch { return null; }
}
/** Print-only palette intentionally independent of screen theme. Text and bars are PDF vectors. */
export async function buildEmployeeBadges(employees: BadgeEmployee[], perPage: BadgeSheetSize = 8, localize: (name: string) => string = name => name) {
  if (!employees.length || employees.some(e => !e.badge_code)) throw new Error("Bejik kodi bor xodimlarni tanlang");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const [normal, bold, logoImage, photos] = await Promise.all([fontData("/fonts/DejaVuSans.ttf"), fontData("/fonts/DejaVuSans-Bold.ttf"), imageData(logo), Promise.all(employees.map(e => e.photo_url ? imageData(e.photo_url, true) : Promise.resolve(null)))]);
  doc.addFileToVFS("Badge.ttf", normal); doc.addFont("Badge.ttf", "Badge", "normal");
  doc.addFileToVFS("BadgeBold.ttf", bold); doc.addFont("BadgeBold.ttf", "Badge", "bold");
  for (const [index, emp] of employees.entries()) {
    const { page, x, y } = badgePosition(index, perPage);
    if (page >= doc.getNumberOfPages()) doc.addPage();
    doc.setFillColor(255, 255, 255); doc.rect(x, y, 100, 70, "F");
    // Thin vector strips approximate the requested purple header gradient.
    for (let i = 0; i < 100; i++) { doc.setFillColor(59 + i * 0.32, 26 + i * 0.07, 120 + i * 0.62); doc.rect(x + i, y, 1.05, 12, "F"); }
    if (logoImage) doc.addImage(logoImage, "PNG", x + 3, y + 1.25, 9.5, 9.5);
    doc.setFont("Badge", "bold"); doc.setTextColor(255); doc.setFontSize(16); doc.text("MCITY", x + 15, y + 5.8);
    doc.setTextColor(253, 230, 138); doc.setFontSize(8); doc.text("XODIM GUVOHNOMASI", x + 15, y + 10);
    doc.setFillColor(244, 244, 244); doc.roundedRect(x + 3, y + 14, 30, 40, 1.5, 1.5, "F");
    if (photos[index]) {
      doc.saveGraphicsState(); doc.roundedRect(x + 3, y + 14, 30, 40, 1.5, 1.5, null); doc.clip(); doc.discardPath();
      doc.addImage(photos[index] as string, "PNG", x + 3, y + 14, 30, 40); doc.restoreGraphicsState();
    } else { doc.setFillColor(180, 180, 180); doc.circle(x + 18, y + 28, 6, "F"); doc.roundedRect(x + 8, y + 36, 20, 15, 5, 5, "F"); }
    doc.setDrawColor(251, 191, 36); doc.setLineWidth(0.6); doc.roundedRect(x + 3, y + 14, 30, 40, 1.5, 1.5, "S");
    doc.setTextColor(25); doc.setFont("Badge", "bold");
    let size = 13, nameLines: string[] = [];
    do { doc.setFontSize(size); nameLines = doc.splitTextToSize(localize(emp.full_name), 61); if (nameLines.length <= 2 && nameLines.every(line => doc.getTextWidth(line) <= 61)) break; size -= 0.5; } while (size > 3);
    doc.text(nameLines, x + 36, y + 19, { lineHeightFactor: 1.1 });
    let cursor = y + 25;
    for (const [label, value] of [["Lavozim", localize(emp.position ?? "—")], ["Bo'lim", localize(emp.department ?? "—")], ["Ishga kirgan sana", fmtDate(emp.hire_date)]]) {
      doc.setFont("Badge", "normal"); doc.setFontSize(6.5); doc.setTextColor(115); doc.text(label, x + 36, cursor + 2.5);
      doc.setFontSize(8); doc.setTextColor(30);
      let lines = doc.splitTextToSize(value, 61); let s = 8;
      while ((lines.length > 2 || lines.length * s * 0.35 > 4) && s > 3) { s -= 0.5; doc.setFontSize(s); lines = doc.splitTextToSize(value, 61); }
      doc.text(lines, x + 36, cursor + 6, { lineHeightFactor: 1 }); cursor += 10;
    }
    doc.setFillColor(242, 235, 251); doc.rect(x, y + 57, 100, 13, "F"); doc.setDrawColor(251, 191, 36); doc.setLineWidth(0.6); doc.line(x, y + 57, x + 100, y + 57);
    doc.setFont("Badge", "normal"); doc.setFontSize(6); doc.setTextColor(100); doc.text("Tabel №", x + 3, y + 61);
    doc.setFont("courier", "bold"); doc.setFontSize(12); doc.setTextColor(25); doc.text(emp.badge_code, x + 3, y + 66.5);
    const encoded: { encodings?: { data: string }[] } = {};
    JsBarcode(encoded, emp.badge_code, { format: "CODE128", displayValue: false });
    const bars = encoded.encodings?.map(e => e.data).join("") ?? "";
    if (!bars) throw new Error("Bejik shtrix-kodi yaratilmadi");
    const moduleWidth = 0.33, barcodeWidth = bars.length * moduleWidth;
    const bx = x + 99 - 3.3 - barcodeWidth;
    doc.setFillColor(0, 0, 0);
    for (let i = 0; i < bars.length; i++) if (bars[i] === "1") doc.rect(bx + i * moduleWidth, y + 59, moduleWidth, 9, "F");
    doc.setDrawColor(165); doc.setLineWidth(0.2); doc.setLineDashPattern([1, 1], 0); doc.rect(x, y, 100, 70); doc.setLineDashPattern([], 0);
  }
  return doc;
}
export const badgeFileName = () => `Bejiklar_${todayFile()}.pdf`;