import { Button, ColorPicker, Popover } from "@/components";
import { colorHex, type RgbColor, twMerge } from "@/utils";

import { Swatch } from "./ColorMark";

export interface SwatchPickerProps {
  readonly label: string;
  readonly value: RgbColor;
  readonly onValueChange: (next: RgbColor) => void;
  /** The picker closed, for a caller that writes the colour once rather than per change. */
  readonly onClose?: () => void;
  /** The swatch's opacity, 1 unless set. */
  readonly alpha?: number;
  /** The colour's hex digits stand beside the swatch. */
  readonly hex?: boolean;
  /** The swatch draws faded, for a value the reader has not written. */
  readonly muted?: boolean;
  readonly disabled?: boolean;
  readonly "data-ui"?: string;
}

/** A colour as a swatch button that opens a picker beside it. */
export function SwatchPicker({
  label,
  value,
  onValueChange,
  onClose,
  alpha = 1,
  hex = false,
  muted = false,
  disabled,
  "data-ui": dataUi,
}: SwatchPickerProps) {
  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <Popover.Trigger
        disabled={disabled}
        render={
          <Button
            variant="ghost"
            size="xs"
            compact
            aria-label={label}
            left={
              <Swatch
                rgba={[...value, alpha]}
                className={twMerge("size-4", muted && "opacity-50")}
              />
            }
            className={hex ? "font-mono text-code" : undefined}
          >
            {hex ? colorHex(value) : undefined}
          </Button>
        }
      />
      <Popover.Content
        side="left"
        align="center"
        sideOffset={12}
        data-ui={dataUi}
        aria-label={label}
        className="w-60 p-3"
      >
        <ColorPicker value={value} label={label} onValueChange={onValueChange} />
      </Popover.Content>
    </Popover.Root>
  );
}
