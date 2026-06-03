import * as React from "react";
import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<"input">, "type" | "onFocus"> & {
  selectOnFocus?: boolean;
};

/**
 * Number input that selects its current value on focus, so typing replaces the
 * old value instead of appending to it ("1" + "5" => "5", not "15").
 */
const NumberInput = React.forwardRef<HTMLInputElement, Props>(
  ({ selectOnFocus = true, onClick, ...props }, ref) => {
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      if (selectOnFocus) {
        // setTimeout so the browser's own focus-positioning doesn't fight us
        setTimeout(() => {
          try { e.target.select(); } catch {}
        }, 0);
      }
    };
    return (
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        onFocus={handleFocus}
        onClick={(e) => { (e.target as HTMLInputElement).select?.(); onClick?.(e); }}
        {...props}
      />
    );
  }
);
NumberInput.displayName = "NumberInput";

export default NumberInput;
