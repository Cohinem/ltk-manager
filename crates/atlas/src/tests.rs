use std::cell::RefCell;
use std::collections::HashMap;
use std::io::Cursor;

use glam::{Vec2, Vec4};
use ltk_hash::{BinHash, Hash as _, WadHash};
use ltk_manager_core::bin_document::{AssetLookup, BinDocument, GameCopy, RowNames, hex};
use ltk_manager_core::error::{AppError, AppResult};
use ltk_manager_core::preview::AssetRef;
use ltk_meta::path::PropertyPath;
use ltk_meta::property::{Kind, values};
use ltk_meta::{Bin, BinObject, BinOverride, PropertyValueEnum};

use super::*;
use ltk_manager_game::program::ProgramRead;

const CONTROLLER: &str = "ClientStates/Gameplay/UX/Test";
const FOLDER: &str = "clientstates/gameplay/ux/test";
const BASE: &str = "clientstates/gameplay/ux/test/uibase";
const SCENE_PATH: &str = "ClientStates/Gameplay/UX/Test/UIBase/Root";
const ICON_PATH: &str = "ClientStates/Gameplay/UX/Test/UIBase/Root/Icon";
const SHEET_PATH: &str = "ClientStates/Gameplay/UX/Test/UIBase/Root/Sheet";
const SPRITE: &str = "assets/ux/test/frame.png";
const SHEET: &str = "assets/ux/test/sheet.tex";

fn h(text: &str) -> BinHash {
    BinHash::hash_str(text)
}

fn document_of(objects: Vec<BinObject>) -> Vec<u8> {
    let mut out = Cursor::new(Vec::new());
    Bin::builder()
        .objects(objects)
        .build()
        .to_writer(&mut out)
        .unwrap();
    out.into_inner()
}

fn pointer(class: &str, properties: Vec<(&str, PropertyValueEnum)>) -> PropertyValueEnum {
    values::Struct {
        class_hash: h(class),
        properties: properties
            .into_iter()
            .map(|(name, value)| (h(name), value))
            .collect(),
    }
    .into()
}

fn embedded(class: &str, properties: Vec<(&str, PropertyValueEnum)>) -> PropertyValueEnum {
    let PropertyValueEnum::Struct(inner) = pointer(class, properties) else {
        unreachable!()
    };
    values::Embedded(inner).into()
}

fn file(path: &str) -> PropertyValueEnum {
    values::WadChunkLink::new(WadHash::hash_str(path)).into()
}

fn manifest() -> Manifest {
    Manifest {
        pages: vec![WadHash::hash_str(page_path(FOLDER, 0)).0],
        entries: vec![
            ManifestEntry {
                key: 1,
                uv: [0.0, 0.0, 0.5, 0.5],
                page: 0,
            },
            ManifestEntry {
                key: sprite_key(SPRITE),
                uv: [0.25, 0.5, 0.75, 1.0],
                page: 0,
            },
        ],
    }
}

fn manifest_bytes(manifest: &Manifest) -> Vec<u8> {
    let mut out = Vec::new();
    manifest.write(&mut out).unwrap();
    out
}

#[test]
fn a_written_manifest_reads_back_with_its_entries_sorted() {
    let mut unsorted = manifest();
    unsorted.entries.reverse();
    assert!(!unsorted.is_sorted());

    let bytes = manifest_bytes(&unsorted);
    let read = Manifest::read(&bytes).unwrap();

    assert!(read.is_sorted());
    assert_eq!(read.pages, unsorted.pages);
    assert_eq!(
        read.find(sprite_key(SPRITE)).unwrap().uv,
        [0.25, 0.5, 0.75, 1.0]
    );
    assert_eq!(bytes.len(), 4 + 4 + 8 + 4 + 2 * 28);
    assert_eq!(manifest_bytes(&read), bytes);
}

#[test]
fn a_manifest_that_is_cut_short_or_runs_long_or_names_a_missing_page_is_refused() {
    let bytes = manifest_bytes(&manifest());

    assert_eq!(Manifest::read(b"AAMI"), Err(ManifestError::Magic));
    assert_eq!(
        Manifest::read(&bytes[..bytes.len() - 1]),
        Err(ManifestError::Truncated("entries"))
    );

    let mut long = bytes.clone();
    long.push(0);
    assert_eq!(Manifest::read(&long), Err(ManifestError::Trailing(1)));

    let mut bad_page = bytes;
    let last = bad_page.len() - 4;
    bad_page[last] = 3;
    assert!(matches!(
        Manifest::read(&bad_page),
        Err(ManifestError::PageOutOfRange { page: 3, .. })
    ));
}

#[test]
fn a_page_and_a_sprite_key_hash_as_the_game_names_them() {
    assert_eq!(
        page_path("ClientStates/Gameplay/UX/Scoreboard", 1),
        "uiautoatlas/clientstates/gameplay/ux/scoreboard/atlas_1.tex"
    );
    assert_eq!(sprite_key("A/B.png"), WadHash::hash_str("a/b.png").0);
}

/// Every chunk of the fixture by path hash, placed as a file under its hash.
struct Chunks(HashMap<u64, Vec<u8>>);

impl AssetLookup for Chunks {
    fn locate(&self, path: &str) -> Option<AssetRef> {
        self.locate_chunk(WadHash::hash_str(path))
    }

    fn locate_chunk(&self, hash: WadHash) -> Option<AssetRef> {
        self.0.contains_key(&hash.0).then(|| AssetRef::File {
            path: format!("{:016x}", hash.0),
        })
    }
}

impl Chunks {
    fn read(&self, asset: &AssetRef) -> AppResult<Vec<u8>> {
        let AssetRef::File { path } = asset else {
            unreachable!()
        };
        let hash = u64::from_str_radix(path, 16).unwrap();
        self.0
            .get(&hash)
            .cloned()
            .ok_or_else(|| AppError::InvalidPath(path.clone()))
    }
}

fn controller_document() -> BinDocument {
    let controller = BinObject::builder(h(CONTROLLER), h("TestViewController"))
        .property(
            h("PathHashToSelf"),
            values::WadChunkLink::new(WadHash::hash_str(FOLDER)),
        )
        .property(h("BaseLoadable"), values::ObjectLink::new(h(BASE)))
        .property(h("RTLOverride"), values::ObjectLink::new(h("rtl")))
        .build();
    let base = BinObject::builder(h(BASE), h("UiPropertyLoadable"))
        .property(
            h("FilepathHash"),
            values::WadChunkLink::new(WadHash::hash_str(BASE)),
        )
        .build();
    let rtl = BinObject::builder(h("rtl"), h("UiPropertyOverrideLoadable"))
        .property(
            h("FilepathHash"),
            values::WadChunkLink::new(WadHash::hash_str("clientstates/gameplay/ux/test/uirtl")),
        )
        .build();
    BinDocument::parse(document_of(vec![controller, base, rtl])).unwrap()
}

