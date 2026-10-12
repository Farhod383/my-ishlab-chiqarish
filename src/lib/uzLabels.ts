// Uzbek (Latin) display labels for status/priority codes used in exported reports.
// DB codes stay unchanged; only the shown text is translated.
export const UZ_LABELS: Record<string, string> = {
  pending: "Kutilmoqda",
  not_started: "Boshlanmagan",
  in_progress: "Jarayonda",
  active: "Faol",
  completed: "Tugallangan",
  done: "Bajarilgan",
  finished: "Tugallangan",
  delayed: "Kechikkan",
  overdue: "Muddati o'tgan",
  cancelled: "Bekor qilingan",
  canceled: "Bekor qilingan",
  paused: "To'xtatilgan",
  on_hold: "To'xtatilgan",
  blocked: "Bloklangan",
  skipped: "O'tkazib yuborilgan",
  on_time: "Muddatida",
  risk: "Xavfli",
  normal: "Oddiy",
  exception: "Istisno",
  high: "Yuqori",
  urgent: "Shoshilinch",
  low: "Past",
  medium: "O'rtacha",
  approved: "Tasdiqlangan",
  rejected: "Rad etilgan",
  not_checked: "Tekshirilmagan",
  checked: "Tekshirilgan",
  passed: "O'tdi",
  failed: "O'tmadi",
  qc_pending: "OTK kutilmoqda",
  fulfilled: "Ta'minlandi",
  open: "Ochiq",
  closed: "Yopilgan",
  paid: "To'langan",
  unpaid: "To'lanmagan",
  partial: "Qisman",
  draft: "Qoralama",
  returned: "Qaytarilgan",
  inactive: "Nofaol",
  dismissed: "Bo'shagan",
};

export const uzLabel = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  return UZ_LABELS[s] ?? UZ_LABELS[s.toLowerCase()] ?? s;
};


/** Technical audit action codes → Uzbek. */
export const UZ_ACTIONS: Record<string, string> = {
  "daily_task.create": "Kunlik topshiriq yaratildi",
  "daily_task.update": "Kunlik topshiriq yangilandi",
  "kassa.expense.create": "Kassa chiqimi qo'shildi",
  "kassa.expense.update": "Kassa chiqimi tahrirlandi",
  "kassa.expense.delete": "Kassa chiqimi o'chirildi",
  "kassa.expense.BLOCKED": "Kassa chiqimi bloklandi",
  "kassa.income.create": "Kassa kirimi qo'shildi",
  "kassa.income.update": "Kassa kirimi tahrirlandi",
  "kassa.income.delete": "Kassa kirimi o'chirildi",
  "kassa.employee.status": "Xodim holati o'zgartirildi",
};

/** JSON field names shown in audit details → Uzbek. */
export const UZ_FIELDS: Record<string, string> = {
  status: "holat", name: "nomi", address: "manzil", client_type: "mijoz turi", contact_person: "mas'ul shaxs",
  created_by: "kiritgan", email: "email", note: "izoh", partnership_start: "hamkorlik boshlanishi",
  phone: "telefon", phone2: "telefon 2", responsible_employee_id: "mas'ul xodim", movements: "harakatlar",
  started_at: "boshlangan", supplier: "yetkazib beruvchi", order_id: "zakaz", product_name: "mahsulot",
  priority: "prioritet", quantity: "miqdor", amount: "summa", currency: "valyuta", comment: "izoh",
};

const CODE_RE = new RegExp(`\\b(${Object.keys(UZ_LABELS).filter((k) => k.includes("_")).join("|")})\\b`, "g");
const AFTER_RE = new RegExp(`(status:?\\s*|holat:?\\s*|→\\s*)(${Object.keys(UZ_LABELS).join("|")})\\b`, "gi");
const BEFORE_RE = new RegExp(`\\b(${Object.keys(UZ_LABELS).join("|")})(\\s*→)`, "gi");

/** Translate code-like tokens inside free text (audit details etc.). */
export function uzText(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (UZ_ACTIONS[s]) return UZ_ACTIONS[s];
  if (UZ_LABELS[s]) return UZ_LABELS[s];
  return s
    .replace(AFTER_RE, (_m, p: string, c: string) => p + (UZ_LABELS[c.toLowerCase()] ?? c))
    .replace(BEFORE_RE, (_m, c: string, a: string) => (UZ_LABELS[c.toLowerCase()] ?? c) + a)
    .replace(CODE_RE, (c) => UZ_LABELS[c] ?? c)
    .replace(/\bstatus\b/g, "holat");
}

export const uzAction = (a: unknown): string => {
  const s = String(a ?? "");
  return UZ_ACTIONS[s] ?? uzText(s);
};
export const uzField = (k: string): string => UZ_FIELDS[k] ?? k;
