use super::*;

use fs_err as fs;
use specta_typescript::Typescript;

/// Where `pnpm generate:types` writes the generated bindings, relative to this crate.
///
/// A file rather than `src/lib/bindings/`, which is `ts-rs`'s output directory: the
/// two live side by side until the last command moves, and a `bindings.ts` beside
/// `bindings/` is the same module specifier twice.
const OUTPUT: &str = "../src/lib/bindings.gen.ts";

/// Write the bindings to `path`.
fn export(path: impl AsRef<std::path::Path>) {
    builder()
        .export(Typescript::default(), path)
        .expect("the bindings to export");
}

/// The bindings as the exporter writes them, out of a directory nothing else reads.
fn render() -> String {
    let dir = tempfile::tempdir().expect("a temp dir to export into");
    let path = dir.path().join("bindings.ts");
    export(&path);
    fs::read_to_string(&path).expect("the exported bindings to be readable")
}

#[test]
fn export_bindings() {
    export(OUTPUT);
}

#[test]
fn every_migrated_command_is_bound_and_dispatched() {
    let bindings = render();
    let mut bound: Vec<&str> = bindings
        .match_indices("__TAURI_INVOKE")
        .filter_map(|(at, token)| {
            let call = &bindings[at + token.len()..];
            // The import at the top of the file names the function without calling it.
            call.starts_with(['<', '(']).then_some(())?;
            let name = call.find("(\"")? + 2;
            Some(&call[name..name + call[name..].find('"')?])
        })
        .collect();

    bound.sort_unstable();
    let mut expected = MIGRATED.to_vec();
    expected.sort_unstable();
    assert_eq!(bound, expected, "the bindings and the dispatch disagree");
}

#[test]
fn the_envelope_is_the_shape_the_frontend_reads() {
    /* Whole rather than a substring per arm: `Result<T>` in `src/utils/result.ts` narrows on
    `ok`, so an arm that stops being a literal is what this has to fail on. */
    const ENVELOPE: &str = concat!(
        "({ ok: true; value: BinRows }) & { error?: never }",
        " | ({ ok: false; error: AppErrorResponse }) & { value?: never }",
    );

    let bindings = render();
    assert!(
        bindings.contains(ENVELOPE),
        "the envelope is no longer `Result<T>`:
{bindings}"
    );
}
