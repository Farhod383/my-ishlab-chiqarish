import { normalizeScan } from './scanCode';

export function employeeBadgeCode(raw: string): string {
  const code = normalizeScan(raw);
  if (!/^MCT[A-Z0-9]{1,61}$/.test(code)) throw new Error('Xodim kodi MCT bilan boshlanishi kerak (4–64 belgi)');
  return code;
}