import { FolderSimplePlusIcon } from "@phosphor-icons/react";
import type { ReactNode, RefObject } from "react";

import { ExperimentalChip, Menubar, type MenubarMenu, Tooltip } from "@/components";
import { m } from "@/i18n";
import { type CommandMenuItem, CommandMenuItems } from "@/modules/editor";

import { usePreviewVolume } from "../state/previewTransport";
import {
  type AudioMenuCommand,
  type AudioMenuEntry,
  type AudioMenuFacts,
  type AudioMenuId,
  audioMenus,
  type AudioMenuSlot,
  type AudioSubmenuId,
} from "../utils/audioMenus";
import type { AudioCommandId } from "../utils/keymap";
import { COMMAND_ICONS, commandTitle } from "./AudioKeys";

const MENU_TITLES: Readonly<Record<AudioMenuId, () => string>> = {
  file: m.audio_menu_file_label,
  edit: m.audio_menu_edit_label,
  insert: m.audio_menu_insert_label,
  view: m.audio_menu_view_label,
  playback: m.audio_menu_playback_label,
  bank: m.audio_menu_bank_label,
  voice: m.audio_menu_voice_label,
};

const MENU_CLASSES: Partial<Readonly<Record<AudioMenuId, string>>> = {
  file: "w-64",
  edit: "w-60",
  bank: "max-h-[60vh] w-80 overflow-y-auto",
};

const SUBMENU_TITLES: Readonly<Record<AudioSubmenuId, () => string>> = {
  addContainer: m.audio_add_container_action,
};

/** The commands whose glyph faces the other way, as the inspector sits on the right. */
const MIRRORED: ReadonlySet<AudioCommandId> = new Set(["toggleInspector"]);

interface AudioMenubarProps {
  /** What the document knows of its commands, without the slots, which `slots` names. */
  readonly facts: Omit<AudioMenuFacts, "slots">;
  /** The items that the document draws in a slot. A slot without items is left out. */
  readonly slots: Partial<Readonly<Record<AudioMenuSlot, ReactNode>>>;
  /** The words of a command that differ per file, such as Bank details. */
  readonly titles?: Partial<Readonly<Record<AudioCommandId, string>>>;
  /** The document, whose focus Alt and F10 move to the bar. */
  readonly keyScope: RefObject<HTMLElement | null>;
  /** `true` if the bank takes edits, whose new objects are experimental. */
  readonly experimental: boolean;
}

/**
 * The menu bar of the audio file document: File, Edit, Insert, View, Playback and Bank.
 *
 * The entries come from `audioMenus`, which reads them from the keymap, so each item shows the
 * key that its handler answers. One Experimental chip after the titles marks the new objects.
 * Per "Menu bar" in docs/ux/AUDIO.md.
 */
export function AudioMenubar({
  facts,
  slots,
  titles = {},
  keyScope,
  experimental,
}: AudioMenubarProps) {
  const filled = (Object.keys(slots) as AudioMenuSlot[]).filter((slot) => drawn(slots[slot]));
  const menus: MenubarMenu[] = audioMenus({ ...facts, slots: filled }).map((menu) => ({
    id: menu.id,
    title: MENU_TITLES[menu.id](),
    className: MENU_CLASSES[menu.id],
    content: <CommandMenuItems items={menuItems(menu.entries, slots, titles)} />,
  }));

  return (
    <Menubar
      menus={menus}
      aria-label={m.audio_menu_bar_label()}
      keyScope={keyScope}
      data-ui="AudioMenubar"
      end={experimental ? <ExperimentalMark /> : undefined}
    />
  );
}

/** Returns `true` if `node` draws something, as a slot needs to be listed. */
function drawn(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false;
}

/** The one Experimental chip of the bar, whose tooltip says what is experimental. */
function ExperimentalMark() {
  return (
    <Tooltip content={m.audio_add_experimental_hint()}>
      <span className="flex">
        <ExperimentalChip />
      </span>
    </Tooltip>
  );
}

/** Returns the shared menu items of `entries`, with the words, the glyph and the slots of each. */
function menuItems(
  entries: readonly AudioMenuEntry[],
  slots: Partial<Readonly<Record<AudioMenuSlot, ReactNode>>>,
  titles: Partial<Readonly<Record<AudioCommandId, string>>>,
): CommandMenuItem[] {
  const title = (command: AudioMenuCommand) => titles[command.id] ?? commandTitle(command.id);

  return entries.map((entry): CommandMenuItem => {
    switch (entry.kind) {
      case "separator":
        return entry;
      case "slot":
        return { kind: "slot", id: entry.slot, node: slots[entry.slot] };
      case "command": {
        const { command } = entry;
        return {
          kind: "command",
          id: command.id,
          title: title(command),
          icon: <CommandIcon id={command.id} />,
          shortcut: command.shortcut ?? undefined,
          run: command.run,
          reason: command.reason ?? undefined,
          danger: command.id === "remove",
        };
      }
      case "check": {
        const { command } = entry;
        return {
          kind: "check",
          id: command.id,
          title: title(command),
          icon: <CommandIcon id={command.id} />,
          shortcut: command.shortcut ?? undefined,
          checked: command.checked,
          run: command.run,
        };
      }
      case "radio":
        return {
          kind: "radio",
          id: entry.commands.map((command) => command.id).join("|"),
          value: entry.commands.find((command) => command.checked)?.id ?? null,
          options: entry.commands.map((command) => ({
            value: command.id,
            title: title(command),
            shortcut: command.shortcut ?? undefined,
            disabled: command.run === null,
          })),
          onPick: (next) => entry.commands.find((command) => command.id === next)?.run?.(),
        };
      case "submenu":
        return {
          kind: "submenu",
          id: entry.id,
          title: SUBMENU_TITLES[entry.id](),
          icon: <FolderSimplePlusIcon className="size-4" />,
          items: menuItems(entry.entries, slots, titles),
        };
    }
  });
}

function CommandIcon({ id }: { id: AudioCommandId }) {
  const Glyph = COMMAND_ICONS[id];
  if (Glyph === undefined) return null;

  return <Glyph className="size-4" mirrored={MIRRORED.has(id)} />;
}

/** The preview volume as a line of the Playback menu, which `-` and `=` move. */
export function VolumeReadout() {
  const percent = String(Math.round(usePreviewVolume() * 100));

  return (
    <p className="px-2 py-1.5 text-meta text-surface-400 tabular-nums select-none">
      {m.audio_menu_volume_label({ percent })}
    </p>
  );
}
