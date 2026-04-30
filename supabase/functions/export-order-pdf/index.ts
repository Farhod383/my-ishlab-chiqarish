import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toISOString().slice(0, 10) : "—";
const fmtDT = (d?: string | null) =>
  d ? new Date(d).toLocaleString("ru-RU") : "—";

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
        sb.from("stock_movements").select("*, product:products(name, unit, last_price)")
          .eq("order_id", orderId).eq("direction", "out").order("created_at"),
        sb.from("audit_log").select("*").eq("order_id", orderId).order("created_at"),
      ]);
    if (!order) throw new Error("Zakaz topilmadi");

    const costRows = (movements ?? []).map((m: any) => {
      const price = Number(m.unit_price) > 0
        ? Number(m.unit_price)
        : Number(m.product?.last_price ?? 0);
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

    // Build daily timeline from stages + logs
    const events: { date: string; who: string; what: string }[] = [];
    (stages ?? []).forEach((s: any) => {
      if (s.started_at)
        events.push({ date: fmtDate(s.started_at), who: s.worker_name ?? "—", what: `${s.name} - boshlandi` });
      if (s.finished_at)
        events.push({ date: fmtDate(s.finished_at), who: s.worker_name ?? "—", what: `${s.name} - tugatildi` });
      if (s.handover_comment)
        events.push({
          date: fmtDate(s.finished_at ?? s.started_at ?? s.created_at),
          who: s.worker_name ?? "—",
          what: `${s.name} - topshirish: "${s.handover_comment}"`,
        });
    });
    (logs ?? []).forEach((l: any) => {
      events.push({
        date: fmtDate(l.created_at),
        who: l.actor_name ?? "—",
        what: `${l.action}${l.details ? ` - ${l.details}` : ""}`,
      });
    });
    events.sort((a, b) => a.date.localeCompare(b.date));

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    let y = 40;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Zakaz hisoboti", W / 2, y, { align: "center" });
    y += 22;
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 130);
    doc.text(order.order_number, W / 2, y, { align: "center" });
    doc.setTextColor(0, 0, 0);
    y += 24;

    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 10, cellPadding: 4 },
      head: [["Maydon", "Qiymat"]],
      headStyles: { fillColor: [120, 90, 200] },
      body: [
        ["Mijoz", order.client?.name ?? "—"],
        ["Mahsulot", `${order.product_name} x ${order.quantity}`],
        ["Olingan sana", fmtDate(order.order_date)],
        ["Tugash sanasi", fmtDate(order.deadline)],
        ["Holat", String(order.status)],
        ["Prioritet", String(order.priority)],
        ["Izoh", order.comment ?? "—"],
      ],
      columnStyles: { 0: { cellWidth: 130, fontStyle: "bold", fillColor: [245, 240, 255] } },
    });
    y = (doc as any).lastAutoTable.finalY + 18;

    // Timeline
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("Kunlik jadval", 40, y); y += 8;
    autoTable(doc, {
      startY: y,
      theme: "striped",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 3, valign: "top" },
      head: [["Sana", "Kim", "Nima qilindi"]],
      headStyles: { fillColor: [120, 90, 200] },
      body: events.length === 0
        ? [["—", "—", "Hodisalar mavjud emas"]]
        : events.map((e) => [e.date, e.who, e.what]),
      columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 110 } },
    });
    y = (doc as any).lastAutoTable.finalY + 18;

    // Stages detail
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("Bosqichlar tafsiloti", 40, y); y += 8;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 3, valign: "top" },
      head: [["#", "Bosqich", "Ishchi", "Boshlangan", "Tugatilgan", "Holat", "Smena izohi"]],
      headStyles: { fillColor: [120, 90, 200] },
      body: (stages ?? []).map((s: any) => [
        s.stage_order, s.name, s.worker_name ?? "—",
        fmtDT(s.started_at), fmtDT(s.finished_at), s.status,
        s.handover_comment ?? "—",
      ]),
      columnStyles: {
        0: { cellWidth: 22 }, 3: { cellWidth: 70 }, 4: { cellWidth: 70 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 18;

    // Materials usage + cost
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text("Sarflangan mahsulotlar va xarajat", 40, y); y += 8;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 3 },
      head: [["Mahsulot", "Miqdor", "Narx", "Jami", "Olgan", "Sana"]],
      headStyles: { fillColor: [120, 90, 200] },
      body: costRows.length === 0
        ? [["Sarflangan mahsulot yo'q", "", "", "", "", ""]]
        : [
            ...costRows.map((r) => [
              r.name, `${r.qty} ${r.unit}`, fmt(r.price), fmt(r.total),
              r.recipient, r.date,
            ]),
            [
              { content: "UMUMIY XARAJAT", colSpan: 3, styles: { fontStyle: "bold", fillColor: [255, 240, 200] } },
              { content: `${fmt(totalCost)} so'm`, styles: { fontStyle: "bold", fillColor: [255, 240, 200], halign: "right" } },
              { content: "", styles: { fillColor: [255, 240, 200] } },
              { content: "", styles: { fillColor: [255, 240, 200] } },
            ],
          ],
      columnStyles: {
        1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 16;

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Hisobot sanasi: ${new Date().toLocaleString("ru-RU")}`, W - 40, y, { align: "right" });

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
