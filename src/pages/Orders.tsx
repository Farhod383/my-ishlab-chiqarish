import { useI18n } from "@/i18n/context";
import { demoOrders } from "@/data/demo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { Link } from "react-router-dom";

const statusLabels: Record<string, string> = {
  pending: "Kutilmoqda",
  in_progress: "Jarayonda",
  completed: "Tugallangan",
  delayed: "Kechikkan",
};

export default function Orders() {
  const { t } = useI18n();

  // Sort: exception first, then by created date
  const sorted = [...demoOrders].sort((a, b) => {
    if (a.priority === "exception" && b.priority !== "exception") return -1;
    if (b.priority === "exception" && a.priority !== "exception") return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t.orders.title}</h1>
        <span className="text-sm text-muted-foreground">{demoOrders.length} {t.orders.title.toLowerCase()}</span>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">#</th>
                  <th className="text-left py-2 pr-4">{t.orders.orderNumber}</th>
                  <th className="text-left py-2 pr-4">{t.orders.client}</th>
                  <th className="text-left py-2 pr-4">{t.orders.product}</th>
                  <th className="text-left py-2 pr-4">{t.orders.quantity}</th>
                  <th className="text-left py-2 pr-4">{t.orders.priority}</th>
                  <th className="text-left py-2 pr-4">{t.orders.status}</th>
                  <th className="text-left py-2 pr-4">{t.orders.deadline}</th>
                  <th className="text-left py-2">{t.orders.actions}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o, i) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 pr-4 text-muted-foreground">{i + 1}</td>
                    <td className="py-3 pr-4 font-medium">{o.orderNumber}</td>
                    <td className="py-3 pr-4">{o.client}</td>
                    <td className="py-3 pr-4">{o.product}</td>
                    <td className="py-3 pr-4">{o.quantity} {t.common.pieces}</td>
                    <td className="py-3 pr-4"><PriorityBadge priority={o.priority} /></td>
                    <td className="py-3 pr-4"><StatusBadge status={o.status} label={statusLabels[o.status]} /></td>
                    <td className="py-3 pr-4">{o.deadline}</td>
                    <td className="py-3">
                      <Link to={`/orders/${o.id}`} className="text-primary hover:underline text-sm font-medium">
                        {t.orders.detail} →
                      </Link>
                    </td>
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