fn scene_bin() -> Vec<u8> {
    let scene = BinObject::builder(h(SCENE_PATH), h("UISceneData"))
        .property(h("name"), values::String::from("Root"))
        .property(h("Layer"), values::U32::new(900))
        .build();
    let position = pointer(
        "UiPositionRect",
        vec![
            (
                "UIRect",
                embedded(
                    "UiElementRect",
                    vec![
                        (
                            "Position",
                            values::Vector2::new(Vec2::new(10.0, 20.0)).into(),
                        ),
                        ("Size", values::Vector2::new(Vec2::new(64.0, 32.0)).into()),
                        ("SourceResolutionWidth", values::U16::new(1600).into()),
                        ("SourceResolutionHeight", values::U16::new(1200).into()),
                    ],
                ),
            ),
            (
                "Anchors",
                pointer(
                    "AnchorSingle",
                    vec![("Anchor", values::Vector2::new(Vec2::new(0.5, 1.0)).into())],
                ),
            ),
        ],
    );
    let icon = BinObject::builder(h(ICON_PATH), h("UiElementIconData"))
        .property(h("name"), values::String::from("Icon"))
        .property(h("Scene"), values::ObjectLink::new(h(SCENE_PATH)))
        .property(h("Enabled"), values::Bool::new(true))
        .property(h("Position"), position.clone())
        .property(
            h("TextureData"),
            pointer("LooseUiTextureData", vec![("TextureName", file(SPRITE))]),
        )
        .build();
    let sheet = BinObject::builder(h(SHEET_PATH), h("UiElementIconData"))
        .property(h("Scene"), values::ObjectLink::new(h(SCENE_PATH)))
        .property(h("Position"), position)
        .property(h("UseAlpha"), values::Bool::new(false))
        .property(
            h("TextureData"),
            pointer(
                "AtlasData9Slice",
                vec![
                    ("mTextureName", file(SHEET)),
                    (
                        "mTextureSourceResolutionWidth",
                        values::U32::new(256).into(),
                    ),
                    (
                        "mTextureSourceResolutionHeight",
                        values::U32::new(128).into(),
                    ),
                    (
                        "TextureUs",
                        values::Vector4::new(Vec4::new(128.0, 148.0, 168.0, 192.0)).into(),
                    ),
                    (
                        "TextureVs",
                        values::Vector4::new(Vec4::new(0.0, 32.0, 64.0, 128.0)).into(),
                    ),
                    (
                        "LeftRightWidths",
                        values::Vector2::new(Vec2::new(20.0, 24.0)).into(),
                    ),
                    (
                        "TopBottomHeights",
                        values::Vector2::new(Vec2::new(8.0, 12.0)).into(),
                    ),
                ],
            ),
        )
        .build();
    let missing = BinObject::builder(h("missing"), h("UiElementIconData"))
        .property(h("Scene"), values::ObjectLink::new(h(SCENE_PATH)))
        .property(
            h("TextureData"),
            pointer(
                "LooseUiTextureData",
                vec![("TextureName", file("gone.png"))],
            ),
        )
        .build();
    let group = BinObject::builder(h("group"), h("UiElementGroupData"))
        .property(h("Scene"), values::ObjectLink::new(h(SCENE_PATH)))
        .property(
            h("Elements"),
            values::Container::new(
                Kind::ObjectLink,
                vec![values::ObjectLink::new(h(ICON_PATH)).into()],
            )
            .unwrap(),
        )
        .build();
    document_of(vec![scene, icon, sheet, missing, group])
}

fn fixture() -> Chunks {
    Chunks(HashMap::from([
        (WadHash::hash_str(BASE).0, scene_bin()),
        (WadHash::hash_str(FOLDER).0, manifest_bytes(&manifest())),
        (WadHash::hash_str(page_path(FOLDER, 0)).0, Vec::new()),
        (WadHash::hash_str(SHEET).0, Vec::new()),
    ]))
}

fn resolved(chunks: &Chunks) -> UiView {
    resolve_view(
        &controller_document(),
        h(CONTROLLER),
        None,
        None,
        &(),
        chunks,
        &NoGame,
        &mut |asset| chunks.read(asset),
    )
    .unwrap()
}

const FONT: &str = "UX/Fonts/Descriptions/Gold";
const FONT_TYPE: &str = "UX/Fonts/Types/Beaufort";
const FONT_SIZES: &str = "UX/Fonts/Sizes/Gold";
const STYLE_SHEET: &str = "UX/Fonts/CSS/StyleSheet";
const TEXT_PATH: &str = "ClientStates/Gameplay/UX/Test/UIBase/Root/Title";

/// A colour as a bin stores it, `b, g, r, a` in file order.
fn stored(bgra: [u8; 4]) -> PropertyValueEnum {
    let [r, g, b, a] = bgra;
    values::Color::new(ltk_primitives::Color { r, g, b, a }).into()
}

fn optional(kind: Kind, value: PropertyValueEnum) -> PropertyValueEnum {
    values::Optional::new(kind, Some(value)).unwrap().into()
}

fn embeds(items: Vec<PropertyValueEnum>) -> PropertyValueEnum {
    values::Container::new(Kind::Embedded, items)
        .unwrap()
        .into()
}

fn named_map(name: &str, value: PropertyValueEnum) -> PropertyValueEnum {
    values::Map::new(
        Kind::String,
        Kind::Embedded,
        vec![(values::String::from(name).into(), value)],
    )
    .unwrap()
    .into()
}

fn locale_type(locale: Option<&str>, regular: &str, bold: Option<&str>) -> PropertyValueEnum {
    let mut fields = vec![("mFontFilePath", values::String::from(regular).into())];
    fields.extend(locale.map(|l| ("localeName", values::String::from(l).into())));
    fields.extend(bold.map(|b| ("FontFilePathBold", values::String::from(b).into())));
    embedded("FontLocaleType", fields)
}

fn fonts_bin() -> Vec<u8> {
    let description = BinObject::builder(h(FONT), h("GameFontDescription"))
        .property(h("name"), values::String::from("Gold"))
        .property(h("typeData"), values::ObjectLink::new(h(FONT_TYPE)))
        .property(h("resolutionData"), values::ObjectLink::new(h(FONT_SIZES)))
        .property(h("Color"), stored([210, 230, 240, 255]))
        .property(h("fillTextureName"), file("assets/ux/fonts/fill.tex"))
        .build();
    let font_type = BinObject::builder(h(FONT_TYPE), h("FontType"))
        .property(
            h("localeTypes"),
            embeds(vec![
                locale_type(
                    None,
                    "ASSETS/UX/Fonts/Beaufort.otf",
                    Some("ASSETS/UX/Fonts/BeaufortBold.otf"),
                ),
                locale_type(Some("ko_KR"), "ASSETS/UX/Fonts/Dotum.ttf", None),
            ]),
        )
        .build();
    let resolution = embedded(
        "FontResolution",
        vec![
            ("screenHeight", values::U32::new(1440).into()),
            ("fontSize", values::U32::new(14).into()),
            ("shadowDepthY", values::I32::new(2).into()),
        ],
    );
    let sizes = BinObject::builder(h(FONT_SIZES), h("FontResolutionData"))
        .property(h("autoScale"), values::Bool::new(false))
        .property(
            h("localeResolutions"),
            embeds(vec![embedded(
                "FontLocaleResolutions",
                vec![("resolutions", embeds(vec![resolution]))],
            )]),
        )
        .build();
    let style = embedded(
        "CSSStyle",
        vec![
            ("Color", optional(Kind::Color, stored([0, 0, 255, 255]))),
            ("bold", optional(Kind::Bool, values::Bool::new(true).into())),
        ],
    );
    let icon = embedded(
        "CSSIcon",
        vec![
            ("texture", file("assets/ux/fonts/mana.tex")),
            ("YAdjustment", values::F32::new(2.0).into()),
        ],
    );
    let sheet = BinObject::builder(h(STYLE_SHEET), h("CSSSheet"))
        .property(h("styles"), named_map("spellActive", style))
        .property(h("icons"), named_map("scaleMana", icon))
        .build();
    document_of(vec![description, font_type, sizes, sheet])
}

