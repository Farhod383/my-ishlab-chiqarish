import { describe, it, expect } from 'vitest';
import { canReconcile, canEnterMxik, validateReconciliation } from './warehouseReconciliation';

describe('warehouse reconciliation permissions', () => {
  it('warehouse may receive without invoice', () => expect(canReconcile(['warehouse'])).toBe(true));
  it('ordinary accountant cannot receive', () => expect(canReconcile(['accountant'])).toBe(false));
  it.each(['warehouse', 'chief_accountant', 'admin'] as const)('%s may enter MXIK', role => expect(canEnterMxik([role])).toBe(true));
  it.each(['accountant', 'cashier', 'worker', 'supply', 'engineer', 'hr', 'marketing', 'otk', 'manager'] as const)('%s cannot enter MXIK', role => expect(canEnterMxik([role])).toBe(false));
  it('positive quantity and optional price are allowed', () => expect(validateReconciliation(2, null)).toBe(true));
  it('zero quantity is refused', () => expect(validateReconciliation(0, 10)).toBe(false));
  it('negative price is refused', () => expect(validateReconciliation(2, -1)).toBe(false));
});