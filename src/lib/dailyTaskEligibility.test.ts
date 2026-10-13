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

import { isDailyTaskEligible as elig2 } from "./dailyTaskEligibility";
import { it as it2, expect as expect2 } from "vitest";
it2("excludes OTK staff but keeps production workers", () => {
  expect2(elig2({ status: "active", department: "", position: "OTK" })).toBe(false);
  expect2(elig2({ status: "active", department: "ОТК", position: "Контролёр" })).toBe(false);
  expect2(elig2({ status: "active", department: "A blok", position: "Payvandchi" })).toBe(true);
});
