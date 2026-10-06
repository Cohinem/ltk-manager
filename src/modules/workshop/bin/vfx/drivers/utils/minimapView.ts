/** A rectangle in the graph's own coordinates. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The distance a node may extend past the view and still count as inside it. */
const SLACK = 1;

/**
 * The part of the graph a canvas of `width` by `height` pixels shows, in graph coordinates.
 *
 * `transform` is React Flow's viewport: the x and y translation in pixels, and the zoom.
 */
export function viewBox(
  transform: readonly [number, number, number],
  width: number,
  height: number,
): Box {
  const [x, y, zoom] = transform;
  return { x: -x / zoom, y: -y / zoom, width: width / zoom, height: height / zoom };
}

/** True when every box of `boxes` is inside `view`. True for no boxes. */
export function allInView(boxes: Iterable<Box>, view: Box): boolean {
  for (const box of boxes) {
    const inside =
      box.x >= view.x - SLACK &&
      box.y >= view.y - SLACK &&
      box.x + box.width <= view.x + view.width + SLACK &&
      box.y + box.height <= view.y + view.height + SLACK;
    if (!inside) return false;
  }

  return true;
}
