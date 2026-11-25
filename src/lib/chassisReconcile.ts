// Didox «Отправленные документы» va Shassi aktlarini solishtirish (faqat ko'rsatish uchun; hech narsa yozilmaydi).
import { excelDate } from "./xlsxRead";

export interface DidoxEsf { number: string; date: string | null; buyer: string; inn: string; amount: number; status: string }
export interface ActForReconcile { id: string; act_no: string; status: string; client_name: string; esf_number: string | null; total_gross: number }
export type IssueKind = "esf_without_act" | "act_esf_not_signed" | "amount_mismatch" | "shipped_without_esf";
export interface Issue { kind: IssueKind; act_no: string | null; act_id: string | null; esf_number: string | null; buyer: string; act_amount: number | null; didox_amount: number | null }

const norm = (s: string) => s.toLowerCase().replace(/[«»"'`ʼ’‘]/g, "").replace(/\b(ооо|мчж|mchj|ooo|ао|aj|xk|чп|ип|qk|ук|оао|зао)\b/g, "").replace(/\s+/g, " ").trim();
const num = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0;

function col(header: string[], ...names: RegExp[]): number {
  return header.findIndex((h) => names.some((n) => n.test(h.trim())));
}

/** Didox jadvalidan faqat Исх / Счет-фактура / Подписан qatorlarini oladi */
export function parseDidox(rows: string[][], fromDate: string | null): { esfs: DidoxEsf[]; zeroSkipped: number; read: number } {
  const hi = rows.findIndex((r) => r.some((c) => /тип\s*документа/i.test(c)) && r.some((c) => /статус/i.test(c)));
  if (hi < 0) throw new Error("Didox jadvali sarlavhasi topilmadi (Тип документа, Статус)");
  const h = rows[hi];
  const iDir = col(h, /^вх\s*\/\s*исх/i, /направлен/i);
  const iType = col(h, /тип\s*документа/i);
  const iStatus = col(h, /^статус/i);
  const iNum = col(h, /номер\s*(документа|сф|счет)/i, /^номер$/i, /^№/);
  const iDate = col(h, /дата\s*(документа|сф|счет)/i, /^дата$/i);
  const iBuyer = col(h, /покупател/i, /контрагент/i, /получател/i);
  const iInn = col(h, /инн|стир/i);
  const iSum = col(h, /сумма\s*к\s*оплате/i, /сумма\s*с\s*ндс/i, /^сумма/i);
  if ([iType, iStatus, iNum, iSum].some((i) => i < 0)) throw new Error("Kerakli ustunlar topilmadi: Номер, Тип документа, Статус, Сумма к оплате");
  let zeroSkipped = 0, read = 0;
  const esfs: DidoxEsf[] = [];
  for (const r of rows.slice(hi + 1)) {
    if (!r.some(Boolean)) continue;
    read++;
    if (iDir >= 0 && !/^исх/i.test((r[iDir] ?? "").trim())) continue;
    if (!/сч[её]т[\s-]*фактур/i.test(r[iType] ?? "")) continue;
    if (!/^подписан/i.test((r[iStatus] ?? "").trim())) continue;
    const date = iDate >= 0 ? excelDate(r[iDate] ?? "") : null;
    if (fromDate && date && date < fromDate) continue;
    const amount = num(r[iSum] ?? "");
    if (amount === 0) { zeroSkipped++; continue; } // nol summali tuzatish ESF'lari
    esfs.push({ number: (r[iNum] ?? "").trim(), date, buyer: (r[iBuyer] ?? "").trim(), inn: iInn >= 0 ? (r[iInn] ?? "").trim() : "", amount, status: r[iStatus] ?? "" });
  }
  return { esfs, zeroSkipped, read };
}

export function reconcile(esfs: DidoxEsf[], acts: ActForReconcile[]): { issues: Issue[]; matched: number } {
  const live = acts.filter((a) => a.status !== "void");
  const clients = new Set(live.map((a) => norm(a.client_name)));
  const byNum = new Map(esfs.map((e) => [e.number, e]));
  const actEsf = new Set(live.map((a) => a.esf_number).filter(Boolean) as string[]);
  const issues: Issue[] = [];
  let matched = 0;
  for (const e of esfs) {
    if (!clients.has(norm(e.buyer)) || actEsf.has(e.number)) continue;
    issues.push({ kind: "esf_without_act", act_no: null, act_id: null, esf_number: e.number, buyer: e.buyer, act_amount: null, didox_amount: e.amount });
  }
  for (const a of live) {
    if (a.status === "shipped" && !a.esf_number) {
      issues.push({ kind: "shipped_without_esf", act_no: a.act_no, act_id: a.id, esf_number: null, buyer: a.client_name, act_amount: Number(a.total_gross), didox_amount: null });
      continue;
    }
    if (!a.esf_number) continue;
    const e = byNum.get(a.esf_number);
    if (!e) issues.push({ kind: "act_esf_not_signed", act_no: a.act_no, act_id: a.id, esf_number: a.esf_number, buyer: a.client_name, act_amount: Number(a.total_gross), didox_amount: null });
    else if (Math.abs(e.amount - Number(a.total_gross)) > 0.5) issues.push({ kind: "amount_mismatch", act_no: a.act_no, act_id: a.id, esf_number: a.esf_number, buyer: a.client_name, act_amount: Number(a.total_gross), didox_amount: e.amount });
    else matched++;
  }
  return { issues, matched };
}
