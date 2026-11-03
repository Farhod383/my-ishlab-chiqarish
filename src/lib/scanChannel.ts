// Yagona global skaner kanali: bir vaqtda faqat eng yuqori (oxirgi ochilgan)
// oynaning skaner tinglovchisi klaviatura hodisalarini qayta ishlaydi.
// Shuning uchun dialog ichidagi skaner asosiy sahifa qidiruviga "oqizib" yubormaydi.

type ScanKeyHandler = (e: KeyboardEvent) => void;

const handlers: ScanKeyHandler[] = [];
let installed = false;

const globalKeydown = (e: KeyboardEvent) => {
  const top = handlers[handlers.length - 1];
  if (top) top(e);
};

/** Tinglovchini stekka qo'shadi; oxirgi qo'shilgani faol bo'ladi. Tozalash funksiyasini qaytaradi. */
export function registerScanHandler(handler: ScanKeyHandler): () => void {
  handlers.push(handler);
  if (!installed && typeof window !== "undefined") {
    window.addEventListener("keydown", globalKeydown, true);
    installed = true;
  }
  return () => {
    const i = handlers.indexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** Faol tinglovchilar soni (testlar uchun). */
export function scanHandlerCount(): number {
  return handlers.length;
}
