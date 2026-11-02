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
import { productSearchText, productTypeKey } from '@/lib/productSearch';
import { canEnterMxik, canReconcile, validateReconciliation } from '@/lib/warehouseReconciliation';
import BarcodeChip from '@/components/warehouse/BarcodeChip';
import { fmtNum } from '@/lib/format';
import { ClipboardCheck, FilePenLine } from 'lucide-react';
import { toast } from 'sonner';

type Product = { id: string; name: string; unit: string; stock_qty: number; mxik_code: string | null; currency: string; product_type_id?: string | null; barcode?: string | null; old_names?: string[] };
export default function WarehouseQuickActions({ products, onUpdated }: { products: Product[]; onUpdated: () => void | Promise<void> }) {
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
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const request = useRef<{ key: string; payload: string } | null>(null);
  const selected = products.find(p => p.id === id);
  const options = [...new Map(products.map(p => [productTypeKey(p), p])).values()].map(p => ({ value: p.id, label: `${p.name} · ${p.unit}`, hint: `Qoldiq: ${fmtNum(p.stock_qty)}`, searchText: productSearchText(p) }));
  const open = (next: 'sverka' | 'mxik') => {
    setId(''); setIsNew(false); setName(''); setUnit('dona'); setQty(''); setPrice(''); setCurrency('UZS'); setComment(''); setTech({}); setCode(''); setConfirm(false); request.current = null; setMode(next);
  };
  const prepare = () => {
    if (mode === 'mxik') {
      if (!selected || !code.trim()) { toast.error('Mahsulot va MXIK kodini kiriting'); return; }
    } else {
      if ((isNew && (!name.trim() || !unit.trim())) || (!isNew && !selected) || !validateReconciliation(Number(qty), price === '' ? null : Number(price), isNew)) { toast.error(isNew ? 'Mahsulot, musbat boshlang‘ich qoldiq va to‘g‘ri narxni kiriting' : 'Mahsulot va yangi yakuniy qoldiqni (0 yoki undan katta) kiriting'); return; }
      if (Object.entries(tech).some(([k,v]) => k !== 'metal_type' && v !== '' && (!Number.isFinite(Number(v)) || Number(v) <= 0))) { toast.error('Texnik o‘lchamlar musbat bo‘lishi kerak'); return; }
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
        toast.success('MXIK saqlandi');
      } else if (mode === 'sverka') {
        const args = { _product_id: isNew ? null : id, _name: isNew ? name.trim() : null, _unit: isNew ? unit : null, _quantity: Number(qty), _price: price === '' ? null : Number(price), _currency: currency, _technical: tech, _comment: comment || null };
        const payload = JSON.stringify(args);
        if (!request.current || request.current.payload !== payload) request.current = { key: crypto.randomUUID(), payload };
        const { data, error } = await supabase.rpc('warehouse_reconcile', { ...args, _key: request.current.key });
        if (error) throw error;
        const result = data as { before: number; after: number; barcode?: string | null };
        toast.success(`Sverka saqlandi: ${fmtNum(result.before)} → ${fmtNum(result.after)}${result.barcode ? ` · Shtrix-kod: ${result.barcode}` : ''}`);
      } else return;
      setConfirm(false); setMode(null); await onUpdated();
    } catch (error) { toast.error((error as { message?: string }).message || 'Saqlashda xatolik'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <>
    {canReconcile(roles) && <Button variant="outline" className="min-h-11" onClick={() => open('sverka')}><ClipboardCheck className="mr-2 h-4 w-4" />Nakladnoysiz kirim (Sverka)</Button>}
    {canEnterMxik(roles) && <Button variant="outline" className="min-h-11" onClick={() => open('mxik')}><FilePenLine className="mr-2 h-4 w-4" />MXIK kiritish</Button>}
    <Dialog open={mode !== null} onOpenChange={v => { if (!v && !busy) setMode(null); }}><DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{mode === 'mxik' ? 'MXIK kiritish' : 'Nakladnoysiz kirim (Sverka)'}</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); prepare(); }}>
        {mode === 'sverka' && <div className="flex gap-2"><Button type="button" variant={!isNew ? 'secondary' : 'outline'} onClick={() => setIsNew(false)}>Mavjud mahsulot</Button><Button type="button" variant={isNew ? 'secondary' : 'outline'} onClick={() => setIsNew(true)}>Yangi mahsulot</Button></div>}
        {!isNew ? <div className="space-y-2"><Label>Mahsulot</Label><SearchableSelect options={options} value={id} onChange={v => { setId(v); setCode(products.find(p => p.id === v)?.mxik_code ?? ''); }} searchPlaceholder="Mahsulot qidirish..." />{selected && <p className="text-sm text-muted-foreground">{selected.name} · {selected.unit} · Qoldiq: {fmtNum(selected.stock_qty)}</p>}{selected && <BarcodeChip product={selected} />}</div> : <>
          <div className="space-y-2"><Label htmlFor="sverka-name">Mahsulot nomi va texnik xususiyatlari</Label><Input id="sverka-name" required value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="sverka-unit">O‘lchov birligi</Label><Input id="sverka-unit" required value={unit} onChange={e => setUnit(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">{[['metal_type','Metall turi'],['thickness_mm','Qalinlik (mm)'],['width_mm','Eni (mm)'],['length_mm','Uzunlik (mm)'],['weight_kg','Bir dona og‘irligi (kg)']].map(([k,label]) => <div key={k} className="space-y-2"><Label htmlFor={`sverka-${k}`}>{label} (ixtiyoriy)</Label><Input id={`sverka-${k}`} type={k === 'metal_type' ? 'text' : 'number'} min="0" step="any" value={tech[k] ?? ''} onChange={e => setTech(prev => ({ ...prev, [k]: e.target.value }))} /></div>)}</div>
        </>}
        {mode === 'mxik' ? <><p className="text-sm">Hozirgi MXIK: {selected?.mxik_code ?? '—'}</p><div className="space-y-2"><Label htmlFor="manual-mxik">MXIK kodi</Label><Input id="manual-mxik" type="text" required value={code} onChange={e => setCode(e.target.value)} /></div></> : <>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="sverka-quantity">{isNew ? 'Boshlang‘ich qoldiq' : 'Yangi qoldiq (yakuniy)'}{selected ? ` (${selected.unit})` : ''}</Label><Input id="sverka-quantity" required type="number" min={isNew ? '0.000001' : '0'} step="any" value={qty} onChange={e => setQty(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="sverka-price">Birlik narxi (ixtiyoriy)</Label><Input id="sverka-price" type="number" min="0" step="any" value={price} onChange={e => setPrice(e.target.value)} /></div></div>
          <div className="space-y-2"><Label>Valyuta</Label><Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="UZS">UZS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="sverka-comment">Izoh (ixtiyoriy)</Label><Input id="sverka-comment" value={comment} onChange={e => setComment(e.target.value)} /></div>
        </>}
        <Button type="submit" disabled={busy} className="w-full">Tasdiqlash</Button>
      </form>
    </DialogContent></Dialog>
    <Dialog open={confirm} onOpenChange={v => { if (!busy) setConfirm(v); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Saqlashni tasdiqlang</DialogTitle></DialogHeader><p className="font-medium">{isNew ? name : selected?.name}</p>{mode === 'mxik' ? <><p>Eski MXIK: {selected?.mxik_code ?? '—'}</p><p className="break-all">Yangi MXIK: {code}</p></> : <><p>{isNew ? 'Boshlang‘ich qoldiq' : 'Yangi yakuniy qoldiq'}: {qty} {isNew ? unit : selected?.unit}</p><p>Qoldiq: {fmtNum(isNew ? 0 : selected?.stock_qty ?? 0)} → {fmtNum(Number(qty))}</p></>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Orqaga</Button><Button disabled={busy} onClick={save}>{busy ? 'Saqlanmoqda...' : 'Saqlash'}</Button></div></DialogContent></Dialog>
  </>;
}