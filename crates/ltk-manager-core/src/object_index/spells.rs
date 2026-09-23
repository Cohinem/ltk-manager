//! Character spell discovery from named object paths and declaration classes.

use ltk_hash::{BinHash, Hash as _};
use serde::Serialize;

use crate::bin_document::hex;
use crate::utils::natural_order::compare_names;

use super::{ObjectDeclaration, ObjectIndex};

/// One named spell and every file declaring its object.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct CharacterSpell {
    /// The object's path hash, as `0x` and eight hex digits.
    pub object_hash: String,
    /// The resolved object path.
    pub path: String,
    /// The path below `Characters/{character}/Spells`.
    pub name: String,
    /// The first nested segment, which suggests a group without implying cast order.
    pub group: Option<String>,
    /// Every declaration, including conflicting classes, in archive order.
    pub declarations: Vec<ObjectDeclaration>,
}

/// The install's named spells for one character, without a search result cap.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct SpellCatalog {
    /// Spells in natural path order.
    pub spells: Vec<CharacterSpell>,
    /// Unnamed spell objects across the install, whose character cannot be established.
    pub unnamed: u32,
}

impl ObjectIndex {
    /// Every named spell below a character's spell path, with all its declarations.
    ///
    /// Path segments match without regard to ASCII case. Unnamed spell objects are
    /// counted separately because their hashes do not establish a character.
    #[must_use]
    pub fn character_spells(&self, character: &str) -> SpellCatalog {
        let spell_class = BinHash::hash_str("SpellObject");
        let is_spell = |hash| {
            self.declared
                .rows_of(hash)
                .iter()
                .any(|at| self.declared.rows[*at as usize].class == spell_class)
        };
        let mut spells = Vec::new();
        // The path index is case-sensitive, while hash-table spell paths use mixed casing.
        for object in &self.names.named {
            let mut segments = object.name.splitn(4, '/');
            let (Some(root), Some(owner), Some(folder), Some(name)) = (
                segments.next(),
                segments.next(),
                segments.next(),
                segments.next(),
            ) else {
                continue;
            };
            if !root.eq_ignore_ascii_case("Characters")
                || !owner.eq_ignore_ascii_case(character)
                || !folder.eq_ignore_ascii_case("Spells")
                || name.is_empty()
                || !is_spell(object.hash)
            {
                continue;
            }
            spells.push(CharacterSpell {
                object_hash: hex(object.hash),
                path: object.name.to_string(),
                name: name.to_owned(),
                group: name.split_once('/').map(|(group, _)| group.to_owned()),
                declarations: self.declarations_of(object.hash),
            });
        }
        spells.sort_by(|a, b| compare_names(&a.name, &b.name));
        SpellCatalog {
            spells,
            unnamed: self
                .unnamed_objects()
                .filter(|hash| is_spell(*hash))
                .count() as u32,
        }
    }
}
