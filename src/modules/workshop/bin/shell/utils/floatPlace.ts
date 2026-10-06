/** A point or a top-left corner, in pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A width and a height, in pixels. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** The room kept between the floating editor and the edge of the shell, and the pointer. */
const MARGIN = 8;
const POINTER_GAP = 24;

/** `place` moved so a box of `size` stays inside `bounds`, and at its corner where it cannot. */
export function clampInto(place: Point, bounds: Size, size: Size): Point {
  return {
    x: Math.max(MARGIN, Math.min(place.x, bounds.width - size.width - MARGIN)),
    y: Math.max(MARGIN, Math.min(place.y, bounds.height - size.height - MARGIN)),
  };
}

/**
 * Where a box of `size` opens for a press at `pointer`, both inside `bounds`.
 *
 * Under the pointer's line where it fits and over it where it does not, so the row or node
 * that was pressed stays in view, and reaching toward the side with more room. With no press
 * to open beside, the middle of `bounds`.
 */
export function placeBeside(pointer: Point | null, bounds: Size, size: Size): Point {
  if (pointer === null) {
    return clampInto(
      { x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2 },
      bounds,
      size,
    );
  }

  const leftward = pointer.x > bounds.width / 2;
  const x = leftward ? pointer.x + POINTER_GAP - size.width : pointer.x - POINTER_GAP;
  const under = pointer.y + POINTER_GAP;
  const fits = under + size.height + MARGIN <= bounds.height;
  const y = fits ? under : pointer.y - POINTER_GAP - size.height;
  return clampInto({ x, y }, bounds, size);
}
