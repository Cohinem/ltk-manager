import { type ReactNode, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useContentVisible } from "@/hooks";

import { useEmitters } from "../../inspector/state/emitterChoice";
import {
  type TimelineMarkerList,
  useTimelineMarkers,
} from "../../timeline/hooks/useTimelineMarkers";
import { chosenEmitters, togglesAll } from "../../timeline/utils/selection";
import { useVfxRun, type VfxRun } from "../state/run";
import { ignoredKey } from "../utils/ignoredKey";
import { speedDetent } from "./Transport";

/** How many frames Shift and an arrow move, which is a tenth of a second. */
const SHIFT_FRAMES = 6;

/** What each key does to the run, "The keys" in docs/ux/BIN_EDITOR.md. Esc is the pane tree's. */
const KEYS: Record<
  string,
  (run: VfxRun, selected: readonly number[], markers: TimelineMarkerList | null) => void
> = {
  space: (run) => run.setPlaying(!run.playing),
  left: (run) => run.step(-1),
  right: (run) => run.step(1),
  "shift+left": (run) => run.step(-SHIFT_FRAMES),
  "shift+right": (run) => run.step(SHIFT_FRAMES),
  home: (run) => {
    run.restart();
    run.setPlaying(true);
  },
  end: (run) => run.seekEnd(),
  l: (run) => run.setLooping(!run.looping),
  f: (run) => run.requestFit(),
  s: (run, selected) => selected.length > 0 && run.setSoloed((held) => togglesAll(held, selected)),
  m: (run, selected) => selected.length > 0 && run.setMuted((held) => togglesAll(held, selected)),
  bracketleft: (run) => run.setSpeed(speedDetent(run.speed, -1)),
  bracketright: (run) => run.setSpeed(speedDetent(run.speed, 1)),
  "ctrl+m": (run, _, markers) => markers?.add(run.driver.phase),
};

/**
 * The run's keys, live wherever focus is inside this box and outside an editable field.
 *
 * The box takes focus itself, so a click on bare pane ground arms them, and so does the
 * tab turning visible while no other control has focus.
 */
export function RunKeys({ children }: { children: ReactNode }) {
  const run = useVfxRun();
  const { cards, root, selected } = useEmitters();
  const markers = useTimelineMarkers();
  const visible = useContentVisible();

  const ref = useHotkeys<HTMLDivElement>(
    Object.keys(KEYS).join(", "),
    (_, handler) => {
      /* A selected child lane leaves the set empty, and its parent's open card stands for it. */
      const places = cards.filter((card) => selected.has(card.key));
      if (places.length === 0 && root !== undefined) places.push(root);

      KEYS[handler.hotkey]?.(run, chosenEmitters(run.system, places), markers);
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      ignoreEventWhen: ignoredKey,
    },
    [run, cards, root, selected, markers],
  );

  useEffect(() => {
    const box = ref.current;
    if (!visible || box === null || !focusIsFree(box)) return;

    box.focus({ preventScroll: true });
  }, [ref, visible]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      data-ui="RunKeys"
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      {children}
    </div>
  );
}

/**
 * No control outside `box` has focus: the page has none, or the selected tab that shows it does.
 *
 * A preview tab opened from the Objects grid or the content tree leaves their focus alone.
 */
function focusIsFree(box: HTMLElement): boolean {
  const active = box.ownerDocument.activeElement;
  if (active === null || active === box.ownerDocument.body) return true;
  if (box.contains(active)) return false;

  return active.getAttribute("role") === "tab" && active.getAttribute("aria-selected") === "true";
}
