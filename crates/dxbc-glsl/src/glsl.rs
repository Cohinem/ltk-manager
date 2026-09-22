//! The text patches on SPIRV-Cross's GLSL ES 3.00 that make it WebGL2's.
//!
//! Each one covers a construct the corpus uses that ESSL 3.00 lacks or that GL links more
//! strictly than D3D: the ESSL 3.10 bit builtins, texel buffers, cube arrays, a shadow
//! sample at level zero, per-stage cbuffers under one program, and varyings the two stages
//! declare at different widths.

use std::sync::LazyLock;

use regex::{Captures, Regex};

use crate::Stage;

/// What a patch rewrote, for the sidecar and for a test.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Applied {
    /// An ESSL 3.10 bit builtin got a polyfill.
    BitBuiltin,
    /// A texel buffer became an `R32UI` data texture.
    TexelBuffer,
    /// A cube array became a `sampler2DArray` of six layers per cube.
    CubeArray,
    /// A `sample_c_lz` became a zero-gradient `textureGrad`.
    ShadowLevelZero,
}

/// The polyfills, keyed by the builtin whose call site wants one.
const POLYFILLS: [(&str, &str); 5] = [
    (
        "bitfieldInsert",
        "uint bitfieldInsert(uint b, uint v, int o, int n) { uint m = (n >= 32 ? 0xffffffffu : ((1u << uint(n)) - 1u)) << uint(o); return (b & ~m) | ((v << uint(o)) & m); }\n\
         int bitfieldInsert(int b, int v, int o, int n) { return int(bitfieldInsert(uint(b), uint(v), o, n)); }\n",
    ),
    (
        "bitfieldExtract",
        "uint bitfieldExtract(uint v, int o, int n) { return n >= 32 ? v >> uint(o) : (v >> uint(o)) & ((1u << uint(n)) - 1u); }\n\
         int bitfieldExtract(int v, int o, int n) { return n == 0 ? 0 : (v << (32 - n - o)) >> (32 - n); }\n",
    ),
    (
        "bitCount",
        "int bitCount(uint v) { v = v - ((v >> 1u) & 0x55555555u); v = (v & 0x33333333u) + ((v >> 2u) & 0x33333333u); return int((((v + (v >> 4u)) & 0x0F0F0F0Fu) * 0x01010101u) >> 24u); }\n\
         int bitCount(int v) { return bitCount(uint(v)); }\n",
    ),
    (
        "findLSB",
        "int findLSB(uint v) { if (v == 0u) return -1; int i = 0; while ((v & 1u) == 0u) { v >>= 1u; i++; } return i; }\n\
         int findLSB(int v) { return findLSB(uint(v)); }\n",
    ),
    (
        "findMSB",
        "int findMSB(uint v) { if (v == 0u) return -1; int i = 31; while ((v & 0x80000000u) == 0u) { v <<= 1u; i--; } return i; }\n\
         int findMSB(int v) { return v < 0 ? findMSB(uint(~v)) : findMSB(uint(v)); }\n",
    ),
];

/// Word `i` of a structured buffer, as a texel of a data texture `W` texels wide.
const BUFFER_FETCH: [(&str, &str); 3] = [
    (
        "usampler2D",
        "uvec4 dxbcBufferFetch(highp usampler2D t, int i) { int w = textureSize(t, 0).x; return texelFetch(t, ivec2(i % w, i / w), 0); }\n",
    ),
    (
        "isampler2D",
        "ivec4 dxbcBufferFetch(highp isampler2D t, int i) { int w = textureSize(t, 0).x; return texelFetch(t, ivec2(i % w, i / w), 0); }\n",
    ),
    (
        "sampler2D",
        "vec4 dxbcBufferFetch(highp sampler2D t, int i) { int w = textureSize(t, 0).x; return texelFetch(t, ivec2(i % w, i / w), 0); }\n",
    ),
];

