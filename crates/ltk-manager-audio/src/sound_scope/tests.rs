use super::*;
use crate::bank_set::BankUnit;
use crate::bin_audio::{BinAudio, SitedUnit};

fn unit(name: &str, events: &[&str]) -> SitedUnit {
    BankUnit {
        name: name.to_owned(),
        events: events.iter().map(|event| (*event).to_owned()).collect(),
        ..BankUnit::default()
    }
    .into()
}

fn index(bins: &[(&str, Vec<SitedUnit>)]) -> AudioIndex {
    let mut builder = AudioIndex::builder();
    for (bin, units) in bins {
        let mut audio = BinAudio::default();
        audio.units.clone_from(units);
        audio.event_names = units
            .iter()
            .flat_map(|sited| sited.unit.events.clone())
            .collect();
        builder.add_bin(bin, audio);
    }
    builder.build()
}

#[test]
fn scope_bins_reads_matching_skin_then_base() {
    assert_eq!(
        scope_bins("DATA/Characters/Lux/Animations/Skin7.bin"),
        [
            "data/characters/lux/skins/skin7.bin",
            "data/characters/lux/skins/skin0.bin"
        ]
    );
    assert_eq!(
        scope_bins("data/characters/lux/skins/skin0.bin"),
        ["data/characters/lux/skins/skin0.bin"]
    );
}

#[test]
fn scope_bins_reads_base_skin_for_bin_without_skin_number() {
    assert_eq!(
        scope_bins("data/characters/lux/lux.bin"),
        ["data/characters/lux/skins/skin0.bin"]
    );
}

#[test]
fn scope_bins_is_empty_outside_characters() {
    assert!(scope_bins("data/maps/shipping/map11/map11.bin").is_empty());
}

#[test]
fn scoped_units_prefers_first_index_that_declares_bin() {
    let skin = "data/characters/lux/skins/skin7.bin";
    let base = "data/characters/lux/skins/skin0.bin";
    let project = index(&[(
        skin,
        vec![unit("Lux_Skin07_SFX", &["Play_sfx_LuxSkin07_Q"])],
    )]);
    let game = index(&[
        (skin, vec![unit("Lux_Skin07_SFX", &["Play_sfx_Old"])]),
        (
            base,
            vec![
                unit("Lux_Base_SFX", &["Play_sfx_Lux_Q"]),
                unit("Empty", &[]),
            ],
        ),
    ]);

    let units = scoped_units(&scope_bins(skin), &[&project, &game]);

    let names: Vec<&str> = units.iter().map(|each| each.unit.name.as_str()).collect();
    assert_eq!(names, ["Lux_Skin07_SFX", "Lux_Base_SFX"]);
    assert_eq!(units[0].unit.events, ["Play_sfx_LuxSkin07_Q"]);
}

#[test]
fn search_events_matches_every_term_shortest_first() {
    let game = index(&[(
        "data/characters/lux/skins/skin0.bin",
        vec![unit(
            "Lux_Base_SFX",
            &[
                "Play_sfx_Lux_LuxLightBinding_OnCast",
                "Play_sfx_Lux_LuxQ_OnCast",
                "Play_sfx_Lux_LuxR_hit",
            ],
        )],
    )]);

    let found = game.search_events("lux oncast", 1);

    assert_eq!(found.names, ["Play_sfx_Lux_LuxQ_OnCast"]);
    assert_eq!(found.total, 2);
    assert_eq!(game.search_events("  ", 10), EventMatches::default());
}