fn text_scene_bin(font: &str) -> Vec<u8> {
    let scene = BinObject::builder(h(SCENE_PATH), h("UISceneData")).build();
    let text = BinObject::builder(h(TEXT_PATH), h("UiElementTextData"))
        .property(h("Scene"), values::ObjectLink::new(h(SCENE_PATH)))
        .property(h("FontDescription"), values::ObjectLink::new(h(font)))
        .property(h("HTMLStyleSheet"), values::ObjectLink::new(h(STYLE_SHEET)))
        .property(h("TRAKey"), values::String::from("game_title"))
        .property(h("WrappingMode"), values::U8::new(5))
        .property(h("Color"), optional(Kind::Color, stored([0, 0, 255, 128])))
        .build();
    document_of(vec![scene, text])
}

fn text_fixture(font: &str) -> Chunks {
    Chunks(HashMap::from([
        (WadHash::hash_str(BASE).0, text_scene_bin(font)),
        (WadHash::hash_str(FONTS_PATH).0, fonts_bin()),
    ]))
}

#[test]
fn a_text_resolves_its_font_through_the_fonts_bin_with_its_type_sizes_and_sheet() {
    let chunks = text_fixture(FONT);
    let view = resolved(&chunks);

    let UiLook::Text {
        font: Some(font),
        style_sheet: Some(sheet),
        tra_key,
        wrap,
        color,
        min_scale,
        align,
        ..
    } = &view.elements[0].look
    else {
        panic!("not a resolved text: {:?}", view.elements[0].look);
    };
    assert_eq!(tra_key, "game_title");
    assert_eq!(*wrap, 5);
    assert_eq!(*color, Some([255, 0, 0, 128]));
    assert_eq!(*min_scale, 0.7);
    assert_eq!(*align, [0, 1]);

    let font = &view.fonts[*font];
    assert_eq!(font.name, "Gold");
    assert_eq!(font.color, [240, 230, 210, 255]);
    assert_eq!(font.shadow_color, [0, 0, 0, 255]);
    assert!(!font.auto_scale);
    assert_eq!(font.faces.len(), 2);
    assert_eq!(font.faces[0].locale, "en_us");
    assert_eq!(font.faces[0].regular.path, "ASSETS/UX/Fonts/Beaufort.otf");
    assert_eq!(
        font.faces[0].bold.as_ref().map(|bold| bold.path.as_str()),
        Some("ASSETS/UX/Fonts/BeaufortBold.otf")
    );
    assert_eq!(font.faces[1].locale, "ko_kr");
    assert_eq!(font.faces[1].bold, None);
    assert_eq!(
        font.sizes[0].resolutions,
        vec![UiFontResolution {
            screen_height: 1440,
            font_size: 14,
            outline_size: 0,
            shadow_depth: [0, 2],
        }]
    );
    assert!(font.fill.is_some());

    let sheet = &view.style_sheets[*sheet];
    assert_eq!(sheet.styles[0].name, "spellActive");
    assert_eq!(sheet.styles[0].color, Some([255, 0, 0, 255]));
    assert_eq!(sheet.styles[0].bold, Some(true));
    assert_eq!(sheet.styles[0].italics, None);
    assert_eq!(sheet.icons[0].name, "scaleMana");
    assert_eq!(sheet.icons[0].y_adjustment, 2.0);
    assert!(view.warnings.is_empty(), "{:?}", view.warnings);
}

#[test]
fn a_font_the_fonts_bin_does_not_hold_is_a_warning_on_the_view() {
    let chunks = text_fixture("UX/Fonts/Descriptions/Gone");
    let view = resolved(&chunks);

    assert!(matches!(
        view.elements[0].look,
        UiLook::Text { font: None, .. }
    ));
    assert!(
        view.warnings
            .iter()
            .any(|warning| matches!(warning, UiViewWarning::MissingFont { .. }))
    );
}

#[test]
fn a_font_description_resolves_alone_against_the_game_fonts_bin() {
    let own = BinDocument::parse(document_of(vec![
        BinObject::builder(h("mod/font"), h("GameFontDescription"))
            .property(h("typeData"), values::ObjectLink::new(h(FONT_TYPE)))
            .build(),
    ]))
    .unwrap();
    let game = BinDocument::parse(fonts_bin()).unwrap();
    let chunks = text_fixture(FONT);

    let font = resolve_font(&own, h("mod/font"), Some(&game), &(), &chunks).unwrap();

    assert_eq!(font.color, [0, 0, 0, 255]);
    assert_eq!(font.faces.len(), 2);
    assert!(font.sizes.is_empty());
    assert!(font.auto_scale);
    assert!(resolve_font(&own, h("gone"), Some(&game), &(), &chunks).is_err());
}

#[test]
fn the_font_catalog_lists_the_documents_fonts_before_the_games_with_their_faces() {
    let own = BinDocument::parse(document_of(vec![
        BinObject::builder(h("mod/font"), h("GameFontDescription"))
            .property(h("name"), values::String::new("Mine".to_owned()))
            .property(h("typeData"), values::ObjectLink::new(h(FONT_TYPE)))
            .build(),
    ]))
    .unwrap();
    let game = BinDocument::parse(fonts_bin()).unwrap();

    let catalog = font_catalog(&own, Some(&game), &());

    let mine = &catalog.fonts[0];
    assert_eq!((mine.name.as_str(), mine.project), ("Mine", true));
    assert_eq!(mine.face.as_deref(), Some("ASSETS/UX/Fonts/Beaufort.otf"));
    assert_eq!(mine.type_data, Some(hex(h(FONT_TYPE))));
    assert!(catalog.fonts[1..].iter().all(|font| !font.project));
    assert!(catalog.fonts.iter().any(|font| font.entry == hex(h(FONT))));
    assert_eq!(mine.locales, 2);
    assert_eq!(catalog.types.len(), 1);
    assert_eq!(catalog.types[0].entry, hex(h(FONT_TYPE)));
    assert_eq!(
        catalog.types[0].face.as_deref(),
        Some("ASSETS/UX/Fonts/Beaufort.otf")
    );
}

/// Names the base scene bin's chunk, as a hash table does.
struct NamedBase;

impl ltk_manager_core::bin_document::RowNames for NamedBase {
    fn for_each_entry(&self, _: &[BinHash], _: &mut dyn FnMut(usize, &str)) {}
    fn for_each_class(&self, _: &[BinHash], _: &mut dyn FnMut(usize, &str)) {}
    fn for_each_field(&self, _: &[BinHash], _: &mut dyn FnMut(usize, &str)) {}
    fn for_each_value(&self, _: &[BinHash], _: &mut dyn FnMut(usize, &str)) {}
    fn for_each_chunk(&self, hashes: &[WadHash], visit: &mut dyn FnMut(usize, &str)) {
        for (at, hash) in hashes.iter().enumerate() {
            if *hash == WadHash::hash_str(BASE) {
                visit(at, BASE);
            }
        }
    }
}

