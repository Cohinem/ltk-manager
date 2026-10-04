//! `JointOrientationRigPoseModifierData`: joints that turn to a direction a driver gives.
//!
//! Each default is the one the class's constructor writes. Five of its fields are named by
//! no table, and each is documented by what the game does with it.

use ltk_hash::BinHash;
use ltk_manager_base::hashing::named;

use ltk_manager_bin::bin_document::{Fields, HashPath, Locator, float, items, struct_of, unsigned};

use super::{DEFAULT_ON, PoseModifier, class_name, flag, hash_at};

/// `JointOrientationRigPoseModifierData.Joints`.
pub(super) const JOINTS: BinHash = named("Joints");
/// `JointOrientationRigPoseModifierData.OrientationSource`.
pub(super) const SOURCE: BinHash = named("OrientationSource");
/// `JointOrientationRigPoseModifierData.orientationType`.
const ORIENTATION_TYPE: BinHash = named("orientationType");
/// `JointOrientationRigPoseModifierData.PlaneConstraint`.
const PLANE_CONSTRAINT: BinHash = named("PlaneConstraint");
/// The axis the plane tilts about.
const TILT_AXIS: BinHash = BinHash(0xa57f_0269);
/// The axis of the joint that is pointed along the direction.
const AIM_AXIS: BinHash = BinHash(0xae1c_bd5f);
/// The aim axis is the negative one.
const AIM_NEGATED: BinHash = BinHash(0x5772_2010);
/// The joint is turned half way round its normal first, and its tilt runs the other way.
const FLIPPED: BinHash = BinHash(0x1a30_a486);
/// The most a joint turns in its plane, in degrees.
const MAX_ANGLE: BinHash = BinHash(0x420b_233d);

pub(super) fn joint_orientation(
    fields: &Fields,
    path: HashPath,
    locator: &Locator,
) -> PoseModifier {
    let byte = |field: BinHash, default: u8| {
        unsigned(fields.get(&field))
            .and_then(|value| u8::try_from(value).ok())
            .unwrap_or(default)
    };

    PoseModifier::JointOrientation {
        path: path.into(),
        joints: items(fields.get(&JOINTS))
            .iter()
            .filter_map(|joint| hash_at(Some(joint), locator))
            .collect(),
        source: struct_of(fields.get(&SOURCE)).map(|(class, _)| class_name(class, locator)),
        orientation_type: byte(ORIENTATION_TYPE, 0),
        plane_constraint: byte(PLANE_CONSTRAINT, 1),
        tilt_axis: byte(TILT_AXIS, 0),
        aim_axis: byte(AIM_AXIS, 3),
        aim_negated: flag(fields, AIM_NEGATED, true),
        flipped: flag(fields, FLIPPED, false),
        max_angle: float(fields.get(&MAX_ANGLE)).unwrap_or(180.0),
        default_on: flag(fields, DEFAULT_ON, true),
    }
}

#[cfg(test)]
mod tests;
