//! The pose modifiers and the sockets of a skin's mesh properties, as a viewport simulates
//! and resolves them.
//!
//! "Rust resolves, TypeScript simulates" in docs/plans/pose-dynamics-preview.md. Every item
//! carries the hash path of its own struct under the skin object, so a pane row and a
//! viewport handle edit the rows the inspector does (ADR-0027).

use ltk_hash::BinHash;
use ltk_manager_base::hashing::named;
use ltk_meta::PropertyValueEnum;
use serde::Serialize;

use ltk_manager_bin::bin_document::{
    Fields, HashPath, Locator, NamedAsset, boolean, fields_of, float, items, optional, struct_of,
    text, unsigned, vector3,
};

use super::{HashRef, MESH_PROPERTIES, class_name, hash_at};

mod conform;
#[cfg(test)]
mod fixtures;
mod orientation;

pub use conform::ExtraJointChain;

/// `SkinMeshDataProperties.rigPoseModifierData`.
const POSE_MODIFIERS: BinHash = named("rigPoseModifierData");
/// `SkinMeshDataProperties.SocketDefinitions`.
const SOCKETS: BinHash = named("SocketDefinitions");

const SPRING: BinHash = named("SpringPhysicsRigPoseModifierData");
const CONFORM_TO_PATH: BinHash = named("ConformToPathRigPoseModifierData");
const DYNAMICS_CHAIN: BinHash = named("DynamicsChainRigPoseModifierData");
const JOINT_ORIENTATION: BinHash = named("JointOrientationRigPoseModifierData");
const LOCK_ROOT_ORIENTATION: BinHash = named("LockRootOrientationRigPoseModifierData");
/// The class as the game spells it.
const JOINT_SNAP: BinHash = named("JointSnapRigPoseModifilerData");
const SYNCED_ANIMATION: BinHash = named("SyncedAnimationRigPoseModifierData");
const VERTEX_ANIMATION: BinHash = named("VertexAnimationRigPoseModifierData");
const SOCKET_SINGLE_JOINT: BinHash = named("SocketDefinitionSingleJoint");
const SOCKET_WORLD: BinHash = named("SocketDefinitionWorld");

/// `name`, on a spring and on a socket.
const NAME: BinHash = named("name");
/// `DefaultOn`, on a spring, a dynamics chain and a joint orientation.
const DEFAULT_ON: BinHash = named("DefaultOn");
/// `Damping`, on a spring and on the chain properties.
const DAMPING: BinHash = named("Damping");
/// `SpringPhysicsRigPoseModifierData.Joint`.
const SPRING_JOINT: BinHash = named("Joint");
/// `SpringPhysicsRigPoseModifierData.Mass`.
const SPRING_MASS: BinHash = named("Mass");
/// `SpringPhysicsRigPoseModifierData.SpringStiffness`.
const SPRING_STIFFNESS: BinHash = named("SpringStiffness");
/// `SpringPhysicsRigPoseModifierData.DoTranslation`.
const SPRING_TRANSLATION: BinHash = named("DoTranslation");
/// `SpringPhysicsRigPoseModifierData.DoRotation`.
const SPRING_ROTATION: BinHash = named("DoRotation");
/// `SpringPhysicsRigPoseModifierData.maxDistance`.
const SPRING_MAX_DISTANCE: BinHash = named("maxDistance");
/// `SpringPhysicsRigPoseModifierData.maxAngle`.
const SPRING_MAX_ANGLE: BinHash = named("maxAngle");
/// `SpringPhysicsRigPoseModifierData.Invert`.
const SPRING_INVERT: BinHash = named("Invert");

/// `VertexAnimationRigPoseModifierData.mMaxSpeed`.
const VERTEX_MAX_SPEED: BinHash = named("mMaxSpeed");
/// `VertexAnimationRigPoseModifierData.mStiffness`.
const VERTEX_STIFFNESS: BinHash = named("mStiffness");
/// `VertexAnimationRigPoseModifierData.mMass`.
const VERTEX_MASS: BinHash = named("mMass");
/// `VertexAnimationRigPoseModifierData.mDamping`.
const VERTEX_DAMPING: BinHash = named("mDamping");

