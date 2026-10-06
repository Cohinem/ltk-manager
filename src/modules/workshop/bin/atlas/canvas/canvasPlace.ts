import { addTargetOf, placeAt } from "../engine/edit/newElement";
import { moved } from "../engine/layout/board";
import type { LayoutSettings, PixelRect } from "../engine/layout/solve";
import type { ElementKind } from "../engine/model/elementKinds";
import type { ViewTree } from "../engine/model/tree";
import { contains } from "./canvasGeometry";
import type { OverlayFrame } from "./FrameOverlay";

/** Where a component put down on the canvas lands. */
export interface CanvasDrop {
  readonly scene: string;
  /** Its corner in source pixels, null for a kind that draws from no rect. */
  readonly position: readonly [number, number] | null;
  /** The rect it draws at on the board, null for a kind that draws from no rect. */
  readonly rect: PixelRect | null;
}

/**
 * Where a component of `kind` put down at the board point `x, y` lands: centred on the point, in
 * the scene of the deepest frame around it. A stacked board's one frame heads no scene, so there
 * it lands in the scene of `under`, the element under the point, and in the first root scene over
 * none. Null between screens.
 */
export function canvasDrop(
  tree: ViewTree,
  kind: ElementKind,
  frames: readonly OverlayFrame[],
  settings: LayoutSettings,
  [x, y]: readonly [number, number],
  under: string | null,
): CanvasDrop | null {
  const around = frames.filter((frame) => contains(frame.rect, x, y));
  const screen = around.find((frame) => frame.depth === 0);
  if (screen === undefined) return null;

  const [deepest] = around
    .filter((frame) => frame.scene !== null)
    .sort((a, b) => b.depth - a.depth);
  const scene = deepest?.scene ?? addTargetOf(tree, under)?.scene ?? null;
  if (scene === null) return null;

  const origin = [screen.rect.x, screen.rect.y] as const;
  const place = placeAt(tree, kind, scene, settings, [x - origin[0], y - origin[1]]);
  if (place === null) return { scene, position: null, rect: null };

  return { scene, position: place.position, rect: moved(place.rect, origin) };
}