/// A cube-array lookup on six layers per cube, in D3D face order with `v` down.
const CUBE_ARRAY_LOD: &str = "vec4 dxbcCubeArrayLod(highp sampler2DArray t, vec4 c, float lod) {\n\
    \x20   vec3 d = c.xyz; vec3 a = abs(d); float face; vec2 uv; float ma;\n\
    \x20   if (a.x >= a.y && a.x >= a.z) { ma = a.x; face = d.x > 0.0 ? 0.0 : 1.0; uv = vec2(d.x > 0.0 ? -d.z : d.z, -d.y); }\n\
    \x20   else if (a.y >= a.z) { ma = a.y; face = d.y > 0.0 ? 2.0 : 3.0; uv = vec2(d.x, d.y > 0.0 ? d.z : -d.z); }\n\
    \x20   else { ma = a.z; face = d.z > 0.0 ? 4.0 : 5.0; uv = vec2(d.z > 0.0 ? d.x : -d.x, -d.y); }\n\
    \x20   return textureLod(t, vec3(uv / ma * 0.5 + 0.5, floor(c.w + 0.5) * 6.0 + face), lod);\n\
    }\n";

static TEXEL_BUFFER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"uniform\s+highp\s+([iu]?samplerBuffer)\s+(\w+);").expect("a fixed pattern")
});
static CUBE_ARRAY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"uniform\s+highp\s+samplerCubeArray\s+(\w+);").expect("a fixed pattern")
});
static SHADOW_SAMPLER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"uniform\s+highp\s+sampler2DShadow\s+(\w+);").expect("a fixed pattern")
});
static BLOCK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(layout\(std140\) uniform )(\w+)\n").expect("a fixed pattern"));
static EXTENSION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"#extension GL_EXT_texture_(buffer|cube_map_array) : require\n")
        .expect("a fixed pattern")
});

/// `src` with every patch applied, and which ones were.
///
/// `extents` is each cbuffer's block name, without the stage suffix, and its size in
/// `vec4`s as `RDEF` declares it.
#[must_use]
pub fn patch(src: &str, stage: Stage, extents: &[(String, u32)]) -> (String, Vec<Applied>) {
    let mut applied = Vec::new();
    let src = declared_extents(src, extents);
    let (src, polyfilled) = polyfill(&src);
    if polyfilled {
        applied.push(Applied::BitBuiltin);
    }
    let (src, emulated) = webgl2_emulation(&src);
    applied.extend(emulated);
    let (src, shadowed) = shadow_level_zero(&src);
    if shadowed > 0 {
        applied.push(Applied::ShadowLevelZero);
    }
    (link_fixup(&src, stage), applied)
}

/// Every vertex output in `labels` declared, where dxbc-spirv left an unwritten one out.
///
/// D3D keeps a signature entry the shader never writes and the pixel shader reads garbage.
/// GL refuses to link a fragment input no vertex output declares, so the output is declared
/// and left unwritten, which is the same garbage.
#[must_use]
pub fn declare_outputs(src: &str, labels: &[String]) -> String {
    let missing: Vec<String> = labels
        .iter()
        .map(|label| format!("v_{}", crate::spirv::ident(label)))
        .filter(|name| !src.contains(&format!("out vec4 {name};")))
        .filter(|name| !src.contains(&format!(" {name};")))
        .collect();
    if missing.is_empty() {
        return src.to_owned();
    }
    let declarations: String = missing
        .iter()
        .map(|name| format!("out vec4 {name};\n"))
        .collect();
    match src.find("\nvoid main()") {
        Some(at) => format!("{}\n{declarations}{}", &src[..at], &src[at + 1..]),
        None => format!("{src}{declarations}"),
    }
}

/// Each block's array at the extent `RDEF` declares, where dxbc-spirv wrote a larger one.
///
/// A dynamically indexed cbuffer arrives as `vec4 m[4096]`, the D3D maximum, and GL refuses
/// a draw whose bound buffer is smaller than the block. The `RDEF` size is what the engine
/// binds, and an index past it reads zero in D3D and nothing in the corpus goes there.
fn declared_extents(src: &str, extents: &[(String, u32)]) -> String {
    let mut src = src.to_owned();
    for (block, vec4s) in extents {
        let declared = Regex::new(&format!(
            r"(layout\(std140\) uniform {block}_(?:vs|ps)\n\{{\n\s+[iu]?vec4 m\[)(\d+)(\];)"
        ))
        .expect("a block name is a word");
        src = declared
            .replace(&src, |captures: &Captures| {
                let written: u32 = captures[2].parse().unwrap_or(0);
                let extent = if written > *vec4s { *vec4s } else { written };
                format!("{}{extent}{}", &captures[1], &captures[3])
            })
            .into_owned();
    }
    src
}

