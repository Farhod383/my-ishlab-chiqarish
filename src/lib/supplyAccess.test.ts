import { describe, expect, it } from "vitest";
import { canViewSupply } from "./supplyAccess";

describe("procurement access", () => {
  it("allows warehouse users to open the existing procurement page", () => {
    expect(canViewSupply(["warehouse"])).toBe(true);
  });
  it("preserves procurement access for supply users", () => {
    expect(canViewSupply(["supply"])).toBe(true);
  });
  it("rejects ordinary workers", () => {
    expect(canViewSupply(["worker"])).toBe(false);
  });
  it("rejects accounts without an assigned role", () => {
    expect(canViewSupply([])).toBe(false);
  });
});