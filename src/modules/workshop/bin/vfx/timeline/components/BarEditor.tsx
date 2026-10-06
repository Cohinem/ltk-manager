import { use } from "react";

import { Checkbox, Popover, Select, StepperField } from "@/components";
import { m } from "@/i18n";
import type { BinRow, LeafValue } from "@/lib/tauri";

import { LeafEditContext } from "../../../tree/hooks/useLeafEdit";
import { enumText, fieldEnum } from "../../../values/utils/fieldEnums";
import { emitterPlace } from "../../clipboard/emitterCopy";
import { holderRow } from "../../drivers/utils/holderRow";
import { LINGER_TYPE } from "../../engine/model/enums";
import type { EmitterModel } from "../../engine/model/model";
import { emissionEnd } from "../../engine/model/systemModel";
import { emitterLabel } from "../../inspector/utils/emitterLabels";
import { clearedEdits, seconds, TIMING, timingEdits, type TimingName } from "../utils/timingEdits";

/** The most seconds a timing field takes, ten minutes being past any system's span. */
const MOST_SECONDS = 600;

interface BarEditorProps {
  emitter: EmitterModel;
  /** The emitter's row, whose path names its list and its index. */
  row: BinRow;
  /** Where the popover opens, a point on the screen, and null while it is closed. */
  at: { readonly x: number; readonly y: number } | null;
  onClose: () => void;
}

/**
 * A popover with an emitter's timing fields: start delay, end time, lingers, period, single
 * burst and variable start. A line under the name states how long the emitter emits for. Each
 * field commits on its own as one undo step. A double click on the lane's bar opens it. "The
 * timeline" in docs/ux/BIN_EDITOR.md.
 */
