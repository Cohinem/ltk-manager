import { type Board, moved, spreads } from "../layout/board";
import type { PixelRect } from "../layout/solve";
import type { PreviewOverlay } from "../model/combo";
import { type BuildInput, buildCommands } from "./build";
import type { Command } from "./types";

/** The command list of one frame of the board, drawn on its own screen at `origin`. */
export interface FrameCommands {
  readonly commands: Command[];
  readonly origin: readonly [number, number];
}

/**
 * The command list of each frame of `board`, from an input laid out in board coordinates: each
 * frame's elements alone, moved back onto a screen of their own.
 */
export function boardCommands(board: Board, input: BuildInput): FrameCommands[] {
  if (!spreads(board)) return [{ commands: buildCommands(input), origin: [0, 0] }];

  return board.frames.map((frame) => {
    const back: readonly [number, number] = [-frame.origin[0], -frame.origin[1]];
    const { only, overlay } = input.preview;

    return {
      origin: frame.origin,
      commands: buildCommands({
        ...input,
        solved: movedAll(input.solved, back),
        preview: {
          ...input.preview,
          only: only === null ? frame.elements : intersection(frame.elements, only),
          overlay: movedOverlay(overlay, back),
        },
      }),
    };
  });
}

function movedAll(
  rects: ReadonlyMap<string, PixelRect>,
  by: readonly [number, number],
): Map<string, PixelRect> {
  const placed = new Map<string, PixelRect>();
  for (const [key, rect] of rects) placed.set(key, moved(rect, by));
  return placed;
}

/** `overlay` with every rect it draws at moved by `by`. */
function movedOverlay(overlay: PreviewOverlay, by: readonly [number, number]): PreviewOverlay {
  return {
    ...overlay,
    clones: overlay.clones.map((clone) => ({ ...clone, rect: moved(clone.rect, by) })),
    moved: movedAll(overlay.moved, by),
    rows: overlay.rows.map((row) => ({ ...row, rect: moved(row.rect, by) })),
  };
}

function intersection(a: ReadonlySet<string>, b: ReadonlySet<string>): Set<string> {
  return new Set([...a].filter((key) => b.has(key)));
}
