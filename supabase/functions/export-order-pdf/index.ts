import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtDate = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
const fmtDT = (d?: string | null) => (d ? new Date(d).toLocaleString("ru-RU") : "—");

// ---- Unicode font (cached across invocations) ---------------------------
// Roboto supports Latin, Cyrillic and Uzbek diacritics — renders identically
// in Chrome, Edge, Adobe Reader and mobile PDF viewers.
const FONT_REGULAR_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/roboto-3-classic@main/src/hinted/Roboto-Regular.ttf";
const FONT_BOLD_URL =
  "https://cdn.jsdelivr.net/gh/googlefonts/roboto-3-classic@main/src/hinted/Roboto-Bold.ttf";

let fontCache: { regular: string; bold: string } | null = null;

async function fetchFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font yuklanmadi: ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // Base64 encode in chunks to avoid call-stack overflow.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFonts() {
  if (fontCache) return fontCache;
  const [regular, bold] = await Promise.all([
    fetchFontBase64(FONT_REGULAR_URL),
    fetchFontBase64(FONT_BOLD_URL),
  ]);
  fontCache = { regular, bold };
  return fontCache;
}

function registerFonts(doc: jsPDF, fonts: { regular: string; bold: string }) {
  doc.addFileToVFS("Roboto-Regular.ttf", fonts.regular);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Bold.ttf", fonts.bold);
  doc.addFont("Roboto-Bold.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");
}

