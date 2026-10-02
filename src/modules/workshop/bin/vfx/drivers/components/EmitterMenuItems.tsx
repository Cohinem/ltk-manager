import { ClipboardTextIcon, CopyIcon, CopySimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { use } from "react";

import { ContextMenu } from "@/components";
import { m } from "@/i18n";

import { useEmitterClipboard } from "../../clipboard/useEmitterClipboard";
import { TemplateSubmenu } from "../../templates/TemplateMenus";
import type { MasterItem } from "../utils/systemGraph";
import { GraphActionsContext } from "./graphActions";

/**
 * The emitter clipboard's items of the Graph menu: Duplicate, Copy and Delete on a master
 * node, and Paste emitter and Add from template on a master node or the canvas. A paste or a
 * template on a node lands after it.
 */
export function EmitterMenuItems({ item }: { item: MasterItem | null }) {
  const actions = use(GraphActionsContext);
  const clipboard = useEmitterClipboard();
  if (actions === null || actions.entry === "" || clipboard === null) return null;

  const { copy, duplicate, paste, remove } = clipboard;
  const emitter = item === null ? null : { entry: actions.entry, wire: item.wire, name: item.name };
  if (emitter === null && paste === null) return null;

  return (
    <>
      <ContextMenu.Separator />
      {emitter !== null && duplicate !== null && (
        <ContextMenu.Item
          icon={<CopySimpleIcon />}
          shortcut="Ctrl+D"
          onClick={() => void duplicate(emitter)}
        >
          {m.workshop_bin_emitter_duplicate_action()}
        </ContextMenu.Item>
      )}
      {emitter !== null && (
        <ContextMenu.Item icon={<CopyIcon />} shortcut="Ctrl+C" onClick={() => void copy(emitter)}>
          {m.workshop_bin_emitter_copy_action()}
        </ContextMenu.Item>
      )}
      {paste !== null && (
        <ContextMenu.Item
          icon={<ClipboardTextIcon />}
          shortcut="Ctrl+V"
          onClick={() => void paste(actions.entry, emitter)}
        >
          {m.workshop_bin_emitter_paste_action()}
        </ContextMenu.Item>
      )}
      <TemplateSubmenu place={{ entry: actions.entry, after: emitter }} />
      {emitter !== null && remove !== null && (
        <ContextMenu.Item
          icon={<TrashIcon />}
          shortcut="Del"
          variant="danger"
          onClick={() => void remove(emitter)}
        >
          {m.workshop_bin_emitter_delete_action()}
        </ContextMenu.Item>
      )}
    </>
  );
}
