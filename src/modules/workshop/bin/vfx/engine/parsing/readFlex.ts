import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import type { FlexModel, FlexScale, FlexValue, ValueCurve } from "../model/model";
import { curve, DEFAULT, field, number } from "./readValue";

/** The flex fields of `VfxEmitterDefinitionData`, `VfxTextureMultDefinitionData` and the flex shape. */
const FLEX = {
  rate: nameHash("flexRate"),
  lifetime: nameHash("flexParticleLifetime"),
  velocity: nameHash("flexBirthVelocity"),
  rotationalVelocity: nameHash("flexBirthRotationalVelocity0"),
  uvScroll: nameHash("flexBirthUVScrollRate"),
  uvOffset: nameHash("flexBirthUVOffset"),
  birthScale: nameHash("flexScaleBirthScale"),
  instanceScale: nameHash("FlexInstanceScale"),
  textureMult: nameHash("textureMult"),
  uvScrollMult: nameHash("flexBirthUVScrollRateMult"),
  shape: nameHash("FlexShapeDefinition"),
  birthTranslation: nameHash("flexBirthTranslation"),
  emitOffsetScale: nameHash("flexScaleEmitOffset"),
} as const;

/** `FlexValueFloat` and its vector twins, and `FlexTypeFloat`, by their own fields. */
const VALUE = { channel: nameHash("mFlexID"), value: nameHash("mValue") } as const;

/**
 * Reads the flex fields of the emitter `node`, and returns null for an emitter writing none.
 *
 * Every field names its channel by `mFlexID`, which defaults to 0.
 */
export function readFlex(node: VfxValue): FlexModel | null {
  const shape = field(node, FLEX.shape);
  const flex: FlexModel = {
    rate: flexValue(field(node, FLEX.rate), DEFAULT.zero),
    lifetime: flexValue(field(node, FLEX.lifetime), DEFAULT.zero),
    velocity: flexValue(field(node, FLEX.velocity), DEFAULT.zero3),
    rotationalVelocity: flexValue(field(node, FLEX.rotationalVelocity), DEFAULT.zero3),
    uvScroll: flexValue(field(node, FLEX.uvScroll), DEFAULT.zero2),
    uvScrollMult: flexValue(field(field(node, FLEX.textureMult), FLEX.uvScrollMult), DEFAULT.zero2),
    uvOffset: flexValue(field(node, FLEX.uvOffset), DEFAULT.zero2),
    birthScale: flexScale(field(node, FLEX.birthScale)),
    instanceScale: flexScale(field(node, FLEX.instanceScale)),
    birthTranslation: flexValue(field(shape, FLEX.birthTranslation), DEFAULT.zero3),
    emitOffsetScale: flexScale(field(shape, FLEX.emitOffsetScale)),
  };

  return Object.values(flex).some((each) => each !== null) ? flex : null;
}

function flexValue(node: VfxValue | null, fallback: ValueCurve): FlexValue | null {
  if (node?.type !== "struct") return null;
  return {
    channel: number(field(node, VALUE.channel)) ?? 0,
    value: curve(field(node, VALUE.value), fallback),
  };
}

function flexScale(node: VfxValue | null): FlexScale | null {
  if (node?.type !== "struct") return null;
  return {
    channel: number(field(node, VALUE.channel)) ?? 0,
    value: number(field(node, VALUE.value)) ?? 0,
  };
}
