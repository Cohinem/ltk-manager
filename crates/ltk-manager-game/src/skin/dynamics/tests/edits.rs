//! The staged edits the skeleton pane and the sections send, applied to a bare skin and
//! read back, which checks their shape and the shipped schema's cover of it.
//!
//! Each list mirrors a function of `src/modules/workshop/bin/skin/utils/dynamicsEdits.ts`.

use ltk_manager_bin::bin_document::{BinDocument, LeafValue, NewItem, ValueEdit};
use ltk_manager_bin::meta_schema::MetaSchema;

use super::*;
use crate::skin::dynamics::fixtures::SKIN;

fn seg(field: BinHash) -> String {
    format!("{:08x}", field.0)
}

fn ensure(path: &str, field: BinHash) -> ValueEdit {
    ValueEdit::EnsureProperty {
        path: path.to_owned(),
        field: hex(field),
    }
}

fn insert(path: &str, index: usize, class: Option<&str>) -> ValueEdit {
    ValueEdit::InsertItem {
        path: path.to_owned(),
        item: NewItem {
            index: Some(index),
            key: None,
            class: class.map(str::to_owned),
        },
    }
}

fn set(path: String, value: LeafValue) -> ValueEdit {
    ValueEdit::SetLeaf { path, value }
}

fn joint(name: &str) -> LeafValue {
    LeafValue::Hash {
        text: name.to_owned(),
    }
}

fn bare_document() -> BinDocument {
    document(None)
}

fn apply(document: &mut BinDocument, edits: Vec<ValueEdit>) {
    let schema = MetaSchema::shipped();
    document
        .edit_property(h(SKIN), "", &hex(MESH_PROPERTIES), edits, schema.at(None))
        .unwrap();
}

/// The edits of `simulateFromEdits` on a skin with no chain: a chain, a group and a tree.
fn simulate_from(root: &str) -> Vec<ValueEdit> {
    let list = seg(POSE_MODIFIERS);
    let chain = format!("{list}[0]");
    let groups = format!("{chain}.{}", seg(TREE_GROUPS));
    let group = format!("{groups}[0]");
    let trees = format!("{group}.{}", seg(JOINT_TREES));
    let tree = format!("{trees}[0]");

    vec![
        ensure("", POSE_MODIFIERS),
        insert(&list, 0, Some("DynamicsChainRigPoseModifierData")),
        ensure(&chain, TREE_GROUPS),
        insert(&groups, 0, Some("DynamicsJointTreeGroupData")),
        ensure(&group, JOINT_TREES),
        insert(&trees, 0, Some("DynamicsJointTreeData")),
        ensure(&tree, TREE_ROOT),
        set(format!("{tree}.{}", seg(TREE_ROOT)), joint(root)),
    ]
}

#[test]
fn simulating_from_a_joint_adds_a_chain_a_group_and_a_tree_in_one_edit() {
    let mut document = bare_document();

    apply(&mut document, simulate_from("Hair_Root"));

    let skin = read(&document);
    let [PoseModifier::DynamicsChain { groups, .. }] = skin.pose_modifiers.as_slice() else {
        panic!("one dynamics chain is read");
    };
    assert_eq!(groups[0].trees[0].root, named_ref("Hair_Root"));
    assert!((groups[0].properties.damping.value - 0.5).abs() < f32::EPSILON);
}

#[test]
fn a_parameter_a_curve_and_an_excluded_joint_are_set_on_a_group() {
    let mut document = bare_document();
    apply(&mut document, simulate_from("Hair_Root"));

    let group = format!("{}[0].{}[0]", seg(POSE_MODIFIERS), seg(TREE_GROUPS));
    let tree = format!("{group}.{}[0]", seg(JOINT_TREES));
    let properties = format!("{group}.{}", seg(CHAIN_PROPERTIES));
    let damping = format!("{properties}.{}", seg(DAMPING));
    let curve = format!("{damping}.{}", seg(CURVE));
    let times = format!("{curve}.{}", seg(CURVE_TIMES));
    let values = format!("{curve}.{}", seg(CURVE_VALUES));
    let excluded = format!("{tree}.{}", seg(TREE_EXCLUDED));

    apply(
        &mut document,
        vec![
            ensure(&group, CHAIN_PROPERTIES),
            ensure(&properties, DAMPING),
            ensure(&damping, CURVE_VALUE),
            set(
                format!("{damping}.{}", seg(CURVE_VALUE)),
                LeafValue::Float { value: 0.25 },
            ),
        ],
    );
    apply(
        &mut document,
        vec![
            ensure(&group, CHAIN_PROPERTIES),
            ensure(&properties, DAMPING),
            ensure(&damping, USE_CURVE),
            set(
                format!("{damping}.{}", seg(USE_CURVE)),
                LeafValue::Bool { value: true },
            ),
            ensure(&damping, CURVE),
            ValueEdit::EnsurePointer {
                path: curve.clone(),
                class: "CurveFloat".to_owned(),
            },
            ensure(&curve, CURVE_TIMES),
            ensure(&curve, CURVE_VALUES),
            insert(&times, 0, None),
            set(format!("{times}[0]"), LeafValue::Float { value: 0.0 }),
            insert(&values, 0, None),
            set(format!("{values}[0]"), LeafValue::Float { value: 1.0 }),
            insert(&times, 1, None),
            set(format!("{times}[1]"), LeafValue::Float { value: 1.0 }),
            insert(&values, 1, None),
            set(format!("{values}[1]"), LeafValue::Float { value: 1.0 }),
        ],
    );
    apply(
        &mut document,
        vec![
            ensure(&tree, TREE_EXCLUDED),
            insert(&excluded, 0, None),
            set(format!("{excluded}[0]"), joint("Hair_Clip")),
        ],
    );

    let skin = read(&document);
    let [PoseModifier::DynamicsChain { groups, .. }] = skin.pose_modifiers.as_slice() else {
        panic!("one dynamics chain is read");
    };
    assert_eq!(
        groups[0].properties.damping,
        ScaledCurve {
            value: 0.25,
            use_curve: true,
            curve: Some(CurveKeys {
                times: vec![0.0, 1.0],
                values: vec![1.0, 1.0],
                modes: vec![],
            }),
        }
    );
    assert_eq!(
        groups[0].trees[0].excluded,
        vec![unnamed_ref("Hair_Clip").unwrap()]
    );
}

