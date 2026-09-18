import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { toast } from "sonner";
import { fmtDateTime24 } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import NumberInput from "@/components/NumberInput";
import SearchableSelect from "@/components/SearchableSelect";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRIORITY_OPTIONS } from "@/components/PriorityDot";
import { Plus, Layers3, Scissors, PackagePlus } from "lucide-react";

const UNITS = ["dona", "kg", "tonna", "metr", "litr", "rulon", "komplekt"] as const;
const CURRENCIES = ["UZS", "USD"] as const;


interface Norm {
  id: string; metal_type: string; length_mm: number; width_mm: number;
  thickness_mm: number; weight_kg: number;
}
interface StockRow {
  id: string; metal_type: string; length_mm: number; width_mm: number;
  thickness_mm: number; weight_kg: number; quantity: number;
}
interface MoveRow {
  id: string; created_at: string; direction: "in" | "out"; stock_id: string;
  quantity: number; weight_kg: number; order_id: string | null;
  comment: string | null; created_by_name: string | null;
}
interface OrderLite { id: string; order_number: string; product_name: string }

const n = (v: any) => Number(v ?? 0);
const fmtKg = (v: number) => `${n(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} kg`;
const fmtT = (v: number) => `${(n(v) / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 4 })} t`;
const sizeLabel = (m: { length_mm?: number | null; width_mm?: number | null }) =>
  m.width_mm && m.length_mm ? `${n(m.width_mm)}×${n(m.length_mm)} mm` : "—";
const norm3 = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const stockLabel = (s: StockRow) =>
  `${s.metal_type} — ${sizeLabel(s)} — S=${n(s.thickness_mm)} mm`;

