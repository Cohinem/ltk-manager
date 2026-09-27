import type { GraphLayout } from "./driverLayout";

/** The space between two emitters' frames, and between the frames and the preview. */
export const BLOCK_GAP = 120;

/** A frame's margin around its block, and its header strip above the block. */
export const FRAME_PADDING = 24;
export const FRAME_HEADER_HEIGHT = 36;

/** The shape the blocks are packed toward, width over height, about a pane's own. */
const PACKED_ASPECT = 16 / 10;

/** The frame around a block: its margin on three sides and its header on top. */
export function frameSize(block: GraphLayout): { width: number; height: number } {
  return {
    width: blockWidth(block) + 2 * FRAME_PADDING,
    height: blockHeight(block) + FRAME_HEADER_HEIGHT + FRAME_PADDING,
  };
}

/** One stretch of the skyline: the top of whatever is placed across `[x, x + width)`. */
interface Ledge {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/**
 * Where each of `blocks` goes on a board about `PACKED_ASPECT` in shape.
 *
 * Each block in turn takes the lowest spot across the board's width, leftmost on a tie, so a
 * short block fills the space beside a tall one rather than waiting for its row to end.
 */
export function packBlocks(
  blocks: readonly GraphLayout[],
): { x: number; y: number; block: GraphLayout }[] {
  const sizes = blocks.map((block) => {
    const frame = frameSize(block);
    return { width: frame.width + BLOCK_GAP, height: frame.height + BLOCK_GAP };
  });
  const area = sizes.reduce((sum, size) => sum + size.width * size.height, 0);
  const boardWidth = Math.max(Math.sqrt(area * PACKED_ASPECT), ...sizes.map((size) => size.width));

  let skyline: Ledge[] = [{ x: 0, y: 0, width: boardWidth }];
  return blocks.map((block, index) => {
    const { width, height } = sizes[index]!;
    let best: { x: number; y: number } | null = null;
    for (const ledge of skyline) {
      if (ledge.x + width > boardWidth) continue;

      const under = skyline.filter(
        (each) => each.x < ledge.x + width && each.x + each.width > ledge.x,
      );
      const y = Math.max(...under.map((each) => each.y));
      if (best === null || y < best.y) best = { x: ledge.x, y };
    }

    const at = best ?? { x: 0, y: Math.max(...skyline.map((each) => each.y)) };
    skyline = raised(skyline, { x: at.x, y: at.y + height, width });
    return { ...at, block };
  });
}

/** `skyline` with `top` laid over the ledges it covers. */
function raised(skyline: readonly Ledge[], top: Ledge): Ledge[] {
  const end = top.x + top.width;
  const out: Ledge[] = [top];
  for (const ledge of skyline) {
    const ledgeEnd = ledge.x + ledge.width;
    if (ledgeEnd <= top.x || ledge.x >= end) {
      out.push(ledge);
      continue;
    }

    if (ledge.x < top.x) out.push({ ...ledge, width: top.x - ledge.x });
    if (ledgeEnd > end) out.push({ x: end, y: ledge.y, width: ledgeEnd - end });
  }
  return out.sort((left, right) => left.x - right.x);
}

/* A block from `layoutTree` has its top-left corner at the origin. */
function blockWidth(block: GraphLayout): number {
  return Math.max(0, ...block.items.map((each) => each.x + each.width));
}

function blockHeight(block: GraphLayout): number {
  return Math.max(0, ...block.items.map((each) => each.y + each.height));
}
