use std::io::Read;

use fs_err as fs;

use super::*;

/// Locates `path` at the file `on_disk`, and nothing else.
struct OneFile {
    path: &'static str,
    on_disk: String,
}

impl AssetLookup for OneFile {
    fn locate(&self, path: &str) -> Option<AssetRef> {
        path.eq_ignore_ascii_case(self.path)
            .then(|| AssetRef::File {
                path: self.on_disk.clone(),
            })
    }
}

#[test]
fn sandbox_audio_files_read_located_file_with_its_asset() {
    let dir = tempfile::tempdir().unwrap();
    let on_disk = dir.path().join("a.wpk").to_string_lossy().into_owned();
    fs::write(&on_disk, b"r3d2").unwrap();
    let lookup = OneFile {
        path: "sounds/a.wpk",
        on_disk: on_disk.clone(),
    };
    let config = Config::default();
    let wads = WadCache::default();
    let files = SandboxAudioFiles {
        assets: &lookup,
        config: &config,
        wads: &wads,
    };

    let read = files.read("SOUNDS/A.wpk").unwrap().unwrap();
    let mut opened = files.open("sounds/a.wpk").unwrap().unwrap();
    let mut contents = Vec::new();
    opened.contents.read_to_end(&mut contents).unwrap();

    assert_eq!(read.contents, b"r3d2");
    assert_eq!(read.asset, AssetRef::File { path: on_disk });
    assert_eq!(contents, b"r3d2");
    assert!(files.read("sounds/b.wpk").unwrap().is_none());
}
