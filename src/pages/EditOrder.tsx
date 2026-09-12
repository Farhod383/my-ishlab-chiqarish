import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchStageGroups, guessGroupId, type StageGroup } from "@/lib/stageGroups";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, ArrowLeft, Save, Upload, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { logAudit } from "@/types/erp";

interface StageDraft { id?: string; name: string; norm_days: number; qc_required: boolean; group_id: string | null }

export default function EditOrder() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [orderNumber, setOrderNumber] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [clientName, setClientName] = useState("");
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [priority, setPriority] = useState<"normal" | "exception">("normal");
  const [orderDate, setOrderDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [tzFilesNew, setTzFilesNew] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<any[]>([]);
  const [deletedFileIds, setDeletedFileIds] = useState<string[]>([]);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [stages, setStages] = useState<StageDraft[]>([]);
  const [groups, setGroups] = useState<StageGroup[]>([]);
  const [parts, setParts] = useState<{ id?: string; product_id: string; norm_qty: number }[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [orderRes, stagesRes, partsRes, prodRes, filesRes] = await Promise.all([
        supabase.from("orders").select("*, client:clients(*)").eq("id", id).single(),
        supabase.from("order_stages").select("*").eq("order_id", id).order("stage_order"),
        supabase.from("order_parts").select("*").eq("order_id", id),
        supabase.from("products").select("id, name, unit"),
        supabase.from("order_files").select("*").eq("order_id", id).order("created_at"),
      ]);
      const o = orderRes.data as any;
      if (!o) { nav("/orders"); return; }
      setOrderNumber(o.order_number);
      setClientName(o.client?.name ?? "");
      setProductName(o.product_name);
      setQuantity(o.quantity);
      setPriority(o.priority);
      setOrderDate(o.order_date);
      setDeadline(o.deadline);
      setComment(o.comment ?? "");
      setExistingImageUrl(o.product_image_url);
      setProducts(prodRes.data ?? []);
      try { setGroups(await fetchStageGroups()); } catch { /* noop */ }
      setExistingFiles(filesRes.data ?? []);
      setStages((stagesRes.data ?? []).map((s: any) => ({
        id: s.id, name: s.name, norm_days: s.norm_days, qc_required: s.qc_required, group_id: s.group_id ?? null,
      })));
      setParts((partsRes.data ?? []).map((p: any) => ({
        id: p.id, product_id: p.product_id ?? "", norm_qty: p.norm_qty,
      })));
      setLoading(false);
    })();
  }, [id]);

  const addStage = () => setStages([...stages, { name: "", norm_days: 1, qc_required: false, group_id: null }]);
  const updateStage = (i: number, patch: Partial<StageDraft>) => setStages(stages.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  const removeStage = (i: number) => setStages(stages.filter((_, idx) => idx !== i));

  const addPart = () => setParts([...parts, { product_id: "", norm_qty: 1 }]);
  const updatePart = (i: number, patch: any) => setParts(parts.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  const removePart = (i: number) => setParts(parts.filter((_, idx) => idx !== i));

  const uploadFile = async (file: File, bucket: string) => {
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  const submit = async () => {
    if (!orderNumber || !productName || !deadline || stages.length === 0) {
      toast.error(t.newOrder.fillRequired);
      return;
    }
    setBusy(true);
    try {
      const { data: dup } = await supabase.from("orders").select("id").eq("order_number", orderNumber).neq("id", id!).maybeSingle();
      if (dup) {
        toast.error(t.newOrder.duplicateOrderNumber);
        setBusy(false);
        return;
      }
      let imgUrl = existingImageUrl;
      if (productImage) imgUrl = await uploadFile(productImage, "product-images");

      // Handle client
      let clientId: string | null = null;
      if (clientName.trim()) {
        const trimmed = clientName.trim();
        const { data: existingClient } = await supabase.from("clients").select("id").ilike("name", trimmed).maybeSingle();
        if (existingClient) {
          clientId = existingClient.id;
        } else {
          const { data: newClient, error: cErr } = await supabase.from("clients").insert({ name: trimmed }).select().single();
          if (cErr) throw cErr;
          clientId = newClient.id;
        }
      }

      // Update order
      await supabase.from("orders").update({
        order_number: orderNumber, client_id: clientId, product_name: productName,
        product_image_url: imgUrl, quantity, priority, deadline, order_date: orderDate,
        comment: comment.trim() || null,
      } as any).eq("id", id!);

      // Delete removed files
      if (deletedFileIds.length > 0) {
        await supabase.from("order_files").delete().in("id", deletedFileIds);
      }

      // Upload new files
      for (const f of tzFilesNew) {
        const url = await uploadFile(f, "order-files");
        await supabase.from("order_files").insert({
          order_id: id, file_url: url, file_name: f.name, uploaded_by: user?.id ?? null,
        } as any);
      }

      // Update stages: delete old ones and re-insert
      await supabase.from("order_stages").delete().eq("order_id", id!);
      const perGroup: Record<string, number> = {};
      const stageRows = stages.map((s, idx) => {
        const gid = s.group_id ?? guessGroupId(s.name, groups);
        const key = gid ?? "none";
        perGroup[key] = (perGroup[key] ?? 0) + 1;
        return {
          order_id: id!, name: s.name, stage_order: idx + 1,
          norm_days: s.norm_days, qc_required: s.qc_required, status: "pending" as const,
          group_id: gid, group_order: perGroup[key],
        };
      });
      if (stageRows.length) await supabase.from("order_stages").insert(stageRows as any);

      // Update parts: delete old and re-insert
      await supabase.from("order_parts").delete().eq("order_id", id!);
      if (parts.length > 0) {
        const partRows = parts.filter((p) => p.product_id).map((p) => {
          const prod = products.find((x) => x.id === p.product_id);
          return { order_id: id!, product_id: p.product_id, part_name: prod?.name ?? "", unit: prod?.unit ?? "dona", norm_qty: p.norm_qty, actual_qty: 0 };
        });
        if (partRows.length) await supabase.from("order_parts").insert(partRows);
      }

      await logAudit(supabase, {
        actor_id: user?.id, actor_name: user?.email,
        action: "Zakaz tahrirlandi",
        entity: "order", order_id: id!,
        details: `${orderNumber}`,
      });

      const { notify } = await import("@/lib/notify");
      await notify({
        type: "info",
        title: `Zakaz o'zgardi — ${orderNumber}`,
        body: `${productName} · ${quantity} dona · muddat: ${deadline}`,
        link: `/orders/${id}`,
        entity: "order", entity_id: id!,
        recipient_role: ["manager", "marketing", "warehouse", "supply", "otk", "engineer"],
        sender_id: user?.id, sender_name: user?.email,
      });

      toast.success(t.editOrder?.saved ?? "Zakaz yangilandi");

      nav(`/orders/${id}`);
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("duplicate key") || msg.includes("orders_order_number_key")) {
        toast.error(t.newOrder.duplicateOrderNumber);
      } else {
        toast.error(t.newOrder.error);
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const visibleFiles = existingFiles.filter((f) => !deletedFileIds.includes(f.id));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> {t.common.back}</Button>
        <h1 className="text-2xl font-bold">{t.editOrder?.title ?? "Zakazni tahrirlash"}</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t.newOrder.main}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>{t.newOrder.orderNumber}</Label><Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} /></div>
            <div><Label>{t.newOrder.clientName}</Label><Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={t.newOrder.clientPlaceholder} /></div>
            <div className="sm:col-span-2"><Label>{t.newOrder.productType}</Label><Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={t.newOrder.productPlaceholder} /></div>
            <div><Label>{t.newOrder.quantity}</Label><Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></div>
            <div><Label>{t.newOrder.orderDate}</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
            <div><Label>{t.newOrder.deadline}</Label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
          </div>

          <div>
            <Label className="mb-2 block">{t.newOrder.priority}</Label>
            <RadioGroup value={priority} onValueChange={(v) => setPriority(v as any)} className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="normal" /> <span>{t.newOrder.normal}</span></label>
              <label className="flex items-center gap-2 cursor-pointer"><RadioGroupItem value="exception" /> <span className="text-status-red font-semibold">{t.newOrder.exception}</span></label>
            </RadioGroup>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>{t.newOrder.tzFile}</Label>
              {visibleFiles.length > 0 && (
                <div className="mb-2 space-y-1">
                  {visibleFiles.map((f: any) => (
                    <div key={f.id} className="text-xs flex items-center gap-1 border rounded p-1.5">
                      <FileText className="h-3 w-3 text-primary shrink-0" />
                      <a href={f.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex-1 truncate">{f.file_name || "Fayl"}</a>
                      <button type="button" className="text-destructive hover:underline text-xs" onClick={() => setDeletedFileIds([...deletedFileIds, f.id])}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Input type="file" multiple onChange={(e) => {
                const files = e.target.files;
                if (files) setTzFilesNew((prev) => [...prev, ...Array.from(files)]);
              }} />
              {tzFilesNew.length > 0 && (
                <div className="mt-1 space-y-1">
                  {tzFilesNew.map((f, i) => (
                    <div key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                      <Upload className="h-3 w-3" />{f.name}
                      <button type="button" className="ml-1 text-destructive hover:underline" onClick={() => setTzFilesNew(tzFilesNew.filter((_, idx) => idx !== i))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>{t.newOrder.productImage}</Label>
              {existingImageUrl && !productImage && (
                <div className="mb-2">
                  <img src={existingImageUrl} alt="product" className="h-20 w-20 object-cover rounded border" />
                  <p className="text-xs text-muted-foreground mt-1">{t.editOrder?.currentImage ?? "Joriy rasm"}</p>
                </div>
              )}
              <Input type="file" accept="image/*" onChange={(e) => setProductImage(e.target.files?.[0] ?? null)} />
              {productImage && <p className="text-xs text-muted-foreground mt-1">{productImage.name}</p>}
            </div>
          </div>
          <div>
            <Label>{t.newOrder.comment}</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t.newOrder.commentPh} rows={3} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{t.newOrder.stages}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{t.newOrder.stagesDesc}</p>
            </div>
            <Button size="sm" variant="outline" onClick={addStage}><Plus className="h-4 w-4 mr-1" /> {t.newOrder.addStage}</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {stages.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center p-2 border rounded-md">
              <div className="col-span-1 text-center text-sm font-bold text-muted-foreground">{i + 1}</div>
              <Input className="col-span-4" value={s.name} onChange={(e) => updateStage(i, { name: e.target.value })} placeholder={t.newOrder.stageNamePh} />
              <div className="col-span-3">
                <Select value={s.group_id ?? "none"} onValueChange={(v) => updateStage(i, { group_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Guruh" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Guruhsiz</SelectItem>
                    {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex items-center gap-1">
                <Input type="number" min={0.1} step={0.1} value={s.norm_days} onChange={(e) => updateStage(i, { norm_days: Number(e.target.value) })} />
                <span className="text-xs text-muted-foreground">{t.common.days}</span>
              </div>
              <label className="col-span-1 flex items-center gap-1 text-xs cursor-pointer">
                <Checkbox checked={s.qc_required} onCheckedChange={(v) => updateStage(i, { qc_required: !!v })} />
                OTK
              </label>
              <Button size="icon" variant="ghost" onClick={() => removeStage(i)} className="col-span-1"><Trash2 className="h-4 w-4 text-status-red" /></Button>
            </div>
          ))}
          {stages.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t.newOrder.minStage}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{t.newOrder.parts}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{t.newOrder.partsDesc}</p>
            </div>
            <Button size="sm" variant="outline" onClick={addPart}><Plus className="h-4 w-4 mr-1" /> {t.newOrder.addPart}</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <Select value={p.product_id} onValueChange={(v) => updatePart(i, { product_id: v })}>
                <SelectTrigger className="col-span-7"><SelectValue placeholder={t.newOrder.selectProduct} /></SelectTrigger>
                <SelectContent>{products.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.name} ({pr.unit})</SelectItem>)}</SelectContent>
              </Select>
              <Input className="col-span-4" type="number" min={0} step={0.1} value={p.norm_qty} onChange={(e) => updatePart(i, { norm_qty: Number(e.target.value) })} placeholder={t.newOrder.normaQty} />
              <Button size="icon" variant="ghost" onClick={() => removePart(i)} className="col-span-1"><Trash2 className="h-4 w-4 text-status-red" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => nav(-1)}>{t.common.cancel}</Button>
        <Button onClick={submit} disabled={busy}><Save className="h-4 w-4 mr-2" />{busy ? t.newOrder.submitting : t.common.save}</Button>
      </div>
    </div>
  );
}
