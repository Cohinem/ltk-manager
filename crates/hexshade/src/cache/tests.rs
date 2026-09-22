use crate::Sidecar;

use super::*;

#[test]
fn a_cache_names_a_file_by_the_blob_hash_and_the_stage_under_the_pipeline_version() {
    let root = Path::new("shaders");
    let cache = TranslationCache::new(Some(root));

    let path = cache.path(b"blob", Stage::Pixel).unwrap();

    assert_eq!(
        path,
        root.join(format!("v{PIPELINE_VERSION}"))
            .join(format!("{:016x}.ps.json", xxh64(b"blob", 0)))
    );
    assert_eq!(
        TranslationCache::new(None).path(b"blob", Stage::Pixel),
        None
    );
}

#[test]
fn a_stored_translation_is_read_back_and_marked_cached() {
    let dir = tempfile::tempdir().unwrap();
    let cache = TranslationCache::new(Some(dir.path()));
    let translated = Translated {
        glsl: "#version 300 es\nvoid main() {}\n".to_owned(),
        sidecar: Sidecar {
            blocks: Vec::new(),
            textures: Vec::new(),
            attributes: Vec::new(),
        },
        applied: Vec::new(),
    };

    store(&cache.path(b"blob", Stage::Vertex).unwrap(), &translated).unwrap();
    let (read, cached) = cache.translated(b"blob", Stage::Vertex).unwrap();

    assert_eq!(read, translated);
    assert!(cached);
    assert!(
        !fs::read_dir(dir.path().join(format!("v{PIPELINE_VERSION}")))
            .unwrap()
            .any(|entry| {
                entry
                    .unwrap()
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "tmp")
            })
    );
}
