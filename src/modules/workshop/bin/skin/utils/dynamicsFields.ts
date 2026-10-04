import type { ChainParameter } from "@/modules/viewport";

import { nameHash } from "../../shared/utils/binHash";

/** `SkinCharacterDataProperties.skinMeshProperties`, the property every edit here is staged under. */
export const MESH_PROPERTIES = nameHash("skinMeshProperties");

export const POSE_MODIFIERS = nameHash("rigPoseModifierData");
export const SOCKETS = nameHash("SocketDefinitions");
export const TREE_GROUPS = nameHash("JointTreeGroups");
export const JOINT_TREES = nameHash("JointTrees");
export const TREE_ROOT = nameHash("RootJointName");
export const TREE_EXCLUDED = nameHash("ExcludeJointNames");
export const CHAIN_PROPERTIES = nameHash("ChainProperties");
export const CURVE = nameHash("Curve");
export const CURVE_TIMES = nameHash("times");
export const CURVE_VALUES = nameHash("values");
export const NAME = nameHash("name");

export const CHAIN_CLASS = "DynamicsChainRigPoseModifierData";
export const GROUP_CLASS = "DynamicsJointTreeGroupData";
export const TREE_CLASS = "DynamicsJointTreeData";
export const SPRING_CLASS = "SpringPhysicsRigPoseModifierData";
export const ORIENTATION_CLASS = "JointOrientationRigPoseModifierData";
export const SOCKET_CLASS = "SocketDefinitionSingleJoint";
export const CURVE_CLASS = "CurveFloat";

export const SCALED_CLASS = nameHash("CurveScaledFloat");

/**
 * What `LateralLinkMaterial` numbers: the materials of the compliance table the game's seven
 * values match, stiffest first. The game ships no names for them.
 */
export const LATERAL_LINK_MATERIAL = {
  Concrete: 0,
  Wood: 1,
  Leather: 2,
  Tendon: 3,
  Rubber: 4,
  Muscle: 5,
  Fat: 6,
} as const;

/** What `orientationType` numbers. The game ships no names for the values. */
export const ORIENTATION_TYPE = { Direction: 0, Position: 1 } as const;

/** What `PlaneConstraint` numbers: the plane a joint turns in, named by its two axes. */
export const ORIENTATION_PLANE = { XY: 0, XZ: 1, YZ: 2 } as const;

/** What the two axis fields of a joint orientation number. */
export const ORIENTATION_AXIS = { None: 0, X: 1, Y: 2, Z: 3 } as const;

/** The field each chain parameter is read from on `DynamicsChainProperties`. */
export const PARAMETER_FIELD: Record<ChainParameter, string> = {
  damping: nameHash("Damping"),
  attraction: nameHash("AnimPoseAttraction"),
  radius: nameHash("JointRadius"),
  envelope: nameHash("Envelope"),
  limitAngle: nameHash("LimitAngle"),
  stretch: nameHash("Stretch"),
  rodBend: nameHash("RodBendStiffness"),
  rodTwist: nameHash("RodTwistStiffness"),
  rodStretch: nameHash("RodStretchStiffness"),
  rodShear: nameHash("RodShearStiffness"),
};

/** The fields of the structs the sections write, by the name a control knows them under. */
export const FIELD = {
  /* The chain's collider file, a `String` no table names. */
  colliderFile: "0xbb1d1aac",
  /* Three group flags no table names. */
  sharedCurveLength: "0x04e1a2c8",
  restLengthFromPose: "0x56670932",
  tipsWithoutRadius: "0x23382109",
  orientationJoints: nameHash("Joints"),
  orientationSource: nameHash("OrientationSource"),
  /* Five fields of a joint orientation no table names. */
  orientationTiltAxis: "0xa57f0269",
  orientationAimAxis: "0xae1cbd5f",
  orientationAimNegated: "0x57722010",
  orientationFlipped: "0x1a30a486",
  orientationMaxAngle: "0x420b233d",
  value: nameHash("value"),
  useCurve: nameHash("UseCurve"),
  doTranslation: nameHash("DoTranslation"),
  doRotation: nameHash("DoRotation"),
  joint: nameHash("Joint"),
  parentJoint: nameHash("ParentJoint"),
  positionOffset: nameHash("PositionOffset"),
  rotationOffset: nameHash("RotationOffset"),
  name: NAME,
} as const;
