import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Layers } from "lucide-react";
import { toast } from "sonner";
import { fetchGroupsWithItems, type StageGroup, type StageGroupItem } from "@/lib/stageGroups";
import { useAuth } from "@/auth/AuthContext";

type GroupWithItems = StageGroup & { items: StageGroupItem[] };

export default function StageGroupsPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole(["admin", "manager"]);
  const [groups, setGroups] = useState<GroupWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  // group dialog
  const [gOpen, setGOpen] = useState(false);
  const [gEdit, setGEdit] = useState<StageGroup | null>(null);
  const [gName, setGName] = useState("");
  const [gOrder, setGOrder] = useState("1");

  // stage dialog
  const [sOpen, setSOpen] = useState(false);
  const [sEdit, setSEdit] = useState<StageGroupItem | null>(null);
  const [sGroupId, setSGroupId] = useState("");
  const [sName, setSName] = useState("");
  const [sOrder, setSOrder] = useState("1");
  const [sNorm, setSNorm] = useState("1");
  const [sQc, setSQc] = useState(false);

  const [delItem, setDelItem] = useState<StageGroupItem | null>(null);
  const [delGroup, setDelGroup] = useState<GroupWithItems | null>(null);

  const load = async () => {
    try {
      setGroups(await fetchGroupsWithItems());
    } catch (e: any) {
      toast.error(e?.message || "Yuklashda xatolik");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLowerCase().includes(q)) }))
      .filter((g) => g.name.toLowerCase().includes(q) || g.items.length > 0);
  }, [groups, search]);

  const openGroupDialog = (g?: GroupWithItems) => {
    setGEdit(g ?? null);
    setGName(g?.name ?? "");
    setGOrder(String(g?.group_order ?? (groups.length + 1)));
    setGOpen(true);
  };

  const saveGroup = async () => {
    const name = gName.trim();
    if (!name) { toast.error("Guruh nomini kiriting"); return; }
    const payload = { name, group_order: Number(gOrder) || 1 };
    const { error } = gEdit
      ? await supabase.from("stage_groups").update(payload).eq("id", gEdit.id)
      : await supabase.from("stage_groups").insert(payload as any);
    if (error) { toast.error(error.message); return; }
    toast.success(gEdit ? "Guruh yangilandi" : "Guruh qo'shildi");
    setGOpen(false);
    load();
  };

  const openStageDialog = (groupId: string, item?: StageGroupItem) => {
    setSEdit(item ?? null);
    setSGroupId(item?.group_id ?? groupId);
    setSName(item?.name ?? "");
    const g = groups.find((x) => x.id === (item?.group_id ?? groupId));
    setSOrder(String(item?.item_order ?? ((g?.items.length ?? 0) + 1)));
    setSNorm(String(item?.norm_days ?? 1));
    setSQc(!!item?.qc_required);
    setSOpen(true);
  };

  const saveStage = async () => {
    const name = sName.trim();
    if (!sGroupId) { toast.error("Guruhni tanlang"); return; }
    if (!name) { toast.error("Bosqich nomini kiriting"); return; }
    const payload = {
      group_id: sGroupId,
      name,
      item_order: Number(sOrder) || 1,
      norm_days: Number(sNorm) || 1,
      qc_required: sQc,
    };
    const { error } = sEdit
      ? await supabase.from("stage_group_items").update(payload).eq("id", sEdit.id)
      : await supabase.from("stage_group_items").insert(payload as any);
    if (error) { toast.error(error.message); return; }
    toast.success(sEdit ? "Bosqich yangilandi" : "Bosqich qo'shildi");
    setSOpen(false);
    load();
  };

  const removeItem = async () => {
    if (!delItem) return;
    const { error } = await supabase.from("stage_group_items").delete().eq("id", delItem.id);
    setDelItem(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Bosqich o'chirildi");
    load();
  };

  const removeGroup = async () => {
    if (!delGroup) return;
    const { error } = await supabase.from("stage_groups").delete().eq("id", delGroup.id);
    setDelGroup(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Guruh o'chirildi");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bosqich guruhlari</h1>
          <p className="text-sm text-muted-foreground">
            Ishlab chiqarish bosqichlari guruhlarga bo'lingan. Guruh ichida aniq bosqichlar saqlanadi.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openGroupDialog()}><Layers className="h-4 w-4 mr-1" />Yangi guruh</Button>
            <Button onClick={() => openStageDialog(groups[0]?.id ?? "")}><Plus className="h-4 w-4 mr-1" />Bosqich yaratish</Button>
          </div>
        )}
      </div>

      <Input placeholder="Guruh yoki bosqich bo'yicha qidirish..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {loading && <p className="text-muted-foreground">Yuklanmoqda...</p>}

      <div className="space-y-2">
        {filtered.map((g) => {
          const expanded = open[g.id] ?? !!search.trim();
          return (
            <Card key={g.id}>
              <CardContent className="p-0">
                <div
                  className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/40 transition"
                  onClick={() => setOpen((o) => ({ ...o, [g.id]: !expanded }))}
                >
                  {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="text-xs font-mono text-muted-foreground w-6">{g.group_order}</span>
                  <span className="font-semibold uppercase tracking-wide">{g.name}</span>
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/10 px-1.5 text-xs font-bold text-primary">
                    {g.items.length}
                  </span>
                  {canManage && (
                    <div className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => openStageDialog(g.id)}><Plus className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => openGroupDialog(g)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setDelGroup(g)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  )}
                </div>
                {expanded && (
                  <div className="border-t divide-y">
                    {g.items.length === 0 && <div className="p-3 text-sm text-muted-foreground">Bosqich yo'q</div>}
                    {g.items.map((i, idx) => (
                      <div key={i.id} className="flex items-center gap-3 p-2.5 pl-10 text-sm">
                        <span className="text-xs font-mono text-muted-foreground w-6">{idx + 1}</span>
                        <span className="flex-1 min-w-0 truncate">{i.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{i.norm_days} kun{i.qc_required ? " · OTK" : ""}</span>
                        {canManage && (
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" onClick={() => openStageDialog(g.id, i)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setDelItem(i)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!loading && filtered.length === 0 && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Guruh topilmadi</CardContent></Card>
        )}
      </div>

      <Dialog open={gOpen} onOpenChange={setGOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{gEdit ? "Guruhni tahrirlash" : "Yangi guruh"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Guruh nomi</Label><Input value={gName} onChange={(e) => setGName(e.target.value)} placeholder="Masalan: Svarka" /></div>
            <div><Label>Tartib raqami</Label><Input type="number" min={1} value={gOrder} onChange={(e) => setGOrder(e.target.value)} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setGOpen(false)}>Bekor qilish</Button>
              <Button onClick={saveGroup}>Saqlash</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sOpen} onOpenChange={setSOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{sEdit ? "Bosqichni tahrirlash" : "Bosqich yaratish"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Guruh</Label>
              <Select value={sGroupId} onValueChange={setSGroupId}>
                <SelectTrigger><SelectValue placeholder="Guruhni tanlang" /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Bosqich nomi</Label><Input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="Masalan: Kuzov svarka" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tartib</Label><Input type="number" min={1} value={sOrder} onChange={(e) => setSOrder(e.target.value)} /></div>
              <div><Label>Norma (kun)</Label><Input type="number" min={0} step="0.5" value={sNorm} onChange={(e) => setSNorm(e.target.value)} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={sQc} onCheckedChange={(v) => setSQc(!!v)} /> OTK talab qilinadi
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSOpen(false)}>Bekor qilish</Button>
              <Button onClick={saveStage}>Saqlash</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delItem} onOpenChange={(o) => !o && setDelItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bosqichni o'chirish</AlertDialogTitle>
            <AlertDialogDescription>
              "{delItem?.name}" ro'yxatdan o'chiriladi. Mavjud zakazlardagi bosqichlar va ularning tarixi saqlanadi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={removeItem}>O'chirish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!delGroup} onOpenChange={(o) => !o && setDelGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Guruhni o'chirish</AlertDialogTitle>
            <AlertDialogDescription>
              "{delGroup?.name}" guruhi va uning {delGroup?.items.length ?? 0} ta bosqich shabloni o'chiriladi.
              Mavjud zakazlardagi bosqichlar, tarix va progress saqlanadi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={removeGroup}>O'chirish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