/// `DynamicsChainRigPoseModifierData.PhysicsSimLocalSettings`.
const LOCAL_SETTINGS: BinHash = named("PhysicsSimLocalSettings");
/// `PhysicsSimLocalSettings.GravityScale`.
const GRAVITY_SCALE: BinHash = named("GravityScale");
/// `PhysicsSimLocalSettings.GravityOverride`.
const GRAVITY_OVERRIDE: BinHash = named("GravityOverride");
/// The collider file of a dynamics chain, a `String` no table names.
const COLLIDER_FILE: BinHash = BinHash(0xbb1d_1aac);
/// `DynamicsChainRigPoseModifierData.JointTreeGroups`.
const TREE_GROUPS: BinHash = named("JointTreeGroups");
/// `DynamicsChainRigPoseModifierData.GlobalEnvelope`.
const GLOBAL_ENVELOPE: BinHash = named("GlobalEnvelope");

/// `DynamicsJointTreeGroupData.ChainProperties`.
const CHAIN_PROPERTIES: BinHash = named("ChainProperties");
/// `DynamicsJointTreeGroupData.JointTrees`.
const JOINT_TREES: BinHash = named("JointTrees");
/// The group flag measuring every curve over the group's longest branch, which no table names.
const SHARED_CURVE_LENGTH: BinHash = BinHash(0x04e1_a2c8);
/// `DynamicsJointTreeGroupData.GenerateLateralLinks`.
const LATERAL_LINKS: BinHash = named("GenerateLateralLinks");
/// The group flag giving a tip joint no collision radius, which no table names.
const TIPS_WITHOUT_RADIUS: BinHash = BinHash(0x2338_2109);
/// The group flag measuring a segment's rest length off the animated pose, which no table names.
const REST_LENGTH_FROM_POSE: BinHash = BinHash(0x5667_0932);
/// `DynamicsJointTreeGroupData.LateralLinkMaterial`.
const LATERAL_LINK_MATERIAL: BinHash = named("LateralLinkMaterial");
/// `DynamicsJointTreeData.RootJointName`.
const TREE_ROOT: BinHash = named("RootJointName");
/// `DynamicsJointTreeData.ExcludeJointNames`.
const TREE_EXCLUDED: BinHash = named("ExcludeJointNames");

/// `DynamicsChainProperties.UseRodPhysics`.
const USE_ROD_PHYSICS: BinHash = named("UseRodPhysics");
/// `DynamicsChainProperties.AnimPoseAttraction`.
const ATTRACTION: BinHash = named("AnimPoseAttraction");
/// `DynamicsChainProperties.JointRadius`.
const JOINT_RADIUS: BinHash = named("JointRadius");
/// `DynamicsChainProperties.Envelope`.
const ENVELOPE: BinHash = named("Envelope");
/// `DynamicsChainProperties.LimitAngle`.
const LIMIT_ANGLE: BinHash = named("LimitAngle");
/// `DynamicsChainProperties.Stretch`.
const STRETCH: BinHash = named("Stretch");
/// `DynamicsChainProperties.RodBendStiffness`.
const ROD_BEND: BinHash = named("RodBendStiffness");
/// `DynamicsChainProperties.RodTwistStiffness`.
const ROD_TWIST: BinHash = named("RodTwistStiffness");
/// `DynamicsChainProperties.RodStretchStiffness`.
const ROD_STRETCH: BinHash = named("RodStretchStiffness");
/// `DynamicsChainProperties.RodShearStiffness`.
const ROD_SHEAR: BinHash = named("RodShearStiffness");

