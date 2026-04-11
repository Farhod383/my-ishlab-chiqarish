import { useI18n } from "@/i18n/context";
import { demoOrders, demoWorkers } from "@/data/demo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Link } from "react-router-dom";

const statusLabels: Record<string, string> = {
  pending: "Kutilmoqda",
  in_progress: "Jarayonda",
  completed: "Tugallangan",
  delayed: "Kechikkan",
};

const stageColorClass: Record<string, string> = {
  completed: "bg-status-green",
  in_progress: "bg-status-blue",
  delayed: "bg-status-red",
  pending: "bg-muted-foreground/30",
};

export default function ProductionBoard() {
  const { t } = useI18n();
  const activeOrders = demoOrders.filter((o) => o.status !== "completed");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.production.title}</h1>

      <div className="space-y-4">
        {activeOrders.map((order) => (
          <Card key={order.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  <Link to={`/orders/${order.id}`} className="text-primary hover:underline">
                    {order.orderNumber}
                  </Link>
                  <span className="ml-2 text-muted-foreground font-normal text-sm">{order.product}</span>
                </CardTitle>
                <StatusBadge status={order.status} label={statusLabels[order.status]} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-1 items-center">
                {order.stages.map((stage, i) => (
                  <div key={stage.id} className="flex-1 group relative">
                    <div className={`h-8 rounded-sm ${stageColorClass[stage.status]} flex items-center justify-center`}>
                      <span className="text-xs font-medium text-card truncate px-1">
                        {stage.name}
                      </span>
                    </div>
                    <div className="hidden group-hover:block absolute z-10 top-full mt-1 left-0 bg-card border rounded-md shadow-lg p-3 min-w-48 text-xs">
                      <p className="font-semibold mb-1">{stage.name}</p>
                      <p>{t.production.normTime}: {stage.normTimeHours} {t.common.hours}</p>
                      {stage.actualTimeHours && <p>{t.production.actualTime}: {stage.actualTimeHours.toFixed(1)} {t.common.hours}</p>}
                      <p>{t.production.worker}: {stage.workerId ? demoWorkers.find(w => w.id === stage.workerId)?.name ?? "—" : "—"}</p>
                      {stage.comment && <p className="text-muted-foreground italic mt-1">{stage.comment}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>{t.orders.deadline}: {order.deadline}</span>
                <span>{order.stages.filter(s => s.status === "completed").length}/{order.stages.length} {t.orders.stages.toLowerCase()}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
