/** The transform every titlebar glyph answers the pointer with. */
export const iconLiftClass =
  "[&_svg]:transition-transform [&_svg]:duration-150 [&_svg]:ease-out hover:[&_svg]:scale-110";

/** A titlebar cell, as tall as the field a page draws in the bar's middle: DS-SHAPE. */
export const cellBase = `flex h-7 w-9 shrink-0 items-center justify-center rounded-md transition-colors ${iconLiftClass}`;
export const cellActive = "bg-accent-500/15 text-accent-300";
/* DS-VEIL */
export const cellInactive = "text-surface-400 hover:bg-surface-veil hover:text-surface-200";
