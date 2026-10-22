import { describe, expect, it } from "vitest";
import { matchesReportSearch, matchesReportStatus, reportDay } from "./orderReportFilters";

const order = { status: "in_progress", deadline: "2026-10-11", order_date: "2026-10-08", order_number: "07N26134", product_name: "FAW", client: { name: "Yuksalish" } };
const today = "2026-10-12";

describe("order report card filters", () => {
  it("keeps renamed order numbers searchable in reports", () => {
    const row = { ...order, order_number: "MUS0029", legacy_order_number: "17I2684", order_number_history: [{ old_number: "KDM0029", new_number: "MUS0029" }] };
    for (const number of ["MUS0029", "KDM0029", "17I2684"]) expect(matchesReportSearch(row, number, "", "")).toBe(true);
    expect(matchesReportSearch(row, "ASM0029", "", "")).toBe(false);
  });
  it("all clears the status filter", () => {
    expect(["pending", "completed", "in_progress", "delayed", "cancelled"].every(status => matchesReportStatus({ ...order, status }, "all", today))).toBe(true);
  });
  it("completed only selects completed orders", () => {
    expect(matchesReportStatus({ ...order, status: "completed" }, "completed", today)).toBe(true);
    expect(matchesReportStatus(order, "completed", today)).toBe(false);
  });
  it("in progress includes overdue in-progress orders but not pending ones", () => {
    expect(matchesReportStatus(order, "in_progress", today)).toBe(true);
    expect(matchesReportStatus({ ...order, status: "pending" }, "in_progress", today)).toBe(false);
  });
  it("delayed requires a past deadline and an unfinished non-cancelled order", () => {
    expect(matchesReportStatus(order, "delayed", today)).toBe(true);
    for (const status of ["completed", "cancelled"]) expect(matchesReportStatus({ ...order, status }, "delayed", today)).toBe(false);
    for (const deadline of [today, "2026-10-13", null]) expect(matchesReportStatus({ ...order, status: "delayed", deadline }, "delayed", today)).toBe(false);
  });
  it("combines status, client search, and inclusive dates", () => {
    const matches = (query: string, from: string, to: string) => matchesReportStatus(order, "in_progress", today) && matchesReportSearch(order, query, from, to);
    expect(matches("yuksalish", "2026-10-08", "2026-10-08")).toBe(true);
    expect(matches("missing", "", "")).toBe(false);
    expect(matches("FAW", "2026-10-09", "")).toBe(false);
    expect(matches("07N26134", "", "2026-10-07")).toBe(false);
  });
  it("uses the local calendar date without shifting the deadline", () => {
    expect(reportDay(new Date(2026, 9, 12, 0, 1))).toBe("2026-10-12");
  });
});