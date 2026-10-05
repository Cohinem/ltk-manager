import type { ReactNode } from "react";

/**
 * The look every popup that lists or holds controls shares: DS-POPUP.
 *
 * `Menu`, `ContextMenu`, `Select`, `Combobox`, `MultiSelect` and `Popover` read these, so a
 * popup of one kind cannot drift from the others. `Tooltip` and `Dialog` draw solid and do not.
 */

/** The surface of the popup: DS-GLASS, DS-RADIUS. */
export const popupSurface =
  "rounded-xl border border-surface-700 shadow-xl outline-none bg-(--ltk-glass-panel-fill) backdrop-filter-(--ltk-glass-panel-blur)";

/** How the popup arrives and leaves, on the default duration: DS-MOTION. */
export const popupMotion =
  "transition-[opacity,transform] data-[starting-style]:-translate-y-1 data-[starting-style]:opacity-0 data-[ending-style]:-translate-y-1 data-[ending-style]:opacity-0";

/**
 * One row of a list popup, whatever it does when chosen.
 *
 * Base UI stops a disabled row responding and leaves it looking live, so it rests at its own
 * shade.
 */
export const popupItem =
  "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:text-surface-400";

export type PopupItemTone = "default" | "danger";

export const popupItemTone: Record<PopupItemTone, string> = {
  /* DS-VEIL */
  default: "text-surface-200 data-[highlighted]:bg-surface-veil data-[highlighted]:text-surface-50",
  /* The highlight is a fill because the label is already at its own shade: DS-TEXT. */
  danger: "text-danger-text data-[highlighted]:bg-danger/15",
};

/**
 * The classes of a row's label.
 *
 * Plain text stays on one line and loses its tail before it widens the popup. A label built of
 * elements lays itself out, since it may hold a second line.
 */
export function popupItemLabel(children: ReactNode): string {
  if (typeof children === "string") return "min-w-0 flex-1 truncate";

  return "min-w-0 flex-1";
}

/** The trailing mark of the row that is chosen or switched on. */
export const popupItemMark = "flex size-4 shrink-0 items-center justify-center text-accent-400";

/** A rule between groups of rows, edge to edge across the popup's padding. */
export const popupSeparator = "-mx-1 my-1 border-t border-surface-700";

export const popupGroupLabel =
  "px-2 py-1 text-meta font-medium tracking-wide text-surface-400 uppercase";
