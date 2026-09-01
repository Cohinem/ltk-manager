import { ClockCountdownIcon } from "@phosphor-icons/react";

import { TogglePill, Tooltip } from "@/components";
import type { RuleInfo } from "@/lib/tauri";
import { useForwardLookingMeta, useSetForwardLookingMeta } from "@/stores";

import { useAheadCount, useDormantRules } from "./runCatalogue";

/**
 * The switch for the checks that are ahead of the game this machine has.
 *
 * It draws only where the run holds findings the switch is the difference
 * between, so a project the manager has nothing coming to say about looks as it
 * did before this existed. It was four lines of prose in that spot once, which
 * answered on every one of a modder's days a question they had asked on the
 * first. The words are on the switch now, where a reader who has forgotten what
 * is dimming their list reaches for them and nobody else pays.
 */
export function AheadToggle() {
  const waiting = useDormantRules();
  const count = useAheadCount();
  const on = useForwardLookingMeta();
  const setOn = useSetForwardLookingMeta();

  if (waiting.length === 0 || count === 0) return null;

  const label = pillLabel(waiting);

  return (
    /* The toolbar's own padding, because this is a second row of it: the row
       above is what the surface gives every document, and a second one cannot
       be portalled into it. */
    <div data-ui="AheadToggle" className="flex shrink-0 items-center gap-2 px-2 pb-1.5">
      <Tooltip content={<AheadTip />} side="bottom">
        <TogglePill
          label={label}
          count={count}
          active={on}
          size="xs"
          onClick={() => setOn(!on)}
          icon={<ClockCountdownIcon weight="duotone" className="h-3.5 w-3.5" />}
          /* A label and a count are two inline spans, which a screen reader runs
             together into one number unless the pill names itself. */
          aria-label={`${label}, ${count} ${count === 1 ? "finding" : "findings"} ahead`}
        />
      </Tooltip>
    </div>
  );
}

/**
 * Why these findings are set apart, and what the pill does about them.
 *
 * The sentence is the rule's own, because what a check waits for is the check's
 * own business. One sentence per rule and no more.
 */
function AheadTip() {
  const waiting = useDormantRules();
  const count = useAheadCount();
  const on = useForwardLookingMeta();

  return (
    <div className="flex max-w-xs flex-col gap-2 py-1 text-meta">
      <span className="text-row font-medium text-surface-50">Not broken yet</span>

      {waiting.map((info) => {
        if (info.state.kind !== "dormant") return null;

        return (
          <div key={info.id} className="flex flex-col gap-1">
            {waiting.length > 1 && <span className="text-surface-300">{info.title}</span>}
            <span className="text-surface-200">{info.state.reason}</span>
          </div>
        );
      })}

      <span className="border-t border-surface-700 pt-2 text-surface-400">
        {clickHint(count, on)}
      </span>
    </div>
  );
}

/**
 * What the pill calls itself: the one thing it waits for, or that there are two.
 *
 * A rule names its own wait, so two rules waiting on different patches share no
 * label but a general one.
 */
function pillLabel(waiting: readonly RuleInfo[]): string {
  const only = waiting.length === 1 ? waiting[0] : undefined;
  if (only?.state.kind === "dormant") return only.state.waiting;
  return "Coming patches";
}

function clickHint(count: number, on: boolean): string {
  if (on) return count === 1 ? "Click to take it off the list" : "Click to take them off the list";
  return count === 1
    ? "Click to list it below, dimmed"
    : `Click to list all ${count} below, dimmed`;
}
