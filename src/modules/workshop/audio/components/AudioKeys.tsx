import { KeyboardIcon } from "@phosphor-icons/react";

import { Dialog, Grid, IconButton, Kbd, Stack } from "@/components";
import { m } from "@/i18n";

import { KeyHint } from "../../bin/atlas/components/KeyHint";
import {
  type AudioCommandGroup,
  type AudioCommandId,
  type AudioSurface,
  chordLabel,
  sheetGroups,
  shortcutOf,
} from "../utils/keymap";

/** The words of each command, which the sheet, the palette and the menus show. */
export const COMMAND_LABELS: Readonly<Record<AudioCommandId, () => string>> = {
  play: m.audio_key_play_label,
  playAll: m.audio_key_play_all_label,
  stop: m.audio_key_stop_label,
  loop: m.audio_key_loop_label,
  volumeDown: m.audio_key_volume_down_label,
  volumeUp: m.audio_key_volume_up_label,
  moveRow: m.audio_key_move_row_label,
  movePage: m.audio_key_move_page_label,
  moveEnd: m.audio_key_move_end_label,
  extendRange: m.audio_key_extend_range_label,
  selectAll: m.audio_key_select_all_label,
  stepRight: m.audio_key_step_right_label,
  stepLeft: m.audio_key_step_left_label,
  nextEvent: m.audio_key_next_event_label,
  previousEvent: m.audio_key_previous_event_label,
  typeAhead: m.audio_key_type_ahead_label,
  find: m.audio_key_find_label,
  menu: m.audio_key_menu_label,
  viewMedia: m.audio_key_view_media_label,
  viewEvents: m.audio_key_view_events_label,
  toggleInspector: m.audio_key_toggle_inspector_label,
  help: m.audio_key_help_label,
  enter: m.audio_key_enter_label,
  reset: m.audio_key_reset_label,
  add: m.audio_key_add_label,
  duplicate: m.audio_key_duplicate_label,
  remove: m.audio_key_remove_label,
  moveUp: m.audio_key_move_up_label,
  moveDown: m.audio_key_move_down_label,
  wrap: m.audio_key_wrap_label,
  copy: m.audio_key_copy_label,
  cut: m.audio_key_cut_label,
  paste: m.audio_key_paste_label,
  save: m.audio_key_save_label,
  undo: m.audio_key_undo_label,
  redo: m.audio_key_redo_label,
  knobStep: m.audio_key_knob_step_label,
  knobFine: m.audio_key_knob_fine_label,
  knobCoarse: m.audio_key_knob_coarse_label,
  knobReset: m.audio_key_knob_reset_label,
  dragReorder: m.audio_key_drag_reorder_label,
  dropMedia: m.audio_key_drop_media_label,
  dragEvent: m.audio_key_drag_event_label,
  middleClick: m.audio_key_middle_click_label,
  pickClick: m.audio_key_pick_click_label,
};

const GROUP_TITLES: Readonly<Record<AudioCommandGroup, () => string>> = {
  transport: m.audio_keys_transport_title,
  navigation: m.audio_keys_navigation_title,
  view: m.audio_keys_view_title,
  editing: m.audio_keys_editing_title,
  pointer: m.audio_keys_pointer_title,
};

/** The surfaces whose keys the sheet of the audio file document lists. */
export const DOCUMENT_SCOPE: readonly AudioSurface[] = ["media", "voices", "document", "knob"];

/** The surfaces whose keys the sheet of the Voice lines view lists. */
export const LINES_SCOPE: readonly AudioSurface[] = ["lines", "knob"];

interface AudioKeysDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The surfaces of the view that opened the sheet. */
  readonly scope: readonly AudioSurface[];
}

/**
 * The shortcut sheet: every key and gesture of `scope`, read from the keymap, by group.
 *
 * Per "Keys and gestures" in docs/ux/AUDIO.md.
 */
export function AudioKeysDialog({ open, onClose, scope }: AudioKeysDialogProps) {
  return (
    <Dialog.Shell open={open} onClose={onClose} title={m.audio_keys_title()} size="lg">
      <Dialog.Body>
        <Grid minColumnWidth="18rem" gap={6} rowGap={5} align="start" data-ui="AudioKeysDialog">
          {sheetGroups(scope).map((section) => (
            <Stack key={section.group} gap={2}>
              <h3 className="text-xs font-medium tracking-wide text-surface-400 uppercase select-none">
                {GROUP_TITLES[section.group]()}
              </h3>
              <Grid columns="minmax(0, 1fr) max-content" gap={3} rowGap={1.5} align="center">
                {section.bindings.map((binding) => (
                  <KeyRow
                    key={binding.id}
                    label={COMMAND_LABELS[binding.id]()}
                    keys={binding.keys}
                  />
                ))}
              </Grid>
            </Stack>
          ))}
        </Grid>
      </Dialog.Body>
    </Dialog.Shell>
  );
}

/** One command of the sheet: its words, then each chord as keycaps. */
function KeyRow({ label, keys }: { label: string; keys: readonly string[] }) {
  return (
    <>
      <span className="text-meta text-surface-200 select-none">{label}</span>
      <span className="flex flex-wrap justify-end gap-1">
        {keys.map((key) => (
          <Kbd key={key} shortcut={chordLabel(key)} />
        ))}
      </span>
    </>
  );
}

/**
 * The pointer gestures of the lists behind a mark in the toolbar, as `GestureHint` puts the
 * gestures of the curve plot. A press opens the full sheet.
 */
export function AudioGestureHint({ onOpen }: { onOpen: () => void }) {
  const help = shortcutOf("help");

  return (
    <IconButton
      icon={<KeyboardIcon weight="bold" />}
      aria-label={m.audio_key_help_label()}
      aria-keyshortcuts={help ?? undefined}
      tooltip={
        <Stack as="span" gap={1}>
          <span>{m.audio_keys_gesture_hint()}</span>
          {help !== null && <KeyHint label={m.audio_key_help_label()} shortcut={help} />}
        </Stack>
      }
      onClick={onOpen}
    />
  );
}
