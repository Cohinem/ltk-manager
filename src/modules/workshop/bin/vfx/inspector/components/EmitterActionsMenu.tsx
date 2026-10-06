import {
  CaretDownIcon,
  ClipboardTextIcon,
  CopyIcon,
  CopySimpleIcon,
  SparkleIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { Button, Menu } from "@/components";
import { m } from "@/i18n";

import type { EmitterRef } from "../../clipboard/emitterCopy";
import { useEmitterClipboard } from "../../clipboard/useEmitterClipboard";
import { MaskSubmenu } from "../../stencil/MaskSubmenu";
import { TemplateSubmenu } from "../../templates/TemplateMenus";
import { useEmitters } from "../state/emitterChoice";
import { nameOf } from "../utils/emitterCards";

/**
 * Duplicate, copy, paste, add from template and delete of the open card's emitter, as one
 * menu among the inspector's actions.
 *
 * A child lane's emitter belongs to another system, so it draws no menu.
 */
export function EmitterActionsMenu() {
  const { card, child, target } = useEmitters();
  const clipboard = useEmitterClipboard();
  if (clipboard === null || card === undefined || child !== null || target === "system") {
    return null;
  }

  const { copy, duplicate, paste, remove } = clipboard;
  const emitter: EmitterRef = { entry: card.row.entry, wire: card.row.path, name: nameOf(card) };

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className="font-sans"
            left={<SparkleIcon weight="bold" className="size-3.5" />}
            right={<CaretDownIcon weight="bold" className="size-3" />}
          >
            {m.workshop_bin_inspector_emitter_label()}
          </Button>
        }
      />
      <Menu.Content align="start" data-ui="EmitterActionsMenu" className="w-48">
        {duplicate !== null && (
          <Menu.Item icon={<CopySimpleIcon />} onClick={() => void duplicate(emitter)}>
            {m.workshop_bin_inspector_emitter_duplicate_action()}
          </Menu.Item>
        )}
        <Menu.Item icon={<CopyIcon />} onClick={() => void copy(emitter)}>
          {m.workshop_bin_inspector_emitter_copy_action()}
        </Menu.Item>
        {paste !== null && (
          <Menu.Item
            icon={<ClipboardTextIcon />}
            onClick={() => void paste(emitter.entry, emitter)}
          >
            {m.workshop_bin_inspector_emitter_paste_action()}
          </Menu.Item>
        )}
        <TemplateSubmenu place={{ entry: emitter.entry, after: emitter }} />
        <MaskSubmenu />
        {remove !== null && (
          <>
            <Menu.Separator />
            <Menu.Item icon={<TrashIcon />} variant="danger" onClick={() => void remove(emitter)}>
              {m.workshop_bin_inspector_emitter_delete_action()}
            </Menu.Item>
          </>
        )}
      </Menu.Content>
    </Menu.Root>
  );
}
