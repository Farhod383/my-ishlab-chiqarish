import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { useLocalize } from "@/i18n/context";
import { badgeFileName, buildEmployeeBadges, type BadgeEmployee } from "@/lib/employeeBadges";

export default function EmployeeBadgePrint({ employees }: { employees: BadgeEmployee[] }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const localize = useLocalize();
  const print = async () => {
    setBusy(true);
    try { const doc = await buildEmployeeBadges(employees, localize); doc.save(badgeFileName()); toast.success("Bejiklar PDF tayyor"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "PDF yaratishda xatolik"); }
    finally { setBusy(false); }
  };
  return <>
    <Button type="button" variant="outline" disabled={!employees.length} onClick={() => setOpen(true)}><Printer className="h-4 w-4 mr-2" />Bejik chop etish ({employees.length})</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Bejik chop etish</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">A4 · 90×54 mm · bir varaqda 10 ta bejik (Deli 5742 g‘ilofi). Chop etishda masshtab 100% bo‘lsin.</p>
      <Button type="button" disabled={busy} onClick={print}><Printer className="h-4 w-4 mr-2" />{busy ? "Tayyorlanmoqda…" : "PDF yuklab olish"}</Button>
    </DialogContent></Dialog>
  </>;
}
