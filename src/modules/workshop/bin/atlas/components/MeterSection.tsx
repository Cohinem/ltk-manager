import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";

import { Checkbox, IconButton, SegmentedControl, Slider } from "@/components";
import { m } from "@/i18n";
import type { PropertyEdit } from "@/lib/tauri";

import { groupFlagEdit, meterDirectionEdit, meterStartEdit } from "../engine/edit/elementEdits";
import { labelOf } from "../engine/model/layers";
import { clamp01, type ViewMeter } from "../engine/model/meters";
import type { ViewTree } from "../engine/model/tree";
import type { ViewElement } from "../engine/model/view";
import { useAtlasPreviewActions, useFrameSettings, useMeterFills } from "../state/atlasPreview";
import { DraftNumber, FieldLine, SectionBlock } from "./sectionParts";

const PERCENT = 100;
const FILL_STEP = 0.01;

type Direction = "fromLeft" | "fromRight";

export interface MeterSectionProps {
  readonly element: ViewElement;
  readonly meter: ViewMeter;
  readonly tree: ViewTree;
  /** The view's preview key, which holds the fill the reader set. */
  readonly view: string;
  readonly editable: boolean;
  readonly apply: (edits: readonly PropertyEdit[]) => void;
}

/**
 * A meter's own fields, per "Meters" in docs/research/ui-data-layout.md: whether it shows, the fill
 * it starts at and the edge it fills from, which the file holds, and the fill the preview draws,
 * which it does not. The bars and the tip read as the file names them.
 */
export function MeterSection({ element, meter, tree, view, editable, apply }: MeterSectionProps) {
  const own = useMeterFills(view)[element.key];
  const { samples, live } = useFrameSettings();
  const { setMeter } = useAtlasPreviewActions();
  const fill = clamp01(own ?? (samples ? live : meter.start));
  const named = (key: string) => {
    const held = tree.elements.get(key);
    return held === undefined ? key : labelOf(held.label, held.path, held.key);
  };

  return (
    <SectionBlock id="meter" title={m.workshop_bin_atlas_meter_title()}>
      <FieldLine label={m.workshop_bin_atlas_meter_enabled_label()}>
        <Checkbox
          size="sm"
          aria-label={m.workshop_bin_atlas_meter_enabled_label()}
          checked={meter.enabled}
          disabled={!editable}
          onCheckedChange={(next) => apply([groupFlagEdit(element.key, "IsEnabled", next)])}
        />
      </FieldLine>
      <FieldLine label={m.workshop_bin_atlas_meter_start_label()}>
        <DraftNumber
          value={Math.round(meter.start * PERCENT * 100) / 100}
          label={m.workshop_bin_atlas_meter_start_label()}
          min={0}
          disabled={!editable}
          onCommit={(value) => apply([meterStartEdit(element.key, clamp01(value / PERCENT))])}
        />
      </FieldLine>
      <FieldLine label={m.workshop_bin_atlas_meter_direction_label()}>
        <DirectionField element={element} meter={meter} editable={editable} apply={apply} />
      </FieldLine>
      <FieldLine label={m.workshop_bin_atlas_meter_fill_label()}>
        <Slider
          className="min-w-0 flex-1"
          aria-label={m.workshop_bin_atlas_meter_fill_label()}
          value={fill}
          min={0}
          max={1}
          step={FILL_STEP}
          animated={false}
          onValueChange={(next) => setMeter(view, element.key, next)}
        />
        <span className="w-9 shrink-0 text-right tabular-nums">
          {m.workshop_bin_atlas_hud_value({ percent: Math.round(fill * PERCENT) })}
        </span>
        <IconButton
          icon={<ArrowCounterClockwiseIcon className="size-3.5" />}
          disabled={own === undefined}
          onClick={() => setMeter(view, element.key, null)}
          label={m.workshop_bin_atlas_meter_fill_reset_action()}
        />
      </FieldLine>
      <FieldLine label={m.workshop_bin_atlas_meter_bars_label()}>
        <span className="min-w-0 truncate font-mono select-text">
          {meter.bars.map(named).join(", ") || m.workshop_bin_atlas_meter_no_bars_value()}
        </span>
      </FieldLine>
      {meter.tip !== null && (
        <FieldLine label={m.workshop_bin_atlas_meter_tip_label()}>
          <span className="min-w-0 truncate">{tipName(meter.tip.style)}</span>
        </FieldLine>
      )}
    </SectionBlock>
  );
}

/** The edge the bar fills from: a choice where the file takes edits, and its word where not. */
function DirectionField({
  element,
  meter,
  editable,
  apply,
}: Pick<MeterSectionProps, "element" | "meter" | "editable" | "apply">) {
  const labels: Record<Direction, string> = {
    fromLeft: m.workshop_bin_atlas_meter_from_left_value(),
    fromRight: m.workshop_bin_atlas_meter_from_right_value(),
  };
  if (meter.direction > 1) {
    return <span>{m.workshop_bin_atlas_meter_unfilled_value({ value: meter.direction })}</span>;
  }

  const direction: Direction = meter.direction === 1 ? "fromRight" : "fromLeft";
  if (!editable) return <span>{labels[direction]}</span>;

  return (
    <SegmentedControl<Direction>
      size="xs"
      aria-label={m.workshop_bin_atlas_meter_direction_label()}
      value={direction}
      onChange={(next) => {
        if (next !== direction) apply([meterDirectionEdit(element.key, next === "fromRight")]);
      }}
      options={[
        { value: "fromLeft", label: labels.fromLeft },
        { value: "fromRight", label: labels.fromRight },
      ]}
    />
  );
}

function tipName(style: NonNullable<ViewMeter["tip"]>["style"]): string {
  switch (style) {
    case "barExtension":
      return m.workshop_bin_atlas_meter_tip_extension_value();
    case "doubleSided":
      return m.workshop_bin_atlas_meter_tip_double_value();
    case "glowCenteredOverlay":
      return m.workshop_bin_atlas_meter_tip_glow_value();
  }
}
