import { describe, expect, it } from 'vitest';
import { warehouseNotificationTitle } from './warehouseNotifications';
import { warehouseText } from './warehouseRu';
describe('warehouse presentation isolation', () => {
 it('preserves product payloads and the stored notification object', () => {
  const n = { title: 'Sklad chiqimi — ERP000000123 Труба М12', entity: 'stock_movement' };
  expect(warehouseNotificationTitle(n).endsWith('ERP000000123 Труба М12')).toBe(true);
  expect(n.title).toBe('Sklad chiqimi — ERP000000123 Труба М12');
 });
 it('does not translate identical prefixes from another module', () => {
  const n = { title: 'Sklad chiqimi — ERP000000123', entity: 'order' };
  expect(warehouseNotificationTitle(n)).toBe(n.title);
 });
 it('does not rewrite arbitrary catalog identities or codes', () => {
  for (const value of ['ERP000000123', 'MCT00101', 'Труба Ду25 3-51', '12345678901234567']) expect(warehouseText(value)).toBe(value);
 });
});
