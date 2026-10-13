import { describe, it, expect } from "vitest";
import { isDailyTaskEligible as ok } from "./dailyTaskEligibility";

describe("isDailyTaskEligible", () => {
  it("keeps active production staff", () => {
    expect(ok({ status: "active", department: "A blok", position: "Payvandchi" })).toBe(true);
  });
  it("excludes inactive employees", () => {
    expect(ok({ status: "inactive", department: "A blok", position: "Payvandchi" })).toBe(false);
  });
  it.each([["HR", ""], ["", "Kadrlar bo'yicha inspektor"], ["Buxgalteriya", ""], ["Marketing", ""], ["Xodimlar bo‘limi", ""], ["", "Snabjenya"], ["Ta’minot", ""], ["", "Qorovul"]])(
    "excludes %s %s", (department, position) => {
      expect(ok({ status: "active", department, position })).toBe(false);
    });
});
