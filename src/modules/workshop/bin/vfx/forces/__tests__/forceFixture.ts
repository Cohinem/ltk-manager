import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { readVfxSystem } from "../../engine/parsing/readVfxSystem";
import { emitterOf, flat } from "../../engine/simulation/__tests__/emitterFixture";
import { authoredForces, FORCE_DEFINITIONS, forceRow, type ForceKind } from "../forceModel";

export function struct(name: string, fields: Record<string, VfxValue> = {}): VfxValue {
  return {
    type: "struct",
    class: name,
    classHash: nameHash(name),
    object: null,
    fields: Object.entries(fields).map(([name, value]) => ({ name, hash: nameHash(name), value })),
  };
}

export function forceOf(kind: ForceKind, fields: Record<string, VfxValue> = {}) {
  const definition = FORCE_DEFINITIONS.find((definition) => definition.kind === kind)!;
  const collection = struct("VfxFieldCollectionDefinitionData", {
    [definition.list]: { type: "container", items: [struct(definition.className, fields)] },
  });
  const parent = forceRow(
    "0x12345678",
    "868eb76a[0].ae4f2c3a",
    "fieldCollectionDefinition",
    collection,
  );

  return authoredForces(collection, parent, 0)[0];
}

export function vector(...values: number[]): VfxValue {
  return struct("ValueVector3", { constantValue: { type: "vector", values } });
}

export function forceSystem() {
  const system = readVfxSystem({
    entry: "0x12345678",
    name: null,
    class: "VfxSystemDefinitionData",
    classHash: nameHash("VfxSystemDefinitionData"),
    root: struct("VfxSystemDefinitionData"),
  });
  const emitter = emitterOf(0, {
    fields: {
      acceleration: [{ acceleration: flat(3, 4, 5), localSpace: true }],
      attraction: [{ position: flat(1, 2, 3), radius: flat(20), acceleration: flat(6) }],
      noise: [0, 1].map(() => ({
        position: flat(0, 0, 0),
        radius: flat(40),
        velocityDelta: flat(4),
        frequency: flat(5),
        axisFraction: [1, 1, 1] as const,
      })),
      drag: [{ position: flat(0, 0, 0), radius: flat(50), strength: flat(2) }],
      orbital: [{ direction: flat(0, 1, 0), localSpace: true }],
    },
  });

  return { ...system, emitters: [emitter] };
}
