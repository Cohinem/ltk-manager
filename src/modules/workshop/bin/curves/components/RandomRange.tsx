import {
  ArrowsHorizontalIcon,
  type Icon,
  LineVerticalIcon,
  LinkSimpleIcon,
  PlusMinusIcon,
} from "@phosphor-icons/react";

import { Readout, Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { type FieldUnit, UNIT_SUFFIX } from "../../values/utils/fieldUnits";
import type { ValueFamily, ValueRange } from "../../values/utils/valueRows";
import type { RandomEdit } from "../state/randomEdit";
import { channelName, CHIP } from "../utils/curveChannels";
import { type ChannelDraw, drawSpan, isRandom } from "../utils/randomDraw";
import {
  fieldScale,
  type PickedShape,
  shapeKeys,
  splitReach,
  tableKeys,
  withReach,
  withSpan,
} from "../utils/randomEdits";
import { drawnOver, readout, shapeText } from "../utils/randomText";

interface RangeLabelProps {
  channel: ChannelDraw;
  family: ValueFamily;
  unit: FieldUnit | null;
  editor: RandomEdit;
}

/**
 * A channel's name, the range it draws in fields that write its table, and the shape it
 * takes. "The random spread" in docs/ux/BIN_EDITOR.md.
 *
 * A range reads the result where the base holds still, and the factor where it moves or is
 * 0. A split edits its sizes, which both halves share.
 */
export function RangeLabel({ channel, family, unit, editor }: RangeLabelProps) {
  const reach = editor.reach(channel);
  const named = family !== "scalar";

  return (
    <div data-ui="RandomRange" className="flex min-w-0 flex-col gap-0.5 leading-tight select-none">
      <span className="flex items-center gap-1.5">
        {named && (
          <span
            /* DS-KIND-HUE, DS-TEXT */
            className={twMerge(
              "w-3 shrink-0 font-mono text-meta font-semibold",
              CHIP[channel.channel] ?? CHIP[0],
            )}
          >
            {channelName(family, channel.channel)}
          </span>
        )}
        <RangeFields channel={channel} family={family} unit={unit} editor={editor} />
      </span>
      <span className={twMerge("flex items-center gap-1.5", named && "pl-4.5")}>
        <ShapePicker channel={channel} editor={editor} />
        {reach.length > 1 && <LinkMark family={family} channels={reach} own={channel.channel} />}
      </span>
    </div>
  );
}

function RangeFields({ channel, family, unit, editor }: RangeLabelProps) {
  const scale = fieldScale(channel);
  const factorOnly = channel.results === null;
  const suffix = factorOnly || unit === null ? null : UNIT_SUFFIX[unit]();
  const name = family === "scalar" ? "" : channelName(family, channel.channel);

  if (!isRandom(channel.shape) || channel.table === null) {
    const still = drawnOver(channel, channel.results === null ? null : channel.base);
    return (
      <span className="flex items-baseline gap-1.5 font-mono text-code text-surface-400">
        {still}
        {still !== "" && suffix !== null && <span className="font-sans text-meta">{suffix}</span>}
      </span>
    );
  }

  const keys = tableKeys(channel.table);
  const split = channel.shape === "split";
  const range = split ? splitReach(channel) : drawSpan(channel);
  if (range === null) return null;

  const commit = (end: keyof ValueRange, text: string) => {
    const value = Number(text);
    if (text.trim() === "" || !Number.isFinite(value)) return;

    const next = { ...range, [end]: value };
    const to = { least: Math.min(next.least, next.most), most: Math.max(next.least, next.most) };
    editor.write(channel, split ? withReach(keys, scale, to) : withSpan(keys, scale, to));
  };

  return (
    <span className="flex min-w-0 items-center gap-1 font-mono text-code">
      {split && <span className="text-surface-400">{SPLIT_SIGN}</span>}
      {factorOnly && <span className="text-surface-400">{TIMES_SIGN}</span>}
      <Readout
        value={readout(range.least)}
        aria-label={m.workshop_bin_random_least_label({ channel: name })}
        className="w-16"
        onCommit={(text) => commit("least", text)}
      />
      <span className="text-surface-500">{RANGE_SEPARATOR}</span>
      <Readout
        value={readout(range.most)}
        aria-label={m.workshop_bin_random_most_label({ channel: name })}
        className="w-16"
        onCommit={(text) => commit("most", text)}
      />
      {suffix !== null && <span className="font-sans text-meta text-surface-400">{suffix}</span>}
    </span>
  );
}

interface RangeEndProps {
  channel: ChannelDraw;
  family: ValueFamily;
  unit: FieldUnit | null;
  /** Null where the document takes no edit, and the end reads as text. */
  editor: RandomEdit | null;
  end: keyof ValueRange;
}

/**
 * One end of a channel's range, as a lane's row places it: the least before the lane and the
 * most after it with the unit. Each writes the table as the fields of `RangeLabel` do. A
 * channel that draws no range reads its value after the lane, and nothing before it.
 */
export function RangeEnd({ channel, family, unit, editor, end }: RangeEndProps) {
  const factorOnly = channel.results === null;
  const suffix = end === "most" && !factorOnly && unit !== null ? UNIT_SUFFIX[unit]() : null;

  if (!isRandom(channel.shape) || channel.table === null) {
    if (end === "least") return <span />;
    const still = drawnOver(channel, factorOnly ? null : channel.base);
    return <EndText sign={null} text={still} suffix={still === "" ? null : suffix} />;
  }

  const split = channel.shape === "split";
  const range = split ? splitReach(channel) : drawSpan(channel);
  if (range === null) return <span />;

  let sign: string | null = null;
  if (end === "least" && split) sign = SPLIT_SIGN;
  if (end === "least" && !split && factorOnly) sign = TIMES_SIGN;
  if (editor === null) return <EndText sign={sign} text={readout(range[end])} suffix={suffix} />;

  const name = family === "scalar" ? "" : channelName(family, channel.channel);
  const label =
    end === "least"
      ? m.workshop_bin_random_least_label({ channel: name })
      : m.workshop_bin_random_most_label({ channel: name });
  const table = channel.table;
  const commit = (text: string) => {
    const value = Number(text);
    if (text.trim() === "" || !Number.isFinite(value)) return;

    const next = { ...range, [end]: value };
    const to = { least: Math.min(next.least, next.most), most: Math.max(next.least, next.most) };
    const keys = tableKeys(table);
    const scale = fieldScale(channel);
    editor.write(channel, split ? withReach(keys, scale, to) : withSpan(keys, scale, to));
  };

  return (
    <span className="flex items-center gap-1 font-mono text-code">
      {sign !== null && <span className="text-surface-400">{sign}</span>}
      <Readout value={readout(range[end])} aria-label={label} className="w-16" onCommit={commit} />
      {suffix !== null && <span className="font-sans text-meta text-surface-400">{suffix}</span>}
    </span>
  );
}

function EndText({
  sign,
  text,
  suffix,
}: {
  sign: string | null;
  text: string;
  suffix: string | null;
}) {
  return (
    <span className="flex items-baseline gap-1 font-mono text-code text-surface-300 tabular-nums select-text">
      {sign !== null && <span className="text-surface-400">{sign}</span>}
      {text}
      {suffix !== null && <span className="font-sans text-meta text-surface-400">{suffix}</span>}
    </span>
  );
}

/**
 * A lane's shape: the switch between fixed, uniform and split with the channels an edit also
 * writes, or the shape's word where the document takes no edit.
 */
export function ShapeCell({
  channel,
  family,
  editor,
}: {
  channel: ChannelDraw;
  family: ValueFamily;
  editor: RandomEdit | null;
}) {
  if (editor === null) {
    return <span className="text-meta text-surface-400 select-none">{shapeText(channel)}</span>;
  }

  const reach = editor.reach(channel);
  return (
    <span className="flex items-center gap-1.5">
      <ShapePicker channel={channel} editor={editor} />
      {reach.length > 1 && <LinkMark family={family} channels={reach} own={channel.channel} />}
    </span>
  );
}

/* Signs the fields sit behind: a split reads both signs, and a factor reads as a multiplier. */
const SPLIT_SIGN = "±";
const TIMES_SIGN = "×";
const RANGE_SEPARATOR = "..";

const SHAPES: readonly PickedShape[] = ["fixed", "uniform", "split"];

/**
 * The shapes a channel switches between in one press, each an icon named on hover. A custom
 * table names itself beside them.
 */
function ShapePicker({ channel, editor }: { channel: ChannelDraw; editor: RandomEdit }) {
  const current = channel.shape === "always" || channel.shape === "dead" ? null : channel.shape;

  return (
    <span
      role="radiogroup"
      aria-label={m.workshop_bin_random_shape_label()}
      className="flex items-center gap-0.5 text-meta"
    >
      {SHAPES.map((shape) => {
        const { icon: Glyph, word, hint } = SHAPE[shape];
        return (
          <Tooltip key={shape} content={hint()}>
            <button
              type="button"
              role="radio"
              aria-checked={current === shape}
              aria-label={word()}
              /* DS-RADIUS, DS-VEIL */
              className={twMerge(
                "flex size-5 cursor-pointer items-center justify-center rounded-sm text-surface-400 hover:bg-surface-veil hover:text-surface-200",
                current === shape &&
                  "bg-surface-veil text-accent-300 hover:bg-surface-veil hover:text-accent-300",
              )}
              onClick={() => {
                if (current !== shape) editor.write(channel, shapeKeys(channel, shape));
              }}
            >
              <Glyph weight="bold" className="size-3.5" />
            </button>
          </Tooltip>
        );
      })}
      {current !== "fixed" && current !== "uniform" && current !== "split" && (
        <span className="px-1 text-surface-500">{shapeText(channel)}</span>
      )}
    </span>
  );
}

const SHAPE: Readonly<Record<PickedShape, { icon: Icon; word: () => string; hint: () => string }>> =
  {
    fixed: {
      icon: LineVerticalIcon,
      word: m.workshop_bin_random_fixed_label,
      hint: m.workshop_bin_random_fixed_hint,
    },
    uniform: {
      icon: ArrowsHorizontalIcon,
      word: m.workshop_bin_random_uniform_label,
      hint: m.workshop_bin_random_uniform_hint,
    },
    split: {
      icon: PlusMinusIcon,
      word: m.workshop_bin_random_split_label,
      hint: m.workshop_bin_random_split_hint,
    },
  };

/** The channels an edit of this one also writes, since they draw one table over one base. */
function LinkMark({
  family,
  channels,
  own,
}: {
  family: ValueFamily;
  channels: readonly number[];
  own: number;
}) {
  const others = channels
    .filter((each) => each !== own)
    .map((each) => channelName(family, each))
    .join(" ");
  const hint = m.workshop_bin_random_linked_hint({ channels: others });

  return (
    <Tooltip content={hint}>
      <span tabIndex={0} aria-label={hint} className="flex cursor-help text-surface-400">
        <LinkSimpleIcon weight="bold" className="size-3" />
      </span>
    </Tooltip>
  );
}
