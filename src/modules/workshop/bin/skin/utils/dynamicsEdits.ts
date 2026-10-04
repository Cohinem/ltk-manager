import type { JointTreeGroup, LeafValue, SkinModel, Socket, ValueEdit } from "@/lib/tauri";
import type { ChainParameter, Pose } from "@/modules/viewport";

import {
  CHAIN_CLASS,
  CHAIN_PROPERTIES,
  CURVE,
  CURVE_CLASS,
  CURVE_TIMES,
  CURVE_VALUES,
  FIELD,
  GROUP_CLASS,
  JOINT_TREES,
  MESH_PROPERTIES,
  NAME,
  ORIENTATION_CLASS,
  PARAMETER_FIELD,
  POSE_MODIFIERS,
  SOCKET_CLASS,
  SOCKETS,
  SPRING_CLASS,
  TREE_CLASS,
  TREE_EXCLUDED,
  TREE_GROUPS,
  TREE_ROOT,
} from "./dynamicsFields";
import type { WireChain } from "./dynamicsModel";

/** A field's hash as a hash path writes it: eight hex digits without the `0x`. */
function segment(field: string): string {
  return field.slice(2);
}

/** `path` one field further. */
export function under(path: string, field: string): string {
  return path === "" ? segment(field) : `${path}.${segment(field)}`;
}

/**
 * A hash path of the skin object as the staged edits take it: relative to
 * `skinMeshProperties`, which every path the typed read hands out starts with.
 */
export function relative(path: string): string {
  const mesh = segment(MESH_PROPERTIES);
  if (path === mesh) return "";
  return path.startsWith(`${mesh}.`) ? path.slice(mesh.length + 1) : path;
}

/** A path relative to `skinMeshProperties` as the hash path of the skin object a row is read at. */
export function meshPath(path: string): string {
  const mesh = segment(MESH_PROPERTIES);
  return path === "" ? mesh : `${mesh}.${path}`;
}

/** The index of the list item a hash path ends in, and -1 for a path ending in none. */
function itemIndex(path: string): number {
  const match = /\[(\d+)\]$/.exec(path);
  return match === null ? -1 : Number(match[1]);
}

/** One past the last index the items at `paths` hold, which is where a new item goes. */
function nextIndex(paths: readonly string[]): number {
  return Math.max(-1, ...paths.map(itemIndex)) + 1;
}

/**
 * The edits that set the leaf under `fields`, a chain of fields down from the struct at
 * `path`, adding each field the file leaves at its default on the way.
 */
export function setLeafEdits(
  path: string,
  fields: readonly string[],
  value: LeafValue,
): ValueEdit[] {
  const edits: ValueEdit[] = [];
  let at = relative(path);
  for (const field of fields) {
    edits.push({ type: "ensureProperty", path: at, field });
    at = under(at, field);
  }
  edits.push({ type: "setLeaf", path: at, value });
  return edits;
}

export function float(value: number): LeafValue {
  return { type: "float", value };
}

export function bool(value: boolean): LeafValue {
  return { type: "bool", value };
}

/**
 * The edits that turn the curve of `parameter` on or off on the group at `group`.
 *
 * A parameter turned on with no curve gains a flat one at 1 from the root to the tip, so
 * turning it on changes nothing until a key is moved.
 */
export function parameterCurveEdits(
  group: string,
  parameter: ChainParameter,
  on: boolean,
  hasCurve: boolean,
): ValueEdit[] {
  const fields = [CHAIN_PROPERTIES, PARAMETER_FIELD[parameter]];
  const edits = setLeafEdits(group, [...fields, FIELD.useCurve], bool(on));
  if (!on || hasCurve) return edits;

  const scaled = fields.reduce(under, relative(group));
  const curve = under(scaled, CURVE);
  edits.push(
    { type: "ensureProperty", path: scaled, field: CURVE },
    { type: "ensurePointer", path: curve, class: CURVE_CLASS },
    { type: "ensureProperty", path: curve, field: CURVE_TIMES },
    { type: "ensureProperty", path: curve, field: CURVE_VALUES },
  );
  for (const [index, time] of [0, 1].entries()) {
    const item = { index, key: null, class: null };
    edits.push(
      { type: "insertItem", path: under(curve, CURVE_TIMES), item },
      {
        type: "setLeaf",
        path: `${under(curve, CURVE_TIMES)}[${index}]`,
        value: float(time),
      },
      { type: "insertItem", path: under(curve, CURVE_VALUES), item },
      {
        type: "setLeaf",
        path: `${under(curve, CURVE_VALUES)}[${index}]`,
        value: float(1),
      },
    );
  }
  return edits;
}

