import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  CopySimpleIcon,
  ListBulletsIcon,
  MinusCircleIcon,
  PercentIcon,
  PlayIcon,
  PlaylistIcon,
  PlusIcon,
  TrashIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";

import { ContextMenu } from "@/components";
import { m } from "@/i18n";

import { menuShortcut } from "../utils/keymap";

/** What the menu of a line does, each null where it does not apply to the line. */
export interface LineActions {
  readonly play: (() => void) | null;
  /** Plays every resolved line of the situation, in list order. */
  readonly playAll: (() => void) | null;
  readonly add: (() => void) | null;
  readonly duplicate: (() => void) | null;
  readonly remove: (() => void) | null;
  readonly moveUp: (() => void) | null;
  readonly moveDown: (() => void) | null;
  /** Opens the skin's event bank with the composed name in its new event entry. */
  readonly createEvent: (() => void) | null;
  readonly showInBank: (() => void) | null;
  readonly showInTree: (() => void) | null;
  readonly copyShort: (() => void) | null;
  /** Adds a chance condition to the picked rules that have none. */
  readonly addChance: (() => void) | null;
  readonly removeChance: (() => void) | null;
  /** Whether the line's situation picks a random valid rule, and the switch of it. */
  readonly pickRandom: { readonly checked: boolean; readonly toggle: () => void } | null;
}

/**
 * The context menu of one line of the Voice lines view: play, the edits of the picked rules, and
 * the links to the bank and the tree.
 *
 * Every item carries its icon, and the key that does the same in the list. Per "Keyboard" in
 * docs/ux/CONTEXTUAL_VOICE.md.
 */
export function VoiceLineMenu({ actions }: { actions: LineActions }) {
  const edits =
    actions.add !== null ||
    actions.duplicate !== null ||
    actions.moveUp !== null ||
    actions.moveDown !== null;
  const links = actions.createEvent !== null || actions.showInBank !== null;

  return (
    <>
      {actions.play !== null && (
        <ContextMenu.Item
          icon={<PlayIcon />}
          shortcut={menuShortcut("play")}
          onClick={actions.play}
        >
          {m.audio_voice_play_action()}
        </ContextMenu.Item>
      )}
      {actions.playAll !== null && (
        <ContextMenu.Item
          icon={<PlaylistIcon />}
          shortcut={menuShortcut("playAll")}
          onClick={actions.playAll}
        >
          {m.audio_voice_play_all_action()}
        </ContextMenu.Item>
      )}
      {edits && <ContextMenu.Separator />}
      {actions.add !== null && (
        <ContextMenu.Item icon={<PlusIcon />} shortcut={menuShortcut("add")} onClick={actions.add}>
          {m.audio_voice_add_rule_action()}
        </ContextMenu.Item>
      )}
      {actions.duplicate !== null && (
        <ContextMenu.Item
          icon={<CopySimpleIcon />}
          shortcut={menuShortcut("duplicate")}
          onClick={actions.duplicate}
        >
          {m.audio_voice_duplicate_action()}
        </ContextMenu.Item>
      )}
      {actions.moveUp !== null && (
        <ContextMenu.Item
          icon={<ArrowUpIcon />}
          shortcut={menuShortcut("moveUp")}
          onClick={actions.moveUp}
        >
          {m.audio_voice_move_up_action()}
        </ContextMenu.Item>
      )}
      {actions.moveDown !== null && (
        <ContextMenu.Item
          icon={<ArrowDownIcon />}
          shortcut={menuShortcut("moveDown")}
          onClick={actions.moveDown}
        >
          {m.audio_voice_move_down_action()}
        </ContextMenu.Item>
      )}
      {actions.remove !== null && (
        <ContextMenu.Item
          icon={<TrashIcon />}
          shortcut={menuShortcut("remove")}
          variant="danger"
          onClick={actions.remove}
        >
          {m.audio_voice_delete_action()}
        </ContextMenu.Item>
      )}
      {(actions.addChance !== null ||
        actions.removeChance !== null ||
        actions.pickRandom !== null) && <ContextMenu.Separator />}
      {actions.addChance !== null && (
        <ContextMenu.Item icon={<PercentIcon />} onClick={actions.addChance}>
          {m.audio_voice_add_chance_action()}
        </ContextMenu.Item>
      )}
      {actions.removeChance !== null && (
        <ContextMenu.Item icon={<MinusCircleIcon />} onClick={actions.removeChance}>
          {m.audio_voice_remove_chance_action()}
        </ContextMenu.Item>
      )}
      {actions.pickRandom !== null && (
        <ContextMenu.CheckboxItem
          checked={actions.pickRandom.checked}
          onCheckedChange={actions.pickRandom.toggle}
        >
          {m.audio_voice_pick_random_action()}
        </ContextMenu.CheckboxItem>
      )}
      {links && <ContextMenu.Separator />}
      {actions.createEvent !== null && (
        <ContextMenu.Item icon={<PlusIcon />} onClick={actions.createEvent}>
          {m.audio_voice_create_event_action()}
        </ContextMenu.Item>
      )}
      {actions.showInBank !== null && (
        <ContextMenu.Item icon={<ListBulletsIcon />} onClick={actions.showInBank}>
          {m.audio_voice_show_in_bank_action()}
        </ContextMenu.Item>
      )}
      <ContextMenu.Separator />
      {actions.showInTree !== null && (
        <ContextMenu.Item icon={<TreeStructureIcon />} onClick={actions.showInTree}>
          {m.audio_voice_show_in_tree_action()}
        </ContextMenu.Item>
      )}
      {actions.copyShort !== null && (
        <ContextMenu.Item
          icon={<CopyIcon />}
          shortcut={menuShortcut("copy")}
          onClick={actions.copyShort}
        >
          {m.audio_voice_copy_short_action()}
        </ContextMenu.Item>
      )}
    </>
  );
}
