import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  INTAKE_PAYMENT_TYPES, updateSessionPayment,
  type IntakePaymentType, type IntakeSession,
} from "@/lib/intake";

/** Ochiq nakladnoyning to'lov turi, raqami va izohi — bazaga darhol saqlanadi. */
export function IntakePaymentFields({ session, onSaved }: { session: IntakeSession; onSaved?: () => void }) {
  const [pt, setPt] = useState<IntakePaymentType>((session.payment_type as IntakePaymentType) ?? "cash");
  const [num, setNum] = useState(session.invoice_number ?? "");
  const [comment, setComment] = useState(session.comment ?? "");
  useEffect(() => {
    setPt((session.payment_type as IntakePaymentType) ?? "cash");
    setNum(session.invoice_number ?? "");
    setComment(session.comment ?? "");
  }, [session.id, session.payment_type, session.invoice_number, session.comment]);

  const save = async (patch: Parameters<typeof updateSessionPayment>[1]) => {
    try { await updateSessionPayment(session.id, patch); onSaved?.(); }
    catch (e: any) { toast.error(e.message ?? "Saqlab bo'lmadi"); }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <Label>To'lov turi</Label>
        <Select value={pt} onValueChange={(v) => { setPt(v as IntakePaymentType); save({ payment_type: v as IntakePaymentType }); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{INTAKE_PAYMENT_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
        {pt === "debt" && <p className="text-[11px] text-muted-foreground mt-1">Yakunlangach Kassa → Qarz bo'limiga yoziladi, kassadan pul yechilmaydi</p>}
      </div>
      <div>
        <Label>Nakladnoy raqami (ixtiyoriy)</Label>
        <Input value={num} onChange={(e) => setNum(e.target.value)} onBlur={() => num !== (session.invoice_number ?? "") && save({ invoice_number: num.trim() || null })} placeholder="ixtiyoriy" />
      </div>
      <div>
        <Label>Izoh (ixtiyoriy)</Label>
        <Input value={comment} onChange={(e) => setComment(e.target.value)} onBlur={() => comment !== (session.comment ?? "") && save({ comment: comment.trim() || null })} placeholder="ixtiyoriy" />
      </div>
    </div>
  );
}
