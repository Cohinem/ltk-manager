use fs_err as fs;

use super::*;

#[test]
fn a_font_file_is_copied_into_the_archive_under_the_path_its_face_names() {
    let project = tempfile::tempdir().unwrap();
    let files = tempfile::tempdir().unwrap();
    let source = files.path().join("My Font.TTF");
    fs::write(&source, b"font bytes").unwrap();

    let named = import_font_file(project.path(), "base", "UI.wad.client", &source).unwrap();

    assert_eq!(named, "ASSETS/UX/Fonts/Mods/My_Font.ttf");
    let written = project
        .path()
        .join("content/base/UI.wad.client/assets/ux/fonts/mods/my_font.ttf");
    assert_eq!(fs::read(written).unwrap(), b"font bytes");
}

#[test]
fn a_file_of_another_type_is_refused() {
    let project = tempfile::tempdir().unwrap();
    let files = tempfile::tempdir().unwrap();
    let source = files.path().join("image.png");
    fs::write(&source, b"png").unwrap();

    assert!(import_font_file(project.path(), "base", "UI.wad.client", &source).is_err());
    assert!(!project.path().join("content").exists());
}
