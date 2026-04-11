import { useI18n } from "@/i18n/context";
import { demoWorkers } from "@/data/demo";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function WorkerStats() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t.workers.title}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {demoWorkers.map((w) => (
          <Card key={w.id}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold text-lg">{w.name}</p>
                  <p className="text-sm text-muted-foreground">{w.role}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">{w.efficiency}%</p>
                  <p className="text-xs text-muted-foreground">{t.workers.efficiency}</p>
                </div>
              </div>

              <Progress value={w.efficiency} className="h-2 mb-4" />

              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="bg-muted rounded-md py-2">
                  <p className="font-semibold">{w.completedStages}</p>
                  <p className="text-xs text-muted-foreground">{t.workers.completedStages}</p>
                </div>
                <div className="bg-muted rounded-md py-2">
                  <p className="font-semibold">{w.avgTimeHours} {t.common.hours}</p>
                  <p className="text-xs text-muted-foreground">{t.workers.avgTime}</p>
                </div>
                <div className="bg-muted rounded-md py-2">
                  <p className="font-semibold">{w.partsUsed}</p>
                  <p className="text-xs text-muted-foreground">{t.workers.partsUsed}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
