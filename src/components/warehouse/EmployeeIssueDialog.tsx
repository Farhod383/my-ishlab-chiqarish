import { useWarehouseText, useWarehouseError } from "@/i18n/warehouseContext";
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Minus, Check } from 'lucide-react';
import SearchableSelect from '@/components/SearchableSelect';
import NumberInput from '@/components/NumberInput';
import IssueScanner from './IssueScanner';
import { useEmployees } from '@/hooks/useEmployees';
import { useLocalize } from '@/i18n/context';
import { issueTotals, newIssueLine, type IssueLine } from '@/lib/stockIssue';
import { productSearchText, productTypeKey } from '@/lib/productSearch';
import { ensureOnline } from '@/components/OnlineGuard';
import { toast } from 'sonner';

type Product = { id: string; name: string; unit: string; stock_qty: number; product_type_id?: string | null };
export default function EmployeeIssueDialog({ open, onOpenChange, products, orders, mode, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; products: Product[];
  orders: { id: string; order_number: string; product_name: string }[]; mode: 'order' | 'other'; onSaved: () => void;
}) {
  const wt = useWarehouseText();
  const we = useWarehouseError();
  const { employees } = useEmployees({ activeOnly: true });
  const localize = useLocalize();
  const [employee, setEmployee] = useState('');
  const [lines, setLines] = useState<IssueLine[]>([newIssueLine()]);
  const [activeKey, setActiveKey] = useState(lines[0]?.key ?? '');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const key = useRef(crypto.randomUUID());
  const lockedPayload = useRef<string | null>(null);
  const patch = (id: string, changes: Partial<IssueLine>) => { setConfirm(false); setLines(prev => prev.map(row => row.key === id ? { ...row, ...changes } : row)); };
  const unique = new Map<string, Product>();
  products.forEach(p => { const k = productTypeKey(p); const old = unique.get(k); if (!old || Number(p.stock_qty) > Number(old.stock_qty)) unique.set(k, p); });
  const options = [...unique.values()].map(p => ({ value: p.id, label: p.name, hint: `${p.stock_qty} ${p.unit}`, searchText: productSearchText(p) }));
  const review = async () => {
    try {
      if (!employee) throw new Error(wt("Xodimni tanlang"));
      const totals = issueTotals(lines);
      for (const [id, qty] of totals) { const p = products.find(p => p.id === id); if (!p || Number(p.stock_qty) < qty) throw new Error(("" + wt("Yetarli qoldiq mavjud emas:") + " " + (p?.name ?? '') + "")); }
      const next = [...lines];
      for (let i = 0; i < next.length; i++) {
        const row = next[i];
        if (!row.order_id) continue;
        const { data, error } = await supabase.from('stock_movements').select('source_order_id').eq('product_id', row.product_id).eq('direction', 'in').not('source_order_id', 'is', null).order('created_at', { ascending: false }).limit(1);
        if (error) throw error;
        if (data?.[0]?.source_order_id && data[0].source_order_id !== row.order_id && row.cross_order_reason === '') {
          next[i] = { ...row, cross_order_reason: ' ' };
        }
      }
      setLines(next);
      setConfirm(true);
    } catch (e) { toast.error(we((e as { message: string }).message)); }
  };
  const save = async () => {
    if (saving.current || !ensureOnline(m => toast.error(we(m)))) return;
    const payload = lines.map(({ key: _key, ...row }) => row);
    const fingerprint = JSON.stringify({ employee, payload });
    if (lockedPayload.current && lockedPayload.current !== fingerprint) key.current = crypto.randomUUID();
    lockedPayload.current = fingerprint; saving.current = true; setBusy(true);
    try {
      const { error } = await supabase.rpc('issue_employee_products', { _key: key.current, _employee_id: employee, _items: payload });
      if (error) throw error;
      toast.success(("" + wt("Topshirish saqlandi —") + " " + (lines.length) + wt(" mahsulot qatori")));
      const row = newIssueLine(); setLines([row]); setActiveKey(row.key); setEmployee(''); setConfirm(false); key.current = crypto.randomUUID(); lockedPayload.current = null;
      onOpenChange(false); onSaved();
    } catch (e) { toast.error(we((e as { message: string }).message)); }
    finally { saving.current = false; setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={o => { if (!busy) { setConfirm(false); onOpenChange(o); } }}>
    <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto" onInteractOutside={e => { if (busy) e.preventDefault(); }}>
      <DialogHeader><DialogTitle>{confirm ? wt("Topshirishni tasdiqlash") : mode === 'order' ? wt("Zakazga mahsulot berish") : wt("Xodimga mahsulot berish")}</DialogTitle></DialogHeader>
      {confirm ? <>
        <p className="font-semibold">{localize(employees.find(e => e.id === employee)?.full_name ?? '')}</p>
        <div className="divide-y border rounded-md">{lines.map((row, i) => { const p = products.find(p => p.id === row.product_id); return <div key={row.key} className="p-3 space-y-1"><div className="flex justify-between gap-3"><span className="min-w-0 break-words">{i + 1}. {p?.name}</span><strong className="shrink-0">{row.quantity} {wt(p?.unit)}</strong></div>{row.order_id && <p className="text-sm text-muted-foreground">{orders.find(o => o.id === row.order_id)?.order_number}</p>}{row.comment && <p className="text-sm break-words">{row.comment}</p>}{row.cross_order_reason.trim() && <p className="text-sm break-words">{row.cross_order_reason}</p>}</div>; })}</div>
        <div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>{wt("Orqaga")}</Button><Button className="flex-1" disabled={busy} onClick={() => void save()}><Check className="h-4 w-4 mr-2" />{busy ? wt("Saqlanmoqda…") : wt("Tasdiqlash va berish")}</Button></div>
      </> : <div className="space-y-4">
        <div><Label>{wt("Xodim")}</Label><SearchableSelect value={employee} onChange={setEmployee} placeholder={wt("Xodimni tanlang")} options={employees.map(e => ({ value: e.id, label: localize(e.full_name), hint: [e.position, e.department].filter(Boolean).join(' · ') }))} /></div>
        <IssueScanner kind="product" onEmployee={setEmployee} onProduct={(p, scanId) => { patch(activeKey, { product_id: p.id, scan_id: scanId }); }} />
        {employee && lines.map((row, i) => { const p = products.find(p => p.id === row.product_id); return <section key={row.key} className="border-b pb-4 space-y-3" onFocusCapture={() => setActiveKey(row.key)}>
          <div className="flex items-center justify-between"><Label>{wt("Mahsulot")}{i + 1}</Label><div className="flex gap-1"><Button type="button" size="icon" variant="outline" title={wt("Mahsulot qo‘shish")} aria-label={wt("Mahsulot qo‘shish")} onClick={() => { const added = newIssueLine(); setLines(prev => [...prev, added]); setActiveKey(added.key); }}><Plus className="h-4 w-4" /></Button><Button type="button" size="icon" variant="outline" title={wt("Qatorni olib tashlash")} aria-label={("" + wt("Qator") + " " + (i + 1) + wt(" ni olib tashlash"))} disabled={lines.length === 1} onClick={() => { const rest = lines.filter(r => r.key !== row.key); setLines(rest); if (activeKey === row.key) setActiveKey(rest[0]?.key ?? ''); }}><Minus className="h-4 w-4" /></Button></div></div>
          <SearchableSelect value={row.product_id} onChange={id => patch(row.key, { product_id: id, scan_id: null, cross_order_reason: '' })} options={options} placeholder={wt("Mahsulotni tanlang")} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>{wt("Miqdor")}{p ? `(${p.unit})` : ''}</Label><NumberInput aria-label={("" + wt("Miqdor") + " " + (i + 1) + "")} min={0.001} step="any" value={row.quantity} onChange={e => patch(row.key, { quantity: Number(e.target.value) })} /></div>{mode === 'order' && <div><Label>{wt("Zakaz (ixtiyoriy)")}</Label><SearchableSelect value={row.order_id} onChange={id => patch(row.key, { order_id: id, cross_order_reason: '' })} placeholder={wt("Zakaz (ixtiyoriy)")} options={orders.map(o => ({ value: o.id, label: o.order_number, hint: o.product_name }))} /></div>}</div>
          <div><Label>{wt("Izoh / sabab (ixtiyoriy)")}</Label><Textarea value={row.comment} onChange={e => patch(row.key, { comment: e.target.value })} /></div>
          {row.cross_order_reason !== '' && <div><Label>{wt("Boshqa zakazga berish sababi (ixtiyoriy)")}</Label><Textarea value={row.cross_order_reason} onChange={e => patch(row.key, { cross_order_reason: e.target.value })} /></div>}
        </section>; })}
        <Button className="w-full" disabled={!employee} onClick={() => void review()}>{wt("Ro‘yxatni tasdiqlash")}</Button>
      </div>}
    </DialogContent>
  </Dialog>;
}