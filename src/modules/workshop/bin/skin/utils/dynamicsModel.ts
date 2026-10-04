import type {
  ChainProperties as WireChainProperties,
  HashRef,
  Mask,
  PoseModifier,
  ScaledCurve as WireScaledCurve,
  SkinModel,
  Socket,
} from "@/lib/tauri";
import {
  type ChainModel,
  type ChainProperties,
  type Colliders,
  type ConformModel,
  conformJoints,
  type DynamicsCues,
  type DynamicsModel,
  type DynamicsRig,
  isSocketed,
  type OrientationModel,
  type Pose,
  type ScaledCurve,
  scaledValue,
  type SocketModel,
  type SpringModel,
} from "@/modules/viewport";

import type { TintedParameter } from "../state/skinTint";
import type { TimedStep } from "./clipEvents";
import { jointSlot } from "./skinScene";

type Wire3 = readonly [number | null, number | null, number | null];

/** The dynamics chains of a skin, each with the hash path it is edited at. */
export type WireChain = Extract<PoseModifier, { kind: "dynamicsChain" }>;
/** The springs of a skin, each with the hash path it is edited at. */
type WireSpring = Extract<PoseModifier, { kind: "spring" }>;
/** The conforms of a skin, each with the hash path it is edited at. */
type WireConform = Extract<PoseModifier, { kind: "conformToPath" }>;
/** The joint orientations of a skin, each with the hash path it is edited at. */
export type WireOrientation = Extract<PoseModifier, { kind: "jointOrientation" }>;

/**
 * What stands in for the driver of a joint orientation: a place on the ground ahead of
 * where the unit starts the pass, which stays in the world as the unit moves and turns.
 */
export const AIM_STAND_IN: readonly [number, number, number] = [0, 0, 500];

function vec3(value: Wire3): [number, number, number] {
  return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
}

function scaled(curve: WireScaledCurve): ScaledCurve {
  return {
    value: curve.value ?? 0,
    useCurve: curve.useCurve,
    curve:
      curve.curve === null
        ? null
        : {
            times: curve.curve.times.map((time) => time ?? 0),
            values: curve.curve.values.map((value) => value ?? 0),
            modes: curve.curve.modes,
          },
  };
}

/** The chain parameters of a group as the simulation reads them. */
export function chainProperties(properties: WireChainProperties): ChainProperties {
  return {
    useRodPhysics: properties.useRodPhysics,
    damping: scaled(properties.damping),
    attraction: scaled(properties.attraction),
    radius: scaled(properties.radius),
    envelope: scaled(properties.envelope),
    limitAngle: scaled(properties.limitAngle),
    stretch: scaled(properties.stretch),
    rodBend: scaled(properties.rodBend),
    rodTwist: scaled(properties.rodTwist),
    rodStretch: scaled(properties.rodStretch),
    rodShear: scaled(properties.rodShear),
  };
}

function chainModel(chain: WireChain, pose: Pose, colliders: Colliders | null): ChainModel {
  return {
    defaultOn: chain.defaultOn,
    globalEnvelope: chain.globalEnvelope ?? 1,
    gravityScale: chain.gravityScale ?? 1,
    gravityOverride: chain.gravityOverride === null ? null : vec3(chain.gravityOverride),
    colliders,
    groups: chain.groups.map((group) => ({
      trees: group.trees.map((tree) => ({
        root: jointSlot(pose, tree.root),
        excluded: tree.excluded.map((joint) => jointSlot(pose, joint)).filter((slot) => slot >= 0),
      })),
      properties: chainProperties(group.properties),
      sharedCurveLength: group.sharedCurveLength,
      lateralLinks: group.lateralLinks,
      lateralLinkMaterial: group.lateralLinkMaterial,
      restLengthFromPose: group.restLengthFromPose,
      tipsWithoutRadius: group.tipsWithoutRadius,
    })),
  };
}

function springModel(spring: WireSpring, pose: Pose): SpringModel {
  return {
    joint: jointSlot(pose, spring.joint),
    name: spring.name?.hash ?? null,
    mass: spring.mass ?? 0.1,
    stiffness: spring.stiffness ?? 2.5,
    damping: spring.damping ?? 1,
    doTranslation: spring.doTranslation,
    doRotation: spring.doRotation,
    maxDistance: spring.maxDistance ?? 0,
    maxAngle: spring.maxAngle ?? 0,
    invert: spring.invert,
    defaultOn: spring.defaultOn,
  };
}

