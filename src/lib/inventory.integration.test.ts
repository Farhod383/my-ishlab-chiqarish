import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// Opt-in real database test: uses a dedicated test product, never existing stock.
// Run with INVENTORY_TEST_SESSION pointing to a locally minted session file.
const sessionPath = process.env.INVENTORY_TEST_SESSION;
describe.skipIf(!sessionPath)('atomic inventory on a real test product', () => {
  const db = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let productId = '';
  async function stock() {
    const { data, error } = await db.from('products').select('stock_qty,last_price').eq('id', productId).single();
    if (error) throw error;
    return data;
  }
  async function inventory(target: number, expected: number, key = crypto.randomUUID()) {
    const { data, error } = await db.rpc('save_product_inventory', { _key: key, _product_id: productId, _quantity: target, _expected_stock: expected, _changes: {}, _comment: 'Avtomatik inventarizatsiya sinovi' });
    if (error) throw error;
    return data as { movement_id: string | null; before: number; after: number; delta: number; replayed: boolean };
  }
  beforeAll(async () => {
    if (!sessionPath) throw new Error('A test session is required');
    const minted = JSON.parse(readFileSync(sessionPath, 'utf8'));
    const { error: authError } = await db.auth.setSession(minted.session);
    if (authError) throw authError;
    const { data, error } = await db.from('products').insert({ name: `TEST Inventarizatsiya ${crypto.randomUUID()}`, unit: 'dona', stock_qty: 100, last_price: 0, currency: 'UZS' }).select('id').single();
    if (error) throw error;
    productId = data.id;
  });
  afterAll(async () => {
    if (productId) await inventory(0, (await stock()).stock_qty);
  });
  it('100 → 120 gives 120 and only +20 in history', async () => {
    const result = await inventory(120, 100);
    expect((await stock()).stock_qty).toBe(120);
    expect(result.delta).toBe(20);
    const { data, error } = await db.from('stock_movements').select('quantity,direction,stock_before,stock_after').eq('id', result.movement_id ?? '').single();
    if (error) throw error;
    expect(data).toMatchObject({ quantity: 20, direction: 'in', stock_before: 100, stock_after: 120 });
  });
  it('100 → 80 gives 80, not 60', async () => {
    await inventory(100, 120);
    expect((await inventory(80, 100)).delta).toBe(-20);
    expect((await stock()).stock_qty).toBe(80);
  });
  it('100 → 100 creates no movement and replays the no-change result', async () => {
    await inventory(100, 80);
    const key = crypto.randomUUID();
    const result = await inventory(100, 100, key);
    expect(result.movement_id).toBeNull();
    expect((await stock()).stock_qty).toBe(100);
    const { data, error } = await db.from('stock_movements').select('id').eq('reconciliation_key', key);
    if (error) throw error;
    expect(data).toHaveLength(0);
    expect((await inventory(100, 100, key)).replayed).toBe(true);
  });
  it('100 → 120 then an incoming 5 gives 125', async () => {
    await inventory(120, 100);
    const { error } = await db.from('stock_movements').insert({ product_id: productId, direction: 'in', quantity: 5, unit_price: 0, location: 'Sklad', source: 'TEST inventarizatsiya', created_by: (await db.auth.getUser()).data.user?.id });
    if (error) throw error;
    expect((await stock()).stock_qty).toBe(125);
  });
  it('125 minus outgoing 3 gives 122', async () => {
    const { error } = await db.from('stock_movements').insert({ product_id: productId, direction: 'out', quantity: 3, unit_price: 0, location: 'Sklad', comment: 'TEST inventarizatsiya', created_by: (await db.auth.getUser()).data.user?.id });
    if (error) throw error;
    expect((await stock()).stock_qty).toBe(122);
  });
  it('two concurrent identical saves apply only once, even after later intake', async () => {
    await inventory(100, 122);
    const key = crypto.randomUUID();
    const results = await Promise.all([inventory(120, 100, key), inventory(120, 100, key)]);
    expect((await stock()).stock_qty).toBe(120);
    expect(results.filter(r => r.replayed)).toHaveLength(1);
    const { data, error } = await db.from('stock_movements').select('id').eq('reconciliation_key', key);
    if (error) throw error;
    expect(data).toHaveLength(1);
    const { error: incomingError } = await db.from('stock_movements').insert({ product_id: productId, direction: 'in', quantity: 5, unit_price: 0, location: 'Sklad', source: 'TEST inventarizatsiya' });
    if (incomingError) throw incomingError;
    await inventory(120, 100, key);
    expect((await stock()).stock_qty).toBe(125);
  });
  it('rejects stale stock without losing another user’s movement', async () => {
    await expect(inventory(80, 120)).rejects.toMatchObject({ message: expect.stringContaining('Qoldiq boshqa operatsiya') });
    expect((await stock()).stock_qty).toBe(125);
    expect((await stock()).last_price).toBe(0);
  });
});