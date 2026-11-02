// Skaner kodlarini normallashtirish: til/klaviatura joylashuviga bog'liq bo'lmasin.
// RU joylashuvda ERP000000123 -> УКЗ000000123 ko'rinishida keladi; ikkala variantni ham tekshiramiz.

const RU_TO_EN: Record<string, string> = {
  "й": "q", "ц": "w", "у": "e", "к": "r", "е": "t", "н": "y", "г": "u", "ш": "i", "щ": "o", "з": "p",
  "ф": "a", "ы": "s", "в": "d", "а": "f", "п": "g", "р": "h", "о": "j", "л": "k", "д": "l",
  "я": "z", "ч": "x", "с": "c", "м": "v", "и": "b", "т": "n", "ь": "m",
};

/** Bo'sh joylar, Enter va boshqaruv belgilarini olib tashlaydi, katta harfga o'tkazadi. */
export function normalizeScanCode(raw: string): string {
  return (raw ?? "").replace(/[\x00-\x1f\x7f]+/g, "").replace(/\s+/g, "").toUpperCase();
}

/** RU klaviatura joylashuvida yozilgan kodni EN ekvivalentiga o'giradi. */
export function ruLayoutToEn(code: string): string {
  return code.split("").map((ch) => RU_TO_EN[ch.toLowerCase()] ?? ch).join("").toUpperCase();
}

/** Avval original kod, keyin klaviatura varianti — ikkalasi ham tekshiriladi. */
export function scanCodeVariants(raw: string): string[] {
  const orig = normalizeScanCode(raw);
  const alt = ruLayoutToEn(orig);
  return [...new Set([orig, alt].filter(Boolean))];
}
