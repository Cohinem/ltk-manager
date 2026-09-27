import { use, useEffect, useRef, useState } from "react";

import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { emitterPlace } from "../../clipboard/emitterCopy";
import { holderRow } from "../../drivers/utils/holderRow";
import type { EmitterModel } from "../../engine/model/model";
import type { EmitterCardData } from "../../inspector/utils/emitterTypes";
import { useVfxRun } from "../../playback/state/run";
import { barFields, type BarGrip } from "../utils/barDrag";
import type { LaneBar } from "../utils/laneModel";
import { seconds, timingEdits, withBar } from "../utils/timingEdits";

/** The least time between two previews of a drag, in milliseconds, since each replays the run. */
const PREVIEW_MS = 80;

/**
 * What an emitter's lane edits its bar with: the write a drag ends in, the preview it runs,
 * and the exact times a double click opens. Every callback is undefined for a lane that
 * takes no edit.
 *
 * The write puts every field of one drag under the emitter list's property, one undo step.
 * The preview swaps the dragged timing into the run and replays it to the playhead, at most
 * every `PREVIEW_MS`, and a dropped drag swaps the run's own system back.
 */
export function useBarEditing(emitter: EmitterModel, card: EmitterCardData | undefined) {
  const run = useVfxRun();
  const editProperty = use(LeafEditContext)?.editProperty;
  const [opened, setOpened] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const place = card === undefined ? null : emitterPlace(card.row.path);

  const waiting = useRef<LaneBar | null | undefined>(undefined);
  const timer = useRef<number | null>(null);
  const shown = useRef(0);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (card === undefined || place === null || editProperty === undefined) {
    return { editor: null, onBarEdit: undefined, onBarPreview: undefined, onBarOpen: undefined };
  }

  const show = (bar: LaneBar | null) => {
    const { driver, system } = run;
    if (system === null) return;

    const next =
      bar === null
        ? system
        : {
            ...system,
            emitters: system.emitters.map((each) =>
              each.index === emitter.index ? withBar(each, bar) : each,
            ),
          };
    driver.swap(next);
    driver.seek(driver.phase);
    shown.current = performance.now();
  };
  const onBarPreview = (bar: LaneBar | null) => {
    waiting.current = bar;
    if (timer.current !== null) return;

    const wait = Math.max(PREVIEW_MS - (performance.now() - shown.current), 0);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const held = waiting.current;
      waiting.current = undefined;
      if (held !== undefined) show(held);
    }, wait);
  };

  const onBarEdit = (grip: BarGrip, bar: LaneBar) =>
    editProperty(
      holderRow(card.row.entry, ""),
      place.list,
      timingEdits(
        place.index,
        barFields(grip, bar).map(({ field, value }) => ({ field, value: seconds(value) })),
      ),
    );

  return {
    editor: { row: card.row, at: opened, onClose: () => setOpened(null) },
    onBarEdit,
    onBarPreview,
    onBarOpen: setOpened,
  };
}
