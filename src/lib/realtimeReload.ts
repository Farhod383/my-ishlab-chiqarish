/**
 * Realtime o'zgarishlarda sahifani qayta yuklashni bitta qilib birlashtiradi.
 *
 * Bitta amal bazada ko'pincha bir nechta o'zgarish beradi (masalan bosqich + zakaz holati).
 * Har biriga alohida to'liq qayta yuklash ekranni "pirillatadi" va bazani ortiqcha yuklaydi.
 * `schedule()` oxirgi o'zgarishdan keyin `delayMs` kutib, faqat BIR marta `load()` ni chaqiradi.
 */
export function createReloader(load: () => unknown, delayMs = 700) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void load();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
