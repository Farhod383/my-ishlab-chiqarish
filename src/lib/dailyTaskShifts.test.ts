import { describe, it, expect } from "vitest";
import { matchesEmployee, groupEmployees } from "./dailyTaskShifts";

const emps = [
  { id: "a", full_name: "Aliyev Ali", department: "Sex", position: "Payvandchi", work_shift: 1 },
  { id: "b", full_name: "Bakitov Jansaid", department: "Sex", position: "Payvandchi", work_shift: 2 },
  { id: "c", full_name: "Karimov Vali", department: "Sex", position: "Bo'yoqchi", work_shift: null },
];
const base = { shift: "all" as const, department: "", position: "", q: "" };

describe("daily task shifts", () => {
  it("shift filter shows only that shift's employees", () => {
    expect(emps.filter((e) => matchesEmployee(e, { ...base, shift: 2 })).map((e) => e.id)).toEqual(["b"]);
  });
  it("employee without shift appears only under all shifts", () => {
    expect(emps.filter((e) => matchesEmployee(e, { ...base, shift: 1 })).map((e) => e.id)).toEqual(["a"]);
    expect(emps.filter((e) => matchesEmployee(e, base))).toHaveLength(3);
  });
  it("MCT code search matches resolved employee", () => {
    expect(emps.filter((e) => matchesEmployee(e, { ...base, q: "MCT0012", badgeIds: new Set(["b"]) })).map((e) => e.id)).toEqual(["b"]);
  });
  it("groups by department then position with counts", () => {
    const g = groupEmployees(emps);
    expect(g[0].count).toBe(3);
    expect(g[0].positions.find((p) => p.position === "Payvandchi")!.employees).toHaveLength(2);
  });
});
