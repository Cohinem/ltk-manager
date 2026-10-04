import type { SkeletonModel } from "../assets/parsing/skeletonBuffer";
import { bendCompliance, clamp01, scaledValue, stretchCompliance } from "./curve";
import { EPSILON } from "./math";
import {
  type ChainModel,
  type ChainParameter,
  linkCompliance,
  SOLVER_SETTINGS,
  type SolverSettings,
  type TreeGroup,
} from "./model";
import { bindWorld, childLists } from "./world";

/** A node whose joint has no simulated child. */
export const NO_CHILD = -1;
/** A node whose joint has more than one simulated child. */
export const MANY_CHILDREN = -2;

/** One tree of a chain as it was built: a run of nodes and the group flags they step under. */
export interface TreeRig {
  /** The first node of the tree, which is its root. */
  readonly first: number;
  readonly count: number;
  readonly group: number;
  readonly rods: boolean;
  readonly restFromPose: boolean;
  /** What the step's time is multiplied by in the attraction. */
  readonly timeScale: number;
}

/** A distance constraint between two particles, which a lateral link is. */
export interface Link {
  readonly a: number;
  readonly b: number;
  readonly rest: number;
  readonly compliance: number;
  lambda: number;
}

/** A rod segment from a node to its one simulated child, held straight along the node's orientation. */
export interface StretchShear {
  readonly node: number;
  readonly child: number;
  readonly stretch: number;
  readonly shear: number;
  /** The Lagrange multipliers of the substep: along the rod, then the vector across it. */
  readonly lambda: Float64Array;
}

/** The turn between a node's orientation and its parent's, held at the animated one. */
export interface BendTwist {
  readonly parent: number;
  readonly node: number;
  readonly bendStiffness: number;
  readonly twistStiffness: number;
  /** The compliance of the bend and of the twist, for the rest length the node has this step. */
  bend: number;
  twist: number;
  readonly lambda: Float64Array;
}

/**
 * One dynamics chain built against a skeleton: its nodes parents first, their parameters,
 * and the state a step moves.
 *
 * A node stands for one joint under a tree's root. Every array is indexed by node, a
 * vector three floats per node and a quaternion four.
 */
export interface ChainRig {
  readonly model: ChainModel;
  readonly settings: SolverSettings;
  readonly count: number;
  /** The pose slot of each node's joint. */
  readonly joint: Int32Array;
  /** The parent node, and -1 for a tree's root. */
  readonly parent: Int32Array;
  /** The one simulated child, `NO_CHILD` or `MANY_CHILDREN`. */
  readonly child: Int32Array;
  readonly depth: Int32Array;
  readonly tree: Int32Array;
  /** 1 for a node that has a particle. An excluded joint and everything under it has none. */
  readonly simulated: Uint8Array;
  /** 1 for a tree's root, whose particle stands on the animation. */
  readonly pinned: Uint8Array;
  readonly trees: readonly TreeRig[];

  /** How far along its tree each node sits, 0 at the root to 1 at the longest tip. */
  readonly along: Float32Array;
  readonly damping: Float32Array;
  readonly radius: Float32Array;
  readonly attraction: Float32Array;
  readonly limitAngle: Float32Array;
  readonly stretch: Float32Array;
  readonly envelope: Float32Array;
  readonly restLength: Float32Array;

  /** The animated pose of the step, in world space. */
  readonly animPosition: Float64Array;
  readonly animRotation: Float64Array;
  readonly position: Float64Array;
  readonly previous: Float64Array;
  /** The rod orientation of a node, where `oriented` marks one. */
  readonly orientation: Float64Array;
  readonly oriented: Uint8Array;
  /** The way an oriented node's rod points in its own frame, off the animated pose. */
  readonly restDirection: Float64Array;
  /** The animated turn from each node's parent to it, which a bend and twist holds. */
  readonly restTurn: Float64Array;
  /** The rotation a step leaves each node with, which the write-back reads. */
  readonly simRotation: Float64Array;

  readonly links: Link[];
  readonly stretchShear: StretchShear[];
  readonly bendTwist: BendTwist[];

  readonly gravity: Float64Array;
  /** The lowest joint of the bind pose, which the ground plane lies at, in the skeleton's units. */
  readonly groundY: number;
  /** The collision shapes placed on the pose of the step, in world space. */
  readonly spheres: Float64Array;
  readonly capsules: Float64Array;
  readonly plane: Float64Array;

  /** The step before this one, and zero before the first. */
  previousDt: number;
  /** The next sync stands every particle on the animated pose at rest. */
  resetPending: boolean;
}

/** The floats one placed sphere takes: its centre and its radius. */
export const SPHERE_FLOATS = 4;
/** The floats one placed capsule takes: each end and its radius. */
export const CAPSULE_FLOATS = 8;

