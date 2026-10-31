import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  AtomIcon,
  BoneIcon,
  CaretDownIcon,
  CaretLineLeftIcon,
  CaretUpIcon,
  CrosshairIcon,
  FunnelIcon,
  GaugeIcon,
  PlayIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { m } from "@/i18n";
import type { CommandMenu, CommandMenuItem } from "@/modules/editor";
import {
  usePreviewColliders,
  usePreviewSimulatedJoints,
  usePreviewSockets,
  useSetPreviewDisplay,
} from "@/stores";

import type { PaneCommand } from "../../menus/state/paneCommands";
import {
  type Lookup,
  MENU_ICON as ICON,
  listSubmenu,
  offerCheck,
  offerCommand,
  offerCommands,
} from "../utils/offerItems";
import { MODIFIER_KINDS } from "../utils/poseModifiers";
import {
  ABILITY_CAST_COMMAND,
  ABILITY_CREATE_COMMAND,
  ABILITY_GUIDES_COMMAND,
  ABILITY_OPEN_LIST,
  ABILITY_PREVIEW_COMMAND,
  ABILITY_REMOVE_COMMAND,
  ABILITY_REPLAY_COMMAND,
  ABILITY_SAVE_COMMAND,
  ABILITY_SPEED_COMMAND,
  listedCommands,
  offerRadio,
  PHYSICS_ADD_SOCKET_COMMAND,
  PHYSICS_MODIFIER_LIST,
  PHYSICS_MUTE_COMMAND,
  PHYSICS_NEXT_COMMAND,
  PHYSICS_PREVIOUS_COMMAND,
  PHYSICS_REMOVE_COMMAND,
  SKIN_JOINT_LIST,
  SKIN_OVERLAY_COMMAND,
  SKIN_RATE_LIST,
  SPELL_BACK_COMMAND,
  SPELL_FILTER_COMMAND,
  SPELL_PICK_LIST,
} from "../utils/skinCommands";
import type { SkinGate } from "./useSkinGate";

/** Returns the Physics menu. */
export function usePhysicsMenu(lookup: Lookup, gate: SkinGate): CommandMenu {
  const joints = usePreviewSimulatedJoints();
  const colliders = usePreviewColliders();
  const sockets = usePreviewSockets();
  const setDisplay = useSetPreviewDisplay();

  const overlay = lookup(SKIN_OVERLAY_COMMAND);
  const overlayOn = overlay?.checked === true && overlay.run !== null && gate.preview === null;
  const pane = gate.pane("physics");
  const edit = gate.edit ?? pane;
  const rates = listedCommands(lookup, SKIN_RATE_LIST);
  const jointOffers = listedCommands(lookup, SKIN_JOINT_LIST);
  const modifiers = listedCommands(lookup, PHYSICS_MODIFIER_LIST);

  return {
    id: "physics",
    title: m.workshop_bin_pane_physics_label(),
    className: "w-64",
    items: [
      offerCheck(
        SKIN_OVERLAY_COMMAND,
        m.workshop_bin_physics_overlay_label(),
        <AtomIcon className={ICON} />,
        overlay,
        gate.preview,
      ),
      {
        kind: "check",
        id: "skin.overlay.joints",
        title: m.workshop_bin_physics_overlay_joints_label(),
        checked: overlayOn && joints,
        run: overlayOn ? () => setDisplay({ previewSimulatedJoints: !joints }) : null,
      },
      {
        kind: "check",
        id: "skin.overlay.colliders",
        title: m.workshop_bin_physics_overlay_colliders_label(),
        checked: overlayOn && colliders,
        run: overlayOn ? () => setDisplay({ previewColliders: !colliders }) : null,
      },
      {
        kind: "check",
        id: "skin.overlay.sockets",
        title: m.workshop_bin_physics_overlay_sockets_label(),
        checked: overlayOn && sockets,
        run: overlayOn ? () => setDisplay({ previewSockets: !sockets }) : null,
      },
      listSubmenu(
        SKIN_RATE_LIST,
        m.workshop_bin_physics_rate_label(),
        <GaugeIcon className={ICON} />,
        [offerRadio("skin.rate.value", rates)],
        gate.preview ?? (rates.length === 0 ? m.workshop_bin_menu_skin_rate_reason() : null),
        m.workshop_bin_menu_skin_rate_reason(),
      ),
      { kind: "separator" },
      {
        kind: "submenu",
        id: PHYSICS_MODIFIER_LIST,
        title: m.workshop_bin_physics_add_modifier_action(),
        icon: <PlusIcon className={ICON} />,
        className: "w-56",
        items: MODIFIER_KINDS.map((kind, at) =>
          offerCommand(
            `${PHYSICS_MODIFIER_LIST}.${at}`,
            kind.title(),
            <kind.icon className={ICON} />,
            modifiers[at] ?? null,
            edit,
          ),
        ),
      },
      offerCommand(
        PHYSICS_ADD_SOCKET_COMMAND,
        m.workshop_bin_physics_add_socket_label(),
        <PlusIcon className={ICON} />,
        lookup(PHYSICS_ADD_SOCKET_COMMAND),
        edit,
      ),
      listSubmenu(
        SKIN_JOINT_LIST,
        m.workshop_bin_menu_skin_joint_label(),
        <BoneIcon className={ICON} />,
        offerCommands(SKIN_JOINT_LIST, jointOffers),
        gate.edit ?? gate.pane("skeleton"),
        m.workshop_bin_menu_skin_joint_reason(),
      ),
      { kind: "separator" },
      offerCommand(
        PHYSICS_PREVIOUS_COMMAND,
        m.workshop_bin_physics_previous_action(),
        <CaretUpIcon className={ICON} />,
        lookup(PHYSICS_PREVIOUS_COMMAND),
        pane,
      ),
      offerCommand(
        PHYSICS_NEXT_COMMAND,
        m.workshop_bin_physics_next_action(),
        <CaretDownIcon className={ICON} />,
        lookup(PHYSICS_NEXT_COMMAND),
        pane,
      ),
      offerCheck(
        PHYSICS_MUTE_COMMAND,
        m.workshop_bin_physics_preview_label(),
        <AtomIcon className={ICON} />,
        lookup(PHYSICS_MUTE_COMMAND),
        pane,
      ),
      {
        ...offerCommand(
          PHYSICS_REMOVE_COMMAND,
          m.workshop_bin_physics_remove_action(),
          <TrashIcon className={ICON} />,
          lookup(PHYSICS_REMOVE_COMMAND),
          edit,
        ),
        danger: true,
      } as CommandMenuItem,
    ],
  };
}

