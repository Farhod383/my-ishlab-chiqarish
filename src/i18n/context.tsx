import React, { createContext, useContext } from "react";
import { uz, type Translations } from "./uz";

type Locale = "uz" | "ru" | "en";

interface I18nContextType {
  locale: Locale;
  t: Translations;
}

const I18nContext = createContext<I18nContextType>({ locale: "uz", t: uz });

export const useI18n = () => useContext(I18nContext);

// For now only Uzbek, but i18n-ready
const translations: Record<Locale, Translations> = { uz, ru: uz, en: uz };

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const locale: Locale = "uz";
  return (
    <I18nContext.Provider value={{ locale, t: translations[locale] }}>
      {children}
    </I18nContext.Provider>
  );
};