#[test]
fn a_spring_and_a_socket_are_added_on_a_joint() {
    let mut document = bare_document();
    let modifiers = seg(POSE_MODIFIERS);
    let spring = format!("{modifiers}[0]");
    let sockets = seg(SOCKETS);
    let socket = format!("{sockets}[0]");

    apply(
        &mut document,
        vec![
            ensure("", POSE_MODIFIERS),
            insert(&modifiers, 0, Some("SpringPhysicsRigPoseModifierData")),
            ensure(&spring, SPRING_JOINT),
            set(
                format!("{spring}.{}", seg(SPRING_JOINT)),
                joint("L_Pauldron"),
            ),
            ensure(&spring, SPRING_TRANSLATION),
            set(
                format!("{spring}.{}", seg(SPRING_TRANSLATION)),
                LeafValue::Bool { value: true },
            ),
        ],
    );
    apply(
        &mut document,
        vec![
            ensure("", SOCKETS),
            insert(&sockets, 0, Some("SocketDefinitionSingleJoint")),
            ensure(&socket, NAME),
            set(
                format!("{socket}.{}", seg(NAME)),
                LeafValue::String {
                    value: "Head_Socket".to_owned(),
                },
            ),
            ensure(&socket, SOCKET_PARENT),
            set(format!("{socket}.{}", seg(SOCKET_PARENT)), joint("Head")),
        ],
    );
    apply(
        &mut document,
        vec![
            ensure(&socket, SOCKET_POSITION),
            set(
                format!("{socket}.{}", seg(SOCKET_POSITION)),
                LeafValue::Vector {
                    values: vec![0.0, 12.0, 0.0],
                },
            ),
            ensure(&socket, FREEZE_POSITION[1]),
            set(
                format!("{socket}.{}", seg(FREEZE_POSITION[1])),
                LeafValue::Bool { value: true },
            ),
        ],
    );

    let skin = read(&document);
    assert!(matches!(
        skin.pose_modifiers.as_slice(),
        [PoseModifier::Spring { joint, do_translation: true, .. }] if *joint == named_ref("L_Pauldron")
    ));
    assert_eq!(
        skin.sockets,
        vec![Socket::SingleJoint {
            path: format!("{}.{socket}", seg(MESH_PROPERTIES)),
            name: "Head_Socket".to_owned(),
            parent: named_ref("Head"),
            position: [0.0, 12.0, 0.0],
            rotation: [0.0, 0.0, 0.0],
            freeze_position: [false, true, false],
            freeze_rotation: [false, false, false],
        }]
    );
}

#[test]
fn removing_a_tree_and_a_socket_takes_each_out_of_its_list() {
    let mut document = bare_document();
    apply(&mut document, simulate_from("Hair_Root"));
    apply(
        &mut document,
        vec![
            ensure("", SOCKETS),
            insert(&seg(SOCKETS), 0, Some("SocketDefinitionSingleJoint")),
        ],
    );
    assert_eq!(read(&document).sockets.len(), 1);
    let tree = format!(
        "{}[0].{}[0].{}[0]",
        seg(POSE_MODIFIERS),
        seg(TREE_GROUPS),
        seg(JOINT_TREES)
    );
    let socket = format!("{}[0]", seg(SOCKETS));

    apply(&mut document, vec![ValueEdit::RemoveItem { path: tree }]);
    apply(&mut document, vec![ValueEdit::RemoveItem { path: socket }]);

    let skin = read(&document);
    let [PoseModifier::DynamicsChain { groups, .. }] = skin.pose_modifiers.as_slice() else {
        panic!("the chain stays");
    };
    assert!(groups[0].trees.is_empty());
    assert!(skin.sockets.is_empty());
}

