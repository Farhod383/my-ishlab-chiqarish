import type { AppRole } from '@/auth/AuthContext';

export const SVERKA_SOURCE = 'Sverka — nakladnoysiz kirim';
export const canReconcile = (roles: AppRole[]) => roles.includes('warehouse') || roles.includes('admin');
export const canEnterMxik = (roles: AppRole[]) => roles.some(r => ['warehouse', 'chief_accountant', 'admin'].includes(r));
export function validateReconciliation(quantity: number, price: number | null) {
  return Number.isFinite(quantity) && quantity > 0 && (price === null || (Number.isFinite(price) && price >= 0));
}