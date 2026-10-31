import { GaugeIcon, PauseIcon, PlayIcon } from "@phosphor-icons/react";

import { IconButton, Menu, Slider, Tooltip } from "@/components";
import { m } from "@/i18n";

import { PREVIEW_KEYS } from "../canvas/previewKeys";
import {
  BUTTON_STATE_CHOICES,
  BUTTON_STATE_OWN,
  PREVIEW_TOOLS,
  type PreviewTool,
} from "../canvas/previewTools";
import type { ButtonState } from "../engine/model/buttons";
import { useAtlasPreviewActions, useFrameSettings } from "../state/atlasPreview";
import { KeyHint } from "./KeyHint";
import { ScreenMenu } from "./ScreenMenu";

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
  const { live, playing } = useFrameSettings();
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
      <ToggleTool tool={PREVIEW_TOOLS.transform} />
      <ToggleTool tool={PREVIEW_TOOLS.interact} />
      <Divider />
      <ScreenMenu />
      <Divider />
      <ToggleTool tool={PREVIEW_TOOLS.safeZone} />
      <ToggleTool tool={PREVIEW_TOOLS.showDisabled} />
      <ToggleTool tool={PREVIEW_TOOLS.effects} />
      <ToggleTool tool={PREVIEW_TOOLS.samples} />
      <ToggleTool tool={PREVIEW_TOOLS.stackScenes} />
      <Divider />
      <ButtonStateMenu />
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <Tooltip content={m.workshop_bin_atlas_live_label()}>
          <span className="flex items-center gap-1.5 px-1">
            <GaugeIcon weight="bold" className="size-4 text-surface-400" />
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
        <IconButton
          aria-label={clockLabel}
          aria-keyshortcuts={PREVIEW_KEYS.play}
          icon={<Clock />}
          onClick={actions.togglePlaying}
          tooltip={<KeyHint label={clockLabel} shortcut={PREVIEW_KEYS.play} />}
        />
      </span>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-surface-700" />;
}

/** An icon that switches one preview setting, tinted while it is on. */
function ToggleTool({ tool }: { tool: PreviewTool }) {
  const settings = useFrameSettings();
  const actions = useAtlasPreviewActions();
  const { Glyph, shortcut } = tool;
  const label = tool.title();

  return (
    <IconButton
      aria-label={label}
      pressed={tool.on(settings)}
      aria-keyshortcuts={shortcut}
      icon={<Glyph weight="bold" className="size-4" />}
      onClick={actions[tool.action]}
      tooltip={<KeyHint label={label} shortcut={shortcut} />}
    />
  );
}

/**
 * The state the buttons draw, as the glyph of that state and a menu of the others: each button's
 * own, which its flags and the pointer choose, or one forced on every button.
 */
function ButtonStateMenu() {
  const { buttonState } = useFrameSettings();
  const { setButtonState } = useAtlasPreviewActions();
  const value = buttonState ?? BUTTON_STATE_OWN;
  const [, Glyph, name] =
    BUTTON_STATE_CHOICES.find(([id]) => id === value) ?? BUTTON_STATE_CHOICES[0];
  const label = m.workshop_bin_atlas_state_value({ state: name() });

  return (
    <Menu.Root>
      <Tooltip content={<KeyHint label={label} shortcut={PREVIEW_KEYS.buttonState} />}>
        <Menu.Trigger
          aria-label={label}
          aria-keyshortcuts={PREVIEW_KEYS.buttonState}
          /* DS-VEIL, DS-RADIUS */
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-surface-300 hover:bg-surface-veil hover:text-surface-100 data-[popup-open]:bg-surface-veil-strong"
        >
          <Glyph weight="bold" className="size-4" />
        </Menu.Trigger>
      </Tooltip>
      <Menu.Content align="start">
        <Menu.RadioGroup
          value={value}
          onValueChange={(next: ButtonState | typeof BUTTON_STATE_OWN) =>
            setButtonState(next === BUTTON_STATE_OWN ? null : next)
          }
        >
          {BUTTON_STATE_CHOICES.map(([id, StateGlyph, stateName]) => (
            <Menu.RadioItem
              key={id}
              value={id}
              icon={<StateGlyph weight="bold" className="size-4" />}
            >
              {stateName()}
            </Menu.RadioItem>
          ))}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu.Root>
  );
}
