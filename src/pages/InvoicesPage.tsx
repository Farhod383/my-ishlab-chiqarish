import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Image as ImageIcon, CheckCircle2, Clock, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtNum, fmtDateTime24 } from "@/lib/format";
import {
  INTAKE_STATUS_META, intakeCode, intakeDuration, itemsTotal,
  closeInvoice,
  type IntakeItem, type IntakeSession,
} from "@/lib/intake";

const fmt = (n: number) => fmtNum(n);

export default function InvoicesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole(["admin", "warehouse"]);

  const [sessions, setSessions] = useState<IntakeSession[]>([]);
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Ochiq nakladnoy
  const [actFile, setActFile] = useState<File | null>(null);
  const [actPreviewUrl, setActPreviewUrl] = useState<string | null>(null);
  const [actBusy, setActBusy] = useState(false);

  // O'chirish
  const [delId, setDelId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: s } = await supabase
      .from("intake_sessions").select("*")
      .order("started_at", { ascending: false })
      .limit(300);
    const list = ((s as any[]) ?? []) as IntakeSession[];
    const ids = list.map((x) => x.id);
    let it: any[] = [];
    if (ids.length) {
      const { data } = await supabase.from("intake_items").select("*").in("session_id", ids).order("created_at", { ascending: true });
      it = (data as any[]) ?? [];
    }
    setSessions(list);
    setItems(it as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const itemsBySession = useMemo(() => {
    const m: Record<string, IntakeItem[]> = {};
    items.forEach((i) => { (m[i.session_id] ||= []).push(i); });
    return m;
  }, [items]);

  // Yopilmagan barcha sessiyalar bitta Nakladnoy sifatida ko'rsatiladi
  const openSessions = useMemo(
    () => sessions.filter((s) => s.status !== "finalized"),
    [sessions],
  );
  const active = useMemo(() => {
    // Faqat mahsuloti bor yopilmagan nakladnoy ko'rinadi —
    // bo'sh vaqtinchalik sessiyalar "Kirim davom etmoqda" kartasini yaratmaydi.
    const withItems = openSessions.filter((s) => (itemsBySession[s.id] ?? []).length > 0);
    if (!withItems.length) return null;
    // eng erta boshlangani — asosiy nakladnoy
    return [...withItems].sort((a, b) => +new Date(a.started_at) - +new Date(b.started_at))[0];
  }, [openSessions, itemsBySession]);
  const activeItems = useMemo(
    () => openSessions.flatMap((s) => itemsBySession[s.id] ?? []),
    [openSessions, itemsBySession],
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return sessions.filter((s) => {
      if (s.status !== "finalized") return false;
      if (!term) return true;
      const list = itemsBySession[s.id] ?? [];
      return (
        intakeCode(s).toLowerCase().includes(term) ||
        (s.created_by_name ?? "").toLowerCase().includes(term) ||
        (s.supplier ?? "").toLowerCase().includes(term) ||
        list.some((i) => i.product_name.toLowerCase().includes(term))
      );
    });
  }, [sessions, q, itemsBySession]);

  const current = sessions.find((s) => s.id === openId) ?? null;
  const currentItems = openId ? (itemsBySession[openId] ?? []) : [];

  const deleteSession = async () => {
    if (!delId) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_intake_invoice" as any, { _session_id: delId });
    setBusy(false);
    const removed = delId;
    setDelId(null);
    if (error) { toast.error(error.message); return; }
    if (openId === removed) setOpenId(null);
    toast.success("Nakladnoy o'chirildi — sklad qoldig'i qayta hisoblandi");
    await load();
  };

  /** Nakladnoy rasmini o'chirish (DB + storage) */
  const [delImgId, setDelImgId] = useState<string | null>(null);
  const removeImage = async () => {
    const s = sessions.find((x) => x.id === delImgId);
    if (!s || !s.image_url) { setDelImgId(null); return; }
    setBusy(true);
    try {
      const marker = "/object/public/product-images/";
      const idx = s.image_url.indexOf(marker);
      if (idx >= 0) {
        const path = decodeURIComponent(s.image_url.slice(idx + marker.length).split("?")[0]);
        await supabase.storage.from("product-images").remove([path]);
      }
      const { error } = await supabase.rpc("clear_intake_invoice_image" as any, { _session_id: s.id });
      if (error) throw error;
      toast.success("Rasm o'chirildi");
      setDelImgId(null);
      await load();
    } catch (e: any) { toast.error(e.message ?? "Rasmni o'chirishda xatolik"); }
    finally { setBusy(false); }
  };

  /** Rasm tanlash — avtomatik preview (alohida yuklash tugmasi yo'q) */
  const handleActFile = (f: File | null) => {
    if (actPreviewUrl) URL.revokeObjectURL(actPreviewUrl);
    setActFile(f);
    setActPreviewUrl(f ? URL.createObjectURL(f) : null);
  };

  /** Nakladnoyni yopish — rasm shu paytda saqlanadi, barcha kirimlar bir martada skladga tushadi */
  const closeActive = async () => {
    if (!active) return;
    if (activeItems.length === 0) { toast.error("Nakladnoyda mahsulot yo'q"); return; }
    if (!active.image_url && !actFile) { toast.error("Avval rasm tanlang"); return; }
    if (active.status === "finalized") return;
    setActBusy(true);
    try {
      if (actFile) {
        const ext = actFile.name.split(".").pop();
        const path = `nakladnoy/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("product-images").upload(path, actFile);
        if (up.error) throw up.error;
        const url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
        const { error } = await supabase.from("intake_sessions").update({ image_url: url } as any).eq("id", active.id);
        if (error) throw error;
      }
      await closeInvoice(active.id);
      if (actPreviewUrl) URL.revokeObjectURL(actPreviewUrl);
      setActFile(null);
      setActPreviewUrl(null);
      toast.success("Nakladnoy yopildi — mahsulotlar skladga kirim qilindi");
      await load();
    } catch (e: any) { toast.error(e.message ?? "Xatolik"); }
    finally { setActBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Nakladnoy</h1>
          <p className="text-sm text-muted-foreground">Yopilgan Nakladnoylar tarixi ({rows.length})</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Nakladnoy, mahsulot, xodim..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {active && (
        <Card className="border-status-yellow/50 bg-status-yellow/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex flex-wrap items-center gap-2">
              <span className="font-mono">Ochiq Nakladnoy {intakeCode(active)}</span>
              <Badge variant="outline" className={INTAKE_STATUS_META[active.status].cls}>{INTAKE_STATUS_META[active.status].label}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Boshlangan: {fmtDateTime24(active.started_at)}
              {active.finished_at ? ` · Tugagan: ${fmtDateTime24(active.finished_at)}` : ""}
              {active.supplier ? ` · Olib keldi: ${active.supplier}` : ""}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded border bg-background overflow-hidden">
              <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>№</TableHead>
                      <TableHead>Mahsulot</TableHead>
                      <TableHead className="text-right">Miqdor</TableHead>
                      <TableHead className="text-right">1 birlik narxi</TableHead>
                      <TableHead>Valyuta</TableHead>
                      <TableHead className="text-right">Jami</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeItems.map((i, idx) => (
                      <TableRow key={i.id}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{i.product_name}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(Number(i.quantity))} {i.unit}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(Number(i.unit_price))}</TableCell>
                        <TableCell>{i.currency}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmt(Number(i.quantity) * Number(i.unit_price))}</TableCell>
                      </TableRow>
                    ))}
                    {activeItems.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Mahsulot yo'q</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-between px-4 py-2 bg-muted/40 text-sm">
                <span className="text-muted-foreground">Jami summa ({activeItems.length} mahsulot)</span>
                <span className="font-mono font-bold">{fmt(itemsTotal(activeItems))}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nakladnoy rasmi <span className="text-destructive">*</span></Label>
              {active.image_url ? (
                <div className="flex items-start gap-2">
                  <a href={active.image_url} target="_blank" rel="noreferrer">
                    <img src={active.image_url} alt={`Nakladnoy ${intakeCode(active)}`} className="max-h-40 rounded border" />
                  </a>
                  {canEdit && (
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDelImgId(active.id)}>
                      <Trash2 className="h-4 w-4 mr-1" /> Rasmni o'chirish
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input type="file" accept="image/*" onChange={(e) => setActFile(e.target.files?.[0] ?? null)} />
                  <Button variant="outline" disabled={!actFile || actBusy} onClick={uploadActiveImage}>Rasm yuklash</Button>
                </div>
              )}
            </div>

            <Button
              className="w-full"
              disabled={!active.image_url || activeItems.length === 0 || actBusy}
              onClick={closeActive}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" /> Nakladnoyni yopish
            </Button>
            {!active.image_url && (
              <p className="text-xs text-muted-foreground text-center">Rasm yuklanmaguncha Nakladnoy yopilmaydi.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="mt-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Nakladnoylar ro'yxati</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nakladnoy</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Mahsulot</TableHead>
                    <TableHead className="text-right">Jami summa</TableHead>
                    <TableHead>Boshlangan</TableHead>
                    <TableHead>Tugagan</TableHead>
                    <TableHead>Davomiyligi</TableHead>
                    <TableHead>Kim kiritgan</TableHead>
                    <TableHead>Yetkazib beruvchi</TableHead>
                    <TableHead>Rasm</TableHead>
                    {canEdit && <TableHead className="text-right">Amallar</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && <TableRow><TableCell colSpan={canEdit ? 11 : 10} className="text-center py-8 text-muted-foreground">Yuklanmoqda...</TableCell></TableRow>}
                  {!loading && rows.length === 0 && <TableRow><TableCell colSpan={canEdit ? 11 : 10} className="text-center py-8 text-muted-foreground">Nakladnoy yo'q</TableCell></TableRow>}
                  {rows.map((s) => {
                    const list = itemsBySession[s.id] ?? [];
                    const meta = INTAKE_STATUS_META[s.status];
                    return (
                      <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenId(s.id)}>
                        <TableCell className="font-mono font-semibold whitespace-nowrap">{intakeCode(s)}</TableCell>
                        <TableCell><Badge variant="outline" className={meta.cls}>{meta.label}</Badge></TableCell>
                        <TableCell className="text-right">{list.length}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(itemsTotal(list))}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{fmtDateTime24(s.started_at)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{s.finished_at ? fmtDateTime24(s.finished_at) : "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{intakeDuration(s)}</TableCell>
                        <TableCell className="text-sm">{s.created_by_name ?? "—"}</TableCell>
                        <TableCell className="text-sm">{s.supplier ?? "—"}</TableCell>
                        <TableCell>{s.image_url ? <ImageIcon className="h-4 w-4 text-status-green" /> : <Clock className="h-4 w-4 text-muted-foreground" />}</TableCell>
                        {canEdit && (
                          <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" title="O'chirish" className="text-destructive" onClick={() => setDelId(s.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!openId} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent className="max-w-3xl p-0 gap-0">
          {current && (
            <>
              <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">Nakladnoy {intakeCode(current)}</span>
                  <Badge variant="outline" className={INTAKE_STATUS_META[current.status].cls}>{INTAKE_STATUS_META[current.status].label}</Badge>
                </DialogTitle>
                <DialogDescription>
                  Kim kiritgan: {current.created_by_name ?? "—"}
                  {current.supplier ? ` · Olib keldi: ${current.supplier}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="px-6 py-4 overflow-y-auto space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded border p-2"><div className="text-muted-foreground text-xs">Boshlangan</div><div className="font-medium">{fmtDateTime24(current.started_at)}</div></div>
                  <div className="rounded border p-2"><div className="text-muted-foreground text-xs">Tugagan</div><div className="font-medium">{current.finished_at ? fmtDateTime24(current.finished_at) : "—"}</div></div>
                  <div className="rounded border p-2"><div className="text-muted-foreground text-xs">Davomiyligi</div><div className="font-medium">{intakeDuration(current)}</div></div>
                </div>

                <div className="rounded border overflow-hidden">
                  <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>№</TableHead>
                          <TableHead>Mahsulot</TableHead>
                          <TableHead className="text-right">Miqdor</TableHead>
                          <TableHead className="text-right">1 birlik narxi</TableHead>
                          <TableHead>Valyuta</TableHead>
                          <TableHead className="text-right">Jami</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentItems.map((i, idx) => (
                          <TableRow key={i.id}>
                            <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="font-medium">{i.product_name}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(Number(i.quantity))} {i.unit}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(Number(i.unit_price))}</TableCell>
                            <TableCell>{i.currency}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">{fmt(Number(i.quantity) * Number(i.unit_price))}</TableCell>
                          </TableRow>
                        ))}
                        {currentItems.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Mahsulot yo'q</TableCell></TableRow>}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-between px-4 py-2 bg-muted/40 text-sm">
                    <span className="text-muted-foreground">Jami summa</span>
                    <span className="font-mono font-bold">{fmt(itemsTotal(currentItems))}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Nakladnoy rasmi</Label>
                  {current.image_url ? (
                    <div className="flex items-start gap-2">
                      <a href={current.image_url} target="_blank" rel="noreferrer">
                        <img src={current.image_url} alt={`Nakladnoy ${intakeCode(current)}`} className="max-h-48 rounded border" />
                      </a>
                      {canEdit && (
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDelImgId(current.id)}>
                          <Trash2 className="h-4 w-4 mr-1" /> Rasmni o'chirish
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Rasm yo'q</p>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t bg-background shrink-0 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-status-green text-sm"><CheckCircle2 className="h-4 w-4" /> Skladga kirim qilingan</div>
                {canEdit && (
                  <Button variant="destructive" size="sm" onClick={() => setDelId(current.id)}>
                    <Trash2 className="h-4 w-4 mr-1" /> O'chirish
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Nakladnoyni o'chirishni tasdiqlash */}
      <AlertDialog open={!!delId} onOpenChange={(o) => { if (!o) setDelId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nakladnoy o'chirilsinmi?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu Nakladnoy va uning barcha mahsulotlari o'chiriladi. Skladga tushgan miqdorlar qoldiqdan qaytariladi. Amalni qaytarib bo'lmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSession} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">O'chirish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rasmni o'chirishni tasdiqlash */}
      <AlertDialog open={!!delImgId} onOpenChange={(o) => { if (!o) setDelImgId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nakladnoy rasmi o'chirilsinmi?</AlertDialogTitle>
            <AlertDialogDescription>
              Faqat rasm o'chiriladi. Nakladnoyning mahsulotlari, summalari va tarixi saqlanib qoladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={removeImage} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">O'chirish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
