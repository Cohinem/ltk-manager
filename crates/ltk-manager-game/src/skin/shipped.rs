use std::collections::HashMap;

use ltk_manager_assets::preview::AssetRef;
use ltk_manager_base::hashing::named;
use ltk_manager_bin::bin_document::hex;
use ltk_manager_bin::sandbox::Sandbox;
use serde::Serialize;

/// The highest skin number checked for a skin bin.
const SKIN_LIMIT: u32 = 1000;

/// A skin bin that a layer ships, and the skin object in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ShippedSkin {
    /// The project directory that the skin and its files are read from first.
    pub project: String,
    /// The layer file of `data/characters/<champion>/skins/skin<n>.bin`.
    pub asset: AssetRef,
    /// The `SkinCharacterDataProperties` object's hash, `0x` and eight hex digits.
    pub entry: String,
}

/// Returns the skin whose bin a layer of `sandbox` ships.
///
/// Each archive directory name is tried as a champion, the archive with the most files first,
/// and the lowest skin number of that champion is returned. Returns `None` if no layer ships a
/// skin bin.
#[must_use]
pub fn shipped_skin(sandbox: &Sandbox) -> Option<ShippedSkin> {
    let project = sandbox.reference().project()?;
    let chunks = sandbox.chunks();

    let mut files: HashMap<String, usize> = HashMap::new();
    for asset in chunks.files() {
        let AssetRef::Layer { path, .. } = asset else {
            continue;
        };
        let Some((archive, _)) = path.split_once('/') else {
            continue;
        };

        /* `Aatrox.wad.client` and `Aatrox.en_US.wad.client` both name `Aatrox`. */
        let champion = archive.split('.').next().unwrap_or(archive);
        *files.entry(champion.to_ascii_lowercase()).or_default() += 1;
    }

    let mut champions: Vec<(String, usize)> = files.into_iter().collect();
    champions.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    champions.iter().find_map(|(champion, _)| {
        (0..SKIN_LIMIT).find_map(|skin| {
            let asset =
                chunks.asset_at(&format!("data/characters/{champion}/skins/skin{skin}.bin"))?;

            Some(ShippedSkin {
                project: project.to_owned(),
                asset: asset.clone(),
                entry: hex(named(&format!("Characters/{champion}/Skins/Skin{skin}"))),
            })
        })
    })
}

#[cfg(test)]
mod tests;