/// `CurveScaledFloat.value`.
const CURVE_VALUE: BinHash = named("value");
/// `CurveScaledFloat.UseCurve`.
const USE_CURVE: BinHash = named("UseCurve");
/// `CurveScaledFloat.Curve`.
const CURVE: BinHash = named("Curve");
/// `CurveFloat.times`.
const CURVE_TIMES: BinHash = named("times");
/// `CurveFloat.values`.
const CURVE_VALUES: BinHash = named("values");
/// `CurveFloat.InterpModes`.
const CURVE_MODES: BinHash = named("InterpModes");

/// `SocketDefinitionSingleJoint.ParentJoint`.
const SOCKET_PARENT: BinHash = named("ParentJoint");
/// `PositionOffset`, on both kinds of socket.
const SOCKET_POSITION: BinHash = named("PositionOffset");
/// `SocketDefinitionSingleJoint.RotationOffset`.
const SOCKET_ROTATION: BinHash = named("RotationOffset");
/// `FreezePositionX`, `Y` and `Z` of a single joint socket.
const FREEZE_POSITION: [BinHash; 3] = [
    named("FreezePositionX"),
    named("FreezePositionY"),
    named("FreezePositionZ"),
];
/// `FreezeRotationX`, `Y` and `Z` of a single joint socket.
const FREEZE_ROTATION: [BinHash; 3] = [
    named("FreezeRotationX"),
    named("FreezeRotationY"),
    named("FreezeRotationZ"),
];

/// The compliance preset the game gives a group that names none, which is leather.
const DEFAULT_LINK_MATERIAL: u8 = 2;

