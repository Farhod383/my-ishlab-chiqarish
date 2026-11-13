import { useWarehouseText } from "@/i18n/warehouseContext";
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocalize } from '@/i18n/context';
import SearchableSelect from '@/components/SearchableSelect';
import DateInput from '@/components/DateInput';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EXPENSE_CATEGORIES, type ExpenseDraft } from '@/lib/supplierExpenses';
export default function SupplierExpenseFields({ value, onChange }: { value: ExpenseDraft; onChange: (v: ExpenseDraft) => void }) {
  const wt = useWarehouseText();
  const localize = useLocalize();
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [categories, setCategories] = useState(EXPENSE_CATEGORIES);
  useEffect(() => {
    supabase.from('employees').select('id,full_name').eq('status', 'active').order('full_name').then(({ data }) => setEmployees(data ?? []));
    supabase.from('supplier_expenses').select('category').then(({ data }) => setCategories([...new Set([...EXPENSE_CATEGORIES, ...(data ?? []).map(r => r.category)])]));
  }, []);
  const patch = (p: Partial<ExpenseDraft>) => onChange({ ...value, ...p });
  const d = new Date(value.spent_at);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '';
  const time = Number.isFinite(d.getTime()) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '00:00';
  const changeTime = (day: string, clock: string) => { const next = new Date(`${day}T${clock}`); if (Number.isFinite(next.getTime())) patch({ spent_at: next.toISOString() }); };
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <div className="space-y-1 sm:col-span-2"><Label>{wt("Xarajat turi")}</Label><Input aria-label={wt("Xarajat turi")} list="supplier-expense-categories" required value={wt(value.category)} onChange={e => patch({ category: EXPENSE_CATEGORIES.find(c => wt(c) === e.target.value) ?? e.target.value })} /><datalist id="supplier-expense-categories">{categories.map(c => <option key={c} value={wt(c)} />)}</datalist></div>
    <div className="space-y-1"><Label>{wt("Summa")}</Label><Input aria-label={wt("Xarajat summasi")} required type="number" min="0.01" step="any" value={value.amount || ''} onChange={e => patch({ amount: Number(e.target.value) })} /></div>
    <div className="space-y-1"><Label>{wt("Valyuta")}</Label><Select value={value.currency} onValueChange={currency => patch({ currency })}><SelectTrigger aria-label={wt("Xarajat valyutasi")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="UZS">UZS</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent></Select></div>
    <div className="space-y-1"><Label>{wt("Ta’minot hisobi")}</Label><Select value={value.account} onValueChange={account => patch({ account })}><SelectTrigger aria-label={wt("Ta’minot hisobi")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="supply">{wt("Ta’minot")}</SelectItem><SelectItem value="supply2">{wt("Ta’minot 2")}</SelectItem></SelectContent></Select></div>
    <div className="space-y-1"><Label>{wt("Kim xarajat qildi")}</Label><SearchableSelect value={value.employee_id} onChange={employee_id => patch({ employee_id })} options={employees.map(e => ({ value: e.id, label: localize(e.full_name) }))} placeholder={wt("Ta’minotchini tanlang")} searchPlaceholder={wt("Xodim qidirish...")} /></div>
    <div className="space-y-1"><Label>{wt("Sana")}</Label><DateInput value={date} onChange={v => changeTime(v, time)} /></div><div className="space-y-1"><Label>{wt("Vaqt")}</Label><Input aria-label={wt("Xarajat vaqti")} required type="text" inputMode="numeric" placeholder={wt("HH:mm")} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" defaultValue={time} onBlur={e => { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value)) changeTime(date, e.target.value); else e.target.value = time; }} /></div>
    <div className="space-y-1 sm:col-span-2"><Label>{wt("Izoh (ixtiyoriy)")}</Label><Input aria-label={wt("Xarajat izohi")} value={value.comment} onChange={e => patch({ comment: e.target.value })} /></div>
  </div>;
}