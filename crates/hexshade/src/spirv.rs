//! The word patches between dxbc-spirv's output and SPIRV-Cross's GLSL ES 3.00 backend.
//!
//! dxbc-spirv writes a Vulkan module: `PhysicalStorageBuffer64` addressing, coarse and fine
//! derivatives, `Component` and `NoContraction` decorations, and `OpDemoteToHelperInvocation`
//! for `discard`. SPIRV-Cross refuses or mistranslates each of those for ESSL, so they are
//! rewritten here on the words. Register-named variables (`cb1`, `t3`, `s0`) take their
//! `RDEF` names, and the interface takes `a_` and `v_` prefixes so a vertex output and a
//! fragment input link by name and never collide with the other direction.

use std::collections::{HashMap, HashSet};

use thiserror::Error;

use crate::Stage;
use crate::dxbc::{Reflection, ResourceKind};

const OP_NAME: u32 = 5;
const OP_MEMORY_MODEL: u32 = 14;
const OP_CAPABILITY: u32 = 17;
const OP_TYPE_POINTER: u32 = 32;
const OP_VARIABLE: u32 = 59;
const OP_DECORATE: u32 = 71;
const OP_LABEL: u32 = 248;
const OP_KILL: u32 = 252;
const OP_DEMOTE_TO_HELPER_INVOCATION: u32 = 5380;

const CAPABILITY_DERIVATIVE_CONTROL: u32 = 51;
const CAPABILITY_PHYSICAL_STORAGE_BUFFER_ADDRESSES: u32 = 5347;
const CAPABILITY_DEMOTE_TO_HELPER_INVOCATION: u32 = 5379;

const DECORATION_BUILT_IN: u32 = 11;
const DECORATION_COMPONENT: u32 = 31;
const DECORATION_NO_CONTRACTION: u32 = 42;

const ADDRESSING_LOGICAL: u32 = 0;
const STORAGE_INPUT: u32 = 1;
const STORAGE_OUTPUT: u32 = 3;

/// `OpDPdxFine`, `OpDPdyFine`, `OpFwidthFine`, `OpDPdxCoarse`, `OpDPdyCoarse` and
/// `OpFwidthCoarse`, each to its plain form.
fn plain_derivative(op: u32) -> Option<u32> {
    match op {
        210 | 213 => Some(207),
        211 | 214 => Some(208),
        212 | 215 => Some(209),
        _ => None,
    }
}

/// A module the patch cannot walk.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum SpirvError {
    #[error("SPIR-V module shorter than its header")]
    NoHeader,
    #[error("SPIR-V instruction at word {at} runs past the module")]
    Truncated { at: usize },
}

/// The patched module and what was renamed in it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Patched {
    pub words: Vec<u32>,
    /// Register name to `RDEF` or interface name, for every variable renamed, in module
    /// order. A list rather than a map because a vertex shader's input and output can
    /// share a semantic and both are renamed.
    pub renames: Vec<(String, String)>,
}

/// A SPIR-V identifier `name` as a GLSL identifier.
///
/// `__` is reserved in ESSL, so `Diffuse_Texture__TX` is `Diffuse_Texture_TX`.
#[must_use]
pub fn ident(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut last_underscore = false;
    for ch in name.chars() {
        let ch = if ch.is_ascii_alphanumeric() { ch } else { '_' };
        if ch == '_' && last_underscore {
            continue;
        }
        last_underscore = ch == '_';
        out.push(ch);
    }
    let trimmed = out.trim_matches('_');
    if trimmed.is_empty() {
        return "unnamed".to_owned();
    }
    if trimmed.starts_with(|ch: char| ch.is_ascii_digit()) {
        format!("_{trimmed}")
    } else {
        trimmed.to_owned()
    }
}

