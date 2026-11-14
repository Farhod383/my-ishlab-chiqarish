import { normalizeScan } from './scanCode';

export function employeeBadgeCode(raw: string): string {
  const code = normalizeScan(raw);
  if (!/^MCT[0-9]{1,61}$/.test(code)) throw new Error('MCT dan keyin faqat 0–9 raqamlar bo‘lishi kerak (1–61 raqam)');
  return code;
}