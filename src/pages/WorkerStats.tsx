import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, HealthDot } from "@/components/StatusBadge";
import { Users, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface WStat {
  id: string; full_name: string; department: string;
  totalAssigned: number; completed: number; onTime: number; delayed: number; active: number;
  health: "green" | "yellow" | "red";
  recent: { order_number: string; status: string }[];
}

export default function WorkerStats() {
  const [stats, setStats] = useState<WStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: profiles }, { data: stages }, { data: orders }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, department"),
        supabase.from("order_stages").select("worker_id, status, order_id"),
        supabase.from("orders").select("id, order_number, status, deadline"),
      ]);
      const orderMap = new Map((orders ?? []).map(o => [o.id, o]));
      const result: WStat[] = (profiles ?? []).map((w) => {
        const myStages = (stages ?? []).filter(s => s.worker_id === w.id);
        const orderIds = Array.from(new Set(myStages.map(s => s.order_id).filter(Boolean)));
        const myOrders = orderIds.map(id => orderMap.get(id!)).filter(Boolean) as any[];
        const completed = myOrders.filter(o => o.status === "completed").length;
        const delayed = myOrders.filter(o => o.status === "delayed" || (o.status !== "completed" && o.deadline < today)).length;
        const onTime = completed;
        const active = myOrders.filter(o => o.status === "in_progress" || o.status === "pending").length;
        const health: "green" | "yellow" | "red" = delayed > 0 ? "red" : active > 2 ? "yellow" : "green";
        return {
          id: w.id, full_name: w.full_name || w.id.slice(0,8), department: w.department || "—",
          totalAssigned: orderIds.length, completed, onTime, delayed, active, health,
          recent: myOrders.slice(0, 3).map(o => ({ order_number: o.order_number, status: o.status })),
        };
      }).filter(w => w.totalAssigned > 0 || w.department !== "Boshqaruv");

      // Sort: red first, then yellow, then green
      result.sort((a,b) => (a.health==="red"?0:a.health==="yellow"?1:2) - (b.health==="red"?0:b.health==="yellow"?1:2));
      setStats(result);
      setLoading(false);
    })();
  }, []);

  const totals = {
    workers: stats.length,
    delayed: stats.filter(s => s.health === "red").length,
    risk: stats.filter(s => s.health === "yellow").length,
    onTime: stats.filter(s => s.health === "green").length,
  };

  const summary = [
    { label: "Jami ishchilar", value: totals.workers, icon: Users, accent: "text-primary bg-primary/10" },
    { label: "Kechiktirayotgan", value: totals.delayed, icon: AlertTriangle, accent: "text-status-red bg-status-red/10" },
    { label: "Risk", value: totals.risk, icon: Clock, accent: "text-status-yellow bg-status-yellow/15" },
    { label: "Kechikmagan", value: totals.onTime, icon: CheckCircle2, accent: "text-status-green bg-status-green/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ishchilar statistikasi</h1>
        <p className="text-sm text-muted-foreground">Natija va kechikishlar — vaqt yoki soat ko'rsatilmaydi</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summary.map(c => (
          <Card key={c.label}><CardContent className="p-4"><div className="flex items-start justify-between"><div><div className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</div><div className="text-2xl font-bold mt-1">{c.value}</div></div><div className={`p-2 rounded-md ${c.accent}`}><c.icon className="h-4 w-4" /></div></div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Ishchilar ro'yxati (avval kechiktirayotganlar)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="border-t overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Ism</TableHead>
                <TableHead>Bo'lim</TableHead>
                <TableHead className="text-center">Jami</TableHead>
                <TableHead className="text-center">Tugatgan</TableHead>
                <TableHead className="text-center">Kechikmagan</TableHead>
                <TableHead className="text-center">Kechikkan</TableHead>
                <TableHead className="text-center">Aktiv</TableHead>
                <TableHead>Holat</TableHead>
                <TableHead>Oxirgi zakazlar</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Yuklanmoqda...</TableCell></TableRow>}
                {stats.map(s => (
                  <TableRow key={s.id}>
                    <TableCell><HealthDot color={s.health} /></TableCell>
                    <TableCell className="font-medium">{s.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.department}</TableCell>
                    <TableCell className="text-center">{s.totalAssigned}</TableCell>
                    <TableCell className="text-center text-status-green font-semibold">{s.completed}</TableCell>
                    <TableCell className="text-center">{s.onTime}</TableCell>
                    <TableCell className="text-center text-status-red font-semibold">{s.delayed}</TableCell>
                    <TableCell className="text-center text-status-blue font-semibold">{s.active}</TableCell>
                    <TableCell><StatusBadge status={s.health === "red" ? "delayed" : s.health === "yellow" ? "risk" : "on_time"} /></TableCell>
                    <TableCell className="text-xs">{s.recent.map(r => r.order_number).join(", ") || "—"}</TableCell>
                  </TableRow>
                ))}
                {!loading && stats.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Ishchilar yo'q</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
