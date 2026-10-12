import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { pickUserLabel } from "./userNames";

describe("user display name instead of email", () => {
  it("uses real full name when present", () => {
    expect(pickUserLabel("Glavniy buxgalter", "bigcasher@gmail.com", ["chief_accountant"])).toBe("Glavniy buxgalter");
  });
  it("falls back to role name when name is just the login", () => {
    expect(pickUserLabel("sklad", "sklad@gmail.com", ["warehouse"])).toBe("Sklad");
    expect(pickUserLabel("admin@gmail.com", "admin@gmail.com", ["admin"])).toBe("Admin");
  });
  it("never returns an email", () => {
    expect(pickUserLabel("", "x@mail.ru", [])).not.toContain("@");
  });
});
