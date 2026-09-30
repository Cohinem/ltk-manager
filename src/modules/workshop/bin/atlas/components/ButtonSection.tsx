import { Checkbox } from "@/components";
import { m } from "@/i18n";
import type { PropertyEdit } from "@/lib/tauri";

import { type GroupFlag, groupFlagEdit } from "../engine/edit/elementEdits";
import { BUTTON_STATES, type ViewButton } from "../engine/model/buttons";
import { labelOf } from "../engine/model/layers";
import type { ViewTree } from "../engine/model/tree";
import type { ViewElement } from "../engine/model/view";
import { FieldLine, SectionBlock } from "./sectionParts";

export interface ButtonSectionProps {
  readonly element: ViewElement;
  readonly button: ViewButton;
  readonly tree: ViewTree;
  readonly editable: boolean;
  readonly apply: (edits: readonly PropertyEdit[]) => void;
}

/**
 * A button's own fields, per "Buttons" in docs/research/ui-data-layout.md: the flags the client
 * starts it with, which pick the state it rests in, the states the file writes, the region a click
 * lands in, and the tooltip keys it shows.
 */
export function ButtonSection({ element, button, tree, editable, apply }: ButtonSectionProps) {
  const flag = (field: GroupFlag, label: string, value: boolean) => (
    <FieldLine label={label}>
      <Checkbox
        size="sm"
        aria-label={label}
        checked={value}
        disabled={!editable}
        onCheckedChange={(next) => apply([groupFlagEdit(element.key, field, next)])}
      />
    </FieldLine>
  );
  const named = (key: string | null) => {
    const held = key === null ? undefined : tree.elements.get(key);
    return held === undefined ? key : labelOf(held.label, held.path, held.key);
  };
  const states = element.look.kind === "group" ? element.look.states : [];
  const written = BUTTON_STATES.filter((state) => states.some((each) => each.state === state));

  return (
    <SectionBlock id="button" title={m.workshop_bin_atlas_button_title()}>
      {flag("IsEnabled", m.workshop_bin_atlas_button_enabled_label(), button.enabled)}
      {flag("IsActive", m.workshop_bin_atlas_button_active_label(), button.active)}
      {flag("IsSelected", m.workshop_bin_atlas_button_selected_label(), button.selected)}
      <FieldLine label={m.workshop_bin_atlas_button_states_label()}>
        <span className="min-w-0 truncate">
          {written.map(stateName).join(", ") || m.workshop_bin_atlas_button_no_states_value()}
        </span>
      </FieldLine>
      {button.hitRegion !== null && (
        <FieldLine label={m.workshop_bin_atlas_button_hit_region_label()}>
          <span title={button.hitRegion} className="min-w-0 truncate font-mono select-text">
            {named(button.hitRegion)}
          </span>
        </FieldLine>
      )}
      {button.tooltip !== null && (
        <FieldLine label={m.workshop_bin_atlas_button_tooltip_label()}>
          <span className="min-w-0 truncate font-mono select-text">{button.tooltip}</span>
        </FieldLine>
      )}
    </SectionBlock>
  );
}

/** A state's short name, as the toolbar's state menu names it. */
function stateName(state: (typeof BUTTON_STATES)[number]): string {
  switch (state) {
    case "DefaultStateElements":
      return m.workshop_bin_atlas_state_default_label();
    case "HoverStateElements":
      return m.workshop_bin_atlas_state_hover_label();
    case "ClickedStateElements":
      return m.workshop_bin_atlas_state_clicked_label();
    case "SelectedStateElements":
      return m.workshop_bin_atlas_state_selected_label();
    case "SelectedHoverStateElements":
      return m.workshop_bin_atlas_state_selected_hover_label();
    case "SelectedClickedStateElements":
      return m.workshop_bin_atlas_state_selected_clicked_label();
    case "InactiveStateElements":
      return m.workshop_bin_atlas_state_inactive_label();
    case "InactiveSelectedStateElements":
      return m.workshop_bin_atlas_state_inactive_selected_label();
  }
}
