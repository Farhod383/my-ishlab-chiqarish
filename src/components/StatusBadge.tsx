import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      status: {
        green: "bg-status-green/15 text-status-green",
        yellow: "bg-status-yellow/15 text-status-yellow",
        red: "bg-status-red/15 text-status-red",
        blue: "bg-status-blue/15 text-status-blue",
        gray: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { status: "gray" },
  }
);

export function getStatusColor(status: string): "green" | "yellow" | "red" | "blue" | "gray" {
  switch (status) {
    case "completed": return "green";
    case "in_progress": return "blue";
    case "delayed": case "overdue": return "red";
    case "pending": return "yellow";
    default: return "gray";
  }
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={cn(badgeVariants({ status: getStatusColor(status) }))}>{label}</span>;
}

export function PriorityBadge({ priority }: { priority: "normal" | "exception" }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
      priority === "exception" ? "bg-status-red/15 text-status-red" : "bg-muted text-muted-foreground"
    )}>
      {priority === "exception" ? "⚡ Istisno" : "Oddiy"}
    </span>
  );
}
