import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

const fmt = (iso: string) => iso.split("-").reverse().join(".");

/**
 * Date picker that displays DD.MM.YYYY (e.g. 12.10.2026) instead of the
 * browser's native date format. The stored value stays ISO "YYYY-MM-DD";
 * this is display-only and never shifts the calendar day.
 */
export default function DateInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(() => fmt(value));
  useEffect(() => { setText(fmt(value)); }, [value]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    let m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
    let day = 0, month = 0, year = 0;
    if (m) { day = +m[1]; month = +m[2]; year = +m[3]; }
    else {
      m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
      if (m) { year = +m[1]; month = +m[2]; day = +m[3]; }
    }
    if (m && year >= 1900 && year <= 2200 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
        const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (iso !== value) onChange(iso);
        return;
      }
    }
    setText(fmt(value));
  };

  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      className={className}
      inputMode="numeric"
      placeholder="KK.OY.YYYY"
    />
  );
}
