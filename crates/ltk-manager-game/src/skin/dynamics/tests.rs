use ltk_manager_bin::bin_document::hex;
use ltk_meta::property::{Kind, values};

use super::fixtures::{
    class, document, embedded, h, hash, mesh_path, modifier_path, modifiers, named_ref, number,
    numbers, off, on, read, skin_with, unnamed_ref, vector,
};
use super::*;

mod edits;

const COLLIDERS: &str = "ASSETS/Characters/Ahri/Skins/Skin03/Ahri_Skin03.colliders";

/// A damping that falls along the tree, on one linear span and one stepped span.
fn falling_damping() -> PropertyValueEnum {
    embedded(
        "CurveScaledFloat",
        vec![
            (CURVE_VALUE, number(0.8)),
            (USE_CURVE, on()),
            (
                CURVE,
                class(
                    "CurveFloat",
                    vec![
                        (CURVE_TIMES, numbers(&[0.0, 0.5, 1.0])),
                        (CURVE_VALUES, numbers(&[1.0, 0.5, 0.25])),
                        (
                            CURVE_MODES,
                            values::Container::from(vec![values::U8::new(0), values::U8::new(1)])
                                .into(),
                        ),
                    ],
                )
                .into(),
            ),
        ],
    )
    .into()
}

fn chain() -> values::Struct {
    let tree = embedded(
        "DynamicsJointTreeData",
        vec![
            (TREE_ROOT, hash("Hair_Root")),
            (
                TREE_EXCLUDED,
                values::Container::from(vec![values::Hash::new(h("Hair_Clip"))]).into(),
            ),
        ],
    );
    let group = embedded(
        "DynamicsJointTreeGroupData",
        vec![
            (
                CHAIN_PROPERTIES,
                embedded(
                    "DynamicsChainProperties",
                    vec![
                        (USE_ROD_PHYSICS, on()),
                        (DAMPING, falling_damping()),
                        (
                            STRETCH,
                            embedded(
                                "CurveScaledFloat",
                                vec![(CURVE_VALUE, number(0.2)), (USE_CURVE, off())],
                            )
                            .into(),
                        ),
                    ],
                )
                .into(),
            ),
            (JOINT_TREES, values::Container::from(vec![tree]).into()),
            (SHARED_CURVE_LENGTH, on()),
            (LATERAL_LINKS, on()),
            (LATERAL_LINK_MATERIAL, values::U8::new(4).into()),
            (REST_LENGTH_FROM_POSE, off()),
        ],
    );

    class(
        "DynamicsChainRigPoseModifierData",
        vec![
            (
                LOCAL_SETTINGS,
                embedded(
                    "PhysicsSimLocalSettings",
                    vec![
                        (GRAVITY_SCALE, number(0.5)),
                        (
                            GRAVITY_OVERRIDE,
                            values::Optional::new(Kind::Vector3, Some(vector(0.0, -500.0, 0.0)))
                                .unwrap()
                                .into(),
                        ),
                    ],
                )
                .into(),
            ),
            (COLLIDER_FILE, values::String::from(COLLIDERS).into()),
            (TREE_GROUPS, values::Container::from(vec![group]).into()),
            (GLOBAL_ENVELOPE, number(0.75)),
            (DEFAULT_ON, off()),
        ],
    )
}

fn spring() -> values::Struct {
    class(
        "SpringPhysicsRigPoseModifierData",
        vec![
            (NAME, hash("Pauldron")),
            (SPRING_JOINT, hash("L_Pauldron")),
            (SPRING_MASS, number(0.25)),
            (SPRING_STIFFNESS, number(4.0)),
            (DAMPING, number(0.5)),
            (SPRING_ROTATION, on()),
            (SPRING_MAX_ANGLE, number(30.0)),
        ],
    )
}

#[test]
fn a_dynamics_chain_reads_every_field_it_sets() {
    let skin = modifiers(vec![chain()]);

    let [
        PoseModifier::DynamicsChain {
            path,
            default_on,
            global_envelope,
            gravity_scale,
            gravity_override,
            collider_file,
            groups,
        },
    ] = skin.pose_modifiers.as_slice()
    else {
        panic!("one dynamics chain is read");
    };

    let modifier = modifier_path(0);
    assert_eq!(*path, modifier);
    assert!(!default_on);
    assert!((global_envelope - 0.75).abs() < f32::EPSILON);
    assert!((gravity_scale - 0.5).abs() < f32::EPSILON);
    assert_eq!(*gravity_override, Some([0.0, -500.0, 0.0]));
    assert_eq!(
        collider_file.as_ref().map(|file| file.path.as_str()),
        Some(COLLIDERS)
    );

    let [group] = groups.as_slice() else {
        panic!("one group is read");
    };
    let group_path = format!("{modifier}.{:08x}[0]", TREE_GROUPS.0);
    assert_eq!(group.path, group_path);
    assert!(group.shared_curve_length);
    assert!(group.lateral_links);
    assert_eq!(group.lateral_link_material, 4);
    assert!(!group.rest_length_from_pose);
    assert!(!group.tips_without_radius);
    assert_eq!(
        group.trees,
        vec![JointTree {
            path: format!("{group_path}.{:08x}[0]", JOINT_TREES.0),
            root: named_ref("Hair_Root"),
            excluded: vec![unnamed_ref("Hair_Clip").unwrap()],
        }]
    );

    let properties = &group.properties;
    assert!(properties.use_rod_physics);
    assert_eq!(
        properties.damping,
        ScaledCurve {
            value: 0.8,
            use_curve: true,
            curve: Some(CurveKeys {
                times: vec![0.0, 0.5, 1.0],
                values: vec![1.0, 0.5, 0.25],
                modes: vec![0, 1],
            }),
        }
    );
    assert_eq!(
        properties.stretch,
        ScaledCurve {
            value: 0.2,
            use_curve: false,
            curve: None,
        }
    );
}

