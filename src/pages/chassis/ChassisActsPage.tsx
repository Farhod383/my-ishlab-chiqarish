import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SearchableSelect from "@/components/SearchableSelect";
import { ActBadge, ChassisHeader, Vin, useChassisCan } from "@/components/chassis/ChassisUI";
import { useChassisOverview, type OverviewRow } from "./ChassisRegistryPage";
import { useChassisText } from "@/i18n/chassis";
import { cdb, chassisRpc, fmtSum, type ActStatus } from "@/lib/chassis";
import { fmtDate, fmtDateTime24 } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Act {
  id: string; act_no: string; act_date: string; client_id: string; body_type_id: string; price_gross: number; qty: number; total_gross: number; total_vat: number; total_net: number;
  status: ActStatus; shipped_at: string | null; recipient_name: string | null; recipient_proxy: string | null; replaces_act_id: string | null; void_reason: string | null;
  esf_number: string | null; esf_date: string | null; esf_amount: number | null; onec_ref: string | null; created_at: string;
  client: { name: string } | null; body_type: { short_name: string } | null;
}
interface EsfLine { name: string; mxik: string | null; unit: string; qty: number; price_net: number; cost_net: number; vat_rate: number; vat: number; total: number; origin: string }

export function useActs() {
  return useQuery({
    queryKey: ["chassis", "acts"],
    queryFn: async (): Promise<Act[]> => {
      const { data, error } = await cdb.from("chassis_acts").select("*, client:clients(name), body_type:body_types(short_name)").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function ChassisActsPage() {
  const tr = useChassisText();
  const [params, setParams] = useSearchParams();
  const acts = useActs();
  const openId = params.get("act");
  const open = (acts.data ?? []).find((a) => a.id === openId) ?? null;
  const setOpen = (id: string | null) => { const p = new URLSearchParams(params); if (id) p.set("act", id); else p.delete("act"); setParams(p, { replace: true }); };
  return (
    <div className="space-y-4">
      <ChassisHeader title="Aktlar" hint="Akt tuzish: tur → tayyor shassilar → QQS bilan jami. Summalarni baza hisoblaydi." />
      <ActBuilder onCreated={setOpen} />
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{tr("Aktlar ro'yxati")}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{tr("Akt")}</TableHead><TableHead>{tr("Sana")}</TableHead><TableHead>{tr("Buyurtmachi")}</TableHead><TableHead>{tr("Ustqurma")}</TableHead>
                <TableHead className="text-right">{tr("Soni")}</TableHead><TableHead className="text-right">{tr("Summa")}</TableHead><TableHead>{tr("Holat")}</TableHead><TableHead>ESF</TableHead><TableHead>1C</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(acts.data ?? []).map((a) => <TableRow key={a.id} className={cn("cursor-pointer", a.id === openId && "bg-primary/5")} onClick={() => setOpen(a.id)}>
                  <TableCell className="font-medium whitespace-nowrap">{a.act_no}</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(a.act_date)}</TableCell>
                  <TableCell>{a.client?.name}</TableCell>
                  <TableCell>{a.body_type?.short_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.qty}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtSum(a.total_gross)}</TableCell>
                  <TableCell><ActBadge status={a.status} /></TableCell>
                  <TableCell className="whitespace-nowrap">{a.esf_number ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{a.onec_ref ? tr("1C da") : "—"}</TableCell>
                </TableRow>)}
                {acts.data?.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">{tr("Hali akt yo'q")}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <ActSheet act={open} onClose={() => setOpen(null)} onOpen={setOpen} />
    </div>
  );
}

function ActBuilder({ onCreated }: { onCreated: (id: string) => void }) {
  const tr = useChassisText();
  const can = useChassisCan();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const rows = useChassisOverview();
  const prices = useQuery({
    queryKey: ["chassis", "spec-balance"],
    queryFn: async () => {
      const { data, error } = await cdb.from("chassis_spec_balance").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const ready = useMemo(() => (rows.data ?? []).filter((r) => r.status === "ready"), [rows.data]);
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; label: string; rows: OverviewRow[] }>();
    for (const r of ready) {
      const key = `${r.client_id}|${r.body_type_id}`;
      if (!m.has(key)) m.set(key, { key, label: `${r.client_name} · ${r.body_type_name ?? "—"}`, rows: [] });
      m.get(key)!.rows.push(r);
    }
    return [...m.values()];
  }, [ready]);
  const [group, setGroup] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = params.get("client");
    const g = groups.find((x) => (c ? x.key.startsWith(c) : true));
    if (!group && g) setGroup(g.key);
  }, [groups, group, params]);
  const current = groups.find((g) => g.key === group);
  useEffect(() => { setPicked(new Set(current?.rows.map((r) => r.id) ?? [])); }, [group, current?.rows.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const priceOf = (r: OverviewRow) => Number((prices.data ?? []).find((p: any) => p.spec_line_id === r.spec_line_id)?.price_gross ?? 0);
  const sel = (current?.rows ?? []).filter((r) => picked.has(r.id));
  const preview = sel.reduce((s, r) => s + priceOf(r), 0);

  if (!can("act")) return null;
  const create = async () => {
    setBusy(true);
    try {
      const id = await chassisRpc<string>("chassis_create_act", { _chassis_ids: sel.map((r) => r.id), _act_date: new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10) });
      toast.success(tr("Akt qoralama sifatida yaratildi"));
      qc.invalidateQueries({ queryKey: ["chassis"] });
      onCreated(id);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{tr("Yangi akt")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {groups.length === 0 ? <p className="text-sm text-muted-foreground">{tr("Hozir tayyor shassi yo'q. OTK «tayyor» deb belgilagan shassilar shu yerda chiqadi.")}</p> : <>
          <div className="max-w-md"><SearchableSelect value={group} onChange={setGroup} options={groups.map((g) => ({ value: g.key, label: g.label, hint: `${g.rows.length} ${tr("tayyor")}` }))} /></div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader><TableRow><TableHead className="w-10" /><TableHead>VIN</TableHead><TableHead>{tr("Zakaz")}</TableHead><TableHead className="text-right">{tr("Narx, QQS bilan")}</TableHead></TableRow></TableHeader>
              <TableBody>{(current?.rows ?? []).map((r) => <TableRow key={r.id}>
                <TableCell><Checkbox id={`pick-${r.id}`} checked={picked.has(r.id)} onCheckedChange={(v) => setPicked((s) => { const n = new Set(s); if (v === true) n.add(r.id); else n.delete(r.id); return n; })} /></TableCell>
                <TableCell><Vin vin={r.vin} /></TableCell><TableCell>{r.order_number}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtSum(priceOf(r))}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-4">
            <span className="text-sm text-muted-foreground">{tr("Tanlandi")}: {sel.length} · {tr("Jami (taxminan)")}: <b className="text-foreground tabular-nums">{fmtSum(preview)}</b></span>
            <Button disabled={!sel.length || busy} onClick={create}>{tr("Akt yaratish (qoralama)")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{tr("Yakuniy summa, QQS va spetsifikatsiya qoldig'ini baza tekshiradi va aktga yozadi.")}</p>
        </>}
      </CardContent>
    </Card>
  );
}

function ActSheet({ act, onClose, onOpen }: { act: Act | null; onClose: () => void; onOpen: (id: string) => void }) {
  const tr = useChassisText();
  const can = useChassisCan();
  const qc = useQueryClient();
  const [dlg, setDlg] = useState<null | "ship" | "esf" | "void" | "replace" | "close">(null);
  const items = useQuery({
    enabled: !!act,
    queryKey: ["chassis", "act-items", act?.id],
    queryFn: async () => {
      const { data, error } = await cdb.from("chassis_act_items").select("price_gross, chassis:chassis(id,vin,engine_no)").eq("act_id", act!.id);
      if (error) throw error;
      return (data ?? []).map((d: any) => ({ ...d.chassis, price_gross: d.price_gross }));
    },
  });
  const esf = useQuery({
    enabled: !!act,
    queryKey: ["chassis", "esf-line", act?.id],
    queryFn: async (): Promise<EsfLine | null> => chassisRpc<EsfLine | null>("chassis_esf_line", { _act_id: act!.id }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["chassis"] });
  const [busy, setBusy] = useState(false);
  const docx = async () => {
    if (!act) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chassis-act-docx`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ actId: act.id }),
      });
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error ?? res.statusText); }
      const blob = new Blob([await res.blob()], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${act.act_no}.docx`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const esfText = esf.data ? [esf.data.name, esf.data.mxik ?? "", esf.data.unit, esf.data.qty, esf.data.price_net, esf.data.cost_net, `${esf.data.vat_rate}%`, esf.data.vat, esf.data.total, esf.data.origin].join("\t") : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(esfText); toast.success(tr("ESF qatori nusxalandi")); }
    catch { toast.error(tr("Nusxalab bo'lmadi — matnni belgilab Ctrl+C bosing")); }
  };
  return (
    <Sheet open={!!act} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {act && <>
          <SheetHeader><SheetTitle className="flex flex-wrap items-center gap-2">{tr("Akt")} {act.act_no} <ActBadge status={act.status} /></SheetTitle></SheetHeader>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={docx}><FileDown className="h-4 w-4 mr-1" />{tr("Aktni yuklab olish (DOCX)")}</Button>
            {act.status === "draft" && can("ship") && <Button size="sm" onClick={() => setDlg("ship")}>{tr("Jo'natildi")}</Button>}
            {act.status === "shipped" && can("esf") && <Button size="sm" onClick={() => setDlg("esf")}>{tr("ESF yozildi")}</Button>}
            {act.status === "esf_issued" && can("esf") && <Button size="sm" onClick={() => setDlg("close")}>{tr("ESF imzolandi")}</Button>}
            {act.status === "shipped" && can("act") && <Button size="sm" variant="outline" onClick={() => setDlg("replace")}>{tr("Almashtirish")}</Button>}
            {(act.status === "draft" || act.status === "shipped") && can("act") && <Button size="sm" variant="outline" className="text-status-red" onClick={() => setDlg("void")}>{tr("Bekor qilish")}</Button>}
          </div>
          <dl className="mt-4 grid grid-cols-[150px_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{tr("Sana")}</dt><dd>{fmtDate(act.act_date)}</dd>
            <dt className="text-muted-foreground">{tr("Buyurtmachi")}</dt><dd>{act.client?.name}</dd>
            <dt className="text-muted-foreground">{tr("Ustqurma")}</dt><dd>{act.body_type?.short_name}</dd>
            <dt className="text-muted-foreground">{tr("Narx QQS'siz")}</dt><dd className="tabular-nums">{fmtSum(act.total_net)}</dd>
            <dt className="text-muted-foreground">{tr("QQS 12%")}</dt><dd className="tabular-nums">{fmtSum(act.total_vat)}</dd>
            <dt className="text-muted-foreground">{tr("Jami")}</dt><dd className="tabular-nums font-semibold">{fmtSum(act.total_gross)}</dd>
            {act.shipped_at && <><dt className="text-muted-foreground">{tr("Jo'natildi")}</dt><dd>{fmtDateTime24(act.shipped_at)} · {act.recipient_name} · {act.recipient_proxy}</dd></>}
            {act.esf_number && <><dt className="text-muted-foreground">ESF</dt><dd>{act.esf_number} · {fmtDate(act.esf_date)} · {fmtSum(act.esf_amount)}</dd></>}
            {act.void_reason && <><dt className="text-muted-foreground">{tr("Bekor qilish sababi")}</dt><dd>{act.void_reason}</dd></>}
          </dl>
          <h3 className="mt-5 mb-2 text-sm font-semibold">{tr("Shassilar")}</h3>
          <div className="rounded-md border divide-y">
            {(items.data ?? []).map((c: any, i: number) => <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-muted-foreground w-6">{i + 1}</span><Vin vin={c.vin} /><span className="ml-auto tabular-nums">{fmtSum(c.price_gross)}</span>
            </div>)}
          </div>
          {esf.data && <>
            <div className="mt-5 mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{tr("ESF uchun qator")}</h3>
              <Button size="sm" variant="outline" onClick={copy}><Copy className="h-4 w-4 mr-1" />{tr("Nusxalash")}</Button></div>
            <div className="rounded-md bg-muted p-3 text-xs space-y-1 select-all">
              <div className="font-medium">{esf.data.name}</div>
              <div>MXIK: {esf.data.mxik ?? <span className="text-status-red">{tr("kiritilmagan")}</span>} · {esf.data.unit} · {esf.data.qty}</div>
              <div className="tabular-nums">{tr("Narx QQS'siz")}: {fmtSum(esf.data.price_net)} · {tr("Qiymati")}: {fmtSum(esf.data.cost_net)} · QQS {esf.data.vat_rate}%: {fmtSum(esf.data.vat)} · {tr("Jami")}: {fmtSum(esf.data.total)}</div>
              <div>{esf.data.origin}</div>
            </div>
          </>}
          {dlg === "ship" && <ShipDialog act={act} onDone={() => { setDlg(null); refresh(); }} onClose={() => setDlg(null)} />}
          {dlg === "esf" && <EsfDialog act={act} onDone={() => { setDlg(null); refresh(); }} onClose={() => setDlg(null)} />}
          {dlg === "void" && <ReasonDialog title={tr("Aktni bekor qilish")} hint={tr("Shassilar «tayyor» holatiga qaytadi.")} onClose={() => setDlg(null)}
            onSubmit={async (reason) => { await chassisRpc("chassis_void_act", { _act_id: act.id, _reason: reason }); toast.success(tr("Akt bekor qilindi")); setDlg(null); refresh(); }} />}
          {dlg === "replace" && <ReasonDialog title={tr("Aktni almashtirish")} hint={tr("Eski akt bekor bo'ladi, yangisi o'sha oluvchi va ishonchnoma bilan darhol «jo'natildi» bo'ladi.")} onClose={() => setDlg(null)}
            onSubmit={async (reason) => {
              const nid = await chassisRpc<string>("chassis_replace_act", { _old_act_id: act.id, _chassis_ids: (items.data ?? []).map((c: any) => c.id), _reason: reason });
              toast.success(tr("Yangi akt yaratildi")); setDlg(null); refresh(); onOpen(nid);
            }} />}
          {dlg === "close" && <ReasonDialog title={tr("ESF imzolandi")} hint={tr("Buyurtmachi ESF'ni imzoladi — akt va shassilar yopiladi.")} reasonOptional onClose={() => setDlg(null)}
            onSubmit={async () => { await chassisRpc("chassis_close_act", { _act_id: act.id }); toast.success(tr("Akt yopildi")); setDlg(null); refresh(); }} />}
        </>}
      </SheetContent>
    </Sheet>
  );
}

function ShipDialog({ act, onDone, onClose }: { act: Act; onDone: () => void; onClose: () => void }) {
  const tr = useChassisText();
  const [name, setName] = useState(""); const [proxy, setProxy] = useState("");
  const [at, setAt] = useState(() => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await chassisRpc("chassis_ship_act", { _act_id: act.id, _shipped_at: new Date(at + ":00+05:00").toISOString(), _recipient_name: name, _recipient_proxy: proxy }); toast.success(tr("Jo'natildi")); onDone(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
    <DialogHeader><DialogTitle>{tr("Jo'natish")} · {act.act_no}</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div className="space-y-1.5"><Label htmlFor="ship-at">{tr("Chiqish sanasi va vaqti")}</Label><Input id="ship-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="ship-name">{tr("Oluvchi (F.I.Sh.)")}</Label><Input id="ship-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="ship-proxy">{tr("Ishonchnoma")}</Label><Input id="ship-proxy" value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder="№ … · dd.mm.yyyy" /></div>
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose}>{tr("Bekor")}</Button><Button disabled={!name.trim() || !proxy.trim() || busy} onClick={submit}>{tr("Jo'natildi")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function EsfDialog({ act, onDone, onClose }: { act: Act; onDone: () => void; onClose: () => void }) {
  const tr = useChassisText();
  const [num, setNum] = useState(""); const [date, setDate] = useState(new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10));
  const [amount, setAmount] = useState(String(act.total_gross));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await chassisRpc("chassis_register_esf", { _act_id: act.id, _esf_number: num, _esf_date: date, _esf_amount: Number(amount.replace(/\s/g, "").replace(",", ".")) }); toast.success(tr("ESF yozildi")); onDone(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
    <DialogHeader><DialogTitle>ESF · {act.act_no}</DialogTitle></DialogHeader>
    <div className="space-y-3">
      <div className="space-y-1.5"><Label htmlFor="esf-num">{tr("ESF raqami")}</Label><Input id="esf-num" value={num} onChange={(e) => setNum(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="esf-date">{tr("ESF sanasi")}</Label><Input id="esf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="esf-sum">{tr("ESF summasi")}</Label><Input id="esf-sum" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <p className="text-xs text-muted-foreground">{tr("Aktda")}: {fmtSum(act.total_gross)}. {tr("Farq 0,5 so'mdan oshsa baza qabul qilmaydi.")}</p></div>
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose}>{tr("Bekor")}</Button><Button disabled={!num.trim() || !amount || busy} onClick={submit}>{tr("Saqlash")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

function ReasonDialog({ title, hint, onSubmit, onClose, reasonOptional }: { title: string; hint: string; onSubmit: (reason: string) => Promise<void>; onClose: () => void; reasonOptional?: boolean }) {
  const tr = useChassisText();
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); try { await onSubmit(reason); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent>
    <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
    <p className="text-sm text-muted-foreground">{hint}</p>
    {!reasonOptional && <div className="space-y-1.5"><Label htmlFor="reason">{tr("Sabab")}</Label><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>}
    <DialogFooter><Button variant="outline" onClick={onClose}>{tr("Bekor")}</Button><Button disabled={(!reasonOptional && !reason.trim()) || busy} onClick={submit}>{tr("Tasdiqlash")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
