import type { ViewLayout } from "../model/view";

/** A rect by its edges in screen pixels, before snapping. */
export interface Edges {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** One child a managed layout places, by its rect with no layout offset of its own. */
export interface LayoutItem {
  readonly key: string;
  readonly rect: Edges;
}

/** `HorizontalJustification` and `VerticalJustification` values past start, centre and end. */
const SPREAD_AROUND = 3;
const SPREAD_BETWEEN = 4;

interface Placed {
  readonly key: string;
  readonly w: number;
  readonly h: number;
  /** The offset that puts the child at its place in the run, before justification. */
  readonly dx: number;
  readonly dy: number;
}

interface Line {
  readonly items: Placed[];
  w: number;
  h: number;
}

/**
 * The offset a managed layout gives each child, per `0x1413E4740`.
 *
 * The children pack edge to edge from the region's start, or its end where a fill direction is
 * 1, a horizontal list along X, a vertical list along Y and a grid in rows (or columns, under
 * `FillPriority`) that wrap at the region's far edge. The run then moves by its justification,
 * and each child by its alignment across its row. The client's quirks stay: a grid wraps a child
 * that fits exactly, and a column-first grid counts its last child's height twice in its extent.
 */
export function arrange(
  layout: ViewLayout,
  region: Edges,
  items: readonly LayoutItem[],
): Map<string, readonly [number, number]> {
  const [fillX, fillY] = layout.fill;
  const dirX = fillX === 1 ? -1 : 1;
  const dirY = fillY === 1 ? -1 : 1;
  const startX = fillX === 1 ? region.x1 : region.x0;
  const startY = fillY === 1 ? region.y1 : region.y0;
  const columns = layout.kind === "grid" && layout.fillPriority !== 0;

  let cx = startX;
  let cy = startY;
  let minX = cx;
  let maxX = cx;
  let minY = cy;
  let maxY = cy;
  const reachX = (x: number) => {
    if (fillX === 1) minX = Math.min(minX, x);
    else maxX = Math.max(maxX, x);
  };
  const reachY = (y: number) => {
    if (fillY === 1) minY = Math.min(minY, y);
    else maxY = Math.max(maxY, y);
  };

  const lines: Line[] = [{ items: [], w: 0, h: 0 }];
  for (const { key, rect } of items) {
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    const edgeX = fillX === 1 ? rect.x1 : rect.x0;
    const edgeY = fillY === 1 ? rect.y1 : rect.y0;
    const line = lines[lines.length - 1] as Line;

    if (layout.kind === "horizontalList") {
      line.items.push({ key, w, h, dx: cx - edgeX, dy: region.y0 - rect.y0 });
      cx += w * dirX;
      if (fillX === 1) minX = cx;
      else maxX = cx;
      maxY = Math.max(maxY, cy + h);
      line.w += w;
      line.h = Math.max(line.h, h);
      continue;
    }

    if (layout.kind === "verticalList") {
      line.items.push({ key, w, h, dx: region.x0 - rect.x0, dy: cy - edgeY });
      cy += h * dirY;
      if (fillY === 1) minY = cy;
      else maxY = cy;
      maxX = Math.max(maxX, cx + w);
      line.h += h;
      line.w = Math.max(line.w, w);
      continue;
    }

    const overflows = columns
      ? fillY === 1
        ? cy - h <= region.y0
        : region.y1 <= cy + h
      : fillX === 1
        ? cx - w <= region.x0
        : region.x1 <= cx + w;

    if (overflows) {
      if (columns) {
        cx += dirX * line.w;
        cy = startY;
      } else {
        cx = startX;
        cy += dirY * line.h;
      }
    }

    const placed = { key, w, h, dx: cx - edgeX, dy: cy - edgeY };
    if (columns) cy += h * dirY;
    else cx += w * dirX;
    reachX(cx);
    reachY(cy + h * dirY);

    if (overflows) {
      lines.push({ items: [placed], w, h });
    } else if (columns) {
      line.items.push(placed);
      line.h += h;
      line.w = Math.max(line.w, w);
    } else {
      line.items.push(placed);
      line.w += w;
      line.h = Math.max(line.h, h);
    }
  }

  const [justifyX, justifyY] = layout.justify;
  const shiftX = justified(justifyX, region.x0, region.x1, minX, maxX);
  const shiftY = justified(justifyY, region.y0, region.y1, minY, maxY);
  const offsets = new Map<string, readonly [number, number]>();
  const last = lines[lines.length - 1] as Line;

  if (layout.kind === "horizontalList") {
    const [first, step] = spread(justifyX, region.x1 - region.x0 - last.w, last.items.length, dirX);
    let at = first;
    for (const item of last.items) {
      const across = aligned(layout.cross[0], last.h - item.h);
      offsets.set(item.key, [shiftX + item.dx + at, shiftY + item.dy + across]);
      at += step;
    }
    return offsets;
  }

  if (layout.kind === "verticalList") {
    const [first, step] = spread(justifyY, region.y1 - region.y0 - last.h, last.items.length, dirY);
    let at = first;
    for (const item of last.items) {
      const across = aligned(layout.cross[0], last.w - item.w);
      offsets.set(item.key, [shiftX + item.dx + across, shiftY + item.dy + at]);
      at += step;
    }
    return offsets;
  }

  const [firstRow, rowStep] = spread(
    justifyY,
    region.y1 - region.y0 - (maxY - minY),
    lines.length,
    dirY,
  );
  let rowAt = firstRow;
  for (const line of lines) {
    const [first, step] = spread(justifyX, region.x1 - region.x0 - line.w, line.items.length, dirX);
    let at = first;
    /* A row's own horizontal alignment is set only for a right-to-left locale, so it is 0. */
    const rowShift = spreads(justifyX) || fillX !== 1 ? 0 : line.w - (maxX - minX);

    for (const item of line.items) {
      offsets.set(item.key, [
        shiftX + item.dx + rowShift + at,
        shiftY + item.dy + rowAlign(layout.cross[1], line.h, item.h, fillY === 1) + rowAt,
      ]);
      at += step;
    }
    rowAt += rowStep;
  }
  return offsets;
}

function spreads(justify: number): boolean {
  return justify === SPREAD_AROUND || justify === SPREAD_BETWEEN;
}

/** The shift that justifies a run spanning `min` to `max` in a region from `start` to `end`. */
function justified(justify: number, start: number, end: number, min: number, max: number) {
  switch (justify) {
    case 0:
      return start - min;
    case 1:
      return (start + end) / 2 - (min + max) / 2;
    case 2:
      return end - max;
    default:
      return 0;
  }
}

/** The first offset and the step between children that share `free` space among `count`. */
function spread(justify: number, free: number, count: number, dir: number): [number, number] {
  if (!spreads(justify)) return [0, 0];

  const gaps = count + (justify === SPREAD_AROUND ? 1 : -1);
  const shared = count > 0 && (count !== 1 || justify === SPREAD_AROUND);
  const step = shared ? (Math.max(0, free) / gaps) * dir : 0;
  return [justify === SPREAD_AROUND ? step : 0, step];
}

/** A child's offset across its row or column: start, centre or end of `free`. */
function aligned(align: number, free: number): number {
  if (align === 1) return free / 2;
  if (align === 2) return free;
  return 0;
}

/** A grid child's offset down its row, which a bottom-up fill measures from the row's end. */
function rowAlign(align: number, rowH: number, itemH: number, upward: boolean): number {
  if (align === 1) return ((rowH - itemH) / 2) * (upward ? -1 : 1);
  if (align === 2) return upward ? 0 : rowH - itemH;
  return upward ? itemH - rowH : 0;
}
