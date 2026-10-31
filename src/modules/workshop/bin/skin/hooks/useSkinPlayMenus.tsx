import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  CaretLineLeftIcon,
  CaretLineRightIcon,
  CrosshairIcon,
  FilmStripIcon,
  GaugeIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { lazy, type ReactNode, Suspense, use } from "react";

import { m } from "@/i18n";
import type { CommandMenu, CommandMenuItem } from "@/modules/editor";

import { ObjectMenuContext } from "../../menus/state/objectMenu";
import { SPEED_DETENTS } from "../../vfx/playback/components/Transport";
import { SkinChoiceContext } from "../state/skinChoice";
import {
  type Lookup,
  MENU_ICON as ICON,
  listSubmenu,
  offerCheck,
  offerCommand,
  offerCommands,
} from "../utils/offerItems";
import {
  listedCommands,
  offerChecks,
  offerRadio,
  SKIN_ADD_CONDITION_COMMAND,
  SKIN_ADD_EFFECT_COMMAND,
  SKIN_APPLY_CONDITION_LIST,
  SKIN_EFFECTS_COMMAND,
  SKIN_FIT_COMMAND,
  SKIN_OPEN_EFFECT_LIST,
  SKIN_PARAMETER_LIST,
  SKIN_REMOVE_CONDITION_LIST,
  SKIN_REMOVE_EFFECT_LIST,
  SKIN_SCRUB_COMMAND,
} from "../utils/skinCommands";
import { SKIN_KEYS, type SkinKeyId } from "../utils/skinKeys";
import type { SkinGate } from "./useSkinGate";

/* In a separate chunk, because it reads the viewport barrel, which pulls three. */
const SkinClipItems = lazy(() =>
  import("../components/SkinClipItems").then((module) => ({ default: module.SkinClipItems })),
);

/** Returns the Animation menu, which runs on the skin choice that the preview plays. */
export function useSkinAnimationMenu(lookup: Lookup, gate: SkinGate): CommandMenu {
  const menu = use(ObjectMenuContext);
  const choice = use(SkinChoiceContext);
  const blocked = gate.preview;

  const key = (id: SkinKeyId, title: string, icon?: ReactNode): CommandMenuItem => {
    const binding = SKIN_KEYS[id];

    return {
      kind: "command",
      id: `skin.key.${id}`,
      title,
      icon,
      shortcut: binding.shortcut,
      run:
        choice === null || blocked !== null
          ? null
          : () =>
              binding.run({
                clock: choice.clock,
                playing: choice.playing,
                setPlaying: choice.setPlaying,
                speed: choice.speed,
                setSpeed: choice.setSpeed,
                fit: () => lookup(SKIN_FIT_COMMAND)?.run?.(),
              }),
      reason: blocked ?? undefined,
    };
  };

  const Glyph = choice?.playing === true ? PauseIcon : PlayIcon;
  const parameters = listedCommands(lookup, SKIN_PARAMETER_LIST);

  return {
    id: "animation",
    title: m.workshop_bin_menu_skin_animation_label(),
    className: "w-72",
    items: [
      key(
        "play",
        choice?.playing === true
          ? m.workshop_bin_preview_pause_action()
          : m.workshop_bin_preview_play_action(),
        <Glyph className={ICON} />,
      ),
      key(
        "restart",
        m.workshop_bin_preview_restart_action(),
        <ArrowCounterClockwiseIcon className={ICON} />,
      ),
      { kind: "separator" },
      key(
        "stepBack",
        m.workshop_bin_preview_step_back_action(),
        <CaretLineLeftIcon className={ICON} />,
      ),
      key(
        "stepForward",
        m.workshop_bin_preview_step_forward_action(),
        <CaretLineRightIcon className={ICON} />,
      ),
      key("stepBackLong", m.workshop_bin_menu_skin_step_back_long_action()),
      key("stepForwardLong", m.workshop_bin_menu_skin_step_forward_long_action()),
      offerCommand(
        SKIN_SCRUB_COMMAND,
        m.workshop_bin_menu_skin_scrub_action(),
        <CrosshairIcon className={ICON} />,
        lookup(SKIN_SCRUB_COMMAND),
        blocked,
      ),
      { kind: "separator" },
      key("slower", m.workshop_bin_preview_speed_down_action(), <MinusIcon className={ICON} />),
      key("faster", m.workshop_bin_preview_speed_up_action(), <PlusIcon className={ICON} />),
      {
        kind: "submenu",
        id: "skin.speed",
        title: m.workshop_bin_preview_speed_label(),
        icon: <GaugeIcon className={ICON} />,
        className: "w-32",
        items: [
          {
            kind: "radio",
            id: "skin.speed.detent",
            value: String(choice?.speed ?? 1),
            options: SPEED_DETENTS.map((speed) => ({
              value: String(speed),
              title: m.workshop_missile_speed_label({ speed }),
              disabled: blocked !== null,
            })),
            onPick: (speed) => choice?.setSpeed(Number(speed)),
          },
        ],
      },
      { kind: "separator" },
      listSubmenu(
        "skin.clip",
        m.workshop_bin_menu_skin_clip_label(),
        <FilmStripIcon className={ICON} />,
        menu === null
          ? []
          : [
              {
                kind: "slot",
                id: "skin.clip.items",
                node: (
                  <Suspense fallback={null}>
                    <SkinClipItems document={menu.document} entry={menu.object.entry} />
                  </Suspense>
                ),
              },
            ],
        blocked,
        m.workshop_bin_menu_skin_preview_reason(),
      ),
      listSubmenu(
        "skin.parameter",
        m.workshop_bin_clip_parameter_label(),
        <SlidersHorizontalIcon className={ICON} />,
        [offerRadio("skin.parameter.value", parameters)],
        blocked ?? (parameters.length === 0 ? m.workshop_bin_menu_skin_parameter_reason() : null),
        m.workshop_bin_menu_skin_parameter_reason(),
      ),
    ],
  };
}

