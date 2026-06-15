import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Wrench, Wallet } from "lucide-react";
import { fmtNum } from "@/lib/format";

export const SALARY_KINDS = ["salary", "advance", "bonus", "penalty", "other"] as const;
export type SalaryKind = typeof SALARY_KINDS[number];

export const SALARY_KIND_LABELS: Record<SalaryKind, string> = {
  salary: "Oylik",
  advance: "Avans",
  bonus: "Bonus",
  penalty: "Jarima",
  other: "Boshqa",
};

const CUR_SYMBOL: Record<string, string> = { UZS: "so'm", USD: "$", EUR: "€", RUB: "₽", CNY: "¥" };

type Props = {
  employee: any | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export default function EmployeeDetailDialog({ employee, open, onOpenChange }: Props) {
  const [payments, setPayments] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");

  useEffect(() => {
    if (!open || !employee?.id) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      const [{ data: pays }, { data: asg }] = await Promise.all([
        supabase
          .from("cash_expenses")
          .select("id, amount, currency, total_uzs, expense_date, payment_type, salary_kind, reason, comment, created_by")
          .eq("recipient_id", employee.id)
          .order("expense_date", { ascending: false }),
        supabase
          .from("instrument_assignments")
          .select("id, quantity, issued_at, returned_at, issue_comment, return_comment, instrument:instruments(name, unit)")
          .eq("employee_id", employee.id)
          .order("issued_at", { ascending: false }),
      ]);
      if (!mounted) return;
      // Resolve creator names via profiles.
      let paysData: any[] = pays ?? [];
      const ids = Array.from(new Set(paysData.map((p: any) => p.created_by).filter(Boolean)));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
        paysData = paysData.map((p: any) => ({ ...p, _creator: map.get(p.created_by) }));
      }
      setPayments(paysData);
      setAssignments(asg ?? []);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [open, employee?.id]);

  const monthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime();
  }, [open]);

  const monthSummary = useMemo(() => {
    const m = { salary: 0, advance: 0, bonus: 0, penalty: 0, other: 0 } as Record<SalaryKind, number>;
    for (const p of payments) {
      const t = new Date(p.expense_date).getTime();
      if (t < monthStart) continue;
      const k = (SALARY_KINDS as readonly string[]).includes(p.salary_kind) ? (p.salary_kind as SalaryKind) : "other";
      m[k] += Number(p.total_uzs || p.amount) || 0;
    }
    return m;
  }, [payments, monthStart]);

  const filtered = useMemo(() => payments.filter((p) => {
    if (kindFilter !== "all" && (p.salary_kind ?? "other") !== kindFilter) return false;
    const s = search.trim().toLowerCase();
    if (!s) return true;
    const hay = `${p.reason ?? ""} ${p.comment ?? ""} ${p.amount ?? ""} ${p.currency ?? ""} ${p.expense_date ?? ""} ${SALARY_KIND_LABELS[(p.salary_kind ?? "other") as SalaryKind] ?? ""}`.toLowerCase();
    return hay.includes(s);
  }), [payments, search, kindFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {employee?.full_name}
            <Badge variant="outline" className="font-normal">{employee?.position}</Badge>
            {employee?.department && <Badge variant="secondary" className="font-normal">{employee.department}</Badge>}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="payments">
          <TabsList>
            <TabsTrigger value="payments"><Wallet className="h-4 w-4 mr-1" />To'lov tarixi</TabsTrigger>
            <TabsTrigger value="instruments"><Wrench className="h-4 w-4 mr-1" />Instrument tarixi</TabsTrigger>
          </TabsList>

          <TabsContent value="payments" className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["salary", "advance", "bonus", "penalty"] as SalaryKind[]).map((k) => (
                <Card key={k}><CardContent className="p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Joriy oy · {SALARY_KIND_LABELS[k]}</div>
                  <div className="text-lg font-mono font-semibold tabular-nums">{fmtNum(monthSummary[k])} <span className="text-xs text-muted-foreground font-sans">so'm</span></div>
                </CardContent></Card>
              ))}
            </div>

            <div className="flex gap-2 items-end">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Sana, summa, izoh, tur..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Barcha turlar</SelectItem>
                  {SALARY_KINDS.map((k) => <SelectItem key={k} value={k}>{SALARY_KIND_LABELS[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Sana</TableHead>
                  <TableHead>Turi</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                  <TableHead>Valyuta</TableHead>
                  <TableHead>Izoh</TableHead>
                  <TableHead>Kim kiritdi</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {loading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Yuklanmoqda…</TableCell></TableRow>}
                  {!loading && filtered.map((p) => {
                    const kind = ((SALARY_KINDS as readonly string[]).includes(p.salary_kind) ? p.salary_kind : "other") as SalaryKind;
                    const creator = (p.profiles?.full_name) || (p._creator?.full_name) || (p._creator?.email) || "—";
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm whitespace-nowrap">{new Date(p.expense_date).toLocaleString()}</TableCell>
                        <TableCell><Badge variant={kind === "penalty" ? "destructive" : "secondary"}>{SALARY_KIND_LABELS[kind]}</Badge></TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmtNum(Number(p.amount))}</TableCell>
                        <TableCell className="text-xs">{p.currency ?? "UZS"} <span className="text-muted-foreground">{CUR_SYMBOL[p.currency ?? "UZS"] ?? ""}</span></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{[p.reason, p.comment].filter(Boolean).join(" · ") || "—"}</TableCell>
                        <TableCell className="text-xs">{creator}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">To'lovlar topilmadi</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="instruments" className="space-y-3">
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Instrument</TableHead>
                  <TableHead className="text-right">Soni</TableHead>
                  <TableHead>Berilgan</TableHead>
                  <TableHead>Qaytarilgan</TableHead>
                  <TableHead>Izoh</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {loading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Yuklanmoqda…</TableCell></TableRow>}
                  {!loading && assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm">{a.instrument?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum(Number(a.quantity))} {a.instrument?.unit ?? ""}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{new Date(a.issued_at).toLocaleString()}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{a.returned_at ? new Date(a.returned_at).toLocaleString() : <Badge variant="outline">Qaytarilmagan</Badge>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{[a.issue_comment, a.return_comment].filter(Boolean).join(" · ") || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {!loading && assignments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Instrumentlar tarixi yo'q</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