#[test]
fn a_collider_file_is_named_on_the_chain() {
    let mut document = bare_document();
    apply(&mut document, simulate_from("Hair_Root"));
    let chain = format!("{}[0]", seg(POSE_MODIFIERS));

    apply(
        &mut document,
        vec![
            ensure(&chain, COLLIDER_FILE),
            set(
                format!("{chain}.{}", seg(COLLIDER_FILE)),
                LeafValue::String {
                    value: "ASSETS/Characters/Ahri/Skins/Base/Ahri.colliders".to_owned(),
                },
            ),
        ],
    );

    let skin = read(&document);
    let [PoseModifier::DynamicsChain { collider_file, .. }] = skin.pose_modifiers.as_slice() else {
        panic!("one dynamics chain is read");
    };
    assert_eq!(
        collider_file.as_ref().map(|file| file.path.as_str()),
        Some("ASSETS/Characters/Ahri/Skins/Base/Ahri.colliders")
    );
}

/// The edits of `addModifierEdits`: a modifier of `class` at `index`, at its defaults.
fn add_modifier(index: usize, class: &str) -> Vec<ValueEdit> {
    vec![
        ensure("", POSE_MODIFIERS),
        insert(&seg(POSE_MODIFIERS), index, Some(class)),
    ]
}

#[test]
fn a_modifier_of_every_class_is_added_at_its_defaults_and_removed() {
    let classes = [
        "DynamicsChainRigPoseModifierData",
        "SpringPhysicsRigPoseModifierData",
        "ConformToPathRigPoseModifierData",
        "JointOrientationRigPoseModifierData",
        "LockRootOrientationRigPoseModifierData",
        "JointSnapRigPoseModifilerData",
        "SyncedAnimationRigPoseModifierData",
        "VertexAnimationRigPoseModifierData",
    ];
    let mut document = bare_document();

    for (index, class) in classes.iter().enumerate() {
        apply(&mut document, add_modifier(index, class));
    }

    let skin = read(&document);
    assert_eq!(skin.pose_modifiers.len(), classes.len());
    assert!(
        skin.pose_modifiers
            .iter()
            .all(|modifier| !matches!(modifier, PoseModifier::Other { .. })),
        "every class reads as its own kind: {:?}",
        skin.pose_modifiers
    );
    assert!(matches!(
        skin.pose_modifiers[7],
        PoseModifier::VertexAnimation { max_speed, .. } if max_speed == 350.0
    ));

    /* `removeEdits` on each, the last first, leaves the list empty. */
    for index in (0..classes.len()).rev() {
        apply(
            &mut document,
            vec![ValueEdit::RemoveItem {
                path: format!("{}[{index}]", seg(POSE_MODIFIERS)),
            }],
        );
    }
    assert!(read(&document).pose_modifiers.is_empty());
}

#[test]
fn a_joint_orientation_takes_a_joint_and_a_source_and_gives_them_back() {
    let orientation = format!("{}[0]", seg(POSE_MODIFIERS));
    let joints = format!("{orientation}.{}", seg(orientation::JOINTS));
    let source = format!("{orientation}.{}", seg(orientation::SOURCE));
    let mut document = bare_document();

    /* `addOrientationEdits`: the modifier, then its first joint. */
    let mut edits = add_modifier(0, "JointOrientationRigPoseModifierData");
    edits.extend([
        ensure(&orientation, orientation::JOINTS),
        insert(&joints, 0, None),
        set(format!("{joints}[0]"), joint("Head")),
    ]);
    apply(&mut document, edits);

    /* `orientationSourceEdits` with a class no table names. */
    apply(
        &mut document,
        vec![
            ensure(&orientation, orientation::SOURCE),
            ValueEdit::ReplacePointer {
                path: source.clone(),
                class: Some("0x19da44b2".to_owned()),
            },
        ],
    );

    let skin = read(&document);
    let [
        PoseModifier::JointOrientation {
            joints: held,
            source: class,
            ..
        },
    ] = skin.pose_modifiers.as_slice()
    else {
        panic!("one joint orientation, not {:?}", skin.pose_modifiers);
    };
    assert_eq!(held.len(), 1);
    assert_eq!(held[0].hash, hex(h("Head")));
    assert_eq!(class.as_deref(), Some("0x19da44b2"));

    /* The joint is removed and the source cleared. */
    apply(
        &mut document,
        vec![ValueEdit::RemoveItem {
            path: format!("{joints}[0]"),
        }],
    );
    apply(
        &mut document,
        vec![
            ensure(&orientation, orientation::SOURCE),
            ValueEdit::ReplacePointer {
                path: source,
                class: None,
            },
        ],
    );

    let skin = read(&document);
    assert!(matches!(
        skin.pose_modifiers.as_slice(),
        [PoseModifier::JointOrientation { joints, source: None, .. }] if joints.is_empty()
    ));
}
