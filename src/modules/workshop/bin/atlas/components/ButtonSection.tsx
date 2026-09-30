import { Checkbox } from "@/components";
import { m } from "@/i18n";
import type { PropertyEdit } from "@/lib/tauri";

import { type GroupFlag, groupFlagEdit } from "../engine/edit/elementEdits";
import type { ViewButton } from "../engine/model/buttons";
import { labelOf } from "../engine/model/layers";
import type { ViewTree } from "../engine/model/tree";
import type { ViewElement } from "../engine/model/view";
import { ButtonStateSprites } from "./ButtonStateSprites";
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
 * starts it with, which pick the state it rests in, the states the file writes with the sprite each
 * draws, the region a click lands in, and the tooltip keys it shows.
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

  return (
    <SectionBlock id="button" title={m.workshop_bin_atlas_button_title()}>
      {flag("IsEnabled", m.workshop_bin_atlas_button_enabled_label(), button.enabled)}
      {flag("IsActive", m.workshop_bin_atlas_button_active_label(), button.active)}
      {flag("IsSelected", m.workshop_bin_atlas_button_selected_label(), button.selected)}
      <h4 className="col-span-2 pt-1 text-meta font-medium text-surface-400 select-none">
        {m.workshop_bin_atlas_button_states_label()}
      </h4>
      <ButtonStateSprites tree={tree} states={states} />
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
