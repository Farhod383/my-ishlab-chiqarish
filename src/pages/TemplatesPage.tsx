import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { LayoutTemplate, Plus, Trash2, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { listTemplates, loadTemplate, deleteTemplate, type OrderTemplate, type TemplateStage, type TemplatePart } from "@/lib/orderTemplates";

export default function TemplatesPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole(["admin", "marketing"]);
  const [list, setList] = useState<OrderTemplate[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<OrderTemplate | null>(null);
  const [form, setForm] = useState({ name: "", product_name: "", default_quantity: 1, notes: "" });
  const [stages, setStages] = useState<TemplateStage[]>([]);
  const [parts, setParts] = useState<TemplatePart[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try { setList(await listTemplates()); } catch (e: any) { toast.error(e.message); }
  };
  useEffect(() => {
    reload();
    supabase.from("products").select("id, name, unit").order("name").then(({ data }) => setProducts(data ?? []));
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", product_name: "", default_quantity: 1, notes: "" });
    setStages([{ stage_order: 1, name: "", norm_days: 1, qc_required: false }]);
    setParts([]);
    setEditOpen(true);
  };

  const openEdit = async (tpl: OrderTemplate) => {
    try {
      const { template, stages: s, parts: p } = await loadTemplate(tpl.id);
      if (!template) return;
      setEditing(template);
      setForm({
        name: template.name,
        product_name: template.product_name,
        default_quantity: template.default_quantity,
        notes: template.notes ?? "",
      });
      setStages(s.length ? s : [{ stage_order: 1, name: "", norm_days: 1, qc_required: false }]);
      setParts(p);
      setEditOpen(true);
    } catch (e: any) { toast.error(e.message); }
  };

  const save = async () => {
    if (!form.name.trim() || !form.product_name.trim()) { toast.error("Nom va mahsulotni kiriting"); return; }
    setBusy(true);
    try {
      let tplId = editing?.id;
      if (tplId) {
        const { error } = await (supabase.from as any)("order_templates").update({
          name: form.name.trim(),
          product_name: form.product_name.trim(),
          default_quantity: form.default_quantity || 1,
          notes: form.notes.trim() || null,
        }).eq("id", tplId);
        if (error) throw error;
        await (supabase.from as any)("order_template_stages").delete().eq("template_id", tplId);
        await (supabase.from as any)("order_template_parts").delete().eq("template_id", tplId);
      } else {
        const { data, error } = await (supabase.from as any)("order_templates").insert({
          name: form.name.trim(),
          product_name: form.product_name.trim(),
          default_quantity: form.default_quantity || 1,
          notes: form.notes.trim() || null,
        }).select().single();
        if (error) throw error;
        tplId = data.id;
      }
      const stageRows = stages.filter(s => s.name.trim()).map((s, i) => ({
        template_id: tplId, stage_order: i + 1, name: s.name.trim(),
        norm_days: Number(s.norm_days) || 1, qc_required: !!s.qc_required,
      }));
      if (stageRows.length) await (supabase.from as any)("order_template_stages").insert(stageRows);
      const partRows = parts.filter(p => p.product_id).map(p => {
        const pr = products.find(x => x.id === p.product_id);
        return {
          template_id: tplId, product_id: p.product_id,
          part_name: pr?.name ?? p.part_name ?? "",
          unit: pr?.unit ?? p.unit ?? "dona",
          qty_per_unit: Number(p.qty_per_unit) || 0,
        };
      });
      if (partRows.length) await (supabase.from as any)("order_template_parts").insert(partRows);
      toast.success("Saqlandi");
      setEditOpen(false);
      reload();
    } catch (e: any) {
      toast.error(e.message || "Saqlashda xatolik");
    } finally { setBusy(false); }
  };

  const remove = async (tpl: OrderTemplate) => {
    if (!window.confirm(`O'chirish: ${tpl.name}?`)) return;
    try { await deleteTemplate(tpl.id); toast.success("O'chirildi"); reload(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><LayoutTemplate className="h-6 w-6" /> Zakaz shablonlari</h1>
          <p className="text-sm text-muted-foreground">Takrorlanadigan mahsulotlar uchun tayyor bosqich va materiallar to'plami</p>
        </div>
        {canManage && (
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Yangi shablon</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomi</TableHead>
                  <TableHead>Mahsulot</TableHead>
                  <TableHead className="text-right">Standart miqdor</TableHead>
                  <TableHead>Yangilangan</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map(tp => (
                  <TableRow
                    key={tp.id}
                    className={canManage ? "cursor-pointer hover:bg-muted/40" : undefined}
                    onClick={canManage ? () => openEdit(tp) : undefined}
                  >
                    <TableCell className="font-medium">{tp.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{tp.product_name}</TableCell>
                    <TableCell className="text-right font-mono">{tp.default_quantity}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(tp.updated_at).toLocaleDateString()}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/orders/new?tpl=${tp.id}`} title="Shu shablon bilan zakaz yaratish"><Plus className="h-3.5 w-3.5" /></Link>
                        </Button>
                        {canManage && <Button size="sm" variant="ghost" onClick={() => openEdit(tp)}><Pencil className="h-3.5 w-3.5" /></Button>}
                        {canManage && <Button size="sm" variant="ghost" onClick={() => remove(tp)}><Trash2 className="h-3.5 w-3.5 text-status-red" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {list.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Hozircha shablonlar yo'q</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Shablonni tahrirlash" : "Yangi shablon"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>Shablon nomi *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Pojarniy mashina" /></div>
              <div><Label>Mahsulot nomi *</Label><Input value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} /></div>
              <div><Label>Standart miqdor</Label><Input type="number" min={1} value={form.default_quantity} onChange={e => setForm({ ...form, default_quantity: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Izoh</Label><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Bosqichlar</Label>
                <Button size="sm" variant="outline" onClick={() => setStages([...stages, { stage_order: stages.length + 1, name: "", norm_days: 1, qc_required: false }])}><Plus className="h-3.5 w-3.5 mr-1" /> Bosqich</Button>
              </div>
              <div className="space-y-2">
                {stages.map((s, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center p-2 border rounded-md">
                    <div className="col-span-1 text-center text-sm font-bold text-muted-foreground">{i + 1}</div>
                    <Input className="col-span-5" value={s.name} onChange={(e) => { const c = [...stages]; c[i] = { ...c[i], name: e.target.value }; setStages(c); }} placeholder="Bosqich nomi" />
                    <div className="col-span-3 flex items-center gap-1">
                      <Input type="number" min={0.1} step={0.1} value={s.norm_days} onChange={(e) => { const c = [...stages]; c[i] = { ...c[i], norm_days: Number(e.target.value) }; setStages(c); }} />
                      <span className="text-xs text-muted-foreground">kun</span>
                    </div>
                    <label className="col-span-2 flex items-center gap-1 text-sm">
                      <Checkbox checked={s.qc_required} onCheckedChange={(v) => { const c = [...stages]; c[i] = { ...c[i], qc_required: !!v }; setStages(c); }} />
                      OTK
                    </label>
                    <Button size="icon" variant="ghost" onClick={() => setStages(stages.filter((_, idx) => idx !== i))} className="col-span-1"><Trash2 className="h-4 w-4 text-status-red" /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Materiallar (1 dona uchun)</Label>
                <Button size="sm" variant="outline" onClick={() => setParts([...parts, { product_id: null, part_name: "", unit: "dona", qty_per_unit: 1 }])}><Plus className="h-3.5 w-3.5 mr-1" /> Material</Button>
              </div>
              <div className="space-y-2">
                {parts.map((p, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Select value={p.product_id ?? ""} onValueChange={(v) => { const c = [...parts]; c[i] = { ...c[i], product_id: v }; setParts(c); }}>
                      <SelectTrigger className="col-span-7"><SelectValue placeholder="Mahsulot tanlang" /></SelectTrigger>
                      <SelectContent>{products.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.name} ({pr.unit})</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="col-span-4" type="number" min={0} step={0.1} value={p.qty_per_unit}
                      onChange={(e) => { const c = [...parts]; c[i] = { ...c[i], qty_per_unit: Number(e.target.value) }; setParts(c); }}
                      placeholder="Norma" />
                    <Button size="icon" variant="ghost" onClick={() => setParts(parts.filter((_, idx) => idx !== i))} className="col-span-1"><Trash2 className="h-4 w-4 text-status-red" /></Button>
                  </div>
                ))}
                {parts.length === 0 && <p className="text-xs text-muted-foreground">Material qo'shilmagan</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Bekor</Button>
            <Button onClick={save} disabled={busy}><Save className="h-4 w-4 mr-2" />{busy ? "Saqlanmoqda..." : "Saqlash"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