/** Where a joint a reader simulates from lands: a new tree of an existing group, or a new group. */
export type TreeTarget =
  | { readonly kind: "group"; readonly group: JointTreeGroup }
  | { readonly kind: "newGroup"; readonly chain: WireChain }
  | { readonly kind: "newChain" };

/** The dynamics chain a new tree joins: the skin's first, and none for a skin with none. */
export function firstChain(skin: SkinModel): WireChain | null {
  return (
    skin.poseModifiers.find(
      (modifier): modifier is WireChain => modifier.kind === "dynamicsChain",
    ) ?? null
  );
}

/**
 * The edits that simulate everything under `joint`: a tree rooted on it, in `target`.
 *
 * A skin with no dynamics chain gains one, and a chain with no group gains one, so the
 * first joint a reader simulates from is one edit.
 */
export function simulateFromEdits(skin: SkinModel, joint: string, target: TreeTarget): ValueEdit[] {
  const edits: ValueEdit[] = [];
  let group: string;
  let tree = 0;

  if (target.kind === "group") {
    group = relative(target.group.path);
    tree = nextIndex(target.group.trees.map((each) => each.path));
  } else {
    let chain: string;
    let groups = 0;
    if (target.kind === "newChain") {
      const index = nextIndex(skin.poseModifiers.map((modifier) => modifier.path));
      const list = segment(POSE_MODIFIERS);
      chain = `${list}[${index}]`;
      edits.push(
        { type: "ensureProperty", path: "", field: POSE_MODIFIERS },
        {
          type: "insertItem",
          path: list,
          item: { index, key: null, class: CHAIN_CLASS },
        },
      );
    } else {
      chain = relative(target.chain.path);
      groups = nextIndex(target.chain.groups.map((each) => each.path));
    }

    const list = under(chain, TREE_GROUPS);
    group = `${list}[${groups}]`;
    edits.push(
      { type: "ensureProperty", path: chain, field: TREE_GROUPS },
      {
        type: "insertItem",
        path: list,
        item: { index: groups, key: null, class: GROUP_CLASS },
      },
    );
  }

  const trees = under(group, JOINT_TREES);
  const at = `${trees}[${tree}]`;
  edits.push(
    { type: "ensureProperty", path: group, field: JOINT_TREES },
    {
      type: "insertItem",
      path: trees,
      item: { index: tree, key: null, class: TREE_CLASS },
    },
    { type: "ensureProperty", path: at, field: TREE_ROOT },
    {
      type: "setLeaf",
      path: under(at, TREE_ROOT),
      value: { type: "hash", text: joint },
    },
  );
  return edits;
}

/** The edits that leave `joint`, and everything under it, out of the tree at `tree`. */
export function excludeJointEdits(tree: string, joint: string): ValueEdit[] {
  const at = relative(tree);
  const list = under(at, TREE_EXCLUDED);
  return [
    { type: "ensureProperty", path: at, field: TREE_EXCLUDED },
    {
      type: "insertItem",
      path: list,
      item: { index: 0, key: null, class: null },
    },
    {
      type: "setLeaf",
      path: `${list}[0]`,
      value: { type: "hash", text: joint },
    },
  ];
}

/** The edits that take entry `index` off the excluded list of the tree at `tree`. */
export function includeJointEdits(tree: string, index: number): ValueEdit[] {
  return [
    {
      type: "removeItem",
      path: `${under(relative(tree), TREE_EXCLUDED)}[${index}]`,
    },
  ];
}

/** The edits that add a pose modifier of `className` at the end of the list, at its defaults. */
export function addModifierEdits(skin: SkinModel, className: string): ValueEdit[] {
  const index = nextIndex(skin.poseModifiers.map((modifier) => modifier.path));
  return [
    { type: "ensureProperty", path: "", field: POSE_MODIFIERS },
    {
      type: "insertItem",
      path: segment(POSE_MODIFIERS),
      item: { index, key: null, class: className },
    },
  ];
}

