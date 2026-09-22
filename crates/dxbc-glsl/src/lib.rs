//! The game's DXBC shader blobs as GLSL ES 3.00, with the reflection a renderer binds by.
//!
//! One blob goes DXBC to SPIR-V through dxbc-spirv, through the word patches of [`spirv`],
//! to GLSL through SPIRV-Cross, and through the text patches of [`glsl`]. The `RDEF`,
//! `ISGN` and `OSGN` chunks of the blob become the [`Sidecar`]: uniform blocks with member
//! offsets, textures with their combined-sampler names, and attributes.
//!
//! [`bundle`] finds a blob in `ShaderCache.dx11.wad.client` by object path and defines.

pub mod bundle;
pub mod dxbc;
pub mod glsl;
pub mod reflection;
pub mod spirv;

use std::collections::HashMap;

use spirv_cross2::compile::glsl::{CompilerOptions, GlslVersion};
use spirv_cross2::{Compiler, Module, SpirvCrossError, targets};
use thiserror::Error;

use crate::dxbc::{ContainerError, Reflection, ResourceKind, reflect};
pub use crate::glsl::Applied;
pub use crate::reflection::{
    Attribute, BlockMember, MemberScalar, SamplerBinding, Sidecar, TextureBinding,
    TextureDimension, UniformBlock,
};
use crate::spirv::{SpirvError, ident};

/// Bumped with any change to the patches, so a disk cache keyed on it refills.
pub const PIPELINE_VERSION: u32 = 1;

/// Which stage a blob is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Stage {
    Vertex,
    Pixel,
}