#[test]
fn a_chain_that_sets_nothing_answers_the_games_defaults() {
    let bare = class(
        "DynamicsChainRigPoseModifierData",
        vec![(
            TREE_GROUPS,
            values::Container::from(vec![embedded("DynamicsJointTreeGroupData", vec![])]).into(),
        )],
    );

    let skin = modifiers(vec![bare]);

    let [
        PoseModifier::DynamicsChain {
            default_on,
            global_envelope,
            gravity_scale,
            gravity_override,
            collider_file,
            groups,
            ..
        },
    ] = skin.pose_modifiers.as_slice()
    else {
        panic!("one dynamics chain is read");
    };
    assert!(default_on);
    assert!((global_envelope - 1.0).abs() < f32::EPSILON);
    assert!((gravity_scale - 1.0).abs() < f32::EPSILON);
    assert_eq!(*gravity_override, None);
    assert_eq!(*collider_file, None);

    let group = &groups[0];
    assert!(group.trees.is_empty());
    assert!(group.rest_length_from_pose);
    assert_eq!(group.lateral_link_material, DEFAULT_LINK_MATERIAL);

    let values = |curve: &ScaledCurve| (curve.value, curve.use_curve, curve.curve.clone());
    let properties = &group.properties;
    assert!(!properties.use_rod_physics);
    assert_eq!(values(&properties.damping), (0.5, true, None));
    assert_eq!(values(&properties.attraction), (0.5, true, None));
    assert_eq!(values(&properties.radius), (5.0, true, None));
    assert_eq!(values(&properties.envelope), (1.0, true, None));
    assert_eq!(values(&properties.limit_angle), (180.0, true, None));
    assert_eq!(values(&properties.stretch), (0.0, true, None));
    assert_eq!(values(&properties.rod_bend), (1.0, true, None));
    assert_eq!(values(&properties.rod_twist), (1.0, true, None));
    assert_eq!(values(&properties.rod_stretch), (1.0, true, None));
    assert_eq!(values(&properties.rod_shear), (1.0, true, None));
}

#[test]
fn a_spring_reads_its_joint_and_the_defaults_it_leaves_out() {
    let skin = modifiers(vec![spring()]);

    assert_eq!(
        skin.pose_modifiers,
        vec![PoseModifier::Spring {
            path: modifier_path(0),
            name: unnamed_ref("Pauldron"),
            joint: named_ref("L_Pauldron"),
            mass: 0.25,
            stiffness: 4.0,
            damping: 0.5,
            do_translation: false,
            do_rotation: true,
            max_distance: 0.0,
            max_angle: 30.0,
            invert: false,
            default_on: true,
        }]
    );
}

#[test]
fn a_modifier_keeps_its_place_in_the_list_past_a_null_and_an_unknown_kind() {
    let null = values::Struct {
        class_hash: BinHash(0),
        properties: Default::default(),
    };
    let unknown = class("LaterRigPoseModifierData", vec![]);

    let skin = modifiers(vec![null, unknown, spring()]);

    let list = mesh_path(&format!("{:08x}", POSE_MODIFIERS.0));
    assert_eq!(skin.pose_modifiers.len(), 2);
    assert_eq!(
        skin.pose_modifiers[0],
        PoseModifier::Other {
            path: format!("{list}[1]"),
            class: "LaterRigPoseModifierData".to_owned(),
        }
    );
    assert!(matches!(
        &skin.pose_modifiers[1],
        PoseModifier::Spring { path, .. } if *path == format!("{list}[2]")
    ));
}

