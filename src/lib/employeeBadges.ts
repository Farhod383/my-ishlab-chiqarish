import { jsPDF } from "jspdf";
import JsBarcode from "jsbarcode";
import logo from "@/assets/logo.png";
import { fmtDate } from "./format";
import { todayFile } from "./pdfExport";

export type BadgeEmployee = { id: string; full_name: string; position: string | null; department: string | null; hire_date?: string | null; photo_url?: string | null; badge_code: string };
// Deli 5742 g'ilofi: har bejik 90×54 mm; A4 tik (kitobiy), 2 ustun × 5 qator = 10 ta, varaq markazida.
export const BADGE_W = 90, BADGE_H = 54, BADGES_PER_PAGE = 10;
export function badgePosition(index: number) {
  return { page: Math.floor(index / BADGES_PER_PAGE), x: 15 + (index % 2) * BADGE_W, y: 13.5 + Math.floor((index % BADGES_PER_PAGE) / 2) * BADGE_H };
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
export async function buildEmployeeBadges(employees: BadgeEmployee[], localize: (name: string) => string = name => name) {
  if (!employees.length || employees.some(e => !e.badge_code)) throw new Error("Bejik kodi bor xodimlarni tanlang");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const [normal, bold, logoImage, photos] = await Promise.all([fontData("/fonts/DejaVuSans.ttf"), fontData("/fonts/DejaVuSans-Bold.ttf"), imageData(logo), Promise.all(employees.map(e => e.photo_url ? imageData(e.photo_url, true) : Promise.resolve(null)))]);
  doc.addFileToVFS("Badge.ttf", normal); doc.addFont("Badge.ttf", "Badge", "normal");
  doc.addFileToVFS("BadgeBold.ttf", bold); doc.addFont("BadgeBold.ttf", "Badge", "bold");
  for (const [index, emp] of employees.entries()) {
    const { page, x, y } = badgePosition(index);
    if (page >= doc.getNumberOfPages()) doc.addPage();
    doc.setFillColor(255, 255, 255); doc.rect(x, y, BADGE_W, BADGE_H, "F");
    // Tepa 10 mm: binafsha gradient (#3b1a78 → #5b21b6) — vektor chiziqlar bilan.
    for (let i = 0; i < BADGE_W; i++) { doc.setFillColor(59 + i * 0.356, 26 + i * 0.078, 120 + i * 0.956); doc.rect(x + i, y, 1.05, 10, "F"); }
    if (logoImage) doc.addImage(logoImage, "PNG", x + 1.5, y + 1.25, 7.5, 7.5);
    doc.setFont("Badge", "bold"); doc.setTextColor(255); doc.setFontSize(12); doc.text("MCITY", x + 10.5, y + 5.2);
    doc.setTextColor(253, 230, 138); doc.setFontSize(6); doc.text("XODIM GUVOHNOMASI", x + 10.5, y + 8.6);
    // O'rta: chapda 3×4 rasm 24×32 mm, sariq ramka; rasm bo'lmasa kulrang siluet.
    doc.setFillColor(244, 244, 244); doc.rect(x + 3, y + 12, 24, 32, "F");
    if (photos[index]) {
      doc.saveGraphicsState(); doc.rect(x + 3, y + 12, 24, 32, null); doc.clip(); doc.discardPath();
      doc.addImage(photos[index] as string, "PNG", x + 3, y + 12, 24, 32); doc.restoreGraphicsState();
    } else { doc.setFillColor(180, 180, 180); doc.circle(x + 15, y + 22, 5, "F"); doc.roundedRect(x + 7, y + 29, 16, 12, 4, 4, "F"); }
    doc.setDrawColor(251, 191, 36); doc.setLineWidth(0.5); doc.rect(x + 3, y + 12, 24, 32, "S");
    // O'ngda: F.I.Sh. (qalin, uzun ism 2 qatorga o'tadi), Lavozim, Bo'lim, Ishga kirgan sana.
    doc.setTextColor(25); doc.setFont("Badge", "bold");
    let size = 11, nameLines: string[] = [];
    do { doc.setFontSize(size); nameLines = doc.splitTextToSize(localize(emp.full_name), 57); if (nameLines.length <= 2 && nameLines.every(line => doc.getTextWidth(line) <= 57)) break; size -= 0.5; } while (size > 3);
    doc.text(nameLines, x + 30, y + 16, { lineHeightFactor: 1.1 });
    let cursor = y + 22;
    for (const [label, value] of [["Lavozim", localize(emp.position ?? "—")], ["Bo'lim", localize(emp.department ?? "—")], ["Ishga kirgan sana", fmtDate(emp.hire_date)]]) {
      doc.setFont("Badge", "normal"); doc.setFontSize(5.5); doc.setTextColor(115); doc.text(label, x + 30, cursor + 2);
      doc.setFontSize(7.5); doc.setTextColor(30);
      let lines = doc.splitTextToSize(value, 57); let s = 7.5;
      while ((lines.length > 2 || lines.length * s * 0.35 > 3.5) && s > 3) { s -= 0.5; doc.setFontSize(s); lines = doc.splitTextToSize(value, 57); }
      doc.text(lines, x + 30, cursor + 5, { lineHeightFactor: 1 }); cursor += 7;
    }
    // Past 10 mm: och binafsha fon, tepasida sariq chiziq; chapda Tabel №, o'ngda Code128.
    doc.setFillColor(242, 235, 251); doc.rect(x, y + 44, BADGE_W, 10, "F");
    doc.setDrawColor(251, 191, 36); doc.setLineWidth(0.5); doc.line(x, y + 44, x + BADGE_W, y + 44);
    doc.setFont("Badge", "normal"); doc.setFontSize(5.5); doc.setTextColor(100); doc.text("Tabel №", x + 3, y + 47.5);
    doc.setFont("courier", "bold"); doc.setFontSize(9.5); doc.setTextColor(25); doc.text(emp.badge_code, x + 3, y + 51.8);
    const encoded: { encodings?: { data: string }[] } = {};
    JsBarcode(encoded, emp.badge_code, { format: "CODE128", displayValue: false });
    const bars = encoded.encodings?.map(e => e.data).join("") ?? "";
    if (!bars) throw new Error("Bejik shtrix-kodi yaratilmadi");
    const moduleWidth = 0.33, barcodeWidth = bars.length * moduleWidth;
    const bx = x + BADGE_W - 2 - barcodeWidth;
    doc.setFillColor(0, 0, 0);
    for (let i = 0; i < bars.length; i++) if (bars[i] === "1") doc.rect(bx + i * moduleWidth, y + 46.2, moduleWidth, 6.5, "F");
    // Kulrang punktir qirqish chizig'i.
    doc.setDrawColor(165); doc.setLineWidth(0.2); doc.setLineDashPattern([1, 1], 0); doc.rect(x, y, BADGE_W, BADGE_H); doc.setLineDashPattern([], 0);
  }
  return doc;
}
export const badgeFileName = () => `Bejiklar_${todayFile()}.pdf`;
