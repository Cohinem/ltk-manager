use super::*;

#[test]
fn character_spells_include_nested_objects_and_match_whole_segments_in_any_case() {
    let (_tmp, index) = named_index(&[
        ("Characters/Sejuani/Spells/SejuaniEAbility", "SpellObject"),
        (
            "Characters/Sejuani/Spells/SejuaniEAbility/SejuaniEPassiveMissile",
            "SpellObject",
        ),
        ("characters/sejuani/spells/Flat2", "SpellObject"),
        ("characters/sejuani/spells/Flat10", "SpellObject"),
        ("Characters/Sejuani/Spells/Deep/Folder/Child", "SpellObject"),
        ("Characters/Sejuani/Spells/Resolver", "ResourceResolver"),
        ("Characters/Sejuani/SpellsExtra/Wrong", "SpellObject"),
        ("Characters/SejuaniExtra/Spells/Wrong", "SpellObject"),
        ("Characters/Other/Spells/Wrong", "SpellObject"),
    ]);
    let catalog = index.character_spells("SEJUANI");
    assert_eq!(
        catalog
            .spells
            .iter()
            .map(|spell| (spell.name.as_str(), spell.group.as_deref()))
            .collect::<Vec<_>>(),
        [
            ("Deep/Folder/Child", Some("Deep")),
            ("Flat2", None),
            ("Flat10", None),
            ("SejuaniEAbility", None),
            (
                "SejuaniEAbility/SejuaniEPassiveMissile",
                Some("SejuaniEAbility")
            ),
        ]
    );
    assert_eq!(catalog.unnamed, 0);
    assert!(index.character_spells("Sejuani/Spells").spells.is_empty());
    assert!(index.character_spells("").spells.is_empty());
}

#[test]
fn character_spells_keep_every_declaration_even_with_unknown_or_conflicting_class_names() {
    let path = "Characters/Sejuani/Spells/E/Missile";
    let first: &[Chunk<'_>] = &[("data/first.bin", prop(&[(path, "ResourceResolver")]))];
    let second: &[Chunk<'_>] = &[("data/second.bin", prop(&[(path, "SpellObject")]))];
    let (_tmp, index) = build(&[("A.wad.client", first), ("B.wad.client", second)], 1);
    let index = index.named(&TestNames::over(&[path], &[]));
    let catalog = index.character_spells("Sejuani");
    assert_eq!(catalog.spells.len(), 1);
    let spell = &catalog.spells[0];
    assert_eq!(spell.object_hash, hex(BinHash::hash_str(path)));
    assert_eq!(spell.declarations.len(), 2);
    assert_eq!(spell.declarations[0].file, "data/first.bin");
    assert_eq!(spell.declarations[1].file, "data/second.bin");
    assert_eq!(spell.declarations[1].class_hash, "0x5e7e5a06");
}

#[test]
fn unnamed_spells_are_counted_without_assigning_them_to_a_character() {
    let chunks: &[Chunk<'_>] = &[(
        "data/spells.bin",
        prop(&[
            ("Characters/Sejuani/Spells/E", "SpellObject"),
            ("Characters/Other/Spells/Q", "SpellObject"),
            ("Unknown/Resolver", "ResourceResolver"),
        ]),
    )];
    let (_tmp, index) = build(&[("A.wad.client", chunks)], 1);
    let index = index.named(&TestNames::over(&[], &[]));
    let catalog = index.character_spells("Sejuani");
    assert!(catalog.spells.is_empty());
    assert_eq!(catalog.unnamed, 2);
}

#[test]
fn character_spells_are_not_limited_by_the_find_result_cap() {
    let paths: Vec<_> = (0..3000)
        .map(|n| format!("Characters/Sejuani/Spells/E/Spell{n}"))
        .collect();
    let objects: Vec<_> = paths
        .iter()
        .map(|path| (path.as_str(), "SpellObject"))
        .collect();
    let (_tmp, index) = named_index(&objects);
    assert_eq!(index.character_spells("Sejuani").spells.len(), paths.len());
}
