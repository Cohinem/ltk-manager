use std::path::Path;

use fs_err as fs;
use ltk_manager_bin::sandbox::SandboxRef;

use super::*;

fn write(project: &Path, path: &str) {
    let file = project.join("content/base").join(path);
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(file, b"").unwrap();
}

fn skin_of(project: &Path) -> Option<ShippedSkin> {
    shipped_skin(&Sandbox::open(SandboxRef::Project {
        project: project.to_string_lossy().into_owned(),
    }))
}

#[test]
fn shipped_skin_returns_lowest_skin_of_largest_archive() {
    let project = tempfile::tempdir().unwrap();
    write(
        project.path(),
        "Ahri.wad.client/data/characters/ahri/skins/skin3.bin",
    );
    write(
        project.path(),
        "Ahri.wad.client/data/characters/ahri/skins/skin12.bin",
    );
    write(
        project.path(),
        "Ahri.wad.client/assets/characters/ahri/skins/skin03/body.tex",
    );
    write(
        project.path(),
        "Annie.wad.client/data/characters/annie/skins/skin0.bin",
    );

    let skin = skin_of(project.path()).unwrap();

    assert_eq!(skin.entry, hex(named("Characters/Ahri/Skins/Skin3")));
    let AssetRef::Layer { path, .. } = skin.asset else {
        panic!("not a layer file");
    };
    assert_eq!(path, "Ahri.wad.client/data/characters/ahri/skins/skin3.bin");
}

#[test]
fn shipped_skin_returns_none_without_skin_bin() {
    let project = tempfile::tempdir().unwrap();
    write(
        project.path(),
        "Ahri.wad.client/assets/characters/ahri/skins/skin03/body.tex",
    );

    assert_eq!(skin_of(project.path()), None);
}
