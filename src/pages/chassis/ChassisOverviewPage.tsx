import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plus, FileSignature } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChassisHeader, STATUS_LABEL, useChassisCan } from "@/components/chassis/ChassisUI";
import { useChassisText } from "@/i18n/chassis";
import { CHASSIS_FLOW, CHASSIS_TONE, cdb, fmtSum, type ChassisStatus } from "@/lib/chassis";
import { cn } from "@/lib/utils";

interface Alert { kind: string; severity: string; entity: string; entity_id: string; title: string; detail: string | null; since: string }
interface Balance { spec_line_id: string; client_name: string; contract_no: string; spec_no: string; body_type_name: string; qty: number | null; in_acts: number; remaining: number | null }
interface Monthly { month: string; body_type_name: string | null; received: number; shipped: number; acts_gross: number }

export default function ChassisOverviewPage() {
  const tr = useChassisText();
  const can = useChassisCan();
  const nav = useNavigate();
  const thisMonth = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7) + "-01";

  const counts = useQuery({
    queryKey: ["chassis", "status-counts"],
    queryFn: async () => {
      const { data, error } = await cdb.from("chassis").select("status");
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const r of data ?? []) out[r.status] = (out[r.status] ?? 0) + 1;
      return out;
    },
  });
  const alerts = useQuery({
    queryKey: ["chassis", "alerts"],
    queryFn: async (): Promise<Alert[]> => {
      const { data, error } = await cdb.from("chassis_alerts").select("*").order("since");
      if (error) throw error;
      return data ?? [];
    },
  });
  const balance = useQuery({
    queryKey: ["chassis", "spec-balance"],
    queryFn: async (): Promise<Balance[]> => {
      const { data, error } = await cdb.from("chassis_spec_balance").select("*").order("spec_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const monthly = useQuery({
    queryKey: ["chassis", "monthly", thisMonth],
    queryFn: async (): Promise<Monthly[]> => {
      const { data, error } = await cdb.from("chassis_monthly").select("*").eq("month", thisMonth);
      if (error) throw error;
      return data ?? [];
    },
  });
  const totals = useMemo(() => (monthly.data ?? []).reduce((s, r) => ({
    received: s.received + Number(r.received), shipped: s.shipped + Number(r.shipped), gross: s.gross + Number(r.acts_gross),
  }), { received: 0, shipped: 0, gross: 0 }), [monthly.data]);

  const openAlert = (a: Alert) => {
    if (a.entity === "act") nav(`/chassis/acts?act=${a.entity_id}`);
    else if (a.entity === "order") nav(`/orders/${a.entity_id}`);
    else nav(`/chassis/registry?id=${a.entity_id}`);
  };

  return (
    <div className="space-y-6">
      <ChassisHeader title="Shassi" hint="Buyurtmachi shassilari: qabuldan ESF yopilguncha"
        actions={<>
          {can("receive") && <Button variant="outline" asChild><Link to="/chassis/receive"><Plus className="h-4 w-4 mr-1" />{tr("Qabul")}</Link></Button>}
          {can("act") && <Button asChild><Link to="/chassis/acts"><FileSignature className="h-4 w-4 mr-1" />{tr("Akt tuzish")}</Link></Button>}
        </>} />

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        {CHASSIS_FLOW.map((s: ChassisStatus) => (
          <button key={s} type="button" onClick={() => nav(`/chassis/registry?status=${s}`)}
            className="text-left rounded-lg border bg-card p-3 hover:border-primary transition-colors">
            <div className="text-2xl font-bold tabular-nums">{counts.data?.[s] ?? 0}</div>
            <div className="text-xs text-muted-foreground">{tr(STATUS_LABEL[s])}</div>
            <div className={cn("mt-2 h-1 rounded-full border", CHASSIS_TONE[s])} />
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-status-yellow" />{tr("Diqqat talab qiladi")}
            {!!alerts.data?.length && <span className="rounded-full bg-status-red/10 text-status-red text-xs px-2">{alerts.data.length}</span>}
          </CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {alerts.isLoading && <p className="text-sm text-muted-foreground">{tr("Yuklanmoqda…")}</p>}
            {alerts.data?.length === 0 && <p className="text-sm text-muted-foreground">{tr("Hammasi joyida")}</p>}
            {alerts.data?.map((a) => (
              <button key={a.kind + a.entity_id} type="button" onClick={() => openAlert(a)}
                className={cn("w-full text-left rounded-md border border-l-4 px-3 py-2 hover:bg-muted/50",
                  a.severity === "high" ? "border-l-status-red" : a.severity === "low" ? "border-l-border" : "border-l-status-yellow")}>
                <div className="text-sm font-medium">{a.title}</div>
                {a.detail && <div className="text-xs text-muted-foreground">{a.detail}</div>}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">{tr("Oy yakuni")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Kpi v={String(totals.received)} k={tr("Qabul qilindi")} />
              <Kpi v={String(totals.shipped)} k={tr("Topshirildi")} />
              <Kpi v={fmtSum(totals.gross)} k={tr("Aktlar summasi, QQS bilan")} />
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader><TableRow><TableHead>{tr("Ustqurma")}</TableHead><TableHead className="text-right">{tr("Qabul")}</TableHead><TableHead className="text-right">{tr("Topshirildi")}</TableHead><TableHead className="text-right">{tr("Summa")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(monthly.data ?? []).map((r, i) => <TableRow key={i}>
                    <TableCell>{r.body_type_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.received}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.shipped}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtSum(r.acts_gross)}</TableCell>
                  </TableRow>)}
                  {monthly.data?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{tr("Bu oyda harakat yo'q")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{tr("Spetsifikatsiya qoldig'i")}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{tr("Buyurtmachi")}</TableHead><TableHead>{tr("Shartnoma / spetsifikatsiya")}</TableHead><TableHead>{tr("Ustqurma")}</TableHead>
                <TableHead className="text-right">{tr("Shartnoma bo'yicha")}</TableHead><TableHead className="text-right">{tr("Aktlarda")}</TableHead><TableHead className="text-right">{tr("Qoldiq")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(balance.data ?? []).map((b) => <TableRow key={b.spec_line_id}>
                  <TableCell>{b.client_name}</TableCell>
                  <TableCell className="whitespace-nowrap">№ {b.contract_no} · {tr("spets.")} № {b.spec_no}</TableCell>
                  <TableCell>{b.body_type_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.qty ?? tr("cheklanmagan")}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.in_acts}</TableCell>
                  <TableCell className={cn("text-right tabular-nums font-semibold", b.remaining === 0 && "text-muted-foreground")}>{b.remaining ?? "—"}</TableCell>
                </TableRow>)}
                {balance.data?.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{tr("Spetsifikatsiya hali kiritilmagan")}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ v, k }: { v: string; k: string }) {
  return <div className="rounded-md border p-3"><div className="text-lg font-bold tabular-nums">{v}</div><div className="text-xs text-muted-foreground">{k}</div></div>;
}
