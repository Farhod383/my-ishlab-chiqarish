import { useParams, Link } from "react-router-dom";
import { useI18n } from "@/i18n/context";
import { demoOrders } from "@/data/demo";
import { demoWorkers } from "@/data/demo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, PriorityBadge, getStatusColor } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, AlertTriangle } from "lucide-react";

const statusLabels: Record<string, string> = {
  pending: "Kutilmoqda",
  in_progress: "Jarayonda",
  completed: "Tugallangan",
  delayed: "Kechikkan",
};

function getWorkerName(id: string | null) {
  if (!id) return "—";
  return demoWorkers.find((w) => w.id === id)?.name ?? id;
}

export default function OrderDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const order = demoOrders.find((o) => o.id === id);

  if (!order) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Zakaz topilmadi</p>
        <Link to="/orders" className="text-primary hover:underline mt-2 inline-block">← {t.common.back}</Link>
      </div>
    );
  }

  const completedStages = order.stages.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/orders" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">{order.client} — {order.product} ({order.quantity} {t.common.pieces})</p>
        </div>
        <div className="ml-auto flex gap-2">
          <PriorityBadge priority={order.priority} />
          <StatusBadge status={order.status} label={statusLabels[order.status]} />
        </div>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span>{t.production.stage}: {completedStages}/{order.stages.length}</span>
            <span>{t.orders.deadline}: {order.deadline}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all bg-primary"
              style={{ width: `${(completedStages / order.stages.length) * 100}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="stages">
        <TabsList>
          <TabsTrigger value="stages">{t.orders.stages}</TabsTrigger>
          <TabsTrigger value="warehouse">{t.nav.warehouse}</TabsTrigger>
          <TabsTrigger value="log">{t.orders.log}</TabsTrigger>
        </TabsList>

        <TabsContent value="stages" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">#</th>
                      <th className="text-left py-2 pr-4">{t.production.stage}</th>
                      <th className="text-left py-2 pr-4">{t.production.normTime}</th>
                      <th className="text-left py-2 pr-4">{t.production.actualTime}</th>
                      <th className="text-left py-2 pr-4">{t.orders.status}</th>
                      <th className="text-left py-2 pr-4">{t.production.worker}</th>
                      <th className="text-left py-2">{t.production.comment}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.stages.map((s) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-2.5 pr-4 text-muted-foreground">{s.order}</td>
                        <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                        <td className="py-2.5 pr-4">{s.normTimeHours} {t.common.hours}</td>
                        <td className="py-2.5 pr-4">
                          {s.actualTimeHours !== null ? (
                            <span className={s.actualTimeHours > s.normTimeHours ? "text-status-red font-medium" : ""}>
                              {s.actualTimeHours.toFixed(1)} {t.common.hours}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="py-2.5 pr-4"><StatusBadge status={s.status} label={statusLabels[s.status]} /></td>
                        <td className="py-2.5 pr-4">{getWorkerName(s.workerId)}</td>
                        <td className="py-2.5 text-muted-foreground italic">{s.comment ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warehouse" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">{t.warehouse.part}</th>
                      <th className="text-left py-2 pr-4">{t.warehouse.unit}</th>
                      <th className="text-left py-2 pr-4">{t.warehouse.normUsage}</th>
                      <th className="text-left py-2 pr-4">{t.warehouse.actualUsage}</th>
                      <th className="text-left py-2 pr-4">{t.warehouse.difference}</th>
                      <th className="text-left py-2">{t.warehouse.takenBy}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.parts.map((p) => {
                      const diff = p.actualQuantity - p.normQuantity;
                      const isOver = diff > 0;
                      return (
                        <tr key={p.id} className={`border-b last:border-0 ${isOver ? "bg-status-red/5" : ""}`}>
                          <td className="py-2.5 pr-4 font-medium">{p.partName}</td>
                          <td className="py-2.5 pr-4">{p.unit}</td>
                          <td className="py-2.5 pr-4">{p.normQuantity}</td>
                          <td className="py-2.5 pr-4">{p.actualQuantity}</td>
                          <td className="py-2.5 pr-4">
                            {isOver ? (
                              <span className="text-status-red font-semibold flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" />+{diff}
                              </span>
                            ) : diff === 0 ? "0" : diff}
                          </td>
                          <td className="py-2.5 text-xs">
                            {p.takenBy.map((t, i) => (
                              <span key={i} className="block">{t.workerName}: {t.amount} {p.unit}</span>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="log" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {order.logs.map((log) => (
                  <div key={log.id} className="flex gap-4 items-start border-l-2 border-primary/30 pl-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{log.action}</p>
                      {log.details && <p className="text-sm text-muted-foreground">{log.details}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{new Date(log.timestamp).toLocaleString("uz-UZ")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