/// `words` patched for SPIRV-Cross, with every variable named for GLSL.
///
/// # Errors
///
/// Fails when the module is shorter than a header or an instruction's word count runs
/// past its end.
pub fn patch(words: &[u32], reflection: &Reflection, stage: Stage) -> Result<Patched, SpirvError> {
    if words.len() < 5 {
        return Err(SpirvError::NoHeader);
    }
    let instructions = instructions(words)?;

    let mut names_by_id: HashMap<u32, String> = HashMap::new();
    let mut pointee_of: HashMap<u32, u32> = HashMap::new();
    let mut variables: HashMap<u32, (u32, u32)> = HashMap::new();
    let mut builtins: HashSet<u32> = HashSet::new();
    for &(at, op, count) in &instructions {
        let inst = &words[at..at + count];
        match op {
            OP_NAME if count >= 3 => {
                names_by_id.insert(inst[1], read_string(&inst[2..]));
            }
            OP_TYPE_POINTER if count >= 4 => {
                pointee_of.insert(inst[1], inst[3]);
            }
            OP_VARIABLE if count >= 4 => {
                variables.insert(inst[2], (inst[1], inst[3]));
            }
            OP_DECORATE if count >= 3 && inst[2] == DECORATION_BUILT_IN => {
                builtins.insert(inst[1]);
            }
            _ => {}
        }
    }

    let mut new_names: HashMap<u32, String> = HashMap::new();
    for (&id, name) in &names_by_id {
        let Some(&(pointer_type, storage)) = variables.get(&id) else {
            continue;
        };

        if (storage == STORAGE_INPUT || storage == STORAGE_OUTPUT) && !builtins.contains(&id) {
            let prefix = match (stage, storage == STORAGE_INPUT) {
                (Stage::Vertex, true) => "a_",
                (Stage::Vertex, false) | (Stage::Pixel, true) => "v_",
                (Stage::Pixel, false) => continue,
            };
            new_names.insert(id, format!("{prefix}{}", ident(name)));
            continue;
        }

        if let Some(bind) = register(name, "cb") {
            if let Some(buffer) = reflection.resource(ResourceKind::Cbuffer, bind) {
                let block = ident(&buffer.name);
                new_names.insert(id, format!("{block}_i"));
                if let Some(&struct_type) = pointee_of.get(&pointer_type) {
                    new_names.insert(struct_type, block);
                }
            }
            continue;
        }

        if let Some(bind) = register(name, "s") {
            if let Some(sampler) = reflection.resource(ResourceKind::Sampler, bind) {
                new_names.insert(id, ident(&sampler.name));
            }
            continue;
        }

        if let Some(bind) = register(name, "t")
            && let Some(view) = reflection.view(bind)
        {
            new_names.insert(id, ident(&view.name));
        }
    }

    let mut out: Vec<u32> = words[..5].to_vec();
    let mut renames = Vec::new();
    for &(at, op, count) in &instructions {
        let inst = &words[at..at + count];
        match op {
            OP_CAPABILITY
                if matches!(
                    inst[1],
                    CAPABILITY_DERIVATIVE_CONTROL
                        | CAPABILITY_PHYSICAL_STORAGE_BUFFER_ADDRESSES
                        | CAPABILITY_DEMOTE_TO_HELPER_INVOCATION
                ) =>
            {
                continue;
            }
            OP_DECORATE
                if count >= 3
                    && matches!(inst[2], DECORATION_COMPONENT | DECORATION_NO_CONTRACTION) =>
            {
                continue;
            }
            OP_DEMOTE_TO_HELPER_INVOCATION => {
                /* ESSL has no demote. `OpKill` ends the block, and what followed the demote
                moves to a fresh label nothing branches to. */
                let fresh = out[3];
                out[3] += 1;
                out.push((1 << 16) | OP_KILL);
                out.push((2 << 16) | OP_LABEL);
                out.push(fresh);
                continue;
            }
            OP_MEMORY_MODEL if count >= 3 => {
                out.push(inst[0]);
                out.push(ADDRESSING_LOGICAL);
                out.push(inst[2]);
                continue;
            }
            OP_NAME if count >= 3 => {
                if let Some(name) = new_names.get(&inst[1]) {
                    renames.push((read_string(&inst[2..]), name.clone()));
                    let text = spirv_string(name);
                    out.push(((2 + text.len() as u32) << 16) | OP_NAME);
                    out.push(inst[1]);
                    out.extend(text);
                    continue;
                }
            }
            _ => {}
        }

        if let Some(plain) = plain_derivative(op) {
            out.push((inst[0] & 0xFFFF_0000) | plain);
            out.extend_from_slice(&inst[1..]);
            continue;
        }
        out.extend_from_slice(inst);
    }

    Ok(Patched {
        words: out,
        renames,
    })
}

/// `(offset, opcode, word count)` of every instruction after the header.
fn instructions(words: &[u32]) -> Result<Vec<(usize, u32, usize)>, SpirvError> {
    let mut out = Vec::new();
    let mut at = 5;
    while at < words.len() {
        let count = (words[at] >> 16) as usize;
        if count == 0 || at + count > words.len() {
            return Err(SpirvError::Truncated { at });
        }
        out.push((at, words[at] & 0xFFFF, count));
        at += count;
    }
    Ok(out)
}

/// The register index of a name like `cb3` under `prefix`.
fn register(name: &str, prefix: &str) -> Option<u32> {
    let digits = name.strip_prefix(prefix)?;
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    digits.parse().ok()
}

fn read_string(words: &[u32]) -> String {
    let bytes: Vec<u8> = words.iter().flat_map(|word| word.to_le_bytes()).collect();
    let end = bytes
        .iter()
        .position(|&byte| byte == 0)
        .unwrap_or(bytes.len());
    String::from_utf8_lossy(&bytes[..end]).into_owned()
}

fn spirv_string(text: &str) -> Vec<u32> {
    let mut bytes = text.as_bytes().to_vec();
    bytes.push(0);
    while !bytes.len().is_multiple_of(4) {
        bytes.push(0);
    }
    let (words, _) = bytes.as_chunks::<4>();
    words.iter().map(|word| u32::from_le_bytes(*word)).collect()
}

#[cfg(test)]
mod tests;
