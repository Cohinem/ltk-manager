import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { IconButton, OVERLINE, Popover, Tooltip } from "@/components";
import { twMerge } from "@/utils";

export interface PreviewPopoverProps {
  readonly label: string;
  readonly description: string;
  readonly icon: ReactNode;
  /** The reader set values of their own, which the trigger carries the accent for. */
  readonly customized: boolean;
  /** Return every value to the backdrop's own. */
  readonly onReset: () => void;
  readonly resetLabel: string;
  readonly className?: string;
  readonly "data-ui"?: string;
  /** The knobs, stacked under the title. */
  readonly children: ReactNode;
}

/** A viewport control's popover: an icon button, a titled panel of knobs, and a reset. */
export function PreviewPopover({
  label,
  description,
  icon,
  customized,
  onReset,
  resetLabel,
  className,
  "data-ui": dataUi,
  children,
}: PreviewPopoverProps) {
  return (
    <Popover.Root>
      <Tooltip content={label}>
        <Popover.Trigger
          render={
            <IconButton
              aria-label={label}
              /* DS-VEIL, DS-RADIUS */ className={
                customized ? "bg-accent-500/15 text-accent-300 hover:bg-accent-500/25" : undefined
              }
              icon={icon}
            />
          }
        />
      </Tooltip>

      <Popover.Content
        side="bottom"
        align="end"
        sideOffset={8}
        data-ui={dataUi}
        aria-label={label}
        className={twMerge("w-72 p-3 select-none", className)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <Popover.Title className={OVERLINE}>{label}</Popover.Title>
            <Popover.Description className="mt-0.5 text-meta text-surface-400">
              {description}
            </Popover.Description>
          </div>
          <IconButton
            icon={<ArrowCounterClockwiseIcon />}
            disabled={!customized}
            onClick={onReset}
            label={resetLabel}
          />
        </div>

        <div className="mt-3 flex flex-col gap-3">{children}</div>
      </Popover.Content>
    </Popover.Root>
  );
}
