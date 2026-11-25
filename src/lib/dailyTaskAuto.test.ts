import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { describeAuto, planStart, resolveWorkers } from "./dailyTaskAuto";

const emp = (id: string, full_name: string, position = "Payvandchi") => ({ id, full_name, status: "active", department: "Ishlab chiqarish", position });

describe("kunlik topshiriq avtomatikasi", () => {
  it("ism bo'yicha topadi, alias → asosiy", () => {
    const r = resolveWorkers(["Aliyev  Vali", "Yo'q Odam"], [emp("a", "Aliyev Vali"), emp("b", "Karimov Ali")], new Map([["a", "A0"]]));
    expect(r.found).toEqual([{ name: "Aliyev  Vali", id: "A0" }]);
    expect(r.missing).toEqual(["Yo'q Odam"]);
  });
  it("OTK xodimi kunlik topshiriqqa kirmaydi", () => {
    expect(resolveWorkers(["Otk Xodim"], [emp("o", "Otk Xodim", "OTK nazoratchi")], new Map()).missing).toEqual(["Otk Xodim"]);
  });
  it("bir xil ismli ikki xodim — taxmin qilinmaydi", () => {
    expect(resolveWorkers(["Ali"], [emp("1", "Ali"), emp("2", "Ali")], new Map()).missing).toEqual(["Ali"]);
  });
  it("boshlash rejasi", () => {
    const p = planStart("O1", [{ name: "A", id: "a" }, { name: "B", id: "b" }, { name: "C", id: "c" }],
      [{ id: "t1", employee_id: "b", order_id: "O1" }, { id: "t2", employee_id: "c", order_id: "O2" }]);
    expect(p.create.map((x) => x.name)).toEqual(["A"]);
    expect(p.kept).toEqual(["B"]);
    expect(p.busy).toEqual(["C"]);
  });
  it("xabar", () => {
    expect(describeAuto({ created: [], kept: [], busy: [], missing: [], closed: [] })).toBeNull();
    expect(describeAuto({ created: ["A"], kept: [], busy: ["C"], missing: [], closed: [] })).toContain("ochildi: A");
  });
});
