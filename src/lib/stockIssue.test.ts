import { describe, expect, it } from 'vitest';
import { newIssueLine, issueTotals } from './stockIssue';
describe('employee issue quantities', () => {
  it('sums duplicate product rows 3 + 4 = 7', () => { expect(issueTotals([{ ...newIssueLine(), product_id: 'p', quantity: 3 }, { ...newIssueLine(), product_id: 'p', quantity: 4 }]).get('p')).toBe(7); });
  it('accepts ten independently quantified products', () => { const totals = issueTotals(Array.from({ length: 10 }, (_, i) => ({ ...newIssueLine(), product_id: String(i), quantity: i + 1 }))); expect(totals.size).toBe(10); expect(totals.get('9')).toBe(10); });
  it('retains single-product operation', () => { expect(issueTotals([{ ...newIssueLine(), product_id: 'p', quantity: 2 }]).get('p')).toBe(2); });
  it.each([0, -1, NaN, Infinity])('rejects invalid quantity %s', quantity => { expect(() => issueTotals([{ ...newIssueLine(), product_id: 'p', quantity }])).toThrow(); });
});