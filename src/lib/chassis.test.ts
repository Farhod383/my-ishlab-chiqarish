import { describe, expect, it } from "vitest";
import { checkVin, matchesChassis, normalizeVin, cleanDbError } from "./chassis";

describe("VIN", () => {
  it("O→0, I→1, bo'sh joy va chiziqcha olib tashlanadi", () => {
    expect(normalizeVin(" lfwadrjf5r1a o1234 ")).toBe("LFWADRJF5R1A01234");
    expect(normalizeVin("LFW-ADRJF5RIA01234")).toBe("LFWADRJF5R1A01234");
  });
  it("uzunlik va taqiqlangan belgi", () => {
    expect(checkVin("").state).toBe("empty");
    expect(checkVin("LFWADRJF5").state).toBe("short");
    expect(checkVin("LFWADRJF5R1A012345").state).toBe("long");
    expect(checkVin("LFWADRJF5R1A0123Q").state).toBe("bad");
    expect(checkVin("LFWADRJF5R1A01234").state).toBe("ok");
  });
  it("qidiruv VIN oxiri, zakaz va ESF bo'yicha", () => {
    const row = { vin: "LFWADRJF5R1A01234", engine_no: "CA4DK1 3241187", order_number: "SEL0412", act_no: "A-2026-041", esf_number: "ESF-1187" };
    expect(matchesChassis(row, "1234")).toBe(true);
    expect(matchesChassis(row, "a01234")).toBe(true);
    expect(matchesChassis(row, "sel0412")).toBe(true);
    expect(matchesChassis(row, "esf-1187")).toBe(true);
    expect(matchesChassis(row, "9999")).toBe(false);
  });
  it("baza xatosidan faqat matn qoladi", () => {
    expect(cleanDbError("ERROR:  Kamida 1 ta rasm kerak (SQLSTATE P0001)")).toBe("Kamida 1 ta rasm kerak");
  });
});
