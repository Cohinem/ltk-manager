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

/** The edge of a preview that a rail or a divider runs along. */
export type ControlsSide = "top" | "left";

export interface ViewportRailProps extends ComponentProps<"div"> {
  /** `top` is a row across the preview's top edge, `left` a column down its left edge. */
  readonly side: ControlsSide;
}

/**
 * A rail of controls docked to one edge of a preview, outside the drawn frame, as the header
 * and the toolbar of Blender and Maya are.
 */
export function ViewportRail({ side, className, ...props }: ViewportRailProps) {
  return (
    <div
      {...props}
      /* DS-GROUND. The descendant selector outranks each button's own size. */
      className={twMerge(
        "flex shrink-0 gap-0.5 border-surface-700/50 bg-surface-900 p-1 [&_button]:text-meta",
        side === "top" ? "items-center border-b" : "flex-col items-center border-r",
        className,
      )}
    />
  );
}

/** A rule between two groups of controls on a bar or a rail along `side`. */
export function ControlDivider({ side = "top" }: { side?: ControlsSide }) {
  return (
    <span
      aria-hidden
      className={twMerge(
        "shrink-0 bg-surface-veil",
        side === "top" ? "mx-0.5 h-4 w-px" : "my-0.5 h-px w-4",
      )}
    />
  );
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
            render={<IconButton narrow muted aria-label={menuLabel} icon={<CaretDownIcon />} />}
          />
        </Tooltip>
        {children}
      </Menu.Root>
    </ButtonGroup>
  );
}
