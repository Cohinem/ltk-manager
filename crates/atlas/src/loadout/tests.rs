use ltk_hash::{Hash as _, WadHash};
use ltk_manager_assets::preview::AssetRef;
use ltk_meta::property::values;

use super::*;

const ICON: &str = "assets/characters/ahri/hud/ahri_square.tex";

/// Finds a chunk by its path alone, as the install's index finds a named chunk.
struct ByPath;

impl AssetLookup for ByPath {
    fn locate(&self, path: &str) -> Option<AssetRef> {
        (path == ICON).then(|| AssetRef::GameChunk {
            wad: "Champions/Ahri.wad.client".to_owned(),
            path_hash: format!("{:016x}", WadHash::hash_str(ICON).0),
        })
    }
}

/// Names the icon's chunk, as a hash table does.
struct NamedIcon;

impl RowNames for NamedIcon {
    fn for_each_entry(&self, _: &[BinHash], _: &mut dyn FnMut(usize, &str)) {}
    fn for_each_class(&self, _: &[BinHash], _: &mut dyn FnMut(usize, &str)) {}
    fn for_each_field(&self, _: &[BinHash], _: &mut dyn FnMut(usize, &str)) {}
    fn for_each_value(&self, _: &[BinHash], _: &mut dyn FnMut(usize, &str)) {}
    fn for_each_chunk(&self, hashes: &[WadHash], visit: &mut dyn FnMut(usize, &str)) {
        for (at, hash) in hashes.iter().enumerate() {
            if *hash == WadHash::hash_str(ICON) {
                visit(at, ICON);
            }
        }
    }
}

#[test]
fn a_file_link_to_a_named_chunk_finds_it_by_its_path() {
    let mut textures = Textures {
        assets: &ByPath,
        namer: Namer::new(&NamedIcon),
    };
    let link: PropertyValueEnum = values::WadChunkLink::new(WadHash::hash_str(ICON)).into();

    let texture = textures.at(Some(&link)).unwrap();

    assert_eq!(texture.path, ICON);
    assert!(matches!(texture.asset, Some(AssetRef::GameChunk { .. })));
}

#[test]
fn a_file_link_no_table_names_and_nothing_holds_is_none() {
    let mut textures = Textures {
        assets: &ByPath,
        namer: Namer::new(&()),
    };
    let link: PropertyValueEnum =
        values::WadChunkLink::new(WadHash::hash_str("unknown.tex")).into();

    assert_eq!(textures.at(Some(&link)), None);
}