/** The weights of the mask keyed `hash` by slot, and null for a key the graph holds no mask under. */
function maskWeights(masks: readonly Mask[], hash: string | null): number[] | null {
  const mask = hash === null ? undefined : masks.find((each) => each.hash === hash);
  return mask === undefined ? null : mask.weights.map((weight) => weight ?? 0);
}

/** The joints of the chain from `start` down to `end`, as the game walks one. */
function chainJoints(pose: Pose, start: HashRef | null, end: HashRef | null): number[] {
  return conformJoints(pose.parents, jointSlot(pose, start), jointSlot(pose, end));
}

function conformModel(conform: WireConform, pose: Pose, masks: readonly Mask[]): ConformModel {
  return {
    joints: chainJoints(pose, conform.start, conform.end),
    mask: maskWeights(masks, conform.defaultMask?.hash ?? null),
    maxBoneAngle: conform.maxBoneAngle ?? 65,
    damping: conform.damping ?? 10,
    frequency: conform.frequency ?? 10,
    velMultiplier: conform.velMultiplier ?? -0.5,
    onlyInTurns: conform.onlyInTurns,
    activationAngle: conform.activationAngle ?? 0.5,
    activationDistance: conform.activationDistance ?? 200,
    blendDistance: conform.blendDistance ?? 400,
    extraChains: conform.extraChains.map((extra) => ({
      joints: chainJoints(pose, extra.start, extra.end),
      rightBias: extra.rightBias ?? 0,
    })),
  };
}

/**
 * An orientation with `AIM_STAND_IN` for its driver, read as the direction or the place
 * its `orientationType` says. One with no driver turns nothing, as in the game.
 */
function orientationModel(orientation: WireOrientation, pose: Pose): OrientationModel {
  return {
    joints: orientation.joints.map((joint) => jointSlot(pose, joint)).filter((slot) => slot >= 0),
    planeConstraint: orientation.planeConstraint,
    tiltAxis: orientation.tiltAxis,
    aimAxis: orientation.aimAxis,
    aimNegated: orientation.aimNegated,
    flipped: orientation.flipped,
    maxAngle: orientation.maxAngle ?? 180,
    defaultOn: orientation.defaultOn,
    source:
      orientation.source === null
        ? null
        : {
            vector: AIM_STAND_IN,
            position: orientation.orientationType === 1,
            rides: false,
          },
  };
}

/**
 * The pose modifiers of `skin` the preview simulates, their joints found on `pose`.
 *
 * A modifier whose path is in `muted` is left out, which is how the preview eye compares
 * with and without one. `colliders` holds the shapes of each chain's collider file by
 * the chain's path, once the file is read. `masks` are the graph's, which a conform's
 * default mask is one of.
 */
export function dynamicsModelOf(
  skin: SkinModel,
  pose: Pose,
  muted: ReadonlySet<string> = NONE_MUTED,
  colliders: ReadonlyMap<string, Colliders> = NO_COLLIDERS,
  masks: readonly Mask[] = NO_MASKS,
): DynamicsModel {
  const kept = skin.poseModifiers.filter((modifier) => !muted.has(modifier.path));
  return {
    chains: kept.flatMap((modifier) =>
      modifier.kind === "dynamicsChain"
        ? [chainModel(modifier, pose, colliders.get(modifier.path) ?? null)]
        : [],
    ),
    springs: kept.flatMap((modifier) =>
      modifier.kind === "spring" ? [springModel(modifier, pose)] : [],
    ),
    conforms: kept.flatMap((modifier) =>
      modifier.kind === "conformToPath" ? [conformModel(modifier, pose, masks)] : [],
    ),
    orientations: kept.flatMap((modifier) =>
      modifier.kind === "jointOrientation" ? [orientationModel(modifier, pose)] : [],
    ),
  };
}

/** The sockets of `skin` the preview resolves, each parent joint found on `pose`. */
export function socketModelsOf(sockets: readonly Socket[], pose: Pose): SocketModel[] {
  return sockets.flatMap((socket): SocketModel[] => {
    if (socket.kind === "world") {
      return [{ kind: "world", name: socket.name, position: vec3(socket.position) }];
    }
    if (socket.kind !== "singleJoint") return [];

    return [
      {
        kind: "singleJoint",
        name: socket.name,
        parent: jointSlot(pose, socket.parent),
        position: vec3(socket.position),
        rotation: vec3(socket.rotation),
        freezePosition: socket.freezePosition,
        freezeRotation: socket.freezeRotation,
      },
    ];
  });
}

