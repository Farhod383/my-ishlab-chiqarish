import { cn } from "@/lib/utils";

export const PRIORITY_OPTIONS = [
  { value: "green", label: "Yashil — kerak bo'lganda", color: "bg-status-green" },
  { value: "yellow", label: "Sariq — o'rtacha", color: "bg-status-yellow" },
  { value: "red", label: "Qizil — doimo kerak", color: "bg-status-red" },
] as const;

export function PriorityDot({ priority, className }: { priority?: string; className?: string }) {
  const p = PRIORITY_OPTIONS.find(o => o.value === priority) ?? PRIORITY_OPTIONS[0];
  return <span title={p.label} className={cn("inline-block h-2.5 w-2.5 rounded-full", p.color, className)} />;
}
