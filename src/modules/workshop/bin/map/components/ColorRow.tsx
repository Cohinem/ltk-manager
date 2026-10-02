import type { SunColor } from "@/modules/viewport";

import { SwatchPicker } from "../../values/components/SwatchPicker";

export interface ColorRowProps {
  readonly label: string;
  readonly value: SunColor;
  readonly onValueChange: (next: SunColor) => void;
}

/** One colour of a preview popover as a swatch and its hex digits, which open a picker beside it. */
export function ColorRow({ label, value, onValueChange }: ColorRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-surface-300">{label}</span>
      <SwatchPicker
        label={label}
        value={value}
        onValueChange={onValueChange}
        hex
        data-ui="ColorRow:picker"
      />
    </div>
  );
}
