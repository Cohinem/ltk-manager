import { type Board, frameRect, moved, originOf } from "../engine/layout/board";
import type { PixelRect, Screen } from "../engine/layout/solve";
import type { ViewTree } from "../engine/model/tree";
import type { OverlayFrame } from "./FrameOverlay";

/** The outline and name of each frame, a lone frame unnamed. */
export function overlayFramesOf(board: Board | null, screen: Screen): OverlayFrame[] {
  if (board === null) return [];

  return board.frames.flatMap((frame, at) => {
    const rect = frameRect(board, at, screen);
    const label = board.frames.length > 1 ? frame.label : "";
    return rect === null ? [] : [{ rect, scene: frame.scene, label }];
  });
}

/** `key`'s rect on the screen of its own frame, as the file places it. */
export function frameLocal(
  board: Board | null,
  shown: ReadonlyMap<string, PixelRect> | null,
  key: string,
): PixelRect | null {
  const rect = shown?.get(key);
  if (rect === undefined) return null;
  if (board === null) return rect;

  const [x, y] = originOf(board, key);
  return moved(rect, [-x, -y]);
}

/**
 * The rects of the shown icons and effects whose image the controller sets at run time, which
 * draw as a placeholder, per section 6 of the editor plan.
 */
export function placeholderRects(
  tree: ViewTree,
  solved: ReadonlyMap<string, PixelRect>,
  order: readonly string[],
): PixelRect[] {
  const rects: PixelRect[] = [];
  for (const key of order) {
    const look = tree.elements.get(key)?.look;
    if ((look?.kind !== "icon" && look?.kind !== "effect") || look.sprite !== null) continue;

    const rect = solved.get(key);
    if (rect !== undefined && rect.w > 0 && rect.h > 0) rects.push(rect);
  }
  return rects;
}
