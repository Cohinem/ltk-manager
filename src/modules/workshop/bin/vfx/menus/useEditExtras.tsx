import {
  ClipboardTextIcon,
  CopyIcon,
  CopySimpleIcon,
  SelectionAllIcon,
  SelectionSlashIcon,
  SlidersIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { m } from "@/i18n";
import type { CommandMenuCommand, CommandMenuEntry } from "@/modules/editor";
import { MENU_SEPARATOR } from "@/modules/editor";

import type { EmitterRef } from "../clipboard/emitterCopy";
import { useEmitterClipboard } from "../clipboard/useEmitterClipboard";
import { useEmitters } from "../inspector/state/emitterChoice";
import { emitterRef } from "../inspector/utils/emitterName";
import { VFX_COMMAND } from "../utils/vfxCommands";
import { glyph, type MenuRow, type MenuScope, paneCommand } from "./menuItems";

const COPY: MenuRow = {
  id: VFX_COMMAND.copy,
  title: m.workshop_bin_inspector_emitter_copy_action,
  icon: CopyIcon,
  shortcut: "copy",
};
const DUPLICATE: MenuRow = {
  id: VFX_COMMAND.duplicate,
  title: m.workshop_bin_inspector_emitter_duplicate_action,
  icon: CopySimpleIcon,
  shortcut: "duplicate",
};
const PASTE: MenuRow = {
  id: VFX_COMMAND.paste,
  title: m.workshop_bin_inspector_emitter_paste_action,
  icon: ClipboardTextIcon,
  shortcut: "paste",
};
const REMOVE: MenuRow = {
  id: VFX_COMMAND.remove,
  title: m.workshop_bin_inspector_emitter_delete_action,
  icon: TrashIcon,
  shortcut: "remove",
  danger: true,
};
const SELECT_ALL: MenuRow = {
  id: VFX_COMMAND.selectAll,
  title: m.workshop_bin_menu_vfx_select_all_action,
  icon: SelectionAllIcon,
  shortcut: "selectAll",
};
const SELECT_NONE: MenuRow = {
  id: VFX_COMMAND.selectNone,
  title: m.workshop_bin_menu_vfx_select_none_action,
  icon: SelectionSlashIcon,
  shortcut: "selectNone",
};
const ADJUST: MenuRow = {
  id: VFX_COMMAND.adjust,
  title: m.workshop_bin_menu_vfx_adjust_action,
  icon: SlidersIcon,
};

/**
 * Returns what the Edit menu adds: the emitter or node commands, the selection and Adjust.
 *
 * The graph and the lanes offer the commands. Where neither shows, as in a stack, they act on the
 * selected cards, without a key because no key reaches them there.
 */
export function useEditExtras(scope: MenuScope): CommandMenuEntry[] {
  const { lookup, inLayout, readOnly, viewReason } = scope;
  const { cards, card, child, selected, target } = useEmitters();
  const clipboard = useEmitterClipboard();

  const refs = cards.filter((each) => selected.has(each.key)).map(emitterRef);
  const open =
    child === null && target !== "system" && card !== undefined ? emitterRef(card) : null;
  const paste = clipboard?.paste ?? null;
  const reason = inLayout ? (readOnly ?? m.workshop_bin_menu_vfx_emitter_reason()) : viewReason;

  const onCards = (act: ((emitters: readonly EmitterRef[]) => Promise<void>) | null | undefined) =>
    inLayout && refs.length > 0 && act != null ? () => void act(refs) : null;

  const item = (row: MenuRow, fallback: (() => void) | null): CommandMenuCommand => {
    if (lookup(row.id) !== null) return paneCommand(lookup, row, "");

    return {
      kind: "command",
      id: row.id,
      title: row.title(),
      icon: glyph(row.icon),
      run: fallback,
      reason: fallback === null ? reason : undefined,
      danger: row.danger,
    };
  };

  const graphReason = m.workshop_bin_menu_vfx_graph_reason();

  return [
    item(COPY, onCards(clipboard?.copy)),
    item(DUPLICATE, onCards(clipboard?.duplicate)),
    item(
      PASTE,
      inLayout && paste !== null && open !== null ? () => void paste(open.entry, open) : null,
    ),
    item(REMOVE, onCards(clipboard?.remove)),
    MENU_SEPARATOR,
    paneCommand(lookup, SELECT_ALL, graphReason),
    paneCommand(lookup, SELECT_NONE, graphReason),
    MENU_SEPARATOR,
    paneCommand(lookup, ADJUST, m.workshop_bin_menu_vfx_shell_reason()),
  ];
}
