import { PlusMinusIcon } from "@phosphor-icons/react";
import { type ReactNode, use } from "react";

import { Readout, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";
import { twMerge } from "@/utils";

import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import type { ValueMark } from "../../values/utils/valueRows";
import { CHANNELS } from "../utils/curveChannels";
import { constantValues, CURVE_DYNAMICS } from "../utils/curveEdits";
import {
  type RandomEnds,
  randomEnds,
  randomizeEdits,
  startingEnds,
  unrandomizeEdits,
} from "../utils/randomizer";
import { readout } from "../utils/randomText";

/**
 * The writes a value row's Random mode makes: turning a value random, writing its ends, and
 * leaving it for a curve. Null where the row cannot be written.
 */
export function useRandomizer(row: BinRow, mark: ValueMark | undefined) {
  const editProperty = use(LeafEditContext)?.editProperty;
  const valueClass = row.value.type === "struct" ? row.value.classHash : null;
  if (editProperty === undefined || valueClass === null || mark === undefined) return null;

  const write = (ends: RandomEnds) => {
    const edits = randomizeEdits(mark, valueClass, ends);
    return edits === null ? Promise.resolve(false) : editProperty(row, CURVE_DYNAMICS, edits);
  };
  return {
    write,
    /** Turn the value random at the level it holds now, both ends on it. */
    start: () => {
      const level = mark.keys[0]?.values ?? constantValues(mark.constant, mark.family);
      return write(startingEnds(level));
    },
    /** Leave the curve drawing its base alone, a fixed table on each channel. */
    stop: () => editProperty(row, CURVE_DYNAMICS, unrandomizeEdits(mark)),
  };
}

/**
 * A random value as its Min and Max, one field per channel each, and a random sign per
 * channel. "The randomizer" in docs/ux/BIN_EDITOR.md.
 *
 * A particle rolls once and lands on the line from Min to Max, so the channels move together
 * rather than each rolling its own.
 */
export function RandomFields({ row, mark }: { row: BinRow; mark: ValueMark }) {
  const randomizer = useRandomizer(row, mark);
  const ends = randomEnds(mark);
  if (ends === null) return null;

  const names = CHANNELS[mark.family];
  const channels = mark.family === "scalar" ? [] : names;
  const signed = mark.family !== "color";
  const set = (end: "min" | "max", channel: number, text: string) => {
    const value = Number(text);
    if (randomizer === null || text.trim() === "" || !Number.isFinite(value)) return;
    void randomizer.write({
      ...ends,
      [end]: ends[end].map((each, at) => (at === channel ? value : each)),
    });
  };
  const flip = (channel: number) => {
    void randomizer?.write({
      ...ends,
      sign: ends.sign.map((each, at) => (at === channel ? !each : each)),
    });
  };

  return (
    <span
      data-ui="RandomFields"
      className="grid min-w-0 items-center gap-x-1 gap-y-0.5"
      style={{ gridTemplateColumns: `auto repeat(${ends.min.length}, minmax(0, 5rem))` }}
    >
      <EndLabel hint={m.workshop_bin_random_ends_hint()}>
        {m.workshop_bin_random_min_label()}
      </EndLabel>
      {ends.min.map((value, channel) => (
        <Readout
          key={channel}
          value={readout(value)}
          label={channels[channel]}
          channel={channels.length > 0 ? channel : undefined}
          aria-label={`${m.workshop_bin_random_min_label()} ${channels[channel] ?? ""}`}
          className="w-full"
          onCommit={randomizer === null ? undefined : (text) => set("min", channel, text)}
        />
      ))}
      <EndLabel hint={m.workshop_bin_random_ends_hint()}>
        {m.workshop_bin_random_max_label()}
      </EndLabel>
      {ends.max.map((value, channel) => (
        <Readout
          key={channel}
          value={readout(value)}
          label={channels[channel]}
          channel={channels.length > 0 ? channel : undefined}
          aria-label={`${m.workshop_bin_random_max_label()} ${channels[channel] ?? ""}`}
          className="w-full"
          onCommit={randomizer === null ? undefined : (text) => set("max", channel, text)}
        />
      ))}
      {signed && <span />}
      {signed &&
        ends.sign.map((on, channel) => {
          const label = m.workshop_bin_random_sign_action({ channel: names[channel] ?? "" });
          return (
            <Tooltip key={channel} content={label}>
              <button
                type="button"
                aria-label={label}
                aria-pressed={on}
                disabled={randomizer === null}
                /* DS-RADIUS, DS-VEIL */
                className={twMerge(
                  "flex h-5 cursor-pointer items-center justify-center rounded-sm text-surface-500 hover:bg-surface-veil hover:text-surface-200 disabled:cursor-default",
                  on && "bg-surface-veil text-accent-300 hover:text-accent-300",
                )}
                onClick={() => flip(channel)}
              >
                <PlusMinusIcon weight="bold" className="h-3 w-3" />
              </button>
            </Tooltip>
          );
        })}
    </span>
  );
}

function EndLabel({ hint, children }: { hint: string; children: ReactNode }) {
  return (
    <Tooltip content={hint}>
      <span className="cursor-help pr-1 text-meta text-surface-400 select-none">{children}</span>
    </Tooltip>
  );
}