/// One entry of `rigPoseModifierData`, of any kind of `BaseRigPoseModifierData`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum PoseModifier {
    /// `SpringPhysicsRigPoseModifierData`: one joint lags the unit's movement or turning.
    Spring {
        /// The hash path of the modifier under the skin object.
        path: String,
        /// `name`, which a spring event names the spring by.
        name: Option<HashRef>,
        /// `Joint`, the joint moved.
        joint: Option<HashRef>,
        /// `Mass`.
        mass: f32,
        /// `SpringStiffness`.
        stiffness: f32,
        /// `Damping`.
        damping: f32,
        /// `DoTranslation`.
        do_translation: bool,
        /// `DoRotation`.
        do_rotation: bool,
        /// `maxDistance`, and zero for no limit.
        max_distance: f32,
        /// `maxAngle`, and zero for no limit.
        max_angle: f32,
        /// `Invert`.
        invert: bool,
        /// `DefaultOn`.
        default_on: bool,
    },
    /// `DynamicsChainRigPoseModifierData`: trees of joints simulated as particles.
    DynamicsChain {
        /// The hash path of the modifier under the skin object.
        path: String,
        /// `DefaultOn`.
        default_on: bool,
        /// `GlobalEnvelope`, multiplied into every joint's envelope.
        global_envelope: f32,
        /// `PhysicsSimLocalSettings.GravityScale`.
        gravity_scale: f32,
        /// `PhysicsSimLocalSettings.GravityOverride`, and none for the game's own gravity.
        gravity_override: Option<[f32; 3]>,
        /// The file the collision shapes are read from, and none for a chain naming none.
        collider_file: Option<NamedAsset>,
        /// `JointTreeGroups`.
        groups: Vec<JointTreeGroup>,
    },
    /// `ConformToPathRigPoseModifierData`: a chain of joints turns to trail the unit.
    ConformToPath {
        /// The hash path of the modifier under the skin object.
        path: String,
        /// `mStartingJointName`, the joint of the chain nearest the root.
        start: Option<HashRef>,
        /// `mEndingJointName`, the joint the chain runs down to.
        end: Option<HashRef>,
        /// `mDefaultMaskName`, the mask that weighs each joint's turn, and none for none.
        default_mask: Option<HashRef>,
        /// `mMaxBoneAngle`, the most one joint turns, in degrees.
        max_bone_angle: f32,
        /// `mDampingValue`.
        damping: f32,
        /// `mFrequency`.
        frequency: f32,
        /// `mVelMultiplier`, how much of the unit's velocity a joint's aim is carried by.
        vel_multiplier: f32,
        /// `OnlyActivateInTurns`.
        only_in_turns: bool,
        /// `ActivationAngle`, the bend of the unit's path that counts as a turn, in degrees.
        activation_angle: f32,
        /// `ActivationDistance`, how near a turn a joint turns whole.
        activation_distance: f32,
        /// `BlendDistance`, how far from a turn a joint stops turning.
        blend_distance: f32,
        /// `ExtraJointChains`.
        extra_chains: Vec<ExtraJointChain>,
    },
    /// `JointOrientationRigPoseModifierData`: joints turn to a direction a driver gives.
    JointOrientation {
        /// The hash path of the modifier under the skin object.
        path: String,
        /// `Joints`, the joints turned, in list order.
        joints: Vec<HashRef>,
        /// The class of `OrientationSource` as the tables name it, and none for a null pointer.
        source: Option<String>,
        /// `orientationType`: 0 the source is a direction, 1 a place each joint turns toward.
        orientation_type: u8,
        /// `PlaneConstraint`: the normal of the plane a joint turns in, 0 z, 1 y, 2 x.
        plane_constraint: u8,
        /// The axis the plane tilts about: 0 none, 1 x, 2 y, 3 z.
        tilt_axis: u8,
        /// The axis of the joint pointed along the direction: 0 none, 1 x, 2 y, 3 z.
        aim_axis: u8,
        /// The aim axis is the negative one.
        aim_negated: bool,
        /// The joint is turned half way round its normal first, and its tilt runs the other way.
        flipped: bool,
        /// The most a joint turns in its plane, in degrees.
        max_angle: f32,
        /// `DefaultOn`.
        default_on: bool,
    },
    /// `LockRootOrientationRigPoseModifierData`: a joint keeps its facing while the unit
    /// turns, for as long as a `LockRootOrientationEventData` of a clip runs.
    LockRootOrientation {
        /// The hash path of the modifier under the skin object.
        path: String,
    },
    /// `JointSnapRigPoseModifilerData`: a joint stands on another, for as long as a
    /// `JointSnapEventData` of a clip runs.
    JointSnap {
        /// The hash path of the modifier under the skin object.
        path: String,
    },
    /// `SyncedAnimationRigPoseModifierData`: the unit moves to the place it shares with the
    /// other units of a `SyncedAnimationEventData`.
    SyncedAnimation {
        /// The hash path of the modifier under the skin object.
        path: String,
    },
    /// `VertexAnimationRigPoseModifierData`: a spring on the unit's movement, whose change
    /// the pose carries to the mesh rather than to a joint.
    VertexAnimation {
        /// The hash path of the modifier under the skin object.
        path: String,
        /// `mMaxSpeed`.
        max_speed: f32,
        /// `mStiffness`.
        stiffness: f32,
        /// `mMass`.
        mass: f32,
        /// `mDamping`.
        damping: f32,
    },
    /// Any other kind, which the viewport simulates nothing for.
    Other {
        /// The hash path of the modifier under the skin object.
        path: String,
        /// The modifier's class as the tables name it, and its hash where none does.
        class: String,
    },
}

/// One `DynamicsJointTreeGroupData`: the trees sharing one set of parameters.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct JointTreeGroup {
    /// The hash path of the group under the skin object.
    pub path: String,
    /// `JointTrees`.
    pub trees: Vec<JointTree>,
    /// `ChainProperties`.
    pub properties: ChainProperties,
    /// Every curve is read over the longest branch of the group rather than of each tree.
    pub shared_curve_length: bool,
    /// `GenerateLateralLinks`.
    pub lateral_links: bool,
    /// `LateralLinkMaterial`, the compliance preset of the lateral links.
    pub lateral_link_material: u8,
    /// A segment's rest length is measured off the animated pose every step.
    pub rest_length_from_pose: bool,
    /// A joint with no simulated child collides with no radius.
    pub tips_without_radius: bool,
}

/// One `DynamicsJointTreeData`: a root joint and the joints under it left unsimulated.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct JointTree {
    /// The hash path of the tree under the skin object.
    pub path: String,
    /// `RootJointName`, and none for a tree naming no joint.
    pub root: Option<HashRef>,
    /// `ExcludeJointNames`.
    pub excluded: Vec<HashRef>,
}