#[test]
fn a_loadable_draws_as_the_base_of_the_controller_that_links_it() {
    let chunks = fixture();

    let base = resolve_view(
        &controller_document(),
        h(BASE),
        None,
        None,
        &(),
        &chunks,
        &NoGame,
        &mut |asset| chunks.read(asset),
    )
    .unwrap();
    let controller = resolved(&chunks);

    assert_eq!(base.elements, controller.elements);
    assert_eq!(base.files, controller.files);
    assert_eq!(base.entry, format!("0x{:08x}", h(BASE).0));
}

#[test]
fn a_loadable_no_controller_links_finds_the_manifest_of_its_folder() {
    let chunks = fixture();
    let loadable = BinObject::builder(h(BASE), h("UiPropertyLoadable"))
        .property(
            h("FilepathHash"),
            values::WadChunkLink::new(WadHash::hash_str(BASE)),
        )
        .build();
    let document = BinDocument::parse(document_of(vec![loadable])).unwrap();

    let view = resolve_view(
        &document,
        h(BASE),
        None,
        None,
        &NamedBase,
        &chunks,
        &NoGame,
        &mut |asset| chunks.read(asset),
    )
    .unwrap();

    let [file] = view.files.as_slice() else {
        panic!("{:?}", view.files);
    };
    assert_eq!(file.role, UiFileRole::Base);
    let UiLook::Icon {
        sprite: Some(sprite),
        ..
    } = &view.elements[0].look
    else {
        panic!("{:?}", view.elements[0].look);
    };
    assert_eq!(sprite.uv, [0.25, 0.5, 0.75, 1.0]);
}

#[test]
fn an_alternate_loadable_draws_in_place_of_the_controllers_base() {
    let chunks = fixture();
    let controller = BinObject::builder(h(CONTROLLER), h("TestViewController"))
        .property(
            h("PathHashToSelf"),
            values::WadChunkLink::new(WadHash::hash_str(FOLDER)),
        )
        .property(h("BaseLoadable"), values::ObjectLink::new(h("other")))
        .property(h("EsportsLoadable"), values::ObjectLink::new(h(BASE)))
        .build();
    let other = BinObject::builder(h("other"), h("UiPropertyLoadable"))
        .property(
            h("FilepathHash"),
            values::WadChunkLink::new(WadHash::hash_str("clientstates/gameplay/ux/test/other")),
        )
        .build();
    let alternate = BinObject::builder(h(BASE), h("UiPropertyLoadable"))
        .property(
            h("FilepathHash"),
            values::WadChunkLink::new(WadHash::hash_str(BASE)),
        )
        .build();
    let document = BinDocument::parse(document_of(vec![controller, other, alternate])).unwrap();

    let view = resolve_view(
        &document,
        h(BASE),
        None,
        None,
        &(),
        &chunks,
        &NoGame,
        &mut |asset| chunks.read(asset),
    )
    .unwrap();

    let roles: Vec<_> = view.files.iter().map(|file| file.role).collect();
    assert_eq!(roles, [UiFileRole::Base, UiFileRole::Loadable]);
    assert_eq!(view.elements.len(), 4);
}

#[test]
fn a_view_reads_its_base_scene_bin_and_lists_every_loadable_base_first() {
    let view = resolved(&fixture());

    let roles: Vec<_> = view.files.iter().map(|file| file.role).collect();
    assert_eq!(roles, [UiFileRole::Base, UiFileRole::Override]);
    assert!(view.files[0].asset.is_some());
    assert!(view.files[1].asset.is_none());

    let [scene] = view.scenes.as_slice() else {
        panic!("{:?}", view.scenes);
    };
    assert_eq!(scene.label, "Root");
    assert_eq!(scene.layer, 900);
    assert!(!scene.enabled);

    assert_eq!(view.elements.len(), 4);
    let icon = &view.elements[0];
    assert_eq!(
        icon.scene.as_deref(),
        Some(format!("0x{:08x}", h(SCENE_PATH).0).as_str())
    );
    assert!(icon.enabled);
    let Some(UiPosition::Rect { rect }) = &icon.position else {
        panic!("{:?}", icon.position);
    };
    assert_eq!(rect.position, [10.0, 20.0]);
    assert_eq!(rect.source, [1600, 1200]);
    assert_eq!(rect.anchor, UiAnchor::Single { anchor: [0.5, 1.0] });
    assert_eq!(rect.max_size, [1_000_000.0; 2]);
}

/// A game copy that declares each object it holds in a bin of its own.
struct Declares(HashMap<BinHash, Vec<u8>>);

impl GameCopy for Declares {
    fn declaring_chunk(&self, entry: BinHash) -> AppResult<Option<Vec<u8>>> {
        Ok(self.0.get(&entry).cloned())
    }

    fn with_names(&self, read: &mut dyn FnMut(&dyn RowNames)) {
        read(&());
    }
}

/// A game copy over every bin of some archives, by the objects each declares.
struct Shelf(HashMap<BinHash, std::sync::Arc<Vec<u8>>>);

impl GameCopy for Shelf {
    fn declaring_chunk(&self, entry: BinHash) -> AppResult<Option<Vec<u8>>> {
        Ok(self.0.get(&entry).map(|bytes| bytes.as_ref().clone()))
    }

    fn with_names(&self, read: &mut dyn FnMut(&dyn RowNames)) {
        read(&());
    }
}

/// The base loadable of the fixture, which a controller links.
fn base_loadable() -> BinObject {
    BinObject::builder(h(BASE), h("UiPropertyLoadable"))
        .property(
            h("FilepathHash"),
            values::WadChunkLink::new(WadHash::hash_str(BASE)),
        )
        .build()
}

/// A controller linking the base through `field`, in a bin that holds the base where `holds`.
fn linking_controller(field: &str, holds: bool) -> BinDocument {
    let controller = BinObject::builder(h(CONTROLLER), h("LogicDriverViewController"))
        .property(
            h("PathHashToSelf"),
            values::WadChunkLink::new(WadHash::hash_str(FOLDER)),
        )
        .property(h(field), values::ObjectLink::new(h(BASE)))
        .build();
    let objects = if holds {
        vec![controller, base_loadable()]
    } else {
        vec![controller]
    };
    BinDocument::parse(document_of(objects)).unwrap()
}

fn resolved_with(document: &BinDocument, game: &dyn GameCopy, chunks: &Chunks) -> UiView {
    resolve_view(
        document,
        h(CONTROLLER),
        None,
        None,
        &(),
        chunks,
        game,
        &mut |asset| chunks.read(asset),
    )
    .unwrap()
}

#[test]
fn a_controller_that_links_its_base_as_loadable_draws_it() {
    let chunks = fixture();
    let view = resolved_with(&linking_controller("Loadable", true), &NoGame, &chunks);

    let roles: Vec<_> = view.files.iter().map(|file| file.role).collect();
    assert_eq!(roles, [UiFileRole::Base]);
    assert_eq!(view.elements.len(), 4);
    assert!(!view.warnings.contains(&UiViewWarning::NoBase));
}

#[test]
fn a_base_loadable_another_bin_declares_is_read_from_that_bin() {
    let chunks = fixture();
    let document = linking_controller("BaseLoadable", false);
    let game = Declares(HashMap::from([(
        h(BASE),
        document_of(vec![base_loadable()]),
    )]));

    let view = resolved_with(&document, &game, &chunks);
    assert_eq!(view.files[0].role, UiFileRole::Base);
    assert_eq!(view.elements.len(), 4);

    let unreached = resolved_with(&document, &NoGame, &chunks);
    assert!(unreached.elements.is_empty());
    assert_eq!(
        unreached.warnings,
        [UiViewWarning::BaseElsewhere {
            entry: format!("0x{:08x}", h(BASE).0)
        }]
    );
}

