import type { PixelRect } from "../layout/solve";
import { sceneAncestry, type ViewTree } from "../model/tree";

/**
 * Each scene's clip rect: its own scissor region's rect, intersected with its parent's where the
 * scene inherits scissoring. A scene with neither draws unclipped.
 */
export function sceneScissors(
  tree: ViewTree,
  solved: ReadonlyMap<string, PixelRect>,
): Map<string, PixelRect> {
  const own = new Map<string, PixelRect>();
  for (const element of tree.view.elements) {
    if (element.look.kind !== "scissor" || element.look.scene === null) continue;

    const rect = solved.get(element.key);
    if (rect !== undefined) own.set(element.look.scene, rect);
  }

  const scissors = new Map<string, PixelRect>();
  for (const key of tree.scenes.keys()) {
    let rect: PixelRect | null = null;
    for (const scene of sceneAncestry(tree, key)) {
      const clip = own.get(scene);
      if (clip !== undefined) rect = rect === null ? clip : intersect(rect, clip);
      if (!(tree.scenes.get(scene)?.inheritScissoring ?? true)) break;
    }
    if (rect !== null) scissors.set(key, rect);
  }
  return scissors;
}

function intersect(a: PixelRect, b: PixelRect): PixelRect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}
