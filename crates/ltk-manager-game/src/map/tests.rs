use super::*;

#[test]
fn a_map_path_derives_each_of_its_files_by_lowercasing_under_the_data_prefix() {
    let map = MapPath::from("Maps/MapGeometry/Map11/Base_SRX");

    assert_eq!(
        map.geometry(),
        "data/maps/mapgeometry/map11/base_srx.mapgeo"
    );
    assert_eq!(
        map.materials(),
        "data/maps/mapgeometry/map11/base_srx.materials.bin"
    );
    assert_eq!(
        map.as_str(),
        "Maps/MapGeometry/Map11/Base_SRX",
        "the entry path keeps the spelling a bin carries"
    );
}

#[test]
fn a_map_path_is_a_plain_string_on_the_wire() {
    let map = MapPath::from("Maps/MapGeometry/Map11/Base_SRX");
    let json = serde_json::to_string(&map).unwrap();

    assert_eq!(json, "\"Maps/MapGeometry/Map11/Base_SRX\"");
    assert_eq!(serde_json::from_str::<MapPath>(&json).unwrap(), map);
}

#[test]
fn an_unresolved_map_answers_one_material_per_path_asked_for() {
    let paths = ["a".to_owned(), "b".to_owned(), "c".to_owned()];

    assert_eq!(unresolved_map(&paths).materials.len(), 3);
    assert!(unresolved_map(&paths).materials.iter().all(Option::is_none));
    assert!(unresolved_map(&[]).materials.is_empty());
}
