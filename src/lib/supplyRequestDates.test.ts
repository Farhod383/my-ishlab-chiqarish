import { describe, expect, it } from "vitest";
import { supplyRequestDates } from "./supplyRequestDates";

describe("supply request date sources", () => {
  it("never shows an arrival for a pending request, even with a historical timestamp", () => {
    expect(supplyRequestDates({ status: "pending", fulfilled_at: "2026-10-13T14:35:00" }).fulfilled).toBe("—");
  });
  it("never substitutes creation time for a missing actual arrival", () => {
    expect(supplyRequestDates({ status: "fulfilled", created_at: "2026-10-13T14:35:00" }).fulfilled).toBe("—");
  });
  it("keeps given and actual arrival timestamps separate in 24-hour format", () => {
    const dates = supplyRequestDates({ status: "fulfilled", created_at: "2026-10-12T09:10:00", fulfilled_at: "2026-10-13T14:35:00" });
    expect(dates.given).toBe("12.10.2026 09:10");
    expect(dates.fulfilled).toBe("13.10.2026 14:35");
  });
  it("does not invent a time or shift a date-only deadline", () => {
    const d = supplyRequestDates({ status: "pending", required_date: "2026-10-13" });
    expect(d.deadline).toBe("13.10.2026");
    expect(d.deadlineNote).toBe("Vaqt belgilanmagan");
  });
  it("leaves the note empty when the deadline carries a real time", () => {
    const d = supplyRequestDates({ status: "pending", required_date: "2026-10-13T18:00:00" });
    expect(d.deadline).toBe("13.10.2026 18:00");
    expect(d.deadlineNote).toBe("");
  });
});