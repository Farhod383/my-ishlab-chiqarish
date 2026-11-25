// «Shassi» akti Word (DOCX) ko'rinishida — export-order-docx namunasida.
// Ma'lumotlar foydalanuvchining o'z huquqi bilan o'qiladi (RLS), summalar bazadagi aktdan olinadi.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle,
} from "https://esm.sh/docx@8.5.0";
import { sumInWordsUz } from "./rubWords.ts";

// Ijrochi rekvizitlari — 1C:УК «Реквизиты организации» dan (25.11.2026)
const EXECUTOR = {
  name: "ООО «Mcity»",
  inn: "306858501",
  vat: "327200106525",
  address: "Ташкентская область, г. Чирчик, ул. Kamolot, 44-A",
  bank: "АТБ «O'zsanoatqurilishbank» (головной офис), МФО 00440",
  account: "20208000105142541001",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const b = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const borders = { top: b, bottom: b, left: b, right: b };
const money = (n: number) => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace(/,/g, ".").replace(/ /g, " ");
const ddmmyyyy = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("ru-RU", { timeZone: "Asia/Tashkent" }) : "—";
const dt = (d: string | null | undefined) => d ? new Date(d).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent", dateStyle: "short", timeStyle: "short" }) : "—";

function cell(text: string, w: number, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; span?: number } = {}) {
  return new TableCell({
    borders, width: { size: w, type: WidthType.DXA }, columnSpan: opts.span,
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [new Paragraph({ alignment: opts.align, children: [new TextRun({ text, bold: opts.bold, font: "Times New Roman", size: 18 })] })],
  });
}
const p = (text: string, o: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; size?: number; after?: number } = {}) =>
  new Paragraph({ alignment: o.align, spacing: { after: o.after ?? 80 }, children: [new TextRun({ text, bold: o.bold, font: "Times New Roman", size: o.size ?? 22 })] });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { actId } = await req.json();
    if (!actId) throw new Error("actId majburiy");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: act, error } = await sb.from("chassis_acts")
      .select("*, client:clients(name), body_type:body_types(name, unit, mxik_code)").eq("id", actId).single();
    if (error || !act) throw new Error("Akt topilmadi yoki ruxsat yo'q");
    const [{ data: items }, { data: replaced }] = await Promise.all([
      sb.from("chassis_act_items").select("price_gross, chassis:chassis(id, vin, intake_act_no, model), line:chassis_spec_lines(spec:chassis_specs(contract_no, spec_no, spec_date))").eq("act_id", actId),
      act.replaces_act_id ? sb.from("chassis_acts").select("act_no, act_date, void_reason").eq("id", act.replaces_act_id).single() : Promise.resolve({ data: null }),
    ]);
    const rows = (items ?? []).sort((a: any, z: any) => a.chassis.vin.localeCompare(z.chassis.vin));
    const ids = rows.map((r: any) => r.chassis.id);
    const { data: ready } = await sb.from("chassis_events").select("chassis_id, created_at").in("chassis_id", ids).eq("to_status", "ready").order("created_at");
    const otk = new Map<string, string>();
    for (const e of ready ?? []) otk.set(e.chassis_id, e.created_at);
    const spec = rows[0]?.line?.spec;
    const priceNet = Math.round((Number(act.price_gross) / 1.12) * 100) / 100;
    const W = [400, 2300, 1300, 2200, 500, 500, 1200, 1200, 1000];

    const doc = new Document({
      styles: { default: { document: { run: { font: "Times New Roman", size: 22 } } } },
      sections: [{
        properties: { page: { size: { width: 16838, height: 11906, orientation: "landscape" }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
        children: [
          p(`АКТ № ${act.act_no}`, { bold: true, align: AlignmentType.CENTER, size: 26, after: 40 }),
          p("приёма-передачи надстроек, установленных на давальческие шасси, и возврата шасси", { bold: true, align: AlignmentType.CENTER, after: 40 }),
          p(`к договору № ${spec?.contract_no ?? "—"} (с дополнительным соглашением), спецификация № ${spec?.spec_no ?? "—"} от ${ddmmyyyy(spec?.spec_date)}`, { align: AlignmentType.CENTER, after: 200 }),
          p(`г. Ташкент${" ".repeat(20)}${ddmmyyyy(act.act_date)}`, { after: 160 }),
          p(`Исполнитель: ${EXECUTOR.name}, с одной стороны, и Заказчик: ${act.client?.name ?? "—"}, с другой стороны, составили настоящий акт о нижеследующем:`, { after: 120 }),
          p("1. Исполнитель передал, а Заказчик принял надстройки, установленные на давальческие шасси Заказчика:", { after: 80 }),
          new Table({
            width: { size: W.reduce((a, z) => a + z, 0), type: WidthType.DXA }, columnWidths: W,
            rows: [
              new TableRow({ tableHeader: true, children: [
                cell("№", W[0], { bold: true, align: AlignmentType.CENTER }), cell("VIN шасси (собственность Заказчика)", W[1], { bold: true }),
                cell("Акт приёма шасси", W[2], { bold: true }), cell("Наименование надстройки", W[3], { bold: true }),
                cell("Ед.", W[4], { bold: true }), cell("Кол-во", W[5], { bold: true }), cell("Цена без НДС", W[6], { bold: true, align: AlignmentType.RIGHT }),
                cell("НДС 12%, цена с НДС", W[7], { bold: true, align: AlignmentType.RIGHT }), cell("Дата ОТК", W[8], { bold: true }),
              ] }),
              ...rows.map((r: any, i: number) => new TableRow({ children: [
                cell(String(i + 1), W[0], { align: AlignmentType.CENTER }), cell(r.chassis.vin, W[1]), cell(r.chassis.intake_act_no ?? "—", W[2]),
                cell(act.body_type?.name ?? "—", W[3]), cell(act.body_type?.unit ?? "шт", W[4]), cell("1", W[5], { align: AlignmentType.CENTER }),
                cell(money(priceNet), W[6], { align: AlignmentType.RIGHT }),
                cell(`${money(Number(r.price_gross) - priceNet)} / ${money(Number(r.price_gross))}`, W[7], { align: AlignmentType.RIGHT }),
                cell(ddmmyyyy(otk.get(r.chassis.id)), W[8]),
              ] })),
              new TableRow({ children: [
                cell("Итого", W[0] + W[1] + W[2] + W[3] + W[4], { bold: true, span: 5 }), cell(String(act.qty), W[5], { bold: true, align: AlignmentType.CENTER }),
                cell(money(Number(act.total_net)), W[6], { bold: true, align: AlignmentType.RIGHT }),
                cell(`${money(Number(act.total_vat))} / ${money(Number(act.total_gross))}`, W[7], { bold: true, align: AlignmentType.RIGHT }), cell("", W[8]),
              ] }),
            ],
          }),
          p(`Итого с НДС: ${money(Number(act.total_gross))} (${sumInWordsUz(Number(act.total_gross))}), в т.ч. НДС 12% — ${money(Number(act.total_vat))}.`, { bold: true, after: 120 }),
          p("2. Давальческие шасси, на которые установлены надстройки, возвращены Заказчику. Стоимость шасси в цену надстроек не входит.", { after: 80 }),
          p(`3. Дата и время выезда: ${dt(act.shipped_at)}. Получатель: ${act.recipient_name ?? "________________"}, доверенность ${act.recipient_proxy ?? "________________"}.`, { after: 80 }),
          p("4. Надстройки и шасси переданы в комплектности согласно актам приёма. Стороны претензий друг к другу не имеют.", { after: 80 }),
          ...(replaced ? [p(`Настоящий акт составлен взамен акта № ${replaced.act_no} от ${ddmmyyyy(replaced.act_date)}, причина: ${replaced.void_reason ?? "—"}.`, { after: 80 })] : []),
          p(" ", { after: 200 }),
          new Table({
            width: { size: 14000, type: WidthType.DXA }, columnWidths: [7000, 7000],
            borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
            rows: [new TableRow({ children: [
              new TableCell({ width: { size: 7000, type: WidthType.DXA }, children: [p(`Исполнитель: ${EXECUTOR.name}`, { bold: true }), p(EXECUTOR.address, { size: 18 }), p(`ИНН ${EXECUTOR.inn}, рег. код НДС ${EXECUTOR.vat}`, { size: 18 }), p(`р/с ${EXECUTOR.account}, ${EXECUTOR.bank}`, { size: 18 }), p("Передал: ____________________ / ________________ /"), p("М.П.")] }),
              new TableCell({ width: { size: 7000, type: WidthType.DXA }, children: [p(`Заказчик: ${act.client?.name ?? ""}`, { bold: true }), p("Принял: ____________________ / ________________ /"), p("М.П.")] }),
            ] })],
          }),
        ],
      }],
    });
    const buffer = await Packer.toBuffer(doc);
    return new Response(buffer, { headers: { ...corsHeaders,
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${act.act_no}.docx"` } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
