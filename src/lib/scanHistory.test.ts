import { describe, it, expect } from "vitest";
import { scanActionLabel, scanResultLabel, matchesScanFilters, EMPTY_SCAN_FILTERS, type ScanHistoryRow } from "./scanHistory";

const row: ScanHistoryRow = {
  id: "1", scanned_at: "2026-11-02T10:15:00+05:00", code: "ERP000000123",
  product_id: "p1", product_name: "Bolt M8", product_type_id: "t1", kind: "product",
  module: "Kirim", action: "in", result: "found", quantity: 5, stock_after: 25,
  scanned_by: "u1", scanned_by_name: "Sanjar",
};

describe("scanHistory yorliqlari", () => {
  it("amal turi o'zbekcha ko'rinadi", () => {
    expect(scanActionLabel("in")).toBe("Kirim");
    expect(scanActionLabel("out")).toBe("Chiqim");
    expect(scanActionLabel("search")).toBe("Faqat qidirish");
    expect(scanActionLabel(null)).toBe("Faqat qidirish");
  });
  it("natija o'zbekcha ko'rinadi", () => {
    expect(scanResultLabel("found")).toBe("Topildi");
    expect(scanResultLabel("not_found")).toBe("Topilmadi");
  });
});

describe("matchesScanFilters", () => {
  it("bo'sh filtrlar hamma yozuvni o'tkazadi", () => {
    expect(matchesScanFilters(row, EMPTY_SCAN_FILTERS)).toBe(true);
  });
  it("sana oralig'i chegaralarni hisobga oladi", () => {
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, from: "2026-11-02", to: "2026-11-02" })).toBe(true);
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, from: "2026-11-03" })).toBe(false);
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, to: "2026-11-01" })).toBe(false);
  });
  it("mahsulot nomi va shtrix-kod bo'yicha qidiradi", () => {
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, product: "bolt" })).toBe(true);
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, product: "gvozd" })).toBe(false);
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, code: "000000123" })).toBe(true);
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, code: "999" })).toBe(false);
  });
  it("foydalanuvchi, modul, amal va natija filtrlari ishlaydi", () => {
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, user: "Sanjar" })).toBe(true);
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, user: "Shovkat" })).toBe(false);
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, module: "Kirim" })).toBe(true);
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, module: "Chiqim" })).toBe(false);
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, action: "in" })).toBe(true);
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, action: "out" })).toBe(false);
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, result: "found" })).toBe(true);
    expect(matchesScanFilters(row, { ...EMPTY_SCAN_FILTERS, result: "not_found" })).toBe(false);
  });
  it("mahsulotsiz (topilmagan) yozuv nom filtrida chiqmaydi", () => {
    const miss: ScanHistoryRow = { ...row, product_name: null, result: "not_found" };
    expect(matchesScanFilters(miss, { ...EMPTY_SCAN_FILTERS, product: "bolt" })).toBe(false);
    expect(matchesScanFilters(miss, { ...EMPTY_SCAN_FILTERS, result: "not_found" })).toBe(true);
  });
});
