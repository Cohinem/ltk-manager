import {
  ArrowsOutCardinalIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  CheckSquareOffsetIcon,
  CursorClickIcon,
  CursorIcon,
  EyeIcon,
  FrameCornersIcon,
  HandGrabbingIcon,
  HandPointingIcon,
  HandTapIcon,
  type Icon,
  PlayIcon,
  ProhibitIcon,
  ProhibitInsetIcon,
  SparkleIcon,
  StackIcon,
  TextAaIcon,
} from "@phosphor-icons/react";

import { m } from "@/i18n";

import type { ButtonState } from "../engine/model/buttons";
import { PREVIEW_KEYS, type PreviewKeyActions } from "./previewKeys";

/** The settings of the preview that a tool reads, as `useFrameSettings` returns them. */
interface PreviewToolSettings {
  readonly interact: boolean;
  readonly safeZone: boolean;
  readonly showDisabled: boolean;
  readonly effects: boolean;
  readonly samples: boolean;
  readonly stackScenes: boolean;
  readonly playing: boolean;
}

/** One switch of the preview, which the toolbar and the menu bar both draw. */
export interface PreviewTool {
  readonly id: string;
  readonly title: () => string;
  readonly shortcut: string;
  readonly Glyph: Icon;
  readonly on: (settings: PreviewToolSettings) => boolean;
  readonly action: keyof PreviewKeyActions;
}

function tool(
  id: string,
  title: () => string,
  shortcut: string,
  Glyph: Icon,
  on: PreviewTool["on"],
  action: PreviewTool["action"],
): PreviewTool {
  return { id, title, shortcut, Glyph, on, action };
}

export const PREVIEW_TOOLS = {
  transform: tool(
    "transform",
    m.workshop_bin_atlas_transform_label,
    PREVIEW_KEYS.transform,
    ArrowsOutCardinalIcon,
    (settings) => !settings.interact,
    "chooseTransform",
  ),
  interact: tool(
    "interact",
    m.workshop_bin_atlas_interact_label,
    PREVIEW_KEYS.interact,
    HandTapIcon,
    (settings) => settings.interact,
    "toggleInteract",
  ),
  safeZone: tool(
    "safeZone",
    m.workshop_bin_atlas_safe_zone_label,
    PREVIEW_KEYS.safeZone,
    FrameCornersIcon,
    (settings) => settings.safeZone,
    "toggleSafeZone",
  ),
  showDisabled: tool(
    "showDisabled",
    m.workshop_bin_atlas_show_disabled_label,
    PREVIEW_KEYS.showDisabled,
    EyeIcon,
    (settings) => settings.showDisabled,
    "toggleShowDisabled",
  ),
  effects: tool(
    "effects",
    m.workshop_bin_atlas_effects_label,
    PREVIEW_KEYS.effects,
    SparkleIcon,
    (settings) => settings.effects,
    "toggleEffects",
  ),
  samples: tool(
    "samples",
    m.workshop_bin_atlas_samples_label,
    PREVIEW_KEYS.samples,
    TextAaIcon,
    (settings) => settings.samples,
    "toggleSamples",
  ),
  stackScenes: tool(
    "stackScenes",
    m.workshop_bin_atlas_stack_scenes_label,
    PREVIEW_KEYS.stackScenes,
    StackIcon,
    (settings) => settings.stackScenes,
    "toggleStackScenes",
  ),
  play: tool(
    "play",
    m.workshop_bin_atlas_shortcuts_play_label,
    PREVIEW_KEYS.play,
    PlayIcon,
    (settings) => settings.playing,
    "togglePlaying",
  ),
} as const;

/** The value of each button's own state, which no state field spells. */
export const BUTTON_STATE_OWN = "own";

/**
 * The choices of the button state: each button's own state, then each state forced on every
 * button, with the glyph of that state and its name.
 */
export const BUTTON_STATE_CHOICES: readonly (readonly [
  ButtonState | typeof BUTTON_STATE_OWN,
  Icon,
  () => string,
])[] = [
  [BUTTON_STATE_OWN, CursorClickIcon, m.workshop_bin_atlas_state_own_label],
  ["DefaultStateElements", CursorIcon, m.workshop_bin_atlas_state_default_label],
  ["HoverStateElements", HandPointingIcon, m.workshop_bin_atlas_state_hover_label],
  ["ClickedStateElements", HandGrabbingIcon, m.workshop_bin_atlas_state_clicked_label],
  ["SelectedStateElements", CheckSquareIcon, m.workshop_bin_atlas_state_selected_label],
  [
    "SelectedHoverStateElements",
    CheckSquareOffsetIcon,
    m.workshop_bin_atlas_state_selected_hover_label,
  ],
  [
    "SelectedClickedStateElements",
    CheckCircleIcon,
    m.workshop_bin_atlas_state_selected_clicked_label,
  ],
  ["InactiveStateElements", ProhibitIcon, m.workshop_bin_atlas_state_inactive_label],
  [
    "InactiveSelectedStateElements",
    ProhibitInsetIcon,
    m.workshop_bin_atlas_state_inactive_selected_label,
  ],
];
