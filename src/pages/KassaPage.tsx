import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Wallet, Plus, ArrowDownCircle, ArrowUpCircle, Users, Edit2, Search } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { toast } from "sonner";
import { logAudit } from "@/types/erp";

const PAYMENT_TYPES = ["cash", "card", "transfer", "other"];
const CURRENCIES = ["UZS", "USD", "EUR", "RUB", "CNY", "KZT", "TRY", "GBP", "AED", "INR", "JPY", "KRW", "CHF", "CAD", "AUD"];

type CurForm = { currency: string; exchange_rate: number };
const defaultCur: CurForm = { currency: "UZS", exchange_rate: 1 };

export default function KassaPage() {
  const { user, hasRole, profile } = useAuth() as any;
  const { t } = useI18n();
  const k = (t as any).kassa ?? {};
  const [expenses, setExpenses] = useState<any[]>([]);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"income" | "expense" | "employees">("income");
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [empStatusFilter, setEmpStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [empDeptFilter, setEmpDeptFilter] = useState("all");
  const [empOpen, setEmpOpen] = useState(false);
  const [empEditId, setEmpEditId] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState({ full_name: "", position: "", department: "", phone: "", salary: 0, hire_date: new Date().toISOString().slice(0,10), leave_date: "", status: "active" });
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [searchQ, setSearchQ] = useState("");

  // expense form
  const [openExp, setOpenExp] = useState(false);
  const [expEditId, setExpEditId] = useState<string | null>(null);
  const [expOrig, setExpOrig] = useState<any>(null);
  const [expForm, setExpForm] = useState({ amount: 0, reason: "", recipient_id: "", recipient_manual: "", comment: "", currency: "UZS", exchange_rate: 1 });
  const [recipientMode, setRecipientMode] = useState<"employee" | "manual">("employee");

  // income form
  const [openInc, setOpenInc] = useState(false);
  const [incEditId, setIncEditId] = useState<string | null>(null);
  const [incOrig, setIncOrig] = useState<any>(null);
  const [incForm, setIncForm] = useState({ amount: 0, source: "", payment_type: "cash", comment: "", currency: "UZS", exchange_rate: 1 });
  const [incFile, setIncFile] = useState<File | null>(null);

  const actorName = profile?.full_name || user?.email || null;

  const load = async () => {
    setLoading(true);
    const [{ data: exp }, { data: inc }, { data: emp }, { data: allEmp }] = await Promise.all([
      supabase.from("cash_expenses").select("*, recipient:employees(full_name)").order("expense_date", { ascending: false }),
      (supabase.from as any)("cash_incomes").select("*").order("income_date", { ascending: false }),
      supabase.from("employees").select("id, full_name, department").eq("status", "active").order("full_name"),
      supabase.from("employees").select("*").order("full_name"),
    ]);
    setExpenses(exp ?? []);
    setIncomes(inc ?? []);
    setEmployees(emp ?? []);
    setAllEmployees(allEmp ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const canManage = hasRole(["cashier", "admin"]);
  const fmt = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n));
  const computeUzs = (amount: number, currency: string, rate: number) =>
    currency === "UZS" ? Number(amount) || 0 : (Number(amount) || 0) * (Number(rate) || 0);

  const resetEmpForm = () => setEmpForm({ full_name: "", position: "", department: "", phone: "", salary: 0, hire_date: new Date().toISOString().slice(0,10), leave_date: "", status: "active" });

  const diffSummary = (oldR: any, newR: any, fields: string[]) =>
    fields
      .filter((f) => String(oldR?.[f] ?? "") !== String(newR?.[f] ?? ""))
      .map((f) => `${f}: ${oldR?.[f] ?? "—"} → ${newR?.[f] ?? "—"}`)
      .join("; ");

  const saveEmployee = async () => {
    if (!empForm.full_name.trim()) { toast.error(k.fillFields ?? "Maydonlarni to'ldiring"); return; }
    const payload: any = {
      full_name: empForm.full_name.trim(),
      position: empForm.position.trim(),
      department: empForm.department.trim(),
      phone: empForm.phone.trim() || null,
      salary: Number(empForm.salary) || 0,
      hire_date: empForm.hire_date,
      leave_date: empForm.leave_date || null,
      status: empForm.status,
    };
    if (empEditId) {
      const orig = allEmployees.find((x) => x.id === empEditId);
      const { error } = await supabase.from("employees").update(payload).eq("id", empEditId);
      if (error) { toast.error(error.message); return; }
      const summary = diffSummary(orig, payload, ["full_name", "position", "department", "phone", "salary", "hire_date", "leave_date", "status"]);
      await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: "kassa.employee.update", entity: "employees", details: `${payload.full_name}: ${summary || "no changes"}` });
    } else {
      const { error } = await supabase.from("employees").insert(payload);
      if (error) { toast.error(error.message); return; }
      await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: "kassa.employee.create", entity: "employees", details: `Created: ${payload.full_name}` });
    }
    toast.success(k.saved ?? "Saqlandi");
    setEmpOpen(false); setEmpEditId(null); resetEmpForm(); load();
  };

  const openEditEmp = (e: any) => {
    setEmpForm({
      full_name: e.full_name, position: e.position, department: e.department,
      phone: e.phone ?? "", salary: e.salary ?? 0,
      hire_date: e.hire_date, leave_date: e.leave_date ?? "", status: e.status,
    });
    setEmpEditId(e.id);
    setEmpOpen(true);
  };

  const toggleEmpStatus = async (e: any) => {
    const newStatus = e.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("employees").update({ status: newStatus, leave_date: newStatus === "inactive" ? new Date().toISOString().slice(0,10) : null }).eq("id", e.id);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: "kassa.employee.status", entity: "employees", details: `${e.full_name}: status ${e.status} → ${newStatus}` });
    toast.success(k.saved ?? "Saqlandi"); load();
  };

  const departments = useMemo(() => Array.from(new Set(allEmployees.map(e => e.department).filter(Boolean))), [allEmployees]);
  const filteredEmps = useMemo(() => allEmployees.filter(e => {
    if (empStatusFilter !== "all" && e.status !== empStatusFilter) return false;
    if (empDeptFilter !== "all" && e.department !== empDeptFilter) return false;
    const s = empSearch.trim().toLowerCase();
    if (s && !`${e.full_name} ${e.position} ${e.department} ${e.phone ?? ""}`.toLowerCase().includes(s)) return false;
    return true;
  }), [allEmployees, empSearch, empStatusFilter, empDeptFilter]);

  const inRange = (d: string) => {
    const t = new Date(d).getTime();
    if (filterFrom && t < new Date(filterFrom).getTime()) return false;
    if (filterTo && t > new Date(filterTo).getTime() + 86400000) return false;
    return true;
  };
  const matchSearch = (row: any, type: "income" | "expense") => {
    const s = searchQ.trim().toLowerCase();
    if (!s) return true;
    const hay = type === "income"
      ? `${row.source ?? ""} ${row.amount ?? ""} ${row.total_uzs ?? ""} ${row.comment ?? ""} ${row.payment_type ?? ""} ${row.currency ?? ""} kirim income`
      : `${row.recipient_name ?? row.recipient?.full_name ?? ""} ${row.reason ?? ""} ${row.amount ?? ""} ${row.total_uzs ?? ""} ${row.comment ?? ""} ${row.currency ?? ""} chiqim expense`;
    return hay.toLowerCase().includes(s);
  };
  const fExp = useMemo(() => expenses.filter(e => inRange(e.expense_date) && matchSearch(e, "expense")), [expenses, filterFrom, filterTo, searchQ]);
  const fInc = useMemo(() => incomes.filter(i => inRange(i.income_date) && matchSearch(i, "income")), [incomes, filterFrom, filterTo, searchQ]);

  const totalExp = fExp.reduce((s, e) => s + Number(e.total_uzs || e.amount || 0), 0);
  const totalInc = fInc.reduce((s, e) => s + Number(e.total_uzs || e.amount || 0), 0);
  const balance = totalInc - totalExp;

  const saveExpense = async () => {
    if (!expForm.amount || !expForm.reason.trim()) { toast.error(k.fillFields ?? "Maydonlarni to'ldiring"); return; }
    if (expForm.currency !== "UZS" && (!expForm.exchange_rate || expForm.exchange_rate <= 0)) {
      toast.error(k.enterRate ?? "Valyuta kursini kiriting"); return;
    }
    const emp = recipientMode === "employee" ? employees.find(e => e.id === expForm.recipient_id) : null;
    const recipientName = recipientMode === "employee" ? (emp?.full_name ?? null) : (expForm.recipient_manual.trim() || null);
    const rate = expForm.currency === "UZS" ? 1 : Number(expForm.exchange_rate) || 0;
    const total_uzs = computeUzs(expForm.amount, expForm.currency, rate);
    const payload: any = {
      amount: expForm.amount,
      reason: expForm.reason.trim(),
      recipient_id: recipientMode === "employee" ? (expForm.recipient_id || null) : null,
      recipient_name: recipientName,
      comment: expForm.comment.trim() || null,
      currency: expForm.currency,
      exchange_rate: rate,
      total_uzs,
    };
    if (expEditId) {
      const { error } = await supabase.from("cash_expenses").update(payload).eq("id", expEditId);
      if (error) { toast.error(error.message); return; }
      const summary = diffSummary(expOrig, payload, ["amount", "currency", "exchange_rate", "total_uzs", "reason", "recipient_name", "comment"]);
      await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: "kassa.expense.update", entity: "cash_expenses", details: summary || "no changes" });
    } else {
      const { error } = await supabase.from("cash_expenses").insert({ ...payload, created_by: user?.id });
      if (error) { toast.error(error.message); return; }
      await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: "kassa.expense.create", entity: "cash_expenses", details: `${payload.amount} ${payload.currency} = ${fmt(total_uzs)} UZS · ${payload.reason}` });
    }
    toast.success(k.saved ?? "Saqlandi");
    setExpForm({ amount: 0, reason: "", recipient_id: "", recipient_manual: "", comment: "", currency: "UZS", exchange_rate: 1 });
    setRecipientMode("employee");
    setExpEditId(null); setExpOrig(null);
    setOpenExp(false);
    load();
  };

  const openEditExp = (e: any) => {
    setExpEditId(e.id);
    setExpOrig(e);
    setExpForm({
      amount: Number(e.amount) || 0,
      reason: e.reason ?? "",
      recipient_id: e.recipient_id ?? "",
      recipient_manual: e.recipient_id ? "" : (e.recipient_name ?? ""),
      comment: e.comment ?? "",
      currency: e.currency ?? "UZS",
      exchange_rate: Number(e.exchange_rate) || 1,
    });
    setRecipientMode(e.recipient_id ? "employee" : "manual");
    setOpenExp(true);
  };

  const saveIncome = async () => {
    if (!incForm.amount || !incForm.source.trim()) { toast.error(k.fillFields ?? "Maydonlarni to'ldiring"); return; }
    if (incForm.currency !== "UZS" && (!incForm.exchange_rate || incForm.exchange_rate <= 0)) {
      toast.error(k.enterRate ?? "Valyuta kursini kiriting"); return;
    }
    let receipt_url: string | null = null;
    if (incFile) {
      const path = `incomes/${user?.id}/${Date.now()}-${incFile.name}`;
      const up = await supabase.storage.from("order-files").upload(path, incFile);
      if (up.error) { toast.error(up.error.message); return; }
      receipt_url = supabase.storage.from("order-files").getPublicUrl(path).data.publicUrl;
    }
    const rate = incForm.currency === "UZS" ? 1 : Number(incForm.exchange_rate) || 0;
    const total_uzs = computeUzs(incForm.amount, incForm.currency, rate);
    const payload: any = {
      amount: incForm.amount,
      source: incForm.source.trim(),
      payment_type: incForm.payment_type,
      comment: incForm.comment.trim() || null,
      currency: incForm.currency,
      exchange_rate: rate,
      total_uzs,
    };
    if (receipt_url) payload.receipt_url = receipt_url;
    if (incEditId) {
      const { error } = await (supabase.from as any)("cash_incomes").update(payload).eq("id", incEditId);
      if (error) { toast.error(error.message); return; }
      const summary = diffSummary(incOrig, payload, ["amount", "currency", "exchange_rate", "total_uzs", "source", "payment_type", "comment"]);
      await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: "kassa.income.update", entity: "cash_incomes", details: summary || "no changes" });
    } else {
      const { error } = await (supabase.from as any)("cash_incomes").insert({ ...payload, created_by: user?.id });
      if (error) { toast.error(error.message); return; }
      await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: "kassa.income.create", entity: "cash_incomes", details: `${payload.amount} ${payload.currency} = ${fmt(total_uzs)} UZS · ${payload.source}` });
    }
    toast.success(k.saved ?? "Saqlandi");
    setIncForm({ amount: 0, source: "", payment_type: "cash", comment: "", currency: "UZS", exchange_rate: 1 });
    setIncFile(null);
    setIncEditId(null); setIncOrig(null);
    setOpenInc(false);
    load();
  };

  const openEditInc = (i: any) => {
    setIncEditId(i.id);
    setIncOrig(i);
    setIncForm({
      amount: Number(i.amount) || 0,
      source: i.source ?? "",
      payment_type: i.payment_type ?? "cash",
      comment: i.comment ?? "",
      currency: i.currency ?? "UZS",
      exchange_rate: Number(i.exchange_rate) || 1,
    });
    setIncFile(null);
    setOpenInc(true);
  };

  const renderCurrencyFields = (form: any, setForm: (v: any) => void) => (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label>{k.currency ?? "Valyuta"}</Label>
        <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v, exchange_rate: v === "UZS" ? 1 : (form.exchange_rate || 0) })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {form.currency !== "UZS" && (
        <div>
          <Label>{k.exchangeRate ?? "Valyuta kursi"}</Label>
          <Input type="number" min={0} value={form.exchange_rate || ""} onChange={(e) => setForm({ ...form, exchange_rate: Number(e.target.value) })} placeholder="0" />
        </div>
      )}
      {form.currency !== "UZS" && Number(form.amount) > 0 && Number(form.exchange_rate) > 0 && (
        <div className="col-span-2 text-xs text-muted-foreground">
          = <span className="font-mono font-semibold text-foreground">{fmt(Number(form.amount) * Number(form.exchange_rate))} UZS</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Wallet className="h-6 w-6" />{k.title ?? "Kassa"}</h1>
          <p className="text-sm text-muted-foreground">{k.subtitle ?? "Kirim / Chiqim"}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k.balance ?? "Balans"}</div><div className={`text-2xl font-bold font-mono mt-1 ${balance < 0 ? "text-status-red" : "text-status-green"}`}>{fmt(balance)} {t.common.sum}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k.totalIncome ?? "Jami kirim"}</div><div className="text-2xl font-bold font-mono mt-1 text-status-green">{fmt(totalInc)} {t.common.sum}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{k.totalExpenses ?? "Jami chiqim"}</div><div className="text-2xl font-bold font-mono mt-1 text-status-red">{fmt(totalExp)} {t.common.sum}</div></CardContent></Card>
      </div>

      <div className="flex gap-2 items-end flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Label className="text-xs">{k.search ?? "Qidirish"}</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder={k.searchPh ?? "Oluvchi, manba, summa, izoh, valyuta..."} value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          </div>
        </div>
        <div><Label className="text-xs">{k.from ?? "Dan"}</Label><Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} /></div>
        <div><Label className="text-xs">{k.to ?? "Gacha"}</Label><Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} /></div>
        {(filterFrom || filterTo || searchQ) && <Button variant="outline" onClick={() => { setFilterFrom(""); setFilterTo(""); setSearchQ(""); }}>{k.reset ?? "Tozalash"}</Button>}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="income"><ArrowDownCircle className="h-4 w-4 mr-1 text-status-green" />{k.income ?? "Kirim"}</TabsTrigger>
          <TabsTrigger value="expense"><ArrowUpCircle className="h-4 w-4 mr-1 text-status-red" />{k.expense ?? "Chiqim"}</TabsTrigger>
          <TabsTrigger value="employees"><Users className="h-4 w-4 mr-1" />{k.employees ?? "Xodimlar"}</TabsTrigger>
        </TabsList>

        <TabsContent value="income" className="space-y-3">
          {canManage && (
            <Dialog open={openInc} onOpenChange={(o) => { setOpenInc(o); if (!o) { setIncEditId(null); setIncOrig(null); setIncForm({ amount: 0, source: "", payment_type: "cash", comment: "", currency: "UZS", exchange_rate: 1 }); setIncFile(null); } }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{k.addIncome ?? "Kirim qo'shish"}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{incEditId ? ((t as any).kassaExtra?.editIncome ?? "Kirimni tahrirlash") : (k.addIncome ?? "Kirim qo'shish")}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>{k.amount ?? "Summa"}</Label><Input type="number" min={0} value={incForm.amount || ""} onChange={e => setIncForm({ ...incForm, amount: Number(e.target.value) })} /></div>
                  {renderCurrencyFields(incForm, setIncForm)}
                  <div><Label>{k.source ?? "Kimdan / Manba"}</Label><Input placeholder={k.sourcePlaceholder ?? "Mijoz, qarz qaytarish, ..."} value={incForm.source} onChange={e => setIncForm({ ...incForm, source: e.target.value })} /></div>
                  <div>
                    <Label>{k.paymentType ?? "To'lov turi"}</Label>
                    <Select value={incForm.payment_type} onValueChange={v => setIncForm({ ...incForm, payment_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_TYPES.map(p => <SelectItem key={p} value={p}>{(k.pt?.[p]) ?? p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>{k.comment ?? "Izoh"}</Label><Textarea value={incForm.comment} onChange={e => setIncForm({ ...incForm, comment: e.target.value })} /></div>
                  <div><Label>{k.receipt ?? "Chek / Fayl"}</Label><Input type="file" onChange={e => setIncFile(e.target.files?.[0] ?? null)} /></div>
                  <Button className="w-full" onClick={saveIncome}>{t.common.save}</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          <Card><CardContent className="p-0">
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{k.date ?? "Sana"}</TableHead>
                  <TableHead className="text-right">{k.amount ?? "Summa"}</TableHead>
                  <TableHead>{k.currency ?? "Valyuta"}</TableHead>
                  <TableHead className="text-right">{k.exchangeRate ?? "Kurs"}</TableHead>
                  <TableHead className="text-right">{k.totalUzs ?? "UZS jami"}</TableHead>
                  <TableHead>{k.source ?? "Manba"}</TableHead>
                  <TableHead>{k.paymentType ?? "To'lov turi"}</TableHead>
                  <TableHead>{k.comment ?? "Izoh"}</TableHead>
                  <TableHead>{k.receipt ?? "Chek"}</TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {loading && <TableRow><TableCell colSpan={canManage ? 10 : 9} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>}
                  {!loading && fInc.map(i => (
                    <TableRow key={i.id}>
                      <TableCell className="text-sm whitespace-nowrap">{new Date(i.income_date).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-status-green">{fmt(Number(i.amount))}</TableCell>
                      <TableCell className="text-xs"><Badge variant="secondary">{i.currency ?? "UZS"}</Badge></TableCell>
                      <TableCell className="text-right text-xs font-mono">{(i.currency ?? "UZS") === "UZS" ? "—" : fmt(Number(i.exchange_rate ?? 1))}</TableCell>
                      <TableCell className="text-right font-mono text-status-green">{fmt(Number(i.total_uzs || i.amount))} {t.common.sum}</TableCell>
                      <TableCell className="text-sm">{i.source}</TableCell>
                      <TableCell className="text-sm">{(k.pt?.[i.payment_type]) ?? i.payment_type ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.comment ?? "—"}</TableCell>
                      <TableCell>{i.receipt_url ? <a href={i.receipt_url} target="_blank" rel="noreferrer" className="text-primary underline text-xs">{k.view ?? "Ko'rish"}</a> : "—"}</TableCell>
                      {canManage && <TableCell><Button size="sm" variant="ghost" onClick={() => openEditInc(i)}><Edit2 className="h-3 w-3" /></Button></TableCell>}
                    </TableRow>
                  ))}
                  {!loading && fInc.length === 0 && <TableRow><TableCell colSpan={canManage ? 10 : 9} className="text-center text-muted-foreground py-8">{k.emptyIncome ?? "Kirimlar yo'q"}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="expense" className="space-y-3">
          {canManage && (
            <Dialog open={openExp} onOpenChange={(o) => { setOpenExp(o); if (!o) { setExpEditId(null); setExpOrig(null); setExpForm({ amount: 0, reason: "", recipient_id: "", recipient_manual: "", comment: "", currency: "UZS", exchange_rate: 1 }); setRecipientMode("employee"); } }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{k.addExpense ?? "Xarajat qo'shish"}</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{expEditId ? ((t as any).kassaExtra?.editExpense ?? "Xarajatni tahrirlash") : (k.addExpense ?? "Xarajat qo'shish")}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>{k.amount ?? "Summa"}</Label><Input type="number" min={0} value={expForm.amount || ""} onChange={e => setExpForm({ ...expForm, amount: Number(e.target.value) })} /></div>
                  {renderCurrencyFields(expForm, setExpForm)}
                  <div><Label>{k.reason ?? "Sabab"}</Label><Input value={expForm.reason} onChange={e => setExpForm({ ...expForm, reason: e.target.value })} /></div>
                  <div>
                    <Label>{k.recipient ?? "Oluvchi"}</Label>
                    <div className="flex gap-2 mt-1 mb-2">
                      <Button type="button" size="sm" variant={recipientMode === "employee" ? "default" : "outline"} onClick={() => setRecipientMode("employee")}>{k.fromEmployees ?? "Xodimdan"}</Button>
                      <Button type="button" size="sm" variant={recipientMode === "manual" ? "default" : "outline"} onClick={() => setRecipientMode("manual")}>{k.manualInput ?? "Boshqa"}</Button>
                    </div>
                    {recipientMode === "employee" ? (
                      <Select value={expForm.recipient_id} onValueChange={v => setExpForm({ ...expForm, recipient_id: v })}>
                        <SelectTrigger><SelectValue placeholder={k.selectEmployee ?? "Xodimni tanlang"} /></SelectTrigger>
                        <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name} {e.department && `(${e.department})`}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input placeholder={k.recipientPlaceholder ?? "Yandex, Dostavka, ..."} value={expForm.recipient_manual} onChange={e => setExpForm({ ...expForm, recipient_manual: e.target.value })} />
                    )}
                  </div>
                  <div><Label>{k.comment ?? "Izoh"}</Label><Textarea value={expForm.comment} onChange={e => setExpForm({ ...expForm, comment: e.target.value })} /></div>
                  <Button className="w-full" onClick={saveExpense}>{t.common.save}</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          <Card><CardContent className="p-0">
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{k.date ?? "Sana"}</TableHead>
                  <TableHead className="text-right">{k.amount ?? "Summa"}</TableHead>
                  <TableHead>{k.currency ?? "Valyuta"}</TableHead>
                  <TableHead className="text-right">{k.exchangeRate ?? "Kurs"}</TableHead>
                  <TableHead className="text-right">{k.totalUzs ?? "UZS jami"}</TableHead>
                  <TableHead>{k.reason ?? "Sabab"}</TableHead>
                  <TableHead>{k.recipient ?? "Oluvchi"}</TableHead>
                  <TableHead>{k.comment ?? "Izoh"}</TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {loading && <TableRow><TableCell colSpan={canManage ? 9 : 8} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>}
                  {!loading && fExp.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm whitespace-nowrap">{new Date(e.expense_date).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-status-red">{fmt(Number(e.amount))}</TableCell>
                      <TableCell className="text-xs"><Badge variant="secondary">{e.currency ?? "UZS"}</Badge></TableCell>
                      <TableCell className="text-right text-xs font-mono">{(e.currency ?? "UZS") === "UZS" ? "—" : fmt(Number(e.exchange_rate ?? 1))}</TableCell>
                      <TableCell className="text-right font-mono text-status-red">{fmt(Number(e.total_uzs || e.amount))} {t.common.sum}</TableCell>
                      <TableCell className="text-sm">{e.reason}</TableCell>
                      <TableCell className="text-sm">{e.recipient?.full_name ?? e.recipient_name ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.comment ?? "—"}</TableCell>
                      {canManage && <TableCell><Button size="sm" variant="ghost" onClick={() => openEditExp(e)}><Edit2 className="h-3 w-3" /></Button></TableCell>}
                    </TableRow>
                  ))}
                  {!loading && fExp.length === 0 && <TableRow><TableCell colSpan={canManage ? 9 : 8} className="text-center text-muted-foreground py-8">{k.empty ?? "Xarajatlar yo'q"}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="employees" className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder={k.searchEmployee ?? "Qidirish..."} value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
            </div>
            <Select value={empStatusFilter} onValueChange={(v: any) => setEmpStatusFilter(v)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{k.allStatuses ?? "Barcha holat"}</SelectItem>
                <SelectItem value="active">{k.active ?? "Faol"}</SelectItem>
                <SelectItem value="inactive">{k.inactive ?? "Nofaol"}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={empDeptFilter} onValueChange={setEmpDeptFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{k.allDepartments ?? "Barcha bo'lim"}</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            {canManage && (
              <Dialog open={empOpen} onOpenChange={(o) => { setEmpOpen(o); if (!o) { setEmpEditId(null); resetEmpForm(); } }}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{k.addEmployee ?? "Xodim qo'shish"}</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{empEditId ? (k.editEmployee ?? "Tahrirlash") : (k.addEmployee ?? "Xodim qo'shish")}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>{k.fullName ?? "To'liq ism"}</Label><Input value={empForm.full_name} onChange={e => setEmpForm({ ...empForm, full_name: e.target.value })} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>{k.position ?? "Lavozim"}</Label><Input value={empForm.position} onChange={e => setEmpForm({ ...empForm, position: e.target.value })} /></div>
                      <div><Label>{k.department ?? "Bo'lim"}</Label><Input value={empForm.department} onChange={e => setEmpForm({ ...empForm, department: e.target.value })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>{k.phone ?? "Telefon"}</Label><Input value={empForm.phone} onChange={e => setEmpForm({ ...empForm, phone: e.target.value })} placeholder="+998..." /></div>
                      <div><Label>{k.salary ?? "Maosh"}</Label><Input type="number" min={0} value={empForm.salary || ""} onChange={e => setEmpForm({ ...empForm, salary: Number(e.target.value) })} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>{k.hireDate ?? "Ish boshlagan"}</Label><Input type="date" value={empForm.hire_date} onChange={e => setEmpForm({ ...empForm, hire_date: e.target.value })} /></div>
                      <div><Label>{k.leaveDate ?? "Ketgan sana"}</Label><Input type="date" value={empForm.leave_date} onChange={e => setEmpForm({ ...empForm, leave_date: e.target.value })} /></div>
                    </div>
                    <div>
                      <Label>{k.status ?? "Holat"}</Label>
                      <Select value={empForm.status} onValueChange={v => setEmpForm({ ...empForm, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">{k.active ?? "Faol"}</SelectItem>
                          <SelectItem value="inactive">{k.inactive ?? "Nofaol"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="w-full" onClick={saveEmployee}>{t.common.save}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <Card><CardContent className="p-0">
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{k.fullName ?? "Ism"}</TableHead>
                  <TableHead>{k.position ?? "Lavozim"}</TableHead>
                  <TableHead>{k.department ?? "Bo'lim"}</TableHead>
                  <TableHead>{k.phone ?? "Telefon"}</TableHead>
                  <TableHead className="text-right">{k.salary ?? "Maosh"}</TableHead>
                  <TableHead>{k.hireDate ?? "Ish boshlagan"}</TableHead>
                  <TableHead>{k.status ?? "Holat"}</TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {loading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>}
                  {!loading && filteredEmps.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.full_name}</TableCell>
                      <TableCell className="text-sm">{e.position}</TableCell>
                      <TableCell className="text-sm">{e.department}</TableCell>
                      <TableCell className="text-sm">{e.phone ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{e.salary ? `${fmt(Number(e.salary))} ${t.common.sum}` : "—"}</TableCell>
                      <TableCell className="text-sm">{e.hire_date}</TableCell>
                      <TableCell>
                        <Badge variant={e.status === "active" ? "default" : "secondary"}>
                          {e.status === "active" ? (k.active ?? "Faol") : (k.inactive ?? "Nofaol")}
                        </Badge>
                      </TableCell>
                      {canManage && (
                        <TableCell className="whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => openEditEmp(e)}><Edit2 className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleEmpStatus(e)}>{e.status === "active" ? (k.deactivate ?? "O'chirish") : (k.activate ?? "Faollash")}</Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {!loading && filteredEmps.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{k.emptyEmployees ?? "Xodimlar yo'q"}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
