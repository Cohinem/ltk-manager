import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import type { ValueCurve } from "../engine/model/model";
import { curve, field, text, texts } from "../engine/parsing/readValue";

/** The emitter field of its child set, `VfxChildParticleSetDefinitionData`. */
export const CHILD_SET = nameHash("childParticleSetDefinition");

export const CHILD_SET_CLASS = "VfxChildParticleSetDefinitionData";
export const CHILD_IDENTIFIER_CLASS = "VfxChildIdentifier";

/** The fields of a child set and of a `VfxChildIdentifier`, by hash. */
export const CHILD_FIELD = {
  children: nameHash("childrenIdentifiers"),
  bones: nameHash("boneToSpawnAt"),
  probability: nameHash("childrenProbability"),
  onDeath: nameHash("childEmitOnDeath"),
  inheritance: nameHash("ParentInheritanceDefinition"),
  effect: nameHash("effect"),
  effectKey: nameHash("effectKey"),
} as const;

/** The fields of a set a Children node and the Children section list, in order. */
export const CHILD_SET_ROWS = [
  CHILD_FIELD.onDeath,
  CHILD_FIELD.probability,
  CHILD_FIELD.inheritance,
] as const;

const EMITTER_LISTS = [
  { hash: nameHash("complexEmitterDefinitionData"), simple: false },
  { hash: nameHash("simpleEmitterDefinitionData"), simple: true },
] as const;

const EMITTER_NAME = nameHash("emitterName");

const FLAT: ValueCurve = { constant: [0], keys: [], tables: [] };

/** How a `VfxChildIdentifier` names its system: the `effect` link, or the `effectKey` hash. */
export type ChildNaming = "link" | "key";

/** One emitter of a child system, as a system node lists it. */
export interface ChildEmitter {
  readonly name: string;
  readonly simple: boolean;
  /** Its place in its own list. */
  readonly listIndex: number;
  /** How many children its own set names. */
  readonly children: number;
}

/** One `VfxChildIdentifier` of a set. */
export interface AuthoredChild {
  /** Its place in `childrenIdentifiers`, which is its slot in the run's child paths. */
  readonly index: number;
  /** Null for an identifier that writes neither field. */
  readonly naming: ChildNaming | null;
  /** The system the resolver inlined, and null for a child it did not reach. */
  readonly system: { readonly entry: string; readonly name: string | null } | null;
  /** The system's path, else the link or the key as the file names it. */
  readonly label: string;
  /** Its entry of `boneToSpawnAt`, and null where the list is shorter. */
  readonly bone: string | null;
  /** The identifier's hash path under the system object. */
  readonly hashPath: string;
  readonly emitters: readonly ChildEmitter[];
}

/** An emitter's child set as the file writes it. */
export interface AuthoredChildSet {
  /** The set's hash path under the system object, whether or not the file writes it. */
  readonly hashPath: string;
  readonly authored: boolean;
  /** How many fields the set writes, which a read of its rows asks for. */
  readonly fields: number;
  readonly children: readonly AuthoredChild[];
  /**
   * `boneToSpawnAt`, parallel to the children. With no bone a particle spawns the one child
   * `childrenProbability` indexes, and with any it spawns every child at its own bone.
   */
  readonly bones: readonly string[];
  /** `childrenProbability` is read: several children and no bones. */
  readonly probabilityRead: boolean;
  /** The child a constant `childrenProbability` indexes, and null for a keyed, random or unread one. */
  readonly picked: number | null;
  /** The set writes bones, and fewer than it has children, so it spawns none. */
  readonly starved: boolean;
}

/** A `0x` hash as a hash path writes it: its eight hex digits. */
function hex(hash: string): string {
  return hash.slice(2);
}

/** The child set of the emitter `emitter` at hash path `emitterPath`. */
export function authoredChildSet(emitter: VfxValue | null, emitterPath: string): AuthoredChildSet {
  const hashPath = `${emitterPath}.${hex(CHILD_SET)}`;
  const set = field(emitter, CHILD_SET);
  const listed = field(set, CHILD_FIELD.children);
  const bones = texts(field(set, CHILD_FIELD.bones));
  const items = listed?.type === "container" ? listed.items : [];
  const children = items.map((item, index) =>
    childOf(
      item,
      index,
      bones[index] ?? null,
      `${hashPath}.${hex(CHILD_FIELD.children)}[${index}]`,
    ),
  );

  const probabilityRead = bones.length === 0 && children.length > 1;
  const probability = curve(field(set, CHILD_FIELD.probability), FLAT);
  const constant = probability.keys.length === 0 && probability.tables.length === 0;

  return {
    hashPath,
    authored: set?.type === "struct",
    fields: set?.type === "struct" ? set.fields.length : 0,
    children,
    bones,
    probabilityRead,
    picked: probabilityRead && constant ? pickedIndex(probability, children.length) : null,
    starved: bones.length > 0 && bones.length < children.length,
  };
}

/** `max(0, value) % count`, as `childIndex` reads a set's probability. */
function pickedIndex(probability: ValueCurve, count: number): number {
  return Math.trunc(Math.max(0, probability.constant[0] ?? 0)) % count;
}

function childOf(
  identifier: VfxValue,
  index: number,
  bone: string | null,
  hashPath: string,
): AuthoredChild {
  const link = field(identifier, CHILD_FIELD.effect);
  const key = field(identifier, CHILD_FIELD.effectKey);
  const target = link ?? key;
  let naming: ChildNaming | null = null;
  if (link !== null) naming = "link";
  else if (key !== null) naming = "key";

  const system = target?.type === "struct" && target.object !== null ? target.object : null;

  return {
    index,
    naming,
    system,
    label: system?.name ?? system?.entry ?? targetText(target),
    bone,
    hashPath,
    emitters: system === null ? [] : emittersOf(target),
  };
}

/** A link or a key the resolver left in place, as the file names it. */
function targetText(target: VfxValue | null): string {
  if (target?.type === "link" || target?.type === "hash") return target.name ?? target.hash;
  return "";
}

function emittersOf(system: VfxValue | null): ChildEmitter[] {
  return EMITTER_LISTS.flatMap(({ hash, simple }) => {
    const list = field(system, hash);
    if (list?.type !== "container") return [];

    return list.items.map((emitter, listIndex) => {
      const nested = field(field(emitter, CHILD_SET), CHILD_FIELD.children);
      return {
        name: text(field(emitter, EMITTER_NAME)) ?? `[${listIndex}]`,
        simple,
        listIndex,
        children: nested?.type === "container" ? nested.items.length : 0,
      };
    });
  });
}

/** The last segment of a system's path, which names it in a row. */
export function systemLeaf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
