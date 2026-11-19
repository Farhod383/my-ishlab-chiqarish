import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const sessionPath = process.env.EMPLOYEE_IMPORT_SESSION;
describe.skipIf(!sessionPath)('Prepared employee badge import: real Sklad API', () => {
  const db = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  beforeAll(async () => {
    if (!sessionPath) throw new Error('Sklad session required');
    const result = await db.auth.setSession(JSON.parse(readFileSync(sessionPath, 'utf8')).session);
    if (result.error) throw result.error;
  });
  const resolve = async (code: string) => {
    const r = await db.rpc('resolve_employee_badge', { _code: code });
    expect(r.error).toBeNull();
    return r.data;
  };
  it.each([
    ['MCT00117', 'Murodjonov Diyor'], ['MCT00126', 'Tuxtayeva Dilora'],
    ['MCT00127', 'Toshmatova Nigora'], ['MCT00128', 'Muratov Shokir'],
    ['MCT00129', 'Kuralov Erkin'], ['MCT00130', 'Yunusov Rustam'],
    ['MCT00131', 'Turobov Xusniddin'], ['MCT00133', 'Rasulov Dilmurod'],
    ['MCT00136', 'Karimov Adxam'], ['MCT00139', "Sherpulatov Xo'jimurod"],
  ])('%s resolves the exact active new employee %s', async (code, name) => {
    expect(await resolve(code)).toEqual([expect.objectContaining({ full_name: name, status: 'active' })]);
  });
  it.each([
    ['MCT00132', 'MCT00118', 'Artikov Nurmuhammad'],
    ['MCT00135', 'MCT00119', 'Xodiyev Abdushukur'],
    ['MCT00137', 'MCT00120', 'Azimov Shuxrat'],
    ['MCT00138', 'MCT00124', 'Mirzayev Doniyor'],
  ])('%s alias retains the existing %s identity', async (alias, primary, name) => {
    const a = await resolve(alias), p = await resolve(primary);
    expect(a).toEqual(p);
    expect(a).toEqual([expect.objectContaining({ full_name: name })]);
  });
  it('conflicting MCT00121 retains Atabayev; Jansaid retains MCT0012', async () => {
    expect(await resolve('MCT00121')).toEqual([expect.objectContaining({ full_name: 'Atabayev Sayfiddin' })]);
    expect(await resolve('MCT0012')).toEqual([expect.objectContaining({ full_name: 'Bakitov Jansaid' })]);
  });
  it('MCT00134 remains unassigned', async () => { expect(await resolve('MCT00134')).toEqual([]); });
  it('MCT00141 alias selects Soyipov Sarvar without replacing MCT00140', async () => {
    const alias = await resolve('MCT00141');
    expect(alias).toEqual(await resolve('MCT00140'));
    expect(alias).toEqual([expect.objectContaining({ full_name: 'Soyipov Sarvar', status: 'active' })]);
  });
  it('Sklad cannot invoke privileged prepared-code imports', async () => {
    const r = await db.rpc('import_prepared_employee_badges', { _rows: [{ code: 'MCT00134', name: 'Forbidden import' }] });
    expect(r.error).not.toBeNull();
  });
});