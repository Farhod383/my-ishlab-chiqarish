import { useI18n } from "@/i18n/context";
import { Languages } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LanguageSwitcher() {
  const { locale, setLocale, available } = useI18n();
  return (
    <Select value={locale} onValueChange={(v) => setLocale(v as any)}>
      <SelectTrigger className="h-8 w-[160px] text-xs">
        <Languages className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {available.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
