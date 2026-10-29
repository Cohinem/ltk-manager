//! The decoded media cache through the public surface.

use std::cell::Cell;
use std::convert::Infallible;

use ltk_manager_assets::preview::AssetRef;
use ltk_manager_audio::{AudioFormat, Decoded, SoundCache};
use ltk_wwise::SourceId;

fn layer(project: &str, path: &str) -> AssetRef {
    AssetRef::Layer {
        project: project.to_owned(),
        layer: "base".to_owned(),
        path: path.to_owned(),
    }
}

fn chunk() -> AssetRef {
    AssetRef::GameChunk {
        wad: "Map22.wad.client".to_owned(),
        path_hash: "1009b74f7b2ce352".to_owned(),
    }
}

fn decoded(len: usize) -> Decoded {
    Decoded {
        bytes: vec![0; len],
        format: AudioFormat::Ogg,
    }
}

/// Fetches `asset` and `source` from `cache`, counting the decodes in `decodes`.
fn fetch(cache: &SoundCache, asset: &AssetRef, source: u32, decodes: &Cell<u32>) {
    cache
        .get_or_decode(asset, SourceId(source), || {
            decodes.set(decodes.get() + 1);
            Ok::<_, Infallible>(decoded(10))
        })
        .unwrap();
}

#[test]
fn get_or_decode_decodes_each_media_once() {
    let cache = SoundCache::new(1024);
    let decodes = Cell::new(0);

    fetch(&cache, &chunk(), 1, &decodes);
    fetch(&cache, &chunk(), 1, &decodes);
    fetch(&cache, &chunk(), 2, &decodes);

    assert_eq!(decodes.get(), 2);
}

#[test]
fn get_or_decode_keeps_nothing_if_decode_fails() {
    let cache = SoundCache::new(1024);

    let failed = cache.get_or_decode(&chunk(), SourceId(1), || Err("no"));
    let decodes = Cell::new(0);
    fetch(&cache, &chunk(), 1, &decodes);

    assert_eq!(failed.unwrap_err(), "no");
    assert_eq!(decodes.get(), 1);
}

#[test]
fn invalidate_project_drops_media_of_its_layer_files() {
    let cache = SoundCache::new(1024);
    let decodes = Cell::new(0);
    let edited = layer("C:/mods/a", "sounds/a.wpk");
    let other = layer("C:/mods/b", "sounds/a.wpk");
    fetch(&cache, &edited, 1, &decodes);
    fetch(&cache, &other, 1, &decodes);
    fetch(&cache, &chunk(), 1, &decodes);

    cache.invalidate_project("C:/mods/a");
    fetch(&cache, &edited, 1, &decodes);
    fetch(&cache, &other, 1, &decodes);
    fetch(&cache, &chunk(), 1, &decodes);

    assert_eq!(decodes.get(), 4);
}

#[test]
fn get_or_decode_evicts_least_recently_used_media_past_budget() {
    let cache = SoundCache::new(25);
    let decodes = Cell::new(0);
    fetch(&cache, &chunk(), 1, &decodes);
    fetch(&cache, &chunk(), 2, &decodes);
    fetch(&cache, &chunk(), 1, &decodes);

    fetch(&cache, &chunk(), 3, &decodes);
    fetch(&cache, &chunk(), 1, &decodes);
    fetch(&cache, &chunk(), 2, &decodes);

    assert_eq!(decodes.get(), 4);
}