export default function MetalPage() {
  const { user, hasRole } = useAuth();
  const { t: tr } = useI18n();
  const tm = tr.metal;
  const canConsume = hasRole(["admin", "engineer"]);
  const canNorm = hasRole(["admin", "engineer", "warehouse"]);
  const canIntake = hasRole(["admin", "engineer", "warehouse"]);

  const [norms, setNorms] = useState<Norm[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [nr, st, mv, or_] = await Promise.all([
      supabase.from("metal_norms").select("*").order("metal_type").order("length_mm").order("thickness_mm"),
      supabase.from("metal_stock").select("*").order("metal_type").order("length_mm").order("thickness_mm"),
      supabase.from("metal_movements")
        .select("id,created_at,direction,stock_id,quantity,weight_kg,order_id,comment,created_by_name")
        .order("created_at", { ascending: false }).limit(500),
      supabase.from("orders").select("id,order_number,product_name").neq("status", "cancelled").order("created_at", { ascending: false }).limit(300),
    ]);
    setNorms((nr.data as any) ?? []);
    setStock(((st.data as any) ?? []) as StockRow[]);
    setMoves(((mv.data as any) ?? []) as MoveRow[]);
    setOrders((or_.data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stockById = useMemo(() => Object.fromEntries(stock.map((s) => [s.id, s])), [stock]);
  const orderById = useMemo(() => Object.fromEntries(orders.map((o) => [o.id, o])), [orders]);

  const rows = useMemo(() => stock.map((s) => {
    const kgPerPiece = n(s.weight_kg);
    const inKg = moves.filter((m) => m.stock_id === s.id && m.direction === "in").reduce((a, m) => a + n(m.weight_kg), 0);
    const outKg = moves.filter((m) => m.stock_id === s.id && m.direction === "out").reduce((a, m) => a + n(m.weight_kg), 0);
    return { s, kgPerPiece, pieces: n(s.quantity), kg: n(s.quantity) * kgPerPiece, inKg, outKg };
  }), [stock, moves]);

  const totalKg = useMemo(() => rows.reduce((a, r) => a + r.kg, 0), [rows]);
  const totalInKg = useMemo(() => moves.filter((m) => m.direction === "in").reduce((a, m) => a + n(m.weight_kg), 0), [moves]);
  const totalOutKg = useMemo(() => moves.filter((m) => m.direction === "out").reduce((a, m) => a + n(m.weight_kg), 0), [moves]);

  const actorName = user?.email ?? null;
  const [busy, setBusy] = useState(false);

  /* ---------------- Kirim (Sklad "Mahsulot qo'shish" formasi bilan bir xil) ---------------- */
  const [inOpen, setInOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("dona");
  const [newMin, setNewMin] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newPriority, setNewPriority] = useState("green");
  const [newCurrency, setNewCurrency] = useState("UZS");
  const [newPhone, setNewPhone] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [newImage, setNewImage] = useState<File | null>(null);

  const kgPerUnit = (u: string) => (u === "tonna" ? 1000 : 1);

  const doIntake = async () => {
    if (!newName.trim()) return toast.error(tm.errName);
    const qty = Number(newQty);
    if (!qty || qty <= 0) return toast.error(tm.errQty);
    setBusy(true);
    const commentParts = [
      newSupplier ? `${tm.supplier}: ${newSupplier}` : null,
      newSource.trim() ? `${tm.sourceLine}: ${newSource.trim()}` : null,
      newPhone.trim() ? `${tm.phoneLine}: ${newPhone.trim()}` : null,
      Number(newPrice) ? `1 ${unitLabel(newUnit)} ${tm.priceLine}: ${Number(newPrice)} ${newCurrency}` : null,
      newMin.trim() ? `${tm.minLimit}: ${newMin.trim()}` : null,
      `${tm.priorityLine}: ${newPriority}`,
    ].filter(Boolean);
    const { error } = await supabase.rpc("metal_intake" as any, {
      _metal_type: newName.trim(),
      _length: 0,
      _width: 0,
      _thickness: 0,
      _weight_kg: kgPerUnit(newUnit),
      _quantity: qty,
      _comment: commentParts.join(" · ") || null,
      _actor_name: actorName,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(tm.okIntake);
    setInOpen(false);
    setNewName(""); setNewQty(""); setNewUnit("dona"); setNewMin(""); setNewPrice("");
    setNewPriority("green"); setNewCurrency("UZS"); setNewPhone(""); setNewSource("");
    setNewSupplier(""); setNewImage(null);
    load();
  };


  /* ---------------- Chiqim (Konstruktor sarfi) ---------------- */
  const [outOpen, setOutOpen] = useState(false);
  const [outType, setOutType] = useState("");
  const [outThick, setOutThick] = useState("");
  const [outSize, setOutSize] = useState(""); // "width×length"
  const [outOrder, setOutOrder] = useState("");
  const [outQty, setOutQty] = useState("");
  const [outComment, setOutComment] = useState("");

  const outTypes = useMemo(
    () => Array.from(new Set(rows.filter((r) => r.pieces > 0).map((r) => r.s.metal_type))),
    [rows]
  );
  const outThicks = useMemo(
    () => Array.from(new Set(rows.filter((r) => r.pieces > 0 && r.s.metal_type === outType).map((r) => String(n(r.s.thickness_mm))))),
    [rows, outType]
  );
  const outSizes = useMemo(
    () => Array.from(new Set(rows
      .filter((r) => r.pieces > 0 && r.s.metal_type === outType && String(n(r.s.thickness_mm)) === outThick)
      .map((r) => `${n(r.s.width_mm)}×${n(r.s.length_mm)}`))),
    [rows, outType, outThick]
  );

  const outRow = rows.find(
    (r) => r.s.metal_type === outType &&
      String(n(r.s.thickness_mm)) === outThick &&
      `${n(r.s.width_mm)}×${n(r.s.length_mm)}` === outSize
  );
  const outKg = n(outRow?.kgPerPiece) * Number(outQty || 0);

  const doConsume = async () => {
    if (!outRow) return toast.error(tm.errPick);
    if (!outOrder) return toast.error(tm.errOrder);
    const q = Number(outQty);
    if (!q || q <= 0) return toast.error(tm.errPieces);
    if (q > outRow.pieces + 0.0001) return toast.error(`${tm.errNotEnough}: ${outRow.pieces} ${tm.pieces}`);
    setBusy(true);
    const { error } = await supabase.rpc("metal_consume" as any, {
      _stock_id: outRow.s.id, _quantity: q, _order_id: outOrder,
      _comment: outComment || null, _actor_name: actorName,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${tm.okConsume}: ${fmtKg(outKg)} (${fmtT(outKg)})`);
    setOutOpen(false); setOutQty(""); setOutComment("");
    load();
  };


  /* ---------------- Norma ---------------- */
  const [normOpen, setNormOpen] = useState(false);
  const [nmType, setNmType] = useState("");
  const [nmLen, setNmLen] = useState("");
  const [nmWid, setNmWid] = useState("");
  const [nmThick, setNmThick] = useState("");
  const [nmWeight, setNmWeight] = useState("");

  const saveNorm = async () => {
    if (!nmType.trim() || !nmLen || !nmWid || !nmThick || !Number(nmWeight))
      return toast.error(tm.errAllFields);
    setBusy(true);
    const { error } = await supabase.from("metal_norms").insert({
      metal_type: nmType.trim(), length_mm: Number(nmLen), width_mm: Number(nmWid),
      thickness_mm: Number(nmThick), weight_kg: Number(nmWeight), created_by: user?.id ?? null,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(tm.okNorm);
    setNormOpen(false); setNmType(""); setNmLen(""); setNmWid(""); setNmThick(""); setNmWeight("");
    load();
  };

  const orderOptions = orders.map((o) => ({ value: o.id, label: `${o.order_number} — ${o.product_name}` }));


  const movesTable = (list: MoveRow[], kind: "in" | "out" | "all") => (
    <Card><CardContent className="p-0 overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>{tm.colDate}</TableHead>
          {kind === "all" && <TableHead>{tm.colKind}</TableHead>}
          <TableHead>{tm.colMetal}</TableHead><TableHead>{tm.colSize}</TableHead><TableHead>{tm.colS}</TableHead>
          <TableHead className="text-right">{tm.colPieces}</TableHead><TableHead className="text-right">{tm.colKg}</TableHead>
          <TableHead className="text-right">{tm.colTon}</TableHead><TableHead>{tm.colOrder}</TableHead>
          <TableHead>{tm.colWho}</TableHead><TableHead>{tm.colComment}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {list.map((m) => {
            const s = stockById[m.stock_id] as StockRow | undefined;
            const o = m.order_id ? orderById[m.order_id] : null;
            return (
              <TableRow key={m.id}>
                <TableCell className="whitespace-nowrap">{fmtDateTime24(m.created_at)}</TableCell>
                {kind === "all" && (
                  <TableCell>
                    <Badge variant="outline" className={m.direction === "in"
                      ? "bg-status-green/15 text-status-green border-status-green/30"
                      : "bg-status-red/15 text-status-red border-status-red/30"}>
                      {m.direction === "in" ? tm.tabIn : tm.tabOut}
                    </Badge>
                  </TableCell>
                )}
                <TableCell className="font-medium">{s?.metal_type ?? "—"}</TableCell>
                <TableCell>{s ? sizeLabel(s) : "—"}</TableCell>
                <TableCell>{s ? n(s.thickness_mm) : "—"}</TableCell>
                <TableCell className="text-right font-mono">{n(m.quantity)}</TableCell>
                <TableCell className="text-right font-mono">{fmtKg(m.weight_kg)}</TableCell>
                <TableCell className="text-right font-mono">{fmtT(m.weight_kg)}</TableCell>
                <TableCell>{o ? `${o.order_number} — ${o.product_name}` : "—"}</TableCell>
                <TableCell className="truncate max-w-[180px]">{m.created_by_name ?? "—"}</TableCell>
                <TableCell className="truncate max-w-[200px]">{m.comment ?? "—"}</TableCell>
              </TableRow>
            );
          })}
          {!list.length && (
            <TableRow><TableCell colSpan={kind === "all" ? 11 : 10} className="text-center text-muted-foreground py-8">
              {loading ? tm.loading : tm.noMoves}
            </TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </CardContent></Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{tm.title}</h1>
          <p className="text-sm text-muted-foreground">{tm.subtitle}</p>
        </div>
        <div className="flex gap-2">
          {canIntake && (
            <Dialog open={inOpen} onOpenChange={setInOpen}>
              <DialogTrigger asChild>
                <Button><PackagePlus className="h-4 w-4 mr-1" /> {tm.intake}</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{tm.addProduct}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>{tm.productName} *</Label>
                    <Input list="dl-metal-names" value={newName} onChange={(e) => setNewName(e.target.value)} />
                    <datalist id="dl-metal-names">
                      {[...new Set([...norms.map((x) => x.metal_type), ...stock.map((s) => s.metal_type)])].map((t) => <option key={t} value={t} />)}
                    </datalist>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{tm.qty} *</Label><NumberInput min={0} step="any" value={newQty} onChange={(e) => setNewQty(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" /></div>
                    <div><Label>{tm.unit} *</Label>
                      <Select value={newUnit} onValueChange={setNewUnit}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{unitLabel(u)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{tm.minLimit}</Label><NumberInput min={0} value={newMin} onChange={(e) => setNewMin(e.target.value)} placeholder="0" /></div>
                    <div><Label>{tm.price}</Label><NumberInput min={0} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{tm.priority}</Label>
                      <Select value={newPriority} onValueChange={setNewPriority}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}><span className="inline-flex items-center gap-2"><span className={`inline-block h-2.5 w-2.5 rounded-full ${p.color}`} />{prioLabel(p.value)}</span></SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>{tm.currency}</Label>
                      <Select value={newCurrency} onValueChange={setNewCurrency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>{tm.phone}</Label><Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+998..." /></div>
                  <div><Label>{tm.source}</Label><Input value={newSource} onChange={(e) => setNewSource(e.target.value)} /></div>
                  <div><Label>{tm.supplier}</Label>
                    <Select value={newSupplier} onValueChange={setNewSupplier}>
                      <SelectTrigger><SelectValue placeholder={tm.select} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Davronxo'ja">Davronxo'ja</SelectItem>
                        <SelectItem value="Sanjar">Sanjar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>{tm.image}</Label><Input type="file" accept="image/*" onChange={(e) => setNewImage(e.target.files?.[0] ?? null)} /></div>
                  <Button className="w-full" onClick={doIntake} disabled={busy}>{tm.save}</Button>
                </div>
              </DialogContent>

            </Dialog>
          )}
          {canConsume && (
            <Dialog open={outOpen} onOpenChange={setOutOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary"><Scissors className="h-4 w-4 mr-1" /> {tm.consume}</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{tm.consumeTitle}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>{tm.metalType}</Label>
                    <SearchableSelect
                      options={outTypes.map((v) => ({ value: v, label: v }))}
                      value={outType}
                      onChange={(v) => { setOutType(v); setOutThick(""); setOutSize(""); }}
                      placeholder={tm.metalTypePh}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{tm.thickness}</Label>
                      <SearchableSelect
                        options={outThicks.map((v) => ({ value: v, label: `${v} mm` }))}
                        value={outThick}
                        onChange={(v) => { setOutThick(v); setOutSize(""); }}
                        placeholder={tm.thicknessPh}
                      />
                    </div>
                    <div>
                      <Label>{tm.sizeWl}</Label>
                      <SearchableSelect
                        options={outSizes.map((v) => ({ value: v, label: `${v} mm` }))}
                        value={outSize}
                        onChange={setOutSize}
                        placeholder={tm.sizePh}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>{tm.piecesUsed}</Label>
                    <NumberInput step="0.01" value={outQty} onChange={(e) => setOutQty(e.target.value)} />
                  </div>
                  <div>
                    <Label>{tm.forOrder} *</Label>
                    <SearchableSelect options={orderOptions} value={outOrder} onChange={setOutOrder} placeholder={tm.selectOrder} />
                  </div>
                  <div><Label>{tm.comment}</Label><Input value={outComment} onChange={(e) => setOutComment(e.target.value)} /></div>
                  {outRow && (
                    <div className="rounded-md border p-2 text-sm space-y-1">
                      <div>{tm.rest}: <b>{outRow.pieces} {tm.pieces}</b> · <b>{fmtKg(outRow.kg)}</b> = <b>{fmtT(outRow.kg)}</b></div>
                      <div>{tm.onePiece} = <b>{fmtKg(outRow.kgPerPiece)}</b></div>
                      {Number(outQty) > 0 && (
                        <div>{tm.spend}: <b>{fmtKg(outKg)}</b> = <b>{fmtT(outKg)}</b> · {tm.willRemain}: <b>{fmtKg(outRow.kg - outKg)}</b> ({fmtT(outRow.kg - outKg)})</div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button onClick={doConsume} disabled={busy}>{tm.saveConsume}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{tm.statRestT}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmtT(totalKg)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{tm.statRestKg}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmtKg(totalKg)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{tm.statIn}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-status-green">{fmtT(totalInKg)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{tm.statOut}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-status-red">{fmtT(totalOutKg)}</CardContent></Card>
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">{tm.tabStock}</TabsTrigger>
          <TabsTrigger value="in">{tm.tabIn}</TabsTrigger>
          <TabsTrigger value="out">{tm.tabOut}</TabsTrigger>
          <TabsTrigger value="all">{tm.tabAll}</TabsTrigger>
          <TabsTrigger value="norms">{tm.tabNorms}</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>№</TableHead><TableHead>{tm.colMetal}</TableHead><TableHead>{tm.colSize}</TableHead>
                <TableHead>{tm.colS}</TableHead><TableHead className="text-right">{tm.colOnePieceKg}</TableHead>
                <TableHead className="text-right">{tm.colPieces}</TableHead>
                <TableHead className="text-right">{tm.colInKg}</TableHead><TableHead className="text-right">{tm.colOutKg}</TableHead>
                <TableHead className="text-right">{tm.colRestKg}</TableHead><TableHead className="text-right">{tm.colTon}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.s.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.s.metal_type}</TableCell>
                    <TableCell>{sizeLabel(r.s)}</TableCell>
                    <TableCell>{n(r.s.thickness_mm)}</TableCell>
                    <TableCell className="text-right font-mono">{n(r.kgPerPiece)}</TableCell>
                    <TableCell className="text-right font-mono">{r.pieces.toLocaleString("ru-RU", { maximumFractionDigits: 3 })}</TableCell>
                    <TableCell className="text-right font-mono text-status-green">{fmtKg(r.inKg)}</TableCell>
                    <TableCell className="text-right font-mono text-status-red">{fmtKg(r.outKg)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtKg(r.kg)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtT(r.kg)}</TableCell>
                  </TableRow>
                ))}
                {!rows.length && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">{loading ? tm.loading : tm.noStock}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="in">{movesTable(moves.filter((m) => m.direction === "in"), "in")}</TabsContent>
        <TabsContent value="out">{movesTable(moves.filter((m) => m.direction === "out"), "out")}</TabsContent>
        <TabsContent value="all">{movesTable(moves, "all")}</TabsContent>

        <TabsContent value="norms">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2"><Layers3 className="h-4 w-4" /> {tm.normsTitle}</CardTitle>
              {canNorm && (
                <Dialog open={normOpen} onOpenChange={setNormOpen}>
                  <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> {tm.norm}</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{tm.newNorm}</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>{tm.metalType}</Label><Input value={nmType} onChange={(e) => setNmType(e.target.value)} placeholder="Nerj" /></div>
                      <div><Label>{tm.thickness}</Label><NumberInput step="0.1" value={nmThick} onChange={(e) => setNmThick(e.target.value)} placeholder="4.5" /></div>
                      <div><Label>{tm.length}</Label><NumberInput value={nmLen} onChange={(e) => setNmLen(e.target.value)} placeholder="6000" /></div>
                      <div><Label>{tm.width}</Label><NumberInput value={nmWid} onChange={(e) => setNmWid(e.target.value)} placeholder="1500" /></div>
                      <div className="col-span-2"><Label>{tm.oneWeight}</Label><NumberInput step="0.01" value={nmWeight} onChange={(e) => setNmWeight(e.target.value)} /></div>
                    </div>
                    <DialogFooter><Button onClick={saveNorm} disabled={busy}>{tm.save}</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>№</TableHead><TableHead>{tm.colMetal}</TableHead><TableHead>{tm.colSize}</TableHead>
                  <TableHead>{tm.colS}</TableHead><TableHead className="text-right">{tm.colOnePieceKg}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {norms.map((x, i) => (
                    <TableRow key={x.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{x.metal_type}</TableCell>
                      <TableCell>{sizeLabel(x)}</TableCell>
                      <TableCell>{n(x.thickness_mm)}</TableCell>
                      <TableCell className="text-right font-mono">{n(x.weight_kg)}</TableCell>
                    </TableRow>
                  ))}
                  {!norms.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{tm.noNorms}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
