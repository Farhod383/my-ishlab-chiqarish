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

const pad = (n: number) => String(n).padStart(2, "0");
const TZ_OFFSET_MIN = 5 * 60; // Asia/Tashkent

export const uzDate = (d?: string | null): string => {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const t = new Date(d);
  if (isNaN(t.getTime())) return String(d);
  const x = new Date(t.getTime() + TZ_OFFSET_MIN * 60000);
  return `${pad(x.getUTCDate())}.${pad(x.getUTCMonth() + 1)}.${x.getUTCFullYear()}`;
};

export const uzDateTime = (d?: string | null): string => {
  if (!d) return "—";
  const t = new Date(d);
  if (isNaN(t.getTime())) return String(d);
  const x = new Date(t.getTime() + TZ_OFFSET_MIN * 60000);
  return `${pad(x.getUTCDate())}.${pad(x.getUTCMonth() + 1)}.${x.getUTCFullYear()} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
};
