import { CaretDownIcon, FrameCornersIcon } from "@phosphor-icons/react";
import type { ComponentProps, ReactNode } from "react";

import { ButtonGroup, IconButton, Menu, Tooltip } from "@/components";
import { twMerge } from "@/utils";

/** The glass bar of switches and menus over a preview's top right corner. */
export function ViewportControls({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      /* DS-GLASS, DS-RADIUS, DS-VEIL. The descendant selector outranks each button's own size. */
      className={twMerge(
        "absolute top-2 right-2 flex items-center gap-0.5 rounded-md border border-surface-veil bg-scrim p-1 shadow-md backdrop-blur-sm [&_button]:text-meta",
        className,
      )}
    />
  );
}

/** A rule between two groups of a `ViewportControls` bar. */
export function ControlDivider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-surface-veil" />;
}

/** The button that frames the camera on the subject again. */
export function FitButton({ label, onFit }: { label: string; onFit: () => void }) {
  return <IconButton icon={<FrameCornersIcon />} onClick={onFit} label={label} />;
}

export interface SplitToggleProps {
  readonly label: string;
  readonly pressed: boolean;
  readonly icon: ReactNode;
  readonly onClick: () => void;
  /** The caret's name. */
  readonly menuLabel: string;
  /** The `Menu.Content` the caret opens. */
  readonly children: ReactNode;
}

/** A preview switch with a caret beside it that opens the switch's options. */
export function SplitToggle({
  label,
  pressed,
  icon,
  onClick,
  menuLabel,
  children,
}: SplitToggleProps) {
  return (
    <ButtonGroup className="overflow-hidden rounded-md bg-surface-veil">
      <IconButton pressed={pressed} icon={icon} onClick={onClick} label={label} />
      <Menu.Root>
        <Tooltip content={menuLabel}>
          <Menu.Trigger
            render={
              <IconButton
                className="w-5 text-surface-400"
                aria-label={menuLabel}
                icon={<CaretDownIcon className="size-3" />}
              />
            }
          />
        </Tooltip>
        {children}
      </Menu.Root>
    </ButtonGroup>
  );
}
