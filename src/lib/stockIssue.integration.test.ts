import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const sessionPath = process.env.ISSUE_TEST_SESSION;
describe.skipIf(!sessionPath)('atomic employee product issue', () => {
  const db = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let ids: string[] = []; let employee = ''; let key = ''; let payload: { product_id: string; quantity: number }[] = [];
  beforeAll(async () => {
    if (!sessionPath) throw new Error('Session required');
    const { error } = await db.auth.setSession(JSON.parse(readFileSync(sessionPath, 'utf8')).session); if (error) throw error;
    const e = await db.from('employees').select('id').eq('status', 'active').limit(1).single(); if (e.error) throw e.error; employee = e.data.id;
    const p = await db.from('products').insert(Array.from({ length: 5 }, (_, i) => ({ name: `TEST Multi issue ${crypto.randomUUID()} ${i}`, unit: 'dona', stock_qty: 10, last_price: 0 }))).select('id'); if (p.error) throw p.error; ids = p.data.map(p => p.id);
  });
  afterAll(async () => { for (const id of ids) { const s = await stock(id); const r = await db.rpc('save_product_inventory', { _key: crypto.randomUUID(), _product_id: id, _quantity: 0, _expected_stock: s, _changes: {}, _comment: 'TEST ko‘p mahsulot sinovi yakuni' }); if (r.error) throw r.error; } });
  async function stock(id: string) { const r = await db.from('products').select('stock_qty').eq('id', id).single(); if (r.error) throw r.error; return r.data.stock_qty; }
  const issue = (items: typeof payload, document: string = crypto.randomUUID()) => db.rpc('issue_employee_products', { _key: document, _employee_id: employee, _items: items });
  it('five products and repeated rows debit once: 10 - (2+3)=5', async () => {
    key = crypto.randomUUID(); payload = [...ids.map(product_id => ({ product_id, quantity: 2 })), { product_id: ids[0], quantity: 3 }];
    const r = await issue(payload, key); expect(r.error).toBeNull();
    expect(await stock(ids[0])).toBe(5); expect(await stock(ids[1])).toBe(8);
    const m = await db.from('stock_movements').select('id,recipient_employee_id,quantity').eq('issue_document_id', key); expect(m.error).toBeNull(); expect(m.data).toHaveLength(6); expect(m.data?.every(row => row.recipient_employee_id === employee)).toBe(true);
    const d = await db.from('stock_issue_documents').select('employee_id,payload').eq('id', key).single(); expect(d.error).toBeNull(); expect(d.data?.employee_id).toBe(employee);
  });
  it('retry applies no second debit', async () => { const r = await issue(payload, key); expect(r.error).toBeNull(); expect(r.data).toMatchObject({ replayed: true }); expect(await stock(ids[0])).toBe(5); });
  it('insufficient last item saves neither document nor earlier products', async () => { const k = crypto.randomUUID(); const r = await issue([{ product_id: ids[0], quantity: 1 }, { product_id: ids[4], quantity: 100 }], k); expect(r.error?.message).toContain('Yetarli qoldiq'); expect(await stock(ids[0])).toBe(5); const d = await db.from('stock_issue_documents').select('id').eq('id', k); expect(d.data).toHaveLength(0); });
  it('duplicate total larger than stock is rejected', async () => { const r = await issue([{ product_id: ids[0], quantity: 3 }, { product_id: ids[0], quantity: 3 }]); expect(r.error?.message).toContain('Yetarli qoldiq'); expect(await stock(ids[0])).toBe(5); });
  it('concurrent identical requests create one movement', async () => { const k = crypto.randomUUID(); const results = await Promise.all([issue([{ product_id: ids[1], quantity: 1 }], k), issue([{ product_id: ids[1], quantity: 1 }], k)]); expect(results.every(r => !r.error)).toBe(true); expect(await stock(ids[1])).toBe(7); const m = await db.from('stock_movements').select('id').eq('issue_document_id', k); expect(m.data).toHaveLength(1); });
  it('single-product issue still works', async () => { const r = await issue([{ product_id: ids[2], quantity: 1 }]); expect(r.error).toBeNull(); expect(await stock(ids[2])).toBe(7); });
  it('history cannot be partially edited or deleted', async () => { const m = await db.from('stock_movements').select('id').eq('issue_document_id', key).limit(1).single(); if (!m.data) throw new Error('Missing movement'); const u = await db.from('stock_movements').update({ quantity: 1 }).eq('id', m.data.id); expect(u.error?.message).toContain('o‘zgartirilmaydi'); const d = await db.from('stock_movements').delete().eq('id', m.data.id); expect(d.error?.message).toContain('o‘zgartirilmaydi'); });
  it('direct inserts into existing document are rejected', async () => { const r = await db.from('stock_movements').insert({ issue_document_id: key, product_id: ids[0], recipient_employee_id: employee, direction: 'out', quantity: 1 }); expect(r.error?.message).toContain('himoyalangan API'); expect(await stock(ids[0])).toBe(5); });
  it('anonymous API is denied', async () => { const anon = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }); const r = await anon.rpc('issue_employee_products', { _key: crypto.randomUUID(), _employee_id: employee, _items: payload }); expect(r.error).not.toBeNull(); });
});