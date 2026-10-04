use ltk_manager_bin::bin_document::hex;
use ltk_meta::property::values;

use super::*;
use crate::skin::HashRef;
use crate::skin::dynamics::fixtures::{byte, class, h, modifier_path, modifiers, number, off, on};

#[test]
fn a_joint_orientation_reads_its_joints_its_source_and_the_fields_it_sets() {
    let skin = modifiers(vec![class(
        "JointOrientationRigPoseModifierData",
        vec![
            (
                JOINTS,
                values::Container::from(vec![
                    values::Hash::new(h("Head")),
                    values::Hash::new(h("L_Pauldron")),
                ])
                .into(),
            ),
            (SOURCE, class("LaterRigPoseModifierData", vec![]).into()),
            (ORIENTATION_TYPE, byte(1)),
            (PLANE_CONSTRAINT, byte(2)),
            (TILT_AXIS, byte(2)),
            (AIM_AXIS, byte(1)),
            (AIM_NEGATED, off()),
            (FLIPPED, on()),
            (MAX_ANGLE, number(45.0)),
            (DEFAULT_ON, off()),
        ],
    )]);

    assert_eq!(
        skin.pose_modifiers,
        vec![PoseModifier::JointOrientation {
            path: modifier_path(0),
            joints: vec![
                HashRef {
                    name: "Head".to_owned(),
                    hash: hex(h("Head")),
                },
                HashRef {
                    name: "L_Pauldron".to_owned(),
                    hash: hex(h("L_Pauldron")),
                },
            ],
            source: Some("LaterRigPoseModifierData".to_owned()),
            orientation_type: 1,
            plane_constraint: 2,
            tilt_axis: 2,
            aim_axis: 1,
            aim_negated: false,
            flipped: true,
            max_angle: 45.0,
            default_on: false,
        }]
    );
}

#[test]
fn a_joint_orientation_leaves_what_it_does_not_set_at_the_constructors_values() {
    let skin = modifiers(vec![class("JointOrientationRigPoseModifierData", vec![])]);

    assert_eq!(
        skin.pose_modifiers,
        vec![PoseModifier::JointOrientation {
            path: modifier_path(0),
            joints: vec![],
            source: None,
            orientation_type: 0,
            plane_constraint: 1,
            tilt_axis: 0,
            aim_axis: 3,
            aim_negated: true,
            flipped: false,
            max_angle: 180.0,
            default_on: true,
        }]
    );
}
