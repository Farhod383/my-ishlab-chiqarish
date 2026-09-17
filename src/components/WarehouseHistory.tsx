import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownCircle, ArrowUpCircle, Pencil, Trash2, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { fmtDateTime24, fmtNum } from "@/lib/format";
import { matchesAcrossScripts } from "@/lib/translit";
import { intakeCode } from "@/lib/intake";

const ALL = "__all__";

type Row = {
  id: string;
  kind: "product" | "metal";
  created_at: string;
  direction: "in" | "out";
  productName: string;
  metalType: string;
  thickness: number | null;
  length: number | null;
  width: number | null;
  qty: number;
  unit: string;
  kg: number | null;
  price: number | null;
  currency: string;
  location: string;
  person: string;
  orderNumber: string;
  invoiceId: string | null;
  invoiceLabel: string;
  source: string;
  comment: string;
  raw: any;
};

const num = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));
const dim = (v: number | null) => (v === null ? "—" : String(v));

export default function WarehouseHistory({
  canManage,
  onEdit,
  onDelete,
  reloadKey,
}: {
  canManage: boolean;
  onEdit?: (m: any) => void;
  onDelete?: (m: any) => void;
  reloadKey?: number;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [norms, setNorms] = useState<any[]>([]);

  // filters
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fDir, setFDir] = useState(ALL);
  const [fProduct, setFProduct] = useState(ALL);
  const [fMetal, setFMetal] = useState(ALL);
  const [fThick, setFThick] = useState(ALL);
  const [fLen, setFLen] = useState(ALL);
  const [fWid, setFWid] = useState(ALL);
  const [fOrder, setFOrder] = useState(ALL);
  const [fInvoice, setFInvoice] = useState(ALL);
  const [fPerson, setFPerson] = useState(ALL);
  const [fLoc, setFLoc] = useState(ALL);
  const [fNorm, setFNorm] = useState(ALL);
  const [limit, setLimit] = useState(200);

  const load = async () => {
    setLoading(true);
    // 1000 satrdan ko'p bo'lishi mumkin — sahifalab olamiz
    const pageSize = 1000;
    const FULL =
      "*, product:products(name, unit), order:orders!stock_movements_order_id_fkey(order_number, product_name), intake_session:intake_sessions(id, started_at, finished_at, supplier, created_by_name)";
    let all: any[] = [];
    let cols = FULL;
    for (let page = 0; page < 6; page++) {
      let { data, error } = await supabase
        .from("stock_movements")
        .select(cols)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) {
        // embed muammosi bo'lsa — tarixni baribir ko'rsatamiz
        cols = "*";
        const retry = await supabase
          .from("stock_movements")
          .select(cols)
          .order("created_at", { ascending: false })
          .range(page * pageSize, page * pageSize + pageSize - 1);
        if (retry.error) break;
        data = retry.data as any;
      }
      all = all.concat((data as any[]) ?? []);
      if (!data || (data as any[]).length < pageSize) break;
    }

    const [{ data: metal }, { data: normData }] = await Promise.all([
      supabase
        .from("metal_movements")
        .select("*, stock:metal_stock(metal_type, length_mm, width_mm, thickness_mm, weight_kg), order:orders(order_number)")
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase.from("metal_norms").select("*").order("metal_type"),
    ]);
    setNorms(normData ?? []);

    const ids = Array.from(
      new Set([...all.map((x: any) => x.created_by), ...(metal ?? []).map((x: any) => x.created_by)].filter(Boolean))
    );
    let profs: Record<string, string> = {};
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      (data ?? []).forEach((p: any) => { profs[p.id] = p.full_name || p.email || ""; });
    }

    // embed ishlamagan bo'lsa — nomlarni alohida so'rov bilan to'ldiramiz
    if (all.some((m: any) => !m.product)) {
      const pIds = Array.from(new Set(all.map((m: any) => m.product_id).filter(Boolean)));
      const oIds = Array.from(new Set(all.map((m: any) => m.order_id).filter(Boolean)));
      const sIds = Array.from(new Set(all.map((m: any) => m.intake_session_id).filter(Boolean)));
      const [pr, or_, se] = await Promise.all([
        pIds.length ? supabase.from("products").select("id, name, unit, weight_kg").in("id", pIds) : Promise.resolve({ data: [] as any[] }),
        oIds.length ? supabase.from("orders").select("id, order_number, product_name").in("id", oIds) : Promise.resolve({ data: [] as any[] }),
        sIds.length ? supabase.from("intake_sessions").select("id, started_at, finished_at, supplier, created_by_name").in("id", sIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const pMap = new Map((pr.data ?? []).map((x: any) => [x.id, x]));
      const oMap = new Map((or_.data ?? []).map((x: any) => [x.id, x]));
      const sMap = new Map((se.data ?? []).map((x: any) => [x.id, x]));
      all = all.map((m: any) => ({
        ...m,
        product: m.product ?? pMap.get(m.product_id) ?? null,
        order: m.order ?? oMap.get(m.order_id) ?? null,
        intake_session: m.intake_session ?? sMap.get(m.intake_session_id) ?? null,
      }));
    }



    const productRows: Row[] = all.map((m: any) => ({
      id: m.id,
      kind: "product",
      created_at: m.created_at,
      direction: m.direction,
      productName: m.product?.name ?? "—",
      metalType: "",
      thickness: null,
      length: null,
      width: null,
      qty: Number(m.quantity || 0),
      unit: m.product?.unit ?? "",
      kg: Number(m.weight_kg) > 0
        ? Number(m.weight_kg)
        : (Number(m.product?.weight_kg) > 0 ? Number(m.product.weight_kg) * Number(m.quantity || 0) : null),
      price: num(m.unit_price),
      currency: m.currency ?? "UZS",
      location: m.location ?? "",
      person: m.recipient_name || profs[m.created_by] || "",
      orderNumber: m.order?.order_number ?? "",
      invoiceId: m.intake_session?.id ?? null,
      invoiceLabel: m.intake_session?.started_at ? intakeCode(m.intake_session) : "",
      source: m.source ?? "",
      comment: m.comment ?? "",
      raw: m,
    }));

    const metalRows: Row[] = (metal ?? []).map((m: any) => ({
      id: m.id,
      kind: "metal",
      created_at: m.created_at,
      direction: m.direction,
      productName: m.stock?.metal_type ? `${m.stock.metal_type} ${m.stock.length_mm}×${m.stock.width_mm} S=${m.stock.thickness_mm}` : "Metall",
      metalType: m.stock?.metal_type ?? "",
      thickness: num(m.stock?.thickness_mm),
      length: num(m.stock?.length_mm),
      width: num(m.stock?.width_mm),
      qty: Number(m.quantity || 0),
      unit: "dona",
      kg: Number(m.weight_kg || 0),
      price: null,
      currency: "UZS",
      location: "",
      person: m.created_by_name || profs[m.created_by] || "",
      orderNumber: m.order?.order_number ?? "",
      invoiceId: null,
      invoiceLabel: "",
      source: m.direction === "out" ? "Konstruktor sarfi" : "Metall kirimi",
      comment: m.comment ?? "",
      raw: m,
    }));

    const merged = [...productRows, ...metalRows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, [reloadKey]);

  const uniq = (arr: any[]) =>
    Array.from(new Set(arr.map(x => (x ?? "").toString().trim()).filter(Boolean))).sort();

  const opts = useMemo(() => ({
    products: uniq(rows.filter(r => r.kind === "product").map(r => r.productName)),
    metals: uniq(rows.map(r => r.metalType)),
    thick: uniq(rows.map(r => r.thickness)),
    len: uniq(rows.map(r => r.length)),
    wid: uniq(rows.map(r => r.width)),
    orders: uniq(rows.map(r => r.orderNumber)),
    invoices: uniq(rows.map(r => r.invoiceLabel)),
    persons: uniq(rows.map(r => r.person)),
    locs: uniq(rows.map(r => r.location)),
  }), [rows]);

  const normOptions = useMemo(() => {
    const set = new Map<string, { key: string; label: string }>();
    const push = (t: any, l: any, w: any, s: any) => {
      if (!t) return;
      const key = `${t}|${Number(l)}|${Number(w)}|${Number(s)}`;
      set.set(key, { key, label: `${t} → ${Number(l)}×${Number(w)} → S=${Number(s)} mm` });
    };
    norms.forEach((n: any) => push(n.metal_type, n.length_mm, n.width_mm, n.thickness_mm));
    rows.filter(r => r.kind === "metal").forEach(r => push(r.metalType, r.length, r.width, r.thickness));
    return Array.from(set.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [norms, rows]);

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const to = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    const term = q.trim().toLowerCase();
    return rows.filter(r => {
      const ts = new Date(r.created_at).getTime();
      if (from && ts < from) return false;
      if (to && ts > to) return false;
      if (fDir !== ALL && r.direction !== fDir) return false;
      if (fProduct !== ALL && r.productName !== fProduct) return false;
      if (fMetal !== ALL && r.metalType !== fMetal) return false;
      if (fThick !== ALL && String(r.thickness ?? "") !== fThick) return false;
      if (fLen !== ALL && String(r.length ?? "") !== fLen) return false;
      if (fWid !== ALL && String(r.width ?? "") !== fWid) return false;
      if (fOrder !== ALL && r.orderNumber !== fOrder) return false;
      if (fInvoice !== ALL && r.invoiceLabel !== fInvoice) return false;
      if (fPerson !== ALL && r.person !== fPerson) return false;
      if (fLoc !== ALL && r.location !== fLoc) return false;
      if (fNorm !== ALL) {
        if (r.kind !== "metal") return false;
        const key = `${r.metalType}|${Number(r.length)}|${Number(r.width)}|${Number(r.thickness)}`;
        if (key !== fNorm) return false;
      }
      if (term) {
        const hay = [r.productName, r.metalType, r.comment, r.person, r.source, r.orderNumber, r.invoiceLabel, r.location]
          .filter(Boolean).join(" ");
        if (!matchesAcrossScripts(hay, term)) return false;
      }
      return true;
    });
  }, [rows, q, dateFrom, dateTo, fDir, fProduct, fMetal, fThick, fLen, fWid, fOrder, fInvoice, fPerson, fLoc, fNorm]);

  const shown = filtered.slice(0, limit);

  const reset = () => {
    setQ(""); setDateFrom(""); setDateTo("");
    setFDir(ALL); setFProduct(ALL); setFMetal(ALL); setFThick(ALL); setFLen(ALL); setFWid(ALL);
    setFOrder(ALL); setFInvoice(ALL); setFPerson(ALL); setFLoc(ALL); setFNorm(ALL);
  };

  const Picker = ({ label, value, onChange, items, allLabel }: {
    label: string; value: string; onChange: (v: string) => void; items: any[]; allLabel: string;
  }) => (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {items.map((v: any) => <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base">Harakatlar tarixi</CardTitle>
            <CardDescription>
              Sklad kirim/chiqimlari va Konstruktor metall sarfi — {fmtNum(filtered.length)} ta yozuv
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Qidirish..." className="h-9 w-48" />
            <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="h-3.5 w-3.5 mr-1" />Tozalash</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2 mt-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Sana (dan)</Label>
            <Input type="date" className="h-9" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Sana (gacha)</Label>
            <Input type="date" className="h-9" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Kirim / Chiqim</Label>
            <Select value={fDir} onValueChange={setFDir}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Hammasi</SelectItem>
                <SelectItem value="in">Kirim</SelectItem>
                <SelectItem value="out">Chiqim</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Picker label="Mahsulot" value={fProduct} onChange={setFProduct} items={opts.products} allLabel="Barcha mahsulot" />
          <Picker label="Metall turi" value={fMetal} onChange={setFMetal} items={opts.metals} allLabel="Barcha metall" />
          <Picker label="Qalinligi (S)" value={fThick} onChange={setFThick} items={opts.thick} allLabel="Barchasi" />
          <Picker label="Bo'yi" value={fLen} onChange={setFLen} items={opts.len} allLabel="Barchasi" />
          <Picker label="Eni" value={fWid} onChange={setFWid} items={opts.wid} allLabel="Barchasi" />
          <Picker label="Zakaz" value={fOrder} onChange={setFOrder} items={opts.orders} allLabel="Barcha zakaz" />
          <Picker label="Nakladnoy" value={fInvoice} onChange={setFInvoice} items={opts.invoices} allLabel="Barchasi" />
          <Picker label="Kim" value={fPerson} onChange={setFPerson} items={opts.persons} allLabel="Barchasi" />
          <Picker label="Zavod / joylashuv" value={fLoc} onChange={setFLoc} items={opts.locs} allLabel="Barchasi" />
          <div className="space-y-1 col-span-2">
            <Label className="text-[11px] text-muted-foreground">Metall normativi</Label>
            <Select value={fNorm} onValueChange={setFNorm}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Barcha normativlar</SelectItem>
                {normOptions.map(n => <SelectItem key={n.key} value={n.key}>{n.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="border-t overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-right">№</TableHead>
                <TableHead>Sana / vaqt</TableHead>
                <TableHead>Kirim / Chiqim</TableHead>
                <TableHead>Mahsulot</TableHead>
                <TableHead>Metall turi</TableHead>
                <TableHead className="text-right">S</TableHead>
                <TableHead className="text-right">Bo'yi</TableHead>
                <TableHead className="text-right">Eni</TableHead>
                <TableHead className="text-right">Miqdor</TableHead>
                <TableHead className="text-right">kg</TableHead>
                <TableHead className="text-right">tonna</TableHead>
                <TableHead className="text-right">Narx</TableHead>
                <TableHead>Zavod</TableHead>
                <TableHead>Kim</TableHead>
                <TableHead>Zakaz</TableHead>
                <TableHead>Nakladnoy</TableHead>
                <TableHead>Manba</TableHead>
                <TableHead>Izoh</TableHead>
                {canManage && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r, idx) => (
                <TableRow
                  key={`${r.kind}-${r.id}`}
                  className={canManage && r.kind === "product" ? "cursor-pointer hover:bg-muted/40" : undefined}
                  onClick={canManage && r.kind === "product" && onEdit ? () => onEdit(r.raw) : undefined}
                >
                  <TableCell className="text-right text-xs font-mono text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmtDateTime24(r.created_at)}</TableCell>
                  <TableCell>
                    {r.direction === "out"
                      ? <span className="inline-flex items-center gap-1 text-status-red text-xs font-semibold"><ArrowDownCircle className="h-3.5 w-3.5" />Chiqim</span>
                      : <span className="inline-flex items-center gap-1 text-status-green text-xs font-semibold"><ArrowUpCircle className="h-3.5 w-3.5" />Kirim</span>}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{r.productName}</TableCell>
                  <TableCell className="text-xs">{r.metalType || "—"}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{dim(r.thickness)}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{dim(r.length)}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{dim(r.width)}</TableCell>
                  <TableCell className={`text-right font-mono font-semibold ${r.direction === "out" ? "text-status-red" : "text-status-green"}`}>
                    {r.direction === "out" ? "-" : "+"}{fmtNum(r.qty)} {r.unit}
                  </TableCell>
                  <TableCell className="text-right text-xs font-mono">{r.kg !== null ? fmtNum(r.kg) : "—"}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{r.kg !== null ? (r.kg / 1000).toFixed(4) : "—"}</TableCell>
                  <TableCell className="text-right text-xs font-mono">
                    {r.price && r.price > 0 ? <>{fmtNum(r.price)} <span className="text-muted-foreground">{r.currency}</span></> : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{r.location || "—"}</TableCell>
                  <TableCell className="text-sm">{r.person || "—"}</TableCell>
                  <TableCell className="text-sm font-mono">{r.orderNumber || <span className="text-muted-foreground">Umumiy</span>}</TableCell>
                  <TableCell className="text-xs font-mono">
                    {r.invoiceLabel ? (
                      <Link to="/invoices" className="text-primary hover:underline" onClick={e => e.stopPropagation()}>{r.invoiceLabel}</Link>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.source || "—"}</TableCell>
                  <TableCell className="text-xs italic text-muted-foreground max-w-[200px] truncate">{r.comment || "—"}</TableCell>
                  {canManage && (
                    <TableCell onClick={e => e.stopPropagation()}>
                      {r.kind === "product" && (
                        <div className="flex gap-1">
                          {onEdit && <Button size="sm" variant="ghost" onClick={() => onEdit(r.raw)}><Pencil className="h-3.5 w-3.5" /></Button>}
                          {onDelete && <Button size="sm" variant="ghost" onClick={() => onDelete(r.raw)}><Trash2 className="h-3.5 w-3.5 text-status-red" /></Button>}
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={canManage ? 19 : 18} className="text-center text-muted-foreground py-6">Harakatlar yo'q</TableCell></TableRow>
              )}
              {loading && (
                <TableRow><TableCell colSpan={canManage ? 19 : 18} className="text-center text-muted-foreground py-6">Yuklanmoqda...</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {filtered.length > shown.length && (
          <div className="p-3 text-center border-t">
            <Button variant="outline" size="sm" onClick={() => setLimit(l => l + 200)}>
              Yana ko'rsatish ({fmtNum(filtered.length - shown.length)})
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
