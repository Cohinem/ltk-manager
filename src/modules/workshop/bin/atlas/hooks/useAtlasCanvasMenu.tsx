import {
  CursorClickIcon,
  GaugeIcon,
  MonitorIcon,
  PencilSimpleIcon,
  StackSimpleIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
import { lazy, use } from "react";

import { m } from "@/i18n";
import type {
  CommandMenu,
  CommandMenuCheck,
  CommandMenuEntry,
  CommandMenuSubmenu,
} from "@/modules/editor";

import { ObjectMenuContext } from "../../menus/state/objectMenu";
import { usePaneCommandLookup } from "../../menus/state/paneCommands";
import { PREVIEW_KEYS } from "../canvas/previewKeys";
import {
  BUTTON_STATE_CHOICES,
  BUTTON_STATE_OWN,
  PREVIEW_TOOLS,
  type PreviewTool,
} from "../canvas/previewTools";
import type { ButtonState } from "../engine/model/buttons";
import {
  HUD_MAX,
  HUD_MIN,
  SCREEN_PRESETS,
  useAtlasPreviewActions,
  useAtlasPreviewStore,
  useFrameSettings,
  useScreenPreset,
} from "../state/atlasPreview";
import { FONT_FOCUS_SAMPLE_COMMAND } from "../utils/atlasCommands";
import { gated, MENU_ICON, offered, slotSubmenu } from "./atlasMenuItems";

const VariantItems = lazy(() =>
  import("../components/AtlasBarItems").then((module) => ({ default: module.VariantItems })),
);
const TooltipSampleItems = lazy(() =>
  import("../components/AtlasBarItems").then((module) => ({ default: module.TooltipSampleItems })),
);

/** The HUD scales that the bar offers. The toolbar's slider holds every other value. */
const HUD_STEPS: readonly number[] = [HUD_MIN, 0.75, 0.85, HUD_MAX];

/** The effect and meter progress values that the bar offers. */
const LIVE_STEPS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];

function percent(value: number): string {
  return m.workshop_bin_menu_atlas_percent_value({ percent: Math.round(value * 100) });
}

/** Returns the id of `steps` that `value` equals, null if the slider left it between two. */
function stepValue(steps: readonly number[], value: number): string | null {
  return steps.includes(value) ? String(value) : null;
}

/** Returns the Screen size submenu, with the HUD scale if `hud` is true. */
function useScreenSubmenu(hud: boolean): CommandMenuSubmenu {
  const preset = useScreenPreset();
  const scale = useAtlasPreviewStore((state) => state.hud);
  const { setPreset, setHud } = useAtlasPreviewActions();

  return {
    kind: "submenu",
    id: "atlas.screen",
    title: m.workshop_bin_atlas_screen_label(),
    icon: <MonitorIcon className={MENU_ICON} />,
    className: "w-56",
    items: [
      {
        kind: "radio",
        id: "atlas.screen.preset",
        value: preset.id,
        options: SCREEN_PRESETS.map((each) => ({
          value: each.id,
          title: `${m.workshop_bin_atlas_screen_value({ width: each.width, height: each.height })}, ${each.aspect}`,
        })),
        onPick: setPreset,
      },
      hud && { kind: "separator" },
      hud && {
        kind: "submenu",
        id: "atlas.screen.hud",
        title: m.workshop_bin_atlas_hud_label(),
        className: "w-36",
        items: [
          {
            kind: "radio",
            id: "atlas.screen.hud.step",
            value: stepValue(HUD_STEPS, scale),
            options: HUD_STEPS.map((each) => ({ value: String(each), title: percent(each) })),
            onPick: (value) => setHud(Number(value)),
          },
        ],
      },
    ],
  };
}

/**
 * Returns the Canvas menu, which mirrors `CanvasToolbar` and the tooltip row.
 *
 * With `view` true it adds Variants and Tooltip sample, which a UI element does not have.
 */
