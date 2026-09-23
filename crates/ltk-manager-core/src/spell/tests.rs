use super::*;
use ltk_meta::{Bin, BinObject, property::values};
use std::io::Cursor;

#[test]
fn animation_names_remain_written_values_without_a_missile() {
    let named = read(vec![(
        "mAnimationName",
        values::String::from("Spell1").into(),
    )]);
    assert_eq!(named.animation_name.as_deref(), Some("Spell1"));
    assert_eq!(named.missile, None);
    assert_eq!(read(vec![]).animation_name, None);
    let empty = read(vec![("mAnimationName", values::String::from("").into())]);
    assert_eq!(empty.animation_name.as_deref(), Some(""));
    let malformed = read(vec![("mAnimationName", values::F32::new(1.0).into())]);
    assert_eq!(malformed.animation_name, None);
    assert_eq!(malformed.issues[0].path, "mSpell.mAnimationName");
    assert_eq!(malformed.issues[0].kind, SpellIssueKind::Invalid);
}

fn pointer(class: &str, fields: Vec<(&str, PropertyValueEnum)>) -> PropertyValueEnum {
    values::Struct {
        class_hash: h(class),
        properties: fields
            .into_iter()
            .map(|(name, value)| (h(name), value))
            .collect(),
    }
    .into()
}

fn read(fields: Vec<(&str, PropertyValueEnum)>) -> SpellPreview {
    let object = BinObject::builder(h("Spell"), h("SpellObject"))
        .property(h("mSpell"), pointer("SpellDataResource", fields))
        .build();
    let bin = Bin::new([object], std::iter::empty::<&str>());
    let mut bytes = Cursor::new(Vec::new());
    bin.to_writer(&mut bytes).unwrap();
    let document = BinDocument::parse(bytes.into_inner()).unwrap();
    read_spell(&document, h("Spell")).unwrap()
}

fn missile(
    class: &str,
    fields: Vec<(&str, PropertyValueEnum)>,
) -> Vec<(&'static str, PropertyValueEnum)> {
    vec![(
        "mMissileSpec",
        pointer(
            "MissileSpecification",
            vec![("movementComponent", pointer(class, fields))],
        ),
    )]
}

#[test]
fn a_missile_keeps_its_own_speed_and_omitted_delay() {
    let mut fields = missile(
        "FixedSpeedMovement",
        vec![
            ("mSpeed", values::F32::new(5000.0).into()),
            ("mTargetBoneName", values::String::from("r_hand").into()),
        ],
    );
    fields.push(("missileSpeed", values::F32::new(2.0).into()));
    let read = read(fields);
    let missile = read.missile.unwrap();
    assert_eq!(
        missile.movement,
        MissileMovement::FixedSpeed {
            speed: Some(5000.0)
        }
    );
    assert_eq!(missile.start_delay, None);
    assert_eq!(missile.target_bone.as_deref(), Some("r_hand"));
    assert!(read.issues.is_empty());
}

#[test]
fn fixed_time_and_explicit_zero_remain_distinct_from_missing_values() {
    let read = read(missile(
        "FixedTimeMovement",
        vec![
            ("mTravelTime", values::F32::new(0.5).into()),
            ("mStartDelay", values::F32::new(0.0).into()),
        ],
    ));
    let missile = read.missile.unwrap();
    assert_eq!(
        missile.movement,
        MissileMovement::FixedTime {
            duration: Some(0.5)
        }
    );
    assert_eq!(missile.start_delay, Some(0.0));
}

#[test]
fn unknown_movements_are_not_straight_paths_and_non_finite_inputs_are_diagnosed() {
    let read = read(missile(
        "PhysicsMovement",
        vec![("mStartDelay", values::F32::new(f32::NAN).into())],
    ));
    assert!(matches!(
        read.missile.unwrap().movement,
        MissileMovement::Unsupported { .. }
    ));
    assert_eq!(read.issues[0].kind, SpellIssueKind::Invalid);
    assert!(read.issues[0].path.ends_with("mStartDelay"));
}

#[test]
fn absent_missiles_and_malformed_payloads_do_not_produce_a_rig() {
    assert!(read(vec![]).missile.is_none());
    let read = read(vec![("mMissileSpec", values::F32::new(1.0).into())]);
    assert!(read.missile.is_none());
    assert_eq!(read.issues[0].kind, SpellIssueKind::Invalid);
}

