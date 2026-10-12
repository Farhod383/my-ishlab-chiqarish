import { describe, it, expect } from "vitest";
import { resolveLink } from "./notifModules";

describe("notification opens the exact record", () => {
  it("stage notification opens that order with the stage id", () => {
    expect(resolveLink({ type: "stage_started", entity: "stage", entity_id: "s1", link: "/orders/o1" }))
      .toBe("/orders/o1?entity=stage&focus=s1");
  });
  it("legacy notification without id falls back to event time", () => {
    expect(resolveLink({ type: "info", entity: "cash_expense", link: "/kassa", created_at: "2026-10-12T07:00:00Z" }))
      .toBe("/kassa?entity=cash_expense&focus_at=2026-10-12T07%3A00%3A00Z");
  });
  it("order notification opens the order page as is", () => {
    expect(resolveLink({ type: "order_created", entity: "order", entity_id: "o1", link: "/orders/o1" })).toBe("/orders/o1");
  });
});
