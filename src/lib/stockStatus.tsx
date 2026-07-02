// Unified stock status classification used across the ERP.
// Rules:
//  - red    → stock_qty <= 0 (tugagan / manfiy)
//  - yellow → 0 < stock_qty <= min_limit  (kam qolgan)
//             agar min_limit = 0 bo'lsa — yellow ishlatilmaydi
//  - green  → yetarli

export type StockStatus = "green" | "yellow" | "red";

export function getStockStatus(qty: number, minLimit: number): StockStatus {
  const q = Number(qty) || 0;
  const m = Number(minLimit) || 0;
  if (q <= 0) return "red";
  if (m > 0 && q <= m) return "yellow";
  return "green";
}

export const stockStatusMeta: Record<StockStatus, { label: string; dot: string; text: string; bg: string; border: string; ring: string }> = {
  green:  { label: "Yetarli",   dot: "bg-status-green", text: "text-status-green", bg: "bg-status-green/10",  border: "border-status-green/30",  ring: "ring-status-green/30" },
  yellow: { label: "Kam qoldi", dot: "bg-status-yellow",text: "text-status-yellow",bg: "bg-status-yellow/10", border: "border-status-yellow/30", ring: "ring-status-yellow/30" },
  red:    { label: "Tugagan",   dot: "bg-status-red",   text: "text-status-red",   bg: "bg-status-red/10",    border: "border-status-red/30",    ring: "ring-status-red/40" },
};

export function StockDot({ status, className = "" }: { status: StockStatus; className?: string }) {
  const m = stockStatusMeta[status];
  return (
    <span
      title={m.label}
      className={`inline-block h-2.5 w-2.5 rounded-full ${m.dot} ring-2 ${m.ring} ${className}`}
    />
  );
}