/// An embedded struct of the class `class` by its hash, over fields by their hashes.
fn embedded_by_hash(class: u32, properties: Vec<(u32, PropertyValueEnum)>) -> PropertyValueEnum {
    values::Embedded(values::Struct {
        class_hash: BinHash(class),
        properties: properties
            .into_iter()
            .map(|(field, value)| (BinHash(field), value))
            .collect(),
    })
    .into()
}

#[test]
fn a_controller_names_the_templates_it_clones_into_its_layouts() {
    let fill = embedded_by_hash(
        0x3427_0fce,
        vec![
            (
                0x6258_0dd4,
                embedded_by_hash(
                    0xcff0_d042,
                    vec![(0x5fb9_1e8c, values::Hash::new(h("Template")).into())],
                ),
            ),
            (0xcac1_7cff, values::Hash::new(h("Layout")).into()),
            (0xd829_fd95, values::U32::new(12).into()),
        ],
    );
    let controller = BinObject::builder(h(CONTROLLER), h("TestViewController"))
        .property(
            h("PathHashToSelf"),
            values::WadChunkLink::new(WadHash::hash_str(FOLDER)),
        )
        .property(h("BaseLoadable"), values::ObjectLink::new(h(BASE)))
        .property(BinHash(0xe0b2_9ef4), fill)
        .build();
    let document = BinDocument::parse(document_of(vec![controller, base_loadable()])).unwrap();

    let view = resolved_with(&document, &NoGame, &fixture());

    assert_eq!(
        view.repeats,
        [UiRepeat {
            template: format!("0x{:08x}", h("Template").0),
            layout: format!("0x{:08x}", h("Layout").0),
            count: 12,
        }]
    );
}

#[test]
fn an_open_scene_bin_draws_in_place_of_the_file() {
    let mut chunks = fixture();
    chunks.0.remove(&WadHash::hash_str(BASE).0);
    let scene = BinDocument::parse(scene_bin()).unwrap();

    let view = resolve_view(
        &controller_document(),
        h(CONTROLLER),
        Some(&scene),
        None,
        &(),
        &chunks,
        &NoGame,
        &mut |asset| chunks.read(asset),
    )
    .unwrap();

    assert_eq!(view.elements.len(), 4);
    assert!(
        !view
            .warnings
            .iter()
            .any(|warning| matches!(warning, UiViewWarning::UnreadableFile { .. })),
        "{:?}",
        view.warnings
    );
}

const RTL: &str = "clientstates/gameplay/ux/test/uirtl";

/// A variant that moves the icon, deletes the missing sprite and patches an object no bin has.
fn rtl_variant() -> Vec<u8> {
    let patch = BinOverride::builder()
        .delete(h("missing"))
        .set(
            h(ICON_PATH),
            PropertyPath::new("Position.UIRect.Position").unwrap(),
            values::Vector2::new(Vec2::new(100.0, 200.0)),
        )
        .set(
            h("nowhere"),
            PropertyPath::new("Layer").unwrap(),
            values::U32::new(3),
        )
        .build();
    let mut out = Cursor::new(Vec::new());
    patch.to_writer(&mut out).unwrap();
    out.into_inner()
}

fn with_variant(chunks: &Chunks, open: Option<&BinDocument>) -> UiView {
    let document = controller_document();
    let slot = resolved(chunks).files[1].slot.clone();
    resolve_view(
        &document,
        h(CONTROLLER),
        None,
        Some(VariantChoice { slot: &slot, open }),
        &(),
        chunks,
        &NoGame,
        &mut |asset| chunks.read(asset),
    )
    .unwrap()
}

#[test]
fn a_variant_draws_over_the_base_as_the_client_lays_it() {
    let mut chunks = fixture();
    chunks.0.insert(WadHash::hash_str(RTL).0, rtl_variant());

    let view = with_variant(&chunks, None);

    assert_eq!(view.elements.len(), 3);
    let Some(UiPosition::Rect { rect }) = &view.elements[0].position else {
        panic!("{:?}", view.elements[0].position);
    };
    assert_eq!(rect.position, [100.0, 200.0]);

    let variant = view.variant.unwrap();
    assert_eq!(variant.deleted, [format!("0x{:08x}", h("missing").0)]);
    let [moved, stale] = variant.records.as_slice() else {
        panic!("{:?}", variant.records);
    };
    assert_eq!(moved.path, "Position.UIRect.Position");
    assert_eq!(
        moved.fields,
        format!(
            "{:08x}.{:08x}.{:08x}",
            h("Position").0,
            h("UIRect").0,
            h("Position").0
        )
    );
    assert_eq!(moved.skipped, None);
    assert!(stale.skipped.is_some());
}

#[test]
fn an_open_variant_draws_in_place_of_its_file() {
    let chunks = fixture();
    let open = BinDocument::parse(rtl_variant()).unwrap();

    let view = with_variant(&chunks, Some(&open));

    assert_eq!(view.elements.len(), 3);
    assert!(view.variant.is_some());
}

#[test]
fn a_document_that_is_no_declared_variant_lays_as_a_patch() {
    let chunks = fixture();
    let plain = BinDocument::parse(rtl_variant()).unwrap();
    assert!(plain.laid_variant().is_none());

    let view = with_variant(&chunks, Some(&plain));

    assert_eq!(view.elements.len(), 3);
    assert_eq!(view.variant.unwrap().records.len(), 2);
}

#[test]
fn a_variant_no_slot_names_draws_the_base_and_warns() {
    let chunks = fixture();

    let view = resolve_view(
        &controller_document(),
        h(CONTROLLER),
        None,
        Some(VariantChoice {
            slot: "MobileOverride",
            open: None,
        }),
        &(),
        &chunks,
        &NoGame,
        &mut |asset| chunks.read(asset),
    )
    .unwrap();

    assert_eq!(view.elements.len(), 4);
    assert!(view.variant.is_none());
    assert!(view.warnings.contains(&UiViewWarning::UnknownVariant {
        slot: "MobileOverride".to_owned()
    }));
}

