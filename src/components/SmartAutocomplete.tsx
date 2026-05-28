import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  fieldKey: string;            // e.g. "supplier", "source", "country", "phone", "recipient"
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Free-text input with suggestions sourced from form_history table.
 * On every save in parent, the parent should call rememberFormValue() to persist.
 */
export default function SmartAutocomplete({ fieldKey, value, onChange, placeholder, className, disabled }: Props) {
  const [all, setAll] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("form_history").select("value")
        .eq("field_key", fieldKey).order("created_at", { ascending: false }).limit(200);
      const seen = new Set<string>();
      const list: string[] = [];
      (data ?? []).forEach((r: any) => {
        const v = (r.value ?? "").trim();
        if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); list.push(v); }
      });
      setAll(list);
    })();
  }, [fieldKey]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = value.trim().toLowerCase();
  const matches = q ? all.filter(v => v.toLowerCase().includes(q)).slice(0, 8) : all.slice(0, 8);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Input
        value={value}
        disabled={disabled}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-56 overflow-auto">
          {matches.map(v => (
            <button
              key={v}
              type="button"
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
              onMouseDown={(e) => { e.preventDefault(); onChange(v); setOpen(false); }}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Save a value to form_history so future autocompletes include it. */
export async function rememberFormValue(fieldKey: string, value: string | null | undefined, userId?: string | null) {
  const v = (value ?? "").trim();
  if (!v) return;
  await supabase.from("form_history").upsert(
    { field_key: fieldKey, value: v, user_id: userId ?? null },
    { onConflict: "field_key,value" }
  );
}