#[test]
fn composite_effect_keys_are_invalid_instead_of_absent() {
    let read = read(vec![("mMissileEffectKey", pointer("InvalidKey", vec![]))]);
    assert_eq!(read.effect_key, None);
    assert_eq!(read.issues[0].path, "mSpell.mMissileEffectKey");
    assert_eq!(read.issues[0].kind, SpellIssueKind::Invalid);
}

#[test]
fn effect_keys_remain_keys_and_arrival_behaviors_are_reported() {
    let read = read(vec![
        ("mMissileEffectKey", values::Hash::new(h("Flight")).into()),
        (
            "mMissileSpec",
            pointer(
                "MissileSpecification",
                vec![(
                    "behaviors",
                    values::Container::new(
                        ltk_meta::PropertyKind::Struct,
                        vec![pointer("CastOnMovementComplete", vec![])],
                    )
                    .unwrap()
                    .into(),
                )],
            ),
        ),
    ]);
    assert_eq!(read.effect_key, Some(hex(h("Flight"))));
    assert_eq!(read.issues[0].path, "mSpell.mMissileSpec.behaviors");
    assert_eq!(read.issues[0].kind, SpellIssueKind::Unsupported);
}

fn ranks(values: &[f32]) -> PropertyValueEnum {
    values::Container::new(
        ltk_meta::PropertyKind::F32,
        values
            .iter()
            .map(|value| values::F32::new(*value).into())
            .collect(),
    )
    .unwrap()
    .into()
}

#[test]
fn cast_suggestions_keep_written_values_and_rank_zero() {
    let range = [0.0, 825.0, 900.0, 1000.0, 1100.0, 1200.0, 1300.0];
    let embedded = values::Embedded(values::Struct {
        class_hash: BinHash(0x0a0e_ddc9),
        properties: [(h("values"), ranks(&range))].into_iter().collect(),
    });
    let spell = read(vec![
        ("spellCastTime", values::F32::new(0.25).into()),
        ("mCastTime", values::F32::new(0.0).into()),
        ("bHaveHitEffect", values::Bool::new(false).into()),
        ("mHitEffectKey", values::Hash::new(h("Hit")).into()),
        ("mHitEffectName", values::String::from("Hit").into()),
        ("mMissileEffectName", values::String::from("Flight").into()),
        ("castRangeDisplayOverride", ranks(&range)),
        ("castRange", ranks(&range)),
        ("castRangeValues", embedded.into()),
        ("castRadius", ranks(&range)),
        ("castRadiusSecondary", ranks(&range)),
        ("castConeAngle", values::F32::new(45.0).into()),
        ("castConeDistance", values::F32::new(400.0).into()),
    ]);
    assert_eq!(spell.spell_cast_time, Some(0.25));
    assert_eq!(spell.cast_time, Some(0.0));
    assert_eq!(spell.have_hit_effect, Some(false));
    assert_eq!(spell.hit_effect_key, Some(hex(h("Hit"))));
    assert_eq!(spell.hit_effect_name.as_deref(), Some("Hit"));
    assert_eq!(spell.effect_name.as_deref(), Some("Flight"));
    for values in [
        spell.cast_range_display,
        spell.cast_range,
        spell.cast_range_values,
        spell.cast_radius,
        spell.cast_radius_secondary,
    ] {
        assert_eq!(values, Some(range.to_vec()));
    }
    assert_eq!(spell.cast_cone_angle, Some(45.0));
    assert_eq!(spell.cast_cone_distance, Some(400.0));
    assert!(spell.issues.is_empty());
}

#[test]
fn malformed_suggestions_do_not_create_valid_defaults() {
    let spell = read(vec![
        ("spellCastTime", values::F32::new(f32::NAN).into()),
        ("bHaveHitEffect", values::F32::new(1.0).into()),
        ("castRange", ranks(&[1.0, 2.0])),
        ("castRadius", ranks(&[f32::INFINITY; 7])),
        ("castRangeValues", pointer("WrongClass", vec![])),
        ("mHitEffectKey", values::String::from("Hit").into()),
    ]);
    assert_eq!(spell.spell_cast_time, None);
    assert_eq!(spell.have_hit_effect, None);
    assert_eq!(spell.cast_range, None);
    assert_eq!(spell.cast_radius, None);
    assert_eq!(spell.cast_range_values, None);
    assert_eq!(spell.hit_effect_key, None);
    assert_eq!(spell.issues.len(), 6);
    assert!(
        spell
            .issues
            .iter()
            .all(|issue| issue.kind == SpellIssueKind::Invalid)
    );
    assert_eq!(read(vec![]), SpellPreview::default());
}
