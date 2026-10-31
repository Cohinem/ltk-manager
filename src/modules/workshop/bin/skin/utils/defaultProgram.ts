import type { AssetRef, PassProgram, SkinModel, SkinnedShading } from "@/lib/tauri";
import type { SubmeshProgram } from "@/modules/viewport";

import {
  dataTextureAssets,
  NORMAL_TEXTURE,
  pbrKey,
  RMA_TEXTURE,
  shadingOf,
  submeshMaterial,
} from "./skinScene";

/** The colour texture `LIT_UBER` samples, as the pass read names it. */
export const DEFAULT_DIFFUSE = "DIFFUSE_MAP";

/** The emissive mask `LIT_UBER`'s base permutation samples, as the pass read names it. */
export const DEFAULT_EMISSIVE = "EMISSIVE_MAP";

/** The roughness map `LIT_UBER`'s physically based permutations sample. */
export const DEFAULT_RMA = "RMA_MAP";

/** The normal map `LIT_UBER`'s tangent permutation samples. */
export const DEFAULT_NORMAL = "NORMAL_MAP";

/** The key the skin's emissive texture loads under. */
export const EMISSIVE_KEY = "emissive";

/** The key the colour texture of a submesh no override names loads under. */
const BASE_KEY = "base";

/** The engine's default program of each permutation, and null for one not read yet. */
export type DefaultPrograms = Readonly<Record<SkinnedShading, PassProgram | null>>;

function overrideKey(submesh: string): string {
  return `submesh:${submesh.toLowerCase()}`;
}

/** Whether a submesh of `skin` draws with the engine's default program. */
export function drawsDefaultProgram(skin: SkinModel): boolean {
  return skin.material === null || skin.overrides.some((override) => override.material === null);
}

/** Every texture the default program draws `skin` with, keyed for `defaultProgramOf`. */
export function defaultProgramAssets(skin: SkinModel): Map<string, AssetRef> {
  const assets = new Map<string, AssetRef>();
  if (skin.texture?.asset) assets.set(BASE_KEY, skin.texture.asset);
  for (const override of skin.overrides) {
    if (override.material === null && override.texture?.asset) {
      assets.set(overrideKey(override.submesh), override.texture.asset);
    }
  }
  for (const [key, asset] of dataTextureAssets(skin)) assets.set(key, asset);
  return assets;
}

/**
 * The engine's default program for a `submesh` its skin names no material for, in the
 * permutation that the submesh's maps select, with the textures of that permutation.
 *
 * Null for a submesh a material covers, while the permutation's program is unread or
 * untranslated, and while a physically based permutation's roughness map is unloaded. Each
 * set of textures gets a separate material. A program material binds one texture per name.
 */
export function defaultProgramOf<T>(
  skin: SkinModel,
  programs: DefaultPrograms,
  textures: ReadonlyMap<string, T>,
  submesh: string,
  tangents: boolean,
): SubmeshProgram<T> | null {
  if (submeshMaterial(skin, submesh) !== null) return null;

  const shading = shadingOf(skin, submesh, tangents);
  const program = programs[shading];
  if (program === null || program.program.kind !== "ready") return null;

  const colourKey = textures.has(overrideKey(submesh)) ? overrideKey(submesh) : BASE_KEY;
  const bound = new Map<string, T>();
  const diffuse = textures.get(colourKey);
  if (diffuse !== undefined) bound.set(DEFAULT_DIFFUSE, diffuse);
  const keys = [colourKey];

  if (shading === "base") {
    const emissive = textures.get(EMISSIVE_KEY);
    if (emissive !== undefined) bound.set(DEFAULT_EMISSIVE, emissive);
  } else {
    const keyOf = (kind: string) =>
      textures.has(pbrKey(kind, submesh)) ? pbrKey(kind, submesh) : kind;
    const rmaKey = keyOf(RMA_TEXTURE);
    const rma = textures.get(rmaKey);
    if (rma === undefined) return null;

    bound.set(DEFAULT_RMA, rma);
    keys.push(rmaKey);

    const normalKey = keyOf(NORMAL_TEXTURE);
    const normal = textures.get(normalKey);
    if (shading === "roughnessMetallicNormal" && normal !== undefined) {
      bound.set(DEFAULT_NORMAL, normal);
      keys.push(normalKey);
    }
  }

  return {
    material: `${program.pass.shader ?? ""}:${keys.join(":")}`,
    index: 0,
    pass: program.pass,
    program: program.program,
    textures: bound,
  };
}
