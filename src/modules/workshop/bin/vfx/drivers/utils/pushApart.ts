/** A rectangle on the canvas, by the id of the node it is. */
export interface Box {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * How far two boxes may reach into each other's gap before they count as too close.
 *
 * A layout places neighbours exactly one gap apart, and the sums that get there differ in their
 * last bits.
 */
const SLACK = 0.5;

/** `left` before `right` where it is higher, and further left on one line. */
function readingOrder(left: Box, right: Box): number {
  return left.y - right.y || left.x - right.x;
}

/** Whether the spans `[a, a + aSize)` and `[b, b + bSize)` come closer than `gap`. */
function near(a: number, aSize: number, b: number, bSize: number, gap: number): boolean {
  return a < b + bSize + gap - SLACK && b < a + aSize + gap - SLACK;
}

/**
 * The boxes of one emitter's tree with every overlap removed by moving boxes down.
 *
 * A box keeps its place unless a box above it in reading order shares part of its width and
 * comes closer than `gap` above or below. It then moves down to `gap` under that box. A column
 * of the tree is a depth, so a box never moves sideways. A set that already has `gap` between
 * its boxes is returned as it is.
 */
export function pushedDown(boxes: readonly Box[], gap: number): Box[] {
  const placed: Box[] = [];

  for (const box of [...boxes].sort(readingOrder)) {
    let { y } = box;
    /* Each move clears one placed box for good, so the placed count bounds the moves. */
    for (let moves = 0; moves <= placed.length; moves += 1) {
      const blocker = placed.find(
        (each) =>
          near(each.x, each.width, box.x, box.width, 0) &&
          near(each.y, each.height, y, box.height, gap),
      );
      if (blocker === undefined) break;

      y = blocker.y + blocker.height + gap;
    }
    placed.push(y === box.y ? box : { ...box, y });
  }

  return placed;
}

/**
 * The frames of a board with `gap` between every two, by moving frames right or down.
 *
 * The boxes of `first` are placed before the rest, and each group in reading order. A box
 * keeps its place unless it comes closer than `gap` to a box placed before it. It then moves
 * past that box by the shorter of the two ways, right or down. A set that already has `gap`
 * between its boxes is returned as it is.
 */
export function pushedApart(boxes: readonly Box[], gap: number, first: ReadonlySet<string>): Box[] {
  const ordered = [
    ...boxes.filter((box) => first.has(box.id)).sort(readingOrder),
    ...boxes.filter((box) => !first.has(box.id)).sort(readingOrder),
  ];
  const placed: Box[] = [];

  for (const box of ordered) {
    let { x, y } = box;
    /* A move only raises `x` or `y`, so a placed box it cleared stays cleared. */
    for (let moves = 0; moves <= placed.length; moves += 1) {
      const blocker = placed.find(
        (each) =>
          near(each.x, each.width, x, box.width, gap) &&
          near(each.y, each.height, y, box.height, gap),
      );
      if (blocker === undefined) break;

      const right = blocker.x + blocker.width + gap - x;
      const down = blocker.y + blocker.height + gap - y;
      if (right < down) x += right;
      else y += down;
    }
    placed.push(x === box.x && y === box.y ? box : { ...box, x, y });
  }

  return placed;
}
