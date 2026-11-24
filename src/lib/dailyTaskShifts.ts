import { matchesAcrossScripts } from "@/lib/translit";

export type ShiftFilter = "all" | 1 | 2 | 3;
export interface ShiftEmployee { id: string; full_name: string; department?: string | null; position?: string | null; work_shift?: number | null }
export interface EmpFilter { shift: ShiftFilter; department: string; position: string; q: string; badgeIds?: Set<string> }

export const SHIFTS = [1, 2, 3] as const;
export const shiftLabel = (s?: number | null) => (s ? `${s}-smena` : "Smenasiz");

export function matchesEmployee(e: ShiftEmployee, f: EmpFilter, localize: (s?: string | null) => string = (s) => s ?? ""): boolean {
  if (f.shift !== "all" && e.work_shift !== f.shift) return false;
  if (f.department && (e.department || "") !== f.department) return false;
  if (f.position && (e.position || "") !== f.position) return false;
  const q = f.q.trim();
  if (!q) return true;
  if (f.badgeIds?.has(e.id)) return true;
  return matchesAcrossScripts([e.full_name, localize(e.full_name)].join(" "), q);
}

export interface PositionGroup<T> { position: string; employees: T[] }
export interface DepartmentGroup<T> { department: string; count: number; positions: PositionGroup<T>[] }

export function groupEmployees<T extends ShiftEmployee>(list: T[]): DepartmentGroup<T>[] {
  const deps = new Map<string, Map<string, T[]>>();
  for (const e of list) {
    const d = e.department?.trim() || "Bo'limsiz";
    const p = e.position?.trim() || "Lavozimsiz";
    if (!deps.has(d)) deps.set(d, new Map());
    const m = deps.get(d)!;
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(e);
  }
  return [...deps.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([department, m]) => ({
    department,
    count: [...m.values()].reduce((s, a) => s + a.length, 0),
    positions: [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([position, employees]) => ({ position, employees: [...employees].sort((x, y) => x.full_name.localeCompare(y.full_name)) })),
  }));
}
