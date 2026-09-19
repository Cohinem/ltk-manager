//! The skin bin that gives a character's skin N the content of its skin 0, per ADR-0043.

use crate::error::AppResult;
use ltk_hash::BinHash;
use ltk_meta::{Bin, BinObject, PropertyValueEnum};
use std::io::Cursor;

/// A character's base skin, the two objects every stand-in for its other skins copies.
#[derive(Debug, Clone)]
pub(super) struct BaseSkin {
    character: String,
    /// `Characters/<character>/Skins/Skin0`.
    properties: BinObject,
    /// `Characters/<character>/Skins/Skin0/Resources`.
    resources: BinObject,
    dependencies: Vec<String>,
}

impl BaseSkin {
    /// The base skin of `character` out of the bytes of its `skin0.bin`, where they hold both
    /// of its objects.
    pub(super) fn parse(character: &str, bytes: &[u8]) -> Option<Self> {
        let mut bin = Bin::from_reader(&mut Cursor::new(bytes)).ok()?;
        let properties = bin.objects.shift_remove(&object_hash(character, 0, ""))?;
        let resources = bin
            .objects
            .shift_remove(&object_hash(character, 0, RESOURCES))?;
        Some(Self {
            character: character.to_ascii_lowercase(),
            properties,
            resources,
            dependencies: bin.dependencies,
        })
    }

    /// The `skin<id>.bin` holding this base skin's objects under skin `id`'s names.
    ///
    /// It depends on the base skin's own bin, where the objects the two copies link to live,
    /// and on every bin that one depends on.
    ///
    /// # Errors
    ///
    /// Fails when the bin cannot be written.
    pub(super) fn stand_in(&self, id: u32) -> AppResult<Vec<u8>> {
        let base_resources = object_hash(&self.character, 0, RESOURCES);
        let resources_hash = object_hash(&self.character, id, RESOURCES);

        let mut properties = self.properties.clone();
        properties.path_hash = object_hash(&self.character, id, "");
        for value in properties.properties.values_mut() {
            if let PropertyValueEnum::ObjectLink(link) = value
                && link.value == base_resources
            {
                link.value = resources_hash;
            }
        }
        let mut resources = self.resources.clone();
        resources.path_hash = resources_hash;

        let mut bin = Bin::default();
        bin.dependencies.clone_from(&self.dependencies);
        bin.dependencies.push(format!(
            "DATA/Characters/{}/Skins/Skin0.bin",
            self.character
        ));
        bin.objects.insert(properties.path_hash, properties);
        bin.objects.insert(resources.path_hash, resources);

        let mut bytes = Cursor::new(Vec::new());
        bin.to_writer(&mut bytes)?;
        Ok(bytes.into_inner())
    }
}

const RESOURCES: &str = "/Resources";

/// `Characters/<character>/Skins/Skin<id><suffix>`.
fn object_hash(character: &str, id: u32, suffix: &str) -> BinHash {
    BinHash::from(format!("Characters/{character}/Skins/Skin{id}{suffix}").as_str())
}
