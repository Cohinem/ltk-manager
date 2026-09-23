import type { Texture } from "three";

import type { AssetRef, MaterialProgram } from "@/lib/tauri";

import type { SubmeshProgram } from "./programMaterial";

/** The key a pass texture is loaded under, one per material and shader texture name. */
export function programTextureKey(material: string, texture: string): string {
  return `program:${material}:${texture}`;
}

/**
 * Every texture a translated program samples and this machine holds, keyed for
 * [`programWith`].
 */
export function programTextureAssets(
  programs: readonly (MaterialProgram | null)[],
): Map<string, AssetRef> {
  const assets = new Map<string, AssetRef>();
  for (const program of programs) {
    if (program === null) continue;
    for (const pass of program.passes) {
      if (pass.program.kind !== "ready") continue;
      for (const texture of pass.pass.textures) {
        if (texture.texture?.asset) {
          assets.set(programTextureKey(program.hash, texture.name), texture.texture.asset);
        }
      }
    }
  }
  return assets;
}

/**
 * What draws under `program`: its first pass that translated with the textures of
 * `textures` it names, and null where no pass translated.
 */
export function programWith<T = Texture>(
  program: MaterialProgram | null,
  textures: ReadonlyMap<string, T>,
): SubmeshProgram<T> | null {
  if (program === null) return null;
  for (const pass of program.passes) {
    if (pass.program.kind !== "ready") continue;
    const held = new Map<string, T>();
    for (const texture of pass.pass.textures) {
      const loaded = textures.get(programTextureKey(program.hash, texture.name));
      if (loaded !== undefined) held.set(texture.name, loaded);
    }
    return { material: program.hash, pass: pass.pass, program: pass.program, textures: held };
  }
  return null;
}
