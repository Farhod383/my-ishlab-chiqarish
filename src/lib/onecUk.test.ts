import { describe, expect, it } from "vitest";
import { buildIntakeDoc, EMPTY, onecError, pickContract, tashkentLocal, UK } from "../../supabase/functions/_shared/onecUk";

const K = "8bc52d87-05ab-11ec-812f-97c67f2f26a1";
const N = "af26fb46-d129-11f1-817c-043f72d861a4";

describe("1C:УК qabul qoralamasi", () => {
  it("«Прием в переработку», o'tkazilmagan, summasiz", () => {
    const d = buildIntakeDoc({ vin: "LFWADRJF1N1234567", intakeActNo: "P-20261125-4567", receivedAt: "2026-11-25T10:00:00Z",
      counterpartyKey: K, contractKey: null, nomenclatureKey: N, engineNo: "CA6DL", proxy: "№12" });
    expect(d.Posted).toBe(false);
    expect(d.ВидОперации).toBe("ПриемВПереработку");
    expect(d.Организация_Key).toBe(UK.organization);
    expect(d.Договор_Key).toBe(EMPTY);
    expect(d.Date).toBe("2026-11-25T15:00:00");
    expect(d.НомерВходящегоДокумента).toBe("P-20261125-4567");
    expect(d.Запасы).toHaveLength(1);
    expect(d.Запасы[0]).toMatchObject({ Номенклатура_Key: N, Количество: 1, Сумма: 0, Содержание: "Шасси VIN LFWADRJF1N1234567" });
    expect(d.Комментарий).toContain("CA6DL");
  });
  it("kontragentsiz yaratilmaydi", () => {
    expect(() => buildIntakeDoc({ vin: "X", intakeActNo: null, receivedAt: "2026-11-25T10:00:00Z", counterpartyKey: EMPTY, contractKey: null, nomenclatureKey: N })).toThrow();
  });
  it("Toshkent vaqti", () => expect(tashkentLocal("2026-11-25T20:30:00Z")).toBe("2026-11-26T01:30:00"));
});

describe("shartnoma tanlash", () => {
  const a = { Ref_Key: "a", НомерДоговора: "07/34-21", ВидДоговора: "СПокупателем", Description: "A" };
  const b = { Ref_Key: "b", НомерДоговора: "", ВидДоговора: "СПоставщиком", Description: "Основной договор" };
  it("ERP raqami bo'yicha", () => expect(pickContract([a, b], ["№ 07/34-21"]).key).toBe("a"));
  it("yagona «С покупателем»", () => expect(pickContract([a, b], []).key).toBe("a"));
  it("aniq bo'lmasa bo'sh qoladi", () => expect(pickContract([a, { ...a, Ref_Key: "c" }], []).key).toBeNull());
  it("o'chirilgani hisobga olinmaydi", () => expect(pickContract([{ ...a, DeletionMark: true }, b], []).key).toBe("b"));
});

it("1C xato matni", () => {
  expect(onecError(400, '{"odata.error":{"code":"14","message":{"lang":"ru","value":"Ошибка"}}}')).toBe("1C 400: Ошибка");
});
