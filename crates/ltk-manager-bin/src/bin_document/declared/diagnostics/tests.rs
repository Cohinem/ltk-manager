use fs_err as fs;

use super::super::tests::{SKIN, declared, h, project};
use super::*;

fn field(name: &str) -> String {
    format!("{:08x}", *h(name))
}

/// The diagnostics of a document over a hand-written body of the skin's entry.
fn diagnostics_of(body: &str) -> Vec<DeclaredDiagnostic> {
    let dir = tempfile::tempdir().unwrap();
    let project = project(dir.path());
    fs::write(
        dir.path().join("content/base/game_data.yaml"),
        format!("version: 1\nmodules:\n  - entries:\n      {SKIN}:\n{body}"),
    )
    .unwrap();
    declared(project).declared_state().unwrap().diagnostics
}

#[test]
fn a_skipped_key_draws_its_reason_on_the_row_it_names() {
    let diagnostics = diagnostics_of(concat!(
        "        skinMeshProperties.selfIllumination: glow
",
        "        -tags: [b]
",
        "        tags[4]: a
",
    ));

    let skipped: Vec<_> = diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.kind == DeclaredDiagnosticKind::PropertyEditSkipped)
        .collect();
    assert_eq!(skipped.len(), 3, "{diagnostics:?}");
    assert_eq!(skipped[0].reason, Some(SkipReason::KindMismatch));
    assert_eq!(skipped[0].entry, hex(h(SKIN)));
    assert_eq!(
        skipped[0].path,
        format!(
            "{}.{}",
            field("skinMeshProperties"),
            field("selfIllumination")
        )
    );
    assert_eq!(skipped[0].key, "skinMeshProperties.selfIllumination");
    assert_eq!(skipped[0].layer, "base");
    assert_eq!(skipped[1].reason, Some(SkipReason::RemovalUnmatched));
    assert_eq!(skipped[1].key, "-tags");
    assert_eq!(skipped[1].path, field("tags"));
    assert_eq!(skipped[2].reason, Some(SkipReason::IndexOutOfRange));
    assert_eq!(skipped[2].key, "tags[4]");
    assert_eq!(skipped[2].path, "");
}

#[test]
fn a_key_that_reaches_no_row_lists_under_its_object() {
    let diagnostics = diagnostics_of("        skinMeshProperties.missing: 1\n");

    let skipped = diagnostics
        .iter()
        .find(|diagnostic| diagnostic.kind == DeclaredDiagnosticKind::PropertyEditSkipped)
        .expect("the key is skipped");
    assert_eq!(skipped.entry, hex(h(SKIN)));
    assert_eq!(skipped.path, "");
    assert!(skipped.reason.is_some());
}

#[test]
fn a_property_typed_from_the_base_is_information_on_its_row() {
    /* The fixture's schema describes no build, so every applied key is typed from the base. */
    let diagnostics = diagnostics_of("        championSkinName: Jade\n");

    assert_eq!(diagnostics.len(), 1, "{diagnostics:?}");
    assert_eq!(diagnostics[0].kind, DeclaredDiagnosticKind::SchemaFallback);
    assert_eq!(diagnostics[0].reason, None);
    assert_eq!(diagnostics[0].entry, hex(h(SKIN)));
    assert_eq!(diagnostics[0].path, field("championSkinName"));
}
