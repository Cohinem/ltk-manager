import type { ValueEdit } from "@/lib/tauri";

import {
  type AuthoredChildSet,
  CHILD_FIELD,
  CHILD_IDENTIFIER_CLASS,
  CHILD_SET_CLASS,
} from "./childModel";

/** What a new `VfxChildIdentifier` names: a system by its entry, or an effect key by its hash. */
export type ChildTarget =
  | { readonly naming: "link"; readonly entry: string }
  | { readonly naming: "key"; readonly key: string };

const CHILDREN = CHILD_FIELD.children.slice(2);
const BONES = CHILD_FIELD.bones.slice(2);

const SET_POINTER: ValueEdit = { type: "ensurePointer", path: "", class: CHILD_SET_CLASS };
const NEW_BONE: ValueEdit = {
  type: "insertItem",
  path: BONES,
  item: { index: null, key: null, class: null },
};

/**
 * The edits under `childParticleSetDefinition` that append a child naming `target`.
 *
 * They write the set where the emitter has none, and a bone set takes an empty bone for the
 * child, so `boneToSpawnAt` stays as long as the children.
 */
export function addChildEdits(set: AuthoredChildSet, target: ChildTarget): ValueEdit[] {
  const index = set.children.length;
  const item = `${CHILDREN}[${index}]`;
  const field = target.naming === "link" ? CHILD_FIELD.effect : CHILD_FIELD.effectKey;
  const edits: ValueEdit[] = [
    SET_POINTER,
    { type: "ensureProperty", path: "", field: CHILD_FIELD.children },
    {
      type: "insertItem",
      path: CHILDREN,
      item: { index: null, key: null, class: CHILD_IDENTIFIER_CLASS },
    },
    { type: "ensureProperty", path: item, field },
    {
      type: "setLeaf",
      path: `${item}.${field.slice(2)}`,
      value:
        target.naming === "link"
          ? { type: "objectLink", text: target.entry }
          : { type: "hash", text: target.key },
    },
  ];

  if (set.mode === "bones") edits.push(...bonesUpTo(set, index + 1));
  return edits;
}

/** The edits that remove the child at `index`, and its bone where the set writes one. */
export function removeChildEdits(set: AuthoredChildSet, index: number): ValueEdit[] {
  const edits: ValueEdit[] = [{ type: "removeItem", path: `${CHILDREN}[${index}]` }];
  if (index < set.bones.length) edits.push({ type: "removeItem", path: `${BONES}[${index}]` });
  return edits;
}

/** The edits that move the child at `from` to `to`, and its bone with it. */
export function moveChildEdits(set: AuthoredChildSet, from: number, to: number): ValueEdit[] {
  const edits = moveEdits(CHILDREN, from, to);
  if (Math.max(from, to) < set.bones.length) edits.push(...moveEdits(BONES, from, to));
  return edits;
}

/** A copy of item `from` of `list` landed at `to`, then the original removed. */
function moveEdits(list: string, from: number, to: number): ValueEdit[] {
  return [
    {
      type: "copyItem",
      from: `${list}[${from}]`,
      path: list,
      index: to > from ? to + 1 : to,
      unique: null,
    },
    { type: "removeItem", path: `${list}[${to > from ? from : from + 1}]` },
  ];
}

/** The edits that turn the set into a bone set: an empty bone for every child without one. */
export function boneModeEdits(set: AuthoredChildSet): ValueEdit[] {
  return [SET_POINTER, ...bonesUpTo(set, Math.max(set.children.length, 1))];
}

/** The edits that write `bone` as the bone of the child at `index`. */
export function boneEdits(set: AuthoredChildSet, index: number, bone: string): ValueEdit[] {
  return [
    ...bonesUpTo(set, index + 1),
    { type: "setLeaf", path: `${BONES}[${index}]`, value: { type: "string", value: bone } },
  ];
}

/** `boneToSpawnAt` written and grown with empty bones until it has `count` items. */
function bonesUpTo(set: AuthoredChildSet, count: number): ValueEdit[] {
  const missing = Math.max(0, count - set.bones.length);
  return [
    { type: "ensureProperty", path: "", field: CHILD_FIELD.bones },
    ...Array.from({ length: missing }, () => NEW_BONE),
  ];
}
