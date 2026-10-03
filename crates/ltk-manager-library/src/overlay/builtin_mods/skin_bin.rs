//! The bin a character's skin id resolves to.

use ltk_wad::WadHash;
use serde::{Deserialize, Serialize};

/// The highest skin id looked for, a margin over the 267 the game ships at 16.18.
const MAX_SKIN_ID: u32 = 511;

/// `data/characters/<character>/skins/skin<id>.bin`, the character lowercased.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub(super) struct SkinBin {
    pub(super) character: String,
    pub(super) id: u32,
}

impl SkinBin {
    pub(super) fn new(character: &str, id: u32) -> Self {
        Self {
            character: character.to_ascii_lowercase(),
            id,
        }
    }

    /// Every skin bin of `character` past its base skin, up to the highest id looked for.
    pub(super) fn past_base(character: &str) -> impl Iterator<Item = Self> {
        (1..=MAX_SKIN_ID).map(move |id| Self::new(character, id))
    }

    /// The skin bin at the chunk path `path`, where it is one.
    pub(super) fn parse(path: &str) -> Option<Self> {
        let path = path.replace('\\', "/").to_ascii_lowercase();
        let (character, file) = path
            .strip_prefix("data/characters/")?
            .split_once("/skins/")?;
        let id = file.strip_prefix("skin")?.strip_suffix(".bin")?;
        let canonical = !id.is_empty()
            && id.bytes().all(|b| b.is_ascii_digit())
            && (id == "0" || !id.starts_with('0'));
        if character.is_empty() || character.contains('/') || !canonical {
            return None;
        }
        Some(Self::new(character, id.parse().ok()?))
    }

    pub(super) fn is_base(&self) -> bool {
        self.id == 0
    }

    pub(super) fn path(&self) -> String {
        format!(
            "data/characters/{}/skins/skin{}.bin",
            self.character, self.id
        )
    }

    pub(super) fn hash(&self) -> WadHash {
        WadHash::from(self.path().as_str())
    }
}
