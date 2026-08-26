import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";


export interface SearchOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  options: SearchOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  /** When set, an extra item that resets the value to "" is rendered on top. */
  clearLabel?: string;
}

/**
 * Universal searchable select — touch-friendly and fully keyboard accessible
 * (type to filter, ↑ ↓ to move, Enter to pick, Esc to close, Tab to leave).
 */
export default function SearchableSelect({
  options, value, onChange,
  placeholder = "Tanlang",
  searchPlaceholder = "🔍 Qidirish...",
  emptyText = "Topilmadi",
  disabled, className, clearLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse") {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
          className={cn(
            "w-full justify-between font-normal min-h-11 h-auto py-2 touch-manipulation cursor-pointer",
            className
          )}
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command loop>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[min(60vh,320px)] overflow-y-auto">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {clearLabel && (
                <CommandItem
                  value={clearLabel}
                  onSelect={() => { onChange(""); setOpen(false); }}
                  className="min-h-11 cursor-pointer text-muted-foreground"
                >
                  <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{clearLabel}</span>
                </CommandItem>
              )}
              {options.map(o => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""}`}
                  onSelect={() => { onChange(o.value); setOpen(false); }}
                  className="min-h-11 cursor-pointer"
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="ml-2 text-xs text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

