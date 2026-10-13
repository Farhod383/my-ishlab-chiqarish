// Daily tasks module only: which HR employees may appear (active production staff).
const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[’‘ʻʼ`´]/g, "'").replace(/\s+/g, " ").trim();

const EXCLUDED = [
  "hr", "kadr", "xodimlar bo'limi", "отдел кадр", "buxgalter", "бухгалтер", "hisobchi",
  "marketing", "маркетинг", "sotuv", "менеджер по продаж", "inspektor", "инспектор",
  "ta'minot", "taminot", "snab", "снаб", "qorovul", "охран", "сторож",
  "otk", "отк", "sifat nazorat", "контроль качества", "технический контрол",
];
const WORD_KEYS = new Set(["hr", "otk", "отк"]);

export function isDailyTaskEligible(e: { status?: string | null; department?: string | null; position?: string | null } | null | undefined): boolean {
  if (!e || (e.status ?? "active") !== "active") return false;
  const text = ` ${norm(e.department)} | ${norm(e.position)} `;
  return !EXCLUDED.some((k) => (WORD_KEYS.has(k)
    ? new RegExp(`(^|[^a-zа-я])${k}([^a-zа-я]|$)`).test(text)
    : text.includes(k)));
}
