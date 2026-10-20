import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtSpace } from "@/components/kassa/KassaOverview";

interface Item { id?: string; item_name: string; quantity: number; unit_price: number; currency: string; sort_order: number }

/** Qarz tarkibidagi mahsulotlar — faqat qarz yozuviga ta'sir qiladi (Sklad va Kassa balansiga emas). */
export default function DebtItemsDialog({ debt, canManage, onClose, onSaved }: { debt: any; canManage: boolean; onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!debt) return;
    setRemoved([]);
    (supabase.from as any)("debt_items").select("*").eq("debt_id", debt.id).order("sort_order").then(({ data }: any) =>
      setItems((data ?? []).map((r: any) => ({ ...r, quantity: Number(r.quantity), unit_price: Number(r.unit_price) }))));
  }, [debt]);

  const upd = (i: number, p: Partial<Item>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const tot = (c: string) => items.filter((x) => x.currency === c).reduce((s, x) => s + (Number(x.quantity) || 0) * (Number(x.unit_price) || 0), 0);

  const save = async () => {
    if (items.some((x) => !x.item_name.trim())) { toast.error("Mahsulot nomini kiriting"); return; }
    setSaving(true);
    try {
      if (removed.length) { const { error } = await (supabase.from as any)("debt_items").delete().in("id", removed); if (error) throw error; }
      for (const [i, x] of items.entries()) {
        const row = { debt_id: debt.id, item_name: x.item_name.trim(), quantity: Number(x.quantity) || 0, unit_price: Number(x.unit_price) || 0, currency: x.currency, sort_order: i + 1 };
        const { error } = x.id
          ? await (supabase.from as any)("debt_items").update(row).eq("id", x.id)
          : await (supabase.from as any)("debt_items").insert(row);
        if (error) throw error;
      }
      toast.success("Saqlandi");
      onSaved();
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!debt} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Qarz tarkibi — {debt?.counterparty || "Kreditor ko'rsatilmagan"}</DialogTitle></DialogHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>Mahsulot</TableHead><TableHead className="text-right">Miqdor</TableHead>
              <TableHead className="text-right">Narx</TableHead><TableHead>Valyuta</TableHead><TableHead className="text-right">Summa</TableHead>{canManage && <TableHead />}
            </TableRow></TableHeader>
            <TableBody>
              {items.map((x, i) => (
                <TableRow key={x.id ?? `n${i}`}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell>{canManage ? <Input value={x.item_name} onChange={(e) => upd(i, { item_name: e.target.value })} className="min-w-[180px]" /> : x.item_name}</TableCell>
                  <TableCell className="text-right">{canManage ? <Input type="number" min={0} value={x.quantity} onChange={(e) => upd(i, { quantity: Number(e.target.value) })} className="w-24 text-right" /> : fmtSpace(x.quantity)}</TableCell>
                  <TableCell className="text-right">{canManage ? <Input type="number" min={0} value={x.unit_price} onChange={(e) => upd(i, { unit_price: Number(e.target.value) })} className="w-28 text-right" /> : fmtSpace(x.unit_price)}</TableCell>
                  <TableCell>{canManage ? (
                    <Select value={x.currency} onValueChange={(v) => upd(i, { currency: v })}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="UZS">UZS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                    </Select>) : x.currency}</TableCell>
                  <TableCell className="text-right font-mono whitespace-nowrap">{fmtSpace((Number(x.quantity) || 0) * (Number(x.unit_price) || 0))} {x.currency}</TableCell>
                  {canManage && <TableCell><Button size="sm" variant="ghost" onClick={() => { if (x.id) setRemoved([...removed, x.id]); setItems(items.filter((_, j) => j !== i)); }}><Trash2 className="h-3 w-3 text-destructive" /></Button></TableCell>}
                </TableRow>
              ))}
              {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Mahsulotlar yo'q</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-semibold">Jami: {fmtSpace(tot("UZS"))} UZS · {fmtSpace(tot("USD"))} USD <span className="text-muted-foreground font-normal">({items.length} ta qator)</span></div>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setItems([...items, { item_name: "", quantity: 1, unit_price: 0, currency: "UZS", sort_order: items.length + 1 }])}><Plus className="h-4 w-4 mr-1" />Qator qo'shish</Button>
              <Button onClick={save} disabled={saving}>Saqlash</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
