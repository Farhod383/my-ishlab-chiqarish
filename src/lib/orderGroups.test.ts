import { describe, it, expect } from "vitest";
import { orderGroupOf } from "./orderGroups";

describe("orderGroupOf", () => {
  it("Sel'nometalika", () => expect(orderGroupOf("FAW Tiger V Selnometalicheskiy Furgon ")).toBe("SEL"));
  it("KMU by code", () => expect(orderGroupOf("ISUZU NQR 90 KMU-3.2 TONNA")).toBe("KMU"));
  it("KMU by kran manipulyator", () => expect(orderGroupOf("Кран манипулятор -2 тонн")).toBe("KMU"));
  it("others are KDM", () => expect(orderGroupOf("KDM-8 + PESOK-6 FOTON AUMAN D")).toBe("KDM"));
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
