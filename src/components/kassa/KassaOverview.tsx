import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Edit2, Trash2 } from "lucide-react";

type Row = any;
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const DAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const cur = (c: unknown) => (String(c ?? "UZS").trim().toUpperCase() || "UZS");
const sym = (c: string) => (c === "UZS" ? "so'm" : c === "USD" ? "$" : c);

/** Display-only: thousands separated by spaces, e.g. 13 980 000. */
export function fmtSpace(n: number): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [i, d] = Math.abs(v).toString().split(".");
  return `${v < 0 ? "−" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}${d ? "," + d : ""}`;
}
const money = (n: number, c: string) => `${fmtSpace(n)} ${sym(c)}`;
const pad = (n: number) => String(n).padStart(2, "0");

interface Props {
  incomes: Row[]; // already filtered to the selected month
  expenses: Row[];
  allIncomes: Row[];
  allExpenses: Row[];
  month: string; // YYYY-MM
  opening: Record<string, number>;
  canManage: boolean;
  ptLabel: (pt: unknown) => string;
  normalizePT: (pt: unknown) => string;
  localize: (s: string) => string;
  onEditIncome: (r: Row) => void;
  onDeleteIncome: (r: Row) => void;
  onEditExpense: (r: Row) => void;
  onDeleteExpense: (r: Row) => void;
  canDelete: boolean;
}