/// `DynamicsChainProperties`, each parameter a value scaled by a curve along the tree.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct ChainProperties {
    /// `UseRodPhysics`.
    pub use_rod_physics: bool,
    /// `Damping`.
    pub damping: ScaledCurve,
    /// `AnimPoseAttraction`.
    pub attraction: ScaledCurve,
    /// `JointRadius`.
    pub radius: ScaledCurve,
    /// `Envelope`.
    pub envelope: ScaledCurve,
    /// `LimitAngle`, in degrees.
    pub limit_angle: ScaledCurve,
    /// `Stretch`.
    pub stretch: ScaledCurve,
    /// `RodBendStiffness`.
    pub rod_bend: ScaledCurve,
    /// `RodTwistStiffness`.
    pub rod_twist: ScaledCurve,
    /// `RodStretchStiffness`.
    pub rod_stretch: ScaledCurve,
    /// `RodShearStiffness`.
    pub rod_shear: ScaledCurve,
}

/// One `CurveScaledFloat`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct ScaledCurve {
    /// `value`, and the parameter's own default where the struct sets none.
    pub value: f32,
    /// `UseCurve`.
    pub use_curve: bool,
    /// `Curve`, and none for a null pointer.
    pub curve: Option<CurveKeys>,
}

/// One `CurveFloat`, its three lists as the file holds them.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct CurveKeys {
    /// `times`.
    pub times: Vec<f32>,
    /// `values`, which a cubic span takes four of.
    pub values: Vec<f32>,
    /// `InterpModes`, one per span.
    pub modes: Vec<u8>,
}

/// One entry of `SocketDefinitions`, of any kind of `SocketDefinitionBase`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum Socket {
    /// `SocketDefinitionSingleJoint`: a point riding one joint.
    SingleJoint {
        /// The hash path of the socket under the skin object.
        path: String,
        /// `name`, which a lookup by bone name finds the socket under.
        name: String,
        /// `ParentJoint`, and none for a socket naming no joint.
        parent: Option<HashRef>,
        /// `PositionOffset`, in the axes of the bind pose.
        position: [f32; 3],
        /// `RotationOffset`, Euler degrees.
        rotation: [f32; 3],
        /// `FreezePositionX`, `Y` and `Z`.
        freeze_position: [bool; 3],
        /// `FreezeRotationX`, `Y` and `Z`.
        freeze_rotation: [bool; 3],
    },
    /// `SocketDefinitionWorld`: a point riding the character's root.
    World {
        /// The hash path of the socket under the skin object.
        path: String,
        /// `name`.
        name: String,
        /// `PositionOffset`.
        position: [f32; 3],
    },
    /// Any other kind, which the viewport resolves nowhere.
    Other {
        /// The hash path of the socket under the skin object.
        path: String,
        /// `name`.
        name: String,
        /// The socket's class as the tables name it, and its hash where none does.
        class: String,
    },
}

/// Every pose modifier `mesh` lists, in list order, a null pointer passed over.
pub(super) fn pose_modifiers(mesh: Option<&Fields>, locator: &Locator) -> Vec<PoseModifier> {
    let list = HashPath::default()
        .field(MESH_PROPERTIES)
        .field(POSE_MODIFIERS);

    items(mesh.and_then(|mesh| mesh.get(&POSE_MODIFIERS)))
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let (class, fields) = struct_of(Some(item))?;
            let path = list.clone().index(index);

            Some(match class {
                SPRING => spring(fields, path, locator),
                DYNAMICS_CHAIN => dynamics_chain(fields, path, locator),
                CONFORM_TO_PATH => conform::conform_to_path(fields, path, locator),
                JOINT_ORIENTATION => orientation::joint_orientation(fields, path, locator),
                LOCK_ROOT_ORIENTATION => PoseModifier::LockRootOrientation { path: path.into() },
                JOINT_SNAP => PoseModifier::JointSnap { path: path.into() },
                SYNCED_ANIMATION => PoseModifier::SyncedAnimation { path: path.into() },
                VERTEX_ANIMATION => PoseModifier::VertexAnimation {
                    path: path.into(),
                    max_speed: float(fields.get(&VERTEX_MAX_SPEED)).unwrap_or(350.0),
                    stiffness: float(fields.get(&VERTEX_STIFFNESS)).unwrap_or(45.0),
                    mass: float(fields.get(&VERTEX_MASS)).unwrap_or(1.0),
                    damping: float(fields.get(&VERTEX_DAMPING)).unwrap_or(5.0),
                },
                _ => PoseModifier::Other {
                    path: path.into(),
                    class: class_name(class, locator),
                },
            })
        })
        .collect()
}

