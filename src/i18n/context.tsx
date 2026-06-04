import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { uz, ru, uzc, type Translations } from "./uz";
import { localizeName } from "@/lib/translit";


export type Locale = "uz" | "ru" | "uzc";

interface I18nContextType {
  locale: Locale;
  t: Translations;
  setLocale: (l: Locale) => void;
  available: { code: Locale; label: string }[];
}

const dict: Record<Locale, Translations> = { uz, ru, uzc };

const I18nContext = createContext<I18nContextType>({
  locale: "uz", t: uz, setLocale: () => {},
  available: [{ code: "uz", label: uz.meta.label }, { code: "ru", label: ru.meta.label }, { code: "uzc", label: uzc.meta.label }],
});

export const useI18n = () => useContext(I18nContext);

/** Hook returning a memoized function that maps any stored name to the active UI locale. */
export const useLocalize = () => {
  const { locale } = useI18n();
  return useMemo(() => (name?: string | null) => localizeName(name ?? "", locale), [locale]);
};

const LS_KEY = "erp_locale";

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY)) as Locale | null;
    return saved && dict[saved] ? saved : "uz";
  });
  useEffect(() => { localStorage.setItem(LS_KEY, locale); }, [locale]);
  const setLocale = (l: Locale) => setLocaleState(l);

  return (
    <I18nContext.Provider value={{
      locale, t: dict[locale], setLocale,
      available: [
        { code: "uz", label: uz.meta.label },
        { code: "ru", label: ru.meta.label },
        { code: "uzc", label: uzc.meta.label },
      ],
    }}>
      {children}
    </I18nContext.Provider>
  );
};
