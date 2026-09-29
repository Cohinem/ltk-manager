import { m } from "@/i18n";
import type { VfxTemplate } from "@/lib/tauri";

/** A template's title and the line under it, by the catalog's id. */
const TEXT: Record<string, { readonly label: () => string; readonly description: () => string }> = {
  glow: {
    label: m.workshop_bin_vfx_template_glow_label,
    description: m.workshop_bin_vfx_template_glow_description,
  },
  sparks: {
    label: m.workshop_bin_vfx_template_sparks_label,
    description: m.workshop_bin_vfx_template_sparks_description,
  },
  smoke_puff: {
    label: m.workshop_bin_vfx_template_smoke_puff_label,
    description: m.workshop_bin_vfx_template_smoke_puff_description,
  },
  shockwave_ring: {
    label: m.workshop_bin_vfx_template_shockwave_ring_label,
    description: m.workshop_bin_vfx_template_shockwave_ring_description,
  },
  trail: {
    label: m.workshop_bin_vfx_template_trail_label,
    description: m.workshop_bin_vfx_template_trail_description,
  },
  distortion: {
    label: m.workshop_bin_vfx_template_distortion_label,
    description: m.workshop_bin_vfx_template_distortion_description,
  },
  explosion: {
    label: m.workshop_bin_vfx_template_explosion_label,
    description: m.workshop_bin_vfx_template_explosion_description,
  },
  missile: {
    label: m.workshop_bin_vfx_template_missile_label,
    description: m.workshop_bin_vfx_template_missile_description,
  },
  aura: {
    label: m.workshop_bin_vfx_template_aura_label,
    description: m.workshop_bin_vfx_template_aura_description,
  },
};

/** A template's title, and its English name for an id the messages do not know. */
export function templateLabel(template: VfxTemplate): string {
  return TEXT[template.id]?.label() ?? template.name;
}

/** The line that says what a template draws, and none for an id the messages do not know. */
export function templateDescription(template: VfxTemplate): string | null {
  return TEXT[template.id]?.description() ?? null;
}
