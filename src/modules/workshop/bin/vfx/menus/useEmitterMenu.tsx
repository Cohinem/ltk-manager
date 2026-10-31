import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowUpIcon,
  CrosshairIcon,
  EyeClosedIcon,
  TrashIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";

import { m } from "@/i18n";
import type { CommandMenu, CommandMenuEntry } from "@/modules/editor";
import { MENU_SEPARATOR } from "@/modules/editor";

import { useLinkOpen } from "../../links/hooks/useLinkTargets";
import type { AuthoredChild } from "../children/childModel";
import { systemLeaf } from "../children/childModel";
import { type ChildActions, useChildActions, useChildren } from "../children/useChildren";
import { MaskSubmenu } from "../stencil/MaskSubmenu";
import { glyph, type MenuScope, type RunCommands, toggle } from "./menuItems";

/** Returns the Emitter menu: solo, mute, the mask and the child systems. */
export function useEmitterMenu(scope: MenuScope, commands: RunCommands): CommandMenu {
  const { run, readOnly } = scope;
  const { chosen, reason, action, shortcut } = commands;
  const { card, set, systemName } = useChildren();
  const actions = useChildActions(card?.row ?? null, set, systemName, undefined);
  const { wantOpen } = useLinkOpen();

  const children = set?.children ?? [];
  const emitterReason = m.workshop_bin_menu_vfx_emitter_reason();
  const allIn = (held: ReadonlySet<number> | undefined) =>
    chosen.length > 0 && chosen.every((each) => held?.has(each) === true);
  const whenChosen = (key: "solo" | "mute") => (chosen.length > 0 ? action(key) : null);

  return {
    id: "emitter",
    title: m.workshop_bin_inspector_emitter_label(),
    className: "w-64",
    items: [
      toggle({
        id: "run.solo",
        title: m.workshop_bin_preview_solo_label(),
        icon: CrosshairIcon,
        shortcut: shortcut("solo"),
        checked: allIn(run?.soloed),
        run: whenChosen("solo"),
        reason: reason ?? emitterReason,
      }),
      toggle({
        id: "run.mute",
        title: m.workshop_bin_menu_vfx_mute_action(),
        icon: EyeClosedIcon,
        shortcut: shortcut("mute"),
        checked: allIn(run?.muted),
        run: whenChosen("mute"),
        reason: reason ?? emitterReason,
      }),
      MENU_SEPARATOR,
      {
        kind: "slot",
        id: "emitter.mask",
        reason: readOnly ?? reason ?? emitterReason,
        node: <MaskSubmenu reason={readOnly ?? reason ?? emitterReason} />,
      },
      MENU_SEPARATOR,
      children.length === 0
        ? {
            kind: "command",
            id: "emitter.children",
            title: m.workshop_bin_children_title(),
            icon: glyph(TreeStructureIcon),
            run: null,
            reason: m.workshop_bin_menu_vfx_child_empty_reason(),
          }
        : {
            kind: "submenu",
            id: "emitter.children",
            title: m.workshop_bin_children_title(),
            icon: glyph(TreeStructureIcon),
            className: "w-64",
            items: children.map((child) =>
              childSubmenu(child, children.length, actions, readOnly, wantOpen),
            ),
          },
    ],
  };
}

/** Returns one child system's submenu: open its tab, move it, remove it. */
function childSubmenu(
  child: AuthoredChild,
  count: number,
  { move, remove }: ChildActions,
  readOnly: string | undefined,
  wantOpen: (entry: string, intent: "default") => void,
): CommandMenuEntry {
  const id = `emitter.child.${child.index}`;
  const name = systemLeaf(child.label);
  const entry = child.system?.entry ?? null;

  return {
    kind: "submenu",
    id,
    title: name,
    className: "w-56",
    items: [
      {
        kind: "command",
        id: `${id}.open`,
        title: m.workshop_bin_child_open_action({ name }),
        icon: glyph(ArrowSquareOutIcon),
        run: entry === null ? null : () => wantOpen(entry, "default"),
        reason: m.workshop_bin_child_unresolved_hint(),
      },
      {
        kind: "command",
        id: `${id}.up`,
        title: m.workshop_bin_child_move_up_action(),
        icon: glyph(ArrowUpIcon),
        run:
          move === null || child.index === 0 ? null : () => void move(child.index, child.index - 1),
        reason: readOnly,
      },
      {
        kind: "command",
        id: `${id}.down`,
        title: m.workshop_bin_child_move_down_action(),
        icon: glyph(ArrowDownIcon),
        run:
          move === null || child.index === count - 1
            ? null
            : () => void move(child.index, child.index + 1),
        reason: readOnly,
      },
      {
        kind: "command",
        id: `${id}.remove`,
        title: m.workshop_bin_child_remove_action(),
        icon: glyph(TrashIcon),
        danger: true,
        run: remove === null ? null : () => void remove(child.index),
        reason: readOnly,
      },
    ],
  };
}
