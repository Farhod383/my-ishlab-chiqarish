// HR employees list export (PDF + Word). Read-only: never mutates data.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, WidthType, BorderStyle, ShadingType, HeadingLevel, PageBreak,
} from "docx";
import logoUrl from "@/assets/logo.png";

export const COMPANY_NAME = "MCITY / MACHINE CITY";
export const DOC_TITLE = "XODIMLAR RO'YXATI";

export type ExportEmployee = {
  full_name: string;
  position: string | null;
  phone: string | null;
};

type Group = { position: string; rows: ExportEmployee[] };

export function groupByPosition(list: ExportEmployee[]): Group[] {
  const map = new Map<string, ExportEmployee[]>();
  for (const e of list) {
    const key = (e.position || "BOSHQA").trim().toUpperCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "uz"))
    .map(([position, rows]) => ({
      position,
      rows: rows.sort((a, b) => a.full_name.localeCompare(b.full_name, "uz")),
    }));
}

const fmtDate = () => new Date().toLocaleString("ru-RU");

async function loadLogo(): Promise<{ dataUrl: string; buffer: ArrayBuffer } | null> {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    return { dataUrl, buffer };
  } catch {
    return null;
  }
}

/* ────────────────────────────── PDF ────────────────────────────── */

export async function exportEmployeesPDF(list: ExportEmployee[], actor: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const logo = await loadLogo();
  const groups = groupByPosition(list);
  const date = fmtDate();

  const header = () => {
    let y = 36;
    if (logo) {
      try { doc.addImage(logo.dataUrl, "PNG", 40, y - 10, 46, 46); } catch { /* ignore */ }
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(15);
    doc.text(COMPANY_NAME, W / 2, y + 6, { align: "center" });
    doc.setFontSize(13);
    doc.text(DOC_TITLE, W / 2, y + 24, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(110);
    doc.text(`Sana: ${date}`, W / 2, y + 38, { align: "center" });
    doc.text(`Eksport qilgan: ${actor}`, W / 2, y + 50, { align: "center" });
    doc.setTextColor(0);
    doc.setDrawColor(120, 90, 200); doc.setLineWidth(1);
    doc.line(40, y + 58, W - 40, y + 58);
  };

  header();
  let y = 112;

  groups.forEach((g, i) => {
    if (y > 720) { doc.addPage(); header(); y = 112; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11.5);
    doc.setTextColor(70, 50, 130);
    doc.text(`${g.position} (${g.rows.length} ta)`, 40, y);
    doc.setTextColor(0);
    y += 8;

    autoTable(doc, {
      startY: y,
      theme: "grid",
      margin: { top: 112, left: 40, right: 40 },
      styles: { font: "helvetica", fontSize: 10, cellPadding: 5, lineColor: [200, 200, 210] },
      headStyles: { fillColor: [120, 90, 200], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 246, 253] },
      head: [["№", "F.I.Sh.", "Lavozim", "Telefon raqami"]],
      body: g.rows.map((e, idx) => [String(idx + 1), e.full_name, e.position || "—", e.phone || "—"]),
      columnStyles: { 0: { cellWidth: 34, halign: "center" }, 2: { cellWidth: 130 }, 3: { cellWidth: 120 } },
      didDrawPage: (data) => { if (data.pageNumber > 1) header(); },
    });
    y = (doc as any).lastAutoTable.finalY + 22;
    if (i === groups.length - 1) y = (doc as any).lastAutoTable.finalY + 22;
  });

  // Summary page
  doc.addPage(); header();
  let sy = 130;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("YAKUNIY MA'LUMOT", 40, sy); sy += 12;
  autoTable(doc, {
    startY: sy,
    theme: "grid",
    margin: { left: 40, right: 40 },
    styles: { font: "helvetica", fontSize: 11, cellPadding: 6 },
    headStyles: { fillColor: [120, 90, 200] },
    head: [["Ko'rsatkich", "Qiymat"]],
    body: [
      ["Jami lavozimlar soni", String(groups.length)],
      ["Jami xodimlar soni", String(list.length)],
      ["Eksport sanasi", date],
      ["Eksport qilgan", actor],
    ],
    columnStyles: { 0: { cellWidth: 240, fontStyle: "bold", fillColor: [245, 240, 255] } },
  });

  // Page numbers
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(130);
    doc.text(`${p} / ${total}`, W / 2, doc.internal.pageSize.getHeight() - 24, { align: "center" });
  }

  doc.save(`Xodimlar_royxati_${new Date().toISOString().slice(0, 10)}.pdf`);
}

/* ────────────────────────────── DOCX ────────────────────────────── */

const CONTENT_W = 9360;
const COLS = [700, 4060, 2400, 2200];
const border = { style: BorderStyle.SINGLE, size: 4, color: "C8C8D2" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text: string, opts: { bold?: boolean; width: number; fill?: string; color?: string; align?: any }) {
  return new TableCell({
    borders,
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text, bold: opts.bold, color: opts.color, font: "Arial", size: 20 })],
    })],
  });
}

export async function exportEmployeesDocx(list: ExportEmployee[], actor: string) {
  const logo = await loadLogo();
  const groups = groupByPosition(list);
  const date = fmtDate();

  const children: any[] = [];

  if (logo) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({
        type: "png",
        data: logo.buffer,
        transformation: { width: 60, height: 60 },
        altText: { title: "Logo", description: "Korxona logosi", name: "logo" },
      })],
    }));
  }
  children.push(
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: COMPANY_NAME, bold: true, size: 30, font: "Arial" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: DOC_TITLE, bold: true, size: 26, font: "Arial" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Sana: ${date}`, size: 18, color: "666666", font: "Arial" })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "785AC8", space: 6 } },
      children: [new TextRun({ text: `Eksport qilgan: ${actor}`, size: 18, color: "666666", font: "Arial" })],
    }),
  );

  groups.forEach((g) => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: `${g.position} (${g.rows.length} ta)`, bold: true, size: 24, color: "46328A", font: "Arial" })],
    }));
    children.push(new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: COLS,
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell("№", { bold: true, width: COLS[0], fill: "785AC8", color: "FFFFFF", align: AlignmentType.CENTER }),
            cell("F.I.Sh.", { bold: true, width: COLS[1], fill: "785AC8", color: "FFFFFF" }),
            cell("Lavozim", { bold: true, width: COLS[2], fill: "785AC8", color: "FFFFFF" }),
            cell("Telefon raqami", { bold: true, width: COLS[3], fill: "785AC8", color: "FFFFFF" }),
          ],
        }),
        ...g.rows.map((e, i) => new TableRow({
          children: [
            cell(String(i + 1), { width: COLS[0], align: AlignmentType.CENTER }),
            cell(e.full_name, { width: COLS[1] }),
            cell(e.position || "—", { width: COLS[2] }),
            cell(e.phone || "—", { width: COLS[3] }),
          ],
        })),
      ],
    }));
  });

  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: "YAKUNIY MA'LUMOT", bold: true, size: 26, font: "Arial" })],
  }));
  children.push(new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [4680, 4680],
    rows: [
      ["Jami lavozimlar soni", String(groups.length)],
      ["Jami xodimlar soni", String(list.length)],
      ["Eksport sanasi", date],
      ["Eksport qilgan", actor],
    ].map(([k, v]) => new TableRow({
      children: [
        cell(k, { bold: true, width: 4680, fill: "F5F0FF" }),
        cell(v, { width: 4680 }),
      ],
    })),
  }));

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Xodimlar_royxati_${new Date().toISOString().slice(0, 10)}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
