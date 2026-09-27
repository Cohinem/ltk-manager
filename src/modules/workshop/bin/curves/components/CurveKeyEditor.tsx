import { InfoIcon, PaletteIcon } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";

import { Button, ColorPicker, Popover, StepperField, Tooltip } from "@/components";
import { m } from "@/i18n";
import type { RgbColor } from "@/utils";

import { Swatch } from "../../values/components/ColorMark";
import { type FieldUnit, UNIT_SUFFIX } from "../../values/utils/fieldUnits";
import { colorHex, type CurveKey, type ValueFamily } from "../../values/utils/valueRows";
import { CHANNELS, chipOf } from "../utils/curveChannels";
import { CURVE_TIME_STEP, curveValueStep, snapCurveValue } from "../utils/curveSnapping";

interface CurveKeyEditorProps {
  keys: readonly CurveKey[];
  family: ValueFamily;
  selected: readonly number[];
  unit: FieldUnit | null;
  editable: boolean;
  onCommit: (key: CurveKey) => void;
}

/** One line of the dock under the graph: the fields of the key selected on the canvas. */
const STRIP =
  "flex min-h-8 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-surface-700/40 px-2 py-1 text-meta select-none";

/**
 * The selected key's exact time and channels, in one strip under the graph.
 *
 * The graph selects, so the strip only edits. A selection of several keys reads as a count,
 * and the canvas's gestures sit in the hint at its end.
 */
export function CurveKeyEditor({
  keys,
  family,
  selected,
  unit,
  editable,
  onCommit,
}: CurveKeyEditorProps) {
  const selectedAt = selected.at(-1) ?? 0;
  const key = selected.length === 1 ? keys[selectedAt] : undefined;
  const [draft, setDraft] = useState<CurveKey | null>(key ?? null);

  useEffect(() => {
    setDraft(key ?? null);
  }, [key]);

  const hint = editable && keys.length > 0 && <GestureHint />;

  if (selected.length > 1) {
    return (
      <div data-ui="CurveKeyEditor" className={STRIP}>
        <span className="font-medium text-surface-300">
          {m.workshop_bin_curve_selected_count_label({ count: selected.length })}
        </span>
        <span className="min-w-0 truncate text-surface-500">
          {m.workshop_bin_curve_multi_selection_hint()}
        </span>
        {hint}
      </div>
    );
  }

  if (key === undefined || draft === null) {
    return (
      <div data-ui="CurveKeyEditor" className={STRIP}>
        <span className="text-surface-500">
          {keys.length === 0 && m.workshop_bin_curve_keys_empty()}
          {keys.length > 0 && m.workshop_bin_curve_selection_empty()}
        </span>
        {hint}
      </div>
    );
  }

  const previous = keys[selectedAt - 1];
  const next = keys[selectedAt + 1];
  const names = CHANNELS[family];
  const suffix = unit === null ? null : UNIT_SUFFIX[unit]();
  /* A vector's or a colour's channels are named by their sash, as the inspector's are. */
  const sashed = family !== "scalar";

  function changeTime(value: number, commit: boolean) {
    if (draft === null) return;

    const time = commit ? snapCurveValue(value, CURVE_TIME_STEP) : value;
    const changed = { ...draft, time };
    setDraft(changed);
    if (commit) onCommit(changed);
  }

  function changeChannel(channel: number, value: number, commit: boolean) {
    if (draft === null) return;

    const guide = curveValueStep(keys, channel, family === "color");
    const values = [...draft.values];
    values[channel] = commit ? snapCurveValue(value, guide) : value;
    const changed = { ...draft, values };
    setDraft(changed);
    if (commit) onCommit(changed);
  }

  function changeColor(rgb: RgbColor) {
    if (draft === null) return;

    const values = [...draft.values];
    values[0] = snapCurveValue(rgb[0], CURVE_TIME_STEP);
    values[1] = snapCurveValue(rgb[1], CURVE_TIME_STEP);
    values[2] = snapCurveValue(rgb[2], CURVE_TIME_STEP);
    const changed = { ...draft, values };
    setDraft(changed);
    onCommit(changed);
  }

  return (
    <div data-ui="CurveKeyEditor" className={STRIP}>
      <span className="font-medium text-surface-300 tabular-nums">
        {m.workshop_bin_curve_key_label({ current: selectedAt + 1, count: keys.length })}
      </span>
      <KeyField
        label={m.workshop_bin_curve_lifetime_label()}
        hint={m.workshop_bin_curve_lifetime_hint()}
      >
        <StepperField
          className="w-24 text-meta"
          aria-label={m.workshop_bin_curve_lifetime_label()}
          increaseLabel={m.common_number_increase_action()}
          decreaseLabel={m.common_number_decrease_action()}
          value={draft.time}
          min={previous?.time}
          max={next?.time}
          step={CURVE_TIME_STEP.step}
          smallStep={CURVE_TIME_STEP.smallStep}
          largeStep={CURVE_TIME_STEP.largeStep}
          decimals={CURVE_TIME_STEP.decimals}
          disabled={!editable}
          onValueChange={(value) => changeTime(value, false)}
          onValueCommitted={(value) => changeTime(value, true)}
        />
      </KeyField>

      {family === "color" && (
        <ColorEditor values={draft.values} editable={editable} onCommit={changeColor} />
      )}

      {draft.values.map((value, channel) => {
        const name = names[channel] ?? String(channel);
        const label = suffix === null ? name : `${name} ${suffix}`;
        const colorLimit = family === "color";
        const guide = curveValueStep(keys, channel, colorLimit);
        const field = (
          <StepperField
            key={channel}
            className="w-24 text-meta"
            aria-label={label}
            channel={sashed ? channel : undefined}
            increaseLabel={m.common_number_increase_action()}
            decreaseLabel={m.common_number_decrease_action()}
            value={value}
            min={colorLimit ? 0 : undefined}
            max={colorLimit ? 1 : undefined}
            step={guide.step}
            smallStep={guide.smallStep}
            largeStep={guide.largeStep}
            decimals={guide.decimals}
            disabled={!editable}
            onValueChange={(nextValue) => changeChannel(channel, nextValue, false)}
            onValueCommitted={(nextValue) => changeChannel(channel, nextValue, true)}
          />
        );

        if (sashed) return field;
        return (
          <KeyField key={channel} label={label} tone={chipOf(family, channel)}>
            {field}
          </KeyField>
        );
      })}
      {sashed && suffix !== null && <span className="-ml-2 text-surface-400">{suffix}</span>}
      {hint}
    </div>
  );
}

