//! The one record a view crosses IPC as, per section 4.2 of docs/plans/atlas-renderer.md.
//!
//! Every float is finite, a non-finite one read as 0, so none crosses as `null`.

use ltk_manager_core::preview::AssetRef;
use serde::Serialize;

/// A view controller or a `UiPropertyLoadable`, and everything its base scene bin holds, resolved
/// for drawing.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiView {
    /// The object the view was opened on, as `0x` and eight digits.
    pub entry: String,
    /// Its object path, where a table names it.
    pub name: Option<String>,
    /// Its class, or its hash where no table names it.
    pub class: String,
    /// The path `PathHashToSelf` hashes, which is the manifest and the page folder, where a
    /// table names it.
    pub folder: Option<String>,
    /// Every loadable the controller links, the base first.
    pub files: Vec<UiFile>,
    /// The variant drawn over the base, absent where the view draws the base alone.
    pub variant: Option<UiVariant>,
    /// The scenes of the base file, in file order.
    pub scenes: Vec<UiScene>,
    /// The elements of the base file, in file order.
    pub elements: Vec<UiElement>,
    /// The combo boxes of the base file, in file order.
    pub combo_boxes: Vec<UiComboBox>,
    /// Every texture a sprite names, which a sprite indexes.
    pub textures: Vec<UiTexture>,
    /// Every font a text names, which a text indexes.
    pub fonts: Vec<UiFont>,
    /// Every style sheet a text names, which a text indexes.
    pub style_sheets: Vec<UiStyleSheet>,
    /// Every reference the read could not follow.
    pub warnings: Vec<UiViewWarning>,
}

/// One loadable a controller links.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiFile {
    /// The controller field that links it, such as `BaseLoadable` or `RTLOverride`.
    pub slot: String,
    pub role: UiFileRole,
    /// The chunk's path, or its sixteen hex digits where no table names it.
    pub path: String,
    /// Absent where nothing on this machine holds the chunk.
    pub asset: Option<AssetRef>,
}

/// What a loadable is to its controller.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum UiFileRole {
    /// The scene bin the view draws: `BaseLoadable`, or the loadable the view was opened on.
    Base,
    /// Another `UiPropertyLoadable`, a base of its own that the view does not draw.
    Loadable,
    /// A `UiPropertyOverrideLoadable`, a `PTCH` over the base.
    Override,
}

/// A variant laid over the base scene bin, and what laying it did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiVariant {
    /// The controller field that links it, such as `RTLOverride`.
    pub slot: String,
    /// Every patch record of the variant, in file order.
    pub records: Vec<UiVariantRecord>,
    /// The objects the variant adds, as `0x` and eight digits.
    pub added: Vec<String>,
    /// The base objects the variant deletes, as `0x` and eight digits.
    pub deleted: Vec<String>,
}

/// One patch record of a variant.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiVariantRecord {
    /// The object it patches, as `0x` and eight digits.
    pub object: String,
    /// The property path as the file writes it, such as `Position.UIRect`.
    pub path: String,
    /// The same path in wire segments, each field as eight hex digits.
    pub fields: String,
    /// Why the record did not apply, absent where it did.
    pub skipped: Option<String>,
}

/// A texture a sprite samples: an auto-atlas page or a hand-made sheet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiTexture {
    /// The texture's path, or its sixteen hex digits where no table names it.
    pub path: String,
    /// Absent where nothing on this machine holds it.
    pub asset: Option<AssetRef>,
    /// An auto-atlas page rather than a sheet.
    pub page: bool,
}

/// One `UISceneData`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiScene {
    /// The scene object, as `0x` and eight digits.
    pub key: String,
    /// The object path, where a table names it.
    pub path: Option<String>,
    /// The scene's `name` field.
    pub label: String,
    pub class: String,
    /// The `ParentScene` link, as `0x` and eight digits.
    pub parent: Option<String>,
    pub layer: u32,
    /// The file's `Enabled`, which the controller usually sets at run time instead.
    pub enabled: bool,
    pub inherit_scissoring: bool,
}

