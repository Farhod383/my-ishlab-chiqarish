import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
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
import { Plus, Layers3, Scissors, PackagePlus } from "lucide-react";

interface Norm {
  id: string; metal_type: string; length_mm: number; width_mm: number;
  thickness_mm: number; weight_kg: number;
}
interface ProductRow {
  id: string; name: string; unit: string; stock_qty: number; weight_kg: number | null;
  metal_type: string | null; thickness_mm: number | null; width_mm: number | null; length_mm: number | null;
}
interface MoveRow {
  id: string; created_at: string; direction: "in" | "out"; product_id: string | null;
  quantity: number; weight_kg: number | null; order_id: string | null;
  comment: string | null; reason: string | null; recipient_name: string | null;
}
interface OrderLite { id: string; order_number: string; product_name: string }

const n = (v: any) => Number(v ?? 0);
const fmtKg = (v: number) => `${n(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} kg`;
const fmtT = (v: number) => `${(n(v) / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 4 })} t`;
const sizeLabel = (m: { length_mm?: number | null; width_mm?: number | null }) =>
  m.width_mm && m.length_mm ? `${n(m.width_mm)}×${n(m.length_mm)} mm` : "—";
const norm3 = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const METAL_KEYWORDS = [
  "metall", "metal", "метал", "nerj", "нерж", "nerjaveyka", "list", "лист", "po'lat", "polat",
  "temir", "alyumin", "алюмин", "chyorniy", "profil", "профил", "профеил", "truba", "turba",
  "труба", "shveller", "швеллер", "ugolok", "уголок", "armatura", "армат", "polosa", "полоса",
];

/** kg qoldig'i: tonna → ×1000, kg → o'zi, boshqasi → dona × 1 dona kg */
function stockKg(p: ProductRow, kgPerPiece: number): number {
  const u = String(p.unit ?? "").toLowerCase();
  if (u === "tonna") return n(p.stock_qty) * 1000;
  if (u === "kg") return n(p.stock_qty);
  return kgPerPiece > 0 ? n(p.stock_qty) * kgPerPiece : 0;
}

/** Mahsulot nomidan qalinlik / o'lchamni ajratib olish (1,8 мм 1250х2500) */
function parseDims(name: string) {
  const s = name.replace(",", ".");
  const th = s.match(/(\d+(?:\.\d+)?)\s*(?:mm|мм)/i);
  const wl = s.match(/(\d{3,4})\s*[xх×]\s*(\d{3,4})/i);
  return {
    thickness: th ? Number(th[1]) : null,
    width: wl ? Number(wl[1]) : null,
    length: wl ? Number(wl[2]) : null,
  };
}

