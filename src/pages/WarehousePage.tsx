import { useI18n } from "@/i18n/context";
import { demoOrders } from "@/data/demo";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

export default function WarehousePage() {
  const { t } = useI18n();

  // Aggregate all parts across orders
  const allParts = demoOrders.flatMap((o) =>
    o.parts.map((p) => ({ ...p, orderNumber: o.orderNumber, orderId: o.id }))
  );

  const overNormParts = allParts.filter((p) => p.actualQuantity > p.normQuantity);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.warehouse.title}</h1>

      {overNormParts.length > 0 && (
        <Card className="border-status-red/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-status-red font-semibold mb-3">
              <AlertTriangle className="h-4 w-4" /> {t.warehouse.alert}: {overNormParts.length} ta detal normadan oshgan
            </div>
            <div className="space-y-1 text-sm">
              {overNormParts.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Link to={`/orders/${p.orderId}`} className="text-primary hover:underline">{p.orderNumber}</Link>
                  <span>— {p.partName}: {p.actualQuantity}/{p.normQuantity} (+{p.actualQuantity - p.normQuantity})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">{t.orders.orderNumber}</th>
                  <th className="text-left py-2 pr-4">{t.warehouse.part}</th>
                  <th className="text-left py-2 pr-4">{t.warehouse.unit}</th>
                  <th className="text-left py-2 pr-4">{t.warehouse.normUsage}</th>
                  <th className="text-left py-2 pr-4">{t.warehouse.actualUsage}</th>
                  <th className="text-left py-2 pr-4">{t.warehouse.difference}</th>
                  <th className="text-left py-2">{t.warehouse.takenBy}</th>
                </tr>
              </thead>
              <tbody>
                {allParts.map((p, idx) => {
                  const diff = p.actualQuantity - p.normQuantity;
                  const isOver = diff > 0;
                  return (
                    <tr key={idx} className={`border-b last:border-0 ${isOver ? "bg-status-red/5" : ""}`}>
                      <td className="py-2.5 pr-4">
                        <Link to={`/orders/${p.orderId}`} className="text-primary hover:underline">{p.orderNumber}</Link>
                      </td>
                      <td className="py-2.5 pr-4 font-medium">{p.partName}</td>
                      <td className="py-2.5 pr-4">{p.unit}</td>
                      <td className="py-2.5 pr-4">{p.normQuantity}</td>
                      <td className="py-2.5 pr-4">{p.actualQuantity}</td>
                      <td className="py-2.5 pr-4">
                        {isOver ? (
                          <span className="text-status-red font-semibold flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />+{diff}
                          </span>
                        ) : diff === 0 && p.actualQuantity === 0 ? "—" : String(diff)}
                      </td>
                      <td className="py-2.5 text-xs">
                        {p.takenBy.map((t, i) => (
                          <span key={i} className="block">{t.workerName}: {t.amount}</span>
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
    </div>
  );
}
