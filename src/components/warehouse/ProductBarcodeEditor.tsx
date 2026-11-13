import { useWarehouseText, useWarehouseError } from "@/i18n/warehouseContext";
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import BarcodeChip from './BarcodeChip';
import BarcodeScanField from './BarcodeScanField';
import { canEditBarcode, validManualBarcode } from '@/lib/manualBarcode';
import { toast } from 'sonner';
import FactoryBarcodeEditor from './FactoryBarcodeEditor';

type Product = { id: string; name: string; barcode?: string | null; product_type_id?: string | null };
export default function ProductBarcodeEditor({ product, onUpdated }: { product: Product; onUpdated: (code: string) => void }) {
  const wt = useWarehouseText();
  const we = useWarehouseError();
  const { roles } = useAuth();
  const [current, setCurrent] = useState(product.barcode ?? '');
  const [code, setCode] = useState(product.barcode ?? '');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCurrent(product.barcode ?? ''); setCode(product.barcode ?? ''); }, [product.id, product.barcode]);
  if (!canEditBarcode(roles)) return <BarcodeChip product={product} />;
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('set_product_barcode', { _product_id: product.id, _code: code.trim(), _expected_code: current });
      if (error) throw error;
      const result = data as { barcode: string };
      setCurrent(result.barcode); setCode(result.barcode); setConfirm(false); onUpdated(result.barcode);
      toast.success(wt("Shtrix-kod saqlandi"));
    } catch (error) { toast.error(we((error as { message?: string }).message ?? wt("Saqlashda xatolik"))); }
    finally { setBusy(false); }
  };
  return <div className="space-y-2">
    <Label htmlFor="edit-product-barcode">{wt("Shtrix-kod")}</Label>
    <div className="flex gap-2"><div className="flex-1"><BarcodeScanField id="edit-product-barcode" value={code} disabled={busy} onChange={setCode} /></div><Button type="button" variant="outline" disabled={busy || code.trim() === current} onClick={() => { if (!validManualBarcode(code)) { toast.error(we(wt("To‘g‘ri shtrix-kod kiriting"))); return; } setConfirm(true); }}>{wt("Kodni saqlash")}</Button></div>
    <BarcodeChip product={{ ...product, barcode: current }} />
    <FactoryBarcodeEditor product={product} />
    <Dialog open={confirm} onOpenChange={v => { if (!busy) setConfirm(v); }}><DialogContent><DialogHeader><DialogTitle>{wt("Shtrix-kodni almashtirish")}</DialogTitle></DialogHeader><p>{product.name}</p><p className="break-all">{wt("Eski kod:")}{current}</p><p className="break-all">{wt("Yangi kod:")}{code.trim()}</p><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>{wt("Orqaga")}</Button><Button disabled={busy} onClick={save}>{busy ? wt("Saqlanmoqda...") : wt("Tasdiqlash")}</Button></div></DialogContent></Dialog>
  </div>;
}