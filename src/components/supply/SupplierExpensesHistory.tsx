import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/auth/AuthContext';
import { useLocalize } from '@/i18n/context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SupplierExpenseFields from './SupplierExpenseFields';
import { canChangeExpense, expenseTotals, validExpense, type ExpenseDraft } from '@/lib/supplierExpenses';
import { fmtDateTime24, fmtMoney } from '@/lib/format';
import { Pencil, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
type Row = Tables<'supplier_expenses'>;
export default function SupplierExpensesHistory({ account, onUpdated }: { account?: string; onUpdated?: () => void }) {
  const { roles, user } = useAuth(); const localize = useLocalize();
  const [rows, setRows] = useState<Row[]>([]); const [q, setQ] = useState(''); const [month, setMonth] = useState('');
  const [selected, setSelected] = useState<Row | null>(null); const [draft, setDraft] = useState<ExpenseDraft | null>(null); const [deleting, setDeleting] = useState(false); const [busy, setBusy] = useState(false);
  const load = async () => {
    const all: Row[] = [];
    for (let f = 0; ; f += 1000) { let query = supabase.from('supplier_expenses').select('*').is('deleted_at', null).order('spent_at', { ascending: false }).range(f, f + 999); if (account) query = query.eq('account', account); const { data, error } = await query; if (error) { toast.error(error.message); return; } all.push(...(data ?? [])); if (!data || data.length < 1000) break; }
    setRows(all);
  };
  useEffect(() => { load(); }, [account]);
  const filtered = rows.filter(r => (!month || r.spent_at.slice(0, 7) === month) && `${r.category} ${localize(r.employee_name)} ${r.comment ?? ''} ${r.account === 'supply2' ? 'Ta’minot 2' : 'Ta’minot'} ${r.document_id}`.toLowerCase().includes(q.toLowerCase()));
  const totals = expenseTotals(filtered);
  const edit = (r: Row, remove: boolean) => { setSelected(r); setDeleting(remove); setDraft({ category: r.category, amount: r.amount, currency: r.currency, account: r.account, employee_id: r.employee_id, comment: r.comment ?? '', spent_at: r.spent_at }); };
  const save = async () => {
    if (!selected || !draft || busy) return;
    if (!deleting && !validExpense(draft)) { toast.error('Xarajat maydonlarini to‘g‘ri kiriting'); return; }
    setBusy(true); const { error } = await supabase.rpc('change_supplier_expense', { _id: selected.id, _version: selected.version, _delete: deleting, _values: { ...draft } }); setBusy(false);
    if (error) { toast.error(error.message); return; } toast.success(deleting ? 'Xarajat o‘chirildi' : 'Xarajat saqlandi'); setSelected(null); await load(); onUpdated?.();
  };
  return <section className="space-y-3 border-t pt-4">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg font-semibold">Ta’minotchi xarajatlari</h2><Button variant="ghost" size="icon" aria-label="Xarajatlarni yangilash" title="Yangilash" onClick={load}><RefreshCw className="h-4 w-4" /></Button></div>
    <div className="flex flex-wrap gap-2"><Input className="sm:max-w-xs" placeholder="Xarajat, ta’minotchi, izoh qidirish..." value={q} onChange={e => setQ(e.target.value)} /><Input className="w-44" type="month" aria-label="Xarajatlar oyi" value={month} onChange={e => setMonth(e.target.value)} />{month && <Button variant="outline" onClick={() => setMonth('')}>Barcha davr</Button>}</div>
    <div className="flex flex-wrap gap-4 font-semibold"><span>{fmtMoney(totals.UZS, 'UZS')}</span><span>{fmtMoney(totals.USD, 'USD')}</span></div>
    <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow>{['Sana va vaqt', 'Xarajat turi', 'Summa', 'Ta’minotchi', 'Hisob', 'Kirim hujjati', 'Izoh', ''].map((h, i) => <TableHead key={i}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>
      {filtered.map(r => <TableRow key={r.id}><TableCell className="whitespace-nowrap">{fmtDateTime24(r.spent_at)}</TableCell><TableCell>{r.category}</TableCell><TableCell className="whitespace-nowrap">{fmtMoney(r.amount, r.currency)}</TableCell><TableCell>{localize(r.employee_name)}</TableCell><TableCell className="whitespace-nowrap">{r.account === 'supply2' ? 'Ta’minot 2' : 'Ta’minot'}</TableCell><TableCell><Button variant="link" className="p-0" onClick={() => { setSelected(r); setDraft(null); }}>#{r.document_id.slice(0, 8)}</Button></TableCell><TableCell className="min-w-40 whitespace-pre-wrap">{r.comment ?? ''}</TableCell><TableCell><div className="flex">{canChangeExpense(roles, user?.id, r.created_by) && <Button variant="ghost" size="icon" aria-label="Xarajatni tahrirlash" title="Tahrirlash" onClick={() => edit(r, false)}><Pencil className="h-4 w-4" /></Button>}{canChangeExpense(roles, user?.id, r.created_by, true) && <Button variant="ghost" size="icon" aria-label="Xarajatni o‘chirish" title="O‘chirish" onClick={() => edit(r, true)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</div></TableCell></TableRow>)}
      {!filtered.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Xarajatlar yo‘q</TableCell></TableRow>}
    </TableBody></Table></div>
    <Dialog open={!!selected} onOpenChange={v => { if (!v && !busy) setSelected(null); }}><DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{draft ? deleting ? 'Xarajatni o‘chirishni tasdiqlang' : 'Xarajatni tahrirlash' : 'Nakladnoysiz kirim hujjati'}</DialogTitle></DialogHeader>
      {!draft && selected ? <DocumentDetails id={selected.document_id} /> : draft && <>{deleting ? <p>{draft.category} · {fmtMoney(draft.amount, draft.currency)}</p> : <SupplierExpenseFields value={draft} onChange={setDraft} />}<div className="flex justify-end gap-2"><Button disabled={busy} variant="outline" onClick={() => setSelected(null)}>Bekor qilish</Button><Button disabled={busy} variant={deleting ? 'destructive' : 'default'} onClick={save}>{busy ? 'Saqlanmoqda...' : deleting ? 'O‘chirish' : 'Saqlash'}</Button></div></>}
    </DialogContent></Dialog>
  </section>;
}
function DocumentDetails({ id }: { id: string }) {
  const [doc, setDoc] = useState<Tables<'reconciliation_documents'> | null>(null);
  useEffect(() => { supabase.from('reconciliation_documents').select('*').eq('id', id).single().then(({ data, error }) => { if (error) toast.error(error.message); else setDoc(data); }); }, [id]);
  if (!doc) return <p>Yuklanmoqda...</p>;
  const p = doc.payload as Record<string, unknown>; const r = doc.result as Record<string, unknown>;
  return <div className="space-y-2"><p className="break-all">#{doc.id}</p><p>{fmtDateTime24(doc.created_at)}</p><p>Mahsulot: {String(p.name ?? r.product_id ?? '')}</p><p>Qoldiq: {String(r.before)} → {String(r.after)}</p><p>Tovar summasi: {fmtMoney(Math.abs(Number(r.after) - Number(r.before)) * Number(p.price ?? 0), String(p.currency))}</p><p>Izoh: {String(p.comment ?? '')}</p></div>;
}