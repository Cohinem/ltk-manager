//! Unit tests for the stringtable index's ranking, search and lookup.

use super::*;

fn index_from(entries: &[(&str, Option<&str>)]) -> StringKeyIndex {
    let mut entries: Vec<IndexEntry> = entries
        .iter()
        .map(|(key, value)| IndexEntry {
            key: key.to_string(),
            value: value.map(str::to_string),
            value_lower: value.map(str::to_lowercase),
        })
        .collect();
    // The same invariant `build` establishes, which `lookup` relies on.
    entries.sort_by(|a, b| a.key.cmp(&b.key));
    StringKeyIndex {
        entries,
        locale: Some("en_us".to_string()),
    }
}

#[test]
fn search_ranks_prefix_before_substring() {
    let index = index_from(&[
        ("ahri_lore", None),
        ("game_character_displayname_ahri", Some("Ahri")),
        ("game_character_displayname_annie", Some("Annie")),
    ]);

    let result = index.search("ahri", 10);
    let keys: Vec<&str> = result.suggestions.iter().map(|s| s.key.as_str()).collect();
    assert_eq!(keys, vec!["ahri_lore", "game_character_displayname_ahri"]);
    assert_eq!(result.suggestions[1].value.as_deref(), Some("Ahri"));
    assert_eq!(result.total_keys, 3);
    assert_eq!(result.locale.as_deref(), Some("en_us"));
}

#[test]
fn search_is_case_insensitive_and_limited() {
    let index = index_from(&[("aaa", None), ("aab", None), ("aac", None)]);
    let result = index.search("AA", 2);
    assert_eq!(result.suggestions.len(), 2);
}

#[test]
fn search_matches_the_in_game_text_after_the_keys() {
    let index = index_from(&[
        ("fox_fire_tooltip", Some("Fox-Fire")),
        (
            "game_character_displayname_ahri",
            Some("the Nine-Tailed Fox"),
        ),
        ("game_character_displayname_annie", Some("the Dark Child")),
    ]);

    let result = index.search("fox", 10);
    let keys: Vec<&str> = result.suggestions.iter().map(|s| s.key.as_str()).collect();
    // The key match outranks the value-only match, whatever the case.
    assert_eq!(
        keys,
        vec!["fox_fire_tooltip", "game_character_displayname_ahri"]
    );
}

#[test]
fn empty_query_lists_from_start() {
    let index = index_from(&[("aaa", None), ("bbb", None)]);
    let result = index.search("  ", 1);
    assert_eq!(result.suggestions[0].key, "aaa");
}

#[test]
fn lookup_answers_known_keys_case_insensitively_and_skips_the_rest() {
    let index = index_from(&[
        (
            "game_character_displayname_ahri",
            Some("the Nine-Tailed Fox"),
        ),
        ("unvalued_key", None),
    ]);

    let values = index.lookup(&[
        "GAME_character_displayname_Ahri".to_string(),
        "unvalued_key".to_string(),
        "no_such_key".to_string(),
    ]);

    assert_eq!(
        values
            .get("GAME_character_displayname_Ahri")
            .map(String::as_str),
        Some("the Nine-Tailed Fox")
    );
    assert_eq!(values.len(), 1);
}

/// A name with nothing behind it is not a suggestion, and no league path
/// means no value previews - the keys are still every bit of the index.
#[test]
fn table_keys_index_without_a_game_to_read_values_from() {
    let index = StringKeyIndex::from_keys(
        vec![
            (key_hash("game_client_quit"), "game_client_quit".to_owned()),
            (0xdead_beef_dead_beef, "unknown_key".to_owned()),
            (1, String::new()),
        ],
        &Config::default(),
    );

    assert_eq!(index.entries.len(), 2);
    assert!(index.entries.iter().all(|e| e.value.is_none()));
    assert_eq!(index.locale, None);
}

/// The key the `rst-xxh3` table would file this field name under, asked of
/// the table itself so a test cannot disagree with it about the algorithm.
fn key_hash(key: &str) -> u64 {
    crate::hashtables::Table::RstXxh3.key_config().hash(key)
}
