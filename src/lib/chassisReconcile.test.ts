import { describe, expect, it } from "vitest";
import { parseDidox, reconcile } from "./chassisReconcile";
import { excelDate } from "./xlsxRead";

const rows = [
  ["Отправленные документы"],
  ["Вх/Исх", "Тип документа", "Статус", "Номер документа", "Дата документа", "Покупатель", "ИНН", "Сумма к оплате"],
  ["Исх", "Счет-фактура", "Подписан", "ESF-1", "25.11.2026", "«Obod Shahar» MChJ", "301", "186480000"],
  ["Исх", "Счет-фактура", "Подписан", "ESF-2", "26.11.2026", "Obod Shahar MCHJ", "301", "186480000"],
  ["Исх", "Счет-фактура", "Подписан", "ESF-3", "26.11.2026", "Suv Servis", "302", "142204000"],
  ["Исх", "Счет-фактура", "Подписан", "ESF-4", "26.11.2026", "Obod Shahar", "301", "0"],
  ["Вх", "Счет-фактура", "Подписан", "IN-1", "26.11.2026", "Obod Shahar", "301", "5"],
  ["Исх", "Счет-фактура", "Отклонен", "ESF-5", "26.11.2026", "Obod Shahar", "301", "5"],
  ["Исх", "Акт", "Подписан", "A-1", "26.11.2026", "Obod Shahar", "301", "5"],
  ["Исх", "Счет-фактура", "Подписан", "ESF-0", "01.10.2026", "Obod Shahar", "301", "5"],
  ["Исх", "Счет-фактура", "Подписан", "ESF-X", "26.11.2026", "Boshqa mijoz", "999", "5"],
];

describe("Didox solishtirish", () => {
  it("faqat Исх / Счет-фактура / Подписан, sanadan keyingi; nol summa alohida sanaladi", () => {
    const r = parseDidox(rows, "2026-11-01");
    expect(r.esfs.map((e) => e.number)).toEqual(["ESF-1", "ESF-2", "ESF-3", "ESF-X"]);
    expect(r.zeroSkipped).toBe(1);
  });
  it("to'rt xil farqni topadi", () => {
    const { esfs } = parseDidox(rows, "2026-11-01");
    const acts = [
      { id: "a1", act_no: "A-2026-001", status: "closed", client_name: "Obod Shahar MChJ", esf_number: "ESF-1", total_gross: 186480000 },
      { id: "a2", act_no: "A-2026-002", status: "esf_issued", client_name: "Suv Servis MChJ", esf_number: "ESF-3", total_gross: 142240000 },
      { id: "a3", act_no: "A-2026-003", status: "esf_issued", client_name: "Suv Servis MChJ", esf_number: "ESF-9", total_gross: 1 },
      { id: "a4", act_no: "A-2026-004", status: "shipped", client_name: "Obod Shahar MChJ", esf_number: null, total_gross: 5 },
      { id: "a5", act_no: "A-2026-005", status: "void", client_name: "Obod Shahar MChJ", esf_number: "ESF-2", total_gross: 5 },
    ];
    const r = reconcile(esfs, acts);
    expect(r.matched).toBe(1);
    expect(r.issues.map((i) => `${i.kind}:${i.esf_number ?? i.act_no}`).sort()).toEqual([
      "act_esf_not_signed:ESF-9", "amount_mismatch:ESF-3", "esf_without_act:ESF-2", "shipped_without_esf:A-2026-004",
    ]);
  });
  it("Excel sana raqami", () => {
    expect(excelDate("46351")).toBe("2026-11-25");
    expect(excelDate("5.1.2026")).toBe("2026-01-05");
  });
});