/// The ESSL 3.10 bit builtins the source calls, prepended in their scalar forms.
fn polyfill(src: &str) -> (String, bool) {
    let used: Vec<&str> = POLYFILLS
        .iter()
        .filter(|(name, _)| calls(src, name))
        .map(|(_, body)| *body)
        .collect();
    if used.is_empty() {
        return (src.to_owned(), false);
    }
    let (head, rest) = src.split_once('\n').unwrap_or((src, ""));
    (format!("{head}\n{}{rest}", used.concat()), true)
}

/// Texel buffers as data textures, and cube arrays as 2D arrays.
///
/// Structured buffers arrive as `[iu]samplerBuffer` read one 32-bit word per `texelFetch`.
/// A `samplerCubeArray` is only ever sampled through `textureLod(vec4, lod)` in the corpus.
fn webgl2_emulation(src: &str) -> (String, Vec<Applied>) {
    let mut src = src.to_owned();
    let mut applied = Vec::new();
    let mut helpers = String::new();

    let buffers: Vec<(String, String)> = TEXEL_BUFFER
        .captures_iter(&src)
        .map(|captures| (captures[1].to_owned(), captures[2].to_owned()))
        .collect();
    for (kind, name) in buffers {
        let flat = kind.replace("Buffer", "2D");
        src = src.replace(
            &format!("highp {kind} {name};"),
            &format!("highp {flat} {name};"),
        );
        src = src.replace(
            &format!("texelFetch({name},"),
            &format!("dxbcBufferFetch({name},"),
        );
        if let Some((_, helper)) = BUFFER_FETCH.iter().find(|(sampler, _)| *sampler == flat)
            && !helpers.contains(helper)
        {
            helpers.push_str(helper);
        }
        applied.push(Applied::TexelBuffer);
    }

    let cubes: Vec<String> = CUBE_ARRAY
        .captures_iter(&src)
        .map(|captures| captures[1].to_owned())
        .collect();
    for name in cubes {
        src = src.replace(
            &format!("highp samplerCubeArray {name};"),
            &format!("highp sampler2DArray {name};"),
        );
        src = src.replace(
            &format!("textureLod({name},"),
            &format!("dxbcCubeArrayLod({name},"),
        );
        if !helpers.contains(CUBE_ARRAY_LOD) {
            helpers.push_str(CUBE_ARRAY_LOD);
        }
        applied.push(Applied::CubeArray);
    }

    if !applied.is_empty() {
        src = EXTENSION.replace_all(&src, "").into_owned();
        src = with_helpers(&src, &helpers);
    }
    applied.sort_by_key(|applied| *applied as u8);
    applied.dedup();
    (src, applied)
}

/// `helpers` inserted after the last `#extension` or `precision` line of the preamble.
fn with_helpers(src: &str, helpers: &str) -> String {
    let lines: Vec<&str> = src.split('\n').collect();
    let at = lines
        .iter()
        .take(80)
        .rposition(|line| line.starts_with("#extension") || line.starts_with("precision "))
        .map_or(1, |index| index + 1);
    let mut out = lines[..at].join("\n");
    out.push('\n');
    out.push_str(helpers.trim_end_matches('\n'));
    out.push('\n');
    out.push_str(&lines[at..].join("\n"));
    out
}

/// `textureLod(shadow, c, 0.0)` as `textureGrad(shadow, c, vec2(0.0), vec2(0.0))`.
///
/// ANGLE's D3D11 backend lowers the first to `SampleCmp`, a gradient op FXC cannot unroll
/// inside a loop, and the second to `SampleCmpLevelZero`, which is what the bytecode asked
/// for.
fn shadow_level_zero(src: &str) -> (String, usize) {
    let names: Vec<String> = SHADOW_SAMPLER
        .captures_iter(src)
        .map(|captures| captures[1].to_owned())
        .collect();
    let mut src = src.to_owned();
    let mut rewritten = 0;
    for name in names {
        let mut out = String::with_capacity(src.len());
        let mut last = 0;
        for (start, end, args) in calls_of(&src, "textureLod") {
            if args.len() != 3 || args[0] != name || !matches!(args[2].as_str(), "0.0" | "0") {
                continue;
            }
            out.push_str(&src[last..start]);
            out.push_str(&format!(
                "textureGrad({name}, {}, vec2(0.0), vec2(0.0))",
                args[1]
            ));
            last = end;
            rewritten += 1;
        }
        out.push_str(&src[last..]);
        src = out;
    }
    (src, rewritten)
}

