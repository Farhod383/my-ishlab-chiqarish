import { useI18n } from "@/i18n/context";
import { demoOrders } from "@/data/demo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { Link } from "react-router-dom";
import { ClipboardList, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

const statusLabels: Record<string, string> = {
  pending: "Kutilmoqda",
  in_progress: "Jarayonda",
  completed: "Tugallangan",
  delayed: "Kechikkan",
};

export default function Dashboard() {
  const { t } = useI18n();
  const total = demoOrders.length;
  const active = demoOrders.filter((o) => o.status === "in_progress").length;
  const completed = demoOrders.filter((o) => o.status === "completed").length;
  const delayed = demoOrders.filter((o) => o.status === "delayed").length;
  const alerts = demoOrders.flatMap((o) => o.parts.filter((p) => p.actualQuantity > p.normQuantity));

  const stats = [
    { label: t.dashboard.totalOrders, value: total, icon: ClipboardList, color: "text-primary" },
    { label: t.dashboard.activeOrders, value: active, icon: Clock, color: "text-status-blue" },
    { label: t.dashboard.completedOrders, value: completed, icon: CheckCircle2, color: "text-status-green" },
    { label: t.dashboard.overdueOrders, value: delayed, icon: AlertTriangle, color: "text-status-red" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.dashboard.title}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-3xl font-bold mt-1">{s.value}</p>
                </div>
                <s.icon className={`h-10 w-10 ${s.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {alerts.length > 0 && (
        <Card className="border-status-red/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-status-red">
              <AlertTriangle className="h-4 w-4" /> {t.dashboard.warehouseAlerts} ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {alerts.map((p, i) => (
                <li key={i}>
                  <span className="font-medium">{p.partName}</span>: {p.actualQuantity}/{p.normQuantity} {p.unit} — {t.warehouse.overNorm}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t.dashboard.recentOrders}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">{t.orders.orderNumber}</th>
                  <th className="text-left py-2 pr-4">{t.orders.client}</th>
                  <th className="text-left py-2 pr-4">{t.orders.product}</th>
                  <th className="text-left py-2 pr-4">{t.orders.priority}</th>
                  <th className="text-left py-2 pr-4">{t.orders.status}</th>
                  <th className="text-left py-2">{t.orders.deadline}</th>
                </tr>
              </thead>
              <tbody>
                {demoOrders.map((o) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2.5 pr-4">
                      <Link to={`/orders/${o.id}`} className="text-primary hover:underline font-medium">{o.orderNumber}</Link>
                    </td>
                    <td className="py-2.5 pr-4">{o.client}</td>
                    <td className="py-2.5 pr-4">{o.product}</td>
                    <td className="py-2.5 pr-4"><PriorityBadge priority={o.priority} /></td>
                    <td className="py-2.5 pr-4"><StatusBadge status={o.status} label={statusLabels[o.status]} /></td>
                    <td className="py-2.5">{o.deadline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
