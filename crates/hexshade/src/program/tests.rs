use std::collections::HashMap;

use xxhash_rust::xxh64::xxh64;

use super::*;

const SHADER: &str = "Shaders/SkinnedMesh/Diffuse_Bloom";

/// Chunks by path, with a count of each read.
#[derive(Default)]
struct Chunks {
    held: HashMap<String, Vec<u8>>,
    reads: HashMap<String, usize>,
}

impl ShaderSource for Chunks {
    fn chunk(&mut self, path: &str) -> Result<Vec<u8>, SourceError> {
        *self.reads.entry(path.to_owned()).or_default() += 1;
        self.held.get(path).cloned().ok_or(SourceError::Missing)
    }
}

fn sized(out: &mut Vec<u8>, text: &str) {
    out.extend(u32::try_from(text.len()).unwrap().to_le_bytes());
    out.extend(text.as_bytes());
}

/// A `TOC3.0` with no base defines and one permutation, shader id 0.
fn toc_bytes() -> Vec<u8> {
    let mut out = Vec::new();
    sized(&mut out, "TOC3.0");
    for count in [1u32, 0, 1, 0] {
        out.extend(count.to_le_bytes());
    }
    sized(&mut out, "baseDefines");
    sized(&mut out, "shaders");
    out.extend(xxh64(b"", 0).to_le_bytes());
    out.extend(0u32.to_le_bytes());
    out
}

/// A `TOC3.0` that declares `defines` and holds no permutation.
fn toc_declaring(defines: &[(&str, &str)]) -> Vec<u8> {
    let mut out = Vec::new();
    sized(&mut out, "TOC3.0");
    let count = u32::try_from(defines.len()).unwrap();
    for each in [0u32, count, 0, 0] {
        out.extend(each.to_le_bytes());
    }
    sized(&mut out, "baseDefines");
    for (name, value) in defines {
        sized(&mut out, name);
        sized(&mut out, value);
    }
    sized(&mut out, "shaders");
    out
}

/// A `TOC3.0` that declares `defines` and holds one permutation per entry of `keys`. A key is
/// the concatenation of the sorted `NAME=VALUE` pairs that the permutation selects.
fn toc_holding(defines: &[(&str, &str)], keys: &[&str]) -> Vec<u8> {
    let mut out = Vec::new();
    sized(&mut out, "TOC3.0");
    let count = |n: usize| u32::try_from(n).unwrap();
    for each in [count(keys.len()), count(defines.len()), 0, 0] {
        out.extend(each.to_le_bytes());
    }
    sized(&mut out, "baseDefines");
    for (name, value) in defines {
        sized(&mut out, name);
        sized(&mut out, value);
    }
    sized(&mut out, "shaders");
    for key in keys {
        out.extend(xxh64(key.as_bytes(), 0).to_le_bytes());
    }
    for id in 0..keys.len() {
        out.extend(count(id).to_le_bytes());
    }
    out
}

/// Both stage TOCs of `SHADER`, which declare `USE_RIM` 0 and 1 and `GLOW` 1 and hold the
/// permutation `GLOW=1 USE_RIM=0`.
fn rim_chunks() -> Chunks {
    let declared = [("USE_RIM", "0"), ("USE_RIM", "1"), ("GLOW", "1")];
    let mut chunks = Chunks::default();
    for stage in [Stage::Vertex, Stage::Pixel] {
        chunks.held.insert(
            bundle::toc_path(SHADER, stage),
            toc_holding(&declared, &["GLOW=1USE_RIM=0"]),
        );
    }
    chunks
}

#[test]
fn nearest_finds_the_permutation_fewest_changes_away() {
    let mut chunks = rim_chunks();
    let translations = TranslationCache::default();
    let requested: Defines = [("USE_RIM", "1"), ("DISABLE_FOW", "1")]
        .into_iter()
        .collect();

    let mut cache = ShaderCache::new(&mut chunks, &translations);
    let shallow = cache
        .nearest(ShaderPath::Generated(SHADER), &requested, &[], 1)
        .unwrap();
    let found = cache
        .nearest(ShaderPath::Generated(SHADER), &requested, &[], 2)
        .unwrap();

    assert_eq!(shallow, None);
    assert_eq!(
        found.unwrap().to_entries(),
        ["DISABLE_FOW=1", "GLOW=1", "USE_RIM=0"]
    );
}

