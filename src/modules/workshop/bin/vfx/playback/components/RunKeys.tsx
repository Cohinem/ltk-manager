import { type ReactNode, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useContentVisible } from "@/hooks";

import { useEmitters } from "../../inspector/state/emitterChoice";
import { useTimelineMarkers } from "../../timeline/hooks/useTimelineMarkers";
import { hotkeyOf, type RunKey, VFX_KEYS } from "../../utils/vfxKeys";
import { useVfxRun } from "../state/run";
import { ignoredKey } from "../utils/ignoredKey";
import { RUN_ACTIONS, runSelection } from "../utils/runActions";

/** The action of each key, by the key's `react-hotkeys-hook` spelling. */
const KEYS = new Map(
  (Object.keys(RUN_ACTIONS) as RunKey[]).map((name) => [
    hotkeyOf(VFX_KEYS[name]),
    RUN_ACTIONS[name],
  ]),
);

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
    [...KEYS.keys()].join(", "),
    (_, handler) => {
      KEYS.get(handler.hotkey)?.(run, runSelection(run.system, cards, root, selected), markers);
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
