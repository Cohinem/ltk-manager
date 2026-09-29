//! Atlas, the UI editor's reads: a view controller resolved into the scenes and elements it
//! draws, and the sprite manifest behind its auto-atlas pages.
//!
//! The evidence is docs/research/ui-data-layout.md and the shape is section 4 of
//! docs/plans/atlas-renderer.md.

mod fields;
mod font;
mod imaa;
mod model;
pub mod pack;
mod program;
mod resolver;
mod sheet;
mod view;

pub use font::{FONTS_PATH, resolve_font};
pub use imaa::{Manifest, ManifestEntry, ManifestError, page_path, sprite_key};
pub use model::{
    UiAnchor, UiAsset, UiButton, UiButtonState, UiComboBox, UiEffect, UiElement, UiFile,
    UiFileRole, UiFont, UiFontFace, UiFontResolution, UiFontSizes, UiLayout, UiLayoutKind, UiLook,
    UiMeter, UiMeterTip, UiPosition, UiRect, UiScene, UiSlice, UiSliceKind, UiSprite, UiStyleSheet,
    UiTextIcon, UiTextStyle, UiTexture, UiTipStyle, UiVariant, UiVariantRecord, UiView,
    UiViewWarning,
};
pub use program::{UiShader, read_ui_programs};
pub use sheet::{SheetImport, SheetSpec, SheetSprite, SheetTarget, import_sprite, read_sheet};
pub use view::{UiViewError, VariantChoice, resolve_scene_bin, resolve_view};

#[cfg(test)]
mod tests;
