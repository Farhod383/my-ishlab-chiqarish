import { useEffect, useMemo, useState } from "react";
import { isWarehouseProduct } from "@/lib/productClassification";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DateInput from "@/components/DateInput";
import { fmtNum, fmtDate, fmtDateTime24 } from "@/lib/format";
import { displayUser } from "@/lib/userNames";
import { ArrowLeft, Printer, FileDown, RotateCcw } from "lucide-react";

type Section = "all" | "products" | "instruments" | "movements";
const ALL = "__all";

async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

interface Mv {
  id: string; at: string; kind: "Mahsulot" | "Instrument"; name: string; dir: "in" | "out";
  qty: number; unit: string; person: string; employee: string; order: string; location: string; comment: string;
  price: number | null; currency: string;
}

export default function WarehouseReportPage() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [instruments, setInstruments] = useState<any[]>([]);
  const [moves, setMoves] = useState<Mv[]>([]);
  const [section, setSection] = useState<Section>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [item, setItem] = useState(ALL);
  const [dir, setDir] = useState(ALL);
  const [emp, setEmp] = useState(ALL);
  const [ord, setOrd] = useState(ALL);
  const [loc, setLoc] = useState(ALL);
  const [unit, setUnit] = useState(ALL);
  const [printedAt, setPrintedAt] = useState(new Date());

  useEffect(() => {
    (async () => {
      try {
        const [prods, insts, asg, sm, emps, ords, profs, intake] = await Promise.all([
          fetchAll<any>((a, b) => supabase.from("products").select("id,name,unit,stock_qty,last_price,currency,instrument_id").order("name").range(a, b)),
          fetchAll<any>((a, b) => supabase.from("instruments").select("id,name,quantity,status,price,currency").order("name").range(a, b)),
          fetchAll<any>((a, b) => supabase.from("instrument_assignments").select("*").order("issued_at", { ascending: false }).range(a, b)),
          fetchAll<any>((a, b) => supabase.from("stock_movements").select("id,product_id,order_id,direction,quantity,recipient_name,recipient_employee_id,comment,created_by,created_at,unit_price,currency,location,intake_item_id").order("created_at", { ascending: false }).range(a, b)),
          fetchAll<any>((a, b) => supabase.from("employees").select("id,full_name").range(a, b)),
          fetchAll<any>((a, b) => supabase.from("orders").select("id,order_number,product_name").range(a, b)),
          fetchAll<any>((a, b) => supabase.from("profiles").select("id,full_name").range(a, b)),
          fetchAll<any>((a, b) => supabase.from("intake_items").select("id,product_id,product_name,unit,unit_price,currency,created_at").range(a, b)),
        ]);
        const itMap = new Map(intake.map((x) => [x.id, x]));
        // Real kirim narxlari tarixi (mahsulot bo'yicha, vaqt tartibida)
        const priceHist = new Map<string, { at: string; price: number; cur: string }[]>();
        const addP = (pid: string | null, at: string, price: number, cur: string) => {
          if (!pid || !(price > 0)) return;
          const arr = priceHist.get(pid) ?? []; arr.push({ at, price, cur: cur || "UZS" }); priceHist.set(pid, arr);
        };
        sm.forEach((m) => m.direction === "in" && addP(m.product_id, m.created_at, Number(m.unit_price), m.currency));
        intake.forEach((x) => addP(x.product_id, x.created_at, Number(x.unit_price), x.currency));
        priceHist.forEach((a) => a.sort((x, y) => x.at.localeCompare(y.at)));
        const priorPrice = (pid: string | null, at: string) => {
          const arr = pid ? priceHist.get(pid) : undefined; if (!arr?.length) return null;
          let best = null as null | { price: number; cur: string };
          for (const e of arr) { if (e.at <= at) best = e; else break; }
          return best;
        };
        const commentPrice = (c: string) => {
          const mt = /([\d.\s]+)\s*(UZS|USD)\s*\//.exec(c || "");
          if (!mt) return null; const v = Number(mt[1].replace(/[.\s]/g, "")); return v > 0 ? { price: v, cur: mt[2] } : null;
        };
        const commentName = (c: string) => {
          const mt = /^(?:Добавить товар|Mahsulot qo['ʻ’]?shish|Товар):\s*(.+?)(?:\s*·|$)/i.exec(c || "");
          return mt ? mt[1].trim() : null;
        };
        const pMap = new Map(prods.map((p) => [p.id, p]));
        const iMap = new Map(insts.map((p) => [p.id, p]));
        const eMap = new Map(emps.map((e) => [e.id, e.full_name]));
        const oMap = new Map(ords.map((o) => [o.id, `${o.order_number}${o.product_name ? " — " + o.product_name : ""}`]));
        const uMap = new Map(profs.map((u) => [u.id, u.full_name]));
        const issued = new Map<string, number>();
        for (const a of asg) if (!a.returned_at && !a.written_off) issued.set(a.instrument_id, (issued.get(a.instrument_id) ?? 0) + Number(a.quantity));
        setProducts(prods.filter(isWarehouseProduct).map((p) => {
          const h = priceHist.get(p.id); const last = h?.[h.length - 1];
          const price = Number(p.last_price) > 0 ? Number(p.last_price) : last ? last.price : null;
          return { ...p, price, currency: Number(p.last_price) > 0 ? p.currency : last?.cur ?? p.currency };
        }));
        setInstruments(insts.map((i) => ({ ...i, price: Number(i.price) > 0 ? Number(i.price) : null, issued: issued.get(i.id) ?? 0, total: Number(i.quantity) + (issued.get(i.id) ?? 0) })));
        const mv: Mv[] = sm.map((m) => {
          const p = pMap.get(m.product_id);
          const it = m.intake_item_id ? itMap.get(m.intake_item_id) : null;
          const own = Number(m.unit_price) > 0 ? { price: Number(m.unit_price), cur: m.currency } : null;
          const pr = own ?? (it && Number(it.unit_price) > 0 ? { price: Number(it.unit_price), cur: it.currency } : null)
            ?? commentPrice(m.comment) ?? priorPrice(m.product_id ?? it?.product_id, m.created_at)
            ?? (p && Number(p.last_price) > 0 ? { price: Number(p.last_price), cur: p.currency } : null);
          const employee = m.recipient_employee_id ? eMap.get(m.recipient_employee_id) ?? "" : m.recipient_name ?? "";
          return {
            id: m.id, at: m.created_at, kind: p?.instrument_id ? "Instrument" : "Mahsulot", name: p?.name ?? it?.product_name ?? commentName(m.comment) ?? "", dir: m.direction, qty: Number(m.quantity),
            unit: p?.unit ?? it?.unit ?? "", person: displayUser(uMap.get(m.created_by) ?? ""), employee: displayUser(employee),
            order: m.order_id ? oMap.get(m.order_id) ?? "" : "", location: m.location ?? "", comment: m.comment ?? "",
            price: pr ? pr.price : null, currency: pr?.cur ?? m.currency ?? "UZS",
          };
        });
        for (const a of asg) {
          const ins = iMap.get(a.instrument_id);
          const base = { kind: "Instrument" as const, name: ins?.name ?? "—", qty: Number(a.quantity), unit: "dona", employee: eMap.get(a.employee_id) ?? "", order: "", location: "Sklad", price: Number(ins?.price) > 0 ? Number(ins.price) : null, currency: ins?.currency ?? "UZS" };
          mv.push({ ...base, id: a.id + "-o", at: a.issued_at, dir: "out", person: displayUser(uMap.get(a.issued_by) ?? ""), comment: [a.box_number ? `Karobka: ${a.box_number}` : "", a.issue_comment ?? ""].filter(Boolean).join(". ") });
          if (a.returned_at) mv.push({ ...base, id: a.id + "-i", at: a.returned_at, dir: "in", person: displayUser(uMap.get(a.returned_by) ?? ""), comment: a.return_comment ?? "" });
        }
        mv.sort((x, y) => y.at.localeCompare(x.at));
        setMoves(mv);
      } finally { setLoading(false); }
    })();
  }, []);

  const opts = useMemo(() => {
    const u = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return {
      items: u([...products.map((p) => p.name), ...instruments.map((i) => i.name)]),
      emps: u(moves.map((m) => m.employee)),
      ords: u(moves.map((m) => m.order)),
      locs: u(moves.map((m) => m.location)),
      units: u([...products.map((p) => p.unit), "dona"]),
    };
  }, [products, instruments, moves]);

  const fProducts = products.filter((p) => (item === ALL || p.name === item) && (unit === ALL || p.unit === unit));
  const fInstruments = instruments.filter((i) => (item === ALL || i.name === item) && (unit === ALL || unit === "dona"));
  const fMoves = moves.filter((m) => {
    const d = m.at.slice(0, 10);
    const local = fmtDate(m.at).split(".").reverse().join("-") || d;
    return (!from || local >= from) && (!to || local <= to) && (item === ALL || m.name === item) && (dir === ALL || m.dir === dir)
      && (emp === ALL || m.employee === emp) && (ord === ALL || m.order === ord) && (loc === ALL || m.location === loc) && (unit === ALL || m.unit === unit);
  });

  const money = (v: number | null, c: string) => (v == null ? "" : `${fmtNum(v)} ${c}`);
  const sumByCur = (rows: { v: number; c: string }[]) => {
    const r: Record<string, number> = {};
    rows.forEach(({ v, c }) => (r[c] = (r[c] ?? 0) + v));
    return Object.entries(r).map(([c, v]) => `${fmtNum(v)} ${c}`).join(" · ") || "0";
  };
  const qtyByUnit = (rows: { q: number; u: string }[]) => {
    const r: Record<string, number> = {};
    rows.forEach(({ q, u }) => (r[u || "—"] = (r[u || "—"] ?? 0) + q));
    return Object.entries(r).map(([u, q]) => `${fmtNum(q)} ${u}`).join(" · ") || "0";
  };

  const filterText = [
    from || to ? `Sana: ${from ? fmtDate(from) : "…"} — ${to ? fmtDate(to) : "…"}` : "Sana: barcha davr",
    item !== ALL && `Nomi: ${item}`, dir !== ALL && `Yo'nalish: ${dir === "in" ? "Kirim" : "Chiqim"}`,
    emp !== ALL && `Xodim: ${emp}`, ord !== ALL && `Zakaz: ${ord}`, loc !== ALL && `Joylashuv: ${loc}`, unit !== ALL && `Birlik: ${unit}`,
  ].filter(Boolean).join(" | ");

  const reset = () => { setFrom(""); setTo(""); setItem(ALL); setDir(ALL); setEmp(ALL); setOrd(ALL); setLoc(ALL); setUnit(ALL); };
  const doPrint = (pdf: boolean) => {
    setPrintedAt(new Date());
    const old = document.title;
    if (pdf) document.title = `Sklad_hisobot_${new Date().toISOString().slice(0, 10)}`;
    setTimeout(() => { window.print(); document.title = old; }, 50);
  };

  const sel = (label: string, v: string, set: (s: string) => void, list: { v: string; l: string }[]) => (
    <div className="space-y-1 basis-40 min-w-0 flex-1">
      <Label className="text-xs whitespace-normal break-words">{label} (ixtiyoriy)</Label>
      <Select value={v} onValueChange={set}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>Barchasi</SelectItem>{list.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  const asList = (a: string[]) => a.map((x) => ({ v: x, l: x }));
  const show = (s: Section) => section === "all" || section === s;

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild><Link to="/warehouse" aria-label="Orqaga"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-2xl font-bold tracking-tight">Sklad hisoboti</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => doPrint(false)} disabled={loading}><Printer className="h-4 w-4 mr-2" />Hisobotni chop etish</Button>
          <Button variant="secondary" onClick={() => doPrint(true)} disabled={loading}><FileDown className="h-4 w-4 mr-2" />PDF saqlash</Button>
        </div>
      </div>

      <Card className="no-print"><CardContent className="pt-4 space-y-3">
        <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
          <TabsList>
            <TabsTrigger value="all">Umumiy hisobot</TabsTrigger>
            <TabsTrigger value="products">Mahsulotlar</TabsTrigger>
            <TabsTrigger value="instruments">Instrumentlar</TabsTrigger>
            <TabsTrigger value="movements">Harakatlar tarixi</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1"><Label className="text-xs">Sanadan (ixtiyoriy)</Label><DateInput value={from} onChange={setFrom} /></div>
          <div className="space-y-1"><Label className="text-xs">Sanagacha (ixtiyoriy)</Label><DateInput value={to} onChange={setTo} /></div>
          {sel("Mahsulot / instrument", item, setItem, asList(opts.items))}
          {sel("Kirim/chiqim", dir, setDir, [{ v: "in", l: "Kirim" }, { v: "out", l: "Chiqim" }])}
          {sel("Xodim", emp, setEmp, asList(opts.emps))}
          {sel("Zakaz", ord, setOrd, asList(opts.ords))}
          {sel("Joylashuv", loc, setLoc, asList(opts.locs))}
          {sel("O'lchov birligi", unit, setUnit, asList(opts.units))}
          <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4 mr-2" />Filtrni tozalash</Button>
        </div>
        <p className="text-xs text-muted-foreground">Sana, yo'nalish, xodim, zakaz va joylashuv filtrlari harakatlar tarixiga; nomi va birlik filtrlari barcha bo'limlarga qo'llanadi.</p>
      </CardContent></Card>

      {loading ? <p className="text-muted-foreground">Yuklanmoqda…</p> : (
        <div id="print-area" className="report-sheet space-y-6">
          <div className="report-head">
            <h2 className="text-xl font-bold">Sklad hisoboti{section !== "all" ? ` — ${{ products: "Mahsulotlar", instruments: "Instrumentlar", movements: "Harakatlar tarixi" }[section]}` : ""}</h2>
            <p className="text-sm">Chiqarilgan: {fmtDateTime24(printedAt)}</p>
            <p className="text-sm">Filtrlar: {filterText}</p>
          </div>

          {show("products") && (
            <section>
              <h3 className="font-semibold mb-2">1. Mahsulotlar ({fProducts.length})</h3>
              <div className="report-scroll overflow-x-auto max-w-full overscroll-x-contain"><table className="report-table"><thead><tr><th>№</th><th>Nomi</th><th>Qoldiq</th><th>Birlik</th><th>Narxi</th><th>Jami qiymati</th></tr></thead>
                <tbody>{fProducts.map((p, i) => (
                  <tr key={p.id}><td>{i + 1}</td><td>{p.name}</td><td className="num">{fmtNum(p.stock_qty)}</td><td>{p.unit}</td><td className="num">{money(p.price, p.currency)}</td><td className="num">{p.price == null ? "" : money(Number(p.stock_qty) * p.price, p.currency)}</td></tr>
                ))}</tbody>
                <tfoot><tr><td colSpan={2}>Jami</td><td colSpan={2}>{qtyByUnit(fProducts.map((p) => ({ q: Number(p.stock_qty), u: p.unit })))}</td><td></td><td className="num">{sumByCur(fProducts.filter((p) => p.price != null).map((p) => ({ v: Number(p.stock_qty) * p.price, c: p.currency })))}</td></tr></tfoot>
              </table></div>
            </section>
          )}

          {show("instruments") && (
            <section>
              <h3 className="font-semibold mb-2">2. Instrumentlar ({fInstruments.length})</h3>
              <div className="report-scroll overflow-x-auto max-w-full overscroll-x-contain"><table className="report-table"><thead><tr><th>№</th><th>Nomi</th><th>Umumiy soni</th><th>Skladda</th><th>Xodimlarda</th><th>Narxi</th><th>Jami qiymati</th></tr></thead>
                <tbody>{fInstruments.map((x, i) => (
                  <tr key={x.id}><td>{i + 1}</td><td>{x.name}</td><td className="num">{fmtNum(x.total)}</td><td className="num">{fmtNum(x.quantity)}</td><td className="num">{fmtNum(x.issued)}</td><td className="num">{money(x.price, x.currency)}</td><td className="num">{x.price == null ? "" : money(x.total * x.price, x.currency)}</td></tr>
                ))}</tbody>
                <tfoot><tr><td colSpan={2}>Jami</td>
                  <td className="num">{fmtNum(fInstruments.reduce((s, x) => s + x.total, 0))}</td>
                  <td className="num">{fmtNum(fInstruments.reduce((s, x) => s + Number(x.quantity), 0))}</td>
                  <td className="num">{fmtNum(fInstruments.reduce((s, x) => s + x.issued, 0))}</td><td></td>
                  <td className="num">{sumByCur(fInstruments.filter((x) => x.price != null).map((x) => ({ v: x.total * x.price, c: x.currency })))}</td></tr></tfoot>
              </table></div>
            </section>
          )}

          {show("movements") && (
            <section>
              <h3 className="font-semibold mb-2">3. Harakatlar tarixi ({fMoves.length})</h3>
              <div className="report-scroll overflow-x-auto max-w-full overscroll-x-contain"><table className="report-table"><thead><tr><th>Sana/vaqt</th><th>Turi</th><th>Nomi</th><th>Yo'nalish</th><th>Miqdor</th><th>Birlik</th><th>1 birlik narxi</th><th>Jami summa</th><th>Kiritgan</th><th>Xodim / oluvchi</th><th>Zakaz</th><th>Joylashuv</th><th>Izoh</th></tr></thead>
                <tbody>{fMoves.map((m) => (
                  <tr key={m.id}><td>{fmtDateTime24(m.at)}</td><td>{m.kind}</td><td>{m.name}</td><td>{m.dir === "in" ? "Kirim" : "Chiqim"}</td><td className="num">{fmtNum(m.qty)}</td><td>{m.unit}</td><td className="num">{money(m.price, m.currency)}</td><td className="num">{m.price == null ? "" : money(m.qty * m.price, m.currency)}</td><td>{m.person}</td><td>{m.employee}</td><td>{m.order}</td><td>{m.location}</td><td>{m.comment}</td></tr>
                ))}</tbody>
                <tfoot>
                  <tr><td colSpan={4}>Jami kirim</td><td colSpan={9}>{qtyByUnit(fMoves.filter((m) => m.dir === "in").map((m) => ({ q: m.qty, u: m.unit })))} — qiymati {sumByCur(fMoves.filter((m) => m.dir === "in").filter((m) => m.price != null).map((m) => ({ v: m.qty * (m.price as number), c: m.currency })))}</td></tr>
                  <tr><td colSpan={4}>Jami chiqim</td><td colSpan={9}>{qtyByUnit(fMoves.filter((m) => m.dir === "out").map((m) => ({ q: m.qty, u: m.unit })))} — qiymati {sumByCur(fMoves.filter((m) => m.dir === "out").filter((m) => m.price != null).map((m) => ({ v: m.qty * (m.price as number), c: m.currency })))}</td></tr>
                </tfoot>
              </table></div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
