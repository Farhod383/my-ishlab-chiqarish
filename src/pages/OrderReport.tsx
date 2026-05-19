import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { useI18n } from "@/i18n/context";
import {
  ArrowLeft, Download, FileText, FileType2, Loader2, Calendar, User,
  Package, Wrench, ClipboardList, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/format";

export default function OrderReport() {
  const { id } = useParams();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [o, s, mv, lg] = await Promise.all([
        supabase.from("orders").select("*, client:clients(*)").eq("id", id).single(),
        supabase.from("order_stages").select("*").eq("order_id", id).order("stage_order"),
        supabase.from("stock_movements").select("*, product:products(name, unit, last_price)").eq("order_id", id).order("created_at"),
        supabase.from("audit_log").select("*").eq("order_id", id).order("created_at"),
      ]);
      setOrder(o.data);
      setStages(s.data ?? []);
      setMovements(mv.data ?? []);
      setLogs(lg.data ?? []);
      setLoading(false);
    })();
  }, [id]);

  const fmtMoney = (n: number) => fmtNum(n);
  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString("uz-UZ") : "—";
  const fmtDateTime = (d?: string | null) =>
    d ? new Date(d).toLocaleString("uz-UZ") : "—";

  // Cost rows (out movements)
  const costRows = useMemo(
    () =>
      movements
        .filter((m) => m.direction === "out")
        .map((m) => {
          const price =
            Number(m.unit_price) > 0
              ? Number(m.unit_price)
              : Number(m.product?.last_price ?? 0);
          return {
            id: m.id,
            name: m.product?.name ?? "—",
            unit: m.product?.unit ?? "",
            qty: Number(m.quantity),
            price,
            total: price * Number(m.quantity),
            recipient: m.recipient_name,
            date: m.created_at,
          };
        }),
    [movements],
  );
  const totalCost = costRows.reduce((s, r) => s + r.total, 0);

  // Daily timeline (group by date) — uses stage events + audit log
  const timeline = useMemo(() => {
    const events: { date: string; who: string; what: string }[] = [];
    stages.forEach((s) => {
      if (s.started_at) {
        events.push({
          date: new Date(s.started_at).toISOString().slice(0, 10),
          who: s.worker_name ?? "—",
          what: `${s.name} — ${t.report.tl.started}`,
        });
      }
      if (s.finished_at) {
        events.push({
          date: new Date(s.finished_at).toISOString().slice(0, 10),
          who: s.worker_name ?? "—",
          what: `${s.name} — ${t.report.tl.finished}`,
        });
      }
      if (s.handover_comment) {
        events.push({
          date: new Date(s.finished_at ?? s.started_at ?? s.created_at).toISOString().slice(0, 10),
          who: s.worker_name ?? "—",
          what: `${s.name} — ${t.report.tl.handover}: "${s.handover_comment}"`,
        });
      }
    });
    logs.forEach((l) => {
      events.push({
        date: new Date(l.created_at).toISOString().slice(0, 10),
        who: l.actor_name ?? "—",
        what: `${l.action}${l.details ? ` — ${l.details}` : ""}`,
      });
    });
    // Group by date
    const byDate = new Map<string, { who: string; what: string }[]>();
    events
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((e) => {
        if (!byDate.has(e.date)) byDate.set(e.date, []);
        byDate.get(e.date)!.push({ who: e.who, what: e.what });
      });
    return Array.from(byDate.entries());
  }, [stages, logs, t]);

  const exportFile = async (format: "docx" | "pdf") => {
    setExporting(format);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fn = format === "pdf" ? "export-order-pdf" : "export-order-docx";
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ orderId: id }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${order.order_number}-hisobot.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(t.common.download);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExporting(null);
    }
  };

  if (loading || !order)
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  const startedAt = stages[0]?.started_at;
  const finishedAt = [...stages].reverse().find((s) => s.finished_at)?.finished_at;

  return (
    <div className="space-y-6 print:space-y-3">
      {/* Header / actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/orders/${order.id}`}>
            <ArrowLeft className="h-4 w-4 mr-1" /> {t.orderDetail.backToList}
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => exportFile("docx")}
            disabled={exporting !== null}
          >
            {exporting === "docx" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Word (.docx)
          </Button>
          <Button
            onClick={() => exportFile("pdf")}
            disabled={exporting !== null}
          >
            {exporting === "pdf" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileType2 className="h-4 w-4 mr-2" />
            )}
            PDF
          </Button>
        </div>
      </div>

      {/* Title */}
      <Card className="border-primary/30">
        <CardContent className="p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {t.report.title}
              </p>
              <h1 className="text-3xl font-bold tracking-tight mt-1">
                {order.order_number}
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                {order.product_name} · {order.quantity} {t.common.pieces}
              </p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <PriorityBadge priority={order.priority} />
                <StatusBadge status={order.status as any} />
              </div>
            </div>
            <div className="text-right text-sm space-y-1">
              <div className="flex items-center gap-2 justify-end">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{t.report.startDate}:</span>
                <span className="font-mono font-semibold">{fmtDate(startedAt ?? order.order_date)}</span>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{t.report.endDate}:</span>
                <span className="font-mono font-semibold">{fmtDate(finishedAt)}</span>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{t.orderDetail.client}:</span>
                <span className="font-semibold">{order.client?.name ?? "—"}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            {t.report.timeline}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.report.noTimeline}</p>
          ) : (
            <div className="space-y-4">
              {timeline.map(([date, items]) => (
                <div key={date} className="flex gap-4">
                  <div className="shrink-0 w-28 pt-1">
                    <Badge variant="outline" className="font-mono">
                      {date}
                    </Badge>
                  </div>
                  <div className="flex-1 space-y-1.5 border-l-2 border-primary/30 pl-4">
                    {items.map((it, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-semibold text-primary">{it.who}</span>
                        <span className="text-muted-foreground"> — </span>
                        <span>{it.what}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stages detail */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            {t.report.stages}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">№</TableHead>
                <TableHead>{t.report.stage}</TableHead>
                <TableHead>{t.report.worker}</TableHead>
                <TableHead>{t.report.started}</TableHead>
                <TableHead>{t.report.finished}</TableHead>
                <TableHead>{t.report.handoverComment}</TableHead>
                <TableHead>{t.orders.cols.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono">{s.stage_order}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.worker_name ?? "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(s.started_at)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(s.finished_at)}</TableCell>
                  <TableCell className="text-xs italic max-w-[260px]">
                    {s.handover_comment ? `"${s.handover_comment}"` : "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={s.status as any} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Materials usage */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            {t.report.materialsTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.report.materials}</TableHead>
                <TableHead className="text-right">{t.report.qty}</TableHead>
                <TableHead className="text-right">{t.report.price}</TableHead>
                <TableHead className="text-right">{t.report.total}</TableHead>
                <TableHead>{t.orderDetail.receivedBy}</TableHead>
                <TableHead>{t.report.dateCol}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    {t.report.noMovements}
                  </TableCell>
                </TableRow>
              )}
              {costRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.qty} {r.unit}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtMoney(r.price)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{fmtMoney(r.total)}</TableCell>
                  <TableCell className="text-sm">{r.recipient ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(r.date)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cost summary */}
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              {t.report.totalCost}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {costRows.length} {t.report.itemsCount}
            </div>
          </div>
          <div className="text-3xl font-bold font-mono text-primary">
            {fmtMoney(totalCost)} so'm
          </div>
        </CardContent>
      </Card>

      {/* Comments / handover summary */}
      {stages.some((s) => s.handover_comment) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              {t.report.handoverComments}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stages
              .filter((s) => s.handover_comment)
              .map((s) => (
                <div key={s.id} className="text-sm border-l-2 border-primary/40 pl-3 py-1">
                  <div className="font-semibold">
                    {s.name}{" "}
                    {s.worker_name && (
                      <span className="text-muted-foreground font-normal">
                        — {s.worker_name}
                      </span>
                    )}
                  </div>
                  <div className="italic text-muted-foreground">
                    "{s.handover_comment}"
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      <Separator />
      <p className="text-xs text-muted-foreground text-right italic">
        {t.report.generatedOn}: {new Date().toLocaleString("uz-UZ")}
      </p>
    </div>
  );
}
