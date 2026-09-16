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
import { Plus, Layers3, Scissors } from "lucide-react";

interface Norm {
  id: string; metal_type: string; length_mm: number; width_mm: number;
  thickness_mm: number; weight_kg: number;
}
interface Stock extends Norm { quantity: number }
interface Movement {
  id: string; stock_id: string; direction: "in" | "out"; quantity: number;
  weight_kg: number; order_id: string | null; comment: string | null;
  created_by_name: string | null; created_at: string;
}
interface OrderLite { id: string; order_number: string; product_name: string }

const n = (v: any) => Number(v ?? 0);
const fmtKg = (v: number) => `${n(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} kg`;
const fmtT = (v: number) => `${(n(v) / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 4 })} t`;
const sizeLabel = (m: { length_mm: number; width_mm: number }) => `${n(m.width_mm)}×${n(m.length_mm)} mm`;
const normLabel = (m: Norm) => `${m.metal_type} — ${sizeLabel(m)} — S=${n(m.thickness_mm)} mm (${n(m.weight_kg)} kg)`;

export default function MetalPage() {
  const { user, hasRole } = useAuth();
  const canIntake = hasRole(["admin", "warehouse"]);
  const canConsume = hasRole(["admin", "warehouse", "engineer"]);
  const canNorm = hasRole(["admin", "warehouse", "engineer"]);

  const [norms, setNorms] = useState<Norm[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [moves, setMoves] = useState<Movement[]>([]);
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [nr, st, mv, or_] = await Promise.all([
      supabase.from("metal_norms").select("*").order("metal_type").order("length_mm").order("thickness_mm"),
      supabase.from("metal_stock").select("*").order("metal_type").order("length_mm").order("thickness_mm"),
      supabase.from("metal_movements").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("orders").select("id,order_number,product_name").neq("status", "cancelled").order("created_at", { ascending: false }).limit(300),
    ]);
    setNorms((nr.data as any) ?? []);
    setStock((st.data as any) ?? []);
    setMoves((mv.data as any) ?? []);
    setOrders((or_.data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stockById = useMemo(() => Object.fromEntries(stock.map((s) => [s.id, s])), [stock]);
  const orderById = useMemo(() => Object.fromEntries(orders.map((o) => [o.id, o])), [orders]);
  const totalKg = useMemo(() => stock.reduce((s, r) => s + n(r.quantity) * n(r.weight_kg), 0), [stock]);
  const actorName = user?.email ?? null;

  /* ---------------- Kirim ---------------- */
  const [inOpen, setInOpen] = useState(false);
  const [inType, setInType] = useState("");
  const [inLen, setInLen] = useState("");
  const [inWid, setInWid] = useState("");
  const [inThick, setInThick] = useState("");
  const [inWeight, setInWeight] = useState("");
  const [inQty, setInQty] = useState("");
  const [inComment, setInComment] = useState("");
  const [busy, setBusy] = useState(false);

  // Norma bazasidan 1 list kg avtomatik olinadi
  useEffect(() => {
    if (!inType || !inLen || !inWid || !inThick) return;
    const hit = norms.find(
      (x) => x.metal_type.toLowerCase() === inType.trim().toLowerCase() &&
        n(x.length_mm) === Number(inLen) && n(x.width_mm) === Number(inWid) &&
        n(x.thickness_mm) === Number(inThick),
    );
    if (hit) setInWeight(String(n(hit.weight_kg)));
  }, [inType, inLen, inWid, inThick, norms]);

  const applyNormPreset = (id: string) => {
    const nm = norms.find((x) => x.id === id);
    if (!nm) return;
    setInType(nm.metal_type);
    setInLen(String(n(nm.length_mm)));
    setInWid(String(n(nm.width_mm)));
    setInThick(String(n(nm.thickness_mm)));
    setInWeight(String(n(nm.weight_kg)));
  };

  const resetIn = () => {
    setInType(""); setInLen(""); setInWid(""); setInThick(""); setInWeight(""); setInQty(""); setInComment("");
  };

  const doIntake = async () => {
    if (!inType.trim() || !inLen || !inWid || !inThick) return toast.error("Metall turi va o'lchamlarni kiriting");
    if (!Number(inWeight)) return toast.error("1 list og'irligi (kg) kiritilmagan");
    if (!Number(inQty)) return toast.error("Miqdorni kiriting");
    setBusy(true);
    const { error } = await supabase.rpc("metal_intake" as any, {
      _metal_type: inType.trim(), _length: Number(inLen), _width: Number(inWid),
      _thickness: Number(inThick), _weight_kg: Number(inWeight), _quantity: Number(inQty),
      _comment: inComment || null, _actor_name: actorName,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Kirim qilindi: ${fmtKg(Number(inWeight) * Number(inQty))}`);
    setInOpen(false); resetIn(); load();
  };

  /* ---------------- Sarf (Konstruktor) ---------------- */
  const [outOpen, setOutOpen] = useState(false);
  const [outStock, setOutStock] = useState("");
  const [outOrder, setOutOrder] = useState("");
  const [outQty, setOutQty] = useState("");
  const [outComment, setOutComment] = useState("");

  const outRow = stockById[outStock];
  const outKg = outRow ? n(outRow.weight_kg) * Number(outQty || 0) : 0;

  const doConsume = async () => {
    if (!outStock) return toast.error("Metall pozitsiyasini tanlang");
    if (!outOrder) return toast.error("Zakazni tanlang");
    const q = Number(outQty);
    if (!q || q <= 0) return toast.error("Dona sonini kiriting");
    if (outRow && q > n(outRow.quantity)) return toast.error(`Qoldiq yetarli emas: ${n(outRow.quantity)} dona`);
    setBusy(true);
    const { error } = await supabase.rpc("metal_consume" as any, {
      _stock_id: outStock, _quantity: q, _order_id: outOrder,
      _comment: outComment || null, _actor_name: actorName,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Sarflandi: ${fmtKg(outKg)} (${fmtT(outKg)})`);
    setOutOpen(false); setOutStock(""); setOutQty(""); setOutComment("");
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

  const stockOptions = stock.map((s) => ({
    value: s.id,
    label: `${s.metal_type} — ${sizeLabel(s)} — S=${n(s.thickness_mm)} — ${n(s.quantity)} dona`,
  }));
  const orderOptions = orders.map((o) => ({ value: o.id, label: `${o.order_number} — ${o.product_name}` }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Metall hisobi</h1>
          <p className="text-sm text-muted-foreground">Metall turi, o'lchami va qalinligi bo'yicha alohida qoldiq</p>
        </div>
        <div className="flex gap-2">
          {canIntake && (
            <Dialog open={inOpen} onOpenChange={(o) => { setInOpen(o); if (!o) resetIn(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-1" /> Metall kirimi</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Metall kirimi</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Normadan tanlash</Label>
                    <SearchableSelect
                      options={norms.map((x) => ({ value: x.id, label: normLabel(x) }))}
                      value=""
                      onChange={applyNormPreset}
                      placeholder="Norma tanlang (ixtiyoriy)"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Metall turi</Label><Input value={inType} onChange={(e) => setInType(e.target.value)} placeholder="Nerj" /></div>
                    <div><Label>Qalinlik S (mm)</Label><NumberInput step="0.1" value={inThick} onChange={(e) => setInThick(e.target.value)} placeholder="4.2" /></div>
                    <div><Label>Bo'yi (mm)</Label><NumberInput value={inLen} onChange={(e) => setInLen(e.target.value)} placeholder="6000" /></div>
                    <div><Label>Eni (mm)</Label><NumberInput value={inWid} onChange={(e) => setInWid(e.target.value)} placeholder="1500" /></div>
                    <div><Label>1 list og'irligi (kg)</Label><NumberInput step="0.01" value={inWeight} onChange={(e) => setInWeight(e.target.value)} /></div>
                    <div><Label>Miqdori (dona)</Label><NumberInput step="0.01" value={inQty} onChange={(e) => setInQty(e.target.value)} /></div>
                  </div>
                  <div><Label>Izoh</Label><Input value={inComment} onChange={(e) => setInComment(e.target.value)} /></div>
                  {Number(inWeight) > 0 && Number(inQty) > 0 && (
                    <div className="rounded-md border p-2 text-sm">
                      Jami: <b>{fmtKg(Number(inWeight) * Number(inQty))}</b> = <b>{fmtT(Number(inWeight) * Number(inQty))}</b>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button onClick={doIntake} disabled={busy}>Saqlash</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {canConsume && (
            <Dialog open={outOpen} onOpenChange={setOutOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary"><Scissors className="h-4 w-4 mr-1" /> Sarf (Konstruktor)</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Metall sarfi</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Zakaz</Label>
                    <SearchableSelect options={orderOptions} value={outOrder} onChange={setOutOrder} placeholder="Zakazni tanlang" />
                  </div>
                  <div>
                    <Label>Metall (sklad qoldig'idan)</Label>
                    <SearchableSelect options={stockOptions} value={outStock} onChange={setOutStock} placeholder="Metall tanlang" />
                  </div>
                  <div>
                    <Label>Nechta dona/list</Label>
                    <NumberInput step="0.01" value={outQty} onChange={(e) => setOutQty(e.target.value)} />
                  </div>
                  <div><Label>Izoh</Label><Input value={outComment} onChange={(e) => setOutComment(e.target.value)} /></div>
                  {outRow && (
                    <div className="rounded-md border p-2 text-sm space-y-1">
                      <div>1 dona = <b>{fmtKg(outRow.weight_kg)}</b> · Qoldiq: <b>{n(outRow.quantity)} dona</b></div>
                      {Number(outQty) > 0 && <div>Sarf: <b>{fmtKg(outKg)}</b> = <b>{fmtT(outKg)}</b></div>}
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
          <CardContent className="text-2xl font-bold">{stock.length}</CardContent></Card>
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
                {stock.map((s, i) => {
                  const kg = n(s.quantity) * n(s.weight_kg);
                  return (
                    <TableRow key={s.id}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{s.metal_type}</TableCell>
                      <TableCell>{sizeLabel(s)}</TableCell>
                      <TableCell>{n(s.thickness_mm)}</TableCell>
                      <TableCell className="text-right font-mono">{n(s.weight_kg)}</TableCell>
                      <TableCell className="text-right font-mono">{n(s.quantity)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtKg(kg)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtT(kg)}</TableCell>
                    </TableRow>
                  );
                })}
                {!stock.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{loading ? "Yuklanmoqda..." : "Metall qoldig'i yo'q"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="moves">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Sana / vaqt</TableHead><TableHead>Turi</TableHead><TableHead>Metall</TableHead>
                <TableHead className="text-right">Dona</TableHead><TableHead className="text-right">kg</TableHead>
                <TableHead className="text-right">Tonna</TableHead><TableHead>Zakaz</TableHead><TableHead>Kim</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {moves.map((m) => {
                  const s = stockById[m.stock_id];
                  const o = m.order_id ? orderById[m.order_id] : null;
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
                      <TableCell>{s ? `${s.metal_type} ${sizeLabel(s)} S=${n(s.thickness_mm)}` : "—"}</TableCell>
                      <TableCell className="text-right font-mono">{n(m.quantity)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtKg(m.weight_kg)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtT(m.weight_kg)}</TableCell>
                      <TableCell>{o ? `${o.order_number} — ${o.product_name}` : "—"}</TableCell>
                      <TableCell className="truncate max-w-[180px]">{m.created_by_name ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
                {!moves.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Harakatlar yo'q</TableCell></TableRow>}
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