/** Returns the Spells menu. Each command brings the Spells pane to the front first. */
export function useSpellsMenu(lookup: Lookup, gate: SkinGate): CommandMenu {
  const pane = gate.pane("spells");
  const front = gate.front("spells");
  const spells = listedCommands(lookup, SPELL_PICK_LIST);
  const abilities = listedCommands(lookup, ABILITY_OPEN_LIST);
  const list = m.workshop_bin_menu_skin_spell_list_reason();
  const ability = m.workshop_bin_menu_skin_ability_reason();
  const scene = m.workshop_bin_menu_skin_ability_scene_reason();

  const fronted = (id: string): PaneCommand | null => {
    const offer = lookup(id);

    return offer?.run == null ? offer : { ...offer, run: front(offer.run) };
  };

  return {
    id: "spells",
    title: m.workshop_bin_pane_spells_label(),
    className: "w-64",
    items: [
      offerCommand(
        SPELL_FILTER_COMMAND,
        m.workshop_bin_menu_skin_spell_filter_action(),
        <FunnelIcon className={ICON} />,
        fronted(SPELL_FILTER_COMMAND),
        pane,
        list,
      ),
      listSubmenu(
        SPELL_PICK_LIST,
        m.workshop_bin_menu_skin_spell_pick_label(),
        <PlayIcon className={ICON} />,
        offerCommands(SPELL_PICK_LIST, spells, { front }),
        pane,
        list,
      ),
      offerCommand(
        SPELL_BACK_COMMAND,
        m.workshop_bin_menu_skin_spell_back_action(),
        <CaretLineLeftIcon className={ICON} />,
        fronted(SPELL_BACK_COMMAND),
        pane,
        m.workshop_bin_menu_skin_spell_back_reason(),
      ),
      { kind: "separator" },
      offerCommand(
        ABILITY_CREATE_COMMAND,
        m.workshop_ability_create_action(),
        <PlusIcon className={ICON} />,
        fronted(ABILITY_CREATE_COMMAND),
        pane,
      ),
      listSubmenu(
        ABILITY_OPEN_LIST,
        m.workshop_bin_menu_skin_ability_open_label(),
        <ArrowSquareOutIcon className={ICON} />,
        offerCommands(ABILITY_OPEN_LIST, abilities, { front }),
        pane,
        m.workshop_bin_menu_skin_abilities_empty_reason(),
      ),
      offerCommand(
        ABILITY_PREVIEW_COMMAND,
        m.workshop_ability_preview_action(),
        <PlayIcon className={ICON} />,
        lookup(ABILITY_PREVIEW_COMMAND),
        pane,
        ability,
      ),
      offerCommand(
        ABILITY_SAVE_COMMAND,
        m.workshop_ability_save_action(),
        <SparkleIcon className={ICON} />,
        lookup(ABILITY_SAVE_COMMAND),
        pane,
        ability,
      ),
      offerCommand(
        ABILITY_REMOVE_COMMAND,
        m.workshop_ability_remove_action(),
        <TrashIcon className={ICON} />,
        lookup(ABILITY_REMOVE_COMMAND),
        pane,
        ability,
      ),
      { kind: "separator" },
      offerCommand(
        ABILITY_CAST_COMMAND,
        m.workshop_ability_cast_action(),
        <PlayIcon className={ICON} />,
        lookup(ABILITY_CAST_COMMAND),
        pane,
        scene,
      ),
      offerCommand(
        ABILITY_REPLAY_COMMAND,
        m.workshop_missile_replay_action(),
        <ArrowCounterClockwiseIcon className={ICON} />,
        lookup(ABILITY_REPLAY_COMMAND),
        pane,
        scene,
      ),
      offerCommand(
        ABILITY_SPEED_COMMAND,
        m.workshop_bin_preview_speed_label(),
        <GaugeIcon className={ICON} />,
        lookup(ABILITY_SPEED_COMMAND),
        pane,
        scene,
      ),
      offerCheck(
        ABILITY_GUIDES_COMMAND,
        m.workshop_ability_guides_label(),
        <CrosshairIcon className={ICON} />,
        lookup(ABILITY_GUIDES_COMMAND),
        pane,
      ),
    ],
  };
}