/// One `UiComboBoxDefinition`: the elements a combo box builds its list from, each as `0x` and
/// eight digits, per "Combo boxes" in docs/research/ui-data-layout.md.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiComboBox {
    /// The definition object.
    pub key: String,
    /// Its object path, where a table names it.
    pub path: Option<String>,
    /// The `UiElementGroupButtonData` a click opens and closes the list on.
    pub button: Option<String>,
    /// The icon behind the open list, authored for one row.
    pub backdrop: Option<String>,
    /// The icon on the row under the pointer.
    pub hover: Option<String>,
    /// The icon on the selected option's row.
    pub highlight: Option<String>,
    /// The text every row's label is cloned from.
    pub option_text: Option<String>,
    /// The region every row is cloned from, whose height is the row's.
    pub option_hit_area: Option<String>,
    /// The rows run up from the button, `ListDisplayDirection` 1, rather than down.
    pub upward: bool,
    /// The TRA key the closed box reads, `@Name@` standing for the selected option.
    pub label_key: Option<String>,
    /// The sound event a selection plays.
    pub selection_sound: Option<String>,
}

/// One `UiElementIData`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiElement {
    /// The element object, as `0x` and eight digits.
    pub key: String,
    /// The object path, where a table names it.
    pub path: Option<String>,
    /// The element's `name` field.
    pub label: String,
    pub class: String,
    /// The `Scene` link, as `0x` and eight digits.
    pub scene: Option<String>,
    pub layer: u32,
    /// The file's `Enabled`, which the controller usually sets at run time instead.
    pub enabled: bool,
    /// Absent for an element without a position, such as a plain group.
    pub position: Option<UiPosition>,
    pub look: UiLook,
}

/// Where an element sits, `Position`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum UiPosition {
    /// `UiPositionRect`.
    Rect { rect: UiRect },
    /// `UiPositionPolygon`, drawn as its rect until its tessellation is known.
    Polygon {
        rect: UiRect,
        vertices: Vec<[f32; 2]>,
    },
    /// `UiPositionFullScreen`, the whole parent rect.
    FullScreen,
}

/// `UiPositionRect` and its `UIRect`, in the element's source resolution.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiRect {
    /// The top-left corner in source pixels.
    pub position: [f32; 2],
    pub size: [f32; 2],
    /// `SourceResolutionWidth` and `Height`.
    pub source: [u32; 2],
    pub anchor: UiAnchor,
    pub ignore_global_scale: bool,
    pub ignore_safe_zone: bool,
    pub disable_resolution_downscale: bool,
    /// `DisablePixelSnappingX` and `Y`.
    pub disable_pixel_snapping: [bool; 2],
    pub min_size: [f32; 2],
    pub max_size: [f32; 2],
}

/// `Anchors`, as fractions of the screen or of the parent rect.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum UiAnchor {
    /// No anchor object, which places the element as an anchor at the origin does.
    None,
    Single {
        anchor: [f32; 2],
    },
    Double {
        left: [f32; 2],
        right: [f32; 2],
    },
    /// `AnchorHierarchy`, class `0xf090d2e7`, which places the element in its parent's
    /// rect, per `0x1413B2860`. Four of its fields have no name.
    Hierarchy {
        /// `AlignX` and `AlignY`: 0, 1 and 2 the parent's start, centre and end, 3 a stretch.
        align: [u8; 2],
        /// Fields `0x0a567dbd` and `0x09567c2a`: the element's own start, centre or end that
        /// lands on the aligned point.
        pivot: [u8; 2],
        /// The near and far margins of a stretch: field `0xf00a15b2` on X, `0x8ecb313b` on Y.
        margins: [[f32; 2]; 2],
    },
}