/**
 * The blend events of the pass: when a chain or a spring leaves its default state, when a
 * conform takes an event's mask, when a joint's facing is locked, and when each returns.
 *
 * A lock names its joint, which is found on `pose`.
 */
export function dynamicsCues(
  steps: readonly TimedStep[],
  masks: readonly Mask[] = NO_MASKS,
  pose: Pose | null = null,
): DynamicsCues {
  const chains: DynamicsCues["chains"][number][] = [];
  const springs: DynamicsCues["springs"][number][] = [];
  const conforms: DynamicsCues["conforms"][number][] = [];
  const locks: DynamicsCues["locks"][number][] = [];
  const orientations: DynamicsCues["orientations"][number][] = [];
  for (const step of steps) {
    for (const event of step.clip.events) {
      const { kind } = event;
      const at = step.start + (event.startFrame ?? 0) * step.frame;
      const end = event.endFrame === null ? null : step.start + event.endFrame * step.frame;
      const until = end !== null && end > at ? end : null;

      if (kind.kind === "dynamicsChainBlend") {
        chains.push({
          at,
          until,
          blendFrom: kind.blendFromDefault ?? 0,
          blendTo: kind.blendToDefault ?? 0,
        });
      }
      if (kind.kind === "springPhysics") {
        springs.push({ at, until, spring: kind.spring?.hash ?? null });
      }
      if (kind.kind === "conformToPath") {
        conforms.push({
          at,
          until,
          mask: maskWeights(masks, kind.mask?.hash ?? null),
          blendIn: kind.blendIn ?? 0,
          blendOut: kind.blendOut ?? 0,
        });
      }
      if (kind.kind === "jointOrientation" && kind.blendFromDefault !== null) {
        orientations.push({
          at,
          until,
          blendFrom: kind.blendFromDefault,
          blendTo: kind.blendToDefault ?? 0,
        });
      }
      if (kind.kind === "lockRootOrientation" && pose !== null) {
        locks.push({
          at,
          until,
          joint: jointSlot(pose, kind.joint),
          blendOut: kind.blendOut ?? 0,
        });
      }
    }
  }
  return { chains, springs, conforms, locks, orientations };
}

/** What a joint is to the skin's pose modifiers and sockets, which its row is badged with. */
export interface JointRoles {
  /** The joint is the root of a tree, which the chain pins. */
  readonly treeRoot: boolean;
  /** The joint swings free under a tree's root. */
  readonly simulated: boolean;
  /** The joint is on a tree's excluded list. */
  readonly excluded: boolean;
  /** A spring moves the joint. */
  readonly spring: boolean;
  /** A conform turns the joint. */
  readonly conform: boolean;
  /** A joint orientation turns the joint. */
  readonly orientation: boolean;
  /** How many sockets ride the joint. */
  readonly sockets: number;
}

const NO_ROLES: JointRoles = {
  treeRoot: false,
  simulated: false,
  excluded: false,
  spring: false,
  conform: false,
  orientation: false,
  sockets: 0,
};

/**
 * What each joint of `pose` is to `skin`'s pose modifiers and sockets, by slot.
 *
 * A joint under a tree's root is simulated unless it or a joint above it is excluded, as
 * the game walks a tree. A slot past the last joint, which a socket answers under, has no
 * role.
 */
export function jointRoles(skin: SkinModel, pose: Pose): JointRoles[] {
  const roles: JointRoles[] = pose.skeleton.joints.map(() => NO_ROLES);
  const isJoint = (slot: number) => slot >= 0 && slot < roles.length;
  const mark = (slot: number, role: Partial<JointRoles>) => {
    if (isJoint(slot)) roles[slot] = { ...roles[slot], ...role };
  };
  const children: number[][] = pose.skeleton.joints.map(() => []);
  pose.parents.forEach((parent, slot) => {
    if (parent >= 0) children[parent].push(slot);
  });

  for (const modifier of skin.poseModifiers) {
    if (modifier.kind === "spring") mark(jointSlot(pose, modifier.joint), { spring: true });
    if (modifier.kind === "jointOrientation") {
      for (const joint of modifier.joints) {
        mark(jointSlot(pose, joint), { orientation: true });
      }
    }
    if (modifier.kind === "conformToPath") {
      const chains = [modifier, ...modifier.extraChains];
      for (const chain of chains) {
        for (const slot of chainJoints(pose, chain.start, chain.end)) {
          mark(slot, { conform: true });
        }
      }
    }
    if (modifier.kind !== "dynamicsChain") continue;

    for (const tree of modifier.groups.flatMap((group) => group.trees)) {
      const root = jointSlot(pose, tree.root);
      if (!isJoint(root)) continue;

      const excluded = new Set(tree.excluded.map((joint) => jointSlot(pose, joint)));
      excluded.delete(root);
      mark(root, { treeRoot: true });
      const walk = (slot: number) => {
        for (const child of children[slot]) {
          if (excluded.has(child)) {
            mark(child, { excluded: true });
            continue;
          }
          mark(child, { simulated: true });
          walk(child);
        }
      };
      walk(root);
    }
  }

  for (const socket of skin.sockets) {
    if (socket.kind !== "singleJoint") continue;
    const slot = jointSlot(pose, socket.parent);
    if (isJoint(slot)) mark(slot, { sockets: roles[slot].sockets + 1 });
  }
  return roles;
}

