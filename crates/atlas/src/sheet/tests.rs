use ltk_texture::tex::Format;

use super::*;

const LAYER: &str = "base";
const ARCHIVE: &str = "UI.wad.client";

fn png(dir: &Path, name: &str, width: u32, height: u32, alpha: u8) -> PathBuf {
    let path = dir.join(name);
    RgbaImage::from_pixel(width, height, image::Rgba([200, 100, 50, alpha]))
        .save(&path)
        .unwrap();
    path
}

fn target(project: &Path) -> SheetTarget<'_> {
    SheetTarget {
        project,
        sheet: "Scoreboard",
        layer: LAYER,
        archive: ARCHIVE,
    }
}

fn page(project: &Path, spec: &SheetSpec) -> Tex {
    let path = project
        .join("content")
        .join(LAYER)
        .join(ARCHIVE)
        .join(&spec.path);
    Tex::from_reader(&mut fs::File::open(path).unwrap()).unwrap()
}

#[test]
fn an_import_writes_the_page_into_the_layer_and_keeps_every_placed_sprite_where_it_was() {
    let project = tempfile::tempdir().unwrap();
    let images = tempfile::tempdir().unwrap();

    let first = import_sprite(
        &target(project.path()),
        &png(images.path(), "Frame Top.png", 12, 12, 255),
        None,
    )
    .unwrap();
    assert_eq!(first.sprite.key, "frame_top");
    assert!(first.sheet.path.ends_with("/scoreboard.tex"));

    let second = import_sprite(
        &target(project.path()),
        &png(images.path(), "frame top.png", 40, 12, 255),
        None,
    )
    .unwrap();
    assert_eq!(second.sprite.key, "frame_top_2");
    assert_eq!(second.sheet.sprites[0], first.sprite);

    let tex = page(project.path(), &second.sheet);
    assert_eq!(
        (u32::from(tex.width), u32::from(tex.height)),
        (second.sheet.width, second.sheet.height)
    );
    assert_eq!(tex.format, Format::Bc1);
    assert_eq!(tex.mip_count, 1);
    assert_eq!(
        read_sheet(project.path(), "Scoreboard").unwrap(),
        Some(second.sheet)
    );
}

#[test]
fn a_replacement_the_same_size_keeps_its_rect_and_any_other_joins_as_a_new_sprite() {
    let project = tempfile::tempdir().unwrap();
    let images = tempfile::tempdir().unwrap();
    let first = import_sprite(
        &target(project.path()),
        &png(images.path(), "icon.png", 16, 16, 255),
        None,
    )
    .unwrap();

    let same = import_sprite(
        &target(project.path()),
        &png(images.path(), "other.png", 16, 16, 128),
        Some("icon"),
    )
    .unwrap();
    assert_eq!(same.sprite, first.sprite);
    assert_eq!(same.sheet.sprites.len(), 1);
    assert_eq!(page(project.path(), &same.sheet).format, Format::Bc7);

    let larger = import_sprite(
        &target(project.path()),
        &png(images.path(), "icon.png", 20, 16, 255),
        Some("icon"),
    )
    .unwrap();
    assert_eq!(larger.sprite.key, "icon_2");
    assert_eq!(larger.sheet.sprites.len(), 2);
}

#[test]
fn an_image_that_cannot_be_read_changes_nothing() {
    let project = tempfile::tempdir().unwrap();
    let images = tempfile::tempdir().unwrap();
    let broken = images.path().join("broken.png");
    fs::write(&broken, b"not a png").unwrap();

    assert!(import_sprite(&target(project.path()), &broken, None).is_err());
    assert_eq!(read_sheet(project.path(), "Scoreboard").unwrap(), None);
}
