import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SearchableSelect from "@/components/SearchableSelect";
import { ChassisBadge, ChassisHeader, STATUS_LABEL, Vin, useChassisCan } from "@/components/chassis/ChassisUI";
import { useChassisText } from "@/i18n/chassis";
import { displayUser } from "@/lib/userNames";
import { CHASSIS_FLOW, CHASSIS_PHOTO_BUCKET, NEXT_ACTION, cdb, chassisRpc, sendIntakeTo1C, matchesChassis, type ChassisStatus } from "@/lib/chassis";
import { fmtDate, fmtDateTime24 } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface OverviewRow {
  id: string; vin: string; engine_no: string | null; model: string; status: ChassisStatus; client_id: string; client_name: string;
  body_type_id: string | null; body_type_name: string | null; spec_line_id: string | null; order_id: string | null; order_number: string | null;
  intake_act_no: string | null; inbound_proxy: string | null; received_at: string | null; mileage_km: number | null; kit: Record<string, boolean>;
  defects: string | null; photo_paths: string[]; test_passed_at: string | null; act_id: string | null; act_no: string | null; act_status: string | null;
  esf_number: string | null; days_on_site: number | null; days_expected: number | null; created_at: string;
}

export function useChassisOverview() {
  return useQuery({
    queryKey: ["chassis", "overview"],
    queryFn: async (): Promise<OverviewRow[]> => {
      const { data, error } = await cdb.from("chassis_overview").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const STEP_LABEL: Record<string, string> = {
  receive: "Qabul qilish", production: "Ishlab chiqarishga", ready: "OTK: tayyor", act: "Aktga qo'shish", ship: "Jo'natish", esf: "ESF",
};

export default function ChassisRegistryPage() {
  const tr = useChassisText();
  const can = useChassisCan();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const status = (params.get("status") ?? "all") as ChassisStatus | "all";
  const openId = params.get("id");
  const rows = useChassisOverview();
  const [prodFor, setProdFor] = useState<OverviewRow | null>(null);
  const [readyFor, setReadyFor] = useState<OverviewRow | null>(null);

  const list = useMemo(() => (rows.data ?? []).filter((r) => (status === "all" || r.status === status) && matchesChassis(r, q)), [rows.data, status, q]);
  const open = (rows.data ?? []).find((r) => r.id === openId) ?? null;
  const setParam = (k: string, v: string | null) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };

  const step = (r: OverviewRow) => {
    const a = NEXT_ACTION[r.status];
    if (a === "receive") nav(`/chassis/receive?vin=${r.vin}`);
    else if (a === "production") setProdFor(r);
    else if (a === "ready") setReadyFor(r);
    else if (r.act_id) nav(`/chassis/acts?act=${r.act_id}`);
    else nav(`/chassis/acts?client=${r.client_id}`);
  };

  return (
    <div className="space-y-4">
      <ChassisHeader title="Shassilar reestri" hint="Qatorni bosing — kartochka ochiladi. Tugma faqat sizning rolingizga tegishli qadamda faol." />
      <Input id="chassis-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("VIN, VIN oxiri (4–6), dvigatel, zakaz, akt, ESF…")} className="max-w-xl" />
      <div className="flex flex-wrap gap-1.5">
        {(["all", ...CHASSIS_FLOW, "returned_without_work"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setParam("status", s === "all" ? null : s)}
            className={cn("rounded-full border px-3 py-1 text-xs", status === s ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted")}>
            {s === "all" ? tr("Hammasi") : tr(STATUS_LABEL[s])}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>VIN</TableHead><TableHead>{tr("Dvigatel")}</TableHead><TableHead>{tr("Ustqurma")}</TableHead><TableHead>{tr("Buyurtmachi")}</TableHead>
            <TableHead>{tr("Zakaz")}</TableHead><TableHead>{tr("Holat")}</TableHead><TableHead className="text-right">{tr("Maydonchada")}</TableHead>
            <TableHead>{tr("Akt")}</TableHead><TableHead>ESF</TableHead><TableHead>{tr("Keyingi qadam")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {list.map((r) => {
              const a = NEXT_ACTION[r.status];
              const allowed = a ? can(a) : false;
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setParam("id", r.id)}>
                  <TableCell><Vin vin={r.vin} /></TableCell>
                  <TableCell className="font-mono text-xs">{r.engine_no ?? "—"}</TableCell>
                  <TableCell>{r.body_type_name ?? "—"}</TableCell>
                  <TableCell>{r.client_name}</TableCell>
                  <TableCell>{r.order_number ?? "—"}</TableCell>
                  <TableCell><ChassisBadge status={r.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{r.days_on_site ?? (r.days_expected != null ? `(${r.days_expected})` : "—")}</TableCell>
                  <TableCell>{r.act_no ?? "—"}</TableCell>
                  <TableCell>{r.esf_number ?? "—"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {a && <Button size="sm" variant={allowed ? "default" : "outline"} disabled={!allowed} title={allowed ? undefined : tr("Bu qadam boshqa rolga tegishli")} onClick={() => step(r)}>
                      {tr(STEP_LABEL[a])}
                    </Button>}
                  </TableCell>
                </TableRow>
              );
            })}
            {!rows.isLoading && list.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">{tr("Hech narsa topilmadi")}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <ChassisCard row={open} onClose={() => setParam("id", null)} />
      {prodFor && <ProductionDialog row={prodFor} onClose={() => setProdFor(null)} />}
      {readyFor && <ReadyDialog row={readyFor} onClose={() => setReadyFor(null)} />}
    </div>
  );
}

const KIT_LABEL: Record<string, string> = { spare: "Zapaska", jack: "Domkrat", tools: "Asboblar", docs: "Hujjatlar", keys: "Kalitlar", firstaid: "Aptechka" };

/** 1C:УК dagi qabul qoralamasi holati va qayta yuborish */
function OnecIntake({ chassisId }: { chassisId: string }) {
  const tr = useChassisText();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["chassis", "onec", chassisId],
    queryFn: async () => {
      const [{ data: ch }, { data: log }] = await Promise.all([
        cdb.from("chassis").select("onec_intake_ref").eq("id", chassisId).maybeSingle(),
        cdb.from("integration_log").select("status, response, attempts, updated_at").eq("entity", "chassis_intake").eq("erp_id", chassisId)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { ref: (ch as any)?.onec_intake_ref as string | null, log: log as any };
    },
  });
  const send = async () => {
    setBusy(true);
    try {
      const r = await sendIntakeTo1C(chassisId, true);
      toast.success(`${tr("1C'ga qoralama yuborildi")}${r.number ? `: ${r.number}` : ""}`);
    } catch (e: any) { toast.error(e.message, { duration: 10000 }); }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ["chassis", "onec", chassisId] }); }
  };
  if (q.isLoading) return <span className="text-muted-foreground">…</span>;
  const log = q.data?.log;
  if (q.data?.ref) return <span className="text-status-green">{tr("Qoralama yaratilgan")}{log?.response ? ` — ${log.response}` : ""}</span>;
  return <div className="space-y-1">
    {log?.status === "error" && <p className="text-status-red text-xs">{log.response} ({log.attempts}×)</p>}
    {!log && <p className="text-muted-foreground text-xs">{tr("Hali yuborilmagan")}</p>}
    <Button size="sm" variant="outline" disabled={busy} onClick={send}>{tr("1C'ga qayta yuborish")}</Button>
  </div>;
}

function ChassisCard({ row, onClose }: { row: OverviewRow | null; onClose: () => void }) {
  const tr = useChassisText();
  const events = useQuery({
    enabled: !!row,
    queryKey: ["chassis", "events", row?.id],
    queryFn: async () => {
      const { data, error } = await cdb.from("chassis_events").select("*").eq("chassis_id", row!.id).order("created_at");
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((e: any) => e.actor_id).filter(Boolean))];
      const { data: profs } = ids.length ? await cdb.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
      const names = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      return (data ?? []).map((e: any) => ({ ...e, who: displayUser(names.get(e.actor_id) as string | undefined) }));
    },
  });
  const photos = useQuery({
    enabled: !!row && row.photo_paths.length > 0,
    queryKey: ["chassis", "photos", row?.id, row?.photo_paths.join("|")],
    queryFn: async () => {
      const { data, error } = await cdb.storage.from(CHASSIS_PHOTO_BUCKET).createSignedUrls(row!.photo_paths, 3600);
      if (error) throw error;
      return (data ?? []).map((d: any) => d.signedUrl as string).filter(Boolean);
    },
  });
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {row && <>
          <SheetHeader><SheetTitle className="flex flex-wrap items-center gap-2"><Vin vin={row.vin} className="text-base" /><ChassisBadge status={row.status} /></SheetTitle></SheetHeader>
          <dl className="mt-4 grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{tr("Model")}</dt><dd>{row.model}</dd>
            <dt className="text-muted-foreground">{tr("Dvigatel")}</dt><dd className="font-mono">{row.engine_no ?? "—"}</dd>
            <dt className="text-muted-foreground">{tr("Buyurtmachi")}</dt><dd>{row.client_name}</dd>
            <dt className="text-muted-foreground">{tr("Ishonchnoma")}</dt><dd>{row.inbound_proxy ?? "—"}</dd>
            <dt className="text-muted-foreground">{tr("Ustqurma")}</dt><dd>{row.body_type_name ?? "—"}</dd>
            <dt className="text-muted-foreground">{tr("Zakaz")}</dt><dd>{row.order_id ? <Link className="text-primary underline" to={`/orders/${row.order_id}`}>{row.order_number}</Link> : tr("bog'lanmagan")}</dd>
            <dt className="text-muted-foreground">{tr("Qabul akti")}</dt><dd>{row.intake_act_no ?? "—"}</dd>
            <dt className="text-muted-foreground">{tr("Qabul qilingan")}</dt><dd>{row.received_at ? fmtDateTime24(row.received_at) : "—"}</dd>
            <dt className="text-muted-foreground">{tr("Probeg")}</dt><dd>{row.mileage_km != null ? `${row.mileage_km} km` : "—"}</dd>
            <dt className="text-muted-foreground">{tr("Komplektlik")}</dt>
            <dd>{Object.entries(row.kit ?? {}).map(([k, v]) => `${tr(KIT_LABEL[k] ?? k)} ${v ? "✓" : "✗"}`).join(" · ") || "—"}</dd>
            <dt className="text-muted-foreground">{tr("Nuqsonlar")}</dt><dd>{row.defects ?? "—"}</dd>
            <dt className="text-muted-foreground">{tr("Akt")}</dt><dd>{row.act_no ? <Link className="text-primary underline" to={`/chassis/acts?act=${row.act_id}`}>{row.act_no}</Link> : "—"}</dd>
            <dt className="text-muted-foreground">ESF</dt><dd>{row.esf_number ?? "—"}</dd>
            {row.test_passed_at && <><dt className="text-muted-foreground">{tr("Sinov")}</dt><dd>{fmtDate(row.test_passed_at)}</dd></>}
            {row.status !== "expected" && <><dt className="text-muted-foreground">1C:УК</dt><dd><OnecIntake chassisId={row.id} /></dd></>}
          </dl>
          {row.photo_paths.length > 0 && <div className="mt-5">
            <h3 className="text-sm font-semibold mb-2">{tr("Rasmlar")}</h3>
            <div className="grid grid-cols-3 gap-2">
              {(photos.data ?? []).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="aspect-[4/3] w-full rounded-md object-cover border" /></a>)}
            </div>
          </div>}
          <div className="mt-5">
            <h3 className="text-sm font-semibold mb-2">{tr("Tarix")}</h3>
            <ol className="space-y-3 border-l pl-4">
              {(events.data ?? []).map((e: any) => <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                <div className="text-sm">{e.comment ?? `${e.from_status ?? ""} → ${e.to_status}`}</div>
                <div className="text-xs text-muted-foreground">{e.who}{e.actor_role ? ` (${e.actor_role})` : ""} · {fmtDateTime24(e.created_at)}</div>
              </li>)}
            </ol>
          </div>
        </>}
      </SheetContent>
    </Sheet>
  );
}

function ProductionDialog({ row, onClose }: { row: OverviewRow; onClose: () => void }) {
  const tr = useChassisText();
  const qc = useQueryClient();
  const [line, setLine] = useState("");
  const [order, setOrder] = useState("");
  const [busy, setBusy] = useState(false);
  const lines = useQuery({
    queryKey: ["chassis", "spec-lines", row.client_id],
    queryFn: async () => {
      const { data, error } = await cdb.from("chassis_spec_balance").select("*").eq("client_id", row.client_id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const orders = useQuery({
    queryKey: ["chassis", "free-orders"],
    queryFn: async () => {
      const [{ data: os, error }, { data: used }] = await Promise.all([
        cdb.from("orders").select("id,order_number,product_name,status").in("status", ["pending", "in_progress", "delayed"]).order("created_at", { ascending: false }).limit(500),
        cdb.from("chassis").select("order_id").not("order_id", "is", null),
      ]);
      if (error) throw error;
      const taken = new Set((used ?? []).map((u: any) => u.order_id));
      return (os ?? []).filter((o: any) => !taken.has(o.id));
    },
  });
  useEffect(() => { if (lines.data?.length === 1) setLine(lines.data[0].spec_line_id); }, [lines.data]);
  const submit = async () => {
    setBusy(true);
    try {
      await chassisRpc("chassis_to_production", { _chassis_id: row.id, _spec_line_id: line, _order_id: order });
      toast.success(tr("Ishlab chiqarishga berildi"));
      qc.invalidateQueries({ queryKey: ["chassis"] });
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{tr("Ishlab chiqarishga berish")} · <Vin vin={row.vin} /></DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>{tr("Spetsifikatsiya qatori")}</Label>
            <SearchableSelect value={line} onChange={setLine} placeholder={tr("Tanlang")}
              options={(lines.data ?? []).map((l: any) => ({ value: l.spec_line_id, label: `${l.body_type_name} · № ${l.contract_no} / ${l.spec_no}`, hint: l.remaining == null ? tr("cheklanmagan") : `${tr("Qoldiq")}: ${l.remaining}` }))} />
          </div>
          <div className="space-y-1.5"><Label>{tr("Zakaz")}</Label>
            <SearchableSelect value={order} onChange={setOrder} placeholder={tr("Zakaz raqami")}
              options={(orders.data ?? []).map((o: any) => ({ value: o.id, label: o.order_number, hint: o.product_name }))} />
          </div>
          <p className="text-xs text-muted-foreground">{tr("Zakaz prefiksi ustqurma turiga mos bo'lishi kerak (masalan, selnos — SEL).")}</p>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>{tr("Bekor")}</Button><Button disabled={!line || !order || busy} onClick={submit}>{tr("Ishlab chiqarishga")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReadyDialog({ row, onClose }: { row: OverviewRow; onClose: () => void }) {
  const tr = useChassisText();
  const qc = useQueryClient();
  const [test, setTest] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await chassisRpc("chassis_mark_ready", { _chassis_id: row.id, _test_passed: test, _comment: comment || null });
      toast.success(tr("Tayyor deb belgilandi"));
      qc.invalidateQueries({ queryKey: ["chassis"] });
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{tr("OTK: tayyor")} · <Vin vin={row.vin} /></DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{tr("Zakazning OTK talab qilinadigan barcha bosqichlari o'tgan bo'lishi kerak.")} {row.order_number}</p>
          <label className="flex items-center gap-2 text-sm"><Checkbox id="chassis-test" checked={test} onCheckedChange={(v) => setTest(v === true)} />{tr("Sinov o'tdi")}</label>
          <div className="space-y-1.5"><Label htmlFor="chassis-ready-comment">{tr("Izoh (ixtiyoriy)")}</Label><Textarea id="chassis-ready-comment" value={comment} onChange={(e) => setComment(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>{tr("Bekor")}</Button><Button disabled={busy} onClick={submit}>{tr("Tayyor")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
