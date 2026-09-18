import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Truck, ArrowDownCircle, ArrowUpCircle, Wallet, Search } from "lucide-react";
import { fmtNum, fmtDateTime24, fmtMoney } from "@/lib/format";

const PT_LABEL: Record<string, string> = { cash: "Naqd pul", transfer: "O'tkazma", corporate_card: "Korporativ karta", card: "Karta", other: "Boshqa" };

interface IncomeRow {
  id: string;
  created_at: string;
  expense_date: string | null;
  amount: number;
  total_uzs: number;
  currency: string;
  reason: string | null;
  comment: string | null;
  payment_type: string | null;
  giver: string;
}

interface OutRow {
  id: string;
  created_at: string;
  product_name: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total: number;
  currency: string;
  order_number: string | null;
  actor: string;
}

const PT_KEYS = ["cash", "transfer", "corporate_card"] as const;
const CUR_KEYS = ["UZS", "USD"] as const;
const normPT = (p: string | null | undefined) => {
  const v = (p ?? "cash").toLowerCase();
  if (v === "card") return "corporate_card";
  if (v === "transfer" || v === "corporate_card" || v === "cash") return v;
  return "cash";
};
const normCur = (c: string | null | undefined) => ((c ?? "UZS").toUpperCase() === "USD" ? "USD" : "UZS");

/**
 * Kassa / Ta'minot — faqat moliyaviy nazorat sahifasi.
 * KIRIM  = Kassadan Ta'minot uchun ajratilgan chiqimlar (cash_expenses.purpose = 'supply')
 * CHIQIM = Skladga qilingan real kirimlar qiymati (stock_movements.direction = 'in')
 * Bu sahifada hech qanday yozuv yaratilmaydi — barchasi real bazadan o'qiladi.
 */
