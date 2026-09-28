import { type RefObject, useEffect, useState } from "react";

import { useVfxRun } from "../../playback/state/run";
import { drawHistogram, type LaneLayout, writeCounts } from "../utils/histogram";

/** How often the counts and the histogram redraw while the run plays, in milliseconds. */
const REDRAW_MS = 100;

/** The token the histogram is painted in, resolved off the canvas. */
const HISTOGRAM_TOKEN = "--color-accent-400";

/**
 * The run's live counts, redrawn every `REDRAW_MS` off its clock rather than a render: each
 * lane's count under `root` and the histogram onto `canvas`. Answers how many children the
 * pass has spawned, which is what moves a child lane's bars.
 *
 * The paint colour is read once per canvas rather than per redraw, since a computed style
 * forces the document's styles to settle first, and the canvas mounts only once the Histogram
 * switch turns on, after the effect began.
 */
export function useLiveCounts(
  root: RefObject<HTMLElement | null>,
  canvas: RefObject<HTMLCanvasElement | null>,
  layout: LaneLayout,
): number {
  const { driver, subscribe } = useVfxRun();
  const [spawned, setSpawned] = useState(0);

  useEffect(() => {
    let painted: { canvas: HTMLCanvasElement; colour: string } | null = null;
    const colourOf = (target: HTMLCanvasElement) => {
      if (painted?.canvas !== target) {
        const colour = getComputedStyle(target).getPropertyValue(HISTOGRAM_TOKEN).trim();
        painted = { canvas: target, colour };
      }

      return painted.colour;
    };

    let drawn = 0;
    const redraw = () => {
      const now = performance.now();
      if (now - drawn < REDRAW_MS) return;
      drawn = now;

      const target = canvas.current;
      drawHistogram(target, target === null ? "" : colourOf(target), driver.histogram, layout);
      writeCounts(root.current, driver.histogram);
      setSpawned(driver.births().length);
    };

    redraw();
    return subscribe(redraw);
  }, [root, canvas, driver, subscribe, layout]);

  return spawned;
}
