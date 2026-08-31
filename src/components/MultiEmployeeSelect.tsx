import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchNorm, localizeName } from "@/lib/translit";
import { useI18n } from "@/i18n/context";
import { useEmployees } from "@/hooks/useEmployees";

interface Employee { id: string; full_name: string; position: string; status: string; }

interface Props {
  /** Array of employee full_names currently selected. */
  value: string[];
  onChange: (names: string[]) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Multi-select dropdown loaded from public.employees (status='active'). Supports
 * cross-script search (latin / cyrillic / russian). Stores selection by full_name
 * so it remains backward-compatible with the legacy `worker_name` text column.
 */
export default function MultiEmployeeSelect({ value, onChange, placeholder, className }: Props) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { employees } = useEmployees({ activeOnly: true });

  const filtered = employees.filter(e =>
    !query.trim() || searchNorm(e.full_name + " " + (e.position ?? "")).includes(searchNorm(query))
  );

  const toggle = (name: string) => {
    onChange(value.includes(name) ? value.filter(v => v !== name) : [...value, name]);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
            <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
              {value.length === 0 ? (placeholder ?? "Ishchilarni tanlang") : `${value.length} ta ishchi tanlandi`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="🔍 Ishchi qidirish..." value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>Topilmadi</CommandEmpty>
              <CommandGroup>
                {filtered.map(e => {
                  const checked = value.includes(e.full_name);
                  return (
                    <CommandItem key={e.id} value={e.id} onSelect={() => toggle(e.full_name)}>
                      <Check className={cn("mr-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                      <span className="flex-1 truncate">{localizeName(e.full_name, locale)}</span>
                      {e.position && <span className="ml-2 text-xs text-muted-foreground">{e.position}</span>}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(n => (
            <Badge key={n} variant="secondary" className="gap-1 pr-1">
              {localizeName(n, locale)}
              <button
                type="button"
                onClick={() => onChange(value.filter(v => v !== n))}
                className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
              ><X className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** Parse the legacy worker_name string into an array. Supports comma / newline / semicolon. */
export function parseWorkerNames(s?: string | null): string[] {
  if (!s) return [];
  return s.split(/[,\n;]+/).map(x => x.trim()).filter(Boolean);
}

/** Serialize for the worker_name text column. */
export function joinWorkerNames(arr: string[]): string {
  return arr.map(s => s.trim()).filter(Boolean).join(", ");
}