/// A region of a texture: an IMAA entry or an `AtlasData` rect.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiSprite {
    /// The index into [`UiView::textures`].
    pub texture: usize,
    /// `u0, v0, u1, v1`, normalized to the texture.
    pub uv: [f32; 4],
    /// The source image path a `LooseUiTextureData` names, where a table names it.
    pub name: Option<String>,
    pub slice: Option<UiSlice>,
}

/// A 3-slice or 9-slice sprite.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiSlice {
    pub kind: UiSliceKind,
    /// The column edges, normalized, four for a horizontal or nine slice and two otherwise.
    /// Absent for a `LooseUiTextureData` slice, whose edges follow from `uv` and `edges`.
    pub us: Option<Vec<f32>>,
    /// The row edges, as `us`.
    pub vs: Option<Vec<f32>>,
    /// Left, right, top and bottom edge sizes in the element's source pixels.
    pub edges: [f32; 4],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum UiSliceKind {
    Horizontal,
    Vertical,
    Nine,
}

/// What an element draws.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum UiLook {
    /// `UiElementIconData`.
    Icon {
        sprite: Option<UiSprite>,
        /// `Color` as `r, g, b, a`.
        color: [u8; 4],
        use_alpha: bool,
        flip: [bool; 2],
        per_pixel_uvs: [bool; 2],
        fill_type: u32,
        /// The `StaticMaterialDef` it draws with in place of the UI shader.
        material: Option<String>,
    },
    /// A `UiElementEffect*Data`.
    Effect {
        effect: UiEffect,
        sprite: Option<UiSprite>,
        flip: [bool; 2],
        per_pixel_uvs_x: bool,
    },
    /// `UiElementTextData`.
    Text {
        /// The index into [`UiView::fonts`].
        font: Option<usize>,
        /// The index into [`UiView::style_sheets`].
        style_sheet: Option<usize>,
        tra_key: String,
        /// `TextAlignmentHorizontal` and `TextAlignmentVertical`.
        align: [u8; 2],
        wrap: u8,
        flip_for_rtl: bool,
        icon_scale: f32,
        /// The smallest scale a shrinking `wrap` draws at.
        min_scale: f32,
        /// The element's own `Color`, over the font's.
        color: Option<[u8; 4]>,
    },
    /// `UiElementParticleSystemData`.
    Particle {
        system: Option<String>,
        scale: f32,
        at_element_layer: bool,
    },
    /// `UiElementRegionData`, an invisible rect.
    Region,
    /// `UiElementScissorRegionData`, the clip rect of the scene `scene`, as `0x` and eight digits.
    Scissor { scene: Option<String> },
    /// A `UiElementGroupData` or a class under it.
    Group {
        /// The `Elements` list, as `0x` and eight digits each.
        children: Vec<String>,
        /// The button states, each drawing only its own elements.
        states: Vec<UiButtonState>,
        /// The group's `Alpha`, and 1 for a class that carries none.
        alpha: f32,
        /// How a `UiElementGroupManagedLayoutData` places its children, and none for any
        /// other group.
        layout: Option<UiLayout>,
        /// What a `UiElementGroupButtonData` holds beyond its states, and none for any other group.
        button: Option<UiButton>,
        /// What a `UiElementGroupMeterData` holds, and none for any other group.
        meter: Option<UiMeter>,
    },
    /// `UiElementSpineAnimationData`, drawn as a placeholder.
    Spine,
    /// A class the read does not know.
    Unknown,
}

/// One state of a `UiElementGroupButtonData`, such as `DefaultStateElements`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiButtonState {
    /// The field name, such as `HoverStateElements`.
    pub state: String,
    /// The `DisplayElementList`, as `0x` and eight digits each.
    pub elements: Vec<String>,
    /// The text the state's label draws with, as `0x` and eight digits.
    pub text: Option<String>,
    /// The element framing that label, as `0x` and eight digits.
    pub text_frame: Option<String>,
}