export function useAtlasCanvasMenu(view: boolean, document: number, entry: string): CommandMenu {
  const settings = useFrameSettings();
  const actions = useAtlasPreviewActions();
  const screen = useScreenSubmenu(true);

  const tool = (each: PreviewTool): CommandMenuCheck => {
    const { Glyph } = each;

    return {
      kind: "check",
      id: `atlas.tool.${each.id}`,
      title: each.title(),
      icon: <Glyph className={MENU_ICON} />,
      shortcut: each.shortcut,
      checked: each.on(settings),
      run: actions[each.action],
    };
  };

  const buttonState: CommandMenuSubmenu = {
    kind: "submenu",
    id: "atlas.buttonState",
    title: m.workshop_bin_menu_atlas_button_state_label(),
    icon: <CursorClickIcon className={MENU_ICON} />,
    className: "w-60",
    items: [
      {
        kind: "command",
        id: "atlas.buttonState.next",
        title: m.workshop_bin_atlas_shortcuts_button_state_label(),
        shortcut: PREVIEW_KEYS.buttonState,
        run: actions.cycleButtonState,
      },
      { kind: "separator" },
      {
        kind: "radio",
        id: "atlas.buttonState.value",
        value: settings.buttonState ?? BUTTON_STATE_OWN,
        options: BUTTON_STATE_CHOICES.map(([id, Glyph, name]) => ({
          value: id,
          title: name(),
          icon: <Glyph className={MENU_ICON} />,
        })),
        onPick: (value) =>
          actions.setButtonState(value === BUTTON_STATE_OWN ? null : (value as ButtonState)),
      },
    ],
  };

  const viewOnly: CommandMenuEntry[] = view
    ? [
        slotSubmenu(
          "atlas.variant",
          m.workshop_bin_pane_variants_label(),
          StackSimpleIcon,
          <VariantItems document={document} entry={entry} />,
        ),
        slotSubmenu(
          "atlas.tooltip",
          m.workshop_bin_menu_atlas_tooltip_label(),
          TextAaIcon,
          <TooltipSampleItems document={document} entry={entry} />,
        ),
      ]
    : [];

  return {
    id: "canvas",
    title: m.workshop_bin_menu_atlas_canvas_label(),
    className: "w-64",
    items: [
      tool(PREVIEW_TOOLS.transform),
      tool(PREVIEW_TOOLS.interact),
      { kind: "separator" },
      screen,
      { kind: "separator" },
      tool(PREVIEW_TOOLS.safeZone),
      tool(PREVIEW_TOOLS.showDisabled),
      tool(PREVIEW_TOOLS.effects),
      tool(PREVIEW_TOOLS.samples),
      tool(PREVIEW_TOOLS.stackScenes),
      { kind: "separator" },
      tool(PREVIEW_TOOLS.play),
      {
        kind: "submenu",
        id: "atlas.live",
        title: m.workshop_bin_atlas_live_label(),
        icon: <GaugeIcon className={MENU_ICON} />,
        className: "w-36",
        items: [
          {
            kind: "radio",
            id: "atlas.live.step",
            value: stepValue(LIVE_STEPS, settings.live),
            options: LIVE_STEPS.map((each) => ({ value: String(each), title: percent(each) })),
            onPick: (value) => actions.setLive(Number(value)),
          },
        ],
      },
      { kind: "separator" },
      buttonState,
      ...viewOnly,
    ],
  };
}

/** Returns the Preview menu of a `GameFontDescription`. */
export function useFontPreviewMenu(): CommandMenu {
  const screen = useScreenSubmenu(false);
  const lookup = usePaneCommandLookup();
  const objectMenu = use(ObjectMenuContext);
  const reason = m.workshop_bin_menu_font_sample_reason();

  return {
    id: "preview",
    title: m.workshop_bin_menu_preview_label(),
    className: "w-60",
    items: [
      screen,
      { kind: "separator" },
      gated(
        offered(
          lookup,
          FONT_FOCUS_SAMPLE_COMMAND,
          m.workshop_bin_menu_font_focus_sample_action(),
          PencilSimpleIcon,
          { absent: reason },
        ),
        objectMenu?.mode === "layout",
        reason,
      ),
    ],
  };
}
