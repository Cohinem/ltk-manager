use ltk_meta::PropertyValueEnum;
use ltk_meta::property::values;

use super::*;
use crate::map::fixtures::{document_of, embedded, h, map_container, placeable};

const CREPE: &str = "Maps/MapGeometry/Map12/Crepe";

fn ssao(settings: Option<Vec<(BinHash, PropertyValueEnum)>>) -> PropertyValueEnum {
    let renderer = settings
        .map(|settings| {
            vec![(
                RENDERER,
                embedded(
                    "MapSSAORenderer",
                    vec![(SETTINGS, embedded("MapSSAOSettings", settings))],
                ),
            )]
        })
        .unwrap_or_default();
    placeable("MapSSAO", renderer)
}

#[test]
fn the_named_hashes_are_their_names() {
    assert_eq!(h("MapSSAO"), MAP_SSAO);
    assert_eq!(h("MapSSAORenderer"), RENDERER);
    assert_eq!(h("settings"), SETTINGS);
    assert_eq!(h("SampleQuality"), SAMPLE_QUALITY);
    assert_eq!(h("SampleRadius"), SAMPLE_RADIUS);
    assert_eq!(h("Bias"), BIAS);
    assert_eq!(h("power"), POWER);
    assert_eq!(h("intensity"), INTENSITY);
    assert_eq!(h("BufferScale"), BUFFER_SCALE);
    assert_eq!(h("EdgeAwareBlur"), EDGE_AWARE_BLUR);
}

#[test]
fn a_container_answers_the_settings_its_component_states() {
    let document = document_of(vec![map_container(
        CREPE,
        vec![
            placeable("MapSunProperties", vec![]),
            ssao(Some(vec![
                (SAMPLE_QUALITY, values::U32::new(1).into()),
                (SAMPLE_RADIUS, values::F32::new(75.0).into()),
                (POWER, values::F32::new(20.0).into()),
                (EDGE_AWARE_BLUR, values::Bool::new(false).into()),
            ])),
        ],
    )]);

    let ssao = map_ssao(&document, &MapPath::from(CREPE)).expect("the container states SSAO");

    assert_eq!(
        ssao,
        MapSsao {
            sample_quality: 1,
            sample_radius: 75.0,
            power: 20.0,
            edge_aware_blur: false,
            ..MapSsao::default()
        },
        "a field the map leaves out reads as the class default"
    );
}

#[test]
fn a_component_without_settings_answers_the_class_defaults() {
    let document = document_of(vec![map_container(CREPE, vec![ssao(None)])]);

    assert_eq!(
        map_ssao(&document, &MapPath::from(CREPE)),
        Some(MapSsao::default())
    );
}

#[test]
fn a_container_with_no_ssao_component_answers_none() {
    let document = document_of(vec![map_container(
        CREPE,
        vec![placeable("MapSunProperties", vec![])],
    )]);

    assert_eq!(map_ssao(&document, &MapPath::from(CREPE)), None);
}
