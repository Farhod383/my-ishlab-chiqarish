import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, AlertTriangle, Loader2, XCircle } from "lucide-react";
import { useI18n } from "@/i18n/context";

type Status = "pending" | "in_progress" | "completed" | "delayed" | "cancelled" | "on_time" | "risk";

const meta: Record<Status, { cls: string; Icon: any }> = {
  pending:     { cls: "bg-muted text-muted-foreground border-border",                      Icon: Clock },
  in_progress: { cls: "bg-status-blue/10 text-status-blue border-status-blue/30",          Icon: Loader2 },
  completed:   { cls: "bg-status-green/10 text-status-green border-status-green/30",       Icon: CheckCircle2 },
  delayed:     { cls: "bg-status-red/10 text-status-red border-status-red/30",             Icon: AlertTriangle },
  cancelled:   { cls: "bg-muted text-muted-foreground border-border",                      Icon: XCircle },
  on_time:     { cls: "bg-status-green/10 text-status-green border-status-green/30",       Icon: CheckCircle2 },
  risk:        { cls: "bg-status-yellow/15 text-status-yellow border-status-yellow/30",    Icon: AlertTriangle },
};

export function StatusBadge({ status, className, label }: { status: Status; className?: string; label?: string }) {
  const { t } = useI18n();
  const m = meta[status] ?? meta.pending;
  const Icon = m.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", m.cls, className)}>
      <Icon className={cn("h-3 w-3", status === "in_progress" && "animate-spin")} />
      {label ?? (t.status as any)[status] ?? status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: "normal" | "exception" }) {
  const { t } = useI18n();
  if (priority === "exception") {
    return <span className="inline-flex items-center gap-1 rounded-full border border-status-red/40 bg-status-red/10 text-status-red px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">{t.priority.exception}</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">{t.priority.normal}</span>;
}

export function HealthDot({ color }: { color: "green" | "yellow" | "red" }) {
  const cls = color === "green" ? "bg-status-green" : color === "yellow" ? "bg-status-yellow" : "bg-status-red";
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", cls)} />;
}
