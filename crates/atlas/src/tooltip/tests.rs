use ltk_hash::{BinHash, Hash as _};
use ltk_meta::PropertyValueEnum;
use ltk_meta::property::values;

use super::*;

fn h(text: &str) -> BinHash {
    BinHash::hash_str(text)
}

fn fields(properties: Vec<(BinHash, PropertyValueEnum)>) -> Fields {
    properties.into_iter().collect()
}

fn embed(class: BinHash, properties: Vec<(BinHash, PropertyValueEnum)>) -> PropertyValueEnum {
    values::Embedded(values::Struct {
        class_hash: class,
        properties: fields(properties),
    })
    .into()
}

/// A part as the shipped controllers name it, by a bare hash.
fn part(path: &str) -> PropertyValueEnum {
    values::Hash::new(h(path)).into()
}

#[test]
fn reads_parts_by_bare_hash() {
    let controller = fields(vec![(
        VIEW_DATA,
        embed(
            VIEW_DATA,
            vec![
                (MAIN_TEXT, part("TooltipHTML_MainText")),
                (BACKDROP, part("TooltipHTMLBackground")),
            ],
        ),
    )]);

    let tooltip = tooltip(&controller).unwrap();

    assert_eq!(tooltip.main_text, Some(hex(h("TooltipHTML_MainText"))));
    assert_eq!(tooltip.backdrop, Some(hex(h("TooltipHTMLBackground"))));
    assert_eq!(tooltip.caret, None);
}

#[test]
fn defaults_adjustments_the_controller_leaves_out() {
    let controller = fields(vec![(VIEW_DATA, embed(VIEW_DATA, Vec::new()))]);

    let adjustments = tooltip(&controller).unwrap().adjustments;

    assert!(adjustments.icon_skips_top_hr_pre);
    assert_eq!(adjustments.title_y, 0);
    assert_eq!(adjustments.bottom_y_padding, 0);
}

#[test]
fn reads_default_adjustments() {
    let controller = fields(vec![
        (VIEW_DATA, embed(VIEW_DATA, Vec::new())),
        (
            DEFAULT_ADJUSTMENTS,
            embed(
                named("PerLocaleTooltipAdjustments"),
                vec![
                    (ICON_SKIPS_TOP_HR_PRE, values::Bool::new(false).into()),
                    (TOP_HR_Y_PRE, values::I32::new(9).into()),
                    (BOTTOM_Y_PADDING, values::I32::new(-4).into()),
                ],
            ),
        ),
    ]);

    let adjustments = tooltip(&controller).unwrap().adjustments;

    assert!(!adjustments.icon_skips_top_hr_pre);
    assert_eq!(adjustments.top_hr_y_pre, 9);
    assert_eq!(adjustments.bottom_y_padding, -4);
}

#[test]
fn none_without_view_data() {
    assert_eq!(tooltip(&Fields::new()), None);
}
