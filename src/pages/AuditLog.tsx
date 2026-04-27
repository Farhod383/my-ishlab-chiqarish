import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, Search } from "lucide-react";
import { useI18n } from "@/i18n/context";

export default function AuditLog() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<any[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("audit_log").select("*, order:orders(order_number)").order("created_at", { ascending: false }).limit(200);
      setLogs(data ?? []);
    })();
  }, []);
  const filtered = logs.filter(l => !q || l.action.toLowerCase().includes(q.toLowerCase()) || (l.details ?? "").toLowerCase().includes(q.toLowerCase()) || (l.actor_name ?? "").toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" />{t.audit.title}</h1>
          <p className="text-sm text-muted-foreground">{t.audit.subtitle}</p>
        </div>
        <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-8 w-64" placeholder={t.common.search} value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>{t.audit.cols.date}</TableHead><TableHead>{t.audit.cols.who}</TableHead><TableHead>{t.audit.cols.action}</TableHead><TableHead>{t.audit.cols.order}</TableHead><TableHead>{t.audit.cols.details}</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{l.actor_name ?? t.common.system}</TableCell>
                  <TableCell className="text-sm font-medium">{l.action}</TableCell>
                  <TableCell className="text-sm font-mono">{l.order?.order_number ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.details ?? "—"}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t.audit.none}</TableCell></TableRow>}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
