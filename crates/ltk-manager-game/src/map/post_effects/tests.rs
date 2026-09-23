use glam::Vec4;
use ltk_meta::PropertyValueEnum;
use ltk_meta::property::values;

use super::*;
use crate::map::fixtures::{document_of, embedded, h, map_container, placeable};

const BASE_SRX: &str = "Maps/MapGeometry/Map11/Base_SRX";

fn post_effects(options: Option<Vec<(BinHash, PropertyValueEnum)>>) -> PropertyValueEnum {
    let fields = options
        .map(|options| vec![(OPTIONS, embedded("PostEffectOptions", options))])
        .unwrap_or_default();
    values::Struct {
        class_hash: POST_EFFECTS,
        properties: fields.into_iter().collect(),
    }
    .into()
}

#[test]
fn the_named_field_hashes_are_their_names() {
    assert_eq!(h("options"), OPTIONS);
    assert_eq!(h("DepthFog"), DEPTH_FOG.enabled);
    assert_eq!(h("DepthFogColor"), DEPTH_FOG.color);
    assert_eq!(h("DepthFogStart"), DEPTH_FOG.start);
    assert_eq!(h("DepthFogEnd"), DEPTH_FOG.end);
    assert_eq!(h("DepthFogMaxIntensity"), DEPTH_FOG.max_intensity);
    assert_eq!(h("HeightFog"), HEIGHT_FOG.enabled);
    assert_eq!(h("HeightFogColor"), HEIGHT_FOG.color);
    assert_eq!(h("HeightFogStart"), HEIGHT_FOG.start);
    assert_eq!(h("HeightFogEnd"), HEIGHT_FOG.end);
    assert_eq!(h("HeightFogMaxIntensity"), HEIGHT_FOG.max_intensity);
    assert_eq!(h("Dof"), DOF);
    assert_eq!(h("FocalDistance"), FOCAL_DISTANCE);
    assert_eq!(h("InFocusWidth"), IN_FOCUS_WIDTH);
    assert_eq!(h("Coc"), COC);
}

#[test]
fn a_container_answers_the_options_its_component_states() {
    let document = document_of(vec![map_container(
        BASE_SRX,
        vec![
            placeable("MapSunProperties", vec![]),
            post_effects(Some(vec![
                (DEPTH_FOG.enabled, values::Bool::new(true).into()),
                (
                    DEPTH_FOG.color,
                    values::Vector4::new(Vec4::new(0.5, 0.6, 0.7, 1.0)).into(),
                ),
                (HEIGHT_FOG.start, values::F32::new(120.0).into()),
                (DOF, values::Bool::new(true).into()),
                (COC, values::F32::new(4.0).into()),
            ])),
        ],
    )]);

    let effects = map_post_effects(&document, &MapPath::from(BASE_SRX))
        .expect("the container states post effects");

    let stated = MapPostEffects::default();
    assert!(effects.depth_fog.enabled);
    assert_eq!(effects.depth_fog.color, [0.5, 0.6, 0.7, 1.0]);
    assert_eq!(effects.height_fog.start, 120.0);
    assert!(effects.depth_of_field.enabled);
    assert_eq!(effects.depth_of_field.coc, 4.0);
    assert_eq!(
        effects.depth_of_field.focal_distance, stated.depth_of_field.focal_distance,
        "a field the map leaves out reads as the class default"
    );
    assert!(!effects.height_fog.enabled);
}

#[test]
fn a_component_without_options_answers_the_class_defaults() {
    let document = document_of(vec![map_container(BASE_SRX, vec![post_effects(None)])]);

    assert_eq!(
        map_post_effects(&document, &MapPath::from(BASE_SRX)),
        Some(MapPostEffects::default())
    );
}

#[test]
fn a_container_with_no_post_effect_component_answers_none() {
    let document = document_of(vec![map_container(
        BASE_SRX,
        vec![placeable("MapSunProperties", vec![])],
    )]);

    assert_eq!(map_post_effects(&document, &MapPath::from(BASE_SRX)), None);
}
