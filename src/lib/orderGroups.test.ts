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
});
