use ltk_manager_bin::bin_document::hex;
use ltk_meta::property::values;

use super::*;
use crate::skin::dynamics::fixtures::{
    class, embedded, h, hash, modifier_path, modifiers, number, on,
};

fn hash_of(joint: &Option<HashRef>) -> Option<String> {
    joint.as_ref().map(|joint| joint.hash.clone())
}

#[test]
fn a_conform_reads_its_chain_and_the_fields_it_sets() {
    let extra = embedded(
        "ExtraJointChainData",
        vec![
            (EXTRA_STARTING_JOINT, hash("L_Tail1")),
            (EXTRA_ENDING_JOINT, hash("L_Tail10")),
            (RIGHT_BIAS, number(0.5)),
        ],
    );
    let skin = modifiers(vec![class(
        "ConformToPathRigPoseModifierData",
        vec![
            (STARTING_JOINT, hash("Main_Tail1")),
            (ENDING_JOINT, hash("Main_Tail10")),
            (DEFAULT_MASK, hash("TailMask")),
            (MAX_BONE_ANGLE, number(90.0)),
            (VEL_MULTIPLIER, number(-1.0)),
            (ONLY_IN_TURNS, on()),
            (EXTRA_CHAINS, values::Container::from(vec![extra]).into()),
        ],
    )]);

    let [
        PoseModifier::ConformToPath {
            path,
            start,
            end,
            default_mask,
            max_bone_angle,
            vel_multiplier,
            only_in_turns,
            extra_chains,
            ..
        },
    ] = skin.pose_modifiers.as_slice()
    else {
        panic!("one conform to path, not {:?}", skin.pose_modifiers);
    };
    assert_eq!(*path, modifier_path(0));
    assert_eq!(hash_of(start), Some(hex(h("Main_Tail1"))));
    assert_eq!(hash_of(end), Some(hex(h("Main_Tail10"))));
    assert_eq!(hash_of(default_mask), Some(hex(h("TailMask"))));
    assert_eq!((*max_bone_angle, *vel_multiplier), (90.0, -1.0));
    assert!(*only_in_turns);
    assert_eq!(extra_chains.len(), 1);
    assert_eq!(hash_of(&extra_chains[0].start), Some(hex(h("L_Tail1"))));
    assert_eq!(hash_of(&extra_chains[0].end), Some(hex(h("L_Tail10"))));
    assert_eq!(extra_chains[0].right_bias, 0.5);
}

#[test]
fn a_conform_leaves_what_it_does_not_set_at_the_constructors_values() {
    let skin = modifiers(vec![class("ConformToPathRigPoseModifierData", vec![])]);

    assert_eq!(
        skin.pose_modifiers,
        vec![PoseModifier::ConformToPath {
            path: modifier_path(0),
            start: None,
            end: None,
            default_mask: None,
            max_bone_angle: 65.0,
            damping: 10.0,
            frequency: 10.0,
            vel_multiplier: -0.5,
            only_in_turns: false,
            activation_angle: 0.5,
            activation_distance: 200.0,
            blend_distance: 400.0,
            extra_chains: vec![],
        }]
    );
}

#[test]
fn every_named_field_hash_is_the_one_the_meta_lists() {
    assert_eq!(STARTING_JOINT, h("mStartingJointName"));
    assert_eq!(EXTRA_STARTING_JOINT, h("StartingJointName"));
    assert_eq!(ONLY_IN_TURNS, h("OnlyActivateInTurns"));
}
