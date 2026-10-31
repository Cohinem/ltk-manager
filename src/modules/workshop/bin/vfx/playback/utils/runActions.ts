import type { EmitterCardData } from "../../inspector/utils/emitterTypes";
import type { TimelineMarkerList } from "../../timeline/hooks/useTimelineMarkers";
import { chosenEmitters, togglesAll } from "../../timeline/utils/selection";
import type { RunKey } from "../../utils/vfxKeys";
import { speedDetent } from "../components/Transport";
import type { VfxRun } from "../state/run";

/** How many frames Shift and an arrow move, which is a tenth of a second. */
const SHIFT_FRAMES = 6;

/** What each key of the run does, "The keys" in docs/ux/BIN_EDITOR.md. Esc is the pane tree's. */
export const RUN_ACTIONS: Record<
  RunKey,
  (run: VfxRun, selected: readonly number[], markers: TimelineMarkerList | null) => void
> = {
  play: (run) => run.setPlaying(!run.playing),
  stepBack: (run) => run.step(-1),
  stepForward: (run) => run.step(1),
  jumpBack: (run) => run.step(-SHIFT_FRAMES),
  jumpForward: (run) => run.step(SHIFT_FRAMES),
  restart: (run) => {
    run.restart();
    run.setPlaying(true);
  },
  end: (run) => run.seekEnd(),
  loop: (run) => run.setLooping(!run.looping),
  fit: (run) => run.requestFit(),
  solo: (run, selected) => {
    if (selected.length > 0) run.setSoloed((held) => togglesAll(held, selected));
  },
  mute: (run, selected) => {
    if (selected.length > 0) run.setMuted((held) => togglesAll(held, selected));
  },
  slower: (run) => run.setSpeed(speedDetent(run.speed, -1)),
  faster: (run) => run.setSpeed(speedDetent(run.speed, 1)),
  markerAdd: (run, _, markers) => markers?.add(run.driver.phase),
};

/**
 * Returns the pool indices of the emitters that solo and mute act on.
 *
 * A selected child lane leaves `selected` empty, and its parent's open card `root` acts for it.
 */
export function runSelection(
  system: VfxRun["system"],
  cards: readonly EmitterCardData[],
  root: EmitterCardData | undefined,
  selected: ReadonlySet<string>,
): number[] {
  const places = cards.filter((card) => selected.has(card.key));
  if (places.length === 0 && root !== undefined) places.push(root);

  return chosenEmitters(system, places);
}