#[test]
fn a_socket_reads_by_its_kind() {
    let single = class(
        "SocketDefinitionSingleJoint",
        vec![
            (NAME, values::String::from("HeadTop").into()),
            (SOCKET_PARENT, hash("Head")),
            (SOCKET_POSITION, vector(0.0, 12.0, 0.0)),
            (SOCKET_ROTATION, vector(90.0, 0.0, 0.0)),
            (FREEZE_POSITION[1], on()),
            (FREEZE_ROTATION[2], on()),
        ],
    );
    let world = class(
        "SocketDefinitionWorld",
        vec![
            (NAME, values::String::from("Overhead").into()),
            (SOCKET_POSITION, vector(0.0, 200.0, 0.0)),
        ],
    );
    let other = class(
        "SocketDefinitionUnknown",
        vec![(NAME, values::String::from("Odd").into())],
    );

    let skin = skin_with(vec![(
        SOCKETS,
        values::Container::from(vec![single, world, other]).into(),
    )]);

    let list = mesh_path(&format!("{:08x}", SOCKETS.0));
    assert_eq!(
        skin.sockets,
        vec![
            Socket::SingleJoint {
                path: format!("{list}[0]"),
                name: "HeadTop".to_owned(),
                parent: named_ref("Head"),
                position: [0.0, 12.0, 0.0],
                rotation: [90.0, 0.0, 0.0],
                freeze_position: [false, true, false],
                freeze_rotation: [false, false, true],
            },
            Socket::World {
                path: format!("{list}[1]"),
                name: "Overhead".to_owned(),
                position: [0.0, 200.0, 0.0],
            },
            Socket::Other {
                path: format!("{list}[2]"),
                name: "Odd".to_owned(),
                class: hex(h("SocketDefinitionUnknown")),
            },
        ]
    );
}

#[test]
fn every_other_class_of_modifier_reads_as_its_own_kind() {
    let skin = modifiers(vec![
        class("LockRootOrientationRigPoseModifierData", vec![]),
        class("JointSnapRigPoseModifilerData", vec![]),
        class("SyncedAnimationRigPoseModifierData", vec![]),
        class(
            "VertexAnimationRigPoseModifierData",
            vec![(VERTEX_STIFFNESS, number(60.0))],
        ),
    ]);

    assert_eq!(
        skin.pose_modifiers,
        vec![
            PoseModifier::LockRootOrientation {
                path: modifier_path(0)
            },
            PoseModifier::JointSnap {
                path: modifier_path(1)
            },
            PoseModifier::SyncedAnimation {
                path: modifier_path(2)
            },
            PoseModifier::VertexAnimation {
                path: modifier_path(3),
                max_speed: 350.0,
                stiffness: 60.0,
                mass: 1.0,
                damping: 5.0,
            },
        ]
    );
}

#[test]
fn a_skin_with_no_mesh_properties_lists_neither() {
    let skin = read(&document(None));

    assert!(skin.pose_modifiers.is_empty());
    assert!(skin.sockets.is_empty());
}

#[test]
fn every_named_field_hash_is_the_one_the_meta_lists() {
    /* The names behind these are hash cracks, so the hash is what the reader was traced by. */
    assert_eq!(TREE_GROUPS.0, 0x23d9_01d3);
    assert_eq!(JOINT_TREES.0, 0xb0f7_7798);
    assert_eq!(TREE_ROOT.0, 0xc11c_69b4);
    assert_eq!(TREE_EXCLUDED.0, 0xea59_c349);
    assert_eq!(GLOBAL_ENVELOPE.0, 0xbdaa_6f16);
    assert_eq!(LOCAL_SETTINGS.0, 0xc20b_2e61);
    assert_eq!(GRAVITY_SCALE.0, 0x97f2_e0f1);
    assert_eq!(GRAVITY_OVERRIDE.0, 0xbc01_6dbd);
    assert_eq!(ATTRACTION.0, 0xcb22_ec08);
    assert_eq!(USE_ROD_PHYSICS.0, 0x6e48_edbe);
    assert_eq!(LATERAL_LINKS.0, 0x3cc9_ab8a);
    assert_eq!(LATERAL_LINK_MATERIAL.0, 0x1027_8985);
    assert_eq!(ROD_BEND.0, 0x583d_67c2);
    assert_eq!(ROD_TWIST.0, 0xb055_bd6a);
    assert_eq!(ROD_STRETCH.0, 0x967e_8270);
    assert_eq!(ROD_SHEAR.0, 0xd30c_e0f0);
    assert_eq!(SOCKET_SINGLE_JOINT.0, 0xddf1_7bcb);
    assert_eq!(SOCKET_WORLD.0, 0x165b_1803);
    assert_eq!(
        FREEZE_POSITION.map(|field| field.0),
        [0x5fce_2dff, 0x5ece_2c6c, 0x61ce_3125]
    );
    assert_eq!(
        FREEZE_ROTATION.map(|field| field.0),
        [0xdcbf_a078, 0xddbf_a20b, 0xdebf_a39e]
    );
    assert_eq!(DYNAMICS_CHAIN.0, 0x0918_8776);
}