/// What a `UiElementGroupButtonData` holds beyond its states, per "Buttons" in
/// docs/research/ui-data-layout.md. Each element is `0x` and eight digits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiButton {
    /// The region a click lands in, absent where the button takes its group's rect.
    pub hit_region: Option<String>,
    /// The hit region grows by its label's size.
    pub text_size_in_hit_region: bool,
    /// `IsSelected`, which the file starts the button with.
    pub selected: bool,
    /// `IsEnabled`, false by the class's default.
    pub enabled: bool,
    /// `IsActive`, true by the class's default. An inactive button draws its inactive state.
    pub active: bool,
    /// The particle a click's release plays.
    pub click_particle: Option<String>,
    /// The tooltip TRA keys of the active, inactive and selected button.
    pub tooltip: Option<String>,
    pub inactive_tooltip: Option<String>,
    pub selected_tooltip: Option<String>,
}

/// What a `UiElementGroupMeterData` holds, per "Meters" in docs/research/ui-data-layout.md. Each
/// element is `0x` and eight digits.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiMeter {
    /// `BarElements`, the children the fill cuts.
    pub bars: Vec<String>,
    /// `FillDirection`.
    pub direction: u8,
    /// `StartPercentage`, the fill the meter starts at, 0 to 1.
    pub start: f32,
    /// `IsEnabled`, true by the class's default.
    pub enabled: bool,
    /// The `TipStyle`, none where the file writes none or a class the read does not know.
    pub tip: Option<UiMeterTip>,
}

/// A meter's `TipStyle`, the children drawn at the fill's edge.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiMeterTip {
    pub style: UiTipStyle,
    /// `DirectionalTipElements`.
    pub elements: Vec<String>,
    /// A double-sided tip's `ReverseDirectionalTipElements`.
    pub reverse: Vec<String>,
    /// A double-sided tip's `Sliver`.
    pub sliver: Option<String>,
    /// A glow-centered tip's unnamed `0xcc4c6d1d`, 0.5 by default.
    pub glow: f32,
}

/// The class of a meter's `TipStyle`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum UiTipStyle {
    BarExtension,
    DoubleSided,
    GlowCenteredOverlay,
}

/// A managed layout's `LayoutStyle` and `Region`, which place its children per `0x1413E4740`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiLayout {
    /// The `Region` the children lay out in, as `0x` and eight digits.
    pub region: Option<String>,
    pub kind: UiLayoutKind,
    /// `HorizontalJustification` and `VerticalJustification`: 0, 1 and 2 the start, centre and
    /// end, 3 the free space shared around every child and 4 between them.
    pub justify: [u8; 2],
    /// `HorizontalFillDirection` and `VerticalFillDirection`, 1 filling from the far edge.
    pub fill: [u8; 2],
    /// A grid's `FillPriority`, non-zero filling columns first.
    pub fill_priority: u8,
    /// Where a child sits across its row or column, 0, 1 and 2 the start, centre and end: a
    /// horizontal list's `RowVerticalAlignment`, a vertical list's `ColumnHorizontalAlignment`,
    /// and a grid's `RowHorizontalAlignment` then `RowVerticalAlignment`.
    pub cross: [u8; 2],
    /// `IgnoreDisabledElements`, which leaves a disabled child out of the layout.
    pub ignore_disabled: bool,
}

/// The class of a `LayoutStyle`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum UiLayoutKind {
    HorizontalList,
    VerticalList,
    Grid,
}

/// One effect class and the fields its constants come from, with the class defaults filled.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "effect",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum UiEffect {
    Cooldown {
        color0: [u8; 4],
        color1: [u8; 4],
    },
    Ammo {
        color0: [u8; 4],
        color1: [u8; 4],
    },
    CircleMaskCooldown {
        color0: [u8; 4],
        color1: [u8; 4],
    },
    CooldownRadial {
        fill: bool,
    },
    ArcFill,
    Glow {
        cycle_time: f32,
        base_scale: f32,
        cycle_scale: f32,
        minimum_alpha: f32,
    },
    GlowConstant {
        minimum: f32,
        maximum: f32,
    },
    Animation {
        frames: f32,
        per_row: f32,
        fps: f32,
        finish: u8,
    },
    AnimatedRotatingIcon {
        frames: f32,
        per_row: f32,
        fps: f32,
    },
    FillPercentage,
    Desaturate {
        minimum: f32,
        maximum: f32,
    },
    CircleMaskDesaturate {
        minimum: f32,
        maximum: f32,
    },
    Line {
        thickness: f32,
        right_slice: f32,
    },
    RotatingIcon,
    GlowingRotatingIcon {
        brightness: f32,
        cycle_time: f32,
    },
    Instanced {
        color: [u8; 4],
    },
    CustomMaterial {
        material: Option<String>,
    },
}

