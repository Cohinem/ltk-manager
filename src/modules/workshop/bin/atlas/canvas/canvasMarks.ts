import { type Board, frameRect, moved, originOf } from "../engine/layout/board";
import type { PixelRect, Screen } from "../engine/layout/solve";
import { labelOf } from "../engine/model/layers";
import { sceneOf, type ViewTree } from "../engine/model/tree";
import { unionOf } from "./canvasGeometry";
import type { OverlayFrame } from "./FrameOverlay";

/**
 * The scenes each frame draws under the scene heading it, each boxed around what it and the scenes
 * under it draw of `drawn` at `shown`, so a scene's box holds its children's. A stacked board,
 * whose one frame heads no scene, boxes none.
 */
export function nestedFramesOf(
  board: Board | null,
  tree: ViewTree | null,
  shown: ReadonlyMap<string, PixelRect> | null,
  drawn: readonly string[],
): OverlayFrame[] {
  if (board === null || tree === null || shown === null) return [];

  return board.frames.flatMap((frame) => {
    const head = frame.scene;
    if (head === null || frame.scenes.length < 2) return [];

    return frame.scenes.flatMap((scene): OverlayFrame[] => {
      if (scene === head) return [];

      const rects = drawn.flatMap((key) => {
        const rect = shown.get(key);
        const held = frame.elements.has(key) && under(tree, sceneOf(tree, key), scene);
        return held && rect !== undefined && rect.w > 0 && rect.h > 0 ? [rect] : [];
      });
      const rect = unionOf(rects);
      if (rect === null) return [];

      const node = tree.scenes.get(scene);
      const label = node === undefined ? scene : labelOf(node.label, node.path, scene);
      return [{ rect, scene, label, depth: depthUnder(tree, scene, head) }];
    });
  });
}

/** Whether `scene` is `ancestor` or a scene under it. */
function under(tree: ViewTree, scene: string | null, ancestor: string): boolean {
  const seen = new Set<string>();
  for (let at = scene; at !== null && !seen.has(at); at = tree.scenes.get(at)?.parent ?? null) {
    if (at === ancestor) return true;
    seen.add(at);
  }
  return false;
}

/** How many scenes down from `head` the scene `scene` sits. */
function depthUnder(tree: ViewTree, scene: string, head: string): number {
  const seen = new Set<string>();
  let depth = 0;
  for (let at: string | null = scene; at !== null && at !== head && !seen.has(at); depth += 1) {
    seen.add(at);
    at = tree.scenes.get(at)?.parent ?? null;
  }
  return depth;
}

/** The outline and name of each frame, a lone frame unnamed. */
export function overlayFramesOf(board: Board | null, screen: Screen): OverlayFrame[] {
  if (board === null) return [];

  return board.frames.flatMap((frame, at) => {
    const rect = frameRect(board, at, screen);
    const label = board.frames.length > 1 ? frame.label : "";
    return rect === null ? [] : [{ rect, scene: frame.scene, label, depth: 0 }];
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
