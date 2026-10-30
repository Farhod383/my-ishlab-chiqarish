import { describe, it, expect } from "vitest";
import { orderGroupOf, sortSelOrdersDescending, orderNumberSearchText } from "./orderGroups";

describe("orderGroupOf", () => {
  it("Sel'nometalika", () => expect(orderGroupOf("FAW Tiger V Selnometalicheskiy Furgon ")).toBe("SEL"));
  it("KMU by code", () => expect(orderGroupOf("ISUZU NQR 90 KMU-3.2 TONNA")).toBe("KMU"));
  it("KMU by kran manipulyator", () => expect(orderGroupOf("Кран манипулятор -2 тонн")).toBe("KMU"));
  it("others are KDM", () => expect(orderGroupOf("KDM-8 + PESOK-6 FOTON AUMAN D")).toBe("KDM"));
});

describe("SEL list ordering", () => {
  it("places SEL0091 through SEL0081 above SEL0001 in numeric descending order", () => {
    const numbers = ["SEL0001", "SEL0081", "SEL0084", "SEL0082", "SEL0090", "SEL0083", "SEL0089", "SEL0085", "SEL0091", "SEL0088", "SEL0086", "SEL0087"];
    const rows = numbers.map(order_number => ({ order_number }));
    expect(sortSelOrdersDescending(rows).map(o => o.order_number)).toEqual([
      "SEL0091", "SEL0090", "SEL0089", "SEL0088", "SEL0087", "SEL0086", "SEL0085", "SEL0084", "SEL0083", "SEL0082", "SEL0081", "SEL0001",
    ]);
    expect(rows.map(o => o.order_number)).toEqual(numbers);
  });
  it("uses numeric values rather than alphabetical order", () => {
    expect(sortSelOrdersDescending([{ order_number: "SEL9999" }, { order_number: "SEL10000" }]).map(o => o.order_number)).toEqual(["SEL10000", "SEL9999"]);
  });
  it("groups by status Jarayonda → Kutilmoqda → Tugallangan, each descending by number", () => {
    const rows = [
      { order_number: "SEL0005", status: "completed" },
      { order_number: "SEL0003", status: "in_progress" },
      { order_number: "SEL0004", status: "pending" },
      { order_number: "SEL0009", status: "completed" },
      { order_number: "SEL0007", status: "in_progress" },
      { order_number: "SEL0008", status: "pending" },
    ];
    expect(sortSelOrdersDescending(rows).map(o => o.order_number)).toEqual([
      "SEL0007", "SEL0003", "SEL0008", "SEL0004", "SEL0009", "SEL0005",
    ]);
  });
  it("retains the original number in searchable history", () => {
    expect(orderNumberSearchText({ order_number: "SEL0082", legacy_order_number: "07N26150", order_number_history: [{ old_number: "SEL0032", new_number: "SEL0082" }] })).toContain("07N26150");
  });
});

import { orderPrefixOf } from "./orderGroups";
describe("orderPrefixOf", () => {
  it("SEL", () => expect(orderPrefixOf("FAW Tiger V Selnometalicheskiy Furgon")).toBe("SEL"));
  it("MIK", () => expect(orderPrefixOf("FAW Tiger 160 MIKSER 6 KUB")).toBe("MIK"));
  it("PARM wins over KMU", () => expect(orderPrefixOf("ПАРМ с кму-5 КАМАЗ")).toBe("PARM"));
  it("KMU", () => expect(orderPrefixOf("KMU-12")).toBe("KMU"));
  it("KDM default", () => expect(orderPrefixOf("Benzavoz FAW")).toBe("KDM"));
  it("KIS acid tanker", () => expect(orderPrefixOf("Polupritsep Kislotovoz (Oleum) 20 kub")).toBe("KIS"));
  it("ASM sewage tanker", () => expect(orderPrefixOf("Ассенизатор-6куб Faw Tiger V")).toBe("ASM"));
  it("ATZ fuel truck", () => expect(orderPrefixOf("HOWO 6x4 ATZ-20 KUB 2-OTSEK")).toBe("ATZ"));
  it("PRO cargo van", () => expect(orderPrefixOf("ISUZU NQR 90 PROMTOVARNIY FURGON 51 sex")).toBe("PRO"));
  it("IZO insulated van", () => expect(orderPrefixOf("ISUZU изотермический фургон")).toBe("IZO"));
  it("MUS waste truck", () => expect(orderPrefixOf("ISUZU 75 Musravoz 7+1")).toBe("MUS"));
  it("does not mistake propane for PRO", () => expect(orderPrefixOf("Faw propanavoz")).toBe("KDM"));
  it("does not mistake bitumen for ATZ", () => expect(orderPrefixOf("АВТОГУДРОНАТОР 10 КУБ (БИТУМАВОЗ)")).toBe("KDM"));
  it("all new explicit prefixes are recognized", () => {
    for (const prefix of ["KIS", "ASM", "ATZ", "PRO", "IZO", "MUS"] as const) expect(orderPrefixOf(`${prefix}-20`)).toBe(prefix);
  });
});
