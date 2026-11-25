import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SearchableSelect from "@/components/SearchableSelect";
import { ChassisHeader, useBodyTypes, useChassisCan, useClients, type BodyType } from "@/components/chassis/ChassisUI";
import { useChassisText } from "@/i18n/chassis";
import { cdb, cleanDbError, fmtSum } from "@/lib/chassis";
import { fmtDate } from "@/lib/format";

export default function ChassisSpecsPage() {
  const tr = useChassisText();
  const can = useChassisCan();
  const edit = can("specs");
  const bodyTypes = useBodyTypes();
  const [newSpec, setNewSpec] = useState(false);
  const [bt, setBt] = useState<BodyType | null>(null);
  const specs = useQuery({
    queryKey: ["chassis", "specs"],
    queryFn: async () => {
      const { data, error } = await cdb.from("chassis_spec_balance").select("*").order("spec_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-4">
      <ChassisHeader title="Spetsifikatsiyalar" hint="Shartnoma bo'yicha ustqurma soni va narxi. O'zgartirishni admin va bosh buxgalter qiladi."
        actions={edit && <Button onClick={() => setNewSpec(true)}><Plus className="h-4 w-4 mr-1" />{tr("Yangi spetsifikatsiya")}</Button>} />
      <Card>
        <CardContent className="pt-5">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{tr("Buyurtmachi")}</TableHead><TableHead>{tr("Shartnoma")}</TableHead><TableHead>{tr("Spetsifikatsiya")}</TableHead><TableHead>{tr("Sana")}</TableHead>
                <TableHead>{tr("Ustqurma")}</TableHead><TableHead className="text-right">{tr("Soni")}</TableHead><TableHead className="text-right">{tr("Narx, QQS bilan")}</TableHead>
                <TableHead className="text-right">{tr("Aktlarda")}</TableHead><TableHead className="text-right">{tr("Qoldiq")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(specs.data ?? []).map((s: any) => <TableRow key={s.spec_line_id}>
                  <TableCell>{s.client_name}</TableCell><TableCell>№ {s.contract_no}</TableCell><TableCell>№ {s.spec_no}</TableCell><TableCell>{fmtDate(s.spec_date)}</TableCell>
                  <TableCell>{s.body_type_name}</TableCell><TableCell className="text-right">{s.qty ?? tr("cheklanmagan")}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtSum(s.price_gross)}</TableCell><TableCell className="text-right">{s.in_acts}</TableCell><TableCell className="text-right font-semibold">{s.remaining ?? "—"}</TableCell>
                </TableRow>)}
                {specs.data?.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">{tr("Spetsifikatsiya hali kiritilmagan")}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{tr("Ustqurma turlari")}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead>{tr("Nomi")}</TableHead><TableHead>{tr("Akt va ESF uchun nomi")}</TableHead><TableHead>MXIK</TableHead><TableHead>{tr("Zakaz prefiksi")}</TableHead><TableHead>{tr("Sinov")}</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{(bodyTypes.data ?? []).map((b) => <TableRow key={b.id}>
                <TableCell>{b.short_name}</TableCell><TableCell className="max-w-sm">{b.name}</TableCell>
                <TableCell className="font-mono text-xs">{b.mxik_code ?? <span className="text-status-red font-sans">{tr("kiritilmagan")}</span>}</TableCell>
                <TableCell>{b.order_prefix ?? "—"}</TableCell><TableCell>{b.requires_test ? "✓" : "—"}</TableCell>
                <TableCell>{edit && <Button size="sm" variant="outline" onClick={() => setBt(b)}>{tr("Tahrirlash")}</Button>}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {newSpec && <SpecDialog onClose={() => setNewSpec(false)} />}
      {bt && <BodyTypeDialog bt={bt} onClose={() => setBt(null)} />}
    </div>
  );
}

function SpecDialog({ onClose }: { onClose: () => void }) {
  const tr = useChassisText();
  const qc = useQueryClient();
  const clients = useClients();
  const bodyTypes = useBodyTypes();
  const [client, setClient] = useState(""); const [contract, setContract] = useState(""); const [specNo, setSpecNo] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState([{ body: "", qty: "", price: "" }]);
  const [busy, setBusy] = useState(false);
  const ok = client && contract.trim() && specNo.trim() && lines.every((l) => l.body && Number(l.price) > 0);
  const save = async () => {
    setBusy(true);
    try {
      const { data: s, error } = await cdb.from("chassis_specs").insert({ client_id: client, contract_no: contract.trim(), spec_no: specNo.trim(), spec_date: date }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await cdb.from("chassis_spec_lines").insert(lines.map((l) => ({ spec_id: s.id, body_type_id: l.body, qty: l.qty ? Number(l.qty) : null, price_gross: Number(l.price) })));
      if (e2) throw e2;
      toast.success(tr("Saqlandi")); qc.invalidateQueries({ queryKey: ["chassis"] }); onClose();
    } catch (e: any) { toast.error(cleanDbError(e.message)); } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-w-2xl">
    <DialogHeader><DialogTitle>{tr("Yangi spetsifikatsiya")}</DialogTitle></DialogHeader>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2"><Label>{tr("Buyurtmachi")}</Label><SearchableSelect value={client} onChange={setClient} options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} /></div>
      <div className="space-y-1.5"><Label htmlFor="spec-contract">{tr("Shartnoma №")}</Label><Input id="spec-contract" value={contract} onChange={(e) => setContract(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="spec-no">{tr("Spetsifikatsiya №")}</Label><Input id="spec-no" value={specNo} onChange={(e) => setSpecNo(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="spec-date">{tr("Sana")}</Label><Input id="spec-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
    </div>
    <div className="space-y-2">
      {lines.map((l, i) => <div key={i} className="grid gap-2 sm:grid-cols-[1fr_120px_180px]">
        <SearchableSelect value={l.body} onChange={(v) => setLines((s) => s.map((x, j) => j === i ? { ...x, body: v } : x))} placeholder={tr("Ustqurma")} options={(bodyTypes.data ?? []).map((b) => ({ value: b.id, label: b.short_name }))} />
        <Input id={`spec-qty-${i}`} inputMode="numeric" placeholder={tr("Soni (ixtiyoriy)")} value={l.qty} onChange={(e) => setLines((s) => s.map((x, j) => j === i ? { ...x, qty: e.target.value.replace(/\D/g, "") } : x))} />
        <Input id={`spec-price-${i}`} inputMode="decimal" placeholder={tr("Narx, QQS bilan")} value={l.price} onChange={(e) => setLines((s) => s.map((x, j) => j === i ? { ...x, price: e.target.value.replace(/[^\d.]/g, "") } : x))} />
      </div>)}
      <Button variant="outline" size="sm" onClick={() => setLines((s) => [...s, { body: "", qty: "", price: "" }])}><Plus className="h-4 w-4 mr-1" />{tr("Qator")}</Button>
      <p className="text-xs text-muted-foreground">{tr("Soni bo'sh bo'lsa — cheklanmagan.")}</p>
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose}>{tr("Bekor")}</Button><Button disabled={!ok || busy} onClick={save}>{tr("Saqlash")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function BodyTypeDialog({ bt, onClose }: { bt: BodyType; onClose: () => void }) {
  const tr = useChassisText();
  const qc = useQueryClient();
  const [name, setName] = useState(bt.name); const [mxik, setMxik] = useState(bt.mxik_code ?? ""); const [prefix, setPrefix] = useState(bt.order_prefix ?? "");
  const [test, setTest] = useState(bt.requires_test); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const { error } = await cdb.from("body_types").update({ name: name.trim(), mxik_code: mxik.trim() || null, order_prefix: prefix.trim().toUpperCase() || null, requires_test: test }).eq("id", bt.id);
      if (error) throw error;
      toast.success(tr("Saqlandi")); qc.invalidateQueries({ queryKey: ["chassis"] }); onClose();
    } catch (e: any) { toast.error(cleanDbError(e.message)); } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
    <DialogHeader><DialogTitle>{bt.short_name}</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div className="space-y-1.5"><Label htmlFor="bt-name">{tr("Akt va ESF uchun nomi")}</Label><Input id="bt-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="bt-mxik">{tr("MXIK kodi (ixtiyoriy)")}</Label><Input id="bt-mxik" className="font-mono" value={mxik} onChange={(e) => setMxik(e.target.value.replace(/\D/g, ""))} /></div>
      <div className="space-y-1.5"><Label htmlFor="bt-prefix">{tr("Zakaz prefiksi (ixtiyoriy)")}</Label><Input id="bt-prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="SEL" /></div>
      <label className="flex items-center gap-2 text-sm"><Checkbox id="bt-test" checked={test} onCheckedChange={(v) => setTest(v === true)} />{tr("Sinov majburiy")}</label>
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose}>{tr("Bekor")}</Button><Button disabled={!name.trim() || busy} onClick={save}>{tr("Saqlash")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
