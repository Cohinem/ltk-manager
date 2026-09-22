use super::*;

use crate::dxbc::{ConstantBuffer, Dimension, Resource};

const MAGIC: u32 = 0x0723_0203;

/// An instruction, word count filled in.
fn inst(op: u32, operands: &[u32]) -> Vec<u32> {
    let mut out = vec![((1 + operands.len() as u32) << 16) | op];
    out.extend_from_slice(operands);
    out
}

fn name(id: u32, text: &str) -> Vec<u32> {
    let mut operands = vec![id];
    operands.extend(spirv_string(text));
    inst(OP_NAME, &operands)
}

/// A vertex module: `cb1` (pointer type 10, struct 11, variable 12), `t3` as variable 13,
/// `s0` as 14, input `POSITION` as 20, output `TEXCOORD` as 21, and `gl_Position` as 22.
fn module() -> Vec<u32> {
    let mut words = vec![MAGIC, 0x0001_0500, 0, 40, 0];
    words.extend(inst(OP_CAPABILITY, &[1]));
    words.extend(inst(OP_CAPABILITY, &[CAPABILITY_DERIVATIVE_CONTROL]));
    words.extend(inst(
        OP_CAPABILITY,
        &[CAPABILITY_PHYSICAL_STORAGE_BUFFER_ADDRESSES],
    ));
    words.extend(inst(
        OP_CAPABILITY,
        &[CAPABILITY_DEMOTE_TO_HELPER_INVOCATION],
    ));
    words.extend(inst(OP_MEMORY_MODEL, &[5348, 1]));
    words.extend(name(11, "cb1_t"));
    words.extend(name(12, "cb1"));
    words.extend(name(13, "t3"));
    words.extend(name(14, "s0"));
    words.extend(name(20, "POSITION"));
    words.extend(name(21, "TEXCOORD"));
    words.extend(name(22, "gl_Position"));
    words.extend(inst(OP_DECORATE, &[22, DECORATION_BUILT_IN, 0]));
    words.extend(inst(OP_DECORATE, &[21, DECORATION_COMPONENT, 0]));
    words.extend(inst(OP_DECORATE, &[30, DECORATION_NO_CONTRACTION]));
    words.extend(inst(OP_TYPE_POINTER, &[10, 2, 11]));
    words.extend(inst(OP_VARIABLE, &[10, 12, 2]));
    words.extend(inst(OP_VARIABLE, &[15, 13, 0]));
    words.extend(inst(OP_VARIABLE, &[16, 14, 0]));
    words.extend(inst(OP_VARIABLE, &[17, 20, STORAGE_INPUT]));
    words.extend(inst(OP_VARIABLE, &[18, 21, STORAGE_OUTPUT]));
    words.extend(inst(OP_VARIABLE, &[18, 22, STORAGE_OUTPUT]));
    words.extend(inst(213, &[6, 30, 31]));
    words.extend(inst(OP_DEMOTE_TO_HELPER_INVOCATION, &[]));
    words.extend(inst(OP_LABEL, &[32]));
    words
}

fn reflection() -> Reflection {
    let resource = |name: &str, kind, bind| Resource {
        name: name.to_owned(),
        kind,
        dimension: Dimension::Texture2d,
        bind,
        count: 1,
    };
    Reflection {
        shader_model: (5, 0),
        resources: vec![
            resource("PerFrameVertexCB", ResourceKind::Cbuffer, 1),
            resource("Diffuse_Texture__TX", ResourceKind::Texture, 3),
            resource("Diffuse_Texture__SMP", ResourceKind::Sampler, 0),
        ],
        constant_buffers: vec![ConstantBuffer {
            name: "PerFrameVertexCB".to_owned(),
            size: 560,
            bind: Some(1),
            members: Vec::new(),
        }],
        inputs: Vec::new(),
        outputs: Vec::new(),
    }
}

fn ops(words: &[u32]) -> Vec<u32> {
    instructions(words)
        .unwrap()
        .into_iter()
        .map(|(_, op, _)| op)
        .collect()
}

