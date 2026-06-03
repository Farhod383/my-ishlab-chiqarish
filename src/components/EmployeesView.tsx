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
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
  const { hasRole } = useAuth();
  const canExport = hasRole(["admin", "hr", "warehouse", "cashier"]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Employee | null>(null);

  const load = async () => {
    const [eRes, aRes] = await Promise.all([
      supabase.from("employees").select("*").order("full_name"),
      supabase
        .from("instrument_assignments")
        .select("*, instrument:instruments(name, inventory_number, price, currency)")
        .order("issued_at", { ascending: false })
        .limit(1000),
    ]);
    setEmployees((eRes.data as any) ?? []);
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

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => q ? employees.filter(e =>
      [e.full_name, e.position, e.department, e.phone].some(v => (v ?? "").toString().toLowerCase().includes(q))
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

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString() : "—";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Xodimlarni qidirish..." className="max-w-md" />
        <span className="text-xs text-muted-foreground">Faqat ko'rish</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ism</TableHead>
                  <TableHead>Lavozim</TableHead>
                  <TableHead>Bo'lim</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead className="text-right">Instrumentlar</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(e => (
                  <TableRow key={e.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setActive(e)}>
                    <TableCell className="font-medium">{e.full_name}</TableCell>
                    <TableCell className="text-sm">{e.position || "—"}</TableCell>
                    <TableCell className="text-sm">{e.department || "—"}</TableCell>
                    <TableCell className="text-sm">{e.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === "active" ? "default" : "secondary"}>
                        {e.status === "active" ? "Faol" : "Nofaol"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{heldCount[e.id] ?? 0}</TableCell>
                    <TableCell onClick={(ev) => { ev.stopPropagation(); setActive(e); }}>
                      <Button size="sm" variant="ghost"><Eye className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Xodimlar yo'q</TableCell></TableRow>
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
                <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{active.full_name}</DialogTitle>
                <DialogDescription>
                  {active.position} {active.department && `· ${active.department}`} {active.phone && `· ${active.phone}`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Wrench className="h-4 w-4 text-status-green" />Hozir berilgan ({empCurrent.length})</h3>
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Instrument</TableHead>
                        <TableHead className="text-right">Miqdor</TableHead>
                        <TableHead>Berilgan sana</TableHead>
                        <TableHead>Bergan</TableHead>
                        <TableHead>Izoh</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {empCurrent.map(a => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{a.instrument?.name ?? "—"} {a.instrument?.inventory_number && <span className="text-xs text-muted-foreground">#{a.instrument.inventory_number}</span>}</TableCell>
                            <TableCell className="text-right font-mono">{a.quantity}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{fmtDate(a.issued_at)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{a.issued_by ? (profiles[a.issued_by] ?? "—") : "—"}</TableCell>
                            <TableCell className="text-xs italic text-muted-foreground max-w-[220px] truncate">{a.issue_comment ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                        {empCurrent.length === 0 && (
                          <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4 text-sm">Hozir berilgan instrumentlar yo'q</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-2"><Wrench className="h-4 w-4 text-muted-foreground" />Tarixi ({empHistory.length})</h3>
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Instrument</TableHead>
                        <TableHead className="text-right">Miqdor</TableHead>
                        <TableHead>Berilgan</TableHead>
                        <TableHead>Qaytarilgan</TableHead>
                        <TableHead>Bergan</TableHead>
                        <TableHead>Qabul qilgan</TableHead>
                        <TableHead>Izoh</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {empHistory.map(a => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{a.instrument?.name ?? "—"}</TableCell>
                            <TableCell className="text-right font-mono">{a.quantity}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{fmtDate(a.issued_at)}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap text-status-green">{fmtDate(a.returned_at)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{a.issued_by ? (profiles[a.issued_by] ?? "—") : "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{a.returned_by ? (profiles[a.returned_by] ?? "—") : "—"}</TableCell>
                            <TableCell className="text-xs italic text-muted-foreground max-w-[200px] truncate">{a.return_comment ?? a.issue_comment ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                        {empHistory.length === 0 && (
                          <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-4 text-sm">Tarixiy yozuvlar yo'q</TableCell></TableRow>
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
