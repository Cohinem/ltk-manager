//! `ConformToPathRigPoseModifierData`: a chain of joints that turns to trail the unit.
//!
//! Each default is the one the class's constructor writes.

use ltk_hash::BinHash;
use ltk_manager_base::hashing::named;
use serde::Serialize;

use ltk_manager_bin::bin_document::{Fields, HashPath, Locator, fields_of, float, items};

use super::{HashRef, PoseModifier, flag, hash_at};

/// `ConformToPathRigPoseModifierData.mStartingJointName`.
const STARTING_JOINT: BinHash = named("mStartingJointName");
/// `ConformToPathRigPoseModifierData.mEndingJointName`.
const ENDING_JOINT: BinHash = named("mEndingJointName");
/// `ConformToPathRigPoseModifierData.mDefaultMaskName`.
const DEFAULT_MASK: BinHash = named("mDefaultMaskName");
/// `ConformToPathRigPoseModifierData.mMaxBoneAngle`.
const MAX_BONE_ANGLE: BinHash = named("mMaxBoneAngle");
/// `ConformToPathRigPoseModifierData.mDampingValue`.
const DAMPING_VALUE: BinHash = named("mDampingValue");
/// `ConformToPathRigPoseModifierData.mFrequency`.
const FREQUENCY: BinHash = named("mFrequency");
/// `ConformToPathRigPoseModifierData.mVelMultiplier`.
const VEL_MULTIPLIER: BinHash = named("mVelMultiplier");
/// `ConformToPathRigPoseModifierData.OnlyActivateInTurns`.
const ONLY_IN_TURNS: BinHash = named("OnlyActivateInTurns");
/// `ConformToPathRigPoseModifierData.ActivationAngle`.
const ACTIVATION_ANGLE: BinHash = named("ActivationAngle");
/// `ConformToPathRigPoseModifierData.ActivationDistance`.
const ACTIVATION_DISTANCE: BinHash = named("ActivationDistance");
/// `ConformToPathRigPoseModifierData.BlendDistance`.
const BLEND_DISTANCE: BinHash = named("BlendDistance");
/// `ConformToPathRigPoseModifierData.ExtraJointChains`.
const EXTRA_CHAINS: BinHash = named("ExtraJointChains");

/// `ExtraJointChainData.StartingJointName`.
const EXTRA_STARTING_JOINT: BinHash = named("StartingJointName");
/// `ExtraJointChainData.EndingJointName`.
const EXTRA_ENDING_JOINT: BinHash = named("EndingJointName");
/// `ExtraJointChainData.RightBias`.
const RIGHT_BIAS: BinHash = named("RightBias");

/// One `ExtraJointChainData`: a second chain turned by the angles of the first.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct ExtraJointChain {
    /// `StartingJointName`, the joint nearest the root.
    pub start: Option<HashRef>,
    /// `EndingJointName`.
    pub end: Option<HashRef>,
    /// `RightBias`, how much of each angle's size is taken off it, most at the start.
    pub right_bias: f32,
}

pub(super) fn conform_to_path(fields: &Fields, path: HashPath, locator: &Locator) -> PoseModifier {
    let joint = |field: BinHash| hash_at(fields.get(&field), locator);
    let number = |field: BinHash, default: f32| float(fields.get(&field)).unwrap_or(default);

    PoseModifier::ConformToPath {
        path: path.into(),
        start: joint(STARTING_JOINT),
        end: joint(ENDING_JOINT),
        default_mask: joint(DEFAULT_MASK),
        max_bone_angle: number(MAX_BONE_ANGLE, 65.0),
        damping: number(DAMPING_VALUE, 10.0),
        frequency: number(FREQUENCY, 10.0),
        vel_multiplier: number(VEL_MULTIPLIER, -0.5),
        only_in_turns: flag(fields, ONLY_IN_TURNS, false),
        activation_angle: number(ACTIVATION_ANGLE, 0.5),
        activation_distance: number(ACTIVATION_DISTANCE, 200.0),
        blend_distance: number(BLEND_DISTANCE, 400.0),
        extra_chains: items(fields.get(&EXTRA_CHAINS))
            .iter()
            .filter_map(|item| {
                let chain = fields_of(Some(item))?;

                Some(ExtraJointChain {
                    start: hash_at(chain.get(&EXTRA_STARTING_JOINT), locator),
                    end: hash_at(chain.get(&EXTRA_ENDING_JOINT), locator),
                    right_bias: float(chain.get(&RIGHT_BIAS)).unwrap_or(0.0),
                })
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests;
