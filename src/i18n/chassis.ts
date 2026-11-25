// «Shassi» moduli matnlari. Kalit — o'zbekcha (asosiy) matn; ruscha tarjima shu yerda, kirill — avtomatik.
import { useMemo } from "react";
import { useI18n } from "./context";
import { latinToCyrillic } from "@/lib/translit";
import { CHASSIS_RU } from "./chassisRu";

export function chassisText(locale: string, text: string): string {
  if (locale === "ru") return CHASSIS_RU[text] ?? text;
  if (locale === "uzc") return latinToCyrillic(text);
  return text;
}

export function useChassisText() {
  const { locale } = useI18n();
  return useMemo(() => (text: string) => chassisText(locale, text), [locale]);
}
