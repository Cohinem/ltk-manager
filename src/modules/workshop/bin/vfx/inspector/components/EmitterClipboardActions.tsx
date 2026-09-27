import { ClipboardTextIcon, CopyIcon, CopySimpleIcon, TrashIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { IconButton, Tooltip } from "@/components";
import { m } from "@/i18n";

import type { EmitterRef } from "../../clipboard/emitterCopy";
import { useEmitterClipboard } from "../../clipboard/useEmitterClipboard";
import { useEmitters } from "../state/emitterChoice";
import { nameOf } from "../utils/emitterCards";

/**
 * Duplicate, copy, paste and delete of the open card's emitter, among the inspector's actions.
 *
 * A child lane's emitter belongs to another system, so it draws none of them.
 */
export function EmitterClipboardActions() {
  const { card, child, target } = useEmitters();
  const clipboard = useEmitterClipboard();
  if (clipboard === null || card === undefined || child !== null || target === "system") {
    return null;
  }

  const { copy, duplicate, paste, remove } = clipboard;
  const emitter: EmitterRef = { entry: card.row.entry, wire: card.row.path, name: nameOf(card) };

  return (
    <>
      {duplicate !== null && (
        <Action
          label={m.workshop_bin_emitter_duplicate_action()}
          onPress={() => duplicate(emitter)}
        >
          <CopySimpleIcon weight="bold" className="h-4 w-4" />
        </Action>
      )}
      <Action label={m.workshop_bin_emitter_copy_action()} onPress={() => copy(emitter)}>
        <CopyIcon weight="bold" className="h-4 w-4" />
      </Action>
      {paste !== null && (
        <Action
          label={m.workshop_bin_emitter_paste_action()}
          onPress={() => paste(emitter.entry, emitter)}
        >
          <ClipboardTextIcon weight="bold" className="h-4 w-4" />
        </Action>
      )}
      {remove !== null && (
        <Action label={m.workshop_bin_emitter_delete_action()} onPress={() => remove(emitter)}>
          <TrashIcon weight="bold" className="h-4 w-4" />
        </Action>
      )}
    </>
  );
}

function Action({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label={label}
        icon={children}
        onClick={() => void onPress()}
      />
    </Tooltip>
  );
}