#[test]
fn an_identifier_loses_what_essl_reserves() {
    assert_eq!(ident("Diffuse_Texture__TX"), "Diffuse_Texture_TX");
    assert_eq!(ident("$Globals"), "Globals");
    assert_eq!(ident("3d"), "_3d");
    assert_eq!(ident("__"), "unnamed");
}

#[test]
fn the_vulkan_capabilities_and_decorations_are_dropped() {
    let patched = patch(&module(), &reflection(), Stage::Vertex).unwrap();
    let ops = ops(&patched.words);
    assert_eq!(ops.iter().filter(|&&op| op == OP_CAPABILITY).count(), 1);
    assert_eq!(ops.iter().filter(|&&op| op == OP_DECORATE).count(), 1);
    let model = instructions(&patched.words)
        .unwrap()
        .into_iter()
        .find(|(_, op, _)| *op == OP_MEMORY_MODEL)
        .map(|(at, _, count)| patched.words[at..at + count].to_vec())
        .unwrap();
    assert_eq!(model[1], ADDRESSING_LOGICAL);
    assert_eq!(model[2], 1);
}

#[test]
fn a_coarse_derivative_becomes_plain() {
    let patched = patch(&module(), &reflection(), Stage::Vertex).unwrap();
    assert!(ops(&patched.words).contains(&207));
    assert!(!ops(&patched.words).contains(&213));
}

#[test]
fn a_demote_becomes_a_kill_and_a_fresh_label() {
    let patched = patch(&module(), &reflection(), Stage::Vertex).unwrap();
    let ops = ops(&patched.words);
    assert!(!ops.contains(&OP_DEMOTE_TO_HELPER_INVOCATION));
    let kill_at = ops.iter().position(|&op| op == OP_KILL).unwrap();
    assert_eq!(ops[kill_at + 1], OP_LABEL);
    assert_eq!(patched.words[3], 41);
}

#[test]
fn registers_take_their_rdef_names_and_the_interface_its_prefixes() {
    let patched = patch(&module(), &reflection(), Stage::Vertex).unwrap();
    let renamed = |from: &str| -> Vec<&str> {
        patched
            .renames
            .iter()
            .filter(|(name, _)| name == from)
            .map(|(_, to)| to.as_str())
            .collect()
    };
    assert_eq!(renamed("cb1"), ["PerFrameVertexCB_i"]);
    assert_eq!(renamed("t3"), ["Diffuse_Texture_TX"]);
    assert_eq!(renamed("s0"), ["Diffuse_Texture_SMP"]);
    assert_eq!(renamed("POSITION"), ["a_POSITION"]);
    assert_eq!(renamed("TEXCOORD"), ["v_TEXCOORD"]);
    assert!(renamed("gl_Position").is_empty());

    let named: Vec<(u32, String)> = instructions(&patched.words)
        .unwrap()
        .into_iter()
        .filter(|(_, op, _)| *op == OP_NAME)
        .map(|(at, _, count)| {
            (
                patched.words[at + 1],
                read_string(&patched.words[at + 2..at + count]),
            )
        })
        .collect();
    assert!(named.contains(&(11, "PerFrameVertexCB".to_owned())));
    assert!(named.contains(&(12, "PerFrameVertexCB_i".to_owned())));
}

#[test]
fn a_pixel_input_is_a_varying_and_its_output_keeps_its_name() {
    let patched = patch(&module(), &reflection(), Stage::Pixel).unwrap();
    let renamed = |from: &str| -> Vec<&str> {
        patched
            .renames
            .iter()
            .filter(|(name, _)| name == from)
            .map(|(_, to)| to.as_str())
            .collect()
    };
    assert_eq!(renamed("POSITION"), ["v_POSITION"]);
    assert!(renamed("TEXCOORD").is_empty());
}

#[test]
fn a_module_that_runs_past_its_end_is_refused() {
    let mut words = module();
    words.push((9 << 16) | OP_NAME);
    assert_eq!(
        patch(&words, &reflection(), Stage::Vertex).unwrap_err(),
        SpirvError::Truncated {
            at: words.len() - 1
        }
    );
    assert_eq!(
        patch(&words[..3], &reflection(), Stage::Vertex).unwrap_err(),
        SpirvError::NoHeader
    );
}
