import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickerProduct {
  id: string;
  name: string;
  unit?: string | null;
  stock_qty?: number | null;
}

interface Props {
  products: PickerProduct[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Universal searchable product picker.
 * Whole field is a touch-friendly button — tapping anywhere opens the dropdown.
 */
export default function ProductPicker({ products, value, onChange, placeholder = "Mahsulot tanlang", emptyText = "Topilmadi", disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const selected = products.find(p => p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
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
          <span className="truncate text-left">
            {selected
              ? `${selected.name}${selected.stock_qty != null ? ` — ${selected.stock_qty} ${selected.unit ?? ""}` : ""}`
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Qidirish..." />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {products.map(p => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.unit ?? ""}`}
                  onSelect={() => { onChange(p.id); setOpen(false); }}
                  className="min-h-11 cursor-pointer"
                >
                  <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.stock_qty != null && (
                    <span className="ml-2 text-xs text-muted-foreground font-mono">
                      {p.stock_qty} {p.unit ?? ""}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
