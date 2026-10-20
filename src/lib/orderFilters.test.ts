import { describe, it, expect } from "vitest";
import { EMPTY_FILTERS, matchOrderFilters } from "./orderFilters";

const today = "2026-10-20";
const o = (x: any) => ({ order_number: "01", product_name: "KDM 1", status: "pending", priority: "normal", deadline: "2026-12-01", order_date: "2026-10-01", order_stages: [], order_parts: [], client: { name: "Ali" }, ...x });

describe("order filters", () => {
  it("combines client + status filters", () => {
    const f = { ...EMPTY_FILTERS, client: "Ali", status: "delayed" as const };
    expect(matchOrderFilters(o({ deadline: "2026-10-01" }), f, today, new Set())).toBe(true);
    expect(matchOrderFilters(o({}), f, today, new Set())).toBe(false);
    expect(matchOrderFilters(o({ deadline: "2026-10-01", client: { name: "Vali" } }), f, today, new Set())).toBe(false);
  });
  it("order with no stages is excluded by progress filter", () => {
    expect(matchOrderFilters(o({}), { ...EMPTY_FILTERS, progressMin: "0" }, today, new Set())).toBe(false);
  });
  it("low stock filter uses linked parts", () => {
    const f = { ...EMPTY_FILTERS, stock: "low" as const };
    expect(matchOrderFilters(o({ order_parts: [{ product_id: "p1" }] }), f, today, new Set(["p1"]))).toBe(true);
    expect(matchOrderFilters(o({ order_parts: [{ product_id: "p2" }] }), f, today, new Set(["p1"]))).toBe(false);
  });
});
