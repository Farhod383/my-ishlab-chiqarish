import { fmtDate, fmtDateTime24 } from "@/lib/format";

export function supplyRequestDates(item: {
  created_at?: string | null;
  required_date?: string | null;
  fulfilled_at?: string | null;
  status: string;
}) {
  const dateOnly = !!item.required_date && /^\d{4}-\d{2}-\d{2}$/.test(item.required_date);
  return {
    given: fmtDateTime24(item.created_at),
    deadline: dateOnly ? `${fmtDate(item.required_date)} · Vaqt belgilanmagan` : fmtDateTime24(item.required_date),
    fulfilled: item.status === "fulfilled" ? fmtDateTime24(item.fulfilled_at) : "—",
  };
}