#[test]
fn a_combo_box_names_its_elements_by_hash_and_is_no_element() {
    let combo = BinObject::builder(h("UX/Combo"), h("UiComboBoxDefinition"))
        .property(
            h("buttonDefinition"),
            values::Hash::new(h("UX/Combo/Button")),
        )
        .property(
            h("DropdownBackdropElementData"),
            values::Hash::new(h("UX/Combo/Backdrop")),
        )
        .property(
            h("ListOptionHitAreaElementData"),
            values::Hash::new(h("UX/Combo/Row")),
        )
        .property(
            h("SelectedHighlightElementData"),
            values::Hash::new(BinHash(0)),
        )
        .property(h("ListDisplayDirection"), values::U8::new(1))
        .property(
            h("DropdownDisplayTraKey"),
            values::String::from("itemshop_itemsets_dropdown"),
        )
        .property(
            h("SoundEvents"),
            pointer(
                "UiComboBoxSoundEvents",
                vec![(
                    "OnSelectionEvent",
                    values::String::from("Play_sfx_Select").into(),
                )],
            ),
        )
        .build();
    let document = BinDocument::parse(document_of(vec![combo])).unwrap();

    let view = resolve_scene_bin(
        &document,
        h("UX/Combo"),
        "ux/combo/uibase",
        None,
        &(),
        &Chunks(HashMap::new()),
        &mut |_| unreachable!(),
    )
    .unwrap();

    assert!(view.elements.is_empty());
    let [combo] = view.combo_boxes.as_slice() else {
        panic!("{:?}", view.combo_boxes);
    };
    let hex = |name: &str| Some(format!("0x{:08x}", h(name).0));
    assert_eq!(combo.button, hex("UX/Combo/Button"));
    assert_eq!(combo.backdrop, hex("UX/Combo/Backdrop"));
    assert_eq!(combo.option_hit_area, hex("UX/Combo/Row"));
    assert_eq!(combo.highlight, None);
    assert!(combo.upward);
    assert_eq!(
        combo.label_key.as_deref(),
        Some("itemshop_itemsets_dropdown")
    );
    assert_eq!(combo.selection_sound.as_deref(), Some("Play_sfx_Select"));
}

#[test]
fn a_loose_sprite_resolves_through_the_manifest_and_a_sheet_sprite_through_its_pixel_rect() {
    let view = resolved(&fixture());

    let UiLook::Icon {
        sprite: Some(loose),
        use_alpha: true,
        color,
        ..
    } = &view.elements[0].look
    else {
        panic!("{:?}", view.elements[0].look);
    };
    assert_eq!(*color, [255; 4]);
    assert_eq!(loose.uv, [0.25, 0.5, 0.75, 1.0]);
    assert!(view.textures[loose.texture].page);

    let UiLook::Icon {
        sprite: Some(sheet),
        use_alpha: false,
        ..
    } = &view.elements[1].look
    else {
        panic!("{:?}", view.elements[1].look);
    };
    assert_eq!(sheet.uv, [0.5, 0.0, 0.75, 1.0]);
    let slice = sheet.slice.as_ref().unwrap();
    assert_eq!(slice.kind, UiSliceKind::Nine);
    assert_eq!(slice.edges, [20.0, 24.0, 8.0, 12.0]);
    assert_eq!(slice.vs.as_deref(), Some([0.0, 0.25, 0.5, 1.0].as_slice()));
    assert!(!view.textures[sheet.texture].page);
    assert_eq!(view.textures.len(), 2);
}

#[test]
fn a_scene_bin_draws_alone_with_the_manifest_of_its_folder() {
    let chunks = fixture();
    let document = BinDocument::parse(scene_bin()).unwrap();

    let view = resolve_scene_bin(
        &document,
        h(ICON_PATH),
        BASE,
        None,
        &(),
        &chunks,
        &mut |asset| chunks.read(asset),
    )
    .unwrap();

    assert_eq!(view.entry, format!("0x{:08x}", h(ICON_PATH).0));
    assert_eq!(view.elements.len(), 4);
    let UiLook::Icon {
        sprite: Some(loose),
        ..
    } = &view.elements[0].look
    else {
        panic!("{:?}", view.elements[0].look);
    };
    assert_eq!(loose.uv, [0.25, 0.5, 0.75, 1.0]);
}

#[test]
fn a_sprite_no_manifest_holds_and_a_missing_loadable_are_warnings_on_the_view() {
    let view = resolved(&fixture());

    let UiLook::Icon { sprite: None, .. } = &view.elements[2].look else {
        panic!("{:?}", view.elements[2].look);
    };
    let UiLook::Group { children, .. } = &view.elements[3].look else {
        panic!("{:?}", view.elements[3].look);
    };
    assert_eq!(children, &[format!("0x{:08x}", h(ICON_PATH).0)]);
    assert!(view.warnings.iter().any(|warning| matches!(
        warning,
        UiViewWarning::MissingSprite { name, .. } if name == &format!("{:016x}", WadHash::hash_str("gone.png").0)
    )));

    let without_base = Chunks(HashMap::new());
    let view = resolved(&without_base);
    assert!(view.elements.is_empty());
    assert!(matches!(
        view.warnings.as_slice(),
        [UiViewWarning::MissingFile { path }] if path == &format!("{:016x}", WadHash::hash_str(BASE).0)
    ));
}

/// A game copy that declares nothing, as an install whose object index is not built.
struct NoGame;

impl GameCopy for NoGame {
    fn declaring_chunk(&self, _entry: BinHash) -> AppResult<Option<Vec<u8>>> {
        Ok(None)
    }

    fn with_names(&self, read: &mut dyn FnMut(&dyn RowNames)) {
        read(&());
    }
}

/// Every chunk of some archives of an install, by path hash.
struct Install {
    wads: RefCell<Vec<ltk_wad::Wad<fs_err::File>>>,
}

impl Install {
    /// The UI and Bootstrap archives.
    fn open() -> Self {
        Self::mount(&["UI.wad.client", "Bootstrap.windows.wad.client"])
    }

    /// The archives `names`, relative to the install's `DATA/FINAL`.
    fn mount(names: &[&str]) -> Self {
        let Ok(game) = std::env::var("LTK_LIVE_GAME") else {
            panic!("set LTK_LIVE_GAME to the install's DATA/FINAL directory");
        };
        let wads = names
            .iter()
            .map(|name| {
                let file = fs_err::File::open(std::path::Path::new(&game).join(name)).unwrap();
                ltk_wad::Wad::mount(file).unwrap()
            })
            .collect();
        Self {
            wads: RefCell::new(wads),
        }
    }

    fn hashes(&self) -> Vec<u64> {
        self.wads
            .borrow()
            .iter()
            .flat_map(|wad| wad.chunks().iter().map(|chunk| chunk.path_hash().0))
            .collect()
    }

    /// Every `UiPropertyLoadable` of the install with the bin that declares it, as the object
    /// index answers a declaration.
    fn loadables(&self) -> Declares {
        let mut declared = HashMap::new();
        for hash in self.hashes() {
            let bytes = self.bytes(hash).unwrap();
            let Ok(document) = BinDocument::parse(bytes.clone()) else {
                continue;
            };
            for entry in document.entries() {
                if document
                    .object_at(entry)
                    .is_some_and(|object| object.class_hash == h("UiPropertyLoadable"))
                {
                    declared.entry(entry).or_insert_with(|| bytes.clone());
                }
            }
        }
        Declares(declared)
    }

    /// Every object the archives' bins declare, with the bin declaring it.
    fn shelf(&self) -> Shelf {
        let mut declared = HashMap::new();
        for hash in self.hashes() {
            let bytes = self.bytes(hash).unwrap();
            if !bytes.starts_with(b"PROP") {
                continue;
            }
            let Ok(document) = BinDocument::parse(bytes.clone()) else {
                continue;
            };
            let shared = std::sync::Arc::new(bytes);
            for entry in document.entries() {
                declared.entry(entry).or_insert_with(|| shared.clone());
            }
        }
        Shelf(declared)
    }

    fn bytes(&self, hash: u64) -> Option<Vec<u8>> {
        let mut wads = self.wads.borrow_mut();
        wads.iter_mut().find_map(|wad| {
            let chunk = *wad.chunks().get(ltk_wad::WadHash(hash))?;
            Some(wad.load_chunk_decompressed(&chunk).unwrap().into_vec())
        })
    }
}

