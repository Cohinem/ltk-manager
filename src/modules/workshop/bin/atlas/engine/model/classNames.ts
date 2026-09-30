import { m } from "@/i18n";

/** The name an author knows each UI class by, keyed by the meta class it stands for. */
const ALIASES: ReadonlyMap<string, () => string> = new Map([
  ["UISceneData", m.workshop_bin_atlas_class_scene_label],
  ["UiSceneViewPaneData", m.workshop_bin_atlas_class_scroll_pane_label],
  ["UiElementIconData", m.workshop_bin_atlas_class_image_label],
  ["UiElementTextData", m.workshop_bin_atlas_class_text_label],
  ["UiElementRegionData", m.workshop_bin_atlas_class_region_label],
  ["UiElementScissorRegionData", m.workshop_bin_atlas_class_clip_region_label],
  ["UiElementParticleSystemData", m.workshop_bin_atlas_class_particles_label],
  ["UiElementSpineAnimationData", m.workshop_bin_atlas_class_spine_label],
  ["UiElementGroupData", m.workshop_bin_atlas_class_group_label],
  ["UiElementGroupButtonData", m.workshop_bin_atlas_class_button_label],
  ["UiElementGroupManagedLayoutData", m.workshop_bin_atlas_class_auto_layout_label],
  ["UiElementGroupFramedData", m.workshop_bin_atlas_class_framed_group_label],
  ["UiElementGroupSliderData", m.workshop_bin_atlas_class_slider_label],
  ["UiElementGroupMeterData", m.workshop_bin_atlas_class_meter_label],
  ["UiElementMeterSkin", m.workshop_bin_atlas_class_meter_skin_label],
  ["UiComboBoxDefinition", m.workshop_bin_atlas_class_dropdown_label],
  ["UiElementEffectAnimationData", m.workshop_bin_atlas_class_flipbook_label],
  ["UiElementEffectDesaturateData", m.workshop_bin_atlas_class_desaturate_label],
  ["UiElementEffectCircleMaskDesaturateData", m.workshop_bin_atlas_class_round_desaturate_label],
  ["UiElementEffectInstancedData", m.workshop_bin_atlas_class_instanced_label],
  ["UiElementEffectCooldownData", m.workshop_bin_atlas_class_cooldown_label],
  ["UiElementEffectCooldownRadialData", m.workshop_bin_atlas_class_cooldown_sweep_label],
  ["UiElementEffectCircleMaskCooldownData", m.workshop_bin_atlas_class_round_cooldown_label],
  ["UiElementEffectAmmoData", m.workshop_bin_atlas_class_ammo_label],
  ["UiElementEffectGlowData", m.workshop_bin_atlas_class_glow_label],
  ["UiElementEffectArcFillData", m.workshop_bin_atlas_class_arc_fill_label],
  ["UiElementEffectFillPercentageData", m.workshop_bin_atlas_class_fill_label],
  ["UiElementEffectLineData", m.workshop_bin_atlas_class_line_label],
  ["UiElementEffectRotatingIconData", m.workshop_bin_atlas_class_rotating_image_label],
  [
    "UiElementEffectAnimatedRotatingIconData",
    m.workshop_bin_atlas_class_animated_rotating_image_label,
  ],
  [
    "UiElementEffectGlowingRotatingIconData",
    m.workshop_bin_atlas_class_glowing_rotating_image_label,
  ],
]);

/**
 * The name the HUD editor shows for the class `name`, such as `Button` for
 * `UiElementGroupButtonData`, and the class as it stands where it has none, such as a hash no
 * table names.
 */
export function classAlias(name: string): string {
  return ALIASES.get(name)?.() ?? name;
}
