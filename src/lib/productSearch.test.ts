import { describe, expect, it } from "vitest";
import { matchesProduct, resolveScan, scannedQuantity, uniqueProductTypes, uniqueCatalogScanRows } from "./productSearch";
import { scanCodeVariants } from "./scanCode";
const products = [
  { id: "uuid-1", name: "Углошлифовальная машина (болгарка) EPA 125 мм", old_names: ["балгарка эпа 125"], barcode: "ERP000000001", mxik_code: "08467001096000000", unit: "dona" },
  { id: "uuid-2", name: "EPA 180 мм", barcode: "ERP000000002", mxik_code: "08467001096000000", unit: "kg" },
];
describe("catalog rules", () => {
  it("normalizes stored whitespace and mixed case without changing the stored code", () => {
    const row = { id: "stored", name: "Bolt", barcode: "  erp000000123\t" };
    expect(resolveScan([row], "УКЗ000000123").map(p => p.id)).toEqual(["stored"]);
    expect(row.barcode).toBe("  erp000000123\t");
  });
  it("keeps ambiguous product and instrument types instead of choosing one", () => {
    const rows = [
      { id: "p1", name: "Bolt", kind: "product", product_type_id: "t1" },
      { id: "p2", name: "Bolt", kind: "product", product_type_id: "t2" },
      { id: "i1", name: "Drill", kind: "instrument", product_type_id: "t3" },
    ];
    expect(uniqueCatalogScanRows(rows).map(p => p.id)).toEqual(["p1", "p2", "i1"]);
  });
  it("deduplicates catalog batches only within the same kind and type", () => {
    const rows = [
      { id: "p1", name: "Bolt", kind: "product", product_type_id: "t1" },
      { id: "p2", name: "Bolt", kind: "product", product_type_id: "t1" },
      { id: "i1", name: "Bolt", kind: "instrument", product_type_id: "t1" },
    ];
    expect(uniqueCatalogScanRows(rows).map(p => p.id)).toEqual(["p2", "i1"]);
  });
  it("finds old name with case and whitespace differences", () => expect(matchesProduct(products[0], "  БАЛГАРКА   ЭПА 125 ")).toBe(true));
  it("finds current name", () => expect(matchesProduct(products[0], "машина EPA 125")).toBe(true));
  it("does not search internal IDs in normal product search", () => expect(matchesProduct(products[0], "uuid-1")).toBe(false));
  it("selects unique barcode before shared MXIK", () => expect(resolveScan(products, "ERP000000002").map(p => p.id)).toEqual(["uuid-2"]));
  it("never uses MXIK as a scan identity", () => expect(resolveScan(products, "08467001096000000")).toEqual([]));
  it("returns one type for multiple batches", () => expect(resolveScan([
    {...products[0], product_type_id: "bolt-m8x40"}, {...products[0], id: "batch-2", product_type_id: "bolt-m8x40"}
  ], "ERP000000001")).toHaveLength(1));
  it("keeps M8×40 and M10×30 separate", () => expect(uniqueProductTypes([
    {...products[0], name: "Bolt M8×40", product_type_id: "m8x40"}, {...products[1], name: "Bolt M10×30", product_type_id: "m10x30"}
  ])).toHaveLength(2));
  it("keeps different units separate even for identical names", () => expect(uniqueProductTypes([
    {...products[0], name: "Bolt", unit: "kg"}, {...products[1], name: "Bolt", unit: "dona"}
  ])).toHaveLength(2));
  it("increments repeated piece scans", () => expect(scannedQuantity("dona", true, 2)).toBe(3));
  it("starts different piece product at one", () => expect(scannedQuantity("dona", false, 9)).toBe(1));
  it("does not increment kilograms", () => expect(scannedQuantity("kg", true, 2)).toBeNull());
  it("does not create unknown scan matches", () => expect(resolveScan(products, "unknown")).toEqual([]));
  it("matches numeric barcodes ignoring leading zeros (000123 = 123)", () => {
    const items = [{ id: "n1", name: "Gvozd", barcode: "000123" }, { id: "n2", name: "Bolt", barcode: "ERP000000123" }];
    expect(resolveScan(items, "123").map(p => p.id)).toEqual(["n1"]);
    expect(resolveScan(items, "000123").map(p => p.id)).toEqual(["n1"]);
    // Prefikssiz skan ERP prefiksli kodni ham topadi — ikkalasi ham qaytariladi (tasodifiy tanlanmaydi).
    expect(resolveScan(items, "000000123").map(p => p.id).sort()).toEqual(["n1", "n2"]);
    // ERP kodi raqamli emas — bosh nol qoidasi uni "123" bilan bog'lamaydi.
    expect(resolveScan(items, "123").map(p => p.id)).not.toContain("n2");
  });
  it("finds ERP-prefixed barcode when scanned without prefix", () => {
    expect(resolveScan(products, "000000002").map(p => p.id)).toEqual(["uuid-2"]);
  });
  it("finds prefix-less barcode when scanned with ERP prefix", () => {
    const items = [{ id: "p1", name: "Gvozd", barcode: "000000777" }];
    expect(resolveScan(items, "ERP000000777").map(p => p.id)).toEqual(["p1"]);
  });
  it("scanCodeVariants includes ERP and non-ERP forms plus RU layout", () => {
    expect(scanCodeVariants("ERP000000454")).toEqual(expect.arrayContaining(["ERP000000454", "000000454"]));
    expect(scanCodeVariants("000000454")).toEqual(expect.arrayContaining(["000000454", "ERP000000454"]));
    expect(scanCodeVariants("УКЗ000000454")).toEqual(expect.arrayContaining(["ERP000000454", "000000454"]));
  });
});