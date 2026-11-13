import { useWarehouseText, useWarehouseError } from "@/i18n/warehouseContext";
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/SearchableSelect';
import CatalogScanner from '@/components/warehouse/CatalogScanner';
import BarcodeScanField from '@/components/warehouse/BarcodeScanField';
import { productSearchText, productTypeKey } from '@/lib/productSearch';
import { canEnterMxik, canReconcile, validateReconciliation } from '@/lib/warehouseReconciliation';
import { finalizeScan } from '@/lib/scanHistory';
import BarcodeChip from '@/components/warehouse/BarcodeChip';
import { validManualBarcode } from '@/lib/manualBarcode';
import { fmtNum } from '@/lib/format';
import { ClipboardCheck, FilePenLine } from 'lucide-react';
import { toast } from 'sonner';
import SupplierExpenseFields from '@/components/supply/SupplierExpenseFields';
import { expenseTotals, freshExpense, validExpense, type ExpenseDraft } from '@/lib/supplierExpenses';
import { fmtMoney, fmtDateTime24 } from '@/lib/format';
import { Plus, Trash2 } from 'lucide-react';

type Product = { id: string; name: string; unit: string; stock_qty: number; mxik_code: string | null; currency: string; product_type_id?: string | null; barcode?: string | null; old_names?: string[] };
export default function WarehouseQuickActions({ products, onUpdated }: { products: Product[]; onUpdated: () => void | Promise<void> }) {
  const wt = useWarehouseText();
  const we = useWarehouseError();
  const { roles } = useAuth();
  const [mode, setMode] = useState<'sverka' | 'mxik' | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('dona');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [comment, setComment] = useState('');
  const [tech, setTech] = useState<Record<string, string>>({});
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [savedProduct, setSavedProduct] = useState<Product | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanId, setScanId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<ExpenseDraft[]>([]);
  const totals = expenseTotals(expenses);
  const lock = useRef(false);
  const request = useRef<{ key: string; payload: string } | null>(null);
  const selected = products.find(p => p.id === id);
  const options = [...new Map(products.map(p => [productTypeKey(p), p])).values()].map(p => ({ value: p.id, label: `${p.name} · ${wt(p.unit)}`, hint: ("" + wt("Qoldiq:") + " " + (fmtNum(p.stock_qty)) + ""), searchText: productSearchText(p) }));
  const open = (next: 'sverka' | 'mxik') => {
    setId(''); setIsNew(false); setName(''); setUnit('dona'); setQty(''); setPrice(''); setCurrency('UZS'); setComment(''); setTech({}); setCode(''); setBarcode(''); setSavedProduct(null); setConfirm(false); setExpenses([]); request.current = null; setScanId(null); setMode(next);
  };
  const prepare = () => {
    if (mode === 'mxik') {
      if (!selected || !code.trim()) { toast.error(we(wt("Mahsulot va MXIK kodini kiriting"))); return; }
    } else {
      if (isNew && !validManualBarcode(barcode, true)) { toast.error(we(wt("To‘g‘ri shtrix-kod kiriting"))); return; }
      if ((isNew && (!name.trim() || !unit.trim())) || (!isNew && !selected) || !validateReconciliation(Number(qty), price === '' ? null : Number(price), isNew)) { toast.error(we(isNew ? wt("Mahsulot, musbat boshlang‘ich qoldiq va to‘g‘ri narxni kiriting") : wt("Mahsulot va yangi yakuniy qoldiqni (0 yoki undan katta) kiriting"))); return; }
      if (Object.entries(tech).some(([k,v]) => k !== 'metal_type' && v !== '' && (!Number.isFinite(Number(v)) || Number(v) <= 0))) { toast.error(we(wt("Texnik o‘lchamlar musbat bo‘lishi kerak"))); return; }
      if (expenses.some(e => !validExpense(e))) { toast.error(we(wt("Ta’minotchi xarajatlarining barcha maydonlarini to‘g‘ri kiriting"))); return; }
    }
    setConfirm(true);
  };
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      if (mode === 'mxik' && selected) {
        const { error } = await supabase.rpc('set_product_mxik', { _product_id: selected.id, _code: code, _expected_code: selected.mxik_code });
        if (error) throw error;
        toast.success(wt("MXIK saqlandi"));
      } else if (mode === 'sverka') {
        const args = { _product_id: isNew ? null : id, _name: isNew ? name.trim() : null, _unit: isNew ? unit : null, _quantity: Number(qty), _price: price === '' ? null : Number(price), _currency: currency, _technical: tech, _comment: comment || null, _barcode: isNew ? barcode.trim() || null : null, _expenses: expenses.map(e => ({ ...e })) };
        const payload = JSON.stringify(args);
        if (!request.current || request.current.payload !== payload) request.current = { key: crypto.randomUUID(), payload };
        const { data, error } = await supabase.rpc('warehouse_reconcile_expenses', { ...args, _key: request.current.key });
        if (error) throw error;
        const result = data as { product_id: string; before: number; after: number; barcode?: string | null };
        if (scanId) await finalizeScan(scanId, 'in', Number(qty), Number(result.after));
        toast.success(("" + wt("Sverka saqlandi:") + " " + (fmtNum(result.before)) + " → " + (fmtNum(result.after)) + "" + (result.barcode ? ` · ${wt("Shtrix-kod:")} ${result.barcode}` : '') + ""));
        setSavedProduct({ id: result.product_id, name: isNew ? name : selected?.name ?? '', unit: isNew ? unit : selected?.unit ?? 'dona', stock_qty: result.after, barcode: result.barcode, currency, mxik_code: null });
      } else return;
      setConfirm(false); setMode(null); await onUpdated();
    } catch (error) { toast.error(we((error as { message?: string }).message || wt("Saqlashda xatolik"))); }
    finally { lock.current = false; setBusy(false); }
  };
  return <>
    {canReconcile(roles) && <Button variant="outline" className="min-h-11" onClick={() => open('sverka')}><ClipboardCheck className="mr-2 h-4 w-4" />{wt("Nakladnoysiz kirim (Sverka)")}</Button>}
    {canEnterMxik(roles) && <Button variant="outline" className="min-h-11" onClick={() => open('mxik')}><FilePenLine className="mr-2 h-4 w-4" />{wt("MXIK kiritish")}</Button>}
    <Dialog open={mode !== null} onOpenChange={v => { if (!v && !busy) setMode(null); }}><DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{mode === 'mxik' ? wt("MXIK kiritish") : wt("Nakladnoysiz kirim (Sverka)")}</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); prepare(); }}>
        {mode === 'sverka' && <div className="flex gap-2"><Button type="button" variant={!isNew ? 'secondary' : 'outline'} onClick={() => setIsNew(false)}>{wt("Mavjud mahsulot")}</Button><Button type="button" variant={isNew ? 'secondary' : 'outline'} onClick={() => setIsNew(true)}>{wt("Yangi mahsulot")}</Button></div>}
        {!isNew ? <div className="space-y-2">{mode === 'sverka' && <CatalogScanner products={products} module="Sverka" action="in" onSelect={(p, sid) => { setScanId(sid ?? null); setId(p.id); setCode(p.mxik_code ?? ''); }} />}<Label>{wt("Mahsulot")}</Label><SearchableSelect options={options} value={id} onChange={v => { setId(v); setCode(products.find(p => p.id === v)?.mxik_code ?? ''); }} searchPlaceholder={wt("Mahsulot qidirish...")} />{selected && <p className="text-sm text-muted-foreground">{selected.name} · {wt(selected.unit)}{wt(" · Остаток:")}{fmtNum(selected.stock_qty)}</p>}{selected && <BarcodeChip product={selected} />}</div> : <>
          <div className="space-y-2"><Label htmlFor="sverka-name">{wt("Mahsulot nomi va texnik xususiyatlari")}</Label><Input id="sverka-name" required value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="sverka-unit">{wt("O‘lchov birligi")}</Label><Input id="sverka-unit" required value={wt(unit)} onChange={e => setUnit(e.target.value === wt("dona") ? "dona" : e.target.value === wt("kg") ? "kg" : e.target.value === wt("tonna") ? "tonna" : e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="sverka-barcode">{wt("Shtrix-kod (ixtiyoriy)")}</Label><BarcodeScanField id="sverka-barcode" value={barcode} onChange={setBarcode} /></div>
          <div className="grid grid-cols-2 gap-3">{[['metal_type',wt("Metall turi")],['thickness_mm',wt("Qalinlik (mm)")],['width_mm',wt("Eni (mm)")],['length_mm',wt("Uzunlik (mm)")],['weight_kg',wt("Bir dona og‘irligi (kg)")]].map(([k,label]) => <div key={k} className="space-y-2"><Label htmlFor={`sverka-${k}`}>{label}{" "}{wt("(ixtiyoriy)")}</Label><Input id={`sverka-${k}`} type={k === 'metal_type' ? 'text' : 'number'} min="0" step="any" value={tech[k] ?? ''} onChange={e => setTech(prev => ({ ...prev, [k]: e.target.value }))} /></div>)}</div>
        </>}
        {mode === 'mxik' ? <><p className="text-sm">{wt("Hozirgi MXIK:")}{selected?.mxik_code ?? '—'}</p><div className="space-y-2"><Label htmlFor="manual-mxik">{wt("MXIK kodi")}</Label><Input id="manual-mxik" type="text" required value={code} onChange={e => setCode(e.target.value)} /></div></> : <>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="sverka-quantity">{isNew ? wt("Boshlang‘ich qoldiq") : wt("Yangi qoldiq (yakuniy)")}{selected ? ` (${wt(selected.unit)})` : ''}</Label><Input id="sverka-quantity" required type="number" min={isNew ? '0.000001' : '0'} step="any" value={qty} onChange={e => setQty(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="sverka-price">{wt("Birlik narxi (ixtiyoriy)")}</Label><Input id="sverka-price" type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)} /></div></div>
          <div className="space-y-2"><Label>{wt("Valyuta")}</Label><Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="UZS">UZS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="sverka-comment">{wt("Izoh (ixtiyoriy)")}</Label><Input id="sverka-comment" value={comment} onChange={e => setComment(e.target.value)} /></div>
          <section className="border-t pt-4 space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{wt("Ta’minotchi xarajatlari (ixtiyoriy)")}</h3><Button type="button" variant="outline" size="sm" onClick={() => setExpenses(prev => [...prev, freshExpense()])}><Plus className="mr-1 h-4 w-4" />{wt("Xarajat qo‘shish")}</Button></div>
            {expenses.map((e, i) => <div key={i} className="space-y-2 border-b pb-4"><div className="flex justify-between items-center"><span className="text-sm font-medium">{wt("Xarajat")}{i + 1}</span><Button type="button" variant="ghost" size="icon" title={wt("Xarajatni olib tashlash")} aria-label={("" + wt("Xarajat") + " " + (i + 1) + wt(" ni olib tashlash"))} onClick={() => setExpenses(prev => prev.filter((_, n) => n !== i))}><Trash2 className="h-4 w-4" /></Button></div><SupplierExpenseFields value={e} onChange={v => setExpenses(prev => prev.map((r, n) => n === i ? v : r))} /></div>)}
            {!!expenses.length && <p className="font-semibold">{wt("Jami xarajat:")}{fmtMoney(totals.UZS, 'UZS')} · {fmtMoney(totals.USD, 'USD')}</p>}
          </section>
        </>}
        <Button type="submit" disabled={busy} className="w-full">{wt("Tasdiqlash")}</Button>
      </form>
    </DialogContent></Dialog>
    <Dialog open={confirm} onOpenChange={v => { if (!busy) setConfirm(v); }}><DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{wt("Saqlashni tasdiqlang")}</DialogTitle></DialogHeader><p className="font-medium">{isNew ? name : selected?.name}</p>{mode === 'mxik' ? <><p>{wt("Eski MXIK:")}{selected?.mxik_code ?? '—'}</p><p className="break-all">{wt("Yangi MXIK:")}{code}</p></> : <><p>{isNew ? wt("Boshlang‘ich qoldiq") : wt("Yangi yakuniy qoldiq")}: {qty} {isNew ? unit : selected?.unit}</p><p>{wt("Qoldiq:")}{fmtNum(isNew ? 0 : selected?.stock_qty ?? 0)} → {fmtNum(Number(qty))}</p><p>{wt("Tovar summasi:")}{price === '' ? '—' : fmtMoney(Math.abs(Number(qty) - (isNew ? 0 : selected?.stock_qty ?? 0)) * Number(price), currency)}</p><h3 className="font-semibold border-t pt-3">{wt("Ta’minotchi xarajatlari")}</h3>{expenses.map((e, i) => <p key={i} className="text-sm">{e.category} · {fmtMoney(e.amount, e.currency)} · {e.account === 'supply2' ? wt("Ta’minot 2") : wt("Ta’minot")} · {fmtDateTime24(e.spent_at)}{e.comment ? ` · ${e.comment}` : ''}</p>)}<p className="font-semibold">{wt("Jami xarajat:")}{fmtMoney(totals.UZS, 'UZS')} · {fmtMoney(totals.USD, 'USD')}</p></>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>{wt("Orqaga")}</Button><Button disabled={busy} onClick={save}>{busy ? wt("Saqlanmoqda...") : wt("Saqlash")}</Button></div></DialogContent></Dialog>
    <Dialog open={savedProduct !== null} onOpenChange={v => { if (!v) setSavedProduct(null); }}><DialogContent><DialogHeader><DialogTitle>{wt("Sverka saqlandi")}</DialogTitle></DialogHeader><p>{savedProduct?.name}</p><BarcodeChip product={savedProduct} /><Button onClick={() => setSavedProduct(null)}>{wt("Yopish")}</Button></DialogContent></Dialog>
  </>;
}