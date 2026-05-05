import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, ArrowLeft, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { logAudit } from "@/types/erp";

interface StageDraft { name: string; norm_days: number; qc_required: boolean }

export default function NewOrder() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [orderNumber, setOrderNumber] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [clientName, setClientName] = useState<string>("");
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState<number>(1);
  const [priority, setPriority] = useState<"normal" | "exception">("normal");
  const [orderDate, setOrderDate] = useState<string>(() => new Date().toISOString().slice(0,10));
  const [deadline, setDeadline] = useState<string>(() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0,10); });
  const [activeQueueDays, setActiveQueueDays] = useState<number>(0);
  const [tzFiles, setTzFiles] = useState<File[]>([]);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [stages, setStages] = useState<StageDraft[]>([{ name: "", norm_days: 1, qc_required: false }]);
  const [parts, setParts] = useState<{ product_id: string; norm_qty: number }[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { count }, { data: activeOrders }] = await Promise.all([
        supabase.from("products").select("id, name, unit"),
        supabase.from("orders").select("*", { count: "exact", head: true }),
        supabase.from("orders").select("id, order_stages(norm_days, status)").neq("status", "completed"),
      ]);
      setProducts(p ?? []);
      const num = (count ?? 0) + 1;
      setOrderNumber(`Z-${new Date().getFullYear()}-${String(num).padStart(3, "0")}`);
      let sum = 0;
      for (const o of activeOrders ?? []) {
        for (const s of (o as any).order_stages ?? []) {
          if (s.status !== "completed") sum += Number(s.norm_days || 0);
        }
      }
      setActiveQueueDays(sum);
    })();
  }, []);

  const addStage = () => setStages([...stages, { name: "", norm_days: 1, qc_required: false }]);
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
      let imgUrl: string | null = null;
      const uploadedFileUrls: { file_url: string; file_name: string }[] = [];
      for (const f of tzFiles) {
        const url = await uploadFile(f, "order-files");
        uploadedFileUrls.push({ file_url: url, file_name: f.name });
      }
      if (productImage) imgUrl = await uploadFile(productImage, "product-images");

      const { data: existing } = await supabase.from("orders").select("queue_position").order("queue_position", { ascending: false }).limit(1);
      const maxPos = existing?.[0]?.queue_position ?? 0;
      const queuePos = priority === "exception" ? 1 : maxPos + 1;

      if (priority === "exception") {
        const { data: all } = await supabase.from("orders").select("id, queue_position").neq("status", "completed");
        for (const o of all ?? []) {
          await supabase.from("orders").update({ queue_position: (o.queue_position ?? 0) + 1 }).eq("id", o.id);
        }
      }

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

      const { data: order, error } = await supabase.from("orders").insert({
        order_number: orderNumber, client_id: clientId, product_name: productName,
        product_image_url: imgUrl, tz_file_url: uploadedFileUrls[0]?.file_url ?? null,
        quantity, priority, status: "pending", deadline, order_date: orderDate,
        queue_position: queuePos, created_by: user?.id ?? null,
        comment: comment.trim() || null,
      } as any).select().single();
      if (error) throw error;

      if (uploadedFileUrls.length > 0) {
        await supabase.from("order_files").insert(
          uploadedFileUrls.map((f) => ({ order_id: order.id, file_url: f.file_url, file_name: f.file_name, uploaded_by: user?.id ?? null }))
        );
      }


      const stageRows = stages.map((s, idx) => ({
        order_id: order.id, name: s.name, stage_order: idx + 1,
        norm_days: s.norm_days, qc_required: s.qc_required, status: "pending" as const,
      }));
      await supabase.from("order_stages").insert(stageRows);

      if (parts.length > 0) {
        const partRows = parts.filter((p) => p.product_id).map((p) => {
          const prod = products.find((x) => x.id === p.product_id);
          return { order_id: order.id, product_id: p.product_id, part_name: prod?.name ?? "", unit: prod?.unit ?? "dona", norm_qty: p.norm_qty, actual_qty: 0 };
        });
        if (partRows.length) await supabase.from("order_parts").insert(partRows);
      }

      await logAudit(supabase, {
        actor_id: user?.id, actor_name: user?.email,
        action: priority === "exception" ? "Istisno zakaz yaratildi" : "Zakaz yaratildi",
        entity: "order", order_id: order.id,
        details: `${orderNumber}, ${clientName || "—"}`,
      });

      toast.success(t.newOrder.created);
      nav(`/orders/${order.id}`);
    } catch (e: any) {
      toast.error(`${t.newOrder.error}: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => nav(-1)}><ArrowLeft className="h-4 w-4 mr-1" /> {t.common.back}</Button>
        <h1 className="text-2xl font-bold">{t.newOrder.title}</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t.newOrder.main}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>{t.newOrder.orderNumber}</Label><Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} /></div>
            <div>
              <Label>{t.newOrder.clientName}</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={t.newOrder.clientPlaceholder} />
            </div>
            <div className="sm:col-span-2"><Label>{t.newOrder.productType}</Label><Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder={t.newOrder.productPlaceholder} /></div>
            <div><Label>{t.newOrder.quantity}</Label><Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></div>
            <div><Label>{t.newOrder.orderDate}</Label><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></div>
            <div>
              <Label>{t.newOrder.startAuto}</Label>
              <Input type="date" value={(() => {
                const d = new Date(orderDate);
                if (priority !== "exception") d.setDate(d.getDate() + Math.ceil(activeQueueDays));
                return d.toISOString().slice(0,10);
              })()} disabled readOnly />
              <p className="text-xs text-muted-foreground mt-1">{priority === "exception" ? t.newOrder.immediateStart : t.newOrder.queueDays.replace("{n}", String(Math.ceil(activeQueueDays)))}</p>
            </div>
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
              <Input type="file" multiple onChange={(e) => {
                const files = e.target.files;
                if (files) setTzFiles((prev) => [...prev, ...Array.from(files)]);
              }} />
              {tzFiles.length > 0 && (
                <div className="mt-1 space-y-1">
                  {tzFiles.map((f, i) => (
                    <div key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                      <Upload className="h-3 w-3" />{f.name}
                      <button type="button" className="ml-1 text-destructive hover:underline" onClick={() => setTzFiles(tzFiles.filter((_, idx) => idx !== i))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>{t.newOrder.productImage}</Label>
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
              <Input className="col-span-5" value={s.name} onChange={(e) => updateStage(i, { name: e.target.value })} placeholder={t.newOrder.stageNamePh} />
              <div className="col-span-3 flex items-center gap-2">
                <Input type="number" min={0.1} step={0.1} value={s.norm_days} onChange={(e) => updateStage(i, { norm_days: Number(e.target.value) })} />
                <span className="text-xs text-muted-foreground">{t.common.days}</span>
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer">
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
        <Button onClick={submit} disabled={busy}><Save className="h-4 w-4 mr-2" />{busy ? t.newOrder.submitting : t.newOrder.submit}</Button>
      </div>
    </div>
  );
}
