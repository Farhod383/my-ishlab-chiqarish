import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { canEditBarcode } from "@/lib/manualBarcode";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import BarcodeScanField from "./BarcodeScanField";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
export default function FactoryBarcodeEditor({ product }: { product: { id: string; product_type_id?: string | null } }) {
  const { roles } = useAuth();
  const [rows, setRows] = useState<{ barcode: string; reason: string | null }[]>([]);
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false);
  const load = async () => {
    if (!product.product_type_id) return;
    const { data } = await supabase.from("product_type_barcode_aliases").select("barcode,reason").eq("product_type_id", product.product_type_id);
    setRows(data ?? []);
  };
  useEffect(() => { void load(); }, [product.id, product.product_type_id]);
  if (!canEditBarcode(roles)) return null;
  const add = async (value: string) => {
    if (!value.trim() || busy) return; setBusy(true);
    const { error } = await supabase.rpc("bind_barcode_alias", { _code: value, _product_id: product.id });
    if (error) toast.error(error.message); else { setCode(""); await load(); toast.success("Zavod kodi biriktirildi"); } setBusy(false);
  };
  const remove = async (value: string) => {
    if (!product.product_type_id || busy) return; setBusy(true);
    const { error } = await supabase.rpc("remove_factory_barcode", { _type_id: product.product_type_id, _code: value });
    if (error) toast.error(error.message); else { await load(); toast.success("Zavod kodi olib tashlandi"); } setBusy(false);
  };
  return <div className="space-y-2"><Label>Zavod shtrix kodlari (ixtiyoriy)</Label>
    {rows.map(row => <div key={row.barcode} className="flex items-center justify-between gap-2"><span className="font-mono break-all">{row.barcode}</span>{["factory_code", "Qo‘lda kod biriktirish"].includes(row.reason ?? "") && <Button type="button" size="icon" variant="outline" disabled={busy} aria-label={`Zavod kodini o‘chirish ${row.barcode}`} onClick={() => void remove(row.barcode)}><Trash2 className="h-4 w-4" /></Button>}</div>)}
    <div className="flex gap-2"><div className="flex-1"><BarcodeScanField id="factory-barcode" value={code} onChange={setCode} onScanned={value => void add(value)} disabled={busy} placeholder="Zavod shtrix kodi (ixtiyoriy)" /></div><Button type="button" size="icon" variant="outline" aria-label="Zavod kodini qo‘shish" disabled={busy || !code.trim()} onClick={() => void add(code)}><Plus className="h-4 w-4" /></Button></div>
  </div>;
}