/// Every socket `mesh` lists, in list order, a null pointer passed over.
pub(super) fn sockets(mesh: Option<&Fields>, locator: &Locator) -> Vec<Socket> {
    let list = HashPath::default().field(MESH_PROPERTIES).field(SOCKETS);

    items(mesh.and_then(|mesh| mesh.get(&SOCKETS)))
        .iter()
        .enumerate()
        .filter_map(|(index, item)| {
            let (class, fields) = struct_of(Some(item))?;
            let path = String::from(list.clone().index(index));
            let name = text(fields.get(&NAME)).unwrap_or_default().to_owned();
            let position = vector3(fields.get(&SOCKET_POSITION)).unwrap_or_default();

            Some(match class {
                SOCKET_SINGLE_JOINT => Socket::SingleJoint {
                    path,
                    name,
                    parent: hash_at(fields.get(&SOCKET_PARENT), locator),
                    position,
                    rotation: vector3(fields.get(&SOCKET_ROTATION)).unwrap_or_default(),
                    freeze_position: FREEZE_POSITION.map(|field| flag(fields, field, false)),
                    freeze_rotation: FREEZE_ROTATION.map(|field| flag(fields, field, false)),
                },
                SOCKET_WORLD => Socket::World {
                    path,
                    name,
                    position,
                },
                _ => Socket::Other {
                    path,
                    name,
                    class: class_name(class, locator),
                },
            })
        })
        .collect()
}

fn spring(fields: &Fields, path: HashPath, locator: &Locator) -> PoseModifier {
    PoseModifier::Spring {
        path: path.into(),
        name: hash_at(fields.get(&NAME), locator),
        joint: hash_at(fields.get(&SPRING_JOINT), locator),
        mass: float(fields.get(&SPRING_MASS)).unwrap_or(0.1),
        stiffness: float(fields.get(&SPRING_STIFFNESS)).unwrap_or(2.5),
        damping: float(fields.get(&DAMPING)).unwrap_or(1.0),
        do_translation: flag(fields, SPRING_TRANSLATION, false),
        do_rotation: flag(fields, SPRING_ROTATION, false),
        max_distance: float(fields.get(&SPRING_MAX_DISTANCE)).unwrap_or(0.0),
        max_angle: float(fields.get(&SPRING_MAX_ANGLE)).unwrap_or(0.0),
        invert: flag(fields, SPRING_INVERT, false),
        default_on: flag(fields, DEFAULT_ON, true),
    }
}

fn dynamics_chain(fields: &Fields, path: HashPath, locator: &Locator) -> PoseModifier {
    let settings = fields_of(fields.get(&LOCAL_SETTINGS));
    let setting = |field: BinHash| settings.and_then(|settings| settings.get(&field));
    let groups = path.clone().field(TREE_GROUPS);

    PoseModifier::DynamicsChain {
        path: path.into(),
        default_on: flag(fields, DEFAULT_ON, true),
        global_envelope: float(fields.get(&GLOBAL_ENVELOPE)).unwrap_or(1.0),
        gravity_scale: float(setting(GRAVITY_SCALE)).unwrap_or(1.0),
        gravity_override: vector3(optional(setting(GRAVITY_OVERRIDE))),
        collider_file: locator.asset(fields.get(&COLLIDER_FILE)),
        groups: items(fields.get(&TREE_GROUPS))
            .iter()
            .enumerate()
            .filter_map(|(index, item)| {
                Some(tree_group(
                    fields_of(Some(item))?,
                    groups.clone().index(index),
                    locator,
                ))
            })
            .collect(),
    }
}

