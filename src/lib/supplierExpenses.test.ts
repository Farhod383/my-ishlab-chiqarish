import { describe, it, expect } from 'vitest';
import { expenseTotals, validExpense, freshExpense, canChangeExpense } from './supplierExpenses';
describe('supplier expenses rules', () => {
  it('keeps UZS and USD separate', () => expect(expenseTotals([{ amount: 200000, currency: 'UZS' }, { amount: 80000, currency: 'UZS' }, { amount: 30000, currency: 'UZS' }, { amount: 20, currency: 'USD' }])).toEqual({ UZS: 310000, USD: 20 }));
  it('requires positive finite money', () => { expect(validExpense({ ...freshExpense(), employee_id: 'hr-id', amount: 200000 })).toBe(true); expect(validExpense({ ...freshExpense(), employee_id: 'hr-id', amount: -1 })).toBe(false); expect(validExpense({ ...freshExpense(), employee_id: 'hr-id', amount: Infinity })).toBe(false); });
  it('allows only two accounts and currencies', () => { expect(validExpense({ ...freshExpense(), employee_id: 'id', amount: 1, account: 'main' })).toBe(false); expect(validExpense({ ...freshExpense(), employee_id: 'id', amount: 1, currency: 'EUR' })).toBe(false); });
  it('does not give accountant delete rights or worker edits', () => { expect(canChangeExpense(['accountant'], 'a', 'b')).toBe(true); expect(canChangeExpense(['accountant'], 'a', 'b', true)).toBe(false); expect(canChangeExpense(['worker'], 'a', 'a')).toBe(false); });
  it('limits warehouse edits to own expenses', () => { expect(canChangeExpense(['warehouse'], 'a', 'a', true)).toBe(true); expect(canChangeExpense(['warehouse'], 'a', 'b')).toBe(false); });
});