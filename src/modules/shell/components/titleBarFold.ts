/** How much of the title bar's left side draws: all of it, the navigation as icons, or the icons alone. */
export type TitleBarFold = "full" | "icons" | "bare";

/* In rem, so the steps follow the zoom setting as the bar's contents do. */
const ICONS_UNDER = 72;
const BARE_UNDER = 62;

/** The fold a title bar `width` pixels wide takes, at a root font size of `rem` pixels. */
export function titleBarFold(width: number, rem: number): TitleBarFold {
  const room = width / rem;

  if (room < BARE_UNDER) {
    return "bare";
  }

  if (room < ICONS_UNDER) {
    return "icons";
  }

  return "full";
}
