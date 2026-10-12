export type OrderReportFilter = "all" | "completed" | "in_progress" | "delayed";

type ReportOrder = {
  status: string;
  deadline?: string | null;
  order_date: string;
  order_number: string;
  product_name: string;
  client?: { name: string } | null;
};

export function reportDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function matchesReportStatus(order: ReportOrder, filter: OrderReportFilter, today = reportDay()): boolean {
  if (filter === "all") return true;
  if (filter === "delayed") {
    return order.status !== "completed" && order.status !== "cancelled" && Boolean(order.deadline && order.deadline < today);
  }
  return order.status === filter;
}

export function matchesReportSearch(order: ReportOrder, query: string, from: string, to: string): boolean {
  const text = `${order.order_number} ${order.product_name} ${order.client?.name ?? ""}`.toLowerCase();
  return text.includes(query.trim().toLowerCase()) && (!from || order.order_date >= from) && (!to || order.order_date <= to);
}