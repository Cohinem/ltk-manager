import { FolderSimplePlusIcon } from "@phosphor-icons/react";
import { Fragment, type ReactNode, type RefObject } from "react";

import { ExperimentalChip, Menu, Menubar, type MenubarMenu, Tooltip } from "@/components";
import { m } from "@/i18n";

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
    content: <MenuEntries entries={menu.entries} slots={slots} titles={titles} />,
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

interface MenuEntriesProps {
  readonly entries: readonly AudioMenuEntry[];
  readonly slots: Partial<Readonly<Record<AudioMenuSlot, ReactNode>>>;
  readonly titles: Partial<Readonly<Record<AudioCommandId, string>>>;
}

/** The items of one built menu or submenu. */
function MenuEntries({ entries, slots, titles }: MenuEntriesProps) {
  const title = (command: AudioMenuCommand) => titles[command.id] ?? commandTitle(command.id);

  return entries.map((entry, at) => {
    switch (entry.kind) {
      case "separator":
        return <Menu.Separator key={`separator:${at}`} />;
      case "slot":
        return <Fragment key={entry.slot}>{slots[entry.slot]}</Fragment>;
      case "command":
        return <CommandItem key={entry.command.id} command={entry.command} title={title} />;
      case "check": {
        const { command } = entry;
        return (
          <Menu.CheckboxItem
            key={command.id}
            icon={<CommandIcon id={command.id} />}
            shortcut={command.shortcut ?? undefined}
            checked={command.checked}
            disabled={command.run === null}
            onCheckedChange={() => command.run?.()}
          >
            {title(command)}
          </Menu.CheckboxItem>
        );
      }
      case "radio": {
        const value = entry.commands.find((command) => command.checked)?.id ?? null;
        return (
          <Menu.RadioGroup
            key={entry.commands.map((command) => command.id).join("|")}
            value={value}
            onValueChange={(next) => entry.commands.find((command) => command.id === next)?.run?.()}
          >
            {entry.commands.map((command) => (
              <Menu.RadioItem
                key={command.id}
                value={command.id}
                shortcut={command.shortcut ?? undefined}
                disabled={command.run === null}
              >
                {title(command)}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        );
      }
      case "submenu":
        return (
          <Menu.SubmenuRoot key={entry.id}>
            <Menu.SubmenuTrigger icon={<FolderSimplePlusIcon className="size-4" />}>
              {SUBMENU_TITLES[entry.id]()}
            </Menu.SubmenuTrigger>
            <Menu.SubmenuContent>
              <MenuEntries entries={entry.entries} slots={slots} titles={titles} />
            </Menu.SubmenuContent>
          </Menu.SubmenuRoot>
        );
    }
  });
}

interface CommandItemProps {
  readonly command: AudioMenuCommand;
  readonly title: (command: AudioMenuCommand) => string;
}

/** One command as a menu item, with its glyph, its key and the reason it is disabled. */
function CommandItem({ command, title }: CommandItemProps) {
  const run = command.run;

  return (
    <Menu.Item
      icon={<CommandIcon id={command.id} />}
      shortcut={command.shortcut ?? undefined}
      variant={command.id === "remove" ? "danger" : "default"}
      disabled={run === null}
      reason={command.reason}
      /* The menu is still closing, and it hands focus back first. */
      onClick={() => run !== null && setTimeout(run, 0)}
    >
      {title(command)}
    </Menu.Item>
  );
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
