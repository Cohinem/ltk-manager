use super::*;

fn texts(items: &[&str]) -> Vec<String> {
    items.iter().map(|&item| item.to_owned()).collect()
}

#[test]
fn compose_vo_names_writes_each_tag_then_its_spells() {
    let names = compose_vo_names(
        &texts(&["Ahri", "AhriSkin04"]),
        &texts(&["AhriQ"]),
        "cast3D",
    );

    assert_eq!(
        names,
        texts(&[
            "Play_vo_Ahri_cast3D",
            "Play_vo_Ahri_AhriQ_cast3D",
            "Play_vo_AhriSkin04_cast3D",
            "Play_vo_AhriSkin04_AhriQ_cast3D",
        ])
    );
}

#[test]
fn compose_vo_names_is_empty_without_tags() {
    assert!(compose_vo_names(&[], &texts(&["LuxR"]), "cast3D").is_empty());
}

#[test]
fn spell_segment_takes_last_path_segment() {
    assert_eq!(
        spell_segment("Characters/Lux/Spells/LuxLightBindingAbility/LuxLightBinding"),
        "LuxLightBinding"
    );
    assert_eq!(spell_segment("LuxR"), "LuxR");
}
