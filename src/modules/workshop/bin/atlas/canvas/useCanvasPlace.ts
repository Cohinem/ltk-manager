import { useState } from "react";

import type { LayoutSettings, PixelRect } from "../engine/layout/solve";
import { kindOf } from "../engine/model/elementKinds";
import type { ViewTree } from "../engine/model/tree";
import { useAddElement } from "../hooks/useAddElement";
import { usePlacing, usePlacingActions } from "../state/placing";
import { canvasDrop } from "./canvasPlace";
import type { OverlayFrame } from "./FrameOverlay";

type Point = readonly [number, number];

export interface CanvasPlaceInputs {
  readonly view: string;
  readonly tree: ViewTree | null;
  readonly frames: readonly OverlayFrame[];
  readonly settings: LayoutSettings;
  /** The element under the pointer, which a stacked board reads the scene of. */
  readonly hovered: string | null;
  /** Whether the canvas takes a component at all, which a focused or played one does not. */
  readonly enabled: boolean;
}

export interface CanvasPlace {
  /** A component is being placed, so a press puts it down in place of every other gesture. */
  readonly active: boolean;
  /** A drag out of its tile carries the component, so a release puts it down. */
  readonly dragged: boolean;
  /** Where the carried component would draw, on the board. */
  readonly ghost: PixelRect | null;
  /** The pointer moved to the board point `point`, or left the canvas. */
  readonly carry: (point: Point | null) => void;
  /** Put the component down at the board point `point`, over the element `under`. */
  readonly put: (point: Point, under: string | null) => void;
}

/**
 * Placing a component on the canvas, per "Interaction" in docs/plans/atlas-ui-editor.md: the
 * ghost the pointer carries, and the element a press or a drag's release adds where `canvasDrop`
 * says. A point between screens takes nothing and keeps the component.
 */
export function useCanvasPlace({
  view,
  tree,
  frames,
  settings,
  hovered,
  enabled,
}: CanvasPlaceInputs): CanvasPlace {
  const placing = usePlacing(view);
  const { stop } = usePlacingActions();
  const adder = useAddElement(view, tree);
  const kind = !enabled || placing === null ? undefined : kindOf(placing.kind);
  const [carried, setCarried] = useState<Point | null>(null);

  const dropAt = (point: Point, under: string | null) => {
    if (tree === null || kind === undefined) return null;
    return canvasDrop(tree, kind, frames, settings, point, under);
  };

  const put = (point: Point, under: string | null) => {
    const drop = dropAt(point, under);
    if (drop === null || kind === undefined) return;

    stop();
    void adder.add(kind, { scene: drop.scene, group: null }, drop.position);
  };

  return {
    active: kind !== undefined,
    dragged: kind !== undefined && placing?.dragged === true,
    ghost: carried === null ? null : (dropAt(carried, hovered)?.rect ?? null),
    carry: setCarried,
    put,
  };
}
