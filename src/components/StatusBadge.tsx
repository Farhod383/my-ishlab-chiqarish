import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, AlertTriangle, Loader2, XCircle } from "lucide-react";

type Status = "pending" | "in_progress" | "completed" | "delayed" | "cancelled" | "on_time" | "risk";

const map: Record<Status, { label: string; cls: string; Icon: any }> = {
  pending:     { label: "Kutilmoqda",     cls: "bg-muted text-muted-foreground border-border",                      Icon: Clock },
  in_progress: { label: "Jarayonda",      cls: "bg-status-blue/10 text-status-blue border-status-blue/30",          Icon: Loader2 },
  completed:   { label: "Tugallangan",    cls: "bg-status-green/10 text-status-green border-status-green/30",       Icon: CheckCircle2 },
  delayed:     { label: "Kechikkan",      cls: "bg-status-red/10 text-status-red border-status-red/30",             Icon: AlertTriangle },
  cancelled:   { label: "Bekor qilingan", cls: "bg-muted text-muted-foreground border-border",                      Icon: XCircle },
  on_time:     { label: "Muddatida",      cls: "bg-status-green/10 text-status-green border-status-green/30",       Icon: CheckCircle2 },
  risk:        { label: "Risk",           cls: "bg-status-yellow/15 text-status-yellow border-status-yellow/30",    Icon: AlertTriangle },
};

export function StatusBadge({ status, className, label }: { status: Status; className?: string; label?: string }) {
  const m = map[status] ?? map.pending;
  const Icon = m.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", m.cls, className)}>
      <Icon className={cn("h-3 w-3", status === "in_progress" && "animate-spin")} />
      {label ?? m.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: "normal" | "exception" }) {
  if (priority === "exception") {
    return <span className="inline-flex items-center gap-1 rounded-full border border-status-red/40 bg-status-red/10 text-status-red px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">Istisno</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">Oddiy</span>;
}

export function HealthDot({ color }: { color: "green" | "yellow" | "red" }) {
  const cls = color === "green" ? "bg-status-green" : color === "yellow" ? "bg-status-yellow" : "bg-status-red";
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", cls)} />;
}
