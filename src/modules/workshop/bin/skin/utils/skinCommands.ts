import { m } from "@/i18n";
import type { CommandMenuEntry, CommandMenuRadio } from "@/modules/editor";

import type { PaneCommand, PaneCommands } from "../../menus/state/paneCommands";
import type { ClipTab } from "../state/skinChoice";

/** The command that the skin viewport offers, which frames its camera on the character. */
export const SKIN_FIT_COMMAND = "skin.fit";

/* The commands of the skin viewport. */
export const SKIN_HIDE_UI_COMMAND = "skin.hideUi";
export const SKIN_BAKE_COMMAND = "skin.bake";
export const SKIN_SCRUB_COMMAND = "skin.scrub";
export const SKIN_VISIBILITY_COMMAND = "skin.visibility";
export const SKIN_SUN_COMMAND = "skin.sun";
export const SKIN_POST_EFFECTS_COMMAND = "skin.postEffects";
export const SKIN_EFFECTS_COMMAND = "skin.effects";
export const SKIN_OVERLAY_COMMAND = "skin.overlay";
export const SKIN_SUBMESH_LIST = "skin.submesh";
export const SKIN_RATE_LIST = "skin.rate";
export const SKIN_PARAMETER_LIST = "skin.parameter";
export const SKIN_OPEN_EFFECT_LIST = "skin.openEffect";

/* The commands of the VFX and Conditions sections. */
export const SKIN_ADD_EFFECT_COMMAND = "skin.addEffect";
export const SKIN_REMOVE_EFFECT_LIST = "skin.removeEffect";
export const SKIN_ADD_CONDITION_COMMAND = "skin.addCondition";
export const SKIN_REMOVE_CONDITION_LIST = "skin.removeCondition";
export const SKIN_APPLY_CONDITION_LIST = "skin.applyCondition";

/* The commands of the Physics and Skeleton panes. */
export const PHYSICS_MODIFIER_LIST = "skin.physics.modifier";
export const PHYSICS_ADD_SOCKET_COMMAND = "skin.physics.addSocket";
export const PHYSICS_PREVIOUS_COMMAND = "skin.physics.previous";
export const PHYSICS_NEXT_COMMAND = "skin.physics.next";
export const PHYSICS_MUTE_COMMAND = "skin.physics.mute";
export const PHYSICS_REMOVE_COMMAND = "skin.physics.remove";
export const SKIN_JOINT_LIST = "skin.joint";

/* The commands of the Spells pane and the ability preview. */
export const SPELL_FILTER_COMMAND = "spells.filter";
export const SPELL_BACK_COMMAND = "spells.back";
export const SPELL_PICK_LIST = "spells.pick";
export const ABILITY_CREATE_COMMAND = "spells.ability.create";
export const ABILITY_OPEN_LIST = "spells.ability.open";
export const ABILITY_PREVIEW_COMMAND = "spells.ability.preview";
export const ABILITY_SAVE_COMMAND = "spells.ability.save";
export const ABILITY_REMOVE_COMMAND = "spells.ability.remove";
export const ABILITY_CAST_COMMAND = "spells.ability.cast";
export const ABILITY_REPLAY_COMMAND = "spells.ability.replay";
export const ABILITY_SPEED_COMMAND = "spells.ability.speed";
export const ABILITY_GUIDES_COMMAND = "spells.ability.guides";

/* The commands of the clips pane. */
export const CLIP_FILTER_COMMAND = "clips.filter";
export const CLIP_SORT_LIST = "clips.sort";
export const CLIP_SORT_DESCENDING_COMMAND = "clips.sortDescending";
export const CLIP_OPEN_COMMAND = "clips.open";
export const CLIP_OPEN_BESIDE_COMMAND = "clips.openBeside";
export const CLIP_MASK_LIST = "clips.mask";

/** The maps of the clips pane in the order that its control and the Clip menu list them. */
export const CLIP_TABS: readonly { value: ClipTab; label: () => string }[] = [
  { value: "clips", label: m.workshop_bin_clip_tab_clips_label },
  { value: "tracks", label: m.workshop_bin_clip_tab_tracks_label },
  { value: "masks", label: m.workshop_bin_clip_tab_masks_label },
  { value: "syncGroups", label: m.workshop_bin_clip_tab_sync_groups_label },
];

/** Returns the command ids of the list `prefix` with one offer per entry of `offers`. */
export function listCommands(prefix: string, offers: readonly PaneCommand[]): PaneCommands {
  return Object.fromEntries(offers.map((offer, at) => [`${prefix}.${at}`, offer]));
}

/** Returns the offers of the list `prefix`, up to the first index that no pane offers. */
export function listedCommands(
  lookup: (id: string) => PaneCommand | null,
  prefix: string,
): PaneCommand[] {
  const offers: PaneCommand[] = [];

  for (let at = 0; ; at += 1) {
    const offer = lookup(`${prefix}.${at}`);
    if (offer === null) return offers;

    offers.push(offer);
  }
}

/** Returns `offers` as one radio group, whose current option is the offer that is checked. */
export function offerRadio(id: string, offers: readonly PaneCommand[]): CommandMenuRadio {
  const current = offers.findIndex((offer) => offer.checked === true);

  return {
    kind: "radio",
    id,
    value: current < 0 ? null : String(current),
    options: offers.map((offer, at) => ({
      value: String(at),
      title: offer.title ?? "",
      disabled: offer.run === null,
    })),
    onPick: (value) => offers[Number(value)]?.run?.(),
  };
}

/** Returns `offers` as one switch per offer. */
export function offerChecks(id: string, offers: readonly PaneCommand[]): CommandMenuEntry[] {
  return offers.map((offer, at) => ({
    kind: "check",
    id: `${id}.${at}`,
    title: offer.title ?? "",
    checked: offer.checked === true,
    run: offer.run,
  }));
}