// Brand palette
const BRAND: [number, number, number] = [88, 70, 180];
const BRAND_LIGHT: [number, number, number] = [245, 242, 255];
const TEXT_MUTED: [number, number, number] = [110, 110, 130];
const ACCENT_WARN: [number, number, number] = [255, 240, 200];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { orderId } = await req.json();
    if (!orderId) throw new Error("orderId majburiy");

    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const [{ data: order }, { data: stages }, { data: movements }, { data: logs }] =
      await Promise.all([
        sb.from("orders").select("*, client:clients(name, phone)").eq("id", orderId).single(),
        sb.from("order_stages").select("*").eq("order_id", orderId).order("stage_order"),
        sb.from("stock_movements")
          .select("*, product:products(name, unit, last_price)")
          .eq("order_id", orderId).eq("direction", "out").order("created_at"),
        sb.from("audit_log").select("*").eq("order_id", orderId).order("created_at"),
      ]);
    if (!order) throw new Error("Zakaz topilmadi");

    const costRows = (movements ?? []).map((m: any) => {
      const price = Number(m.unit_price) > 0 ? Number(m.unit_price) : Number(m.product?.last_price ?? 0);
      return {
        name: m.product?.name ?? "—",
        unit: m.product?.unit ?? "",
        qty: Number(m.quantity),
        price,
        total: price * Number(m.quantity),
        recipient: m.recipient_name ?? "—",
        date: fmtDate(m.created_at),
      };
    });
    const totalCost = costRows.reduce((s, r) => s + r.total, 0);

    const events: { date: string; who: string; what: string }[] = [];
    (stages ?? []).forEach((s: any) => {
      if (s.started_at)
        events.push({ date: fmtDate(s.started_at), who: s.worker_name ?? "—", what: `${s.name} — boshlandi` });
      if (s.finished_at)
        events.push({ date: fmtDate(s.finished_at), who: s.worker_name ?? "—", what: `${s.name} — tugatildi` });
      if (s.handover_comment)
        events.push({
          date: fmtDate(s.finished_at ?? s.started_at ?? s.created_at),
          who: s.worker_name ?? "—",
          what: `${s.name} — topshirish: "${s.handover_comment}"`,
        });
    });
    (logs ?? []).forEach((l: any) => {
      events.push({
        date: fmtDate(l.created_at),
        who: l.actor_name ?? "—",
        what: `${l.action}${l.details ? ` — ${l.details}` : ""}`,
      });
    });
    events.sort((a, b) => a.date.localeCompare(b.date));

    // Build PDF
    const fonts = await loadFonts();
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    registerFonts(doc, fonts);
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();

    // ---- Header band ----
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, W, 70, "F");
    doc.setFont("Roboto", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("ZAKAZ HISOBOTI", 40, 32);
    doc.setFont("Roboto", "normal");
    doc.setFontSize(10);
    doc.text(`Hujjat sanasi: ${new Date().toLocaleString("ru-RU")}`, 40, 50);
    doc.setFont("Roboto", "bold");
    doc.setFontSize(14);
    doc.text(String(order.order_number ?? ""), W - 40, 40, { align: "right" });

    let y = 92;
    doc.setTextColor(0, 0, 0);

    // ---- Info card ----
    doc.setFont("Roboto", "bold");
    doc.setFontSize(12);
    doc.text("Zakaz ma'lumotlari", 40, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { font: "Roboto", fontSize: 10, cellPadding: 5, textColor: [30, 30, 40] },
      head: [["Maydon", "Qiymat"]],
      headStyles: { font: "Roboto", fontStyle: "bold", fillColor: BRAND, textColor: 255 },
      body: [
        ["Mijoz", order.client?.name ?? "—"],
        ["Telefon", order.client?.phone ?? "—"],
        ["Mahsulot", `${order.product_name} × ${order.quantity}`],
        ["Olingan sana", fmtDate(order.order_date)],
        ["Tugash sanasi", fmtDate(order.deadline)],
        ["Holat", String(order.status)],
        ["Prioritet", String(order.priority)],
        ["Izoh", order.comment ?? "—"],
      ],
      columnStyles: {
        0: { cellWidth: 130, fontStyle: "bold", fillColor: BRAND_LIGHT },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 18;

    // ---- Timeline ----
    doc.setFont("Roboto", "bold"); doc.setFontSize(12);
    doc.text("Kunlik jadval", 40, y); y += 8;
    autoTable(doc, {
      startY: y,
      theme: "striped",
      styles: { font: "Roboto", fontSize: 9, cellPadding: 4, valign: "top" },
      head: [["№", "Sana", "Kim", "Nima qilindi"]],
      headStyles: { font: "Roboto", fontStyle: "bold", fillColor: BRAND, textColor: 255 },
      alternateRowStyles: { fillColor: [250, 248, 255] },
      body: events.length === 0
        ? [["—", "—", "—", "Hodisalar mavjud emas"]]
        : events.map((e, i) => [String(i + 1), e.date, e.who, e.what]),
      columnStyles: { 0: { cellWidth: 32, halign: "right" }, 1: { cellWidth: 80 }, 2: { cellWidth: 110 } },
    });
    y = (doc as any).lastAutoTable.finalY + 18;

    // ---- Stages detail ----
    doc.setFont("Roboto", "bold"); doc.setFontSize(12);
    doc.text("Bosqichlar tafsiloti", 40, y); y += 8;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { font: "Roboto", fontSize: 9, cellPadding: 4, valign: "top" },
      head: [["№", "Bosqich", "Ishchi", "Boshlangan", "Tugatilgan", "Holat", "Smena izohi"]],
      headStyles: { font: "Roboto", fontStyle: "bold", fillColor: BRAND, textColor: 255 },
      body: (stages ?? []).map((s: any, i: number) => [
        String(i + 1), s.name, s.worker_name ?? "—",
        fmtDT(s.started_at), fmtDT(s.finished_at), s.status,
        s.handover_comment ?? "—",
      ]),
      columnStyles: {
        0: { cellWidth: 28, halign: "right" }, 3: { cellWidth: 70 }, 4: { cellWidth: 70 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 18;

    // ---- Materials + cost ----
    doc.setFont("Roboto", "bold"); doc.setFontSize(12);
    doc.text("Sarflangan mahsulotlar va xarajat", 40, y); y += 8;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { font: "Roboto", fontSize: 9, cellPadding: 4 },
      head: [["№", "Mahsulot", "Miqdor", "Narx", "Jami", "Olgan", "Sana"]],
      headStyles: { font: "Roboto", fontStyle: "bold", fillColor: BRAND, textColor: 255 },
      body: costRows.length === 0
        ? [["—", "Sarflangan mahsulot yo'q", "", "", "", "", ""]]
        : costRows.map((r, i) => [
            String(i + 1), r.name, `${r.qty} ${r.unit}`, fmt(r.price), fmt(r.total),
            r.recipient, r.date,
          ]),
      columnStyles: {
        0: { cellWidth: 28, halign: "right" },
        2: { halign: "right" }, 3: { halign: "right" },
        4: { halign: "right", fontStyle: "bold" },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 14;

    // ---- Total cost block (highlighted) ----
    if (y > H - 100) { doc.addPage(); y = 60; }
    const blockH = 50;
    doc.setFillColor(...ACCENT_WARN);
    doc.rect(40, y, W - 80, blockH, "F");
    doc.setDrawColor(...BRAND);
    doc.setLineWidth(0.8);
    doc.rect(40, y, W - 80, blockH);
    doc.setFont("Roboto", "bold");
    doc.setFontSize(11);
    doc.setTextColor(70, 50, 10);
    doc.text("UMUMIY XARAJAT", 56, y + 22);
    doc.setFontSize(16);
    doc.setTextColor(...BRAND);
    doc.text(`${fmt(totalCost)} so'm`, W - 56, y + 28, { align: "right" });
    doc.setFont("Roboto", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Pozitsiyalar: ${costRows.length}`, 56, y + 40);
    y += blockH + 10;

    // ---- Footer (page X / Y on every page) ----
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(220, 220, 230);
      doc.setLineWidth(0.5);
      doc.line(40, H - 30, W - 40, H - 30);
      doc.setFont("Roboto", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(`Zakaz: ${order.order_number}`, 40, H - 16);
      doc.text(`Sahifa ${i} / ${pageCount}`, W - 40, H - 16, { align: "right" });
      doc.text("ERP — Ishlab chiqarish hisoboti", W / 2, H - 16, { align: "center" });
    }

    const ab = doc.output("arraybuffer");
    return new Response(ab, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${order.order_number}-hisobot.pdf"`,
      },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
