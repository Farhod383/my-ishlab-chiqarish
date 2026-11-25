import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ScanBarcode, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import SearchableSelect from "@/components/SearchableSelect";
import { ChassisHeader, STATUS_LABEL, useBodyTypes, useChassisCan, useClients } from "@/components/chassis/ChassisUI";
import { useChassisText } from "@/i18n/chassis";
import { createIssueScanHandler } from "@/lib/issueScan";
import { registerScanHandler } from "@/lib/scanChannel";
import { CHASSIS_PHOTO_BUCKET, cdb, chassisRpc, sendIntakeTo1C, checkVin } from "@/lib/chassis";
import { cn } from "@/lib/utils";

const KIT = ["spare", "jack", "tools", "docs", "keys", "firstaid"] as const;
const KIT_LABEL: Record<string, string> = { spare: "Zapaska", jack: "Domkrat", tools: "Asboblar", docs: "Hujjatlar", keys: "Kalitlar", firstaid: "Aptechka" };
interface Known { vin: string; status: string; client_id: string; client_name: string; act_no: string | null }

export default function ChassisReceivePage() {
  const tr = useChassisText();
  const can = useChassisCan();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const clients = useClients();
  const bodyTypes = useBodyTypes();
  const [vinRaw, setVinRaw] = useState(params.get("vin") ?? "");
  const [engine, setEngine] = useState("");
  const [mileage, setMileage] = useState("");
  const [kit, setKit] = useState<Record<string, boolean>>({ spare: true, jack: true, tools: true, docs: true, keys: true, firstaid: false });
  const [defects, setDefects] = useState("");
  const [proxy, setProxy] = useState("");
  const [clientId, setClientId] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);

  const known = useQuery({
    queryKey: ["chassis", "known-vins"],
    queryFn: async (): Promise<Known[]> => {
      const { data, error } = await cdb.from("chassis_overview").select("vin,status,client_id,client_name,act_no");
      if (error) throw error;
      return data ?? [];
    },
  });
  const check = checkVin(vinRaw);
  const match = useMemo(() => (known.data ?? []).find((k) => k.vin === check.vin), [known.data, check.vin]);
  const expected = match?.status === "expected";
  const duplicate = !!match && !expected;
  useEffect(() => { if (expected && match) setClientId(match.client_id); }, [expected, match]);

  // Skaner (klaviatura kabi yozadigan) — VIN maydoniga tushadi, qayerda kursor turganidan qat'i nazar
  useEffect(() => registerScanHandler(createIssueScanHandler((_c, raw) => setVinRaw(raw.trim()))), []);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const hint = (() => {
    switch (check.state) {
      case "empty": return { cls: "text-muted-foreground", text: tr("Skaner bilan o'qing yoki yozing. O→0, I→1 o'zi tuzatiladi.") };
      case "short": return { cls: "text-muted-foreground", text: `${check.vin.length} / 17` };
      case "long": return { cls: "text-status-red", text: tr("17 belgidan ko'p") };
      case "bad": return { cls: "text-status-red", text: tr("Ruxsat etilmagan belgi bor (I, O, Q bo'lmaydi)") };
    }
    if (duplicate) return { cls: "text-status-red", text: `${tr("VIN allaqachon reestrda")}: ${tr(STATUS_LABEL[match!.status as keyof typeof STATUS_LABEL])}${match!.act_no ? ", " + match!.act_no : ""}` };
    if (expected) return { cls: "text-status-green", text: `✓ ${tr("Kutilayotganlar ro'yxatida bor")} · ${match!.client_name}` };
    return { cls: "text-status-green", text: `✓ ${tr("To'g'ri. Ro'yxatda yo'q — yangi shassi sifatida qo'shiladi")}` };
  })();

  const canSubmit = check.state === "ok" && !duplicate && files.length > 0 && proxy.trim() && (expected || clientId) && !busy;

  const submit = async () => {
    setBusy(true);
    try {
      const paths: string[] = [];
      for (const f of files) {
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${check.vin}/${crypto.randomUUID()}.${ext}`;
        const { error } = await cdb.storage.from(CHASSIS_PHOTO_BUCKET).upload(path, f, { contentType: f.type || "image/jpeg" });
        if (error) throw new Error(`${tr("Rasm yuklanmadi")}: ${error.message}`);
        paths.push(path);
      }
      const newId = await chassisRpc<string>("chassis_receive", {
        _vin: check.vin, _engine_no: engine || null, _mileage: mileage ? Number(mileage) : null, _kit: kit, _defects: defects || null,
        _photo_paths: paths, _proxy: proxy, _body_type_id: bodyType || null, _client_id: expected ? null : clientId,
      });
      toast.success(`${tr("Qabul qilindi")}: ${check.vin}`);
      // 1C:УК ga qoralama — qabulni to'xtatmaydi, xato bo'lsa reestr kartasidan qayta yuboriladi
      if (newId) sendIntakeTo1C(newId)
        .then((r) => { toast.success(`${tr("1C'ga qoralama yuborildi")}${r.number ? `: ${r.number}` : ""}`); qc.invalidateQueries({ queryKey: ["chassis", "onec"] }); })
        .catch((e) => toast.warning(`${tr("1C'ga yuborilmadi")}: ${e.message}`, { duration: 10000 }));
      qc.invalidateQueries({ queryKey: ["chassis"] });
      setVinRaw(""); setEngine(""); setMileage(""); setDefects(""); setFiles([]); setBodyType("");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <ChassisHeader title="Shassi qabuli" hint="Telefonda ham qulay. VIN skaner bilan yoki qo'lda kiritiladi." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] items-start">
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="chassis-vin">VIN (17)</Label>
              <Input id="chassis-vin" value={vinRaw} autoFocus autoComplete="off" spellCheck={false} inputMode="text"
                onChange={(e) => setVinRaw(e.target.value)} onBlur={() => setVinRaw(check.vin)}
                className={cn("h-14 font-mono text-xl tracking-widest uppercase", check.state === "ok" && !duplicate && "border-status-green", (check.state === "bad" || check.state === "long" || duplicate) && "border-status-red")} />
              <p className={cn("text-xs flex items-center gap-1", hint.cls)}><ScanBarcode className="h-3.5 w-3.5" />{hint.text}</p>
            </div>
            {!expected && check.state === "ok" && !duplicate && (
              <div className="space-y-1.5"><Label>{tr("Buyurtmachi")}</Label>
                <SearchableSelect value={clientId} onChange={setClientId} placeholder={tr("Tanlang")} options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{tr("Rasmlar (kamida 1)")}</Label>
              <div className="grid grid-cols-4 gap-2">
                {previews.map((u, i) => <div key={u} className="relative aspect-square">
                  <img src={u} alt="" className="h-full w-full rounded-md object-cover border" />
                  <button type="button" aria-label={tr("O'chirish")} onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 rounded-full bg-background border p-0.5"><X className="h-3 w-3" /></button>
                </div>)}
                <button type="button" onClick={() => camRef.current?.click()} className="aspect-square rounded-md border-2 border-dashed flex flex-col items-center justify-center text-xs text-muted-foreground hover:bg-muted">
                  <Camera className="h-5 w-5 mb-1" />{tr("Kamera")}
                </button>
              </div>
              <input ref={camRef} id="chassis-photos" type="file" accept="image/*" capture="environment" multiple hidden
                onChange={(e) => { setFiles((f) => [...f, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label htmlFor="chassis-engine">{tr("Dvigatel № (ixtiyoriy)")}</Label><Input id="chassis-engine" value={engine} onChange={(e) => setEngine(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="chassis-km">{tr("Probeg, km (ixtiyoriy)")}</Label><Input id="chassis-km" inputMode="numeric" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/\D/g, ""))} /></div>
            </div>
            <div className="space-y-1.5"><Label>{tr("Komplektlik")}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {KIT.map((k) => <label key={k} className="flex items-center gap-2 text-sm"><Checkbox id={`kit-${k}`} checked={!!kit[k]} onCheckedChange={(v) => setKit((s) => ({ ...s, [k]: v === true }))} />{tr(KIT_LABEL[k])}</label>)}
              </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="chassis-defects">{tr("Nuqsonlar (ixtiyoriy)")}</Label><Textarea id="chassis-defects" rows={2} value={defects} onChange={(e) => setDefects(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="chassis-proxy">{tr("Buyurtmachi ishonchnomasi")}</Label><Input id="chassis-proxy" value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder="№ … · dd.mm.yyyy" /></div>
            <div className="space-y-1.5"><Label>{tr("Ustqurma turi (ixtiyoriy)")}</Label>
              <SearchableSelect value={bodyType} onChange={setBodyType} placeholder={tr("Keyin ham tanlash mumkin")} clearLabel={tr("Tanlanmagan")}
                options={(bodyTypes.data ?? []).filter((b) => b.is_active).map((b) => ({ value: b.id, label: b.short_name }))} />
            </div>
            <Button className="w-full h-12 text-base" disabled={!canSubmit || !can("receive")} onClick={submit}>{busy ? tr("Saqlanmoqda…") : tr("Qabul qilish")}</Button>
            {!can("receive") && <p className="text-xs text-muted-foreground">{tr("Qabulni faqat skladchi qiladi.")}</p>}
          </CardContent>
        </Card>
        <ExpectList />
      </div>
    </div>
  );
}

function ExpectList() {
  const tr = useChassisText();
  const can = useChassisCan();
  const qc = useQueryClient();
  const clients = useClients();
  const [text, setText] = useState("");
  const [clientId, setClientId] = useState("");
  const [proxy, setProxy] = useState("");
  const [result, setResult] = useState<{ added: number; rejected: { vin: string; reason: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const vins = text.split(/[\s,;]+/).map((v) => v.trim()).filter(Boolean);
      const r = await chassisRpc<{ added: number; rejected: { vin: string; reason: string }[] }>("chassis_expect", { _vins: vins, _client_id: clientId, _proxy: proxy || null });
      setResult(r);
      if (r.added) { toast.success(`${tr("Ro'yxatga qo'shildi")}: ${r.added}`); setText(""); }
      qc.invalidateQueries({ queryKey: ["chassis"] });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{tr("Kutilayotgan VIN ro'yxati")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{tr("Buyurtmachi yuborgan VIN'larni bittadan qatorga yozing yoki Excel'dan nusxalang. Takrorlangan va reestrda borlari rad etiladi.")}</p>
        <Textarea id="chassis-expect" rows={6} className="font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={"LFW…\nLFW…"} />
        <div className="grid gap-2 sm:grid-cols-2">
          <SearchableSelect value={clientId} onChange={setClientId} placeholder={tr("Buyurtmachi")} options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Input id="chassis-expect-proxy" value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder={tr("Ishonchnoma (ixtiyoriy)")} />
        </div>
        <Button disabled={!text.trim() || !clientId || busy || !can("expect")} onClick={submit}>{tr("Ro'yxatga qo'shish")}</Button>
        {result && result.rejected.length > 0 && <div className="rounded-md border border-status-red/30 bg-status-red/5 p-3 text-sm space-y-1">
          <div className="font-medium">{tr("Rad etildi")}: {result.rejected.length}</div>
          {result.rejected.map((r, i) => <div key={i} className="font-mono text-xs">{r.vin} — <span className="font-sans">{r.reason}</span></div>)}
        </div>}
      </CardContent>
    </Card>
  );
}
