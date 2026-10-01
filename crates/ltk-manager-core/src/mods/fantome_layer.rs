//! The content directory a fantome layer unpacks into.

use ltk_fantome::{FantomeInfo, is_layer_name};

/// The content directory an unpack gives the layer whose WAD directory spells
/// it `layer`: the spelling `info` declares, matched in any ASCII casing, or
/// else `layer`.
///
/// The rule `ltk_fantome`'s `extract_wads` follows, so a layer read out of the
/// archive has the name it has in an unpacked tree.
pub(crate) fn unpacked_layer_name(info: &FantomeInfo, layer: &str) -> String {
    info.layers
        .iter()
        .map(|(key, declared)| match declared.name.is_empty() {
            true => key,
            false => &declared.name,
        })
        .find(|name| is_layer_name(name) && name.eq_ignore_ascii_case(layer))
        .cloned()
        .unwrap_or_else(|| layer.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn declaring(key: &str, name: &str) -> FantomeInfo {
        let mut info = FantomeInfo::default();
        info.layers.insert(
            key.to_owned(),
            ltk_fantome::FantomeLayerInfo {
                name: name.to_owned(),
                ..Default::default()
            },
        );
        info
    }

    #[test]
    fn a_declared_layer_keeps_its_declared_spelling() {
        assert_eq!(
            unpacked_layer_name(&declaring("Chroma", "Chroma"), "chroma"),
            "Chroma"
        );
        assert_eq!(
            unpacked_layer_name(&declaring("Chroma", ""), "CHROMA"),
            "Chroma"
        );
    }

    #[test]
    fn an_undeclared_layer_keeps_its_directory_spelling() {
        assert_eq!(
            unpacked_layer_name(&declaring("Chroma", "Chroma"), "zeta"),
            "zeta"
        );
    }
}
