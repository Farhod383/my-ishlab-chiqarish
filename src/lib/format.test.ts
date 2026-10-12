import { describe, it, expect } from "vitest";
import { fmtDate, fmtDateTime24 } from "./format";

describe("date format DD.MM.YYYY", () => {
  it("plain date never shifts a day", () => {
    expect(fmtDate("2026-10-12")).toBe("12.10.2026");
    expect(fmtDate("2026-09-01")).toBe("01.09.2026");
  });
  it("date+time is 24-hour", () => {
    expect(fmtDateTime24(new Date(2026, 9, 12, 14, 35))).toBe("12.10.2026 14:35");
  });
});
