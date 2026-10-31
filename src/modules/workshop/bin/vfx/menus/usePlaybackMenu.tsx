import {
  ArrowCounterClockwiseIcon,
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  CaretLineRightIcon,
  FlagIcon,
  GaugeIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  RepeatIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { m } from "@/i18n";
import type { CommandMenu } from "@/modules/editor";
import { MENU_SEPARATOR } from "@/modules/editor";

import { useTimelineMarkers } from "../timeline/hooks/useTimelineMarkers";
import { VFX_COMMAND } from "../utils/vfxCommands";
import {
  type MenuRow,
  type MenuScope,
  paneCommand,
  type RunCommands,
  type RunRow,
  toggle,
} from "./menuItems";

const PAUSE: RunRow = { key: "play", title: m.workshop_bin_preview_pause_action, icon: PauseIcon };
const PLAY: RunRow = { key: "play", title: m.workshop_bin_preview_play_action, icon: PlayIcon };

const PLACES: readonly RunRow[] = [
  { key: "restart", title: m.workshop_bin_preview_restart_action, icon: ArrowCounterClockwiseIcon },
  { key: "end", title: m.workshop_bin_menu_vfx_end_action, icon: CaretLineRightIcon },
];

const STEPS: readonly RunRow[] = [
  { key: "stepBack", title: m.workshop_bin_preview_step_back_action, icon: ArrowLineLeftIcon },
  {
    key: "stepForward",
    title: m.workshop_bin_preview_step_forward_action,
    icon: ArrowLineRightIcon,
  },
  { key: "jumpBack", title: m.workshop_bin_menu_vfx_jump_back_action, icon: CaretDoubleLeftIcon },
  {
    key: "jumpForward",
    title: m.workshop_bin_menu_vfx_jump_forward_action,
    icon: CaretDoubleRightIcon,
  },
];

const SPEEDS: readonly RunRow[] = [
  { key: "slower", title: m.workshop_bin_preview_speed_down_action, icon: GaugeIcon },
  { key: "faster", title: m.workshop_bin_preview_speed_up_action, icon: GaugeIcon },
];

const MARKER_ADD: RunRow = {
  key: "markerAdd",
  title: m.workshop_bin_timeline_marker_add_action,
  icon: FlagIcon,
};
const MARKER_RENAME: MenuRow = {
  id: VFX_COMMAND.markerRename,
  title: m.workshop_bin_timeline_marker_rename_action,
  icon: PencilSimpleIcon,
};
const MARKER_DELETE: MenuRow = {
  id: VFX_COMMAND.markerDelete,
  title: m.workshop_bin_timeline_marker_delete_action,
  icon: TrashIcon,
};

/** Returns the Playback menu, whose items run what the run's keys run. */
export function usePlaybackMenu(scope: MenuScope, commands: RunCommands): CommandMenu {
  const { lookup, run } = scope;
  const { item, action, reason, shortcut } = commands;
  const markers = useTimelineMarkers();

  const continuous = run?.playback === "continuous";
  const projectReason = m.workshop_bin_menu_vfx_marker_project_reason();
  const markerAbsent = markers === null ? projectReason : m.workshop_bin_menu_vfx_timeline_reason();
  const addMarker = item(MARKER_ADD);

  return {
    id: "playback",
    title: m.workshop_bin_menu_vfx_playback_label(),
    className: "w-64",
    items: [
      item(run?.playing === true ? PAUSE : PLAY),
      ...PLACES.map(item),
      MENU_SEPARATOR,
      ...STEPS.map(item),
      MENU_SEPARATOR,
      toggle({
        id: "run.loop",
        title: m.workshop_bin_preview_loop_label(),
        icon: RepeatIcon,
        shortcut: shortcut("loop"),
        checked: run?.looping === true,
        run: continuous ? null : action("loop"),
        reason: continuous ? m.workshop_bin_preview_loop_continuous_hint() : reason,
      }),
      ...SPEEDS.map(item),
      MENU_SEPARATOR,
      markers === null
        ? { ...addMarker, shortcut: undefined, run: null, reason: projectReason }
        : addMarker,
      paneCommand(lookup, MARKER_RENAME, markerAbsent),
      paneCommand(lookup, MARKER_DELETE, markerAbsent),
    ],
  };
}