/** Returns the Skin menu: the effects and the persistent conditions. */
export function useSkinMenu(lookup: Lookup, gate: SkinGate): CommandMenu {
  const edit = gate.edit ?? gate.sections;
  const openEffects = listedCommands(lookup, SKIN_OPEN_EFFECT_LIST);
  const removeEffects = listedCommands(lookup, SKIN_REMOVE_EFFECT_LIST);
  const applyConditions = listedCommands(lookup, SKIN_APPLY_CONDITION_LIST);
  const removeConditions = listedCommands(lookup, SKIN_REMOVE_CONDITION_LIST);
  const section = m.workshop_bin_menu_skin_section_reason();

  return {
    id: "skin",
    title: m.workshop_bin_menu_skin_label(),
    className: "w-64",
    items: [
      offerCheck(
        SKIN_EFFECTS_COMMAND,
        m.workshop_bin_mesh_preview_effects_label(),
        <SparkleIcon className={ICON} />,
        lookup(SKIN_EFFECTS_COMMAND),
        gate.preview,
      ),
      listSubmenu(
        SKIN_OPEN_EFFECT_LIST,
        m.workshop_bin_vfx_open_effect_action(),
        <ArrowSquareOutIcon className={ICON} />,
        offerCommands(SKIN_OPEN_EFFECT_LIST, openEffects),
        gate.preview,
        m.workshop_bin_menu_skin_effects_empty_reason(),
      ),
      { kind: "separator" },
      offerCommand(
        SKIN_ADD_EFFECT_COMMAND,
        m.workshop_bin_skin_effect_add_action(),
        <PlusIcon className={ICON} />,
        lookup(SKIN_ADD_EFFECT_COMMAND),
        edit,
        section,
      ),
      listSubmenu(
        SKIN_REMOVE_EFFECT_LIST,
        m.workshop_bin_skin_effect_remove_action(),
        <TrashIcon className={ICON} />,
        offerCommands(SKIN_REMOVE_EFFECT_LIST, removeEffects, { danger: true }),
        edit,
        lookup(SKIN_ADD_EFFECT_COMMAND) === null
          ? section
          : m.workshop_bin_menu_skin_effects_empty_reason(),
      ),
      { kind: "separator" },
      offerCommand(
        SKIN_ADD_CONDITION_COMMAND,
        m.workshop_bin_skin_condition_add_action(),
        <PlusIcon className={ICON} />,
        lookup(SKIN_ADD_CONDITION_COMMAND),
        edit,
        section,
      ),
      listSubmenu(
        SKIN_REMOVE_CONDITION_LIST,
        m.workshop_bin_skin_condition_remove_action(),
        <TrashIcon className={ICON} />,
        offerCommands(SKIN_REMOVE_CONDITION_LIST, removeConditions, { danger: true }),
        edit,
        lookup(SKIN_ADD_CONDITION_COMMAND) === null
          ? section
          : m.workshop_bin_menu_skin_conditions_empty_reason(),
      ),
      listSubmenu(
        SKIN_APPLY_CONDITION_LIST,
        m.workshop_bin_skin_condition_preview_label(),
        <SlidersHorizontalIcon className={ICON} />,
        offerChecks(SKIN_APPLY_CONDITION_LIST, applyConditions),
        gate.sections,
        lookup(SKIN_ADD_CONDITION_COMMAND) === null
          ? section
          : m.workshop_bin_menu_skin_conditions_empty_reason(),
      ),
    ],
  };
}
