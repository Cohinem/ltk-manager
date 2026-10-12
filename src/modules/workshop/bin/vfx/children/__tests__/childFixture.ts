import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { list, struct } from "../../engine/drivers/__tests__/driverFixture";
import { type AuthoredChildSet, authoredChildSet } from "../childModel";

export const hex = (name: string) => nameHash(name).slice(2);

/** The hash path of the first complex emitter, which every fixture set sits under. */
export const EMITTER = `${hex("complexEmitterDefinitionData")}[0]`;

/** The hash path of the fixture emitter's child set. */
export const SET = `${EMITTER}.${hex("childParticleSetDefinition")}`;

export function text(value: string): VfxValue {
  return { type: "string", value };
}

/** A complex emitter named `name`, with `fields` beside its name. */
export function emitter(name: string, fields: Record<string, VfxValue> = {}): VfxValue {
  return struct("VfxEmitterDefinitionData", { emitterName: text(name), ...fields });
}

/** A system the resolver inlined from the object `entry`, with `emitters`. */
export function inlined(entry: string, name: string | null, ...emitters: VfxValue[]): VfxValue {
  const system = struct("VfxSystemDefinitionData", {
    complexEmitterDefinitionData: list(...emitters),
  });
  return { ...system, object: { entry, name } } as VfxValue;
}

/** A `VfxChildIdentifier` naming its system through `field`. */
export function identifier(field: "effect" | "effectKey", target: VfxValue): VfxValue {
  return struct("VfxChildIdentifier", { [field]: target });
}

/** A child set of `children`, with `fields` beside its identifier list. */
export function childSet(children: VfxValue[], fields: Record<string, VfxValue> = {}): VfxValue {
  return struct("VfxChildParticleSetDefinitionData", {
    childrenIdentifiers: list(...children),
    ...fields,
  });
}

/** The fixture emitter's child set as the editor reads `set`, and an unwritten one for null. */
export function authored(set: VfxValue | null): AuthoredChildSet {
  const fields: Record<string, VfxValue> = set === null ? {} : { childParticleSetDefinition: set };
  return authoredChildSet(emitter("Orb", fields), EMITTER);
}

export const SPARKS = inlined("0x00000011", "Particles/Sparks_Child", emitter("Spark"));
export const SMOKE = inlined("0x00000022", "Particles/Smoke_Child", emitter("Smoke"));
