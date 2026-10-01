//! The tooltip a `TooltipViewController` lays out, per "Tooltips" in
//! docs/research/ui-data-layout.md.

use ltk_hash::BinHash;
use ltk_manager_core::bin_document::{Fields, fields_of, hex, struct_of};

use super::fields::named;
use super::model::{UiTooltip, UiTooltipAdjustments};
use super::resolver::{flag, number, object};

const VIEW_DATA: BinHash = named("TooltipViewData");
const DEFAULT_ADJUSTMENTS: BinHash = named("DefaultAdjustments");

const ICON: BinHash = named("IconElement");
const ICON_OVERLAY: BinHash = named("IconOverlayElement");
const TITLE_LEFT: BinHash = named("TitleLeftElement");
const TITLE_RIGHT: BinHash = named("TitleRightElement");
const SUBTITLE_LEFT: BinHash = named("SubtitleLeftElement");
const SUBTITLE_RIGHT: BinHash = named("SubtitleRightElement");
const MAIN_TEXT: BinHash = named("MainTextElement");
const POST_SCRIPT_TITLE: BinHash = named("PostScriptTitleElement");
const POST_SCRIPT_LEFT: BinHash = named("PostScriptLeftElement");
const POST_SCRIPT_RIGHT: BinHash = named("PostScriptRightElement");
const BACKDROP: BinHash = named("Backdrop");
const HR_TOP: BinHash = named("HrTop");
const HR_BOTTOM: BinHash = named("HrBottom");
const HR_TOP_SUB_SCENE: BinHash = named("HrTopSubScene");
const HR_BOTTOM_SUB_SCENE: BinHash = named("HrBottomSubScene");
const CARET: BinHash = named("Caret");

const ICON_SKIPS_TOP_HR_PRE: BinHash = BinHash(0x8b64_dacd);
const TITLE_Y: BinHash = named("TitleYAdjustment");
const TOP_HR_Y_PRE: BinHash = named("TopHrYPreAdjustment");
const TOP_HR_Y_POST: BinHash = named("TopHrYPostAdjustment");
const BOTTOM_HR_Y_PRE: BinHash = named("BottomHrYPreAdjustment");
const BOTTOM_HR_Y_POST: BinHash = named("BottomHrYPostAdjustment");
const BOTTOM_Y_PADDING: BinHash = named("BottomYPaddingAdjustment");

/// The tooltip the controller with the fields `controller` lays out, none where it embeds no
/// `TooltipViewData`.
pub(super) fn tooltip(controller: &Fields) -> Option<UiTooltip> {
    let data = controller.values().find_map(|value| {
        struct_of(Some(value))
            .filter(|&(class, _)| class == VIEW_DATA)
            .map(|(_, data)| data)
    })?;
    let part = |field| object(data.get(&field)).map(hex);

    Some(UiTooltip {
        icon: part(ICON),
        icon_overlay: part(ICON_OVERLAY),
        title_left: part(TITLE_LEFT),
        title_right: part(TITLE_RIGHT),
        subtitle_left: part(SUBTITLE_LEFT),
        subtitle_right: part(SUBTITLE_RIGHT),
        main_text: part(MAIN_TEXT),
        post_script_title: part(POST_SCRIPT_TITLE),
        post_script_left: part(POST_SCRIPT_LEFT),
        post_script_right: part(POST_SCRIPT_RIGHT),
        backdrop: part(BACKDROP),
        hr_top: part(HR_TOP),
        hr_bottom: part(HR_BOTTOM),
        hr_top_sub_scene: part(HR_TOP_SUB_SCENE),
        hr_bottom_sub_scene: part(HR_BOTTOM_SUB_SCENE),
        caret: part(CARET),
        adjustments: adjustments(fields_of(controller.get(&DEFAULT_ADJUSTMENTS))),
    })
}

/// A `PerLocaleTooltipAdjustments`, its defaults where `fields` is absent or leaves one out.
fn adjustments(fields: Option<&Fields>) -> UiTooltipAdjustments {
    let pixels = |field| {
        fields
            .and_then(|fields| number(fields, field))
            .unwrap_or(0.0) as i32
    };

    UiTooltipAdjustments {
        icon_skips_top_hr_pre: fields
            .and_then(|fields| flag(fields, ICON_SKIPS_TOP_HR_PRE))
            .unwrap_or(true),
        title_y: pixels(TITLE_Y),
        top_hr_y_pre: pixels(TOP_HR_Y_PRE),
        top_hr_y_post: pixels(TOP_HR_Y_POST),
        bottom_hr_y_pre: pixels(BOTTOM_HR_Y_PRE),
        bottom_hr_y_post: pixels(BOTTOM_HR_Y_POST),
        bottom_y_padding: pixels(BOTTOM_Y_PADDING),
    }
}

#[cfg(test)]
mod tests;
