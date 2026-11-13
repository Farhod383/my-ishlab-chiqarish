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