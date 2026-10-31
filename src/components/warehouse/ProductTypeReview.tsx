import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { toast } from "sonner";

type Review = { name: string; count: number; reason: string; records: { id: string; name: string; barcode: string }[] };
export default function ProductTypeReview() {
  const [open, setOpen] = useState(false), [rows, setRows] = useState<Review[]>([]);
  const load = async () => {
    const { data, error } = await supabase.from("catalog_import_runs").select("results").eq("source_key", "product-type-barcode-audit-2026-10-31").maybeSingle();
    if (error) { toast.error(error.message); return; }
    setRows(Array.isArray(data?.results) ? data.results as unknown as Review[] : []);
  };
  return <><Button variant="outline" onClick={() => { setOpen(true); void load(); }}>Mahsulot turi tekshiruvi</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-4xl"><DialogHeader className="z-0"><DialogTitle>Mahsulot turi tekshiruvi</DialogTitle></DialogHeader>
      <p className="text-sm">Noaniq instrument guruhlari: {rows.length} · Yozuvlar: {rows.reduce((n, r) => n + r.count, 0)}</p>
      <div className="max-h-[60dvh] overflow-auto"><Table><TableHeader><TableRow><TableHead>Mahsulot</TableHead><TableHead>Kodlar</TableHead><TableHead>Tekshiruv sababi</TableHead></TableRow></TableHeader><TableBody>{rows.map(r => <TableRow key={r.name}><TableCell>{r.name}</TableCell><TableCell>{r.records.map(p => <div key={p.id} className="font-mono text-xs">{p.barcode}</div>)}</TableCell><TableCell>{r.reason}</TableCell></TableRow>)}</TableBody></Table></div>
    </DialogContent></Dialog></>;
}