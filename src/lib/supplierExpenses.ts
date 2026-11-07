export const EXPENSE_CATEGORIES = ['Benzin', 'Ovqat', 'Avtoturargoh', 'Yo‘l haqi', 'Yuklash va tushirish', 'Boshqa xarajatlar'];
export type ExpenseDraft = { category: string; amount: number; currency: string; account: string; employee_id: string; comment: string; spent_at: string };
export function expenseTotals(rows: Pick<ExpenseDraft, 'amount' | 'currency'>[]) {
  return rows.reduce((s, r) => { if (r.currency === 'UZS' || r.currency === 'USD') s[r.currency] += Number(r.amount) || 0; return s; }, { UZS: 0, USD: 0 });
}
export function validExpense(r: ExpenseDraft) {
  return !!r.category.trim() && Number.isFinite(r.amount) && r.amount > 0 && ['UZS', 'USD'].includes(r.currency) && ['supply', 'supply2'].includes(r.account) && !!r.employee_id && Number.isFinite(new Date(r.spent_at).getTime());
}
export function canChangeExpense(roles: string[], userId: string | undefined, owner: string, deleting = false) {
  return roles.includes('admin') || roles.includes('chief_accountant') || (!deleting && roles.includes('accountant')) || (userId === owner && roles.some(r => ['warehouse', 'supply'].includes(r)));
}
export const freshExpense = (): ExpenseDraft => ({ category: 'Benzin', amount: 0, currency: 'UZS', account: 'supply', employee_id: '', comment: '', spent_at: new Date().toISOString() });