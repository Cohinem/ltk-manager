import { STENCIL_MODE } from "../engine/model/enums";
import type { EmitterModel, SystemModel } from "../engine/model/model";
import { STENCIL_BITS, stencilOf, type StencilUse } from "../rendering/utils/stencil";

/**
 * What an emitter does with a stencil mask, by its `stencilMode`: `writes` is WriteMask,
 * `inside` is TestEqual, `outside` is TestNotEqual and `writesOutside` is
 * WriteMaskIfTestNotEqual.
 */
export type MaskRole = "writes" | "inside" | "outside" | "writesOutside";

const ROLE: Record<StencilUse["mode"], MaskRole> = {
  [STENCIL_MODE.writeMask]: "writes",
  [STENCIL_MODE.testEqual]: "inside",
  [STENCIL_MODE.testNotEqual]: "outside",
  [STENCIL_MODE.writeMaskIfTestNotEqual]: "writesOutside",
};

/** The `stencilMode` each role is written as. */
export const ROLE_MODE: Record<MaskRole, StencilUse["mode"]> = {
  writes: STENCIL_MODE.writeMask,
  inside: STENCIL_MODE.testEqual,
  outside: STENCIL_MODE.testNotEqual,
  writesOutside: STENCIL_MODE.writeMaskIfTestNotEqual,
};

/** The role of an emitter with the stencil use `use`. */
export function roleOf(use: StencilUse): MaskRole {
  return ROLE[use.mode];
}

/** The role writes the mask's reference where the emitter draws. */
export function writesMask(role: MaskRole): boolean {
  return role === "writes" || role === "writesOutside";
}

/** The name of a mask: a `StencilReferenceId`, or a `stencilRef` modulo 64 where `id` is null. */
export interface MaskName {
  readonly id: string | null;
  readonly ref: number;
}

/** `name` as one string, equal for two names of the same mask. */
export function maskKey(name: MaskName): string {
  return name.id === null ? `ref:${name.ref & STENCIL_BITS}` : `id:${name.id.toLowerCase()}`;
}

/** One mask of a system and the emitters that use it. */
export interface StencilMask extends MaskName {
  readonly key: string;
  /** The emitters of mode 1 or 4, in list order. */
  readonly writers: readonly EmitterModel[];
  /** The emitters of mode 2 or 3, in list order. */
  readonly testers: readonly EmitterModel[];
}

/** The mask an emitter uses and its role in it. */
export interface MaskUse {
  readonly key: string;
  readonly name: MaskName;
  readonly role: MaskRole;
}

/** The mask `emitter` uses, and null for one that draws with no stencil state. */
export function maskUse(emitter: EmitterModel): MaskUse | null {
  const use = stencilOf(emitter);
  if (use === null) return null;

  const name = { id: use.id, ref: use.id === null ? use.ref & STENCIL_BITS : 0 };
  return { key: maskKey(name), name, role: roleOf(use) };
}

/**
 * The masks the emitters of `system` use: numbered masks in ascending order, then masks named
 * by a `StencilReferenceId` in the order the emitters list them.
 */
export function stencilMasks(system: SystemModel | null): StencilMask[] {
  const masks = new Map<
    string,
    { name: MaskName; writers: EmitterModel[]; testers: EmitterModel[] }
  >();

  for (const emitter of system?.emitters ?? []) {
    const use = maskUse(emitter);
    if (use === null) continue;

    let mask = masks.get(use.key);
    if (mask === undefined) {
      mask = { name: use.name, writers: [], testers: [] };
      masks.set(use.key, mask);
    }
    (writesMask(use.role) ? mask.writers : mask.testers).push(emitter);
  }

  return [...masks.entries()]
    .map(([key, { name, writers, testers }]) => ({ key, ...name, writers, testers }))
    .sort((left, right) => rank(left) - rank(right));
}

/** Numbered masks sort by their number, and every named mask after them. */
function rank(mask: MaskName): number {
  return mask.id === null ? mask.ref : STENCIL_BITS + 1;
}

/**
 * The lowest reference from 1 that no mask of `masks` uses, and null where all 63 are used.
 *
 * Zero is left out, because the buffer is cleared to it.
 */
export function freeReference(masks: readonly MaskName[]): number | null {
  const used = new Set(masks.filter((mask) => mask.id === null).map((mask) => mask.ref));
  for (let ref = 1; ref <= STENCIL_BITS; ref += 1) {
    if (!used.has(ref)) return ref;
  }
  return null;
}
