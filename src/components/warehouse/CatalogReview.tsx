import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { toast } from "sonner";

export default function CatalogReview({canEdit,onUpdated}:{canEdit:boolean;onUpdated:()=>void}) {
  const [open,setOpen]=useState(false), [rows,setRows]=useState<any[]>([]), [summary,setSummary]=useState<any>(null);
  const [codes,setCodes]=useState<Record<string,string>>({}), [busy,setBusy]=useState(false);
  const load=async()=>{const {data,error}=await supabase.from("catalog_import_runs").select("results,summary").order("created_at",{ascending:false}).limit(1);if(error){toast.error(error.message);return;}const run=data?.[0];setRows(Array.isArray(run?.results)?run.results:[]);setSummary(run?.summary);};
  const save=async(row:any)=>{const code=codes[row.product_id]?.trim();if(!code || !/^\d{17}$/.test(code)){toast.error("Rasmiy 17 raqamli MXIK kiriting");return;}setBusy(true);const {error}=await supabase.from("products").update({mxik_code:code}).eq("id",row.product_id);setBusy(false);if(error)toast.error(error.message);else{toast.success("MXIK saqlandi");setRows(prev=>prev.map(r=>r.product_id===row.product_id?{...r,mxik:code,review:false,outcome:"MXIK qo‘lda tasdiqlandi"}:r));onUpdated();}};
  return <><Button variant="outline" onClick={()=>{setOpen(true);load();}}>Nomlar / MXIK hisoboti</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>Nomlar va MXIK tekshiruvi</DialogTitle></DialogHeader>
    {summary && <p className="text-sm">Yangilangan nomlar: {summary.renamed} · MXIK: {summary.mxik_updated} · Tekshirishga qolgan: {summary.review}</p>}
    <div className="overflow-auto max-h-[65vh]"><Table><TableHeader><TableRow><TableHead>Eski nom</TableHead><TableHead>Asosiy nom</TableHead><TableHead>Natija</TableHead><TableHead>MXIK</TableHead></TableRow></TableHeader><TableBody>{rows.map((r:any)=><TableRow key={r.n}><TableCell>{r.old_name}</TableCell><TableCell>{r.new_name}</TableCell><TableCell>{r.outcome}</TableCell><TableCell>{r.mxik ?? (r.product_id && canEdit?<div className="flex gap-2 min-w-64"><Input aria-label={`MXIK ${r.new_name}`} value={codes[r.product_id]??""} onChange={e=>setCodes(prev=>({...prev,[r.product_id]:e.target.value}))} placeholder="Rasmiy MXIK (ixtiyoriy)"/><Button variant="outline" disabled={busy} onClick={()=>save(r)}>Saqlash</Button></div>:"Tekshiruvi kerak")}</TableCell></TableRow>)}</TableBody></Table></div>
  </DialogContent></Dialog></>;
}