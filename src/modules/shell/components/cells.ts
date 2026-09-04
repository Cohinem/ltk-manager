/** The transform every titlebar glyph answers the pointer with. */
export const iconLiftClass =
  "[&_svg]:transition-transform [&_svg]:duration-150 [&_svg]:ease-out hover:[&_svg]:scale-110";

/** A square titlebar cell, flush with its neighbours and the bar's own height: DS-SHAPE. */
export const cellBase = `flex h-full w-9 shrink-0 items-center justify-center transition-colors ${iconLiftClass}`;
export const cellActive = "bg-accent-500/15 text-accent-300";
export const cellInactive = "text-surface-400 hover:bg-surface-700 hover:text-surface-200";
