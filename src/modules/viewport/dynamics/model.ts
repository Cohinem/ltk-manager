/**
 * The pose modifiers of a skin as the simulation reads them: joints by slot, numbers
 * without their hashes.
 *
 * "The module" in docs/plans/pose-dynamics-preview.md. Whoever holds the skin's typed read
 * builds this, so the simulation knows neither a bin nor a hash table.
 */

export type Vec3 = readonly [number, number, number];

/** One `CurveFloat`: its three lists as the file holds them. */
export interface CurveKeys {
  readonly times: readonly number[];
  /** One per key, and four for a cubic span: the key, two slopes and the next key. */
  readonly values: readonly number[];
  /** One per span: 0 linear, 1 stepped, 2 cubic. */
  readonly modes: readonly number[];
}

/** One `CurveScaledFloat`: a value, scaled along the tree by a curve where one is used. */
export interface ScaledCurve {
  readonly value: number;
  readonly useCurve: boolean;
  readonly curve: CurveKeys | null;
}

/** The names of the chain parameters, which a caller evaluates one of by. */
export const CHAIN_PARAMETERS = [
  "damping",
  "attraction",
  "radius",
  "envelope",
  "limitAngle",
  "stretch",
  "rodBend",
  "rodTwist",
  "rodStretch",
  "rodShear",
] as const;

export type ChainParameter = (typeof CHAIN_PARAMETERS)[number];

/** `DynamicsChainProperties`. */
export type ChainProperties = Readonly<Record<ChainParameter, ScaledCurve>> & {
  readonly useRodPhysics: boolean;
};

/** One tree of a group: the joint it hangs from and the joints under it left unsimulated. */
export interface JointTree {
  /** The root joint's slot, and -1 for a root the skeleton lacks, which the game skips. */
  readonly root: number;
  readonly excluded: readonly number[];
}

/** One `DynamicsJointTreeGroupData`. */
export interface TreeGroup {
  readonly trees: readonly JointTree[];
  readonly properties: ChainProperties;
  /** Every curve is read over the longest branch of the group rather than of each tree. */
  readonly sharedCurveLength: boolean;
  readonly lateralLinks: boolean;
  /** The compliance preset of the lateral links, 0 to 6. */
  readonly lateralLinkMaterial: number;
  /** A segment's rest length is measured off the animated pose every step. */
  readonly restLengthFromPose: boolean;
  /** A joint with no simulated child collides with no radius. */
  readonly tipsWithoutRadius: boolean;
}

/** A sphere riding one joint, its centre in that joint's own frame. */
export interface SphereCollider {
  readonly joint: number;
  readonly centre: Vec3;
  readonly radius: number;
}

/** A capsule between two joints, each end in its own joint's frame with its own radius. */
export interface CapsuleCollider {
  readonly jointA: number;
  readonly endA: Vec3;
  readonly radiusA: number;
  readonly jointB: number;
  readonly endB: Vec3;
  readonly radiusB: number;
}

/** The collision shapes of one chain, read from its collider file. */
export interface Colliders {
  readonly spheres: readonly SphereCollider[];
  readonly capsules: readonly CapsuleCollider[];
}

/** One `DynamicsChainRigPoseModifierData`. */
export interface ChainModel {
  readonly defaultOn: boolean;
  readonly globalEnvelope: number;
  readonly gravityScale: number;
  /** The gravity this chain falls under, and null for the game's own. */
  readonly gravityOverride: Vec3 | null;
  readonly groups: readonly TreeGroup[];
  readonly colliders: Colliders | null;
}

/** One `SpringPhysicsRigPoseModifierData`. */
export interface SpringModel {
  /** The joint moved, and -1 for one the skeleton lacks. */
  readonly joint: number;
  /** The spring's `name` hash, which a spring event names it by, and null for none. */
  readonly name: string | null;
  readonly mass: number;
  readonly stiffness: number;
  readonly damping: number;
  readonly doTranslation: boolean;
  readonly doRotation: boolean;
  /** How far the offset may reach, and zero for no limit. */
  readonly maxDistance: number;
  /** How far the angle may reach in degrees, and zero for no limit. */
  readonly maxAngle: number;
  readonly invert: boolean;
  readonly defaultOn: boolean;
}

/** One `ExtraJointChainData`: a second chain turned by the angles of a conform's own. */
export interface ExtraChain {
  /** The chain's joints by slot, the starting joint first. */
  readonly joints: readonly number[];
  /** How much of each angle's size is taken off it, most at the starting joint. */
  readonly rightBias: number;
}

