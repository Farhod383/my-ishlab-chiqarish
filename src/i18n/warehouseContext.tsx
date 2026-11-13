import { createContext, useContext, useMemo, type ReactNode } from "react";
import { I18nScope } from "./context";
import { warehouseText } from "./warehouseRu";

const WarehouseLanguage = createContext(false);
const unchanged = (text: string) => text;

/** This boundary also reaches portalled dialogs; other ERP modules keep their locale. */
export function WarehouseRussian({ children }: { children: ReactNode }) {
  return <WarehouseLanguage.Provider value={true}><I18nScope locale="ru">{children}</I18nScope></WarehouseLanguage.Provider>;
}

export function useWarehouseText() {
  const enabled = useContext(WarehouseLanguage);
  return useMemo(() => enabled ? warehouseText : unchanged, [enabled]);
}

export function useWarehouseError() {
  const enabled = useContext(WarehouseLanguage);
  return (message: string) => {
    if (!enabled) return message;
    const translated = warehouseText(message);
    if (translated !== message || /[А-Яа-яЁё]/.test(message)) return translated;
    if (/stock|qoldiq|yetarli|insufficient/i.test(message)) return "Недостаточный остаток или остаток уже изменён. Обновите данные и повторите попытку.";
    if (/barcode|shtrix|duplicate|unique|kod.*band/i.test(message)) return "Код уже используется или введён некорректно. Проверьте штрихкод.";
    if (/permission|forbidden|denied|ruxsat|unauthorized/i.test(message)) return "Недостаточно прав для этого действия.";
    if (/network|fetch|offline|internet/i.test(message)) return "Нет связи. Проверьте подключение и повторите попытку.";
    if (/expense|balance|mablag|cash|ta.minot/i.test(message)) return "Не удалось сохранить расходы. Проверьте сумму и доступные средства.";
    return "Не удалось выполнить действие. Проверьте введённые данные и обновите страницу.";
  };
}