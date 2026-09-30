import { Checkbox, SegmentedControl, Select } from "@/components";
import { m } from "@/i18n";
import type { PropertyEdit } from "@/lib/tauri";

import { comboDirectionEdit } from "../engine/edit/elementEdits";
import { CLOSED_COMBO, type ComboBox, MAX_COMBO_OPTIONS } from "../engine/model/combo";
import { useAtlasPreviewActions, useViewPreview } from "../state/atlasPreview";
import { DraftNumber, FieldLine, SectionBlock } from "./sectionParts";

/** The select value of no selection, which no option index spells. */
const NONE = "none";

type Direction = "down" | "up";

export interface ComboSectionProps {
  readonly combo: ComboBox;
  /** The view's preview key, which holds the combo box's preview state. */
  readonly view: string;
  readonly editable: boolean;
  readonly apply: (edits: readonly PropertyEdit[]) => void;
}

/**
 * The combo box an element belongs to: whether its list is open, how many options the preview
 * lists and which is selected, none of which the file holds, and the way the list opens, which it
 * does. The label key and the selection's sound read as the file writes them.
 */
export function ComboSection({ combo, view, editable, apply }: ComboSectionProps) {
  const state = useViewPreview(view).combos[combo.key] ?? CLOSED_COMBO;
  const { setCombo } = useAtlasPreviewActions();
  const change = (next: Partial<typeof state>) => setCombo(view, combo.key, next);
  const options = Array.from({ length: state.options }, (_, at) => at);

  return (
    <SectionBlock id="combo" title={m.workshop_bin_atlas_combo_title()}>
      <FieldLine label={m.workshop_bin_atlas_combo_open_label()}>
        <Checkbox
          size="sm"
          aria-label={m.workshop_bin_atlas_combo_open_label()}
          checked={state.open}
          onCheckedChange={(open) => change({ open })}
        />
      </FieldLine>
      <FieldLine label={m.workshop_bin_atlas_combo_options_label()}>
        <DraftNumber
          value={state.options}
          scrub={m.workshop_bin_atlas_combo_options_label()}
          min={1}
          disabled={false}
          onCommit={(value) => {
            const count = Math.min(MAX_COMBO_OPTIONS, Math.max(1, Math.round(value)));
            change({ options: count, selected: Math.min(state.selected, count - 1) });
          }}
        />
      </FieldLine>
      <FieldLine label={m.workshop_bin_atlas_combo_selected_label()}>
        <Select.Root
          value={state.selected < 0 ? NONE : String(state.selected)}
          onValueChange={(next) => {
            if (next !== null) change({ selected: next === NONE ? -1 : Number(next) });
          }}
        >
          <Select.Trigger
            aria-label={m.workshop_bin_atlas_combo_selected_label()}
            className="h-7 min-w-0 flex-1 gap-1 px-2 text-meta"
          >
            <Select.Value className="truncate">
              {(value: string) => optionLabel(value)}
            </Select.Value>
            <Select.Icon />
          </Select.Trigger>
          <Select.Portal>
            <Select.Positioner>
              <Select.Popup className="max-h-80">
                <Select.Item value={NONE}>{m.workshop_bin_atlas_combo_none_value()}</Select.Item>
                {options.map((option) => (
                  <Select.Item key={option} value={String(option)}>
                    {optionLabel(String(option))}
                  </Select.Item>
                ))}
              </Select.Popup>
            </Select.Positioner>
          </Select.Portal>
        </Select.Root>
      </FieldLine>
      <FieldLine label={m.workshop_bin_atlas_combo_direction_label()}>
        <DirectionField combo={combo} editable={editable} apply={apply} />
      </FieldLine>
      {combo.labelKey !== null && (
        <FieldLine label={m.workshop_bin_atlas_combo_label_key_label()}>
          <span className="min-w-0 truncate font-mono select-text">{combo.labelKey}</span>
        </FieldLine>
      )}
      {combo.selectionSound !== null && (
        <FieldLine label={m.workshop_bin_atlas_combo_sound_label()}>
          <span className="min-w-0 truncate font-mono select-text">{combo.selectionSound}</span>
        </FieldLine>
      )}
    </SectionBlock>
  );
}

/** The way the list opens: a choice where the file takes edits, and its word where it does not. */
function DirectionField({ combo, editable, apply }: Omit<ComboSectionProps, "view">) {
  const direction: Direction = combo.upward ? "up" : "down";
  const labels: Record<Direction, string> = {
    down: m.workshop_bin_atlas_combo_down_value(),
    up: m.workshop_bin_atlas_combo_up_value(),
  };
  if (!editable) return <span>{labels[direction]}</span>;

  return (
    <SegmentedControl<Direction>
      size="xs"
      aria-label={m.workshop_bin_atlas_combo_direction_label()}
      value={direction}
      onChange={(next) => {
        if (next !== direction) apply([comboDirectionEdit(combo.key, next === "up")]);
      }}
      options={[
        { value: "down", label: labels.down },
        { value: "up", label: labels.up },
      ]}
    />
  );
}

function optionLabel(value: string): string {
  if (value === NONE) return m.workshop_bin_atlas_combo_none_value();
  return m.workshop_bin_atlas_combo_option_value({ number: Number(value) + 1 });
}
