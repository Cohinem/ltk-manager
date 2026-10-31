import {
  MagicWandIcon,
  PlusIcon,
  SparkleIcon,
  TreeStructureIcon,
  WindIcon,
} from "@phosphor-icons/react";
import { use } from "react";

import { m } from "@/i18n";
import type { CommandMenu } from "@/modules/editor";

import { LeafEditContext } from "../../tree/hooks/useLeafEdit";
import { addForceEdits } from "../forces/forceEdits";
import { FORCE_COLLECTION, FORCE_DEFINITIONS } from "../forces/forceModel";
import { useForcePreview } from "../forces/forcePreview";
import { useEmitters } from "../inspector/state/emitterChoice";
import { emitterRef } from "../inspector/utils/emitterName";
import { TemplateSubmenu } from "../templates/TemplateMenus";
import { VFX_COMMAND } from "../utils/vfxCommands";
import { glyph, type MenuRow, type MenuScope, paneCommand } from "./menuItems";

const QUICK_ADD: MenuRow = {
  id: VFX_COMMAND.quickAdd,
  title: m.workshop_bin_menu_vfx_quick_add_action,
  icon: MagicWandIcon,
  shortcut: "quickAdd",
};
const QUICK_FIELD: MenuRow = {
  id: VFX_COMMAND.quickField,
  title: m.workshop_bin_menu_vfx_field_or_force_action,
  icon: PlusIcon,
};
const GRAPH_ITEM: MenuRow = {
  id: VFX_COMMAND.graphItem,
  title: m.workshop_bin_add_item_action,
  icon: TreeStructureIcon,
};
const ADD_PROPERTY: MenuRow = {
  id: VFX_COMMAND.addProperty,
  title: m.workshop_bin_inspector_add_action,
  icon: SparkleIcon,
};

/** Returns the Insert menu: the quick add, a force, a template, a list item and a property. */
export function useInsertMenu(scope: MenuScope): CommandMenu {
  const { lookup, run, inLayout, readOnly, viewReason } = scope;
  const { card, child, target } = useEmitters();
  const editProperty = use(LeafEditContext)?.editProperty;
  const forcePreview = useForcePreview();

  const open = child === null && target !== "system" ? card : undefined;
  const graphReason = m.workshop_bin_menu_vfx_graph_reason();
  const forceReason = inLayout
    ? (readOnly ?? m.workshop_bin_menu_vfx_emitter_reason())
    : viewReason;

  return {
    id: "insert",
    title: m.workshop_bin_menu_insert_label(),
    className: "w-64",
    items: [
      paneCommand(lookup, QUICK_ADD, graphReason),
      paneCommand(lookup, QUICK_FIELD, graphReason),
      {
        kind: "submenu",
        id: "insert.force",
        title: m.workshop_bin_force_add_action(),
        icon: glyph(WindIcon),
        className: "w-56",
        items: FORCE_DEFINITIONS.map((definition) => ({
          kind: "command",
          id: `insert.force.${definition.kind}`,
          title: definition.title(),
          run:
            inLayout && open !== undefined && editProperty !== undefined
              ? () => {
                  void editProperty(open.row, FORCE_COLLECTION, addForceEdits(definition)).then(
                    (saved) => {
                      if (saved) forcePreview.clear();
                    },
                  );
                }
              : null,
          reason: forceReason,
        })),
      },
      {
        kind: "slot",
        id: "insert.template",
        node: (
          <TemplateSubmenu
            place={{
              entry: run?.entry ?? "",
              after: open === undefined ? null : emitterRef(open),
            }}
            reason={readOnly ?? viewReason}
          />
        ),
      },
      paneCommand(lookup, GRAPH_ITEM, graphReason),
      paneCommand(lookup, ADD_PROPERTY, m.workshop_bin_menu_vfx_inspector_reason()),
    ],
  };
}