/// Why a blob did not translate.
#[derive(Debug, Error)]
pub enum TranslateError {
    #[error(transparent)]
    Container(#[from] ContainerError),
    #[error("dxbc-spirv: {0}")]
    Compile(#[from] dxbc_spirv_sys::CompileError),
    #[error(transparent)]
    Spirv(#[from] SpirvError),
    #[error("SPIRV-Cross: {0}")]
    Cross(#[from] SpirvCrossError),
}

/// One translated stage.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Translated {
    pub glsl: String,
    pub sidecar: Sidecar,
    /// Which text patches the source needed.
    pub applied: Vec<Applied>,
}

/// `dxbc` as GLSL ES 3.00 and the sidecar that binds it.
///
/// `dxbc` is one container, trimmed: a bundle record goes through [`bundle::record`]
/// first.
///
/// # Errors
///
/// Fails when the blob is no container, when dxbc-spirv cannot convert it, or when
/// SPIRV-Cross refuses the patched module.
pub fn translate(dxbc: &[u8], stage: Stage) -> Result<Translated, TranslateError> {
    let reflection = reflect(dxbc)?;
    let words = dxbc_spirv_sys::compile(dxbc)?;
    let patched = spirv::patch(&words, &reflection, stage)?;

    let module = Module::from_words(&patched.words);
    let mut compiler = Compiler::<targets::Glsl>::new(module)?;

    let proof = compiler.create_dummy_sampler_for_combined_images()?;
    let dummy = proof.sampler_id;
    compiler.build_combined_image_samplers(proof)?;

    let combined: Vec<(_, String, Option<String>)> = compiler
        .combined_image_samplers()?
        .map(|sampler| {
            let image = compiler
                .name(sampler.image_id)
                .ok()
                .flatten()
                .map_or_else(String::new, |name| name.to_string());
            let by = if Some(sampler.sampler_id) == dummy {
                None
            } else {
                compiler
                    .name(sampler.sampler_id)
                    .ok()
                    .flatten()
                    .map(|name| name.to_string())
            };
            (sampler.combined_id, image, by)
        })
        .collect();
    let mut per_image: HashMap<&str, usize> = HashMap::new();
    for (_, image, _) in &combined {
        *per_image.entry(image.as_str()).or_default() += 1;
    }
    let mut samplers_by_image: HashMap<String, Vec<SamplerBinding>> = HashMap::new();
    for (id, image, by) in &combined {
        let glsl_name = match by {
            Some(by) if per_image[image.as_str()] > 1 => format!("{image}_{by}"),
            _ => image.clone(),
        };
        compiler.set_name(*id, glsl_name.as_str())?;
        samplers_by_image
            .entry(image.clone())
            .or_default()
            .push(SamplerBinding {
                sampler: by.clone(),
                glsl_name,
            });
    }

    let mut options = CompilerOptions::default();
    options.version = GlslVersion::Glsl300Es;
    options.vulkan_semantics = false;
    options.es_default_float_precision_highp = true;
    options.es_default_int_precision_highp = true;
    options.common.relax_nan_checks = true;
    options.common.fixup_clipspace = stage == Stage::Vertex;
    let artifact = compiler.compile(&options)?;
    let extents: Vec<(String, u32)> = reflection
        .constant_buffers
        .iter()
        .map(|buffer| (ident(&buffer.name), buffer.size.div_ceil(16)))
        .collect();
    let (glsl, applied) = glsl::patch(artifact.as_ref(), stage, &extents);
    let glsl = match stage {
        Stage::Vertex => {
            let labels: Vec<String> = reflection
                .outputs
                .iter()
                .filter(|entry| entry.system_value == 0)
                .map(bare_label)
                .collect();
            glsl::declare_outputs(&glsl, &labels)
        }
        Stage::Pixel => glsl,
    };

    let sidecar = sidecar(&reflection, &patched.renames, samplers_by_image, stage);
    Ok(Translated {
        glsl,
        sidecar,
        applied,
    })
}

/// The semantic as dxbc-spirv names it: index 0 bare, `TEXCOORD`, and `TEXCOORD1` above.
fn bare_label(entry: &dxbc::SignatureEntry) -> String {
    if entry.index == 0 {
        entry.semantic.clone()
    } else {
        entry.label()
    }
}

fn sidecar(
    reflection: &Reflection,
    renames: &HashMap<String, String>,
    mut samplers_by_image: HashMap<String, Vec<SamplerBinding>>,
    stage: Stage,
) -> Sidecar {
    let suffix = match stage {
        Stage::Vertex => "_vs",
        Stage::Pixel => "_ps",
    };
    let blocks = reflection
        .constant_buffers
        .iter()
        .map(|buffer| UniformBlock {
            name: buffer.name.clone(),
            glsl_name: format!("{}{suffix}", ident(&buffer.name)),
            size: buffer.size,
            members: buffer
                .members
                .iter()
                .map(|member| BlockMember {
                    name: member.name.clone(),
                    offset: member.offset,
                    size: member.size,
                    used: member.used,
                    scalar: reflection::member_scalar(member.ty.scalar),
                    rows: member.ty.rows,
                    columns: member.ty.columns,
                    elements: member.ty.elements,
                    row_major: reflection::row_major(member.ty.class),
                })
                .collect(),
        })
        .collect();

    let textures = reflection
        .resources
        .iter()
        .filter(|resource| {
            matches!(
                resource.kind,
                ResourceKind::Texture | ResourceKind::Structured | ResourceKind::Tbuffer
            )
        })
        .map(|resource| TextureBinding {
            name: resource.name.clone(),
            dimension: reflection::texture_dimension(resource.dimension),
            samplers: samplers_by_image
                .remove(&ident(&resource.name))
                .unwrap_or_default(),
        })
        .collect();

    let attributes = match stage {
        Stage::Vertex => reflection
            .inputs
            .iter()
            .filter(|entry| entry.system_value == 0)
            .filter_map(|entry| {
                /* dxbc-spirv names index 0 by the bare semantic: `TEXCOORD`, not `TEXCOORD0`. */
                let label = entry.label();
                let glsl_name = renames
                    .iter()
                    .find(|(from, _)| {
                        let from = ident(from);
                        from == ident(&label)
                            || (entry.index == 0 && from == ident(&entry.semantic))
                    })
                    .map(|(_, to)| to.clone())?;
                Some(Attribute {
                    semantic: entry.semantic.clone(),
                    index: entry.index,
                    glsl_name,
                    mask: entry.used,
                })
            })
            .collect(),
        Stage::Pixel => Vec::new(),
    };

    Sidecar {
        blocks,
        textures,
        attributes,
    }
}