fn tree_group(fields: &Fields, path: HashPath, locator: &Locator) -> JointTreeGroup {
    let trees = path.clone().field(JOINT_TREES);

    JointTreeGroup {
        path: path.into(),
        trees: items(fields.get(&JOINT_TREES))
            .iter()
            .enumerate()
            .filter_map(|(index, item)| {
                let tree = fields_of(Some(item))?;

                Some(JointTree {
                    path: trees.clone().index(index).into(),
                    root: hash_at(tree.get(&TREE_ROOT), locator),
                    excluded: items(tree.get(&TREE_EXCLUDED))
                        .iter()
                        .filter_map(|joint| hash_at(Some(joint), locator))
                        .collect(),
                })
            })
            .collect(),
        properties: chain_properties(fields_of(fields.get(&CHAIN_PROPERTIES))),
        shared_curve_length: flag(fields, SHARED_CURVE_LENGTH, false),
        lateral_links: flag(fields, LATERAL_LINKS, false),
        lateral_link_material: unsigned(fields.get(&LATERAL_LINK_MATERIAL))
            .and_then(|material| u8::try_from(material).ok())
            .unwrap_or(DEFAULT_LINK_MATERIAL),
        rest_length_from_pose: flag(fields, REST_LENGTH_FROM_POSE, true),
        tips_without_radius: flag(fields, TIPS_WITHOUT_RADIUS, false),
    }
}

/// The chain parameters of `fields`, each at the game's default where the struct sets none.
fn chain_properties(fields: Option<&Fields>) -> ChainProperties {
    let curve = |field: BinHash, default: f32| {
        scaled_curve(fields.and_then(|fields| fields.get(&field)), default)
    };

    ChainProperties {
        use_rod_physics: fields.is_some_and(|fields| flag(fields, USE_ROD_PHYSICS, false)),
        damping: curve(DAMPING, 0.5),
        attraction: curve(ATTRACTION, 0.5),
        radius: curve(JOINT_RADIUS, 5.0),
        envelope: curve(ENVELOPE, 1.0),
        limit_angle: curve(LIMIT_ANGLE, 180.0),
        stretch: curve(STRETCH, 0.0),
        rod_bend: curve(ROD_BEND, 1.0),
        rod_twist: curve(ROD_TWIST, 1.0),
        rod_stretch: curve(ROD_STRETCH, 1.0),
        rod_shear: curve(ROD_SHEAR, 1.0),
    }
}

fn scaled_curve(value: Option<&PropertyValueEnum>, default: f32) -> ScaledCurve {
    let fields = fields_of(value);
    let field = |field: BinHash| fields.and_then(|fields| fields.get(&field));

    ScaledCurve {
        value: float(field(CURVE_VALUE)).unwrap_or(default),
        use_curve: boolean(field(USE_CURVE)).unwrap_or(true),
        curve: fields_of(field(CURVE)).map(|curve| CurveKeys {
            times: floats(curve.get(&CURVE_TIMES)),
            values: floats(curve.get(&CURVE_VALUES)),
            modes: items(curve.get(&CURVE_MODES))
                .iter()
                .filter_map(|mode| unsigned(Some(mode)).and_then(|mode| u8::try_from(mode).ok()))
                .collect(),
        }),
    }
}

fn floats(value: Option<&PropertyValueEnum>) -> Vec<f32> {
    items(value)
        .iter()
        .filter_map(|item| float(Some(item)))
        .collect()
}

fn flag(fields: &Fields, field: BinHash, default: bool) -> bool {
    boolean(fields.get(&field)).unwrap_or(default)
}

#[cfg(test)]
mod tests;