export default function SupplyFinancePage() {
  const [incomes, setIncomes] = useState<IncomeRow[]>([]);
  const [outs, setOuts] = useState<OutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: exp }, { data: mov }, { data: profs }] = await Promise.all([
      supabase
        .from("cash_expenses")
        .select("id,amount,total_uzs,currency,reason,comment,payment_type,expense_date,created_at,created_by,recipient_name")
        .eq("purpose", "supply")
        .order("created_at", { ascending: false }),
      supabase
        .from("stock_movements")
        .select("id,quantity,unit_price,currency,created_at,created_by,comment,products(name,unit),orders(order_number)")
        .eq("direction", "in")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("profiles").select("id,full_name,email"),
    ]);

    const nameOf = (uid: string | null | undefined) => {
      const p = (profs ?? []).find((x: any) => x.id === uid) as any;
      return p?.full_name || p?.email || "—";
    };

    setIncomes(
      ((exp ?? []) as any[]).map((e) => ({
        id: e.id,
        created_at: e.expense_date ?? e.created_at,
        expense_date: e.expense_date,
        amount: Number(e.amount) || 0,
        total_uzs: Number(e.total_uzs) || 0,
        currency: e.currency ?? "UZS",
        reason: e.reason,
        comment: e.comment,
        payment_type: e.payment_type ?? null,
        giver: nameOf(e.created_by),
      })),
    );

    setOuts(
      ((mov ?? []) as any[]).map((m) => {
        const price = Number(m.unit_price) || 0;
        const qty = Number(m.quantity) || 0;
        return {
          id: m.id,
          created_at: m.created_at,
          product_name: m.products?.name ?? "—",
          quantity: qty,
          unit: m.products?.unit ?? null,
          unit_price: price,
          total: qty * price,
          currency: normCur(m.currency),
          order_number: m.orders?.order_number ?? null,
          actor: nameOf(m.created_by),
        };
      }),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("supply-finance")
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_expenses" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Har bir to'lov turi × valyuta bo'yicha alohida balans (real DB yozuvlaridan).
  const buckets = useMemo(() => {
    const b: Record<string, Record<string, { in: number; out: number }>> = {};
    for (const pt of PT_KEYS) { b[pt] = {}; for (const c of CUR_KEYS) b[pt][c] = { in: 0, out: 0 }; }
    for (const r of incomes) b[normPT(r.payment_type)][normCur(r.currency)].in += Number(r.amount) || 0;
    // Sklad kirimlari (Ta'minot chiqimi) — to'lov turi yozilmagan, naqd puldan ayriladi.
    for (const r of outs) b.cash[normCur(r.currency)].out += Number(r.total) || 0;
    return b;
  }, [incomes, outs]);

  const needle = q.trim().toLowerCase();
  const fIncomes = needle
    ? incomes.filter((r) => `${r.reason ?? ""} ${r.comment ?? ""} ${r.giver} ${r.amount} ${r.currency}`.toLowerCase().includes(needle))
    : incomes;
  const fOuts = needle
    ? outs.filter((r) => `${r.product_name} ${r.order_number ?? ""} ${r.actor} ${r.total}`.toLowerCase().includes(needle))
    : outs;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Truck className="h-6 w-6" /> Kassa / Ta'minot
        </h1>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Qidirish..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Faqat kuzatuv sahifasi. Kirim — Kassadan Ta'minotga ajratilgan pul, chiqim — Skladga kirim qilingan tovarlar qiymati.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {PT_KEYS.map((pt) => (
          <Card key={pt}><CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium"><Wallet className="h-4 w-4" /> {PT_LABEL[pt]}</div>
            {CUR_KEYS.map((c) => {
              const bal = buckets[pt][c].in - buckets[pt][c].out;
              return (
                <div key={c} className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">{c === "UZS" ? "UZS (so'm)" : "USD (dollar)"}</span>
                  <span className={`text-lg font-bold font-mono ${bal < 0 ? "text-status-red" : ""}`}>{fmtMoney(bal, c)}</span>
                </div>
              );
            })}
            <div className="text-[11px] text-muted-foreground pt-1 border-t">
              Kirim: {fmtMoney(buckets[pt].UZS.in, "UZS")} · {fmtMoney(buckets[pt].USD.in, "USD")} | Chiqim: {fmtMoney(buckets[pt].UZS.out, "UZS")} · {fmtMoney(buckets[pt].USD.out, "USD")}
            </div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="in">
        <TabsList>
          <TabsTrigger value="in">Kirimlar tarixi ({fIncomes.length})</TabsTrigger>
          <TabsTrigger value="out">Chiqimlar tarixi ({fOuts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="in">
          <Card><CardContent className="p-0">
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">№</TableHead>
                    <TableHead>Sana va vaqt</TableHead>
                    <TableHead>Kim bergan</TableHead>
                    <TableHead>Sabab / izoh</TableHead>
                    <TableHead>To'lov turi</TableHead>
                    <TableHead className="text-right">Summa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!loading && fIncomes.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Kirim yo'q</TableCell></TableRow>
                  )}
                  {fIncomes.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono text-sm">{fmtDateTime24(r.created_at)}</TableCell>
                      <TableCell>{r.giver}</TableCell>
                      <TableCell className="text-sm">{r.reason}{r.comment ? ` · ${r.comment}` : ""}</TableCell>
                      <TableCell className="text-sm">{PT_LABEL[r.payment_type ?? "cash"] ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {fmtMoney(r.amount, r.currency)}
                        {r.currency !== "UZS" ? <div className="text-xs text-muted-foreground">= {fmtNum(r.total_uzs)} so'm</div> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="out">
          <Card><CardContent className="p-0">
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">№</TableHead>
                    <TableHead>Sana va vaqt</TableHead>
                    <TableHead>Tovar nomi</TableHead>
                    <TableHead className="text-right">Miqdori</TableHead>
                    <TableHead className="text-right">Birlik narxi</TableHead>
                    <TableHead className="text-right">Jami</TableHead>
                    <TableHead>Zakaz</TableHead>
                    <TableHead>Kim kirim qilgan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!loading && fOuts.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Chiqim yo'q</TableCell></TableRow>
                  )}
                  {fOuts.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono text-sm">{fmtDateTime24(r.created_at)}</TableCell>
                      <TableCell className="font-medium">{r.product_name}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum(r.quantity)} {r.unit ?? ""}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum(r.unit_price)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtNum(r.total)} so'm</TableCell>
                      <TableCell>{r.order_number ? <Badge variant="outline">{r.order_number}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-sm">{r.actor}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
