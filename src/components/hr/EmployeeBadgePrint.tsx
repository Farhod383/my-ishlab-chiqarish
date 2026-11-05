import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { useLocalize } from "@/i18n/context";
import { badgeFileName, buildEmployeeBadges, type BadgeEmployee, type BadgeSheetSize } from "@/lib/employeeBadges";

export default function EmployeeBadgePrint({ employees }: { employees: BadgeEmployee[] }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [size, setSize] = useState<BadgeSheetSize>(8);
  const localize = useLocalize();
  const print = async () => {
    setBusy(true);
    try { const doc = await buildEmployeeBadges(employees, size, localize); doc.save(badgeFileName()); toast.success("Bejiklar PDF tayyor"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "PDF yaratishda xatolik"); }
    finally { setBusy(false); }
  };
  return <>
    <Button type="button" variant="outline" disabled={!employees.length} onClick={() => setOpen(true)}><Printer className="h-4 w-4 mr-2" />Bejik chop etish ({employees.length})</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Bejik chop etish</DialogTitle></DialogHeader>
      <Label>Bir varaqda</Label><Select value={String(size)} onValueChange={v => setSize(Number(v) as BadgeSheetSize)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[4, 6, 8].map(n => <SelectItem key={n} value={String(n)}>{n} ta bejik</SelectItem>)}</SelectContent></Select>
      <p className="text-sm text-muted-foreground">A4 · 100×70 mm · Chop etishda masshtab 100% bo‘lsin.</p>
      <Button type="button" disabled={busy} onClick={print}><Printer className="h-4 w-4 mr-2" />{busy ? "Tayyorlanmoqda…" : "PDF yuklab olish"}</Button>
    </DialogContent></Dialog>
  </>;
}