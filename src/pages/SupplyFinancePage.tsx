import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, FileBarChart, Info, Plus } from "lucide-react";
import { fmtDateTime24 } from "@/lib/format";
import { fmtSpace } from "@/components/kassa/KassaOverview";

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
  rec_at: string;
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
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const DAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const sym = (c: string) => (c === "USD" ? "$" : "so'm");
const money = (n: number, c: string) => `${fmtSpace(n)} ${sym(c)}`;
const pad = (n: number) => String(n).padStart(2, "0");
const ymOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const nowYm = () => ymOf(new Date().toISOString());

interface Props { canManage?: boolean; onGive?: () => void; kassa?: "supply" | "supply2" }

export default function SupplyFinancePage({ canManage = false, onGive, kassa = "supply" }: Props = {}) {
  const is2 = kassa === "supply2";
  const title = is2 ? "Ta'minot 2" : "Ta'minot";
  const bringer = is2 ? "Shovkat" : "Sanjar";
  const [incomes, setIncomes] = useState<IncomeRow[]>([]);
  const [outs, setOuts] = useState<OutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetAt, setResetAt] = useState(0);
  const [month, setMonth] = useState<string | null>(null); // null = Barcha davr (default)
  const [selIn, setSelIn] = useState(false);
  const [selOut, setSelOut] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: exp }, { data: mov }, { data: profs }] = await Promise.all([
      supabase
        .from("cash_expenses")
        .select("id,amount,total_uzs,currency,reason,comment,payment_type,expense_date,created_at,created_by,recipient_name")
        .eq("purpose", kassa)
        .order("created_at", { ascending: false }),
      (async () => {
        const all: any[] = [];
        for (let f = 0; ; f += 1000) {
          const { data, error } = await (supabase as any).from(is2 ? "supply2_spendings" : "supply_spendings").select("*").order("created_at", { ascending: false }).range(f, f + 999);
          if (error) return { data: all };
          all.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        return { data: all };
      })(),
      supabase.from("profiles").select("id,full_name,email"),
    ]);
    const { data: rs } = await (supabase as any).from("cash_resets").select("reset_at").eq("kassa", kassa).order("reset_at", { ascending: false }).limit(1);
    setResetAt(rs?.[0]?.reset_at ? new Date(rs[0].reset_at).getTime() : 0);

    const nameOf = (uid: string | null | undefined) => {
      const p = (profs ?? []).find((x: any) => x.id === uid) as any;
      return p?.full_name || p?.email || "—";
    };

    setIncomes(
      ((exp ?? []) as any[]).map((e) => ({
        id: e.id,
        created_at: e.expense_date ?? e.created_at,
        rec_at: e.created_at,
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
          id: m.stock_movement_id,
          created_at: m.created_at,
          product_name: m.product_name ?? "",
          quantity: qty,
          unit: m.unit ?? null,
          unit_price: price,
          total: Number(m.total) || 0,
          currency: normCur(m.currency),
          order_number: m.order_number ?? null,
          actor: m.brought_by || nameOf(m.created_by),
        };
      }),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`supply-finance-${kassa}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_expenses" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Formulalar o'zgarmagan: kirim = Kassadan berilgan, chiqim = Sklad kirimlari (narx × miqdor).
  const pIn = useMemo(() => (month ? incomes.filter((r) => ymOf(r.created_at) === month) : incomes), [incomes, month]);
  const pOut = useMemo(() => (month ? outs.filter((r) => ymOf(r.created_at) === month) : outs), [outs, month]);
  const sumBy = (rows: { currency: string }[], val: (r: any) => number) => {
    const m: Record<string, number> = { UZS: 0, USD: 0 };
    for (const r of rows) m[normCur(r.currency)] += val(r);
    return m;
  };
  const inSum = useMemo(() => sumBy(pIn, (r) => Number(r.amount) || 0), [pIn]);
  const outSum = useMemo(() => sumBy(pOut, (r) => Number(r.total) || 0), [pOut]);
  // Joriy balans faqat oxirgi nolga tushirishdan keyingi operatsiyalardan (eski tarix hisobotlarda qoladi).
  const curIn = useMemo(() => incomes.filter((r) => new Date(r.rec_at).getTime() >= resetAt), [incomes, resetAt]);
  const curOut = useMemo(() => outs.filter((r) => new Date(r.created_at).getTime() >= resetAt), [outs, resetAt]);
  const allIn = useMemo(() => sumBy(curIn, (r) => Number(r.amount) || 0), [curIn]);
  const allOut = useMemo(() => sumBy(curOut, (r) => Number(r.total) || 0), [curOut]);
  const bal = { UZS: allIn.UZS - allOut.UZS, USD: allIn.USD - allOut.USD };
  const negative = bal.UZS < 0 || bal.USD < 0;

  // Har bir to'lov turi × valyuta bo'yicha alohida balans (Sklad kirimlari naqd puldan ayriladi).
  const accounts = useMemo(() => {
    const all: { pt: string; c: string; v: number }[] = [];
    for (const pt of PT_KEYS) for (const c of CUR_KEYS) {
      const inn = curIn.filter((r) => normPT(r.payment_type) === pt && normCur(r.currency) === c).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const out = pt === "cash" ? curOut.filter((r) => normCur(r.currency) === c).reduce((s, r) => s + (Number(r.total) || 0), 0) : 0;
      all.push({ pt, c, v: inn - out });
    }
    return { shown: all.filter((a) => Math.abs(a.v) > 0.0001), hidden: all.filter((a) => Math.abs(a.v) <= 0.0001).length };
  }, [curIn, curOut]);
  const ptShort = (pt: string) => (pt === "cash" ? "💵 Naqd" : pt === "corporate_card" ? "💳 Karta" : "🏦 O'tkazma");

  const cats = useMemo(() => {
    const g: Record<string, number> = {};
    const usd: Record<string, number> = {};
    for (const r of pOut) {
      const k = r.product_name.trim() || "—";
      if (r.currency === "USD") usd[k] = (usd[k] || 0) + r.total; else g[k] = (g[k] || 0) + r.total;
    }
    const sorted = Object.entries(g).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v);
    const rows = sorted.slice(0, 7);
    const rest = sorted.slice(7).reduce((s, r) => s + r.v, 0);
    if (rest > 0) rows.push({ name: "Boshqalar", v: rest });
    const max = Math.max(1, ...rows.map((r) => r.v));
    return { rows, max, usd: Object.entries(usd).map(([n, v]) => `${n} ${fmtSpace(v)} $`).join(", ") };
  }, [pOut]);

  const list = useMemo(() => {
    const items: { kind: "in" | "out"; r: any; at: number }[] = [];
    if (selIn) pIn.forEach((r) => items.push({ kind: "in", r, at: new Date(r.created_at).getTime() }));
    if (selOut) pOut.forEach((r) => items.push({ kind: "out", r, at: new Date(r.created_at).getTime() }));
    items.sort((a, b) => b.at - a.at);
    const groups: { label: string; items: typeof items }[] = [];
    for (const it of items) {
      const d = new Date(it.at);
      const label = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${DAYS[d.getDay()]}`;
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(it); else groups.push({ label, items: [it] });
    }
    return { groups, count: items.length };
  }, [selIn, selOut, pIn, pOut]);

  const shift = (delta: number) => {
    const [y, m] = (month ?? nowYm()).split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  const periodLabel = month ? (() => { const [y, m] = month.split("-").map(Number); const n = MONTHS[m - 1]; return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${y}`; })() : "Barcha davr";

  const downloadReport = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Turi", "Sana va vaqt", "Nomi", "Miqdor", "Birlik", "Narx", "Summa", "Valyuta", "Kim", "To'lov turi"].map(esc).join(";")];
    for (const r of pIn) lines.push(["Berilgan", fmtDateTime24(r.created_at), "Kassadan berildi", "", "", "", r.amount, normCur(r.currency), r.giver, PT_LABEL[normPT(r.payment_type)]].map(esc).join(";"));
    for (const r of pOut) lines.push(["Sarflangan", fmtDateTime24(r.created_at), r.product_name, r.quantity, r.unit ?? "", r.unit_price, r.total, r.currency, r.actor, ""].map(esc).join(";"));
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${is2 ? "taminot2" : "taminot"}-kassa-${month ?? "barcha-davr"}.csv`;
    a.click();
  };

  const listKey = `${selIn}-${selOut}-${month}`;
  const title = selIn && selOut ? "Berilgan va sarflangan · sana bo'yicha" : selIn ? `Berilgan · ${list.count} ta` : `Sarflangan · ${list.count} ta`;
  const usdLine = (m: Record<string, number>, sign: string) => (Math.abs(m.USD) > 0.0001 ? `${sign}${money(m.USD, "USD")}` : null);
  let rowIdx = 0;

  return (
    <div className="kassa-v2 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h2 className="text-xl font-bold tracking-tight">{title} kassasi</h2>
          <Tooltip>
            <TooltipTrigger asChild><button type="button" aria-label="Izoh" className="kassa-muted"><Info className="h-4 w-4" /></button></TooltipTrigger>
            <TooltipContent className="max-w-xs">Kirim — Kassadan {title}ga berilgan pul. Chiqim — {is2 ? "" : "Ta'minotga birinchi pul berilgandan keyin "}{bringer} olib kelgan Sklad kirimlari (narx × miqdor). Qoldiq = berilgan − sarflangan.</TooltipContent>
          </Tooltip>
          <div className="inline-flex items-center gap-1 rounded-lg border bg-background px-1 py-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Oldingi oy" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[120px] text-center text-sm font-semibold">{periodLabel}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Keyingi oy" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          {month && <Button variant="ghost" size="sm" onClick={() => setMonth(null)}>Barcha davr</Button>}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" className="bg-background" onClick={downloadReport}><FileBarChart className="h-4 w-4 mr-1.5" />Hisobot</Button>
          {canManage && onGive && <Button className="bg-status-green text-white hover:bg-status-green/90" onClick={onGive}><Plus className="h-4 w-4 mr-1" />Pul berish</Button>}
        </div>
      </div>

      <div className="kassa-kpis">
        <button type="button" aria-pressed={selIn} onClick={() => setSelIn(!selIn)} className="kassa-card kassa-kpi" data-tone="in">
          <span className="kassa-check">{selIn && <Check className="h-3 w-3" />}</span>
          <div className="kassa-muted text-sm">Berilgan (kirim)</div>
          <div className="kassa-big kassa-green">+{money(inSum.UZS, "UZS")}</div>
          {usdLine(inSum, "+") && <div className="kassa-green font-semibold tabular-nums">{usdLine(inSum, "+")}</div>}
          <div className="kassa-muted text-xs">{pIn.length} ta operatsiya</div>
        </button>
        <button type="button" aria-pressed={selOut} onClick={() => setSelOut(!selOut)} className="kassa-card kassa-kpi" data-tone="out">
          <span className="kassa-check">{selOut && <Check className="h-3 w-3" />}</span>
          <div className="kassa-muted text-sm">Sarflangan (Sklad kirimlari)</div>
          <div className="kassa-big kassa-red">−{money(outSum.UZS, "UZS")}</div>
          {usdLine(outSum, "−") && <div className="kassa-red font-semibold tabular-nums">{usdLine(outSum, "−")}</div>}
          <div className="kassa-muted text-xs">{pOut.length} ta operatsiya</div>
        </button>
        <div className="kassa-card kassa-kpi kassa-balance">
          <div className="text-sm opacity-80">Qoldiq</div>
          <div className="kassa-big" style={bal.UZS < 0 ? { color: "#e0434b" } : undefined}>{money(bal.UZS, "UZS")}</div>
          <div className="font-semibold tabular-nums" style={bal.USD < 0 ? { color: "#e0434b" } : undefined}>{money(bal.USD, "USD")}</div>
          {negative && <div className="text-xs font-medium" style={{ color: "#e0434b" }}>Berilgandan ko'p sarflangan</div>}
        </div>
      </div>

      <div className="kassa-grid">
        <div className="kassa-card kassa-ops">
          {!selIn && !selOut ? (
            <div className="flex-1 grid place-items-center kassa-muted text-sm text-center p-4">{loading ? "Yuklanmoqda..." : "Berilgan yoki Sarflangan kartasini bosing"}</div>
          ) : (
            <>
              <div className="kassa-ops-head"><div className="font-semibold">Operatsiyalar · {title}</div></div>
              <div key={listKey} className="kassa-ops-list">
                {list.count === 0 && <div className="kassa-muted text-sm text-center py-10">Bu davrda yozuv yo'q</div>}
                {list.groups.map((g) => (
                  <div key={g.label}>
                    <div className="kassa-day">{g.label}</div>
                    {g.items.map(({ kind, r, at }) => {
                      const i = rowIdx++;
                      const d = new Date(at);
                      const c = normCur(r.currency);
                      const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                      const sub = kind === "in"
                        ? [time, r.giver, PT_LABEL[normPT(r.payment_type)]]
                        : [time, `${fmtSpace(r.quantity)}${r.unit ? " " + r.unit : ""} × ${money(r.unit_price, c)}`, r.actor, r.order_number ? `#${r.order_number}` : null];
                      const amt = kind === "in" ? r.amount : r.total;
                      return (
                        <div key={`${kind}-${r.id}`} className="kassa-row" style={{ animationDelay: `${Math.min(i, 14) * 28}ms` }}>
                          <div className="kassa-ico" data-tone={kind}>{kind === "in" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}</div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold truncate">{kind === "in" ? "Kassadan berildi" : r.product_name || "—"}</div>
                            <div className="kassa-muted text-xs truncate">{sub.filter(Boolean).join(" · ")}</div>
                          </div>
                          <div className="text-right">
                            <div className={`font-semibold tabular-nums whitespace-nowrap ${kind === "in" ? "kassa-green" : "kassa-red"}`}>{kind === "in" ? "+" : "−"}{money(amt, c)}</div>
                            {kind === "in" && c === "USD" && r.total_uzs > 0 && <div className="kassa-muted text-xs tabular-nums whitespace-nowrap">≈ {money(r.total_uzs, "UZS")}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className="kassa-card p-4">
            <div className="font-semibold mb-3">Pul qayerda turibdi</div>
            <div className="grid grid-cols-2 gap-2">
              {accounts.shown.map((a) => (
                <div key={`${a.pt}${a.c}`} className="kassa-mini">
                  <div className="kassa-muted text-xs">{ptShort(a.pt)} · {sym(a.c)}</div>
                  <div className={`font-semibold tabular-nums ${a.v < 0 ? "kassa-red" : ""}`}>{money(a.v, a.c)}</div>
                </div>
              ))}
              {accounts.hidden > 0 && <div className="kassa-mini kassa-mini-empty">Bo'sh hisoblar yashirilgan ({accounts.hidden})</div>}
            </div>
          </div>
          <div className="kassa-card p-4">
            <div className="font-semibold">Pul nimaga sarflandi</div>
            <div className="kassa-muted text-xs mb-3">{periodLabel} · {money(outSum.UZS, "UZS")}</div>
            <div className="space-y-3">
              {cats.rows.length === 0 && <div className="kassa-muted text-sm">Bu davrda sarf yo'q</div>}
              {cats.rows.map((c) => (
                <div key={c.name}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{c.name}</span>
                    <span className="kassa-red tabular-nums font-medium whitespace-nowrap">{money(c.v, "UZS")}</span>
                  </div>
                  <div className="kassa-bar"><div style={{ width: mounted ? `${(c.v / cats.max) * 100}%` : 0 }} /></div>
                </div>
              ))}
              {cats.usd && <div className="kassa-muted text-xs">+ Dollarda: {cats.usd}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