/** One `ConformToPathRigPoseModifierData`. */
export interface ConformModel {
  /** The chain's joints by slot, the starting joint first and each the parent of the next. */
  readonly joints: readonly number[];
  /** The default mask's weights by slot, and null for no mask, which weighs every joint whole. */
  readonly mask: readonly number[] | null;
  /** The most one joint turns, in degrees. */
  readonly maxBoneAngle: number;
  readonly damping: number;
  readonly frequency: number;
  /** How much of the unit's velocity carries a joint's aim, at the starting joint. */
  readonly velMultiplier: number;
  readonly onlyInTurns: boolean;
  /** How far the unit's path bends at a point that counts as a turn, in degrees. */
  readonly activationAngle: number;
  /** How near a turn a joint turns whole. */
  readonly activationDistance: number;
  /** How far from a turn a joint stops turning. */
  readonly blendDistance: number;
  readonly extraChains: readonly ExtraChain[];
}

/**
 * What the joints of an orientation turn to. The game reads it off a driver each frame,
 * and the preview stands a vector in for the driver.
 */
export interface OrientationSource {
  readonly vector: Vec3;
  /** The vector is a place each joint turns toward, rather than a direction. */
  readonly position: boolean;
  /** The vector is in the unit's frame and rides it, rather than standing in the world. */
  readonly rides: boolean;
}

/** One `JointOrientationRigPoseModifierData`. */
export interface OrientationModel {
  /** The joints turned, by slot, in list order. */
  readonly joints: readonly number[];
  /** `PlaneConstraint`: the normal of the plane a joint turns in, 0 z, 1 y, 2 x. */
  readonly planeConstraint: number;
  /** The axis the plane tilts about: 0 none, 1 x, 2 y, 3 z. */
  readonly tiltAxis: number;
  /** The axis of the joint pointed along the direction: 0 none, 1 x, 2 y, 3 z. */
  readonly aimAxis: number;
  /** The aim axis is the negative one. */
  readonly aimNegated: boolean;
  /** The joint is turned half way round its normal first, and its tilt runs the other way. */
  readonly flipped: boolean;
  /** The most a joint turns in its plane, in degrees. */
  readonly maxAngle: number;
  readonly defaultOn: boolean;
  /** Null where nothing stands in for the driver, which turns nothing. */
  readonly source: OrientationSource | null;
}

/** Every pose modifier of a skin the preview simulates. */
export interface DynamicsModel {
  readonly chains: readonly ChainModel[];
  readonly springs: readonly SpringModel[];
  readonly conforms: readonly ConformModel[];
  readonly orientations: readonly OrientationModel[];
}

/** `PhysicsSimGlobalSettings`, at the values the game builds its default object with. */
export interface SolverSettings {
  readonly gravity: Vec3;
  /** Constraint passes per substep. */
  readonly iterations: number;
  /** Substeps per step, which only divide the step a compliance is scaled by. */
  readonly substeps: number;
  /** The largest error a pass may leave before the substep ends early. */
  readonly threshold: number;
  /** 0 collides once per step, 1 collides after every constraint pass. */
  readonly collisionMode: number;
  /** What a rod group's attraction time is multiplied by. */
  readonly rodAttractionScale: number;
}

export const SOLVER_SETTINGS: SolverSettings = {
  gravity: [0, -981, 0],
  iterations: 1,
  substeps: 50,
  threshold: 1e-5,
  collisionMode: 0,
  rodAttractionScale: 1,
};

/** The compliance a lateral link takes from `LateralLinkMaterial`, and zero past the table. */
export function linkCompliance(material: number): number {
  return LINK_COMPLIANCE[material] ?? 0;
}

/**
 * A hundred times the material table of the XPBD paper: concrete, wood, leather, tendon,
 * rubber, muscle, fat.
 */
const LINK_COMPLIANCE: readonly number[] = [4e-9, 1.6e-8, 1e-6, 2e-6, 1e-4, 0.02, 0.1];

/** The model of a skin with no modifier the preview simulates. */
export const NO_DYNAMICS: DynamicsModel = {
  chains: [],
  springs: [],
  conforms: [],
  orientations: [],
};

/** Whether `model` holds anything a pass has to be baked for. */
export function hasDynamics(model: DynamicsModel): boolean {
  return (
    model.conforms.some((conform) => conform.joints.length > 0) ||
    model.springs.some((spring) => spring.joint >= 0) ||
    model.orientations.some((each) => each.joints.length > 0 && each.source !== null) ||
    model.chains.some((chain) =>
      chain.groups.some((group) => group.trees.some((tree) => tree.root >= 0)),
    )
  );
}
