import { describe, expect, it } from "vitest";
import { isWarehouseProduct } from "./productClassification";

describe("instrument reclassification", () => {
  it("excludes linked stock from ordinary products without excluding unlinked products", () => {
    const rows = [
      { id: "gloves", instrument_id: "existing-instrument", stock_qty: 20 },
      { id: "other", instrument_id: null, stock_qty: 7 },
    ];
    expect(rows.filter(isWarehouseProduct).map((p) => p.id)).toEqual(["other"]);
    expect(rows.filter(isWarehouseProduct).reduce((s, p) => s + p.stock_qty, 0)).toBe(7);
    expect(rows[0].stock_qty).toBe(20);
  });
});