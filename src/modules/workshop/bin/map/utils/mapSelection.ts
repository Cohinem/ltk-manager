/** How a pick joins the selection: in place of it, onto it, or flipping what it names. */
export type SelectMode = "replace" | "add" | "toggle";

/** The selection `current` becomes once `ids` are picked under `mode`. */
export function selectedBy(
  current: ReadonlySet<string>,
  ids: readonly string[],
  mode: SelectMode,
): ReadonlySet<string> {
  if (mode === "replace") return new Set(ids);

  const next = new Set(current);
  for (const id of ids) {
    if (mode === "add" || !next.has(id)) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** The mode a pointer or key event's modifiers ask for: Shift adds, Ctrl or Cmd flips. */
export function modeOf(event: {
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}): SelectMode {
  if (event.ctrlKey || event.metaKey) return "toggle";
  return event.shiftKey ? "add" : "replace";
}

/** A rectangle on the screen, in client pixels. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A placeable's place on the screen, and null where it stands behind the camera. */
export type ScreenPoint = readonly [number, number] | null;

/** How far from a click a marker is still the one it lands on, in pixels. */
export const CLICK_REACH = 8;

/** The ids whose points fall inside `rect`. */
export function inRect(
  ids: readonly string[],
  points: readonly ScreenPoint[],
  rect: ScreenRect,
): string[] {
  return ids.filter((_, at) => {
    const point = points[at];
    if (point == null) return false;
    const [x, y] = point;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  });
}

/** The id whose point is nearest `at` within `CLICK_REACH`, and null for none. */
export function nearest(
  ids: readonly string[],
  points: readonly ScreenPoint[],
  at: readonly [number, number],
): string | null {
  let best: string | null = null;
  let bestDistance = CLICK_REACH;
  ids.forEach((id, index) => {
    const point = points[index];
    if (point == null) return;
    const distance = Math.hypot(point[0] - at[0], point[1] - at[1]);
    if (distance <= bestDistance) {
      best = id;
      bestDistance = distance;
    }
  });
  return best;
}
