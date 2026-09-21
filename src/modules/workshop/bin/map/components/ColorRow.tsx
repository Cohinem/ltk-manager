import { Button, ColorPicker, Popover } from "@/components";
import type { SunColor } from "@/modules/viewport";
import { colorHex } from "@/utils";

import { Swatch } from "../../values/components/ColorMark";

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
      <Popover.Root>
        <Popover.Trigger
          render={
            <Button
              variant="ghost"
              size="xs"
              compact
              aria-label={label}
              left={<Swatch rgba={[...value, 1]} className="h-4 w-4" />}
              className="font-mono text-code"
            >
              {colorHex(value)}
            </Button>
          }
        />
        <Popover.Portal>
          <Popover.Positioner side="left" align="center" sideOffset={12}>
            <Popover.Popup data-ui="ColorRow:picker" aria-label={label} className="w-60 p-3">
              <ColorPicker value={value} label={label} onValueChange={onValueChange} />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