export default function KassaOverview(p: Props) {
  const [selIn, setSelIn] = useState(false);
  const [selOut, setSelOut] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [openNote, setOpenNote] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  const [, mm] = p.month.split("-").map(Number);
  const monthName = MONTHS[(mm || 1) - 1];
  const monthTitle = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const sum = (rows: Row[]) => {
    const m: Record<string, number> = {};
    for (const r of rows) m[cur(r.currency)] = (m[cur(r.currency)] || 0) + (Number(r.amount) || 0);
    return m;
  };
  const inSum = useMemo(() => sum(p.incomes), [p.incomes]);
  const outSum = useMemo(() => sum(p.expenses), [p.expenses]);
  const extra = (m: Record<string, number>, sign: string) =>
    Object.entries(m).filter(([c, v]) => c !== "UZS" && Math.abs(v) > 0.0001).map(([c, v]) => `${sign}${money(v, c)}`).join(", ");

  const balance = useMemo(() => {
    const m: Record<string, number> = { UZS: 0, USD: 0 };
    for (const r of p.allIncomes) m[cur(r.currency)] = (m[cur(r.currency)] || 0) + (Number(r.amount) || 0);
    for (const r of p.allExpenses) m[cur(r.currency)] = (m[cur(r.currency)] || 0) - (Number(r.amount) || 0);
    return m;
  }, [p.allIncomes, p.allExpenses]);

  // Balance per payment type × currency (all time).
  const accounts = useMemo(() => {
    const m: Record<string, number> = {};
    const add = (r: Row, s: number) => {
      const k = `${p.normalizePT(r.payment_type)}|${cur(r.currency)}`;
      m[k] = (m[k] || 0) + s * (Number(r.amount) || 0);
    };
    p.allIncomes.forEach((r) => add(r, 1));
    p.allExpenses.forEach((r) => add(r, -1));
    const order = ["cash", "corporate_card", "transfer", "other"];
    const all = Object.entries(m).map(([k, v]) => { const [pt, c] = k.split("|"); return { pt, c, v }; })
      .sort((a, b) => order.indexOf(a.pt) - order.indexOf(b.pt) || (a.c === "UZS" ? -1 : 1));
    return { shown: all.filter((a) => Math.abs(a.v) > 0.0001), hidden: all.filter((a) => Math.abs(a.v) <= 0.0001).length };
  }, [p.allIncomes, p.allExpenses]);
  const ptShort = (pt: string) => (pt === "cash" ? "💵 Naqd" : pt === "corporate_card" ? "💳 Karta" : pt === "transfer" ? "🏦 O'tkazma" : "Boshqa");

  const cats = useMemo(() => {
    const g: Record<string, number> = {};
    const usd: Record<string, number> = {};
    for (const e of p.expenses) {
      const k = (e.reason ?? "—").trim() || "—";
      if (cur(e.currency) === "UZS") g[k] = (g[k] || 0) + (Number(e.amount) || 0);
      else usd[k] = (usd[k] || 0) + (Number(e.amount) || 0);
    }
    const rows = Object.entries(g).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v);
    const max = rows[0]?.v || 1;
    return { rows, max, usd: Object.entries(usd).map(([n, v]) => `${n} ${fmtSpace(v)} $`).join(", ") };
  }, [p.expenses]);

  const list = useMemo(() => {
    const items: { kind: "in" | "out"; r: Row; at: number }[] = [];
    if (selIn) p.incomes.forEach((r) => items.push({ kind: "in", r, at: new Date(r.income_date).getTime() }));
    if (selOut) p.expenses.forEach((r) => items.push({ kind: "out", r, at: new Date(r.expense_date).getTime() }));
    items.sort((a, b) => b.at - a.at);
    const groups: { label: string; items: typeof items }[] = [];
    for (const it of items) {
      const d = new Date(it.at);
      const label = `${d.getDate()} ${MONTHS[d.getMonth()]}, ${DAYS[d.getDay()]}`;
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(it); else groups.push({ label, items: [it] });
    }
    return { groups, count: items.length };
  }, [selIn, selOut, p.incomes, p.expenses]);

  const listKey = `${selIn}-${selOut}-${p.month}`;
  const title = selIn && selOut ? "Kirim va chiqim · sana bo'yicha" : selIn ? `Kirimlar · ${list.count} ta` : `Chiqimlar · ${list.count} ta`;
  let rowIdx = 0;

  return (
    <div className="kassa-v2 space-y-4">
      <div className="kassa-kpis">
        <button type="button" aria-pressed={selIn} onClick={() => setSelIn(!selIn)} className="kassa-card kassa-kpi" data-tone="in">
          <span className="kassa-check">{selIn && <Check className="h-3 w-3" />}</span>
          <div className="kassa-muted text-sm">Kirim ({monthName})</div>
          <div className="kassa-big kassa-green">+{money(inSum.UZS || 0, "UZS")}</div>
          <div className="kassa-muted text-xs">{p.incomes.length} ta operatsiya{extra(inSum, "") && ` · yana ${extra(inSum, "")}`}</div>
        </button>
        <button type="button" aria-pressed={selOut} onClick={() => setSelOut(!selOut)} className="kassa-card kassa-kpi" data-tone="out">
          <span className="kassa-check">{selOut && <Check className="h-3 w-3" />}</span>
          <div className="kassa-muted text-sm">Chiqim ({monthName})</div>
          <div className="kassa-big kassa-red">−{money(outSum.UZS || 0, "UZS")}</div>
          <div className="kassa-muted text-xs">{p.expenses.length} ta operatsiya{extra(outSum, "") && ` · yana ${extra(outSum, "")}`}</div>
        </button>
        <div className="kassa-card kassa-kpi kassa-balance">
          <div className="text-sm opacity-80">Qoldiq (hozir)</div>
          <div className="kassa-big">{money(balance.UZS || 0, "UZS")}</div>
          <div className="text-xs opacity-80">
            {money(balance.USD || 0, "USD")} · oy boshida {money(p.opening.UZS || 0, "UZS")}{p.opening.USD ? ` + ${money(p.opening.USD, "USD")}` : ""}
          </div>
        </div>
      </div>

      <div className="kassa-grid">
        <div className="kassa-card kassa-ops">
          {!selIn && !selOut ? (
            <div className="flex-1 grid place-items-center kassa-muted text-sm">Kirim yoki Chiqim kartasini bosing</div>
          ) : (
            <>
              <div className="kassa-ops-head">
                <div className="font-semibold">{title}</div>
                {selIn !== selOut && (
                  <div className={`font-semibold tabular-nums ${selIn ? "kassa-green" : "kassa-red"}`}>
                    {selIn ? "+" : "−"}{money((selIn ? inSum : outSum).UZS || 0, "UZS")}
                  </div>
                )}
              </div>
              <div key={listKey} className="kassa-ops-list">
                {list.count === 0 && <div className="kassa-muted text-sm text-center py-10">Bu oyda yozuv yo'q</div>}
                {list.groups.map((g) => (
                  <div key={g.label}>
                    <div className="kassa-day">{g.label}</div>
                    {g.items.map(({ kind, r, at }) => {
                      const i = rowIdx++;
                      const d = new Date(at);
                      const who = kind === "in" ? "" : p.localize(r.recipient?.full_name ?? r.recipient_name ?? "");
                      const c = cur(r.currency);
                      return (
                        <div key={r.id} className="kassa-row" style={{ animationDelay: `${Math.min(i, 14) * 28}ms` }}
                          data-focus-id={r.id} data-focus-at={r.created_at} data-focus-entity={kind === "in" ? "cash_income" : "cash_expense"}>
                          <div className="kassa-ico" data-tone={kind}>{kind === "in" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}</div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold truncate">{(kind === "in" ? r.source : r.reason) || "—"}</div>
                            <div className="kassa-muted text-xs truncate">
                              {pad(d.getHours())}:{pad(d.getMinutes())}{who ? ` · ${who}` : ""} · {p.ptLabel(r.payment_type)}
                            </div>
                            {r.comment ? (
                              <button type="button" onClick={() => setOpenNote(openNote === r.id ? null : r.id)}
                                className="kassa-muted text-xs text-left hover:text-foreground"
                                title={openNote === r.id ? "Yopish" : "To'liq ko'rish"}>
                                Izoh: <span className={openNote === r.id ? "whitespace-pre-wrap break-words" : "line-clamp-1"}>{r.comment}</span>
                              </button>
                            ) : null}
                          </div>
                          {p.canManage && (
                            <div className="kassa-row-actions">
                              <button type="button" aria-label="Tahrirlash" onClick={() => (kind === "in" ? p.onEditIncome(r) : p.onEditExpense(r))}><Edit2 className="h-3.5 w-3.5" /></button>
                              {p.canDelete && <button type="button" aria-label="O'chirish" onClick={() => (kind === "in" ? p.onDeleteIncome(r) : p.onDeleteExpense(r))}><Trash2 className="h-3.5 w-3.5 kassa-red" /></button>}
                            </div>
                          )}
                          <div className={`font-semibold tabular-nums whitespace-nowrap ${kind === "in" ? "kassa-green" : "kassa-red"}`}>
                            {kind === "in" ? "+" : "−"}{money(Number(r.amount) || 0, c)}
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
            <div className="font-semibold">Chiqimlar qayerga ketdi</div>
            <div className="kassa-muted text-xs mb-3">{monthTitle} · {money(outSum.UZS || 0, "UZS")}</div>
            <div className="space-y-3">
              {cats.rows.length === 0 && <div className="kassa-muted text-sm">Bu oyda chiqim yo'q</div>}
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