/// The link patches: per-stage block names, and every float varying as a `vec4`.
///
/// D3D cbuffers are per stage where GL blocks are per program, so `$Globals` of both
/// stages would collide. D3D matches a varying by semantic with any mask subset where GL
/// needs identical types.
fn link_fixup(src: &str, stage: Stage) -> String {
    let suffix = match stage {
        Stage::Vertex => "_vs",
        Stage::Pixel => "_ps",
    };
    let mut src = BLOCK
        .replace_all(src, |captures: &Captures| {
            format!("{}{}{suffix}\n", &captures[1], &captures[2])
        })
        .into_owned();

    let keyword = match stage {
        Stage::Vertex => "out",
        Stage::Pixel => "in",
    };
    let declaration = Regex::new(&format!(
        r"(?m)^{keyword} (highp |mediump )?(float|vec2|vec3) (v_\w+);$"
    ))
    .expect("a fixed pattern");
    let narrow: Vec<(String, String, String)> = declaration
        .captures_iter(&src)
        .map(|captures| {
            (
                captures.get(1).map_or("", |m| m.as_str()).to_owned(),
                captures[2].to_owned(),
                captures[3].to_owned(),
            )
        })
        .collect();

    for (precision, ty, name) in narrow {
        src = src.replace(
            &format!("{keyword} {precision}{ty} {name};"),
            &format!("{keyword} {precision}vec4 {name};"),
        );
        match stage {
            Stage::Vertex => {
                /* A whole-variable write needs padding. A component write already fits. */
                let write =
                    Regex::new(&format!(r"(?m)^(\s*){name} = (.+);$")).expect("a name is a word");
                let pad = match ty.as_str() {
                    "float" => ", 0.0, 0.0, 0.0",
                    "vec2" => ", 0.0, 0.0",
                    _ => ", 0.0",
                };
                src = write
                    .replace_all(&src, |captures: &Captures| {
                        format!("{}{name} = vec4({}{pad});", &captures[1], &captures[2])
                    })
                    .into_owned();
            }
            Stage::Pixel => {
                let swizzle = match ty.as_str() {
                    "float" => ".x",
                    "vec2" => ".xy",
                    _ => ".xyz",
                };
                src = src
                    .split('\n')
                    .map(|line| {
                        if line.starts_with("in ") {
                            line.to_owned()
                        } else {
                            swizzled(line, &name, swizzle)
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
            }
        }
    }
    src
}

/// Every whole-word `name` in `line` not already followed by a member access, swizzled.
fn swizzled(line: &str, name: &str, swizzle: &str) -> String {
    let word = Regex::new(&format!(r"\b{name}\b")).expect("a name is a word");
    let mut out = String::with_capacity(line.len());
    let mut last = 0;
    for found in word.find_iter(line) {
        out.push_str(&line[last..found.end()]);
        let rest = line[found.end()..].trim_start();
        if !rest.starts_with('.') {
            out.push_str(swizzle);
        }
        last = found.end();
    }
    out.push_str(&line[last..]);
    out
}

/// Whether `src` calls `name(`.
fn calls(src: &str, name: &str) -> bool {
    Regex::new(&format!(r"\b{name}\("))
        .expect("a name is a word")
        .is_match(src)
}

/// `(start, end, arguments)` of every top-level call `function(...)` in `src`.
fn calls_of(src: &str, function: &str) -> Vec<(usize, usize, Vec<String>)> {
    let mut out = Vec::new();
    let mut from = 0;
    let needle = format!("{function}(");
    while let Some(found) = src[from..].find(&needle) {
        let start = from + found;
        let preceded_by_word = start > 0 && src.as_bytes()[start - 1].is_ascii_alphanumeric()
            || start > 0 && src.as_bytes()[start - 1] == b'_';
        if preceded_by_word {
            from = start + 1;
            continue;
        }
        let open = start + needle.len();
        let mut depth = 1;
        let mut args = Vec::new();
        let mut arg_start = open;
        let mut at = open;
        let bytes = src.as_bytes();
        while depth > 0 && at < bytes.len() {
            match bytes[at] {
                b'(' => depth += 1,
                b')' => {
                    depth -= 1;
                    if depth == 0 {
                        args.push(src[arg_start..at].trim().to_owned());
                    }
                }
                b',' if depth == 1 => {
                    args.push(src[arg_start..at].trim().to_owned());
                    arg_start = at + 1;
                }
                _ => {}
            }
            at += 1;
        }
        if depth != 0 {
            break;
        }
        out.push((start, at, args));
        from = at;
    }
    out
}

#[cfg(test)]
mod tests;
