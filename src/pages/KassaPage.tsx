import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureOnline } from "@/components/OnlineGuard";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Wallet, Plus, ArrowDownCircle, ArrowUpCircle, Edit2, Trash2, Search, FileBarChart, Truck, Download } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { useI18n, useLocalize } from "@/i18n/context";
import { toast } from "sonner";
import { logAudit } from "@/types/erp";
import { notify } from "@/lib/notify";
import { fmtKassaAmount, fmtNum, fmtDateTime24 } from "@/lib/format";
import SupplyFinancePage from "@/pages/SupplyFinancePage";
import { useEmployees, refreshEmployees } from "@/hooks/useEmployees";

const PAYMENT_TYPES = ["cash", "transfer", "corporate_card"] as const;
type PaymentType = typeof PAYMENT_TYPES[number] | "other";

// Locale-aware payment-type labels. Legacy `card` rows are surfaced under
// `corporate_card` since that is what they always represented in practice.
const PAYMENT_LABELS: Record<string, Record<string, string>> = {
  uz:  { cash: "Naqd pul",   corporate_card: "Korporativ karta", transfer: "Bank o'tkazma", other: "Boshqa" },
  uzc: { cash: "Нақд пул",   corporate_card: "Корпоратив карта", transfer: "Банк ўтказма",  other: "Бошқа" },
  ru:  { cash: "Наличные",   corporate_card: "Корпоративная карта", transfer: "Банк. перевод", other: "Другое" },
};
const normalizePT = (pt: unknown): PaymentType => {
  const v = String(pt ?? "cash");
  if (v === "card") return "corporate_card";
  return (PAYMENT_TYPES as readonly string[]).includes(v) ? (v as PaymentType) : "other";
};

// Kassada faqat ikkita valyuta yuritiladi.
const CURRENCIES = ["UZS", "USD"];
const CURRENCY_LABELS: Record<string, string> = { UZS: "UZS (So'm)", USD: "USD (Dollar)" };
// Chiqim sabablarining boshlang'ich ro'yxati (DB bo'sh bo'lsa ishlatiladi).
const DEFAULT_REASONS = [
  "Oshxona", "Prochi", "Dastavka", "Hisobot", "Qurilish materiallari",
  "Zavod", "Usta haqi", "Ish haqi (avans)", "Rahbariyat", "Zakaz uchun", "Zapchast", "Ta'minot",
];

type CurForm = { currency: string; exchange_rate: number };
const defaultCur: CurForm = { currency: "UZS", exchange_rate: 1 };

