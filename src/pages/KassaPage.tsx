import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wallet, Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { toast } from "sonner";

export default function KassaPage() {
  const { user, hasRole } = useAuth();
  const { t } = useI18n();
  const k = (t as any).kassa ?? {};
  const [expenses, setExpenses] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: 0, reason: "", recipient_id: "", recipient_manual: "", comment: "" });
  const [recipientMode, setRecipientMode] = useState<"employee" | "manual">("employee");

  const load = async () => {
    const [{ data: exp }, { data: emp }] = await Promise.all([
      supabase.from("cash_expenses").select("*, recipient:employees(full_name)").order("expense_date", { ascending: false }),
      supabase.from("employees").select("id, full_name, department").eq("status", "active").order("full_name"),
    ]);
    setExpenses(exp ?? []);
    setEmployees(emp ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const canManage = hasRole(["cashier", "admin"]);

  const fmt = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n));

  const save = async () => {
    if (!form.amount || !form.reason.trim()) { toast.error(k.fillFields ?? "Maydonlarni to'ldiring"); return; }
    const emp = employees.find(e => e.id === form.recipient_id);
    const { error } = await supabase.from("cash_expenses").insert({
      amount: form.amount,
      reason: form.reason.trim(),
      recipient_id: form.recipient_id || null,
      recipient_name: emp?.full_name ?? null,
      comment: form.comment.trim() || null,
      created_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(k.saved ?? "Saqlandi");
    setForm({ amount: 0, reason: "", recipient_id: "", comment: "" });
    setOpen(false);
    load();
  };

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Wallet className="h-6 w-6" />{k.title ?? "Kassa"}</h1>
          <p className="text-sm text-muted-foreground">{k.subtitle ?? "Xarajatlar ro'yxati"}</p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{k.addExpense ?? "Xarajat qo'shish"}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{k.addExpense ?? "Xarajat qo'shish"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>{k.amount ?? "Summa"}</Label><Input type="number" min={0} value={form.amount || ""} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} /></div>
                <div><Label>{k.reason ?? "Sabab"}</Label><Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
                <div><Label>{k.recipient ?? "Oluvchi"}</Label>
                  <Select value={form.recipient_id} onValueChange={v => setForm({ ...form, recipient_id: v })}>
                    <SelectTrigger><SelectValue placeholder={k.selectEmployee ?? "Xodimni tanlang"} /></SelectTrigger>
                    <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name} {e.department && `(${e.department})`}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>{k.comment ?? "Izoh"}</Label><Textarea value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} /></div>
                <Button className="w-full" onClick={save}>{t.common.save}</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k.totalExpenses ?? "Jami xarajatlar"}</div><div className="text-2xl font-bold font-mono mt-1">{fmt(totalExpenses)} {t.common.sum}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k.count ?? "Yozuvlar soni"}</div><div className="text-2xl font-bold font-mono mt-1">{expenses.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{k.date ?? "Sana"}</TableHead>
                  <TableHead className="text-right">{k.amount ?? "Summa"}</TableHead>
                  <TableHead>{k.reason ?? "Sabab"}</TableHead>
                  <TableHead>{k.recipient ?? "Oluvchi"}</TableHead>
                  <TableHead>{k.comment ?? "Izoh"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>}
                {!loading && expenses.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm whitespace-nowrap">{new Date(e.expense_date).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-status-red">{fmt(Number(e.amount))} {t.common.sum}</TableCell>
                    <TableCell className="text-sm">{e.reason}</TableCell>
                    <TableCell className="text-sm">{e.recipient?.full_name ?? e.recipient_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.comment ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {!loading && expenses.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{k.empty ?? "Xarajatlar yo'q"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
