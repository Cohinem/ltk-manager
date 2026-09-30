use image::Rgba;
use ltk_texture::Tex;
use ltk_texture::tex::{EncodeFormat, EncodeOptions};

use super::*;

const PAGE: &str = "assets/ux/lol/hud_atlas.tex";
const LAYER: &str = "base";
const ARCHIVE: &str = "UI.wad.client";
const RED: Rgba<u8> = Rgba([255, 0, 0, 255]);
const GREEN: Rgba<u8> = Rgba([0, 255, 0, 255]);

/// A 16 x 8 red page, as the game ships one.
fn base() -> Vec<u8> {
    let page = RgbaImage::from_pixel(16, 8, RED);
    let tex = Tex::encode_rgba_image(&page, EncodeOptions::new(EncodeFormat::Bgra8)).unwrap();
    let mut bytes = Vec::new();
    tex.write(&mut bytes).unwrap();
    bytes
}

fn png(dir: &Path, width: u32, height: u32) -> PathBuf {
    let path = dir.join(format!("edit_{width}x{height}.png"));
    RgbaImage::from_pixel(width, height, GREEN)
        .save(&path)
        .unwrap();
    path
}

fn target(project: &Path) -> PatchTarget<'_> {
    PatchTarget {
        project,
        path: PAGE,
        layer: LAYER,
        archive: ARCHIVE,
    }
}

fn written(project: &Path) -> RgbaImage {
    let path = project.join("content").join(LAYER).join(ARCHIVE).join(PAGE);
    decode_page(&fs::read(path).unwrap()).unwrap()
}

#[test]
fn a_patch_pastes_the_image_over_its_sprite_and_keeps_the_rest_of_the_game_page() {
    let project = tempfile::tempdir().unwrap();
    let images = tempfile::tempdir().unwrap();

    let patch = patch_sprite(
        &target(project.path()),
        &base(),
        [0.25, 0.0, 0.75, 0.5],
        &png(images.path(), 8, 4),
    )
    .unwrap()
    .unwrap();

    let page = written(project.path());
    assert_eq!(page.dimensions(), (16, 8));
    assert_eq!(*page.get_pixel(4, 0), GREEN);
    assert_eq!(*page.get_pixel(11, 3), GREEN);
    assert_eq!(*page.get_pixel(3, 0), RED);
    assert_eq!(*page.get_pixel(4, 4), RED);
    assert_eq!(patch.sprites.len(), 1);
}

#[test]
fn patching_the_same_sprite_again_replaces_its_image_and_a_rebuild_reads_the_sources() {
    let project = tempfile::tempdir().unwrap();
    let images = tempfile::tempdir().unwrap();
    let uv = [0.0, 0.0, 0.5, 0.5];

    patch_sprite(
        &target(project.path()),
        &base(),
        uv,
        &png(images.path(), 8, 4),
    )
    .unwrap();
    let again = patch_sprite(
        &target(project.path()),
        &base(),
        uv,
        &png(images.path(), 8, 4),
    );
    assert_eq!(again.unwrap().unwrap().sprites.len(), 1);

    let folder = slug(PAGE);
    fs::remove_file(
        project
            .path()
            .join("content")
            .join(LAYER)
            .join(ARCHIVE)
            .join(PAGE),
    )
    .unwrap();
    let rebuilt = rebuild_patch(project.path(), &folder, &base()).unwrap();
    assert!(rebuilt.is_some());
    assert_eq!(*written(project.path()).get_pixel(0, 0), GREEN);
    assert_eq!(read_patch(project.path(), &folder).unwrap(), rebuilt);
}

#[test]
fn an_image_of_another_size_or_a_page_that_is_no_tex_patches_nothing() {
    let project = tempfile::tempdir().unwrap();
    let images = tempfile::tempdir().unwrap();

    let wrong = patch_sprite(
        &target(project.path()),
        &base(),
        [0.0, 0.0, 0.5, 0.5],
        &png(images.path(), 9, 4),
    );
    assert_eq!(wrong.unwrap(), None);

    let dds = PatchTarget {
        path: "assets/ux/lol/hud_atlas.dds",
        ..target(project.path())
    };
    let dds = patch_sprite(
        &dds,
        &base(),
        [0.0, 0.0, 0.5, 0.5],
        &png(images.path(), 8, 4),
    );
    assert_eq!(dds.unwrap(), None);
    assert!(!project.path().join("content").exists());
}
