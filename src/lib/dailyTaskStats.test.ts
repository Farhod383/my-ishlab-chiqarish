import { describe, it, expect } from "vitest";
import { computeRating } from "./dailyTaskStats";

const t = (e: string, p: number, d: string, status = "closed") => ({ employee_id: e, progress: p, task_date: d, status });

describe("computeRating", () => {
  it("averages across days and ranks by average", () => {
    const r = computeRating([t("x1", 60, "d1"), t("x2", 70, "d1"), t("x3", 80, "d1"), t("x1", 80, "d2"), t("x2", 60, "d2"), t("x3", 70, "d2")]);
    expect(r.map((s) => [s.employee_id, s.avg, s.rank])).toEqual([["x3", 75, 1], ["x1", 70, 2], ["x2", 65, 3]]);
    expect(r[0].sum).toBe(150);
    expect(r[0].total).toBe(2);
  });
  it("counts 100% tasks and ignores cancelled", () => {
    const r = computeRating([t("a", 100, "d1"), t("a", 50, "d2"), t("a", 0, "d3", "cancelled")]);
    expect(r[0]).toMatchObject({ total: 2, full: 1, avg: 75 });
  });
});