/** The canvas's gestures, behind a mark at the strip's end rather than a line under the plot. */
function GestureHint() {
  return (
    <Tooltip content={m.workshop_bin_curve_graph_edit_hint()}>
      <span
        tabIndex={0}
        aria-label={m.workshop_bin_curve_graph_edit_hint()}
        className="ml-auto flex cursor-help items-center text-surface-500 outline-none hover:text-surface-300 focus-visible:ring-1 focus-visible:ring-accent-500"
      >
        <InfoIcon weight="bold" className="h-3.5 w-3.5" />
      </span>
    </Tooltip>
  );
}

function KeyField({
  label,
  hint,
  tone,
  children,
}: {
  label: string;
  hint?: string;
  tone?: string;
  children: ReactNode;
}) {
  const text = <span className={tone ?? "text-surface-400"}>{label}</span>;

  return (
    <label className="flex items-center gap-1.5 text-meta">
      {hint !== undefined && <Tooltip content={hint}>{text}</Tooltip>}
      {hint === undefined && text}
      {children}
    </label>
  );
}

function ColorEditor({
  values,
  editable,
  onCommit,
}: {
  values: readonly number[];
  editable: boolean;
  onCommit: (rgb: RgbColor) => void;
}) {
  const [r = 0, g = 0, b = 0, a = 1] = values;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RgbColor>([r, g, b]);

  useEffect(() => {
    if (!open) setDraft([r, g, b]);
  }, [open, r, g, b]);

  const rgba = [draft[0], draft[1], draft[2], a] as const;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={!editable}
        className="flex h-6 w-32 cursor-pointer items-center gap-2 rounded-sm border border-surface-veil bg-surface-veil-soft px-1.5 text-left font-mono text-code text-surface-300 transition-colors hover:border-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Swatch rgba={rgba} className="h-4 w-4" />
        <span className="min-w-0 flex-1 truncate">{colorHex(rgba)}</span>
        <PaletteIcon aria-hidden className="h-3.5 w-3.5 text-surface-400" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="start" sideOffset={8}>
          <Popover.Popup className="w-64 p-3">
            <ColorPicker
              value={draft}
              label={m.workshop_bin_curve_edit_color_action()}
              onValueChange={setDraft}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
                {m.common_cancel_action()}
              </Button>
              <Button
                variant="filled"
                size="xs"
                onClick={() => {
                  onCommit(draft);
                  setOpen(false);
                }}
              >
                {m.workshop_bin_curve_save_color_action()}
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