/** The tree a joint belongs to, and what the joint is to it. */
export interface JointTreeMatch {
  readonly chain: WireChain;
  readonly group: WireChain["groups"][number];
  readonly tree: WireChain["groups"][number]["trees"][number];
  /** The joint is the tree's root. */
  readonly root: boolean;
  /** Where the joint sits on the tree's excluded list, and -1 where it is not on it. */
  readonly excludedAt: number;
}

/**
 * The first tree of `skin` whose root is joint `slot` or stands above it, and null for a
 * joint under no root.
 */
export function jointTree(skin: SkinModel, pose: Pose, slot: number): JointTreeMatch | null {
  const above = new Set<number>();
  for (let at = slot; at >= 0; at = pose.parents[at]) {
    above.add(at);
  }

  for (const chain of skin.poseModifiers) {
    if (chain.kind !== "dynamicsChain") continue;

    for (const group of chain.groups) {
      for (const tree of group.trees) {
        const root = jointSlot(pose, tree.root);
        if (root < 0 || !above.has(root)) continue;

        return {
          chain,
          group,
          tree,
          root: root === slot,
          excludedAt: tree.excluded.findIndex((joint) => jointSlot(pose, joint) === slot),
        };
      }
    }
  }
  return null;
}

/** `ref` as a row reads it: the joint or socket found on `pose`, else its name in the tables. */
export function jointLabel(pose: Pose, ref: HashRef | null): string | null {
  if (ref === null) return null;

  const { joints } = pose.skeleton;
  const slot = jointSlot(pose, ref);
  if (slot < 0) return ref.name;
  if (slot < joints.length) return joints[slot].name;
  return isSocketed(pose) ? (pose.sockets[slot - joints.length]?.name ?? ref.name) : ref.name;
}

/**
 * How strongly the overlay tints each joint for the parameter `tinted` names: its value
 * along the tree over the largest value any joint of the group takes, by slot.
 *
 * Null where no parameter is chosen, the group is muted or gone, or nothing is built.
 */
export function parameterTint(
  skin: SkinModel,
  muted: ReadonlySet<string>,
  rig: DynamicsRig | null,
  tinted: TintedParameter | null,
): Float32Array | null {
  if (rig === null || tinted === null) return null;

  const chains = skin.poseModifiers.filter(
    (modifier): modifier is WireChain =>
      modifier.kind === "dynamicsChain" && !muted.has(modifier.path),
  );
  const tint = new Float32Array(rig.parents.length);
  let found = false;
  chains.forEach((chain, at) => {
    const built = rig.chains[at];
    const group = chain.groups.findIndex((each) => each.path === tinted.group);
    if (built === undefined || group < 0) return;

    found = true;
    const curve = chainProperties(chain.groups[group].properties)[tinted.parameter];
    const values = Array.from(built.joint, (_, node) =>
      built.simulated[node] === 1 && built.trees[built.tree[node]].group === group
        ? Math.abs(scaledValue(curve, built.along[node]))
        : 0,
    );
    const most = Math.max(...values, 0);
    values.forEach((value, node) => {
      if (most > 0 && value > 0) tint[built.joint[node]] = value / most;
    });
  });
  return found ? tint : null;
}

const NONE_MUTED: ReadonlySet<string> = new Set();
const NO_COLLIDERS: ReadonlyMap<string, Colliders> = new Map();
const NO_MASKS: readonly Mask[] = [];
