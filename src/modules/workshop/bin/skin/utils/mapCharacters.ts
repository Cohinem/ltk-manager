import type { MapCharacter } from "@/lib/tauri";
import { AXIS_SIGN } from "@/modules/viewport";

/** The team a jungle camp stands for, which the game spawns on a timer rather than at load. */
const NEUTRAL_TEAM = 300;

/** Where the game keeps a skin's bin, under the skin's own entry path. */
const DATA_PREFIX = "data/";
const BIN_SUFFIX = ".bin";

/**
 * The characters of `characters` a backdrop stands on `layer`: structures and level props.
 *
 * A camp's monsters are left out, because the map places every one it could ever spawn,
 * seven dragons to a pit. So is whatever a visibility controller turns on, which is an
 * event the backdrop is not in.
 */
export function stoodCharacters(
  characters: readonly MapCharacter[],
  layer: number,
): MapCharacter[] {
  const bit = 1 << layer;
  return characters.filter(
    (character) =>
      (character.visibility & bit) !== 0 &&
      character.controller === null &&
      character.team !== NEUTRAL_TEAM,
  );
}

/** `characters` under the skin each wears, in the order a skin is first met. */
export function charactersBySkin(
  characters: readonly MapCharacter[],
): Map<string, readonly MapCharacter[]> {
  const held = new Map<string, MapCharacter[]>();
  for (const character of characters) {
    const group = held.get(character.skin);
    if (group === undefined) held.set(character.skin, [character]);
    else group.push(character);
  }
  return held;
}

/** The file a skin's entry path lives in: `Characters/Turret/Skins/Skin0` under `data/`. */
export function skinFile(skin: string): string {
  return `${DATA_PREFIX}${skin.toLowerCase()}${BIN_SUFFIX}`;
}

/**
 * A placeable's transform as the matrix of the group a `Character` is drawn under.
 *
 * A character mirrors itself across the scene's one flipped axis, so the group carries
 * the transform conjugated by that mirror rather than the map's own. Column major, as
 * `Matrix4.fromArray` reads one.
 */
export function sceneMatrix(transform: readonly (number | null)[]): number[] {
  const sign = [...AXIS_SIGN, 1];
  return transform.map((value, at) => (value ?? 0) * sign[at % 4] * sign[Math.floor(at / 4)]);
}
