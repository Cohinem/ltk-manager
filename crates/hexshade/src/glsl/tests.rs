use super::*;

const PREAMBLE: &str = "#version 300 es\nprecision highp float;\nprecision highp int;\n";

#[test]
fn a_block_wider_than_its_rdef_size_shrinks_to_it() {
    let src = format!(
        "{PREAMBLE}\nlayout(std140) uniform BonesCB_vs\n{{\n    vec4 m[4096];\n}} BonesCB_i;\n"
    );
    let out = declared_extents(&src, &[("BonesCB".to_owned(), 768)]);
    assert!(out.contains("vec4 m[768];"), "{out}");
}

/// The extents run before the stage suffix is added, on the block's bare name.
#[test]
fn a_bare_block_shrinks_before_it_is_suffixed() {
    let src = "layout(std140) uniform BonesCB\n{\n    vec4 m[4096];\n} BonesCB_i;\n";
    let out = declared_extents(src, &[("BonesCB".to_owned(), 768)]);
    assert!(out.contains("vec4 m[768];"), "{out}");
}

#[test]
fn a_block_narrower_than_its_rdef_size_is_left_alone() {
    let src = "layout(std140) uniform Globals_ps\n{\n    vec4 m[1];\n} Globals_i;\n";
    let out = declared_extents(src, &[("Globals".to_owned(), 4)]);
    assert!(out.contains("vec4 m[1];"), "{out}");
}

#[test]
fn a_bit_builtin_gets_its_polyfill_after_the_version_line() {
    let src = format!("{PREAMBLE}void main() {{ int n = bitCount(3u); }}\n");
    let (out, applied) = patch(&src, Stage::Pixel, &[]);
    assert_eq!(applied, vec![Applied::BitBuiltin]);
    let version_at = out.find("#version").unwrap();
    let polyfill_at = out.find("int bitCount(uint v)").unwrap();
    let main_at = out.find("void main").unwrap();
    assert!(version_at < polyfill_at && polyfill_at < main_at);
}

#[test]
fn a_texel_buffer_becomes_a_data_texture_with_its_fetch_helper() {
    let src = "#version 300 es\n#extension GL_EXT_texture_buffer : require\nprecision highp float;\n\
         uniform highp usamplerBuffer CLUSTER_DATA;\n\
         void main() { uvec4 w = texelFetch(CLUSTER_DATA, 7); }\n";
    let (out, applied) = patch(src, Stage::Pixel, &[]);
    assert_eq!(applied, vec![Applied::TexelBuffer]);
    assert!(
        out.contains("uniform highp usampler2D CLUSTER_DATA;"),
        "{out}"
    );
    assert!(out.contains("dxbcBufferFetch(CLUSTER_DATA, 7)"), "{out}");
    assert!(
        out.contains("uvec4 dxbcBufferFetch(highp usampler2D t, int i)"),
        "{out}"
    );
    assert!(!out.contains("#extension"), "{out}");
}

#[test]
fn a_cube_array_becomes_six_layers_per_cube() {
    let src = "#version 300 es\n#extension GL_EXT_texture_cube_map_array : require\nprecision highp float;\n\
         uniform highp samplerCubeArray IBL_CUBEMAP;\n\
         void main() { vec4 c = textureLod(IBL_CUBEMAP, vec4(1.0, 0.0, 0.0, 2.0), 3.0); }\n";
    let (out, applied) = patch(src, Stage::Pixel, &[]);
    assert_eq!(applied, vec![Applied::CubeArray]);
    assert!(
        out.contains("uniform highp sampler2DArray IBL_CUBEMAP;"),
        "{out}"
    );
    assert!(
        out.contains("dxbcCubeArrayLod(IBL_CUBEMAP, vec4(1.0, 0.0, 0.0, 2.0), 3.0)"),
        "{out}"
    );
}

#[test]
fn a_shadow_sample_at_level_zero_becomes_a_zero_gradient_sample() {
    let src = format!(
        "{PREAMBLE}uniform highp sampler2DShadow sShadowMap;\n\
         void main() {{ float s = textureLod(sShadowMap, vec3(uv, d), 0.0) + textureLod(sShadowMap, vec3(uv, d), 1.0); }}\n"
    );
    let (out, applied) = patch(&src, Stage::Pixel, &[]);
    assert_eq!(applied, vec![Applied::ShadowLevelZero]);
    assert!(
        out.contains("textureGrad(sShadowMap, vec3(uv, d), vec2(0.0), vec2(0.0))"),
        "{out}"
    );
    assert!(
        out.contains("textureLod(sShadowMap, vec3(uv, d), 1.0)"),
        "{out}"
    );
}

#[test]
fn a_block_takes_its_stage_suffix() {
    let src = "layout(std140) uniform Globals\n{\n    vec4 m[2];\n} Globals_i;\n";
    let (vs, _) = patch(src, Stage::Vertex, &[]);
    let (ps, _) = patch(src, Stage::Pixel, &[]);
    assert!(vs.contains("uniform Globals_vs\n"));
    assert!(ps.contains("uniform Globals_ps\n"));
}

#[test]
fn a_narrow_vertex_varying_widens_and_its_whole_writes_pad() {
    let src = "out vec2 v_TEXCOORD;\nout float v_FOG;\nvoid main()\n{\n    v_TEXCOORD = a_TEXCOORD.xy;\n    v_FOG.x = 1.0;\n}\n";
    let (out, _) = patch(src, Stage::Vertex, &[]);
    assert!(out.contains("out vec4 v_TEXCOORD;"), "{out}");
    assert!(out.contains("out vec4 v_FOG;"), "{out}");
    assert!(
        out.contains("v_TEXCOORD = vec4(a_TEXCOORD.xy, 0.0, 0.0);"),
        "{out}"
    );
    assert!(out.contains("v_FOG.x = 1.0;"), "{out}");
}

#[test]
fn a_narrow_fragment_varying_widens_and_its_reads_swizzle() {
    let src = "in vec3 v_NORMAL;\nin vec2 v_TEXCOORD;\nvoid main()\n{\n    vec3 n = normalize(v_NORMAL);\n    vec4 t = texture(tex, v_TEXCOORD);\n    float u = v_TEXCOORD.x;\n}\n";
    let (out, _) = patch(src, Stage::Pixel, &[]);
    assert!(out.contains("in vec4 v_NORMAL;"), "{out}");
    assert!(out.contains("in vec4 v_TEXCOORD;"), "{out}");
    assert!(out.contains("normalize(v_NORMAL.xyz)"), "{out}");
    assert!(out.contains("texture(tex, v_TEXCOORD.xy)"), "{out}");
    assert!(out.contains("float u = v_TEXCOORD.x;"), "{out}");
}

#[test]
fn a_call_scan_keeps_nested_parentheses_together() {
    let found = calls_of("x = textureLod(s, vec3(f(a, b), c), 0.0);", "textureLod");
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].2, vec!["s", "vec3(f(a, b), c)", "0.0"]);
}

#[test]
fn an_unwritten_vertex_output_is_declared_before_main() {
    let src = "out vec4 v_TEXCOORD;\n\nvoid main()\n{\n    v_TEXCOORD = vec4(1.0);\n}\n";
    let out = declare_outputs(src, &["TEXCOORD".to_owned(), "COLOR".to_owned()]);
    assert!(out.contains("out vec4 v_TEXCOORD;\n"), "{out}");
    assert!(out.contains("out vec4 v_COLOR;\nvoid main()"), "{out}");
    assert_eq!(out.matches("v_TEXCOORD;").count(), 1);
}
