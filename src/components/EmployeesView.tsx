import { useWarehouseText } from "@/i18n/warehouseContext";
import { newDoc } from "@/lib/pdfExport";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Users, Wrench, Eye, FileDown } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useLocalize } from "@/i18n/context";
import { matchesAcrossScripts } from "@/lib/translit";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { useEmployees } from "@/hooks/useEmployees";
import { fmtDate as fmtDateG, fmtDateTime24 } from "@/lib/format";
import EmployeeProductHistory from '@/components/warehouse/EmployeeProductHistory';

type Employee = {
  id: string;
  full_name: string;
  position: string;
  department: string;
  phone: string | null;
  hire_date: string;
  status: string;
};

type Assignment = {
  id: string;
  employee_id: string;
  quantity: number;
  issued_at: string;
  returned_at: string | null;
  issue_comment: string | null;
  return_comment: string | null;
  issued_by: string | null;
  returned_by: string | null;
  instrument?: { name: string; inventory_number: string | null; price: number | null; currency: string | null } | null;
};

/**
 * Read-only employees tab for warehouse. Lets warehouse staff browse employees
 * and inspect a profile with full instrument history (current + returned).
 */
export default function EmployeesView() {
  const wt = useWarehouseText();
  const { hasRole } = useAuth();
  const canExport = hasRole(["admin", "hr", "warehouse", "cashier"]);
  const localize = useLocalize();
  const { allEmployees } = useEmployees();
  const employees = allEmployees as any as Employee[];
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Employee | null>(null);

  const load = async () => {
    const [aRes] = await Promise.all([
      supabase
        .from("instrument_assignments")
        .select("*, instrument:instruments(name, inventory_number, price, currency)")
        .order("issued_at", { ascending: false })
        .limit(1000),
    ]);
    setAssignments((aRes.data as any) ?? []);
    const ids = Array.from(new Set(((aRes.data ?? []) as any[]).flatMap(a => [a.issued_by, a.returned_by]).filter(Boolean)));
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = p.full_name || p.email || ""; });
      setProfiles(map);
    }
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("emp-view")
      .on("postgres_changes", { event: "*", schema: "public", table: "instrument_assignments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const q = search.trim();
  const filtered = useMemo(
    () => q ? employees.filter(e =>
      [e.full_name, e.position, e.department, e.phone].some(v => matchesAcrossScripts(String(v ?? ""), q))
    ) : employees,
    [employees, q]
  );

  const heldCount = useMemo(() => {
    const m: Record<string, number> = {};
    assignments.filter(a => !a.returned_at).forEach(a => { m[a.employee_id] = (m[a.employee_id] ?? 0) + 1; });
    return m;
  }, [assignments]);

  const empAssignments = active ? assignments.filter(a => a.employee_id === active.id) : [];
  const empCurrent = empAssignments.filter(a => !a.returned_at);
  const empHistory = empAssignments.filter(a => a.returned_at);

  const fmtDate = (s: string | null) => s ? fmtDateTime24(s) : "—";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Xodimlarni qidirish..." className="max-w-md" />
        <span className="text-xs text-muted-foreground">{wt("Faqat ko'rish")}</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{wt("Ism")}</TableHead>
                  <TableHead>{wt("Lavozim")}</TableHead>
                  <TableHead>{wt("Bo'lim")}</TableHead>
                  <TableHead>{wt("Telefon")}</TableHead>
                  <TableHead>{wt("Holat")}</TableHead>
                  <TableHead className="text-right">{wt("Instrumentlar")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(e => (
                  <TableRow key={e.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setActive(e)}>
                    <TableCell className="font-medium">{localize(e.full_name)}</TableCell>
                    <TableCell className="text-sm">{localize(e.position) || "—"}</TableCell>
                    <TableCell className="text-sm">{localize(e.department) || "—"}</TableCell>
                    <TableCell className="text-sm">{e.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === "active" ? "default" : "secondary"}>
                        {e.status === "active" ? wt("Faol") : wt("Bo'shagan")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{heldCount[e.id] ?? 0}</TableCell>
                    <TableCell onClick={(ev) => { ev.stopPropagation(); setActive(e); }}>
                      <Button size="sm" variant="ghost"><Eye className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{wt("Xodimlar yo'q")}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{localize(active.full_name)}</DialogTitle>
                <DialogDescription>
                  {localize(active.position)} {active.department && `· ${localize(active.department)}`} {active.phone && `· ${active.phone}`}
                </DialogDescription>
              </DialogHeader>

              {canExport && (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => void exportEmployeePDF(active, empCurrent, empHistory, profiles, wt, localize)}>
                    <FileDown className="h-4 w-4 mr-2" />{wt("PDF yuklab olish")}</Button>
                </div>
              )}

              <div className="space-y-4">
                <EmployeeProductHistory employeeId={active.id} />
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Wrench className="h-4 w-4 text-status-green" />{wt("Hozir berilgan (")}{empCurrent.length})</h3>
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>{wt("Instrument")}</TableHead>
                        <TableHead className="text-right">{wt("Miqdor")}</TableHead>
                        <TableHead className="text-right">{wt("Narx")}</TableHead>
                        <TableHead>{wt("Berilgan sana")}</TableHead>
                        <TableHead>{wt("Bergan")}</TableHead>
                        <TableHead>{wt("Izoh")}</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {empCurrent.map(a => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{a.instrument?.name ?? "—"} {a.instrument?.inventory_number && <span className="text-xs text-muted-foreground">#{a.instrument.inventory_number}</span>}</TableCell>
                            <TableCell className="text-right font-mono">{a.quantity}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{Number(a.instrument?.price ?? 0) > 0 ? `${Number(a.instrument?.price).toLocaleString("ru-RU")} ${a.instrument?.currency ?? ""}` : "—"}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{fmtDateTime24(a.issued_at)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{a.issued_by ? (profiles[a.issued_by] ?? "—") : "—"}</TableCell>
                            <TableCell className="text-xs italic text-muted-foreground max-w-[220px] truncate">{a.issue_comment ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                        {empCurrent.length === 0 && (
                          <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4 text-sm">{wt("Hozir berilgan instrumentlar yo'q")}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Wrench className="h-4 w-4 text-muted-foreground" />{wt("Tarixi (")}{empHistory.length})</h3>
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>{wt("Instrument")}</TableHead>
                        <TableHead className="text-right">{wt("Miqdor")}</TableHead>
                        <TableHead className="text-right">{wt("Narx")}</TableHead>
                        <TableHead>{wt("Berilgan")}</TableHead>
                        <TableHead>{wt("Qaytarilgan")}</TableHead>
                        <TableHead>{wt("Bergan")}</TableHead>
                        <TableHead>{wt("Qabul qilgan")}</TableHead>
                        <TableHead>{wt("Izoh")}</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {empHistory.map(a => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{a.instrument?.name ?? "—"}</TableCell>
                            <TableCell className="text-right font-mono">{a.quantity}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{Number(a.instrument?.price ?? 0) > 0 ? `${Number(a.instrument?.price).toLocaleString("ru-RU")} ${a.instrument?.currency ?? ""}` : "—"}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{fmtDateTime24(a.issued_at)}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap text-status-green">{fmtDateTime24(a.returned_at)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{a.issued_by ? (profiles[a.issued_by] ?? "—") : "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{a.returned_by ? (profiles[a.returned_by] ?? "—") : "—"}</TableCell>
                            <TableCell className="text-xs italic text-muted-foreground max-w-[200px] truncate">{a.return_comment ?? a.issue_comment ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                        {empHistory.length === 0 && (
                          <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-4 text-sm">{wt("Tarixiy yozuvlar yo'q")}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const fmtMoney = (n: number) => Number(n || 0).toLocaleString("ru-RU");
const fmtDT = (s?: string | null) => s ? fmtDateTime24(s) : "—";

async function exportEmployeePDF(
  emp: Employee,
  current: Assignment[],
  history: Assignment[],
  profiles: Record<string, string>,
  wt: (text: string) => string,
  localize: (text?: string | null) => string,
) {
  const doc = await newDoc("pt");
  const W = doc.internal.pageSize.getWidth();
  let y = 40;

  doc.setFont("DV", "bold"); doc.setFontSize(16);
  doc.text(wt("Zavod - Xodim instrument hisoboti"), W / 2, y, { align: "center" });
  y += 20;
  doc.setFontSize(12); doc.setTextColor(90, 70, 160);
  doc.text(localize(emp.full_name), W / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 14;
  doc.setFont("DV", "normal"); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
  doc.text(("" + wt("Yaratilgan:") + " " + (fmtDateTime24(new Date())) + ""), W / 2, y, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 14;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { font: "DV", fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [120, 90, 200] },
    head: [[wt("Maydon"), wt("Qiymat")]],
    body: [
      [wt("F.I.SH"), emp.full_name],
      [wt("Lavozim"), emp.position || "—"],
      [wt("Bo'lim"), emp.department || "—"],
      [wt("Telefon"), emp.phone ?? "—"],
      [wt("Holat"), emp.status === "active" ? wt("Faol") : wt("Bo'shagan")],
    ],
    columnStyles: { 0: { cellWidth: 130, fontStyle: "bold", fillColor: [245, 240, 255] } },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  doc.setFont("DV", "bold"); doc.setFontSize(12);
  doc.text((wt("Hozir berilgan (") + (current.length) + ")"), 40, y); y += 6;
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { font: "DV", fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [120, 90, 200] },
    head: [[wt("Instrument"), wt("Miqdor"), wt("Narx"), wt("Valyuta"), wt("Berilgan sana")]],
    body: current.length === 0
      ? [[wt("Yo'q"), "", "", "", ""]]
      : current.map(a => [
          a.instrument?.name ?? "—",
          String(a.quantity),
          fmtMoney(Number(a.instrument?.price ?? 0)),
          a.instrument?.currency ?? "—",
          fmtDT(a.issued_at),
        ]),
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  doc.setFont("DV", "bold"); doc.setFontSize(12);
  doc.text((wt("Tarixi (") + (history.length) + ")"), 40, y); y += 6;
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { font: "DV", fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [120, 90, 200] },
    head: [[wt("Instrument"), wt("Miqdor"), wt("Berilgan"), wt("Qaytarilgan"), wt("Bergan"), wt("Izoh")]],
    body: history.length === 0
      ? [[wt("Yo'q"), "", "", "", "", ""]]
      : history.map(a => [
          a.instrument?.name ?? "—",
          String(a.quantity),
          fmtDT(a.issued_at),
          fmtDT(a.returned_at),
          a.issued_by ? (profiles[a.issued_by] ?? "—") : "—",
          a.return_comment ?? a.issue_comment ?? "—",
        ]),
    columnStyles: { 1: { halign: "right" } },
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  // Totals
  const totals: Record<string, number> = {};
  current.forEach(a => {
    const cur = a.instrument?.currency ?? "UZS";
    const price = Number(a.instrument?.price ?? 0);
    totals[cur] = (totals[cur] ?? 0) + price * Number(a.quantity);
  });
  doc.setFont("DV", "bold"); doc.setFontSize(11);
  doc.text(wt("Umumiy qiymat (hozir berilgan):"), 40, y); y += 14;
  doc.setFont("DV", "normal"); doc.setFontSize(10);
  const entries = Object.entries(totals);
  if (entries.length === 0) {
    doc.text("—", 40, y); y += 14;
  } else {
    entries.forEach(([cur, sum]) => {
      const suffix = cur === "USD" ? "$" : cur === "UZS" ? "so'm" : cur;
      doc.text(`${cur}: ${fmtMoney(sum)} ${suffix}`, 40, y);
      y += 14;
    });
  }

  doc.save(`${emp.full_name.replace(/\s+/g, "_")}-instrumentlar.pdf`);
}