/**
 * `chain` built on `skeleton`, as the game builds it once per unit.
 *
 * A tree whose root the skeleton lacks is left out. Every joint under a root gets a node,
 * depth first over every branch. `parents` is the pose's parent table and `scale` the one
 * the character is drawn at, which the rest lengths and the ground are measured in.
 */
export function buildChain(
  chain: ChainModel,
  skeleton: SkeletonModel,
  parents: Int32Array,
  scale: number,
  settings: SolverSettings = SOLVER_SETTINGS,
): ChainRig {
  const children = childLists(parents);
  const bind = bindWorld(skeleton, parents).positions;

  const joint: number[] = [];
  const parent: number[] = [];
  const depth: number[] = [];
  const tree: number[] = [];
  const simulated: number[] = [];
  const trees: TreeRig[] = [];

  chain.groups.forEach((group, groupIndex) => {
    for (const each of group.trees) {
      if (each.root < 0 || each.root >= parents.length) continue;

      const first = joint.length;
      const excluded = new Set(each.excluded);
      const walk = (slot: number, above: number, level: number, live: boolean) => {
        const node = joint.length;
        const alive = live && !excluded.has(slot);
        joint.push(slot);
        parent.push(above);
        depth.push(level);
        tree.push(trees.length);
        simulated.push(alive ? 1 : 0);
        for (const below of children[slot]) walk(below, node, level + 1, alive);
      };
      /* The root is simulated whatever the excluded list says, since it is what is pinned. */
      excluded.delete(each.root);
      walk(each.root, -1, 0, true);

      trees.push({
        first,
        count: joint.length - first,
        group: groupIndex,
        rods: group.properties.useRodPhysics,
        restFromPose: group.restLengthFromPose,
        timeScale: group.properties.useRodPhysics ? settings.rodAttractionScale : 1,
      });
    }
  });

  const count = joint.length;
  const override = chain.gravityOverride ?? settings.gravity;
  const rig: ChainRig = {
    model: chain,
    settings,
    count,
    joint: Int32Array.from(joint),
    parent: Int32Array.from(parent),
    child: new Int32Array(count).fill(NO_CHILD),
    depth: Int32Array.from(depth),
    tree: Int32Array.from(tree),
    simulated: Uint8Array.from(simulated),
    pinned: Uint8Array.from(parent, (above) => (above < 0 ? 1 : 0)),
    trees,
    along: new Float32Array(count),
    damping: new Float32Array(count),
    radius: new Float32Array(count),
    attraction: new Float32Array(count),
    limitAngle: new Float32Array(count).fill(180),
    stretch: new Float32Array(count),
    envelope: new Float32Array(count).fill(1),
    restLength: new Float32Array(count),
    animPosition: new Float64Array(count * 3),
    animRotation: new Float64Array(count * 4),
    position: new Float64Array(count * 3),
    previous: new Float64Array(count * 3),
    orientation: new Float64Array(count * 4),
    oriented: new Uint8Array(count),
    restDirection: new Float64Array(count * 3),
    restTurn: new Float64Array(count * 4),
    simRotation: new Float64Array(count * 4),
    links: [],
    stretchShear: [],
    bendTwist: [],
    gravity: Float64Array.from(override, (axis) => axis * chain.gravityScale),
    groundY: lowest(bind),
    spheres: new Float64Array((chain.colliders?.spheres.length ?? 0) * SPHERE_FLOATS),
    capsules: new Float64Array((chain.colliders?.capsules.length ?? 0) * CAPSULE_FLOATS),
    plane: new Float64Array(6),
    previousDt: 0,
    resetPending: true,
  };

  for (let node = 0; node < count; node += 1) {
    const above = rig.parent[node];
    if (above >= 0 && rig.simulated[node] === 1) {
      rig.child[above] = rig.child[above] === NO_CHILD ? node : MANY_CHILDREN;
    }
    const [x, y, z] = skeleton.joints[rig.joint[node]].translation;
    rig.restLength[node] = above < 0 ? 0 : Math.hypot(x, y, z) * scale;
  }

  assignParameters(rig, skeleton);
  buildRods(rig);
  buildLinks(rig, bind, scale);
  return rig;
}

/** Stand `rig` back where a unit starts: at rest on the animated pose of its next step. */
export function resetChain(rig: ChainRig): void {
  rig.previousDt = 0;
  rig.resetPending = true;
}

/**
 * Every node's parameters, each a group value scaled by its curve at the node's place
 * along the tree.
 *
 * The place is a length: the bind lengths of the joints from the root down to the node,
 * over the longest such length of the tree, or of the group where it shares one. A tree
 * of no length is assigned nothing and keeps the node defaults.
 */
