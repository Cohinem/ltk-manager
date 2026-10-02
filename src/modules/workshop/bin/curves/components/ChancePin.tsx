import { DiceFiveIcon } from "@phosphor-icons/react";
import { use, useState } from "react";

import { Button, Popover, Slider, Switch, Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { VfxRunContext } from "../../vfx/playback/state/run";

/** Where the slider starts before a chance is picked, the middle of the chance. */
const MIDDLE = 0.5;

/** The finest chance the slider tells apart. */
const STEP = 0.01;

/**
 * The chance the run is pinned at, which a reading of the values carries while a pin holds.
 *
 * The slider belongs to the transport, per "The chance belongs to the run, and the header
 * reads it" in docs/ux/BIN_EDITOR.md, so this says what is pinned and never sets it.
 */
export function ChanceReadout({ className }: { className?: string }) {
  const run = use(VfxRunContext);
  if (run === null || run.pinned === null) return null;

  return (
    <span
      data-ui="ChanceReadout"
      className={twMerge(
        "flex shrink-0 items-center gap-1 font-sans text-meta text-surface-400 select-none",
        className,
      )}
    >
      {m.workshop_bin_random_chance_label()}
      <span className="font-mono text-code text-accent-300 tabular-nums">
        {run.pinned.toFixed(2)}
      </span>
    </span>
  );
}

/**
 * The switch that pins every birth of the run at one chance, and the slider that sets it.
 *
 * Off by default, where each birth draws its own chance as the game does, and nothing else
 * in the curve pane sets it. The slider keeps the last chance picked while the pin is off.
 * Nothing outside a run, where there is no birth to pin.
 */
export function ChancePin({ className }: { className?: string }) {
  const run = use(VfxRunContext);
  const [kept, setKept] = useState(MIDDLE);
  if (run === null) return null;

  const { pinned, setPinned } = run;
  const on = pinned !== null;

  return (
    <span
      data-ui="ChancePin"
      className={twMerge(
        "flex shrink-0 items-center gap-2 font-sans text-meta text-surface-400 select-none",
        className,
      )}
    >
      <Switch
        aria-label={m.workshop_bin_random_pin_action()}
        checked={on}
        onCheckedChange={(next) => setPinned(next ? kept : null)}
      />
      {m.workshop_bin_random_chance_label()}
      <Slider
        aria-label={m.workshop_bin_random_chance_label()}
        className="w-28"
        disabled={!on}
        min={0}
        max={1}
        step={STEP}
        value={pinned ?? kept}
        onValueChange={(chance) => {
          setKept(chance);
          setPinned(chance);
        }}
      />
      {on && (
        <span className="w-8 font-mono text-code text-accent-300 tabular-nums">
          {pinned.toFixed(2)}
        </span>
      )}
      {!on && <span className="text-surface-500">{m.workshop_bin_random_per_spawn_label()}</span>}
    </span>
  );
}

/**
 * A dice button that opens `ChancePin` in a popover, for a row with no room for the slider.
 *
 * The button reads the pinned chance beside the dice and lights while a pin holds, so the
 * run's state shows with the popover shut. Nothing outside a run.
 */
export function ChanceButton({ className }: { className?: string }) {
  const run = use(VfxRunContext);
  if (run === null) return null;

  const { pinned } = run;
  const label =
    pinned === null
      ? m.workshop_bin_random_per_spawn_label()
      : m.workshop_bin_random_pinned_label({ chance: pinned.toFixed(2) });

  return (
    <Popover.Root>
      <Tooltip content={label}>
        <Popover.Trigger
          render={
            <Button
              variant="ghost"
              size="xs"
              compact
              aria-label={m.workshop_bin_random_chance_label()}
              data-ui="ChanceButton"
              data-pinned={pinned !== null || undefined}
              className={twMerge(
                "shrink-0 gap-1 text-surface-400 data-pinned:bg-accent-500/15 data-pinned:text-accent-300",
                className,
              )}
              left={<DiceFiveIcon weight="bold" className="size-4" />}
            >
              {pinned !== null && (
                <span className="font-mono text-code tabular-nums">{pinned.toFixed(2)}</span>
              )}
            </Button>
          }
        />
      </Tooltip>
      <Popover.Content
        side="top"
        align="end"
        sideOffset={6}
        aria-label={m.workshop_bin_random_chance_label()}
        className="p-2"
      >
        <ChancePin />
      </Popover.Content>
    </Popover.Root>
  );
}
