use super::*;

const ARCHIVE: &str = "Ahri.wad.client";

fn shapes() -> ColliderShapes {
    ColliderShapes {
        spheres: vec![ColliderSphere {
            joint: "Head".to_owned(),
            centre: [0.0, 150.0, 2.0],
            radius: 12.0,
        }],
        capsules: vec![ColliderCapsule {
            joint_a: "Neck".to_owned(),
            end_a: [0.0, 140.0, 0.0],
            radius_a: 6.0,
            joint_b: "Chest".to_owned(),
            end_b: [0.0, 120.0, 0.0],
            radius_b: 14.0,
        }],
    }
}

/// One end as the file holds it: the joint's name behind its length, a point and a radius.
fn end(joint: &str, values: [f32; 4]) -> Vec<u8> {
    let mut out = u32::try_from(joint.len()).unwrap().to_le_bytes().to_vec();
    out.extend_from_slice(joint.as_bytes());
    for value in values {
        out.extend_from_slice(&value.to_le_bytes());
    }

    out
}

/// The bytes `src/modules/viewport/dynamics/__tests__/colliderFile.test.ts` reads back.
#[test]
fn a_sphere_is_two_unused_words_a_count_and_a_named_end() {
    let bytes = collider_bytes(&ColliderShapes {
        spheres: vec![ColliderSphere {
            joint: "Head".to_owned(),
            centre: [1.0, 2.0, 3.0],
            radius: 0.5,
        }],
        capsules: vec![],
    })
    .unwrap();

    let mut expected = vec![0; 8];
    expected.extend_from_slice(&1_u32.to_le_bytes());
    expected.extend(end("Head", [1.0, 2.0, 3.0, 0.5]));
    expected.extend_from_slice(&0_u32.to_le_bytes());
    assert_eq!(bytes, expected);
}

#[test]
fn a_capsule_is_two_ends_after_the_spheres() {
    let bytes = collider_bytes(&shapes()).unwrap();

    let mut expected = vec![0; 8];
    expected.extend_from_slice(&1_u32.to_le_bytes());
    expected.extend(end("Head", [0.0, 150.0, 2.0, 12.0]));
    expected.extend_from_slice(&1_u32.to_le_bytes());
    expected.extend(end("Neck", [0.0, 140.0, 0.0, 6.0]));
    expected.extend(end("Chest", [0.0, 120.0, 0.0, 14.0]));
    assert_eq!(bytes, expected);
}

#[test]
fn saving_writes_the_file_in_the_archive_under_the_lowercase_path() {
    let project = tempfile::tempdir().unwrap();

    let saved = save_colliders(
        project.path(),
        "base",
        ARCHIVE,
        "ASSETS/Characters/Ahri/Skins/Base/Ahri.colliders",
        &shapes(),
    )
    .unwrap();

    assert_eq!(
        saved,
        "Ahri.wad.client/assets/characters/ahri/skins/base/ahri.colliders"
    );
    let file = project.path().join("content/base").join(saved);
    assert_eq!(fs::read(file).unwrap(), collider_bytes(&shapes()).unwrap());
}

#[test]
fn saving_again_replaces_the_file_and_leaves_no_other_beside_it() {
    let project = tempfile::tempdir().unwrap();
    save_colliders(project.path(), "base", ARCHIVE, "a.colliders", &shapes()).unwrap();

    save_colliders(
        project.path(),
        "base",
        ARCHIVE,
        "a.colliders",
        &ColliderShapes::default(),
    )
    .unwrap();

    let folder = project.path().join("content/base").join(ARCHIVE);
    assert_eq!(fs::read(folder.join("a.colliders")).unwrap().len(), 16);
    assert_eq!(fs::read_dir(folder).unwrap().count(), 1);
}

#[test]
fn a_path_that_leaves_the_archive_is_refused() {
    let project = tempfile::tempdir().unwrap();

    for path in ["", "../outside.colliders", "/rooted.colliders", "a/../../b"] {
        assert!(
            matches!(
                save_colliders(project.path(), "base", ARCHIVE, path, &shapes()),
                Err(AppError::InvalidPath(_))
            ),
            "{path:?} is refused"
        );
    }
}