function assignParameters(rig: ChainRig, skeleton: SkeletonModel): void {
  const arc = new Float64Array(rig.count);
  const full = new Float64Array(rig.trees.length);
  for (let node = 0; node < rig.count; node += 1) {
    const above = rig.parent[node];
    if (above < 0) continue;

    const [x, y, z] = skeleton.joints[rig.joint[node]].translation;
    arc[node] = arc[above] + Math.hypot(x, y, z);
    if (rig.simulated[node] === 1) {
      full[rig.tree[node]] = Math.max(full[rig.tree[node]], arc[node]);
    }
  }

  const groupFull = new Map<number, number>();
  rig.trees.forEach((tree, at) => {
    groupFull.set(tree.group, Math.max(groupFull.get(tree.group) ?? 0, full[at]));
  });

  for (let node = 0; node < rig.count; node += 1) {
    if (rig.simulated[node] === 0) continue;

    const tree = rig.trees[rig.tree[node]];
    const group = rig.model.groups[tree.group];
    const length = group.sharedCurveLength
      ? (groupFull.get(tree.group) ?? 0)
      : full[rig.tree[node]];
    if (length <= EPSILON) continue;

    const t = arc[node] / length;
    const at = (parameter: ChainParameter) => scaledValue(group.properties[parameter], t);
    rig.along[node] = t;
    rig.damping[node] = at("damping");
    /* A pull past one has no real power of a part of a step. */
    rig.attraction[node] = clamp01(at("attraction"));
    rig.limitAngle[node] = at("limitAngle");
    rig.stretch[node] = at("stretch");
    rig.envelope[node] = at("envelope");
    rig.radius[node] = at("radius");
  }

  for (let node = 0; node < rig.count; node += 1) {
    const group = groupOf(rig, node);
    if (group.tipsWithoutRadius && rig.child[node] === NO_CHILD) rig.radius[node] = 0;
  }
}

/**
 * The rod constraints of every tree with rod physics.
 *
 * A simulated node with exactly one simulated child gets an orientation and a stretch and
 * shear constraint to that child, and a bend and twist constraint to its parent's
 * orientation where the parent has one. A branch point and a tip get none.
 */
function buildRods(rig: ChainRig): void {
  for (let node = 0; node < rig.count; node += 1) {
    const tree = rig.trees[rig.tree[node]];
    if (!tree.rods || rig.simulated[node] === 0 || rig.child[node] < 0) continue;

    const properties = groupOf(rig, node).properties;
    const t = rig.along[node];
    rig.oriented[node] = 1;
    rig.stretchShear.push({
      node,
      child: rig.child[node],
      stretch: stretchCompliance(scaledValue(properties.rodStretch, t)),
      shear: stretchCompliance(scaledValue(properties.rodShear, t)),
      lambda: new Float64Array(4),
    });

    const above = rig.parent[node];
    if (above < 0 || rig.oriented[above] === 0) continue;

    const bendStiffness = scaledValue(properties.rodBend, t);
    const twistStiffness = scaledValue(properties.rodTwist, t);
    rig.bendTwist.push({
      parent: above,
      node,
      bendStiffness,
      twistStiffness,
      bend: bendCompliance(bendStiffness, rig.restLength[node]),
      twist: bendCompliance(twistStiffness, rig.restLength[node]),
      lambda: new Float64Array(4),
    });
  }
}

/**
 * The lateral links of every group that generates them.
 *
 * Each simulated node of a tree below its root is tied to every simulated node of the
 * next tree of the group at the same depth, at their bind distance. The last tree is not
 * tied to the first.
 */
function buildLinks(rig: ChainRig, bind: Float64Array, scale: number): void {
  rig.model.groups.forEach((group, groupIndex) => {
    if (!group.lateralLinks) return;

    const compliance = linkCompliance(group.lateralLinkMaterial);
    const members = rig.trees.filter((tree) => tree.group === groupIndex);
    for (let at = 0; at + 1 < members.length; at += 1) {
      const here = members[at];
      const next = members[at + 1];
      for (let a = here.first + 1; a < here.first + here.count; a += 1) {
        if (rig.simulated[a] === 0) continue;

        for (let b = next.first; b < next.first + next.count; b += 1) {
          if (rig.simulated[b] === 0 || rig.depth[b] !== rig.depth[a]) continue;

          const from = rig.joint[a] * 3;
          const to = rig.joint[b] * 3;
          const rest =
            Math.hypot(
              bind[to] - bind[from],
              bind[to + 1] - bind[from + 1],
              bind[to + 2] - bind[from + 2],
            ) * scale;
          rig.links.push({ a, b, rest, compliance, lambda: 0 });
        }
      }
    }
  });
}

function groupOf(rig: ChainRig, node: number): TreeGroup {
  return rig.model.groups[rig.trees[rig.tree[node]].group];
}

function lowest(positions: Float64Array): number {
  let low = Number.POSITIVE_INFINITY;
  for (let at = 1; at < positions.length; at += 3) low = Math.min(low, positions[at]);
  return Number.isFinite(low) ? low : 0;
}
