import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLocalize } from "@/i18n/context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeRating, type StatTask } from "@/lib/dailyTaskStats";

interface Row extends StatTask { id: string; task_title: string; order_id: string }

const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const shift = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const fmt = (d: string) => d.split("-").reverse().join(".");
type Mode = "day" | "week" | "month" | "range";

export default function DailyTasksRating({ empMap, orderMap }: { empMap: Record<string, any>; orderMap: Record<string, any> }) {
  const localize = useLocalize();
  const [mode, setMode] = useState<Mode>("week");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<Row[]>([]);

  const range = useMemo(() => {
    const t = today();
    if (mode === "day") return [from, from];
    if (mode === "week") { const d = new Date(t + "T00:00:00Z"); const dow = (d.getUTCDay() + 6) % 7; return [shift(t, -dow), shift(t, 6 - dow)]; }
    if (mode === "month") return [t.slice(0, 8) + "01", shift(shift(t.slice(0, 8) + "01", 32).slice(0, 8) + "01", -1)];
    return [from <= to ? from : to, from <= to ? to : from];
  }, [mode, from, to]);

  useEffect(() => {
    supabase.from("daily_tasks").select("id,employee_id,progress,status,task_date,task_title,order_id")
      .gte("task_date", range[0]).lte("task_date", range[1]).order("task_date").limit(10000)
      .then(({ data }) => setRows((data as any) ?? []));
  }, [range[0], range[1]]);

  const rating = useMemo(() => computeRating(rows), [rows]);
  const full = rows.filter((r) => r.status !== "cancelled" && r.progress >= 100);
  const name = (id: string) => localize(empMap[id]?.full_name) || "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([["day", "Kun"], ["week", "Shu hafta"], ["month", "Shu oy"], ["range", "Oraliq"]] as [Mode, string][]).map(([m, l]) => (
          <Button key={m} variant={mode === m ? "default" : "outline"} size="sm" onClick={() => setMode(m)}>{l}</Button>
        ))}
        {(mode === "day" || mode === "range") && <Input type="date" className="w-44" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />}
        {mode === "range" && <Input type="date" className="w-44" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />}
        <span className="font-semibold ml-2">{fmt(range[0])}{range[0] !== range[1] && ` — ${fmt(range[1])}`}</span>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr><th className="p-2">O'rin</th><th className="p-2">Xodim</th><th className="p-2 text-right">Jami topshiriqlar</th><th className="p-2 text-right">100% bajarilgan</th><th className="p-2 text-right">Jami bajarilish %</th><th className="p-2 text-right">O'rtacha %</th></tr>
          </thead>
          <tbody>
            {rating.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Bu davrda topshiriq yo'q</td></tr>}
            {rating.map((s) => (
              <tr key={s.employee_id} className="border-t">
                <td className="p-2 font-bold">{s.rank <= 3 ? ["🥇", "🥈", "🥉"][s.rank - 1] : ""} {s.rank}</td>
                <td className="p-2">{name(s.employee_id)}</td>
                <td className="p-2 text-right">{s.total}</td>
                <td className="p-2 text-right">{s.full}</td>
                <td className="p-2 text-right">{s.sum}%</td>
                <td className="p-2 text-right font-semibold">{s.avg}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      <div>
        <h2 className="font-semibold mb-2">100% bajarilgan topshiriqlar ({full.length})</h2>
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr><th className="p-2">Sana</th><th className="p-2">Xodim</th><th className="p-2">Zakaz</th><th className="p-2">Topshiriq</th></tr></thead>
            <tbody>
              {full.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Yo'q</td></tr>}
              {full.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{fmt(r.task_date)}</td><td className="p-2">{name(r.employee_id)}</td>
                  <td className="p-2">{orderMap[r.order_id] ? `#${orderMap[r.order_id].order_number}` : "—"}</td><td className="p-2">{r.task_title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      </div>
    </div>
  );
}
