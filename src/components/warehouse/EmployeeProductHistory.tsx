import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fmtDateTime24, fmtNum } from '@/lib/format';
import { useLocalize } from '@/i18n/context';

type Movement = { id: string; issue_document_id: string | null; created_at: string; quantity: number; comment: string | null; created_by: string | null; product: { name: string; unit: string } | null };
export default function EmployeeProductHistory({ employeeId }: { employeeId: string }) {
  const [rows, setRows] = useState<Movement[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const localize = useLocalize();
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await supabase.from('stock_movements').select('id,issue_document_id,created_at,quantity,comment,created_by,product:products(name,unit)').eq('recipient_employee_id', employeeId).eq('direction', 'out').order('created_at', { ascending: false });
      if (!alive) return;
      if (error) { setError(error.message); return; }
      setRows(data ?? []);
      const ids = [...new Set((data ?? []).map(r => r.created_by).filter((id): id is string => Boolean(id)))];
      if (ids.length) {
        const { data: profiles } = await supabase.from('profiles').select('id,full_name').in('id', ids);
        if (alive) setNames(Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name ?? ''])));
      }
    })();
    return () => { alive = false; };
  }, [employeeId]);
  const groups = new Map<string, Movement[]>();
  rows.forEach(row => { const id = row.issue_document_id ?? row.id; groups.set(id, [...(groups.get(id) ?? []), row]); });
  return <section className="space-y-3"><h3 className="text-sm font-semibold">Mahsulot topshirish tarixi ({rows.length})</h3>{error && <p className="text-destructive">{error}</p>}{[...groups].map(([id, items]) => <div key={id} className="border rounded-md p-3 space-y-2"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{fmtDateTime24(items[0].created_at)} · {localize(names[items[0].created_by ?? ''] ?? '') || '—'}</span>{items[0].issue_document_id && <span className="font-mono">TOP-{id.slice(0, 8).toUpperCase()}</span>}</div>{items.map(row => <div key={row.id} className="border-t pt-2"><div className="flex justify-between gap-3 text-sm"><span className="break-words min-w-0">{row.product?.name ?? '—'}</span><strong className="shrink-0">{fmtNum(row.quantity)} {row.product?.unit}</strong></div>{row.comment && <p className="text-xs text-muted-foreground break-words">{row.comment}</p>}</div>)}</div>)}{!rows.length && !error && <p className="text-sm text-muted-foreground">Mahsulot topshirishlar yo‘q</p>}</section>;
}