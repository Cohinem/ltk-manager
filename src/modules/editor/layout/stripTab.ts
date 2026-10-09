/** The frame of a tab that stands on the top edge of the box under its strip. */
export const STRIP_TAB =
  "relative flex shrink-0 touch-none items-center rounded-t-xl border border-b-0";

/** The open tab, in the fill and the edge of the box under its strip: DS-GROUND. */
export const STRIP_TAB_OPEN =
  "tab-foot-end z-10 border-surface-700/50 bg-surface-900 text-surface-100";

/** A tab behind the open one, which draws no frame until it is hovered: DS-VEIL. */
export const STRIP_TAB_BEHIND =
  "border-transparent hover:bg-surface-veil-soft hover:text-surface-100";
