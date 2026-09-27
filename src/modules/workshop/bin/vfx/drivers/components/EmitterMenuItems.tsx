import { ClipboardTextIcon, CopyIcon, CopySimpleIcon } from "@phosphor-icons/react";
import { use } from "react";

import { ContextMenu } from "@/components";
import { m } from "@/i18n";

import { useEmitterClipboard } from "../../clipboard/useEmitterClipboard";
import type { MasterItem } from "../utils/systemGraph";
import { GraphActionsContext } from "./graphActions";

/**
 * The emitter clipboard's items of the Graph menu: Duplicate and Copy on a master node, and
 * Paste emitter on a master node or the canvas. A paste on a node lands after it.
 */
export function EmitterMenuItems({ item }: { item: MasterItem | null }) {
  const actions = use(GraphActionsContext);
  const clipboard = useEmitterClipboard();
  if (actions === null || actions.entry === "" || clipboard === null) return null;

  const { copy, duplicate, paste } = clipboard;
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
    </>
  );
}
