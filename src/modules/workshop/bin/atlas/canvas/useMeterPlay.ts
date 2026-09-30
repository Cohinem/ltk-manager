import { useCallback, useMemo, useRef, useState } from "react";

import type { PixelRect } from "../engine/layout/solve";
import { holds } from "../engine/model/combo";
import { fillAt, type MeterHit, meterFills, meterHits } from "../engine/model/meters";
import type { ViewTree } from "../engine/model/tree";
import { useAtlasPreviewActions, useFrameSettings, useMeterFills } from "../state/atlasPreview";

export interface MeterPlayInput {
  readonly view: string;
  readonly tree: ViewTree | null;
  readonly solved: ReadonlyMap<string, PixelRect> | null;
  /** Screen pixels at a point of the canvas pane. */
  readonly toScreen: (x: number, y: number) => readonly [number, number];
}

export interface MeterPlay {
  /** The fill each meter draws. */
  readonly fills: ReadonlyMap<string, number>;
  /** Whether the pointer is over a meter's bars. */
  readonly pointing: boolean;
  /** A press at a point of the pane, which fills the meter under it to there and holds it. */
  readonly down: (x: number, y: number) => void;
  readonly up: () => void;
  readonly move: (x: number, y: number) => void;
  readonly leave: () => void;
}

const NO_FILLS: ReadonlyMap<string, number> = new Map();

/**
 * The view's meters as the preview fills them, per "Meters" in docs/research/ui-data-layout.md:
 * each draws the fill the reader dragged it to, else the live input while samples draw, else its
 * own `StartPercentage`. The pointer fills them in interact mode only.
 */
export function useMeterPlay({ view, tree, solved, toScreen }: MeterPlayInput): MeterPlay {
  const { samples, live } = useFrameSettings();
  const own = useMeterFills(view);
  const { setMeter } = useAtlasPreviewActions();
  const held = useRef<MeterHit | null>(null);
  const [pointing, setPointing] = useState(false);

  const fills = useMemo(
    () => (tree === null ? NO_FILLS : meterFills(tree, { own, samples, live })),
    [tree, own, samples, live],
  );
  const hits = useMemo(
    () => (tree === null || solved === null ? [] : meterHits(tree, solved)),
    [tree, solved],
  );
  const under = useCallback(
    (x: number, y: number) => {
      const [sx, sy] = toScreen(x, y);
      return { hit: hits.find((each) => holds(each.rect, sx, sy)) ?? null, at: sx };
    },
    [hits, toScreen],
  );

  const down = useCallback(
    (x: number, y: number) => {
      const { hit, at } = under(x, y);
      held.current = hit;
      if (hit !== null) setMeter(view, hit.meter, fillAt(hit, at));
    },
    [under, view, setMeter],
  );
  const up = useCallback(() => {
    held.current = null;
  }, []);
  const move = useCallback(
    (x: number, y: number) => {
      const { hit, at } = under(x, y);
      setPointing(hit !== null);

      const dragged = held.current;
      if (dragged !== null) setMeter(view, dragged.meter, fillAt(dragged, at));
    },
    [under, view, setMeter],
  );
  const leave = useCallback(() => {
    held.current = null;
    setPointing(false);
  }, []);

  return { fills, pointing, down, up, move, leave };
}
