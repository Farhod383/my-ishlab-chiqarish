import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function ProductMxikEditor({ product, onUpdated }: { product: { id: string; name: string; mxik_code?: string | null }; onUpdated: (code: string) => void }) {
  const [code, setCode] = useState(product.mxik_code ?? "");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("set_product_mxik", { _product_id: product.id, _code: code.trim(), _expected_code: product.mxik_code ?? null });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    onUpdated(code.trim()); setConfirm(false); toast.success("MXIK сохранён");
  };
  return <div className="space-y-2"><Label htmlFor="catalog-mxik">MXIK (ixtiyoriy)</Label><div className="flex gap-2"><Input id="catalog-mxik" value={code} onChange={e => setCode(e.target.value)} /><Button variant="outline" disabled={busy || !code.trim() || code.trim() === product.mxik_code} onClick={() => setConfirm(true)}>Сохранить MXIK</Button></div><Dialog open={confirm} onOpenChange={setConfirm}><DialogContent><DialogHeader><DialogTitle>Подтвердить MXIK</DialogTitle></DialogHeader><p>{product.name}</p><p className="break-all">{product.mxik_code || "—"} → {code.trim()}</p><Button disabled={busy} onClick={save}>Подтвердить</Button></DialogContent></Dialog></div>;
}