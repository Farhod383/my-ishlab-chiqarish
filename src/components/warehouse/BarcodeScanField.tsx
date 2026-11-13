import { useWarehouseText } from "@/i18n/warehouseContext";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScanBarcode } from "lucide-react";
import { normalizeScan } from "@/lib/scanCode";
import { SCAN_MODIFIERS } from "@/lib/issueScan";
import { registerScanHandler } from "@/lib/scanChannel";

interface Props {
  id: string;
  value: string;
  onChange: (code: string) => void;
  onScanned?: (code: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Skaner belgilarni juda tez yozadi (<35 ms); Enter kod oxirini bildiradi.
const RAPID_GAP_MS = 35;
const RESET_GAP_MS = 150;

/**
 * Shtrix-kod maydoni + "Skanerlash" tugmasi.
 * Tugma bosilganda maydon fokusga olinadi va qurolga olinadi: skaner o'qigan kod
 * aynan shu maydonga yoziladi (Enter qo'shilmaydi), boshqa maydonlarga oqmaydi.
 */
export default function BarcodeScanField({ id, value, onChange, onScanned, disabled, placeholder }: Props) {
  const wt = useWarehouseText();
  const [armed, setArmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef({ armed: false, value });
  stateRef.current.value = value;
  stateRef.current.armed = armed;

  const arm = () => {
    setArmed(true);
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  useEffect(() => {
    let buffer = "", last = 0;
    const commit = (raw: string) => {
      const code = normalizeScan(raw);
      buffer = "";
      if (!code) return;
      onChange(code);
      onScanned?.(code);
      inputRef.current?.focus();
    };
    const keydown = (e: KeyboardEvent) => {
      if (!stateRef.current.armed) return;
      if (SCAN_MODIFIERS.has(e.key)) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const now = performance.now();
      const gap = now - last; last = now;
      if (gap > RESET_GAP_MS) buffer = "";
      if (e.key === "Enter" || e.key === "Tab") {
        // Enter qiymatga qo'shilmasin va forma yuborilmasin.
        e.preventDefault(); e.stopPropagation();
        commit(buffer);
        return;
      }
      if (e.key === "Escape") { setArmed(false); buffer = ""; return; }
      if (e.key.length !== 1) return;
      // Qurollangan holatda barcha belgilar buferga olinadi — boshqa maydonlarga tushmaydi.
      e.preventDefault(); e.stopPropagation();
      buffer += e.key;
    };
    const unregister = registerScanHandler(keydown);
    return unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex gap-2">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? wt("Shtrix-kod")}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); } }}
        onFocus={() => setArmed(true)}
        onBlur={() => setArmed(false)}
      />
      <Button type="button" variant={armed ? "secondary" : "outline"} disabled={disabled} onClick={arm} aria-label={wt("Skanerlash")}>
        <ScanBarcode className="h-4 w-4" />
      </Button>
    </div>
  );
}
