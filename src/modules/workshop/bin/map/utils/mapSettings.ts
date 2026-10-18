import { m } from "@/i18n";
import type { BinRow } from "@/lib/tauri";

import { hashOf, nameHash } from "../../shared/utils/binHash";

/** `MapContainer.components`, eight hex digits as a hash path writes a field. */
export const COMPONENTS_STEP = nameHash("components").slice(2);

/** The object a section part reads its fields from. */
export type PartOwner = "container" | "skin" | "map";

/**
 * One block of fields in a section: the fields of the `owner` object, or of the first
 * `component` of the container's `components`. `fields` limits the rows to the named fields,
 * `exclude` drops rows whose field name starts with one of its prefixes, and `only` keeps only
 * those rows. A `removable` component has a Remove button in its section's header.
 */
export interface SectionPart {
  readonly owner: PartOwner;
  readonly component?: string;
  readonly fields?: readonly string[];
  readonly exclude?: readonly string[];
  readonly only?: readonly string[];
  readonly removable?: boolean;
}

/** A titled group of fields that the Lighting pane or the map settings show. */
export interface SettingsSection {
  readonly id: string;
  readonly title: () => string;
  readonly parts: readonly SectionPart[];
}

/** The sections of the Lighting pane. Per "Lighting" in docs/ux/MAP_EDITOR.md. */
export const LIGHTING_SECTIONS: readonly SettingsSection[] = [
  {
    id: "sun",
    title: m.workshop_bin_map_lighting_sun_label,
    parts: [{ owner: "container", component: "MapSunProperties", exclude: ["fog"] }],
  },
  {
    id: "fog",
    title: m.workshop_bin_map_lighting_fog_label,
    parts: [{ owner: "container", component: "MapSunProperties", only: ["fog"] }],
  },
  {
    id: "sky",
    title: m.workshop_bin_map_lighting_sky_label,
    parts: [{ owner: "skin", fields: ["0xd0a4e40b"] }],
  },
  {
    id: "color",
    title: m.workshop_bin_map_lighting_color_label,
    parts: [{ owner: "skin", fields: ["mColorizationPostEffect", "GammaParameters"] }],
  },
  {
    id: "post",
    title: m.workshop_bin_map_lighting_post_label,
    parts: [{ owner: "container", component: "0x50db156b" }],
  },
  {
    id: "shadows",
    title: m.workshop_bin_map_lighting_shadows_label,
    parts: [{ owner: "skin", fields: ["ShadowsEnabled"] }],
  },
  {
    id: "clouds",
    title: m.workshop_bin_map_lighting_clouds_label,
    parts: [{ owner: "container", component: "MapClouds" }],
  },
  {
    id: "dynamic",
    title: m.workshop_bin_map_lighting_dynamic_label,
    parts: [{ owner: "container", component: "MapDynamicLighting", removable: true }],
  },
  {
    id: "regions",
    title: m.workshop_bin_map_lighting_regions_label,
    parts: [{ owner: "container", component: "MapLightRegions" }],
  },
  {
    id: "grid",
    title: m.workshop_bin_map_lighting_grid_label,
    parts: [{ owner: "container", component: "MapBakeProperties" }],
  },
  {
    id: "lightingV2",
    title: m.workshop_bin_map_lighting_v2_label,
    parts: [{ owner: "container", component: "MapLightingV2" }],
  },
  {
    id: "ssao",
    title: m.workshop_bin_map_lighting_ssao_label,
    parts: [{ owner: "container", component: "MapSSAO" }],
  },
  {
    id: "antiAliasing",
    title: m.workshop_bin_map_lighting_anti_aliasing_label,
    parts: [{ owner: "container", component: "MapAntiAliasing" }],
  },
];

/** The sections of the map settings. Per "Map settings" in docs/ux/MAP_EDITOR.md. */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: "container",
    title: m.workshop_bin_map_settings_container_label,
    parts: [
      {
        owner: "container",
        fields: ["mapPath", "boundsMin", "boundsMax", "components"],
      },
    ],
  },
  {
    id: "skin",
    title: m.workshop_bin_map_settings_skin_label,
    parts: [
      {
        owner: "skin",
        fields: [
          "MaterialSwap",
          "mResourceResolvers",
          "mObjectSkinFallbacks",
          "0x2d3285eb",
          "WorldParticles",
          "mAlternateAssets",
        ],
      },
    ],
  },
  {
    id: "audio",
    title: m.workshop_bin_map_settings_audio_label,
    parts: [{ owner: "container", component: "MapThemeMusic" }],
  },
  {
    id: "fogOfWar",
    title: m.workshop_bin_map_settings_fog_of_war_label,
    parts: [{ owner: "map", fields: ["FogOfWarProperties"] }],
  },
  {
    id: "minimap",
    title: m.workshop_bin_map_settings_minimap_label,
    parts: [
      { owner: "skin", fields: ["mMinimapBackgroundConfig"] },
      { owner: "container", component: "MapMinimap" },
    ],
  },
  {
    id: "flags",
    title: m.workshop_bin_map_settings_flags_label,
    parts: [
      {
        owner: "map",
        fields: ["VisibilityFlagDefines", "InitialVisibilityMask"],
      },
    ],
  },
  {
    id: "dependencies",
    title: m.workshop_bin_map_settings_dependencies_label,
    parts: [{ owner: "map", fields: ["WadDependencies"] }],
  },
];

/** The field of `row`, eight hex digits, which is the last field segment of its path. */
function fieldOf(row: BinRow): string {
  return row.path.slice(-8);
}

/**
 * Returns the rows of `rows` that `part` shows, in the order of `part.fields` where it lists
 * fields, and in their own order otherwise.
 */
export function partRows(rows: readonly BinRow[], part: SectionPart): BinRow[] {
  if (part.fields !== undefined) {
    const byField = new Map(rows.map((row) => [fieldOf(row), row]));
    return part.fields.flatMap((field) => {
      const row = byField.get(hashOf(field).slice(2));
      return row === undefined ? [] : [row];
    });
  }

  const prefixed = (row: BinRow, prefixes: readonly string[]) =>
    prefixes.some((prefix) => row.name.toLowerCase().startsWith(prefix));
  return rows.filter(
    (row) =>
      (part.only === undefined || prefixed(row, part.only)) &&
      (part.exclude === undefined || !prefixed(row, part.exclude)),
  );
}

/** Returns the fields that `part` lists and `rows` does not contain. */
export function missingFields(rows: readonly BinRow[], part: SectionPart): string[] {
  if (part.fields === undefined) return [];

  const present = new Set(rows.map(fieldOf));
  return part.fields.filter((field) => !present.has(hashOf(field).slice(2)));
}

/**
 * Returns the first item of `components` whose class is `component`, and null if no item has
 * that class. The client reads only the first component of each class.
 */
export function componentRow(components: readonly BinRow[], component: string): BinRow | null {
  const hash = hashOf(component);
  return (
    components.find((row) => row.value.type === "struct" && row.value.classHash === hash) ?? null
  );
}
