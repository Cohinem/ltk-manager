import {
  ArrowsOutCardinalIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  CheckSquareOffsetIcon,
  CursorClickIcon,
  CursorIcon,
  EyeIcon,
  FrameCornersIcon,
  GaugeIcon,
  HandGrabbingIcon,
  HandPointingIcon,
  HandTapIcon,
  type Icon,
  PauseIcon,
  PlayIcon,
  ProhibitIcon,
  ProhibitInsetIcon,
  SparkleIcon,
  StackIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { IconButton, Menu, Slider, Tooltip } from "@/components";
import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { PREVIEW_KEYS } from "../canvas/previewKeys";
import type { ButtonState } from "../engine/model/buttons";
import { useAtlasPreviewActions, useFrameSettings } from "../state/atlasPreview";
import { KeyHint } from "./KeyHint";
import { ScreenMenu } from "./ScreenMenu";

/** The menu value of each button's own state, which no state field spells. */
const OWN = "own";

/**
 * What the button state menu offers: each button's own state, then each state forced on every
 * button, with the glyph that stands for it and its name.
 */
const BUTTON_STATES: readonly (readonly [ButtonState | typeof OWN, Icon, () => string])[] = [
  [OWN, CursorClickIcon, m.workshop_bin_atlas_state_own_label],
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

const LIVE_STEP = 0.01;

/**
 * The preview's toolbar, the second row of the Atlas tab: the transform tool, which selects,
 * moves and resizes, and interact mode, which plays the view's widgets under the pointer in place
 * of editing it, the screen menu, the safe zone, the
 * elements the view rests with off, whether effects draw, sample content for what the controller
 * fills, whether the scenes stack on one screen, the state every button draws, and the effects'
 * progress and clock. Each icon's tooltip names its canvas key.
 */
export function CanvasToolbar() {
  const { interact, safeZone, showDisabled, effects, samples, stackScenes, live, playing } =
    useFrameSettings();
  const actions = useAtlasPreviewActions();
  const Clock = playing ? PauseIcon : PlayIcon;
  const clockLabel = playing
    ? m.workshop_bin_atlas_pause_action()
    : m.workshop_bin_atlas_play_action();

  return (
    <div
      data-ui="CanvasToolbar"
      role="toolbar"
      aria-label={m.workshop_bin_atlas_toolbar_label()}
      className="flex min-w-0 flex-1 items-center gap-1 select-none"
    >
      <ToggleTool
        label={m.workshop_bin_atlas_transform_label()}
        shortcut={PREVIEW_KEYS.transform}
        on={!interact}
        icon={<ArrowsOutCardinalIcon weight="bold" className="h-4 w-4" />}
        onToggle={actions.chooseTransform}
      />
      <ToggleTool
        label={m.workshop_bin_atlas_interact_label()}
        shortcut={PREVIEW_KEYS.interact}
        on={interact}
        icon={<HandTapIcon weight="bold" className="h-4 w-4" />}
        onToggle={actions.toggleInteract}
      />
      <Divider />
      <ScreenMenu />
      <Divider />
      <ToggleTool
        label={m.workshop_bin_atlas_safe_zone_label()}
        shortcut={PREVIEW_KEYS.safeZone}
        on={safeZone}
        icon={<FrameCornersIcon weight="bold" className="h-4 w-4" />}
        onToggle={actions.toggleSafeZone}
      />
      <ToggleTool
        label={m.workshop_bin_atlas_show_disabled_label()}
        shortcut={PREVIEW_KEYS.showDisabled}
        on={showDisabled}
        icon={<EyeIcon weight="bold" className="h-4 w-4" />}
        onToggle={actions.toggleShowDisabled}
      />
      <ToggleTool
        label={m.workshop_bin_atlas_effects_label()}
        shortcut={PREVIEW_KEYS.effects}
        on={effects}
        icon={<SparkleIcon weight="bold" className="h-4 w-4" />}
        onToggle={actions.toggleEffects}
      />
      <ToggleTool
        label={m.workshop_bin_atlas_samples_label()}
        shortcut={PREVIEW_KEYS.samples}
        on={samples}
        icon={<TextAaIcon weight="bold" className="h-4 w-4" />}
        onToggle={actions.toggleSamples}
      />
      <ToggleTool
        label={m.workshop_bin_atlas_stack_scenes_label()}
        shortcut={PREVIEW_KEYS.stackScenes}
        on={stackScenes}
        icon={<StackIcon weight="bold" className="h-4 w-4" />}
        onToggle={actions.toggleStackScenes}
      />
      <Divider />
      <ButtonStateMenu />
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <Tooltip content={m.workshop_bin_atlas_live_label()}>
          <span className="flex items-center gap-1.5 px-1">
            <GaugeIcon weight="bold" className="h-4 w-4 text-surface-400" />
            <Slider
              className="w-20"
              aria-label={m.workshop_bin_atlas_live_label()}
              value={live}
              min={0}
              max={1}
              step={LIVE_STEP}
              animated={false}
              onValueChange={actions.setLive}
            />
          </span>
        </Tooltip>
        <Tooltip content={<KeyHint label={clockLabel} shortcut={PREVIEW_KEYS.play} />}>
          <IconButton
            variant="ghost"
            size="xs"
            compact
            aria-label={clockLabel}
            aria-keyshortcuts={PREVIEW_KEYS.play}
            icon={<Clock weight="bold" className="h-4 w-4" />}
            onClick={actions.togglePlaying}
          />
        </Tooltip>
      </span>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-surface-700" />;
}

interface ToggleToolProps {
  readonly label: string;
  readonly shortcut: string;
  readonly on: boolean;
  readonly icon: ReactNode;
  readonly onToggle: () => void;
}

/** An icon that switches one preview setting, tinted while it is on. */
function ToggleTool({ label, shortcut, on, icon, onToggle }: ToggleToolProps) {
  return (
    <Tooltip content={<KeyHint label={label} shortcut={shortcut} />}>
      <IconButton
        variant="ghost"
        size="xs"
        compact
        aria-label={label}
        aria-pressed={on}
        aria-keyshortcuts={shortcut}
        icon={icon}
        className={twMerge(
          on && "bg-accent-500/15 text-accent-300 hover:bg-accent-500/25 hover:text-accent-200",
        )}
        onClick={onToggle}
      />
    </Tooltip>
  );
}

/**
 * The state the buttons draw, as the glyph of that state and a menu of the others: each button's
 * own, which its flags and the pointer choose, or one forced on every button.
 */
function ButtonStateMenu() {
  const { buttonState } = useFrameSettings();
  const { setButtonState } = useAtlasPreviewActions();
  const value = buttonState ?? OWN;
  const [, Glyph, name] = BUTTON_STATES.find(([id]) => id === value) ?? BUTTON_STATES[0];
  const label = m.workshop_bin_atlas_state_value({ state: name() });

  return (
    <Menu.Root>
      <Tooltip content={<KeyHint label={label} shortcut={PREVIEW_KEYS.buttonState} />}>
        <Menu.Trigger
          aria-label={label}
          aria-keyshortcuts={PREVIEW_KEYS.buttonState}
          /* DS-VEIL, DS-RADIUS */
          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-surface-300 hover:bg-surface-veil hover:text-surface-100 data-[popup-open]:bg-surface-veil-strong"
        >
          <Glyph weight="bold" className="h-4 w-4" />
        </Menu.Trigger>
      </Tooltip>
      <Menu.Portal>
        <Menu.Positioner align="start">
          <Menu.Popup>
            <Menu.RadioGroup
              value={value}
              onValueChange={(next: ButtonState | typeof OWN) =>
                setButtonState(next === OWN ? null : next)
              }
            >
              {BUTTON_STATES.map(([id, StateGlyph, stateName]) => (
                <Menu.RadioItem
                  key={id}
                  value={id}
                  icon={<StateGlyph weight="bold" className="h-4 w-4" />}
                >
                  {stateName()}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