#[test]
fn nearest_keeps_a_fixed_name() {
    let mut chunks = rim_chunks();
    let translations = TranslationCache::default();
    let requested: Defines = [("USE_RIM", "1")].into_iter().collect();

    let found = ShaderCache::new(&mut chunks, &translations)
        .nearest(ShaderPath::Generated(SHADER), &requested, &["USE_RIM"], 3)
        .unwrap();

    assert_eq!(found, None);
}

#[test]
fn declared_merges_both_stages_without_duplicates() {
    let mut chunks = Chunks::default();
    chunks.held.insert(
        bundle::toc_path(SHADER, Stage::Vertex),
        toc_declaring(&[("USE_RIM", "1"), ("NUM_BLEND_WEIGHTS", "4")]),
    );
    chunks.held.insert(
        bundle::toc_path(SHADER, Stage::Pixel),
        toc_declaring(&[("USE_RIM", "1"), ("USE_RIM", "0")]),
    );
    let translations = TranslationCache::default();

    let declared = ShaderCache::new(&mut chunks, &translations)
        .declared(ShaderPath::Generated(SHADER))
        .unwrap();

    let pairs: Vec<(&str, &str)> = declared
        .iter()
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    assert_eq!(
        pairs,
        [
            ("NUM_BLEND_WEIGHTS", "4"),
            ("USE_RIM", "0"),
            ("USE_RIM", "1")
        ]
    );
}

#[test]
fn a_missing_toc_names_the_chunk_path() {
    let mut chunks = Chunks::default();
    let translations = TranslationCache::default();

    let error = ShaderCache::new(&mut chunks, &translations)
        .program(ShaderPath::Generated(SHADER), &Defines::default())
        .unwrap_err();

    assert_eq!(
        error.to_string(),
        "Nothing on this machine holds \
         assets/shaders/generated/shaders/skinnedmesh/diffuse_bloom.vs-dx11"
    );
}

#[test]
fn each_toc_and_bundle_is_read_once_per_cache() {
    let toc = bundle::toc_path(SHADER, Stage::Vertex);
    let bundle = bundle::bundle_path(&toc, 0);
    let mut chunks = Chunks::default();
    chunks.held.insert(toc.clone(), toc_bytes());
    chunks.held.insert(bundle.clone(), Vec::new());
    let translations = TranslationCache::default();

    let mut cache = ShaderCache::new(&mut chunks, &translations);
    let first = cache
        .program(ShaderPath::Generated(SHADER), &Defines::default())
        .unwrap_err();
    let second = cache
        .program(ShaderPath::Generated(SHADER), &Defines::default())
        .unwrap_err();

    assert!(
        matches!(first, ProgramError::NoRecord { id: 0, .. }),
        "{first}"
    );
    assert!(
        matches!(second, ProgramError::NoRecord { id: 0, .. }),
        "{second}"
    );
    assert_eq!(chunks.reads, HashMap::from([(toc, 1), (bundle, 1)]));
}

#[test]
fn an_hlsl_shader_reads_the_toc_of_each_stage_file() {
    let mut chunks = Chunks::default();
    let translations = TranslationCache::default();
    let shader = ShaderPath::Hlsl {
        vertex: "ASSETS/Shaders/HLSL/SkinnedMesh/LIT_UBER_VS.vs",
        pixel: "ASSETS/Shaders/HLSL/SkinnedMesh/LIT_UBER_PS.ps",
    };

    let error = ShaderCache::new(&mut chunks, &translations)
        .program(shader, &Defines::default())
        .unwrap_err();

    assert_eq!(
        error.to_string(),
        "Nothing on this machine holds assets/shaders/hlsl/skinnedmesh/lit_uber_vs.vs-dx11"
    );
    assert_eq!(
        shader.toc_path(Stage::Pixel),
        "assets/shaders/hlsl/skinnedmesh/lit_uber_ps.ps-dx11"
    );
}