impl AssetLookup for Install {
    fn locate(&self, path: &str) -> Option<AssetRef> {
        self.locate_chunk(WadHash::hash_str(path))
    }

    fn locate_chunk(&self, hash: WadHash) -> Option<AssetRef> {
        self.wads
            .borrow()
            .iter()
            .any(|wad| wad.chunks().get(ltk_wad::WadHash(hash.0)).is_some())
            .then(|| AssetRef::File {
                path: format!("{:016x}", hash.0),
            })
    }
}

#[test]
#[ignore = "reads a game install, and needs LTK_LIVE_GAME"]
fn every_shipped_manifest_round_trips_to_the_same_bytes() {
    let install = Install::open();
    let mut manifests = 0;

    for hash in install.hashes() {
        let bytes = install.bytes(hash).unwrap();
        if !bytes.starts_with(b"IMAA") {
            continue;
        }

        let manifest = Manifest::read(&bytes).unwrap();
        assert!(manifest.is_sorted(), "{hash:016x} is unsorted");
        assert_eq!(manifest_bytes(&manifest), bytes, "{hash:016x}");
        manifests += 1;
    }

    println!("{manifests} manifests round-trip");
    assert!(manifests > 200);
}

#[test]
#[ignore = "reads a game install, and needs LTK_LIVE_GAME"]
fn every_shipped_controller_resolves_into_a_view() {
    let install = Install::open();
    let mut read = |asset: &AssetRef| -> AppResult<Vec<u8>> {
        let AssetRef::File { path } = asset else {
            unreachable!()
        };
        Ok(install
            .bytes(u64::from_str_radix(path, 16).unwrap())
            .unwrap())
    };

    let (mut views, mut scenes, mut elements, mut missing, mut unknown) = (0, 0, 0, 0, 0);
    let mut texts = 0;
    let (mut variants, mut applied, mut skipped) = (0, 0, 0);
    let mut combos = 0;
    let (mut buttons, mut hit_regions) = (0, 0);
    let (mut meters, mut tips) = (0, 0);
    let mut failures = Vec::new();
    let loadables = install.loadables();
    let must_draw = [
        h("LogicDriverViewController"),
        h("LoadingScreenPlayerCardsViewController"),
    ];
    let mut drawn = 0;
    let mut repeats = 0;
    let (mut bound, mut unbound) = (0, 0);
    for hash in install.hashes() {
        let bytes = install.bytes(hash).unwrap();
        if !bytes.starts_with(b"PROP") {
            continue;
        }
        let Ok(document) = BinDocument::parse(bytes) else {
            continue;
        };
        let controllers: Vec<_> = document
            .entries()
            .filter(|entry| {
                document.object_at(*entry).is_some_and(|object| {
                    object.properties.contains_key(&h("PathHashToSelf"))
                        || object.class_hash == h("UiPropertyLoadable")
                })
            })
            .collect();

        for entry in controllers {
            let view = resolve_view(
                &document,
                entry,
                None,
                None,
                &(),
                &install,
                &loadables,
                &mut read,
            )
            .unwrap();
            let class = document.object_at(entry).map(|object| object.class_hash);
            /* One skin overlay ships a scene bin holding a lone empty scene. */
            if class.is_some_and(|class| must_draw.contains(&class)) {
                if view.scenes.is_empty() {
                    failures.push(format!(
                        "{} reads no scene: {:?} {:?}",
                        view.entry, view.files, view.warnings
                    ));
                } else {
                    drawn += 1;
                }
            }
            for warning in &view.warnings {
                match warning {
                    UiViewWarning::MissingSprite { .. } => missing += 1,
                    UiViewWarning::NoBase => {}
                    other => failures.push(format!("{} {other:?}", view.entry)),
                }
            }
            views += 1;
            let known = |key: &String| view.elements.iter().any(|element| &element.key == key);
            for element in &view.elements {
                let UiLook::Group {
                    states,
                    button: Some(button),
                    ..
                } = &element.look
                else {
                    continue;
                };
                buttons += 1;
                hit_regions += usize::from(button.hit_region.is_some());
                let texts = states
                    .iter()
                    .flat_map(|state| [&state.text, &state.text_frame]);
                for key in texts.chain([&button.hit_region]).flatten() {
                    if !known(key) {
                        failures.push(format!("{} button {} names {key}", view.entry, element.key));
                    }
                }
            }
            for element in &view.elements {
                let UiLook::Group {
                    children,
                    meter: Some(meter),
                    ..
                } = &element.look
                else {
                    continue;
                };
                meters += 1;
                tips += usize::from(meter.tip.is_some());
                let tip = meter
                    .tip
                    .iter()
                    .flat_map(|tip| tip.elements.iter().chain(&tip.reverse).chain(&tip.sliver));
                for key in meter.bars.iter().chain(tip) {
                    if !children.contains(key) {
                        failures.push(format!("{} meter {} names {key}", view.entry, element.key));
                    }
                }
            }
            for binding in &view.bindings {
                if known(&binding.element) {
                    bound += 1;
                } else {
                    unbound += 1;
                }
            }
            for repeat in &view.repeats {
                repeats += 1;
                if !known(&repeat.template) || !known(&repeat.layout) {
                    failures.push(format!("{} repeat {repeat:?} names no element", view.entry));
                }
            }
            for combo in &view.combo_boxes {
                combos += 1;
                let linked = [
                    &combo.button,
                    &combo.backdrop,
                    &combo.hover,
                    &combo.highlight,
                    &combo.option_text,
                    &combo.option_hit_area,
                ];
                for key in linked.into_iter().flatten() {
                    if !view.elements.iter().any(|element| &element.key == key) {
                        failures.push(format!("{} combo {} links {key}", view.entry, combo.key));
                    }
                }
            }
            scenes += view.scenes.len();
            elements += view.elements.len();
            unknown += view
                .elements
                .iter()
                .filter(|element| element.look == UiLook::Unknown)
                .count();
            texts += view
                .elements
                .iter()
                .filter(|element| matches!(element.look, UiLook::Text { font: Some(_), .. }))
                .count();
            for font in &view.fonts {
                let faces = font
                    .faces
                    .iter()
                    .filter(|face| face.regular.asset.is_some());
                if faces.count() == 0 {
                    failures.push(format!(
                        "{} font {} has no face on disk",
                        view.entry, font.path
                    ));
                }
            }

            let slots = view
                .files
                .iter()
                .filter(|file| file.role == UiFileRole::Override && file.asset.is_some());
            for file in slots {
                let choice = VariantChoice {
                    slot: &file.slot,
                    open: None,
                };
                let laid = resolve_view(
                    &document,
                    entry,
                    None,
                    Some(choice),
                    &(),
                    &install,
                    &loadables,
                    &mut read,
                )
                .unwrap();
                match laid.variant {
                    Some(variant) => {
                        variants += 1;
                        let (stale, fresh): (Vec<_>, Vec<_>) = variant
                            .records
                            .iter()
                            .partition(|record| record.skipped.is_some());
                        applied += fresh.len();
                        skipped += stale.len();
                    }
                    None => failures.push(format!("{} {} drew no variant", view.entry, file.path)),
                }
            }
        }
    }

    println!(
        "{views} views, {scenes} scenes, {elements} elements, {unknown} unknown looks, \
         {missing} sprites no own manifest holds, {texts} texts with a font, \
         {variants} variants laid with {applied} records applied and {skipped} skipped, \
         {combos} combo boxes, {buttons} buttons ({hit_regions} with a hit region), \
         {meters} meters ({tips} with a tip), {drawn} overlays and player cards drawn, {repeats} layout repeats, \
         {bound} bound elements and {unbound} bindings naming none of the base"
    );
    for failure in &failures {
        println!("{failure}");
    }
    assert!(views >= 290);
    assert!(drawn >= 28);
    assert!(repeats > 0);
    assert!(bound > 1000);
    assert!(failures.is_empty());
}

