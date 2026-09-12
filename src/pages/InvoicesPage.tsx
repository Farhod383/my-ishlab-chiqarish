import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Image as ImageIcon, CheckCircle2, Clock, Search } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/format";
import { fmtDateTime24 } from "@/lib/format";
import {
  INTAKE_STATUS_META, finalizeSession, intakeCode, intakeDuration, itemsTotal,
  type IntakeItem, type IntakeSession, type IntakeStatus,
} from "@/lib/intake";

const fmt = (n: number) => fmtNum(n);

export default function InvoicesPage() {
  const { user } = useAuth() as any;
  const [sessions, setSessions] = useState<IntakeSession[]>([]);
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | IntakeStatus>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: it }] = await Promise.all([
      supabase.from("intake_sessions").select("*").order("started_at", { ascending: false }).limit(300),
      supabase.from("intake_items").select("*").order("created_at", { ascending: true }),
    ]);
    setSessions((s as any) ?? []);
    setItems((it as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const itemsBySession = useMemo(() => {
    const m: Record<string, IntakeItem[]> = {};
    items.forEach((i) => { (m[i.session_id] ||= []).push(i); });
    return m;
  }, [items]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return sessions.filter((s) => {
      if (tab !== "all" && s.status !== tab) return false;
      if (!term) return true;
      const list = itemsBySession[s.id] ?? [];
      return (
        intakeCode(s).toLowerCase().includes(term) ||
        (s.created_by_name ?? "").toLowerCase().includes(term) ||
        (s.supplier ?? "").toLowerCase().includes(term) ||
        list.some((i) => i.product_name.toLowerCase().includes(term))
      );
    });
  }, [sessions, tab, q, itemsBySession]);

  const current = sessions.find((s) => s.id === openId) ?? null;
  const currentItems = openId ? (itemsBySession[openId] ?? []) : [];

  const uploadImage = async () => {
    if (!current || !imgFile) return;
    setBusy(true);
    try {
      const ext = imgFile.name.split(".").pop();
      const path = `nakladnoy/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("product-images").upload(path, imgFile);
      if (up.error) throw up.error;
      const url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from("intake_sessions").update({ image_url: url } as any).eq("id", current.id);
      if (error) throw error;
      setImgFile(null);
      toast.success("Nakladnoy rasmi yuklandi");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Rasm yuklashda xatolik");
    } finally { setBusy(false); }
  };

  const doFinalize = async () => {
    if (!current) return;
    if (!current.image_url) { toast.error("Avval nakladnoy rasmini yuklang"); return; }
    setBusy(true);
    try {
      await finalizeSession(current.id);
      toast.success("Nakladnoy yakunlandi — mahsulotlar skladga kirim qilindi");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Yakunlashda xatolik");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Nakladnoy</h1>
          <p className="text-sm text-muted-foreground">Kirim sessiyalari — rasm yuklanib yakunlangandan keyin skladga kirim bo'ladi</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Nakladnoy, mahsulot, xodim..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">Barchasi ({sessions.length})</TabsTrigger>
          <TabsTrigger value="open">Kirim davom etmoqda ({sessions.filter(s => s.status === "open").length})</TabsTrigger>
          <TabsTrigger value="pending_photo">Rasm kutilmoqda ({sessions.filter(s => s.status === "pending_photo").length})</TabsTrigger>
          <TabsTrigger value="finalized">Yakunlangan ({sessions.filter(s => s.status === "finalized").length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Yuklanmoqda...</TableCell></TableRow>}
                    {!loading && rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nakladnoy yo'q</TableCell></TableRow>}
                    {rows.map((s) => {
                      const list = itemsBySession[s.id] ?? [];
                      const meta = INTAKE_STATUS_META[s.status];
                      return (
                        <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setOpenId(s.id); setImgFile(null); }}>
                          <TableCell className="font-mono font-semibold whitespace-nowrap">{intakeCode(s)}</TableCell>
                          <TableCell><Badge variant="outline" className={meta.cls}>{meta.label}</Badge></TableCell>
                          <TableCell className="text-right">{list.length}</TableCell>
                          <TableCell className="text-right font-mono">{fmt(itemsTotal(list))}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{fmtDateTime24(s.started_at)}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{s.finished_at ? fmtDateTime24(s.finished_at) : "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{intakeDuration(s)}</TableCell>
                          <TableCell className="text-sm">{s.created_by_name ?? "—"}</TableCell>
                          <TableCell>{s.image_url ? <ImageIcon className="h-4 w-4 text-status-green" /> : <Clock className="h-4 w-4 text-muted-foreground" />}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!openId} onOpenChange={(o) => { if (!o) { setOpenId(null); setImgFile(null); } }}>
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
                          <TableHead className="text-right">Narx</TableHead>
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
                  <Label>Nakladnoy rasmi {current.status !== "finalized" && <span className="text-destructive">*</span>}</Label>
                  {current.image_url ? (
                    <a href={current.image_url} target="_blank" rel="noreferrer">
                      <img src={current.image_url} alt={`Nakladnoy ${intakeCode(current)}`} className="max-h-48 rounded border" />
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">Rasm yuklanmagan — yakunlash uchun majburiy</p>
                  )}
                  {current.status !== "finalized" && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input type="file" accept="image/*" onChange={(e) => setImgFile(e.target.files?.[0] ?? null)} />
                      <Button variant="outline" disabled={!imgFile || busy} onClick={uploadImage}>Rasmni yuklash</Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t bg-background shrink-0 flex flex-col sm:flex-row gap-2 justify-end">
                {current.status === "finalized" ? (
                  <div className="flex items-center gap-2 text-status-green text-sm"><CheckCircle2 className="h-4 w-4" /> Skladga kirim qilingan</div>
                ) : (
                  <Button disabled={!current.image_url || busy || current.status === "open" || currentItems.length === 0} onClick={doFinalize}>
                    {current.status === "open" ? "Avval kirimni tugating" : "Yakunlash (skladga kirim)"}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
