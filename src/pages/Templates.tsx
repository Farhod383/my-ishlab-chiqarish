import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Templates() {
  const [tpls, setTpls] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("stage_templates").select("*, template_stages(*)").order("created_at", { ascending: false });
      setTpls(data ?? []);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bosqich shablonlari</h1>
        <p className="text-sm text-muted-foreground">Yangi zakaz yaratishda foydalanish uchun</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {tpls.map(t => {
          const stages = (t.template_stages ?? []).sort((a:any,b:any) => a.stage_order - b.stage_order);
          return (
            <Card key={t.id}>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4" />{t.name}</CardTitle><CardDescription>{stages.length} bosqich</CardDescription></CardHeader>
              <CardContent className="space-y-2">
                {stages.map((s:any) => (
                  <div key={s.id} className="flex items-center justify-between text-sm border rounded p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-mono text-xs">{s.stage_order}.</span>
                      <span className="font-medium">{s.name}</span>
                      {s.qc_required && <Badge variant="outline" className="text-primary border-primary/30 text-xs"><ShieldCheck className="h-3 w-3 mr-1" />QC</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground">{s.norm_days} kun</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
        {tpls.length === 0 && <Card className="md:col-span-2"><CardContent className="py-10 text-center text-muted-foreground">Shablonlar yo'q. Yangi zakaz yaratishda "shablon sifatida saqlash" tugmasini ishlating.</CardContent></Card>}
      </div>
    </div>
  );
}
