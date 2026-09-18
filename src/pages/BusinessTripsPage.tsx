import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { useEmployees } from "@/hooks/useEmployees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import NumberInput from "@/components/NumberInput";
import SearchableSelect from "@/components/SearchableSelect";
import { fmtMoney, fmtDate, fmtDateTime24 } from "@/lib/format";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Plane, Paperclip, Trash2, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/types/erp";

interface Trip {
  id: string;
  employee_id: string | null;
  employee_name: string;
  assignee_user_id: string | null;
  destination: string;
  purpose: string | null;
  start_date: string;
  end_date: string | null;
  distance_km: number;
  given_amount: number;
  currency: string;
  returned_amount: number;
  status: string;
  comment: string | null;
  cash_expense_id?: string | null;
  created_at: string;
}

interface Expense {
  id: string;
  trip_id: string;
  item_name: string;
  amount: number;
  currency: string;
  comment: string | null;
  receipt_url: string | null;
  spent_at: string;
}

const CURRENCIES = ["UZS", "USD", "EUR", "RUB"];

export default function BusinessTripsPage() {
  const { user, hasRole } = useAuth();
  const canManage = hasRole(["admin", "cashier"]);
  const { employees } = useEmployees({ activeOnly: true });

  const [trips, setTrips] = useState<Trip[]>([]);
  const [expenses, setExpenses] = useState<Record<string, Expense[]>>({});
  const [profiles, setProfiles] = useState<{ id: string; full_name: string; email: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"active" | "closed" | "all">("active");

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [delTrip, setDelTrip] = useState<Trip | null>(null);
  const [deleting, setDeleting] = useState(false);

  // create form
  const [fEmployeeId, setFEmployeeId] = useState("");
  const [fUserId, setFUserId] = useState("");
  const [fDest, setFDest] = useState("");
  const [fPurpose, setFPurpose] = useState("");
  const [fStart, setFStart] = useState(new Date().toISOString().slice(0, 10));
  const [fEnd, setFEnd] = useState("");
  const [fKm, setFKm] = useState<number>(0);
  const [fAmount, setFAmount] = useState("");
  const [fCurrency, setFCurrency] = useState("UZS");
  const [fComment, setFComment] = useState("");
  const [fFromKassa, setFFromKassa] = useState(true);

  // expense form
  const [eName, setEName] = useState("");
  const [eAmount, setEAmount] = useState<number>(0);
  const [eComment, setEComment] = useState("");
  const [eFile, setEFile] = useState<File | null>(null);
  const [eSaving, setESaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: t, error } = await supabase
      .from("business_trips")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setTrips(((t as any) ?? []) as Trip[]);
    const { data: ex } = await supabase.from("business_trip_expenses").select("*").order("spent_at");
    const map: Record<string, Expense[]> = {};
    (((ex as any) ?? []) as Expense[]).forEach((x) => { (map[x.trip_id] ??= []).push(x); });
    setExpenses(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (canManage) {
      supabase.from("profiles").select("id, full_name, email").order("full_name")
        .then(({ data }) => setProfiles((data as any) ?? []));
    }
  }, [canManage]);

  const spentOf = (id: string) => (expenses[id] ?? []).reduce((s, x) => s + Number(x.amount || 0), 0);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return trips.filter((t) => {
      if (tab !== "all" && t.status !== tab) return false;
      if (!s) return true;
      return t.employee_name.toLowerCase().includes(s)
        || t.destination.toLowerCase().includes(s)
        || (t.purpose ?? "").toLowerCase().includes(s);
    });
  }, [trips, q, tab]);

  const stats = useMemo(() => {
    const active = trips.filter((t) => t.status === "active").length;
    let given = 0, spent = 0, back = 0;
    trips.forEach((t) => {
      given += Number(t.given_amount || 0);
      spent += spentOf(t.id);
      back += Number(t.returned_amount || 0);
    });
    return { total: trips.length, active, given, spent, back, rest: given - spent - back };
  }, [trips, expenses]);

  const resetForm = () => {
    setFEmployeeId(""); setFUserId(""); setFDest(""); setFPurpose("");
    setFStart(new Date().toISOString().slice(0, 10)); setFEnd("");
    setFKm(0); setFAmount(""); setFCurrency("UZS"); setFComment(""); setFFromKassa(true);
  };

  const createTrip = async () => {
    const emp = employees.find((e) => e.id === fEmployeeId);
    if (!emp) { toast.error("Xodim tanlanishi shart"); return; }
    if (!fDest.trim()) { toast.error("Manzil (qayerga) kiritilishi shart"); return; }
    const givenAmount = Number(fAmount);
    if (!Number.isFinite(givenAmount) || givenAmount < 0) { toast.error("Beriladigan summani to'g'ri kiriting"); return; }
    setSaving(true);
    let cashExpenseId: string | null = null;
    if (fFromKassa && givenAmount > 0) {
      const { data: ce, error: cErr } = await supabase.from("cash_expenses").insert({
        amount: givenAmount,
        reason: `Kamandirovka — ${fDest.trim()}`,
        recipient_id: emp.id,
        recipient_name: emp.full_name,
        currency: fCurrency,
        exchange_rate: 1,
        total_uzs: fCurrency === "UZS" ? givenAmount : 0,
        payment_type: "cash",
        comment: fPurpose.trim() || null,
        created_by: user?.id ?? null,
      } as any).select("id").single();
      if (cErr) { setSaving(false); toast.error(`Kassa: ${cErr.message}`); return; }
      cashExpenseId = (ce as any)?.id ?? null;
    }

    const { error } = await supabase.from("business_trips").insert({
      employee_id: emp.id,
      employee_name: emp.full_name,
      assignee_user_id: fUserId || null,
      destination: fDest.trim(),
      purpose: fPurpose.trim() || null,
      start_date: fStart,
      end_date: fEnd || null,
      distance_km: fKm || 0,
      given_amount: givenAmount,
      currency: fCurrency,
      comment: fComment.trim() || null,
      cash_expense_id: cashExpenseId,
      created_by: user?.id ?? null,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Kamandirovka yaratildi", entity: "business_trip",
      details: `${emp.full_name} — ${fDest.trim()}`,
    });
    toast.success("Kamandirovka yaratildi");
    setAddOpen(false); resetForm(); load();
  };

  const openEditTrip = (t: Trip) => {
    setEditId(t.id);
    setFEmployeeId(t.employee_id ?? "");
    setFUserId(t.assignee_user_id ?? "");
    setFDest(t.destination ?? "");
    setFPurpose(t.purpose ?? "");
    setFStart(t.start_date ?? new Date().toISOString().slice(0, 10));
    setFEnd(t.end_date ?? "");
    setFKm(Number(t.distance_km) || 0);
    setFAmount(String(t.given_amount ?? ""));
    setFCurrency(t.currency ?? "UZS");
    setFComment(t.comment ?? "");
    setFFromKassa(!!t.cash_expense_id);
    setAddOpen(true);
  };

  const saveTripEdit = async () => {
    const trip = trips.find((t) => t.id === editId);
    if (!trip) return;
    const emp = employees.find((e) => e.id === fEmployeeId);
    if (!emp) { toast.error("Xodim tanlanishi shart"); return; }
    if (!fDest.trim()) { toast.error("Manzil (qayerga) kiritilishi shart"); return; }
    const givenAmount = Number(fAmount);
    if (!Number.isFinite(givenAmount) || givenAmount < 0) { toast.error("Beriladigan summani to'g'ri kiriting"); return; }
    setSaving(true);

    let cashExpenseId: string | null = trip.cash_expense_id ?? null;
    const cashPayload = {
      amount: givenAmount,
      reason: `Kamandirovka — ${fDest.trim()}`,
      recipient_id: emp.id,
      recipient_name: emp.full_name,
      currency: fCurrency,
      total_uzs: fCurrency === "UZS" ? givenAmount : 0,
      comment: fPurpose.trim() || null,
    };
    if (fFromKassa && givenAmount > 0) {
      if (cashExpenseId) {
        const { error } = await supabase.from("cash_expenses").update(cashPayload as any).eq("id", cashExpenseId);
        if (error) { setSaving(false); toast.error(`Kassa: ${error.message}`); return; }
      } else {
        const { data: ce, error } = await supabase.from("cash_expenses").insert({
          ...cashPayload, exchange_rate: 1, payment_type: "cash", created_by: user?.id ?? null,
        } as any).select("id").single();
        if (error) { setSaving(false); toast.error(`Kassa: ${error.message}`); return; }
        cashExpenseId = (ce as any)?.id ?? null;
      }
    } else if (cashExpenseId) {
      const { error } = await supabase.from("cash_expenses").delete().eq("id", cashExpenseId);
      if (error) { setSaving(false); toast.error(`Kassa: ${error.message}`); return; }
      cashExpenseId = null;
    }

    const { error } = await supabase.from("business_trips").update({
      employee_id: emp.id,
      employee_name: emp.full_name,
      assignee_user_id: fUserId || null,
      destination: fDest.trim(),
      purpose: fPurpose.trim() || null,
      start_date: fStart,
      end_date: fEnd || null,
      distance_km: fKm || 0,
      given_amount: givenAmount,
      currency: fCurrency,
      comment: fComment.trim() || null,
      cash_expense_id: cashExpenseId,
    } as any).eq("id", trip.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Kamandirovka tahrirlandi", entity: "business_trip",
      details: `${emp.full_name} — ${fDest.trim()} · ${givenAmount} ${fCurrency}`,
    });
    toast.success("Saqlandi");
    setAddOpen(false); setEditId(null); resetForm(); load();
  };

  const deleteTrip = async () => {
    const trip = delTrip;
    if (!trip) return;
    setDeleting(true);
    const { error: exErr } = await supabase.from("business_trip_expenses").delete().eq("trip_id", trip.id);
    if (exErr) { setDeleting(false); toast.error(exErr.message); return; }
    if (trip.cash_expense_id) {
      const { error: cErr } = await supabase.from("cash_expenses").delete().eq("id", trip.cash_expense_id);
      if (cErr) { setDeleting(false); toast.error(`Kassa: ${cErr.message}`); return; }
    }
    const { error } = await supabase.from("business_trips").delete().eq("id", trip.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: "Kamandirovka o'chirildi", entity: "business_trip",
      details: `${trip.employee_name} — ${trip.destination} · ${trip.given_amount} ${trip.currency}`,
    });
    toast.success("Kamandirovka o'chirildi");
    setDelTrip(null);
    if (detailId === trip.id) setDetailId(null);
    load();
  };


  const detail = trips.find((t) => t.id === detailId) ?? null;
  const detailExpenses = detailId ? expenses[detailId] ?? [] : [];
  const detailSpent = detailId ? spentOf(detailId) : 0;
  const canEditDetail = !!detail && (canManage || detail.assignee_user_id === user?.id);

  const addExpense = async () => {
    if (!detail) return;
    if (!eName.trim() || eAmount <= 0) { toast.error("Nomi va summa kiritilishi shart"); return; }
    setESaving(true);
    let url: string | null = null;
    if (eFile) {
      const path = `trips/${detail.id}/${Date.now()}-${eFile.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("order-files").upload(path, eFile);
      if (upErr) { setESaving(false); toast.error(`Fayl: ${upErr.message}`); return; }
      url = supabase.storage.from("order-files").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("business_trip_expenses").insert({
      trip_id: detail.id,
      item_name: eName.trim(),
      amount: eAmount,
      currency: detail.currency,
      comment: eComment.trim() || null,
      receipt_url: url,
      created_by: user?.id ?? null,
    } as any);
    setESaving(false);
    if (error) { toast.error(error.message); return; }
    setEName(""); setEAmount(0); setEComment(""); setEFile(null);
    toast.success("Xarajat qo'shildi");
    load();
  };

  const removeExpense = async (id: string) => {
    const { error } = await supabase.from("business_trip_expenses").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const saveReturn = async (amount: number) => {
    if (!detail) return;
    const { error } = await supabase.from("business_trips").update({ returned_amount: amount } as any).eq("id", detail.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saqlandi");
    load();
  };

  const closeTrip = async () => {
    if (!detail) return;
    const { error } = await supabase.from("business_trips")
      .update({ status: detail.status === "closed" ? "active" : "closed" } as any).eq("id", detail.id);
    if (error) { toast.error(error.message); return; }
    await logAudit(supabase, {
      actor_id: user?.id, actor_name: user?.email,
      action: detail.status === "closed" ? "Kamandirovka qayta ochildi" : "Kamandirovka yakunlandi",
      entity: "business_trip", details: `${detail.employee_name} — ${detail.destination}`,
    });
    load();
  };

  const statCards = [
    { label: "Jami kamandirovka", value: String(stats.total) },
    { label: "Faol", value: String(stats.active) },
    { label: "Berilgan summa", value: fmtMoney(stats.given, "UZS") },
    { label: "Sarflangan", value: fmtMoney(stats.spent, "UZS") },
    { label: "Kassa qaytarib oldi", value: fmtMoney(stats.back, "UZS") },
    { label: "Qoldiq (qaytarilishi kerak)", value: fmtMoney(stats.rest, "UZS") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Plane className="h-6 w-6 text-primary" /> Kamandirovka</h1>
          <p className="text-sm text-muted-foreground">Xizmat safarlari va ular bo'yicha xarajatlar</p>
        </div>
        {canManage && (
          <Button onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" /> Yangi kamandirovka</Button>
        )}
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        {statCards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="mt-1 text-lg font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList>
                <TabsTrigger value="active">Faol</TabsTrigger>
                <TabsTrigger value="closed">Yakunlangan</TabsTrigger>
                <TabsTrigger value="all">Hammasi</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Xodim, manzil yoki maqsad bo'yicha qidirish..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">№</TableHead>
                  <TableHead>Xodim</TableHead>
                  <TableHead>Qayerga</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                  <TableHead className="text-right">Berilgan</TableHead>
                  <TableHead className="text-right">Sarflangan</TableHead>
                  <TableHead className="text-right">Qoldiq</TableHead>
                  <TableHead>Holat</TableHead>
                  {canManage && <TableHead className="text-right">Amallar</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={canManage ? 10 : 9} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={canManage ? 10 : 9} className="py-8 text-center text-muted-foreground">Kamandirovka topilmadi</TableCell></TableRow>
                )}
                {filtered.map((t, i) => {
                  const spent = spentOf(t.id);
                  const rest = Number(t.given_amount || 0) - spent - Number(t.returned_amount || 0);
                  return (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailId(t.id)}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">{t.employee_name}</TableCell>
                      <TableCell>{t.destination}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {fmtDate(t.start_date)}{t.end_date ? ` — ${fmtDate(t.end_date)}` : ""}
                      </TableCell>
                      <TableCell className="text-right">{t.distance_km || 0}</TableCell>
                      <TableCell className="text-right">{fmtMoney(t.given_amount, t.currency)}</TableCell>
                      <TableCell className="text-right">{fmtMoney(spent, t.currency)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtMoney(rest, t.currency)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={t.status === "closed"
                          ? "bg-muted text-muted-foreground"
                          : "bg-status-green/15 text-status-green border-status-green/30"}>
                          {t.status === "closed" ? "Yakunlangan" : "Faol"}
                        </Badge>
                       </TableCell>
                       {canManage && (
                         <TableCell className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                           <Button variant="ghost" size="icon" onClick={() => openEditTrip(t)}><Pencil className="h-4 w-4" /></Button>
                           <Button variant="ghost" size="icon" onClick={() => setDelTrip(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

      {/* Yangi kamandirovka */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setEditId(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Kamandirovkani tahrirlash" : "Yangi kamandirovka"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Xodim *</Label>
              <SearchableSelect
                options={employees.map((e) => ({ value: e.id, label: e.full_name, hint: e.position ?? undefined }))}
                value={fEmployeeId} onChange={setFEmployeeId} placeholder="Xodimni tanlang"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Tizim foydalanuvchisi (xodim o'z safarini ko'rishi uchun)</Label>
              <SearchableSelect
                options={profiles.map((p) => ({ value: p.id, label: p.full_name || p.email || p.id, hint: p.email ?? undefined }))}
                value={fUserId} onChange={setFUserId} placeholder="Tanlanmagan" clearLabel="Tanlanmagan"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Qayerga *</Label>
              <Input value={fDest} onChange={(e) => setFDest(e.target.value)} placeholder="Masalan: Toshkent" />
            </div>
            <div className="sm:col-span-2">
              <Label>Maqsad</Label>
              <Input value={fPurpose} onChange={(e) => setFPurpose(e.target.value)} />
            </div>
            <div><Label>Boshlanish sanasi</Label><Input type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} /></div>
            <div><Label>Tugash sanasi</Label><Input type="date" value={fEnd} onChange={(e) => setFEnd(e.target.value)} /></div>
            <div><Label>Necha km</Label><NumberInput value={fKm} onChange={(e) => setFKm(Number(e.target.value))} /></div>
            <div>
              <Label>Valyuta</Label>
              <SearchableSelect options={CURRENCIES.map((c) => ({ value: c, label: c }))} value={fCurrency} onChange={setFCurrency} />
            </div>
            <div className="sm:col-span-2">
              <Label>Kassa tomonidan berilgan summa</Label>
              <NumberInput value={fAmount} min={0} onChange={(e) => setFAmount(e.target.value)} />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input id="fromKassa" type="checkbox" className="h-4 w-4" checked={fFromKassa} onChange={(e) => setFFromKassa(e.target.checked)} />
              <Label htmlFor="fromKassa" className="cursor-pointer">Summa Kassadan chiqim sifatida yozilsin</Label>
            </div>
            <div className="sm:col-span-2">
              <Label>Izoh</Label>
              <Textarea value={fComment} onChange={(e) => setFComment(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Bekor qilish</Button>
            <Button onClick={createTrip} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Saqlash</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tafsilot */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="sm:max-w-3xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.employee_name} — {detail.destination}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3 text-sm">
                  <div><div className="text-muted-foreground">Sana</div><div>{fmtDate(detail.start_date)}{detail.end_date ? ` — ${fmtDate(detail.end_date)}` : ""}</div></div>
                  <div><div className="text-muted-foreground">Masofa</div><div>{detail.distance_km || 0} km</div></div>
                  <div><div className="text-muted-foreground">Yaratilgan</div><div>{fmtDateTime24(detail.created_at)}</div></div>
                  {detail.purpose && <div className="sm:col-span-3"><div className="text-muted-foreground">Maqsad</div><div>{detail.purpose}</div></div>}
                </div>

                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                  {[
                    { l: "Berilgan summa", v: fmtMoney(detail.given_amount, detail.currency) },
                    { l: "Jami sarflangan", v: fmtMoney(detailSpent, detail.currency) },
                    { l: "Kassa qaytarib oldi", v: fmtMoney(detail.returned_amount, detail.currency) },
                    { l: "Qoldiq", v: fmtMoney(Number(detail.given_amount || 0) - detailSpent - Number(detail.returned_amount || 0), detail.currency) },
                  ].map((c) => (
                    <div key={c.l} className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">{c.l}</div>
                      <div className="mt-1 font-semibold">{c.v}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-md border max-h-[35vh] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">№</TableHead>
                        <TableHead>Nima olindi</TableHead>
                        <TableHead className="text-right">Summa</TableHead>
                        <TableHead>Izoh</TableHead>
                        <TableHead>Sana/vaqt</TableHead>
                        <TableHead>Chek</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailExpenses.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Xarajat yo'q</TableCell></TableRow>
                      )}
                      {detailExpenses.map((x, i) => (
                        <TableRow key={x.id}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell className="font-medium">{x.item_name}</TableCell>
                          <TableCell className="text-right">{fmtMoney(x.amount, x.currency)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{x.comment ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{fmtDateTime24(x.spent_at)}</TableCell>
                          <TableCell>
                            {x.receipt_url
                              ? <a href={x.receipt_url} target="_blank" rel="noreferrer" className="text-primary underline">Ko'rish</a>
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {canEditDetail && (
                              <Button variant="ghost" size="icon" onClick={() => removeExpense(x.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {canEditDetail && detail.status !== "closed" && (
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="text-sm font-semibold">Yangi xarajat</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><Label>Nima olindi</Label><Input value={eName} onChange={(e) => setEName(e.target.value)} /></div>
                      <div><Label>Qancha</Label><NumberInput value={eAmount} onChange={(e) => setEAmount(Number(e.target.value))} /></div>
                      <div className="sm:col-span-2"><Label>Izoh</Label><Input value={eComment} onChange={(e) => setEComment(e.target.value)} /></div>
                      <div className="sm:col-span-2">
                        <Label className="flex items-center gap-2"><Paperclip className="h-4 w-4" /> Chek / rasm / fayl</Label>
                        <Input type="file" accept="image/*,application/pdf" onChange={(e) => setEFile(e.target.files?.[0] ?? null)} />
                      </div>
                    </div>
                    <Button onClick={addExpense} disabled={eSaving}>
                      {eSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Xarajat qo'shish
                    </Button>
                  </div>
                )}

                {canManage && (
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="text-sm font-semibold">Kassa</div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <Label>Kassa qaytarib olgan summa</Label>
                        <NumberInput
                          defaultValue={detail.returned_amount}
                          onBlur={(e) => {
                            const v = Number((e.target as HTMLInputElement).value);
                            if (v !== Number(detail.returned_amount)) saveReturn(v);
                          }}
                        />
                      </div>
                      <Button variant={detail.status === "closed" ? "outline" : "default"} onClick={closeTrip}>
                        {detail.status === "closed" ? "Qayta ochish" : "Kamandirovkani yakunlash"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
