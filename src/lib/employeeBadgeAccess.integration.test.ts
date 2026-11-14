import { beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const admin2Path = process.env.BADGE_ADMIN2_SESSION;
const otherPath = process.env.BADGE_OTHER_SESSION;
describe.skipIf(!admin2Path || !otherPath)('employee badge API permissions', () => {
  const client = () => createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin2 = client(), other = client();
  let rows: { id: string; badge_code: string }[] = [];
  beforeAll(async () => {
    if (!admin2Path || !otherPath) throw new Error('Both test sessions are required');
    await admin2.auth.setSession(JSON.parse(readFileSync(admin2Path, 'utf8')).session);
    await other.auth.setSession(JSON.parse(readFileSync(otherPath, 'utf8')).session);
    const result = await admin2.rpc('get_employee_badges');
    if (result.error) throw result.error;
    rows = result.data ?? [];
  });
  it('only Admin 2 can list all badges', async () => {
    expect(rows.length).toBeGreaterThan(1);
    expect((await other.rpc('get_employee_badges')).error).not.toBeNull();
  });
  it('direct column reads are denied, including to ordinary admins', async () => {
    expect((await other.from('employees').select('badge_code')).error).not.toBeNull();
  });
  it('ordinary admin cannot change employee code', async () => {
    const row = rows[0];
    expect((await other.rpc('set_employee_badge', { _employee_id: row.id, _code: row.badge_code, _expected_code: row.badge_code })).error).not.toBeNull();
  });
  it('rejects codes belonging to another employee', async () => {
    expect((await admin2.rpc('set_employee_badge', { _employee_id: rows[0].id, _code: rows[1].badge_code, _expected_code: rows[0].badge_code })).error?.message).toContain('boshqa xodim');
  });
  it('retained old labels resolve to the same HR ID', async () => {
    const result = await admin2.from('employee_badge_aliases').select('code,employee_id');
    if (result.error) throw result.error;
    expect(result.data?.length).toBeGreaterThan(0);
    for (const alias of result.data ?? []) {
      const resolved = await admin2.rpc('resolve_employee_badge', { _code: alias.code });
      expect(resolved.data?.map(e => e.id)).toEqual([alias.employee_id]);
    }
  });
  it('rejects a nonnumeric suffix through the API', async () => {
    const row = rows[0];
    expect((await admin2.rpc('set_employee_badge', { _employee_id: row.id, _code: 'MCT00A55', _expected_code: row.badge_code })).error?.message).toContain('0–9');
  });
  it('MCT0012 and the verified MCT0055 alias resolve to Bakitov Jansaid', async () => {
    for (const code of ['MCT0012', 'MCT0055']) {
      const result = await admin2.rpc('resolve_employee_badge', { _code: code });
      expect(result.error).toBeNull();
      expect(result.data?.map(e => e.id)).toEqual(['0e2820b9-9cb6-4da9-90db-f6bda45ef8aa']);
    }
  });
});