import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDate, fmtDateTime24, fmtDuration, fmtNum } from "@/lib/format";
import { displayUser } from "@/lib/userNames";
import { ORDER_GROUPS, orderGroupOf, orderPdfLabel } from "@/lib/orderGroups";

let fontCache: Promise<{ r: string; b: string }> | null = null;
const b64 = async (url: string) => {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
};
const fonts = () => (fontCache ??= Promise.all([b64("/fonts/DejaVuSans.ttf"), b64("/fonts/DejaVuSans-Bold.ttf")]).then(([r, b]) => ({ r, b })));

async function newDoc() {
  const f = await fonts();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS("DV.ttf", f.r); doc.addFont("DV.ttf", "DV", "normal");
  doc.addFileToVFS("DVB.ttf", f.b); doc.addFont("DVB.ttf", "DV", "bold");
  doc.setFont("DV", "normal");
  return doc;
}

export const todayFile = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, "0"); return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`; };
const nowStr = () => fmtDateTime24(new Date().toISOString());
const HEAD: [number, number, number] = [38, 50, 72];

function footer(doc: jsPDF, title: string) {
  const n = doc.getNumberOfPages(); const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont("DV", "normal"); doc.setFontSize(8); doc.setTextColor(120);
    doc.setDrawColor(210); doc.line(14, H - 12, W - 14, H - 12);
    doc.text(title, 14, H - 7); doc.text(`Sahifa ${i} / ${n}`, W - 14, H - 7, { align: "right" });
  }
}

const tbl = (doc: jsPDF, startY: number, head: string[], body: (string | number)[][], extra: any = {}) => {
  autoTable(doc, {
    startY, head: [head], body: body.map((r) => r.map((c: any) => (typeof c === "object" ? c : String(c)))), theme: "grid", margin: { left: 14, right: 14, bottom: 16 },
    styles: { font: "DV", fontSize: 8.5, cellPadding: 1.6, overflow: "linebreak", valign: "top", textColor: 20 },
    headStyles: { font: "DV", fontStyle: "bold", fillColor: HEAD, textColor: 255 },
    rowPageBreak: "avoid", ...extra,
  });
  return (doc as any).lastAutoTable.finalY as number;
};

/** Generates and returns the grouped order list PDF; returns count per group for verification. */
export async function buildOrderListPdf(rows: { order_number: string; product_name: string }[]) {
  const doc = await newDoc(); const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...HEAD); doc.rect(0, 0, W, 24, "F");
  doc.setTextColor(255); doc.setFont("DV", "bold"); doc.setFontSize(17); doc.text("Zakazlar ro'yxati", 14, 14);
  doc.setFont("DV", "normal"); doc.setFontSize(9); doc.text(`Sana: ${nowStr()}`, W - 14, 14, { align: "right" });
  let y = 32;
  const sorted = rows.slice().sort((a, b) => String(a.order_number).localeCompare(String(b.order_number)));
  const counts: Record<string, number> = {};
  for (const g of ORDER_GROUPS) {
    const seen = new Set<string>();
    const items = sorted.filter((o) => orderGroupOf(o.product_name) === g.key).filter((o) => { const l = orderPdfLabel(o); return seen.has(l) ? false : (seen.add(l), true); });
    counts[g.key] = items.length;
    if (y > 260) { doc.addPage(); y = 18; }
    doc.setTextColor(...HEAD); doc.setFont("DV", "bold"); doc.setFontSize(13);
    doc.text(`${g.label}  (${items.length} ta)`, 14, y);
    y = tbl(doc, y + 3, ["№", "Zakaz raqami", "Mahsulot nomi"],
      items.length ? items.map((o, i) => [i + 1, o.order_number, String(o.product_name ?? "").trim()]) : [["—", "—", "Zakaz yo'q"]],
      { columnStyles: { 0: { cellWidth: 12, halign: "right" }, 1: { cellWidth: 34 } }, alternateRowStyles: { fillColor: [244, 246, 250] }, styles: { font: "DV", fontSize: 9.5, cellPadding: 2 } }) + 10;
  }
  footer(doc, "Zakazlar ro'yxati — KDM / KMU / Sel'nometalika");
  return { doc, counts };
}

const RES: Record<string, string> = { rework: "Qayta ishlash", write_off: "Hisobdan chiqarish", pending: "Kutilmoqda" };
const CAP = { stages: 22, materials: 18, defects: 6, tasks: 10 };
const mins = (a?: string | null, b?: string | null) => (a && b ? Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000) : null);
const capped = <T,>(a: T[], n: number, cols: number, map: (x: T) => (string | number)[]) => {
  const out = a.slice(0, n).map(map);
  if (!a.length) out.push([{ content: "Ma'lumot yo'q", colSpan: cols, styles: { halign: "center", textColor: 110 } }] as any);
  if (a.length > n) out.push([{ content: `… yana ${a.length - n} ta yozuv`, colSpan: cols, styles: { halign: "center", textColor: 110 } }] as any);
  return out;
};

export async function buildCompletedPdf(list: { order: any; stages: any[]; materials: any[]; defects: any[]; tasks: any[] }[]) {
  const doc = await newDoc(); const W = doc.internal.pageSize.getWidth();
  list.forEach((f, idx) => {
    if (idx) doc.addPage();
    const o = f.order;
    const start = f.stages.map((s) => s.started_at).filter(Boolean).sort()[0] ?? null;
    const end = f.stages.map((s) => s.finished_at).filter(Boolean).sort().slice(-1)[0] ?? null;
    const total = mins(start, end);
    doc.setFillColor(...HEAD); doc.rect(0, 0, W, 20, "F");
    doc.setTextColor(255); doc.setFont("DV", "bold"); doc.setFontSize(13);
    doc.text(doc.splitTextToSize(`${o.order_number} — ${o.product_name}`, W - 28)[0], 14, 12.5);
    let y = tbl(doc, 25, ["Klient", "Miqdor", "Qabul / muddat"], [[displayUser(o.client?.name ?? "—"), `${o.quantity} dona`, `${fmtDate(o.order_date)} / ${fmtDate(o.deadline)}`]]);
    y = tbl(doc, y + 1, ["Boshlangan", "Tugagan", "Umumiy davomiylik"], [[fmtDateTime24(start), fmtDateTime24(end), total == null ? "—" : fmtDuration(total)]]);
    const sec = (t: string) => { if (y > 265) { doc.addPage(); y = 16; } doc.setTextColor(...HEAD); doc.setFont("DV", "bold"); doc.setFontSize(10.5); doc.text(t, 14, y + 6); return y + 8; };
    const otk = (s: any) => !s.qc_required ? "Talab qilinmaydi" : s.qc_passed === true ? "Tasdiqlandi" : s.qc_passed === false ? "Rad etildi" : "Tekshirilmagan";
    y = tbl(doc, sec("Bosqichlar va OTK"), ["№", "Bosqich", "Xodim(lar)", "Boshlandi", "Tugadi", "Vaqt", "OTK"],
      capped(f.stages, CAP.stages, 7, (s) => { const m = mins(s.started_at, s.finished_at); return [s.stage_order, s.name + (s.otk_comment ? `\nOTK: ${s.otk_comment}` : ""), s.worker_name ? String(s.worker_name).split(",").map((n: string) => displayUser(n.trim())).join(", ") : "—", fmtDateTime24(s.started_at), fmtDateTime24(s.finished_at), m == null ? "—" : fmtDuration(m), otk(s)]; }),
      { columnStyles: { 0: { cellWidth: 8 }, 3: { cellWidth: 25 }, 4: { cellWidth: 25 }, 5: { cellWidth: 18 }, 6: { cellWidth: 22 } } });
    y = tbl(doc, sec("Xodimlar bajargan ishlar"), ["Sana", "Xodim", "Vazifa", "Bajarilishi"],
      capped(f.tasks, CAP.tasks, 4, (t) => [fmtDate(t.task_date), displayUser(t.employee?.full_name ?? "—"), t.task_title, `${t.progress}%`]), { columnStyles: { 0: { cellWidth: 22 }, 3: { cellWidth: 20 } } });
    y = tbl(doc, sec("Sarflangan materiallar va detallar"), ["Nomi", "Miqdori", "Birlik"],
      capped(f.materials, CAP.materials, 3, (m) => [m.name, fmtNum(m.qty), m.unit]), { columnStyles: { 1: { cellWidth: 25, halign: "right" }, 2: { cellWidth: 20 } } });
    y = tbl(doc, sec("Brak va qayta ishlash"), ["Sana", "Detal", "Miqdor", "Sabab", "Qaror"],
      capped(f.defects, CAP.defects, 5, (d) => [fmtDate(d.created_at), d.product?.name ?? "—", fmtNum(d.quantity), d.reason ?? "—", RES[d.resolution] ?? d.resolution]));
  });
  footer(doc, `Tugallangan zakazlar hisoboti — ${list.length} ta zakaz — ${nowStr()}`);
  return doc;
}