export function BarEditor({ emitter, row, at, onClose }: BarEditorProps) {
  const editProperty = use(LeafEditContext)?.editProperty;
  const place = emitterPlace(row.path);
  if (editProperty === undefined || place === null) return null;

  const holder = holderRow(row.entry, "");
  const write = (field: TimingName, value: LeafValue) =>
    void editProperty(holder, place.list, timingEdits(place.index, [{ field, value }]));
  const clear = (field: TimingName) =>
    void editProperty(holder, place.list, clearedEdits(place.index, field));
  const cycle = emitter.period?.length ?? null;

  return (
    <Popover.Root
      open={at !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Popover.Content
        anchor={at === null ? undefined : pointAnchor(at)}
        side="bottom"
        align="start"
        sideOffset={6}
        data-ui="BarEditor"
        className="flex w-80 flex-col gap-2 p-3"
      >
        <Popover.Title className="truncate text-row font-medium text-surface-200">
          {emitter.name}
        </Popover.Title>
        <p data-ui="BarEditor:span" className="text-meta text-surface-400">
          {spanText(emitter)}
        </p>
        <Seconds
          label={label("timeBeforeFirstEmission")}
          value={emitter.timeBeforeFirstEmission}
          onCommit={(value) => write("timeBeforeFirstEmission", seconds(value))}
        />
        <Seconds
          label={label("lifetime")}
          value={emitter.lifetime ?? 0}
          disabled={emitter.lifetime === null}
          onCommit={(value) => write("lifetime", seconds(value))}
        />
        <Checkbox
          size="sm"
          label={m.workshop_bin_timeline_endless_action()}
          checked={emitter.lifetime === null}
          onCheckedChange={(endless) => {
            if (endless) clear("lifetime");
            else write("lifetime", seconds(1));
          }}
        />
        <Seconds
          label={label("emitterLinger")}
          value={emitter.emitterLinger}
          onCommit={(value) => write("emitterLinger", seconds(value))}
        />
        {!emitter.simple && (
          <>
            <Seconds
              label={label("particleLinger")}
              value={emitter.particleLinger}
              onCommit={(value) => write("particleLinger", seconds(value))}
            />
            <LingerKind
              value={emitter.lingerType}
              onCommit={(value) =>
                write("particleLingerType", { type: "integer", text: String(value) })
              }
            />
          </>
        )}
        <Checkbox
          size="sm"
          label={m.workshop_bin_timeline_repeats_action()}
          checked={cycle !== null}
          onCheckedChange={(repeats) => {
            if (repeats) write("period", seconds(1));
            else clear("period");
          }}
        />
        {cycle !== null && (
          <>
            <Seconds
              label={label("period")}
              value={cycle}
              onCommit={(value) => write("period", seconds(value))}
            />
            <Seconds
              label={label("timeActiveDuringPeriod")}
              value={emitter.period?.active ?? cycle}
              onCommit={(value) => write("timeActiveDuringPeriod", seconds(value))}
            />
          </>
        )}
        <Checkbox
          size="sm"
          label={label("isSingleParticle")}
          checked={emitter.singleParticle}
          onCheckedChange={(burst) => write("isSingleParticle", { type: "bool", value: burst })}
        />
        {!emitter.simple && (
          <Checkbox
            size="sm"
            label={label("HasVariableStartTime")}
            checked={emitter.hasVariableStartTime}
            onCheckedChange={(variable) =>
              write("HasVariableStartTime", { type: "bool", value: variable })
            }
          />
        )}
      </Popover.Content>
    </Popover.Root>
  );
}

function label(field: TimingName): string {
  return emitterLabel(TIMING[field], field) ?? field;
}

/** `value` as text, with at most two decimals and no trailing zeroes. */
function plain(value: number): string {
  return String(Number(value.toFixed(2)));
}

/**
 * A sentence stating when and for how long the emitter emits.
 *
 * `lifetime` is an end time counted from the system's start, so the duration is the end time
 * minus the start delay.
 */
function spanText(emitter: EmitterModel): string {
  const from = emitter.timeBeforeFirstEmission;
  const end = emissionEnd(emitter);
  if (end !== null && end <= from) return m.workshop_bin_timeline_span_never_label();
  if (emitter.singleParticle) return m.workshop_bin_timeline_bar_burst_label({ from: plain(from) });
  if (end === null) return m.workshop_bin_timeline_bar_endless_label({ from: plain(from) });

  return m.workshop_bin_timeline_span_label({
    from: plain(from),
    to: plain(end),
    seconds: plain(end - from),
  });
}

const LINGER_KINDS = Object.values(LINGER_TYPE);

/** A select for `particleLingerType`, listing the engine's names for its values. */
function LingerKind({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const text = label("particleLingerType");
  const held = fieldEnum(TIMING.particleLingerType);
  const nameOf = (kind: number) => (held === null ? null : enumText(held, kind)) ?? String(kind);

  return (
    <label className="flex items-center justify-between gap-2 text-meta text-surface-300">
      <span className="truncate">{text}</span>
      <Select.Root
        value={String(value)}
        onValueChange={(next) => {
          if (next !== null && Number(next) !== value) onCommit(Number(next));
        }}
      >
        <Select.Trigger size="xs" aria-label={text} className="w-44 shrink-0 text-meta">
          <Select.Value>{() => nameOf(value)}</Select.Value>
          <Select.Icon />
        </Select.Trigger>
        <Select.Content>
          {LINGER_KINDS.map((kind) => (
            <Select.Item key={kind} value={String(kind)}>
              {nameOf(kind)}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </label>
  );
}

function Seconds({
  label: text,
  value,
  disabled = false,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-meta text-surface-300">
      <span className="truncate">{text}</span>
      <StepperField
        value={value}
        onValueChange={() => {}}
        onValueCommitted={(next) => {
          if (next !== value) onCommit(next);
        }}
        min={0}
        max={MOST_SECONDS}
        step={0.1}
        smallStep={0.01}
        largeStep={1}
        decimals={2}
        disabled={disabled}
        aria-label={text}
        className="w-24 shrink-0 text-meta"
      />
    </label>
  );
}

/** A point on the screen as an element the popover stands beside. */
function pointAnchor(at: { readonly x: number; readonly y: number }) {
  return {
    getBoundingClientRect: () => DOMRect.fromRect({ x: at.x, y: at.y, width: 0, height: 0 }),
  };
}
