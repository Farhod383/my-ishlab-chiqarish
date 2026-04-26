import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
} from "https://esm.sh/docx@8.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function cell(text: string, opts: { bold?: boolean; fill?: string; width?: number; align?: any } = {}) {
  return new TableCell({
    borders: cellBorders,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text: text ?? "—", bold: opts.bold, font: "Arial", size: 20 })],
    })],
  });
}

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

    const [{ data: order }, { data: stages }, { data: parts }, { data: movements }] = await Promise.all([
      sb.from("orders").select("*, client:clients(name, phone)").eq("id", orderId).single(),
      sb.from("order_stages").select("*").eq("order_id", orderId).order("stage_order"),
      sb.from("order_parts").select("*, product:products(name, last_price)").eq("order_id", orderId),
      sb.from("stock_movements").select("*, product:products(name, last_price)").eq("order_id", orderId).eq("direction", "out"),
    ]);
    if (!order) throw new Error("Zakaz topilmadi");

    // Cost from movements (actual outgoing) using unit_price (or product.last_price if 0)
    const costRows = (movements ?? []).map((m: any) => {
      const price = Number(m.unit_price) > 0 ? Number(m.unit_price) : Number(m.product?.last_price ?? 0);
      const total = price * Number(m.quantity);
      return { name: m.product?.name ?? "—", qty: Number(m.quantity), price, total };
    });
    const totalCost = costRows.reduce((s, r) => s + r.total, 0);

    const fmt = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n));

    const doc = new Document({
      styles: {
        default: { document: { run: { font: "Arial", size: 22 } } },
        paragraphStyles: [
          { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 32, bold: true, font: "Arial" },
            paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
          { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 26, bold: true, font: "Arial" },
            paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
        ],
      },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Zakaz hisoboti", bold: true })] }),
          new Paragraph({ alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: order.order_number, size: 28, bold: true, color: "1F4E79" })] }),
          new Paragraph({ children: [new TextRun(" ")] }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Asosiy ma'lumotlar")] }),
          new Table({
            width: { size: 9000, type: WidthType.DXA },
            columnWidths: [3000, 6000],
            rows: [
              new TableRow({ children: [cell("Mijoz", { bold: true, fill: "F2F2F2", width: 3000 }), cell(order.client?.name ?? "—", { width: 6000 })] }),
              new TableRow({ children: [cell("Mahsulot", { bold: true, fill: "F2F2F2", width: 3000 }), cell(`${order.product_name} × ${order.quantity}`, { width: 6000 })] }),
              new TableRow({ children: [cell("Olingan sana", { bold: true, fill: "F2F2F2", width: 3000 }), cell(order.order_date, { width: 6000 })] }),
              new TableRow({ children: [cell("Tugash sanasi", { bold: true, fill: "F2F2F2", width: 3000 }), cell(order.deadline, { width: 6000 })] }),
              new TableRow({ children: [cell("Holat", { bold: true, fill: "F2F2F2", width: 3000 }), cell(order.status, { width: 6000 })] }),
              new TableRow({ children: [cell("Prioritet", { bold: true, fill: "F2F2F2", width: 3000 }), cell(order.priority, { width: 6000 })] }),
            ],
          }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Bosqichlar")] }),
          new Table({
            width: { size: 9000, type: WidthType.DXA },
            columnWidths: [600, 4400, 1500, 1500, 1000],
            rows: [
              new TableRow({ children: [
                cell("№", { bold: true, fill: "1F4E79", width: 600 }),
                cell("Bosqich", { bold: true, fill: "1F4E79", width: 4400 }),
                cell("Norma (kun)", { bold: true, fill: "1F4E79", width: 1500, align: AlignmentType.RIGHT }),
                cell("OTK", { bold: true, fill: "1F4E79", width: 1500 }),
                cell("Holat", { bold: true, fill: "1F4E79", width: 1000 }),
              ] }),
              ...(stages ?? []).map((s: any) => new TableRow({ children: [
                cell(String(s.stage_order), { width: 600 }),
                cell(s.name, { width: 4400 }),
                cell(String(s.norm_days), { width: 1500, align: AlignmentType.RIGHT }),
                cell(s.otk_required || s.qc_required ? (s.qc_passed ? "✓ O'tdi" : (s.otk_comment ? "Izoh" : "Tekshirilmagan")) : "—", { width: 1500 }),
                cell(s.status, { width: 1000 }),
              ] })),
            ],
          }),

          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Sarflangan mahsulotlar va xarajat")] }),
          new Table({
            width: { size: 9000, type: WidthType.DXA },
            columnWidths: [4500, 1500, 1500, 1500],
            rows: [
              new TableRow({ children: [
                cell("Mahsulot", { bold: true, fill: "1F4E79", width: 4500 }),
                cell("Miqdor", { bold: true, fill: "1F4E79", width: 1500, align: AlignmentType.RIGHT }),
                cell("Narx", { bold: true, fill: "1F4E79", width: 1500, align: AlignmentType.RIGHT }),
                cell("Jami", { bold: true, fill: "1F4E79", width: 1500, align: AlignmentType.RIGHT }),
              ] }),
              ...(costRows.length === 0 ? [new TableRow({ children: [cell("Sarflangan mahsulot yo'q", { width: 9000 })] })]
                : costRows.map((r) => new TableRow({ children: [
                    cell(r.name, { width: 4500 }),
                    cell(String(r.qty), { width: 1500, align: AlignmentType.RIGHT }),
                    cell(fmt(r.price), { width: 1500, align: AlignmentType.RIGHT }),
                    cell(fmt(r.total), { width: 1500, align: AlignmentType.RIGHT }),
                  ] }))),
              new TableRow({ children: [
                cell("UMUMIY XARAJAT", { bold: true, fill: "FFF2CC", width: 7500 }),
                cell("", { fill: "FFF2CC", width: 0 }),
                cell("", { fill: "FFF2CC", width: 0 }),
                cell(fmt(totalCost) + " so'm", { bold: true, fill: "FFF2CC", width: 1500, align: AlignmentType.RIGHT }),
              ] }),
            ],
          }),

          new Paragraph({ children: [new TextRun(" ")] }),
          new Paragraph({ alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `Hisobot sanasi: ${new Date().toLocaleDateString("uz-UZ")}`, italics: true, size: 18, color: "808080" })] }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    return new Response(buffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${order.order_number}-hisobot.docx"`,
      },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
