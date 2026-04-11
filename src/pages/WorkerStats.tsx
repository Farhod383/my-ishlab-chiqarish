import { useI18n } from "@/i18n/context";
import { demoWorkers, demoOrders } from "@/data/demo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { useMemo } from "react";

interface WorkerSummary {
  id: string;
  name: string;
  role: string;
  totalAssigned: number;
  completed: number;
  onTime: number;
  delayed: number;
  active: number;
  recentOrders: { orderNumber: string; product: string; status: string }[];
  health: "green" | "yellow" | "red";
}

function computeWorkerStats(): WorkerSummary[] {
  return demoWorkers.map((w) => {
    // Find all orders where this worker is assigned to at least one stage
    const assignedOrders = demoOrders.filter((o) =>
      o.stages.some((s) => s.workerId === w.id)
    );

    const completed = assignedOrders.filter((o) => o.status === "completed").length;
    const delayed = assignedOrders.filter((o) => o.status === "delayed").length;
    const active = assignedOrders.filter((o) => o.status === "in_progress").length;
    const onTime = assignedOrders.filter((o) => o.status !== "delayed" && o.status !== "pending").length;

    let health: "green" | "yellow" | "red" = "green";
    if (delayed > 0) health = "red";
    else if (active > 2) health = "yellow";

    const recentOrders = assignedOrders.slice(0, 3).map((o) => ({
      orderNumber: o.orderNumber,
      product: o.product,
      status: o.status,
    }));

    return {
      id: w.id,
      name: w.name,
      role: w.role,
      totalAssigned: assignedOrders.length,
      completed,
      onTime,
      delayed,
      active,
      recentOrders,
      health,
    };
  });
}

const healthLabel = {
  green: "noDelay" as const,
  yellow: "atRisk" as const,
  red: "hasDelay" as const,
};

const healthStatusMap = {
  green: "completed",
  yellow: "pending",
  red: "delayed",
};

export default function WorkerStats() {
  const { t } = useI18n();
  const stats = useMemo(() => computeWorkerStats(), []);

  // Sort: red first, then yellow, then green
  const sorted = useMemo(() => {
    const order = { red: 0, yellow: 1, green: 2 };
    return [...stats].sort((a, b) => order[a.health] - order[b.health]);
  }, [stats]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.workers.title}</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold">{stats.length}</p>
            <p className="text-sm text-muted-foreground">Jami ishchilar</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-status-red">{stats.filter(s => s.health === "red").length}</p>
            <p className="text-sm text-muted-foreground">{t.workers.hasDelay}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-status-yellow">{stats.filter(s => s.health === "yellow").length}</p>
            <p className="text-sm text-muted-foreground">{t.workers.atRisk}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-status-green">{stats.filter(s => s.health === "green").length}</p>
            <p className="text-sm text-muted-foreground">{t.workers.noDelay}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t.workers.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.workers.name}</TableHead>
                <TableHead>{t.workers.role}</TableHead>
                <TableHead className="text-center">{t.workers.totalAssigned}</TableHead>
                <TableHead className="text-center">{t.workers.completed}</TableHead>
                <TableHead className="text-center">{t.workers.onTime}</TableHead>
                <TableHead className="text-center">{t.workers.delayed}</TableHead>
                <TableHead className="text-center">{t.workers.active}</TableHead>
                <TableHead className="text-center">{t.workers.status}</TableHead>
                <TableHead>{t.workers.recentOrders}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((w) => (
                <TableRow key={w.id} className={w.health === "red" ? "bg-status-red/5" : w.health === "yellow" ? "bg-status-yellow/5" : ""}>
                  <TableCell className="font-semibold">{w.name}</TableCell>
                  <TableCell className="text-muted-foreground">{w.role}</TableCell>
                  <TableCell className="text-center font-medium">{w.totalAssigned}</TableCell>
                  <TableCell className="text-center font-medium">{w.completed}</TableCell>
                  <TableCell className="text-center font-medium text-status-green">{w.onTime}</TableCell>
                  <TableCell className="text-center font-medium text-status-red">{w.delayed}</TableCell>
                  <TableCell className="text-center font-medium">{w.active}</TableCell>
                  <TableCell className="text-center">
                    <StatusBadge
                      status={healthStatusMap[w.health]}
                      label={t.workers[healthLabel[w.health]]}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {w.recentOrders.map((o) => (
                        <div key={o.orderNumber} className="flex items-center gap-2 text-xs">
                          <span className="font-mono">{o.orderNumber}</span>
                          <span className="text-muted-foreground truncate max-w-[120px]">{o.product}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