/// How many of the largest shipped views the frame bench reads.
const BENCH_VIEWS: usize = 6;

#[test]
#[ignore = "reads a game install, and needs LTK_LIVE_GAME and LTK_VIEW_DUMP"]
fn the_largest_shipped_views_dump_for_the_frame_bench() {
    let install = Install::open();
    let Ok(dump) = std::env::var("LTK_VIEW_DUMP") else {
        panic!("set LTK_VIEW_DUMP to the folder the frame bench reads");
    };
    let mut read = |asset: &AssetRef| -> AppResult<Vec<u8>> {
        let AssetRef::File { path } = asset else {
            unreachable!()
        };
        Ok(install
            .bytes(u64::from_str_radix(path, 16).unwrap())
            .unwrap())
    };

    let loadables = install.loadables();
    let mut views = Vec::new();
    for hash in install.hashes() {
        let bytes = install.bytes(hash).unwrap();
        let Ok(document) = BinDocument::parse(bytes) else {
            continue;
        };
        for entry in document.entries() {
            let is_controller = document
                .object_at(entry)
                .is_some_and(|object| object.properties.contains_key(&h("PathHashToSelf")));
            if !is_controller {
                continue;
            }
            let view = resolve_view(
                &document,
                entry,
                None,
                None,
                &(),
                &install,
                &loadables,
                &mut read,
            )
            .unwrap();
            views.push(view);
        }
    }

    views.sort_by_key(|view| std::cmp::Reverse(view.elements.len()));
    fs_err::create_dir_all(&dump).unwrap();
    for (at, view) in views.iter().take(BENCH_VIEWS).enumerate() {
        let file = std::path::Path::new(&dump).join(format!("{at}-{}.json", view.entry));
        fs_err::write(file, serde_json::to_vec(view).unwrap()).unwrap();
    }
}

#[test]
#[ignore = "reads a game install, and needs LTK_LIVE_GAME"]
fn the_sample_loadout_reads_out_of_the_install() {
    let install = Install::mount(&[
        "Global.wad.client",
        "Champions/Ahri.wad.client",
        "Maps/Shipping/Map11.wad.client",
        "Maps/Shipping/Map12.wad.client",
    ]);

    let loadout = read_loadout(&install.shelf(), &install, &());

    println!("{loadout:#?}");
    assert!(loadout.name_key.is_some());
    assert!(loadout.abilities.iter().all(Option::is_some));
    assert!(loadout.passive.is_some());
    assert!(loadout.portrait.is_some());
    assert!(loadout.splash.is_some());
    /* The install ships Ignite's icon in an archive this test does not mount. */
    assert!(loadout.summoners[0].is_some());
    assert!(loadout.keystone.is_some());
    assert!(loadout.substyle.is_some());
    assert!(loadout.items.iter().flatten().count() >= 5);
}

#[test]
fn every_pair_names_its_stages_under_its_folder() {
    assert_eq!(
        UiShader::GlowConstant.paths(),
        (
            "ASSETS/Shaders/HLSL/UI/GlowConstant.vs".to_owned(),
            "ASSETS/Shaders/HLSL/UI/Glow.ps".to_owned()
        )
    );
    assert_eq!(
        UiShader::FontOutline.paths().1,
        "ASSETS/Shaders/HLSL/Font/FontWithOutline.ps"
    );
}

#[test]
#[ignore = "reads a game install, and needs LTK_LIVE_GAME"]
fn every_ui_program_translates() {
    let install = Install::open();
    let mut read = |asset: &AssetRef| -> AppResult<Vec<u8>> {
        let AssetRef::File { path } = asset else {
            unreachable!()
        };
        Ok(install
            .bytes(u64::from_str_radix(path, 16).unwrap())
            .unwrap())
    };

    let programs = read_ui_programs(
        &install,
        &UiShader::ALL,
        &hexshade::TranslationCache::default(),
        &mut read,
    );

    let failed: Vec<_> = UiShader::ALL
        .iter()
        .zip(&programs)
        .filter_map(|(shader, program)| match program {
            ProgramRead::Failed { reason } => Some(format!("{shader:?}: {reason}")),
            ProgramRead::Ready { .. } => None,
        })
        .collect();
    assert!(failed.is_empty(), "{failed:#?}");
}

fn fields_of(
    properties: Vec<(BinHash, PropertyValueEnum)>,
) -> ltk_manager_core::bin_document::Fields {
    properties.into_iter().collect()
}

#[test]
fn a_managed_layout_reads_its_style_region_and_the_cross_alignment_its_class_names() {
    let fields = fields_of(vec![
        (
            h("Region"),
            values::ObjectLink::new(h("layout/region")).into(),
        ),
        (
            h("LayoutStyle"),
            pointer(
                "LayoutStyleVerticalList",
                vec![
                    ("VerticalJustification", values::U8::new(1).into()),
                    ("ColumnHorizontalAlignment", values::U8::new(2).into()),
                ],
            ),
        ),
        (h("IgnoreDisabledElements"), values::Bool::new(true).into()),
    ]);

    let layout = super::resolver::layout(&fields).unwrap();

    assert_eq!(layout.kind, UiLayoutKind::VerticalList);
    assert_eq!(
        layout.region.as_deref(),
        Some(format!("0x{:08x}", h("layout/region").0).as_str())
    );
    assert_eq!(layout.justify, [0, 1]);
    assert_eq!(layout.cross, [2, 0]);
    assert!(layout.ignore_disabled);
    assert!(super::resolver::layout(&fields_of(vec![])).is_none());
}

#[test]
fn a_hierarchy_anchor_reads_its_pivot_and_its_margins_per_axis() {
    let anchors = values::Struct {
        class_hash: BinHash(0xf090_d2e7),
        properties: fields_of(vec![
            (h("AlignX"), values::U8::new(3).into()),
            (BinHash(0x0a56_7dbd), values::U8::new(1).into()),
            (BinHash(0x0956_7c2a), values::U8::new(2).into()),
            (
                BinHash(0xf00a_15b2),
                values::Vector2::new(Vec2::new(-10.0, -12.0)).into(),
            ),
            (
                BinHash(0x8ecb_313b),
                values::Vector2::new(Vec2::new(0.0, -320.0)).into(),
            ),
        ]),
    };
    let fields = fields_of(vec![(
        h("Position"),
        pointer("UiPositionRect", vec![("Anchors", anchors.into())]),
    )]);

    let Some(UiPosition::Rect { rect }) = super::resolver::position(&fields) else {
        panic!("{:?}", super::resolver::position(&fields));
    };

    assert_eq!(
        rect.anchor,
        UiAnchor::Hierarchy {
            align: [3, 0],
            pivot: [1, 2],
            margins: [[-10.0, -12.0], [0.0, -320.0]],
        }
    );
}
