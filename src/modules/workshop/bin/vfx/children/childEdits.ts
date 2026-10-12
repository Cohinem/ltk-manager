import type { ValueEdit } from "@/lib/tauri";

import {
  type AuthoredChildSet,
  CHILD_FIELD,
  CHILD_IDENTIFIER_CLASS,
  CHILD_SET_CLASS,
} from "./childModel";

const CHILDREN = CHILD_FIELD.children.slice(2);
const BONES = CHILD_FIELD.bones.slice(2);

const SET_POINTER: ValueEdit = { type: "ensurePointer", path: "", class: CHILD_SET_CLASS };
const NEW_BONE: ValueEdit = {
  type: "insertItem",
  path: BONES,
  item: { index: null, key: null, class: null },
};

/**
 * The edits under `childParticleSetDefinition` that append a child linking the system `entry`.
 *
 * They write the set where the emitter has none, and a set that writes bones takes an empty
 * bone for the child, so `boneToSpawnAt` stays as long as the children.
 */
export function addChildEdits(set: AuthoredChildSet, entry: string): ValueEdit[] {
  const index = set.children.length;
  const item = `${CHILDREN}[${index}]`;
  const field = CHILD_FIELD.effect;
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
      value: { type: "objectLink", text: entry },
    },
  ];

  if (set.bones.length > 0) edits.push(...bonesUpTo(set, index + 1));
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

/**
 * The edits that write `bone` as the bone of the child at `index`, with an empty bone for every
 * child the list does not reach, since a list shorter than the children spawns nothing.
 *
 * Null where the write leaves every bone empty. The caller then removes `boneToSpawnAt`, because
 * a list of empty bones still spawns every child at a bone and finds none.
 */
export function boneEdits(set: AuthoredChildSet, index: number, bone: string): ValueEdit[] | null {
  const others = set.bones.filter((_, at) => at !== index);
  if (bone === "" && others.every((each) => each === "")) return null;

  return [
    ...bonesUpTo(set, Math.max(index + 1, set.children.length)),
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
