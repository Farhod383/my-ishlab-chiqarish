import type { AppRole } from '@/auth/AuthContext';

export const canEditBarcode = (roles: AppRole[]) => roles.some(r => r === 'admin' || r === 'warehouse');
export const validManualBarcode = (code: string, optional = false) => {
  const value = code.trim();
  return value === '' ? optional : /^[ -~]+$/.test(value);
};