import type { BinEdit, VfxField, VfxSystem, VfxValue } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import { type Leaf, leafEdits, mapLeaves } from "./systemWalk";

/** A whole-system adjustment: a hue turn and a scale. */
export interface SystemAdjust {
  /** The hue turn in degrees, 0 for the authored colors. */
  readonly hue: number;
  /** The factor every length takes, 1 for the authored sizes. */
  readonly scale: number;
}

export const NO_ADJUST: SystemAdjust = { hue: 0, scale: 1 };

type Kind = "color" | "length";

/** The fields that hold a tint, so `erosionMapChannelMixer` and the palette weights stay. */
const COLOR_FIELDS: ReadonlySet<string> = new Set(
  [
    "color",
    "birthColor",
    "colorModulate",
    "mAnimatedColorWithDistance",
    "SeparateLingerColor",
    "fresnelColor",
    "reflectionFresnelColor",
  ].map(nameHash),
);

/** The fields in world units, and in world units per second or per second squared. */
const LENGTH_FIELDS: ReadonlySet<string> = new Set(
  [
    "birthScale0",
    "birthVelocity",
    "velocity",
    "birthAcceleration",
    "acceleration",
    "worldAcceleration",
    "EmitterPosition",
    "translationOverride",
    "emissionMeshScale",
    "Size",
    "radius",
    "height",
    "emitOffset",
    "mBirthTilingSize",
    "mCutoff",
    "mLocalSpaceSourceOffset",
    "mLocalSpaceTargetOffset",
    "Position",
    "velocityDelta",
    "KeyedLingerVelocity",
    "KeyedLingerAcceleration",
    "mYRange",
    "visibilityRadius",
  ].map(nameHash),
);

const BIRTH_SCALE = nameHash("birthScale0");
const SCALE = nameHash("scale0");

/** Returns the kind of `field`. A particle's size is `birthScale0` times `scale0`, so `scale0` scales only without `birthScale0`. */
function pick(field: VfxField, fields: readonly VfxField[]): Kind | null {
  if (COLOR_FIELDS.has(field.hash)) return "color";
  if (LENGTH_FIELDS.has(field.hash)) return "length";
  if (field.hash === SCALE && !fields.some((each) => each.hash === BIRTH_SCALE)) return "length";
  return null;
}

/** Returns the color `values` with the hue turned by `degrees`. Alpha is unchanged. */
export function shiftHue(values: readonly number[], degrees: number): number[] {
  const [r, g, b, ...rest] = values;
  if (degrees % 360 === 0) return [...values];
  if (r === undefined || g === undefined || b === undefined) return [...values];

  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma === 0 || Math.min(r, g, b) < 0) return [...values];

  let hue: number;
  if (max === r) {
    hue = ((g - b) / chroma) % 6;
  } else if (max === g) {
    hue = (b - r) / chroma + 2;
  } else {
    hue = (r - g) / chroma + 4;
  }
  hue = (((hue + degrees / 60) % 6) + 6) % 6;

  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const low = max - chroma;
  const rgb = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][Math.floor(hue)] ?? [chroma, x, 0];
  return [...rgb.map((channel) => channel + low), ...rest];
}

function adjusted(adjust: SystemAdjust) {
  return (leaf: Leaf<Kind>): readonly number[] => {
    if (leaf.kind === "color") return shiftHue(leaf.values, adjust.hue);
    return leaf.values.map((each) => each * adjust.scale);
  };
}

/** Returns `root` with `adjust` applied to each tint and each length of the system. */
export function adjustedRoot(root: VfxValue, adjust: SystemAdjust): VfxValue {
  return mapLeaves(root, pick, adjusted(adjust));
}

/** Returns the edits that apply `adjust` to `system`. A value that the adjustment leaves equal takes no edit. */
export function adjustEdits(system: VfxSystem, adjust: SystemAdjust): BinEdit[] {
  return leafEdits(system.entry, system.root, pick, adjusted(adjust));
}

/** `true` if `adjust` changes nothing. */
export function isNoAdjust(adjust: SystemAdjust): boolean {
  return adjust.hue === 0 && adjust.scale === 1;
}
