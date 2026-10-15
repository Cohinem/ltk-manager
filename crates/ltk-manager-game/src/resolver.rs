//! A `ResourceResolver`, which maps the effect keys a skin and a particle system name to
//! the systems they play.

use ltk_hash::BinHash;
use ltk_manager_base::hashing::named;
use ltk_manager_bin::bin_document::{entries, owned};
use ltk_meta::BinObject;
use ltk_meta::walk::{Leaf, TreeValue as _};

/// `ResourceResolver.resourceMap`, a `Map<Hash, Link>` from an effect key to its system.
pub(crate) const RESOURCE_MAP: BinHash = named("resourceMap");

/// `effectKey`, which a child identifier and a skin's idle effect both name a system by.
pub(crate) const EFFECT_KEY: BinHash = named("effectKey");

/// The effect keys `resolver`'s map holds, each with the object its link names.
///
/// The order is the map's own. A key mapped to a null link is kept, because a null link is a hit
/// that suppresses the effect rather than falling through, and the null target is no object of
/// any document.
pub(crate) fn resolver_entries(resolver: &BinObject) -> impl Iterator<Item = (BinHash, BinHash)> {
    entries(resolver.properties.get(&RESOURCE_MAP))
        .iter()
        .filter_map(
            |(key, value)| match (owned(key.as_leaf()), owned(value.as_leaf())) {
                (Some(Leaf::Hash(key)), Some(Leaf::Link(target))) => {
                    Some((key.try_as_bin_hash()?, target))
                }
                _ => None,
            },
        )
}

/// Returns the skin bin of the system at `path`, and `None` for a path under no skin.
///
/// `Characters/Aatrox/Skins/Skin11/Particles/Aatrox_Skin11_Recall` names
/// `data/characters/aatrox/skins/skin11.bin`.
pub(crate) fn skin_bin(path: &str) -> Option<String> {
    let mut parts = path.split('/');
    let (root, character, skins, skin) =
        (parts.next()?, parts.next()?, parts.next()?, parts.next()?);
    let under = root.eq_ignore_ascii_case("characters")
        && skins.eq_ignore_ascii_case("skins")
        && parts.next().is_some();

    under.then(|| {
        format!(
            "data/characters/{}/skins/{}.bin",
            character.to_lowercase(),
            skin.to_lowercase()
        )
    })
}
