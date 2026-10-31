import { describe, expect, it } from "vitest";
import { matchesProduct, resolveScan, scannedQuantity } from "./productSearch";
const products = [
  { id: "uuid-1", name: "Углошлифовальная машина (болгарка) EPA 125 мм", old_names: ["балгарка эпа 125"], barcode: "ERP000000001", mxik_code: "08467001096000000", unit: "dona" },
  { id: "uuid-2", name: "EPA 180 мм", barcode: "ERP000000002", mxik_code: "08467001096000000", unit: "kg" },
];
describe("catalog rules", () => {
  it("finds old name with case and whitespace differences", () => expect(matchesProduct(products[0], "  БАЛГАРКА   ЭПА 125 ")).toBe(true));
  it("finds current name", () => expect(matchesProduct(products[0], "машина EPA 125")).toBe(true));
  it("does not search internal IDs in normal product search", () => expect(matchesProduct(products[0], "uuid-1")).toBe(false));
  it("selects unique barcode before shared MXIK", () => expect(resolveScan(products, "ERP000000002").map(p => p.id)).toEqual(["uuid-2"]));
  it("returns all shared MXIK matches", () => expect(resolveScan(products, "08467001096000000")).toHaveLength(2));
  it("increments repeated piece scans", () => expect(scannedQuantity("dona", true, 2)).toBe(3));
  it("starts different piece product at one", () => expect(scannedQuantity("dona", false, 9)).toBe(1));
  it("does not increment kilograms", () => expect(scannedQuantity("kg", true, 2)).toBeNull());
  it("does not create unknown scan matches", () => expect(resolveScan(products, "unknown")).toEqual([]));
});