/**
 * The edits that add `joint` to the joints of the orientation at `path`, past the items at
 * `held`.
 */
export function addOrientationJointEdits(
  path: string,
  joint: string,
  held: readonly string[],
): ValueEdit[] {
  const at = relative(path);
  const list = under(at, FIELD.orientationJoints);
  const index = nextIndex(held);
  return [
    { type: "ensureProperty", path: at, field: FIELD.orientationJoints },
    { type: "insertItem", path: list, item: { index, key: null, class: null } },
    { type: "setLeaf", path: `${list}[${index}]`, value: { type: "hash", text: joint } },
  ];
}

/**
 * The edits that give the orientation at `path` a source of `className`, or take its
 * source away for null. A source of another class keeps the fields both classes declare.
 */
export function orientationSourceEdits(path: string, className: string | null): ValueEdit[] {
  const at = relative(path);
  return [
    { type: "ensureProperty", path: at, field: FIELD.orientationSource },
    {
      type: "replacePointer",
      path: under(at, FIELD.orientationSource),
      class: className,
    },
  ];
}

/** The edits that add a joint orientation turning `joint`. */
export function addOrientationEdits(skin: SkinModel, joint: string): ValueEdit[] {
  const index = nextIndex(skin.poseModifiers.map((modifier) => modifier.path));
  const item = `${segment(POSE_MODIFIERS)}[${index}]`;
  return [
    ...addModifierEdits(skin, ORIENTATION_CLASS),
    ...addOrientationJointEdits(item, joint, []),
  ];
}

/** The edits that add a spring on `joint`, trailing the unit's movement. */
export function addSpringEdits(skin: SkinModel, joint: string): ValueEdit[] {
  const index = nextIndex(skin.poseModifiers.map((modifier) => modifier.path));
  const list = segment(POSE_MODIFIERS);
  const spring = `${list}[${index}]`;
  return [
    { type: "ensureProperty", path: "", field: POSE_MODIFIERS },
    {
      type: "insertItem",
      path: list,
      item: { index, key: null, class: SPRING_CLASS },
    },
    { type: "ensureProperty", path: spring, field: FIELD.joint },
    {
      type: "setLeaf",
      path: under(spring, FIELD.joint),
      value: { type: "hash", text: joint },
    },
    { type: "ensureProperty", path: spring, field: FIELD.doTranslation },
    {
      type: "setLeaf",
      path: under(spring, FIELD.doTranslation),
      value: bool(true),
    },
  ];
}

/** The edits that add a socket named `name` riding `joint`. */
export function addSocketEdits(skin: SkinModel, joint: string, name: string): ValueEdit[] {
  const index = nextIndex(skin.sockets.map((socket) => socket.path));
  const list = segment(SOCKETS);
  const socket = `${list}[${index}]`;
  return [
    { type: "ensureProperty", path: "", field: SOCKETS },
    {
      type: "insertItem",
      path: list,
      item: { index, key: null, class: SOCKET_CLASS },
    },
    { type: "ensureProperty", path: socket, field: NAME },
    {
      type: "setLeaf",
      path: under(socket, NAME),
      value: { type: "string", value: name },
    },
    { type: "ensureProperty", path: socket, field: FIELD.parentJoint },
    {
      type: "setLeaf",
      path: under(socket, FIELD.parentJoint),
      value: { type: "hash", text: joint },
    },
  ];
}

/** The edits that take the list item at `path` out of its list. */
export function removeEdits(path: string): ValueEdit[] {
  return [{ type: "removeItem", path: relative(path) }];
}

/**
 * A name for a new socket on `joint` that no joint and no socket of the skin holds.
 *
 * A joint wins over a socket of its name, so a socket named for its joint would never be
 * found.
 */
export function socketName(joint: string, taken: ReadonlySet<string>): string {
  const base = `${joint}_Socket`;
  let name = base;
  for (let count = 2; taken.has(name.toLowerCase()); count += 1) {
    name = `${base}${count}`;
  }
  return name;
}

/** The names `socketName` keeps clear of: every joint of `pose` and every socket, in lower case. */
export function takenNames(pose: Pose, sockets: readonly Socket[]): Set<string> {
  return new Set([
    ...pose.skeleton.joints.map((joint) => joint.name.toLowerCase()),
    ...sockets.map((socket) => socket.name.toLowerCase()),
  ]);
}
