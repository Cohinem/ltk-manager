//! Atlas, the workshop's UI editor: a view controller resolved into the scenes and elements it
//! draws, the sprite manifest behind its auto-atlas pages, the programs that draw them, and the
//! sheet a mod packs its own sprites into.
//!
//! The evidence is docs/research/ui-data-layout.md and the shape is section 4 of
//! docs/plans/atlas-renderer.md.

mod bindings;
mod fields;
mod font;
mod imaa;
mod loadout;
mod model;
pub mod pack;
mod patch;
mod program;
mod resolver;
mod sheet;
mod surface;
mod view;

pub use font::{FONTS_PATH, resolve_font};
pub use imaa::{Manifest, ManifestEntry, ManifestError, page_path, sprite_key};
pub use loadout::{UiLoadout, read_loadout};
pub use model::{
    UiAnchor, UiAsset, UiBinding, UiButton, UiButtonState, UiComboBox, UiEffect, UiElement, UiFile,
    UiFileRole, UiFont, UiFontFace, UiFontResolution, UiFontSizes, UiLayout, UiLayoutKind, UiLook,
    UiMeter, UiMeterTip, UiPosition, UiRect, UiRepeat, UiRole, UiScene, UiSlice, UiSliceKind,
    UiSprite, UiStyleSheet, UiTextIcon, UiTextStyle, UiTexture, UiTipStyle, UiVariant,
    UiVariantRecord, UiView, UiViewWarning,
};
pub use patch::{
    PAGES_DIR, PagePatch, PatchSprite, PatchTarget, patch_sprite, patchable, read_patch,
    rebuild_patch,
};
pub use program::{UiShader, read_ui_programs};
pub use sheet::SHEETS_DIR as SOURCES_DIR;
pub use sheet::{
    SheetImport, SheetSpec, SheetSprite, SheetTarget, import_sprite, import_surface, png_pixels,
    read_sheet, rebuild_sheet, sprite_pixels, sprite_png,
};
pub use view::{UiViewError, VariantChoice, resolve_scene_bin, resolve_view};

#[cfg(test)]
mod tests;
