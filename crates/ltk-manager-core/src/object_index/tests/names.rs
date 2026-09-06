//! The renaming pass, which keeps the rows the build read.

use super::*;

#[test]
fn naming_again_keeps_the_rows_and_replaces_the_names() {
    let chunks: &[Chunk<'_>] = &[("data/objects.bin", prop(&[("characters/aatrox", "Skin")]))];
    let (_tmp, index) = build(&[("Objects.wad.client", chunks)], 1);
    let index = index.named(&TestNames::over(&[], &[]));
    assert!(index.search("aatrox", || false).hits.is_empty());

    let index = index.named(&TestNames::over(&["characters/aatrox"], &["Skin"]));
    assert_eq!(ranked(&index, "aatrox"), ["characters/aatrox"]);
    assert_eq!(index.stats().rows, 1);
}