export default function MetalPage() {
  const { user, hasRole } = useAuth();
  const canConsume = hasRole(["admin", "engineer"]);
  const canNorm = hasRole(["admin", "engineer"]);
  const canIntake = hasRole(["admin", "engineer", "warehouse"]);

  const [norms, setNorms] = useState<Norm[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [nr, pr, or_] = await Promise.all([
      supabase.from("metal_norms").select("*").order("metal_type").order("length_mm").order("thickness_mm"),
      supabase.from("products").select("id,name,unit,stock_qty,weight_kg,metal_type,thickness_mm,width_mm,length_mm").order("name"),
      supabase.from("orders").select("id,order_number,product_name").neq("status", "cancelled").order("created_at", { ascending: false }).limit(300),
    ]);
    const allProducts = ((pr.data as any) ?? []) as ProductRow[];
    const metalProducts = allProducts.filter((p) => {
      if (p.metal_type) return true;
      const nm = norm3(p.name ?? "");
      return METAL_KEYWORDS.some((k) => nm.includes(k));
    });
    setNorms((nr.data as any) ?? []);
    setProducts(metalProducts);
    setOrders((or_.data as any) ?? []);

    const ids = metalProducts.map((p) => p.id);
    if (ids.length) {
      const { data: mv } = await supabase
        .from("stock_movements")
        .select("id,created_at,direction,product_id,quantity,weight_kg,order_id,comment,reason,recipient_name")
        .in("product_id", ids)
        .order("created_at", { ascending: false })
        .limit(400);
      setMoves(((mv as any) ?? []) as MoveRow[]);
    } else {
      setMoves([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const productById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const orderById = useMemo(() => Object.fromEntries(orders.map((o) => [o.id, o])), [orders]);

  /** Har bir metall mahsulot uchun normativ (1 dona kg) ni topish */
  const rows = useMemo(() => {
    return products.map((p) => {
      const parsed = parseDims(p.name ?? "");
      const thickness = p.thickness_mm ?? parsed.thickness;
      const width = p.width_mm ?? parsed.width;
      const length = p.length_mm ?? parsed.length;
      const matched = norms.find((x) =>
        (p.metal_type ? norm3(x.metal_type) === norm3(p.metal_type) : true) &&
        thickness != null && Number(x.thickness_mm) === Number(thickness) &&
        width != null && Number(x.width_mm) === Number(width) &&
        length != null && Number(x.length_mm) === Number(length),
      );
      const kgPerPiece = n(p.weight_kg) || (matched ? n(matched.weight_kg) : 0);
      const kg = stockKg(p, kgPerPiece);
      return {
        product: p,
        metalType: p.metal_type ?? p.name,
        thickness, width, length,
        kgPerPiece,
        normId: matched?.id ?? null,
        pieces: kgPerPiece > 0 ? kg / kgPerPiece : null,
        kg,
      };
    });
  }, [products, norms]);

  const totalKg = useMemo(() => rows.reduce((s, r) => s + r.kg, 0), [rows]);
  const actorName = user?.email ?? null;
  const [busy, setBusy] = useState(false);

  /* ---------------- Kirim (metall/profil) ---------------- */
  const [inOpen, setInOpen] = useState(false);
  const [inType, setInType] = useState("");
  const [inThick, setInThick] = useState("");
  const [inWidth, setInWidth] = useState("");
  const [inLength, setInLength] = useState("");
  const [inKgPiece, setInKgPiece] = useState("");
  const [inQty, setInQty] = useState("");
  const [inPrice, setInPrice] = useState("");
  const [inLocation, setInLocation] = useState("Sklad");
  const [inComment, setInComment] = useState("");

  // Norma bo'yicha 1 dona kg ni avtomatik to'ldirish
  useEffect(() => {
    const t = norm3(inType), th = Number(inThick), w = Number(inWidth), l = Number(inLength);
    if (!t || !th || !w || !l) return;
    const m = norms.find((x) => norm3(x.metal_type) === t && n(x.thickness_mm) === th && n(x.width_mm) === w && n(x.length_mm) === l);
    if (m) setInKgPiece(String(n(m.weight_kg)));
  }, [inType, inThick, inWidth, inLength, norms]);

  const inTotalKg = Number(inKgPiece || 0) * Number(inQty || 0);

  const doIntake = async () => {
    if (!inType.trim()) return toast.error("Metall turini kiriting");
    if (!Number(inQty)) return toast.error("Dona sonini kiriting");
    if (!Number(inKgPiece)) return toast.error("1 dona og'irligini (kg) kiriting");
    setBusy(true);
    const { error } = await supabase.rpc("metal_intake_product" as any, {
      _metal_type: inType.trim(),
      _thickness: inThick ? Number(inThick) : null,
      _width: inWidth ? Number(inWidth) : null,
      _length: inLength ? Number(inLength) : null,
      _kg_per_piece: Number(inKgPiece),
      _pieces: Number(inQty),
      _unit_price: inPrice ? Number(inPrice) : 0,
      _currency: "UZS",
      _location: inLocation || "Sklad",
      _comment: inComment || null,
      _actor_name: actorName,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Kirim qilindi: ${fmtKg(inTotalKg)} (${fmtT(inTotalKg)})`);
    setInOpen(false);
    setInQty(""); setInPrice(""); setInComment("");
    load();
  };

  /* ---------------- Sarf (Konstruktor) ---------------- */
  const [outOpen, setOutOpen] = useState(false);
  const [outProduct, setOutProduct] = useState("");
  const [outNorm, setOutNorm] = useState("");
  const [outOrder, setOutOrder] = useState("");
  const [outQty, setOutQty] = useState("");
  const [outComment, setOutComment] = useState("");

  const outRow = rows.find((r) => r.product.id === outProduct);
  const pickedNorm = norms.find((x) => x.id === outNorm);
  const kgPerPiece = n(outRow?.kgPerPiece) || n(pickedNorm?.weight_kg);
  const outKg = kgPerPiece * Number(outQty || 0);

  useEffect(() => {
    if (outRow?.normId) setOutNorm(outRow.normId);
  }, [outProduct]); // eslint-disable-line react-hooks/exhaustive-deps

  const doConsume = async () => {
    if (!outProduct) return toast.error("Metall pozitsiyasini tanlang");
    if (!outOrder) return toast.error("Zakazni tanlang");
    if (!kgPerPiece) return toast.error("1 dona uchun kg normativini tanlang");
    const q = Number(outQty);
    if (!q || q <= 0) return toast.error("Dona sonini kiriting");
    if (outRow && outKg > outRow.kg + 0.001) return toast.error(`Qoldiq yetarli emas: ${fmtKg(outRow.kg)}`);
    setBusy(true);
    const { error } = await supabase.rpc("metal_consume_product" as any, {
      _product_id: outProduct, _pieces: q, _kg_per_piece: kgPerPiece,
      _order_id: outOrder, _comment: outComment || null, _actor_name: actorName,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Sarflandi: ${fmtKg(outKg)} (${fmtT(outKg)})`);
    setOutOpen(false); setOutProduct(""); setOutQty(""); setOutComment(""); setOutNorm("");
    load();
  };

  /* ---------------- Norma qo'shish ---------------- */
  const [normOpen, setNormOpen] = useState(false);
  const [nmType, setNmType] = useState("");
  const [nmLen, setNmLen] = useState("");
  const [nmWid, setNmWid] = useState("");
  const [nmThick, setNmThick] = useState("");
  const [nmWeight, setNmWeight] = useState("");

  const saveNorm = async () => {
    if (!nmType.trim() || !nmLen || !nmWid || !nmThick || !Number(nmWeight))
      return toast.error("Barcha maydonlarni to'ldiring");
    setBusy(true);
    const { error } = await supabase.from("metal_norms").insert({
      metal_type: nmType.trim(), length_mm: Number(nmLen), width_mm: Number(nmWid),
      thickness_mm: Number(nmThick), weight_kg: Number(nmWeight), created_by: user?.id ?? null,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Norma saqlandi");
    setNormOpen(false); setNmType(""); setNmLen(""); setNmWid(""); setNmThick(""); setNmWeight("");
    load();
  };

  const productOptions = rows.map((r) => ({
    value: r.product.id,
    label: `${r.product.name} — ${fmtKg(r.kg)}${r.kgPerPiece ? ` (${r.pieces?.toFixed(2)} dona)` : ""}`,
  }));
  const normOptions = norms.map((x) => ({
    value: x.id,
    label: `${x.metal_type} — ${sizeLabel(x)} — S=${n(x.thickness_mm)} mm — ${n(x.weight_kg)} kg/dona`,
  }));
  const orderOptions = orders.map((o) => ({ value: o.id, label: `${o.order_number} — ${o.product_name}` }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Metall hisobi</h1>
          <p className="text-sm text-muted-foreground">Qoldiq to'g'ridan-to'g'ri Sklad ma'lumotidan olinadi. Metall kirimi Sklad → Kirim orqali qilinadi.</p>
        </div>
        <div className="flex gap-2">
          {canConsume && (
            <Dialog open={outOpen} onOpenChange={setOutOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary"><Scissors className="h-4 w-4 mr-1" /> Sarf (Konstruktor)</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Metall sarfi (donada)</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Zakaz</Label>
                    <SearchableSelect options={orderOptions} value={outOrder} onChange={setOutOrder} placeholder="Zakazni tanlang" />
                  </div>
                  <div>
                    <Label>Metall (sklad qoldig'idan)</Label>
                    <SearchableSelect options={productOptions} value={outProduct} onChange={setOutProduct} placeholder="Metall tanlang" />
                  </div>
                  <div>
                    <Label>Normativ (1 dona = kg)</Label>
                    <SearchableSelect options={normOptions} value={outNorm} onChange={setOutNorm} placeholder="Normativni tanlang" />
                  </div>
                  <div>
                    <Label>Nechta dona/list</Label>
                    <NumberInput step="0.01" value={outQty} onChange={(e) => setOutQty(e.target.value)} />
                  </div>
                  <div><Label>Izoh</Label><Input value={outComment} onChange={(e) => setOutComment(e.target.value)} /></div>
                  {outRow && (
                    <div className="rounded-md border p-2 text-sm space-y-1">
                      <div>Qoldiq: <b>{fmtKg(outRow.kg)}</b> = <b>{fmtT(outRow.kg)}</b></div>
                      {kgPerPiece > 0 && <div>1 dona = <b>{fmtKg(kgPerPiece)}</b></div>}
                      {Number(outQty) > 0 && kgPerPiece > 0 && (
                        <div>Sarf: <b>{fmtKg(outKg)}</b> = <b>{fmtT(outKg)}</b> · Qoladi: <b>{fmtKg(outRow.kg - outKg)}</b> ({fmtT(outRow.kg - outKg)})</div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button onClick={doConsume} disabled={busy}>Sarfni saqlash</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Umumiy qoldiq</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmtT(totalKg)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Kilogrammda</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmtKg(totalKg)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pozitsiyalar</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{rows.length}</CardContent></Card>
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Qoldiq</TabsTrigger>
          <TabsTrigger value="moves">Harakatlar</TabsTrigger>
          <TabsTrigger value="norms">Normalar</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>№</TableHead><TableHead>Metall</TableHead><TableHead>O'lcham</TableHead>
                <TableHead>S (mm)</TableHead><TableHead className="text-right">1 dona (kg)</TableHead>
                <TableHead className="text-right">Dona</TableHead><TableHead className="text-right">Jami kg</TableHead>
                <TableHead className="text-right">Tonna</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.product.id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.metalType}</TableCell>
                    <TableCell>{sizeLabel({ width_mm: r.width, length_mm: r.length })}</TableCell>
                    <TableCell>{r.thickness ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{r.kgPerPiece ? n(r.kgPerPiece) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{r.pieces != null ? r.pieces.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{fmtKg(r.kg)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtT(r.kg)}</TableCell>
                  </TableRow>
                ))}
                {!rows.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{loading ? "Yuklanmoqda..." : "Metall qoldig'i yo'q"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="moves">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Sana / vaqt</TableHead><TableHead>Turi</TableHead><TableHead>Metall</TableHead>
                <TableHead className="text-right">Miqdor</TableHead><TableHead className="text-right">kg</TableHead>
                <TableHead className="text-right">Tonna</TableHead><TableHead>Zakaz</TableHead><TableHead>Kim</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {moves.map((m) => {
                  const p = m.product_id ? productById[m.product_id] : null;
                  const o = m.order_id ? orderById[m.order_id] : null;
                  const kg = n(m.weight_kg);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">{fmtDateTime24(m.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={m.direction === "in"
                          ? "bg-status-green/15 text-status-green border-status-green/30"
                          : "bg-status-red/15 text-status-red border-status-red/30"}>
                          {m.direction === "in" ? "Kirim" : "Sarf"}
                        </Badge>
                      </TableCell>
                      <TableCell>{p?.name ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{n(m.quantity)} {p?.unit ?? ""}</TableCell>
                      <TableCell className="text-right font-mono">{kg ? fmtKg(kg) : "—"}</TableCell>
                      <TableCell className="text-right font-mono">{kg ? fmtT(kg) : "—"}</TableCell>
                      <TableCell>{o ? `${o.order_number} — ${o.product_name}` : "—"}</TableCell>
                      <TableCell className="truncate max-w-[180px]">{m.recipient_name ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
                {!moves.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{loading ? "Yuklanmoqda..." : "Harakatlar yo'q"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="norms">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2"><Layers3 className="h-4 w-4" /> Metall normalari (1 dona = kg)</CardTitle>
              {canNorm && (
                <Dialog open={normOpen} onOpenChange={setNormOpen}>
                  <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Norma</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Yangi norma</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Metall turi</Label><Input value={nmType} onChange={(e) => setNmType(e.target.value)} placeholder="Nerj" /></div>
                      <div><Label>Qalinlik S (mm)</Label><NumberInput step="0.1" value={nmThick} onChange={(e) => setNmThick(e.target.value)} placeholder="4.5" /></div>
                      <div><Label>Bo'yi (mm)</Label><NumberInput value={nmLen} onChange={(e) => setNmLen(e.target.value)} placeholder="6000" /></div>
                      <div><Label>Eni (mm)</Label><NumberInput value={nmWid} onChange={(e) => setNmWid(e.target.value)} placeholder="1500" /></div>
                      <div className="col-span-2"><Label>1 dona og'irligi (kg)</Label><NumberInput step="0.01" value={nmWeight} onChange={(e) => setNmWeight(e.target.value)} /></div>
                    </div>
                    <DialogFooter><Button onClick={saveNorm} disabled={busy}>Saqlash</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>№</TableHead><TableHead>Metall</TableHead><TableHead>O'lcham</TableHead>
                  <TableHead>S (mm)</TableHead><TableHead className="text-right">1 dona (kg)</TableHead>
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
                  {!norms.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Normalar yo'q</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
