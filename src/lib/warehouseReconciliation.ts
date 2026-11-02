import type { AppRole } from '@/auth/AuthContext';

export const SVERKA_SOURCE = 'Sverka — nakladnoysiz kirim';
export const canReconcile = (roles: AppRole[]) => roles.includes('warehouse') || roles.includes('admin');
export const canEnterMxik = (roles: AppRole[]) => roles.some(r => ['warehouse', 'chief_accountant', 'admin'].includes(r));
// quantity = yangi YAKUNIY qoldiq. Mavjud mahsulotda 0 ham ruxsat (qoldiqni nolga tushirish);
// yangi mahsulotda boshlang'ich qoldiq musbat bo'lishi shart.
export function validateReconciliation(quantity: number, price: number | null, isNew = false) {
  const qtyOk = Number.isFinite(quantity) && (isNew ? quantity > 0 : quantity >= 0);
  return qtyOk && (price === null || (Number.isFinite(price) && price >= 0));
}