// --- Davr (oy) yordamchilari ---
const MONTH_NAMES_UZ = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTH_NAMES_UZ[m - 1]} ${y}`;
}

export default function KassaPage() {
  const { user, hasRole, profile, roles } = useAuth() as any;
  const { t, locale } = useI18n();
  const localize = useLocalize();
  const k = (t as any).kassa ?? {};
  const ptLabel = (pt: unknown) => PAYMENT_LABELS[locale]?.[normalizePT(pt)] ?? PAYMENT_LABELS.uz[normalizePT(pt)];
  const [expenses, setExpenses] = useState<any[]>([]);
  const [incomes, setIncomes] = useState<any[]>([]);
  const { employees, allEmployees } = useEmployees({ activeOnly: true });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"income" | "expense" | "report" | "debt" | "supply">("income");
  // Qarz bo'limi
  const [debts, setDebts] = useState<any[]>([]);
  const [debtOpen, setDebtOpen] = useState(false);
  const [debtEditId, setDebtEditId] = useState<string | null>(null);
  const [debtForm, setDebtForm] = useState({ counterparty: "", purpose: "", amount: 0, currency: "UZS", due_date: "", comment: "" });
  const [debtDelete, setDebtDelete] = useState<any>(null);
  const [reasons, setReasons] = useState<string[]>(DEFAULT_REASONS);
  const [newReasonOpen, setNewReasonOpen] = useState(false);
  const [newReason, setNewReason] = useState("");
  const [reportMonth, setReportMonth] = useState<string>(() => currentMonth());
  const [empSearch, setEmpSearch] = useState("");
  const [empStatusFilter, setEmpStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [empDeptFilter, setEmpDeptFilter] = useState("all");
  const [empOpen, setEmpOpen] = useState(false);
  const [empEditId, setEmpEditId] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState({ full_name: "", position: "", department: "", phone: "", salary: 0, hire_date: new Date().toISOString().slice(0,10), leave_date: "", status: "active" });
  const [filterFrom, setFilterFrom] = useState(() => monthBounds(currentMonth()).from);
  const [filterTo, setFilterTo] = useState(() => monthBounds(currentMonth()).to);
  const [searchQ, setSearchQ] = useState("");
  // Tanlangan oy — faqat sana oralig'i to'liq bir oyni qamrasa ko'rsatiladi.
  const selectedMonth = useMemo(() => {
    if (!filterFrom || !filterTo) return "";
    const ym = filterFrom.slice(0, 7);
    const b = monthBounds(ym);
    return b.from === filterFrom && b.to === filterTo ? ym : "";
  }, [filterFrom, filterTo]);

  // expense form
  const [openExp, setOpenExp] = useState(false);
  const [expEditId, setExpEditId] = useState<string | null>(null);
  const [expOrig, setExpOrig] = useState<any>(null);
  const [expForm, setExpForm] = useState({ amount: 0, reason: "", recipient_id: "", recipient_manual: "", comment: "", currency: "UZS", exchange_rate: 1, payment_type: "cash" as PaymentType, salary_kind: "" as string, is_supply: false, debt_id: "" });
  const [recipientMode, setRecipientMode] = useState<"employee" | "manual">("employee");
  const [empDetailId, setEmpDetailId] = useState<string | null>(null);

  // income form
  const [openInc, setOpenInc] = useState(false);
  const [incEditId, setIncEditId] = useState<string | null>(null);
  const [incOrig, setIncOrig] = useState<any>(null);
  const [incForm, setIncForm] = useState({ amount: 0, source: "", payment_type: "cash", comment: "", currency: "UZS", exchange_rate: 1 });
  const [incFile, setIncFile] = useState<File | null>(null);
  const [incDelete, setIncDelete] = useState<any>(null);

  const actorName = profile?.full_name || user?.email || null;

  // Oxirgi valyuta kirimidagi kurs (valyuta bo'yicha) — chiqimda avtomatik qo'llanadi.
  const lastRateByCur = useMemo(() => {
    const map: Record<string, number> = {};
    const sorted = [...incomes].sort(
      (a: any, b: any) => new Date(b.income_date ?? b.created_at).getTime() - new Date(a.income_date ?? a.created_at).getTime()
    );
    for (const i of sorted as any[]) {
      const cur = i.currency ?? "UZS";
      if (cur === "UZS") continue;
      const r = Number(i.exchange_rate) || 0;
      if (r > 0 && !map[cur]) map[cur] = r;
    }
    return map;
  }, [incomes]);
  const expRate = expForm.currency === "UZS" ? 1 : (lastRateByCur[expForm.currency] ?? 0);

  const loadReasons = async () => {
    const { data } = await (supabase.from as any)("cash_expense_reasons")
      .select("name,sort_order").order("sort_order", { ascending: true }).order("name", { ascending: true });
    const list = ((data ?? []) as any[]).map((r) => String(r.name)).filter(Boolean);
    if (list.length) setReasons(list);
  };

  const loadDebts = async () => {
    const { data } = await (supabase.from as any)("debts").select("*").order("created_at", { ascending: false });
    setDebts((data ?? []) as any[]);
  };

  const load = async () => {
    setLoading(true);
    const [{ data: exp }, { data: inc }] = await Promise.all([
      supabase.from("cash_expenses").select("*, recipient:employees(full_name)").order("expense_date", { ascending: false }),
      (supabase.from as any)("cash_incomes").select("*").order("income_date", { ascending: false }),
    ]);
    setExpenses(exp ?? []);
    setIncomes(inc ?? []);
    loadDebts();
    setLoading(false);
  };
  useEffect(() => {
    load();
    loadReasons();
    const channel = supabase
      .channel("kassa-currency-totals")
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_incomes" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_expenses" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const canManage = hasRole(["cashier", "admin"]);
  // Glavniy buxgalter (chief accountant) and admin can manage users / cashiers.
  const canManageUsers = roles.includes("admin") || roles.includes("chief_accountant");
  const fmt = (n: number) => fmtNum(n);
  const fmtCash = (n: number, currency?: string | null) => fmtKassaAmount(n, currency);
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
      refreshEmployees();
      if (error) { toast.error(error.message); return; }
      const summary = diffSummary(orig, payload, ["full_name", "position", "department", "phone", "salary", "hire_date", "leave_date", "status"]);
      await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: "kassa.employee.update", entity: "employees", details: `${payload.full_name}: ${summary || "no changes"}` });
    } else {
      const { error } = await supabase.from("employees").insert(payload);
      refreshEmployees();
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
    refreshEmployees();
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
      : `${row.recipient_name ?? row.recipient?.full_name ?? ""} ${row.reason ?? ""} ${row.amount ?? ""} ${row.total_uzs ?? ""} ${row.comment ?? ""} ${row.currency ?? ""} ${row.payment_type ?? ""} ${ptLabel(row.payment_type)} chiqim expense`;
    return hay.toLowerCase().includes(s);
  };
  const fExp = useMemo(() => expenses.filter(e => inRange(e.expense_date) && matchSearch(e, "expense")), [expenses, filterFrom, filterTo, searchQ]);
  const fInc = useMemo(() => incomes.filter(i => inRange(i.income_date) && matchSearch(i, "income")), [incomes, filterFrom, filterTo, searchQ]);

  const normalizeCurrency = (currency: unknown) => {
    const code = String(currency ?? "UZS").trim().toUpperCase();
    return code || "UZS";
  };
  const sumByCurrency = (rows: any[], filterPT?: (pt: PaymentType) => boolean) => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      if (filterPT && !filterPT(normalizePT(r.payment_type))) continue;
      const c = normalizeCurrency(r.currency);
      m[c] = (m[c] || 0) + (Number(r.amount) || 0);
    }
    return m;
  };
  // Period-scoped totals — respect the date-range + search filter shown below.
  const incByCur = useMemo(() => sumByCurrency(fInc), [fInc]);
  const expByCur = useMemo(() => sumByCurrency(fExp), [fExp]);
  const balByCur = useMemo(() => {
    const m: Record<string, number> = { ...incByCur };
    for (const [c, v] of Object.entries(expByCur)) m[c] = (m[c] || 0) - v;
    return m;
  }, [incByCur, expByCur]);
  // Cash only (excludes corporate card and other electronic payments).
  const cashIn   = useMemo(() => sumByCurrency(fInc,  pt => pt === "cash"), [fInc]);
  const cashOut  = useMemo(() => sumByCurrency(fExp, pt => pt === "cash"), [fExp]);
  const cashBal  = useMemo(() => {
    const m: Record<string, number> = { ...cashIn };
    for (const [c, v] of Object.entries(cashOut)) m[c] = (m[c] || 0) - v;
    return m;
  }, [cashIn, cashOut]);
  // Corporate card only.
  const cardIn   = useMemo(() => sumByCurrency(fInc,  pt => pt === "corporate_card"), [fInc]);
  const cardOut  = useMemo(() => sumByCurrency(fExp, pt => pt === "corporate_card"), [fExp]);
  const cardBal  = useMemo(() => {
    const m: Record<string, number> = { ...cardIn };
    for (const [c, v] of Object.entries(cardOut)) m[c] = (m[c] || 0) - v;
    return m;
  }, [cardIn, cardOut]);

  const CUR_SYMBOL: Record<string, string> = { UZS: "so'm", USD: "$", EUR: "€", RUB: "₽", CNY: "¥", KZT: "₸", TRY: "₺", GBP: "£", AED: "د.إ", INR: "₹", JPY: "¥", KRW: "₩", CHF: "Fr", CAD: "C$", AUD: "A$" };
  const currencyRank = (code: string) => {
    const idx = CURRENCIES.indexOf(code);
    return idx === -1 ? CURRENCIES.length : idx;
  };
  const allCurList = (m: Record<string, number>) => {
    // Show only currencies with non-zero activity in the current filter window.
    const entries = Object.entries(m)
      .map(([c, v]) => [c, Number(v) || 0] as [string, number])
      .filter(([, v]) => Math.abs(v) > 0.0001);
    entries.sort((a, b) => currencyRank(a[0]) - currencyRank(b[0]));
    return entries;
  };
  const renderCurrencies = (m: Record<string, number>, tone: "balance" | "in" | "out") => {
    const items = allCurList(m);
    if (items.length === 0) {
      return <div className="text-xl font-bold font-mono leading-tight tabular-nums text-muted-foreground">0 <span className="text-xs font-sans">so'm</span></div>;
    }
    return (
      <div className="space-y-1.5">
        {items.map(([c, v]) => {
          const color = tone === "in" ? "text-status-green" : tone === "out" ? "text-status-red" : v < 0 ? "text-status-red" : "text-status-green";
          return (
            <div key={c} className={`text-xl font-bold font-mono leading-tight tabular-nums ${color}`}>
              {fmtCash(v, c)} <span className="text-xs text-muted-foreground font-sans">{CUR_SYMBOL[c] ?? c}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // --- Oylik qoldiq: oldingi oy yakuni keyingi oyning boshlang'ich qoldig'i ---
  const openingByCur = (ym: string): Record<string, number> => {
    if (!ym) return {};
    const start = new Date(`${monthBounds(ym).from}T00:00:00`).getTime();
    const m: Record<string, number> = {};
    for (const i of incomes) {
      if (new Date(i.income_date).getTime() < start) {
        const c = normalizeCurrency(i.currency); m[c] = (m[c] || 0) + (Number(i.amount) || 0);
      }
    }
    for (const e of expenses) {
      if (new Date(e.expense_date).getTime() < start) {
        const c = normalizeCurrency(e.currency); m[c] = (m[c] || 0) - (Number(e.amount) || 0);
      }
    }
    return m;
  };

  // Tanlangan oy uchun boshlang'ich qoldiq (butun davr tanlansa — 0).
  const openingBal = useMemo(() => (selectedMonth ? openingByCur(selectedMonth) : {}), [selectedMonth, incomes, expenses]);
  // Yakuniy qoldiq = boshlang'ich + kirim − chiqim
  const closingBal = useMemo(() => {
    const m: Record<string, number> = { ...openingBal };
    for (const [c, v] of Object.entries(incByCur)) m[c] = (m[c] || 0) + v;
    for (const [c, v] of Object.entries(expByCur)) m[c] = (m[c] || 0) - v;
    return m;
  }, [openingBal, incByCur, expByCur]);

  // --- Hisobot (tanlangan oy) ---
  const report = useMemo(() => {
    const b = monthBounds(reportMonth);
    const from = new Date(`${b.from}T00:00:00`).getTime();
    const to = new Date(`${b.to}T23:59:59`).getTime();
    const inRows = incomes.filter((i) => { const t = new Date(i.income_date).getTime(); return t >= from && t <= to; });
    const exRows = expenses.filter((e) => { const t = new Date(e.expense_date).getTime(); return t >= from && t <= to; });
    const opening = openingByCur(reportMonth);
    const totalIn: Record<string, number> = {};
    const totalOut: Record<string, number> = {};
    for (const i of inRows) { const c = normalizeCurrency(i.currency); totalIn[c] = (totalIn[c] || 0) + (Number(i.amount) || 0); }
    for (const e of exRows) { const c = normalizeCurrency(e.currency); totalOut[c] = (totalOut[c] || 0) + (Number(e.amount) || 0); }
    const closing: Record<string, number> = { ...opening };
    for (const [c, v] of Object.entries(totalIn)) closing[c] = (closing[c] || 0) + v;
    for (const [c, v] of Object.entries(totalOut)) closing[c] = (closing[c] || 0) - v;
    const groups: Record<string, { reason: string; byCur: Record<string, number>; count: number }> = {};
    for (const e of exRows) {
      const key = (e.reason ?? "—").trim() || "—";
      const c = normalizeCurrency(e.currency);
      groups[key] ??= { reason: key, byCur: {}, count: 0 };
      groups[key].byCur[c] = (groups[key].byCur[c] || 0) + (Number(e.amount) || 0);
      groups[key].count += 1;
    }
    return {
      inRows: [...inRows].sort((a, b2) => new Date(b2.income_date).getTime() - new Date(a.income_date).getTime()),
      exRows: [...exRows].sort((a, b2) => new Date(b2.expense_date).getTime() - new Date(a.expense_date).getTime()),
      opening, totalIn, totalOut, closing,
      groups: Object.values(groups).sort((a, b2) => b2.count - a.count),
    };
  }, [incomes, expenses, reportMonth]);

  const curLine = (m: Record<string, number>) => {
    const items = Object.entries(m).filter(([, v]) => Math.abs(Number(v) || 0) > 0.0001);
    if (!items.length) return "0 so'm";
    return items.map(([c, v]) => `${fmtCash(Number(v), c)} ${CUR_SYMBOL[c] ?? c}`).join(" · ");
  };

  const downloadReport = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(esc(`Kassa hisoboti — ${monthLabel(reportMonth)}`));
    lines.push("");
    lines.push([esc("Boshlang'ich qoldiq"), esc(curLine(report.opening))].join(";"));
    lines.push([esc("Jami kirim"), esc(curLine(report.totalIn))].join(";"));
    lines.push([esc("Jami chiqim"), esc(curLine(report.totalOut))].join(";"));
    lines.push([esc("Yakuniy qoldiq"), esc(curLine(report.closing))].join(";"));
    lines.push("");
    lines.push([esc("KIRIMLAR")].join(";"));
    lines.push(["Sana va vaqt", "Manba", "Summa", "Valyuta"].map(esc).join(";"));
    for (const i of report.inRows) lines.push([fmtDateTime24(i.income_date), i.source ?? "", fmtCash(Number(i.amount), i.currency), normalizeCurrency(i.currency)].map(esc).join(";"));
    lines.push("");
    lines.push([esc("CHIQIMLAR")].join(";"));
    lines.push(["Sana va vaqt", "Sabab", "Summa", "Valyuta"].map(esc).join(";"));
    for (const e of report.exRows) lines.push([fmtDateTime24(e.expense_date), e.reason ?? "", fmtCash(Number(e.amount), e.currency), normalizeCurrency(e.currency)].map(esc).join(";"));
    lines.push("");
    lines.push([esc("SABAB BO'YICHA GURUHLAR")].join(";"));
    lines.push(["Sabab", "Soni", "Jami"].map(esc).join(";"));
    for (const g of report.groups) lines.push([g.reason, String(g.count), curLine(g.byCur)].map(esc).join(";"));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kassa-hisobot-${reportMonth}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const addReason = async () => {
    const name = newReason.trim();
    if (!name) return;
    const { error } = await (supabase.from as any)("cash_expense_reasons").insert({ name, sort_order: 200, created_by: user?.id });
    if (error && !String(error.message).includes("duplicate")) { toast.error(error.message); return; }
    await loadReasons();
    setExpForm((f) => ({ ...f, reason: name }));
    setNewReason(""); setNewReasonOpen(false);
    toast.success("Tur qo'shildi");
  };


  // Qarz bo'yicha to'langan summani real chiqimlardan qayta hisoblash.
  const recalcDebt = async (debtId: string) => {
    if (!debtId) return;
    const { data: rows } = await (supabase.from as any)("cash_expenses").select("amount").eq("debt_id", debtId);
    const paid = ((rows ?? []) as any[]).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const d = debts.find((x) => x.id === debtId);
    const total = Number(d?.amount) || 0;
    await (supabase.from as any)("debts")
      .update({ paid_amount: paid, status: total > 0 && paid >= total ? "paid" : "open" })
      .eq("id", debtId);
    loadDebts();
  };

  const saveDebt = async () => {
    if (!debtForm.counterparty.trim() || !debtForm.purpose.trim() || !debtForm.amount) {
      toast.error(k.fillFields ?? "Maydonlarni to'ldiring"); return;
    }
    const payload: any = {
      counterparty: debtForm.counterparty.trim(),
      purpose: debtForm.purpose.trim(),
      amount: Number(debtForm.amount) || 0,
      currency: debtForm.currency,
      due_date: debtForm.due_date || null,
      comment: debtForm.comment.trim() || null,
    };
    if (debtEditId) {
      const { error } = await (supabase.from as any)("debts").update(payload).eq("id", debtEditId);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await (supabase.from as any)("debts").insert({ ...payload, created_by: user?.id });
      if (error) { toast.error(error.message); return; }
    }
    await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: debtEditId ? "kassa.debt.update" : "kassa.debt.create", entity: "debts", details: `${payload.counterparty} · ${payload.amount} ${payload.currency}` });
    toast.success(k.saved ?? "Saqlandi");
    setDebtOpen(false); setDebtEditId(null);
    setDebtForm({ counterparty: "", purpose: "", amount: 0, currency: "UZS", due_date: "", comment: "" });
    loadDebts();
  };

  const removeDebt = async (d: any) => {
    const { error } = await (supabase.from as any)("debts").delete().eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: "kassa.debt.delete", entity: "debts", details: `${d.counterparty} · ${d.amount} ${d.currency}` });
    setDebtDelete(null);
    toast.success(k.saved ?? "Saqlandi");
    load();
  };

  // Qarz bo'yicha to'lov — chiqim formasini tayyor holda ochadi.
  const payDebt = (d: any) => {
    const left = Math.max(0, (Number(d.amount) || 0) - (Number(d.paid_amount) || 0));
    setExpEditId(null); setExpOrig(null);
    setExpForm({
      amount: left, reason: "Qarz uchun", recipient_id: "", recipient_manual: "",
      comment: `${d.counterparty} — ${d.purpose}`, currency: d.currency ?? "UZS", exchange_rate: 1,
      payment_type: "cash", salary_kind: "", is_supply: false, debt_id: d.id,
    });
    setTab("expense");
    setOpenExp(true);
  };

  const saveExpense = async () => {
    if (!expForm.amount || !expForm.reason.trim()) { toast.error(k.fillFields ?? "Maydonlarni to'ldiring"); return; }
    if (expForm.reason.trim().toLowerCase() === "prochi" && !expForm.comment.trim()) {
      toast.error("Prochi chiqimi uchun izoh kiritilishi shart"); return;
    }
    const isDebtPay = expForm.reason.trim().toLowerCase() === "qarz uchun";
    if (isDebtPay && !expForm.debt_id) { toast.error("Qarzni tanlang"); return; }
    if (!ensureOnline((m) => toast.error(m))) return;
    if (expForm.currency !== "UZS" && !(expRate > 0)) {
      toast.error(`${expForm.currency} kursi mavjud emas — avval ${expForm.currency} kirimini kurs bilan kiriting`); return;
    }
    // Client-side balance guard (server trigger is the source of truth).
    const pt = expForm.payment_type || "cash";
    const cur = expForm.currency;
    const totalIn = incomes.filter((x: any) => x.currency === cur && (x.payment_type || "cash") === pt).reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
    const totalOut = expenses.filter((x: any) => x.currency === cur && (x.payment_type || "cash") === pt && x.id !== expEditId).reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
    const avail = totalIn - totalOut;
    if (Number(expForm.amount) > avail) {
      await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: "kassa.expense.BLOCKED", entity: "cash_expenses", details: `${expForm.amount} ${cur} (${pt}) — mavjud ${avail}` });
      toast.error(`Mablag' yetarli emas (mavjud: ${fmtCash(avail, cur)} ${cur})`);
      return;
    }
    const emp = recipientMode === "employee" ? employees.find(e => e.id === expForm.recipient_id) : null;
    const recipientName = recipientMode === "employee" ? (emp?.full_name ?? null) : (expForm.recipient_manual.trim() || null);
    const rate = expForm.currency === "UZS" ? 1 : expRate;
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
      payment_type: expForm.payment_type,
      salary_kind: recipientMode === "employee" && expForm.salary_kind ? expForm.salary_kind : null,
      // Ta'minot bo'limiga ajratilgan pul — Ta'minot moliya sahifasida kirim sifatida ko'rinadi.
      purpose: expForm.reason.trim().toLowerCase() === "ta'minot" || expForm.is_supply ? "supply" : null,
      debt_id: isDebtPay ? expForm.debt_id : null,
    };
    if (expEditId) {
      const { error } = await supabase.from("cash_expenses").update(payload).eq("id", expEditId);
      if (error) { toast.error(error.message); return; }
      const summary = diffSummary(expOrig, payload, ["amount", "currency", "exchange_rate", "total_uzs", "reason", "recipient_name", "comment", "payment_type"]);
      await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: "kassa.expense.update", entity: "cash_expenses", details: summary || "no changes" });
    } else {
      const { error } = await supabase.from("cash_expenses").insert({ ...payload, created_by: user?.id });
      if (error) { toast.error(error.message); return; }
      await logAudit(supabase, { actor_id: user?.id, actor_name: actorName, action: "kassa.expense.create", entity: "cash_expenses", details: `${payload.amount} ${payload.currency} = ${fmt(total_uzs)} UZS · ${payload.reason}` });
      await notify({
        type: "info",
        title: `Kassa chiqimi — ${payload.reason}`,
        body: `${fmtKassaAmount(payload.amount, payload.currency)} ${payload.currency}${recipientName ? ` · ${recipientName}` : ""}`,
        link: "/kassa", entity: "cash_expense",
        recipient_role: ["cashier", "manager"],
        sender_id: user?.id, sender_name: actorName,
      });
    }
    if (payload.debt_id || expOrig?.debt_id) {
      await recalcDebt(payload.debt_id || expOrig?.debt_id);
      if (expOrig?.debt_id && payload.debt_id && expOrig.debt_id !== payload.debt_id) await recalcDebt(expOrig.debt_id);
    }
    toast.success(k.saved ?? "Saqlandi");
    setExpForm({ amount: 0, reason: "", recipient_id: "", recipient_manual: "", comment: "", currency: "UZS", exchange_rate: 1, payment_type: "cash", salary_kind: "", is_supply: false, debt_id: "" });
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
      payment_type: normalizePT(e.payment_type),
      salary_kind: (e.salary_kind ?? "") as any,
      is_supply: e.purpose === "supply",
      debt_id: e.debt_id ?? "",
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
      await notify({
        type: "info",
        title: `Kassa kirimi — ${payload.source}`,
        body: `${fmtKassaAmount(payload.amount, payload.currency)} ${payload.currency}`,
        link: "/kassa", entity: "cash_income",
        recipient_role: ["cashier", "manager"],
        sender_id: user?.id, sender_name: actorName,
      });
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

  const deleteIncome = async () => {
    const row = incDelete;
    if (!row) return;
    const { error } = await (supabase.from as any)("cash_incomes").delete().eq("id", row.id);
    if (error) { toast.error(error.message); setIncDelete(null); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: actorName,
      action: "kassa.income.delete", entity: "cash_incomes",
      details: `${row.amount} ${row.currency ?? "UZS"} · ${row.source ?? ""} · ${fmtDateTime24(row.income_date)}`,
    });
    toast.success("Kirim o'chirildi");
    setIncDelete(null);
    load();
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

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">Davr (oy)</Label>
          <Input
            type="month"
            className="w-[170px]"
            value={selectedMonth}
            onChange={(e) => {
              const ym = e.target.value;
              if (!ym) { setFilterFrom(""); setFilterTo(""); return; }
              const b = monthBounds(ym);
              setFilterFrom(b.from); setFilterTo(b.to);
            }}
          />
          <Button variant="outline" size="sm" onClick={() => { const b = monthBounds(currentMonth()); setFilterFrom(b.from); setFilterTo(b.to); }}>
            Joriy oy
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setFilterFrom(""); setFilterTo(""); }}>
            Barcha davr
          </Button>
          <span className="text-xs text-muted-foreground">
            {selectedMonth
              ? `Ko'rsatilmoqda: ${monthLabel(selectedMonth)}`
              : (filterFrom || filterTo)
                ? `Tanlangan davr: ${filterFrom || "…"} → ${filterTo || "…"}`
                : "Barcha davr ko'rsatilmoqda"}
          </span>
        </div>
        <div className="grid sm:grid-cols-4 gap-4">
          {selectedMonth && (
            <Card><CardContent className="p-4 space-y-2">
              <div className="text-xs text-muted-foreground">Boshlang'ich qoldiq (oy boshi)</div>
              {renderCurrencies(openingBal, "balance")}
            </CardContent></Card>
          )}
          <Card><CardContent className="p-4 space-y-2">
            <div className="text-xs text-muted-foreground">{selectedMonth ? "Yakuniy qoldiq" : (k.balance ?? "Balans")}</div>
            {renderCurrencies(selectedMonth ? closingBal : balByCur, "balance")}
          </CardContent></Card>
          <Card><CardContent className="p-4 space-y-2">
            <div className="text-xs text-muted-foreground">{k.totalIncome ?? "Jami kirim"}</div>
            {renderCurrencies(incByCur, "in")}
          </CardContent></Card>
          <Card><CardContent className="p-4 space-y-2">
            <div className="text-xs text-muted-foreground">{k.totalExpenses ?? "Jami chiqim"}</div>
            {renderCurrencies(expByCur, "out")}
          </CardContent></Card>
        </div>

        {/* To'lov turi kartalari faqat Kassa tablarida; Ta'minot tabida o'z alohida kartalari bor (takrorlanmasin) */}
        {tab !== "supply" && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="border-status-green/30"><CardContent className="p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-status-green">
              💵 {PAYMENT_LABELS[locale]?.cash ?? "Naqd pul"}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><div className="text-[10px] text-muted-foreground mb-1">{k.balance ?? "Balans"}</div>{renderCurrencies(cashBal, "balance")}</div>
              <div><div className="text-[10px] text-muted-foreground mb-1">{k.income ?? "Kirim"}</div>{renderCurrencies(cashIn, "in")}</div>
              <div><div className="text-[10px] text-muted-foreground mb-1">{k.expense ?? "Chiqim"}</div>{renderCurrencies(cashOut, "out")}</div>
            </div>
          </CardContent></Card>

          <Card className="border-primary/30"><CardContent className="p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">
              💳 {PAYMENT_LABELS[locale]?.corporate_card ?? "Korporativ karta"}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><div className="text-[10px] text-muted-foreground mb-1">{k.balance ?? "Balans"}</div>{renderCurrencies(cardBal, "balance")}</div>
              <div><div className="text-[10px] text-muted-foreground mb-1">{k.income ?? "Kirim"}</div>{renderCurrencies(cardIn, "in")}</div>
              <div><div className="text-[10px] text-muted-foreground mb-1">{k.expense ?? "Chiqim"}</div>{renderCurrencies(cardOut, "out")}</div>
            </div>
          </CardContent></Card>
        </div>
        )}
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
        {(selectedMonth !== currentMonth() || searchQ) && <Button variant="outline" onClick={() => { const b = monthBounds(currentMonth()); setFilterFrom(b.from); setFilterTo(b.to); setSearchQ(""); }}>{k.reset ?? "Tozalash"}</Button>}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="income"><ArrowDownCircle className="h-4 w-4 mr-1 text-status-green" />{k.income ?? "Kirim"}</TabsTrigger>
          <TabsTrigger value="expense"><ArrowUpCircle className="h-4 w-4 mr-1 text-status-red" />{k.expense ?? "Chiqim"}</TabsTrigger>
          <TabsTrigger value="report"><FileBarChart className="h-4 w-4 mr-1" />Hisobot</TabsTrigger>
          <TabsTrigger value="debt"><Wallet className="h-4 w-4 mr-1" />Qarz</TabsTrigger>
          <TabsTrigger value="supply"><Truck className="h-4 w-4 mr-1" />Ta'minot</TabsTrigger>
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
                    <Select value={normalizePT(incForm.payment_type)} onValueChange={v => setIncForm({ ...incForm, payment_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PAYMENT_TYPES.map(p => <SelectItem key={p} value={p}>{ptLabel(p)}</SelectItem>)}</SelectContent>
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
                      <TableCell className="text-sm whitespace-nowrap">{fmtDateTime24(i.income_date)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-status-green">{fmtCash(Number(i.amount), i.currency)}</TableCell>
                      <TableCell className="text-xs"><Badge variant="secondary">{i.currency ?? "UZS"}</Badge></TableCell>
                      <TableCell className="text-right text-xs font-mono">{(i.currency ?? "UZS") === "UZS" ? "—" : fmt(Number(i.exchange_rate ?? 1))}</TableCell>
                      <TableCell className="text-right font-mono text-status-green">{fmt(Number(i.total_uzs || i.amount))} {t.common.sum}</TableCell>
                      <TableCell className="text-sm">{i.source}</TableCell>
                      <TableCell className="text-sm">{ptLabel(i.payment_type)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.comment ?? "—"}</TableCell>
                      <TableCell>{i.receipt_url ? <a href={i.receipt_url} target="_blank" rel="noreferrer" className="text-primary underline text-xs">{k.view ?? "Ko'rish"}</a> : "—"}</TableCell>
                      {canManage && <TableCell className="whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => openEditInc(i)}><Edit2 className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setIncDelete(i)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </TableCell>}
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
            <Dialog open={openExp} onOpenChange={(o) => { setOpenExp(o); if (!o) { setExpEditId(null); setExpOrig(null); setExpForm({ amount: 0, reason: "", recipient_id: "", recipient_manual: "", comment: "", currency: "UZS", exchange_rate: 1, payment_type: "cash", salary_kind: "", is_supply: false, debt_id: "" }); setRecipientMode("employee"); } }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Chiqim qilish</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{expEditId ? "Chiqimni tahrirlash" : "Chiqim qilish"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>{k.reason ?? "Sabab"}</Label>
                    <Select value={expForm.reason || undefined} onValueChange={(v) => {
                      if (v === "__add__") { setNewReasonOpen(true); return; }
                      setExpForm({ ...expForm, reason: v, comment: v.trim().toLowerCase() === "prochi" ? expForm.comment : "" });
                    }}>
                      <SelectTrigger><SelectValue placeholder="Sababni tanlang" /></SelectTrigger>
                      <SelectContent>
                        {reasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        {expForm.reason && !reasons.includes(expForm.reason) && (
                          <SelectItem value={expForm.reason}>{expForm.reason}</SelectItem>
                        )}
                        <SelectItem value="__add__">+ Tur qo'shish</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {expForm.reason.trim().toLowerCase() === "prochi" && (
                    <div>
                      <Label htmlFor="expense-comment">Izoh *</Label>
                      <Textarea
                        id="expense-comment"
                        value={expForm.comment}
                        onChange={(e) => setExpForm({ ...expForm, comment: e.target.value })}
                        placeholder="Prochi chiqimi izohini kiriting"
                        required
                      />
                    </div>
                  )}
                  {expForm.reason.trim().toLowerCase() === "qarz uchun" && (
                    <div>
                      <Label>Qarz *</Label>
                      <Select value={expForm.debt_id || undefined} onValueChange={(v) => {
                        const d = debts.find((x) => x.id === v);
                        setExpForm({ ...expForm, debt_id: v, currency: d?.currency ?? expForm.currency });
                      }}>
                        <SelectTrigger><SelectValue placeholder="Qarzni tanlang" /></SelectTrigger>
                        <SelectContent>
                          {debts.filter((d) => d.status !== "paid").map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.counterparty} — {d.purpose} ({fmtCash(Math.max(0, Number(d.amount) - Number(d.paid_amount || 0)), d.currency)} {d.currency})
                            </SelectItem>
                          ))}
                          {debts.filter((d) => d.status !== "paid").length === 0 && (
                            <SelectItem value="__none__" disabled>Ochiq qarz yo'q</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>{k.currency ?? "Valyuta"}</Label>
                    <Select value={expForm.currency} onValueChange={(v) => setExpForm({ ...expForm, currency: v, exchange_rate: 1 })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{CURRENCY_LABELS[c] ?? c}</SelectItem>)}</SelectContent>
                    </Select>
                    {expForm.currency !== "UZS" && (
                      expRate > 0 ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          Kurs (oxirgi {expForm.currency} kirimidan): <span className="font-mono text-foreground">{fmt(expRate)}</span> so'm
                          {Number(expForm.amount) > 0 && <> · = <span className="font-mono font-semibold text-foreground">{fmt(Number(expForm.amount) * expRate)} UZS</span></>}
                        </p>
                      ) : (
                        <p className="text-xs text-status-red mt-1">{expForm.currency} kursi mavjud emas — avval {expForm.currency} kirimini kurs bilan kiriting.</p>
                      )
                    )}
                   </div>
                   <div>
                     <Label>{k.paymentType ?? "To'lov turi"}</Label>
                     <Select value={normalizePT(expForm.payment_type)} onValueChange={(v) => setExpForm({ ...expForm, payment_type: v as PaymentType })}>
                       <SelectTrigger><SelectValue /></SelectTrigger>
                       <SelectContent>{PAYMENT_TYPES.map((p) => <SelectItem key={p} value={p}>{ptLabel(p)}</SelectItem>)}</SelectContent>
                     </Select>
                   </div>
                   <div><Label>{k.amount ?? "Summa"}</Label><Input type="number" min={0} value={expForm.amount || ""} onChange={e => setExpForm({ ...expForm, amount: Number(e.target.value) })} /></div>
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
                  <TableHead>{k.paymentType ?? "To'lov turi"}</TableHead>
                  <TableHead>{k.recipient ?? "Oluvchi"}</TableHead>
                  <TableHead>{k.comment ?? "Izoh"}</TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {loading && <TableRow><TableCell colSpan={canManage ? 10 : 9} className="text-center text-muted-foreground py-8">{t.common.loading}</TableCell></TableRow>}
                  {!loading && fExp.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm whitespace-nowrap">{fmtDateTime24(e.expense_date)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-status-red">{fmtCash(Number(e.amount), e.currency)}</TableCell>
                      <TableCell className="text-xs"><Badge variant="secondary">{e.currency ?? "UZS"}</Badge></TableCell>
                      <TableCell className="text-right text-xs font-mono">{(e.currency ?? "UZS") === "UZS" ? "—" : fmt(Number(e.exchange_rate ?? 1))}</TableCell>
                      <TableCell className="text-right font-mono text-status-red">{fmt(Number(e.total_uzs || e.amount))} {t.common.sum}</TableCell>
                      <TableCell className="text-sm">{e.reason}</TableCell>
                      <TableCell className="text-sm">
                        <Badge variant={normalizePT(e.payment_type) === "corporate_card" ? "default" : "outline"}>{ptLabel(e.payment_type)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{localize(e.recipient?.full_name ?? e.recipient_name) || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.comment ?? "—"}</TableCell>
                      {canManage && <TableCell><Button size="sm" variant="ghost" onClick={() => openEditExp(e)}><Edit2 className="h-3 w-3" /></Button></TableCell>}
                    </TableRow>
                  ))}
                  {!loading && fExp.length === 0 && <TableRow><TableCell colSpan={canManage ? 10 : 9} className="text-center text-muted-foreground py-8">{k.empty ?? "Xarajatlar yo'q"}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="report" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs">Oy</Label>
            <Input type="month" className="w-[170px]" value={reportMonth} onChange={(e) => setReportMonth(e.target.value || currentMonth())} />
            <span className="text-sm text-muted-foreground">{monthLabel(reportMonth)}</span>
            <Button variant="outline" size="sm" onClick={downloadReport}><Download className="h-4 w-4 mr-1" />Yuklab olish</Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Boshlang'ich qoldiq</div>
              <div className="text-lg font-bold font-mono mt-1">{curLine(report.opening)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Jami kirim</div>
              <div className="text-lg font-bold font-mono mt-1 text-status-green">{curLine(report.totalIn)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Jami chiqim</div>
              <div className="text-lg font-bold font-mono mt-1 text-status-red">{curLine(report.totalOut)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Yakuniy qoldiq</div>
              <div className="text-lg font-bold font-mono mt-1">{curLine(report.closing)}</div>
            </CardContent></Card>
          </div>

          <Card><CardContent className="p-4 space-y-2">
            <div className="text-sm font-semibold">Chiqimlar sabab bo'yicha</div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Sabab</TableHead>
                <TableHead className="text-right">Soni</TableHead>
                <TableHead className="text-right">Jami</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {report.groups.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Chiqim yo'q</TableCell></TableRow>}
                {report.groups.map((g) => (
                  <TableRow key={g.reason}>
                    <TableCell className="font-medium">{g.reason}</TableCell>
                    <TableCell className="text-right">{g.count}</TableCell>
                    <TableCell className="text-right font-mono text-status-red">{curLine(g.byCur)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardContent className="p-4 space-y-2">
              <div className="text-sm font-semibold text-status-green">Kirimlar ({report.inRows.length})</div>
              <div className="max-h-[50vh] overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Sana va vaqt</TableHead>
                    <TableHead>Manba</TableHead>
                    <TableHead className="text-right">Summa</TableHead>
                    <TableHead>Valyuta</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {report.inRows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Kirim yo'q</TableCell></TableRow>}
                    {report.inRows.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-sm whitespace-nowrap">{fmtDateTime24(i.income_date)}</TableCell>
                        <TableCell className="text-sm">{i.source}</TableCell>
                        <TableCell className="text-right font-mono text-status-green">{fmtCash(Number(i.amount), i.currency)}</TableCell>
                        <TableCell><Badge variant="secondary">{normalizeCurrency(i.currency)}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>

            <Card><CardContent className="p-4 space-y-2">
              <div className="text-sm font-semibold text-status-red">Chiqimlar ({report.exRows.length})</div>
              <div className="max-h-[50vh] overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Sana va vaqt</TableHead>
                    <TableHead>Sabab</TableHead>
                    <TableHead className="text-right">Summa</TableHead>
                    <TableHead>Valyuta</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {report.exRows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Chiqim yo'q</TableCell></TableRow>}
                    {report.exRows.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-mono text-sm whitespace-nowrap">{fmtDateTime24(e.expense_date)}</TableCell>
                        <TableCell className="text-sm">{e.reason}</TableCell>
                        <TableCell className="text-right font-mono text-status-red">{fmtCash(Number(e.amount), e.currency)}</TableCell>
                        <TableCell><Badge variant="secondary">{normalizeCurrency(e.currency)}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="debt" className="space-y-3">
          {canManage && (
            <Dialog open={debtOpen} onOpenChange={(o) => { setDebtOpen(o); if (!o) { setDebtEditId(null); setDebtForm({ counterparty: "", purpose: "", amount: 0, currency: "UZS", due_date: "", comment: "" }); } }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Qarz qo'shish</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{debtEditId ? "Qarzni tahrirlash" : "Qarz qo'shish"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Kimdan (KM) *</Label><Input value={debtForm.counterparty} onChange={(e) => setDebtForm({ ...debtForm, counterparty: e.target.value })} placeholder="Masalan: KM" /></div>
                  <div><Label>Nima uchun *</Label><Input value={debtForm.purpose} onChange={(e) => setDebtForm({ ...debtForm, purpose: e.target.value })} placeholder="Qarz sababi" /></div>
                  <div><Label>{k.amount ?? "Summa"} *</Label><Input type="number" min={0} value={debtForm.amount || ""} onChange={(e) => setDebtForm({ ...debtForm, amount: Number(e.target.value) })} /></div>
                  <div>
                    <Label>{k.currency ?? "Valyuta"}</Label>
                    <Select value={debtForm.currency} onValueChange={(v) => setDebtForm({ ...debtForm, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{CURRENCY_LABELS[c] ?? c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Qachongacha</Label><Input type="date" value={debtForm.due_date} onChange={(e) => setDebtForm({ ...debtForm, due_date: e.target.value })} /></div>
                  <div><Label>{k.comment ?? "Izoh"}</Label><Textarea value={debtForm.comment} onChange={(e) => setDebtForm({ ...debtForm, comment: e.target.value })} /></div>
                  <Button className="w-full" onClick={saveDebt}>{t.common.save}</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          <Card><CardContent className="p-0">
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Kimdan</TableHead>
                  <TableHead>Nima uchun</TableHead>
                  <TableHead className="text-right">{k.amount ?? "Summa"}</TableHead>
                  <TableHead className="text-right">To'langan</TableHead>
                  <TableHead className="text-right">Qoldiq</TableHead>
                  <TableHead>Qachongacha</TableHead>
                  <TableHead>Holati</TableHead>
                  {canManage && <TableHead></TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {debts.map((d) => {
                    const paid = Number(d.paid_amount) || 0;
                    const left = Math.max(0, (Number(d.amount) || 0) - paid);
                    const overdue = d.status !== "paid" && d.due_date && new Date(d.due_date) < new Date();
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.counterparty}</TableCell>
                        <TableCell className="text-sm">{d.purpose}</TableCell>
                        <TableCell className="text-right font-mono">{fmtCash(Number(d.amount), d.currency)} {d.currency}</TableCell>
                        <TableCell className="text-right font-mono text-status-green">{fmtCash(paid, d.currency)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-status-red">{fmtCash(left, d.currency)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{d.due_date ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={d.status === "paid" ? "secondary" : overdue ? "destructive" : "outline"}>
                            {d.status === "paid" ? "To'langan" : overdue ? "Muddati o'tgan" : "Ochiq"}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell className="whitespace-nowrap text-right">
                            {d.status !== "paid" && <Button size="sm" variant="outline" className="mr-1" onClick={() => payDebt(d)}>To'lash</Button>}
                            <Button size="sm" variant="ghost" onClick={() => { setDebtEditId(d.id); setDebtForm({ counterparty: d.counterparty, purpose: d.purpose, amount: Number(d.amount) || 0, currency: d.currency ?? "UZS", due_date: d.due_date ?? "", comment: d.comment ?? "" }); setDebtOpen(true); }}><Edit2 className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setDebtDelete(d)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {debts.length === 0 && <TableRow><TableCell colSpan={canManage ? 8 : 7} className="text-center text-muted-foreground py-8">Qarzlar yo'q</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>

          <AlertDialog open={!!debtDelete} onOpenChange={(o) => { if (!o) setDebtDelete(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Qarzni o'chirish</AlertDialogTitle>
                <AlertDialogDescription>
                  {debtDelete ? `${debtDelete.counterparty} — ${debtDelete.purpose} (${fmtCash(Number(debtDelete.amount), debtDelete.currency)} ${debtDelete.currency}) o'chiriladi. To'langan chiqimlar tarixda qoladi.` : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t.common.cancel ?? "Bekor qilish"}</AlertDialogCancel>
                <AlertDialogAction onClick={() => debtDelete && removeDebt(debtDelete)}>{t.common.delete ?? "O'chirish"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="supply" className="space-y-3">
          <SupplyFinancePage />
        </TabsContent>
      </Tabs>

      <Dialog open={newReasonOpen} onOpenChange={(o) => { setNewReasonOpen(o); if (!o) setNewReason(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Yangi chiqim turi</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nomi</Label><Input value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="Masalan: Transport" /></div>
            <Button className="w-full" onClick={addReason}>{t.common.save}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!incDelete} onOpenChange={(o) => { if (!o) setIncDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kirimni o'chirish</AlertDialogTitle>
            <AlertDialogDescription>
              {incDelete && <>
                {fmtDateTime24(incDelete.income_date)} · {fmtKassaAmount(incDelete.amount, incDelete.currency)} {incDelete.currency ?? "UZS"} · {incDelete.source}
                <br />Bu kirim o'chiriladi va Kassa balansi, oylik qoldiq va hisobotlar qayta hisoblanadi. Amalni orqaga qaytarib bo'lmaydi.
              </>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={deleteIncome}>O'chirish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
