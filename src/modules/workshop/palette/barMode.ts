import { paletteSource } from "./sources";
import type { PaletteSourceId } from "./types";

/** What the bar is drawing: its crumb, a filter over the grid, or the palette. */
export type BarMode = "idle" | "filter" | "palette";

/** What the bar was opened for, which is the half a route cannot answer. */
export type BarIntent = "palette" | "filter";

/**
 * Which of the three the bar draws, for how it was opened and what it holds.
 *
 * Per "Three modes" in `docs/ux/WORKSHOP.md`.
 */
export function barMode(
  intent: BarIntent | null,
  hasProject: boolean,
  scope: PaletteSourceId | null,
): BarMode {
  if (intent === null) return "idle";
  if (intent === "palette" || scope !== null) return "palette";
  /* Only the grid has anything behind the bar for a filter to narrow. */
  return hasProject ? "palette" : "filter";
}

const FILTER_PLACEHOLDER = "Filter the projects, > for the commands";
const PROJECT_PLACEHOLDER = "Search this project, its strings, the commands and the game";
const WORKSHOP_PLACEHOLDER = "Search for projects ( / ) or commands ( > )";

/** What the empty box says, which is what typing into it reaches. */
export function barPlaceholder(
  mode: BarMode,
  hasProject: boolean,
  scope: PaletteSourceId | null,
): string {
  if (mode === "filter") return FILTER_PLACEHOLDER;
  if (scope !== null) return `Search the ${paletteSource(scope).label.toLowerCase()}`;
  if (hasProject) return PROJECT_PLACEHOLDER;
  return WORKSHOP_PLACEHOLDER;
}