/// A reference a view read could not follow. The view draws without it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum UiViewWarning {
    /// The controller links no `BaseLoadable`.
    NoBase,
    /// A loadable's chunk is on no layer and in no archive.
    MissingFile { path: String },
    /// A file is there and does not parse as a bin or a manifest.
    UnreadableFile { path: String, reason: String },
    /// A `LooseUiTextureData` names a key no loaded manifest holds.
    MissingSprite { element: String, name: String },
    /// A text links a `GameFontDescription` or a `CSSSheet` that `ux/fonts` does not hold.
    MissingFont { element: String, link: String },
    /// The variant asked for is in no override slot of the controller.
    UnknownVariant { slot: String },
    /// A variant's file is no `PTCH`, or the base it lays over is no `PROP`.
    NotAPatch { path: String },
}

/// A file a font or a style sheet names.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiAsset {
    /// The path as written, or its sixteen hex digits where no table names it.
    pub path: String,
    /// Absent where nothing on this machine holds it.
    pub asset: Option<AssetRef>,
}

/// A `GameFontDescription`, with its `FontType` and `FontResolutionData` followed.
///
/// Every colour is `r, g, b, a`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiFont {
    /// The description's object path, or its hash where no table names it.
    pub path: String,
    /// Its `name` field.
    pub name: String,
    pub color: [u8; 4],
    pub outline_color: [u8; 4],
    pub shadow_color: [u8; 4],
    pub glow_color: [u8; 4],
    /// `fillTextureName`, the texture the fill samples.
    pub fill: Option<UiAsset>,
    /// The `FontType`'s faces, one per locale.
    pub faces: Vec<UiFontFace>,
    /// `FontResolutionData.autoScale`.
    pub auto_scale: bool,
    /// The `FontResolutionData`'s sizes, one list per locale.
    pub sizes: Vec<UiFontSizes>,
}

/// A `FontLocaleType`: the files a locale draws a font with.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiFontFace {
    /// `localeName`, such as `en_us`.
    pub locale: String,
    pub regular: UiAsset,
    pub bold: Option<UiAsset>,
}

/// A `FontLocaleResolutions`: the sizes a locale draws a font at.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiFontSizes {
    pub locale: String,
    pub resolutions: Vec<UiFontResolution>,
}

/// A `FontResolution`, in pixels at `screenHeight`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiFontResolution {
    pub screen_height: u32,
    pub font_size: u32,
    pub outline_size: u32,
    /// `shadowDepthX` and `shadowDepthY`.
    pub shadow_depth: [i32; 2],
}

/// A `CSSSheet`: the style tags and inline icons a text's markup names.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiStyleSheet {
    pub path: String,
    pub styles: Vec<UiTextStyle>,
    pub icons: Vec<UiTextIcon>,
}

/// A `CSSStyle`, where each field it leaves unset keeps the run's own.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiTextStyle {
    /// The tag name, such as `spellActive`.
    pub name: String,
    pub color: Option<[u8; 4]>,
    pub bold: Option<bool>,
    pub italics: Option<bool>,
    pub underline: Option<bool>,
}

/// A `CSSIcon`, drawn inline where the markup writes `%i:name%`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct UiTextIcon {
    pub name: String,
    pub texture: Option<UiAsset>,
    /// `YAdjustment`, in pixels.
    pub y_adjustment: f32,
}
