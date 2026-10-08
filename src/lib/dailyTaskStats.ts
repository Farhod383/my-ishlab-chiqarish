export interface StatTask { employee_id: string; progress: number; status: string; task_date: string }
export interface EmpStat { employee_id: string; total: number; full: number; sum: number; avg: number; rank: number }

/** Per-employee totals over a period. Cancelled tasks are excluded. Rank by avg desc (ties share rank). */
export function computeRating(tasks: StatTask[]): EmpStat[] {
  const m = new Map<string, EmpStat>();
  for (const t of tasks) {
    if (t.status === "cancelled") continue;
    const s = m.get(t.employee_id) ?? { employee_id: t.employee_id, total: 0, full: 0, sum: 0, avg: 0, rank: 0 };
    s.total++; s.sum += t.progress; if (t.progress >= 100) s.full++;
    m.set(t.employee_id, s);
  }
  const arr = [...m.values()].map((s) => ({ ...s, avg: Math.round((s.sum / s.total) * 10) / 10 }));
  arr.sort((a, b) => b.avg - a.avg || b.full - a.full || b.total - a.total);
  arr.forEach((s, i) => { s.rank = i > 0 && arr[i - 1].avg === s.avg ? arr[i - 1].rank : i + 1; });
  return arr;
}
